/* Dave's Palace — coquille de l'application : routeur, barre du haut, pages. */
(function () {
  'use strict';
  const { IMG, auth, wallet, bonus, promo, stats, sound, ui, games, fmt, fmtMult, esc, on, rng, cards, inventory, sleep } = DP;
  const I = ui.icon;
  const M = window.DP_MOTION;

  const app = document.getElementById('app');
  let unmountView = null;

  /* ---------- Routeur (hash) ---------- */
  function route() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [page, arg] = hash.split('/');
    if (unmountView) { try { unmountView(); } catch (e) { console.error(e); } unmountView = null; }
    window.scrollTo(0, 0);

    if (!auth.current()) {
      // présentation d'abord ; la page de connexion vit sur #/connexion et #/inscription
      if (page === 'connexion' || page === 'inscription') renderLanding(page === 'inscription' ? 'register' : 'login');
      else if (window.DP_INTRO) unmountView = DP_INTRO.render(app);
      else renderLanding('login');
      return;
    }
    renderShell();
    const view = document.getElementById('view');
    setActiveNav(page === 'jeu' ? (arg === 'cases' ? 'caisses' : arg) : page || 'lobby');
    if (page === 'caisses') renderGame(view, games.find('cases'), { caseId: arg });
    else if (page === 'jeu' && arg === 'cases') { location.replace('#/caisses'); return; }
    else if (page === 'jeu' && games.find(arg)) renderGame(view, games.find(arg));
    else if (page === 'dashboard') renderProfile(view);
    else if (page === 'profil') unmountView = DP.profile.render(view);
    else if (page === 'admin') unmountView = DP_DASH.admin(view, { rerender: route });
    else if (page === 'progression') unmountView = DP.progress.render(view);
    else if (page === 'inventaire') renderInventory(view);
    else if (page === 'codes') renderCodes(view);
    else renderLobby(view);
    closeSidebar();
  }

  const brand = () => `<span class="brand__mark">${I('crown')}</span><span class="brand__name">Dave’s Palace</span>`;
  // Rayons du lobby (et groupes du menu)
  const CATS = ['Originaux', 'Table', 'Machines', 'En direct'];
  const CAT_OF = { machine: 'Machines', wheel: 'En direct', roulette: 'Table', blackjack: 'Table', upgrade: 'Collection' };
  const catOf = (g) => CAT_OF[g.id] || 'Originaux';
  const casinoGames = () => games.list.filter((g) => g.id !== 'cases');

  /* ---------- Page d'accueil / authentification ---------- */
  function renderLanding(mode) {
    document.body.className = 'is-landing';
    app.innerHTML = `
      <div class="landing">
        <button type="button" class="btn btn--ghost btn--sm back-intro">${I('arrow-left', 'i--sm')}Présentation</button>
        <div class="planet"></div>
        <div class="landing__hero">
          <div class="brand">${brand()}</div>
          <div class="landing__code" data-reveal>Station Palace · Accès membres</div>
          <h1 class="js-split">Le casino <span class="o">en orbite</span></h1>
          <p class="landing__tag" data-reveal>Le palace de Jean&#8209;Pascal Zadi. ${games.list.length} jeux originaux, des machines à sous à la roue en direct, joués en DaveCoins.</p>
          <ul class="landing__facts" data-reveal>
            <li><strong class="num">${games.list.length}</strong><span>Jeux</span></li>
            <li><strong class="num">1 000</strong><span>Coins offerts</span></li>
            <li><strong class="num">99 %</strong><span>RTP max</span></li>
          </ul>
        </div>
        <div class="landing__king"><div class="orbit orbit-spin"></div><img src="${IMG}jpz.png" alt=""></div>
        <div class="ringed" aria-hidden="true">
          <div class="ringed__ring ringed__ring--back"></div>
          <div class="ringed__ball"></div>
          <div class="ringed__ring ringed__ring--front"></div>
          <div class="ringed__orbit"><i></i></div>
        </div>
        <div class="landing__card">${cards.byId['royale:charis'] ? cards.html(cards.byId['royale:charis']) : ''}</div>
        <div class="auth-card" data-reveal>
          <div class="seg seg--tabs">
            <button type="button" data-m="login">Connexion</button>
            <button type="button" data-m="register">Inscription</button>
          </div>
          <form class="auth-form" novalidate>
            <h2></h2>
            <p class="auth-form__sub"></p>
            <label class="field"><span>Pseudo</span><input name="user" autocomplete="username" maxlength="20" required placeholder="Ton pseudo"></label>
            <label class="field"><span>Mot de passe</span><input name="pass" type="password" required placeholder="••••••"></label>
            <p class="auth-form__error" role="alert"></p>
            <button class="btn btn--primary btn--lg btn--block" type="submit"></button>
          </form>
        </div>
      </div>`;
    M.splitWords(app.querySelector('.js-split'), 150);
    M.reveal(app, '[data-reveal]', 350);
    M.magnetic(app.querySelectorAll('.btn--primary'), 0.15);

    const form = app.querySelector('form');
    const err = form.querySelector('.auth-form__error');
    const tabs = app.querySelectorAll('.seg--tabs button');
    const paint = () => {
      tabs.forEach((t) => t.classList.toggle('on', t.dataset.m === mode));
      const reg = mode === 'register';
      form.querySelector('h2').textContent = reg ? 'Embarquement' : 'Connexion';
      form.querySelector('.auth-form__sub').innerHTML = reg
        ? `Tu reçois <strong class="num">1 000</strong> ${ui.coin('coin--xs')} pour commencer.`
        : 'Connecte-toi pour retrouver tes DaveCoins.';
      form.querySelector('button[type=submit]').innerHTML = (reg ? 'Créer mon compte' : 'Entrer au Palace') + I('chevron-right', 'i--sm');
      form.pass.autocomplete = reg ? 'new-password' : 'current-password';
      err.textContent = '';
    };
    tabs.forEach((t) => t.addEventListener('click', () => { mode = t.dataset.m; paint(); sound.play('click'); history.replaceState(null, '', mode === 'register' ? '#/inscription' : '#/connexion'); }));
    app.querySelector('.back-intro').addEventListener('click', () => (window.DP_INTRO ? DP_INTRO.transitionTo('#/') : (location.hash = '#/')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fn = mode === 'register' ? auth.register : auth.login;
      const problem = fn(form.user.value, form.pass.value);
      if (problem) { err.textContent = problem; sound.play('error'); return; }
      sound.play('coin');
      form.querySelector('button[type=submit]').disabled = true;
      if (window.DP_INTRO) DP_INTRO.transitionTo('#/lobby');
      else { location.hash = '#/lobby'; route(); }
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
            <span class="wallet__bal">${ui.coin('coin--sm')}<span class="wallet__amount num">0</span></span>
            <button class="wallet__bonus" type="button" aria-label="Bonus">${I('gift')}<span>Bonus</span></button>
          </div>
          <div class="topbar__right">
            <button class="icon-btn sound-btn" type="button" aria-label="Son"></button>
            <a class="lvl-chip js-lvl" href="#/progression" title="Ta progression"></a>
            <a class="user-chip js-userchip" href="#/profil">${DP.profile.avatarHtml(user)}<span class="user-chip__name">${esc(user)}</span></a>
          </div>
        </header>
        <nav class="sidebar">
          <a class="nav-item" data-nav="lobby" href="#/lobby">${I('castle')}Lobby</a>
          <div class="nav-title">Collection</div>
          <a class="nav-item nav-item--hero" data-nav="caisses" href="#/caisses">${I('package-open')}Caisses<span class="nav-tag">Ouvrir</span></a>
          <a class="nav-item" data-nav="inventaire" href="#/inventaire">${I('layers-2')}Inventaire<span class="nav-tag nav-tag--count js-invcount"></span></a>
          <a class="nav-item" data-nav="upgrade" href="#/jeu/upgrade">${I('trending-up')}DaveUpgrade<span class="nav-tag">Nouveau</span></a>
          ${CATS.map((c) => {
            const list = casinoGames().filter((g) => catOf(g) === c);
            return list.length ? `<div class="nav-title">${c}</div>` + list.map((g) => `<a class="nav-item" data-nav="${g.id}" href="#/jeu/${g.id}">${I(g.icon)}${g.name}${g.isNew ? '<span class="nav-tag">Nouveau</span>' : ''}</a>`).join('') : '';
          }).join('')}
          <div class="nav-title">Compte</div>
          <a class="nav-item" data-nav="profil" href="#/profil">${I('user')}Mon profil</a>
          <a class="nav-item" data-nav="dashboard" href="#/dashboard">${I('layout-dashboard')}Dashboard</a>
          <a class="nav-item" data-nav="progression" href="#/progression">${I('trophy')}Progression<span class="nav-tag js-mistag" hidden></span></a>
          <button class="nav-item js-bonus" type="button">${I('gift')}Bonus</button>
          <a class="nav-item" data-nav="codes" href="#/codes">${I('ticket')}Codes</a>
          <a class="nav-item" data-nav="admin" href="#/admin">${I('shield')}Admin</a>
          <button class="nav-item logout" type="button">${I('log-out')}Déconnexion</button>
          <div class="sidebar__foot"><p>Jeu fictif, aucun argent réel. Les DaveCoins n’ont aucune valeur.</p></div>
        </nav>
        <div class="scrim"></div>
        <main id="view"></main>
      </div>`;

    app.querySelector('.burger').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    app.querySelector('.scrim').addEventListener('click', closeSidebar);
    app.querySelector('.logout').addEventListener('click', () => {
      if (window.DP_INTRO) { DP_INTRO.transitionTo('#/', () => auth.logout()); return; }
      auth.logout(); location.hash = ''; route();
    });
    app.querySelector('.wallet__bonus').addEventListener('click', openBonus);
    app.querySelector('.js-bonus').addEventListener('click', () => { closeSidebar(); openBonus(); });
    const sb = app.querySelector('.sound-btn');
    const paintSound = () => (sb.innerHTML = I(sound.muted ? 'volume-x' : 'volume-2'));
    sb.addEventListener('click', () => { sound.toggle(); paintSound(); sound.play('click'); });
    paintSound();
    refreshTopbar();
    paintInvCount();
    paintLevel();
  }
  /** Niveau, barre d'XP et missions à récupérer (barre du haut + menu). */
  function paintLevel() {
    const el = document.querySelector('.js-lvl');
    const sm = DP.progress && DP.progress.summary();
    if (!el || !sm) return;
    el.style.setProperty('--rc', sm.rank.c);
    el.innerHTML = `${DP.progress.badge(sm.level, 30)}<span class="lvl-chip__txt"><b>Niv. ${sm.level}</b><i><em style="width:${(sm.pct * 100).toFixed(1)}%"></em></i></span>`;
    const tag = document.querySelector('.js-mistag');
    if (tag) { tag.hidden = !sm.claimable; tag.textContent = sm.claimable ? String(sm.claimable) : ''; tag.title = 'Missions à récupérer'; }
  }
  on('progress', paintLevel);
  on('profile', () => {
    const chip = document.querySelector('.js-userchip');
    if (chip && auth.current()) chip.innerHTML = `${DP.profile.avatarHtml(auth.current())}<span class="user-chip__name">${esc(auth.current())}</span>`;
  });
  function paintInvCount() {
    const el = document.querySelector('.js-invcount');
    if (!el) return;
    const n = inventory.totals().copies;
    el.textContent = n ? String(n) : '';
    el.hidden = !n;
  }
  on('inventory', paintInvCount);

  function closeSidebar() { document.body.classList.remove('nav-open'); }
  function setActiveNav(key) {
    document.querySelectorAll('.nav-item[data-nav]').forEach((n) => n.classList.toggle('on', n.dataset.nav === key));
    const nav = document.querySelector('.sidebar');
    if (nav) M.navIndicator(nav);
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
  /* Roue quotidienne : disque en relief, séparateurs dorés, case 5 000 en or */
  function drawDaily(g, S, ang, hi) {
    const colorOf = (v, i) => (v >= 5000 ? '#ffc145' : v >= 1000 ? '#ff6b2c' : v >= 500 ? '#c04dff' : i % 2 ? '#26304f' : '#33416b');
    ui.wheel(g, S, ang, bonus.DAILY_WHEEL.map(([v], i) => ({
      c: colorOf(v, i), label: fmt(v), ink: v >= 1000 ? '#170800' : '#f4f6fb', size: v >= 1000 ? 0.11 : 0.095, icon: v >= 5000 ? 'star' : 'coin'
    })), { hi, labelR: 0.7 });
  }

  window.DP_DRAW_DAILY = drawDaily; // réutilisée par la page de présentation

  function openBonus() {
    sound.play('click');
    const modal = ui.el(`<div class="modal" role="dialog" aria-modal="true">
      <div class="modal__card modal__card--wheel">
        <button class="modal__close icon-btn" type="button" aria-label="Fermer">${I('x')}</button>
        <h3>${I('gift')}Roue quotidienne</h3>
        <p class="muted" style="margin:0 0 16px">Une rotation gratuite toutes les 12 h. Jusqu’à <strong class="num" style="color:var(--coin)">${fmt(bonus.DAILY_MAX)}</strong> DaveCoins.</p>
        <div class="dwheel">
          <canvas></canvas>
          <div class="wheel-spot"></div>
          <div class="gem-pointer"><svg viewBox="0 0 40 52"><path d="M20 52 L4 18 L12 4 H28 L36 18 Z" fill="#ffc145"/><path d="M20 52 L12 18 L20 6 L28 18 Z" fill="#fff3c8" opacity=".7"/><path d="M4 18 H36" stroke="#7a4b00" stroke-width="1.5"/></svg></div>
          <div class="dwheel__hub"><img src="${IMG}jppz.jpg" alt="JPZ"></div>
        </div>
        <button class="btn btn--primary btn--lg btn--block dwheel__btn" data-b="daily" type="button"></button>
        <div class="bonus-row">
          <div><strong>${I('hand-coins', 'i--sm')}Dave te dépanne</strong><span>+${fmt(bonus.RESCUE_AMOUNT)} ${ui.coin('coin--xs')} si ton solde est à 0 (1 fois / heure)</span></div>
          <button class="btn btn--ghost" data-b="rescue" type="button"></button>
        </div>
      </div>
    </div>`);
    document.body.appendChild(modal);
    const card = modal.querySelector('.modal__card');
    const box = modal.querySelector('.dwheel');
    ui.bulbs(box, 30);
    const cv = box.querySelector('canvas');
    const g = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const S = box.clientWidth;
    cv.width = cv.height = Math.round(S * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    let ang = 0, spinning = false, hi = null, idleRaf = 0;
    const W = bonus.DAILY_WHEEL, seg = (Math.PI * 2) / W.length;
    drawDaily(g, S, ang, hi);
    if (document.fonts) document.fonts.ready.then(() => drawDaily(g, S, ang, hi));
    // la roue tourne doucement tant qu'on n'a pas lancé
    let lt = performance.now();
    const idle = (now) => {
      if (!modal.isConnected) return;
      if (!spinning && hi == null) { ang += (now - lt) * 0.0002; drawDaily(g, S, ang, hi); }
      lt = now;
      idleRaf = requestAnimationFrame(idle);
    };
    idleRaf = requestAnimationFrame(idle);

    const daily = modal.querySelector('[data-b=daily]');
    const rescue = modal.querySelector('[data-b=rescue]');
    const paint = () => {
      if (!modal.isConnected) { clearInterval(timer); return; }
      const d = bonus.dailyLeft();
      daily.disabled = d > 0 || spinning;
      daily.innerHTML = spinning ? 'La roue tourne…' : d > 0 ? `Prochaine rotation dans <span class="num">${countdown(d)}</span>` : `${I('play', 'i--sm')}Tourner la roue`;
      const r = bonus.rescueLeft();
      rescue.disabled = !bonus.canRescue();
      rescue.textContent = wallet.get() >= 1 ? 'Solde > 0' : r > 0 ? countdown(r) : 'Récupérer';
    };
    paint();
    const timer = setInterval(paint, 1000);
    const close = () => { if (spinning) return; clearInterval(timer); cancelAnimationFrame(idleRaf); modal.remove(); };
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelector('.modal__close').addEventListener('click', close);

    daily.addEventListener('click', () => {
      if (spinning || bonus.dailyLeft() > 0) return;
      const idx = bonus.drawDaily();
      spinning = true; hi = null; paint();
      box.classList.remove('is-win');
      box.classList.add('is-spinning');
      sound.play('whoosh');
      // angle final : la case idx s'arrête sous le pointeur, avec 6 tours complets
      const from = ang;
      const base = from - (from % (Math.PI * 2)) + Math.PI * 2 * 6;
      const to = base + (Math.PI * 2 - idx * seg) + (rng.float() - 0.5) * seg * 0.6;
      const t0 = performance.now(), dur = 5200;
      let lastSeg = -1;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        ang = from + (to - from) * (1 - Math.pow(1 - k, 3.4));
        const sIdx = Math.floor((ang + seg / 2) / seg);
        if (sIdx !== lastSeg) { lastSeg = sIdx; sound.play('tick', { p: 2 * (1 - k) }); }
        drawDaily(g, S, ang, null);
        if (k < 1 && modal.isConnected) { requestAnimationFrame(step); return; }
        // récompense
        hi = idx;
        box.classList.remove('is-spinning');
        box.style.setProperty('--win-c', bonus.DAILY_WHEEL[idx][0] >= 1000 ? '#ffc145' : '#ff6b2c');
        box.classList.add('is-win');
        setTimeout(() => box.classList.remove('is-win'), 3500);
        drawDaily(g, S, ang, hi);
        const gain = bonus.claimDaily(idx);
        spinning = false;
        paint();
        const big = gain >= 1000;
        sound.play(big ? 'jackpot' : 'win', { x: gain / 100 });
        if (big) sound.play('slam');
        ui.burst(box, { n: big ? 70 : 30, colors: ['#ffc145', '#ff6b2c', '#ffffff'], spread: big ? 2.4 : 1.4 });
        ui.coinRain(card, big ? 60 : 25);
        ui.shake(card, big ? 2 : 1);
        ui.floatText(box, '+' + fmt(gain));
        ui.toast(`Roue quotidienne : +${fmt(gain)} DaveCoins`, 'win');
      };
      requestAnimationFrame(step);
    });
    rescue.addEventListener('click', () => { const g2 = bonus.claimRescue(); if (g2) { sound.play('coin'); ui.toast(`+${fmt(g2)} DaveCoins, reviens plus fort !`, 'win'); } paint(); });
  }


  /* ---------- Lobby ---------- */
  function renderLobby(view) {
    const user = auth.current();
    const s = stats.get();
    const featured = games.list.find((g) => g.hot) || games.list[0];
    view.innerHTML = `
      <section class="hero" data-reveal>
        <div class="planet"></div>
        <div class="hero__text">
          <div class="hero__code">${new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir'} ${esc(user)} · ${DP.cases.list.length} caisses · ${casinoGames().length} jeux</div>
          <h1 class="js-split">Le roi t’attend <em>en orbite</em></h1>
          <p>Gagne des DaveCoins au casino, ouvre des caisses et collectionne les cartes de la bande. Vends tes doubles ou complète les albums pour débloquer leurs récompenses.</p>
          <div class="hero__cta">
            <a class="btn btn--primary btn--lg js-mag" href="#/caisses">${I('package-open', 'i--sm')}Ouvrir des caisses</a>
            <a class="btn btn--ghost btn--lg js-mag" href="#/jeu/${featured.id}">${I('play', 'i--sm')}${featured.name}</a>
            <button class="btn btn--ghost btn--lg hero-bonus js-mag" type="button">${I('gift', 'i--sm')}Roue du jour</button>
          </div>
        </div>
        <div class="hero__art"><div class="orbit orbit-spin o1"></div><div class="orbit orbit-spin rev o2"></div><div class="king"><img src="${IMG}jpz.png" alt="Jean-Pascal Zadi"></div></div>
      </section>

      <div class="ticker" data-reveal><div class="ticker__track">${tickerHtml()}${tickerHtml()}</div></div>

      <a class="jpbar" href="#/jeu/machine" data-reveal>
        <span class="jpbar__label">${I('crown', 'i--sm')}Jackpot global</span>
        <b class="jpbar__amount num js-jpbar">${fmt(DP.jackpot.get())}</b>
        <span class="jpbar__meta">${DP.jackpot.last() ? `Dernier gagnant : <b>${esc(DP.jackpot.last().name)}</b> · ${fmt(DP.jackpot.last().amount)}` : '5 cartes Free JPZ ou jackpot mystère sur DaveMachine'}</span>
        <span class="jpbar__go">Tenter ma chance${I('chevron-right', 'i--sm')}</span>
      </a>

      <section class="statbar" data-reveal>
        <div><span>Solde</span><strong>${ui.coin('coin--sm')}<b class="js-bal" style="font-weight:inherit">${fmt(wallet.get())}</b></strong></div>
        <div><span>Parties jouées</span><strong class="js-played">${fmt(s.played)}</strong></div>
        <div><span>Cartes collectées</span><strong><b style="font-weight:inherit">${inventory.totals().unique}</b><small class="muted" style="font-size:15px">/ ${Object.keys(cards.byId).length}</small></strong></div>
        <div><span>Valeur de l’inventaire</span><strong>${ui.coin('coin--sm')}${fmt(inventory.totals().value)}</strong></div>
      </section>

      <div class="section-head" data-reveal>
        <h2>Les caisses <small class="num">${String(DP.cases.list.length).padStart(2, '0')}</small></h2>
        <a href="#/inventaire">Mon inventaire · <span class="num">${inventory.totals().unique}/${Object.keys(cards.byId).length}</span> cartes${I('chevron-right', 'i--sm')}</a>
      </div>
      <section class="lobby-vault" data-reveal>
        ${DP.cases.list.map((c) => {
          const set = cards.sets.find((x) => x.id === c.id);
          const pr = inventory.setProgress(set);
          return `<a class="lv-item" href="#/caisses/${c.id}" style="--c:${c.color}">
            ${DP.cases.crateHtml(c)}
            <span class="lv-item__name">${c.name}</span>
            <span class="lv-item__row"><span class="lv-item__price">${ui.coin('coin--xs')}<b class="num">${fmt(c.price)}</b></span><span class="lv-item__album num">${pr.owned}/${pr.total}</span></span>
            <span class="lv-item__bar"><i style="width:${pr.owned / pr.total * 100}%"></i></span>
          </a>`;
        }).join('')}
      </section>

      <div class="section-head" data-reveal>
        <h2>Le casino <small class="num">${String(casinoGames().length).padStart(2, '0')}</small></h2>
        <div class="seg js-filter">${['Tous', ...CATS].map((c) => `<button type="button" data-c="${c}" class="${c === 'Tous' ? 'on' : ''}">${c}</button>`).join('')}</div>
      </div>
      <section class="games-grid">
        ${casinoGames().map((g) => `
          <a class="game-card" href="#/jeu/${g.id}" data-c="${catOf(g)}" style="--h:${g.hue}">
            <div class="game-card__art">${g.art || `<span class="game-card__icon">${I(g.icon)}</span>`}</div>
            ${g.isNew ? '<span class="badge badge--new">Nouveau</span>' : g.hot ? '<span class="badge badge--hot">Populaire</span>' : ''}
            <div class="game-card__body">
              <div>
                <h3>${g.name}</h3>
                <p><span>${catOf(g)}</span><span class="num">RTP ${g.rtp}</span></p>
              </div>
              <span class="game-card__go">${I('chevron-right', 'i--sm')}</span>
            </div>
          </a>`).join('')}
      </section>

      <div class="section-head"><h2>Dernières parties</h2><a href="#/dashboard">Tout l’historique${I('chevron-right', 'i--sm')}</a></div>
      ${historyTable(s.history.slice(0, 8))}`;

    // filtres du catalogue
    const filter = view.querySelector('.js-filter');
    filter.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      filter.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      const cards = [...view.querySelectorAll('.game-card')];
      cards.forEach((c) => (c.hidden = b.dataset.c !== 'Tous' && c.dataset.c !== b.dataset.c));
      // les cartes restantes se replacent en cascade
      cards.filter((c) => !c.hidden).forEach((c, i) => c.animate([{ opacity: 0, transform: 'translateY(16px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: i * 40, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
      sound.play('click');
    });
    M.splitWords(view.querySelector('.js-split'), 200);
    M.reveal(view, '[data-reveal]');
    M.onView([...view.querySelectorAll('.game-card')], 250);
    M.tilt(view.querySelectorAll('.game-card'));
    M.tilt(view.querySelectorAll('.lv-item'), 10);
    M.magnetic(view.querySelectorAll('.js-mag'), 0.18);
    const bal = view.querySelector('.js-bal');
    M.countUp(bal, wallet.get(), fmt);
    M.countUp(view.querySelector('.js-played'), s.played, (v) => fmt(Math.round(v)));
    view.querySelector('.hero-bonus').addEventListener('click', openBonus);
    const offBal = on('balance', () => { const b = view.querySelector('.js-bal'); if (b) b.textContent = fmt(wallet.get()); });
    // jackpot qui monte en direct
    let jpShown = DP.jackpot.get(), jpRaf = 0;
    const jpEl = view.querySelector('.js-jpbar');
    const jpTick = () => {
      const target = DP.jackpot.get();
      jpShown = target < jpShown ? target : jpShown + (target - jpShown) * 0.06;
      if (Math.abs(target - jpShown) < 0.01) jpShown = target;
      jpEl.textContent = fmt(Math.round(jpShown * 100) / 100);
      jpRaf = jpShown !== target ? requestAnimationFrame(jpTick) : 0;
    };
    const offJp = on('jackpot', () => { if (!jpRaf) jpRaf = requestAnimationFrame(jpTick); });
    unmountView = () => { offBal(); offJp(); cancelAnimationFrame(jpRaf); };
    DP.emit('lobby');
  }

  function tickerHtml() {
    const crew = [['Olman', 'olman.png'], ['Tdam', 'tdam.png'], ['Sévaré', 'sevare.png'], ['Slymefire', 'slymefire.png'], ['AXB', 'axb.png'], ['Sauce Blanche', 'sauceblanche.png'],
      ['Billy', 'billy.jpg'], ['Carl', 'carl.jpg'], ['Linkay', 'linkay.jpg'], ['Lucasco', 'lucasco.jpg'], ['Petit Bonnin', 'petitbonnin.jpg'], ['Yohan', 'yohan.jpg'], ['Tddam', 'tddam.jpg']];
    return Array.from({ length: 10 }, () => {
      const [name, img] = rng.pick(crew);
      const g = rng.pick(games.list);
      const amount = rng.pick([12, 40, 75, 150, 320, 640, 1200, 2500]) * (rng.float() < 0.1 ? 10 : 1);
      return `<span class="ticker__item"><i class="ticker__dot"></i><img src="${IMG}${img}" alt=""><b>${name}</b> gagne <span class="pos num">+${fmt(amount)}</span> sur ${g.name}</span>`;
    }).join('');
  }

  function historyTable(rows) {
    if (!rows.length) return `<div class="empty">${I('history', 'i--lg')}<strong>Aucune partie pour l’instant</strong>Tes 50 dernières parties s’afficheront ici avec la mise, le multiplicateur et le gain.</div>`;
    return `<div class="table-wrap"><table class="history">
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

  /** Fusion : 5 cartes convergent, éclair, la carte brillante apparaît. */
  async function fuseAnim(card) {
    const ov = ui.el(`<div class="fuse" role="dialog" aria-label="Fusion">
      <div class="fuse__stage">${Array.from({ length: inventory.FUSE_COST }, (_, i) => `<div class="fuse__c" style="--k:${i - 2}">${cards.html(card, { compact: true })}</div>`).join('')}
        <div class="fuse__flash"></div><div class="fuse__res">${cards.html(card, { shiny: true })}</div></div>
      <p class="fuse__txt">Fusion en cours…</p>
    </div>`);
    document.body.appendChild(ov);
    const cs = [...ov.querySelectorAll('.fuse__c')], res = ov.querySelector('.fuse__res'), txt = ov.querySelector('.fuse__txt');
    ov.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });
    sound.play('whoosh');
    const ease = 'cubic-bezier(.6,0,.2,1)';
    cs.forEach((c, i) => c.animate([
      { transform: `translate(calc(-50% + ${(i - 2) * 150}px), -50%) rotate(${(i - 2) * 8}deg)`, filter: 'brightness(1)' },
      { transform: `translate(calc(-50% + ${(i - 2) * 160}px), -55%) rotate(${(i - 2) * 10}deg)`, filter: 'brightness(1.2)', offset: 0.3 },
      { transform: 'translate(-50%, -50%) rotate(720deg) scale(.4)', filter: 'brightness(4)' }
    ], { duration: 1300, delay: 250 + i * 40, easing: ease, fill: 'forwards' }));
    for (let i = 0; i < 8; i++) setTimeout(() => sound.play('streak', { i }), 400 + i * 120);
    await sleep(1550);
    cs.forEach((c) => (c.style.visibility = 'hidden'));
    ov.querySelector('.fuse__flash').animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.2)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.4)', offset: 0.3 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(2.4)' }], { duration: 900, easing: 'ease-out' });
    sound.play('slam'); sound.play('jackpot');
    ui.shake(ov.querySelector('.fuse__stage'), 2);
    res.style.visibility = 'visible';
    res.animate([{ transform: 'translate(-50%,-50%) scale(.2) rotateY(180deg)', filter: 'brightness(4)' }, { transform: 'translate(-50%,-50%) scale(1.12) rotateY(0)', filter: 'brightness(1.6)', offset: 0.6 }, { transform: 'translate(-50%,-50%) scale(1)', filter: 'brightness(1)' }], { duration: 900, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
    ui.burst(res, { n: 90, colors: ['#ffffff', '#ffc145', card.rarity.c, '#ff5ec4', '#5ee0ff'], spread: 3 });
    txt.innerHTML = `<b>${esc(card.name)} brillante !</b><span>Valeur ×${inventory.SHINY_MULT} · <span class="num">${fmt(card.value * inventory.SHINY_MULT)}</span> DaveCoins</span><small>Touche pour continuer</small>`;
    txt.classList.add('done');
    await new Promise((r) => { const t = setTimeout(r, 4500); ov.addEventListener('click', () => { clearTimeout(t); r(); }, { once: true }); });
    await ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished;
    ov.remove();
  }

  /* ---------- Inventaire ---------- */
  function renderInventory(view) {
    let tab = 'cards', rar = 'all', sort = 'rarity', confirmAll = false;
    const RARS = ['Commun', 'Peu commun', 'Rare', 'Épique', 'Légendaire', 'Mythique'];
    const totalCards = Object.keys(cards.byId).length;
    view.innerHTML = `
      <div class="page-head" data-reveal>
        <span class="game-head__ico">${I('layers-2', 'i--lg')}</span>
        <div><h1>Inventaire</h1><p>Tes cartes gagnées dans les caisses : vends-les pour récupérer des DaveCoins ou garde-les pour compléter tes albums.</p></div>
      </div>
      <section class="statbar js-invstats" data-reveal></section>
      <div class="section-head" data-reveal>
        <div class="seg js-tab"><button type="button" data-t="cards" class="on">Mes cartes</button><button type="button" data-t="sets">Collection</button></div>
        <span class="inv-links"><a href="#/jeu/upgrade">${I('trending-up', 'i--sm')}DaveUpgrade</a><a href="#/caisses">Ouvrir des caisses${I('chevron-right', 'i--sm')}</a></span>
      </div>
      <div class="js-body"></div>`;
    const statsEl = view.querySelector('.js-invstats');
    const body = view.querySelector('.js-body');

    function paintStats() {
      const t = inventory.totals();
      const done = cards.sets.filter((st) => inventory.setProgress(st).complete).length;
      statsEl.innerHTML = `
        <div><span>Cartes</span><strong class="num">${fmt(t.copies)}</strong></div>
        <div><span>Cartes différentes</span><strong class="num">${t.unique}<small class="muted" style="font-size:15px">/ ${totalCards}</small></strong></div>
        <div><span>Valeur de revente</span><strong>${ui.coin('coin--sm')}<b class="num" style="font-weight:inherit">${fmt(t.value)}</b></strong></div>
        <div><span>Albums complets</span><strong class="num">${done}<small class="muted" style="font-size:15px">/ ${cards.sets.length}</small></strong></div>`;
    }

    function paintCards() {
      let list = inventory.entries();
      if (!list.length) {
        body.innerHTML = `<div class="empty">${I('gift', 'i--lg')}<strong>Aucune carte pour l’instant</strong>Ouvre ta première caisse : les cartes gagnées arrivent ici.<a class="btn btn--primary" style="margin-top:10px" href="#/caisses">Voir les caisses</a></div>`;
        return;
      }
      if (rar === 'shiny') list = list.filter((x) => x.shiny);
      else if (rar !== 'all') list = list.filter((x) => x.card.rarity.label === rar);
      const order = { rarity: (a, b) => b.shiny - a.shiny || b.card.rarity.lvl - a.card.rarity.lvl || b.card.value - a.card.value, value: (a, b) => b.card.value - a.card.value, set: (a, b) => a.card.set.localeCompare(b.card.set) || a.card.no - b.card.no };
      list.sort(order[sort]);
      const dupValue = inventory.entries().filter((x) => !x.shiny).reduce((a, x) => a + x.card.value * (x.n - 1), 0);
      const FUSE = inventory.FUSE_COST;
      const allValue = inventory.totals().value;
      body.innerHTML = `
        <div class="inv-tools">
          <div class="seg js-rar">${['all', ...RARS, 'shiny'].map((r) => `<button type="button" data-r="${r}" class="${r === rar ? 'on' : ''}">${r === 'all' ? 'Toutes' : r === 'shiny' ? '★ Brillantes' : r}</button>`).join('')}</div>
          <div class="seg js-sort">${[['rarity', 'Rareté'], ['value', 'Valeur'], ['set', 'Album']].map(([k, l]) => `<button type="button" data-s="${k}" class="${k === sort ? 'on' : ''}">${l}</button>`).join('')}</div>
          <div class="inv-tools__sell">
            <button type="button" class="btn btn--ghost btn--sm js-selldup" ${dupValue ? '' : 'disabled'}>${I('copy', 'i--sm')}Vendre les doublons · <span class="num">${fmt(dupValue)}</span></button>
            <button type="button" class="btn ${confirmAll ? 'btn--primary' : 'btn--ghost'} btn--sm js-sellall">${I('coins', 'i--sm')}${confirmAll ? 'Confirmer la vente de tout' : 'Tout vendre'} · <span class="num">${fmt(allValue)}</span></button>
          </div>
        </div>
        ${list.length ? `<div class="inv-grid">${list.map((x) => `<div class="inv-slot">${cards.html(x.card, { count: x.n, shiny: x.shiny })}
          ${!x.shiny && x.n >= FUSE ? `<button type="button" class="btn btn--primary btn--sm js-fuse" data-id="${x.card.id}">${I('sparkles', 'i--sm')}Fusionner ${FUSE} → 1 brillante</button>` : ''}
          <button type="button" class="btn btn--ghost btn--sm js-sell" data-id="${x.card.id}" data-shiny="${x.shiny ? 1 : ''}">Vendre · <span class="num">${fmt(x.card.value * (x.shiny ? inventory.SHINY_MULT : 1))}</span></button>
          ${!x.shiny && x.n > 1 && x.n < FUSE ? `<small class="inv-slot__fuse">${x.n}/${FUSE} pour une brillante</small>` : ''}</div>`).join('')}</div>`
          : `<div class="empty">${I('layers-2', 'i--lg')}<strong>Aucune carte ${rar.toLowerCase()}</strong>Change de filtre pour voir tes autres cartes.</div>`}`;
      DP_MOTION.onView([...body.querySelectorAll('.inv-slot')]);
      DP_MOTION.tilt(body.querySelectorAll('.tcard'), 12);
    }

    function paintSets() {
      body.innerHTML = `<div class="albums">${cards.sets.map((st) => {
        const pr = inventory.setProgress(st);
        const btn = pr.claimed ? `<span class="album__done">${I('trophy', 'i--sm')}Récompense reçue</span>`
          : pr.complete ? `<button type="button" class="btn btn--primary btn--sm js-claim" data-set="${st.id}">${I('trophy', 'i--sm')}Récupérer ${fmt(st.reward)}</button>`
            : `<span class="muted">Album complet : <b class="num" style="color:var(--coin)">${fmt(st.reward)}</b> DaveCoins</span>`;
        return `<section class="album" style="--c:${st.color}">
          <div class="album__head">
            <img src="${IMG}${st.cover}" alt="">
            <div><h3>${st.name}</h3><div class="album__bar"><i style="width:${pr.owned / pr.total * 100}%"></i></div><span class="muted num">${pr.owned}/${pr.total} cartes</span></div>
            <div class="album__cta">${btn}</div>
          </div>
          <div class="album__cards">${st.cards.map((c) => { const n = inventory.count(c.id), sh = inventory.shinyCount(c.id); return cards.html(c, { owned: n + sh > 0, count: n, compact: true, shiny: sh > 0 && !n }); }).join('')}</div>
        </section>`;
      }).join('')}</div>`;
      DP_MOTION.onView([...body.querySelectorAll('.album')]);
    }

    const paint = () => { paintStats(); tab === 'cards' ? paintCards() : paintSets(); };
    view.querySelector('.js-tab').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      tab = b.dataset.t;
      view.querySelectorAll('.js-tab button').forEach((x) => x.classList.toggle('on', x === b));
      sound.play('click');
      paint();
    });
    body.addEventListener('click', (e) => {
      const r = e.target.closest('.js-rar button');
      if (r) { rar = r.dataset.r; sound.play('click'); paintCards(); return; }
      const so = e.target.closest('.js-sort button');
      if (so) { sort = so.dataset.s; sound.play('click'); paintCards(); return; }
      const one = e.target.closest('.js-sell');
      if (one) {
        const got = inventory.sell(one.dataset.id, 1, !!one.dataset.shiny);
        if (got) { sound.play('coin'); ui.floatText(one, '+' + fmt(got)); }
        paint();
        return;
      }
      if (e.target.closest('.js-selldup')) {
        let sum = 0;
        inventory.entries().forEach((x) => { if (x.n > 1 && !x.shiny) sum += inventory.sell(x.card.id, x.n - 1); });
        if (sum) { sound.play('cashout'); ui.toast(`Doublons vendus : +${fmt(sum)} DaveCoins`, 'win'); }
        paint();
        return;
      }
      if (e.target.closest('.js-sellall')) {
        // deux clics : le premier demande confirmation
        if (!confirmAll) { confirmAll = true; sound.play('click'); paintCards(); setTimeout(() => { if (confirmAll) { confirmAll = false; if (view.isConnected && tab === 'cards') paintCards(); } }, 4000); return; }
        confirmAll = false;
        let sum = 0;
        inventory.entries().forEach((x) => (sum += inventory.sell(x.card.id, x.n, x.shiny)));
        if (sum) { sound.play('jackpot'); ui.coinRain(body, 40); ui.toast(`Inventaire vendu : +${fmt(sum)} DaveCoins`, 'win'); }
        paint();
        return;
      }
      const fz = e.target.closest('.js-fuse');
      if (fz) {
        const card = cards.byId[fz.dataset.id];
        if (card && inventory.fuse(card.id)) fuseAnim(card).then(() => view.isConnected && paint());
        return;
      }
      const claim = e.target.closest('.js-claim');
      if (claim) {
        const st = cards.sets.find((x) => x.id === claim.dataset.set);
        const got = inventory.claimSet(st);
        if (got) { sound.play('jackpot'); sound.play('slam'); ui.coinRain(body, 60); ui.burst(claim, { n: 50, colors: ['#ffc145', '#ff6b2c', '#ffffff'], spread: 2 }); ui.toast(`Album complet : +${fmt(got)} DaveCoins !`, 'win'); }
        paint();
      }
    });
    paint();
    M.reveal(view, '[data-reveal]');
  }

  /* ---------- Codes promo ---------- */
  function renderCodes(view) {
    const paintUsed = () => {
      const used = promo.used();
      view.querySelector('.js-used').innerHTML = used.length
        ? `<div class="table-wrap"><table class="history"><thead><tr><th>Code</th><th class="num">Gain</th><th class="num">Date</th></tr></thead><tbody>${used.slice().reverse().map((u) => `<tr><td><span class="g">${I('ticket', 'i--sm')}${esc(u.code.toUpperCase())}</span></td><td class="num pos">+${fmt(u.amount)}</td><td class="num muted">${new Date(u.t).toLocaleDateString('fr-FR')}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="empty">${I('ticket', 'i--lg')}<strong>Aucun code utilisé</strong>Les codes que tu actives apparaîtront ici.</div>`;
    };
    view.innerHTML = `
      <div class="page-head" data-reveal>
        <span class="game-head__ico">${I('ticket', 'i--lg')}</span>
        <div><h1>Codes</h1><p>Un code te donne des DaveCoins. Chaque code ne fonctionne qu’une fois par compte.</p></div>
      </div>
      <form class="code-box" data-reveal novalidate>
        <label class="field"><span>Ton code</span><input name="code" autocomplete="off" spellcheck="false" maxlength="32" placeholder="Ex. DAVE33"></label>
        <button class="btn btn--primary btn--lg" type="submit">${I('sparkles', 'i--sm')}Activer</button>
        <p class="code-box__msg" role="status"></p>
      </form>
      <div class="section-head" data-reveal><h2>Codes utilisés</h2></div>
      <div class="js-used" data-reveal></div>`;
    const form = view.querySelector('.code-box');
    const msg = form.querySelector('.code-box__msg');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = promo.redeem(form.code.value);
      if (r.error) {
        msg.textContent = r.error; msg.className = 'code-box__msg neg';
        sound.play('error');
        form.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 260 });
        return;
      }
      msg.innerHTML = `Code ${esc(r.code.toUpperCase())} activé : <b class="num">+${fmt(r.amount)}</b> DaveCoins`;
      msg.className = 'code-box__msg pos';
      form.code.value = '';
      sound.play('jackpot');
      ui.coinRain(view, 50);
      ui.burst(form.querySelector('button'), { n: 50, colors: ['#ffc145', '#ff6b2c', '#ffffff'], spread: 2 });
      ui.toast(`+${fmt(r.amount)} DaveCoins`, 'win');
      paintUsed();
    });
    paintUsed();
    M.reveal(view, '[data-reveal]');
    form.code.focus();
  }

  /* ---------- Profil ---------- */
  function renderProfile(view) {
    unmountView = DP_DASH.player(view, { historyTable, openBonus });
  }

  /* ---------- Jeu ---------- */
  function renderGame(view, game, opts = {}) {
    view.innerHTML = `
      <div class="game-head" style="--h:${game.hue}">
        <span class="game-head__ico">${I(game.icon, 'i--lg')}</span>
        <div>
          <nav class="crumbs" aria-label="Fil d’Ariane"><a href="#/lobby">Lobby</a>${I('chevron-right')}<span>${game.id === 'cases' ? 'Collection' : catOf(game)}</span></nav>
          <h1>${game.name}</h1>
          <p>${game.tagline} · <span class="num">RTP ${game.rtp}</span></p>
        </div>
        <button class="btn btn--ghost btn--sm rules-btn" type="button">${I('book-open', 'i--sm')}Règles</button>
      </div>
      <div class="game-root"></div>`;
    view.querySelector('.rules-btn').addEventListener('click', () => {
      const modal = ui.el(`<div class="modal"><div class="modal__card">
        <button class="modal__close icon-btn" type="button" aria-label="Fermer">${I('x')}</button>
        <h3>${I(game.icon)}${game.name}</h3>${game.rules}<p class="muted">Taux de redistribution théorique : <span class="num">${game.rtp}</span></p></div></div>`);
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('.modal__close')) modal.remove(); });
    });
    const cleanup = game.mount(view.querySelector('.game-root'), opts);
    unmountView = typeof cleanup === 'function' ? cleanup : null;
    M.reveal(view, '.game-head, .panel, .stage');
    M.splitWords(view.querySelector('.game-head h1'), 80);
    M.magnetic(view.querySelectorAll('.panel .btn--lg'), 0.08);
  }

  /* ---------- Transitions entre les pages ----------
   * Sortie rapide (fondu, léger flou), rendu de la nouvelle page, entrée douce.
   * Un trait orange sous la barre du haut suit le chargement.
   */
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let navTimer = 0, navOut = null, bar = null;
  function routeBar(phase) {
    if (!bar) { bar = document.createElement('div'); bar.className = 'route-bar'; document.body.appendChild(bar); }
    bar.getAnimations().forEach((a) => a.cancel());
    if (phase === 'start') bar.animate([{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(.75)', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    else bar.animate([{ transform: 'scaleX(.75)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1, offset: 0.5 }, { transform: 'scaleX(1)', opacity: 0 }], { duration: 520, easing: 'ease-out', fill: 'forwards' });
  }
  /** Les images de la page apparaissent en fondu une fois chargées. */
  function softImages(root) {
    root.querySelectorAll('img').forEach((img) => {
      if (img.complete && img.naturalWidth) return;
      img.classList.add('img-soft', 'img-wait');
      const done = () => img.classList.remove('img-wait');
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }
  function enterView() {
    const view = document.getElementById('view');
    if (!view) return;
    softImages(view);
    if (reducedMotion()) return;
    view.animate([{ opacity: 0, transform: 'translateY(18px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
    routeBar('end');
  }
  function navigate() {
    const view = document.getElementById('view');
    clearTimeout(navTimer);
    if (navOut) { navOut.cancel(); navOut = null; }
    // hors de l'application (présentation, connexion) ou animations réduites : rendu direct
    if (!view || !view.firstElementChild || !auth.current() || reducedMotion()) { route(); enterView(); return; }
    routeBar('start');
    navOut = view.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-10px)', filter: 'blur(4px)' }], { duration: 180, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    navTimer = setTimeout(() => {
      if (navOut) { navOut.cancel(); navOut = null; }
      route();
      enterView();
    }, 180);
  }
  window.addEventListener('hashchange', navigate);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.modal').forEach((m) => m.remove()); });
  M.splash(I('crown'));
  route();
})();
