/* Amis et notifications (version en ligne).
 * Tables friendships / notifications (supabase/social.sql). Les notifications sont créées par le serveur
 * (demande d'ami, demande acceptée, gros gain d'un ami, modification par un admin) et arrivent en direct.
 */
(() => {
  const { auth, ui, sound, fmt, esc, on, emit, games } = DP;
  const I = ui.icon;
  const S = { ready: false, available: true, uid: null, friends: [], notifs: [], names: {}, channel: null };
  const sb = () => DP.cloud && DP.cloud.sb;
  const online = () => !!(DP.cloud && DP.cloud.online && DP.cloud.uid());
  // recherche « contient » : %, _ et \ du pseudo sont pris tels quels
  const likeEsc = (q) => q.replace(/[%_\\]/g, (c) => '\\' + c);
  const missing = (e) => e && /relation|does not exist|schema cache|not find/i.test(e.message || '');

  /* ---------- Données ---------- */
  async function names(ids) {
    const need = [...new Set(ids)].filter((id) => id && !S.names[id]);
    if (need.length) {
      const { data } = await sb().from('profiles').select('id, username').in('id', need);
      (data || []).forEach((p) => (S.names[p.id] = p.username));
    }
  }
  async function loadFriends() {
    const { data, error } = await sb().from('friendships').select('*').order('created_at', { ascending: false });
    if (error) { if (missing(error)) S.available = false; return; }
    await names(data.flatMap((f) => [f.requester, f.addressee]));
    S.friends = data.map((f) => {
      const other = f.requester === S.uid ? f.addressee : f.requester;
      return { id: f.id, other, name: S.names[other] || '?', status: f.status, mine: f.requester === S.uid, created: f.created_at };
    });
    emit('friends');
  }
  async function loadNotifs() {
    const { data, error } = await sb().from('notifications').select('*').order('created_at', { ascending: false }).limit(40);
    if (error) { if (missing(error)) S.available = false; return; }
    S.notifs = data;
    emit('notifs');
  }
  const unread = () => S.notifs.filter((n) => !n.read).length;
  const relation = (userId) => S.friends.find((f) => f.other === userId);

  async function start() {
    if (!online() || S.uid === DP.cloud.uid()) return;
    S.uid = DP.cloud.uid(); S.available = true;
    await Promise.all([loadFriends(), loadNotifs()]);
    if (!S.available) { emit('notifs'); return; }
    if (S.channel) sb().removeChannel(S.channel);
    S.channel = sb().channel('social-' + S.uid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${S.uid}` }, (p) => {
        S.notifs.unshift(p.new);
        emit('notifs');
        if (p.new.kind === 'renamed' && p.new.payload && p.new.payload.new) { DP.cloud.renamed(p.new.payload.new); return; }
        ui.toast(textOf(p.new).replace(/<[^>]+>/g, ''), 'win', 4200);
        sound.play('coin');
        if (/^friend_/.test(p.new.kind)) loadFriends();
        // duel réglé / refusé par l'ami : le solde et l'inventaire ont changé côté serveur
        if ((p.new.kind === 'duel_result' || p.new.kind === 'duel_declined' || p.new.kind === 'admin') && DP.engine && DP.engine.on) DP.engine.refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => loadFriends())
      .subscribe();
  }
  function stop() {
    if (S.channel && sb()) sb().removeChannel(S.channel);
    Object.assign(S, { uid: null, friends: [], notifs: [], channel: null });
    emit('notifs'); emit('friends');
  }
  on('session', start);
  on('auth', () => (auth.current() ? setTimeout(start, 300) : stop()));
  on('cloudload', () => setTimeout(start, 300));

  /* ---------- Actions ---------- */
  const act = async (p) => { const { error } = await p; if (error) { ui.toast(missing(error) ? 'Le script supabase/social.sql n’a pas encore été exécuté.' : 'Erreur : ' + error.message, 'error'); return false; } return true; };
  const social = {
    available: () => online() && S.available,
    friends: () => S.friends,
    notifs: () => S.notifs,
    unread,
    relation,
    async search(q) {
      q = q.trim();
      if (q.length < 1) return [];
      let r = await sb().from('profiles').select('id, username, banned').ilike('username', `%${likeEsc(q)}%`).limit(12);
      if (r.error) r = await sb().from('profiles').select('id, username').ilike('username', `%${likeEsc(q)}%`).limit(12);
      return (r.data || []).filter((p) => p.id !== S.uid && !p.banned);
    },
    async request(userId) { if (await act(sb().from('friendships').insert({ requester: S.uid, addressee: userId }))) { sound.play('chip'); ui.toast('Demande d’ami envoyée', 'win'); await loadFriends(); } },
    async accept(fid) { if (await act(sb().from('friendships').update({ status: 'accepted' }).eq('id', fid))) { sound.play('win'); await Promise.all([loadFriends(), loadNotifs()]); } },
    async remove(fid) { if (await act(sb().from('friendships').delete().eq('id', fid))) { sound.play('click'); await loadFriends(); } },
    /** Un duel (avec le pseudo de l'adversaire), ou null. */
    async duel(id) {
      const { data } = await sb().from('duels').select('*').eq('id', id).maybeSingle();
      if (!data || data.status !== 'done') return null;
      const other = data.challenger === S.uid ? data.opponent : data.challenger;
      await names([other]);
      return { ...data, otherName: S.names[other] || 'Ton ami' };
    },
    async duels() {
      const { data } = await sb().from('duels').select('*').order('created_at', { ascending: false }).limit(20);
      await names((data || []).flatMap((d) => [d.challenger, d.opponent]));
      return (data || []).map((d) => ({ ...d, mine: d.challenger === S.uid, other: S.names[d.challenger === S.uid ? d.opponent : d.challenger] || '?' }));
    },
    async duelAccept(id) {
      const r = await DP.engine.call('duel_accept', { p_id: id });
      if (!r) return false;
      await loadNotifs();
      location.hash = '#/duel/' + id;
      return true;
    },
    async duelDecline(id) {
      const r = await DP.engine.call('duel_decline', { p_id: id });
      if (r) { sound.play('click'); DP.engine.refresh(); }
      return !!r;
    },
    async readAll() { if (!unread()) return; await sb().from('notifications').update({ read: true }).eq('user_id', S.uid).eq('read', false); S.notifs.forEach((n) => (n.read = true)); emit('notifs'); },
    async clear() { await sb().from('notifications').delete().eq('user_id', S.uid); S.notifs = []; emit('notifs'); }
  };
  DP.social = social;

  /* ---------- Textes des notifications ---------- */
  const who = (n) => `<b>${esc(n.from_name || 'Quelqu’un')}</b>`;
  function textOf(n) {
    const p = n.payload || {};
    if (n.kind === 'friend_request') return `${who(n)} veut devenir ton ami`;
    if (n.kind === 'friend_accept') return `${who(n)} a accepté ta demande d’ami`;
    if (n.kind === 'friend_win') { const g = games.find(p.game); return p.game === 'jackpot' ? `Ton ami ${who(n)} a remporté le JACKPOT : ${fmt(p.amount)} !` : `Ton ami ${who(n)} gagne +${fmt(p.amount)} sur ${g ? g.name : esc(p.game)}`; }
    if (n.kind === 'admin') return 'Un admin a modifié ton compte';
    if (n.kind === 'duel') return `${who(n)} te défie en battle de caisses : ${esc(DP.progress.caseName(p.case))}, ${p.rounds} manche${p.rounds > 1 ? 's' : ''}, mise <b class="num">${fmt(p.cost)}</b>`;
    if (n.kind === 'duel_result') return `Duel contre ${who(n)} : ${p.result === 'win' ? '<b class="pos">gagné</b> !' : p.result === 'tie' ? 'égalité' : '<b class="neg">perdu</b>'}`;
    if (n.kind === 'duel_declined') return `${who(n)} a refusé ton défi (mise rendue)`;
    if (n.kind === 'renamed') return `Un admin t’a renommé : <b>${esc((n.payload || {}).old || '')}</b> → <b>${esc((n.payload || {}).new || '')}</b>`;
    return esc(n.kind);
  }
  const iconOf = (k) => ({ friend_request: 'user-plus', friend_accept: 'user-check', friend_win: 'trophy', admin: 'shield', duel: 'swords', duel_result: 'swords', duel_declined: 'swords' }[k] || 'bell');
  const ago = (t) => { const m = Math.round((Date.now() - new Date(t)) / 60000); return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };

  /* ---------- Cloche ---------- */
  function bell(btn) {
    let pop = null;
    const paint = () => {
      if (!btn.isConnected) return;
      btn.hidden = !social.available();
      const n = unread();
      btn.innerHTML = `${I('bell')}${n ? `<span class="bell__n num">${n > 9 ? '9+' : n}</span>` : ''}`;
      btn.classList.toggle('has-new', n > 0);
      if (pop) pop.innerHTML = panel();
    };
    const panel = () => {
      const list = S.notifs;
      return `<header><b>Notifications</b>${list.length ? '<button type="button" class="linkbtn js-nclear">Tout effacer</button>' : ''}</header>
        <div class="npop__list">${list.length ? list.map((n) => {
          const f = n.kind === 'friend_request' ? S.friends.find((x) => x.other === n.from_user && x.status === 'pending' && !x.mine) : null;
          return `<div class="nitem ${n.read ? '' : 'new'}"><span class="nitem__ico k-${n.kind}">${I(iconOf(n.kind), 'i--sm')}</span>
            <div class="nitem__body"><p>${textOf(n)}</p><small>${ago(n.created_at)}</small>
            ${f ? `<div class="nitem__act"><button type="button" class="btn btn--primary btn--sm js-nacc" data-f="${f.id}">Accepter</button><button type="button" class="btn btn--ghost btn--sm js-nref" data-f="${f.id}">Refuser</button></div>` : ''}
            ${n.kind === 'duel' && !n.read ? `<div class="nitem__act"><button type="button" class="btn btn--primary btn--sm js-dacc" data-d="${n.payload.duel}">Accepter le duel</button><button type="button" class="btn btn--ghost btn--sm js-dref" data-d="${n.payload.duel}">Refuser</button></div>` : ''}
            ${n.kind === 'duel_result' ? `<div class="nitem__act"><a class="btn btn--primary btn--sm" href="#/duel/${n.payload.duel}">Revoir le duel</a></div>` : ''}
            ${n.from_user && n.kind !== 'admin' ? `<a class="nitem__link" href="#/joueur/${encodeURIComponent(n.from_name || '')}">Voir le profil</a>` : ''}</div></div>`;
        }).join('') : `<div class="npop__empty">${I('bell', 'i--lg')}<span>Aucune notification</span></div>`}</div>
        <footer><a href="#/amis" class="linkbtn">${I('users', 'i--sm')}Mes amis</a></footer>`;
    };
    const close = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('pointerdown', outside, true); } };
    const outside = (e) => { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(); };
    btn.addEventListener('click', () => {
      if (pop) return close();
      pop = document.createElement('div');
      pop.className = 'npop';
      pop.innerHTML = panel();
      document.body.appendChild(pop);
      const r = btn.getBoundingClientRect();
      pop.style.top = r.bottom + 10 + 'px';
      pop.style.right = Math.max(8, innerWidth - r.right - 60) + 'px';
      document.addEventListener('pointerdown', outside, true);
      sound.play('click');
      setTimeout(() => social.readAll(), 1500);
      pop.addEventListener('click', async (e) => {
        const a = e.target.closest('.js-nacc'), r2 = e.target.closest('.js-nref');
        if (a) { await social.accept(+a.dataset.f); return; }
        const da = e.target.closest('.js-dacc'), dr = e.target.closest('.js-dref');
        if (da) { da.disabled = true; const ok = await social.duelAccept(+da.dataset.d); if (ok) close(); return; }
        if (dr) { dr.disabled = true; await social.duelDecline(+dr.dataset.d); await loadNotifs(); return; }
        if (r2) { await social.remove(+r2.dataset.f); paint(); return; }
        if (e.target.closest('.js-nclear')) { await social.clear(); return; }
        if (e.target.closest('a')) close();
      });
    });
    on('notifs', paint);
    on('friends', paint);
    paint();
  }

  /* ---------- Bouton d'ami (profil public, recherche) ---------- */
  function friendBtnHtml(userId) {
    const r = relation(userId);
    if (!r) return `<button type="button" class="btn btn--primary btn--sm js-fadd" data-u="${userId}">${I('user-plus', 'i--sm')}Ajouter en ami</button>`;
    if (r.status === 'accepted') return `<button type="button" class="btn btn--ghost btn--sm js-frem" data-f="${r.id}">${I('user-check', 'i--sm')}Ami · retirer</button>`;
    if (r.mine) return `<button type="button" class="btn btn--ghost btn--sm js-frem" data-f="${r.id}">Demande envoyée · annuler</button>`;
    return `<button type="button" class="btn btn--primary btn--sm js-facc" data-f="${r.id}">${I('user-check', 'i--sm')}Accepter la demande</button>`;
  }
  /** Gère les clics sur les boutons d'ami dans un conteneur. */
  function bindFriendButtons(root, after) {
    root.addEventListener('click', async (e) => {
      const add = e.target.closest('.js-fadd'), acc = e.target.closest('.js-facc'), rem = e.target.closest('.js-frem');
      if (add) { add.disabled = true; await social.request(add.dataset.u); after && after(); }
      else if (acc) { acc.disabled = true; await social.accept(+acc.dataset.f); after && after(); }
      else if (rem) {
        if (!ui.confirmClick(rem, rem.textContent.includes('annuler') ? 'Annuler la demande' : 'Retirer cet ami')) return;
        rem.disabled = true; await social.remove(+rem.dataset.f); after && after();
      }
    });
  }

  /* ---------- Page Amis ---------- */
  function render(view) {
    let results = [], q = '', timer = 0;
    view.innerHTML = `
      <div class="page-head" data-reveal><span class="game-head__ico">${I('users', 'i--lg')}</span>
        <div><h1>Amis</h1><p>Ajoute tes potes, suis leurs gros gains et compare vos profils.</p></div></div>
      <div class="js-fbody"></div>`;
    const body = view.querySelector('.js-fbody');
    const row = (id, name, right) => `<div class="frow"><a class="plink" href="#/joueur/${encodeURIComponent(name)}">${DP.profile.avatarHtml(name)}<b>${esc(name)}</b></a><div class="frow__act">${right}</div></div>`;
    const paint = () => {
      if (!online()) { body.innerHTML = `<div class="empty">${I('users', 'i--lg')}<strong>Disponible en ligne</strong>Les amis fonctionnent sur le site en ligne, avec un compte connecté.</div>`; return; }
      if (!S.available) { body.innerHTML = `<div class="empty">${I('users', 'i--lg')}<strong>Bientôt disponible</strong>Le script supabase/social.sql n’a pas encore été exécuté dans Supabase.</div>`; return; }
      const incoming = S.friends.filter((f) => f.status === 'pending' && !f.mine);
      const outgoing = S.friends.filter((f) => f.status === 'pending' && f.mine);
      const friends = S.friends.filter((f) => f.status === 'accepted');
      body.innerHTML = `
        <section class="fpanel" data-reveal>
          <header><h2>${I('search', 'i--sm')}Rechercher un joueur</h2></header>
          <label class="fsearch">${I('search', 'i--sm')}<input class="js-fq" placeholder="Tape un pseudo…" autocomplete="off" spellcheck="false" value="${esc(q)}"></label>
          <div class="flist js-fres">${q ? (results.length ? results.map((p) => row(p.id, p.username, friendBtnHtml(p.id))).join('') : '<p class="muted">Aucun joueur trouvé.</p>') : ''}</div>
        </section>
        ${incoming.length ? `<section class="fpanel" data-reveal><header><h2>Demandes reçues <span class="nav-tag">${incoming.length}</span></h2></header><div class="flist">${incoming.map((f) => row(f.other, f.name, `<button type="button" class="btn btn--primary btn--sm js-facc" data-f="${f.id}">Accepter</button><button type="button" class="btn btn--ghost btn--sm js-frem" data-f="${f.id}">Refuser · annuler</button>`)).join('')}</div></section>` : ''}
        <section class="fpanel" data-reveal><header><h2>Mes amis <small class="num">${friends.length}</small></h2></header>
          <div class="flist">${friends.length ? friends.map((f) => row(f.other, f.name, `${DP.engine && DP.engine.on ? `<button type="button" class="btn btn--primary btn--sm js-defy" data-u="${f.other}">${I('swords', 'i--sm')}Défier</button>` : ''}<a class="btn btn--ghost btn--sm" href="#/joueur/${encodeURIComponent(f.name)}">Profil</a>${friendBtnHtml(f.other)}`)).join('') : '<p class="muted">Pas encore d’amis. Recherche un pseudo pour envoyer une demande.</p>'}</div></section>
        <section class="fpanel js-duels" data-reveal><header><h2>${I('swords', 'i--sm')}Duels de caisses</h2></header><p class="muted">Chargement…</p></section>
        ${outgoing.length ? `<section class="fpanel" data-reveal><header><h2>Demandes envoyées</h2></header><div class="flist">${outgoing.map((f) => row(f.other, f.name, friendBtnHtml(f.other))).join('')}</div></section>` : ''}`;
      const inp = body.querySelector('.js-fq');
      if (inp && document.activeElement !== inp && q) { inp.focus(); inp.setSelectionRange(q.length, q.length); }
    };
    body.addEventListener('input', (e) => {
      const inp = e.target.closest('.js-fq');
      if (!inp) return;
      q = inp.value;
      clearTimeout(timer);
      timer = setTimeout(async () => { results = await social.search(q); const box = body.querySelector('.js-fres'); if (box) box.innerHTML = q ? (results.length ? results.map((p) => row(p.id, p.username, friendBtnHtml(p.id))).join('') : '<p class="muted">Aucun joueur trouvé.</p>') : ''; }, 250);
    });
    bindFriendButtons(body, () => {});
    body.addEventListener('click', async (e) => {
      const df = e.target.closest('.js-defy');
      if (df) { try { sessionStorage.setItem('dp_duel_target', df.dataset.u); } catch { /* ignore */ } location.hash = '#/caisses'; return; }
      const da = e.target.closest('.js-dacc'), dr = e.target.closest('.js-dref');
      if (da) { da.disabled = true; await social.duelAccept(+da.dataset.d); return; }
      if (dr) { if (!ui.confirmClick(dr, dr.dataset.mine ? 'Annuler le défi' : 'Refuser le défi')) return; dr.disabled = true; await social.duelDecline(+dr.dataset.d); paintDuels(); }
    });
    async function paintDuels() {
      const box = body.querySelector('.js-duels');
      if (!box || !online() || !S.available) return;
      let list = [];
      try { list = await social.duels(); } catch { list = null; }
      if (!box.isConnected) return;
      if (list === null) { box.innerHTML = '<header><h2>Duels de caisses</h2></header><p class="muted">Le script supabase/duels.sql n’a pas encore été exécuté.</p>'; return; }
      const lbl = (d) => `${esc(DP.progress.caseName(d.case_id))} · ${d.rounds} manche${d.rounds > 1 ? 's' : ''} · mise <b class="num">${fmt(d.cost)}</b>`;
      const res = (d) => d.status !== 'done' ? { pending: 'En attente', declined: 'Refusé', cancelled: 'Annulé', expired: 'Expiré' }[d.status]
        : !d.winner ? 'Égalité' : (d.winner === S.uid ? '<b class="pos">Gagné</b>' : '<b class="neg">Perdu</b>');
      box.innerHTML = `<header><h2>${I('swords', 'i--sm')}Duels de caisses</h2><span class="muted">Défie un ami avec le bouton « Défier »</span></header>
        <div class="flist">${list.length ? list.map((d) => `<div class="frow"><div class="dduel"><b>${d.mine ? 'Toi → ' + esc(d.other) : esc(d.other) + ' → toi'}</b><small>${lbl(d)}</small></div>
          <div class="frow__act"><span class="dduel__res">${res(d)}</span>
          ${d.status === 'pending' && !d.mine ? `<button type="button" class="btn btn--primary btn--sm js-dacc" data-d="${d.id}">Accepter</button><button type="button" class="btn btn--ghost btn--sm js-dref" data-d="${d.id}">Refuser</button>` : ''}
          ${d.status === 'pending' && d.mine ? `<button type="button" class="btn btn--ghost btn--sm js-dref" data-mine="1" data-d="${d.id}">Annuler</button>` : ''}
          ${d.status === 'done' ? `<a class="btn btn--ghost btn--sm" href="#/duel/${d.id}">Revoir</a>` : ''}</div></div>`).join('') : '<p class="muted">Aucun duel pour l’instant.</p>'}</div>`;
    }
    const offNotifDuel = on('notifs', () => paintDuels());
    const off1 = on('friends', () => { const f = document.activeElement; const keep = f && f.classList.contains('js-fq'); paint(); paintDuels(); if (keep) { const i = body.querySelector('.js-fq'); i.focus(); i.setSelectionRange(q.length, q.length); } });
    paint();
    paintDuels();
    DP_MOTION.reveal(view, '[data-reveal]');
    if (online()) start().then(() => { paint(); paintDuels(); });
    return () => { clearTimeout(timer); off1(); offNotifDuel(); };
  }

  Object.assign(social, { bell, render, friendBtnHtml, bindFriendButtons });
})();
