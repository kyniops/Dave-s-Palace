/* DaveTower — grimpe la tour du roi étage par étage, une porte par étage. RTP 98 %.
 * Multiplicateur après k étages = 0,98 / (chance de survie par étage)^k.
 */
(function () {
  'use strict';
  const { IMG, rng, fmt, fmtMult, wallet, settle, sound, ui, round2 } = DP;
  const FLOORS = 10;
  const EDGE = 0.98;
  const LEVELS = {
    easy: { label: 'Facile', doors: 4, traps: 1 },
    medium: { label: 'Moyen', doors: 3, traps: 1 },
    hard: { label: 'Difficile', doors: 2, traps: 1 },
    extreme: { label: 'Extrême', doors: 3, traps: 2 }
  };
  const survive = (lvl) => (LEVELS[lvl].doors - LEVELS[lvl].traps) / LEVELS[lvl].doors;
  const mult = (lvl, k) => (k === 0 ? 1 : EDGE / Math.pow(survive(lvl), k));

  DP.games.register({
    id: 'tower',
    name: 'DaveTower',
    icon: 'castle',
    tagline: 'Grimpe jusqu’au trône de JPZ',
    rtp: '98 %',
    isNew: true,
    hue: 140,
    art: `<div class="art-tower">${[0, 1, 2, 3].map((r) => `<div>${[0, 1, 2].map((c) => `<i class="${r === 3 ? '' : (r + c) % 3 === 0 ? 'g' : ''}"></i>`).join('')}</div>`).join('')}<img src="${IMG}jpz.png" alt=""></div>`,
    rules: `<p>La tour a <strong>${FLOORS} étages</strong>. À chaque étage, choisis une porte : derrière les bonnes portes une DaveCoin, derrière les autres un piège.</p>
      <ul><li>Chaque étage franchi augmente le multiplicateur.</li>
      <li><strong>Facile</strong> : 1 piège sur 4 portes · <strong>Moyen</strong> : 1 sur 3 · <strong>Difficile</strong> : 1 sur 2 · <strong>Extrême</strong> : 2 sur 3.</li>
      <li>Encaisse quand tu veux. Atteins le trône au ${FLOORS}e étage pour le gain maximum.</li></ul>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      const betIn = ui.betInput(panel, { gameId: 'tower', initial: 10 });
      let level = 'medium';
      const lvlSeg = ui.segmented(panel, {
        label: 'Difficulté', value: level,
        options: Object.entries(LEVELS).map(([v, l]) => ({ value: v, label: l.label })),
        onChange: (v) => { level = v; build(); paint(); }
      });
      const nextOut = ui.readout(panel, 'Étage suivant', '—');
      const profitOut = ui.readout(panel, 'Gain actuel', '—');
      const goBtn = ui.button(panel, 'Jouer');
      const randBtn = ui.button(panel, ui.icon('shuffle', 'i--sm') + 'Porte au hasard', 'btn btn--ghost btn--block');
      panel.appendChild(ui.el('<p class="note">Clique sur une porte de l’étage allumé</p>'));

      stage.innerHTML = `<div class="tower-wrap"><div class="tower"></div></div>`;
      const wrap = stage.querySelector('.tower-wrap');
      const tower = stage.querySelector('.tower');
      let game = null; // { bet, lvl, floor, traps: Set[] par étage }
      let floors = [];

      function build() {
        const L = LEVELS[level];
        tower.innerHTML = `<div class="tower__throne"><img src="${IMG}jpz.png" alt="JPZ"><span>Trône · <b class="num">${fmtMult(mult(level, FLOORS))}</b></span></div>` +
          Array.from({ length: FLOORS }, (_, i) => FLOORS - 1 - i).map((f) => `
          <div class="floor" data-f="${f}">
            <span class="floor__mult num">${fmtMult(mult(level, f + 1))}</span>
            <div class="floor__doors" style="--n:${L.doors}">${Array.from({ length: L.doors }, (_, d) => `<button type="button" class="door" data-f="${f}" data-d="${d}" disabled><i></i></button>`).join('')}</div>
          </div>`).join('');
        floors = [...tower.querySelectorAll('.floor')].reverse(); // floors[0] = rez-de-chaussée
        requestAnimationFrame(() => (wrap.scrollTop = wrap.scrollHeight));
      }

      function paint() {
        const lvl = game ? game.lvl : level;
        const f = game ? game.floor : 0;
        floors.forEach((el, i) => {
          el.classList.toggle('active', !!game && i === f);
          el.classList.toggle('passed', !!game && i < f);
          el.querySelectorAll('.door').forEach((d) => (d.disabled = !game || i !== f || game.busy));
        });
        nextOut.set(f < FLOORS ? fmtMult(mult(lvl, f + 1)) : '—');
        if (game) {
          const cur = mult(lvl, f);
          profitOut.set(f ? `${ui.coin('coin--xs')} ${fmt(game.bet * cur)}` : '—');
          goBtn.innerHTML = f ? `Encaisser ${fmt(game.bet * cur)}` : 'Encaisser';
          goBtn.disabled = f === 0 || game.busy;
          goBtn.classList.replace('btn--primary', 'btn--cash');
        } else {
          profitOut.set('—');
          goBtn.textContent = 'Jouer';
          goBtn.disabled = false;
          goBtn.classList.replace('btn--cash', 'btn--primary');
        }
        randBtn.disabled = !game || game.busy;
        betIn.disable(!!game);
        lvlSeg.disable(!!game);
        const act = floors[f];
        if (game && act) act.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }

      function start() {
        const bet = betIn.get();
        if (!wallet.place(bet)) return;
        betIn.remember();
        sound.play('bet');
        build();
        const L = LEVELS[level];
        // pièges tirés à l'avance pour chaque étage
        const traps = Array.from({ length: FLOORS }, () => new Set(rng.shuffle([...Array(L.doors).keys()]).slice(0, L.traps)));
        game = { bet, lvl: level, floor: 0, traps, busy: false };
        stage.querySelectorAll('.result-pop').forEach((n) => n.remove());
        paint();
      }

      function open(btn, kind) {
        btn.classList.add('open', kind);
        btn.innerHTML = kind === 'safe' ? `<img src="${IMG}davecoin.png" alt="">` : ui.icon('skull');
      }

      function choose(f, d) {
        if (!game || game.busy || f !== game.floor) return;
        const btn = floors[f].querySelector(`.door[data-d="${d}"]`);
        if (game.traps[f].has(d)) {
          open(btn, 'trap');
          end(false, btn);
          return;
        }
        game.busy = true;
        open(btn, 'safe');
        const k = f + 1;
        sound.play('streak', { i: k + (game.lvl === 'extreme' ? 3 : game.lvl === 'hard' ? 1 : 0) });
        ui.burst(btn, { n: 10 + k * 3 });
        ui.floatText(btn, fmtMult(mult(game.lvl, k)));
        floors[f].querySelectorAll('.door').forEach((x, j) => { if (j !== d) x.classList.add('dim'); });
        setTimeout(() => {
          if (!game) return;
          game.floor = k;
          game.busy = false;
          if (k === FLOORS) { end(true); return; }
          paint();
        }, 260);
      }

      function end(won, hitBtn) {
        const g = game;
        game = null;
        // révèle tous les pièges
        floors.forEach((el, f) => el.querySelectorAll('.door').forEach((b, d) => {
          if (!b.classList.contains('open')) { if (g.traps[f].has(d)) { open(b, 'trap'); b.classList.add('ghost'); } }
          b.disabled = true;
        }));
        const m = mult(g.lvl, g.floor);
        if (won) {
          const pay = round2(g.bet * m);
          settle('tower', g.bet, pay, { silent: true });
          sound.play('cashout');
          sound.play('win', { x: m });
          if (g.floor === FLOORS) { ui.coinRain(stage, 50); ui.shake(stage, 2); sound.play('jackpot'); }
          ui.result(stage, { win: true, mult: m, amount: pay });
        } else {
          settle('tower', g.bet, 0, { silent: true });
          sound.play('boom');
          ui.shake(tower, 2);
          ui.flash(stage);
          if (hitBtn) ui.burst(hitBtn, { n: 26, colors: ['#ff5d52', '#ffffff'], spread: 1.4 });
          ui.result(stage, { win: false, label: `Étage ${g.floor + 1}` });
        }
        paint();
      }

      tower.addEventListener('click', (e) => {
        const b = e.target.closest('.door');
        if (b && !b.disabled) choose(+b.dataset.f, +b.dataset.d);
      });
      goBtn.addEventListener('click', () => {
        if (!game) start();
        else if (game.floor > 0 && !game.busy) end(true);
      });
      randBtn.addEventListener('click', () => { if (game && !game.busy) choose(game.floor, rng.int(0, LEVELS[game.lvl].doors - 1)); });
      build();
      paint();

      return () => {
        if (!game) return;
        if (game.floor > 0) settle('tower', game.bet, round2(game.bet * mult(game.lvl, game.floor)), { silent: true });
        else wallet.credit(game.bet);
        game = null;
      };
    }
  });
})();
