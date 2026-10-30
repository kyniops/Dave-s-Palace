/* Dave's Palace — coquille de l'application : routeur, barre du haut, pages. */
(function () {
  'use strict';
  const { IMG, auth, wallet, bonus, stats, sound, ui, games, fmt, fmtMult, esc, on, rng } = DP;
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
  // Rayons du lobby (et groupes du menu)
  const CATS = ['Originaux', 'Table', 'Machines', 'En direct'];
  const CAT_OF = { machine: 'Machines', wheel: 'En direct', roulette: 'Table', blackjack: 'Table' };
  const catOf = (g) => CAT_OF[g.id] || 'Originaux';

  /* ---------- Page d'accueil / authentification ---------- */
  function renderLanding(mode) {
    document.body.className = 'is-landing';
    app.innerHTML = `
      <div class="landing">
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
            <span class="wallet__bal">${ui.coin('coin--sm')}<span class="wallet__amount num">0</span></span>
            <button class="wallet__bonus" type="button" aria-label="Bonus">${I('gift')}<span>Bonus</span></button>
          </div>
          <div class="topbar__right">
            <button class="icon-btn sound-btn" type="button" aria-label="Son"></button>
            <a class="user-chip" href="#/profil"><span class="avatar">${esc(user.charAt(0).toUpperCase())}</span><span class="user-chip__name">${esc(user)}</span></a>
          </div>
        </header>
        <nav class="sidebar">
          <a class="nav-item" data-nav="lobby" href="#/lobby">${I('castle')}Lobby</a>
          ${CATS.map((c) => {
            const list = games.list.filter((g) => catOf(g) === c);
            return list.length ? `<div class="nav-title">${c}</div>` + list.map((g) => `<a class="nav-item" data-nav="${g.id}" href="#/jeu/${g.id}">${I(g.icon)}${g.name}${g.isNew ? '<span class="nav-tag">Nouveau</span>' : ''}</a>`).join('') : '';
          }).join('')}
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
  /* Roue quotidienne : dessin du disque (cases alternées, la case 5 000 en or) */
  function drawDaily(g, S, ang, hi) {
    const W = bonus.DAILY_WHEEL, n = W.length, seg = (Math.PI * 2) / n, R = S / 2;
    g.clearRect(0, 0, S, S);
    g.save(); g.translate(R, R); g.rotate(ang);
    W.forEach(([v], i) => {
      const a0 = i * seg - seg / 2 - Math.PI / 2, a1 = a0 + seg;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * 0.96, a0, a1); g.closePath();
      g.fillStyle = v >= 5000 ? '#ffc145' : v >= 1000 ? '#ff6b2c' : i % 2 ? '#141822' : '#1d2230';
      g.globalAlpha = hi != null && hi !== i ? 0.35 : 1;
      g.fill(); g.globalAlpha = 1;
      g.strokeStyle = '#05060a'; g.lineWidth = 2; g.stroke();
      g.save(); g.rotate(i * seg);
      g.fillStyle = v >= 1000 ? '#120600' : '#f1f2f5';
      g.font = `700 ${R * 0.1}px "Chakra Petch", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(fmt(v), 0, -R * 0.68);
      g.restore();
    });
    for (let i = 0; i < n; i++) {
      const a = i * seg + seg / 2 - Math.PI / 2;
      g.beginPath(); g.arc(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, R * 0.022, 0, Math.PI * 2); g.fillStyle = '#f1f2f5'; g.fill();
    }
    g.restore();
  }

  function openBonus() {
    sound.play('click');
    const modal = ui.el(`<div class="modal" role="dialog" aria-modal="true">
      <div class="modal__card modal__card--wheel">
        <button class="modal__close icon-btn" type="button" aria-label="Fermer">${I('x')}</button>
        <h3>${I('gift')}Roue quotidienne</h3>
        <p class="muted" style="margin:0 0 16px">Une rotation gratuite toutes les 12 h. Jusqu’à <strong class="num" style="color:var(--coin)">${fmt(bonus.DAILY_MAX)}</strong> DaveCoins.</p>
        <div class="dwheel">
          <canvas></canvas>
          <div class="dwheel__pointer"><svg viewBox="0 0 24 22"><path d="M0 0h24L12 22z" fill="currentColor"/></svg></div>
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
          <div class="hero__code">${new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir'} ${esc(user)} · ${games.list.length} jeux en ligne</div>
          <h1 class="js-split">Le roi t’attend <em>en orbite</em></h1>
          <p>Machines à sous, table, caisses et roue en direct. Ta roue quotidienne t’attend : jusqu’à ${fmt(bonus.DAILY_MAX)} DaveCoins toutes les 12 h.</p>
          <div class="hero__cta">
            <a class="btn btn--primary btn--lg js-mag" href="#/jeu/${featured.id}">${I('play', 'i--sm')}Jouer à ${featured.name}</a>
            <button class="btn btn--ghost btn--lg hero-bonus js-mag" type="button">${I('gift', 'i--sm')}Roue du jour</button>
          </div>
        </div>
        <div class="hero__art"><div class="orbit orbit-spin o1"></div><div class="orbit orbit-spin rev o2"></div><div class="king"><img src="${IMG}jpz.png" alt="Jean-Pascal Zadi"></div></div>
      </section>

      <div class="ticker" data-reveal><div class="ticker__track">${tickerHtml()}${tickerHtml()}</div></div>

      <section class="statbar" data-reveal>
        <div><span>Solde</span><strong>${ui.coin('coin--sm')}<b class="js-bal" style="font-weight:inherit">${fmt(wallet.get())}</b></strong></div>
        <div><span>Parties jouées</span><strong class="js-played">${fmt(s.played)}</strong></div>
        <div><span>Plus gros gain</span><strong class="${s.biggestWin ? 'pos' : ''}">${s.biggestWin ? '+' + fmt(s.biggestWin) : '—'}</strong></div>
        <div><span>Meilleur multiplicateur</span><strong>${s.biggestMult ? fmtMult(s.biggestMult) : '—'}</strong></div>
      </section>

      <div class="section-head" data-reveal>
        <h2>Les jeux <small class="num">${String(games.list.length).padStart(2, '0')}</small></h2>
        <div class="seg js-filter">${['Tous', ...CATS].map((c) => `<button type="button" data-c="${c}" class="${c === 'Tous' ? 'on' : ''}">${c}</button>`).join('')}</div>
      </div>
      <section class="games-grid">
        ${games.list.map((g) => `
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

      <div class="section-head"><h2>Dernières parties</h2><a href="#/profil">Tout l’historique${I('chevron-right', 'i--sm')}</a></div>
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
    M.magnetic(view.querySelectorAll('.js-mag'), 0.18);
    const bal = view.querySelector('.js-bal');
    M.countUp(bal, wallet.get(), fmt);
    M.countUp(view.querySelector('.js-played'), s.played, (v) => fmt(Math.round(v)));
    view.querySelector('.hero-bonus').addEventListener('click', openBonus);
    unmountView = on('balance', () => { const b = view.querySelector('.js-bal'); if (b) b.textContent = fmt(wallet.get()); });
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

  /* ---------- Profil ---------- */
  function renderProfile(view) {
    const s = stats.get();
    const net = s.won - s.wagered;
    const fav = Object.entries(s.perGame).sort((a, b) => b[1] - a[1])[0];
    const favGame = fav && games.find(fav[0]);
    view.innerHTML = `
      <div class="page-head">
        <span class="avatar avatar--lg" data-reveal>${esc(auth.current().charAt(0).toUpperCase())}</span>
        <div><h1>${esc(auth.current())}</h1><p>Statistiques et historique de ton compte</p></div>
      </div>
      <section class="statbar statbar--wide" data-reveal>
        <div><span>Solde</span><strong>${ui.coin('coin--sm')} ${fmt(wallet.get())}</strong></div>
        <div><span>Parties</span><strong>${fmt(s.played)}</strong></div>
        <div><span>Total misé</span><strong>${fmt(s.wagered)}</strong></div>
        <div><span>Bilan</span><strong class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${fmt(net)}</strong></div>
        <div><span>Plus gros gain</span><strong>${s.biggestWin ? '+' + fmt(s.biggestWin) : '—'}</strong></div>
        <div><span>Meilleur multiplicateur</span><strong>${s.biggestMult ? fmtMult(s.biggestMult) : '—'}</strong></div>
        <div><span>Jeu préféré</span><strong>${favGame ? favGame.name : '—'}</strong></div>
      </section>
      <div class="section-head"><h2>Historique</h2><span>50 dernières parties</span></div>
      ${historyTable(s.history)}`;
    M.reveal(view, '[data-reveal]');
  }

  /* ---------- Jeu ---------- */
  function renderGame(view, game) {
    view.innerHTML = `
      <div class="game-head" style="--h:${game.hue}">
        <span class="game-head__ico">${I(game.icon, 'i--lg')}</span>
        <div>
          <nav class="crumbs" aria-label="Fil d’Ariane"><a href="#/lobby">Lobby</a>${I('chevron-right')}<span>${catOf(game)}</span></nav>
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
    const cleanup = game.mount(view.querySelector('.game-root'));
    unmountView = typeof cleanup === 'function' ? cleanup : null;
    M.reveal(view, '.game-head, .panel, .stage');
    M.splitWords(view.querySelector('.game-head h1'), 80);
    M.magnetic(view.querySelectorAll('.panel .btn--lg'), 0.08);
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.modal').forEach((m) => m.remove()); });
  M.splash(I('crown'));
  route();
})();
