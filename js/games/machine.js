/* DaveMachine — machine à sous 5×3, 20 lignes, wild JPZ, scatter DaveCoin et free spins ×2.
 * Les maths sont dans slot-engine.js (RTP 96,1 %).
 */
(function () {
  'use strict';
  const { IMG, rng, fmt, wallet, settle, sound, ui, sleep, round2 } = DP;
  const S = window.DaveSlot;
  const ABORT = Symbol('abort');
  const TIERS = [{ x: 100, label: 'Epic win' }, { x: 40, label: 'Mega win' }, { x: 15, label: 'Big win' }];
  const ROUND = new Set(['axb', 'sauce', 'tdam', 'slyme', 'sevare', 'olman']);
  const NAMES = { wild: 'JPZ (wild)', scat: 'DaveCoin', casino: 'Casino', axb: 'AXB', sauce: 'Sauce Blanche', tdam: 'Tdam', slyme: 'Slymefire', sevare: 'Sévaré', olman: 'Olman', A: 'A', K: 'K', Q: 'Q' };

  function symHtml(k) {
    const d = S.SYMBOLS[k];
    if (d.glyph) return `<div class="sym k-low s-${k}" data-k="${k}"><b>${d.glyph}</b></div>`;
    const tag = k === 'wild' ? '<span class="sym__tag">Wild</span>' : k === 'scat' ? '<span class="sym__tag">Bonus</span>' : '';
    return `<div class="sym k-${d.kind} s-${k}${ROUND.has(k) ? ' round' : ''}" data-k="${k}"><img src="${IMG}${d.img}" alt="${NAMES[k]}" draggable="false">${tag}</div>`;
  }
  const miniSym = (k) => {
    const d = S.SYMBOLS[k];
    return d.glyph ? `<span class="pt-glyph s-${k}">${d.glyph}</span>` : `<img class="${ROUND.has(k) || k === 'wild' ? 'round' : ''}" src="${IMG}${d.img}" alt="">`;
  };

  const rulesHtml = () => `
    <p><strong>5 rouleaux, 3 rangées, 20 lignes.</strong> Les gains se lisent de gauche à droite à partir du premier rouleau. Ta mise est répartie sur les 20 lignes.</p>
    <ul>
      <li><strong>JPZ est le Wild</strong> (rouleaux 2 à 5) : il remplace tous les symboles sauf la DaveCoin.</li>
      <li><strong>3 DaveCoins ou plus</strong> n’importe où : <strong>15 free spins</strong> (20 pour 4, 25 pour 5) + gain direct ×2 / ×10 / ×50 la mise.</li>
      <li>Pendant les free spins, <strong>tous les gains sont doublés</strong>. Les DaveCoins qui retombent <strong>ajoutent</strong> des free spins.</li>
      <li><strong>Acheter le bonus</strong> : ${S.BONUS_BUY}× la mise pour déclencher directement 15 free spins.</li>
    </ul>
    <p class="muted">Table des gains (× la mise totale) pour 3 / 4 / 5 symboles :</p>
    <div class="paytable">${Object.keys(S.SYMBOLS).filter((k) => k !== 'scat').map((k) => `<div>${miniSym(k)}<span>${S.SYMBOLS[k].pays.map((p) => '×' + round2(p / S.LINES.length)).join(' · ')}</span></div>`).join('')}
      <div>${miniSym('scat')}<span>${[3, 4, 5].map((n) => S.SCATTER[n].spins + ' FS').join(' · ')}</span></div></div>`;

  DP.games.register({
    id: 'machine',
    name: 'DaveMachine',
    icon: 'cherry',
    tagline: '5 rouleaux, 20 lignes, free spins ×2',
    rtp: '96,1 %',
    hot: true,
    hue: 38,
    art: `<img src="${IMG}casino.png" alt="">`,
    rules: rulesHtml(),
    mount(root) {
      const { panel, stage } = ui.layout(root);
      const betIn = ui.betInput(panel, { label: 'Mise totale', gameId: 'machine', initial: 20 });
      const lineOut = ui.readout(panel, 'Mise par ligne', '');
      const winOut = ui.readout(panel, 'Dernier gain', '—');
      const spinBtn = ui.button(panel, 'Lancer');
      const row = ui.el('<div class="panel__row"></div>');
      panel.appendChild(row);
      const autoBtn = ui.button(row, ui.icon('repeat', 'i--sm') + 'Auto', 'btn btn--ghost');
      const turboBtn = ui.button(row, ui.icon('zap', 'i--sm') + 'Turbo', 'btn btn--ghost');
      const buyBtn = ui.button(panel, '', 'btn btn--ghost btn--block buy-btn');
      panel.appendChild(ui.el('<p class="note">Espace pour lancer · clic sur une annonce pour la passer</p>'));

      stage.classList.add('slot-stage');
      stage.innerHTML = `
        <div class="slot5">
          <div class="slot5__top">
            <span class="leds"><i></i><i></i><i></i><i></i></span>
            <strong>Dave’s Palace</strong>
            <span class="leds"><i></i><i></i><i></i><i></i></span>
          </div>
          <div class="fs-banner" hidden>
            <span class="fs-banner__count">${ui.icon('sparkles', 'i--sm')}<b class="num js-fs">0/0</b> free spins</span>
            <span class="fs-banner__mult num">×${S.FS_MULT}</span>
            <span class="fs-banner__win">Gain bonus <b class="num js-fswin">0</b></span>
          </div>
          <div class="slot5__window">
            ${[0, 1, 2, 3, 4].map(() => '<div class="reel5"><div class="reel5__strip"></div></div>').join('')}
            <svg class="slot5__lines" viewBox="0 0 500 300" preserveAspectRatio="none">
              ${S.LINES.map((ln) => `<polyline points="${ln.map((r, i) => `${50 + i * 100},${50 + r * 100}`).join(' ')}"/>`).join('')}
            </svg>
            <div class="slot5__overlay" hidden></div>
          </div>
          <div class="slot5__msg"><span class="js-msg">Bonne chance !</span></div>
        </div>`;

      const slot = stage.querySelector('.slot5');
      const reels = [...stage.querySelectorAll('.reel5')];
      const strips = reels.map((r) => r.firstElementChild);
      const lineEls = [...stage.querySelectorAll('.slot5__lines polyline')];
      const overlayEl = stage.querySelector('.slot5__overlay');
      const msgEl = stage.querySelector('.js-msg');
      const banner = stage.querySelector('.fs-banner');
      const fsCount = stage.querySelector('.js-fs');
      const fsWinEl = stage.querySelector('.js-fswin');

      let busy = false, auto = false, turbo = false, alive = true;
      let session = null; // { bet, stake, win, fsLeft, fsPlayed, fsTotal, fsWin } — win inclut déjà tous les tours tirés
      let cycleTimer = 0;

      const start = S.spin(rng.float).grid;
      strips.forEach((s, r) => (s.innerHTML = start[r].map(symHtml).join('')));

      const cellSize = () => {
        const c = Math.round(reels[0].clientWidth * 0.92);
        slot.style.setProperty('--cell', c + 'px');
        return c;
      };
      cellSize();
      const onResize = () => cellSize();
      window.addEventListener('resize', onResize);

      const wait = async (ms) => { await sleep(ms); if (!alive) throw ABORT; };
      const setMsg = (html) => (msgEl.innerHTML = html);

      function paintPanel() {
        const bet = betIn.get();
        lineOut.set(`${ui.coin('coin--xs')} ${fmt(round2(bet / S.LINES.length))}`);
        buyBtn.innerHTML = `${ui.icon('gift', 'i--sm')}Acheter le bonus · <span class="num">${fmt(round2(bet * S.BONUS_BUY))}</span>`;
        spinBtn.disabled = busy;
        buyBtn.disabled = busy || auto;
        betIn.disable(busy || auto);
      }
      betIn.onChange(paintPanel);

      function clearWins() {
        clearInterval(cycleTimer);
        lineEls.forEach((l) => l.classList.remove('show'));
        slot.classList.remove('has-win');
        stage.querySelectorAll('.sym.win').forEach((n) => n.classList.remove('win'));
      }

      /* ---------- Rotation des rouleaux ---------- */
      async function spinReels(grid) {
        clearWins();
        const cell = cellSize();
        slot.classList.add('spinning');
        sound.play('spin');
        // Anticipation : dès que 2 DaveCoins sont visibles, les rouleaux suivants ralentissent
        let offset = 0, seen = 0;
        const plan = grid.map((col, r) => {
          const anticip = seen >= 2;
          if (anticip) offset += turbo ? 600 : 1300;
          const dur = (turbo ? 380 : 750) + r * (turbo ? 110 : 230) + offset;
          seen += col.filter((k) => k === 'scat').length;
          return { dur, anticip };
        });
        let scatters = 0;
        const anims = strips.map((strip, r) => {
          const current = [...strip.children].map((n) => n.dataset.k);
          const filler = Array.from({ length: Math.round(plan[r].dur / (turbo ? 45 : 55)) }, () => rng.pick(S.STRIPS[r]));
          const seq = [...current, ...filler, ...grid[r]];
          strip.innerHTML = seq.map(symHtml).join('');
          const dist = (seq.length - 3) * cell;
          if (plan[r].anticip) {
            setTimeout(() => { if (alive) { reels[r].classList.add('anticip'); sound.play('anticip', { d: (plan[r].dur - plan[r - 1].dur) / 1000 }); } }, plan[r - 1].dur);
          }
          const a = strip.animate(
            [{ transform: 'translateY(0)', filter: 'blur(0)' }, { transform: `translateY(-${dist * 0.15}px)`, filter: 'blur(2px)', offset: 0.1 },
              { transform: `translateY(-${dist * 0.97}px)`, filter: 'blur(1px)', offset: 0.88 }, { transform: `translateY(-${dist}px)`, filter: 'blur(0)' }],
            { duration: plan[r].dur, easing: 'cubic-bezier(.3,0,.25,1)', fill: 'forwards' }
          );
          return a.finished.then(() => {
            if (!alive) return;
            a.cancel();
            strip.innerHTML = grid[r].map(symHtml).join('');
            reels[r].classList.remove('anticip');
            reels[r].animate([{ transform: 'translateY(8px)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' });
            sound.play('reelStop', { i: r });
            const sc = [...strip.children].filter((n) => n.dataset.k === 'scat');
            if (sc.length) {
              sc.forEach((n) => { n.classList.add('land'); ui.burst(n, { n: 14, colors: ['#ffc65c', '#ffffff'] }); });
              sound.play('scatter', { i: scatters++ });
            }
          });
        });
        await Promise.all(anims);
        slot.classList.remove('spinning');
        if (!alive) throw ABORT;
      }

      /* ---------- Affichage des gains ---------- */
      const cellEl = (reel, row) => strips[reel].children[row];
      const describe = (l) => `Ligne ${l.line + 1} · ${l.count}× ${NAMES[l.sym]} · <b class="num">+${fmt(l.amount)}</b>`;
      async function showWins(res, quick) {
        if (!res.lines.length && !res.scatter.pay) return;
        slot.classList.add('has-win');
        res.lines.forEach((l) => { lineEls[l.line].classList.add('show'); l.cells.forEach(([r, w]) => cellEl(r, w).classList.add('win')); });
        if (res.scatter.count >= 3) res.scatter.cells.forEach(([r, w]) => cellEl(r, w).classList.add('win'));
        // éclats de particules sur chaque symbole gagnant
        stage.querySelectorAll('.sym.win').forEach((n, i) => setTimeout(() => alive && ui.burst(n, { n: 8 }), i * 40));
        setMsg(`Gain <b class="num">+${fmt(res.total)}</b>${res.lines.length ? ` sur ${res.lines.length} ligne${res.lines.length > 1 ? 's' : ''}` : ''}`);
        sound.play('win', { x: res.total / session.bet });
        await wait(quick ? 700 : 1100);
      }
      function cycleLines(res) {
        if (res.lines.length < 2) return;
        let i = 0;
        cycleTimer = setInterval(() => {
          const l = res.lines[i++ % res.lines.length];
          lineEls.forEach((el, j) => el.classList.toggle('show', j === l.line));
          stage.querySelectorAll('.sym.win').forEach((n) => n.classList.remove('win'));
          l.cells.forEach(([r, w]) => cellEl(r, w).classList.add('win'));
          setMsg(describe(l));
        }, 1300);
      }

      /* ---------- Annonces ---------- */
      function overlay(html, ms, cls = '') {
        return new Promise((resolve) => {
          overlayEl.className = 'slot5__overlay ' + cls;
          overlayEl.innerHTML = html;
          overlayEl.hidden = false;
          let done = false;
          const finish = () => { if (done) return; done = true; overlayEl.hidden = true; overlayEl.onclick = null; resolve(); };
          overlayEl.onclick = finish;
          setTimeout(finish, ms);
        });
      }
      /** Grosse annonce : compteur qui défile, paliers Big → Mega → Epic, pluie de pièces, secousse. */
      async function bigWin(amount, stake) {
        const top = TIERS.find((t) => amount / stake >= t.x);
        if (!top) return;
        ui.coinRain(stage, top.x >= 100 ? 80 : top.x >= 40 ? 50 : 30);
        ui.shake(slot, top.x >= 40 ? 2 : 1);
        const dur = turbo || auto ? 1800 : 3400;
        sound.play('bigwin', { d: dur / 1000 });
        overlayEl.className = 'slot5__overlay big';
        overlayEl.innerHTML = `<div class="bigwin"><div class="bigwin__rays"></div><div class="bigwin__label">${TIERS[TIERS.length - 1].label}</div><div class="bigwin__amount num">0</div><div class="bigwin__x num"></div></div>`;
        overlayEl.hidden = false;
        const label = overlayEl.querySelector('.bigwin__label');
        const amt = overlayEl.querySelector('.bigwin__amount');
        const xs = overlayEl.querySelector('.bigwin__x');
        let skip = false;
        overlayEl.onclick = () => (skip = true);
        const t0 = performance.now();
        let lastTier = label.textContent;
        await new Promise((resolve) => {
          const step = (now) => {
            const k = skip ? 1 : Math.min(1, (now - t0) / dur);
            const v = amount * (1 - Math.pow(1 - k, 2));
            amt.textContent = fmt(round2(v));
            const tier = TIERS.find((t) => v / stake >= t.x) || TIERS[TIERS.length - 1];
            if (tier.label !== lastTier) {
              lastTier = label.textContent = tier.label;
              label.classList.remove('bump'); void label.offsetWidth; label.classList.add('bump');
              sound.play('tierUp');
              ui.shake(slot, 2);
            }
            xs.textContent = '×' + (v / stake).toFixed(1);
            if (k < 1 && alive) requestAnimationFrame(step); else resolve();
          };
          requestAnimationFrame(step);
        });
        await wait(skip ? 300 : 1200);
        overlayEl.hidden = true;
        overlayEl.onclick = null;
      }

      /* ---------- Free spins ---------- */
      function paintBanner() {
        fsCount.textContent = `${session.fsPlayed}/${session.fsTotal}`;
        fsWinEl.textContent = fmt(round2(session.fsWin));
      }
      async function introBonus(spins) {
        sound.play('fs');
        ui.coinRain(stage, 30);
        ui.flash(stage);
        await overlay(`<div class="fs-intro"><span>Bonus déclenché</span><strong class="num">${spins}</strong><em>free spins · gains ×${S.FS_MULT}</em></div>`, 2800, 'fs-start');
      }
      async function runBonus() {
        slot.classList.add('fs');
        banner.hidden = false;
        paintBanner();
        while (session.fsLeft > 0) {
          session.fsLeft--;
          session.fsPlayed++;
          paintBanner();
          setMsg(`Free spin ${session.fsPlayed} · gains ×${S.FS_MULT}`);
          const { grid } = S.spin(rng.float);
          const res = S.evaluate(grid, session.bet, S.FS_MULT);
          session.win += res.total;
          session.fsWin += res.total;
          session.fsLeft += res.scatter.spins;
          session.fsTotal += res.scatter.spins;
          await spinReels(grid);
          await showWins(res, true);
          paintBanner();
          if (res.scatter.spins) {
            sound.play('fs');
            ui.flash(stage);
            await overlay(`<div class="fs-intro"><span>Relance !</span><strong class="num">+${res.scatter.spins}</strong><em>free spins ajoutés</em></div>`, 2200, 'fs-start');
          }
          await wait(turbo ? 250 : 450);
        }
        sound.play('win', { x: 20 });
        await overlay(`<div class="fs-intro"><span>Bonus terminé</span><strong class="num">${fmt(round2(session.fsWin))}</strong><em>${session.fsPlayed} free spins joués</em></div>`, 2800);
        slot.classList.remove('fs');
        banner.hidden = true;
      }

      /* ---------- Partie ---------- */
      async function play(buy = false) {
        if (busy) return;
        const bet = betIn.get();
        const stake = round2(buy ? bet * S.BONUS_BUY : bet);
        if (!wallet.place(stake)) { stopAuto(); return; }
        betIn.remember();
        busy = true;
        paintPanel();
        session = { bet, stake, win: 0, fsLeft: 0, fsPlayed: 0, fsTotal: 0, fsWin: 0 };
        try {
          if (buy) {
            // L'achat équivaut à 3 DaveCoins : gain direct + 15 free spins
            session.win += S.SCATTER[3].pay * bet;
            session.fsLeft = session.fsTotal = S.SCATTER[3].spins;
            await introBonus(session.fsLeft);
          } else {
            setMsg('&nbsp;');
            const { grid } = S.spin(rng.float);
            const res = S.evaluate(grid, bet);
            session.win += res.total;
            session.fsLeft = session.fsTotal = res.scatter.spins;
            await spinReels(grid);
            if (res.total > 0) await showWins(res, auto);
            else setMsg(res.scatter.count === 2 ? 'Presque… 2 DaveCoins !' : 'Pas de gain cette fois');
            if (res.scatter.spins) await introBonus(res.scatter.spins);
            else if (!auto) cycleLines(res);
          }
          if (session.fsLeft > 0) await runBonus();

          const total = round2(session.win);
          const s = session;
          session = null;
          settle('machine', s.stake, total, { silent: true });
          winOut.set(total > 0 ? `<span class="pos">+${fmt(total)}</span>` : '0');
          if (total > 0 && s.fsTotal) setMsg(`Total <b class="num">+${fmt(total)}</b>`);
          await bigWin(total, s.stake);
        } catch (e) {
          if (e !== ABORT) throw e;
          return;
        }
        busy = false;
        paintPanel();
        if (auto) {
          await sleep(turbo ? 250 : 600);
          if (alive && auto && !busy) play();
        }
      }

      function stopAuto() {
        auto = false;
        autoBtn.innerHTML = ui.icon('repeat', 'i--sm') + 'Auto';
        autoBtn.classList.remove('on');
        paintPanel();
      }
      spinBtn.addEventListener('click', () => play());
      buyBtn.addEventListener('click', () => play(true));
      autoBtn.addEventListener('click', () => {
        if (auto) return stopAuto();
        auto = true;
        autoBtn.innerHTML = ui.icon('x', 'i--sm') + 'Stop';
        autoBtn.classList.add('on');
        paintPanel();
        if (!busy) play();
      });
      turboBtn.addEventListener('click', () => { turbo = !turbo; turboBtn.classList.toggle('on', turbo); sound.play('click'); });
      const onKey = (e) => {
        if (e.code !== 'Space' || e.target.closest('input')) return;
        e.preventDefault();
        if (!overlayEl.hidden) overlayEl.click(); else play();
      };
      window.addEventListener('keydown', onKey);
      paintPanel();

      return () => {
        alive = false;
        auto = false;
        clearInterval(cycleTimer);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', onKey);
        // Partie en cours : les free spins restants sont joués instantanément puis réglés.
        if (session) {
          while (session.fsLeft > 0) {
            session.fsLeft--;
            const res = S.evaluate(S.spin(rng.float).grid, session.bet, S.FS_MULT);
            session.win += res.total;
            session.fsLeft += res.scatter.spins;
          }
          settle('machine', session.stake, round2(session.win));
          session = null;
        }
      };
    }
  });
})();
