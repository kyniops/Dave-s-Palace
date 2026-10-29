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
    icon: '🚀',
    tagline: 'Encaisse avant que JPZ ne s’écrase',
    rtp: '99 %',
    isNew: true,
    colors: ['#06b6d4', '#1e1b4b'],
    art: `<div class="art-stack"><img src="${IMG}jpz.png" alt="" style="width:58%;left:21%;top:12%"><span style="position:absolute;right:10%;bottom:6%;font-size:54px">🚀</span></div>`,
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
        ctx.strokeStyle = 'rgba(255,255,255,.06)';
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        ctx.font = '600 11px Outfit, sans-serif';
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

        if (elapsed <= 0) return;
        // courbe
        const color = state === 'crashed' ? '#ff4d6d' : '#f5c451';
        const grad = ctx.createLinearGradient(0, Y(m), 0, Y(1));
        grad.addColorStop(0, state === 'crashed' ? 'rgba(255,77,109,.35)' : 'rgba(245,196,81,.35)');
        grad.addColorStop(1, 'rgba(245,196,81,0)');
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
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.shadowBlur = 0;

        if (round && round.cashMult && round.cashMult <= m) {
          const ct = msFor(round.cashMult);
          ctx.fillStyle = '#34d77f';
          ctx.beginPath(); ctx.arc(X(ct), Y(round.cashMult), 6, 0, Math.PI * 2); ctx.fill();
        }

        // fusée + pilote
        const x = X(elapsed), y = Y(m);
        const dx = X(elapsed) - X(elapsed * 0.97), dy = Y(m) - Y(multAt(elapsed * 0.97));
        const ang = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(x, y);
        if (state === 'crashed') {
          ctx.font = '54px serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('💥', 0, 0);
        } else {
          ctx.rotate(ang + Math.PI / 4);
          ctx.font = '42px serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('🚀', 0, 0);
          ctx.rotate(-(ang + Math.PI / 4));
          if (pilot.complete && pilot.naturalWidth) ctx.drawImage(pilot, -18, -58, 36, 36);
        }
        ctx.restore();
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

      function launch() {
        const bet = betIn.get();
        const autoVal = parseFloat(autoIn.value) || 0;
        if (autoVal && autoVal < 1.01) { ui.toast('L’auto-encaissement doit être ≥ 1.01×', 'error'); return; }
        if (!wallet.place(bet)) return;
        betIn.remember();
        store.set('dp_rocket_auto', String(autoVal));
        sound.play('bet');
        round = { bet, crash: crashPoint(), t0: performance.now(), cashed: false, cashMult: 0, auto: autoVal, over: false };
        betIn.disable(true);
        autoIn.disabled = true;
        btn.classList.replace('btn--gold', 'btn--green');
        stage.querySelectorAll('.result-pop').forEach((n) => n.remove());
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
      }

      function cashout(m) {
        if (!round || round.cashed || round.over) return;
        round.cashed = true;
        round.cashedAt = performance.now();
        round.cashMult = round2(m);
        const pay = round2(round.bet * round.cashMult);
        settle('rocket', round.bet, pay);
        ui.result(stage, { win: true, mult: round.cashMult, amount: pay });
        btn.disabled = true;
        btn.textContent = 'Encaissé !';
      }

      let lastBeep = 1;
      function tick(now) {
        if (!alive || !round) return;
        const elapsed = now - round.t0;
        let m = multAt(elapsed);
        if (round.auto && !round.cashed && m >= round.auto && round.auto <= round.crash) cashout(round.auto);
        // Une fois encaissé, on laisse voler 1,5 s puis on révèle le point de crash.
        const reveal = round.cashed && now - round.cashedAt > 1500;
        if (m >= round.crash || reveal) {
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
          draw(el, m, 'crashed');
          setMult(m, round.cashed ? `Encaissé à ${round.cashMult.toFixed(2)}×` : 'Crash !', 'crashed');
          if (!round.cashed) { settle('rocket', round.bet, 0); sound.play('boom'); }
          addHistory(round.crash);
          finish();
          return;
        }
        if (m - lastBeep > 0.25) { lastBeep = m; sound.play('tick'); }
        draw(elapsed, m, 'flying');
        if (round.cashed) setMult(m, `Encaissé à ${round.cashMult.toFixed(2)}× · +${fmt(round.bet * round.cashMult)}`, 'cashed');
        else {
          setMult(m, 'En vol…');
          btn.innerHTML = `Encaisser ${fmt(round.bet * m)}`;
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
        btn.classList.replace('btn--green', 'btn--gold');
        winOut.set('—');
      }

      function addHistory(c) {
        const p = ui.el(`<span class="pill ${c >= 2 ? 'good' : c < 1.2 ? 'bad' : ''}">${fmtMult(c)}</span>`);
        histEl.prepend(p);
        while (histEl.children.length > 8) histEl.lastChild.remove();
      }

      btn.addEventListener('click', () => {
        if (!round) launch();
        else cashout(multAt(performance.now() - round.t0));
      });
      const onKey = (e) => {
        if (e.code === 'Space' && !e.target.closest('input')) { e.preventDefault(); btn.click(); }
      };
      window.addEventListener('keydown', onKey);
      const onResize = () => { size(); if (!round) draw(0, 1); };
      window.addEventListener('resize', onResize);
      size();
      draw(0, 1);
      pilot.onload = () => { if (!round) draw(0, 1); };

      return () => {
        alive = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        // En quittant en plein vol, on encaisse au multiplicateur courant (forcément < crash).
        if (round && !round.cashed && !round.over) {
          const m = Math.min(multAt(performance.now() - round.t0), round.crash);
          if (m < round.crash) settle('rocket', round.bet, round2(round.bet * m));
          else settle('rocket', round.bet, 0);
        }
      };
    }
  });
})();
