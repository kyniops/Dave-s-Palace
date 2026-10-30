/* Texture de planète générée (géante gazeuse : bandes + turbulences), posée en variable CSS
 * --planet-tex. Les planètes du site la font défiler pour donner l'impression qu'elles tournent.
 */
(function () {
  'use strict';
  const W = 1024, H = 512;

  // Bruit de valeur 2D lissé, répétable horizontalement (la texture boucle sans couture)
  function makeNoise(seed, period) {
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const grid = Array.from({ length: 129 }, () => Array.from({ length: period }, rnd));
    const fade = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi);
      const g = (gx, gy) => grid[Math.min(128, Math.max(0, gy))][((gx % period) + period) % period];
      const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
  }

  function build() {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const img = g.createImageData(W, H);
    const n1 = makeNoise(7, 24), n2 = makeNoise(13, 64), n3 = makeNoise(29, 128);
    // palette des bandes (du haut vers le bas) : violet nuit, prune, rouille, orange signal, sable
    const pal = [[22, 15, 34], [48, 26, 58], [92, 38, 52], [168, 62, 28], [230, 118, 54], [236, 178, 118], [120, 52, 40], [40, 24, 48], [18, 13, 28]];
    const lerp = (a, b, t) => a + (b - a) * t;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W, v = y / H;
        // turbulence : déforme la position verticale des bandes
        const turb = (n1(u * 24, v * 10) - 0.5) * 0.05 + (n2(u * 64, v * 40) - 0.5) * 0.018;
        let band = (v + turb) * (pal.length - 1) * 2.6;
        band = ((band % (pal.length - 1)) + (pal.length - 1)) % (pal.length - 1);
        const i = Math.floor(band), t = band - i;
        const c0 = pal[i], c1 = pal[i + 1];
        const fine = 0.8 + n3(u * 128, v * 120) * 0.32; // grain fin
        // fins filets de nuages clairs le long des bandes
        const streak = Math.pow(Math.max(0, Math.sin((v + turb * 1.6) * 260)), 18) * 0.35;
        const o = (y * W + x) * 4;
        img.data[o] = Math.min(255, lerp(c0[0], c1[0], t) * fine + streak * 255);
        img.data[o + 1] = Math.min(255, lerp(c0[1], c1[1], t) * fine + streak * 210);
        img.data[o + 2] = Math.min(255, lerp(c0[2], c1[2], t) * fine + streak * 170);
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // grande tempête ovale
    const sx = W * 0.62, sy = H * 0.58;
    const grad = g.createRadialGradient(sx, sy, 2, sx, sy, 46);
    grad.addColorStop(0, 'rgba(255,200,150,.85)'); grad.addColorStop(0.5, 'rgba(210,90,40,.6)'); grad.addColorStop(1, 'rgba(120,40,30,0)');
    g.save(); g.translate(sx, sy); g.scale(2.2, 1); g.translate(-sx, -sy);
    g.fillStyle = grad; g.beginPath(); g.arc(sx, sy, 46, 0, Math.PI * 2); g.fill(); g.restore();
    return cv.toDataURL('image/jpeg', 0.86);
  }

  let url = null;
  try { url = sessionStorage.getItem('dp_planet_tex2'); } catch { /* ignore */ }
  if (!url) {
    url = build();
    try { sessionStorage.setItem('dp_planet_tex2', url); } catch { /* quota : on régénère la prochaine fois */ }
  }
  document.documentElement.style.setProperty('--planet-tex', `url(${url})`);
})();
