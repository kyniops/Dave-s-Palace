/* Version en ligne (Supabase) : comptes, sauvegarde dans le cloud, jackpot partagé, fil des gros gains.
 * Le site garde le localStorage comme cache de travail : ce module le remplit à la connexion
 * et renvoie les changements au serveur toutes les quelques secondes.
 * Hors ligne, ou ouvert en file://, le site reste en mode local (comptes du navigateur).
 */
(() => {
  const SUPABASE_URL = 'https://xhbplutghabtyctgvche.supabase.co';
  // clé publique (« publishable ») : faite pour être dans le site, la sécurité passe par les règles RLS
  const SUPABASE_KEY = 'sb_publishable_EnnH1IQwSM_HZgc6sqBA6Q_RjQHPcO_';
  const { auth, store, wallet, stats, jackpot, ui, sound, fmt, esc, round2, on, emit } = DP;

  const forceLocal = (() => { try { return localStorage.getItem('dp_offline') === '1'; } catch { return true; } })();
  const ok = location.protocol.startsWith('http') && !forceLocal && window.supabase && window.supabase.createClient;
  const cloud = { online: !!ok, ready: Promise.resolve() };
  DP.cloud = cloud;
  if (!ok) return;

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dp_sb_session' } });
  cloud.sb = sb;
  let uid = null;

  /* ---------- Données d'un joueur (clés du localStorage) ---------- */
  const KEYS = (u) => ['davecoin_' + u, 'dp_stats_' + u, 'dp_inv_' + u, 'dp_prog_' + u, 'dp_profile_' + u, 'dp_codes_' + u, 'dp_bonus_' + u, 'dp_rescue_' + u];
  function snapshot(u) {
    const out = {};
    KEYS(u).forEach((k) => { const v = store.get(k); if (v !== null) out[k.slice(0, k.length - u.length)] = v; });
    return out;
  }
  function hydrate(u, data) {
    KEYS(u).forEach((k) => store.remove(k));
    Object.entries(data || {}).forEach(([prefix, v]) => store.set(prefix + u, v));
  }
  const hasLocal = (u) => KEYS(u).some((k) => store.get(k) !== null);
  const syncKey = (u) => 'dp_sync_' + u;

  /* ---------- Envoi régulier de la sauvegarde ---------- */
  let lastSent = '', pushing = false, pushTimer = 0;
  async function push(force = false) {
    const u = auth.current();
    if (!uid || !u || pushing) return;
    const data = snapshot(u), json = JSON.stringify(data);
    if (!force && json === lastSent) return;
    pushing = true;
    const s = stats.get();
    let level = 1;
    try { level = DP.progress ? DP.progress.levelInfo(JSON.parse(data['dp_prog_'] || '{}').xp || 0).level : 1; } catch { /* ignore */ }
    const row = { user_id: uid, data, balance: wallet.get(), level, wagered: s.wagered || 0, biggest_win: s.biggestWin || 0, updated_at: new Date().toISOString() };
    const { error } = await sb.from('saves').upsert(row);
    pushing = false;
    if (!error) { lastSent = json; store.set(syncKey(u), String(Date.now())); }
  }
  function startSync() {
    clearInterval(pushTimer);
    pushTimer = setInterval(() => push(), 4000);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') push(); });
  window.addEventListener('pagehide', () => push());

  /** Récupère la sauvegarde du serveur ; si elle est plus récente que le cache local, elle le remplace. */
  async function pull(u, { importLocal = false } = {}) {
    const { data: row } = await sb.from('saves').select('data, updated_at').eq('user_id', uid).maybeSingle();
    if (row) {
      const cloudTs = new Date(row.updated_at).getTime();
      const localTs = parseInt(store.get(syncKey(u), '0'), 10) || 0;
      if (cloudTs > localTs || !hasLocal(u)) { hydrate(u, row.data); store.set(syncKey(u), String(cloudTs)); }
      lastSent = JSON.stringify(snapshot(u));
      return 'cloud';
    }
    // pas encore de sauvegarde en ligne : on envoie la partie de ce navigateur (ancien compte local) ou une partie neuve
    if (!importLocal) hydrate(u, {});
    wallet.ensure();
    await push(true);
    return importLocal ? 'imported' : 'new';
  }

  /* ---------- Comptes ---------- */
  const slug = (name) => name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'joueur';
  const emailOf = (name) => `${slug(name)}@daves-palace.app`;
  const errFr = (e) => {
    const m = (e && e.message) || '';
    if (/invalid login|invalid credentials/i.test(m)) return 'Pseudo ou mot de passe incorrect.';
    if (/already registered|already exists/i.test(m)) return 'Ce pseudo est déjà pris.';
    if (/password/i.test(m)) return 'Le mot de passe doit faire au moins 6 caractères.';
    if (/fetch|network/i.test(m)) return 'Connexion au serveur impossible. Vérifie ta connexion internet.';
    return 'Erreur du serveur : ' + m;
  };
  async function enter(username, { importLocal }) {
    store.set('utilisateurCourant', username);
    const res = await pull(username, { importLocal });
    startSync();
    emit('auth');
    if (res === 'imported') setTimeout(() => ui.toast('Ta partie de ce navigateur a été importée dans ton compte en ligne', 'win', 4200), 1200);
  }

  auth.register = async (name, password) => {
    name = (name || '').trim();
    if (name.length < 2) return 'Le pseudo doit faire au moins 2 caractères.';
    if (name.length > 20) return 'Le pseudo doit faire 20 caractères maximum.';
    if (!password || password.length < 6) return 'Le mot de passe doit faire au moins 6 caractères.';
    const { data: taken } = await sb.from('profiles').select('id').ilike('username', name).maybeSingle();
    if (taken) return 'Ce pseudo est déjà pris.';
    const { data, error } = await sb.auth.signUp({ email: emailOf(name), password });
    if (error) return errFr(error);
    if (!data.session) return 'Inscription faite, mais la confirmation par email est activée sur le serveur.';
    uid = data.user.id;
    const { error: e2 } = await sb.from('profiles').insert({ id: uid, username: name });
    if (e2) { await sb.auth.signOut(); uid = null; return /duplicate|unique/i.test(e2.message) ? 'Ce pseudo est déjà pris.' : errFr(e2); }
    await enter(name, { importLocal: hasLocal(name) });
    return null;
  };
  auth.login = async (name, password) => {
    name = (name || '').trim();
    const { data, error } = await sb.auth.signInWithPassword({ email: emailOf(name), password: password || '' });
    if (error) {
      // ancien compte local de ce navigateur pas encore passé en ligne : on le signale
      if (auth.users().some((u) => u.prenom.toLowerCase() === name.toLowerCase())) return 'Ce compte existe seulement sur ce navigateur : clique sur « Inscription » avec le même pseudo (mot de passe de 6 caractères minimum) pour le passer en ligne, ta partie sera importée.';
      return errFr(error);
    }
    uid = data.user.id;
    const { data: prof } = await sb.from('profiles').select('username').eq('id', uid).maybeSingle();
    let username = prof ? prof.username : name;
    if (!prof) await sb.from('profiles').insert({ id: uid, username });
    await enter(username, { importLocal: false });
    return null;
  };
  const localLogout = auth.logout;
  auth.logout = () => { push(true).finally(() => sb.auth.signOut()); clearInterval(pushTimer); uid = null; localLogout(); };

  /* ---------- Session déjà ouverte au chargement ---------- */
  cloud.ready = (async () => {
    const { data } = await sb.auth.getSession();
    const s = data.session;
    if (!s) { if (auth.current()) { store.remove('utilisateurCourant'); emit('cloudload'); } return; }
    uid = s.user.id;
    const { data: prof } = await sb.from('profiles').select('username').eq('id', uid).maybeSingle();
    if (!prof) { await sb.auth.signOut(); uid = null; store.remove('utilisateurCourant'); emit('cloudload'); return; }
    const before = auth.current();
    store.set('utilisateurCourant', prof.username);
    const beforeTs = store.get(syncKey(prof.username));
    await pull(prof.username);
    startSync();
    // nouvelles données venues d'un autre appareil : on rafraîchit l'affichage
    if (before !== prof.username || beforeTs !== store.get(syncKey(prof.username))) emit('cloudload');
  })().catch(() => {});

  /* ---------- Jackpot partagé ---------- */
  let jpCache = jackpot.get(), jpPending = 0;
  const setJp = (row) => {
    if (!row) return;
    jpCache = round2(+row.amount);
    store.set('dp_jackpot', String(jpCache));
    if (row.last_name) store.setJson('dp_jackpot_last', { name: row.last_name, amount: +row.last_amount, t: new Date(row.last_at).getTime() });
    emit('jackpot', jpCache);
  };
  Object.assign(jackpot, {
    get() { return jpCache; },
    feed(amount) {
      if (!(amount > 0)) return;
      jpPending = round2(jpPending + amount);
      jpCache = round2(jpCache + amount);
      emit('jackpot', jpCache);
    },
    win(name) {
      const v = jpCache;
      jpCache = jackpot.SEED;
      store.setJson('dp_jackpot_last', { name, amount: v, t: Date.now() });
      emit('jackpot', jpCache);
      emit('jackpotwin', { name, amount: v });
      if (uid) sb.rpc('jackpot_win').then(() => {}, () => {});
      postFeed('jackpot', v, 0);
      return v;
    }
  });
  async function flushJackpot() {
    if (!uid || jpPending <= 0) return;
    const amount = Math.min(5000, jpPending);
    jpPending = round2(jpPending - amount);
    const { data, error } = await sb.rpc('jackpot_feed', { p_amount: amount });
    if (error) jpPending = round2(jpPending + amount);
    else if (data != null && Math.abs(+data - jpCache) > 1) { jpCache = round2(+data + jpPending); emit('jackpot', jpCache); }
  }
  setInterval(flushJackpot, 3000);
  const refreshJackpot = async () => { const { data } = await sb.from('jackpot').select('*').eq('id', 1).maybeSingle(); if (data && !jpPending) setJp(data); };
  refreshJackpot();
  setInterval(refreshJackpot, 15000);

  /* ---------- Fil des gros gains ---------- */
  const feedRows = [];
  cloud.feed = () => feedRows;
  async function postFeed(game, amount, mult) {
    const u = auth.current();
    if (!uid || !u) return;
    await sb.from('feed').insert({ user_id: uid, username: u, game, amount: round2(amount), mult: round2(mult) });
  }
  on('played', (h) => {
    if (!h || !cloud.online) return;
    const net = h.payout - h.bet;
    if (net >= 1000 || (h.mult >= 50 && net >= 100)) postFeed(h.game, net, h.mult);
  });
  (async () => {
    const { data } = await sb.from('feed').select('*').order('created_at', { ascending: false }).limit(20);
    if (data) { feedRows.push(...data); emit('livefeed'); }
  })();

  /* ---------- Temps réel ---------- */
  sb.channel('palace')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jackpot' }, (p) => { if (!jpPending) setJp(p.new); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed' }, (p) => {
      const r = p.new;
      feedRows.unshift(r);
      feedRows.length = Math.min(feedRows.length, 30);
      emit('livefeed', r);
      if (r.user_id !== uid && auth.current()) {
        const g = DP.games.find(r.game);
        ui.toast(r.game === 'jackpot' ? `${esc(r.username)} a remporté le JACKPOT : ${fmt(r.amount)} !` : `${esc(r.username)} gagne +${fmt(r.amount)} sur ${g ? g.name : r.game}`, 'win', 4000);
        if (r.game === 'jackpot') sound.play('jackpot');
      }
    })
    .subscribe();

  /* ---------- Classement et admin ---------- */
  /* Profils (photo, bannière, titre…) de tous les joueurs, pour les afficher partout */
  let profCache = {};
  cloud.profiles = () => profCache;
  const fillProfiles = (rows, names) => {
    rows.forEach((r) => {
      const n = names[r.user_id];
      if (!n || !r.prof) return;
      try { profCache[n.toLowerCase()] = JSON.parse(r.prof); } catch { /* ignore */ }
    });
  };
  async function loadProfiles() {
    const [{ data: profs }, { data: rows }] = await Promise.all([
      sb.from('profiles').select('id, username'),
      sb.from('saves').select('user_id, prof:data->>dp_profile_')
    ]);
    if (!profs || !rows) return;
    fillProfiles(rows, Object.fromEntries(profs.map((p) => [p.id, p.username])));
    emit('profiles');
  }
  loadProfiles();
  setInterval(loadProfiles, 60000);

  /** Fiche complète d'un joueur (profil public), ou null s'il n'existe pas. */
  cloud.player = async (name) => {
    const { data: prof } = await sb.from('profiles').select('id, username').ilike('username', name).maybeSingle();
    if (!prof) return null;
    const { data: save } = await sb.from('saves').select('balance, level, wagered, biggest_win, data').eq('user_id', prof.id).maybeSingle();
    if (save && save.data && save.data.dp_profile_) { try { profCache[prof.username.toLowerCase()] = JSON.parse(save.data.dp_profile_); } catch { /* ignore */ } }
    return { id: prof.id, name: prof.username, ...(save || { balance: 0, data: {} }) };
  };

  cloud.players = async ({ withData = false } = {}) => {
    const [{ data: profs }, { data: saves }] = await Promise.all([
      sb.from('profiles').select('id, username, created_at'),
      sb.from('saves').select(withData ? 'user_id, balance, level, wagered, biggest_win, updated_at, data' : 'user_id, balance, level, wagered, biggest_win, updated_at')
    ]);
    const byId = Object.fromEntries((saves || []).map((s) => [s.user_id, s]));
    return (profs || []).map((p) => ({ id: p.id, name: p.username, ...(byId[p.id] || { balance: 0, level: 1, wagered: 0, biggest_win: 0 }) }));
  };
  cloud.uid = () => uid;
})();
