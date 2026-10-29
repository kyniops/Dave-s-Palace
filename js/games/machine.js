/* DaveMachine — machine à sous 3 rouleaux, 3 rangées, 5 lignes. RTP théorique ≈ 96,9 %. */
(function () {
  'use strict';
  const { IMG, rng, fmt, wallet, settle, sound, ui, sleep, round2 } = DP;

  // Poids = nombre d'occurrences sur chaque rouleau. Gains exprimés en multiple de la mise par ligne.
  const SYMBOLS = [
    { k: 'dave', src: 'davecoin.png', w: 2, p3: 500, p2: 25 },
    { k: 'jpz', src: 'jpz.png', w: 3, p3: 200, p2: 10, round: true },
    { k: 'casino', src: 'casino.png', w: 4, p3: 100, p2: 5 },
    { k: 'axb', src: 'axb.png', w: 5, p3: 50, p2: 3, round: true },
    { k: 'sauce', src: 'sauceblanche.png', w: 5, p3: 50, p2: 3, round: true },
    { k: 'tdam', src: 'tdam.png', w: 6, p3: 25, p2: 2, round: true },
    { k: 'slyme', src: 'slymefire.png', w: 6, p3: 25, p2: 2, round: true },
    { k: 'sevare', src: 'sevare.png', w: 6, p3: 25, p2: 2, round: true },
    { k: 'olman', src: 'olman.png', w: 6, p3: 25, p2: 2, round: true }
  ];
  const BY_KEY = Object.fromEntries(SYMBOLS.map((s) => [s.k, s]));
  const LINES = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]];

  function buildStrip() {
    const strip = [];
    SYMBOLS.forEach((s) => { for (let i = 0; i < s.w; i++) strip.push(s.k); });
    return rng.shuffle(strip);
  }

  const symHtml = (k) => {
    const s = BY_KEY[k];
    return `<div class="sym${s.round ? ' round' : ''}" data-k="${k}"><img src="${IMG}${s.src}" alt="${k}" draggable="false"></div>`;
  };

  function evaluate(grid, bet) {
    const lineBet = bet / LINES.length;
    const wins = [];
    LINES.forEach((ln, i) => {
      const [a, b, c] = ln.map((row, reel) => grid[reel][row]);
      if (a === b && b === c) wins.push({ line: i, count: 3, amount: lineBet * BY_KEY[a].p3 });
      else if (a === b) wins.push({ line: i, count: 2, amount: lineBet * BY_KEY[a].p2 });
    });
    return { wins, total: round2(wins.reduce((s, w) => s + w.amount, 0)) };
  }

  DP.games.register({
    id: 'machine',
    name: 'DaveMachine',
    icon: '🎰',
    tagline: 'La machine à sous du roi, 5 lignes',
    rtp: '96,9 %',
    hot: true,
    colors: ['#f59e0b', '#7c2d12'],
    art: `<img src="${IMG}casino.png" alt="">`,
    rules: `<p>Mise répartie sur <strong>5 lignes</strong> : 3 horizontales et 2 diagonales.</p>
      <ul><li><strong>3 symboles identiques</strong> sur une ligne : gros gain.</li>
      <li><strong>2 symboles identiques</strong> sur les rouleaux 1 et 2 d’une ligne : petit gain.</li>
      <li>La DaveCoin est le symbole le plus rare : 3 DaveCoins = <strong>×100</strong> ta mise totale.</li></ul>
      <p>Le mode Auto relance tout seul jusqu’à ce que tu l’arrêtes ou que ton solde soit insuffisant.</p>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      const strips = [buildStrip(), buildStrip(), buildStrip()];
      const betIn = ui.betInput(panel, { gameId: 'machine', initial: 10 });
      const winOut = ui.readout(panel, 'Dernier gain', '—');
      const spinBtn = ui.button(panel, 'Lancer');
      const row = ui.el('<div class="panel__row"></div>');
      panel.appendChild(row);
      const autoBtn = ui.button(row, 'Auto', 'btn btn--ghost');
      const turboBtn = ui.button(row, 'Turbo', 'btn btn--ghost');
      panel.appendChild(ui.el('<p class="note">Espace = lancer</p>'));

      stage.innerHTML = `
        <div class="slot">
          <div class="slot__frame">
            <div class="slot__marquee">♛ DAVE’S PALACE ♛</div>
            <div class="slot__window">
              ${[0, 1, 2].map(() => '<div class="reel"><div class="reel__strip"></div></div>').join('')}
              <svg class="slot__lines" preserveAspectRatio="none" viewBox="0 0 300 300">
                ${LINES.map((ln) => `<polyline points="${ln.map((r, i) => `${50 + i * 100},${50 + r * 100}`).join(' ')}"/>`).join('')}
              </svg>
            </div>
            <div class="slot__win"></div>
          </div>
        </div>
        <div class="paytable">
          ${SYMBOLS.map((s) => `<div><img class="${s.round ? 'round' : ''}" src="${IMG}${s.src}" alt=""><span>3× <b>×${s.p3 / 5}</b><br>2× ×${round2(s.p2 / 5)}</span></div>`).join('')}
        </div>`;

      const reels = [...stage.querySelectorAll('.reel')];
      const lineEls = [...stage.querySelectorAll('.slot__lines polyline')];
      const winEl = stage.querySelector('.slot__win');
      const stops = [0, 0, 0].map(() => rng.int(0, strips[0].length - 1));
      let spinning = false, auto = false, turbo = false, alive = true;
      let pending = null; // spin payé mais pas encore réglé

      const visible = (reel, stop) => {
        const s = strips[reel], L = s.length;
        return [s[(stop - 1 + L) % L], s[stop], s[(stop + 1) % L]];
      };
      const cellSize = () => {
        const w = Math.round(reels[0].clientWidth * 0.82);
        stage.querySelector('.slot').style.setProperty('--cell', w + 'px');
        return w;
      };
      reels.forEach((r, i) => (r.firstElementChild.innerHTML = visible(i, stops[i]).map(symHtml).join('')));
      cellSize();
      const onResize = () => cellSize();
      window.addEventListener('resize', onResize);

      async function spin() {
        if (spinning) return;
        const bet = betIn.get();
        if (!wallet.place(bet)) { stopAuto(); return; }
        betIn.remember();
        spinning = true;
        betIn.disable(true);
        spinBtn.disabled = true;
        lineEls.forEach((l) => l.classList.remove('show'));
        winEl.textContent = '';
        sound.play('bet');

        const cell = cellSize();
        const grid = [];
        const anims = reels.map((reel, i) => {
          stops[i] = rng.int(0, strips[i].length - 1);
          const target = visible(i, stops[i]);
          grid.push(target);
          const filler = Array.from({ length: (turbo ? 8 : 16) + i * (turbo ? 3 : 6) }, () => rng.pick(strips[i]));
          const current = [...reel.firstElementChild.children].map((n) => n.dataset.k);
          const seq = [...current, ...filler, ...target];
          const strip = reel.firstElementChild;
          strip.innerHTML = seq.map(symHtml).join('');
          const dist = (seq.length - 3) * cell;
          const dur = (turbo ? 450 : 900) + i * (turbo ? 180 : 380);
          const a = strip.animate(
            [{ transform: 'translateY(0)' }, { transform: `translateY(-${dist}px)` }],
            { duration: dur, easing: 'cubic-bezier(.25,.1,.25,1.08)', fill: 'forwards' }
          );
          const ticker = setInterval(() => sound.play('tick'), 90);
          return a.finished.then(() => {
            clearInterval(ticker);
            if (!alive) return;
            a.cancel();
            strip.innerHTML = target.map(symHtml).join('');
            sound.play('chip');
          });
        });
        pending = { bet, grid };
        await Promise.all(anims);
        if (!alive) return;

        const { wins, total } = evaluate(grid, bet);
        pending = null;
        settle('machine', bet, total);
        if (total > 0) {
          wins.forEach((w) => {
            lineEls[w.line].classList.add('show');
            LINES[w.line].slice(0, w.count).forEach((r, reel) => reels[reel].firstElementChild.children[r].classList.add('win'));
          });
          winEl.innerHTML = `GAGNÉ ${fmt(total)}`;
          winOut.set(`<span class="pos">+${fmt(total)}</span>`);
          if (total >= bet * 5) ui.result(stage, { win: true, mult: total / bet, amount: total });
        } else {
          winOut.set('0');
        }
        spinning = false;
        spinBtn.disabled = false;
        betIn.disable(auto);
        if (auto) {
          await sleep(total > 0 ? (turbo ? 700 : 1300) : (turbo ? 200 : 450));
          if (alive && auto) spin();
        }
      }

      function stopAuto() {
        auto = false;
        autoBtn.textContent = 'Auto';
        autoBtn.classList.remove('btn--gold');
        autoBtn.classList.add('btn--ghost');
        if (!spinning) betIn.disable(false);
      }
      spinBtn.addEventListener('click', spin);
      autoBtn.addEventListener('click', () => {
        if (auto) return stopAuto();
        auto = true;
        autoBtn.textContent = 'Stop';
        autoBtn.classList.add('btn--gold');
        autoBtn.classList.remove('btn--ghost');
        betIn.disable(true);
        spin();
      });
      turboBtn.addEventListener('click', () => {
        turbo = !turbo;
        turboBtn.classList.toggle('btn--gold', turbo);
        turboBtn.classList.toggle('btn--ghost', !turbo);
        sound.play('click');
      });
      const onKey = (e) => {
        if (e.code === 'Space' && !e.target.closest('input')) { e.preventDefault(); spin(); }
      };
      window.addEventListener('keydown', onKey);

      return () => {
        alive = false;
        auto = false;
        if (pending) settle('machine', pending.bet, evaluate(pending.grid, pending.bet).total);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', onKey);
      };
    }
  });
})();
