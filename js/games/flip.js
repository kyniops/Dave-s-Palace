/* DaveFlip — pile (DaveCoin) ou face (JPZ). Enchaîne les victoires pour multiplier. RTP 99 %. */
(function () {
  'use strict';
  const { IMG, rng, fmt, fmtMult, wallet, settle, sound, ui, round2 } = DP;
  const STEP = 1.98;
  const MAX_STREAK = 20;
  const SIDES = {
    dave: { label: 'DaveCoin', src: 'davecoin.png' },
    jpz: { label: 'JPZ', src: 'jpz.png' }
  };

  DP.games.register({
    id: 'flip',
    name: 'DaveFlip',
    icon: 'coins',
    tagline: 'DaveCoin ou JPZ ? Double ou rien',
    rtp: '99 %',
    hue: 75,
    art: `<div class="art-flip"><img class="a" src="${IMG}davecoin.png" alt=""><img class="b" src="${IMG}jpz.png" alt=""></div>`,
    rules: `<p>Choisis un côté et lance la pièce : <strong>DaveCoin</strong> ou <strong>JPZ</strong>, 50/50.</p>
      <ul><li>Chaque bonne réponse multiplie ton gain par <strong>×1,98</strong>.</li>
      <li>Après une victoire, relance pour continuer la série… ou encaisse.</li>
      <li>Une erreur et la série est perdue.</li></ul>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      const betIn = ui.betInput(panel, { gameId: 'flip', initial: 10 });
      const sidesEl = ui.el(`<div class="field"><div class="field__head"><label>Ton choix</label></div>
        <div class="sides">${Object.entries(SIDES).map(([k, s]) => `<button type="button" class="side-btn ${k}" data-side="${k}"><img src="${IMG}${s.src}" alt="">${s.label}</button>`).join('')}</div></div>`);
      panel.appendChild(sidesEl);
      const multOut = ui.readout(panel, 'Multiplicateur', '1.00×');
      const flipBtn = ui.button(panel, 'Lancer la pièce');
      const cashBtn = ui.button(panel, 'Encaisser', 'btn btn--cash btn--lg btn--block');
      cashBtn.disabled = true;

      // tranche de la pièce : fines couches empilées entre les deux faces
      const EDGE = 14;
      const edge = Array.from({ length: EDGE }, (_, i) => `<i class="fc-edge" style="transform:translateZ(calc(var(--t) * ${((i / (EDGE - 1) - 0.5) * 0.88).toFixed(3)}))"></i>`).join('');
      stage.innerHTML = `<div class="flip-arena"><div class="flip-scene"><div class="flip-lift"><div class="flip-coin">
          <div class="flip-coin__face dave"><span class="fc-dots"></span><img src="${IMG}davecoin.png" alt="DaveCoin"></div>
          ${edge}
          <div class="flip-coin__face jpz"><span class="fc-dots"></span><img src="${IMG}jpz.png" alt="JPZ"></div>
        </div></div></div><div class="flip-pad"><div class="flip-shadow"></div></div></div>
        <div class="streak"></div><p class="flip-next"></p>`;
      const coin = stage.querySelector('.flip-coin');
      const lift = stage.querySelector('.flip-lift');
      const shadow = stage.querySelector('.flip-shadow');
      const nextEl = stage.querySelector('.flip-next');
      coin.style.transform = 'rotateX(0deg)';
      const streakEl = stage.querySelector('.streak');
      const sideBtns = [...sidesEl.querySelectorAll('.side-btn')];

      let side = 'dave', rot = 0, flipping = false, alive = true;
      let run = null; // { bet, wins }

      function paint() {
        sideBtns.forEach((b) => { b.classList.toggle('on', b.dataset.side === side); b.disabled = flipping; });
        const m = run ? Math.pow(STEP, run.wins) : 1;
        multOut.set(run && run.wins ? `${fmtMult(m)} → ${fmtMult(m * STEP)}` : fmtMult(STEP));
        nextEl.innerHTML = run && run.wins ? `Série de ${run.wins} · prochain lancer <b>${fmtMult(m * STEP)}</b>` : `Choisis ton côté · gain <b>${fmtMult(STEP)}</b>`;
        betIn.disable(!!run || flipping);
        flipBtn.disabled = flipping;
        flipBtn.textContent = run && run.wins ? 'Relancer' : 'Lancer la pièce';
        cashBtn.disabled = flipping || !run || !run.wins;
        cashBtn.innerHTML = run && run.wins ? `Encaisser ${fmt(run.bet * m)}` : 'Encaisser';
      }
      sidesEl.addEventListener('click', (e) => {
        const b = e.target.closest('.side-btn');
        if (!b || flipping) return;
        side = b.dataset.side;
        sound.play('click');
        paint();
      });

      let srv = null; // dernière réponse du serveur (en ligne)
      async function flip() {
        if (flipping) return;
        const E = DP.engine;
        if (E && E.on) {
          // en ligne : le serveur lance la pièce (et débite la mise au premier lancer)
          flipping = true; paint();
          srv = await E.call('flip_toss', { p_bet: run ? run.bet : betIn.get(), p_side: side }, { defer: true });
          flipping = false;
          if (!srv || !alive) { paint(); return; }
          if (!run) { betIn.remember(); E.debitView(betIn.get()); run = { bet: betIn.get(), wins: 0 }; streakEl.innerHTML = ''; sound.play('bet'); }
        } else if (!run) {
          const bet = betIn.get();
          if (!wallet.place(bet)) return;
          betIn.remember();
          run = { bet, wins: 0 };
          streakEl.innerHTML = '';
          sound.play('bet');
        }
        flipping = true;
        paint();
        const outcome = srv ? srv.outcome : rng.float() < 0.5 ? 'dave' : 'jpz';
        run.pending = outcome;
        // La face DaveCoin est à 0°, la face JPZ à 180° : on ajoute 5 tours puis on vise la bonne face.
        const from = rot;
        const base = from - (from % 360) + 360 * 5;
        rot = base + (outcome === 'jpz' ? 180 : 0);
        sound.play('flip');
        // la pièce tourne sur son axe horizontal pendant qu'elle monte puis retombe avec un petit rebond
        const DUR = 1500;
        const a = coin.animate(
          [{ transform: `rotateX(${from}deg)` }, { transform: `rotateX(${rot}deg)` }],
          { duration: DUR * 0.86, easing: 'cubic-bezier(.25,.6,.35,1)', fill: 'forwards' }
        );
        lift.animate([
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(-170px) scale(1.18)', offset: 0.42, easing: 'cubic-bezier(.4,0,.8,.6)' },
          { transform: 'translateY(0) scale(1)', offset: 0.86 },
          { transform: 'translateY(-18px) scale(1.02)', offset: 0.93 },
          { transform: 'translateY(0) scale(1)' }
        ], { duration: DUR, easing: 'cubic-bezier(.2,.7,.4,1)' });
        shadow.animate([
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
          { transform: 'translate(-50%,-50%) scale(.45)', opacity: 0.35, offset: 0.42 },
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.86 },
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }
        ], { duration: DUR });
        setTimeout(() => alive && sound.play('chip'), DUR * 0.86);
        await new Promise((r) => setTimeout(r, DUR));
        if (!alive) return;
        coin.style.transform = `rotateX(${rot}deg)`;
        a.cancel();
        run.pending = null;
        flipping = false;
        if (srv) DP.engine.reveal(srv.acct);

        const ok = outcome === side;
        streakEl.insertAdjacentHTML('beforeend', `<span class="fmini ${ok ? 'good' : 'bad'}" title="${SIDES[outcome].label}"><img src="${IMG}${SIDES[outcome].src}" alt=""></span>`);
        if (ok) {
          run.wins++;
          sound.play('gem', { i: run.wins + 1 });
          ui.burst(coin, { n: 14 + run.wins * 4, spread: 1.3 });
          ui.floatText(coin, fmtMult(Math.pow(STEP, run.wins)));
          coin.parentElement.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'cubic-bezier(.2,1.6,.4,1)' });
          if (srv && srv.done) { ui.result(stage, { win: true, mult: Math.pow(STEP, run.wins), amount: srv.payout }); sound.play('jackpot'); run = null; srv = null; paint(); return; }
          if (run.wins >= MAX_STREAK) return cashout();
        } else {
          settle('flip', run.bet, 0);
          ui.shake(stage, 1);
          ui.result(stage, { win: false, label: SIDES[outcome].label });
          run = null;
        }
        paint();
      }

      async function cashout() {
        if (!run || !run.wins || flipping) return;
        if (DP.engine && DP.engine.on) {
          flipping = true; paint();
          const r = await DP.engine.call('flip_cash');
          flipping = false;
          if (!r) { paint(); return; }
          settle('flip', run.bet, r.payout);
          ui.result(stage, { win: true, mult: r.payout / run.bet, amount: r.payout });
          run = null; srv = null;
          paint();
          return;
        }
        const m = Math.pow(STEP, run.wins);
        const pay = round2(run.bet * m);
        settle('flip', run.bet, pay);
        ui.result(stage, { win: true, mult: m, amount: pay });
        run = null;
        paint();
      }

      flipBtn.addEventListener('click', flip);
      cashBtn.addEventListener('click', cashout);
      const onKey = (e) => { if (e.code === 'Space' && !e.target.closest('input')) { e.preventDefault(); flip(); } };
      window.addEventListener('keydown', onKey);
      paint();

      return () => {
        alive = false;
        window.removeEventListener('keydown', onKey);
        if (!run) return;
        // en ligne : le serveur encaisse la série en cours (le lancer est déjà joué de son côté)
        if (DP.engine && DP.engine.on) { if (run.wins > 0 || (srv && srv.win && !srv.done)) DP.engine.call('flip_cash', {}, { silent: true }); return; }
        // En quittant : le lancer en cours est résolu, puis on encaisse la série.
        let wins = run.wins;
        if (run.pending) {
          if (run.pending === side) wins++;
          else { settle('flip', run.bet, 0); return; }
        }
        if (wins) settle('flip', run.bet, round2(run.bet * Math.pow(STEP, wins)));
        else wallet.credit(run.bet);
      };
    }
  });
})();
