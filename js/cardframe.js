/* Cadres de cartes néon : double filet biseauté, gemmes octogonales, losange central,
 * éclats de cristal sur les côtés, poussière et traits lumineux. Un SVG par rareté,
 * généré une seule fois puis réutilisé en image de fond (data URI).
 */
(function () {
  'use strict';
  // Zone de la carte dans le cadre : la carte fait 250 × 350, le cadre déborde pour les éclats.
  const OX = 40, OY = 25, W = 330, H = 400, CW = 250, CH = 350;
  const cache = {};

  // Générateur pseudo-aléatoire à graine : les éclats ont toujours la même forme.
  function seeded(seed) {
    return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  }
  const chamfer = (x0, y0, x1, y1, c) => `M${x0 + c},${y0} H${x1 - c} L${x1},${y0 + c} V${y1 - c} L${x1 - c},${y1} H${x0 + c} L${x0},${y1 - c} V${y0 + c} Z`;
  const octagon = (cx, cy, r) => {
    const k = r * 0.414;
    return `M${cx - k},${cy - r} H${cx + k} L${cx + r},${cy - k} V${cy + k} L${cx + k},${cy + r} H${cx - k} L${cx - r},${cy + k} V${cy - k} Z`;
  };

  function build(color, rainbow, compact) {
    const rnd = seeded(rainbow ? 97 : 31);
    const paint = rainbow ? 'url(#rb)' : color;
    const x0 = OX + 10, y0 = OY + 10, x1 = OX + CW - 10, y1 = OY + CH - 10;
    let shards = '', dust = '', streaks = '';
    if (!compact) {
      // éclats de cristal qui jaillissent à gauche et à droite : tailles, angles et facettes variés, en grappes
      for (let side = 0; side < 2; side++) {
        const base = side ? x1 : x0, dir = side ? 1 : -1;
        let y = OY + 30 + rnd() * 20;
        while (y < OY + CH - 40) {
          const big = rnd() < 0.3;
          const len = big ? 30 + rnd() * 22 : 8 + rnd() * 20;
          const w = big ? 7 + rnd() * 6 : 3 + rnd() * 5;
          const ang = (12 + rnd() * 30) * Math.PI / 180;           // pointe vers le haut et l'extérieur
          const tx = base + dir * Math.cos(ang) * len, ty = y - Math.sin(ang) * len;
          const nx = Math.sin(ang) * w * dir, ny = Math.cos(ang) * w;  // épaisseur du cristal
          const mid = 0.35 + rnd() * 0.25;
          const mx = base + (tx - base) * mid, my = y + (ty - y) * mid;
          const pts = `${base},${y - w * 0.6} ${(mx - nx).toFixed(1)},${(my - ny).toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)} ${(mx + nx).toFixed(1)},${(my + ny).toFixed(1)} ${base},${y + w * 0.6}`;
          shards += `<polygon points="${pts}" fill="${paint}" opacity="${(0.5 + rnd() * 0.45).toFixed(2)}"/>`;
          shards += `<polyline points="${base},${y} ${mx.toFixed(1)},${my.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}" fill="none" stroke="#fff" stroke-width=".7" opacity=".75"/>`;
          if (big && rnd() < 0.6) { // petit éclat secondaire collé au grand
            const l2 = len * (0.35 + rnd() * 0.2);
            shards += `<polygon points="${base},${y + 5} ${(base + dir * l2).toFixed(1)},${(y + 1 - l2 * 0.3).toFixed(1)} ${(base + dir * l2 * 0.4).toFixed(1)},${(y + 11).toFixed(1)}" fill="${paint}" opacity=".6"/>`;
          }
          y += big ? 26 + rnd() * 26 : 9 + rnd() * 22;
        }
      }
      // poussière de cristal autour du cadre
      for (let i = 0; i < 70; i++) {
        const side = rnd() < 0.5;
        const x = side ? x0 - 4 - rnd() * 34 : x1 + 4 + rnd() * 34;
        const y = OY + rnd() * CH;
        const s = 1 + rnd() * 2.6;
        dust += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" fill="${paint}" opacity="${(0.3 + rnd() * 0.6).toFixed(2)}" transform="rotate(45 ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
      }
    }
    // traits lumineux en diagonale sur la carte
    for (let i = 0; i < 9; i++) {
      const x = OX + rnd() * CW, y = OY + rnd() * CH, l = 20 + rnd() * 60;
      streaks += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + l * 0.55).toFixed(1)}" y2="${(y - l).toFixed(1)}" stroke="${paint}" stroke-width="${(0.6 + rnd() * 1.4).toFixed(1)}" opacity="${(0.12 + rnd() * 0.25).toFixed(2)}"/>`;
    }
    // créneaux le long des bords haut et bas (comme sur le modèle)
    let notches = '';
    for (let i = 0; i < 5; i++) {
      const x = OX + 70 + i * 24;
      notches += `<path d="M${x},${y0 + 4} h14 l-3,4 h-8 z" fill="${paint}" opacity=".8"/>`;
      notches += `<path d="M${x},${y1 - 4} h14 l-3,-4 h-8 z" fill="${paint}" opacity=".8"/>`;
    }

    const gems = [[OX + 28, OY + 28], [OX + CW - 28, OY + 28], [OX + 28, OY + CH - 28], [OX + CW - 28, OY + CH - 28]]
      .map(([cx, cy]) => `<path d="${octagon(cx, cy, 17)}" fill="#05060a" stroke="${paint}" stroke-width="2.5"/><path d="${octagon(cx, cy, 11)}" fill="none" stroke="${paint}" stroke-width="1" opacity=".6"/>`).join('');
    const dx = OX + CW / 2, dy = y1;
    const diamond = `<path d="M${dx},${dy - 13} L${dx + 11},${dy} L${dx},${dy + 13} L${dx - 11},${dy} Z" fill="${paint}"/><path d="M${dx},${dy - 7} L${dx + 5},${dy} L${dx},${dy + 7} L${dx - 5},${dy} Z" fill="#fff" opacity=".85"/>`;
    const win = `<path d="${chamfer(OX + 22, OY + 22, OX + CW - 22, OY + 244, 8)}" fill="none" stroke="${paint}" stroke-width="1.2" opacity=".75"/>`;

    const frame = `
      <path d="${chamfer(x0, y0, x1, y1, 18)}" fill="none" stroke="${paint}" stroke-width="3.2"/>
      <path d="${chamfer(x0 + 6, y0 + 6, x1 - 6, y1 - 6, 13)}" fill="none" stroke="${paint}" stroke-width="1.2" opacity=".8"/>
      <path d="${chamfer(x0 - 3, y0 - 3, x1 + 3, y1 + 3, 20)}" fill="none" stroke="#fff" stroke-width=".7" opacity=".55"/>
      ${notches}${win}${gems}${diamond}`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
      <defs>
        <linearGradient id="rb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#4cc9ff"/><stop offset=".25" stop-color="#b06bff"/><stop offset=".5" stop-color="#ff5ad1"/><stop offset=".75" stop-color="#ffc145"/><stop offset="1" stop-color="#5dff8f"/>
        </linearGradient>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.2" result="b1"/><feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b2"/>
          <feMerge><feMergeNode in="b2"/><feMergeNode in="b1"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <g opacity=".9">${streaks}</g>
      <g filter="url(#glow)">${shards}${dust}${frame}</g>
    </svg>`;
    return 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' ')) + '")';
  }

  /** Image de fond du cadre pour une rareté ({ c, rainbow }). compact = sans éclats (grilles serrées). */
  DP.cardFrame = (r, compact = false) => {
    const k = r.label + (compact ? ':c' : '');
    if (!cache[k]) cache[k] = build(r.c, !!r.rainbow, compact);
    return cache[k];
  };
  DP.cardFrame.box = { OX, OY, W, H, CW, CH };
})();
