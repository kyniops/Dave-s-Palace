/* Liaison avec le moteur de jeu du serveur (supabase/engine.sql).
 * En ligne, le serveur tient le solde, l'inventaire, les stats et la progression, et tire le résultat
 * de chaque partie. Le site appelle une fonction du serveur, anime le résultat reçu, puis recopie
 * le compte renvoyé dans son cache local (hydrate). Hors ligne, les jeux restent en mode local.
 */
(() => {
  const { auth, store, ui, emit, round2 } = DP;
  const KEYS = ['davecoin_', 'dp_stats_', 'dp_inv_', 'dp_prog_', 'dp_codes_', 'dp_bonus_', 'dp_rescue_'];
  const engine = { on: false, KEYS };
  DP.engine = engine;

  const parse = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

  /** Recopie le compte du serveur dans le cache local et déclenche les célébrations (niveau, succès, missions). */
  engine.hydrate = (acct, { quiet = false } = {}) => {
    const u = auth.current();
    if (!acct || !u) return;
    const before = { prog: parse(store.get('dp_prog_' + u), {}) };
    KEYS.forEach((k) => { if (acct[k] != null) store.set(k + u, acct[k]); });
    const after = { prog: parse(acct.dp_prog_, {}) };
    emit('balance', DP.wallet.get());
    emit('inventory');
    emit('stats', DP.stats.get());
    emit('progress', after.prog);
    if (!quiet && DP.progress) celebrate(before.prog, after.prog);
  };

  function celebrate(a, b) {
    const P = DP.progress;
    const la = P.levelInfo(a.xp || 0).level, lb = P.levelInfo(b.xp || 0).level;
    const top = Math.max(1, a.top || a.level || 1);
    if (lb > la && lb > top) {
      let coins = 0; const cases = []; let rankUp = false;
      for (let L = Math.max(la, top) + 1; L <= lb; L++) {
        coins += 50 * L;
        if (L % 5 === 0) cases.push(L >= 40 ? 'royale' : L >= 30 ? 'aura' : L >= 20 ? 'kawai' : L >= 10 ? 'gamers' : 'bande');
        if (P.rankOf(L).from === L) rankUp = true;
      }
      P.celebrateLevel(lb, { coins, cases }, rankUp);
    }
    const oldAch = a.ach || {}, fresh = Object.keys(b.ach || {}).filter((id) => !oldAch[id]);
    if (fresh.length) P.achPopups(fresh);
    const om = (a.m && a.m.day) === (b.m && b.m.day) ? a.m.list : [];
    ((b.m && b.m.list) || []).forEach((m, i) => { if (m.done && !(om[i] && om[i].done)) P.missionToast(m); });
  }

  /** Affiche tout de suite la mise débitée, avant que le résultat ne soit révélé. */
  engine.debitView = (amount) => {
    const u = auth.current();
    if (!u || !(amount > 0)) return;
    store.set('davecoin_' + u, String(round2(Math.max(0, DP.wallet.get() - amount))));
    emit('balance', DP.wallet.get());
  };

  /**
   * Appelle une fonction du serveur. Renvoie la réponse, ou null en cas de refus (message affiché).
   * defer : ne recopie pas le compte tout de suite (le jeu appellera engine.hydrate(r.acct) au moment de révéler le résultat).
   */
  engine.call = async (fn, params = {}, { defer = false, silent = false } = {}) => {
    const sb = DP.cloud && DP.cloud.sb;
    if (!sb) return null;
    let res;
    try { res = await sb.rpc(fn, params); } catch (e) { res = { error: e }; }
    if (res.error) {
      const msg = (res.error.message || '').replace(/^.*?: /, '');
      engine.lastError = msg || 'Erreur du serveur.';
      if (!silent) { ui.toast(/Trop rapide/.test(msg) ? 'Doucement ! Une action à la fois.' : msg || 'Erreur du serveur.', 'error'); DP.sound.play('error'); }
      // on resynchronise l'affichage avec le serveur
      engine.refresh();
      return null;
    }
    const data = res.data || {};
    if (data.acct && !defer) engine.hydrate(data.acct);
    if (data.acct && defer) engine._pending = data.acct;
    return data;
  };

  /** Applique un compte mis de côté pendant une animation (révélation, ou départ de la page). */
  engine.reveal = (acct) => {
    const a = acct || engine._pending;
    if (!a) return;
    if (engine._pending === a) engine._pending = null;
    engine.hydrate(a);
  };
  engine.flush = () => { if (engine._pending) engine.reveal(engine._pending); };

  /** Recharge le compte depuis le serveur. */
  engine.refresh = async () => {
    const sb = DP.cloud && DP.cloud.sb;
    if (!sb || !engine.on) return;
    const { data, error } = await sb.rpc('acct_state');
    if (!error && data && data.acct) engine.hydrate(data.acct, { quiet: true });
  };

  /** Active le moteur si le serveur le propose (script engine.sql installé). */
  engine.init = async () => {
    const sb = DP.cloud && DP.cloud.sb;
    if (!sb || !DP.cloud.uid()) { engine.on = false; return false; }
    const { data, error } = await sb.rpc('acct_state');
    engine.on = !error && !!(data && data.engine);
    if (engine.on) engine.hydrate(data.acct, { quiet: true });
    emit('engine', engine.on);
    return engine.on;
  };
})();
