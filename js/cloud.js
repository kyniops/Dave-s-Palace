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
  // numéro de modification admin connu (null = colonne absente ou pas encore de sauvegarde)
  let knownRev = null, hasRev = true;
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
    let error;
    if (hasRev && knownRev != null) {
      // n'écrase pas une modification faite par un admin entre-temps
      const r = await sb.from('saves').update(row).eq('user_id', uid).eq('admin_rev', knownRev).select('user_id');
      error = r.error;
      if (!error && (!r.data || !r.data.length)) { pushing = false; adminReload(); return; }
    } else {
      ({ error } = await sb.from('saves').upsert(row));
      if (!error && hasRev && knownRev == null) knownRev = 0;
    }
    pushing = false;
    if (!error) { lastSent = json; store.set(syncKey(u), String(Date.now())); }
  }
  let revChannel = null, revTimer = 0;
  function startSync() {
    clearInterval(pushTimer);
    pushTimer = setInterval(() => push(), 4000);
    // un admin modifie le compte : on recharge la partie (temps réel + vérification régulière)
    if (revChannel) sb.removeChannel(revChannel);
    revChannel = sb.channel('rev-' + uid)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'saves', filter: `user_id=eq.${uid}` }, (p) => {
        if (hasRev && knownRev != null && p.new && p.new.admin_rev > knownRev) adminReload();
      })
      .subscribe();
    clearInterval(revTimer);
    revTimer = setInterval(async () => {
      if (!uid || !hasRev || knownRev == null) return;
      const { data } = await sb.from('saves').select('admin_rev').eq('user_id', uid).maybeSingle();
      if (data && data.admin_rev > knownRev) adminReload();
    }, 20000);
  }
  let reloading = false;
  async function adminReload() {
    const u = auth.current();
    if (!uid || !u || reloading) return;
    reloading = true;
    const { data: row } = await sb.from('saves').select('data, updated_at, admin_rev').eq('user_id', uid).maybeSingle();
    reloading = false;
    if (!row) return;
    hydrate(u, row.data);
    knownRev = row.admin_rev;
    store.set('dp_rev_' + u, String(knownRev));
    lastSent = JSON.stringify(snapshot(u));
    store.set(syncKey(u), String(new Date(row.updated_at).getTime()));
    ui.toast('Un admin a modifié ton compte', 'win', 4000);
    emit('cloudload');
  }
  cloud.pushNow = () => push(true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') push(); });
  window.addEventListener('pagehide', () => push());

  /** Récupère la sauvegarde du serveur ; si elle est plus récente que le cache local, elle le remplace. */
  async function pull(u, { importLocal = false } = {}) {
    let { data: row, error } = await sb.from('saves').select('data, updated_at, admin_rev').eq('user_id', uid).maybeSingle();
    if (error) { hasRev = false; ({ data: row } = await sb.from('saves').select('data, updated_at').eq('user_id', uid).maybeSingle()); }
    if (row) {
      if (hasRev) {
        // modification admin jamais vue sur cet appareil : elle passe avant le cache local
        const seen = parseInt(store.get('dp_rev_' + u, '0'), 10) || 0;
        knownRev = row.admin_rev || 0;
        if (knownRev > seen) { hydrate(u, row.data); store.set(syncKey(u), String(new Date(row.updated_at).getTime())); store.set('dp_rev_' + u, String(knownRev)); lastSent = JSON.stringify(snapshot(u)); return 'cloud'; }
      }
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
    startPresence();
    if (DP.engine) await DP.engine.init();
    emit('auth');
    if (res === 'imported') setTimeout(() => ui.toast('Ta partie de ce navigateur a été importée dans ton compte en ligne', 'win', 4200), 1200);
  }

  // adresse de retour des liens envoyés par mail (confirmation, mot de passe oublié)
  const SITE = location.origin + location.pathname;
  const emailErr = (e) => {
    const m = (e && e.message) || '';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Trop d’emails envoyés : réessaie dans quelques minutes.';
    if (/invalid.*email|email.*invalid/i.test(m)) return 'Adresse email invalide.';
    if (/already registered|already exists/i.test(m)) return 'Cette adresse email est déjà utilisée par un autre compte.';
    return errFr(e);
  };
  auth.register = async (name, password, email) => {
    name = (name || '').trim(); email = (email || '').trim().toLowerCase();
    const bad = auth.usernameProblem(name);
    if (bad) return bad;
    if (!email) return 'Entre ton adresse email : elle sert à confirmer ton compte et à le récupérer.';
    if (!password || password.length < 6) return 'Le mot de passe doit faire au moins 6 caractères.';
    try { const { data: pb } = await sb.rpc('email_check', { p_email: email }); if (pb) return pb; } catch { /* script email.sql absent */ }
    const { data: taken } = await sb.from('profiles').select('id').ilike('username', name).maybeSingle();
    if (taken) return 'Ce pseudo est déjà pris.';
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username: name }, emailRedirectTo: SITE } });
    if (error) return emailErr(error);
    // confirmation par email activée : le compte sera créé au retour du lien reçu par mail
    if (!data.session) return { confirm: email };
    uid = data.user.id;
    const { error: e2 } = await sb.from('profiles').insert({ id: uid, username: name });
    if (e2) { await sb.auth.signOut(); uid = null; return /duplicate|unique|déjà pris/i.test(e2.message) ? 'Ce pseudo est déjà pris.' : /interdit|invalide/i.test(e2.message) ? e2.message : errFr(e2); }
    await enter(name, { importLocal: hasLocal(name) });
    return null;
  };
  auth.login = async (name, password) => {
    name = (name || '').trim();
    let email = name.toLowerCase();
    if (!name.includes('@')) {
      // pseudo : seulement pour les anciens comptes (adresse interne) ; les nouveaux se connectent avec leur email
      email = null;
      try { const { data: em } = await sb.rpc('login_email', { p_username: name }); if (em) email = em; } catch { email = emailOf(name); }
      if (!email) return 'Connecte-toi avec ton adresse email (les nouveaux comptes n’utilisent plus le pseudo pour se connecter).';
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password: password || '' });
    if (error) {
      // ancien compte local de ce navigateur pas encore passé en ligne : on le signale
      if (auth.users().some((u) => u.prenom.toLowerCase() === name.toLowerCase())) return 'Ce compte existe seulement sur ce navigateur : clique sur « Inscription » avec le même pseudo (mot de passe de 6 caractères minimum) pour le passer en ligne, ta partie sera importée.';
      if (/not confirmed/i.test(error.message || '')) return 'Confirme d’abord ton adresse email : clique sur le lien reçu par mail (pense aux spams).';
      return name.includes('@') && /invalid login|invalid credentials/i.test(error.message || '') ? 'Email ou mot de passe incorrect.' : errFr(error);
    }
    uid = data.user.id;
    if (await bannedReason() !== null) { const why = await bannedReason(); await sb.auth.signOut(); uid = null; return 'Ce compte a été banni' + (why ? ' : ' + why : '.'); }
    const { data: prof } = await sb.from('profiles').select('username').eq('id', uid).maybeSingle();
    let username = prof ? prof.username : null;
    if (!prof) {
      // première connexion après la confirmation de l'email : on crée le compte de jeu
      const r = await createProfile(data.user);
      if (r.error) { await sb.auth.signOut(); uid = null; return r.error; }
      username = r.username;
    }
    await enter(username, { importLocal: false });
    return null;
  };
  /** Crée le profil de jeu d'un compte qui vient de confirmer son email (pseudo choisi à l'inscription). */
  async function createProfile(user) {
    const want = ((user && user.user_metadata && user.user_metadata.username) || '').trim();
    // connexion Google : pas encore de pseudo, on le demande
    if (!want) return { needName: true };
    const { error } = await sb.from('profiles').insert({ id: user.id, username: want });
    if (!error) return { username: want };
    if (/duplicate|unique|déjà pris/i.test(error.message)) {
      // pseudo pris entre-temps : on ajoute des chiffres
      for (let i = 0; i < 4; i++) {
        const alt = (want.slice(0, 16) + Math.floor(100 + Math.random() * 900)).slice(0, 20);
        const r2 = await sb.from('profiles').insert({ id: user.id, username: alt });
        if (!r2.error) { setTimeout(() => ui.toast(`Le pseudo « ${want} » a été pris entre-temps : tu es « ${alt} ».`, 'info', 7000), 1500); return { username: alt }; }
      }
    }
    return { error: error.message || 'Création du compte impossible.' };
  }
  /** Connexion avec Google (redirige vers Google puis revient sur le site). */
  auth.google = async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: SITE } });
    return error ? errFr(error) : null;
  };
  let googleOn = null;
  auth.googleEnabled = async () => {
    if (googleOn != null) return googleOn;
    try {
      const r = await fetch(SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: SUPABASE_KEY } });
      googleOn = !!((await r.json()).external || {}).google;
    } catch { googleOn = false; }
    return googleOn;
  };
  /** Premier passage d'un compte Google : choix du pseudo puis création du compte de jeu. */
  auth.claimName = async (name) => {
    name = (name || '').trim();
    const bad = auth.usernameProblem(name);
    if (bad) return bad;
    const { data: s } = await sb.auth.getSession();
    if (!s.session) return 'Session expirée : reconnecte-toi avec Google.';
    uid = s.session.user.id;
    const { error } = await sb.from('profiles').insert({ id: uid, username: name });
    if (error) return /duplicate|unique|déjà pris/i.test(error.message) ? 'Ce pseudo est déjà pris.' : error.message;
    cloud.needName = false;
    await enter(name, { importLocal: false });
    return null;
  };
  auth.cancelClaim = async () => { cloud.needName = false; await sb.auth.signOut(); uid = null; };
  /** Mot de passe oublié : envoie le lien de réinitialisation. */
  auth.resetPassword = async (email) => {
    email = (email || '').trim().toLowerCase();
    if (!email.includes('@')) return { error: 'Entre l’adresse email de ton compte.' };
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE });
    if (error) return { error: emailErr(error) };
    return { ok: true };
  };
  auth.resendConfirm = async (email) => { const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: SITE } }); return error ? emailErr(error) : null; };
  auth.setPassword = async (password) => {
    if (!password || password.length < 6) return 'Le mot de passe doit faire au moins 6 caractères.';
    const { error } = await sb.auth.updateUser({ password });
    return error ? errFr(error) : null;
  };
  auth.myEmail = async () => { try { const { data } = await sb.rpc('my_email'); return data || null; } catch { return null; } };
  /** Ajouter / changer l'adresse email du compte (un lien de confirmation part à la nouvelle adresse). */
  auth.setEmail = async (email) => {
    email = (email || '').trim().toLowerCase();
    try { const { data: pb } = await sb.rpc('email_check', { p_email: email }); if (pb) return pb; } catch { /* ignore */ }
    const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: SITE });
    if (error) return emailErr(error);
    // ancien compte : l'adresse interne ne peut pas confirmer, un seul clic sur le nouveau lien suffira
    try { await sb.rpc('legacy_email_ready'); } catch { /* ignore */ }
    return null;
  };
  // lien « mot de passe oublié » ouvert : on demandera le nouveau mot de passe une fois connecté
  cloud.recovery = /type=recovery/.test(location.hash);
  sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') { cloud.recovery = true; emit('recovery'); } });
  const localLogout = auth.logout;
  auth.logout = () => { stopPresence(); push(true).finally(() => sb.auth.signOut()); clearInterval(pushTimer); uid = null; localLogout(); };

  /* ---------- Bannissement ---------- */
  /** null si le compte n'est pas banni, sinon la raison ('' si aucune). */
  async function bannedReason() {
    if (!uid) return null;
    const { data, error } = await sb.from('profiles').select('banned, banned_reason').eq('id', uid).maybeSingle();
    if (error || !data || !data.banned) return null;
    return data.banned_reason || '';
  }
  async function kickIfBanned() {
    const why = await bannedReason();
    if (why === null) return false;
    clearInterval(pushTimer); uid = null;
    await sb.auth.signOut();
    localLogout();
    ui.toast('Ton compte a été banni' + (why ? ' : ' + why : '.'), 'error', 6000);
    emit('cloudload');
    return true;
  }
  setInterval(() => { if (uid) kickIfBanned(); }, 30000);

  /** Renommé par un admin : on reprend la partie sous le nouveau pseudo. */
  cloud.renamed = async (newName) => {
    if (!uid) return;
    store.set('utilisateurCourant', newName);
    await pull(newName);
    ui.toast(`Un admin t’a renommé en « ${newName} »`, 'win', 5000);
    emit('cloudload');
  };

  /* ---------- Session déjà ouverte au chargement ---------- */
  cloud.ready = (async () => {
    const { data } = await sb.auth.getSession();
    const s = data.session;
    if (!s) { if (auth.current()) { store.remove('utilisateurCourant'); emit('cloudload'); } return; }
    uid = s.user.id;
    const fromMail = /access_token=|type=(signup|recovery|email_change)/.test(location.hash);
    let { data: prof } = await sb.from('profiles').select('username').eq('id', uid).maybeSingle();
    if (!prof) {
      // retour du lien de confirmation : création du compte de jeu
      const r = await createProfile(s.user);
      if (r.needName) {
        cloud.needName = true;
        if (/access_token=/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/inscription');
        store.remove('utilisateurCourant');
        emit('cloudload'); setTimeout(() => emit('needname'), 300);
        return;
      }
      if (r.error) { await sb.auth.signOut(); uid = null; store.remove('utilisateurCourant'); emit('cloudload'); ui.toast(r.error, 'error', 6000); return; }
      prof = { username: r.username };
      setTimeout(() => ui.toast('Adresse email confirmée : bienvenue au Palace !', 'win', 5000), 1200);
    }
    if (fromMail) { history.replaceState(null, '', location.pathname + '#/lobby'); setTimeout(() => emit('cloudload'), 0); }
    if (await kickIfBanned()) return;
    const before = auth.current();
    store.set('utilisateurCourant', prof.username);
    const beforeTs = store.get(syncKey(prof.username));
    await pull(prof.username);
    startSync();
    startPresence();
    if (DP.engine) await DP.engine.init();
    emit('session');
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
      if (!(amount > 0) || (DP.engine && DP.engine.on)) return;
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
    if (DP.engine && DP.engine.on) { jpPending = 0; return; } // alimenté par le serveur
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
  setInterval(refreshJackpot, 5000);

  /* ---------- Fil des gros gains ---------- */
  const feedRows = [];
  cloud.feed = () => feedRows;
  async function postFeed(game, amount, mult) {
    const u = auth.current();
    if (!uid || !u || (DP.engine && DP.engine.on)) return; // publié par le serveur
    await sb.from('feed').insert({ user_id: uid, username: u, game, amount: round2(amount), mult: round2(mult) });
  }
  on('played', (h) => {
    if (!h || !cloud.online) return;
    const net = h.payout - h.bet;
    if (net >= 1000 || (h.mult >= 50 && net >= 100)) postFeed(h.game, net, h.mult);
  });
  (async () => {
    const { data } = await sb.from('feed').select('*').order('created_at', { ascending: false }).limit(20);
    // (les gains d'un joueur banni sont supprimés côté serveur au moment du bannissement)
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
        // le jackpot a sa propre grande alerte (app.js) ; les autres gros gains, un simple toast
        if (r.game !== 'jackpot') ui.toast(`${esc(r.username)} gagne +${fmt(r.amount)} sur ${g ? g.name : r.game}`, 'win', 4000);
      }
    })
    .subscribe();

  /* ---------- Joueurs en ligne (présence en direct, rien n'est stocké) ---------- */
  let presCh = null, presState = null, page = 'lobby';
  function startPresence() {
    if (!uid || presCh) return;
    presCh = sb.channel('presence-palace', { config: { presence: { key: uid } } });
    presCh.on('presence', { event: 'sync' }, () => {
      const st = presCh.presenceState();
      const per = {}; let total = 0;
      Object.values(st).forEach((metas) => { const m = metas[metas.length - 1] || {}; total++; if (m.page) per[m.page] = (per[m.page] || 0) + 1; });
      // la page des caisses compte aussi pour le jeu des caisses dans le menu
      presState = { total, per };
      emit('presence', presState);
    }).subscribe((status) => { if (status === 'SUBSCRIBED') presCh.track({ page }); });
  }
  function stopPresence() { if (presCh) { try { sb.removeChannel(presCh); } catch { /* ignore */ } presCh = null; presState = null; emit('presence', null); } }
  cloud.presence = () => presState;
  cloud.setPage = (k) => { if (!k || k === page) return; page = k; if (presCh) presCh.track({ page }); };

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
    let profRes = await sb.from('profiles').select('id, username, created_at, banned, banned_reason');
    if (profRes.error) profRes = await sb.from('profiles').select('id, username, created_at');
    const [{ data: profs }, { data: saves }] = await Promise.all([
      Promise.resolve(profRes),
      sb.from('saves').select(withData ? 'user_id, balance, level, wagered, biggest_win, updated_at, data' : 'user_id, balance, level, wagered, biggest_win, updated_at')
    ]);
    const byId = Object.fromEntries((saves || []).map((s) => [s.user_id, s]));
    return (profs || []).map((p) => ({ id: p.id, name: p.username, banned: !!p.banned, bannedReason: p.banned_reason || '', ...(byId[p.id] || { balance: 0, level: 1, wagered: 0, biggest_win: 0 }) }));
  };
  cloud.uid = () => uid;
  /* Actions d'administration (refusées par le serveur si le compte n'est pas admin) */
  cloud.admin = {
    setSave: async (userId, data, balance, level) => { const { error } = await sb.rpc('admin_set_save', { p_user: userId, p_data: data, p_balance: balance, p_level: level }); if (error) throw error; },
    ban: async (userId, banned, reason) => { const { error } = await sb.rpc('admin_ban', { p_user: userId, p_banned: banned, p_reason: reason || null }); if (error) throw error; },
    rename: async (userId, name) => { const bad = auth.usernameProblem(name); if (bad) throw new Error(bad); const { error } = await sb.rpc('admin_rename', { p_user: userId, p_name: name }); if (error) throw error; },
    setJackpot: async (amount) => { const { error } = await sb.rpc('admin_set_jackpot', { p_amount: amount }); if (error) throw error; await refreshJackpot(); },
    clearFeed: async () => { const { error } = await sb.rpc('admin_clear_feed'); if (error) throw error; feedRows.length = 0; emit('livefeed'); }
  };
})();
