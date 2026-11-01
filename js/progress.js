/* Progression : niveaux et rangs (XP gagnée en misant), missions quotidiennes, succès,
 * caisses offertes. Tout est stocké par compte dans dp_prog_<pseudo>.
 */
(() => {
  const { auth, wallet, stats, store, ui, sound, games, cards, inventory, promo, fmt, esc, round2, dayKey, on, emit } = DP;
  const I = ui.icon;

  /* ---------- Rangs et niveaux ---------- */
  const MAX_LEVEL = 100;
  const RANKS = [
    { name: 'Bronze', from: 1, c: '#d0864b', c2: '#6e3a17' },
    { name: 'Argent', from: 10, c: '#d6dce8', c2: '#5b6378' },
    { name: 'Or', from: 20, c: '#ffc145', c2: '#8a5a17' },
    { name: 'Platine', from: 35, c: '#7fe8dc', c2: '#1f6b66' },
    { name: 'Diamant', from: 50, c: '#7cc0ff', c2: '#1d4f9a' },
    { name: 'Maître', from: 70, c: '#d68bff', c2: '#5b1f86' },
    { name: 'JPZ', from: 90, c: '#ff6b2c', c2: '#7a1f00' }
  ];
  const rankOf = (level) => [...RANKS].reverse().find((r) => level >= r.from);
  // XP pour passer du niveau L au niveau L+1 (1 XP par DaveCoin misé) : courbe raide, les hauts rangs se méritent
  const need = (L) => Math.round(300 * Math.pow(L, 1.6)) + 200;
  function levelInfo(xp) {
    let L = 1, left = xp;
    while (L < MAX_LEVEL && left >= need(L)) { left -= need(L); L++; }
    const n = L < MAX_LEVEL ? need(L) : 1;
    return { level: L, into: L < MAX_LEVEL ? left : n, need: n, pct: L < MAX_LEVEL ? left / n : 1, rank: rankOf(L) };
  }
  // Récompenses de niveau (même règle que le serveur) : une caisse à chaque niveau, plus une caisse du palier
  // au-dessus tous les 5 niveaux. Plus de DaveCoins : ils reviennent par le rakeback.
  const CASE_TIERS = ['bande', 'gamers', 'kawai', 'horsserie', 'aura', 'wanted', 'royale'];
  const caseForLevel = (L) => (L >= 70 ? 'royale' : L >= 50 ? 'wanted' : L >= 40 ? 'aura' : L >= 30 ? 'horsserie' : L >= 20 ? 'kawai' : L >= 10 ? 'gamers' : 'bande');
  const caseUp = (c) => CASE_TIERS[Math.min(CASE_TIERS.length - 1, CASE_TIERS.indexOf(c) + 1)];
  const levelReward = (L) => ({ coins: 0, cases: L % 5 === 0 ? [caseForLevel(L), caseUp(caseForLevel(L))] : [caseForLevel(L)] });
  // Rakeback : part de l'avantage du casino rendue sur chaque mise, selon le rang
  const RB_PCT = { Bronze: 0.10, Argent: 0.15, Or: 0.20, Platine: 0.25, Diamant: 0.30, 'Maître': 0.35, JPZ: 0.40 };
  const rbPct = (level) => RB_PCT[rankOf(level).name] || 0.1;
  // avantage du casino d'un jeu, d'après son taux de redistribution affiché (ex. « 99 % » → 1 %)
  const edgeOf = (id) => { const g = games.find(id); const rtp = g ? parseFloat(String(g.rtp).replace(',', '.')) : 99; return Math.max(0, Math.min(0.2, 1 - (rtp || 99) / 100)); };
  const caseName = (id) => ((DP.cases && DP.cases.list.find((c) => c.id === id)) || { name: 'Caisse' }).name;

  /** Badge hexagonal du rang, avec le niveau au centre. */
  function badge(level, size = 40) {
    const r = rankOf(level), id = 'bg' + Math.random().toString(36).slice(2, 8);
    const crown = r.name === 'JPZ' ? '<path d="M34 14 L40 22 L50 12 L60 22 L66 14 L64 28 H36 Z" fill="#ffe2a8" stroke="#7a4b00" stroke-width="1.5"/>' : '';
    return `<svg class="rank-badge" width="${size}" height="${size}" viewBox="0 0 100 100" aria-label="Niveau ${level}, rang ${r.name}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${r.c}"/><stop offset=".55" stop-color="${r.c2}"/><stop offset="1" stop-color="${r.c}"/></linearGradient></defs>
      <path d="M50 3 L91 26 V74 L50 97 L9 74 V26 Z" fill="url(#${id})"/>
      <path d="M50 12 L83 31 V69 L50 88 L17 69 V31 Z" fill="#0a0c12" stroke="${r.c}" stroke-width="2"/>
      <path d="M50 12 L83 31 L50 50 L17 31 Z" fill="rgba(255,255,255,.06)"/>
      ${crown}
      <text x="50" y="${crown ? 62 : 57}" text-anchor="middle" dominant-baseline="middle" font-family="Chakra Petch, sans-serif" font-weight="700" font-size="${level >= 100 ? 26 : 32}" fill="${r.c}">${level}</text>
    </svg>`;
  }

  /* ---------- État du joueur ---------- */
  const key = () => 'dp_prog_' + auth.current();
  const blank = () => ({ xp: 0, level: 1, top: 1, c: { missions: 0, fullDays: 0, sold: 0, shinies: 0, jackpots: 0, dailies: 0 }, ach: {}, free: {}, m: null });
  function load() {
    const raw = store.json(key(), {});
    const p = Object.assign(blank(), raw);
    p.c = Object.assign(blank().c, p.c);
    // plus haut niveau déjà récompensé (les anciens comptes gardent leurs récompenses, sans les toucher deux fois)
    if (raw.top == null) p.top = Math.max(1, raw.level || 1);
    return p;
  }
  const save = (p) => { store.setJson(key(), p); emit('progress', p); };

  /* ---------- Caisses offertes ---------- */
  const freeCases = {
    get(id) { return auth.current() ? load().free[id] || 0 : 0; },
    all() { return auth.current() ? load().free : {}; },
    add(id, n = 1) { const p = load(); p.free[id] = (p.free[id] || 0) + n; save(p); },
    use(id, n = 1) {
      if (DP.engine && DP.engine.on) return false;
      const p = load();
      if ((p.free[id] || 0) < n) return false;
      p.free[id] -= n;
      if (!p.free[id]) delete p.free[id];
      save(p);
      return true;
    }
  };

  /* ---------- Gains (DaveCoins, XP, niveaux) ---------- */
  let ready = false; // pas de célébration pendant le chargement
  function giveCoins(amount, kind) {
    if (!(amount > 0)) return;
    wallet.credit(amount);
    stats.income(kind, amount);
  }
  function addXp(p, n) {
    if (!(n > 0)) return;
    const before = levelInfo(p.xp).level;
    p.xp = round2(p.xp + n);
    const after = levelInfo(p.xp).level;
    p.level = after;
    if (after <= before || after <= p.top) return;
    // plusieurs niveaux d'un coup : récompenses cumulées, une seule célébration
    const total = { coins: 0, cases: [] };
    let rankUp = false;
    for (let L = Math.max(before, p.top) + 1; L <= after; L++) {
      levelReward(L).cases.forEach((c) => { p.free[c] = (p.free[c] || 0) + 1; total.cases.push(c); });
      if (rankOf(L).from === L) rankUp = true;
    }
    p.top = after;
    queue(() => { giveCoins(total.coins, 'level'); celebrateLevel(after, total, rankUp); });
  }

  /* ---------- Missions quotidiennes ---------- */
  const seeded = (str) => {
    let h = 1779033703;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  };
  const TIERS = [
    { label: 'Facile', coins: 250, xp: 100 },
    { label: 'Moyenne', coins: 750, xp: 350 },
    { label: 'Difficile', coins: 2000, xp: 1000, freeCase: 'aura' }
  ];
  const RAR_NAMES = ['Commun', 'Peu commun', 'Rare', 'Épique', 'Légendaire', 'Mythique'];
  // chaque modèle : valeurs pour facile / moyenne / difficile
  const TEMPLATES = {
    play_any: { t: [10, 25, 50], text: (m) => `Joue ${m.target} parties` },
    play_game: { t: [5, 15, 30], game: true, text: (m) => `Joue ${m.target} parties sur ${gameName(m.game)}` },
    wager: { t: [500, 2500, 10000], text: (m) => `Mise ${fmt(m.target)} DaveCoins au total (seul le risque pris compte)` },
    mult: { m: [3, 10, 30], text: (m) => `Fais un gain ×${m.m} ou plus` },
    mult_game: { m: [2, 5, 15], game: true, text: (m) => `Fais un gain ×${m.m} sur ${gameName(m.game)}` },
    wins: { t: [5, 12, 25], text: (m) => `Gagne ${m.target} parties (gain d’au moins 10 % de la mise)` },
    big_win: { t: [200, 1000, 5000], text: (m) => `Gagne ${fmt(m.target)} DaveCoins nets en une partie` },
    cards: { t: [3, 8, 20], text: (m) => `Obtiens ${m.target} cartes dans les caisses` },
    rare_card: { r: [2, 3, 4], text: (m) => `Obtiens une carte ${RAR_NAMES[m.r]} ou mieux` },
    sell: { t: [3, 10, 25], text: (m) => `Vends ${m.target} cartes` },
    fuse: { t: [1, 1, 1], hardOnly: true, text: () => 'Fusionne 5 cartes identiques en carte brillante' }
  };
  const gameName = (id) => (games.find(id) || { name: id }).name;
  const missionGames = () => games.list.filter((g) => g.id !== 'cases' && g.id !== 'upgrade').map((g) => g.id);

  function makeMissions(day) {
    const rnd = seeded(auth.current() + '|' + day);
    const types = Object.keys(TEMPLATES);
    const used = new Set();
    return TIERS.map((tier, ti) => {
      let k;
      do { k = types[Math.floor(rnd() * types.length)]; } while (used.has(k) || (TEMPLATES[k].hardOnly && ti < 2));
      used.add(k);
      const T = TEMPLATES[k], m = { k, tier: ti, prog: 0, done: false, claimed: false };
      if (T.t) m.target = T.t[ti];
      if (T.m) { m.m = T.m[ti]; m.target = 1; }
      if (T.r) { m.r = T.r[ti]; m.target = 1; }
      if (T.game) { const gs = missionGames(); m.game = gs[Math.floor(rnd() * gs.length)]; }
      return m;
    });
  }
  function missionsOf(p) {
    const day = dayKey();
    if (!p.m || p.m.day !== day) p.m = { day, list: makeMissions(day) };
    return p.m.list;
  }
  const describe = (m) => TEMPLATES[m.k].text(m);
  function bump(p, fn) {
    missionsOf(p).forEach((m) => {
      if (m.done) return;
      const v = fn(m);
      if (v == null) return;
      m.prog = Math.min(m.target, v);
      if (m.prog >= m.target) {
        m.done = true;
        queue(() => missionToast(m));
      }
    });
  }
  function claim(i) {
    if (DP.engine && DP.engine.on) return null;
    const p = load(), m = missionsOf(p)[i];
    if (!m || !m.done || m.claimed) return null;
    m.claimed = true;
    p.c.missions++;
    const T = TIERS[m.tier];
    if (T.freeCase) p.free[T.freeCase] = (p.free[T.freeCase] || 0) + 1;
    const allDone = missionsOf(p).every((x) => x.claimed);
    if (allDone) p.c.fullDays++;
    addXp(p, T.xp);
    save(p);
    giveCoins(T.coins, 'mission');
    checkAch();
    flush();
    return { ...T, allDone };
  }
  const nextReset = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d - Date.now(); };

  /* ---------- Succès ---------- */
  const ACH_REWARD = [null, { coins: 150, xp: 100 }, { coins: 750, xp: 400 }, { coins: 3000, xp: 1500 }];
  const ACHS = [];
  const A = (id, cat, name, desc, icon, tier, get, goal) => ACHS.push({ id, cat, name, desc, icon, tier, get, goal });
  // parties et mises
  [[1, 'Premier pas', 1], [50, 'Habitué', 1], [250, 'Pilier du casino', 2], [1000, 'Insomniaque', 2], [5000, 'Légende du Palace', 3]]
    .forEach(([n, name, t]) => A('play' + n, 'Parties', name, `Joue ${fmt(n)} partie${n > 1 ? 's' : ''}`, 'dices', t, (x) => x.s.played, n));
  [[1000, 'Petit joueur', 1], [10000, 'Gros joueur', 2], [100000, 'Flambeur', 2], [1000000, 'Baleine', 3]]
    .forEach(([n, name, t]) => A('wag' + n, 'Parties', name, `Mise ${fmt(n)} DaveCoins au total`, 'coins', t, (x) => x.s.wagered, n));
  // gains
  [[500, 'Joli coup', 1], [5000, 'Coup de maître', 2], [50000, 'Hold-up', 3]]
    .forEach(([n, name, t]) => A('win' + n, 'Gains', name, `Gagne ${fmt(n)} DaveCoins nets en une partie`, 'trophy', t, (x) => x.s.biggestWin, n));
  [[10, 'Multiplicateur', 1], [100, 'Centuple', 2], [1000, 'Mille fois', 3]]
    .forEach(([n, name, t]) => A('mult' + n, 'Gains', name, `Fais un gain ×${fmt(n)}`, 'zap', t, (x) => x.s.biggestMult, n));
  A('jackpot', 'Gains', 'Jackpot !', 'Remporte le jackpot global', 'crown', 3, (x) => x.p.c.jackpots, 1);
  [[10000, 'À l’aise', 1], [100000, 'Riche', 2], [1000000, 'Millionnaire', 3]]
    .forEach(([n, name, t]) => A('bal' + n, 'Gains', name, `Atteins un solde de ${fmt(n)} DaveCoins`, 'wallet', t, (x) => x.bal, n));
  // un succès par jeu (ajoutés quand les jeux sont chargés)
  // collection
  [[1, 'Première carte', 1], [10, 'Collectionneur', 1], [25, 'Archiviste', 2]]
    .forEach(([n, name, t]) => A('uniq' + n, 'Collection', name, `Possède ${n} carte${n > 1 ? 's' : ''} différente${n > 1 ? 's' : ''}`, 'layers-2', t, (x) => x.inv.unique, n));
  A('uniqall', 'Collection', 'Collection complète', 'Possède toutes les cartes', 'library', 3, (x) => x.inv.unique, () => Object.keys(cards.byId).length);
  A('rar4', 'Collection', 'Légendaire', 'Obtiens une carte Légendaire', 'star', 2, (x) => (x.maxRar >= 4 ? 1 : 0), 1);
  A('rar5', 'Collection', 'Mythique', 'Obtiens une carte Mythique', 'gem', 3, (x) => (x.maxRar >= 5 ? 1 : 0), 1);
  A('shiny1', 'Collection', 'Ça brille', 'Fusionne ta première carte brillante', 'sparkles', 1, (x) => x.p.c.shinies, 1);
  A('shiny5', 'Collection', 'Tout ce qui brille', 'Fusionne 5 cartes brillantes', 'sparkles', 2, (x) => x.p.c.shinies, 5);
  A('sold25', 'Collection', 'Marchand', 'Vends 25 cartes', 'hand-coins', 1, (x) => x.p.c.sold, 25);
  // progression
  [[10, 1], [25, 2], [50, 2], [90, 3], [100, 3]]
    .forEach(([n, t]) => A('lvl' + n, 'Progression', n === 90 ? 'Rang JPZ' : `Niveau ${n}`, n === 90 ? 'Atteins le rang JPZ (niveau 90)' : `Atteins le niveau ${n}`, 'trending-up', t, (x) => x.level, n));
  [[1, 'Première mission', 1], [25, 'Agent du Palace', 2], [100, 'Mercenaire', 3]]
    .forEach(([n, name, t]) => A('mis' + n, 'Progression', name, `Termine ${n} mission${n > 1 ? 's' : ''}`, 'flag', t, (x) => x.p.c.missions, n));
  A('day1', 'Progression', 'Journée parfaite', 'Termine les 3 missions d’une journée', 'check', 1, (x) => x.p.c.fullDays, 1);
  A('day7', 'Progression', 'Semaine parfaite', 'Termine les 3 missions 7 jours', 'check', 2, (x) => x.p.c.fullDays, 7);
  A('daily1', 'Progression', 'Tourne la roue', 'Utilise la roue quotidienne', 'gift', 1, (x) => x.p.c.dailies, 1);
  A('daily10', 'Progression', 'Fidèle', 'Utilise 10 fois la roue quotidienne', 'gift', 2, (x) => x.p.c.dailies, 10);
  A('codes', 'Progression', 'Chasseur de codes', 'Active tous les codes promo', 'ticket', 1, (x) => x.codes, () => Object.keys(DP.PROMO_CODES).length);
  let achReady = false;
  function ensureGameAchs() {
    if (achReady) return;
    achReady = true;
    games.list.forEach((g) => {
      const n = g.id === 'cases' ? 25 : 50;
      A('game_' + g.id, 'Jeux', g.id === 'cases' ? 'Ouvreur de caisses' : `Fan de ${g.name}`, g.id === 'cases' ? `Ouvre des caisses ${n} fois` : `Joue ${n} parties sur ${g.name}`, g.icon, 1, (x) => (x.s.games[g.id] || {}).n || x.s.perGame[g.id] || 0, n);
    });
    cards.sets.forEach((st) => A('set_' + st.id, 'Collection', `Album ${st.name.replace(/^Caisse /, '')}`, `Complète l’album ${st.name}`, 'book-open', 2, () => (inventory.setProgress(st).complete ? 1 : 0), 1));
  }
  const goalOf = (a) => (typeof a.goal === 'function' ? a.goal() : a.goal);
  function ctxOf(p) {
    const s = stats.get();
    return {
      s, p, bal: wallet.get(), level: levelInfo(p.xp).level, inv: inventory.totals(), codes: promo.used().length,
      maxRar: inventory.entries().reduce((m, x) => Math.max(m, x.card.rarity.i), -1)
    };
  }
  function checkAch() {
    if (!auth.current()) return;
    ensureGameAchs();
    const p = load(), x = ctxOf(p);
    const fresh = ACHS.filter((a) => !p.ach[a.id] && a.get(x) >= goalOf(a));
    if (!fresh.length) return;
    fresh.forEach((a) => { p.ach[a.id] = Date.now(); addXp(p, ACH_REWARD[a.tier].xp); });
    save(p);
    fresh.forEach((a) => giveCoins(ACH_REWARD[a.tier].coins, 'achievement'));
    if (fresh.length > 3) {
      const coins = fresh.reduce((t, a) => t + ACH_REWARD[a.tier].coins, 0), xp = fresh.reduce((t, a) => t + ACH_REWARD[a.tier].xp, 0);
      queue(() => achPopup({ icon: 'trophy', tier: 3, name: `${fresh.length} succès débloqués`, coins, xp }));
    } else fresh.forEach((a) => queue(() => achPopup(a)));
    flush();
  }

  /* ---------- Écoute des événements du casino ---------- */
  function handle(fn) {
    return (data) => {
      // en ligne, la progression est calculée par le serveur
      if (!auth.current() || (DP.engine && DP.engine.on)) return;
      const p = load();
      fn(p, data);
      save(p);
      checkAch();
      flush();
    };
  }
  /** Rakeback du joueur : à réclamer, déjà touché, taux du rang. */
  function rakeback(p = load()) {
    const level = levelInfo(p.xp || 0).level;
    return { pending: Math.floor((p.rb || 0) * 100) / 100, total: p.rbTotal || 0, pct: rbPct(level), rank: rankOf(level).name };
  }
  /** Hors ligne : verse le rakeback accumulé (en ligne, c'est rakeback_claim sur le serveur). */
  function claimRakeback() {
    const p = load(), amt = Math.floor((p.rb || 0) * 100) / 100;
    if (amt < 0.01) return 0;
    p.rb = Math.round(((p.rb || 0) - amt) * 10000) / 10000;
    p.rbTotal = round2((p.rbTotal || 0) + amt);
    save(p);
    giveCoins(amt, 'rakeback');
    emit('progress', p);
    return amt;
  }
  on('played', handle((p, h) => {
    if (!h) return;
    // rakeback : part de l'avantage du casino sur cette mise (calculé avant l'XP, au niveau actuel)
    if (h.bet > 0) p.rb = Math.round(((p.rb || 0) + h.bet * edgeOf(h.game) * rbPct(levelInfo(p.xp).level)) * 10000) / 10000;
    // XP = risque réellement pris (même règle que le serveur) : un pari presque sans risque rapporte peu d'XP
    const risk = round2(Math.min(h.bet, Math.abs(h.payout - h.bet) + h.bet * 0.1));
    addXp(p, risk);
    const net = h.payout - h.bet;
    bump(p, (m) => {
      switch (m.k) {
        case 'play_any': return m.prog + 1;
        case 'play_game': return h.game === m.game ? m.prog + 1 : null;
        case 'wager': return m.prog + risk;
        case 'mult': return h.mult >= m.m ? 1 : null;
        case 'mult_game': return h.game === m.game && h.mult >= m.m ? 1 : null;
        case 'wins': return net > 0 && net >= h.bet * 0.1 ? m.prog + 1 : null;
        case 'big_win': return net > 0 ? Math.max(m.prog, net) : null;
        default: return null;
      }
    });
  }));
  on('cards', handle((p, ids) => {
    const best = ids.reduce((a, id) => Math.max(a, cards.byId[id] ? cards.byId[id].rarity.i : -1), -1);
    bump(p, (m) => (m.k === 'cards' ? m.prog + ids.length : m.k === 'rare_card' && best >= m.r ? 1 : null));
  }));
  on('sold', handle((p, d) => { p.c.sold += d.n; bump(p, (m) => (m.k === 'sell' ? m.prog + d.n : null)); }));
  on('fused', handle((p) => { p.c.shinies++; bump(p, (m) => (m.k === 'fuse' ? 1 : null)); }));
  on('income', handle((p, d) => { if (d.kind === 'daily') p.c.dailies++; }));
  on('jackpotwin', handle((p, d) => { if (d.name === auth.current()) p.c.jackpots++; }));
  on('album', handle(() => {}));
  on('auth', () => { if (auth.current()) setTimeout(() => { if (!(DP.engine && DP.engine.on)) checkAch(); }, 1500); });

  /* ---------- Célébrations (file d'attente, affichées l'une après l'autre) ---------- */
  const pending = [];
  function queue(fn) { pending.push(fn); }
  function flush() { if (!ready) { pending.length = 0; return; } while (pending.length) pending.shift()(); }
  let bannerChain = Promise.resolve();
  const later = (ms) => new Promise((r) => setTimeout(r, ms));

  // « 2 × Caisse de la Bande · Caisse Gamers offertes »
  const casesText = (list) => {
    const n = {}; list.forEach((c) => (n[c] = (n[c] || 0) + 1));
    const parts = Object.entries(n).map(([c, k]) => (k > 1 ? k + ' × ' : '') + esc(caseName(c)));
    return parts.length ? parts.join(' · ') + (list.length > 1 ? ' offertes' : ' offerte') : '';
  };
  // une célébration en attente absorbe les niveaux suivants (parties enchaînées)
  let lvlPending = null;
  function celebrateLevel(L0, rw0, rankUp0) {
    if (lvlPending) { lvlPending.L = L0; lvlPending.rw.coins += rw0.coins; lvlPending.rw.cases.push(...rw0.cases); lvlPending.rankUp = lvlPending.rankUp || rankUp0; return; }
    lvlPending = { L: L0, rw: { coins: rw0.coins, cases: [...rw0.cases] }, rankUp: rankUp0 };
    bannerChain = bannerChain.then(async () => {
      const { L, rw, rankUp } = lvlPending;
      lvlPending = null;
      const r = rankOf(L);
      const el = ui.el(`<div class="lvlup ${rankUp ? 'lvlup--rank' : ''}" style="--rc:${r.c}" role="status">
        <div class="lvlup__badge">${badge(L, 92)}</div>
        <div class="lvlup__txt"><span>${rankUp ? 'Nouveau rang' : 'Niveau supérieur'}</span><b>${rankUp ? 'Rang ' + r.name : 'Niveau ' + L}</b>
        <small>${casesText(rw.cases)}${rw.coins ? ' · +' + fmt(rw.coins) + ' DaveCoins' : ''}</small></div>
      </div>`);
      document.body.appendChild(el);
      sound.play(rankUp ? 'jackpot' : 'win', { x: 20 });
      if (rankUp) sound.play('slam');
      requestAnimationFrame(() => el.classList.add('in'));
      await later(350);
      ui.burst(el.querySelector('.lvlup__badge'), { n: rankUp ? 70 : 36, colors: [r.c, '#ffffff', '#ffc145'], spread: 2 });
      await later(rankUp ? 3600 : 2600);
      el.classList.remove('in');
      await later(500);
      el.remove();
    });
  }
  function achPopup(a) {
    const rw = a.coins ? a : ACH_REWARD[a.tier];
    bannerChain = bannerChain.then(async () => {
      const el = ui.el(`<div class="achpop t${a.tier}" role="status"><span class="achpop__ico">${I(a.icon)}</span>
        <div><span>Succès débloqué</span><b>${esc(a.name)}</b><small>+${fmt(rw.coins)} DaveCoins · +${fmt(rw.xp)} XP</small></div></div>`);
      document.body.appendChild(el);
      sound.play('win', { x: 5 });
      requestAnimationFrame(() => el.classList.add('in'));
      await later(2800);
      el.classList.remove('in');
      await later(450);
      el.remove();
    });
  }
  function missionToast(m) {
    ui.toast(`Mission accomplie : ${describe(m)}. Récupère ta récompense !`, 'win', 3800);
    sound.play('win', { x: 3 });
  }

  /* ---------- Page Progression ---------- */
  const dur = (ms) => { const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60); return `${h} h ${String(mm).padStart(2, '0')}`; };
  function render(view) {
    ensureGameAchs();
    let filter = 'all';
    const paint = () => {
      const p = load(), info = levelInfo(p.xp), r = info.rank;
      const list = missionsOf(p);
      if (!(DP.engine && DP.engine.on)) save(p); // fige les missions du jour (en ligne : c'est le serveur)
      const nextRank = RANKS.find((x) => x.from > info.level);
      const nextRw = info.level < MAX_LEVEL ? { L: info.level + 1, rw: levelReward(info.level + 1) } : null;
      const rb = rakeback(p);
      const x = ctxOf(p);
      const unlocked = ACHS.filter((a) => p.ach[a.id]).length;
      const cats = [...new Set(ACHS.map((a) => a.cat))];
      const free = Object.entries(p.free).filter(([, n]) => n > 0);
      view.innerHTML = `
        <section class="prog-hero" style="--rc:${r.c}" data-reveal>
          <div class="prog-hero__badge">${badge(info.level, 132)}</div>
          <div class="prog-hero__main">
            <span class="prog-hero__rank">Rang ${r.name}</span>
            <h1>Niveau ${info.level}${info.level >= MAX_LEVEL ? ' · max' : ''}</h1>
            <div class="xpbar"><i style="width:${(info.pct * 100).toFixed(1)}%"></i></div>
            <p class="muted"><b class="num">${fmt(Math.floor(info.into))}</b> / <span class="num">${fmt(info.need)}</span> XP · l’XP suit le risque que tu prends en misant</p>
            <div class="prog-hero__next">
              ${nextRank ? `<span>${I('trending-up', 'i--sm')}Rang ${nextRank.name} au niveau ${nextRank.from}</span>` : '<span>Rang maximum atteint</span>'}
              ${nextRw ? `<span>${I('gift', 'i--sm')}Niveau ${nextRw.L} : ${casesText(nextRw.rw.cases)}</span>` : ''}
              <span>${I('percent', 'i--sm')}Rakeback ${Math.round(rb.pct * 100)} % · <b class="num">${fmt(rb.pending)}</b> à réclamer dans Bonus</span>
            </div>
          </div>
        </section>

        <div class="ranks" data-reveal>${RANKS.map((rk) => `<div class="ranks__item ${info.level >= rk.from ? 'on' : ''} ${rk === r ? 'cur' : ''}" style="--rc:${rk.c}">${badge(rk.from, 46)}<b>${rk.name}</b><small>Niv. ${rk.from}</small><small class="ranks__rb">Rakeback ${Math.round(RB_PCT[rk.name] * 100)} %</small></div>`).join('')}</div>

        ${free.length ? `<div class="freecases" data-reveal>${I('gift')}<span>Caisses offertes :</span>${free.map(([id, n]) => `<a class="btn btn--primary btn--sm" href="#/caisses/${id}">${esc(caseName(id))} ×${n}</a>`).join('')}</div>` : ''}

        <div class="section-head" data-reveal><h2>Missions du jour</h2><span class="js-reset">Nouvelles missions dans ${dur(nextReset())}</span></div>
        <div class="missions" data-reveal>${list.map((m, i) => {
          const T = TIERS[m.tier];
          return `<article class="mission t${m.tier} ${m.done ? 'done' : ''} ${m.claimed ? 'claimed' : ''}">
            <header><span class="mission__tier">${T.label}</span>${m.claimed ? `<span class="pos">${I('check', 'i--sm')}Récupérée</span>` : ''}</header>
            <p>${esc(describe(m))}</p>
            <div class="mission__bar"><i style="width:${(m.prog / m.target) * 100}%"></i></div>
            <span class="mission__count num">${m.target > 1 ? `${fmt(Math.floor(m.prog))} / ${fmt(m.target)}` : m.done ? 'Terminée' : 'En cours'}</span>
            <div class="mission__rw"><span>${ui.coin('coin--xs')}${fmt(T.coins)}</span><span>+${fmt(T.xp)} XP</span>${T.freeCase ? `<span>${I('package-open', 'i--sm')}${esc(caseName(T.freeCase))}</span>` : ''}</div>
            <button class="btn ${m.done && !m.claimed ? 'btn--primary' : 'btn--ghost'} btn--block js-claim" data-i="${i}" type="button" ${m.done && !m.claimed ? '' : 'disabled'}>${m.claimed ? 'Récompense reçue' : m.done ? 'Récupérer' : 'À faire'}</button>
          </article>`;
        }).join('')}</div>

        <div class="section-head" data-reveal><h2>Succès <small class="num">${unlocked} / ${ACHS.length}</small></h2>
          <div class="seg js-achf">${[['all', 'Tous'], ['on', 'Débloqués'], ['off', 'À débloquer']].map(([k, l]) => `<button type="button" data-f="${k}" class="${k === filter ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        ${cats.map((c) => {
          const items = ACHS.filter((a) => a.cat === c && (filter === 'all' || (filter === 'on') === !!p.ach[a.id]));
          if (!items.length) return '';
          return `<h3 class="ach-cat">${c}</h3><div class="achs">${items.map((a) => {
            const goal = goalOf(a), cur = Math.min(goal, a.get(x)), got = !!p.ach[a.id];
            return `<div class="ach t${a.tier} ${got ? 'got' : ''}">
              <span class="ach__ico">${I(a.icon)}</span>
              <div class="ach__body"><b>${esc(a.name)}</b><span>${esc(a.desc)}</span>
                ${got ? `<small class="pos">${I('check', 'i--sm')}Débloqué le ${new Date(p.ach[a.id]).toLocaleDateString('fr-FR')}</small>`
                  : `<div class="ach__bar"><i style="width:${(cur / goal) * 100}%"></i></div><small class="num">${fmt(Math.floor(cur))} / ${fmt(goal)}</small>`}</div>
              <span class="ach__rw num">+${fmt(ACH_REWARD[a.tier].coins)}</span>
            </div>`;
          }).join('')}</div>`;
        }).join('')}`;
      DP_MOTION.reveal(view, '[data-reveal]');
    };
    view.addEventListener('click', (e) => {
      const c = e.target.closest('.js-claim');
      if (c && DP.engine && DP.engine.on) {
        c.disabled = true;
        DP.engine.call('mission_claim', { p_i: +c.dataset.i }).then((rw) => {
          if (!rw) return paint();
          sound.play('jackpot');
          ui.burst(c, { n: 50, colors: ['#ffc145', '#ff6b2c', '#ffffff'], spread: 2 });
          ui.coinRain(view, 30);
          ui.toast(`+${fmt(rw.coins)} DaveCoins · +${fmt(rw.xp)} XP${rw.freeCase ? ' · ' + caseName(rw.freeCase) + ' offerte' : ''}${rw.allDone ? ' · Journée parfaite !' : ''}`, 'win');
          setTimeout(paint, 450);
        });
        return;
      }
      if (c) {
        const rw = claim(+c.dataset.i);
        if (!rw) return;
        sound.play('jackpot');
        ui.burst(c, { n: 50, colors: ['#ffc145', '#ff6b2c', '#ffffff'], spread: 2 });
        ui.coinRain(view, 30);
        ui.toast(`+${fmt(rw.coins)} DaveCoins · +${fmt(rw.xp)} XP${rw.freeCase ? ' · ' + caseName(rw.freeCase) + ' offerte' : ''}${rw.allDone ? ' · Journée parfaite !' : ''}`, 'win');
        setTimeout(paint, 450);
        return;
      }
      const f = e.target.closest('.js-achf button');
      if (f) { filter = f.dataset.f; sound.play('click'); paint(); }
    });
    paint();
    const t = setInterval(() => { const el = view.querySelector('.js-reset'); if (el) el.textContent = `Nouvelles missions dans ${dur(nextReset())}`; }, 30000);
    return () => clearInterval(t);
  }

  /* ---------- Résumé (barre du haut, menu, dashboard) ---------- */
  function summary() {
    if (!auth.current()) return null;
    ensureGameAchs();
    const p = load(), info = levelInfo(p.xp);
    const list = missionsOf(p);
    return { ...info, xp: p.xp, claimable: list.filter((m) => m.done && !m.claimed).length, missionsDone: list.filter((m) => m.claimed).length, achDone: ACHS.filter((a) => p.ach[a.id]).length, achTotal: ACHS.length };
  }

  setTimeout(() => { ready = true; }, 0);
  /** Liste des succès avec leur état (pour les titres du profil). */
  function achievements() {
    if (!auth.current()) return [];
    ensureGameAchs();
    const p = load();
    return ACHS.map((a) => ({ id: a.id, name: a.name, desc: a.desc, icon: a.icon, tier: a.tier, cat: a.cat, got: p.ach[a.id] || 0 }));
  }

  /** XP totale pour atteindre le niveau L (début du niveau). */
  const xpFor = (L) => { let x = 0; for (let i = 1; i < Math.min(L, MAX_LEVEL); i++) x += need(i); return x; };

  /** Succès débloqués côté serveur : un encart par succès, ou un seul s'il y en a beaucoup. */
  function achPopups(ids) {
    ensureGameAchs();
    const list = ids.map((id) => ACHS.find((x) => x.id === id)).filter(Boolean);
    if (!list.length) return;
    if (list.length > 3) achPopup({ icon: 'trophy', tier: 3, name: `${list.length} succès débloqués`, coins: list.reduce((t, a) => t + ACH_REWARD[a.tier].coins, 0), xp: list.reduce((t, a) => t + ACH_REWARD[a.tier].xp, 0) });
    else list.forEach(achPopup);
  }

  DP.progress = { RANKS, MAX_LEVEL, RB_PCT, levelInfo, rankOf, badge, render, summary, freeCases, caseName, achievements, xpFor, celebrateLevel, achPopups, missionToast, describe, levelReward, rakeback, claimRakeback };
})();
