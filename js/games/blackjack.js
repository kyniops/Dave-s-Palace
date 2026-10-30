/* DaveJack — blackjack 6 jeux, croupier reste sur 17, blackjack payé 3:2. RTP ≈ 99,4 %. */
(function () {
  'use strict';
  const { IMG, rng, fmt, wallet, settle, sound, ui, sleep, round2 } = DP;
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  // Les figures portent le visage de la bande
  const FACES = { K: 'jpz.png', Q: 'sauceblanche.png', J: 'tdam.png' };

  function newShoe() {
    const shoe = [];
    for (let d = 0; d < 6; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s });
    return rng.shuffle(shoe);
  }
  const cardVal = (c) => (c.r === 'A' ? 11 : ['J', 'Q', 'K'].includes(c.r) ? 10 : +c.r);
  function score(cards) {
    let t = 0, aces = 0;
    cards.forEach((c) => { t += cardVal(c); if (c.r === 'A') aces++; });
    while (t > 21 && aces) { t -= 10; aces--; }
    return { total: t, soft: aces > 0 && t <= 21 };
  }
  const isBJ = (cards) => cards.length === 2 && score(cards).total === 21;

  function cardHtml(c, hidden) {
    if (hidden) return '<div class="card back"></div>';
    const red = c.s === '♥' || c.s === '♦';
    const mid = FACES[c.r] ? `<img src="${IMG}${FACES[c.r]}" alt="">` : c.s;
    return `<div class="card${red ? ' red' : ''}"><div class="card__c tl">${c.r}<span>${c.s}</span></div><div class="card__mid">${mid}</div><div class="card__c br">${c.r}<span>${c.s}</span></div></div>`;
  }

  DP.games.register({
    id: 'blackjack',
    name: 'DaveJack',
    icon: 'spade',
    tagline: 'Blackjack royal, bats le croupier',
    rtp: '99,4 %',
    hue: 220,
    art: `<div class="art-cards"><div class="card" style="left:14%;top:14%;transform:rotate(-12deg)"><div class="card__c tl">A<span>♠</span></div><div class="card__mid">♠</div></div><div class="card red" style="left:42%;top:10%;transform:rotate(9deg)"><div class="card__c tl">K<span>♥</span></div><div class="card__mid"><img src="${IMG}jpz.png" alt=""></div></div></div>`,
    rules: `<p>Approche-toi le plus possible de 21 sans dépasser, et fais mieux que le croupier.</p>
      <ul><li><strong>Blackjack</strong> (As + figure/10 d’entrée) : paie 3 pour 2.</li>
      <li><strong>Doubler</strong> : double la mise, une seule carte de plus.</li>
      <li><strong>Séparer</strong> : sépare une paire en deux mains (une fois). As séparés : une carte chacun.</li>
      <li>Le croupier tire jusqu’à 16 et reste à partir de 17. Sabot de 6 jeux.</li></ul>
      <p>Les rois ont la tête de JPZ, évidemment.</p>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      const betIn = ui.betInput(panel, { gameId: 'blackjack', initial: 10 });
      const dealBtn = ui.button(panel, 'Distribuer');
      const actions = ui.el('<div class="panel__row" style="flex-wrap:wrap"></div>');
      panel.appendChild(actions);
      const hitBtn = ui.button(actions, ui.icon('plus', 'i--sm') + 'Tirer', 'btn btn--ghost');
      const standBtn = ui.button(actions, ui.icon('hand', 'i--sm') + 'Rester', 'btn btn--ghost');
      const actions2 = ui.el('<div class="panel__row"></div>');
      panel.appendChild(actions2);
      const dblBtn = ui.button(actions2, ui.icon('coins', 'i--sm') + 'Doubler', 'btn btn--ghost');
      const splitBtn = ui.button(actions2, ui.icon('split', 'i--sm') + 'Séparer', 'btn btn--ghost');
      const shoeOut = ui.readout(panel, 'Cartes dans le sabot', '');

      stage.innerHTML = `<div class="bj">
        <div class="bj__zone"><div class="bj__label">Croupier</div><div class="bj__hands js-dealer"></div></div>
        <div style="text-align:center"><div class="bj__msg"></div><div class="bj__payline">Blackjack paie 3:2 · croupier reste à 17</div></div>
        <div class="bj__zone"><div class="bj__hands js-player"></div><div class="bj__label" style="margin:8px 0 0">Toi</div></div>
      </div>`;
      const dealerEl = stage.querySelector('.js-dealer');
      const playerEl = stage.querySelector('.js-player');
      const msgEl = stage.querySelector('.bj__msg');
      msgEl.textContent = 'Place ta mise et distribue';

      let shoe = newShoe();
      let st = null; // { dealer:[], hands:[{cards,bet,done,doubled,result}], cur, phase, hideHole }
      let alive = true;

      const draw = () => {
        if (shoe.length < 60) { shoe = newShoe(); ui.toast('Nouveau sabot mélangé'); }
        return shoe.pop();
      };

      function renderHand(cards, opts = {}) {
        const s = score(opts.hideHole ? cards.slice(0, 1) : cards);
        const bust = s.total > 21;
        const label = opts.hideHole ? s.total : isBJ(cards) && !opts.split ? 'BJ' : s.soft && s.total < 21 ? `${s.total - 10}/${s.total}` : s.total;
        return `<div class="bj__hand ${opts.cls || ''}">
          <div class="bj__cards">${cards.map((c, i) => cardHtml(c, opts.hideHole && i === 1)).join('')}</div>
          ${cards.length ? `<div class="bj__total ${bust ? 'bust' : label === 'BJ' || s.total === 21 ? 'bj21' : ''}">${label}</div>` : ''}
          ${opts.bet ? `<div class="bj__bet">${ui.coin('coin--xs')} ${fmt(opts.bet)}</div>` : ''}
        </div>`;
      }

      function render() {
        shoeOut.set(String(shoe.length));
        if (!st) { dealerEl.innerHTML = renderHand([]); playerEl.innerHTML = renderHand([]); }
        else {
          dealerEl.innerHTML = renderHand(st.dealer, { hideHole: st.hideHole });
          playerEl.innerHTML = st.hands.map((h, i) => renderHand(h.cards, {
            bet: h.bet, split: st.hands.length > 1,
            cls: st.phase === 'player' && i === st.cur ? 'active' : h.result === 'win' || h.result === 'bj' ? 'done-win' : h.result === 'lose' ? 'done-lose' : ''
          })).join('');
        }
        const playing = st && st.phase === 'player';
        const h = playing ? st.hands[st.cur] : null;
        dealBtn.disabled = !!st;
        betIn.disable(!!st);
        hitBtn.disabled = standBtn.disabled = !playing;
        dblBtn.disabled = !playing || h.cards.length !== 2 || !wallet.canAfford(h.bet);
        splitBtn.disabled = !playing || st.hands.length > 1 || h.cards.length !== 2 ||
          cardVal(h.cards[0]) !== cardVal(h.cards[1]) || !wallet.canAfford(h.bet);
      }

      // Seule la dernière carte ajoutée doit être animée : on coupe l'animation des autres.
      function freezeOld() { stage.querySelectorAll('.card').forEach((c) => (c.style.animation = 'none')); }
      async function give(target) {
        freezeOld();
        target.push(draw());
        sound.play('card');
        render();
        await sleep(380);
      }

      async function deal() {
        const bet = betIn.get();
        if (!wallet.place(bet)) return;
        betIn.remember();
        msgEl.textContent = '';
        sound.play('bet');
        st = { dealer: [], hands: [{ cards: [], bet, done: false }], cur: 0, phase: 'deal', hideHole: true };
        render();
        for (const who of ['p', 'd', 'p', 'd']) {
          if (!alive) return;
          await give(who === 'p' ? st.hands[0].cards : st.dealer);
        }
        if (!alive) return;

        const pBJ = isBJ(st.hands[0].cards);
        const up = cardVal(st.dealer[0]);
        // Le croupier vérifie son blackjack s'il montre un As ou un 10.
        if (pBJ || ((up === 11 || up === 10) && isBJ(st.dealer))) return finish();
        st.phase = 'player';
        render();
      }

      async function next() {
        const h = st.hands[st.cur];
        h.done = true;
        if (st.cur < st.hands.length - 1) {
          st.cur++;
          const nh = st.hands[st.cur];
          if (nh.cards.length < 2) await give(nh.cards);
          if (!alive) return;
          if (nh.splitAces || score(nh.cards).total === 21) return next();
          render();
          return;
        }
        await finish();
      }

      async function hit() {
        if (!st || st.phase !== 'player') return;
        const h = st.hands[st.cur];
        st.phase = 'busy';
        await give(h.cards);
        if (!alive) return;
        st.phase = 'player';
        if (score(h.cards).total >= 21) return next();
        render();
      }
      async function stand() { if (st && st.phase === 'player') { st.phase = 'busy'; await next(); } }
      async function double() {
        if (!st || st.phase !== 'player') return;
        const h = st.hands[st.cur];
        if (!wallet.place(h.bet)) return;
        sound.play('bet');
        h.bet *= 2;
        h.doubled = true;
        st.phase = 'busy';
        await give(h.cards);
        if (!alive) return;
        await next();
      }
      async function split() {
        if (!st || st.phase !== 'player') return;
        const h = st.hands[0];
        if (!wallet.place(h.bet)) return;
        sound.play('bet');
        const aces = h.cards[0].r === 'A';
        st.hands = [
          { cards: [h.cards[0]], bet: h.bet, splitAces: aces },
          { cards: [h.cards[1]], bet: h.bet, splitAces: aces }
        ];
        st.phase = 'busy';
        await give(st.hands[0].cards);
        if (!alive) return;
        if (aces || score(st.hands[0].cards).total === 21) return next();
        st.phase = 'player';
        render();
      }

      const dealerMustPlay = () =>
        st.hands.some((h) => score(h.cards).total <= 21) && !(st.hands.length === 1 && isBJ(st.hands[0].cards));

      /** Calcule le résultat de chaque main et règle la partie. */
      function resolveRound() {
        const d = score(st.dealer).total;
        const dBJ = isBJ(st.dealer);
        let staked = 0, paid = 0;
        st.hands.forEach((h) => {
          const p = score(h.cards).total;
          const bj = isBJ(h.cards) && st.hands.length === 1;
          staked += h.bet;
          let pay = 0;
          if (p > 21) h.result = 'lose';
          else if (bj && !dBJ) { h.result = 'bj'; pay = h.bet * 2.5; }
          else if (dBJ && !bj) h.result = 'lose';
          else if (bj && dBJ) { h.result = 'push'; pay = h.bet; }
          else if (d > 21 || p > d) { h.result = 'win'; pay = h.bet * 2; }
          else if (p === d) { h.result = 'push'; pay = h.bet; }
          else h.result = 'lose';
          paid += pay;
        });
        paid = round2(paid);
        settle('blackjack', staked, paid);
        st.phase = 'over';
        return { d, dBJ, staked, paid };
      }

      async function finish() {
        st.phase = 'dealer';
        st.hideHole = false;
        freezeOld();
        render();
        const flip = dealerEl.querySelectorAll('.card')[1];
        if (flip) { flip.classList.add('flip'); sound.play('card'); }
        await sleep(500);
        if (!alive) return;
        if (dealerMustPlay()) {
          while (score(st.dealer).total < 17) {
            await give(st.dealer);
            if (!alive) return;
          }
        }

        const { d, dBJ, staked, paid } = resolveRound();
        const res = st.hands.map((h) => h.result);
        msgEl.textContent = res.includes('bj') ? 'Blackjack !' : st.hands.length > 1
          ? res.map((r) => ({ win: 'Gagné', lose: 'Perdu', push: 'Égalité' }[r])).join(' · ')
          : { win: d > 21 ? 'Le croupier saute, gagné !' : 'Gagné !', lose: score(st.hands[0].cards).total > 21 ? 'Tu as sauté…' : dBJ ? 'Blackjack du croupier' : 'Perdu', push: 'Égalité, mise rendue' }[res[0]];
        if (paid > staked) ui.result(stage, { win: true, mult: paid / staked, amount: paid });
        render();
        const ended = st;
        st = null;
        render(); // réactive les boutons de mise
        // On garde les cartes affichées jusqu'à la prochaine donne
        dealerEl.innerHTML = renderHand(ended.dealer);
        playerEl.innerHTML = ended.hands.map((h) => renderHand(h.cards, { bet: h.bet, split: ended.hands.length > 1, cls: h.result === 'win' || h.result === 'bj' ? 'done-win' : h.result === 'lose' ? 'done-lose' : '' })).join('');
        freezeOld();
      }

      dealBtn.addEventListener('click', deal);
      hitBtn.addEventListener('click', hit);
      standBtn.addEventListener('click', stand);
      dblBtn.addEventListener('click', double);
      splitBtn.addEventListener('click', split);
      const onKey = (e) => {
        if (e.target.closest('input')) return;
        const map = { KeyH: hitBtn, KeyS: standBtn, KeyD: dblBtn, KeyP: splitBtn, Space: dealBtn, Enter: dealBtn };
        const b = map[e.code];
        if (b && !b.disabled) { e.preventDefault(); b.click(); }
      };
      window.addEventListener('keydown', onKey);
      panel.appendChild(ui.el('<p class="note">Raccourcis : Espace distribuer · H tirer · S rester · D doubler · P séparer</p>'));
      render();

      return () => {
        alive = false;
        window.removeEventListener('keydown', onKey);
        // Main en cours : on reste sur toutes les mains et le croupier joue instantanément.
        if (st && st.phase !== 'over') {
          st.hands.forEach((h) => { while (h.cards.length < 2) h.cards.push(draw()); });
          while (st.dealer.length < 2) st.dealer.push(draw());
          if (dealerMustPlay()) while (score(st.dealer).total < 17) st.dealer.push(draw());
          resolveRound();
          st = null;
        }
      };
    }
  });
})();
