/* DaveDice — pose des jetons sur les membres de la bande, lance 3 dés en 3D.
 * Pour chaque case misée : 1 dé = ×2, 2 dés = ×3, 3 dés = ×12 (mise incluse). RTP ≈ 95,8 %.
 */
(function () {
  'use strict';
  const { IMG, rng, fmt, wallet, settle, sound, ui, chips, round2, sleep } = DP;
  const FACES = [
    { id: 'axb', name: 'AXB', src: 'axb.png' },
    { id: 'olman', name: 'Olman', src: 'olman.jpg' },
    { id: 'sauce', name: 'Sauce Blanche', src: 'sauceblanche.png' },
    { id: 'sevare', name: 'Sévaré', src: 'sevare.png' },
    { id: 'slyme', name: 'Slymefire', src: 'slymefire.png' },
    { id: 'tdam', name: 'Tdam', src: 'tdam.png' }
  ];
  const PAY = { 0: 0, 1: 2, 2: 3, 3: 12 };
  // Orientation du cube qui amène chaque face devant (rotateX, rotateY)
  const POSE = [[0, 0], [0, -90], [0, 180], [0, 90], [-90, 0], [90, 0]];
  const FACE_POS = ['front', 'right', 'back', 'left', 'top', 'bottom'];

  const cubeHtml = () => `<div class="die3d"><div class="cube"><i class="cube__core"></i><i class="cube__core x"></i><i class="cube__core y"></i>${FACES.map((f, i) => `<div class="cube__f f-${FACE_POS[i]}"><img src="${IMG}${f.src}" alt="${f.name}" draggable="false"></div>`).join('')}</div><div class="die3d__shadow"></div></div>`;

  DP.games.register({
    id: 'dice',
    name: 'DaveDice',
    icon: 'dices',
    tagline: 'Mise sur la bande, 3 dés, jusqu’à ×12',
    rtp: '95,8 %',
    hue: 265,
    art: `<div class="art-stack">${['sevare', 'tdam', 'axb'].map((k, i) => `<img src="${IMG}${FACES.find((f) => f.id === k).src}" alt="" style="width:34%;aspect-ratio:1;object-fit:cover;border-radius:16px;border:5px solid #1a1f2e;outline:1px solid rgba(255,255,255,.25);left:${8 + i * 28}%;top:${22 + (i % 2) * 14}%;transform:rotate(${-12 + i * 12}deg)">`).join('')}</div>`,
    rules: `<p>Choisis un jeton et pose-le sur un ou plusieurs membres de la bande. Tu peux miser des montants différents sur chaque case.</p>
      <ul><li>On lance <strong>3 dés</strong>, chaque face montre un membre de la bande.</li>
      <li>Pour chaque case misée : le visage sort sur <strong>1 dé ×2</strong>, sur <strong>2 dés ×3</strong>, sur les <strong>3 dés ×12</strong>.</li>
      <li>Aucun dé sur la case : la mise de cette case est perdue.</li>
      <li>Clic droit sur une case pour retirer ta mise.</li></ul>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      let bets = {}, lastBets = null, rolling = false, alive = true, pending = null;
      const undo = [];

      const rack = chips.rack(panel, { value: 10 });
      const totalOut = ui.readout(panel, 'Mise totale', '0');
      const row1 = ui.el('<div class="panel__row"></div>');
      const row2 = ui.el('<div class="panel__row"></div>');
      panel.append(row1, row2);
      const undoBtn = ui.button(row1, ui.icon('rotate-ccw', 'i--sm') + 'Annuler', 'btn btn--ghost btn--sm');
      const clearBtn = ui.button(row1, ui.icon('trash-2', 'i--sm') + 'Effacer', 'btn btn--ghost btn--sm');
      const dblBtn = ui.button(row2, '×2', 'btn btn--ghost btn--sm');
      const rebetBtn = ui.button(row2, ui.icon('refresh-cw', 'i--sm') + 'Rejouer', 'btn btn--ghost btn--sm');
      const rollBtn = ui.button(panel, 'Lancer les dés');
      panel.appendChild(ui.el(`<div class="paylist">
        <div><span>1 dé</span><b class="num">×2</b></div><div><span>2 dés</span><b class="num">×3</b></div><div><span>3 dés</span><b class="num">×12</b></div></div>`));
      const lastOut = ui.readout(panel, 'Dernier gain', '—');

      stage.innerHTML = `<div class="dice-stage">
        <div class="dice-tray">${[0, 1, 2].map(cubeHtml).join('')}</div>
        <div class="dbets">${FACES.map((f) => `
          <button type="button" class="dbet" data-id="${f.id}">
            <img src="${IMG}${f.src}" alt="">
            <span class="dbet__name">${f.name}</span>
            <span class="dbet__amt num"></span>
            <span class="dbet__hits num"></span>
            <span class="chip-stack"></span>
          </button>`).join('')}
        </div>
      </div>`;
      const dice = [...stage.querySelectorAll('.die3d')];
      const cubes = dice.map((d) => d.querySelector('.cube'));
      const boxes = [...stage.querySelectorAll('.dbet')];
      const boxOf = (id) => boxes.find((b) => b.dataset.id === id);
      // orientation actuelle de chaque cube
      const pose = cubes.map((c) => {
        const p = POSE[rng.int(0, 5)];
        c.style.transform = `rotateX(${p[0]}deg) rotateY(${p[1]}deg)`;
        return [p[0], p[1]];
      });

      const total = () => round2(Object.values(bets).reduce((a, b) => a + b, 0));
      function paint() {
        boxes.forEach((b) => {
          const v = bets[b.dataset.id];
          b.classList.toggle('has-bet', !!v);
          b.querySelector('.dbet__amt').innerHTML = v ? fmt(v) : '';
          b.querySelector('.chip-stack').innerHTML = v ? chips.stack(v) : '';
          b.disabled = rolling;
        });
        totalOut.set(`${ui.coin('coin--xs')} ${fmt(total())}`);
        const empty = total() === 0;
        [undoBtn, clearBtn, dblBtn].forEach((b) => (b.disabled = rolling || empty));
        rebetBtn.disabled = rolling || !lastBets;
        rollBtn.disabled = rolling || empty;
        rack.disable(rolling);
      }

      function place(id, amount) {
        if (rolling) return;
        if (total() + amount > wallet.get() + 1e-9) { ui.toast('Pas assez de DaveCoins pour ce jeton.', 'error'); sound.play('error'); return; }
        const box = boxOf(id);
        chips.fly(rack.btnFor(amount), box.querySelector('.chip-stack'), amount).then(() => {
          if (!alive || rolling) return;
          bets[id] = round2((bets[id] || 0) + amount);
          undo.push({ id, amount });
          sound.play('chip');
          boxes.forEach((b) => (b.querySelector('.dbet__hits').textContent = ''));
          paint();
          box.querySelector('.chip-stack').animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'cubic-bezier(.2,1.6,.4,1)' });
        });
      }
      const betsEl = stage.querySelector('.dbets');
      betsEl.addEventListener('click', (e) => {
        const b = e.target.closest('.dbet');
        if (b) place(b.dataset.id, rack.get());
      });
      betsEl.addEventListener('contextmenu', (e) => {
        const b = e.target.closest('.dbet');
        if (!b || rolling) return;
        e.preventDefault();
        if (bets[b.dataset.id]) { delete bets[b.dataset.id]; sound.play('click'); paint(); }
      });
      undoBtn.addEventListener('click', () => {
        const u = undo.pop();
        if (!u) return;
        bets[u.id] = round2((bets[u.id] || 0) - u.amount);
        if (bets[u.id] <= 0) delete bets[u.id];
        sound.play('click');
        paint();
      });
      clearBtn.addEventListener('click', () => { bets = {}; undo.length = 0; sound.play('whoosh'); paint(); });
      dblBtn.addEventListener('click', () => {
        if (total() * 2 > wallet.get() + 1e-9) { ui.toast('Pas assez de DaveCoins pour doubler.', 'error'); return; }
        Object.keys(bets).forEach((k) => (bets[k] = round2(bets[k] * 2)));
        undo.length = 0;
        sound.play('bet');
        paint();
      });
      rebetBtn.addEventListener('click', () => {
        const t = Object.values(lastBets).reduce((a, b) => a + b, 0);
        if (t > wallet.get() + 1e-9) { ui.toast('Pas assez de DaveCoins pour rejouer.', 'error'); return; }
        bets = { ...lastBets };
        undo.length = 0;
        sound.play('bet');
        paint();
      });

      function payout(result, placed) {
        let pay = 0;
        Object.entries(placed).forEach(([id, v]) => (pay += v * PAY[result.filter((r) => r === id).length]));
        return round2(pay);
      }

      /** Lancer d'un dé : saut + tonneaux, puis il retombe sur la face voulue. */
      function tumble(i, faceIdx, dur) {
        const [fx, fy] = POSE[faceIdx];
        const [cx, cy] = pose[i];
        const tx = fx + 360 * (2 + rng.int(0, 1)) * (rng.float() < 0.5 ? 1 : -1);
        const ty = fy + 360 * (2 + rng.int(0, 2));
        const a = cubes[i].animate([
          { transform: `rotateX(${cx}deg) rotateY(${cy}deg)` },
          { transform: `rotateX(${(cx + tx) / 2}deg) rotateY(${(cy + ty) / 2}deg) rotateZ(25deg)`, offset: 0.45 },
          { transform: `rotateX(${tx}deg) rotateY(${ty}deg)` }
        ], { duration: dur, easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'forwards' });
        dice[i].animate([
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(-70px) scale(1.08)', offset: 0.35 },
          { transform: 'translateY(0) scale(1)', offset: 0.7 },
          { transform: 'translateY(-14px) scale(1.02)', offset: 0.85 },
          { transform: 'translateY(0) scale(1)' }
        ], { duration: dur, easing: 'ease-in-out' });
        return a.finished.then(() => {
          pose[i] = [((tx % 360) + 360) % 360, ((ty % 360) + 360) % 360];
          cubes[i].style.transform = `rotateX(${pose[i][0]}deg) rotateY(${pose[i][1]}deg)`;
          a.cancel();
        });
      }

      async function roll() {
        const stake = total();
        if (rolling || !stake) return;
        const E = DP.engine;
        let srv = null;
        if (E && E.on) {
          // en ligne : le serveur lance les dés
          rolling = true; paint();
          srv = await E.call('dice_roll', { p_bets: bets }, { defer: true });
          if (!srv || !alive) { rolling = false; paint(); return; }
          E.debitView(stake);
        } else if (!wallet.place(stake)) return;
        rolling = true;
        lastBets = { ...bets };
        boxes.forEach((b) => { b.classList.remove('win', 'lose'); b.querySelector('.dbet__hits').textContent = ''; });
        dice.forEach((d) => d.classList.remove('match'));
        paint();
        sound.play('dice');

        const idx = srv ? srv.idx : [0, 1, 2].map(() => rng.int(0, 5));
        const result = idx.map((k) => FACES[k].id);
        pending = srv ? null : { result, stake, placed: { ...bets } };
        const hits = {};
        let streak = 0;
        const rattle = setInterval(() => sound.play('dice'), 260);
        await Promise.all(idx.map((k, i) => tumble(i, k, 1100 + i * 320).then(() => {
          if (!alive) return;
          if (i === 2) clearInterval(rattle);
          sound.play('reelStop', { i });
          const id = result[i];
          if (lastBets[id]) {
            hits[id] = (hits[id] || 0) + 1;
            // chaque dé gagnant monte d'un cran : le 3e sonne bien plus fort que le 1er
            sound.play('streak', { i: streak * 4 + 2 });
            streak++;
            dice[i].classList.add('match');
            ui.burst(dice[i], { n: 10 + streak * 8, spread: 1 + streak * 0.3 });
            const box = boxOf(id);
            box.querySelector('.dbet__hits').textContent = '×' + PAY[hits[id]];
            box.animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.2,1.6,.4,1)' });
          }
        })));
        clearInterval(rattle);
        if (!alive) return;

        pending = null;
        const pay = srv ? srv.payout : payout(result, lastBets);
        if (srv) DP.engine.reveal(srv.acct);
        settle('dice', stake, pay, { silent: true });
        lastOut.set(pay > 0 ? `<span class="pos">+${fmt(pay)}</span>` : '0');
        let delay = 0;
        Object.entries(lastBets).forEach(([id, v]) => {
          const box = boxOf(id);
          const n = hits[id] || 0;
          if (n) {
            box.classList.add('win');
            setTimeout(() => { if (!alive) return; ui.burst(box, { n: 14 + n * 8 }); ui.floatText(box, '+' + fmt(v * PAY[n])); sound.play('coin'); }, delay);
            delay += 160;
          } else box.classList.add('lose');
        });
        if (pay > 0) {
          sound.play('win', { x: pay / stake });
          ui.result(stage, { win: true, mult: pay / stake, amount: pay });
          if (Object.values(hits).some((n) => n === 3)) { ui.shake(stage, 2); ui.coinRain(stage, 30); sound.play('jackpot'); }
        } else {
          sound.play('lose');
          ui.result(stage, { win: false, mult: 0 });
        }
        await sleep(1000);
        if (!alive) return;
        bets = {};
        undo.length = 0;
        rolling = false;
        boxes.forEach((b) => b.classList.remove('lose'));
        paint();
      }
      rollBtn.addEventListener('click', roll);
      const onKey = (e) => { if (e.code === 'Space' && !e.target.closest('input')) { e.preventDefault(); roll(); } };
      window.addEventListener('keydown', onKey);
      paint();

      return () => {
        alive = false;
        window.removeEventListener('keydown', onKey);
        if (pending) settle('dice', pending.stake, payout(pending.result, pending.placed), { silent: true });
      };
    }
  });
})();
