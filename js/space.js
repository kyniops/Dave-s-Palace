/* Fond spatial : champ d'étoiles en 3 plans (parallaxe), scintillement et étoiles filantes. */
(function () {
  'use strict';
  const canvas = document.createElement('canvas');
  canvas.className = 'space';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, dpr = 1, stars = [], meteors = [], nextMeteor = 0;
  let mx = 0, my = 0, px = 0, py = 0; // parallaxe souris (lissée)

  const LAYERS = [
    { n: 0.00018, size: [0.4, 0.9], speed: 0.004, alpha: [0.25, 0.55], depth: 4 },
    { n: 0.00008, size: [0.8, 1.4], speed: 0.009, alpha: [0.45, 0.8], depth: 10 },
    { n: 0.000022, size: [1.3, 2.1], speed: 0.018, alpha: [0.7, 1], depth: 22 }
  ];
  // Quelques étoiles teintées pour éviter le blanc uniforme
  const TINTS = ['255,255,255', '255,255,255', '255,255,255', '226,232,245', '245,240,230'];
  const rand = (a, b) => a + Math.random() * (b - a);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = [];
    LAYERS.forEach((L, li) => {
      const count = Math.round(W * H * L.n);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * W, y: Math.random() * H, li,
          r: rand(L.size[0], L.size[1]), a: rand(L.alpha[0], L.alpha[1]),
          tw: rand(0.6, 2.2), ph: Math.random() * Math.PI * 2,
          c: li === 0 ? '255,255,255' : TINTS[Math.floor(Math.random() * TINTS.length)]
        });
      }
    });
    if (still) draw(0);
  }

  function spawnMeteor(t) {
    const fromLeft = Math.random() < 0.5;
    meteors.push({
      x: fromLeft ? rand(-100, W * 0.5) : rand(W * 0.5, W + 100), y: rand(-60, H * 0.35),
      vx: (fromLeft ? 1 : -1) * rand(0.7, 1.1), vy: rand(0.28, 0.45), life: 0, max: rand(900, 1500)
    });
    nextMeteor = t + rand(4000, 11000);
  }

  let last = 0;
  function draw(t) {
    const dt = Math.min(50, t - last || 16);
    last = t;
    ctx.clearRect(0, 0, W, H);
    px += (mx - px) * 0.04; py += (my - py) * 0.04;

    for (const s of stars) {
      const L = LAYERS[s.li];
      if (!still) { s.x -= L.speed * dt; if (s.x < -4) s.x = W + 4; }
      const tw = still ? 1 : 0.65 + 0.35 * Math.sin(t * 0.001 * s.tw + s.ph);
      const x = s.x - px * L.depth, y = s.y - py * L.depth;
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = `rgb(${s.c})`;
      if (s.r > 1.6) {
        // les plus grosses étoiles ont un petit halo en croix
        ctx.fillRect(x - s.r * 2.2, y - 0.25, s.r * 4.4, 0.5);
        ctx.fillRect(x - 0.25, y - s.r * 2.2, 0.5, s.r * 4.4);
      }
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!still) {
      if (t > nextMeteor) spawnMeteor(t);
      meteors = meteors.filter((m) => m.life < m.max);
      for (const m of meteors) {
        m.life += dt;
        m.x += m.vx * dt; m.y += m.vy * dt;
        const k = m.life / m.max;
        const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        const tail = 140;
        const len = Math.hypot(m.vx, m.vy);
        const g = ctx.createLinearGradient(m.x, m.y, m.x - (m.vx / len) * tail, m.y - (m.vy / len) * tail);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 1;
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - (m.vx / len) * tail, m.y - (m.vy / len) * tail);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (!still) requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (e) => {
    mx = (e.clientX / W - 0.5) * 2;
    my = (e.clientY / H - 0.5) * 2;
  }, { passive: true });
  resize();
  nextMeteor = 1500;
  if (!still) requestAnimationFrame(draw);
})();
