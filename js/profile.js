/* Profil : photo, bannière, titre (gagné grâce aux succès et aux rangs), bio et vitrine de cartes.
 * Stocké par compte dans dp_profile_<pseudo>. Les images importées sont réduites avant d'être gardées.
 */
(() => {
  const { auth, stats, store, ui, sound, cards, inventory, fmt, esc, on, emit, IMG } = DP;
  const I = ui.icon;
  const key = (name) => 'dp_profile_' + name;
  const BLANK = () => ({ avatar: null, banner: { type: 'preset', id: 'orbite' }, title: 'new', bio: '', showcase: [], namefx: null, frame: null });
  // les autres joueurs : profils récupérés du serveur (version en ligne)
  const others = () => (DP.cloud && DP.cloud.online && DP.cloud.profiles ? DP.cloud.profiles() : {});
  // un profil venu d'ailleurs peut être mal formé : on garde seulement des champs du bon type
  const norm = (p) => {
    const b = BLANK(), o = Object.assign(b, p && typeof p === 'object' && !Array.isArray(p) ? p : {});
    if (o.avatar !== null && (typeof o.avatar !== 'object' || Array.isArray(o.avatar))) o.avatar = null;
    if (!o.banner || typeof o.banner !== 'object' || Array.isArray(o.banner)) o.banner = BLANK().banner;
    if (typeof o.title !== 'string') o.title = 'new';
    if (typeof o.bio !== 'string') o.bio = '';
    o.showcase = Array.isArray(o.showcase) ? o.showcase.filter((k) => typeof k === 'string').slice(0, 3) : [];
    if (typeof o.namefx !== 'string') o.namefx = null;
    if (typeof o.frame !== 'string') o.frame = null;
    return o;
  };
  const get = (name = auth.current()) => {
    if (name !== auth.current() && others()[name.toLowerCase()]) return norm(others()[name.toLowerCase()]);
    return norm(store.json(key(name), {}));
  };
  /** Lien vers le profil public d'un joueur. */
  const link = (name, inner, cls = '') => `<a class="plink ${cls}" href="#/joueur/${encodeURIComponent(name)}">${inner}</a>`;
  function set(patch) {
    const p = Object.assign(get(), patch);
    try { localStorage.setItem(key(auth.current()), JSON.stringify(p)); }
    catch { ui.toast('Image trop lourde pour être enregistrée.', 'error'); return false; }
    emit('profile', p);
    return true;
  }

  /* ---------- Bannières : à débloquer ---------- */
  const level = () => (DP.progress && DP.progress.summary() ? DP.progress.summary().level : 1);
  const hasAch = (id) => !!(DP.progress && DP.progress.achievements().find((a) => a.id === id && a.got));
  const BANNERS = [
    { id: 'orbite', name: 'Orbite', req: 'Débloquée', ok: () => true },
    { id: 'grid', name: 'Table de jeu', req: 'Termine une mission', ok: () => hasAch('mis1') },
    { id: 'nebula', name: 'Nébuleuse', req: 'Niveau 5', ok: () => level() >= 5 },
    { id: 'neon', name: 'Néon', req: 'Fusionne une carte brillante', ok: () => hasAch('shiny1') },
    { id: 'gold', name: 'Or royal', req: 'Rang Or (niveau 20)', ok: () => level() >= 20 },
    { id: 'jackpot', name: 'Jackpot', req: 'Remporte le jackpot', ok: () => hasAch('jackpot') },
    { id: 'diamond', name: 'Diamant', req: 'Rang Diamant (niveau 50)', ok: () => level() >= 50 },
    { id: 'jpz', name: 'Couronne JPZ', req: 'Rang JPZ (niveau 90)', ok: () => level() >= 90 }
  ];

  /* ---------- Effets de pseudo : débloqués par les succès (le serveur vérifie aussi, voir supabase/namefx.sql) ---------- */
  const NAME_FX = [
    { id: 'sunset', name: 'Coucher de soleil', ach: 'wag1000' },
    { id: 'ocean', name: 'Océan', ach: 'mult10' },
    { id: 'violet', name: 'Néon violet', ach: 'lvl10' },
    { id: 'mint', name: 'Menthe glacée', ach: 'day1' },
    { id: 'fire', name: 'Flammes', ach: 'play1000' },
    { id: 'gold', name: 'Or royal', ach: 'win5000' },
    { id: 'glitch', name: 'Glitch', ach: 'shiny5' },
    { id: 'rainbow', name: 'Arc-en-ciel', ach: 'wag100000' },
    { id: 'galaxy', name: 'Galaxie', ach: 'mult100' },
    { id: 'diamond', name: 'Diamant', ach: 'bal100000' },
    { id: 'jpz', name: 'Couronne JPZ', ach: 'jackpot' }
  ];
  // cadres animés autour de la photo
  const AVATAR_FX = [
    { id: 'neon', name: 'Néon orange', ach: 'play50' },
    { id: 'ice', name: 'Glace', ach: 'uniq10' },
    { id: 'aura', name: 'Aura violette', ach: 'lvl10' },
    { id: 'fire', name: 'Anneau de feu', ach: 'play1000' },
    { id: 'gold', name: 'Or tournant', ach: 'bal10000' },
    { id: 'glitch', name: 'Glitch', ach: 'shiny5' },
    { id: 'rainbow', name: 'Arc-en-ciel', ach: 'wag100000' },
    { id: 'galaxy', name: 'Galaxie', ach: 'mult100' },
    { id: 'diamond', name: 'Diamant', ach: 'bal100000' },
    { id: 'jpz', name: 'Couronne JPZ', ach: 'jackpot' }
  ];
  const fxHow = (f) => { const a = DP.progress && DP.progress.achievements().find((x) => x.id === f.ach); return a ? `${a.name} : ${a.desc}` : 'Succès à débloquer'; };
  /** Pseudo avec son effet. Pour les autres joueurs, l'effet est déjà vérifié par le serveur. */
  function nameHtml(name) {
    const p = get(name);
    const fx = NAME_FX.find((f) => f.id === p.namefx && (name !== auth.current() || hasAch(f.ach)));
    return fx ? `<span class="nfx nfx--${fx.id}" data-t="${esc(name)}">${esc(name)}</span>` : esc(name);
  }

  /* ---------- Titres : succès débloqués + rangs atteints ---------- */
  function titles() {
    const list = [{ id: 'new', name: 'Nouveau venu', tier: 0, got: true, how: 'Par défaut' }];
    const sm = DP.progress && DP.progress.summary();
    (DP.progress ? DP.progress.RANKS : []).forEach((r) => list.push({ id: 'rank_' + r.name, name: 'Rang ' + r.name, color: r.c, tier: 0, got: sm && sm.level >= r.from, how: `Atteins le niveau ${r.from}` }));
    (DP.progress ? DP.progress.achievements() : []).forEach((a) => list.push({ id: 'ach_' + a.id, name: a.name, tier: a.tier, got: !!a.got, how: a.desc }));
    return list;
  }
  const titleOf = (id) => titles().find((t) => t.id === id && t.got) || titles()[0];
  const titleHtml = (t) => `<span class="ptitle t${t.tier}" ${t.color ? `style="--tc:${t.color}"` : ''}>${esc(t.name)}</span>`;

  /* ---------- Avatar ---------- */
  // les profils des autres joueurs viennent du serveur : une image importée n'est acceptée que sous forme
  // de data URI d'image en base64 (sinon, n'importe qui pourrait glisser du HTML ou du JavaScript dans la page)
  const IMG_DATA = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
  const safeImg = (s) => (typeof s === 'string' && IMG_DATA.test(s) ? s : null);
  function avatarHtml(name = auth.current(), cls = 'avatar', frameId) {
    const p = get(name);
    const src = p.avatar && (p.avatar.type === 'upload' ? safeImg(p.avatar.data) : p.avatar.type === 'card' && cards.byId[p.avatar.id] ? IMG + cards.byId[p.avatar.id].img : null);
    const inner = src ? `<img src="${esc(src)}" alt="">` : esc(String(name).charAt(0).toUpperCase());
    // cadre animé (pour les autres joueurs, déjà vérifié par le serveur ; frameId force un aperçu)
    const fid = frameId !== undefined ? frameId : p.frame;
    const fx = fid && AVATAR_FX.find((f) => f.id === fid && (frameId !== undefined || name !== auth.current() || hasAch(f.ach)));
    if (fx) return `<span class="${cls} afx afx--${fx.id}${src ? ' afx--img' : ''}"><span class="afx__in">${inner}</span></span>`;
    return src ? `<span class="${cls} avatar--img">${inner}</span>` : `<span class="${cls}">${inner}</span>`;
  }
  function bannerStyle(p) {
    const b = p.banner || { type: 'preset', id: 'orbite' };
    if (b.type === 'upload') return safeImg(b.data) ? `background-image:url(${b.data})` : '';
    if (b.type === 'card' && cards.byId[b.id]) return `background-image:url(${IMG}${cards.byId[b.id].img})`;
    return '';
  }
  const bannerClass = (p, trusted = false) => { const b = p.banner || {}; return b.type === 'upload' ? 'pb--upload' : b.type === 'card' ? 'pb--card' : 'pb--' + (BANNERS.find((x) => x.id === b.id && (trusted || x.ok())) ? b.id : 'orbite'); };
  /** Titre d'un autre joueur : affiché seulement s'il l'a vraiment débloqué (son niveau / ses succès), sinon « Nouveau venu ». */
  function titleById(id, level = 0, ach = {}) {
    if (id && id.startsWith('rank_') && DP.progress) { const r = DP.progress.RANKS.find((x) => 'rank_' + x.name === id); if (r && level >= r.from) return { name: 'Rang ' + r.name, color: r.c, tier: 0 }; }
    if (id && id.startsWith('ach_') && DP.progress) { const a = DP.progress.achievements().find((x) => 'ach_' + x.id === id); if (a && ach && ach[a.id]) return { name: a.name, tier: a.tier }; }
    return { name: 'Nouveau venu', tier: 0 };
  }
  // bannières à débloquer : même règle pour les autres joueurs (niveau / succès réels)
  const BANNER_NEED = { grid: { ach: 'mis1' }, nebula: { lvl: 5 }, neon: { ach: 'shiny1' }, gold: { lvl: 20 }, jackpot: { ach: 'jackpot' }, diamond: { lvl: 50 }, jpz: { lvl: 90 } };
  const bannerOkFor = (id, level, ach) => { const n = BANNER_NEED[id]; return !n || (n.lvl ? level >= n.lvl : !!(ach && ach[n.ach])); };

  /* ---------- Profil public d'un autre joueur ---------- */
  function renderPublic(view, name) {
    let alive = true;
    if (DP.guilds) DP.guilds.loadTags();
    view.innerHTML = `<div class="empty">${I('user', 'i--lg')}<strong>Chargement du profil…</strong></div>`;
    const parse = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
    const show = (pl) => {
      if (!alive) return;
      if (!pl) { view.innerHTML = `<div class="empty">${I('users', 'i--lg')}<strong>Joueur introuvable</strong>Aucun joueur ne s’appelle « ${esc(name)} ».<a class="btn btn--primary" style="margin-top:10px" href="#/classement">Voir le classement</a></div>`; return; }
      const d = pl.data || {};
      const p = norm(parse(d.dp_profile_, {}));
      const s = Object.assign({ played: 0, biggestWin: 0, biggestMult: 0, wagered: 0 }, parse(d.dp_stats_, {}));
      const prog = Object.assign({ xp: 0, ach: {} }, parse(d.dp_prog_, {}));
      const inv = Object.assign({ cards: {}, shiny: {} }, parse(d.dp_inv_, {}));
      const info = DP.progress.levelInfo(prog.xp || 0);
      const achs = DP.progress.achievements();
      const got = achs.filter((a) => prog.ach[a.id]).map((a) => ({ ...a, got: prog.ach[a.id] }));
      const uniq = new Set([...Object.keys(inv.cards || {}), ...Object.keys(inv.shiny || {})].filter((id) => cards.byId[id])).size;
      const showcase = (p.showcase || []).map((k) => { const [id, sh] = k.split('|'); return cards.byId[id] && ((sh === '1' ? inv.shiny : inv.cards) || {})[id] ? { card: cards.byId[id], shiny: sh === '1' } : null; }).filter(Boolean);
      const t = titleById(p.title, info.level, prog.ach);
      view.innerHTML = `
        <section class="pcard" style="--rc:${info.rank.c}">
          <div class="pbanner ${bannerClass(p.banner && p.banner.type === 'preset' && !bannerOkFor(p.banner.id, info.level, prog.ach) ? { banner: { type: 'preset', id: 'orbite' } } : p, true)}" style="${bannerStyle(p)}"><span class="pbanner__fx"></span></div>
          <div class="pcard__body">
            <div class="pcard__avatar">${avatarHtml(pl.name, 'avatar avatar--xl')}<span class="pcard__lvl">${DP.progress.badge(info.level, 44)}</span></div>
            <div class="pcard__id">
              <h1>${nameHtml(pl.name)}</h1>
              <div class="pcard__tags">${DP.guilds ? DP.guilds.tagHtml(pl.name, true) : ''}${titleHtml(t)}<span class="prank">Rang ${info.rank.name} · niveau ${info.level}</span></div>
              ${p.bio ? `<p class="pcard__bio">${esc(p.bio)}</p>` : ''}
            </div>
            <div class="pcard__actions"><span class="js-pfriend">${DP.social && DP.social.available() ? DP.social.friendBtnHtml(pl.id) : ''}</span><a class="btn btn--ghost" href="#/classement">${I('trophy', 'i--sm')}Classement</a></div>
          </div>
          <div class="pstats">
            <div><span>Solde</span><b class="num">${fmt(+pl.balance || 0)}</b></div>
            <div><span>Parties</span><b class="num">${fmt(s.played)}</b></div>
            <div><span>Plus gros gain</span><b class="num">${s.biggestWin ? '+' + fmt(s.biggestWin) : '—'}</b></div>
            <div><span>Collection</span><b class="num">${uniq} / ${Object.keys(cards.byId).length}</b></div>
          </div>
        </section>
        <div class="pgrid">
          <section class="ppanel"><header><h2>Vitrine</h2><span>${showcase.length} / 3</span></header>
            ${showcase.length ? `<div class="pshow">${showcase.map((x) => `<div>${cards.html(x.card, { shiny: x.shiny })}</div>`).join('')}</div>` : `<div class="empty">${I('layers-2', 'i--lg')}<strong>Vitrine vide</strong>${esc(pl.name)} n’expose encore aucune carte.</div>`}
          </section>
          <section class="ppanel"><header><h2>Succès</h2><span>${got.length} / ${achs.length}</span></header>
            ${got.length ? `<ul class="plast">${got.sort((a, b) => b.got - a.got).slice(0, 6).map((a) => `<li class="t${a.tier}"><span class="plast__ico">${I(a.icon, 'i--sm')}</span><b>${esc(a.name)}</b><small>${new Date(a.got).toLocaleDateString('fr-FR')}</small></li>`).join('')}</ul>` : '<p class="muted">Aucun succès pour l’instant.</p>'}
          </section>
        </div>`;
      DP_MOTION.tilt(view.querySelectorAll('.pshow .tcard'), 12);
      DP_MOTION.reveal(view, '.pcard, .ppanel');
      if (DP.social && DP.social.available()) {
        const slotEl = view.querySelector('.js-pfriend');
        const repaint = () => { if (slotEl.isConnected) slotEl.innerHTML = DP.social.friendBtnHtml(pl.id); };
        DP.social.bindFriendButtons(slotEl, repaint);
        offFriends = DP.on('friends', repaint);
      }
    };
    let offFriends = null;
    if (!(DP.cloud && DP.cloud.online)) { show(null); return () => {}; }
    DP.cloud.player(name).then(show).catch(() => show(null));
    return () => { alive = false; if (offFriends) offFriends(); };
  }

  /** Réduit une image importée (recadrage centré) et renvoie un JPEG en data URL. */
  function shrink(file, w, h) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('type'));
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const k = Math.max(w / img.width, h / img.height), sw = w / k, sh = h / k;
        c.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /* ---------- Page Profil ---------- */
  function render(view) {
    const name = auth.current();
    let tab = 'avatar', editing = false;
    const owned = () => inventory.entries().sort((a, b) => b.card.rarity.i - a.card.rarity.i || b.card.value - a.card.value);
    const uniqueCards = () => [...new Map(owned().map((x) => [x.card.id, x.card])).values()];

    function cardBlock() {
      const p = get(), sm = DP.progress.summary(), s = stats.get(), t = titleOf(p.title), inv = inventory.totals();
      const achs = DP.progress.achievements();
      const showcase = p.showcase.map((k) => { const [id, sh] = k.split('|'); return owned().find((x) => x.card.id === id && x.shiny === (sh === '1')); }).filter(Boolean);
      return `
        <section class="pcard" style="--rc:${sm.rank.c}">
          <div class="pbanner ${bannerClass(p)}" style="${bannerStyle(p)}"><span class="pbanner__fx"></span></div>
          <div class="pcard__body">
            <div class="pcard__avatar">${avatarHtml(name, 'avatar avatar--xl')}<span class="pcard__lvl">${DP.progress.badge(sm.level, 44)}</span></div>
            <div class="pcard__id">
              <h1>${nameHtml(name)}</h1>
              <div class="pcard__tags">${titleHtml(t)}<span class="prank">Rang ${sm.rank.name} · niveau ${sm.level}</span></div>
              ${p.bio ? `<p class="pcard__bio">${esc(p.bio)}</p>` : ''}
            </div>
            <button class="btn ${editing ? 'btn--primary' : 'btn--ghost'} js-edit" type="button">${I(editing ? 'check' : 'sparkles', 'i--sm')}${editing ? 'Terminer' : 'Modifier le profil'}</button>
          </div>
          <div class="pstats">
            <div><span>Parties</span><b class="num">${fmt(s.played)}</b></div>
            <div><span>Plus gros gain</span><b class="num">${s.biggestWin ? '+' + fmt(s.biggestWin) : '—'}</b></div>
            <div><span>Collection</span><b class="num">${inv.unique} / ${Object.keys(cards.byId).length}</b></div>
            <div><span>Succès</span><b class="num">${achs.filter((a) => a.got).length} / ${achs.length}</b></div>
          </div>
        </section>
        <div class="pgrid">
          <section class="ppanel"><header><h2>Vitrine</h2><span>${showcase.length} / 3</span></header>
            ${showcase.length ? `<div class="pshow">${showcase.map((x) => `<div>${cards.html(x.card, { shiny: x.shiny })}</div>`).join('')}</div>` : `<div class="empty">${I('layers-2', 'i--lg')}<strong>Vitrine vide</strong>Choisis tes 3 plus belles cartes dans « Modifier le profil ».</div>`}
          </section>
          <section class="ppanel"><header><h2>Derniers succès</h2><a href="#/progression">Tous${I('chevron-right', 'i--sm')}</a></header>
            ${(() => { const last = achs.filter((a) => a.got).sort((a, b) => b.got - a.got).slice(0, 6); return last.length ? `<ul class="plast">${last.map((a) => `<li class="t${a.tier}"><span class="plast__ico">${I(a.icon, 'i--sm')}</span><b>${esc(a.name)}</b><small>${new Date(a.got).toLocaleDateString('fr-FR')}</small></li>`).join('')}</ul>` : '<p class="muted">Aucun succès pour l’instant.</p>'; })()}
          </section>
        </div>`;
    }

    function editorBlock() {
      const p = get();
      const tabs = [['avatar', 'Photo'], ['banner', 'Bannière'], ['title', 'Titre'], ['namefx', 'Pseudo'], ['frame', 'Cadre'], ['showcase', 'Vitrine'], ['bio', 'Bio']];
      let body = '';
      if (tab === 'avatar') {
        body = `<div class="pedit__row">
            <label class="btn btn--primary">${I('plus', 'i--sm')}Importer une photo<input type="file" accept="image/*" class="js-upload" data-k="avatar" hidden></label>
            <button class="btn btn--ghost js-av-letter" type="button">Utiliser mon initiale</button>
          </div>
          <h4>Ou une photo de tes cartes</h4>
          <div class="ppick">${uniqueCards().map((c) => `<button type="button" class="ppick__av ${p.avatar && p.avatar.id === c.id ? 'on' : ''}" data-av="${c.id}" title="${esc(c.name)}"><img src="${IMG}${c.img}" alt=""></button>`).join('') || '<p class="muted">Ouvre des caisses pour débloquer des photos.</p>'}</div>`;
      } else if (tab === 'banner') {
        body = `<div class="pedit__row"><label class="btn btn--primary">${I('plus', 'i--sm')}Importer une bannière<input type="file" accept="image/*" class="js-upload" data-k="banner" hidden></label></div>
          <div class="pbanners">${BANNERS.map((b) => { const ok = b.ok(); const on = p.banner && p.banner.type === 'preset' && p.banner.id === b.id; return `<button type="button" class="pbanners__it ${on ? 'on' : ''}" data-bn="${b.id}" ${ok ? '' : 'disabled'}><span class="pbanner pb--${b.id}"><span class="pbanner__fx"></span></span><b>${b.name}</b><small>${ok ? (on ? 'Équipée' : 'Débloquée') : I('lock', 'i--sm') + b.req}</small></button>`; }).join('')}</div>
          <h4>Ou la photo d’une de tes cartes</h4>
          <div class="ppick">${uniqueCards().map((c) => `<button type="button" class="ppick__av ${p.banner && p.banner.type === 'card' && p.banner.id === c.id ? 'on' : ''}" data-bc="${c.id}"><img src="${IMG}${c.img}" alt=""></button>`).join('') || '<p class="muted">Aucune carte.</p>'}</div>`;
      } else if (tab === 'title') {
        const list = titles();
        body = `<p class="muted">Chaque succès débloqué et chaque rang atteint te donne un titre. ${list.filter((t) => t.got).length} / ${list.length} débloqués.</p>
          <div class="ptitles">${list.map((t) => `<button type="button" class="ptitles__it ${p.title === t.id ? 'on' : ''}" data-tt="${t.id}" ${t.got ? '' : 'disabled'} title="${esc(t.how)}">${titleHtml(t)}<small>${t.got ? (p.title === t.id ? 'Équipé' : '') : I('lock', 'i--sm') + esc(t.how)}</small></button>`).join('')}</div>`;
      } else if (tab === 'namefx') {
        const me = auth.current();
        body = `<p class="muted">Un effet sur ton pseudo, visible partout (classement, profil, gagnants, guildes…). Chaque effet se débloque avec un succès. ${NAME_FX.filter((f) => hasAch(f.ach)).length} / ${NAME_FX.length} débloqués.</p>
          <div class="pnamefx">
            <button type="button" class="pnamefx__it ${!p.namefx ? 'on' : ''}" data-nf=""><b>${esc(me)}</b><small>Classique</small></button>
            ${NAME_FX.map((f) => { const ok = hasAch(f.ach); return `<button type="button" class="pnamefx__it ${p.namefx === f.id ? 'on' : ''}" data-nf="${f.id}" ${ok ? '' : 'disabled'} title="${esc(fxHow(f))}"><b><span class="nfx nfx--${f.id}" data-t="${esc(me)}">${esc(me)}</span></b><small>${ok ? esc(f.name) + (p.namefx === f.id ? ' · équipé' : '') : I('lock', 'i--sm') + esc(fxHow(f))}</small></button>`; }).join('')}
          </div>`;
      } else if (tab === 'frame') {
        const me = auth.current();
        body = `<p class="muted">Un cadre animé autour de ta photo, visible partout. Chaque cadre se débloque avec un succès. ${AVATAR_FX.filter((f) => hasAch(f.ach)).length} / ${AVATAR_FX.length} débloqués.</p>
          <div class="pnamefx pframes">
            <button type="button" class="pnamefx__it ${!p.frame ? 'on' : ''}" data-fr="">${avatarHtml(me, 'avatar avatar--lg', null)}<small>Aucun cadre</small></button>
            ${AVATAR_FX.map((f) => { const ok = hasAch(f.ach); return `<button type="button" class="pnamefx__it ${p.frame === f.id ? 'on' : ''}" data-fr="${f.id}" ${ok ? '' : 'disabled'} title="${esc(fxHow(f))}">${avatarHtml(me, 'avatar avatar--lg', f.id)}<small>${ok ? esc(f.name) + (p.frame === f.id ? ' · équipé' : '') : I('lock', 'i--sm') + esc(fxHow(f))}</small></button>`; }).join('')}
          </div>`;
      } else if (tab === 'showcase') {
        body = `<p class="muted">Choisis jusqu’à 3 cartes à exposer. Clique à nouveau pour retirer.</p>
          <div class="ppick ppick--cards">${owned().map((x) => { const k = x.card.id + '|' + (x.shiny ? 1 : 0); const i = p.showcase.indexOf(k); return `<button type="button" class="ppick__card ${i >= 0 ? 'on' : ''}" data-sc="${k}">${cards.html(x.card, { compact: true, shiny: x.shiny })}${i >= 0 ? `<span class="ppick__n">${i + 1}</span>` : ''}</button>`; }).join('') || '<p class="muted">Ton inventaire est vide : la vitrine montre des cartes que tu possèdes. Ouvre des caisses (une carte vendue disparaît aussi de la vitrine).</p><a class="btn btn--primary btn--sm" href="#/caisses">Ouvrir des caisses</a>'}</div>`;
      } else {
        body = `<label class="field"><span>Ta bio (80 caractères)</span><input class="js-bio" maxlength="80" value="${esc(p.bio)}" placeholder="Ex. Je vise le jackpot."></label>`;
      }
      return `<section class="pedit">
        <div class="seg js-ptab">${tabs.map(([k, l]) => `<button type="button" data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="pedit__body">${body}</div></section>`;
    }

    const paint = () => {
      view.innerHTML = `<div class="js-pcard">${cardBlock()}</div><div class="js-pmail"></div><div class="js-pedit">${editing ? editorBlock() : ''}</div>`;
      DP_MOTION.tilt(view.querySelectorAll('.pshow .tcard'), 12);
      paintMail();
    };
    // adresse email du compte (récupération du mot de passe)
    async function paintMail() {
      const box = view.querySelector('.js-pmail');
      if (!box || !(DP.cloud && DP.cloud.online && DP.cloud.uid && DP.cloud.uid())) return;
      const m = await auth.myEmail();
      if (!m || !box.isConnected) return;
      const form = (ph, cta) => `<div class="pmail__form"><input class="js-mail" type="email" autocomplete="email" placeholder="${ph}"><button type="button" class="btn btn--primary btn--sm js-mailgo">${cta}</button></div>`;
      box.innerHTML = `<section class="pmail ${m.email ? '' : 'warn'}">
        <div class="pmail__txt"><b>${I(m.email ? 'check' : 'triangle-alert', 'i--sm')}Adresse email</b>
          ${m.pending ? `<span>Lien de confirmation envoyé à <b>${esc(m.pending)}</b> : clique dessus pour valider.</span>`
            : m.email ? `<span>${esc(m.email)} · sert à récupérer ton compte si tu oublies ton mot de passe.</span>`
            : '<span>Aucune adresse email : ajoute-la pour pouvoir récupérer ton compte si tu oublies ton mot de passe.</span>'}</div>
        ${m.email && !m.pending ? '<button type="button" class="btn btn--ghost btn--sm js-mailchg">Changer</button>' : form('toi@exemple.fr', m.pending ? 'Renvoyer' : 'Ajouter')}
      </section>`;
      const chg = box.querySelector('.js-mailchg');
      if (chg) chg.addEventListener('click', () => { chg.outerHTML = form('nouvelle@adresse.fr', 'Changer'); bindMail(); });
      bindMail();
      function bindMail() {
        const go = box.querySelector('.js-mailgo'); if (!go) return;
        go.addEventListener('click', async () => {
          const v = box.querySelector('.js-mail').value;
          go.disabled = true;
          const er = await auth.setEmail(v);
          go.disabled = false;
          if (er) { ui.toast(er, 'error', 5000); sound.play('error'); return; }
          ui.toast('Lien de confirmation envoyé : clique dessus dans ta boîte mail.', 'win', 6000); sound.play('coin');
          paintMail();
        });
      }
    }
    const repaintCard = () => { view.querySelector('.js-pcard').innerHTML = cardBlock(); };
    const repaintEdit = () => { view.querySelector('.js-pedit').innerHTML = editing ? editorBlock() : ''; };
    const changed = () => { sound.play('click'); repaintCard(); repaintEdit(); };

    view.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('.js-edit')) { editing = !editing; sound.play('click'); repaintCard(); repaintEdit(); if (editing) view.querySelector('.pedit').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
      const tb = t.closest('.js-ptab button');
      if (tb) { tab = tb.dataset.t; sound.play('click'); repaintEdit(); return; }
      const av = t.closest('[data-av]');
      if (av) { set({ avatar: { type: 'card', id: av.dataset.av } }); return changed(); }
      if (t.closest('.js-av-letter')) { set({ avatar: null }); return changed(); }
      const bn = t.closest('[data-bn]');
      if (bn && !bn.disabled) { set({ banner: { type: 'preset', id: bn.dataset.bn } }); return changed(); }
      const bc = t.closest('[data-bc]');
      if (bc) { set({ banner: { type: 'card', id: bc.dataset.bc } }); return changed(); }
      const tt = t.closest('[data-tt]');
      if (tt && !tt.disabled) { set({ title: tt.dataset.tt }); sound.play('win', { x: 2 }); repaintCard(); repaintEdit(); return; }
      const fr = t.closest('[data-fr]');
      if (fr && !fr.disabled) { set({ frame: fr.dataset.fr || null }); sound.play('win', { x: 2 }); repaintCard(); repaintEdit(); return; }
      const nf = t.closest('[data-nf]');
      if (nf && !nf.disabled) { set({ namefx: nf.dataset.nf || null }); sound.play('win', { x: 2 }); repaintCard(); repaintEdit(); return; }
      const sc = t.closest('[data-sc]');
      if (sc) {
        const p = get(), k = sc.dataset.sc, list = p.showcase.filter((x) => x !== k);
        if (list.length === p.showcase.length) { if (list.length >= 3) { ui.toast('3 cartes maximum dans la vitrine.', 'error'); return; } list.push(k); }
        set({ showcase: list });
        return changed();
      }
    });
    view.addEventListener('change', async (e) => {
      const up = e.target.closest('.js-upload');
      if (!up || !up.files[0]) return;
      try {
        const isAv = up.dataset.k === 'avatar';
        const data = await shrink(up.files[0], isAv ? 256 : 1200, isAv ? 256 : 340);
        if (set(isAv ? { avatar: { type: 'upload', data } } : { banner: { type: 'upload', data } })) { sound.play('coin'); ui.toast(isAv ? 'Photo de profil mise à jour' : 'Bannière mise à jour', 'win'); }
        repaintCard(); repaintEdit();
      } catch { ui.toast('Ce fichier n’est pas une image.', 'error'); sound.play('error'); }
    });
    view.addEventListener('input', (e) => {
      const bio = e.target.closest('.js-bio');
      if (bio) { set({ bio: bio.value.slice(0, 80) }); repaintCard(); }
    });
    paint();
    DP_MOTION.reveal(view, '.pcard, .ppanel');
    return () => {};
  }

  DP.profile = { get, avatarHtml, titleOf, titleHtml, render, renderPublic, link, nameHtml };
})();
