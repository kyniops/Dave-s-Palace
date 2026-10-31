/* DaveUpgrade — sacrifie des cartes (et des DaveCoins) pour tenter d'obtenir une carte plus chère.
 * Chance = 95 % × mise ÷ valeur de la carte visée (max 80 %). L'aiguille tourne : dans la zone, c'est gagné.
 */
(function () {
  'use strict';
  const { IMG, rng, fmt, wallet, settle, sound, ui, round2, esc, cards, inventory, sleep } = DP;
  const I = ui.icon;
  const EDGE = 0.95, MAX_CHANCE = 0.8, MIN_MULT = 1.2, MAX_ITEMS = 10;
  const MULTS = [1.5, 2, 3, 5, 10, 25];
  const chanceFor = (stake, target) => (target && stake > 0 ? Math.min(MAX_CHANCE, (EDGE * stake) / target.value) : 0);
  const keyOf = (id, shiny) => id + '|' + (shiny ? 1 : 0);
  const valueOf = (card, shiny) => round2(card.value * (shiny ? inventory.SHINY_MULT : 1));

  /** Jauge circulaire : zone de victoire (en haut, sens horaire) et aiguille. */
  function gaugeSvg() {
    const ticks = Array.from({ length: 60 }, (_, i) => {
      const a = (i / 60) * Math.PI * 2, r0 = i % 5 ? 112 : 106;
      return `<line x1="${150 + Math.sin(a) * r0}" y1="${150 - Math.cos(a) * r0}" x2="${150 + Math.sin(a) * 118}" y2="${150 - Math.cos(a) * 118}"/>`;
    }).join('');
    return `<svg class="ugauge__svg" viewBox="0 0 300 300" aria-hidden="true">
      <defs>
        <radialGradient id="ug-bg" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#1a1f2e"/><stop offset="1" stop-color="#06070b"/></radialGradient>
        <linearGradient id="ug-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe7a3"/><stop offset=".5" stop-color="#7a4d12"/><stop offset="1" stop-color="#e9b955"/></linearGradient>
      </defs>
      <circle cx="150" cy="150" r="146" fill="url(#ug-rim)"/>
      <circle cx="150" cy="150" r="140" fill="url(#ug-bg)"/>
      <circle class="ugauge__track" cx="150" cy="150" r="126" fill="none" stroke-width="18"/>
      <circle class="ugauge__arc" cx="150" cy="150" r="126" fill="none" stroke-width="18" pathLength="100" transform="rotate(-90 150 150)"/>
      <g class="ugauge__ticks">${ticks}</g>
      <g class="ugauge__needle"><path d="M150 14 L161 40 L150 34 L139 40 Z"/><circle cx="150" cy="150" r="6"/><line x1="150" y1="40" x2="150" y2="150"/></g>
    </svg>`;
  }

  DP.games.register({
    id: 'upgrade',
    name: 'DaveUpgrade',
    icon: 'trending-up',
    tagline: 'Sacrifie tes cartes pour viser une carte plus rare',
    rtp: '95 %',
    isNew: true,
    hue: 300,
    art: `<div class="art-upgrade"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="9"/><circle cx="50" cy="50" r="40" fill="none" stroke="#c04dff" stroke-width="9" stroke-dasharray="80 252" transform="rotate(-90 50 50)"/></svg><img src="${IMG}jpzcharis.jpg" alt=""></div>`,
    rules: `<p>Choisis des cartes de ton inventaire (et ajoute des DaveCoins si tu veux), puis vise une carte plus chère.</p>
      <ul><li>Ta chance = <strong>95 % × ta mise ÷ valeur de la carte visée</strong>, jusqu’à 80 % maximum.</li>
      <li>L’aiguille tourne : si elle s’arrête dans la zone colorée, tu gagnes la carte visée.</li>
      <li>Sinon, les cartes et les DaveCoins misés sont perdus.</li>
      <li>Les cartes brillantes comptent pour 7 fois leur valeur.</li></ul>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      const sel = new Map(); // clé → { card, shiny, n }
      let target = null, mult = 2, busy = false, alive = true, pending = null, needleAt = 0;
      // sens de rotation choisi par le joueur (1 = horaire, -1 = anti-horaire), mémorisé
      let dir = DP.store.get('dp_up_dir') === '-1' ? -1 : 1;

      const coinsIn = ui.betInput(panel, { label: 'DaveCoins en plus (optionnel)', initial: 0, gameId: 'upgrade' });
      const dirSeg = ui.segmented(panel, { label: 'Sens de rotation', value: dir, options: [{ value: 1, label: '↻ Horaire' }, { value: -1, label: '↺ Anti-horaire' }], onChange: (v) => { dir = v; DP.store.set('dp_up_dir', String(v)); paintDir(); } });
      const multSeg = ui.segmented(panel, { label: 'Multiplicateur visé', value: mult, options: MULTS.map((m) => ({ value: m, label: '×' + String(m).replace('.', ',') })), onChange: (v) => { mult = v; target = autoTarget(); paint(); } });
      const stakeOut = ui.readout(panel, 'Mise totale', '0');
      const chanceOut = ui.readout(panel, 'Chance', '—');
      const goBtn = ui.button(panel, 'Upgrader');
      const clearBtn = ui.button(panel, 'Vider la sélection', 'btn btn--ghost btn--block');

      stage.innerHTML = `
        <div class="uarena">
          <div class="uarena__side"><span class="uarena__lbl">Ta mise</span><div class="ustake js-stake"></div><b class="uarena__val num js-stakev">0</b></div>
          <div class="ugauge js-gauge">${gaugeSvg()}<div class="ugauge__mid"><b class="num js-pct">0 %</b><span class="js-x">Choisis tes cartes</span></div></div>
          <div class="uarena__side"><span class="uarena__lbl">Carte visée</span><div class="utarget js-target"></div><b class="uarena__val num js-targetv">—</b></div>
        </div>
        <div class="upick">
          <section><header><h3>Tes cartes</h3><span class="muted js-invn"></span></header><div class="upick__grid js-inv"></div></section>
          <section><header><h3>Cartes à viser</h3><span class="muted">Triées par valeur</span></header><div class="upick__grid js-cat"></div></section>
        </div>`;
      const $ = (s) => stage.querySelector(s);
      const gauge = $('.js-gauge'), arc = gauge.querySelector('.ugauge__arc'), needle = gauge.querySelector('.ugauge__needle');
      /** La zone de victoire part du haut dans le sens choisi : même chance, côté miroir. */
      function paintDir() {
        arc.setAttribute('transform', dir > 0 ? 'rotate(-90 150 150)' : 'translate(300 0) scale(-1 1) rotate(-90 150 150)');
        gauge.classList.toggle('ccw', dir < 0);
      }
      paintDir();

      const stake = () => round2([...sel.values()].reduce((a, x) => a + valueOf(x.card, x.shiny) * x.n, 0) + Math.max(0, coinsIn.get()));
      const itemsN = () => [...sel.values()].reduce((a, x) => a + x.n, 0);
      const catalog = () => Object.values(cards.byId).sort((a, b) => a.value - b.value);
      const validTargets = () => { const s = stake(); return catalog().filter((c) => s > 0 && c.value >= s * MIN_MULT); };
      function autoTarget() {
        const list = validTargets(), want = stake() * mult;
        if (!list.length) return null;
        return list.reduce((best, c) => (Math.abs(c.value - want) < Math.abs(best.value - want) ? c : best), list[0]);
      }

      function paint() {
        const s = stake();
        if (target && !(s > 0 && target.value >= s * MIN_MULT)) target = autoTarget();
        const ch = chanceFor(s, target);
        stakeOut.set(`${ui.coin('coin--xs')} ${fmt(s)}`);
        chanceOut.set(target ? `<b style="color:${target.rarity.c}">${(ch * 100).toFixed(2).replace('.', ',')} %</b>` : '—');
        $('.js-stakev').textContent = fmt(s);
        $('.js-pct').textContent = target ? (ch * 100).toFixed(ch < 0.1 ? 2 : 1).replace('.', ',') + ' %' : '0 %';
        $('.js-x').textContent = target ? '×' + (target.value / s).toFixed(2).replace('.', ',') : s > 0 ? 'Choisis une carte' : 'Choisis tes cartes';
        gauge.style.setProperty('--uc', target ? target.rarity.c : '#ff6b2c');
        arc.style.strokeDasharray = `${ch * 100} 100`;
        // mise : cartes choisies en éventail
        const items = [...sel.values()];
        $('.js-stake').innerHTML = items.length
          ? items.map((x, i) => `<div class="ustake__c" data-k="${keyOf(x.card.id, x.shiny)}" style="--i:${i};--n:${items.length}" title="Retirer">${cards.html(x.card, { compact: true, shiny: x.shiny, count: x.n })}</div>`).join('')
          : `<div class="uempty">${I('layers-2', 'i--lg')}<span>Ajoute des cartes depuis ton inventaire</span></div>`;
        $('.js-target').innerHTML = target ? cards.html(target, {}) : `<div class="uempty">${I('target', 'i--lg')}<span>${s > 0 ? 'Choisis une carte à viser' : 'Aucune cible'}</span></div>`;
        $('.js-targetv').textContent = target ? fmt(target.value) : '—';
        // inventaire
        const inv = inventory.entries().sort((a, b) => valueOf(b.card, b.shiny) - valueOf(a.card, a.shiny));
        $('.js-invn').textContent = `${itemsN()} / ${MAX_ITEMS} sélectionnées`;
        $('.js-inv').innerHTML = inv.length ? inv.map((x) => {
          const k = keyOf(x.card.id, x.shiny), used = sel.get(k)?.n || 0, left = x.n - used;
          return `<button type="button" class="upick__c ${used ? 'on' : ''}" data-k="${k}" ${left <= 0 ? 'disabled' : ''}>${cards.html(x.card, { compact: true, shiny: x.shiny, count: left })}<span class="num">${fmt(valueOf(x.card, x.shiny))}</span></button>`;
        }).join('') : `<div class="uempty">${I('package-open', 'i--lg')}<span>Ton inventaire est vide.</span><a class="btn btn--primary btn--sm" href="#/caisses">Ouvrir des caisses</a></div>`;
        const vt = new Set(validTargets().map((c) => c.id));
        $('.js-cat').innerHTML = catalog().sort((a, b) => vt.has(b.id) - vt.has(a.id)).map((c) => {
          const ok = vt.has(c.id), chc = chanceFor(s, c);
          return `<button type="button" class="upick__c ${target && target.id === c.id ? 'on' : ''}" data-t="${c.id}" ${ok ? '' : 'disabled'}>${cards.html(c, { compact: true })}<span class="num">${ok ? (chc * 100).toFixed(chc < 0.1 ? 2 : 1).replace('.', ',') + ' %' : fmt(c.value)}</span></button>`;
        }).join('');
        goBtn.disabled = busy || !target || !(s > 0);
        clearBtn.disabled = busy || !items.length;
        coinsIn.disable(busy);
        multSeg.disable(busy);
        dirSeg.disable(busy);
        goBtn.innerHTML = target ? `Upgrader · ${(ch * 100).toFixed(ch < 0.1 ? 2 : 1).replace('.', ',')} %` : 'Upgrader';
      }

      stage.addEventListener('click', (e) => {
        if (busy) return;
        const add = e.target.closest('.js-inv .upick__c');
        if (add) {
          if (itemsN() >= MAX_ITEMS) { ui.toast(`${MAX_ITEMS} cartes maximum.`, 'error'); sound.play('error'); return; }
          const [id, sh] = add.dataset.k.split('|');
          const shiny = sh === '1', x = sel.get(add.dataset.k) || { card: cards.byId[id], shiny, n: 0 };
          x.n++;
          sel.set(add.dataset.k, x);
          sound.play('chip');
          if (!target) target = autoTarget();
          paint();
          return;
        }
        const rem = e.target.closest('.ustake__c');
        if (rem) {
          const x = sel.get(rem.dataset.k);
          if (x && --x.n <= 0) sel.delete(rem.dataset.k);
          sound.play('click');
          paint();
          return;
        }
        const t = e.target.closest('.js-cat .upick__c');
        if (t) { target = cards.byId[t.dataset.t]; sound.play('click'); paint(); }
      });
      coinsIn.onChange(() => { if (!target) target = autoTarget(); paint(); });
      clearBtn.addEventListener('click', () => { sel.clear(); target = null; sound.play('click'); paint(); });

      /** Applique le résultat (aussi appelé si on quitte la page pendant l'animation). */
      function finish() {
        if (!pending) return;
        const p = pending;
        pending = null;
        if (p.win) inventory.add([p.target.id]);
        settle('upgrade', p.stake, p.win ? p.target.value : 0, { silent: true, credit: false });
      }

      async function roll() {
        const s = stake(), tgt = target, ch = chanceFor(s, tgt);
        if (busy || !tgt || !(s > 0)) return;
        const coins = Math.max(0, coinsIn.get());
        const list = [...sel.values()].map((x) => ({ id: x.card.id, shiny: x.shiny, n: x.n }));
        if (coins > 0 && !wallet.canAfford(coins)) { ui.toast('Pas assez de DaveCoins !', 'error'); sound.play('error'); return; }
        if (!inventory.take(list)) { ui.toast('Ces cartes ne sont plus dans ton inventaire.', 'error'); sel.clear(); paint(); return; }
        if (coins > 0) { wallet.place(coins); coinsIn.remember(); }
        const r = rng.float(), win = r < ch;
        pending = { win, target: tgt, stake: s };
        busy = true;
        paint();
        gauge.classList.remove('win', 'lose');
        gauge.classList.add('spin');
        stage.querySelectorAll('.ustake__c').forEach((c, i) => c.animate([{ transform: 'none' }, { transform: 'translateY(-6px) scale(1.04)', filter: 'brightness(1.3)' }], { duration: 400, delay: i * 40, fill: 'forwards' }));
        sound.play('whoosh');
        // l'aiguille fait plusieurs tours puis s'arrête sur r (fraction du cercle)
        // l'aiguille s'arrête à r tour depuis le haut, dans le sens choisi (la zone gagnante va dans le même sens)
        const from = needleAt, to = dir > 0 ? Math.ceil(from) + 4 + r : Math.floor(from) - 4 - r, dur = 5200, t0 = performance.now();
        let lastTick = Math.floor(from * 40);
        await new Promise((res) => {
          const step = (now) => {
            if (!alive) return res();
            const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
            const pos = from + (to - from) * e;
            needle.style.transform = `rotate(${pos * 360}deg)`;
            const tick = Math.floor(pos * 40);
            if (tick !== lastTick) { lastTick = tick; sound.play('tick', { p: 1 - k }); }
            if (k < 1) requestAnimationFrame(step); else res();
          };
          requestAnimationFrame(step);
        });
        needleAt = to % 1; // garde le signe : l'aiguille repart d'où elle s'est arrêtée
        if (!alive) return;
        gauge.classList.remove('spin');
        await sleep(250);
        finish();
        $('.js-pct').textContent = win ? 'GAGNÉ' : 'PERDU';
        $('.js-x').textContent = win ? '+' + fmt(tgt.value) : 'Cartes perdues';
        const tEl = $('.js-target .tcard');
        if (win) {
          gauge.classList.add('win');
          sound.play('jackpot'); sound.play('slam');
          ui.flash(stage);
          ui.shake(gauge, 2);
          stage.querySelectorAll('.ustake__c').forEach((c, i) => c.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(120px, 0) scale(.3) rotate(20deg)' }], { duration: 600, delay: i * 50, fill: 'forwards', easing: 'cubic-bezier(.6,0,.2,1)' }));
          if (tEl) {
            tEl.classList.add('reveal');
            ui.burst(tEl, { n: 80, colors: [tgt.rarity.c, '#ffffff', '#ffc145'], spread: 3 });
          }
          ui.coinRain(stage, 30);
          ui.toast(`Upgrade réussi : ${tgt.name} (${fmt(tgt.value)}) ajoutée à ton inventaire !`, 'win');
        } else {
          gauge.classList.add('lose');
          sound.play('lose');
          ui.shake(gauge, 1);
          stage.querySelectorAll('.ustake__c').forEach((c, i) => c.animate([{ filter: 'none' }, { filter: 'grayscale(1) brightness(.6)', transform: 'translateY(30px) rotate(' + (i % 2 ? 12 : -12) + 'deg) scale(.7)', opacity: 0 }], { duration: 700, delay: i * 60, fill: 'forwards', easing: 'cubic-bezier(.6,0,.4,1)' }));
          if (tEl) tEl.animate([{ filter: 'none' }, { filter: 'grayscale(1) brightness(.5)' }], { duration: 500, fill: 'forwards' });
        }
        await sleep(1600);
        if (!alive) return;
        sel.clear();
        busy = false;
        gauge.classList.remove('win', 'lose');
        if (!win) target = null;
        paint();
      }
      goBtn.addEventListener('click', roll);

      paint();
      return () => { alive = false; finish(); };
    }
  });
})();
