/* Fond animé de DaveMachine : rayons qui tournent, projecteurs qui balayent, particules et DaveCoins
 * qui flottent. Il réagit au jeu en lisant les classes de la machine (spinning, has-win, fs) et du body
 * (fs-party, jp-party).
 */
(function () {
  'use strict';
  const { IMG } = DP;
  const coinImg = new Image();
  coinImg.src = IMG + 'davecoin.png';

  /** Monte le fond dans `stage` ; `slot` est la machine dont on lit l'état. Renvoie la fonction d'arrêt. */
  DP.slotBg = (stage, slot) => {
    const cv = document.createElement('canvas');
    cv.className = 'slot-bg';
    stage.prepend(cv);
    const g = cv.getContext('2d');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, dpr = 1, raf = 0, last = performance.now(), t = 0;
    let rot = 0, speed = 0.05, energy = 0, flash = 0, wasWin = false, hue = 0;

    const motes = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2.4, v: 0.01 + Math.random() * 0.04, ph: Math.random() * 6.3, gold: Math.random() < 0.7 }));
    const coins = Array.from({ length: 7 }, () => ({ x: Math.random(), y: Math.random(), s: 18 + Math.random() * 26, v: 0.012 + Math.random() * 0.02, sp: (Math.random() - 0.5) * 2, ph: Math.random() * 6.3 }));

    function resize() {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = stage.clientWidth; H = stage.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; t += dt;
      const spinning = slot.classList.contains('spinning');
      const win = slot.classList.contains('has-win');
      const party = document.body.classList.contains('fs-party') || slot.classList.contains('fs');
      const jp = document.body.classList.contains('jp-party');
      if (win && !wasWin) flash = 1;
      wasWin = win;
      const wantE = jp ? 1 : party ? 0.85 : spinning ? 0.7 : win ? 0.75 : 0.42;
      energy += (wantE - energy) * Math.min(1, dt * 3);
      flash = Math.max(0, flash - dt * 1.4);
      speed += ((jp ? 0.9 : spinning ? 0.45 : party ? 0.3 : 0.05) - speed) * Math.min(1, dt * 2);
      rot += speed * dt;
      hue += ((jp ? 1 : party ? 0.6 : 0) - hue) * Math.min(1, dt * 2);

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H * 0.46, R = Math.hypot(W, H) * 0.7;
      // couleurs : or au repos → orange / rose en free spins → or vif au jackpot
      const c1 = hue > 0.8 ? '255,200,70' : `255,${Math.round(170 - hue * 70)},${Math.round(60 + hue * 90)}`;
      const c2 = hue > 0.8 ? '255,236,170' : `${Math.round(255 - hue * 20)},${Math.round(107 - hue * 60)},${Math.round(44 + hue * 120)}`;

      // halo central
      const halo = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
      halo.addColorStop(0, `rgba(${c1},${0.18 + energy * 0.22 + flash * 0.3})`);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = halo;
      g.fillRect(0, 0, W, H);

      // rayons qui tournent
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      const N = 18;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2, w = (Math.PI / N) * 0.55;
        const grd = g.createLinearGradient(0, 0, Math.cos(a) * R, Math.sin(a) * R);
        grd.addColorStop(0, `rgba(${i % 2 ? c1 : c2},${0.12 + energy * 0.2 + flash * 0.25})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a - w, a + w); g.closePath();
        g.fillStyle = grd; g.fill();
      }
      g.restore();

      // projecteurs qui balayent depuis le bas
      g.globalCompositeOperation = 'lighter';
      [[0.15, 1], [0.85, -1]].forEach(([px, dir], k) => {
        const sw = Math.sin(t * (0.5 + energy) + k * 1.7) * 0.45 * dir;
        const ang = -Math.PI / 2 + sw, len = H * 1.3, spread = 0.14;
        const ox = W * px, oy = H + 10;
        const grd = g.createRadialGradient(ox, oy, 0, ox, oy, len);
        grd.addColorStop(0, `rgba(${c2},${0.22 + energy * 0.2})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.beginPath(); g.moveTo(ox, oy);
        g.lineTo(ox + Math.cos(ang - spread) * len, oy + Math.sin(ang - spread) * len);
        g.lineTo(ox + Math.cos(ang + spread) * len, oy + Math.sin(ang + spread) * len);
        g.closePath(); g.fillStyle = grd; g.fill();
      });

      // particules qui montent et scintillent
      motes.forEach((m) => {
        m.y -= m.v * dt * (1 + energy * 3);
        if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + m.ph));
        const x = m.x * W + Math.sin(t * 0.6 + m.ph) * 14, y = m.y * H;
        g.beginPath(); g.arc(x, y, m.r * (1 + energy * 0.6), 0, Math.PI * 2);
        g.fillStyle = m.gold ? `rgba(${c1},${0.25 + tw * 0.5})` : `rgba(255,255,255,${0.15 + tw * 0.35})`;
        g.fill();
      });
      g.globalCompositeOperation = 'source-over';

      // DaveCoins qui flottent en tournant (effet pièce de profil)
      if (coinImg.complete && coinImg.naturalWidth) {
        coins.forEach((c) => {
          c.y -= c.v * dt * (1 + energy * 2.5);
          if (c.y < -0.1) { c.y = 1.1; c.x = Math.random(); }
          const flip = Math.cos(t * (1.2 + c.sp) + c.ph);
          const w = c.s * Math.max(0.12, Math.abs(flip)), h = c.s * (coinImg.naturalHeight / coinImg.naturalWidth);
          g.globalAlpha = 0.35 + energy * 0.4;
          g.drawImage(coinImg, c.x * W - w / 2 + Math.sin(t * 0.5 + c.ph) * 20, c.y * H - h / 2, w, h);
        });
        g.globalAlpha = 1;
      }

      // vignettage
      const vg = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, R * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(2,3,6,.55)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(frame);
    }
    if (reduced) { frame(performance.now()); cancelAnimationFrame(raf); }
    else raf = requestAnimationFrame(frame);
    // onglet caché : on arrête de dessiner
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduced) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', vis); cv.remove(); };
  };
})();
