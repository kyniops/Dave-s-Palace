/* DaveDice — mise sur un ou plusieurs visages, lance 3 dés. RTP ≈ 95,8 %. */
(function () {
  'use strict';
  const { IMG, rng, fmt, wallet, settle, sound, ui, sleep, round2 } = DP;
  const FACES = [
    { id: 'axb', name: 'AXB', src: 'axb.png' },
    { id: 'olman', name: 'OLMAN', src: 'olman.png' },
    { id: 'sauce', name: 'SAUCE BLANCHE', src: 'sauceblanche.png' },
    { id: 'sevare', name: 'SÉVARÉ', src: 'sevare.png' },
    { id: 'slyme', name: 'SLYMEFIRE', src: 'slymefire.png' },
    { id: 'tdam', name: 'TDAM', src: 'tdam.png' }
  ];
  // Multiplicateur (mise incluse) selon le nombre de dés qui montrent le visage choisi
  const PAY = { 0: 0, 1: 2, 2: 3, 3: 12 };
  const byId = Object.fromEntries(FACES.map((f) => [f.id, f]));

  DP.games.register({
    id: 'dice',
    name: 'DaveDice',
    icon: '🎲',
    tagline: 'Parie sur la bande, 3 dés, jusqu’à ×12',
    rtp: '95,8 %',
    colors: ['#0ea5e9', '#312e81'],
    art: `<div class="art-stack">${['sevare', 'tdam', 'axb'].map((k, i) => `<img src="${IMG}${byId[k].src}" alt="" style="width:34%;aspect-ratio:1;object-fit:cover;border-radius:16px;border:3px solid #fff;left:${8 + i * 28}%;top:${22 + (i % 2) * 14}%;transform:rotate(${-12 + i * 12}deg)">`).join('')}</div>`,
    rules: `<p>Sélectionne un ou plusieurs membres de la bande : ta mise est placée sur <strong>chacun</strong> d’eux.</p>
      <ul><li>Le visage sort sur <strong>1 dé</strong> : ×2</li>
      <li>Sur <strong>2 dés</strong> : ×3</li>
      <li>Sur les <strong>3 dés</strong> : ×12</li>
      <li>Aucun dé : la mise sur ce visage est perdue.</li></ul>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      const betIn = ui.betInput(panel, { label: 'Mise par visage', gameId: 'dice', initial: 10 });
      const totalOut = ui.readout(panel, 'Mise totale', '0');
      const rollBtn = ui.button(panel, 'Lancer les dés');
      const clearBtn = ui.button(panel, 'Désélectionner', 'btn btn--ghost btn--block');
      panel.appendChild(ui.el(`<div class="readout" style="flex-direction:column;align-items:stretch;gap:4px">
        <span style="display:flex;justify-content:space-between"><span>1 dé</span><strong>×2</strong></span>
        <span style="display:flex;justify-content:space-between"><span>2 dés</span><strong>×3</strong></span>
        <span style="display:flex;justify-content:space-between"><span>3 dés</span><strong class="gold">×12</strong></span></div>`));

      stage.innerHTML = `<div class="dice-stage">
        <div class="dice-row">${[0, 1, 2].map(() => `<div class="die"><img src="${IMG}${rng.pick(FACES).src}" alt=""></div>`).join('')}</div>
        <div class="faces">${FACES.map((f) => `<button type="button" class="face" data-id="${f.id}"><img src="${IMG}${f.src}" alt=""><span>${f.name}</span><b class="face__hits"></b></button>`).join('')}</div>
      </div>`;
      const dice = [...stage.querySelectorAll('.die')];
      const faceBtns = [...stage.querySelectorAll('.face')];
      const picked = new Set(['sevare']);
      let rolling = false, alive = true, pending = null;

      function paint() {
        faceBtns.forEach((b) => { b.classList.toggle('on', picked.has(b.dataset.id)); b.disabled = rolling; });
        totalOut.set(`${ui.coin('coin--xs')} ${fmt(betIn.get() * picked.size)}`);
        rollBtn.disabled = rolling || picked.size === 0;
        clearBtn.disabled = rolling || picked.size === 0;
      }
      betIn.onChange(paint);
      stage.querySelector('.faces').addEventListener('click', (e) => {
        const b = e.target.closest('.face');
        if (!b || rolling) return;
        picked.has(b.dataset.id) ? picked.delete(b.dataset.id) : picked.add(b.dataset.id);
        faceBtns.forEach((f) => (f.querySelector('.face__hits').textContent = ''));
        sound.play('click');
        paint();
      });
      clearBtn.addEventListener('click', () => { picked.clear(); paint(); });

      function payout(result, per, sel) {
        let pay = 0;
        sel.forEach((id) => (pay += per * PAY[result.filter((r) => r === id).length]));
        return round2(pay);
      }

      async function roll() {
        if (rolling || !picked.size) return;
        const per = betIn.get();
        const total = round2(per * picked.size);
        if (!(per > 0)) { ui.toast('Mise invalide.', 'error'); return; }
        if (!wallet.place(total)) return;
        betIn.remember();
        rolling = true;
        betIn.disable(true);
        paint();
        sound.play('bet');
        faceBtns.forEach((f) => (f.querySelector('.face__hits').textContent = ''));
        dice.forEach((d) => d.classList.remove('match'));

        const result = [0, 1, 2].map(() => rng.pick(FACES).id);
        const sel = [...picked];
        pending = { result, per, total, sel };
        dice.forEach((d) => d.classList.add('rolling'));
        const shuffle = setInterval(() => {
          dice.forEach((d) => { if (d.classList.contains('rolling')) d.firstElementChild.src = IMG + rng.pick(FACES).src; });
          sound.play('tick');
        }, 80);
        for (let i = 0; i < 3; i++) {
          await sleep(i === 0 ? 700 : 380);
          if (!alive) { clearInterval(shuffle); return; }
          dice[i].classList.remove('rolling');
          dice[i].firstElementChild.src = IMG + byId[result[i]].src;
          sound.play('chip');
        }
        clearInterval(shuffle);

        pending = null;
        const pay = payout(result, per, sel);
        settle('dice', total, pay);
        dice.forEach((d, i) => { if (picked.has(result[i])) d.classList.add('match'); });
        sel.forEach((id) => {
          const n = result.filter((r) => r === id).length;
          if (n) stage.querySelector(`.face[data-id="${id}"] .face__hits`).textContent = '×' + PAY[n];
        });
        ui.result(stage, pay > 0 ? { win: true, mult: pay / total, amount: pay } : { win: false, mult: 0 });
        rolling = false;
        betIn.disable(false);
        paint();
      }
      rollBtn.addEventListener('click', roll);
      const onKey = (e) => { if (e.code === 'Space' && !e.target.closest('input')) { e.preventDefault(); roll(); } };
      window.addEventListener('keydown', onKey);
      paint();

      return () => {
        alive = false;
        window.removeEventListener('keydown', onKey);
        if (pending) settle('dice', pending.total, payout(pending.result, pending.per, pending.sel));
      };
    }
  });
})();
