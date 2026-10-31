/* Profil : photo, bannière, titre (gagné grâce aux succès et aux rangs), bio et vitrine de cartes.
 * Stocké par compte dans dp_profile_<pseudo>. Les images importées sont réduites avant d'être gardées.
 */
(() => {
  const { auth, stats, store, ui, sound, cards, inventory, fmt, esc, on, emit, IMG } = DP;
  const I = ui.icon;
  const key = (name) => 'dp_profile_' + name;
  const get = (name = auth.current()) => Object.assign({ avatar: null, banner: { type: 'preset', id: 'orbite' }, title: 'new', bio: '', showcase: [] }, store.json(key(name), {}));
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
  function avatarHtml(name = auth.current(), cls = 'avatar') {
    const p = get(name);
    const src = p.avatar && (p.avatar.type === 'upload' ? p.avatar.data : p.avatar.type === 'card' && cards.byId[p.avatar.id] ? IMG + cards.byId[p.avatar.id].img : null);
    return src ? `<span class="${cls} avatar--img"><img src="${src}" alt=""></span>` : `<span class="${cls}">${esc(name.charAt(0).toUpperCase())}</span>`;
  }
  function bannerStyle(p) {
    const b = p.banner || { type: 'preset', id: 'orbite' };
    if (b.type === 'upload') return `background-image:url(${b.data})`;
    if (b.type === 'card' && cards.byId[b.id]) return `background-image:url(${IMG}${cards.byId[b.id].img})`;
    return '';
  }
  const bannerClass = (p) => { const b = p.banner || {}; return b.type === 'upload' ? 'pb--upload' : b.type === 'card' ? 'pb--card' : 'pb--' + (BANNERS.find((x) => x.id === b.id && x.ok()) ? b.id : 'orbite'); };

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
              <h1>${esc(name)}</h1>
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
      const tabs = [['avatar', 'Photo'], ['banner', 'Bannière'], ['title', 'Titre'], ['showcase', 'Vitrine'], ['bio', 'Bio']];
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
      } else if (tab === 'showcase') {
        body = `<p class="muted">Choisis jusqu’à 3 cartes à exposer. Clique à nouveau pour retirer.</p>
          <div class="ppick ppick--cards">${owned().map((x) => { const k = x.card.id + '|' + (x.shiny ? 1 : 0); const i = p.showcase.indexOf(k); return `<button type="button" class="ppick__card ${i >= 0 ? 'on' : ''}" data-sc="${k}">${cards.html(x.card, { compact: true, shiny: x.shiny })}${i >= 0 ? `<span class="ppick__n">${i + 1}</span>` : ''}</button>`; }).join('') || '<p class="muted">Aucune carte.</p>'}</div>`;
      } else {
        body = `<label class="field"><span>Ta bio (80 caractères)</span><input class="js-bio" maxlength="80" value="${esc(p.bio)}" placeholder="Ex. Je vise le jackpot."></label>`;
      }
      return `<section class="pedit">
        <div class="seg js-ptab">${tabs.map(([k, l]) => `<button type="button" data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="pedit__body">${body}</div></section>`;
    }

    const paint = () => {
      view.innerHTML = `<div class="js-pcard">${cardBlock()}</div><div class="js-pedit">${editing ? editorBlock() : ''}</div>`;
      DP_MOTION.tilt(view.querySelectorAll('.pshow .tcard'), 12);
    };
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

  DP.profile = { get, avatarHtml, titleOf, titleHtml, render };
})();
