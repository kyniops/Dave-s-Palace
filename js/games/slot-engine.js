/* Moteur de DaveMachine : 5 rouleaux × 3 rangées, 20 lignes, wild, scatter et free spins.
 * Fichier sans dépendance pour pouvoir le simuler sous Node (vérification du RTP).
 */
(function (root) {
  'use strict';

  // pays = gains en multiple de la mise PAR LIGNE pour 3, 4, 5 symboles alignés depuis la gauche
  const SYMBOLS = {
    wild:      { kind: 'wild',    img: 'jpz.png',         pays: [70, 350, 1400] },
    scat:      { kind: 'scatter', img: 'jpz2.jpg' },
    casino:    { kind: 'high',    img: 'casino.png',      pays: [60, 210, 800] },
    lucasco:   { kind: 'high',    img: 'lucasco.jpg',     pays: [45, 160, 580] },
    olmanaura: { kind: 'high',    img: 'olmanaura.jpg',   pays: [45, 160, 580] },
    tddam:     { kind: 'mid',     img: 'tddam.jpg',       pays: [30, 90, 320] },
    billy:     { kind: 'mid',     img: 'billy.jpg',       pays: [30, 90, 320] },
    A:         { kind: 'low',     glyph: 'A',  pays: [14, 40, 140] },
    K:         { kind: 'low',     glyph: 'K',  pays: [14, 40, 140] },
    Q:         { kind: 'low',     glyph: 'Q',  pays: [12, 35, 115] },
    J:         { kind: 'low',     glyph: 'J',  pays: [9, 28, 90] },
    T:         { kind: 'low',     glyph: '10', pays: [7, 22, 70] }
  };

  // Nombre d'exemplaires de chaque symbole sur chaque rouleau (rouleau 1 → 5).
  // Les lettres sont majoritaires. RTP 96,5 % (calcul exact), ~35 % de tours gagnants, bonus ≈ 1 tour sur 153.
  const WEIGHTS = {
    wild:      [0, 5, 5, 5, 5],
    scat:      [2, 2, 2, 2, 2],
    casino:    [3, 3, 3, 3, 3],
    lucasco:   [3, 3, 3, 3, 3],
    olmanaura: [3, 3, 3, 3, 3],
    tddam:     [4, 4, 4, 4, 4],
    billy:     [4, 4, 4, 4, 4],
    A:         [8, 8, 8, 8, 8],
    K:         [8, 8, 8, 8, 8],
    Q:         [9, 9, 9, 9, 9],
    J:         [9, 9, 9, 9, 9],
    T:         [9, 9, 9, 9, 9]
  };

  const LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
    [1, 2, 1, 0, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
    [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 0, 2, 0]
  ];

  // Scatters : free spins accordés et gain direct (× mise totale) selon le nombre visible
  const SCATTER = { 3: { spins: 15, pay: 2 }, 4: { spins: 20, pay: 10 }, 5: { spins: 25, pay: 50 } };
  const FS_MULT = 2;         // tous les gains sont doublés pendant les free spins
  
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

  /** Tire une position d'arrêt par rouleau → grille [rouleau][rangée]. */
  function spin(rand) {
    const stops = STRIPS.map((s) => Math.floor(rand() * s.length));
    return { stops, grid: stops.map((stop, r) => visible(r, stop)) };
  }
  function visible(r, stop) {
    const s = STRIPS[r], L = s.length;
    return [s[(stop - 1 + L) % L], s[stop], s[(stop + 1) % L]];
  }

  /** Gain d'une suite de 5 symboles sur une ligne (wild remplace tout sauf le scatter). */
  function linePay(syms) {
    let best = { sym: null, count: 0, pay: 0 };
    // 1) suite de wilds pure
    let w = 0;
    while (w < 5 && syms[w] === 'wild') w++;
    if (w >= 3) best = { sym: 'wild', count: w, pay: SYMBOLS.wild.pays[w - 3] };
    // 2) premier symbole « normal », complété par les wilds
    const base = syms.find((s) => s !== 'wild');
    if (base && base !== 'scat') {
      let c = 0;
      while (c < 5 && (syms[c] === base || syms[c] === 'wild')) c++;
      if (c >= 3) {
        const p = SYMBOLS[base].pays[c - 3];
        if (p > best.pay) best = { sym: base, count: c, pay: p };
      }
    }
    return best;
  }

  /** Évalue une grille. bet = mise totale ; mult = multiplicateur (×2 en free spins). */
  function evaluate(grid, bet, mult = 1) {
    const lineBet = bet / LINES.length;
    const lines = [];
    LINES.forEach((ln, i) => {
      const syms = ln.map((row, reel) => grid[reel][row]);
      const r = linePay(syms);
      if (r.pay > 0) lines.push({ line: i, sym: r.sym, count: r.count, amount: r.pay * lineBet * mult, cells: ln.slice(0, r.count).map((row, reel) => [reel, row]) });
    });
    const scatCells = [];
    grid.forEach((col, reel) => col.forEach((s, row) => { if (s === 'scat') scatCells.push([reel, row]); }));
    const sc = SCATTER[Math.min(5, scatCells.length)];
    const scatter = { count: scatCells.length, cells: scatCells, pay: sc ? sc.pay * bet * mult : 0, spins: sc ? sc.spins : 0 };
    const total = lines.reduce((a, l) => a + l.amount, 0) + scatter.pay;
    return { lines, scatter, total: Math.round(total * 100) / 100 };
  }

  const api = { SYMBOLS, WEIGHTS, LINES, SCATTER, FS_MULT, STRIPS, spin, visible, evaluate, linePay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DaveSlot = api;
})(typeof window !== 'undefined' ? window : globalThis);
