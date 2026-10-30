/* PlinkoDave — lâche des DaveCoins à travers les picots. RTP ≈ 99 %. */
(function () {
  'use strict';
  const { IMG, rng, fmtMult, wallet, settle, sound, ui, round2 } = DP;

  const TABLES = {
    8: { low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6], medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13], high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29] },
    12: { low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10], medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33], high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170] },
    16: { low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16], medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110], high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000] }
  };

  /** Couleurs d'une case selon son multiplicateur : sombre si ça perd, puis vert, ambre et rouge vers les gros gains. */
  function slotColor(m) {
    if (m < 1) return ['#171b27', '#6c7387'];
    if (m < 2) return ['#262c3d', '#d9dce6'];
    if (m < 5) return ['#7a3313', '#fff0e6'];
    if (m < 30) return ['#ff6b2c', '#1a0700'];
    if (m < 200) return ['#ffc65c', '#1f1300'];
    return ['#ff5d52', '#200402'];
  }

  DP.games.register({
    id: 'plinko',
    name: 'PlinkoDave',
    icon: 'plinko',
    tagline: 'Fais tomber la DaveCoin, jusqu’à ×1000',
    rtp: '99 %',
    hue: 200,
    art: `<svg class="art-plinko" viewBox="0 0 100 90"><circle cx="39.0" cy="14" r="2.2" fill="#cfd5e6"/><circle cx="50.0" cy="14" r="2.2" fill="#cfd5e6"/><circle cx="61.0" cy="14" r="2.2" fill="#cfd5e6"/><circle cx="33.5" cy="25" r="2.2" fill="#cfd5e6"/><circle cx="44.5" cy="25" r="2.2" fill="#cfd5e6"/><circle cx="55.5" cy="25" r="2.2" fill="#cfd5e6"/><circle cx="66.5" cy="25" r="2.2" fill="#cfd5e6"/><circle cx="28.0" cy="36" r="2.2" fill="#cfd5e6"/><circle cx="39.0" cy="36" r="2.2" fill="#cfd5e6"/><circle cx="50.0" cy="36" r="2.2" fill="#cfd5e6"/><circle cx="61.0" cy="36" r="2.2" fill="#cfd5e6"/><circle cx="72.0" cy="36" r="2.2" fill="#cfd5e6"/><circle cx="22.5" cy="47" r="2.2" fill="#cfd5e6"/><circle cx="33.5" cy="47" r="2.2" fill="#cfd5e6"/><circle cx="44.5" cy="47" r="2.2" fill="#cfd5e6"/><circle cx="55.5" cy="47" r="2.2" fill="#cfd5e6"/><circle cx="66.5" cy="47" r="2.2" fill="#cfd5e6"/><circle cx="77.5" cy="47" r="2.2" fill="#cfd5e6"/><circle cx="17.0" cy="58" r="2.2" fill="#cfd5e6"/><circle cx="28.0" cy="58" r="2.2" fill="#cfd5e6"/><circle cx="39.0" cy="58" r="2.2" fill="#cfd5e6"/><circle cx="50.0" cy="58" r="2.2" fill="#cfd5e6"/><circle cx="61.0" cy="58" r="2.2" fill="#cfd5e6"/><circle cx="72.0" cy="58" r="2.2" fill="#cfd5e6"/><circle cx="83.0" cy="58" r="2.2" fill="#cfd5e6"/><circle cx="11.5" cy="69" r="2.2" fill="#cfd5e6"/><circle cx="22.5" cy="69" r="2.2" fill="#cfd5e6"/><circle cx="33.5" cy="69" r="2.2" fill="#cfd5e6"/><circle cx="44.5" cy="69" r="2.2" fill="#cfd5e6"/><circle cx="55.5" cy="69" r="2.2" fill="#cfd5e6"/><circle cx="66.5" cy="69" r="2.2" fill="#cfd5e6"/><circle cx="77.5" cy="69" r="2.2" fill="#cfd5e6"/><circle cx="88.5" cy="69" r="2.2" fill="#cfd5e6"/><image href="${IMG}davecoin.png" x="38" y="-4" width="24" height="16"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<rect x="${7.5 + k * 11}" y="78" width="9" height="8" rx="2" fill="${['#ff5d52', '#ffc65c', '#ff6b2c', '#262c3d', '#262c3d', '#ff6b2c', '#ffc65c', '#ff5d52'][k]}"/>`).join('')}</svg>`,
    rules: `<p>Chaque DaveCoin rebondit sur les picots et finit dans une case qui multiplie ta mise.</p>
      <ul><li><strong>Lignes</strong> : plus il y en a, plus les extrêmes sont rares et gros.</li>
      <li><strong>Risque</strong> : en risque élevé, le centre paie peu mais les bords vont jusqu’à ×1000.</li>
      <li>Tu peux lancer plusieurs pièces à la suite.</li></ul>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      const betIn = ui.betInput(panel, { gameId: 'plinko', initial: 10 });
      let rows = 12, risk = 'medium';
      const riskSeg = ui.segmented(panel, {
        label: 'Risque', value: risk,
        options: [{ value: 'low', label: 'Faible' }, { value: 'medium', label: 'Moyen' }, { value: 'high', label: 'Élevé' }],
        onChange: (v) => { risk = v; layout(); }
      });
      const rowSeg = ui.segmented(panel, {
        label: 'Lignes', value: rows,
        options: [{ value: 8, label: '8' }, { value: 12, label: '12' }, { value: 16, label: '16' }],
        onChange: (v) => { rows = v; layout(); }
      });
      const dropBtn = ui.button(panel, 'Lâcher une pièce');
      const autoBtn = ui.button(panel, ui.icon('repeat', 'i--sm') + 'Auto', 'btn btn--ghost btn--block');
      panel.appendChild(ui.el('<p class="note">Le risque et les lignes se verrouillent tant qu’une pièce tombe.</p>'));

      stage.innerHTML = '<div class="plinko-wrap"><canvas></canvas><div class="plinko-last"></div></div>';
      const wrap = stage.querySelector('.plinko-wrap');
      const lastEl = stage.querySelector('.plinko-last');
      const canvas = stage.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const coinImg = new Image();
      coinImg.src = IMG + 'davecoin.png';

      let W = 0, H = 0, sp = 0, top = 0, pegR = 0, ballR = 0, slotY = 0, slotH = 0;
      let balls = [];
      const slotFlash = {};
      const pegFlash = new Map();
      let raf = 0, alive = true, auto = null;

      function layout() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = wrap.clientWidth;
        H = Math.min(W * 0.95, 640);
        canvas.width = W * dpr; canvas.height = H * dpr;
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        sp = Math.min(W / (rows + 3), (H - 70) / (rows + 1.2));
        top = sp * 0.9;
        pegR = Math.max(2.5, sp * 0.1);
        ballR = sp * 0.32;
        slotY = top + (rows - 1) * sp + sp * 0.75;
        slotH = Math.max(24, sp * 0.8);
      }
      const pegX = (r, j) => W / 2 + (j - (r + 2) / 2) * sp;
      const pegY = (r) => top + r * sp;
      const slotX = (k) => W / 2 + (k - rows / 2) * sp;

      function drop() {
        const bet = betIn.get();
        if (!wallet.place(bet)) { stopAuto(); return; }
        betIn.remember();
        sound.play('pop');
        sound.play('chip');
        // Trajectoire tirée à l'avance : chaque rangée = gauche ou droite à 50 %.
        const path = Array.from({ length: rows }, () => (rng.float() < 0.5 ? 0 : 1));
        balls.push({ bet, path, rows, risk, seg: -1, t: 0, x: W / 2 + (rng.float() - 0.5) * sp * 0.2, y: -ballR, k: 0, done: false });
        lockControls();
        if (!raf) raf = requestAnimationFrame(loop);
      }

      function lockControls() {
        const busy = balls.length > 0;
        riskSeg.disable(busy);
        rowSeg.disable(busy);
      }

      function land(b) {
        b.done = true;
        const mult = TABLES[b.rows][b.risk][b.k];
        settle('plinko', b.bet, round2(b.bet * mult), { silent: true });
        sound.play('land', { x: mult });
        if (mult >= 2) {
          const r = canvas.getBoundingClientRect();
          const sx = r.left + (slotX(b.k) / W) * r.width, sy = r.top + (slotY / H) * r.height;
          const [bg] = slotColor(mult);
          ui.burst({ x: sx, y: sy }, { n: Math.min(40, 8 + Math.round(mult * 2)), colors: [bg, '#ffffff'], spread: mult >= 10 ? 1.8 : 1 });
          if (mult >= 10) ui.shake(stage, mult >= 100 ? 2 : 1);
        }
        slotFlash[b.k] = performance.now();
        const pill = ui.el(`<span class="pill">${fmtMult(mult)}</span>`);
        const [bg, fg] = slotColor(mult);
        pill.style.background = bg;
        pill.style.color = fg;
        pill.style.borderColor = 'transparent';
        lastEl.prepend(pill);
        while (lastEl.children.length > 6) lastEl.lastChild.remove();
        if (mult >= 10) ui.result(stage, { win: true, mult, amount: b.bet * mult });
      }

      const SEG_MS = 105;
      function step(b, dt) {
        b.t += dt / SEG_MS;
        while (b.t >= 1 && !b.done) {
          b.t -= 1;
          b.seg++;
          if (b.seg > 0 && b.seg <= b.rows) b.k += b.path[b.seg - 1];
          if (b.seg >= 0 && b.seg < b.rows) {
            pegFlash.set(b.seg + ':' + (b.k + 1), performance.now());
            if (balls.length < 4 || b.seg % 2 === 0) sound.play('peg', { i: b.k + b.seg });
          }
          if (b.seg === b.rows) { b.x = slotX(b.k); b.y = slotY + slotH / 2; land(b); }
        }
        if (b.done) return;
        // Position de départ et d'arrivée du segment courant
        let x0, y0, x1, y1;
        if (b.seg < 0) { x0 = W / 2; y0 = -ballR; x1 = pegX(0, 1); y1 = pegY(0) - ballR - pegR; }
        else {
          const kNext = b.k + b.path[b.seg];
          x0 = pegX(b.seg, b.k + 1); y0 = pegY(b.seg) - ballR - pegR;
          if (b.seg + 1 < b.rows) { x1 = pegX(b.seg + 1, kNext + 1); y1 = pegY(b.seg + 1) - ballR - pegR; }
          else { x1 = slotX(kNext); y1 = slotY + slotH / 2; }
        }
        const t = b.t;
        b.x = x0 + (x1 - x0) * t;
        b.y = y0 + (y1 - y0) * t * t - (b.seg < 0 ? 0 : sp * 0.35 * Math.sin(Math.PI * t) * (1 - t));
      }

      let last = performance.now();
      function loop(now) {
        const dt = Math.min(50, now - last);
        last = now;
        balls.forEach((b) => step(b, dt));
        balls = balls.filter((b) => !b.done);
        lockControls();
        draw(now);
        raf = balls.length || Object.values(slotFlash).some((t) => now - t < 400) ? requestAnimationFrame(loop) : 0;
      }

      function draw(now) {
        ctx.clearRect(0, 0, W, H);
        for (let r = 0; r < rows; r++) {
          for (let j = 0; j < r + 3; j++) {
            const f = pegFlash.get(r + ':' + j);
            const glow = f ? Math.max(0, 1 - (now - f) / 250) : 0;
            ctx.beginPath();
            ctx.arc(pegX(r, j), pegY(r), pegR * (1 + glow * 0.6), 0, Math.PI * 2);
            ctx.fillStyle = glow ? `rgba(255, 255, 255, ${0.8 + glow * 0.2})` : 'rgba(214,220,235,0.75)';
                        ctx.fill();
          }
        }
        ctx.shadowBlur = 0;
        const table = TABLES[rows][risk];
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `500 ${Math.max(9, Math.min(13, sp * 0.3))}px Geist, sans-serif`;
        table.forEach((m, k) => {
          const f = slotFlash[k];
          const bounce = f ? Math.max(0, 1 - (now - f) / 400) : 0;
          const x = slotX(k) - sp * 0.46, w = sp * 0.92, y = slotY + bounce * 6;
          const [bg, fg] = slotColor(m);
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(x, y, w, slotH, 6) : ctx.rect(x, y, w, slotH);
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,.25)';
          ctx.fillRect(x, y + slotH - 4, w, 4);
          ctx.fillStyle = fg;
          ctx.fillText(m >= 100 ? String(m) : m + '×', slotX(k), y + slotH / 2 - 1);
        });
        balls.forEach((b) => {
          if (coinImg.complete && coinImg.naturalWidth) {
            const ratio = coinImg.naturalHeight / coinImg.naturalWidth;
            ctx.drawImage(coinImg, b.x - ballR * 1.2, b.y - ballR * 1.2 * ratio, ballR * 2.4, ballR * 2.4 * ratio);
          } else {
            ctx.beginPath(); ctx.arc(b.x, b.y, ballR, 0, Math.PI * 2); ctx.fillStyle = '#ff6b2c'; ctx.fill();
          }
        });
      }

      function stopAuto() {
        if (!auto) return;
        clearInterval(auto);
        auto = null;
        autoBtn.innerHTML = ui.icon('repeat', 'i--sm') + 'Auto';
        autoBtn.classList.remove('on');
      }
      dropBtn.addEventListener('click', drop);
      autoBtn.addEventListener('click', () => {
        if (auto) return stopAuto();
        autoBtn.innerHTML = ui.icon('x', 'i--sm') + 'Stop';
        autoBtn.classList.add('on');
        drop();
        auto = setInterval(() => (alive ? drop() : stopAuto()), 400);
      });

      const onResize = () => { layout(); draw(performance.now()); };
      window.addEventListener('resize', onResize);
      coinImg.onload = () => draw(performance.now());
      layout();
      draw(performance.now());

      return () => {
        alive = false;
        stopAuto();
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        // Les pièces encore en l'air arrivent instantanément à destination
        balls.forEach((b) => {
          const k = b.path.reduce((a, c) => a + c, 0);
          settle('plinko', b.bet, round2(b.bet * TABLES[b.rows][b.risk][k]));
        });
        balls = [];
      };
    }
  });
})();
