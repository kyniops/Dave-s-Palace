/* DaveWheel — grande roue en direct : 12 s pour miser sur une couleur, puis la roue tourne.
 * La bande mise en même temps que toi. 52 cases : 25 ×2, 16 ×3,1, 10 ×5, 1 JPZ ×50 (≈ 96 % sur chaque couleur).
 */
(function () {
  'use strict';
  const { IMG, rng, fmt, fmtMult, wallet, settle, sound, ui, chips, round2, esc } = DP;
  const TYPES = [
    { id: 'grey', label: 'Gris', mult: 2, n: 25, c: '#3a4157', ink: '#fff' },
    { id: 'blue', label: 'Bleu', mult: 3.1, n: 16, c: '#4c7dff', ink: '#fff' },
    { id: 'green', label: 'Vert', mult: 5, n: 10, c: '#3ee68b', ink: '#04150b' },
    { id: 'jpz', label: 'JPZ', mult: 50, n: 1, c: '#ffc65c', ink: '#1f1300' }
  ];
  const BY = Object.fromEntries(TYPES.map((t) => [t.id, t]));
  const BET_MS = 12000, SPIN_MS = 6500, RESULT_MS = 3500;

  // Ordre des cases : JPZ en 0, puis les couleurs réparties au mieux tout autour
  const SEGS = (() => {
    const rest = TYPES.filter((t) => t.id !== 'jpz');
    const total = rest.reduce((a, t) => a + t.n, 0);
    const placed = Object.fromEntries(rest.map((t) => [t.id, 0]));
    const out = ['jpz'];
    for (let i = 1; i <= total; i++) {
      let best = null, gap = -Infinity;
      rest.forEach((t) => { const g = (t.n * i) / total - placed[t.id]; if (g > gap) { gap = g; best = t.id; } });
      placed[best]++;
      out.push(best);
    }
    return out;
  })();
  const SEG = 360 / SEGS.length;
  const BOTS = [
    { name: 'Olman', img: 'olman.png' }, { name: 'Tdam', img: 'tdam.png' }, { name: 'Sévaré', img: 'sevare.png' },
    { name: 'Slymefire', img: 'slymefire.png' }, { name: 'AXB', img: 'axb.png' }, { name: 'Sauce Blanche', img: 'sauceblanche.png' },
    { name: 'Billy', img: 'billy.jpg' }, { name: 'Carl', img: 'carl.jpg' }, { name: 'Linkay', img: 'linkay.jpg' }, { name: 'Lucasco', img: 'lucasco.jpg' },
    { name: 'Petit Bonnin', img: 'petitbonnin.jpg' }, { name: 'Yohan', img: 'yohan.jpg' }
  ];

  function drawWheel(g, S, ang, coinImg, highlight) {
    const R = S / 2;
    g.clearRect(0, 0, S, S);
    g.save();
    g.translate(R, R);
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fillStyle = '#0b0d15'; g.fill();
    g.rotate((ang * Math.PI) / 180);
    SEGS.forEach((id, i) => {
      const t = BY[id];
      const a0 = ((i * SEG - SEG / 2 - 90) * Math.PI) / 180, a1 = ((i * SEG + SEG / 2 - 90) * Math.PI) / 180;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * 0.94, a0, a1); g.closePath();
      g.fillStyle = t.c;
      g.globalAlpha = highlight != null && highlight !== i ? 0.35 : 1;
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = '#0b0d15'; g.lineWidth = Math.max(1, R * 0.008); g.stroke();
      // petite étiquette
      g.save();
      g.rotate(((i * SEG) * Math.PI) / 180);
      g.fillStyle = t.ink;
      g.font = `600 ${R * (id === 'jpz' ? 0.06 : 0.05)}px Geist, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(id === 'jpz' ? '50' : String(t.mult).replace('.', ','), 0, -R * 0.84);
      g.restore();
    });
    // picots sur le bord
    for (let i = 0; i < SEGS.length; i++) {
      const a = ((i * SEG + SEG / 2 - 90) * Math.PI) / 180;
      g.beginPath(); g.arc(Math.cos(a) * R * 0.955, Math.sin(a) * R * 0.955, R * 0.012, 0, Math.PI * 2); g.fillStyle = '#e9ecf2'; g.fill();
    }
    g.restore();
    // moyeu (fixe)
    g.save(); g.translate(R, R);
    g.beginPath(); g.arc(0, 0, R * 0.3, 0, Math.PI * 2); g.fillStyle = '#0b0d15'; g.fill();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.2)'; g.stroke();
    if (coinImg.complete && coinImg.naturalWidth) {
      const w = R * 0.46, h = w * (coinImg.naturalHeight / coinImg.naturalWidth);
      g.drawImage(coinImg, -w / 2, -h / 2, w, h);
    }
    g.restore();
  }

  DP.games.register({
    id: 'wheel',
    name: 'DaveWheel',
    icon: 'target',
    tagline: 'La roue en direct avec toute la bande',
    rtp: '≈ 96 %',
    isNew: true,
    hue: 210,
    art: '<canvas class="art-wheel js-bigwheel-art" width="240" height="240"></canvas>',
    rules: `<p>Une manche toutes les ~20 secondes : <strong>12 s pour miser</strong>, puis la roue tourne. La bande mise en même temps que toi.</p>
      <ul><li><strong>Gris ×2</strong> (25 cases sur 52), <strong>Bleu ×3,1</strong> (16), <strong>Vert ×5</strong> (10), <strong>JPZ ×50</strong> (1 seule case).</li>
      <li>Tu peux miser sur plusieurs couleurs. Les jetons sont débités dès que tu les poses.</li>
      <li>Si tu quittes pendant les mises, tes jetons te sont rendus.</li></ul>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      const rack = chips.rack(panel, { value: 10 });
      const myOut = ui.readout(panel, 'Ta mise', '0');
      const undoBtn = ui.button(panel, ui.icon('rotate-ccw', 'i--sm') + 'Retirer mes jetons', 'btn btn--ghost btn--block');
      const lastOut = ui.readout(panel, 'Dernier gain', '—');
      panel.appendChild(ui.el('<p class="note">Clique sur une couleur pendant le compte à rebours</p>'));

      stage.classList.add('wheel-stage');
      stage.innerHTML = `
        <div class="stage__top"><span class="pill hi js-phase">Mises ouvertes</span><div class="pill-row js-hist"></div></div>
        <div class="bigwheel">
          <div class="bigwheel__box"><canvas></canvas><div class="bigwheel__pointer"><svg viewBox="0 0 24 22"><path d="M0 0h24L12 22z" fill="currentColor"/></svg></div></div>
          <div class="bigwheel__timer"><div class="bigwheel__bar"></div><span class="num js-time"></span></div>
        </div>
        <div class="wbets">${TYPES.map((t) => `
          <button type="button" class="wbet" data-id="${t.id}" style="--c:${t.c};--ink:${t.ink}">
            <div class="wbet__head"><span class="wbet__mult num">${t.id === 'jpz' ? `<img src="${IMG}jpz.png" alt="">` : ''}×${String(t.mult).replace('.', ',')}</span><span class="wbet__total num">0</span></div>
            <div class="wbet__me"></div>
            <ul class="wbet__list"></ul>
          </button>`).join('')}
        </div>`;
      const box = stage.querySelector('.bigwheel__box');
      const cv = box.querySelector('canvas');
      const g = cv.getContext('2d');
      const coinImg = new Image();
      coinImg.src = IMG + 'davecoin.png';
      const phaseEl = stage.querySelector('.js-phase');
      const timeEl = stage.querySelector('.js-time');
      const bar = stage.querySelector('.bigwheel__bar');
      const histEl = stage.querySelector('.js-hist');
      const zones = Object.fromEntries([...stage.querySelectorAll('.wbet')].map((z) => [z.dataset.id, z]));

      let S = 0, ang = 0, alive = true, raf = 0, highlight = null;
      let phase = 'bet', phaseEnd = 0, result = null;
      let mine = {}, botBets = [], botPlan = [], spin = null;
      const history = [];

      function size() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        S = box.clientWidth;
        cv.width = cv.height = Math.round(S * dpr);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawWheel(g, S, ang, coinImg, highlight);
      }

      const myTotal = () => round2(Object.values(mine).reduce((a, b) => a + b, 0));
      function paintBets() {
        TYPES.forEach((t) => {
          const z = zones[t.id];
          const bots = botBets.filter((b) => b.on === t.id);
          const me = mine[t.id] || 0;
          z.querySelector('.wbet__total').textContent = fmt(round2(me + bots.reduce((a, b) => a + b.amount, 0)));
          z.querySelector('.wbet__me').innerHTML = me ? `<span class="chip-stack">${chips.stack(me)}</span><b class="num">${fmt(me)}</b>` : '';
          z.querySelector('.wbet__list').innerHTML = bots.map((b) => `<li><img src="${IMG}${b.bot.img}" alt=""><span>${esc(b.bot.name)}</span><b class="num">${fmt(b.amount)}</b></li>`).join('');
          z.classList.toggle('mine', !!me);
          z.disabled = phase !== 'bet';
        });
        myOut.set(`${ui.coin('coin--xs')} ${fmt(myTotal())}`);
        undoBtn.disabled = phase !== 'bet' || !myTotal();
        rack.disable(phase !== 'bet');
      }

      /* ---------- Cycle des manches ---------- */
      function startBetting() {
        phase = 'bet';
        phaseEnd = performance.now() + BET_MS;
        mine = {};
        botBets = [];
        highlight = null;
        Object.values(zones).forEach((z) => z.classList.remove('win', 'lose'));
        // chaque membre de la bande prévoit 0 à 2 mises à des moments aléatoires
        botPlan = [];
        rng.shuffle([...BOTS]).slice(0, rng.int(3, 6)).forEach((bot) => {
          for (let k = rng.int(1, 2); k > 0; k--) {
            const on = rng.float() < 0.5 ? 'grey' : rng.float() < 0.6 ? 'blue' : rng.float() < 0.85 ? 'green' : 'jpz';
            botPlan.push({ bot, on, amount: rng.pick([5, 10, 10, 25, 25, 50, 100, 250]), at: rng.float() * (BET_MS - 1500) });
          }
        });
        phaseEl.textContent = 'Mises ouvertes';
        phaseEl.className = 'pill hi js-phase';
        sound.play('chip');
        paintBets();
      }
      function startSpin() {
        phase = 'spin';
        phaseEl.textContent = 'La roue tourne';
        phaseEl.className = 'pill js-phase';
        paintBets();
        const idx = rng.int(0, SEGS.length - 1);
        result = { idx, id: SEGS[idx], stake: myTotal(), bets: { ...mine } };
        // l'angle final amène la case idx sous le pointeur (avec un léger décalage dans la case)
        const from = ang;
        const off = (rng.float() - 0.5) * SEG * 0.7;
        const base = from - (from % 360) + 360 * 5;
        const to = base + (360 - idx * SEG) + off;
        spin = { from, to, t0: performance.now(), lastSeg: -1 };
        phaseEnd = spin.t0 + SPIN_MS;
        sound.play('whoosh');
      }
      function finishSpin() {
        phase = 'result';
        phaseEnd = performance.now() + RESULT_MS;
        const t = BY[result.id];
        highlight = result.idx;
        drawWheel(g, S, ang, coinImg, highlight);
        phaseEl.textContent = `Résultat : ${t.label} ×${String(t.mult).replace('.', ',')}`;
        history.unshift(result.id);
        histEl.innerHTML = history.slice(0, 12).map((id) => `<span class="wdot" style="--c:${BY[id].c}"></span>`).join('');
        // résultat des bots
        TYPES.forEach((tt) => zones[tt.id].classList.add(tt.id === result.id ? 'win' : 'lose'));
        const winZone = zones[result.id];
        ui.burst(winZone, { n: result.id === 'jpz' ? 50 : 20, colors: [t.c, '#ffffff'], spread: result.id === 'jpz' ? 2 : 1.2 });
        // ta mise
        if (result.stake > 0) {
          const pay = round2((result.bets[result.id] || 0) * t.mult);
          settle('wheel', result.stake, pay, { silent: true });
          lastOut.set(pay > 0 ? `<span class="pos">+${fmt(pay)}</span>` : '0');
          if (pay > 0) {
            sound.play('streak', { i: result.id === 'jpz' ? 15 : result.id === 'green' ? 8 : result.id === 'blue' ? 5 : 2 });
            sound.play('win', { x: pay / result.stake });
            ui.floatText(winZone, '+' + fmt(pay));
            ui.result(stage, { win: true, mult: pay / result.stake, amount: pay });
          } else {
            sound.play('lose');
            ui.result(stage, { win: false, label: t.label });
          }
        } else sound.play('reelStop');
        if (result.id === 'jpz') { ui.coinRain(stage, 60); ui.shake(stage, 2); sound.play('jackpot'); }
        result = null;
      }

      function loop(now) {
        if (!alive) return;
        const left = Math.max(0, phaseEnd - now);
        if (phase === 'bet') {
          // les bots posent leurs jetons au fil du compte à rebours
          const elapsed = BET_MS - left;
          let changed = false;
          botPlan = botPlan.filter((p) => {
            if (p.at > elapsed) return true;
            botBets.push(p); changed = true;
            const z = zones[p.on];
            z.animate([{ transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 200 });
            return false;
          });
          if (changed) { sound.play('chip'); paintBets(); }
          timeEl.textContent = (left / 1000).toFixed(1) + ' s';
          bar.style.transform = `scaleX(${left / BET_MS})`;
          if (left <= 3000 && Math.ceil(left / 1000) !== loop.lastSec) { loop.lastSec = Math.ceil(left / 1000); if (left > 0) sound.play('tick', { p: 4 - loop.lastSec }); }
          if (left === 0) startSpin();
        } else if (phase === 'spin') {
          const k = Math.min(1, (now - spin.t0) / SPIN_MS);
          const e = 1 - Math.pow(1 - k, 3.2);
          ang = spin.from + (spin.to - spin.from) * e;
          // un « tic » à chaque picot qui passe sous le pointeur
          const seg = Math.floor((ang + SEG / 2) / SEG);
          if (seg !== spin.lastSeg) { spin.lastSeg = seg; sound.play('tick', { p: 2 * (1 - k) }); }
          drawWheel(g, S, ang, coinImg, null);
          timeEl.textContent = '';
          bar.style.transform = 'scaleX(0)';
          if (k >= 1) { ang = spin.to % 360; finishSpin(); }
        } else if (phase === 'result') {
          timeEl.textContent = 'Prochaine manche…';
          if (left === 0) { startBetting(); drawWheel(g, S, ang, coinImg, null); }
        }
        raf = requestAnimationFrame(loop);
      }

      stage.querySelector('.wbets').addEventListener('click', (e) => {
        const z = e.target.closest('.wbet');
        if (!z || phase !== 'bet') return;
        const v = rack.get();
        if (!wallet.place(v)) return;
        // la mise compte tout de suite (même si le jeton est encore en vol à la fin du compte à rebours)
        mine[z.dataset.id] = round2((mine[z.dataset.id] || 0) + v);
        chips.fly(rack.btnFor(v), z.querySelector('.wbet__head'), v).then(() => {
          if (!alive) return;
          sound.play('chip');
          paintBets();
        });
      });
      undoBtn.addEventListener('click', () => {
        if (phase !== 'bet') return;
        wallet.credit(myTotal());
        mine = {};
        sound.play('whoosh');
        paintBets();
      });

      window.addEventListener('resize', size);
      coinImg.onload = () => drawWheel(g, S, ang, coinImg, highlight);
      size();
      if (document.fonts) document.fonts.ready.then(() => alive && drawWheel(g, S, ang, coinImg, highlight));
      startBetting();
      raf = requestAnimationFrame(loop);

      return () => {
        alive = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', size);
        if (phase === 'bet') wallet.credit(myTotal());           // mises pas encore jouées : rendues
        else if (phase === 'spin' && result && result.stake > 0) { // résultat déjà tiré : réglé
          settle('wheel', result.stake, round2((result.bets[result.id] || 0) * BY[result.id].mult), { silent: true });
        }
      };
    }
  });

  DP.on('lobby', () => document.querySelectorAll('.js-bigwheel-art').forEach((c) => {
    const img = new Image();
    img.src = IMG + 'davecoin.png';
    const g = c.getContext('2d');
    const draw = () => drawWheel(g, c.width, 4, img, null);
    img.onload = draw;
    draw();
  }));
})();
