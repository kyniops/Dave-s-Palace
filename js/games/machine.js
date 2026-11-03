/* DaveMachine — machine à sous 5×3, 20 lignes, wild JPZ, cartes Free JPZ (scatter), free spins (multiplicateur qui
 * grimpe, wilds collants), Hold & Win avec les DaveCoins et 4 jackpots (Mini, Mineur, Majeur, Grand).
 * Les maths sont dans slot-engine.js (RTP ≈ 96,3 %) ; en ligne, tout est tiré par le serveur (supabase/machine2.sql).
 */
(function () {
  'use strict';
  const { IMG, rng, fmt, wallet, settle, sound, ui, sleep, round2 } = DP;
  const S = window.DaveSlot;
  const ABORT = Symbol('abort');
  const TIERS = [{ x: 100, label: 'Epic win' }, { x: 40, label: 'Mega win' }, { x: 15, label: 'Big win' }];
  const ROUND = new Set(['lucasco', 'olmanaura', 'tddam', 'billy', 'scat']);
  const NAMES = { wild: 'JPZ (wild)', scat: 'Free JPZ', coin: 'DaveCoin', casino: 'La Machine', lucasco: 'Lucasco', olmanaura: 'Olman Aura', tddam: 'Tddam', billy: 'Billy', petitbonnin: 'Petit Bonnin', linkay: 'Linkay', yohan: 'Yohan', carl: 'Carl', tdam2: 'Tdam' };
  // GRAND : part du jackpot global selon la mise (entier à partir de GRAND_FULL_BET)
  const grandShare = (bet) => Math.min(1, bet / S.GRAND_FULL_BET);
  const AUTO_COUNTS = [10, 25, 50, 100, Infinity];
  // Rampe d'ampoules autour de la machine : [gauche %, haut %]
  const BULBS = (() => {
    const out = [];
    for (let i = 0; i <= 15; i++) { out.push([i * (100 / 15), 0]); out.push([100 - i * (100 / 15), 100]); }
    for (let i = 1; i < 9; i++) { out.push([100, i * (100 / 9)]); out.push([0, 100 - i * (100 / 9)]); }
    return out;
  })();

  function symHtml(k) {
    if (k === 'coin') return `<div class="sym k-coin s-coin" data-k="coin"><img src="${IMG}davecoin.png" alt="DaveCoin" draggable="false"><span class="coin-v"></span></div>`;
    const d = S.SYMBOLS[k];
    if (d.glyph) return `<div class="sym k-low s-${k}" data-k="${k}"><b>${d.glyph}</b></div>`;
    const tag = k === 'wild' ? '<span class="sym__tag">Wild</span>' : k === 'scat' ? '<span class="sym__tag">Free</span>' : '';
    return `<div class="sym k-${d.kind} s-${k}${ROUND.has(k) ? ' round' : ''}" data-k="${k}"><img src="${IMG}${d.img}" alt="${NAMES[k]}" draggable="false">${tag}</div>`;
  }
  const miniSym = (k) => {
    const d = S.SYMBOLS[k];
    return d.glyph ? `<span class="pt-glyph s-${k}">${d.glyph}</span>` : `<img class="${ROUND.has(k) || k === 'wild' ? 'round' : ''}" src="${IMG}${d.img}" alt="">`;
  };

  const rulesHtml = () => `
    <p><strong>5 rouleaux, 3 rangées, 20 lignes.</strong> Les gains se lisent de gauche à droite à partir du premier rouleau. Ta mise est répartie sur les 20 lignes.</p>
    <ul>
      <li><strong>JPZ couronné est le Wild</strong> (rouleaux 2 à 5) : il remplace tous les symboles sauf la carte Free JPZ.</li>
      <li><strong>3 cartes Free JPZ ou plus</strong> n’importe où : <strong>8 free spins</strong> (12 pour 4, 16 pour 5) + gain direct ×2 / ×10 / ×50 la mise.</li>
      <li>Pendant les free spins, le <strong>multiplicateur démarre à ×1 et monte de 1 après chaque tour gagnant</strong> (×${S.MULT_MAX} au plus), et <strong>chaque wild qui tombe reste collé</strong> jusqu’à la fin du bonus. Les cartes Free JPZ qui retombent <strong>ajoutent</strong> des free spins.</li>
      <li><strong>Hold & Win</strong> : <strong>${S.HW.trigger} DaveCoins ou plus</strong> visibles lancent le bonus. Les pièces restent en place et tu as <strong>${S.HW.respins} relances</strong> ; chaque nouvelle pièce remet le compteur à ${S.HW.respins}. Chaque pièce vaut de ×1 à ×15 ta mise, ou un jackpot.</li>
      <li><strong>4 jackpots</strong> : <strong>Mini</strong> ×${S.JACKPOTS.mini}, <strong>Mineur</strong> ×${S.JACKPOTS.minor} et <strong>Majeur</strong> ×${S.JACKPOTS.major} ta mise (sur les DaveCoins), et le <strong>Grand</strong> : le jackpot global de tout le casino, gagné en remplissant <strong>les 15 cases</strong> du Hold & Win ou avec <strong>5 cartes Free JPZ</strong>. Tu le gagnes en entier à partir de ${fmt(S.GRAND_FULL_BET)} de mise, une part proportionnelle en dessous.</li>
      <li><strong>Tirage auto</strong> : choisis 10, 25, 50, 100 tours ou illimité, et arrête quand tu veux.</li>
    </ul>
    <p class="muted">Les <strong>20 lignes</strong> : un gain compte quand 3, 4 ou 5 symboles identiques se suivent <strong>depuis le rouleau de gauche</strong> le long d’une de ces lignes (droites, en V ou en zigzag).</p>
    <div class="slines">${S.LINES.map((ln, i) => `<div class="sline"><svg viewBox="0 0 50 30" aria-hidden="true">${[0, 1, 2].map((r) => [0, 1, 2, 3, 4].map((c) => `<rect x="${c * 10 + 1}" y="${r * 10 + 1}" width="8" height="8" class="${ln[c] === r ? 'on' : ''}"/>`).join('')).join('')}<polyline points="${ln.map((r, c) => `${c * 10 + 5},${r * 10 + 5}`).join(' ')}"/></svg><span>${i + 1}</span></div>`).join('')}</div>
    <p class="muted">Table des gains (× la mise totale) pour 3 / 4 / 5 symboles :</p>
    <div class="paytable">${Object.keys(S.SYMBOLS).filter((k) => k !== 'scat' && k !== 'coin').map((k) => `<div>${miniSym(k)}<span>${S.SYMBOLS[k].pays.map((p) => '×' + round2(p / S.LINES.length)).join(' · ')}</span></div>`).join('')}
      <div>${miniSym('scat')}<span>${[3, 4, 5].map((n) => S.SCATTER[n].spins + ' FS').join(' · ')}</span></div></div>`;

  DP.games.register({
    id: 'machine',
    name: 'DaveMachine',
    icon: 'cherry',
    tagline: 'Free spins à multiplicateur, Hold & Win, 4 jackpots',
    rtp: '96,3 %',
    hot: true,
    hue: 38,
    art: `<img src="${IMG}casino.png" alt="">`,
    rules: rulesHtml(),
    mount(root) {
      const { panel, stage } = ui.layout(root);
      const betIn = ui.betInput(panel, { label: 'Mise totale', gameId: 'machine', initial: 20 });
      const lineOut = ui.readout(panel, 'Mise par ligne', '');
      const winOut = ui.readout(panel, 'Dernier gain', '—');
      const spinBtn = ui.button(panel, 'Lancer');
      const autoSeg = ui.segmented(panel, {
        label: 'Tirage auto', value: 10,
        options: AUTO_COUNTS.map((n) => ({ value: n === Infinity ? 'inf' : n, label: n === Infinity ? '∞' : String(n) })),
        onChange: () => {}
      });
      const row = ui.el('<div class="panel__row"></div>');
      panel.appendChild(row);
      const autoBtn = ui.button(row, ui.icon('repeat', 'i--sm') + 'Lancer l’auto', 'btn btn--ghost');
      const turboBtn = ui.button(row, ui.icon('zap', 'i--sm') + 'Turbo', 'btn btn--ghost');
      panel.appendChild(ui.el('<p class="note">Espace pour lancer · clic sur une annonce pour la passer</p>'));

      stage.classList.add('slot-stage');
      stage.innerHTML = `
        <div class="slot5">
          <div class="slot5__bulbs" aria-hidden="true">${BULBS.map(([x, y], i) => `<i style="left:${x}%;top:${y}%;--i:${i}"></i>`).join('')}</div>
          <div class="slot5__jps">
            <div class="jpt jpt--mini"><span>Mini</span><b class="num js-jpmini">0</b></div>
            <div class="jpt jpt--minor"><span>Mineur</span><b class="num js-jpminor">0</b></div>
            <div class="jpt jpt--major"><span>Majeur</span><b class="num js-jpmajor">0</b></div>
            <div class="jpt jpt--grand"><span>Grand</span><b class="num js-jp">${fmt(DP.jackpot.get())}</b></div>
          </div>
          <div class="slot5__top">
            <div class="plq plq--fs"><span>Free spins</span><b class="num js-fs">0</b></div>
            <div class="plq plq--mult"><span>Multi</span><b class="num js-mult">×1</b></div>
            <div class="plq plq--win"><span>Gain bonus</span><b class="num js-fswin">0</b></div>
          </div>
          <div class="slot5__window">
            ${[0, 1, 2, 3, 4].map(() => '<div class="reel5"><div class="reel5__strip"></div></div>').join('')}
            <svg class="slot5__lines" viewBox="0 0 500 300" preserveAspectRatio="none">
              ${S.LINES.map((ln) => `<polyline points="${ln.map((r, i) => `${50 + i * 100},${50 + r * 100}`).join(' ')}"/>`).join('')}
            </svg>
            <div class="slot5__layer js-sticky" aria-hidden="true"></div>
            <div class="slot5__layer slot5__hw js-hw" aria-hidden="true" hidden></div>
            <div class="slot5__overlay" hidden></div>
          </div>
          <div class="slot5__msg"><span class="js-msg">Bonne chance !</span></div>
        </div>`;

      const slot = stage.querySelector('.slot5');
      const stopBg = DP.slotBg(stage, slot);
      const reels = [...stage.querySelectorAll('.reel5')];
      const strips = reels.map((r) => r.firstElementChild);
      const lineEls = [...stage.querySelectorAll('.slot5__lines polyline')];
      const overlayEl = stage.querySelector('.slot5__overlay');
      const msgEl = stage.querySelector('.js-msg');
      const plqWin = stage.querySelector('.plq--win');
      // compteur du jackpot : rattrape la valeur en douceur
      const jpEl = stage.querySelector('.js-jp');
      let jpShown = DP.jackpot.get(), jpRaf = 0;
      const jpMini = stage.querySelector('.js-jpmini'), jpMinor = stage.querySelector('.js-jpminor'), jpMajor = stage.querySelector('.js-jpmajor');
      const paintJps = () => {
        const b = betIn.get() || 0;
        jpMini.textContent = fmt(round2(b * S.JACKPOTS.mini));
        jpMinor.textContent = fmt(round2(b * S.JACKPOTS.minor));
        jpMajor.textContent = fmt(round2(b * S.JACKPOTS.major));
        if (!jpRaf) jpRaf = requestAnimationFrame(jpTick);
      };
      const jpTick = () => {
        const target = round2(DP.jackpot.get() * grandShare(betIn.get() || 0));
        jpShown = target < jpShown ? target : jpShown + (target - jpShown) * 0.08;
        if (Math.abs(target - jpShown) < 0.01) jpShown = target;
        jpEl.textContent = fmt(round2(jpShown));
        if (jpShown !== target) jpRaf = requestAnimationFrame(jpTick); else jpRaf = 0;
      };
      const offJp = DP.on('jackpot', () => { if (!jpRaf) jpRaf = requestAnimationFrame(jpTick); });
      const fsCount = stage.querySelector('.js-fs');
      const multEl = stage.querySelector('.js-mult');
      const stickyEl = stage.querySelector('.js-sticky');
      const hwEl = stage.querySelector('.js-hw');
      const fsWinEl = stage.querySelector('.js-fswin');

      let busy = false, auto = false, turbo = false, alive = true;
      let session = null; // { bet, stake, win, fsLeft, fsPlayed, fsTotal, fsWin } — win inclut déjà tous les tours tirés
      let cycleTimer = 0;

      const start = S.spin(rng.float).grid;
      strips.forEach((s, r) => (s.innerHTML = start[r].map(symHtml).join('')));

      const cellSize = () => {
        const c = Math.round(reels[0].clientWidth * 0.92);
        slot.style.setProperty('--cell', c + 'px');
        return c;
      };
      cellSize();
      const onResize = () => cellSize();
      window.addEventListener('resize', onResize);

      const wait = async (ms) => { await sleep(ms); if (!alive) throw ABORT; };
      const setMsg = (html) => (msgEl.innerHTML = html);

      function paintPanel() {
        const bet = betIn.get();
        lineOut.set(`${ui.coin('coin--xs')} ${fmt(round2(bet / S.LINES.length))}`);
        spinBtn.disabled = busy;
        autoSeg.disable(auto);
        betIn.disable(busy || auto);
      }
      betIn.onChange(() => { paintPanel(); paintJps(); });

      function clearWins() {
        clearInterval(cycleTimer);
        lineEls.forEach((l) => l.classList.remove('show'));
        slot.classList.remove('has-win');
        stage.querySelectorAll('.sym.win').forEach((n) => n.classList.remove('win'));
      }

      /* ---------- Rotation des rouleaux ---------- */
      async function spinReels(grid) {
        clearWins();
        const cell = cellSize();
        slot.classList.add('spinning');
        sound.play('spin');
        const whir = sound.reels(5);
        let stopped = 0;
        // Anticipation : dès que 2 cartes Free JPZ sont visibles, les rouleaux suivants ralentissent
        let offset = 0, seen = 0;
        const plan = grid.map((col, r) => {
          const anticip = seen >= 2;
          if (anticip) offset += turbo ? 600 : 1300;
          const dur = (turbo ? 380 : 750) + r * (turbo ? 110 : 230) + offset;
          seen += col.filter((k) => k === 'scat').length;
          return { dur, anticip };
        });
        let scatters = 0;
        const anims = strips.map((strip, r) => {
          const current = [...strip.children].map((n) => n.dataset.k);
          const filler = Array.from({ length: Math.round(plan[r].dur / (turbo ? 45 : 55)) }, () => rng.pick(S.STRIPS[r]));
          const seq = [...current, ...filler, ...grid[r]];
          strip.innerHTML = seq.map(symHtml).join('');
          const dist = (seq.length - 3) * cell;
          if (plan[r].anticip) {
            setTimeout(() => { if (alive) { reels[r].classList.add('anticip'); sound.play('anticip', { d: (plan[r].dur - plan[r - 1].dur) / 1000 }); } }, plan[r - 1].dur);
          }
          const a = strip.animate(
            [{ transform: 'translateY(0)', filter: 'blur(0)' }, { transform: `translateY(-${dist * 0.15}px)`, filter: 'blur(2px)', offset: 0.1 },
              { transform: `translateY(-${dist * 0.97}px)`, filter: 'blur(1px)', offset: 0.88 }, { transform: `translateY(-${dist}px)`, filter: 'blur(0)' }],
            { duration: plan[r].dur, easing: 'cubic-bezier(.3,0,.25,1)', fill: 'forwards' }
          );
          return a.finished.then(() => {
            if (!alive) return;
            a.cancel();
            strip.innerHTML = grid[r].map(symHtml).join('');
            reels[r].classList.remove('anticip');
            reels[r].animate([{ transform: 'translateY(8px)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' });
            sound.play('reelStop', { i: r });
            whir.set(5 - ++stopped);
            const sc = [...strip.children].filter((n) => n.dataset.k === 'scat');
            if (sc.length) {
              sc.forEach((n) => { n.classList.add('land'); ui.burst(n, { n: 14, colors: ['#ffc65c', '#ffffff'] }); });
              sound.play('scatter', { i: scatters++ });
            }
          });
        });
        try { await Promise.all(anims); } finally { whir.stop(); }
        slot.classList.remove('spinning');
        if (!alive) throw ABORT;
      }

      /* ---------- DaveCoins ---------- */
      const coinLabel = (v, bet) => (typeof v === 'number' ? fmt(round2(v * bet)) : S.JP_NAMES[v]);
      const coinCls = (v) => (typeof v === 'number' ? (v >= 10 ? 'is-big' : '') : 'is-jp jp-' + v);
      function paintCoins(list, bet) {
        list.forEach(([r, w, v]) => {
          const el = cellEl(r, w);
          if (!el || el.dataset.k !== 'coin') return;
          el.querySelector('.coin-v').textContent = coinLabel(v, bet);
          el.className = 'sym k-coin s-coin ' + coinCls(v);
        });
      }

      /* ---------- Affichage des gains ---------- */
      const cellEl = (reel, row) => strips[reel].children[row];
      const describe = (l) => `Ligne ${l.line + 1} · ${l.count}× ${NAMES[l.sym]} · <b class="num">+${fmt(l.amount)}</b>`;
      async function showWins(res, quick) {
        if (!res.lines.length && !res.scatter.pay) return;
        slot.classList.add('has-win');
        res.lines.forEach((l) => { lineEls[l.line].classList.add('show'); l.cells.forEach(([r, w]) => cellEl(r, w).classList.add('win')); });
        if (res.scatter.count >= 3) res.scatter.cells.forEach(([r, w]) => cellEl(r, w).classList.add('win'));
        // éclats de particules sur chaque symbole gagnant
        stage.querySelectorAll('.sym.win').forEach((n, i) => setTimeout(() => alive && ui.burst(n, { n: 8 }), i * 40));
        // une seule ligne : on dit laquelle et avec quel symbole (sinon le tracé en V/zigzag paraît aléatoire)
        if (res.lines.length === 1 && !(res.scatter.count >= 3)) setMsg(describe(res.lines[0]));
        else setMsg(`Gain <b class="num">+${fmt(res.total)}</b>${res.lines.length ? ` sur ${res.lines.length} lignes` : ''}`);
        sound.play('win', { x: res.total / session.bet });
        await wait(quick ? 700 : 1100);
      }
      function cycleLines(res) {
        if (res.lines.length < 2) return;
        let i = 0;
        cycleTimer = setInterval(() => {
          const l = res.lines[i++ % res.lines.length];
          lineEls.forEach((el, j) => el.classList.toggle('show', j === l.line));
          stage.querySelectorAll('.sym.win').forEach((n) => n.classList.remove('win'));
          l.cells.forEach(([r, w]) => cellEl(r, w).classList.add('win'));
          setMsg(describe(l));
        }, 1300);
      }

      /* ---------- Annonces ---------- */
      function overlay(html, ms, cls = '') {
        return new Promise((resolve) => {
          overlayEl.className = 'slot5__overlay ' + cls;
          overlayEl.innerHTML = html;
          overlayEl.hidden = false;
          let done = false;
          const finish = () => { if (done) return; done = true; overlayEl.hidden = true; overlayEl.onclick = null; resolve(); };
          overlayEl.onclick = finish;
          setTimeout(finish, ms);
        });
      }
      /** Grosse annonce : compteur qui défile, paliers Big → Mega → Epic, pluie de pièces, secousse. */
      async function bigWin(amount, stake) {
        const top = TIERS.find((t) => amount / stake >= t.x);
        if (!top) return;
        ui.coinRain(stage, top.x >= 100 ? 80 : top.x >= 40 ? 50 : 30);
        ui.shake(slot, top.x >= 40 ? 2 : 1);
        const dur = turbo || auto ? 1800 : 3400;
        sound.play('bigwin', { d: dur / 1000 });
        overlayEl.className = 'slot5__overlay big';
        overlayEl.innerHTML = `<div class="bigwin"><div class="bigwin__rays"></div><div class="bigwin__label">${TIERS[TIERS.length - 1].label}</div><div class="bigwin__amount num">0</div><div class="bigwin__x num"></div></div>`;
        overlayEl.hidden = false;
        const label = overlayEl.querySelector('.bigwin__label');
        const amt = overlayEl.querySelector('.bigwin__amount');
        const xs = overlayEl.querySelector('.bigwin__x');
        let skip = false;
        overlayEl.onclick = () => (skip = true);
        const t0 = performance.now();
        let lastTier = label.textContent;
        await new Promise((resolve) => {
          const step = (now) => {
            const k = skip ? 1 : Math.min(1, (now - t0) / dur);
            const v = amount * (1 - Math.pow(1 - k, 2));
            amt.textContent = fmt(round2(v));
            const tier = TIERS.find((t) => v / stake >= t.x) || TIERS[TIERS.length - 1];
            if (tier.label !== lastTier) {
              lastTier = label.textContent = tier.label;
              label.classList.remove('bump'); void label.offsetWidth; label.classList.add('bump');
              sound.play('tierUp');
              ui.shake(slot, 2);
            }
            xs.textContent = '×' + (v / stake).toFixed(1);
            if (k < 1 && alive) requestAnimationFrame(step); else resolve();
          };
          requestAnimationFrame(step);
        });
        await wait(skip ? 300 : 1200);
        overlayEl.hidden = true;
        overlayEl.onclick = null;
      }

      /* ---------- Free spins ---------- */
      let shownWin = 0;
      function flip(el, text) {
        if (el.textContent === text) return;
        el.textContent = text;
        el.animate([{ transform: 'rotateX(90deg)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.16,1,.3,1)' });
      }
      function paintBanner() {
        flip(fsCount, String(session.fsLeft));
        fsWinEl.textContent = fmt(round2(shownWin));
      }
      /** Pièces qui s'envolent des symboles gagnants vers la plaque « Gain » qui compte à chaque arrivée. */
      function collectCoins(res) {
        const cells = [];
        res.lines.forEach((l) => l.cells.forEach(([r, w]) => cells.push(cellEl(r, w))));
        if (res.scatter.pay) res.scatter.cells.forEach(([r, w]) => cells.push(cellEl(r, w)));
        const target = plqWin.getBoundingClientRect();
        const tx = target.left + target.width / 2, ty = target.top + target.height / 2;
        const n = Math.min(26, 4 + Math.round(Math.sqrt(res.total / session.bet) * 4));
        const from = shownWin, to = round2(session.fsWin);
        let landed = 0;
        return new Promise((resolve) => {
          if (!cells.length) { shownWin = to; paintBanner(); return resolve(); }
          for (let i = 0; i < n; i++) {
            const src = cells[i % cells.length].getBoundingClientRect();
            const sx = src.left + src.width / 2 + (Math.random() - 0.5) * src.width * 0.5, sy = src.top + src.height / 2;
            const c = document.createElement('img');
            c.src = IMG + 'davecoin.png';
            c.className = 'coin-fly';
            c.style.left = sx + 'px'; c.style.top = sy + 'px';
            ui._fxLayer().appendChild(c);
            const lift = 80 + Math.random() * 120;
            c.animate([
              { transform: 'translate(-50%,-50%) scale(.4) rotate(0)', opacity: 0 },
              { transform: `translate(calc(-50% + ${(tx - sx) * 0.3}px), calc(-50% + ${(ty - sy) * 0.3 - lift}px)) scale(1.1) rotate(200deg)`, opacity: 1, offset: 0.35 },
              { transform: `translate(calc(-50% + ${tx - sx}px), calc(-50% + ${ty - sy}px)) scale(.5) rotate(540deg)`, opacity: 0.9 }
            ], { duration: 700 + Math.random() * 250, delay: i * 45, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'backwards' }).finished.then(() => {
              c.remove();
              landed++;
              shownWin = round2(from + (to - from) * (landed / n));
              fsWinEl.textContent = fmt(shownWin);
              sound.play('count', { k: landed / n });
              plqWin.animate([{ transform: 'scale(1.12)' }, { transform: 'none' }], { duration: 160 });
              if (landed === n) { shownWin = to; paintBanner(); resolve(); }
            });
          }
        });
      }
      /** Tampon du multiplicateur sur chaque symbole gagnant pendant les free spins. */
      function stampX2(res, mult) {
        if (mult <= 1) return;
        const seen = new Set();
        res.lines.forEach((l) => l.cells.forEach(([r, w]) => {
          const k = r + ':' + w;
          if (seen.has(k)) return;
          seen.add(k);
          const el = cellEl(r, w);
          el.insertAdjacentHTML('beforeend', `<span class="sym__x2">×${mult}</span>`);
        }));
        if (seen.size) sound.play('chip');
      }
      async function introBonus(spins) {
        showMachine();
        sound.play('fs');
        ui.coinRain(stage, 40);
        ui.flash(stage);
        ui.shake(slot, 2);
        await overlay(`<div class="fs-intro fs-intro--jpz"><img src="${IMG}freejpz.jpg" alt=""><div><span>Cartes Free JPZ</span><strong class="num">${spins}</strong><em>free spins · multiplicateur qui grimpe jusqu’à ×${S.MULT_MAX} · wilds collants</em></div></div>`, 3200, 'fs-start');
      }
      // Effets d'ambiance pendant tout le bonus : lumières, pluie de pièces, musique
      let party = null;
      function startParty() {
        document.body.classList.add('fs-party');
        window.DP_SPACE && DP_SPACE.warp(true);
        const music = sound.fsMusic();
        party = { stop() { music.stop(); window.DP_SPACE && DP_SPACE.warp(false); document.body.classList.remove('fs-party'); } };
      }
      function stopParty() { if (party) { party.stop(); party = null; } }

      /** Fin du bonus : le gain total monte avec des tics de plus en plus aigus, lumières et pièces. */
      async function fsSummary(total, played) {
        const dur = Math.min(6500, 2200 + Math.sqrt(total / session.bet) * 400);
        overlayEl.className = 'slot5__overlay summary';
        overlayEl.innerHTML = `<div class="fs-sum">
          <div class="fs-sum__bulbs">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
          <span class="fs-sum__label">Gain total du bonus</span>
          <strong class="fs-sum__amount num">0</strong>
          <em class="fs-sum__x num"></em>
          <span class="fs-sum__meta">${played} free spins joués</span>
        </div>`;
        overlayEl.hidden = false;
        const amt = overlayEl.querySelector('.fs-sum__amount');
        const xs = overlayEl.querySelector('.fs-sum__x');
        let skip = false, last = 0;
        overlayEl.onclick = () => (skip = true);
        ui.coinRain(stage, 50);
        const t0 = performance.now();
        await new Promise((resolve) => {
          const step = (now) => {
            const k = skip ? 1 : Math.min(1, (now - t0) / dur);
            const e = 1 - Math.pow(1 - k, 2.2);
            const v = total * e;
            amt.textContent = fmt(round2(v));
            xs.textContent = '×' + (v / session.bet).toFixed(1);
            if (now - last > 55 && k < 1) { last = now; sound.play('count', { k: e }); }
            if (Math.random() < 0.06 && k < 1) ui.burst(amt, { n: 6, colors: ['#ffc145', '#ffffff', '#ff6b2c'], spread: 1.6 });
            if (k < 1 && alive) requestAnimationFrame(step); else resolve();
          };
          requestAnimationFrame(step);
        });
        amt.classList.add('slam');
        sound.play('slam');
        ui.shake(slot, 3);
        ui.flash(stage);
        ui.burst(amt, { n: 60, colors: ['#ffc145', '#ffffff', '#ff6b2c'], spread: 2.4 });
        ui.coinRain(stage, 70);
        await wait(skip ? 900 : 2200);
        overlayEl.hidden = true;
        overlayEl.onclick = null;
      }

      /** Wilds collants : posés sur une couche fixe, ils ne bougent pas pendant que les rouleaux tournent. */
      function paintSticky(list) {
        stickyEl.innerHTML = (list || []).map((i) => `<div class="slot5__cell sticky" style="grid-column:${Math.floor(i / 3) + 1};grid-row:${(i % 3) + 1}">${symHtml('wild')}</div>`).join('');
      }
      function setMult(m, bump) {
        multEl.textContent = '×' + m;
        if (bump) { multEl.animate([{ transform: 'scale(1.6)', color: '#ffc145' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,1.6,.4,1)' }); sound.play('tierUp'); }
      }

      async function runBonus() {
        slot.classList.add('fs');
        shownWin = 0;
        let prevSticky = [];
        paintSticky([]);
        setMult(1);
        paintBanner();
        startParty();
        try {
          while (session.fsLeft > 0) {
            session.fsLeft--;
            session.fsPlayed++;
            paintBanner();
            const f = session.fs[session.fsIdx++];
            const grid = f.grid, mult = f.mult;
            setMult(mult);
            setMsg(`Free spin ${session.fsPlayed} · gains ×${mult}`);
            const res = S.evaluate(grid, session.bet, mult);
            session.fsWin += res.total;
            session.fsLeft += res.scatter.spins;
            session.fsTotal += res.scatter.spins;
            await spinReels(grid);
            // nouveaux wilds collants : ils s'illuminent puis restent en place
            const fresh = f.sticky.filter((i) => !prevSticky.includes(i));
            prevSticky = f.sticky;
            paintSticky(f.sticky);
            if (fresh.length) {
              sound.play('chip');
              fresh.forEach((i) => { const c = stickyEl.querySelector(`[style*="grid-column:${Math.floor(i / 3) + 1};grid-row:${(i % 3) + 1}"]`); if (c) { c.classList.add('new'); ui.burst(c, { n: 14, colors: ['#ffc145', '#ffffff'] }); } });
              setMsg(`Wild collant ! Il reste en place jusqu’à la fin du bonus`);
              await wait(turbo ? 300 : 650);
            }
            if (res.total > 0) {
              stampX2(res, mult);
              slot.animate([{ transform: 'scale(1.012)' }, { transform: 'none' }], { duration: 240 });
              if (res.total >= session.bet * 10) { ui.shake(slot, 1); ui.flash(stage); }
              const coins = collectCoins(res);
              await showWins(res, true);
              await coins;
            } else await showWins(res, true);
            paintBanner();
            if (res.total > 0 && mult < S.MULT_MAX) { setMult(mult + 1, true); setMsg(`Multiplicateur ×${mult + 1} !`); await wait(turbo ? 200 : 450); }
            if (res.scatter.spins) {
              sound.play('fs');
              ui.flash(stage);
              ui.shake(slot, 2);
              await overlay(`<div class="fs-intro fs-intro--jpz"><img src="${IMG}freejpz.jpg" alt=""><div><span>Relance !</span><strong class="num">+${res.scatter.spins}</strong><em>free spins ajoutés</em></div></div>`, 2400, 'fs-start');
            }
            await wait(turbo ? 250 : 450);
          }
          await fsSummary(round2(session.fsWin), session.fsPlayed);
        } finally {
          stopParty();
          paintSticky([]);
          slot.classList.remove('fs');
        }
      }

      /** Bonus (free spins, Hold & Win, jackpot) : sur petit écran, on ramène la machine dans l'écran. */
      function showMachine() {
        const r = slot.getBoundingClientRect();
        if (r.top < 60 || r.bottom > innerHeight) slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      /* ---------- Hold & Win ---------- */
      function hwCell(r, w, v, bet, cls = '') {
        return `<div class="slot5__cell hwc ${cls}" data-i="${r * 3 + w}" style="grid-column:${r + 1};grid-row:${w + 1}">${v === undefined ? '' : `<div class="sym k-coin s-coin ${coinCls(v)}"><img src="${IMG}davecoin.png" alt=""><span class="coin-v">${coinLabel(v, bet)}</span></div>`}</div>`;
      }
      /** Hold & Win : les pièces restent, 3 relances remises à 3 à chaque nouvelle pièce, puis on encaisse. */
      async function holdWinSeq(start, hw, bet) {
        showMachine();
        sound.play('fs');
        ui.flash(stage);
        ui.coinRain(stage, 30);
        await overlay(`<div class="fs-intro hw-intro"><img src="${IMG}davecoin.png" alt=""><div><span>${start.length} DaveCoins</span><strong>Hold & Win</strong><em>${S.HW.respins} relances · chaque nouvelle pièce remet le compteur à ${S.HW.respins}</em></div></div>`, 2800, 'fs-start');
        const held = new Map(start.map(([r, w, v]) => [r * 3 + w, v]));
        const cells = Array.from({ length: 15 }, (_, i) => hwCell(Math.floor(i / 3), i % 3, held.get(i), bet, held.has(i) ? 'held' : 'empty')).join('');
        hwEl.innerHTML = cells + `<div class="hw-bar"><span>Relances</span><b class="num js-hwleft">${S.HW.respins}</b><span>Pièces</span><b class="num js-hwn">${held.size}/15</b></div>`;
        hwEl.hidden = false;
        slot.classList.add('hw');
        const leftEl = hwEl.querySelector('.js-hwleft'), nEl = hwEl.querySelector('.js-hwn');
        let left = S.HW.respins;
        setMsg('Hold & Win : fais tomber des DaveCoins !');
        await wait(600);
        for (const fresh of hw.steps) {
          // les cases vides « tournent »
          hwEl.querySelectorAll('.hwc.empty').forEach((c) => c.classList.add('roll'));
          sound.play('spin');
          await wait(turbo ? 450 : 900);
          hwEl.querySelectorAll('.hwc.roll').forEach((c) => c.classList.remove('roll'));
          for (const [r, w, v] of fresh) {
            held.set(r * 3 + w, v);
            const c = hwEl.querySelector(`.hwc[data-i="${r * 3 + w}"]`);
            c.outerHTML = hwCell(r, w, v, bet, 'held land');
            const nc = hwEl.querySelector(`.hwc[data-i="${r * 3 + w}"]`);
            ui.burst(nc, { n: 16, colors: ['#ffc145', '#ffffff'] });
            sound.play(typeof v === 'number' ? 'coin' : 'tierUp');
            await wait(turbo ? 90 : 180);
          }
          left = fresh.length ? S.HW.respins : left - 1;
          flip(leftEl, String(left));
          nEl.textContent = `${held.size}/15`;
          if (fresh.length) { leftEl.animate([{ transform: 'scale(1.5)', color: '#ffc145' }, { transform: 'none' }], { duration: 380 }); setMsg(`+${fresh.length} pièce${fresh.length > 1 ? 's' : ''} · relances remises à ${S.HW.respins}`); }
          else setMsg(left ? `Plus que ${left} relance${left > 1 ? 's' : ''}…` : 'Fin du Hold & Win');
          await wait(turbo ? 200 : 380);
        }
        // on encaisse : chaque pièce s'ajoute au total
        let x = 0;
        const order = [...held.entries()].sort((a, b) => (a[0] % 3) - (b[0] % 3) || a[0] - b[0]);
        for (const [i, v] of order) {
          x += S.coinX(v);
          const c = hwEl.querySelector(`.hwc[data-i="${i}"]`);
          if (c) c.classList.add('cash');
          setMsg(`${typeof v === 'number' ? '' : `<b>${S.JP_NAMES[v]}</b> · `}Hold & Win <b class="num">+${fmt(round2(x * bet))}</b>`);
          sound.play('count', { k: Math.min(1, x / 60) });
          if (typeof v !== 'number') { ui.flash(stage); ui.shake(slot, 1); await wait(turbo ? 300 : 700); }
          await wait(turbo ? 60 : 130);
        }
        ui.coinRain(stage, Math.min(80, 20 + Math.round(x * 2)));
        sound.play('win', { x });
        await wait(turbo ? 700 : 1400);
        if (held.size === 15) { setMsg('<b>15 DaveCoins : GRAND JACKPOT !</b>'); await wait(900); }
        hwEl.hidden = true;
        hwEl.innerHTML = '';
        slot.classList.remove('hw');
      }

      /** JACKPOT : tout s'allume, hyperespace, le montant monte jusqu'à la cagnotte gagnée. */
      async function jackpotSequence(amount, why) {
        showMachine();
        document.body.classList.add('jp-party');
        slot.classList.add('jp-on');
        window.DP_SPACE && DP_SPACE.warp(true);
        const music = sound.fsMusic();
        sound.play('fs');
        ui.flash(stage);
        ui.shake(slot, 3);
        overlayEl.className = 'slot5__overlay jackpot';
        overlayEl.innerHTML = `<div class="jpwin">
          <span class="jpwin__kicker">${why === 'hw' ? '15 DaveCoins · Grand jackpot' : '5 cartes Free JPZ · Grand jackpot'}</span>
          <strong class="jpwin__title">${[...'GRAND'].map((c, i) => `<i style="--i:${i}">${c}</i>`).join('')}</strong>
          <b class="jpwin__amount num">0</b>
          <span class="jpwin__meta">Jackpot global remporté par ${DP.esc(DP.auth.current())}</span>
        </div>`;
        overlayEl.hidden = false;
        const amt = overlayEl.querySelector('.jpwin__amount');
        let skip = false;
        overlayEl.onclick = () => (skip = true);
        await wait(1400);
        const rain = setInterval(() => alive && ui.coinRain(stage, 14), 500);
        const dur = 7000, t0 = performance.now();
        let last = 0;
        await new Promise((resolve) => {
          const step = (now) => {
            const k = skip ? 1 : Math.min(1, (now - t0) / dur);
            const e = 1 - Math.pow(1 - k, 2.4);
            amt.textContent = fmt(round2(amount * e));
            if (now - last > 50 && k < 1) { last = now; sound.play('count', { k: e }); }
            if (Math.random() < 0.1 && k < 1) ui.burst(amt, { n: 10, colors: ['#ffc145', '#ffffff', '#ff6b2c'], spread: 2 });
            if (k < 1 && alive) requestAnimationFrame(step); else resolve();
          };
          requestAnimationFrame(step);
        });
        clearInterval(rain);
        amt.classList.add('slam');
        sound.play('slam'); sound.play('jackpot');
        ui.shake(slot, 3); ui.flash(stage);
        ui.burst(amt, { n: 90, colors: ['#ffc145', '#ffffff', '#ff6b2c'], spread: 3 });
        ui.coinRain(stage, 120);
        await wait(skip ? 1200 : 3200);
        music.stop();
        window.DP_SPACE && DP_SPACE.warp(false);
        document.body.classList.remove('jp-party');
        slot.classList.remove('jp-on');
        overlayEl.hidden = true;
        overlayEl.onclick = null;
      }

      /* ---------- Partie ---------- */
      async function play() {
        if (busy) return;
        const bet = betIn.get();
        const stake = bet;
        let srv = null;
        if (DP.engine && DP.engine.on) {
          // en ligne : le serveur tire le tour, les free spins et le jackpot d'un coup
          busy = true; paintPanel();
          srv = await DP.engine.call('slot_spin', { p_bet: bet }, { defer: true });
          if (!srv || !alive) { busy = false; stopAuto(); paintPanel(); return; }
          DP.engine.debitView(stake);
        } else if (!wallet.place(stake)) { stopAuto(); return; }
        betIn.remember();
        busy = true;
        paintPanel();
        // hors ligne : même tirage que le serveur, avec le moteur local
        const out = srv || (() => {
          const grid = S.spin(rng.float).grid, e = S.evaluate(grid, bet);
          const coins = e.coins.map(([r, w]) => [r, w, S.coinValue(rng.float)]);
          const hw = e.hw ? S.holdWin(rng.float, coins) : null;
          const why = hw && hw.grand ? 'hw' : e.scatter.count >= 5 ? 'scat' : null;
          const jp = why ? round2(DP.jackpot.win(DP.auth.current()) * grandShare(bet)) : 0;
          const fsl = e.scatter.spins ? S.freeSpins(rng.float, bet, e.scatter.spins) : [];
          const total = round2(e.total + (hw ? hw.x * bet : 0) + jp + fsl.reduce((a, f) => a + f.total, 0));
          return { grid, coins, hw: hw && { steps: hw.steps, x: hw.x }, fs: fsl, jp, grand: why, total };
        })();
        session = { bet, stake, total: +out.total, fsLeft: 0, fsPlayed: 0, fsTotal: 0, fsWin: 0, srv, fs: out.fs || [], fsIdx: 0 };
        try {
          {
            setMsg('&nbsp;');
            const grid = out.grid;
            const res = S.evaluate(grid, bet);
            session.fsLeft = session.fsTotal = res.scatter.spins;
            session.jp = +out.jp || 0;
            await spinReels(grid);
            paintCoins(out.coins || [], bet);
            if (res.total > 0) await showWins(res, auto);
            else setMsg(res.scatter.count === 2 ? 'Presque… 2 cartes Free JPZ !' : (out.coins || []).length >= S.HW.trigger - 1 && !out.hw ? `Presque… ${(out.coins || []).length} DaveCoins !` : 'Pas de gain cette fois');
            if (out.hw) { clearWins(); await holdWinSeq(out.coins, out.hw, bet); }
            if (session.jp) await jackpotSequence(session.jp, out.grand);
            if (res.scatter.spins) await introBonus(res.scatter.spins);
            else if (!auto) cycleLines(res);
          }
          if (session.fsLeft > 0) await runBonus();

          const s = session;
          const total = round2(s.total);
          session = null;
          if (s.srv) DP.engine.reveal(s.srv.acct);
          settle('machine', s.stake, total, { silent: true });
          winOut.set(total > 0 ? `<span class="pos">+${fmt(total)}</span>` : '0');
          if (total > 0 && s.fsTotal) setMsg(`Total <b class="num">+${fmt(total)}</b>`);
          if (!s.fsTotal && !s.jp) await bigWin(total, s.stake);
        } catch (e) {
          if (e !== ABORT) throw e;
          return;
        }
        busy = false;
        if (auto) {
          autoLeft--;
          if (autoLeft <= 0) stopAuto(); else paintAuto();
        }
        paintPanel();
        if (auto) {
          await sleep(turbo ? 250 : 600);
          if (alive && auto && !busy) play();
        }
      }

      let autoLeft = 0;
      function paintAuto() {
        autoBtn.innerHTML = auto ? `${ui.icon('x', 'i--sm')}Stop · <span class="num">${autoLeft === Infinity ? '∞' : autoLeft}</span>` : ui.icon('repeat', 'i--sm') + 'Lancer l’auto';
        autoBtn.classList.toggle('on', auto);
      }
      function stopAuto() {
        auto = false;
        autoLeft = 0;
        paintAuto();
        paintPanel();
      }
      spinBtn.addEventListener('click', () => play());
      autoBtn.addEventListener('click', () => {
        if (auto) return stopAuto();
        const v = autoSeg.get();
        autoLeft = v === 'inf' ? Infinity : +v;
        auto = true;
        paintAuto();
        paintPanel();
        sound.play('click');
        if (!busy) play();
      });
      turboBtn.addEventListener('click', () => { turbo = !turbo; turboBtn.classList.toggle('on', turbo); sound.play('click'); });
      // barre d'espace = lancer (ou passer l'annonce en cours)
      const onKey = (e) => {
        if (e.code !== 'Space' || e.repeat || /input|select|textarea/i.test(e.target.tagName) || document.querySelector('.modal')) return;
        e.preventDefault();
        if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
        if (!overlayEl.hidden) overlayEl.click(); else if (!busy) play();
      };
      const noSpaceClick = (e) => { if (e.code === 'Space' && e.target.tagName === 'BUTTON' && root.contains(e.target)) e.preventDefault(); };
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', noSpaceClick);
      paintPanel();
      paintJps();

      return () => {
        alive = false;
        auto = false;
        stopBg();
        offJp();
        cancelAnimationFrame(jpRaf);
        stopParty();
        window.DP_SPACE && DP_SPACE.warp(false);
        document.body.classList.remove('jp-party');
        clearInterval(cycleTimer);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', noSpaceClick);
        // Partie en cours : les free spins restants sont joués instantanément puis réglés.
        if (session && session.srv) { DP.engine.reveal(session.srv.acct); session = null; } // en ligne : déjà réglé par le serveur
        if (session) { settle('machine', session.stake, round2(session.total)); session = null; } // hors ligne : tout était déjà tiré
      };
    }
  });
})();
