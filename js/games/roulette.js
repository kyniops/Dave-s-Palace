/* DaveRoulette — roulette européenne (un seul zéro). RTP 97,3 %. */
(function () {
  'use strict';
  const { IMG, rng, fmt, wallet, settle, sound, ui, round2 } = DP;

  const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const color = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
  const CHIPS = [
    { v: 1, c: '#6b7280' }, { v: 5, c: '#dc2626' }, { v: 10, c: '#2563eb' }, { v: 25, c: '#16a34a' },
    { v: 100, c: '#111827' }, { v: 500, c: '#7c3aed' }, { v: 1000, c: '#c98a16' }
  ];
  const chipColor = (v) => [...CHIPS].reverse().find((c) => v >= c.v)?.c || CHIPS[0].c;
  const short = (v) => (v >= 1000 ? round2(v / 1000) + 'k' : String(round2(v)));

  /** Renvoie le multiplicateur (mise incluse) d'un pari pour le numéro sorti. */
  function payoutMult(key, n) {
    const [type, arg] = key.split(':');
    if (type === 'n') return +arg === n ? 36 : 0;
    if (n === 0) return 0;
    switch (type) {
      case 'red': return RED.has(n) ? 2 : 0;
      case 'black': return !RED.has(n) ? 2 : 0;
      case 'odd': return n % 2 ? 2 : 0;
      case 'even': return n % 2 ? 0 : 2;
      case 'low': return n <= 18 ? 2 : 0;
      case 'high': return n >= 19 ? 2 : 0;
      case 'dz': return Math.ceil(n / 12) === +arg ? 3 : 0;
      case 'col': return ((n - 1) % 3) + 1 === +arg ? 3 : 0;
    }
    return 0;
  }

  function wheelSvg() {
    const a = 360 / 37;
    const R = 50, r = 33;
    const pt = (ang, rad) => {
      const t = ((ang - 90) * Math.PI) / 180;
      return [50 + rad * Math.cos(t), 50 + rad * Math.sin(t)];
    };
    const fill = { red: '#c81e36', black: '#17151f', green: '#12985a' };
    let s = '<svg viewBox="0 0 100 100">';
    ORDER.forEach((n, i) => {
      const a0 = i * a - a / 2, a1 = i * a + a / 2;
      const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R), [x2, y2] = pt(a1, r), [x3, y3] = pt(a0, r);
      s += `<path d="M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 0 0 ${x3},${y3} Z" fill="${fill[color(n)]}" stroke="#c98a16" stroke-width=".35"/>`;
      const [tx, ty] = pt(i * a, 44.5);
      s += `<text x="${tx}" y="${ty}" fill="#fff" font-size="3.6" font-weight="800" font-family="Outfit,sans-serif" text-anchor="middle" dominant-baseline="central" transform="rotate(${i * a} ${tx} ${ty})">${n}</text>`;
    });
    s += `<circle cx="50" cy="50" r="${r}" fill="#2a1c0a" stroke="#c98a16" stroke-width=".8"/>`;
    for (let i = 0; i < 8; i++) {
      const [x, y] = pt(i * 45, r - 0.5);
      s += `<line x1="50" y1="50" x2="${x}" y2="${y}" stroke="#c98a16" stroke-width="1.2" opacity=".7"/>`;
    }
    return s + '</svg>';
  }

  function tableHtml() {
    let h = '<div class="rtable">';
    h += '<button type="button" class="rcell green" data-bet="n:0" style="grid-column:1;grid-row:1/4">0</button>';
    for (let row = 1; row <= 3; row++) {
      for (let c = 1; c <= 12; c++) {
        const n = 3 * c - (row - 1);
        h += `<button type="button" class="rcell ${color(n)}" data-bet="n:${n}" style="grid-column:${c + 1};grid-row:${row}">${n}</button>`;
      }
      h += `<button type="button" class="rcell out" data-bet="col:${4 - row}" style="grid-column:14;grid-row:${row}">2:1</button>`;
    }
    ['1–12', '13–24', '25–36'].forEach((t, i) => {
      h += `<button type="button" class="rcell out" data-bet="dz:${i + 1}" style="grid-column:${2 + i * 4}/span 4;grid-row:4">${t}</button>`;
    });
    [['low', '1–18'], ['even', 'Pair'], ['red', '◆'], ['black', '◆'], ['odd', 'Impair'], ['high', '19–36']].forEach(([k, t], i) => {
      const cls = k === 'red' ? 'red' : k === 'black' ? 'black' : 'out';
      h += `<button type="button" class="rcell ${cls}" data-bet="${k}" style="grid-column:${2 + i * 2}/span 2;grid-row:5">${t}</button>`;
    });
    return h + '</div>';
  }

  DP.games.register({
    id: 'roulette',
    name: 'DaveRoulette',
    icon: '🎡',
    tagline: 'Roulette européenne, le vrai frisson',
    rtp: '97,3 %',
    colors: ['#dc2626', '#14532d'],
    art: '<span class="game-card__emoji">🎡</span>',
    rules: `<p>Choisis un jeton, clique sur le tapis pour miser, puis lance la roue.</p>
      <ul><li><strong>Numéro plein</strong> : paie 35 pour 1 (×36).</li>
      <li><strong>Douzaine / colonne (2:1)</strong> : paie 2 pour 1 (×3).</li>
      <li><strong>Rouge/Noir, Pair/Impair, 1–18/19–36</strong> : paie 1 pour 1 (×2). Le 0 fait perdre ces paris.</li>
      <li>Clic droit sur une case pour retirer la mise posée dessus.</li></ul>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      let chip = 10, bets = {}, history = [], lastBets = null, spinning = false, alive = true, pending = null;
      let wheelRot = 0;

      panel.appendChild(ui.el(`<div class="field"><div class="field__head"><label>Jeton</label></div>
        <div class="chip-rack">${CHIPS.map((c) => `<button type="button" class="chip" data-chip="${c.v}" style="--chip:${c.c}">${short(c.v)}</button>`).join('')}</div></div>`));
      const totalOut = ui.readout(panel, 'Mise totale', '0');
      const row1 = ui.el('<div class="panel__row"></div>');
      const row2 = ui.el('<div class="panel__row"></div>');
      panel.append(row1, row2);
      const undoBtn = ui.button(row1, '↶ Annuler', 'btn btn--ghost btn--sm');
      const clearBtn = ui.button(row1, 'Effacer', 'btn btn--ghost btn--sm');
      const dblBtn = ui.button(row2, '×2', 'btn btn--ghost btn--sm');
      const rebetBtn = ui.button(row2, 'Rejouer', 'btn btn--ghost btn--sm');
      const spinBtn = ui.button(panel, 'Lancer la roue');
      const lastOut = ui.readout(panel, 'Dernier gain', '—');

      stage.innerHTML = `
        <div class="stage__top"><div class="roulette-result"></div><div class="pill-row js-hist"></div></div>
        <div class="roulette">
          <div class="wheel-box">
            <div class="wheel-pointer"></div>
            <div class="wheel">${wheelSvg()}<div class="wheel__hub"><img src="${IMG}jpz.png" alt=""></div></div>
            <div class="ball-orbit"><i></i></div>
          </div>
          <div class="rtable-wrap">${tableHtml()}</div>
        </div>`;
      const wheel = stage.querySelector('.wheel');
      const orbit = stage.querySelector('.ball-orbit');
      const resultEl = stage.querySelector('.roulette-result');
      const histEl = stage.querySelector('.js-hist');
      const table = stage.querySelector('.rtable');
      const cells = [...table.querySelectorAll('.rcell')];
      const chipBtns = [...panel.querySelectorAll('.chip')];
      const undo = [];

      const total = () => round2(Object.values(bets).reduce((a, b) => a + b, 0));
      function paint() {
        cells.forEach((c) => {
          const v = bets[c.dataset.bet];
          let ch = c.querySelector('.chip');
          if (v) {
            if (!ch) { ch = document.createElement('span'); ch.className = 'chip'; c.appendChild(ch); }
            ch.style.setProperty('--chip', chipColor(v));
            ch.textContent = short(v);
          } else if (ch) ch.remove();
        });
        chipBtns.forEach((b) => b.classList.toggle('on', +b.dataset.chip === chip));
        totalOut.set(`${ui.coin('coin--xs')} ${fmt(total())}`);
        const empty = total() === 0;
        [undoBtn, clearBtn, dblBtn].forEach((b) => (b.disabled = spinning || empty));
        rebetBtn.disabled = spinning || !lastBets;
        spinBtn.disabled = spinning || empty;
        chipBtns.forEach((b) => (b.disabled = spinning));
      }

      function place(key, amount) {
        if (spinning) return;
        if (total() + amount > wallet.get() + 1e-9) { ui.toast('Pas assez de DaveCoins pour ce jeton.', 'error'); sound.play('error'); return; }
        bets[key] = round2((bets[key] || 0) + amount);
        undo.push({ key, amount });
        sound.play('chip');
        paint();
      }

      panel.addEventListener('click', (e) => {
        const b = e.target.closest('[data-chip]');
        if (b) { chip = +b.dataset.chip; sound.play('click'); paint(); }
      });
      table.addEventListener('click', (e) => {
        const c = e.target.closest('.rcell');
        if (c) place(c.dataset.bet, chip);
      });
      table.addEventListener('contextmenu', (e) => {
        const c = e.target.closest('.rcell');
        if (!c || spinning) return;
        e.preventDefault();
        if (bets[c.dataset.bet]) { delete bets[c.dataset.bet]; sound.play('click'); paint(); }
      });
      undoBtn.addEventListener('click', () => {
        const u = undo.pop();
        if (!u) return;
        bets[u.key] = round2((bets[u.key] || 0) - u.amount);
        if (bets[u.key] <= 0) delete bets[u.key];
        paint();
      });
      clearBtn.addEventListener('click', () => { bets = {}; undo.length = 0; paint(); });
      dblBtn.addEventListener('click', () => {
        if (total() * 2 > wallet.get() + 1e-9) { ui.toast('Pas assez de DaveCoins pour doubler.', 'error'); return; }
        Object.keys(bets).forEach((k) => (bets[k] = round2(bets[k] * 2)));
        undo.length = 0;
        sound.play('chip');
        paint();
      });
      rebetBtn.addEventListener('click', () => {
        const t = Object.values(lastBets).reduce((a, b) => a + b, 0);
        if (t > wallet.get() + 1e-9) { ui.toast('Pas assez de DaveCoins pour rejouer.', 'error'); return; }
        bets = { ...lastBets };
        undo.length = 0;
        sound.play('chip');
        paint();
      });

      function resolve(n, stake, placed) {
        let pay = 0;
        Object.entries(placed).forEach(([k, v]) => (pay += v * payoutMult(k, n)));
        pay = round2(pay);
        settle('roulette', stake, pay);
        return pay;
      }

      async function spin() {
        const stake = total();
        if (spinning || !stake) return;
        if (!wallet.place(stake)) return;
        spinning = true;
        lastBets = { ...bets };
        cells.forEach((c) => c.classList.remove('hit'));
        resultEl.innerHTML = '';
        paint();
        sound.play('bet');

        const n = ORDER[rng.int(0, 36)];
        pending = { n, stake, placed: { ...bets } };
        const idx = ORDER.indexOf(n);
        const a = 360 / 37;
        const from = wheelRot;
        const base = from - (from % 360) + 360 * 5;
        wheelRot = base + ((360 - idx * a) % 360);
        const dur = 5200;
        const wA = wheel.animate([{ transform: `rotate(${from}deg)` }, { transform: `rotate(${wheelRot}deg)` }],
          { duration: dur, easing: 'cubic-bezier(.12,.6,.18,1)', fill: 'forwards' });
        orbit.classList.add('out');
        const bA = orbit.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-1800deg)' }],
          { duration: dur, easing: 'cubic-bezier(.2,.6,.25,1)', fill: 'forwards' });
        const ticks = setInterval(() => sound.play('tick'), 140);
        setTimeout(() => orbit.classList.remove('out'), dur - 900);
        await Promise.all([wA.finished, bA.finished]);
        clearInterval(ticks);
        if (!alive) return;
        wheel.style.transform = `rotate(${wheelRot}deg)`;
        wA.cancel();

        pending = null;
        const pay = resolve(n, stake, lastBets);
        resultEl.innerHTML = `<span class="rnum big ${color(n)}">${n}</span>`;
        cells.forEach((c) => { if (payoutMult(c.dataset.bet, n) > 0) c.classList.add('hit'); });
        history.unshift(n);
        histEl.innerHTML = history.slice(0, 10).map((h) => `<span class="rnum ${color(h)}">${h}</span>`).join('');
        lastOut.set(pay > 0 ? `<span class="pos">+${fmt(pay)}</span>` : '0');
        ui.result(stage, pay > 0 ? { win: true, mult: pay / stake, amount: pay } : { win: false, label: String(n) });
        bets = {};
        undo.length = 0;
        spinning = false;
        paint();
      }
      spinBtn.addEventListener('click', spin);
      paint();

      return () => {
        alive = false;
        if (pending) resolve(pending.n, pending.stake, pending.placed);
      };
    }
  });
})();
