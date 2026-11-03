/* Moteur de DaveMachine : 5 rouleaux × 3 rangées, 20 lignes, wild, scatter, free spins et Hold & Win.
 * Le serveur (supabase/machine2.sql) applique exactement les mêmes règles ; ce fichier sert à l'affichage,
 * à la version hors ligne et à la simulation du RTP sous Node.
 *
 *  - Free spins : multiplicateur qui grimpe (+1 après chaque tour gagnant, ×MULT_MAX au plus) et wilds collants.
 *  - Hold & Win : 6 DaveCoins ou plus → les pièces restent, 3 relances (remises à 3 à chaque nouvelle pièce).
 *    Pièces : valeur × la mise, ou jackpot MINI / MINEUR / MAJEUR ; les 15 cases remplies = GRAND (jackpot global).
 */
(function (root) {
  'use strict';

  // pays = gains en multiple de la mise PAR LIGNE pour 3, 4, 5 symboles alignés depuis la gauche
  const SYMBOLS = {
    wild:      { kind: 'wild',    img: 'jpz.png',         pays: [70, 350, 1400] },
    scat:      { kind: 'scatter', img: 'jpz2.jpg' },
    coin:      { kind: 'coin',    img: 'davecoin.png' },
    casino:    { kind: 'high',    img: 'casino.png',      pays: [60, 210, 800] },
    lucasco:   { kind: 'high',    img: 'lucasco.jpg',     pays: [45, 160, 580] },
    olmanaura: { kind: 'high',    img: 'olmanaura.jpg',   pays: [45, 160, 580] },
    tddam:     { kind: 'mid',     img: 'tddam.jpg',       pays: [30, 90, 320] },
    billy:     { kind: 'mid',     img: 'billy.jpg',       pays: [30, 90, 320] },
    petitbonnin: { kind: 'low',     img: 'petitbonnin.jpg', pays: [14, 40, 140] },
    linkay:    { kind: 'low',     img: 'linkay.jpg',      pays: [14, 40, 140] },
    yohan:     { kind: 'low',     img: 'yohan.jpg',       pays: [12, 35, 115] },
    carl:      { kind: 'low',     img: 'carl.jpg',        pays: [9, 28, 90] },
    tdam2:     { kind: 'low',     img: 'tdam2.jpg',       pays: [7, 22, 70] }
  };

  // Nombre d'exemplaires de chaque symbole sur chaque rouleau (rouleau 1 → 5).
  const WEIGHTS = {
    wild:      [0, 5, 5, 5, 5],
    scat:      [2, 3, 3, 3, 2],
    coin:      [9, 9, 9, 9, 9],
    casino:    [3, 3, 3, 3, 3],
    lucasco:   [3, 3, 3, 3, 3],
    olmanaura: [3, 3, 3, 3, 3],
    tddam:     [4, 4, 4, 4, 4],
    billy:     [4, 4, 4, 4, 4],
    petitbonnin:[8, 8, 8, 8, 8],
    linkay:    [8, 8, 8, 8, 8],
    yohan:     [9, 9, 9, 9, 9],
    carl:      [9, 9, 9, 9, 9],
    tdam2:     [9, 9, 9, 9, 9]
  };

  const LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
    [1, 2, 1, 0, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
    [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 0, 2, 0]
  ];

  // Scatters : free spins accordés et gain direct (× mise totale) selon le nombre visible
  const SCATTER = { 3: { spins: 8, pay: 1 }, 4: { spins: 9, pay: 10 }, 5: { spins: 11, pay: 50 } };
  const MULT_MAX = 4;       // free spins : ×1 au départ, +1 après chaque tour gagnant
  // Hold & Win
  const HW = { trigger: 6, respins: 3, land: 0.025 };
  // valeurs des DaveCoins (× la mise totale) et leurs poids ; mini / minor / major = jackpots fixes
  const COIN_VALUES = [[1, 46], [2, 27], [3, 15], [5, 10], [8, 5], [10, 3], [15, 2], ['mini', 2], ['minor', 0.6], ['major', 0.12]];
  const JACKPOTS = { mini: 10, minor: 30, major: 100 }; // × la mise ; GRAND = jackpot global (15 cases)
  const JP_NAMES = { mini: 'Mini', minor: 'Mineur', major: 'Majeur', grand: 'Grand' };
  const GRAND_FULL_BET = 500; // le GRAND entier à partir de cette mise, une part proportionnelle en dessous

  /** Générateur pseudo-aléatoire à graine (les rouleaux sont identiques à chaque chargement). */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Construit les 5 bandes. Les scatters sont espacés d'au moins 3 cases : jamais 2 visibles sur un même rouleau. */
  function buildStrips() {
    const rnd = mulberry32(0xda7e);
    const strips = [];
    for (let r = 0; r < 5; r++) {
      const others = [];
      Object.keys(WEIGHTS).forEach((k) => { if (k !== 'scat') for (let i = 0; i < WEIGHTS[k][r]; i++) others.push(k); });
      for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
      const n = WEIGHTS.scat[r];
      const strip = others.slice();
      const gap = Math.floor(strip.length / n);
      for (let s = 0; s < n; s++) strip.splice(s * (gap + 1) + Math.floor(gap / 2), 0, 'scat');
      strips.push(strip);
    }
    return strips;
  }
  const STRIPS = buildStrips();
  // pendant les free spins : pas de DaveCoins, et moins de wilds (ils restent collés, donc ils s'accumulent)
  const FS_WILDS = [0, 1, 1, 1, 1];
  const STRIPS_FS = STRIPS.map((s, r) => { let keep = FS_WILDS[r]; return s.filter((k) => (k === 'coin' ? false : k === 'wild' ? keep-- > 0 : true)); });

  /** Tire une position d'arrêt par rouleau → grille [rouleau][rangée]. */
  function spin(rand, strips = STRIPS) {
    const stops = strips.map((s) => Math.floor(rand() * s.length));
    return { stops, grid: stops.map((stop, r) => visible(r, stop, strips)) };
  }
  function visible(r, stop, strips = STRIPS) {
    const s = strips[r], L = s.length;
    return [s[(stop - 1 + L) % L], s[stop], s[(stop + 1) % L]];
  }

  /** Gain d'une suite de 5 symboles sur une ligne (wild remplace tout sauf le scatter et le DaveCoin). */
  function linePay(syms) {
    let best = { sym: null, count: 0, pay: 0 };
    let w = 0;
    while (w < 5 && syms[w] === 'wild') w++;
    if (w >= 3) best = { sym: 'wild', count: w, pay: SYMBOLS.wild.pays[w - 3] };
    const base = syms.find((s) => s !== 'wild');
    if (base && base !== 'scat' && base !== 'coin') {
      let c = 0;
      while (c < 5 && (syms[c] === base || syms[c] === 'wild')) c++;
      if (c >= 3) {
        const p = SYMBOLS[base].pays[c - 3];
        if (p > best.pay) best = { sym: base, count: c, pay: p };
      }
    }
    return best;
  }

  /** Évalue une grille. bet = mise totale ; mult = multiplicateur (free spins). */
  function evaluate(grid, bet, mult = 1) {
    const lineBet = bet / LINES.length;
    const lines = [];
    LINES.forEach((ln, i) => {
      const syms = ln.map((row, reel) => grid[reel][row]);
      const r = linePay(syms);
      if (r.pay > 0) lines.push({ line: i, sym: r.sym, count: r.count, amount: r.pay * lineBet * mult, cells: ln.slice(0, r.count).map((row, reel) => [reel, row]) });
    });
    const scatCells = [], coinCells = [];
    grid.forEach((col, reel) => col.forEach((s, row) => { if (s === 'scat') scatCells.push([reel, row]); if (s === 'coin') coinCells.push([reel, row]); }));
    const sc = SCATTER[Math.min(5, scatCells.length)];
    const scatter = { count: scatCells.length, cells: scatCells, pay: sc ? sc.pay * bet * mult : 0, spins: sc ? sc.spins : 0 };
    const total = lines.reduce((a, l) => a + l.amount, 0) + scatter.pay;
    return { lines, scatter, coins: coinCells, hw: coinCells.length >= HW.trigger, total: Math.round(total * 100) / 100 };
  }

  /** Valeur d'une pièce tirée au hasard. */
  const COIN_TOTAL = COIN_VALUES.reduce((a, [, w]) => a + w, 0);
  function coinValue(rand) {
    let r = rand() * COIN_TOTAL;
    for (const [v, w] of COIN_VALUES) { r -= w; if (r < 0) return v; }
    return COIN_VALUES[0][0];
  }
  /** Gain d'une pièce (× la mise). */
  const coinX = (v) => (typeof v === 'number' ? v : JACKPOTS[v] || 0);

  /** Hold & Win : start = [[reel, row, valeur], ...]. Renvoie les relances et le gain (× la mise), GRAND à part. */
  function holdWin(rand, start) {
    const held = new Map(start.map(([r, w, v]) => [r * 3 + w, v]));
    const steps = [];
    let left = HW.respins;
    while (left > 0 && held.size < 15) {
      const fresh = [];
      for (let i = 0; i < 15; i++) if (!held.has(i) && rand() < HW.land) { const v = coinValue(rand); held.set(i, v); fresh.push([Math.floor(i / 3), i % 3, v]); }
      steps.push(fresh);
      left = fresh.length ? HW.respins : left - 1;
    }
    let x = 0;
    const jps = [];
    held.forEach((v) => { x += coinX(v); if (typeof v !== 'number') jps.push(v); });
    return { steps, cells: [...held.entries()].map(([i, v]) => [Math.floor(i / 3), i % 3, v]), x, jackpots: jps, grand: held.size === 15 };
  }

  /** Free spins : multiplicateur qui grimpe et wilds collants. Renvoie chaque tour. */
  function freeSpins(rand, bet, spins) {
    const out = [];
    const sticky = new Set();
    let mult = 1, left = spins, n = 0;
    while (left > 0 && n < 300) {
      left--; n++;
      const grid = spin(rand, STRIPS_FS).grid;
      grid.forEach((col, r) => col.forEach((k, w) => { if (k === 'wild') sticky.add(r * 3 + w); }));
      sticky.forEach((i) => { grid[Math.floor(i / 3)][i % 3] = 'wild'; });
      const res = evaluate(grid, bet, mult);
      out.push({ grid, mult, total: res.total, spins: res.scatter.spins, sticky: [...sticky] });
      left += res.scatter.spins;
      if (res.total > 0) mult = Math.min(MULT_MAX, mult + 1);
    }
    return out;
  }

  const api = { SYMBOLS, WEIGHTS, FS_WILDS, LINES, SCATTER, MULT_MAX, HW, COIN_VALUES, JACKPOTS, JP_NAMES, GRAND_FULL_BET, STRIPS, STRIPS_FS,
    spin, visible, evaluate, linePay, coinValue, coinX, holdWin, freeSpins, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DaveSlot = api;
})(typeof window !== 'undefined' ? window : globalThis);
