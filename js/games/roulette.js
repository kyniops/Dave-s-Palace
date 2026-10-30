/* DaveRoulette — roulette européenne (un seul zéro). RTP 97,3 %.
 * Roue dessinée en canvas : la bille tourne à contre-sens, ralentit, rebondit sur les déflecteurs
 * puis tombe dans la case tirée au sort (le résultat est décidé avant le lancer).
 */
(function () {
  'use strict';
  const { rng, fmt, wallet, settle, sound, ui, round2, sleep } = DP;

  const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const color = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
  const POCKET = 360 / 37;
  const CHIPS = [
    { v: 1, c: '#5b6378', e: '#e9ecf2', ink: '#fff' },
    { v: 5, c: '#e5484d', e: '#fff', ink: '#fff' },
    { v: 10, c: '#3d6bff', e: '#fff', ink: '#fff' },
    { v: 25, c: '#12a06e', e: '#fff', ink: '#fff' },
    { v: 100, c: '#15171f', e: '#c8ff3d', ink: '#c8ff3d' },
    { v: 500, c: '#ffb547', e: '#15171f', ink: '#1f1300' },
    { v: 1000, c: '#c8ff3d', e: '#15171f', ink: '#0d1200' }
  ];
  const chipFor = (v) => [...CHIPS].reverse().find((c) => v >= c.v) || CHIPS[0];
  const short = (v) => (v >= 1000 ? round2(v / 1000) + 'k' : String(round2(v)));

  /** Jeton de casino en SVG : bord à encoches, anneau pointillé, valeur au centre. */
  function chipSvg(v, cls = '') {
    const c = chipFor(v);
    const notches = Array.from({ length: 6 }, (_, i) => `<rect x="46" y="2" width="8" height="14" rx="2" fill="${c.e}" transform="rotate(${i * 60} 50 50)"/>`).join('');
    return `<svg class="chip-svg ${cls}" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="52" r="48" fill="rgba(0,0,0,.45)"/>
      <circle cx="50" cy="50" r="48" fill="${c.c}"/>
      ${notches}
      <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2"/>
      <circle cx="50" cy="50" r="33" fill="${c.c}" stroke="${c.e}" stroke-width="2.5" stroke-dasharray="5 4"/>
      <circle cx="50" cy="50" r="27" fill="rgba(255,255,255,.08)"/>
      <ellipse cx="38" cy="30" rx="20" ry="9" fill="rgba(255,255,255,.18)" transform="rotate(-25 38 30)"/>
      <text x="50" y="51" fill="${c.ink}" font-family="Geist Mono, monospace" font-weight="600" font-size="${short(v).length > 3 ? 19 : 24}" text-anchor="middle" dominant-baseline="central">${short(v)}</text>
    </svg>`;
  }

  DP.ui.chip = chipSvg; // réutilisé par DaveJack

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

  function tableHtml() {
    let h = '<div class="rtable">';
    h += '<button type="button" class="rcell green" data-bet="n:0" style="grid-column:1;grid-row:1/4">0</button>';
    for (let row = 1; row <= 3; row++) {
      for (let c = 1; c <= 12; c++) {
        const n = 3 * c - (row - 1);
        h += `<button type="button" class="rcell ${color(n)}" data-bet="n:${n}" data-n="${n}" style="grid-column:${c + 1};grid-row:${row}">${n}</button>`;
      }
      h += `<button type="button" class="rcell out" data-bet="col:${4 - row}" style="grid-column:14;grid-row:${row}">2:1</button>`;
    }
    ['1–12', '13–24', '25–36'].forEach((t, i) => {
      h += `<button type="button" class="rcell out" data-bet="dz:${i + 1}" style="grid-column:${2 + i * 4}/span 4;grid-row:4">${t}</button>`;
    });
    [['low', '1–18'], ['even', 'Pair'], ['red', 'Rouge'], ['black', 'Noir'], ['odd', 'Impair'], ['high', '19–36']].forEach(([k, t], i) => {
      const cls = k === 'red' ? 'red' : k === 'black' ? 'black' : 'out';
      h += `<button type="button" class="rcell ${cls}" data-bet="${k}" style="grid-column:${2 + i * 2}/span 2;grid-row:5">${t}</button>`;
    });
    return h + '</div>';
  }

  /* ---------- Rendu de la roue ---------- */
  const COLORS = { red: ['#d3343f', '#a3212b'], black: ['#1b1f2b', '#0d1017'], green: ['#16a873', '#0c7550'] };
  const rad = (deg) => ((deg - 90) * Math.PI) / 180; // 0° = haut, sens horaire

  /** Partie tournante (cases, numéros, cône, tourelle) pré-dessinée une fois. */
  function buildRotor(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const R = size / 2;
    g.translate(R, R);
    ORDER.forEach((n, i) => {
      const a0 = rad(i * POCKET - POCKET / 2), a1 = rad(i * POCKET + POCKET / 2);
      const [hi, lo] = COLORS[color(n)];
      // bande des numéros
      g.beginPath(); g.arc(0, 0, R * 0.74, a0, a1); g.arc(0, 0, R * 0.62, a1, a0, true); g.closePath();
      g.fillStyle = hi; g.fill();
      // cuvette (plus sombre, où la bille se pose)
      g.beginPath(); g.arc(0, 0, R * 0.62, a0, a1); g.arc(0, 0, R * 0.5, a1, a0, true); g.closePath();
      const pg = g.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 0.62);
      pg.addColorStop(0, lo); pg.addColorStop(1, '#05060a');
      g.fillStyle = pg; g.fill();
      // numéro
      g.save();
      g.rotate(rad(i * POCKET) + Math.PI / 2);
      g.fillStyle = '#fff';
      g.font = `600 ${R * 0.07}px "Geist Mono", monospace`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), 0, -R * 0.68);
      g.restore();
    });
    // séparateurs (frets) métalliques
    g.strokeStyle = 'rgba(220,226,240,.75)';
    g.lineWidth = R * 0.008;
    for (let i = 0; i < 37; i++) {
      const a = rad(i * POCKET + POCKET / 2);
      g.beginPath(); g.moveTo(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5); g.lineTo(Math.cos(a) * R * 0.74, Math.sin(a) * R * 0.74); g.stroke();
    }
    [0.74, 0.62, 0.5].forEach((k) => { g.beginPath(); g.arc(0, 0, R * k, 0, Math.PI * 2); g.lineWidth = R * 0.01; g.strokeStyle = 'rgba(220,226,240,.55)'; g.stroke(); });
    // cône central
    const cone = g.createRadialGradient(-R * 0.12, -R * 0.14, R * 0.02, 0, 0, R * 0.5);
    cone.addColorStop(0, '#3b4257'); cone.addColorStop(0.55, '#171b26'); cone.addColorStop(1, '#0a0c12');
    g.beginPath(); g.arc(0, 0, R * 0.5, 0, Math.PI * 2); g.fillStyle = cone; g.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.beginPath(); g.moveTo(Math.cos(a) * R * 0.17, Math.sin(a) * R * 0.17); g.lineTo(Math.cos(a) * R * 0.48, Math.sin(a) * R * 0.48);
      g.strokeStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(200,255,61,.25)'; g.lineWidth = R * 0.006; g.stroke();
    }
    // tourelle chromée (croix + boules)
    const chrome = (x, y, r) => {
      const cg = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.45, '#b8bfcf'); cg.addColorStop(1, '#4a5163');
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = cg; g.fill();
    };
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3);
      g.strokeStyle = '#8d95a8'; g.lineWidth = R * 0.035; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = R * 0.01; g.stroke();
      chrome(Math.cos(a) * R * 0.31, Math.sin(a) * R * 0.31, R * 0.035);
    }
    chrome(0, 0, R * 0.1);
    g.beginPath(); g.arc(0, 0, R * 0.035, 0, Math.PI * 2); g.fillStyle = '#c8ff3d'; g.fill();
    return c;
  }

  /** Partie fixe : jante, piste de la bille, losanges déflecteurs. */
  function drawStator(g, R) {
    const rim = g.createRadialGradient(0, 0, R * 0.74, 0, 0, R);
    rim.addColorStop(0, '#0b0d14'); rim.addColorStop(0.55, '#1e2333'); rim.addColorStop(0.8, '#2c3246'); rim.addColorStop(1, '#0d1018');
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fillStyle = rim; g.fill();
    g.beginPath(); g.arc(0, 0, R * 0.985, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = R * 0.01; g.stroke();
    g.beginPath(); g.arc(0, 0, R * 0.9, 0, Math.PI * 2); g.strokeStyle = 'rgba(200,255,61,.18)'; g.lineWidth = R * 0.006; g.stroke();
    // déflecteurs
    for (let i = 0; i < 8; i++) {
      const a = rad(i * 45 + 22.5);
      g.save();
      g.translate(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8);
      g.rotate(a + Math.PI / 2);
      const s = R * 0.03;
      g.beginPath(); g.moveTo(0, -s * 1.6); g.lineTo(s, 0); g.lineTo(0, s * 1.6); g.lineTo(-s, 0); g.closePath();
      const dg = g.createLinearGradient(-s, 0, s, 0); dg.addColorStop(0, '#f2f4f8'); dg.addColorStop(1, '#7c8498');
      g.fillStyle = dg; g.fill();
      g.restore();
    }
  }

  DP.games.register({
    id: 'roulette',
    name: 'DaveRoulette',
    icon: 'roulette',
    tagline: 'Roulette européenne, le vrai frisson',
    rtp: '97,3 %',
    hue: 352,
    art: '<canvas class="art-wheel js-wheel-art" width="240" height="240"></canvas>',
    rules: `<p>Choisis un jeton, clique sur le tapis pour miser, puis lance la roue.</p>
      <ul><li><strong>Numéro plein</strong> : paie 35 pour 1 (×36).</li>
      <li><strong>Douzaine / colonne (2:1)</strong> : paie 2 pour 1 (×3).</li>
      <li><strong>Rouge/Noir, Pair/Impair, 1–18/19–36</strong> : paie 1 pour 1 (×2). Le 0 fait perdre ces paris.</li>
      <li>Survole une case pour voir les numéros couverts. Clic droit pour retirer la mise.</li></ul>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      let chip = 10, bets = {}, history = [], lastBets = null, spinning = false, alive = true, pending = null;

      panel.appendChild(ui.el(`<div class="field"><div class="field__head"><label>Jeton</label></div>
        <div class="chip-rack">${CHIPS.map((c) => `<button type="button" class="chip-btn" data-chip="${c.v}" aria-label="Jeton ${c.v}">${chipSvg(c.v)}</button>`).join('')}</div></div>`));
      const totalOut = ui.readout(panel, 'Mise totale', '0');
      const row1 = ui.el('<div class="panel__row"></div>');
      const row2 = ui.el('<div class="panel__row"></div>');
      panel.append(row1, row2);
      const undoBtn = ui.button(row1, ui.icon('rotate-ccw', 'i--sm') + 'Annuler', 'btn btn--ghost btn--sm');
      const clearBtn = ui.button(row1, ui.icon('trash-2', 'i--sm') + 'Effacer', 'btn btn--ghost btn--sm');
      const dblBtn = ui.button(row2, '×2', 'btn btn--ghost btn--sm');
      const rebetBtn = ui.button(row2, ui.icon('refresh-cw', 'i--sm') + 'Rejouer', 'btn btn--ghost btn--sm');
      const spinBtn = ui.button(panel, 'Lancer la roue');
      const lastOut = ui.readout(panel, 'Dernier gain', '—');

      stage.innerHTML = `
        <div class="stage__top"><div class="roulette-result"></div><div class="pill-row js-hist"></div></div>
        <div class="roulette">
          <div class="wheel-box"><canvas class="wheel-canvas"></canvas><div class="wheel-gloss"></div></div>
          <div class="rtable-wrap">${tableHtml()}</div>
        </div>`;
      const box = stage.querySelector('.wheel-box');
      const cv = stage.querySelector('.wheel-canvas');
      const g = cv.getContext('2d');
      const resultEl = stage.querySelector('.roulette-result');
      const histEl = stage.querySelector('.js-hist');
      const table = stage.querySelector('.rtable');
      const cells = [...table.querySelectorAll('.rcell')];
      const numCells = cells.filter((c) => c.dataset.n || c.dataset.bet === 'n:0');
      const chipBtns = [...panel.querySelectorAll('.chip-btn')];
      const undo = [];

      /* --- état de la roue --- */
      let S = 0, rotor = null, wheelAng = 0, ball = null, glowPocket = -1, raf = 0;
      function size() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        S = box.clientWidth;
        cv.width = cv.height = Math.round(S * dpr);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        rotor = buildRotor(Math.round(S * dpr));
        render();
      }
      function render() {
        const R = S / 2;
        g.clearRect(0, 0, S, S);
        g.save();
        g.translate(R, R);
        drawStator(g, R);
        g.save();
        g.rotate((wheelAng * Math.PI) / 180);
        g.drawImage(rotor, -R, -R, S, S);
        if (glowPocket >= 0) {
          const a0 = rad(glowPocket * POCKET - POCKET / 2), a1 = rad(glowPocket * POCKET + POCKET / 2);
          g.beginPath(); g.arc(0, 0, R * 0.745, a0, a1); g.arc(0, 0, R * 0.5, a1, a0, true); g.closePath();
          g.strokeStyle = '#c8ff3d'; g.lineWidth = 3; g.shadowColor = '#c8ff3d'; g.shadowBlur = 18; g.stroke(); g.shadowBlur = 0;
        }
        g.restore();
        if (ball) {
          const a = rad(ball.ang);
          const x = Math.cos(a) * R * ball.r, y = Math.sin(a) * R * ball.r, br = R * 0.036;
          g.beginPath(); g.arc(x + br * 0.3, y + br * 0.5, br, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,.45)'; g.fill();
          const bg = g.createRadialGradient(x - br * 0.4, y - br * 0.4, br * 0.1, x, y, br);
          bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.6, '#d9dce5'); bg.addColorStop(1, '#8a90a0');
          g.beginPath(); g.arc(x, y, br, 0, Math.PI * 2); g.fillStyle = bg; g.fill();
        }
        g.restore();
      }
      // roue qui tourne doucement au repos
      let idleT = performance.now();
      function idle(now) {
        if (!alive) return;
        if (!spinning) {
          const d = (now - idleT) * 0.006;
          wheelAng = (wheelAng + d) % 360;
          if (ball && ball.landed) ball.ang += d; // la bille reste dans sa case
          render();
        }
        idleT = now;
        raf = requestAnimationFrame(idle);
      }

      /* --- mises --- */
      const total = () => round2(Object.values(bets).reduce((a, b) => a + b, 0));
      function paint() {
        cells.forEach((c) => {
          const v = bets[c.dataset.bet];
          let st = c.querySelector('.chip-stack');
          if (v) {
            if (!st) { st = document.createElement('span'); st.className = 'chip-stack'; c.appendChild(st); }
            const layers = Math.min(4, 1 + Math.floor(Math.log10(v / chipFor(v).v + 1) * 3));
            st.innerHTML = Array.from({ length: layers }, (_, i) => `<i style="--k:${i}">${chipSvg(v)}</i>`).join('');
          } else if (st) st.remove();
        });
        chipBtns.forEach((b) => b.classList.toggle('on', +b.dataset.chip === chip));
        totalOut.set(`${ui.coin('coin--xs')} ${fmt(total())}`);
        const empty = total() === 0;
        [undoBtn, clearBtn, dblBtn].forEach((b) => (b.disabled = spinning || empty));
        rebetBtn.disabled = spinning || !lastBets;
        spinBtn.disabled = spinning || empty;
        chipBtns.forEach((b) => (b.disabled = spinning));
      }
      /** Un jeton s'envole du rack jusqu'à la case. */
      function flyChip(cell, v) {
        const from = (chipBtns.find((b) => +b.dataset.chip === v) || chipBtns[0]).getBoundingClientRect();
        const to = cell.getBoundingClientRect();
        const f = ui.el(`<div class="chip-fly">${chipSvg(v)}</div>`);
        f.style.left = from.left + from.width / 2 + 'px';
        f.style.top = from.top + from.height / 2 + 'px';
        ui._fxLayer().appendChild(f);
        const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
        f.animate([{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 60}px)) scale(1.1) rotate(180deg)`, offset: 0.5 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.62) rotate(360deg)` }], { duration: 380, easing: 'cubic-bezier(.3,.7,.4,1)' }).finished.then(() => f.remove());
      }
      function place(key, amount, cell) {
        if (spinning) return;
        if (total() + amount > wallet.get() + 1e-9) { ui.toast('Pas assez de DaveCoins pour ce jeton.', 'error'); sound.play('error'); return; }
        if (cell) flyChip(cell, amount);
        setTimeout(() => {
          bets[key] = round2((bets[key] || 0) + amount);
          undo.push({ key, amount });
          sound.play('chip');
          paint();
          const st = cell && cell.querySelector('.chip-stack');
          if (st) st.animate([{ transform: 'translate(-50%,-50%) scale(1.25)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 200, easing: 'cubic-bezier(.2,1.6,.4,1)' });
        }, cell ? 340 : 0);
      }

      panel.addEventListener('click', (e) => {
        const b = e.target.closest('[data-chip]');
        if (b && !b.disabled) { chip = +b.dataset.chip; sound.play('chip'); paint(); }
      });
      table.addEventListener('click', (e) => {
        const c = e.target.closest('.rcell');
        if (c) place(c.dataset.bet, chip, c);
      });
      table.addEventListener('contextmenu', (e) => {
        const c = e.target.closest('.rcell');
        if (!c || spinning) return;
        e.preventDefault();
        if (bets[c.dataset.bet]) { delete bets[c.dataset.bet]; sound.play('click'); paint(); }
      });
      // survol : montre les numéros couverts par le pari
      table.addEventListener('pointerover', (e) => {
        const c = e.target.closest('.rcell');
        numCells.forEach((n) => n.classList.toggle('cover', !!c && payoutMult(c.dataset.bet, +(n.dataset.n || 0)) > 0));
      });
      table.addEventListener('pointerleave', () => numCells.forEach((n) => n.classList.remove('cover')));
      undoBtn.addEventListener('click', () => {
        const u = undo.pop();
        if (!u) return;
        bets[u.key] = round2((bets[u.key] || 0) - u.amount);
        if (bets[u.key] <= 0) delete bets[u.key];
        sound.play('click');
        paint();
      });
      clearBtn.addEventListener('click', () => { bets = {}; undo.length = 0; sound.play('whoosh'); paint(); });
      dblBtn.addEventListener('click', () => {
        if (total() * 2 > wallet.get() + 1e-9) { ui.toast('Pas assez de DaveCoins pour doubler.', 'error'); return; }
        Object.keys(bets).forEach((k) => (bets[k] = round2(bets[k] * 2)));
        undo.length = 0;
        sound.play('bet');
        paint();
      });
      rebetBtn.addEventListener('click', () => {
        const t = Object.values(lastBets).reduce((a, b) => a + b, 0);
        if (t > wallet.get() + 1e-9) { ui.toast('Pas assez de DaveCoins pour rejouer.', 'error'); return; }
        bets = { ...lastBets };
        undo.length = 0;
        sound.play('bet');
        paint();
      });

      function resolve(n, stake, placed, silent) {
        let pay = 0;
        Object.entries(placed).forEach(([k, v]) => (pay += v * payoutMult(k, n)));
        pay = round2(pay);
        settle('roulette', stake, pay, { silent });
        return pay;
      }

      /* --- lancer --- */
      async function spin() {
        const stake = total();
        if (spinning || !stake) return;
        if (!wallet.place(stake)) return;
        spinning = true;
        lastBets = { ...bets };
        cells.forEach((c) => c.classList.remove('hit', 'lost'));
        resultEl.innerHTML = '';
        glowPocket = -1;
        paint();
        sound.play('whoosh');

        const n = ORDER[rng.int(0, 36)];
        const idx = ORDER.indexOf(n);
        pending = { n, stake, placed: { ...bets } };

        const T = 7000, TL = 5600;           // durée totale / moment où la bille tombe dans la case
        const W0 = wheelAng, WT = 360 * 1.6 + rng.float() * 120;
        const W = (t) => W0 + WT * (1 - Math.pow(1 - Math.min(1, t / T), 2.4));
        const BL = W(TL) + idx * POCKET;     // angle absolu de la case visée au moment de la chute
        const BT = 360 * 7;
        const bounces = [0.62, 0.72, 0.8, 0.87, 0.93];
        let bIdx = 0, lastTick = 0;
        const t0 = performance.now();
        ball = { ang: BL + BT, r: 0.85 };

        await new Promise((done) => {
          const step = (now) => {
            if (!alive) return done();
            const t = now - t0;
            wheelAng = W(t) % 360;
            if (t < TL) {
              const u = t / TL;
              const travel = BT * (1 - Math.pow(1 - u, 2));
              const angAbs = BL + BT - travel;
              // la bille quitte la piste puis rebondit vers les cases
              let r = 0.85;
              if (u > 0.55) {
                const k = (u - 0.55) / 0.45;
                r = 0.85 - k * 0.29 + Math.abs(Math.sin(k * Math.PI * 5)) * 0.06 * (1 - k);
              }
              ball = { ang: angAbs + (u > 0.55 ? Math.sin(u * 40) * 2 * (1 - u) : 0), r };
              if (bIdx < bounces.length && u >= bounces[bIdx]) { bIdx++; sound.play('ballDrop'); }
              const speed = 1 - u;
              if (now - lastTick > 40 + (1 - speed) * 160) { lastTick = now; sound.play('ball', { v: speed * 0.06 }); }
            } else {
              if (!ball.landed) { ball.landed = true; sound.play('ballDrop'); }
              ball = { ang: W(t) + idx * POCKET, r: 0.56, landed: true };
            }
            render();
            if (t < T) requestAnimationFrame(step); else done();
          };
          requestAnimationFrame(step);
        });
        if (!alive) return;

        pending = null;
        glowPocket = idx;
        render();
        const pay = resolve(n, stake, lastBets, true);
        resultEl.innerHTML = `<span class="rnum big ${color(n)}">${n}</span>`;
        history.unshift(n);
        histEl.innerHTML = history.slice(0, 10).map((h) => `<span class="rnum ${color(h)}">${h}</span>`).join('');
        lastOut.set(pay > 0 ? `<span class="pos">+${fmt(pay)}</span>` : '0');

        // gagnants : éclats + montant ; perdants : jetons balayés
        let delay = 0;
        cells.forEach((c) => {
          const k = c.dataset.bet;
          const m = payoutMult(k, n);
          if (m > 0) c.classList.add('hit');
          if (!lastBets[k]) return;
          if (m > 0) {
            setTimeout(() => { if (!alive) return; ui.burst(c, { n: 16 }); ui.floatText(c, '+' + fmt(lastBets[k] * m)); sound.play('coin'); }, delay);
            delay += 140;
          } else {
            c.classList.add('lost');
          }
        });
        if (pay > 0) { sound.play('win', { x: pay / stake }); ui.result(stage, { win: true, mult: pay / stake, amount: pay }); }
        else { sound.play('lose'); ui.result(stage, { win: false, label: String(n) }); }
        await sleep(900);
        bets = {};
        undo.length = 0;
        spinning = false;
        cells.forEach((c) => c.classList.remove('lost'));
        paint();
      }
      spinBtn.addEventListener('click', spin);
      const onKey = (e) => { if (e.code === 'Space' && !e.target.closest('input')) { e.preventDefault(); spin(); } };
      window.addEventListener('keydown', onKey);
      window.addEventListener('resize', size);
      size();
      if (document.fonts) document.fonts.ready.then(() => alive && size());
      paint();
      raf = requestAnimationFrame(idle);

      return () => {
        alive = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', size);
        if (pending) resolve(pending.n, pending.stake, pending.placed, true);
      };
    }
  });

  // Mini-roue pour la carte du lobby (dessinée quand la carte apparaît)
  DP.on('lobby', () => document.querySelectorAll('.js-wheel-art').forEach((c) => {
    const g = c.getContext('2d');
    const R = c.width / 2;
    g.save(); g.translate(R, R); drawStator(g, R); g.rotate(0.3); g.drawImage(buildRotor(c.width), -R, -R); g.restore();
  }));
})();
