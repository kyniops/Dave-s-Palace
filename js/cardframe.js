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
    let shards = '', sil = '', dust = '', streaks = '';
    if (!compact) {
      // éclats de cristal qui jaillissent à gauche et à droite : tailles, angles et facettes variés, en grappes
      for (let side = 0; side < 2; side++) {
        const base = side ? x1 : x0, dir = side ? 1 : -1;
        let y = OY + 30 + rnd() * 20;
        while (y < OY + CH - 40) {
          const big = rnd() < 0.4;
          const ang = (12 + rnd() * 30) * Math.PI / 180;           // pointe vers le haut et l'extérieur
          // longueur limitée pour que la pointe reste dans l'image du cadre
          const len = Math.min(big ? 38 + rnd() * 26 : 12 + rnd() * 22, 46 / Math.cos(ang));
          const w = big ? 9 + rnd() * 7 : 4 + rnd() * 5;
          const tx = base + dir * Math.cos(ang) * len, ty = y - Math.sin(ang) * len;
          const nx = Math.sin(ang) * w * dir, ny = Math.cos(ang) * w;  // épaisseur du cristal
          const mid = 0.35 + rnd() * 0.25;
          const mx = base + (tx - base) * mid, my = y + (ty - y) * mid;
          // cristal taillé : face haute éclairée, face basse dans l'ombre, séparées par l'arête centrale
          const f = (v) => v.toFixed(1);
          const side_ = side ? 'R' : 'L';
          const b1 = `${base},${f(y - w * 0.6)}`, b2 = `${base},${f(y + w * 0.6)}`, c0 = `${base},${f(y)}`;
          const s1 = `${f(mx - nx)},${f(my - ny)}`, s2 = `${f(mx + nx)},${f(my + ny)}`, t = `${f(tx)},${f(ty)}`;
          const op = (0.75 + rnd() * 0.25).toFixed(2);
          sil += `<polygon points="${b1} ${s1} ${t} ${s2} ${b2}" fill="${paint}"/>`;
          shards += `<g opacity="${op}">
            <polygon points="${b1} ${s1} ${t} ${c0}" fill="${paint}"/><polygon points="${b1} ${s1} ${t} ${c0}" fill="url(#hl${side_})"/>
            <polygon points="${c0} ${t} ${s2} ${b2}" fill="${paint}"/><polygon points="${c0} ${t} ${s2} ${b2}" fill="url(#dk${side_})"/>
            <polygon points="${b1} ${s1} ${t} ${s2} ${b2}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".5"/>
            <polygon points="${c0} ${f((mx - nx + mx) / 2)},${f((my - ny + my) / 2)} ${t}" fill="#fff" opacity=".28"/>
            <polyline points="${c0} ${t}" fill="none" stroke="#fff" stroke-width=".8" opacity=".85"/>
            <polyline points="${b1} ${s1} ${t}" fill="none" stroke="#fff" stroke-width=".55" opacity=".6"/>
          </g>`;
          if (big) { // éclat de lumière à la pointe
            shards += `<path d="M${f(tx)},${f(ty - 4)} L${f(tx + 1)},${f(ty - 1)} L${f(tx + 4)},${f(ty)} L${f(tx + 1)},${f(ty + 1)} L${f(tx)},${f(ty + 4)} L${f(tx - 1)},${f(ty + 1)} L${f(tx - 4)},${f(ty)} L${f(tx - 1)},${f(ty - 1)} Z" fill="#fff" opacity=".9"/>`;
          }
          if (big && rnd() < 0.6) { // petit éclat secondaire collé au grand, en deux facettes
            const l2 = len * (0.35 + rnd() * 0.2);
            const p1 = `${base},${f(y + 5)}`, p2 = `${f(base + dir * l2)},${f(y + 1 - l2 * 0.3)}`, p3 = `${f(base + dir * l2 * 0.4)},${f(y + 11)}`, pm = `${base},${f(y + 8)}`;
            sil += `<polygon points="${p1} ${p2} ${p3}" fill="${paint}"/>`;
            shards += `<g opacity=".85"><polygon points="${p1} ${p2} ${pm}" fill="${paint}"/><polygon points="${p1} ${p2} ${pm}" fill="url(#hl${side_})"/>
              <polygon points="${pm} ${p2} ${p3}" fill="${paint}"/><polygon points="${pm} ${p2} ${p3}" fill="url(#dk${side_})"/>
              <polyline points="${pm} ${p2}" fill="none" stroke="#fff" stroke-width=".6" opacity=".75"/></g>`;
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
        <linearGradient id="hlL" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".45" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".8"/></linearGradient>
        <linearGradient id="hlR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".45" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".8"/></linearGradient>
        <linearGradient id="dkL" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".65"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>
        <linearGradient id="dkR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".65"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>
        <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4"/></filter>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.2" result="b1"/><feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b2"/>
          <feMerge><feMergeNode in="b2"/><feMergeNode in="b1"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <g opacity=".9">${streaks}</g>
      <g filter="url(#soft)" opacity=".8">${sil}</g>
      ${shards}
      <g filter="url(#glow)">${dust}${frame}</g>
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
