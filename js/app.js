/* Dave's Palace — coquille de l'application : routeur, barre du haut, pages. */
(function () {
  'use strict';
  const { IMG, auth, wallet, bonus, stats, sound, ui, games, fmt, fmtMult, esc, on } = DP;
  const I = ui.icon;

  const app = document.getElementById('app');
  let unmountView = null;

  /* ---------- Routeur (hash) ---------- */
  function route() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [page, arg] = hash.split('/');
    if (unmountView) { try { unmountView(); } catch (e) { console.error(e); } unmountView = null; }
    window.scrollTo(0, 0);

    if (!auth.current()) {
      renderLanding(page === 'inscription' ? 'register' : 'login');
      return;
    }
    renderShell();
    const view = document.getElementById('view');
    setActiveNav(page === 'jeu' ? arg : page || 'lobby');
    if (page === 'jeu' && games.find(arg)) renderGame(view, games.find(arg));
    else if (page === 'profil') renderProfile(view);
    else renderLobby(view);
    closeSidebar();
  }

  const brand = () => `<span class="brand__mark">${I('crown')}</span><span class="brand__name">Dave’s Palace</span>`;
  const astro = (cls = '') => `<div class="astro ${cls}">
      <div class="orbit orbit-spin o1"></div><div class="orbit orbit-spin o2"></div>
      <img class="king" src="${IMG}jpz.png" alt="Jean-Pascal Zadi, roi du Palace">
    </div>`;

  /* ---------- Page d'accueil / authentification ---------- */
  function renderLanding(mode) {
    document.body.className = 'is-landing';
    app.innerHTML = `
      <div class="landing">
        <div class="planet"></div>
        <div class="landing__hero">
          <div class="brand">${brand()}</div>
          <h1>Le casino<span>en orbite</span></h1>
          <p class="landing__tag">Le palace de Jean-Pascal Zadi, quelque part entre deux galaxies. Mise tes DaveCoins, vise le jackpot.</p>
          <div class="landing__stats">
            <div><strong>${games.list.length}</strong><span>jeux</span></div>
            <div><strong>1 000</strong><span>DaveCoins offerts</span></div>
            <div><strong>99%</strong><span>de RTP max</span></div>
          </div>
        </div>
        ${astro()}
        <div class="auth-card glass">
          <div class="seg seg--tabs">
            <button type="button" data-m="login">Connexion</button>
            <button type="button" data-m="register">Inscription</button>
          </div>
          <form class="auth-form" novalidate>
            <h2></h2>
            <p class="auth-form__sub"></p>
            <label class="field"><span>Pseudo</span><input name="user" autocomplete="username" maxlength="20" required></label>
            <label class="field"><span>Mot de passe</span><input name="pass" type="password" required></label>
            <p class="auth-form__error" role="alert"></p>
            <button class="btn btn--primary btn--lg btn--block" type="submit"></button>
          </form>
        </div>
      </div>`;

    const form = app.querySelector('form');
    const err = form.querySelector('.auth-form__error');
    const tabs = app.querySelectorAll('.seg--tabs button');
    const paint = () => {
      tabs.forEach((t) => t.classList.toggle('on', t.dataset.m === mode));
      const reg = mode === 'register';
      form.querySelector('h2').textContent = reg ? 'Embarquement' : 'Bon retour à bord';
      form.querySelector('.auth-form__sub').innerHTML = reg
        ? `Crée ton compte et reçois <strong class="num">1 000</strong> ${ui.coin('coin--xs')} pour décoller.`
        : 'Connecte-toi pour retrouver tes DaveCoins.';
      form.querySelector('button[type=submit]').innerHTML = (reg ? 'Créer mon compte' : 'Entrer au Palace') + I('chevron-right');
      form.pass.autocomplete = reg ? 'new-password' : 'current-password';
      err.textContent = '';
    };
    tabs.forEach((t) => t.addEventListener('click', () => { mode = t.dataset.m; paint(); sound.play('click'); }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fn = mode === 'register' ? auth.register : auth.login;
      const problem = fn(form.user.value, form.pass.value);
      if (problem) { err.textContent = problem; sound.play('error'); return; }
      sound.play('coin');
      location.hash = '#/lobby';
      route();
    });
    paint();
    form.user.focus();
  }

  /* ---------- Coquille (barre du haut + navigation) ---------- */
  function renderShell() {
    if (document.querySelector('.shell')) { refreshTopbar(); return; }
    document.body.className = '';
    shown = null;
    const user = auth.current();
    app.innerHTML = `
      <div class="shell">
        <header class="topbar">
          <button class="icon-btn burger" aria-label="Menu" type="button">${I('menu')}</button>
          <a class="brand" href="#/lobby">${brand()}</a>
          <div class="wallet" title="Ton solde de DaveCoins">
            ${ui.coin()}<span class="wallet__amount">0</span>
            <button class="wallet__bonus" type="button" aria-label="Bonus">${I('plus')}</button>
          </div>
          <div class="topbar__right">
            <button class="icon-btn sound-btn" type="button" aria-label="Son"></button>
            <a class="user-chip" href="#/profil"><span class="avatar">${esc(user.charAt(0).toUpperCase())}</span><span class="user-chip__name">${esc(user)}</span></a>
          </div>
        </header>
        <nav class="sidebar">
          <a class="nav-item" data-nav="lobby" href="#/lobby">${I('castle')}Lobby</a>
          <div class="nav-title">Jeux</div>
          ${games.list.map((g) => `<a class="nav-item" data-nav="${g.id}" href="#/jeu/${g.id}">${I(g.icon)}${g.name}${g.isNew ? '<span class="nav-tag">New</span>' : ''}</a>`).join('')}
          <div class="nav-title">Compte</div>
          <a class="nav-item" data-nav="profil" href="#/profil">${I('user')}Profil & stats</a>
          <button class="nav-item js-bonus" type="button">${I('gift')}Bonus</button>
          <button class="nav-item logout" type="button">${I('log-out')}Déconnexion</button>
          <div class="sidebar__foot"><p>Jeu fictif, aucun argent réel. Les DaveCoins n’ont aucune valeur.</p></div>
        </nav>
        <div class="scrim"></div>
        <main id="view"></main>
      </div>`;

    app.querySelector('.burger').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    app.querySelector('.scrim').addEventListener('click', closeSidebar);
    app.querySelector('.logout').addEventListener('click', () => { auth.logout(); location.hash = ''; route(); });
    app.querySelector('.wallet__bonus').addEventListener('click', openBonus);
    app.querySelector('.js-bonus').addEventListener('click', () => { closeSidebar(); openBonus(); });
    const sb = app.querySelector('.sound-btn');
    const paintSound = () => (sb.innerHTML = I(sound.muted ? 'volume-x' : 'volume-2'));
    sb.addEventListener('click', () => { sound.toggle(); paintSound(); sound.play('click'); });
    paintSound();
    refreshTopbar();
  }

  function closeSidebar() { document.body.classList.remove('nav-open'); }
  function setActiveNav(key) {
    document.querySelectorAll('.nav-item[data-nav]').forEach((n) => n.classList.toggle('on', n.dataset.nav === key));
  }

  /* Animation du solde */
  let shown = null, raf = 0;
  function refreshTopbar() {
    const el = document.querySelector('.wallet__amount');
    if (!el) return;
    const target = wallet.get();
    if (shown === null) { shown = target; el.textContent = fmt(target); }
    cancelAnimationFrame(raf);
    const from = shown, start = performance.now(), dur = 500;
    const wrap = el.closest('.wallet');
    if (target !== from) {
      wrap.classList.remove('up', 'down');
      void wrap.offsetWidth;
      wrap.classList.add(target > from ? 'up' : 'down');
    }
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      shown = from + (target - from) * (1 - Math.pow(1 - k, 3));
      el.textContent = fmt(k === 1 ? target : shown);
      if (k < 1) raf = requestAnimationFrame(step); else shown = target;
    };
    raf = requestAnimationFrame(step);
    const b = document.querySelector('.wallet__bonus');
    if (b) b.classList.toggle('ready', bonus.dailyLeft() === 0 || bonus.canRescue());
  }
  on('balance', refreshTopbar);
  on('bonus', refreshTopbar);

  /* ---------- Bonus ---------- */
  function countdown(ms) {
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
    return (h ? h + 'h ' : '') + String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's';
  }
  function openBonus() {
    sound.play('click');
    const modal = ui.el(`<div class="modal" role="dialog" aria-modal="true">
      <div class="modal__card glass">
        <button class="modal__close icon-btn" type="button" aria-label="Fermer">${I('x')}</button>
        <div class="modal__hero"><div class="orbit orbit-spin"></div><img src="${IMG}jpz.png" alt=""></div>
        <h3>${I('gift')}Le trésor du roi</h3>
        <div class="bonus-row">
          <div><strong>${I('timer', 'i--sm')}Bonus quotidien</strong><span>+${fmt(bonus.DAILY_BONUS)} ${ui.coin('coin--xs')} toutes les 24 h</span></div>
          <button class="btn btn--primary" data-b="daily" type="button"></button>
        </div>
        <div class="bonus-row">
          <div><strong>${I('hand-coins', 'i--sm')}Dave te dépanne</strong><span>+${fmt(bonus.RESCUE_AMOUNT)} ${ui.coin('coin--xs')} si ton solde est à 0 (1 fois / heure)</span></div>
          <button class="btn btn--ghost" data-b="rescue" type="button"></button>
        </div>
      </div>
    </div>`);
    document.body.appendChild(modal);
    const daily = modal.querySelector('[data-b=daily]');
    const rescue = modal.querySelector('[data-b=rescue]');
    const paint = () => {
      if (!modal.isConnected) { clearInterval(timer); return; }
      const d = bonus.dailyLeft();
      daily.disabled = d > 0;
      daily.textContent = d > 0 ? countdown(d) : 'Récupérer';
      const r = bonus.rescueLeft();
      rescue.disabled = !bonus.canRescue();
      rescue.textContent = wallet.get() >= 1 ? 'Solde > 0' : r > 0 ? countdown(r) : 'Récupérer';
    };
    paint();
    const timer = setInterval(paint, 1000);
    const close = () => { clearInterval(timer); modal.remove(); };
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelector('.modal__close').addEventListener('click', close);
    daily.addEventListener('click', () => { const g = bonus.claimDaily(); if (g) { sound.play('jackpot'); ui.toast(`+${fmt(g)} DaveCoins, merci le roi !`, 'win'); } paint(); });
    rescue.addEventListener('click', () => { const g = bonus.claimRescue(); if (g) { sound.play('coin'); ui.toast(`+${fmt(g)} DaveCoins, reviens plus fort !`, 'win'); } paint(); });
  }

  /* ---------- Lobby ---------- */
  function renderLobby(view) {
    const user = auth.current();
    const s = stats.get();
    const featured = games.list.find((g) => g.hot) || games.list[0];
    view.innerHTML = `
      <section class="hero glass">
        <div class="planet"></div>
        <div class="hero__text">
          <span class="kicker"><b></b>Bienvenue à bord, ${esc(user)}</span>
          <h1>Le roi t’attend<br>en <em>orbite</em>.</h1>
          <p>${games.list.length} jeux, des gains instantanés et ${fmt(bonus.DAILY_BONUS)} DaveCoins offerts chaque jour.</p>
          <div class="hero__cta">
            <a class="btn btn--primary btn--lg" href="#/jeu/${featured.id}">${I('play')}Jouer à ${featured.name}</a>
            <button class="btn btn--ghost btn--lg hero-bonus" type="button">${I('gift')}Bonus</button>
          </div>
        </div>
        <div class="hero__art">${astro()}</div>
      </section>

      <section class="tiles">
        <div class="tile glass"><span>${I('wallet')}Solde</span><strong>${ui.coin('coin--sm')}<b class="js-bal" style="font-weight:inherit">${fmt(wallet.get())}</b></strong></div>
        <div class="tile glass"><span>${I('history')}Parties jouées</span><strong>${fmt(s.played)}</strong></div>
        <div class="tile glass"><span>${I('trophy')}Plus gros gain</span><strong>${s.biggestWin ? '+' + fmt(s.biggestWin) : '—'}</strong></div>
        <div class="tile glass"><span>${I('zap')}Meilleur multi</span><strong>${s.biggestMult ? fmtMult(s.biggestMult) : '—'}</strong></div>
      </section>

      <div class="section-head"><h2>Les jeux</h2><span>${games.list.length} jeux disponibles</span></div>
      <section class="games-grid">
        ${games.list.map((g) => `
          <a class="game-card" href="#/jeu/${g.id}" style="--h:${g.hue}">
            <div class="game-card__art">${g.art || `<span class="game-card__icon">${I(g.icon)}</span>`}</div>
            ${g.hot ? '<span class="badge badge--hot">Populaire</span>' : ''}${g.isNew ? '<span class="badge badge--new">Nouveau</span>' : ''}
            <div class="game-card__body">
              <div>
                <h3>${I(g.icon)}${g.name}</h3>
                <p>${g.tagline}</p>
              </div>
              <span class="game-card__go">${I('chevron-right', 'i--sm')}</span>
            </div>
          </a>`).join('')}
      </section>

      <div class="section-head"><h2>Dernières parties</h2><a href="#/profil">Tout voir${I('chevron-right', 'i--sm')}</a></div>
      ${historyTable(s.history.slice(0, 8))}`;

    view.querySelector('.hero-bonus').addEventListener('click', openBonus);
    // Projecteur qui suit la souris sur les cartes
    view.querySelectorAll('.game-card').forEach((c) => c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', e.clientX - r.left + 'px');
      c.style.setProperty('--my', e.clientY - r.top + 'px');
    }));
    unmountView = on('balance', () => { const b = view.querySelector('.js-bal'); if (b) b.textContent = fmt(wallet.get()); });
  }

  function historyTable(rows) {
    if (!rows.length) return `<div class="empty glass">${I('rocket', 'i--lg')}Aucune partie pour l’instant. Lance-toi !</div>`;
    return `<div class="table-wrap glass"><table class="history">
      <thead><tr><th>Jeu</th><th class="num">Mise</th><th class="num">Multi</th><th class="num">Gain</th><th class="num">Heure</th></tr></thead>
      <tbody>${rows.map((h) => {
        const g = games.find(h.game);
        const net = h.payout - h.bet;
        return `<tr><td><span class="g" style="--h:${g ? g.hue : 0}">${g ? I(g.icon, 'i--sm') + g.name : esc(h.game)}</span></td>
          <td class="num">${fmt(h.bet)}</td><td class="num">${fmtMult(h.mult)}</td>
          <td class="num ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}">${net > 0 ? '+' : ''}${fmt(net)}</td>
          <td class="num muted">${new Date(h.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  /* ---------- Profil ---------- */
  function renderProfile(view) {
    const s = stats.get();
    const net = s.won - s.wagered;
    const fav = Object.entries(s.perGame).sort((a, b) => b[1] - a[1])[0];
    const favGame = fav && games.find(fav[0]);
    view.innerHTML = `
      <div class="page-head">
        <span class="avatar avatar--lg">${esc(auth.current().charAt(0).toUpperCase())}</span>
        <div><h1>${esc(auth.current())}</h1><p>Membre d’équipage du Palace</p></div>
      </div>
      <section class="tiles">
        <div class="tile glass"><span>${I('wallet')}Solde</span><strong>${ui.coin('coin--sm')} ${fmt(wallet.get())}</strong></div>
        <div class="tile glass"><span>${I('history')}Parties</span><strong>${fmt(s.played)}</strong></div>
        <div class="tile glass"><span>${I('coins')}Total misé</span><strong>${fmt(s.wagered)}</strong></div>
        <div class="tile glass"><span>${I('sigma')}Bilan</span><strong class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${fmt(net)}</strong></div>
        <div class="tile glass"><span>${I('trophy')}Plus gros gain</span><strong>${s.biggestWin ? '+' + fmt(s.biggestWin) : '—'}</strong></div>
        <div class="tile glass"><span>${I('zap')}Meilleur multi</span><strong>${s.biggestMult ? fmtMult(s.biggestMult) : '—'}</strong></div>
        <div class="tile glass"><span>${I('star')}Jeu préféré</span><strong style="font-family:var(--font);font-size:18px">${favGame ? favGame.name : '—'}</strong></div>
      </section>
      <div class="section-head"><h2>Historique</h2><span>50 dernières parties</span></div>
      ${historyTable(s.history)}`;
  }

  /* ---------- Jeu ---------- */
  function renderGame(view, game) {
    view.innerHTML = `
      <div class="game-head" style="--h:${game.hue}">
        <a class="icon-btn" href="#/lobby" aria-label="Retour au lobby">${I('arrow-left')}</a>
        <span class="game-head__ico">${I(game.icon, 'i--lg')}</span>
        <div><h1>${game.name}</h1><p>${game.tagline} · <span class="num">RTP ${game.rtp}</span></p></div>
        <button class="btn btn--ghost btn--sm rules-btn" type="button">${I('book-open', 'i--sm')}Règles</button>
      </div>
      <div class="game-root"></div>`;
    view.querySelector('.rules-btn').addEventListener('click', () => {
      const modal = ui.el(`<div class="modal"><div class="modal__card glass">
        <button class="modal__close icon-btn" type="button" aria-label="Fermer">${I('x')}</button>
        <h3>${I(game.icon)}${game.name}</h3>${game.rules}<p class="muted">Taux de redistribution théorique : <span class="num">${game.rtp}</span></p></div></div>`);
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('.modal__close')) modal.remove(); });
    });
    const cleanup = game.mount(view.querySelector('.game-root'));
    unmountView = typeof cleanup === 'function' ? cleanup : null;
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.modal').forEach((m) => m.remove()); });
  route();
})();
