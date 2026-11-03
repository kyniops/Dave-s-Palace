/* Guildes : fonder une guilde coûte cher, la rejoindre est gratuit. Classement des guildes par fortune totale,
 * page de chaque guilde avec ses membres, outils du chef (exclure, passer la main, description, ouverture).
 * Tout est géré par le serveur (supabase/guilds.sql). Le tag de guilde s'affiche à côté des pseudos (classement, profil).
 */
(() => {
  'use strict';
  const { fmt, esc, ui, sound, auth } = DP;
  const I = ui.icon;
  const sb = () => DP.cloud && DP.cloud.sb;
  const online = () => !!(DP.engine && DP.engine.on && sb());

  /* ---------- Tags des joueurs (pseudo → guilde) ---------- */
  let tags = {}, tagsAt = 0, tagsP = null;
  function loadTags(force = false) {
    if (!sb()) return Promise.resolve(tags);
    if (!force && Date.now() - tagsAt < 30000) return Promise.resolve(tags);
    if (tagsP) return tagsP;
    tagsP = sb().rpc('guild_tags').then(({ data }) => { if (data && typeof data === 'object') { tags = data; tagsAt = Date.now(); } return tags; }, () => tags)
      .finally(() => { tagsP = null; });
    return tagsP;
  }
  const tagOf = (name) => (name && tags[String(name).toLowerCase()]) || null;
  /** Badge du tag ; link = true pour un lien vers la guilde (pas à l'intérieur d'un autre lien). */
  const tagHtml = (name, link = false) => {
    const t = tagOf(name);
    if (!t || !/^[A-Z0-9]{2,4}$/.test(t.tag)) return '';
    return link ? `<a class="gtag" href="#/guilde/${+t.id}" title="Voir la guilde">${t.tag}</a>` : `<span class="gtag">${t.tag}</span>`;
  };

  const badge = (g, cls = '') => `<span class="gtag ${cls}">${esc(g.tag)}</span>`;
  const date = (d) => { try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } };
  const head = (sub) => `<div class="page-head" data-reveal><span class="game-head__ico">${I('flag', 'i--lg')}</span><div><h1>Guildes</h1><p>${sub}</p></div></div>`;

  async function rpc(fn, params, opts) {
    const r = await DP.engine.call(fn, params, opts);
    if (fn !== 'guild_list' && fn !== 'guild_get' && r) loadTags(true);
    return r;
  }

  /* ---------- Page liste : ma guilde / fonder + classement des guildes ---------- */
  function renderList(view) {
    let alive = true, st = null, busy = false;
    view.innerHTML = head('Rejoins une guilde gratuitement ou fonde la tienne, et grimpe au classement avec tes coéquipiers.') +
      '<div class="js-top" data-reveal></div><section class="gd-panel js-rank" data-reveal><div class="empty">' + I('history', 'i--lg') + '<strong>Chargement…</strong></div></section>';
    const top = view.querySelector('.js-top'), rank = view.querySelector('.js-rank');

    const paint = () => {
      if (!alive || !st) return;
      const { cfg, mine, guilds } = st;
      const my = guilds.find((g) => g.id === mine);
      const sm = DP.progress && DP.progress.summary(), lvl = sm ? sm.level : 1;
      const bal = DP.wallet.get();
      if (my) {
        top.innerHTML = `<a class="gd-mine" href="#/guilde/${+my.id}">${badge(my, 'gtag--lg')}<span><small>Ta guilde</small><b>${esc(my.name)}</b><em>${my.members} membre${my.members > 1 ? 's' : ''} · fortune ${fmt(+my.fortune)}</em></span>${I('chevron-right')}</a>`;
      } else {
        const lock = lvl < cfg.level ? `Niveau ${cfg.level} requis (tu es niveau ${lvl})` : bal < cfg.cost ? `Il te manque ${fmt(cfg.cost - bal)}` : '';
        top.innerHTML = `<section class="gd-panel gd-create">
          <header><h2>${I('crown')}Fonder une guilde</h2><span class="gd-price">${ui.coin('coin--sm')}<b class="num">${fmt(cfg.cost)}</b></span></header>
          <p class="muted">Fonder une guilde coûte <b>${fmt(cfg.cost)} DaveCoins</b> (niveau ${cfg.level} minimum). La rejoindre est gratuit. ${cfg.max} membres au plus, et tu en deviens le chef.</p>
          <form class="gd-form js-create" autocomplete="off">
            <label class="field"><span>Nom de la guilde</span><input name="name" maxlength="24" placeholder="Ex. Les Rois du Palace" required></label>
            <label class="field gd-form__tag"><span>Tag (2 à 4)</span><input name="tag" maxlength="4" placeholder="ROI" required></label>
            <label class="field gd-form__desc"><span>Description (facultatif)</span><input name="desc" maxlength="120" placeholder="Ex. On vise le jackpot ensemble."></label>
            <button class="btn btn--primary js-found" type="submit" ${lock ? 'disabled' : ''}>${I('flag', 'i--sm')}Fonder pour ${fmt(cfg.cost)}</button>
            ${lock ? `<p class="gd-lock">${I('lock', 'i--sm')}${lock}</p>` : ''}
          </form></section>`;
      }
      rank.innerHTML = `<header><h2>${I('trophy')}Classement des guildes</h2><span>${guilds.length} guilde${guilds.length > 1 ? 's' : ''}</span></header>` + (guilds.length
        ? `<div class="table-wrap"><table class="history gd-table gd-table--list"><thead><tr><th>#</th><th>Guilde</th><th>Chef</th><th class="num">Membres</th><th class="num">Fortune</th><th></th></tr></thead><tbody>
          ${guilds.map((g, i) => {
            const full = g.members >= cfg.max;
            const act = mine ? (g.id === mine ? '<span class="gd-you">Ta guilde</span>' : '')
              : !g.open ? '<span class="gd-state">Fermée</span>' : full ? '<span class="gd-state">Complète</span>'
              : `<button type="button" class="btn btn--primary btn--sm js-join" data-g="${+g.id}">Rejoindre</button>`;
            return `<tr class="${g.id === mine ? 'me' : ''}"><td class="num">${i + 1}</td>
              <td><a class="gd-name" href="#/guilde/${+g.id}">${badge(g)}<span><b>${esc(g.name)}</b>${g.descr ? `<small>${esc(g.descr)}</small>` : ''}</span></a></td>
              <td>${g.owner ? DP.profile.link(g.owner, esc(g.owner)) : '—'}</td><td class="num">${g.members} / ${cfg.max}</td><td class="num">${fmt(+g.fortune)}</td><td class="gd-act">${act}</td></tr>`;
          }).join('')}</tbody></table></div>`
        : `<div class="empty">${I('flag', 'i--lg')}<strong>Aucune guilde pour l’instant</strong>Sois le premier à en fonder une !</div>`);
    };

    const load = async () => {
      const r = await rpc('guild_list', {}, { silent: true });
      if (!alive) return;
      if (r) { st = r; paint(); } else if (!st) rank.innerHTML = `<div class="empty">${I('triangle-alert', 'i--lg')}<strong>Impossible de charger les guildes</strong>Réessaie dans un instant.</div>`;
    };

    view.addEventListener('submit', async (e) => {
      const f = e.target.closest('.js-create');
      if (!f) return;
      e.preventDefault();
      if (busy) return;
      const btn = f.querySelector('.js-found');
      if (!ui.confirmClick(btn, `Payer ${fmt(st.cfg.cost)}`)) return;
      busy = true; btn.disabled = true;
      const r = await rpc('guild_create', { p_name: f.name.value, p_tag: f.tag.value, p_desc: f.desc.value });
      busy = false;
      if (!alive) return;
      if (r) { sound.play('win'); ui.toast('Guilde fondée ! Tu en es le chef.', 'win'); location.hash = '#/guilde/' + (+r.id); } else { btn.disabled = false; load(); }
    });
    view.addEventListener('input', (e) => { if (e.target.name === 'tag') e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    view.addEventListener('click', async (e) => {
      const b = e.target.closest('.js-join');
      if (!b || busy) return;
      busy = true; b.disabled = true;
      const r = await rpc('guild_join', { p_id: +b.dataset.g });
      busy = false;
      if (!alive) return;
      if (r) { sound.play('coin'); ui.toast(`Bienvenue dans ${r.name} !`, 'win'); location.hash = '#/guilde/' + (+r.id); } else load();
    });

    load();
    const t = setInterval(load, 30000);
    if (window.DP_MOTION) window.DP_MOTION.reveal(view, '[data-reveal]');
    return () => { alive = false; clearInterval(t); };
  }

  /* ---------- Page d'une guilde ---------- */
  function renderGuild(view, id) {
    let alive = true, g = null, mine = null, cfg = null, busy = false;
    view.innerHTML = head('Chargement de la guilde…') + `<div class="empty" data-reveal>${I('history', 'i--lg')}<strong>Chargement…</strong></div>`;

    const paint = () => {
      if (!alive) return;
      if (!g) { view.innerHTML = head('Guilde introuvable.') + `<div class="empty">${I('flag', 'i--lg')}<strong>Cette guilde n’existe plus</strong><a class="btn btn--primary" style="margin-top:10px" href="#/guildes">Voir les guildes</a></div>`; return; }
      const me = DP.cloud && DP.cloud.uid ? DP.cloud.uid() : null;
      const isMember = g.members.some((m) => m.id === me), isOwner = g.owner === me;
      const owner = g.members.find((m) => m.role === 'owner');
      const full = g.members.length >= g.max;
      let action = '';
      if (isMember) action = `<button type="button" class="btn btn--ghost js-leave">${I('log-out', 'i--sm')}Quitter la guilde</button>`;
      else if (!mine && g.open && !full) action = `<button type="button" class="btn btn--primary js-join">${I('user-plus', 'i--sm')}Rejoindre gratuitement</button>`;
      else if (!mine) action = `<span class="gd-state">${!g.open ? 'Fermée aux nouveaux membres' : 'Complète'}</span>`;
      view.innerHTML = `
        <a class="gd-back" href="#/guildes">${I('arrow-left', 'i--sm')}Toutes les guildes</a>
        <section class="gd-hero" data-reveal>
          ${badge(g, 'gtag--xl')}
          <div class="gd-hero__id"><h1>${esc(g.name)}</h1>${g.descr ? `<p>${esc(g.descr)}</p>` : '<p class="muted">Pas de description.</p>'}
            <div class="gd-stats"><span><b class="num">${g.members.length}</b> / ${g.max} membres</span><span>Fortune <b class="num">${fmt(+g.fortune)}</b></span>
              <span>Chef ${owner ? `<b>${esc(owner.name)}</b>` : '—'}</span><span>Fondée le ${date(g.created)}</span>${g.open ? '' : '<span class="gd-state">Fermée</span>'}</div></div>
          <div class="gd-hero__act">${action}</div>
        </section>
        ${isOwner ? `<section class="gd-panel" data-reveal><header><h2>${I('crown')}Gérer la guilde</h2></header>
          <form class="gd-form gd-form--edit js-edit" autocomplete="off">
            <label class="field gd-form__desc"><span>Description</span><input name="desc" maxlength="120" value="${esc(g.descr)}"></label>
            <label class="gd-check"><input type="checkbox" name="open" ${g.open ? 'checked' : ''}><span>Ouverte aux nouveaux membres</span></label>
            <button class="btn btn--primary" type="submit">Enregistrer</button>
          </form></section>` : ''}
        <section class="gd-panel" data-reveal><header><h2>${I('users')}Membres</h2><span>${g.members.length} / ${g.max}</span></header>
          <div class="table-wrap"><table class="history gd-table gd-table--mem"><thead><tr><th>Joueur</th><th class="num">Niveau</th><th class="num">Fortune</th><th>Depuis</th>${isOwner ? '<th></th>' : ''}</tr></thead><tbody>
          ${g.members.map((m) => `<tr class="${m.id === me ? 'me' : ''}">
            <td>${DP.profile.link(m.name, `<span class="g">${DP.profile.avatarHtml(m.name)}${esc(m.name)}</span>`)}${m.role === 'owner' ? `<span class="gd-role">${I('crown', 'i--sm')}Chef</span>` : ''}</td>
            <td class="num">${+m.level || 1}</td><td class="num">${fmt(+m.fortune)}</td><td>${date(m.joined)}</td>
            ${isOwner ? `<td class="gd-act">${m.id === me ? '' : `<button type="button" class="btn btn--ghost btn--sm js-chief" data-u="${esc(m.id)}">Nommer chef</button><button type="button" class="btn btn--ghost btn--sm js-kick" data-u="${esc(m.id)}">Exclure</button>`}</td>` : ''}</tr>`).join('')}
          </tbody></table></div></section>`;
      if (window.DP_MOTION) window.DP_MOTION.reveal(view, '[data-reveal]');
    };

    const load = async () => {
      const [r, l] = await Promise.all([rpc('guild_get', { p_id: id }, { silent: true }), rpc('guild_list', {}, { silent: true })]);
      if (!alive) return;
      if (l) { mine = l.mine; cfg = l.cfg; }
      g = r && r.id ? r : null;
      paint();
    };
    const act = async (fn, params, ok) => {
      if (busy) return;
      busy = true;
      const r = await rpc(fn, params);
      busy = false;
      if (!alive) return;
      if (r) ok(r);
      load();
    };

    view.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('js-join')) act('guild_join', { p_id: id }, () => { sound.play('coin'); ui.toast('Bienvenue dans la guilde !', 'win'); });
      else if (b.classList.contains('js-leave')) {
        const alone = g && g.members.length === 1;
        if (!ui.confirmClick(b, alone ? 'La guilde disparaîtra' : 'Quitter')) return;
        act('guild_leave', {}, (r) => { ui.toast(r.disbanded ? 'Tu as quitté la guilde, elle a été dissoute.' : 'Tu as quitté la guilde.', 'info'); location.hash = '#/guildes'; });
      } else if (b.classList.contains('js-kick')) {
        if (!ui.confirmClick(b, 'Exclure')) return;
        act('guild_kick', { p_user: b.dataset.u }, () => ui.toast('Membre exclu.', 'info'));
      } else if (b.classList.contains('js-chief')) {
        if (!ui.confirmClick(b, 'Lui donner la guilde')) return;
        act('guild_transfer', { p_user: b.dataset.u }, () => ui.toast('Tu as passé la main, il est le nouveau chef.', 'info'));
      }
    });
    view.addEventListener('submit', (e) => {
      const f = e.target.closest('.js-edit');
      if (!f) return;
      e.preventDefault();
      act('guild_update', { p_desc: f.desc.value, p_open: f.open.checked }, () => { sound.play('click'); ui.toast('Guilde mise à jour.', 'win'); });
    });

    load();
    const t = setInterval(() => { if (!busy && !view.querySelector('.js-edit input:focus')) load(); }, 30000);
    return () => { alive = false; clearInterval(t); };
  }

  function render(view, id) {
    if (!online()) { view.innerHTML = head('Les guildes fonctionnent sur le site en ligne, avec un compte.'); return () => {}; }
    return id ? renderGuild(view, +id) : renderList(view);
  }

  DP.guilds = { render, loadTags, tagOf, tagHtml };
})();
