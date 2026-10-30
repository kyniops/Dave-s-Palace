/* DaveCases — ouverture de caisses (1 à 4 d'un coup) et mode Battle contre la bande.
 * Chaque caisse rend 95 % du prix en moyenne ; les chances exactes sont affichées dans le jeu.
 * En Battle, le meilleur total remporte tous les objets de la partie (égalité = partage).
 */
(function () {
  'use strict';
  const { IMG, rng, fmt, fmtMult, wallet, settle, sound, ui, round2, sleep } = DP;

  const ITEMS = {
    olman: { name: 'Olman', img: 'olman.png', round: true },
    tdam: { name: 'Tdam', img: 'tdam.png', round: true },
    sevare: { name: 'Sévaré', img: 'sevare.png', round: true },
    slyme: { name: 'Slymefire', img: 'slymefire.png', round: true },
    axb: { name: 'AXB', img: 'axb.png', round: true },
    sauce: { name: 'Sauce Blanche', img: 'sauceblanche.png', round: true },
    casino: { name: 'La Machine', img: 'casino.png' },
    jpz: { name: 'JPZ Royal', img: 'jpz.png', round: true }
  };
  // [objet, multiplicateur du prix, poids] — poids calculés pour un RTP de 95 %
  const CASES = [
    { id: 'bande', name: 'Caisse de la Bande', price: 10, cover: 'sevare.png',
      drops: [['olman', 0.3, 4159], ['tdam', 0.5, 2600], ['sevare', 0.8, 2000], ['slyme', 1.2, 1500], ['axb', 2, 900], ['sauce', 5, 280], ['casino', 15, 70], ['jpz', 50, 15]] },
    { id: 'sauce', name: 'Caisse Sauce Blanche', price: 100, cover: 'sauceblanche.png',
      drops: [['olman', 0.15, 3232], ['tdam', 0.4, 2500], ['sevare', 0.7, 1800], ['slyme', 1.1, 1200], ['axb', 2.5, 700], ['sauce', 8, 180], ['casino', 30, 40], ['jpz', 120, 6]] },
    { id: 'royale', name: 'Caisse Royale JPZ', price: 500, cover: 'jpz.png',
      drops: [['olman', 0.1, 3280], ['tdam', 0.3, 2400], ['sevare', 0.6, 1600], ['slyme', 1, 1100], ['axb', 3, 600], ['sauce', 12, 120], ['casino', 60, 22], ['jpz', 500, 2]] }
  ];
  const RARITY = [
    { max: 1, label: 'Commun', c: '#6c7387', lvl: 0 },
    { max: 2.5, label: 'Rare', c: '#4c7dff', lvl: 3 },
    { max: 10, label: 'Épique', c: '#c8ff3d', lvl: 6 },
    { max: 100, label: 'Légendaire', c: '#ffc65c', lvl: 10 },
    { max: Infinity, label: 'Mythique', c: '#ff5d52', lvl: 14 }
  ];
  const rarity = (m) => RARITY.find((r) => m < r.max) || RARITY[RARITY.length - 1];
  const BOTS = ['olman', 'tdam', 'sevare', 'slyme', 'axb', 'sauce'];

  function drawItem(box) {
    const total = box.drops.reduce((a, d) => a + d[2], 0);
    let r = rng.float() * total;
    for (const d of box.drops) { r -= d[2]; if (r < 0) return d; }
    return box.drops[0];
  }
  function itemCard(box, d, cls = '') {
    const it = ITEMS[d[0]], rr = rarity(d[1]);
    return `<div class="loot ${cls}" style="--r:${rr.c}">
      <img class="${it.round ? 'round' : ''}" src="${IMG}${it.img}" alt="" draggable="false">
      <span class="loot__name">${it.name}</span>
      <span class="loot__val num">${fmt(round2(box.price * d[1]))}</span>
    </div>`;
  }

  /** Bande d'objets qui défile et s'arrête sur `win`. */
  function spinStrip(row, box, win, dur, onTick) {
    const N = 56, WIN_AT = 48;
    const seq = Array.from({ length: N }, (_, i) => (i === WIN_AT ? win : drawItem(box)));
    row.innerHTML = `<div class="strip__track">${seq.map((d) => itemCard(box, d)).join('')}</div><i class="strip__marker"></i>`;
    const track = row.firstElementChild;
    const first = track.children[0];
    const step = first.offsetWidth + parseFloat(getComputedStyle(track).columnGap || 8);
    const center = row.clientWidth / 2;
    const target = WIN_AT * step + first.offsetWidth / 2 - center + (rng.float() - 0.5) * first.offsetWidth * 0.7;
    return new Promise((resolve) => {
      const t0 = performance.now();
      let lastIdx = -1;
      const frame = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - k, 4);
        const x = target * e;
        track.style.transform = `translateX(${-x}px)`;
        const idx = Math.floor((x + center) / step);
        if (idx !== lastIdx) { lastIdx = idx; onTick && onTick(k); }
        if (k < 1) requestAnimationFrame(frame);
        else { track.children[WIN_AT].classList.add('won'); resolve(track.children[WIN_AT]); }
      };
      requestAnimationFrame(frame);
    });
  }

  DP.games.register({
    id: 'cases',
    name: 'DaveCases',
    icon: 'gift',
    tagline: 'Ouvre des caisses ou défie la bande en Battle',
    rtp: '95 %',
    isNew: true,
    hue: 30,
    art: `<div class="art-case"><div class="case-box"><img src="${IMG}jpz.png" alt=""></div></div>`,
    rules: `<p>Choisis une caisse et ouvre-la : la bande défile et s’arrête sur ton objet. Sa valeur en DaveCoins t’est versée.</p>
      <ul><li>Tu peux ouvrir jusqu’à <strong>4 caisses</strong> d’un coup.</li>
      <li><strong>Battle</strong> : tu affrontes 1 à 3 membres de la bande sur 1 à 5 manches avec la même caisse. Le plus gros total remporte <strong>tous les objets</strong> de la partie (égalité = partage).</li>
      <li>Chaque caisse rend 95 % de son prix en moyenne. Les chances de chaque objet sont affichées sous les caisses.</li></ul>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      let box = CASES[0], mode = 'open', count = 1, opps = 1, rounds = 3, busy = false, alive = true;
      let pending = null; // { cost, payout } réglé si on quitte en pleine ouverture

      ui.segmented(panel, { label: 'Mode', value: mode, options: [{ value: 'open', label: 'Ouvrir' }, { value: 'battle', label: 'Battle' }], onChange: (v) => { mode = v; paint(); } });
      const pick = ui.el(`<div class="field"><div class="field__head"><label>Caisse</label></div><div class="case-pick">${CASES.map((c) => `
        <button type="button" class="case-opt" data-id="${c.id}"><img src="${IMG}${c.cover}" alt=""><span>${c.name}</span><b class="num">${fmt(c.price)}</b></button>`).join('')}</div></div>`);
      panel.appendChild(pick);
      const countWrap = ui.el('<div></div>'), battleWrap = ui.el('<div class="stack-sm"></div>');
      panel.append(countWrap, battleWrap);
      const countSeg = ui.segmented(countWrap, { label: 'Nombre de caisses', value: count, options: [1, 2, 3, 4].map((n) => ({ value: n, label: '×' + n })), onChange: (v) => { count = v; paint(); } });
      const oppSeg = ui.segmented(battleWrap, { label: 'Adversaires', value: opps, options: [1, 2, 3].map((n) => ({ value: n, label: String(n) })), onChange: (v) => { opps = v; paint(); } });
      const roundSeg = ui.segmented(battleWrap, { label: 'Manches', value: rounds, options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) })), onChange: (v) => { rounds = v; paint(); } });
      const costOut = ui.readout(panel, 'Coût', '');
      const goBtn = ui.button(panel, '');
      const lastOut = ui.readout(panel, 'Dernier gain', '—');

      stage.classList.add('cases-stage');
      stage.innerHTML = `<div class="cases">
        <div class="cases__head"><img class="js-cover" src="" alt=""><div><h3 class="js-name"></h3><span class="muted js-sub"></span></div></div>
        <div class="cases__strips"></div>
        <div class="cases__drops"></div>
      </div>`;
      const stripsEl = stage.querySelector('.cases__strips');
      const dropsEl = stage.querySelector('.cases__drops');

      const cost = () => box.price * (mode === 'open' ? count : rounds);
      function paintDrops() {
        const total = box.drops.reduce((a, d) => a + d[2], 0);
        dropsEl.innerHTML = [...box.drops].reverse().map((d) => `<div class="drop" style="--r:${rarity(d[1]).c}">${itemCard(box, d)}<span class="drop__pct num">${(d[2] / total * 100).toFixed(d[2] / total < 0.01 ? 2 : 1)} %</span><span class="drop__rar">${rarity(d[1]).label}</span></div>`).join('');
      }
      function idleStrips() {
        const n = mode === 'open' ? count : opps + 1;
        stripsEl.innerHTML = Array.from({ length: n }, (_, i) => `<div class="strip-row">${mode === 'battle' ? playerTag(i) : ''}<div class="strip"><div class="strip__track">${Array.from({ length: 12 }, () => itemCard(box, drawItem(box))).join('')}</div><i class="strip__marker"></i></div></div>`).join('');
        stripsEl.querySelectorAll('.strip__track').forEach((t) => (t.style.transform = `translateX(${-rng.int(0, 200)}px)`));
      }
      function playerTag(i, total = 0) {
        const me = i === 0;
        const bot = BOTS[(i - 1 + BOTS.length) % BOTS.length];
        return `<div class="ptag${me ? ' me' : ''}">${me ? `<span class="avatar">${DP.esc(DP.auth.current().charAt(0).toUpperCase())}</span><b>Toi</b>` : `<img src="${IMG}${ITEMS[bot].img}" alt=""><b>${ITEMS[bot].name}</b>`}<span class="ptag__total num">${fmt(total)}</span></div>`;
      }
      function paint() {
        pick.querySelectorAll('.case-opt').forEach((b) => { b.classList.toggle('on', b.dataset.id === box.id); b.disabled = busy; });
        countWrap.hidden = mode !== 'open';
        battleWrap.hidden = mode !== 'battle';
        [countSeg, oppSeg, roundSeg].forEach((s) => s.disable(busy));
        costOut.set(`${ui.coin('coin--xs')} ${fmt(cost())}`);
        goBtn.innerHTML = mode === 'open' ? `Ouvrir ${count > 1 ? count + ' caisses' : 'la caisse'}` : 'Lancer la battle';
        goBtn.disabled = busy;
        stage.querySelector('.js-cover').src = IMG + box.cover;
        stage.querySelector('.js-name').textContent = box.name;
        stage.querySelector('.js-sub').innerHTML = mode === 'open' ? `${fmt(box.price)} DaveCoins la caisse` : `Battle · ${opps + 1} joueurs · ${rounds} manche${rounds > 1 ? 's' : ''}`;
        if (!busy) { idleStrips(); paintDrops(); }
      }
      pick.addEventListener('click', (e) => {
        const b = e.target.closest('.case-opt');
        if (!b || busy) return;
        box = CASES.find((c) => c.id === b.dataset.id);
        sound.play('click');
        paint();
      });

      function reveal(card, d, quiet) {
        const rr = rarity(d[1]);
        card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1.06)' }], { duration: 400, easing: 'cubic-bezier(.2,1.6,.4,1)', fill: 'forwards' });
        if (!quiet) sound.play('streak', { i: rr.lvl });
        ui.burst(card, { n: 8 + rr.lvl * 3, colors: [rr.c, '#ffffff'], spread: 1 + rr.lvl / 10 });
        ui.floatText(card, '+' + fmt(round2(box.price * d[1])));
        if (rr.lvl >= 10) { ui.shake(stage, rr.lvl >= 14 ? 2 : 1); ui.coinRain(stage, rr.lvl >= 14 ? 60 : 25); sound.play('jackpot'); }
      }
      const tick = (k) => sound.play('tick', { p: 1 - k });

      async function openCases() {
        const c = cost();
        if (!wallet.place(c)) return;
        busy = true; paint();
        const wins = Array.from({ length: count }, () => drawItem(box));
        const payout = round2(wins.reduce((a, d) => a + box.price * d[1], 0));
        pending = { cost: c, payout };
        sound.play('whoosh');
        stripsEl.innerHTML = wins.map(() => '<div class="strip-row"><div class="strip"></div></div>').join('');
        const rows = [...stripsEl.querySelectorAll('.strip')];
        const cards = await Promise.all(wins.map((d, i) => spinStrip(rows[i], box, d, 4600 + i * 350, i === 0 ? tick : null)));
        if (!alive) return;
        pending = null;
        // révélation de la plus faible à la plus rare
        const order = wins.map((d, i) => i).sort((a, b) => wins[a][1] - wins[b][1]);
        for (const i of order) { reveal(cards[i], wins[i]); await sleep(260); if (!alive) return; }
        settle('cases', c, payout, { silent: true });
        lastOut.set(`<span class="${payout >= c ? 'pos' : ''}">+${fmt(payout)}</span>`);
        ui.result(stage, { win: true, mult: payout / c, amount: payout });
        if (payout < c) sound.play('lose');
        busy = false;
        goBtn.disabled = false;
        pick.querySelectorAll('.case-opt').forEach((b) => (b.disabled = false));
        [countSeg, oppSeg, roundSeg].forEach((s) => s.disable(false));
      }

      async function battle() {
        const c = cost();
        if (!wallet.place(c)) return;
        busy = true; paint();
        const players = opps + 1;
        const draws = Array.from({ length: rounds }, () => Array.from({ length: players }, () => drawItem(box)));
        const totals = Array(players).fill(0);
        draws.forEach((r) => r.forEach((d, p) => (totals[p] = round2(totals[p] + box.price * d[1]))));
        const pot = round2(totals.reduce((a, b) => a + b, 0));
        const best = Math.max(...totals);
        const winners = totals.map((t, i) => (t === best ? i : -1)).filter((i) => i >= 0);
        const myPay = winners.includes(0) ? round2(pot / winners.length) : 0;
        pending = { cost: c, payout: myPay };

        const running = Array(players).fill(0);
        stripsEl.innerHTML = Array.from({ length: players }, (_, i) => `<div class="strip-row">${playerTag(i)}<div class="strip"></div></div>`).join('');
        const rows = [...stripsEl.querySelectorAll('.strip-row')];
        for (let r = 0; r < rounds; r++) {
          stage.querySelector('.js-sub').innerHTML = `Manche <b class="num">${r + 1}/${rounds}</b> · pot <b class="num">${fmt(round2(running.reduce((a, b) => a + b, 0)))}</b>`;
          sound.play('whoosh');
          const cards = await Promise.all(draws[r].map((d, p) => spinStrip(rows[p].querySelector('.strip'), box, d, 3400 + p * 120, p === 0 ? tick : null)));
          if (!alive) return;
          const topVal = Math.max(...draws[r].map((d) => d[1]));
          draws[r].forEach((d, p) => {
            running[p] = round2(running[p] + box.price * d[1]);
            reveal(cards[p], d, p !== 0);
            rows[p].querySelector('.ptag__total').textContent = fmt(running[p]);
          });
          sound.play('streak', { i: rarity(topVal).lvl });
          // le leader du moment est mis en avant
          const lead = Math.max(...running);
          rows.forEach((row, p) => row.classList.toggle('lead', running[p] === lead));
          await sleep(1100);
          if (!alive) return;
        }
        pending = null;
        rows.forEach((row, p) => row.classList.toggle('winner', winners.includes(p)));
        settle('cases', c, myPay, { silent: true });
        lastOut.set(myPay ? `<span class="pos">+${fmt(myPay)}</span>` : '0');
        if (myPay) {
          sound.play('jackpot');
          ui.coinRain(stage, 40);
          ui.result(stage, { win: true, mult: myPay / c, amount: myPay, label: winners.length > 1 ? 'Égalité' : 'Victoire' });
        } else {
          sound.play('lose');
          const w = winners[0];
          ui.result(stage, { win: false, label: `${ITEMS[BOTS[(w - 1 + BOTS.length) % BOTS.length]].name} gagne` });
        }
        stage.querySelector('.js-sub').innerHTML = `Pot total <b class="num">${fmt(pot)}</b>`;
        busy = false;
        goBtn.disabled = false;
        pick.querySelectorAll('.case-opt').forEach((b) => (b.disabled = false));
        [countSeg, oppSeg, roundSeg].forEach((s) => s.disable(false));
      }

      goBtn.addEventListener('click', () => { if (!busy) (mode === 'open' ? openCases : battle)(); });
      const onResize = () => { if (!busy) idleStrips(); };
      window.addEventListener('resize', onResize);
      paint();

      return () => {
        alive = false;
        window.removeEventListener('resize', onResize);
        if (pending) settle('cases', pending.cost, pending.payout, { silent: true });
      };
    }
  });
})();
