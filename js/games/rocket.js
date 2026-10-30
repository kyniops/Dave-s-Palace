/* DaveRocket — jeu « crash » : encaisse avant que la fusée de JPZ n'explose. RTP 99 %. */
(function () {
  'use strict';
  const { IMG, rng, fmt, fmtMult, wallet, settle, sound, ui, round2, store } = DP;
  const GROWTH = 0.00007; // multiplicateur = e^(GROWTH × ms)

  /** P(crash ≥ x) = 0,99 / x  → espérance de 99 % quelle que soit la cible. */
  function crashPoint() {
    const u = rng.float();
    return Math.max(1, Math.floor((99 / (1 - u))) / 100);
  }
  const multAt = (ms) => Math.exp(GROWTH * ms);
  const msFor = (m) => Math.log(m) / GROWTH;

  DP.games.register({
    id: 'rocket',
    name: 'DaveRocket',
    icon: 'rocket',
    tagline: 'Encaisse avant que JPZ ne s’écrase',
    rtp: '99 %',
    isNew: true,
    hue: 160,
    art: `<div class="art-stack"><div class="orbit" style="width:70%;height:70%"></div><img src="${IMG}jpz.png" alt="" style="width:46%;left:27%;top:10%;-webkit-mask-image:radial-gradient(circle at 50% 42%,#000 58%,transparent 72%);mask-image:radial-gradient(circle at 50% 42%,#000 58%,transparent 72%)"><span class="game-card__icon" style="position:absolute;right:12%;bottom:10%;transform:rotate(-8deg)">${DP.ui.icon('rocket')}</span></div>`,
    rules: `<p>Mise, lance la fusée : le multiplicateur grimpe de plus en plus vite… jusqu’à l’explosion.</p>
      <ul><li>Clique sur <strong>Encaisser</strong> avant le crash pour gagner mise × multiplicateur.</li>
      <li>L’<strong>auto-encaissement</strong> encaisse pour toi dès que le multiplicateur est atteint.</li>
      <li>Le point de crash est tiré au hasard avant le décollage.</li></ul>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      const betIn = ui.betInput(panel, { gameId: 'rocket', initial: 10 });
      const autoField = ui.el(`<div class="field"><div class="field__head"><label>Auto-encaissement</label><span class="field__hint">0 = désactivé</span></div>
        <div class="bet"><div class="bet__input"><input type="number" min="0" step="0.01" value="${store.get('dp_rocket_auto', '2')}"></div><span style="align-self:center;padding:0 10px;color:var(--muted);font-weight:700">×</span></div></div>`);
      panel.appendChild(autoField);
      const autoIn = autoField.querySelector('input');
      const winOut = ui.readout(panel, 'Gain potentiel', '—');
      const btn = ui.button(panel, 'Décoller');

      stage.innerHTML = `<div class="stage__top"><span></span><div class="pill-row js-hist"></div></div>
        <div class="rocket-wrap"><canvas></canvas><div class="rocket-mult">1.00×<small>Prêt au décollage</small></div></div>`;
      const wrap = stage.querySelector('.rocket-wrap');
      const canvas = stage.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const multEl = stage.querySelector('.rocket-mult');
      const histEl = stage.querySelector('.js-hist');
      const pilot = new Image();
      pilot.src = IMG + 'jpz.png';
      const stars = Array.from({ length: 70 }, () => ({ x: rng.float(), y: rng.float(), r: rng.float() * 1.4 + 0.3, s: rng.float() * 0.5 + 0.2 }));

      let W = 0, H = 0, raf = 0, alive = true;
      let round = null; // { bet, crash, t0, cashed, cashMult, auto, over }

      function size() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = wrap.clientWidth; H = wrap.clientHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      function draw(elapsed, m, state) {
        ctx.clearRect(0, 0, W, H);
        // étoiles qui défilent
        const scroll = elapsed * 0.00005;
        stars.forEach((s) => {
          const x = ((s.x - scroll * s.s * 4) % 1 + 1) % 1;
          ctx.fillStyle = `rgba(255,255,255,${0.25 + s.s})`;
          ctx.fillRect(x * W, s.y * H, s.r, s.r);
        });
        const padL = 44, padB = 34, padT = 30, padR = 30;
        const gw = W - padL - padR, gh = H - padT - padB;
        const tMax = Math.max(8000, elapsed * 1.15);
        const mMax = Math.max(2, m * 1.25);
        const X = (t) => padL + (t / tMax) * gw;
        const Y = (v) => padT + gh - ((v - 1) / (mMax - 1)) * gh;

        // grille
        ctx.strokeStyle = 'rgba(255,255,255,.05)';
        ctx.fillStyle = 'rgba(139,145,165,.7)';
        ctx.font = "500 11px 'Geist Mono', monospace";
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const stepM = niceStep(mMax - 1);
        for (let v = 1; v <= mMax; v += stepM) {
          ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(W - padR, Y(v)); ctx.stroke();
          ctx.fillText(v.toFixed(v < 10 ? 1 : 0) + '×', padL - 8, Y(v));
        }
        ctx.textAlign = 'center';
        const stepT = niceStep(tMax / 1000) * 1000;
        for (let t = 0; t <= tMax; t += stepT) ctx.fillText(Math.round(t / 1000) + 's', X(t), H - padB + 16);

        if (elapsed <= 0) {
          // fusée posée sur le pas de tir (elle tremble pendant le compte à rebours)
          if (state === 'pad') drawRocket(X(0) + 30, Y(1) - 16 + (round ? (Math.random() - 0.5) * 2.5 : 0), -0.4, performance.now());
          return;
        }
        // courbe
        const color = state === 'crashed' ? '#ff5d52' : '#c8ff3d';
        const grad = ctx.createLinearGradient(0, Y(m), 0, Y(1));
        grad.addColorStop(0, state === 'crashed' ? 'rgba(255,93,82,.28)' : 'rgba(200,255,61,.22)');
        grad.addColorStop(1, 'rgba(200,255,61,0)');
        ctx.beginPath();
        ctx.moveTo(X(0), Y(1));
        const N = 80;
        for (let i = 1; i <= N; i++) { const t = (elapsed * i) / N; ctx.lineTo(X(t), Y(multAt(t))); }
        ctx.lineTo(X(elapsed), Y(1));
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(X(0), Y(1));
        for (let i = 1; i <= N; i++) { const t = (elapsed * i) / N; ctx.lineTo(X(t), Y(multAt(t))); }
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.shadowBlur = 0;

        if (round && round.cashMult && round.cashMult <= m) {
          const ct = msFor(round.cashMult);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(X(ct), Y(round.cashMult), 6, 0, Math.PI * 2); ctx.fill();
        }

        // fusée + pilote
        const x = X(elapsed), y = Y(m);
        const dx = X(elapsed) - X(elapsed * 0.97), dy = Y(m) - Y(multAt(elapsed * 0.97));
        const ang = Math.atan2(dy, dx);
        if (state === 'crashed') drawBoom(x, y, boomT);
        else drawRocket(x, y, ang, performance.now());
      }

      /** Fusée vue de profil, pointe vers +x. Le hublot montre JPZ. */
      function drawRocket(x, y, ang, now) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        const k = Math.max(1, Math.min(1.5, W / 600));
        ctx.scale(k, k);
        // flamme qui vacille
        const fl = 18 + Math.sin(now / 40) * 4 + Math.random() * 4;
        const fg = ctx.createLinearGradient(-20, 0, -20 - fl, 0);
        fg.addColorStop(0, 'rgba(255,255,255,.95)');
        fg.addColorStop(0.35, 'rgba(200,255,61,.9)');
        fg.addColorStop(1, 'rgba(200,255,61,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.moveTo(-20, -6); ctx.quadraticCurveTo(-22 - fl, 0, -20, 6); ctx.closePath(); ctx.fill();
        // ailerons
        ctx.fillStyle = '#ff5d52';
        ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(-22, -18); ctx.lineTo(-19, -7); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-6, 9); ctx.lineTo(-22, 18); ctx.lineTo(-19, 7); ctx.closePath(); ctx.fill();
        // corps
        const bg = ctx.createLinearGradient(0, -10, 0, 10);
        bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#9aa2b6');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(-21, -8); ctx.lineTo(8, -10); ctx.quadraticCurveTo(28, -8, 32, 0); ctx.quadraticCurveTo(28, 8, 8, 10); ctx.lineTo(-21, 8);
        ctx.closePath(); ctx.fill();
        // pointe
        ctx.fillStyle = '#c8ff3d';
        ctx.beginPath(); ctx.moveTo(20, -8); ctx.quadraticCurveTo(29, -6, 32, 0); ctx.quadraticCurveTo(29, 6, 20, 8); ctx.quadraticCurveTo(23, 0, 20, -8); ctx.fill();
        // hublot : le pilote reste droit quelle que soit l'inclinaison
        ctx.save();
        ctx.beginPath(); ctx.arc(4, 0, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = '#0b0d15'; ctx.fill();
        ctx.clip();
        ctx.translate(4, 0);
        ctx.rotate(-ang);
        if (pilot.complete && pilot.naturalWidth) ctx.drawImage(pilot, -9, -7, 18, 18);
        ctx.restore();
        ctx.strokeStyle = '#0b0d15'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(4, 0, 7.5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }

      /** Explosion : onde de choc + éclats, t de 0 à 1. */
      const debris = Array.from({ length: 24 }, () => ({ a: rng.float() * Math.PI * 2, v: 30 + rng.float() * 80, r: 1 + rng.float() * 2.5, c: rng.pick(['#ff5d52', '#ffc65c', '#ffffff', '#c8ff3d']) }));
      function drawBoom(x, y, t) {
        const e = 1 - Math.pow(1 - t, 3);
        ctx.save();
        ctx.globalAlpha = Math.max(0.25, 1 - t);
        ctx.strokeStyle = '#ff5d52';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 8 + e * 60, 0, Math.PI * 2); ctx.stroke();
        const r = 26 + e * 22;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.4, 'rgba(255,93,82,.6)'); g.addColorStop(1, 'rgba(255,93,82,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        debris.forEach((d) => {
          ctx.fillStyle = d.c;
          ctx.beginPath(); ctx.arc(x + Math.cos(d.a) * d.v * e, y + Math.sin(d.a) * d.v * e + 30 * t * t, d.r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
      }
      let boomT = 1;
      function animateBoom(el, m) {
        const t0 = performance.now();
        const stepB = (now) => {
          if (!alive || round) return;
          boomT = Math.min(1, (now - t0) / 900);
          draw(el, m, 'crashed');
          if (boomT < 1) requestAnimationFrame(stepB);
        };
        boomT = 0;
        requestAnimationFrame(stepB);
      }
      function niceStep(range) {
        const raw = range / 5;
        const p = Math.pow(10, Math.floor(Math.log10(raw)));
        const n = raw / p;
        return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
      }

      function setMult(m, sub, cls = '') {
        multEl.className = 'rocket-mult ' + cls;
        multEl.innerHTML = `${m.toFixed(2)}×<small>${sub}</small>`;
      }

      // Encaisser n'est possible qu'à partir de MIN_CASH : récupérer sa mise à 1,00× n'est plus possible.
      const MIN_CASH = 1.01;
      const COUNTDOWN = 1600;
      const MILESTONES = [2, 5, 10, 25, 50, 100];
      let engine = null;

      function launch() {
        const bet = betIn.get();
        const autoVal = parseFloat(autoIn.value) || 0;
        if (autoVal && autoVal < MIN_CASH) { ui.toast(`L’auto-encaissement doit être ≥ ${MIN_CASH}×`, 'error'); return; }
        if (!wallet.place(bet)) return;
        betIn.remember();
        store.set('dp_rocket_auto', String(autoVal));
        sound.play('bet');
        const now = performance.now();
        round = { bet, crash: crashPoint(), t0: now + COUNTDOWN, cashed: false, cashMult: 0, auto: autoVal, over: false, ms: 0 };
        betIn.disable(true);
        autoIn.disabled = true;
        btn.disabled = true;
        btn.classList.replace('btn--primary', 'btn--cash');
        stage.querySelectorAll('.result-pop').forEach((n) => n.remove());
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
      }

      function cashout(m) {
        if (!round || round.cashed || round.over || m < MIN_CASH) return;
        round.cashed = true;
        round.cashedAt = performance.now();
        round.cashMult = round2(m);
        const pay = round2(round.bet * round.cashMult);
        settle('rocket', round.bet, pay, { silent: true });
        sound.play('cashout');
        sound.play('win', { x: round.cashMult });
        ui.burst(multEl, { n: 30, spread: 1.6 });
        ui.floatText(multEl, '+' + fmt(pay));
        ui.result(stage, { win: true, mult: round.cashMult, amount: pay });
        btn.disabled = true;
        btn.textContent = 'Encaissé !';
      }

      let lastBeep = 1;
      function tick(now) {
        if (!alive || !round) return;
        // Compte à rebours avant le décollage : la mise est engagée, impossible d'encaisser.
        if (now < round.t0) {
          const left = Math.ceil((round.t0 - now) / 533);
          if (left !== round.cd) { round.cd = left; sound.play('tick', { p: 3 - left }); }
          setMult(1, `Décollage dans ${left}…`, 'countdown');
          btn.innerHTML = 'Mise engagée';
          draw(0, 1, 'pad');
          raf = requestAnimationFrame(tick);
          return;
        }
        if (!engine) { engine = sound.engine(); sound.play('whoosh'); }
        const elapsed = now - round.t0;
        let m = multAt(elapsed);
        engine.set(m);
        if (round.auto && !round.cashed && m >= round.auto && round.auto <= round.crash) cashout(round.auto);
        // Une fois encaissé, on laisse voler 1,5 s puis on révèle le point de crash.
        const reveal = round.cashed && now - round.cashedAt > 1500;
        if (m >= round.crash || reveal) {
          engine.stop(); engine = null;
          if (reveal && m < round.crash) {
            draw(elapsed, m, 'flying');
            setMult(round.cashMult, `+${fmt(round.bet * round.cashMult)} · aurait crashé à ${round.crash.toFixed(2)}×`, 'cashed');
            addHistory(round.crash);
            finish();
            return;
          }
          m = round.crash;
          const el = msFor(m);
          round.over = true;
          animateBoom(el, m);
          setMult(m, round.cashed ? `Encaissé à ${round.cashMult.toFixed(2)}×` : 'Crash !', 'crashed');
          sound.play('boom');
          ui.shake(stage, 2);
          ui.flash(stage, 'rgba(255,93,82,.4)');
          if (!round.cashed) settle('rocket', round.bet, 0, { silent: true });
          addHistory(round.crash);
          finish();
          return;
        }
        // Paliers : flash + son à 2×, 5×, 10×…
        const ms = MILESTONES.filter((x) => m >= x).length;
        if (ms > round.ms) {
          round.ms = ms;
          sound.play('gem', { i: ms + 3 });
          ui.flash(stage, 'rgba(200,255,61,.18)');
          multEl.animate([{ transform: 'translate(-50%,-50%) scale(1.25)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 400, easing: 'cubic-bezier(.2,1.6,.4,1)' });
        }
        if (m - lastBeep > 0.1) { lastBeep = m; sound.play('tick', { p: Math.min(4, Math.log(m) * 2) }); }
        draw(elapsed, m, 'flying');
        multEl.style.setProperty('--heat', Math.min(1, Math.log(m) / Math.log(20)).toFixed(3));
        if (round.cashed) setMult(m, `Encaissé à ${round.cashMult.toFixed(2)}× · +${fmt(round.bet * round.cashMult)}`, 'cashed');
        else {
          setMult(m, 'En vol…', 'flying');
          const can = m >= MIN_CASH;
          btn.disabled = !can;
          btn.innerHTML = can ? `Encaisser ${fmt(round.bet * m)}` : `Encaisser dès ${MIN_CASH}×`;
          winOut.set(`${ui.coin('coin--xs')} ${fmt(round.bet * m)}`);
        }
        raf = requestAnimationFrame(tick);
      }

      function finish() {
        lastBeep = 1;
        round = null;
        betIn.disable(false);
        autoIn.disabled = false;
        btn.disabled = false;
        btn.textContent = 'Décoller';
        btn.classList.replace('btn--cash', 'btn--primary');
        winOut.set('—');
      }

      function addHistory(c) {
        const p = ui.el(`<span class="pill ${c >= 2 ? 'good' : c < 1.2 ? 'bad' : ''}">${fmtMult(c)}</span>`);
        histEl.prepend(p);
        while (histEl.children.length > 8) histEl.lastChild.remove();
      }

      btn.addEventListener('click', () => {
        if (!round) launch();
        else if (performance.now() >= round.t0) cashout(multAt(performance.now() - round.t0));
      });
      const onKey = (e) => {
        if (e.code === 'Space' && !e.target.closest('input')) { e.preventDefault(); if (!btn.disabled) btn.click(); }
      };
      window.addEventListener('keydown', onKey);
      const onResize = () => { size(); if (!round) draw(0, 1, 'pad'); };
      window.addEventListener('resize', onResize);
      size();
      draw(0, 1, 'pad');
      pilot.onload = () => { if (!round) draw(0, 1, 'pad'); };

      return () => {
        alive = false;
        cancelAnimationFrame(raf);
        if (engine) engine.stop();
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        // Quitter ne rembourse jamais : si le vol a dépassé 1.01× on encaisse comme avec le bouton,
        // sinon la manche se termine sans toi (auto-encaissement s'il est réglé, sinon mise perdue).
        if (round && !round.cashed && !round.over) {
          const now = performance.now();
          const m = now >= round.t0 ? multAt(now - round.t0) : 1;
          if (m >= MIN_CASH && m < round.crash) settle('rocket', round.bet, round2(round.bet * m), { silent: true });
          else if (round.auto && round.auto <= round.crash) settle('rocket', round.bet, round2(round.bet * round.auto), { silent: true });
          else settle('rocket', round.bet, 0, { silent: true });
        }
      };
    }
  });
})();
