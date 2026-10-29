/* DaveChicken — fais traverser la route au poulet, encaisse avant de te faire écraser. RTP 99 %. */
(function () {
  'use strict';
  const { rng, fmt, fmtMult, wallet, settle, sound, ui, round2 } = DP;
  const EDGE = 0.99;
  const LEVELS = {
    easy: { label: 'Facile', p: 0.08, lanes: 24 },
    medium: { label: 'Moyen', p: 0.16, lanes: 22 },
    hard: { label: 'Difficile', p: 0.28, lanes: 20 },
    extreme: { label: 'Extrême', p: 0.45, lanes: 15 }
  };
  const mult = (lvl, k) => (k === 0 ? 1 : EDGE / Math.pow(1 - LEVELS[lvl].p, k));
  const CARS = ['🚗', '🚕', '🚙', '🚌', '🚓', '🏎️', '🚚'];

  DP.games.register({
    id: 'chicken',
    name: 'DaveChicken',
    icon: '🐔',
    tagline: 'Traverse la route, voie après voie',
    rtp: '99 %',
    colors: ['#facc15', '#7c2d12'],
    art: '<span class="game-card__emoji">🐔</span>',
    rules: `<p>Chaque voie traversée augmente ton multiplicateur. Mais à chaque voie, une voiture peut surgir…</p>
      <ul><li>Choisis la difficulté : plus c’est dur, plus chaque voie rapporte.</li>
      <li>Clique sur <strong>Avancer</strong> (ou sur la plaque dorée) pour passer la voie suivante.</li>
      <li><strong>Encaisse</strong> quand tu veux. Atteins l’arrivée pour le gain maximum.</li></ul>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      const betIn = ui.betInput(panel, { gameId: 'chicken', initial: 10 });
      let level = 'medium';
      const lvlSeg = ui.segmented(panel, {
        label: 'Difficulté', value: level,
        options: Object.entries(LEVELS).map(([v, l]) => ({ value: v, label: l.label })),
        onChange: (v) => { level = v; build(); paint(); }
      });
      const nextOut = ui.readout(panel, 'Prochaine voie', '—');
      const profitOut = ui.readout(panel, 'Gain actuel', '—');
      const goBtn = ui.button(panel, 'Jouer');
      const cashBtn = ui.button(panel, 'Encaisser', 'btn btn--green btn--lg btn--block');
      cashBtn.disabled = true;
      panel.appendChild(ui.el('<p class="note">Espace = avancer · Entrée = encaisser</p>'));

      stage.innerHTML = '<div class="road-wrap"><div class="road"></div></div>';
      const wrap = stage.querySelector('.road-wrap');
      const road = stage.querySelector('.road');
      let game = null; // { bet, lvl, pos, deathAt, over }
      let chickenEl, lanes = [];
      const timers = new Set();
      const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

      function build() {
        const L = LEVELS[level].lanes;
        road.innerHTML = `<div class="road__side"></div>${Array.from({ length: L }, (_, i) =>
          `<div class="lane" data-i="${i}"><button type="button" class="lane__cover" tabindex="-1">${fmtMult(mult(level, i + 1))}</button></div>`).join('')}
          <div class="road__side finish"></div><div class="chicken">🐔</div>`;
        lanes = [...road.querySelectorAll('.lane')];
        chickenEl = road.querySelector('.chicken');
        placeChicken(-1, false);
      }
      function laneCenter(i) {
        if (i < 0) return road.querySelector('.road__side').offsetWidth / 2;
        const l = lanes[i];
        return l.offsetLeft + l.offsetWidth / 2;
      }
      function placeChicken(i, hop = true) {
        chickenEl.style.left = laneCenter(i) + 'px';
        if (hop) { chickenEl.classList.remove('hop'); void chickenEl.offsetWidth; chickenEl.classList.add('hop'); }
        const target = laneCenter(i) - wrap.clientWidth / 3;
        wrap.scrollTo({ left: Math.max(0, target), behavior: hop ? 'smooth' : 'auto' });
      }

      function paint() {
        const lvl = game ? game.lvl : level;
        const pos = game ? game.pos : -1;
        lanes.forEach((l, i) => {
          l.classList.toggle('next', !!game && !game.over && i === pos + 1);
          l.classList.toggle('passed', !!game && i <= pos);
        });
        const L = LEVELS[lvl].lanes;
        nextOut.set(pos + 1 < L ? fmtMult(mult(lvl, pos + 2)) : '—');
        if (game && !game.over) {
          const cur = mult(lvl, pos + 1);
          profitOut.set(pos >= 0 ? `${ui.coin('coin--xs')} ${fmt(game.bet * cur)}` : '—');
          goBtn.textContent = 'Avancer';
          cashBtn.disabled = pos < 0;
          cashBtn.innerHTML = pos >= 0 ? `Encaisser ${fmt(game.bet * cur)}` : 'Encaisser';
        } else {
          profitOut.set('—');
          goBtn.textContent = 'Jouer';
          cashBtn.disabled = true;
          cashBtn.textContent = 'Encaisser';
        }
      }

      function start() {
        const bet = betIn.get();
        if (!wallet.place(bet)) return;
        betIn.remember();
        sound.play('bet');
        build();
        // Voie fatale tirée à l'avance : chaque voie a une probabilité p d'être occupée.
        const p = LEVELS[level].p, L = LEVELS[level].lanes;
        let deathAt = -1;
        for (let i = 0; i < L; i++) if (rng.float() < p) { deathAt = i; break; }
        game = { bet, lvl: level, pos: -1, deathAt, over: false, busy: false };
        betIn.disable(true);
        lvlSeg.disable(true);
        stage.querySelectorAll('.result-pop').forEach((n) => n.remove());
        paint();
      }

      function stepForward() {
        if (!game || game.over || game.busy) return;
        const i = game.pos + 1;
        game.busy = true;
        placeChicken(i);
        sound.play('pop');
        if (i === game.deathAt) {
          later(() => {
            const car = document.createElement('div');
            car.className = 'car';
            car.textContent = rng.pick(CARS);
            lanes[i].appendChild(car);
            later(() => { chickenEl.textContent = '🍗'; lanes[i].classList.add('dead'); sound.play('boom'); }, 260);
            later(() => car.remove(), 700);
            end(false);
          }, 300);
          return;
        }
        later(() => {
          game.pos = i;
          game.busy = false;
          lanes[i].insertAdjacentHTML('beforeend', '<span class="lane__barrier">🚧</span>');
          sound.play('gem');
          if (i === LEVELS[game.lvl].lanes - 1) { end(true); return; }
          paint();
        }, 320);
      }

      function end(won) {
        const g = game;
        g.over = true;
        game = null;
        betIn.disable(false);
        lvlSeg.disable(false);
        if (won) {
          const m = mult(g.lvl, g.pos + 1);
          const pay = round2(g.bet * m);
          settle('chicken', g.bet, pay);
          ui.result(stage, { win: true, mult: m, amount: pay });
        } else {
          settle('chicken', g.bet, 0);
          later(() => ui.result(stage, { win: false, label: '🍗' }), 400);
        }
        paint();
      }

      goBtn.addEventListener('click', () => (game ? stepForward() : start()));
      cashBtn.addEventListener('click', () => { if (game && !game.busy && game.pos >= 0) end(true); });
      road.addEventListener('click', (e) => {
        const lane = e.target.closest('.lane.next');
        if (lane) stepForward();
      });
      const onKey = (e) => {
        if (e.target.closest('input')) return;
        if (e.code === 'Space') { e.preventDefault(); goBtn.click(); }
        if (e.code === 'Enter') { e.preventDefault(); cashBtn.click(); }
      };
      window.addEventListener('keydown', onKey);
      const onResize = () => placeChicken(game ? game.pos : -1, false);
      window.addEventListener('resize', onResize);

      // Voitures décoratives sur les voies déjà franchies… et au loin
      const ambient = setInterval(() => {
        if (!lanes.length || document.hidden) return;
        const pos = game ? game.pos : -1;
        const choices = lanes.map((_, i) => i).filter((i) => i > pos + 2 || (i < pos && i >= 0));
        if (!choices.length) return;
        const i = rng.pick(choices);
        const car = document.createElement('div');
        car.className = 'car ambient';
        car.textContent = rng.pick(CARS);
        lanes[i].appendChild(car);
        later(() => car.remove(), 1700);
      }, 900);

      build();
      paint();

      return () => {
        clearInterval(ambient);
        timers.forEach(clearTimeout);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        if (game && !game.over) {
          if (game.busy && game.pos + 1 === game.deathAt) settle('chicken', game.bet, 0);
          else if (game.busy) settle('chicken', game.bet, round2(game.bet * mult(game.lvl, game.pos + 2)));
          else if (game.pos >= 0) settle('chicken', game.bet, round2(game.bet * mult(game.lvl, game.pos + 1)));
          else wallet.credit(game.bet);
        }
      };
    }
  });
})();
