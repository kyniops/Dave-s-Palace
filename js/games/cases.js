/* DaveCases — vitrine de caisses, ouverture (×1 à ×4) et mode Battle contre la bande.
 * Chaque caisse rend 95 % de son prix en moyenne : le poids de l'objet le moins cher est
 * calculé au chargement pour tomber pile sur ce taux. Les chances exactes sont affichées.
 */
(function () {
  'use strict';
  const { IMG, rng, fmt, wallet, settle, sound, ui, round2, sleep, esc, cards, inventory } = DP;
  const RTP = 0.95;

  // Une photo = une carte, présente dans une seule caisse (le thème de la caisse suit la photo)
  const ITEMS = {
    // la bande
    olman: { name: 'Olman', img: 'olman.jpg' },
    tdam: { name: 'Tdam', img: 'tdam.png' },
    yohan: { name: 'Yohan', img: 'yohan.jpg' },
    axb: { name: 'AXB', img: 'axb.png' },
    billy: { name: 'Billy', img: 'billy.jpg' },
    sevare: { name: 'Sévaré', img: 'sevare.png' },
    nathan: { name: 'Nathan', img: 'nathan.jpg' },
    nathanmuscle: { name: 'Nathan Musclé', img: 'nathanmuscle.jpg' },
    // les gamers
    carl: { name: 'Carl', img: 'carl.jpg' },
    petitbonnin: { name: 'Petit Bonnin', img: 'petitbonnin.jpg' },
    tddam: { name: 'Tddam', img: 'tddam.jpg' },
    linkay: { name: 'Linkay', img: 'linkay.jpg' },
    linkaypose: { name: 'Linkay Posé', img: 'linkaypose.jpg' },
    tdam2: { name: 'Tdam Télécommande', img: 'tdam2.jpg' },
    casino: { name: 'La Machine', img: 'casino.png', flat: true },
    // kawaï
    slyme: { name: 'Slymefire Kawaï', img: 'slymefire.png' },
    petitkawai: { name: 'Petit Bonnin Kawaï', img: 'petitkawai.jpg' },
    lucascoroi: { name: 'Lucasco Roi du Poker', img: 'lucascoroi.jpg' },
    jpzkawai: { name: 'JPZ Kawaï', img: 'jpzkawai.jpg' },
    // aura
    axbblesse: { name: 'AXB Blessé', img: 'axbblesse.jpg' },
    axbserieux: { name: 'AXB Sérieux', img: 'axbserieux.jpg' },
    tdammasque: { name: 'Tdam Masqué', img: 'tdammasque.jpg' },
    tony: { name: 'Tony', img: 'tony.jpg' },
    tonny: { name: 'Tony le Boss', img: 'tonny.jpg' },
    olmanaura: { name: 'Olman Aura', img: 'olmanaura.jpg' },
    lucasco: { name: 'Lucasco Aura', img: 'lucasco.jpg' },
    // la royauté
    jpzcap: { name: 'JPZ Casquette', img: 'jpzcap.jpg' },
    sauce: { name: 'Sauce Blanche', img: 'sauceblanche.png' },
    jpz2: { name: 'Free JPZ', img: 'jpz2.jpg' },
    jppz: { name: 'JPZ et son chien', img: 'jppz.jpg' },
    charis: { name: 'JPZ Charismatique', img: 'jpzcharis.jpg' },
    jpz: { name: 'JPZ Royal', img: 'jpz.png' },
    forton: { name: 'Absolute Forton', img: 'forton.jpg' },
    // wanted
    teddam: { name: 'Teddam', img: 'teddam.jpg' },
    lucascoselfie: { name: 'Lucasco Selfie', img: 'lucascoselfie.jpg' },
    mathis: { name: 'Mathis Buffalo Grill', img: 'mathis.jpg' },
    tonyargent: { name: 'Tony Billets', img: 'tonyargent.jpg' },
    presidentmali: { name: 'Président du Mali', img: 'presidentmali.jpg' },
    eltigre: { name: 'El Tigre', img: 'eltigre.jpg' }
  };
  // [objet, multiplicateur du prix, poids] — le 1er poids (null) est calibré pour un RTP de 95 %.
  // La rareté découle du multiplicateur : plus la carte vaut cher dans sa caisse, plus elle est rare.
  const CASES = [
    { id: 'bande', name: 'Caisse de la Bande', price: 10, color: '#ff6b2c', cover: 'sevare.png',
      drops: [['olman', 0.3, null], ['tdam', 0.5, 2600], ['yohan', 0.8, 2000], ['axb', 1.2, 1500], ['billy', 2, 900], ['sevare', 4.5, 300], ['nathan', 12, 90], ['nathanmuscle', 40, 18]] },
    { id: 'gamers', name: 'Caisse Gamers', price: 25, color: '#2ea8ff', cover: 'linkay.jpg',
      drops: [['carl', 0.25, null], ['petitbonnin', 0.5, 2600], ['tddam', 0.9, 1900], ['linkay', 1.4, 1300], ['linkaypose', 3, 600], ['tdam2', 8, 150], ['casino', 30, 30]] },
    { id: 'kawai', name: 'Caisse Kawaï', price: 50, color: '#ff7ad9', cover: 'slymefire.png',
      drops: [['slyme', 0.25, null], ['petitkawai', 0.8, 2000], ['lucascoroi', 5, 300], ['jpzkawai', 50, 25]] },
    { id: 'aura', name: 'Caisse Aura', price: 100, color: '#9a6bff', cover: 'lucasco.jpg',
      drops: [['axbblesse', 0.2, null], ['axbserieux', 0.5, 2500], ['tdammasque', 0.9, 1800], ['tony', 1.4, 1200], ['tonny', 3, 600], ['olmanaura', 10, 150], ['lucasco', 35, 25]] },
    { id: 'wanted', name: 'Caisse Wanted', price: 250, color: '#e5483b', cover: 'eltigre.jpg',
      drops: [['teddam', 0.2, null], ['lucascoselfie', 0.5, 2500], ['mathis', 0.9, 1800], ['tonyargent', 1.6, 1100], ['presidentmali', 5, 350], ['eltigre', 40, 25]] },
    { id: 'royale', name: 'Caisse Royale JPZ', price: 500, color: '#ffc145', cover: 'jpz.png',
      drops: [['jpzcap', 0.15, null], ['sauce', 0.4, 2400], ['jpz2', 0.8, 1700], ['jppz', 1.5, 1100], ['charis', 6, 300], ['jpz', 40, 25], ['forton', 300, 2]] }
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
  cards.html = (card, { cls = '', owned = true, count = 0, compact = false, shiny = false } = {}) => `<div class="tcard ${compact ? 'compact' : ''} ${owned ? '' : 'missing'} ${shiny ? 'shiny' : ''} ${cls}" data-r="${card.rarity.i}" style="--r:${card.rarity.c}" data-card="${card.id}">
      <div class="tcard__img"><img class="${card.flat ? 'flat' : ''}" src="${IMG}${card.img}" alt="" draggable="false"><div class="tcard__holo"></div></div>
      <div class="tcard__frame"></div>${shiny ? '<span class="tcard__ribbon">Brillante</span>' : ''}
      <span class="tcard__gem tl num">${String(card.no).padStart(2, '0')}</span>
      <span class="tcard__gem tr">${shiny ? '★' : card.rarity.label.charAt(0)}</span>
      ${count > 1 ? `<span class="tcard__gem br num">×${count}</span>` : ''}
      <div class="tcard__plate">
        <span class="tcard__rar">${card.rarity.label}</span>
        <span class="tcard__name">${owned ? card.name : '???'}</span>
        <span class="tcard__val">${ui.coin('coin--xs')}<b class="num">${fmt(shiny ? card.value * DP.inventory.SHINY_MULT : card.value)}</b></span>
      </div>
    </div>`;

  // le reflet holographique des cartes suit le pointeur
  document.addEventListener('pointermove', (e) => {
    const c = e.target.closest && e.target.closest('.tcard');
    if (!c) return;
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.classList.add('is-tracked');
    c.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    c.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    c.style.setProperty('--ang', (115 + (x - 0.5) * 70).toFixed(1) + 'deg');
  }, { passive: true });
  document.addEventListener('pointerout', (e) => {
    const c = e.target.closest && e.target.closest('.tcard');
    if (c && !c.contains(e.relatedTarget)) c.classList.remove('is-tracked');
  }, { passive: true });

  function drawItem(box) {
    let r = rng.float() * box.total;
    for (const d of box.drops) { r -= d[2]; if (r < 0) return d; }
    return box.drops[0];
  }
  // Dans la bande qui défile : la carte néon en version compacte
  const itemCard = (box, d, cls = '') => cards.html(cards.byId[`${box.id}:${d[0]}`], { compact: true, cls });

  /** Caisse dessinée : couvercle, bandes, rivets, serrure et emblème. */
  /* ---------- Caisse premium en SVG : coffre en carbone, armatures métal à la couleur de la caisse ---------- */
  const mixHex = (hex, to, k) => {
    const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
    const ch = (s) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * k));
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  };
  let crateSeq = 0;
  const HEX = (cx, cy, r) => [0, 1, 2, 3, 4, 5].map((i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`; }).join(' ');
  const crateHtml = (box, cls = '') => {
    const id = 'cr' + ++crateSeq, c = box.color;
    const hi = mixHex(c, '#ffffff', 0.55), mid = c, lo = mixHex(c, '#000000', 0.45), deep = mixHex(c, '#000000', 0.72);
    // dégradés métal (couleur de la caisse) et carbone
    const defs = `<defs>
        <linearGradient id="${id}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".35" stop-color="${mid}"/><stop offset=".7" stop-color="${lo}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
        <linearGradient id="${id}mh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${lo}"/><stop offset=".25" stop-color="${hi}"/><stop offset=".5" stop-color="${mid}"/><stop offset=".8" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></linearGradient>
        <linearGradient id="${id}k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#262a35"/><stop offset=".5" stop-color="#14161d"/><stop offset="1" stop-color="#08090d"/></linearGradient>
        <pattern id="${id}cf" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="transparent"/><rect width="3" height="3" fill="rgba(255,255,255,.035)"/><rect x="3" y="3" width="3" height="3" fill="rgba(255,255,255,.035)"/></pattern>
        <filter id="${id}g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter>
        <clipPath id="${id}h"><polygon points="${HEX(100, 116, 27)}"/></clipPath>
      </defs>`;
    // corps : coque carbone chanfreinée + cadre métal + armatures d'angle + bandes LED + fentes lumineuses
    const body = `
      <path d="M14 64 H186 L192 72 V150 L182 162 H18 L8 150 V78 Z" fill="url(#${id}k)"/>
      <path d="M14 64 H186 L192 72 V150 L182 162 H18 L8 150 V78 Z" fill="url(#${id}cf)"/>
      <path d="M14 64 H186 L192 72 V150 L182 162 H18 L8 150 V78 Z" fill="none" stroke="url(#${id}m)" stroke-width="3"/>
      <path d="M22 80 H178 V146 L170 154 H30 L22 146 Z" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="1"/>
      <g fill="url(#${id}m)" stroke="${deep}" stroke-width=".8">
        <path d="M8 120 V150 L18 162 H52 L46 154 H24 L16 146 V120 Z"/>
        <path d="M192 120 V150 L182 162 H148 L154 154 H176 L184 146 V120 Z"/>
        <path d="M8 78 L14 70 H44 L40 76 H18 L14 82 V100 H8 Z"/>
        <path d="M192 78 L186 70 H156 L160 76 H182 L186 82 V100 H192 Z"/>
      </g>
      <g fill="#d9dce4">${[[20, 156], [180, 156], [18, 77], [182, 77]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6"/>`).join('')}</g>
      <g class="crate__leds">
        <rect x="3" y="96" width="4" height="34" rx="2" fill="${c}" filter="url(#${id}g)"/><rect x="4" y="98" width="2" height="30" rx="1" fill="${hi}"/>
        <rect x="193" y="96" width="4" height="34" rx="2" fill="${c}" filter="url(#${id}g)"/><rect x="194" y="98" width="2" height="30" rx="1" fill="${hi}"/>
        <path d="M30 130 L62 120" stroke="${c}" stroke-width="3" filter="url(#${id}g)"/><path d="M30 130 L62 120" stroke="${hi}" stroke-width="1.2"/>
        <path d="M170 130 L138 120" stroke="${c}" stroke-width="3" filter="url(#${id}g)"/><path d="M170 130 L138 120" stroke="${hi}" stroke-width="1.2"/>
      </g>
      <path d="M26 100 L66 92 L70 140 L34 146 Z" fill="rgba(0,0,0,.25)" stroke="rgba(255,255,255,.05)"/>
      <path d="M174 100 L134 92 L130 140 L166 146 Z" fill="rgba(0,0,0,.25)" stroke="rgba(255,255,255,.05)"/>
      <polygon points="${HEX(100, 116, 36)}" fill="${c}" opacity=".45" filter="url(#${id}g)"/>
      <polygon points="${HEX(100, 116, 34)}" fill="url(#${id}m)" stroke="${deep}" stroke-width="1"/>
      <polygon points="${HEX(100, 116, 29)}" fill="#07080c"/>
      <image href="${IMG}${box.cover}" x="73" y="89" width="54" height="54" preserveAspectRatio="xMidYMin slice" clip-path="url(#${id}h)"/>
      <polygon points="${HEX(100, 116, 27)}" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="1"/>
      <g class="crate__latch">
        <path d="M84 60 H116 L118 66 V80 L108 88 H92 L82 80 V66 Z" fill="url(#${id}m)" stroke="${deep}" stroke-width="1"/>
        <path d="M90 66 H110 V78 L104 83 H96 L90 78 Z" fill="${deep}"/>
        <path d="M93 78 L92 69 L96 73 L100 67 L104 73 L108 69 L107 78 Z" fill="${hi}"/>
      </g>`;
    // couvercle : dessus biseauté rainuré + face avant carbone + coiffes d'angle métal
    const lid = `<svg class="crate__lidsvg" viewBox="0 0 200 66" aria-hidden="true">${defs.replace(/id="(cr\d+)/g, 'id="$1L').replace(/url\(#(cr\d+)/g, 'url(#$1L')}
        <path d="M22 6 H178 L194 30 H6 Z" fill="url(#${id}Lmh)"/>
        <path d="M22 6 H178 L194 30 H6 Z" fill="url(#${id}Lm)" opacity=".55"/>
        <g stroke="${deep}" stroke-opacity=".55" stroke-width="1.4"><path d="M40 13 H160"/><path d="M34 19 H166"/><path d="M28 25 H172"/></g>
        <path d="M6 30 H194 V60 L188 66 H12 L6 60 Z" fill="url(#${id}Lk)"/>
        <path d="M6 30 H194 V60 L188 66 H12 L6 60 Z" fill="url(#${id}Lcf)"/>
        <path d="M6 30 H194 V60 L188 66 H12 L6 60 Z" fill="none" stroke="url(#${id}Lm)" stroke-width="2.5"/>
        <g fill="url(#${id}Lm)" stroke="${deep}" stroke-width=".8">
          <path d="M6 30 H40 L36 38 H14 V60 L6 60 Z"/><path d="M194 30 H160 L164 38 H186 V60 L194 60 Z"/>
        </g>
        <path d="M60 46 H140" stroke="${c}" stroke-width="3" filter="url(#${id}Lg)"/><path d="M60 46 H140" stroke="${hi}" stroke-width="1"/>
      </svg>`;
    return `<div class="crate ${cls}" style="--c:${c};--d:${(CASES.indexOf(box) * 0.7).toFixed(1)}s">
      <div class="crate__glow"></div>
      <div class="crate__floor"></div>
      <svg class="crate__svg" viewBox="0 0 200 166" aria-hidden="true">${defs}${body}</svg>
      <div class="crate__lid">${lid}</div>
      <div class="crate__shine"></div>
      <div class="crate__shadow"></div>
    </div>`;
  };

  /** Bande d'objets qui défile et s'arrête sur `win`. */
  function spinStrip(row, box, win, dur, onTick) {
    const N = 56, WIN_AT = 48;
    const vert = row.classList.contains('vert'); // colonnes (plusieurs caisses) : défilement vertical
    const seq = Array.from({ length: N }, (_, i) => (i === WIN_AT ? win : drawItem(box)));
    row.innerHTML = `<div class="strip__track">${seq.map((d) => itemCard(box, d)).join('')}</div><i class="strip__marker"></i>`;
    const track = row.firstElementChild;
    const first = track.children[0];
    const cs = getComputedStyle(track);
    const size = vert ? first.offsetHeight : first.offsetWidth;
    const step = size + parseFloat((vert ? cs.rowGap : cs.columnGap) || 8);
    const center = (vert ? row.clientHeight : row.clientWidth) / 2;
    const target = WIN_AT * step + size / 2 - center + (rng.float() - 0.5) * size * 0.3;
    return new Promise((resolve) => {
      const t0 = performance.now();
      let lastIdx = -1;
      const frame = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const x = target * (1 - Math.pow(1 - k, 4));
        track.style.transform = vert ? `translateY(${-x}px)` : `translateX(${-x}px)`;
        const idx = Math.floor((x + center) / step);
        if (idx !== lastIdx) { lastIdx = idx; onTick && onTick(k); }
        if (k < 1) requestAnimationFrame(frame);
        else { track.children[WIN_AT].classList.add('won'); row.classList.add('done'); resolve(track.children[WIN_AT]); }
      };
      requestAnimationFrame(frame);
    });
  }

  // Exposé pour la vitrine du lobby
  DP.cases = { list: CASES, crateHtml, rarity };

  /* Migration (v2) : chaque objet n'existe plus que dans une caisse. Les cartes des anciens comptes
   * sont rattachées à la même photo, quelle que soit la caisse d'origine. Rien n'est perdu. */
  (() => {
    const { store } = DP;
    if (store.get('dp_cards_v') === '2') return;
    const byKey = {};
    Object.values(cards.byId).forEach((c) => (byKey[c.key] = c.id));
    const remap = (id) => (cards.byId[id] ? id : byKey[String(id).split(':')[1]] || null);
    const moveBag = (bag = {}) => {
      const out = {};
      Object.entries(bag).forEach(([id, n]) => { const nid = remap(id); if (nid) out[nid] = (out[nid] || 0) + n; });
      return out;
    };
    const FREE = { sauce: 'aura', tdam: 'aura' };
    DP.auth.users().forEach((u) => {
      const name = u.prenom;
      const inv = store.json('dp_inv_' + name, null);
      if (inv) { inv.cards = moveBag(inv.cards); inv.shiny = moveBag(inv.shiny); store.setJson('dp_inv_' + name, inv); }
      const pr = store.json('dp_profile_' + name, null);
      if (pr) {
        if (pr.avatar && pr.avatar.type === 'card') pr.avatar.id = remap(pr.avatar.id);
        if (pr.banner && pr.banner.type === 'card') pr.banner.id = remap(pr.banner.id);
        pr.showcase = (pr.showcase || []).map((k) => { const [id, sh] = k.split('|'); const nid = remap(id); return nid ? nid + '|' + sh : null; }).filter(Boolean);
        store.setJson('dp_profile_' + name, pr);
      }
      const pg = store.json('dp_prog_' + name, null);
      if (pg && pg.free) {
        Object.keys(FREE).forEach((old) => { if (pg.free[old]) { pg.free[FREE[old]] = (pg.free[FREE[old]] || 0) + pg.free[old]; delete pg.free[old]; } });
        store.setJson('dp_prog_' + name, pg);
      }
    });
    store.set('dp_cards_v', '2');
  })();

  DP.games.register({
    id: 'cases',
    name: 'DaveCases',
    icon: 'gift',
    tagline: 'Six caisses à ouvrir, en Battle contre la bande ou en duel contre tes amis',
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
      // duels entre amis (en ligne) : adversaire = la bande ou un ami ; duelCtx = duel en cours de rediffusion
      let vs = 'bots', friendId = null, duelCtx = null;
      const canDuel = () => !!(DP.engine && DP.engine.on && DP.social && DP.social.available());
      const friendList = () => (DP.social ? DP.social.friends().filter((f) => f.status === 'accepted') : []);
      try { const t = sessionStorage.getItem('dp_duel_target'); if (t) { sessionStorage.removeItem('dp_duel_target'); mode = 'battle'; vs = 'friend'; friendId = t; } } catch { /* ignore */ }
      if (opts.duel) mode = 'battle';

      ui.segmented(panel, { label: 'Mode', value: mode, options: [{ value: 'open', label: 'Ouvrir' }, { value: 'battle', label: 'Battle' }], onChange: (v) => { mode = v; paint(); } });
      const countWrap = ui.el('<div></div>'), battleWrap = ui.el('<div class="stack-sm"></div>');
      panel.append(countWrap, battleWrap);
      const countSeg = ui.segmented(countWrap, { label: 'Nombre de caisses', value: count, options: [1, 2, 3, 4].map((n) => ({ value: n, label: '×' + n })), onChange: (v) => { count = v; paint(); } });
      const vsSeg = ui.segmented(battleWrap, { label: 'Contre', value: vs, options: [{ value: 'bots', label: 'La bande' }, { value: 'friend', label: 'Un ami' }], onChange: (v) => { vs = v; paint(); } });
      const friendWrap = ui.el(`<div class="field"><div class="field__head"><label>Ami à défier</label></div><select class="js-friend"></select><p class="field__note js-fnote"></p></div>`);
      battleWrap.appendChild(friendWrap);
      const friendSel = friendWrap.querySelector('select');
      friendSel.addEventListener('change', () => { friendId = friendSel.value; paint(); });
      const paintFriends = () => {
        const list = friendList();
        if (!friendId && list[0]) friendId = list[0].other;
        friendSel.innerHTML = list.map((f) => `<option value="${f.other}" ${f.other === friendId ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
        friendSel.hidden = !list.length;
        friendWrap.querySelector('.js-fnote').innerHTML = list.length ? 'Ta mise est bloquée jusqu’à sa réponse (24 h max). Le gagnant remporte toutes les cartes.' : 'Ajoute des amis dans la page <a href="#/amis">Amis</a> pour les défier.';
      };
      const offFriends = DP.on('friends', () => { paintFriends(); paint(); });
      const oppSeg = ui.segmented(battleWrap, { label: 'Adversaires', value: opps, options: [1, 2, 3].map((n) => ({ value: n, label: String(n) })), onChange: (v) => { opps = v; paint(); } });
      const roundSeg = ui.segmented(battleWrap, { label: 'Manches', value: rounds, options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) })), onChange: (v) => { rounds = v; paint(); } });
      const costOut = ui.readout(panel, 'Coût', '');
      const goBtn = ui.button(panel, '');
      const lastOut = ui.readout(panel, 'Dernier gain', '—');
      stage.classList.add('cases-stage');

      const cost = () => (box ? box.price * (mode === 'open' ? count : rounds) : 0);
      // caisses offertes (niveaux, missions) : utilisées si on en a assez pour le nombre choisi
      const freeN = () => (box && mode === 'open' && DP.progress ? DP.progress.freeCases.get(box.id) : 0);
      const isFree = () => freeN() >= count;

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
        if (duelCtx) {
          const n = i === 0 ? DP.auth.current() : duelCtx.name;
          return `<div class="ptag${i === 0 ? ' me' : ''}">${DP.profile.avatarHtml(n)}<b>${i === 0 ? 'Toi' : esc(n)}</b><span class="ptag__total num">${fmt(total)}</span></div>`;
        }
        const me = i === 0;
        const bot = BOTS[(i - 1 + BOTS.length) % BOTS.length];
        return `<div class="ptag${me ? ' me' : ''}">${me ? `<span class="avatar">${esc(DP.auth.current().charAt(0).toUpperCase())}</span><b>Toi</b>` : `<img src="${IMG}${ITEMS[bot].img}" alt=""><b>${ITEMS[bot].name}</b>`}<span class="ptag__total num">${fmt(total)}</span></div>`;
      }
      /** Une bande horizontale par caisse (titrée quand il y en a plusieurs), ou par joueur en battle. */
      const stripsHtml = (n, fill) => {
        const cols = false;
        const el = stage.querySelector('.cases__strips');
        el.classList.toggle('is-cols', cols);
        el.style.setProperty('--n', n);
        return Array.from({ length: n }, (_, i) => cols
          ? `<div class="strip-col"><span class="strip-col__label">Caisse ${i + 1}</span><div class="strip vert">${fill ? fill() : ''}</div></div>`
          : `<div class="strip-row${mode === 'open' && n > 1 ? ' is-multi' : ''}">${mode === 'battle' ? playerTag(i) : n > 1 ? `<span class="strip-tag"><small>Caisse</small><b class="num">${i + 1}</b></span>` : ''}<div class="strip">${fill ? fill() : ''}</div></div>`).join('');
      };
      let shown = ''; // résultat affiché (gardé jusqu'au prochain changement de réglage)
      const sig = () => `${mode}|${count}|${opps}|${rounds}|${box && box.id}`;
      function idleStrips() {
        const el = stage.querySelector('.cases__strips');
        if (!el || !box) return;
        if (shown === sig()) return;
        shown = '';
        stage.querySelector('.js-result')?.remove();
        const n = mode === 'open' ? count : opps + 1;
        el.innerHTML = stripsHtml(n, () => `<div class="strip__track">${Array.from({ length: 12 }, () => itemCard(box, drawItem(box))).join('')}</div><i class="strip__marker"></i>`);
        el.querySelectorAll('.strip__track').forEach((t) => (t.style.transform = t.parentElement.classList.contains('vert') ? `translateY(${-rng.int(0, 160)}px)` : `translateX(${-rng.int(0, 200)}px)`));
      }
      /** Résumé sous les bandes (remplace l'ancien cadre de butin) : les cartes sont déjà dans l'inventaire. */
      function showSummary(cardList, extra = '') {
        stage.querySelector('.js-result')?.remove();
        const total = round2(cardList.reduce((a, c) => a + c.value, 0));
        const best = cardList.slice().sort((a, b) => b.value - a.value)[0];
        const el = ui.el(`<div class="cases__result js-result">
          <div><b class="num">${cardList.length} carte${cardList.length > 1 ? 's' : ''}</b> ajoutée${cardList.length > 1 ? 's' : ''} à ton inventaire · valeur <b class="num">${fmt(total)}</b>${best ? ` · meilleure : <b style="color:${best.rarity.c}">${esc(best.name)}</b>` : ''}${extra}</div>
          <a class="btn btn--ghost btn--sm" href="#/inventaire">${ui.icon('layers-2', 'i--sm')}Voir l'inventaire</a>
        </div>`);
        stage.querySelector('.cases__strips').after(el);
        shown = sig();
      }
      function paint() {
        countWrap.hidden = mode !== 'open';
        battleWrap.hidden = mode !== 'battle';
        const duelMode = mode === 'battle' && vs === 'friend' && canDuel();
        vsSeg.el ? (vsSeg.el.hidden = !canDuel()) : null;
        friendWrap.hidden = !duelMode;
        oppSeg.el ? (oppSeg.el.hidden = duelMode) : null;
        if (duelMode) paintFriends();
        [countSeg, oppSeg, roundSeg].forEach((s) => s.disable(busy));
        costOut.set(isFree() ? '<span class="pos">Offerte</span>' : `${ui.coin('coin--xs')} ${fmt(cost())}`);
        goBtn.innerHTML = mode === 'open' ? (isFree() ? `${ui.icon('gift', 'i--sm')}Ouvrir gratuitement · ${freeN()} offerte${freeN() > 1 ? 's' : ''}` : `Ouvrir ${count > 1 ? count + ' caisses' : 'la caisse'}`) : 'Lancer la battle';
        goBtn.disabled = busy || !box || (duelMode && !friendId);
        if (duelMode && !duelCtx) {
          const f = friendList().find((x) => x.other === friendId);
          goBtn.innerHTML = f ? `${ui.icon('swords', 'i--sm')}Défier ${esc(f.name)}` : 'Choisis un ami';
        }
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
        if (rr.lvl >= 10 && !quiet) DP.emit('bigwin', { game: 'cases', x: rr.lvl >= 14 ? 100 : 20 }); // carte légendaire ou mythique
        if (rr.lvl >= 10) { ui.shake(stage, rr.lvl >= 14 ? 2 : 1); ui.coinRain(stage, rr.lvl >= 14 ? 60 : 25); sound.play('jackpot'); }
      }
      const tick = (k) => sound.play('tick', { p: 1 - k });

      const online = () => DP.engine && DP.engine.on;
      async function openCases() {
        if (busy) return;
        const free = isFree();
        let c = free ? 0 : cost();
        let srv = null;
        if (online()) {
          // en ligne : le serveur tire les cartes (et utilise tes caisses offertes s'il y en a assez)
          busy = true; paint();
          srv = await DP.engine.call('cases_open', { p_case: box.id, p_count: count }, { defer: true });
          if (!srv || !alive) { busy = false; paint(); return; }
          c = +srv.cost;
          DP.engine.debitView(c);
        } else if (free) DP.progress.freeCases.use(box.id, count);
        else if (!wallet.place(c)) return;
        busy = true; paint();
        stage.querySelector('.js-back').disabled = true;
        const wins = srv ? srv.draws : Array.from({ length: count }, () => drawItem(box));
        const payout = round2(wins.reduce((a, d) => a + box.price * d[1], 0));
        const won = wins.map((d) => cardOf(box, d));
        pending = srv ? null : { cost: c, payout, cards: won.map((x) => x.id) };
        await crackCrate();
        if (!alive) return;
        const stripsEl = stage.querySelector('.cases__strips');
        stage.querySelector('.js-result')?.remove();
        stripsEl.innerHTML = stripsHtml(wins.length);
        stripsEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        sound.play('whoosh');
        const rows = [...stripsEl.querySelectorAll('.strip')];
        const cards = await Promise.all(wins.map((d, i) => spinStrip(rows[i], box, d, 4600 + i * 450, i === 0 ? tick : null)));
        if (!alive) return;
        pending = null;
        const order = wins.map((d, i) => i).sort((a, b) => wins[a][1] - wins[b][1]);
        for (const i of order) { reveal(cards[i], wins[i]); await sleep(260); if (!alive) return; }
        if (srv) DP.engine.reveal(srv.acct);
        inventory.add(won.map((x) => x.id));
        settle('cases', c, payout, { silent: true, credit: false });
        lastOut.set(`<span class="${payout >= c ? 'pos' : ''}">${fmt(payout)} en cartes</span>`);
        if (payout < c) sound.play('lose');
        stage.querySelector('.js-crate')?.classList.remove('open');
        showSummary(won);
        unlock();
        paint();
      }

      async function battle(preset) {
        if (busy) return;
        const c = preset ? preset.cost : cost();
        let srv = null;
        if (preset) { srv = preset; busy = true; paint(); }
        else if (online()) {
          // en ligne : le serveur tire toutes les manches
          busy = true; paint();
          srv = await DP.engine.call('cases_battle', { p_case: box.id, p_opps: opps, p_rounds: rounds }, { defer: true });
          if (!srv || !alive) { busy = false; paint(); return; }
          DP.engine.debitView(c);
        } else if (!wallet.place(c)) return;
        busy = true; paint();
        stage.querySelector('.js-back').disabled = true;
        const players = opps + 1;
        const draws = srv ? srv.draws : Array.from({ length: rounds }, () => Array.from({ length: players }, () => drawItem(box)));
        const totals = Array(players).fill(0);
        draws.forEach((r) => r.forEach((d, p) => (totals[p] = round2(totals[p] + box.price * d[1]))));
        const pot = round2(totals.reduce((a, b) => a + b, 0));
        const best = Math.max(...totals);
        const winners = totals.map((t, i) => (t === best ? i : -1)).filter((i) => i >= 0);
        const myPay = winners.includes(0) ? round2(pot / winners.length) : 0;
        const soloWin = winners.length === 1 && winners[0] === 0;
        const potCards = draws.flat().map((d) => cardOf(box, d));
        // victoire seule : toutes les cartes ; égalité : la part du pot en DaveCoins
        pending = srv ? null : soloWin ? { cost: c, payout: myPay, cards: potCards.map((x) => x.id) } : { cost: c, payout: myPay, coins: true };
        await crackCrate();
        if (!alive) return;

        const running = Array(players).fill(0);
        const stripsEl = stage.querySelector('.cases__strips');
        stripsEl.classList.remove('is-cols');
        stage.querySelector('.js-result')?.remove();
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
        if (srv && srv.acct) DP.engine.reveal(srv.acct);
        if (preset) DP.engine.refresh();
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
          ui.result(stage, { win: false, label: `${duelCtx ? esc(duelCtx.name) : ITEMS[BOTS[(w - 1 + BOTS.length) % BOTS.length]].name} gagne` });
        }
        sub.innerHTML = `Pot total <b class="num">${fmt(pot)}</b>`;
        stage.querySelector('.js-crate')?.classList.remove('open');
        if (soloWin) showSummary(potCards, ' · tu remportes toutes les cartes de la battle');
        else shown = sig();
        unlock();
        paint();
      }

      async function challenge() {
        const f = friendList().find((x) => x.other === friendId);
        if (!f || busy) return;
        busy = true; paint();
        const r = await DP.engine.call('duel_create', { p_friend: f.other, p_case: box.id, p_rounds: rounds });
        busy = false; paint();
        if (!r) return;
        sound.play('chip');
        location.hash = '#/duel/' + r.id; // lobby : le duel se lance en direct quand l'ami accepte
      }
      goBtn.addEventListener('click', () => {
        if (busy || !box) return;
        if (mode === 'battle' && vs === 'friend' && canDuel()) return challenge();
        (mode === 'open' ? openCases : battle)();
      });
      const onResize = () => { if (!busy) idleStrips(); };
      window.addEventListener('resize', onResize);
      const start = CASES.find((c) => c.id === opts.caseId);
      if (start) showCase(start); else showList();
      paint();
      if (opts.duel && start) {
        const d = opts.duel, mine = d.challenger === (DP.cloud && DP.cloud.uid());
        duelCtx = { name: opts.otherName || 'Ton ami' };
        opps = 1; rounds = d.rounds;
        paint();
        const sub = stage.querySelector('.js-sub');
        setTimeout(() => {
          if (!alive) return;
          if (sub) sub.innerHTML = `${opts.live ? '<b class="pos">En direct</b> · ' : ''}Duel contre <b>${esc(duelCtx.name)}</b> · ${d.rounds} manche${d.rounds > 1 ? 's' : ''}`;
          DP.emit('bigwin', { game: 'duel', x: 10 }); // phonk pour le duel
          battle({ draws: mine ? d.draws : d.draws.map((r) => [r[1], r[0]]), cost: +d.cost, acct: null });
        }, 700);
      }

      return () => {
        alive = false;
        offFriends();
        window.removeEventListener('resize', onResize);
        if (pending) {
          if (pending.cards) { inventory.add(pending.cards); settle('cases', pending.cost, pending.payout, { silent: true, credit: false }); }
          else settle('cases', pending.cost, pending.payout, { silent: true });
        }
      };
    }
  });
})();
