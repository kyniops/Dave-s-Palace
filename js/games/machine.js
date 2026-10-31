/* DaveMachine — machine à sous 5×3, 20 lignes, wild JPZ, cartes Free JPZ (scatter) et free spins ×2.
 * Les maths sont dans slot-engine.js (RTP 96,1 %).
 */
(function () {
  'use strict';
  const { IMG, rng, fmt, wallet, settle, sound, ui, sleep, round2 } = DP;
  const S = window.DaveSlot;
  const ABORT = Symbol('abort');
  const TIERS = [{ x: 100, label: 'Epic win' }, { x: 40, label: 'Mega win' }, { x: 15, label: 'Big win' }];
  const ROUND = new Set(['lucasco', 'olmanaura', 'tddam', 'billy', 'scat']);
  const NAMES = { wild: 'JPZ (wild)', scat: 'Free JPZ', casino: 'La Machine', lucasco: 'Lucasco', olmanaura: 'Olman Aura', tddam: 'Tddam', billy: 'Billy', petitbonnin: 'Petit Bonnin', linkay: 'Linkay', yohan: 'Yohan', carl: 'Carl', tdam2: 'Tdam' };
  // Jackpot : 5 cartes Free JPZ, ou déclenchement mystère dont la chance suit la mise
  const JP_MYSTERY = 5e6;
  const AUTO_COUNTS = [10, 25, 50, 100, Infinity];
  // Rampe d'ampoules autour de la machine : [gauche %, haut %]
  const BULBS = (() => {
    const out = [];
    for (let i = 0; i <= 15; i++) { out.push([i * (100 / 15), 0]); out.push([100 - i * (100 / 15), 100]); }
    for (let i = 1; i < 9; i++) { out.push([100, i * (100 / 9)]); out.push([0, 100 - i * (100 / 9)]); }
    return out;
  })();

  function symHtml(k) {
    const d = S.SYMBOLS[k];
    if (d.glyph) return `<div class="sym k-low s-${k}" data-k="${k}"><b>${d.glyph}</b></div>`;
    const tag = k === 'wild' ? '<span class="sym__tag">Wild</span>' : k === 'scat' ? '<span class="sym__tag">Free</span>' : '';
    return `<div class="sym k-${d.kind} s-${k}${ROUND.has(k) ? ' round' : ''}" data-k="${k}"><img src="${IMG}${d.img}" alt="${NAMES[k]}" draggable="false">${tag}</div>`;
  }
  const miniSym = (k) => {
    const d = S.SYMBOLS[k];
    return d.glyph ? `<span class="pt-glyph s-${k}">${d.glyph}</span>` : `<img class="${ROUND.has(k) || k === 'wild' ? 'round' : ''}" src="${IMG}${d.img}" alt="">`;
  };

  const rulesHtml = () => `
    <p><strong>5 rouleaux, 3 rangées, 20 lignes.</strong> Les gains se lisent de gauche à droite à partir du premier rouleau. Ta mise est répartie sur les 20 lignes.</p>
    <ul>
      <li><strong>JPZ couronné est le Wild</strong> (rouleaux 2 à 5) : il remplace tous les symboles sauf la carte Free JPZ.</li>
      <li><strong>3 cartes Free JPZ ou plus</strong> n’importe où : <strong>15 free spins</strong> (20 pour 4, 25 pour 5) + gain direct ×2 / ×10 / ×50 la mise.</li>
      <li>Pendant les free spins, <strong>tous les gains sont doublés</strong>. Les cartes Free JPZ qui retombent <strong>ajoutent</strong> des free spins.</li>
      <li><strong>Jackpot global</strong> : il monte avec chaque mise du casino. Tu le remportes avec <strong>5 cartes Free JPZ</strong>, ou par un <strong>déclenchement mystère</strong> possible à chaque tour (plus ta mise est grosse, plus il a de chances de tomber). Très rare.</li>
      <li><strong>Tirage auto</strong> : choisis 10, 25, 50, 100 tours ou illimité, et arrête quand tu veux.</li>
    </ul>
    <p class="muted">Les <strong>20 lignes</strong> : un gain compte quand 3, 4 ou 5 symboles identiques se suivent <strong>depuis le rouleau de gauche</strong> le long d’une de ces lignes (droites, en V ou en zigzag).</p>
    <div class="slines">${S.LINES.map((ln, i) => `<div class="sline"><svg viewBox="0 0 50 30" aria-hidden="true">${[0, 1, 2].map((r) => [0, 1, 2, 3, 4].map((c) => `<rect x="${c * 10 + 1}" y="${r * 10 + 1}" width="8" height="8" class="${ln[c] === r ? 'on' : ''}"/>`).join('')).join('')}<polyline points="${ln.map((r, c) => `${c * 10 + 5},${r * 10 + 5}`).join(' ')}"/></svg><span>${i + 1}</span></div>`).join('')}</div>
    <p class="muted">Table des gains (× la mise totale) pour 3 / 4 / 5 symboles :</p>
    <div class="paytable">${Object.keys(S.SYMBOLS).filter((k) => k !== 'scat').map((k) => `<div>${miniSym(k)}<span>${S.SYMBOLS[k].pays.map((p) => '×' + round2(p / S.LINES.length)).join(' · ')}</span></div>`).join('')}
      <div>${miniSym('scat')}<span>${[3, 4, 5].map((n) => S.SCATTER[n].spins + ' FS').join(' · ')}</span></div></div>`;

  DP.games.register({
    id: 'machine',
    name: 'DaveMachine',
    icon: 'cherry',
    tagline: '5 rouleaux, 20 lignes, free spins ×2',
    rtp: '96,5 %',
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
      const autoSeg = ui.segmented(panel, {
        label: 'Tirage auto', value: 10,
        options: AUTO_COUNTS.map((n) => ({ value: n === Infinity ? 'inf' : n, label: n === Infinity ? '∞' : String(n) })),
        onChange: () => {}
      });
      const row = ui.el('<div class="panel__row"></div>');
      panel.appendChild(row);
      const autoBtn = ui.button(row, ui.icon('repeat', 'i--sm') + 'Lancer l’auto', 'btn btn--ghost');
      const turboBtn = ui.button(row, ui.icon('zap', 'i--sm') + 'Turbo', 'btn btn--ghost');
      panel.appendChild(ui.el('<p class="note">Espace pour lancer · clic sur une annonce pour la passer</p>'));

      stage.classList.add('slot-stage');
      stage.innerHTML = `
        <div class="slot5">
          <div class="slot5__bulbs" aria-hidden="true">${BULBS.map(([x, y], i) => `<i style="left:${x}%;top:${y}%;--i:${i}"></i>`).join('')}</div>
          <div class="slot5__top">
            <div class="plq plq--fs"><span>Free spins</span><b class="num js-fs">0</b></div>
            <div class="jp"><span>Jackpot</span><b class="num js-jp">${fmt(DP.jackpot.get())}</b></div>
            <div class="plq plq--win"><span>Gain bonus</span><b class="num js-fswin">0</b></div>
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
      const stopBg = DP.slotBg(stage, slot);
      const reels = [...stage.querySelectorAll('.reel5')];
      const strips = reels.map((r) => r.firstElementChild);
      const lineEls = [...stage.querySelectorAll('.slot5__lines polyline')];
      const overlayEl = stage.querySelector('.slot5__overlay');
      const msgEl = stage.querySelector('.js-msg');
      const plqWin = stage.querySelector('.plq--win');
      // compteur du jackpot : rattrape la valeur en douceur
      const jpEl = stage.querySelector('.js-jp');
      let jpShown = DP.jackpot.get(), jpRaf = 0;
      const jpTick = () => {
        const target = DP.jackpot.get();
        jpShown = target < jpShown ? target : jpShown + (target - jpShown) * 0.08;
        if (Math.abs(target - jpShown) < 0.01) jpShown = target;
        jpEl.textContent = fmt(round2(jpShown));
        if (jpShown !== target) jpRaf = requestAnimationFrame(jpTick); else jpRaf = 0;
      };
      const offJp = DP.on('jackpot', () => { if (!jpRaf) jpRaf = requestAnimationFrame(jpTick); });
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
        spinBtn.disabled = busy;
        autoSeg.disable(auto);
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
        const whir = sound.reels(5);
        let stopped = 0;
        // Anticipation : dès que 2 cartes Free JPZ sont visibles, les rouleaux suivants ralentissent
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
            whir.set(5 - ++stopped);
            const sc = [...strip.children].filter((n) => n.dataset.k === 'scat');
            if (sc.length) {
              sc.forEach((n) => { n.classList.add('land'); ui.burst(n, { n: 14, colors: ['#ffc65c', '#ffffff'] }); });
              sound.play('scatter', { i: scatters++ });
            }
          });
        });
        try { await Promise.all(anims); } finally { whir.stop(); }
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
        // une seule ligne : on dit laquelle et avec quel symbole (sinon le tracé en V/zigzag paraît aléatoire)
        if (res.lines.length === 1 && !(res.scatter.count >= 3)) setMsg(describe(res.lines[0]));
        else setMsg(`Gain <b class="num">+${fmt(res.total)}</b>${res.lines.length ? ` sur ${res.lines.length} lignes` : ''}`);
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
      let shownWin = 0;
      function flip(el, text) {
        if (el.textContent === text) return;
        el.textContent = text;
        el.animate([{ transform: 'rotateX(90deg)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.16,1,.3,1)' });
      }
      function paintBanner() {
        flip(fsCount, String(session.fsLeft));
        fsWinEl.textContent = fmt(round2(shownWin));
      }
      /** Pièces qui s'envolent des symboles gagnants vers la plaque « Gain » qui compte à chaque arrivée. */
      function collectCoins(res) {
        const cells = [];
        res.lines.forEach((l) => l.cells.forEach(([r, w]) => cells.push(cellEl(r, w))));
        if (res.scatter.pay) res.scatter.cells.forEach(([r, w]) => cells.push(cellEl(r, w)));
        const target = plqWin.getBoundingClientRect();
        const tx = target.left + target.width / 2, ty = target.top + target.height / 2;
        const n = Math.min(26, 4 + Math.round(Math.sqrt(res.total / session.bet) * 4));
        const from = shownWin, to = round2(session.fsWin);
        let landed = 0;
        return new Promise((resolve) => {
          if (!cells.length) { shownWin = to; paintBanner(); return resolve(); }
          for (let i = 0; i < n; i++) {
            const src = cells[i % cells.length].getBoundingClientRect();
            const sx = src.left + src.width / 2 + (Math.random() - 0.5) * src.width * 0.5, sy = src.top + src.height / 2;
            const c = document.createElement('img');
            c.src = IMG + 'davecoin.png';
            c.className = 'coin-fly';
            c.style.left = sx + 'px'; c.style.top = sy + 'px';
            ui._fxLayer().appendChild(c);
            const lift = 80 + Math.random() * 120;
            c.animate([
              { transform: 'translate(-50%,-50%) scale(.4) rotate(0)', opacity: 0 },
              { transform: `translate(calc(-50% + ${(tx - sx) * 0.3}px), calc(-50% + ${(ty - sy) * 0.3 - lift}px)) scale(1.1) rotate(200deg)`, opacity: 1, offset: 0.35 },
              { transform: `translate(calc(-50% + ${tx - sx}px), calc(-50% + ${ty - sy}px)) scale(.5) rotate(540deg)`, opacity: 0.9 }
            ], { duration: 700 + Math.random() * 250, delay: i * 45, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'backwards' }).finished.then(() => {
              c.remove();
              landed++;
              shownWin = round2(from + (to - from) * (landed / n));
              fsWinEl.textContent = fmt(shownWin);
              sound.play('count', { k: landed / n });
              plqWin.animate([{ transform: 'scale(1.12)' }, { transform: 'none' }], { duration: 160 });
              if (landed === n) { shownWin = to; paintBanner(); resolve(); }
            });
          }
        });
      }
      /** Tampon ×2 sur chaque symbole gagnant pendant les free spins. */
      function stampX2(res) {
        const seen = new Set();
        res.lines.forEach((l) => l.cells.forEach(([r, w]) => {
          const k = r + ':' + w;
          if (seen.has(k)) return;
          seen.add(k);
          const el = cellEl(r, w);
          el.insertAdjacentHTML('beforeend', `<span class="sym__x2">×${S.FS_MULT}</span>`);
        }));
        if (seen.size) sound.play('chip');
      }
      async function introBonus(spins) {
        sound.play('fs');
        ui.coinRain(stage, 40);
        ui.flash(stage);
        ui.shake(slot, 2);
        await overlay(`<div class="fs-intro fs-intro--jpz"><img src="${IMG}freejpz.jpg" alt=""><div><span>3 cartes Free JPZ</span><strong class="num">${spins}</strong><em>free spins · tous les gains ×${S.FS_MULT}</em></div></div>`, 3200, 'fs-start');
      }
      // Effets d'ambiance pendant tout le bonus : lumières, pluie de pièces, musique
      let party = null;
      function startParty() {
        document.body.classList.add('fs-party');
        window.DP_SPACE && DP_SPACE.warp(true);
        const music = sound.fsMusic();
        party = { stop() { music.stop(); window.DP_SPACE && DP_SPACE.warp(false); document.body.classList.remove('fs-party'); } };
      }
      function stopParty() { if (party) { party.stop(); party = null; } }

      /** Fin du bonus : le gain total monte avec des tics de plus en plus aigus, lumières et pièces. */
      async function fsSummary(total, played) {
        const dur = Math.min(6500, 2200 + Math.sqrt(total / session.bet) * 400);
        overlayEl.className = 'slot5__overlay summary';
        overlayEl.innerHTML = `<div class="fs-sum">
          <div class="fs-sum__bulbs">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
          <span class="fs-sum__label">Gain total du bonus</span>
          <strong class="fs-sum__amount num">0</strong>
          <em class="fs-sum__x num"></em>
          <span class="fs-sum__meta">${played} free spins joués</span>
        </div>`;
        overlayEl.hidden = false;
        const amt = overlayEl.querySelector('.fs-sum__amount');
        const xs = overlayEl.querySelector('.fs-sum__x');
        let skip = false, last = 0;
        overlayEl.onclick = () => (skip = true);
        ui.coinRain(stage, 50);
        const t0 = performance.now();
        await new Promise((resolve) => {
          const step = (now) => {
            const k = skip ? 1 : Math.min(1, (now - t0) / dur);
            const e = 1 - Math.pow(1 - k, 2.2);
            const v = total * e;
            amt.textContent = fmt(round2(v));
            xs.textContent = '×' + (v / session.bet).toFixed(1);
            if (now - last > 55 && k < 1) { last = now; sound.play('count', { k: e }); }
            if (Math.random() < 0.06 && k < 1) ui.burst(amt, { n: 6, colors: ['#ffc145', '#ffffff', '#ff6b2c'], spread: 1.6 });
            if (k < 1 && alive) requestAnimationFrame(step); else resolve();
          };
          requestAnimationFrame(step);
        });
        amt.classList.add('slam');
        sound.play('slam');
        ui.shake(slot, 3);
        ui.flash(stage);
        ui.burst(amt, { n: 60, colors: ['#ffc145', '#ffffff', '#ff6b2c'], spread: 2.4 });
        ui.coinRain(stage, 70);
        await wait(skip ? 900 : 2200);
        overlayEl.hidden = true;
        overlayEl.onclick = null;
      }

      async function runBonus() {
        slot.classList.add('fs');
        shownWin = 0;
        paintBanner();
        startParty();
        try {
          while (session.fsLeft > 0) {
            session.fsLeft--;
            session.fsPlayed++;
            paintBanner();
            setMsg(`Free spin ${session.fsPlayed} · gains ×${S.FS_MULT}`);
            const grid = session.srv ? session.srv.fs[session.fsIdx++].grid : S.spin(rng.float).grid;
            const res = S.evaluate(grid, session.bet, S.FS_MULT);
            session.win += res.total;
            session.fsWin += res.total;
            session.fsLeft += res.scatter.spins;
            session.fsTotal += res.scatter.spins;
            await spinReels(grid);
            if (res.total > 0) {
              stampX2(res);
              slot.animate([{ transform: 'scale(1.012)' }, { transform: 'none' }], { duration: 240 });
              if (res.total >= session.bet * 10) { ui.shake(slot, 1); ui.flash(stage); }
              const coins = collectCoins(res);
              await showWins(res, true);
              await coins;
            } else await showWins(res, true);
            paintBanner();
            if (res.scatter.spins) {
              sound.play('fs');
              ui.flash(stage);
              ui.shake(slot, 2);
              await overlay(`<div class="fs-intro fs-intro--jpz"><img src="${IMG}freejpz.jpg" alt=""><div><span>Relance !</span><strong class="num">+${res.scatter.spins}</strong><em>free spins ajoutés</em></div></div>`, 2400, 'fs-start');
            }
            await wait(turbo ? 250 : 450);
          }
          await fsSummary(round2(session.fsWin), session.fsPlayed);
        } finally {
          stopParty();
          slot.classList.remove('fs');
        }
      }

      /** JACKPOT : tout s'allume, hyperespace, le montant monte jusqu'à la cagnotte gagnée. */
      async function jackpotSequence(amount, mystery) {
        document.body.classList.add('jp-party');
        slot.classList.add('jp-on');
        window.DP_SPACE && DP_SPACE.warp(true);
        const music = sound.fsMusic();
        sound.play('fs');
        ui.flash(stage);
        ui.shake(slot, 3);
        overlayEl.className = 'slot5__overlay jackpot';
        overlayEl.innerHTML = `<div class="jpwin">
          <span class="jpwin__kicker">${mystery ? 'Jackpot mystère' : '5 cartes Free JPZ'}</span>
          <strong class="jpwin__title">${[...'JACKPOT'].map((c, i) => `<i style="--i:${i}">${c}</i>`).join('')}</strong>
          <b class="jpwin__amount num">0</b>
          <span class="jpwin__meta">Jackpot global remporté par ${DP.esc(DP.auth.current())}</span>
        </div>`;
        overlayEl.hidden = false;
        const amt = overlayEl.querySelector('.jpwin__amount');
        let skip = false;
        overlayEl.onclick = () => (skip = true);
        await wait(1400);
        const rain = setInterval(() => alive && ui.coinRain(stage, 14), 500);
        const dur = 7000, t0 = performance.now();
        let last = 0;
        await new Promise((resolve) => {
          const step = (now) => {
            const k = skip ? 1 : Math.min(1, (now - t0) / dur);
            const e = 1 - Math.pow(1 - k, 2.4);
            amt.textContent = fmt(round2(amount * e));
            if (now - last > 50 && k < 1) { last = now; sound.play('count', { k: e }); }
            if (Math.random() < 0.1 && k < 1) ui.burst(amt, { n: 10, colors: ['#ffc145', '#ffffff', '#ff6b2c'], spread: 2 });
            if (k < 1 && alive) requestAnimationFrame(step); else resolve();
          };
          requestAnimationFrame(step);
        });
        clearInterval(rain);
        amt.classList.add('slam');
        sound.play('slam'); sound.play('jackpot');
        ui.shake(slot, 3); ui.flash(stage);
        ui.burst(amt, { n: 90, colors: ['#ffc145', '#ffffff', '#ff6b2c'], spread: 3 });
        ui.coinRain(stage, 120);
        await wait(skip ? 1200 : 3200);
        music.stop();
        window.DP_SPACE && DP_SPACE.warp(false);
        document.body.classList.remove('jp-party');
        slot.classList.remove('jp-on');
        overlayEl.hidden = true;
        overlayEl.onclick = null;
      }

      /* ---------- Partie ---------- */
      async function play() {
        if (busy) return;
        const bet = betIn.get();
        const stake = bet;
        let srv = null;
        if (DP.engine && DP.engine.on) {
          // en ligne : le serveur tire le tour, les free spins et le jackpot d'un coup
          busy = true; paintPanel();
          srv = await DP.engine.call('slot_spin', { p_bet: bet }, { defer: true });
          if (!srv || !alive) { busy = false; stopAuto(); paintPanel(); return; }
          DP.engine.debitView(stake);
        } else if (!wallet.place(stake)) { stopAuto(); return; }
        betIn.remember();
        busy = true;
        paintPanel();
        session = { bet, stake, win: 0, fsLeft: 0, fsPlayed: 0, fsTotal: 0, fsWin: 0, srv, fsIdx: 0 };
        try {
          {
            setMsg('&nbsp;');
            const grid = srv ? srv.grid : S.spin(rng.float).grid;
            const res = S.evaluate(grid, bet);
            session.win += res.total;
            session.fsLeft = session.fsTotal = res.scatter.spins;
            // jackpot : tiré avant l'animation, la cagnotte est réservée tout de suite
            const jpMystery = srv ? srv.mystery : res.scatter.count < 5 && rng.float() < bet / JP_MYSTERY;
            if (srv ? srv.jp > 0 : res.scatter.count >= 5 || jpMystery) {
              session.jp = srv ? +srv.jp : DP.jackpot.win(DP.auth.current());
              session.win += session.jp;
            }
            await spinReels(grid);
            if (res.total > 0) await showWins(res, auto);
            else setMsg(res.scatter.count === 2 ? 'Presque… 2 cartes Free JPZ !' : 'Pas de gain cette fois');
            if (session.jp) await jackpotSequence(session.jp, jpMystery);
            if (res.scatter.spins) await introBonus(res.scatter.spins);
            else if (!auto) cycleLines(res);
          }
          if (session.fsLeft > 0) await runBonus();

          const s = session;
          const total = s.srv ? +s.srv.total : round2(s.win);
          session = null;
          if (s.srv) DP.engine.reveal(s.srv.acct);
          settle('machine', s.stake, total, { silent: true });
          winOut.set(total > 0 ? `<span class="pos">+${fmt(total)}</span>` : '0');
          if (total > 0 && s.fsTotal) setMsg(`Total <b class="num">+${fmt(total)}</b>`);
          if (!s.fsTotal && !s.jp) await bigWin(total, s.stake);
        } catch (e) {
          if (e !== ABORT) throw e;
          return;
        }
        busy = false;
        if (auto) {
          autoLeft--;
          if (autoLeft <= 0) stopAuto(); else paintAuto();
        }
        paintPanel();
        if (auto) {
          await sleep(turbo ? 250 : 600);
          if (alive && auto && !busy) play();
        }
      }

      let autoLeft = 0;
      function paintAuto() {
        autoBtn.innerHTML = auto ? `${ui.icon('x', 'i--sm')}Stop · <span class="num">${autoLeft === Infinity ? '∞' : autoLeft}</span>` : ui.icon('repeat', 'i--sm') + 'Lancer l’auto';
        autoBtn.classList.toggle('on', auto);
      }
      function stopAuto() {
        auto = false;
        autoLeft = 0;
        paintAuto();
        paintPanel();
      }
      spinBtn.addEventListener('click', () => play());
      autoBtn.addEventListener('click', () => {
        if (auto) return stopAuto();
        const v = autoSeg.get();
        autoLeft = v === 'inf' ? Infinity : +v;
        auto = true;
        paintAuto();
        paintPanel();
        sound.play('click');
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
        stopBg();
        offJp();
        cancelAnimationFrame(jpRaf);
        stopParty();
        window.DP_SPACE && DP_SPACE.warp(false);
        document.body.classList.remove('jp-party');
        clearInterval(cycleTimer);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', onKey);
        // Partie en cours : les free spins restants sont joués instantanément puis réglés.
        if (session && session.srv) { DP.engine.reveal(session.srv.acct); session = null; } // en ligne : déjà réglé par le serveur
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
