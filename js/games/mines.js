/* DaveMine — grille 5×5, évite les bombes, encaisse quand tu veux. RTP 99 %. */
(function () {
  'use strict';
  const { IMG, rng, fmt, fmtMult, wallet, settle, sound, ui, round2 } = DP;
  const CELLS = 25;
  const EDGE = 0.99;

  /** Multiplicateur après `picks` cases sûres avec `mines` bombes. */
  function multiplier(mines, picks) {
    let m = EDGE;
    for (let i = 0; i < picks; i++) m *= (CELLS - i) / (CELLS - mines - i);
    return picks === 0 ? 1 : m;
  }

  DP.games.register({
    id: 'mines',
    name: 'DaveMine',
    icon: 'bomb',
    tagline: 'Trouve les DaveCoins, évite les bombes',
    rtp: '99 %',
    hot: true,
    hue: 4,
    art: `<div class="art-mines">${[1, 0, 1, 0, 2, 1, 1, 1, 0].map((k) => `<i class="${k === 1 ? 'g' : k === 2 ? 'b' : ''}">${k === 1 ? `<img src="${IMG}davecoin.png" alt="">` : k === 2 ? DP.ui.icon('bomb') : ''}</i>`).join('')}</div>`,
    rules: `<p>Choisis le nombre de bombes cachées dans la grille de 25 cases, puis lance la partie.</p>
      <ul><li>Chaque DaveCoin trouvé augmente ton multiplicateur.</li>
      <li>Plus il y a de bombes, plus chaque case rapporte.</li>
      <li>Tombe sur une bombe et tu perds ta mise. Encaisse à tout moment !</li></ul>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      const betIn = ui.betInput(panel, { gameId: 'mines', initial: 10 });
      const minesField = ui.el(`<div class="field"><div class="field__head"><label>Bombes</label></div>
        <select>${Array.from({ length: 24 }, (_, i) => `<option value="${i + 1}"${i + 1 === 3 ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></div>`);
      panel.appendChild(minesField);
      const minesSel = minesField.querySelector('select');
      const nextOut = ui.readout(panel, 'Prochaine case', '—');
      const profitOut = ui.readout(panel, 'Gain actuel', '—');
      const playBtn = ui.button(panel, 'Jouer');
      const randBtn = ui.button(panel, ui.icon('shuffle', 'i--sm') + 'Case au hasard', 'btn btn--ghost btn--block');
      randBtn.disabled = true;

      stage.innerHTML = `<div class="stage__top"><span></span><div class="pill-row"><span class="pill hi js-mult">1.00×</span></div></div>
        <div class="mines-grid idle">${Array.from({ length: CELLS }, (_, i) => `<button class="tile-btn" type="button" data-i="${i}" disabled aria-label="Case ${i + 1}"></button>`).join('')}</div>`;
      const gridEl = stage.querySelector('.mines-grid');
      const tiles = [...gridEl.children];
      const multPill = stage.querySelector('.js-mult');

      let game = null; // { bet, mines:Set, picks, opened:Set }

      const paint = () => {
        const m = +minesSel.value;
        if (!game) {
          nextOut.set(fmtMult(multiplier(m, 1)));
          profitOut.set('—');
          multPill.textContent = '1.00×';
          return;
        }
        const cur = multiplier(game.m, game.picks);
        const left = CELLS - game.m - game.picks;
        nextOut.set(left > 0 ? fmtMult(multiplier(game.m, game.picks + 1)) : '—');
        profitOut.set(game.picks ? `${ui.coin('coin--xs')} ${fmt(game.bet * cur)}` : '—');
        multPill.textContent = fmtMult(cur);
        playBtn.innerHTML = game.picks ? `Encaisser ${fmt(game.bet * cur)}` : 'Encaisser';
        playBtn.disabled = game.picks === 0;
      };
      minesSel.addEventListener('change', paint);

      const reveal = (tile, kind, ghost) => {
        tile.classList.add('open', kind);
        if (ghost) tile.classList.add('ghost');
        tile.innerHTML = kind === 'gem' ? `<img src="${IMG}davecoin.png" alt="DaveCoin">` : ui.icon('bomb');
      };

      let busy = false;
      const online = () => DP.engine && DP.engine.on;
      async function start() {
        const bet = betIn.get();
        const m = +minesSel.value;
        if (busy) return;
        if (online()) {
          // en ligne : les bombes sont placées et gardées secrètes par le serveur
          busy = true;
          const r = await DP.engine.call('mines_start', { p_bet: bet, p_mines: m });
          busy = false;
          if (!r || !alive) return;
        } else if (!wallet.place(bet)) return;
        betIn.remember();
        sound.play('bet');
        const order = rng.shuffle([...Array(CELLS).keys()]);
        game = { bet, m, mines: new Set(online() ? [] : order.slice(0, m)), picks: 0, opened: new Set(), online: online() };
        tiles.forEach((t) => { t.className = 'tile-btn'; t.innerHTML = ''; t.disabled = false; });
        gridEl.classList.remove('idle');
        betIn.disable(true);
        minesSel.disabled = true;
        randBtn.disabled = false;
        playBtn.classList.replace('btn--primary', 'btn--cash');
        stage.querySelectorAll('.result-pop').forEach((n) => n.remove());
        paint();
      }

      let alive = true;
      function end(won, payout) {
        const g = game;
        game = null;
        tiles.forEach((t, i) => {
          t.disabled = true;
          if (!g.opened.has(i)) reveal(t, g.mines.has(i) ? 'mine' : 'gem', true);
        });
        gridEl.classList.add('idle');
        betIn.disable(false);
        minesSel.disabled = false;
        randBtn.disabled = true;
        playBtn.disabled = false;
        playBtn.textContent = 'Jouer';
        playBtn.classList.replace('btn--cash', 'btn--primary');
        const mult = multiplier(g.m, g.picks);
        if (won) {
          const pay = payout != null ? payout : round2(g.bet * mult);
          settle('mines', g.bet, pay, { silent: true });
          sound.play('cashout');
          sound.play('win', { x: mult });
          ui.result(stage, { win: true, mult, amount: pay });
        } else {
          settle('mines', g.bet, 0, { silent: true });
          sound.play('boom');
          ui.shake(gridEl, 2);
          ui.flash(stage, 'rgba(255,93,82,.35)');
          const hit = gridEl.querySelector('.tile-btn.hit');
          if (hit) ui.burst(hit, { n: 26, colors: ['#ff5d52', '#ffc65c', '#ffffff'], spread: 1.5 });
        }
        paint();
      }

      async function pick(i) {
        if (!game || game.opened.has(i) || busy) return;
        const tile = tiles[i];
        let srv = null;
        if (game.online) {
          busy = true;
          srv = await DP.engine.call('mines_pick', { p_cell: i });
          busy = false;
          if (!srv || !game) return;
          if (srv.mines) srv.mines.forEach((c) => game.mines.add(c));
        }
        game.opened.add(i);
        tile.disabled = true;
        if (srv ? srv.mine : game.mines.has(i)) {
          reveal(tile, 'mine');
          tile.classList.add('hit');
          end(false);
          return;
        }
        game.picks++;
        reveal(tile, 'gem');
        sound.play('gem', { i: game.picks - 1 });
        ui.burst(tile, { n: 10 + game.picks, colors: ['#ff6b2c', '#ffc65c', '#ffffff'] });
        ui.floatText(tile, fmtMult(multiplier(game.m, game.picks)));
        if (game.picks >= 3) multPill.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.2,1.6,.4,1)' });
        if (srv && srv.done) { end(true, srv.payout); return; }
        if (game.picks === CELLS - game.m) { end(true); return; }
        paint();
      }

      gridEl.addEventListener('click', (e) => {
        const t = e.target.closest('.tile-btn');
        if (t) pick(+t.dataset.i);
      });
      randBtn.addEventListener('click', () => {
        if (!game) return;
        const free = tiles.map((_, i) => i).filter((i) => !game.opened.has(i));
        pick(rng.pick(free));
      });
      async function cash() {
        if (!game || game.picks < 1 || busy) return;
        if (game.online) {
          busy = true;
          const r = await DP.engine.call('mines_cash');
          busy = false;
          if (!r || !game) return;
          (r.mines || []).forEach((c) => game.mines.add(c));
          end(true, r.payout);
          return;
        }
        end(true);
      }
      playBtn.addEventListener('click', () => {
        if (!game) start();
        else if (game.picks > 0) cash();
      });
      paint();

      return () => {
        alive = false;
        if (!game) return;
        // en ligne : le serveur encaisse (ou rend la mise si aucune case n'est ouverte)
        if (game.online) { DP.engine.call('mines_cash', {}, { silent: true }); return; }
        if (game.picks > 0) end(true); // on encaisse automatiquement en quittant
        else { wallet.credit(game.bet); game = null; } // aucune case ouverte : mise rendue
      };
    }
  });
})();
