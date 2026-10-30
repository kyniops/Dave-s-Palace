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
    isNew: true,
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

      stage.innerHTML = `<div class="flip-scene"><div class="flip-coin">
          <div class="flip-coin__face dave"><img src="${IMG}davecoin.png" alt="DaveCoin"></div>
          <div class="flip-coin__face jpz"><img src="${IMG}jpz.png" alt="JPZ"></div>
        </div></div><div class="flip-shadow"></div><div class="streak"></div>`;
      const coin = stage.querySelector('.flip-coin');
      const streakEl = stage.querySelector('.streak');
      const sideBtns = [...sidesEl.querySelectorAll('.side-btn')];

      let side = 'dave', rot = 0, flipping = false, alive = true;
      let run = null; // { bet, wins }

      function paint() {
        sideBtns.forEach((b) => { b.classList.toggle('on', b.dataset.side === side); b.disabled = flipping; });
        const m = run ? Math.pow(STEP, run.wins) : 1;
        multOut.set(run && run.wins ? `${fmtMult(m)} → ${fmtMult(m * STEP)}` : fmtMult(STEP));
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

      async function flip() {
        if (flipping) return;
        if (!run) {
          const bet = betIn.get();
          if (!wallet.place(bet)) return;
          betIn.remember();
          run = { bet, wins: 0 };
          streakEl.innerHTML = '';
          sound.play('bet');
        }
        flipping = true;
        paint();
        const outcome = rng.float() < 0.5 ? 'dave' : 'jpz';
        run.pending = outcome;
        // La face DaveCoin est à 0°, la face JPZ à 180° : on ajoute 5 tours puis on vise la bonne face.
        const from = rot;
        const base = from - (from % 360) + 360 * 5;
        rot = base + (outcome === 'jpz' ? 180 : 0);
        sound.play('coin');
        const a = coin.animate(
          [{ transform: `rotateY(${from}deg) translateY(0)` }, { transform: `rotateY(${(from + rot) / 2}deg) translateY(-60px)`, offset: 0.5 }, { transform: `rotateY(${rot}deg) translateY(0)` }],
          { duration: 1300, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' }
        );
        await a.finished;
        if (!alive) return;
        coin.style.transform = `rotateY(${rot}deg)`;
        a.cancel();
        run.pending = null;
        flipping = false;

        const ok = outcome === side;
        streakEl.insertAdjacentHTML('beforeend', `<span class="pill ${ok ? 'good' : 'bad'}">${SIDES[outcome].label}</span>`);
        if (ok) {
          run.wins++;
          sound.play('gem');
          if (run.wins >= MAX_STREAK) return cashout();
        } else {
          settle('flip', run.bet, 0);
          ui.result(stage, { win: false, label: SIDES[outcome].label });
          run = null;
        }
        paint();
      }

      function cashout() {
        if (!run || !run.wins || flipping) return;
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
