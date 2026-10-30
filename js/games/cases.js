/* DaveCases — vitrine de caisses, ouverture (×1 à ×4) et mode Battle contre la bande.
 * Chaque caisse rend 95 % de son prix en moyenne : le poids de l'objet le moins cher est
 * calculé au chargement pour tomber pile sur ce taux. Les chances exactes sont affichées.
 */
(function () {
  'use strict';
  const { IMG, rng, fmt, wallet, settle, sound, ui, round2, sleep, esc, cards, inventory } = DP;
  const RTP = 0.95;

  const ITEMS = {
    olman: { name: 'Olman', img: 'olman.png' },
    tdam: { name: 'Tdam', img: 'tdam.png' },
    sevare: { name: 'Sévaré', img: 'sevare.png' },
    slyme: { name: 'Slymefire', img: 'slymefire.png' },
    axb: { name: 'AXB', img: 'axb.png' },
    sauce: { name: 'Sauce Blanche', img: 'sauceblanche.png' },
    casino: { name: 'La Machine', img: 'casino.png', flat: true },
    jpz: { name: 'JPZ Royal', img: 'jpz.png' },
    billy: { name: 'Billy', img: 'billy.jpg' },
    carl: { name: 'Carl', img: 'carl.jpg' },
    linkay: { name: 'Linkay', img: 'linkay.jpg' },
    lucasco: { name: 'Lucasco Aura', img: 'lucasco.jpg' },
    olmanaura: { name: 'Olman Aura', img: 'olmanaura.jpg' },
    petitbonnin: { name: 'Petit Bonnin', img: 'petitbonnin.jpg' },
    tdam2: { name: 'Tdam Télécommande', img: 'tdam2.jpg' },
    tddam: { name: 'Tddam', img: 'tddam.jpg' },
    yohan: { name: 'Yohan', img: 'yohan.jpg' },
    jppz: { name: 'JPZ et son chien', img: 'jppz.jpg' },
    jpz2: { name: 'Free JPZ', img: 'jpz2.jpg' },
    charis: { name: 'JPZ Charismatique', img: 'jpzcharis.jpg' }
  };
  // [objet, multiplicateur du prix, poids] — le 1er poids (null) est calibré pour un RTP de 95 %
  const CASES = [
    { id: 'bande', name: 'Caisse de la Bande', price: 10, color: '#ff6b2c', cover: 'sevare.png',
      drops: [['olman', 0.3, null], ['tdam', 0.5, 2600], ['sevare', 0.8, 2000], ['slyme', 1.2, 1500], ['axb', 2, 900], ['sauce', 5, 280], ['casino', 15, 70], ['jpz', 50, 15]] },
    { id: 'aura', name: 'Caisse Aura', price: 50, color: '#9a6bff', cover: 'lucasco.jpg',
      drops: [['yohan', 0.2, null], ['linkay', 0.5, 2500], ['billy', 0.8, 1800], ['petitbonnin', 1.2, 1300], ['tddam', 2.5, 800], ['olmanaura', 6, 200], ['lucasco', 20, 45], ['jpz2', 80, 8]] },
    { id: 'sauce', name: 'Caisse Sauce Blanche', price: 100, color: '#e9ecf2', cover: 'sauceblanche.png',
      drops: [['olman', 0.15, null], ['tdam', 0.4, 2500], ['sevare', 0.7, 1800], ['slyme', 1.1, 1200], ['axb', 2.5, 700], ['sauce', 8, 180], ['casino', 30, 40], ['jpz', 120, 6]] },
    { id: 'tdam', name: 'Caisse Tdam & Co', price: 250, color: '#2dd4bf', cover: 'tddam.jpg',
      drops: [['carl', 0.15, null], ['tdam2', 0.4, 2500], ['tddam', 0.7, 1800], ['sevare', 1.1, 1200], ['petitbonnin', 2.5, 700], ['billy', 8, 180], ['olmanaura', 30, 40], ['jppz', 150, 5]] },
    { id: 'royale', name: 'Caisse Royale JPZ', price: 500, color: '#ffc145', cover: 'jpz.png',
      drops: [['olman', 0.1, null], ['tdam', 0.3, 2400], ['sevare', 0.6, 1600], ['slyme', 1, 1100], ['axb', 3, 600], ['sauce', 12, 120], ['charis', 60, 22], ['jpz', 500, 2]] }
  ];
  CASES.forEach((c) => {
    const rest = c.drops.slice(1);
    const sw = rest.reduce((a, d) => a + d[2], 0), swm = rest.reduce((a, d) => a + d[2] * d[1], 0);
    c.drops[0][2] = Math.round((swm - RTP * sw) / (RTP - c.drops[0][1]));
    c.total = c.drops.reduce((a, d) => a + d[2], 0);
    c.best = c.drops[c.drops.length - 1];
  });

  // Raretés (couleur du cadre néon) selon le multiplicateur du prix de la caisse
  const RARITY = [
    { max: 0.6, label: 'Commun', c: '#e6e9f0', lvl: 0, i: 0 },
    { max: 1.5, label: 'Peu commun', c: '#8dff3a', lvl: 2, i: 1 },
    { max: 4, label: 'Rare', c: '#2ea8ff', lvl: 4, i: 2 },
    { max: 20, label: 'Épique', c: '#c04dff', lvl: 7, i: 3 },
    { max: 100, label: 'Légendaire', c: '#ffb21e', lvl: 11, i: 4 },
    { max: Infinity, label: 'Mythique', c: '#ff5ad1', lvl: 14, i: 5, rainbow: true }
  ];
  // Une règle CSS par rareté pour le cadre (le SVG n'est généré qu'une fois)
  (() => {
    const st = document.createElement('style');
    st.textContent = RARITY.map((r) => `.tcard[data-r="${r.i}"] .tcard__frame{background-image:${DP.cardFrame(r)}}.tcard.compact[data-r="${r.i}"] .tcard__frame{background-image:${DP.cardFrame(r, true)}}`).join('\n');
    document.head.appendChild(st);
  })();
  const rarity = (m) => RARITY.find((r) => m < r.max) || RARITY[RARITY.length - 1];
  const BOTS = ['olman', 'billy', 'tddam', 'linkay', 'axb', 'yohan'];
  const SET_REWARD = 10; // album complet = 10× le prix de la caisse

  // Chaque objet de chaque caisse devient une carte à collectionner (id « caisse:objet »).
  CASES.forEach((c) => {
    const set = { id: c.id, name: c.name, color: c.color, price: c.price, cover: c.cover, reward: c.price * SET_REWARD, cards: [] };
    c.drops.forEach((d, i) => {
      const it = ITEMS[d[0]];
      const card = { id: `${c.id}:${d[0]}`, key: d[0], name: it.name, img: it.img, flat: !!it.flat, value: round2(c.price * d[1]),
        mult: d[1], rarity: rarity(d[1]), no: i + 1, of: c.drops.length, set: c.id, setName: c.name, chance: d[2] / c.total };
      cards.byId[card.id] = card;
      set.cards.push(card);
    });
    cards.sets.push(set);
  });
  const cardOf = (box, d) => cards.byId[`${box.id}:${d[0]}`];

  /** Carte à collectionner (cadre de rareté, numéro, valeur de revente). */
  cards.html = (card, { cls = '', owned = true, count = 0, compact = false } = {}) => `<div class="tcard ${compact ? 'compact' : ''} ${owned ? '' : 'missing'} ${cls}" data-r="${card.rarity.i}" style="--r:${card.rarity.c}" data-card="${card.id}">
      <div class="tcard__img"><img class="${card.flat ? 'flat' : ''}" src="${IMG}${card.img}" alt="" draggable="false"></div>
      <div class="tcard__frame"></div>
      <span class="tcard__gem tl num">${String(card.no).padStart(2, '0')}</span>
      <span class="tcard__gem tr">${card.rarity.label.charAt(0)}</span>
      ${count > 1 ? `<span class="tcard__gem br num">×${count}</span>` : ''}
      <div class="tcard__plate">
        <span class="tcard__rar">${card.rarity.label}</span>
        <span class="tcard__name">${owned ? card.name : '???'}</span>
        <span class="tcard__val">${ui.coin('coin--xs')}<b class="num">${fmt(card.value)}</b></span>
      </div>
    </div>`;

  function drawItem(box) {
    let r = rng.float() * box.total;
    for (const d of box.drops) { r -= d[2]; if (r < 0) return d; }
    return box.drops[0];
  }
  // Dans la bande qui défile : la carte néon en version compacte
  const itemCard = (box, d, cls = '') => cards.html(cards.byId[`${box.id}:${d[0]}`], { compact: true, cls });

  /** Caisse dessinée : couvercle, bandes, rivets, serrure et emblème. */
  const crateHtml = (box, cls = '') => `<div class="crate ${cls}" style="--c:${box.color}">
      <div class="crate__lid"><i></i></div>
      <div class="crate__body"><span class="crate__lock"></span><span class="crate__emblem"><img src="${IMG}${box.cover}" alt=""></span></div>
      <div class="crate__shadow"></div>
    </div>`;

  /** Bande d'objets qui défile et s'arrête sur `win`. */
  function spinStrip(row, box, win, dur, onTick) {
    const N = 56, WIN_AT = 48;
    const seq = Array.from({ length: N }, (_, i) => (i === WIN_AT ? win : drawItem(box)));
    row.innerHTML = `<div class="strip__track">${seq.map((d) => itemCard(box, d)).join('')}</div><i class="strip__marker"></i>`;
    const track = row.firstElementChild;
    const first = track.children[0];
    const step = first.offsetWidth + parseFloat(getComputedStyle(track).columnGap || 8);
    const center = row.clientWidth / 2;
    const target = WIN_AT * step + first.offsetWidth / 2 - center + (rng.float() - 0.5) * first.offsetWidth * 0.7;
    return new Promise((resolve) => {
      const t0 = performance.now();
      let lastIdx = -1;
      const frame = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const x = target * (1 - Math.pow(1 - k, 4));
        track.style.transform = `translateX(${-x}px)`;
        const idx = Math.floor((x + center) / step);
        if (idx !== lastIdx) { lastIdx = idx; onTick && onTick(k); }
        if (k < 1) requestAnimationFrame(frame);
        else { track.children[WIN_AT].classList.add('won'); resolve(track.children[WIN_AT]); }
      };
      requestAnimationFrame(frame);
    });
  }

  // Exposé pour la vitrine du lobby
  DP.cases = { list: CASES, crateHtml, rarity };

  DP.games.register({
    id: 'cases',
    name: 'DaveCases',
    icon: 'gift',
    tagline: 'Cinq caisses à ouvrir, ou en Battle contre la bande',
    rtp: '95 %',
    isNew: true,
    hue: 30,
    art: `<div class="art-case">${crateHtml(CASES[4], 'crate--sm')}</div>`,
    rules: `<p>Choisis une caisse dans la vitrine, puis ouvre-la : les cartes défilent et s’arrêtent sur ta récompense. La carte va dans ton <strong>inventaire</strong> : vends-la tout de suite pour récupérer sa valeur en DaveCoins, ou garde-la pour ta collection.</p>
      <ul><li>Tu peux ouvrir jusqu’à <strong>4 caisses</strong> d’un coup.</li>
      <li><strong>Battle</strong> : tu affrontes 1 à 3 membres de la bande sur 1 à 5 manches avec la même caisse. Le plus gros total remporte <strong>toutes les cartes</strong> de la partie (en cas d’égalité, la valeur est partagée en DaveCoins).</li>
      <li><strong>Collection</strong> : chaque caisse est un album. Possède toutes ses cartes en même temps pour débloquer une récompense unique de ${SET_REWARD}× le prix de la caisse.</li>
      <li>Chaque caisse rend 95 % de son prix en moyenne. Les chances exactes de chaque objet sont affichées sur la page de la caisse.</li></ul>`,
    mount(root, opts = {}) {
      const { panel, stage } = ui.layout(root);
      const gameEl = root.querySelector('.game');
      let box = null, mode = 'open', count = 1, opps = 1, rounds = 3, busy = false, alive = true;
      let pending = null; // { cost, payout } réglé si on quitte en pleine ouverture

      ui.segmented(panel, { label: 'Mode', value: mode, options: [{ value: 'open', label: 'Ouvrir' }, { value: 'battle', label: 'Battle' }], onChange: (v) => { mode = v; paint(); } });
      const countWrap = ui.el('<div></div>'), battleWrap = ui.el('<div class="stack-sm"></div>');
      panel.append(countWrap, battleWrap);
      const countSeg = ui.segmented(countWrap, { label: 'Nombre de caisses', value: count, options: [1, 2, 3, 4].map((n) => ({ value: n, label: '×' + n })), onChange: (v) => { count = v; paint(); } });
      const oppSeg = ui.segmented(battleWrap, { label: 'Adversaires', value: opps, options: [1, 2, 3].map((n) => ({ value: n, label: String(n) })), onChange: (v) => { opps = v; paint(); } });
      const roundSeg = ui.segmented(battleWrap, { label: 'Manches', value: rounds, options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) })), onChange: (v) => { rounds = v; paint(); } });
      const costOut = ui.readout(panel, 'Coût', '');
      const goBtn = ui.button(panel, '');
      const lastOut = ui.readout(panel, 'Dernier gain', '—');
      stage.classList.add('cases-stage');

      const cost = () => (box ? box.price * (mode === 'open' ? count : rounds) : 0);

      /* ---------- Vitrine ---------- */
      function showList() {
        box = null;
        gameEl.classList.add('is-list');
        stage.innerHTML = `<div class="vault">
          <div class="vault__head"><h3>La vitrine</h3><span class="muted">${CASES.length} caisses · clique sur une caisse pour voir son contenu</span></div>
          <div class="vault__grid">${CASES.map((c) => `
            <button type="button" class="vault__item" data-id="${c.id}" style="--c:${c.color}">
              ${crateHtml(c)}
              <span class="vault__name">${c.name}</span>
              <span class="vault__price">${ui.coin('coin--sm')}<b class="num">${fmt(c.price)}</b></span>
              <span class="vault__best">Jusqu’à <b class="num">${fmt(c.price * c.best[1])}</b></span>
            </button>`).join('')}
          </div>
        </div>`;
        const items = [...stage.querySelectorAll('.vault__item')];
        DP_MOTION.onView(items, 80);
        DP_MOTION.tilt(items, 10);
        items.forEach((b) => b.addEventListener('pointerenter', () => sound.play('tick', { p: 2 })));
      }
      stage.addEventListener('click', (e) => {
        const b = e.target.closest('.vault__item');
        if (b && !busy) { sound.play('whoosh'); showCase(CASES.find((c) => c.id === b.dataset.id)); }
        if (e.target.closest('.js-back') && !busy) { sound.play('click'); if (location.hash.startsWith('#/caisses/')) history.replaceState(null, '', '#/caisses'); showList(); }
      });

      /* ---------- Page d'une caisse ---------- */
      function showCase(c) {
        box = c;
        gameEl.classList.remove('is-list');
        stage.innerHTML = `<div class="cases">
          <div class="cases__top">
            <button type="button" class="btn btn--ghost btn--sm js-back">${ui.icon('arrow-left', 'i--sm')}Toutes les caisses</button>
            <span class="muted js-sub"></span>
          </div>
          <div class="cases__hero" style="--c:${c.color}">
            ${crateHtml(c, 'crate--lg js-crate')}
            <div><h3>${c.name}</h3><p class="cases__price">${ui.coin('coin--sm')}<b class="num">${fmt(c.price)}</b> la caisse</p>
              <p class="muted">Meilleur objet : <b style="color:${rarity(c.best[1]).c}">${ITEMS[c.best[0]].name}</b> · ${fmt(c.price * c.best[1])} DaveCoins</p></div>
          </div>
          <div class="cases__strips"></div>
          <div class="cases__dropshead"><h4>Cartes de la caisse</h4><span class="muted">Chances exactes · RTP 95 % · album complet = ${fmt(c.price * SET_REWARD)} DaveCoins</span></div>
          <div class="cases__drops">${[...c.drops].reverse().map((d) => { const card = cardOf(c, d); const own = inventory.count(card.id); return `<div class="drop">${cards.html(card, { count: own, compact: true })}<span class="drop__pct num">${(card.chance * 100).toFixed(card.chance < 0.01 ? 2 : 1)} %${own ? ` · <span class="pos">possédée ×${own}</span>` : ''}</span></div>`; }).join('')}</div>
        </div>`;
        DP_MOTION.reveal(stage, '.cases__top, .cases__hero, .cases__dropshead');
        DP_MOTION.onView([...stage.querySelectorAll('.drop')], 200);
        paint();
      }

      function playerTag(i, total = 0) {
        const me = i === 0;
        const bot = BOTS[(i - 1 + BOTS.length) % BOTS.length];
        return `<div class="ptag${me ? ' me' : ''}">${me ? `<span class="avatar">${esc(DP.auth.current().charAt(0).toUpperCase())}</span><b>Toi</b>` : `<img src="${IMG}${ITEMS[bot].img}" alt=""><b>${ITEMS[bot].name}</b>`}<span class="ptag__total num">${fmt(total)}</span></div>`;
      }
      function idleStrips() {
        const el = stage.querySelector('.cases__strips');
        if (!el || !box) return;
        const n = mode === 'open' ? count : opps + 1;
        el.innerHTML = Array.from({ length: n }, (_, i) => `<div class="strip-row">${mode === 'battle' ? playerTag(i) : ''}<div class="strip"><div class="strip__track">${Array.from({ length: 12 }, () => itemCard(box, drawItem(box))).join('')}</div><i class="strip__marker"></i></div></div>`).join('');
        el.querySelectorAll('.strip__track').forEach((t) => (t.style.transform = `translateX(${-rng.int(0, 200)}px)`));
      }
      function paint() {
        countWrap.hidden = mode !== 'open';
        battleWrap.hidden = mode !== 'battle';
        [countSeg, oppSeg, roundSeg].forEach((s) => s.disable(busy));
        costOut.set(`${ui.coin('coin--xs')} ${fmt(cost())}`);
        goBtn.innerHTML = mode === 'open' ? `Ouvrir ${count > 1 ? count + ' caisses' : 'la caisse'}` : 'Lancer la battle';
        goBtn.disabled = busy || !box;
        const sub = stage.querySelector('.js-sub');
        if (sub && box) sub.innerHTML = mode === 'open' ? `${count} caisse${count > 1 ? 's' : ''} · ${fmt(cost())} DaveCoins` : `Battle · ${opps + 1} joueurs · ${rounds} manche${rounds > 1 ? 's' : ''}`;
        if (!busy) idleStrips();
      }
      function unlock() {
        busy = false;
        goBtn.disabled = false;
        [countSeg, oppSeg, roundSeg].forEach((s) => s.disable(false));
        const back = stage.querySelector('.js-back');
        if (back) back.disabled = false;
      }

      /** Butin : les cartes gagnées se retournent une à une, puis vendre ou garder. */
      async function showLoot(cardList) {
        stage.querySelectorAll('.lootbox').forEach((n) => n.remove());
        const total = round2(cardList.reduce((a, c) => a + c.value, 0));
        const el = ui.el(`<div class="lootbox">
          <div class="lootbox__head"><h4>Ton butin · <span class="num">${cardList.length}</span> carte${cardList.length > 1 ? 's' : ''}</h4><span class="muted">Ajouté à ton inventaire</span></div>
          <div class="lootbox__cards">${cardList.map((c, i) => `<div class="lootbox__slot" data-i="${i}">${cards.html(c)}<button type="button" class="btn btn--ghost btn--sm js-sell1">Vendre · <span class="num">${fmt(c.value)}</span></button></div>`).join('')}</div>
          <div class="lootbox__actions">
            <button type="button" class="btn btn--primary js-sellall">${ui.icon('coins', 'i--sm')}Tout vendre · <span class="num js-left">${fmt(total)}</span></button>
            <button type="button" class="btn btn--ghost js-keep">${ui.icon('layers-2', 'i--sm')}Tout garder</button>
            <a class="btn btn--ghost" href="#/inventaire">Voir l’inventaire</a>
          </div>
        </div>`);
        stage.querySelector('.cases').appendChild(el);
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const slots = [...el.querySelectorAll('.lootbox__slot')];
        slots.forEach((s, i) => s.animate([{ transform: 'rotateY(90deg) translateY(20px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 600, delay: i * 120, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
        let left = cardList.map((c) => c);
        const paintLeft = () => {
          const v = round2(left.filter(Boolean).reduce((a, c) => a + c.value, 0));
          el.querySelector('.js-left').textContent = fmt(v);
          el.querySelector('.js-sellall').disabled = v === 0 && !left.some(Boolean);
        };
        const sellOne = (i) => {
          const c = left[i];
          if (!c) return;
          const got = inventory.sell(c.id, 1);
          if (!got) { ui.toast('Cette carte n’est plus dans ton inventaire.', 'error'); left[i] = null; return; }
          left[i] = null;
          const slot = slots[i];
          slot.classList.add('sold');
          slot.querySelector('.js-sell1').disabled = true;
          slot.querySelector('.js-sell1').innerHTML = 'Vendue';
          ui.floatText(slot, '+' + fmt(got));
          sound.play('coin');
          paintLeft();
        };
        el.addEventListener('click', (e) => {
          const one = e.target.closest('.js-sell1');
          if (one) { sellOne(+one.closest('.lootbox__slot').dataset.i); return; }
          if (e.target.closest('.js-sellall')) {
            let sum = 0;
            left.forEach((c, i) => { if (c) { const before = wallet.get(); sellOne(i); sum += wallet.get() - before; } });
            if (sum > 0) { sound.play('cashout'); ui.toast(`Cartes vendues : +${fmt(sum)} DaveCoins`, 'win'); }
            return;
          }
          if (e.target.closest('.js-keep')) {
            sound.play('chip');
            ui.toast(`${left.filter(Boolean).length} carte(s) gardée(s) dans ton inventaire`, 'win');
            el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(10px)' }], { duration: 300 }).finished.then(() => el.remove());
          }
        });
      }

      /** Ouverture de la caisse : elle tremble, le couvercle saute, éclair. */
      async function crackCrate() {
        const crate = stage.querySelector('.js-crate');
        if (!crate) return;
        sound.play('anticip', { d: 0.9 });
        crate.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-3deg) translateX(-3px)' }, { transform: 'rotate(3deg) translateX(3px)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg) translateY(-4px)' }, { transform: 'rotate(0)' }],
          { duration: 900, easing: 'ease-in' });
        await sleep(880);
        crate.classList.add('open');
        sound.play('boom');
        sound.play('fs');
        ui.flash(stage);
        ui.burst(crate, { n: 40, colors: [box.color, '#ffffff', '#ffc145'], spread: 2 });
        await sleep(450);
      }

      function reveal(card, d, quiet) {
        const rr = rarity(d[1]);
        card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1.06)' }], { duration: 400, easing: 'cubic-bezier(.2,1.6,.4,1)', fill: 'forwards' });
        if (!quiet) sound.play('streak', { i: rr.lvl });
        ui.burst(card, { n: 8 + rr.lvl * 3, colors: [rr.c, '#ffffff'], spread: 1 + rr.lvl / 10 });
        ui.floatText(card, '+' + fmt(round2(box.price * d[1])));
        if (rr.lvl >= 10) { ui.shake(stage, rr.lvl >= 14 ? 2 : 1); ui.coinRain(stage, rr.lvl >= 14 ? 60 : 25); sound.play('jackpot'); }
      }
      const tick = (k) => sound.play('tick', { p: 1 - k });

      async function openCases() {
        const c = cost();
        if (!wallet.place(c)) return;
        busy = true; paint();
        stage.querySelector('.js-back').disabled = true;
        const wins = Array.from({ length: count }, () => drawItem(box));
        const payout = round2(wins.reduce((a, d) => a + box.price * d[1], 0));
        const won = wins.map((d) => cardOf(box, d));
        pending = { cost: c, payout, cards: won.map((x) => x.id) };
        await crackCrate();
        if (!alive) return;
        const stripsEl = stage.querySelector('.cases__strips');
        stripsEl.innerHTML = wins.map(() => '<div class="strip-row"><div class="strip"></div></div>').join('');
        stripsEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        sound.play('whoosh');
        const rows = [...stripsEl.querySelectorAll('.strip')];
        const cards = await Promise.all(wins.map((d, i) => spinStrip(rows[i], box, d, 4600 + i * 350, i === 0 ? tick : null)));
        if (!alive) return;
        pending = null;
        const order = wins.map((d, i) => i).sort((a, b) => wins[a][1] - wins[b][1]);
        for (const i of order) { reveal(cards[i], wins[i]); await sleep(260); if (!alive) return; }
        inventory.add(won.map((x) => x.id));
        settle('cases', c, payout, { silent: true, credit: false });
        lastOut.set(`<span class="${payout >= c ? 'pos' : ''}">${fmt(payout)} en cartes</span>`);
        if (payout < c) sound.play('lose');
        stage.querySelector('.js-crate')?.classList.remove('open');
        unlock();
        await showLoot(won);
      }

      async function battle() {
        const c = cost();
        if (!wallet.place(c)) return;
        busy = true; paint();
        stage.querySelector('.js-back').disabled = true;
        const players = opps + 1;
        const draws = Array.from({ length: rounds }, () => Array.from({ length: players }, () => drawItem(box)));
        const totals = Array(players).fill(0);
        draws.forEach((r) => r.forEach((d, p) => (totals[p] = round2(totals[p] + box.price * d[1]))));
        const pot = round2(totals.reduce((a, b) => a + b, 0));
        const best = Math.max(...totals);
        const winners = totals.map((t, i) => (t === best ? i : -1)).filter((i) => i >= 0);
        const myPay = winners.includes(0) ? round2(pot / winners.length) : 0;
        const soloWin = winners.length === 1 && winners[0] === 0;
        const potCards = draws.flat().map((d) => cardOf(box, d));
        // victoire seule : toutes les cartes ; égalité : la part du pot en DaveCoins
        pending = soloWin ? { cost: c, payout: myPay, cards: potCards.map((x) => x.id) } : { cost: c, payout: myPay, coins: true };
        await crackCrate();
        if (!alive) return;

        const running = Array(players).fill(0);
        const stripsEl = stage.querySelector('.cases__strips');
        stripsEl.innerHTML = Array.from({ length: players }, (_, i) => `<div class="strip-row">${playerTag(i)}<div class="strip"></div></div>`).join('');
        stripsEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const rows = [...stripsEl.querySelectorAll('.strip-row')];
        const sub = stage.querySelector('.js-sub');
        for (let r = 0; r < rounds; r++) {
          sub.innerHTML = `Manche <b class="num">${r + 1}/${rounds}</b> · pot <b class="num">${fmt(round2(running.reduce((a, b) => a + b, 0)))}</b>`;
          sound.play('whoosh');
          const cards = await Promise.all(draws[r].map((d, p) => spinStrip(rows[p].querySelector('.strip'), box, d, 3400 + p * 120, p === 0 ? tick : null)));
          if (!alive) return;
          const topVal = Math.max(...draws[r].map((d) => d[1]));
          draws[r].forEach((d, p) => {
            running[p] = round2(running[p] + box.price * d[1]);
            reveal(cards[p], d, p !== 0);
            rows[p].querySelector('.ptag__total').textContent = fmt(running[p]);
          });
          sound.play('streak', { i: rarity(topVal).lvl });
          const lead = Math.max(...running);
          rows.forEach((row, p) => row.classList.toggle('lead', running[p] === lead));
          await sleep(1100);
          if (!alive) return;
        }
        pending = null;
        rows.forEach((row, p) => row.classList.toggle('winner', winners.includes(p)));
        if (soloWin) {
          inventory.add(potCards.map((x) => x.id));
          settle('cases', c, myPay, { silent: true, credit: false });
        } else settle('cases', c, myPay, { silent: true });
        lastOut.set(myPay ? `<span class="pos">+${fmt(myPay)}</span>` : '0');
        if (myPay) {
          sound.play('jackpot');
          ui.coinRain(stage, 40);
          ui.result(stage, { win: true, mult: myPay / c, amount: myPay, label: winners.length > 1 ? 'Égalité' : 'Victoire' });
        } else {
          sound.play('lose');
          const w = winners[0];
          ui.result(stage, { win: false, label: `${ITEMS[BOTS[(w - 1 + BOTS.length) % BOTS.length]].name} gagne` });
        }
        sub.innerHTML = `Pot total <b class="num">${fmt(pot)}</b>`;
        stage.querySelector('.js-crate')?.classList.remove('open');
        unlock();
        if (soloWin) await showLoot(potCards);
      }

      goBtn.addEventListener('click', () => { if (!busy && box) (mode === 'open' ? openCases : battle)(); });
      const onResize = () => { if (!busy) idleStrips(); };
      window.addEventListener('resize', onResize);
      const start = CASES.find((c) => c.id === opts.caseId);
      if (start) showCase(start); else showList();
      paint();

      return () => {
        alive = false;
        window.removeEventListener('resize', onResize);
        if (pending) {
          if (pending.cards) { inventory.add(pending.cards); settle('cases', pending.cost, pending.payout, { silent: true, credit: false }); }
          else settle('cases', pending.cost, pending.payout, { silent: true });
        }
      };
    }
  });
})();
