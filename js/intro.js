/* Page de présentation (avant connexion) : galaxie spirale en 3D (three.js), sections qui se
 * révèlent au défilement, transitions vers la connexion / l'inscription.
 * Concept inspiré des scènes « galaxie » de getlayers.ai, entièrement recodé ici.
 */
(function () {
  'use strict';
  const { IMG, ui, fmt, sound, jackpot, cards, games, on } = DP;
  const I = ui.icon;
  const M = () => window.DP_MOTION;

  /* ---------- Galaxie spirale ---------- */
  function galaxy(canvas) {
    const THREE = window.THREE;
    if (!THREE) return null;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

    // texture ronde et douce pour les particules
    const dot = document.createElement('canvas');
    dot.width = dot.height = 64;
    const dg = dot.getContext('2d');
    const rg = dg.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,255,255,.8)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    dg.fillStyle = rg; dg.fillRect(0, 0, 64, 64);
    const sprite = new THREE.CanvasTexture(dot);

    const P = { count: 56000, radius: 7, branches: 4, spin: 1.15, rand: 0.42, power: 3 };
    const inside = new THREE.Color('#fff1d6'), mid = new THREE.Color('#ff6b2c'), outside = new THREE.Color('#ff2d8a');
    const pos = new Float32Array(P.count * 3), col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const r = Math.pow(Math.random(), 1.6) * P.radius;
      const branch = ((i % P.branches) / P.branches) * Math.PI * 2;
      const spin = r * P.spin;
      const rnd = () => Math.pow(Math.random(), P.power) * (Math.random() < 0.5 ? 1 : -1) * P.rand * (0.35 + r * 0.25);
      pos[i * 3] = Math.cos(branch + spin) * r + rnd();
      pos[i * 3 + 1] = rnd() * 0.45;
      pos[i * 3 + 2] = Math.sin(branch + spin) * r + rnd();
      const k = r / P.radius;
      const c = k < 0.35 ? inside.clone().lerp(mid, k / 0.35) : mid.clone().lerp(outside, (k - 0.35) / 0.65);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.05, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // braises qui s'élèvent des bras
    const EM = 1600;
    const ePos = new Float32Array(EM * 3), eVel = new Float32Array(EM);
    const respawn = (i) => {
      const r = 1 + Math.random() * (P.radius - 1);
      const b = Math.floor(Math.random() * P.branches) / P.branches * Math.PI * 2 + r * P.spin;
      ePos[i * 3] = Math.cos(b) * r; ePos[i * 3 + 1] = (Math.random() - 0.5) * 0.2; ePos[i * 3 + 2] = Math.sin(b) * r;
      eVel[i] = 0.15 + Math.random() * 0.45;
    };
    for (let i = 0; i < EM; i++) { respawn(i); ePos[i * 3 + 1] = Math.random() * 2.5; }
    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ size: 0.09, map: sprite, color: '#ffb347', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    points.add(embers);

    // cœur lumineux
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite, color: '#ffd59a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.scale.set(3.2, 3.2, 1);
    scene.add(core);

    let mx = 0, my = 0, sx = 0, sy = 0, scroll = 0, alive = true, last = performance.now(), intro = 0;
    const onMove = (e) => { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; };
    window.addEventListener('pointermove', onMove, { passive: true });
    const size = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    size();
    window.addEventListener('resize', size);

    const frame = (now) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      intro = Math.min(1, intro + dt * 0.35);               // entrée : la galaxie s'ouvre
      const e = 1 - Math.pow(1 - intro, 3);
      sx += (mx - sx) * 0.04; sy += (my - sy) * 0.04;
      points.rotation.y += dt * 0.06;
      points.scale.setScalar(0.25 + 0.75 * e);
      // défilement : la caméra plonge vers le cœur et la galaxie se redresse
      const dist = 9 - scroll * 5.5;
      // sur grand écran, le cœur de la galaxie se place à droite, derrière JPZ
      const ox = canvas.clientWidth > 900 ? -3.1 * (1 - scroll) : 0;
      camera.position.set(ox + sx * 2.2, 3.6 - scroll * 2.4 - sy * 1.2, dist);
      camera.lookAt(ox, -scroll * 0.6, 0);
      points.rotation.x = 0.35 + scroll * 0.5;
      mat.opacity = Math.max(0.15, 1 - scroll * 0.6);
      for (let i = 0; i < EM; i++) {
        ePos[i * 3 + 1] += eVel[i] * dt;
        ePos[i * 3] *= 1 + dt * 0.02; ePos[i * 3 + 2] *= 1 + dt * 0.02;
        if (ePos[i * 3 + 1] > 2.6) respawn(i);
      }
      eGeo.attributes.position.needsUpdate = true;
      core.material.opacity = (0.75 + Math.sin(now * 0.002) * 0.15) * e;
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return {
      setScroll(v) { scroll = Math.max(0, Math.min(1, v)); },
      destroy() { alive = false; window.removeEventListener('pointermove', onMove); window.removeEventListener('resize', size); renderer.dispose(); geo.dispose(); eGeo.dispose(); }
    };
  }

  /* ---------- Transition vers une autre page ---------- */
  function transitionTo(hash) {
    sound.play('whoosh');
    window.DP_SPACE && DP_SPACE.warp(true);
    const sh = document.createElement('div');
    sh.className = 'shutter';
    sh.innerHTML = `<i></i><i></i><span class="shutter__mark">${I('crown')}</span>`;
    document.body.appendChild(sh);
    const [a, b] = sh.querySelectorAll('i');
    a.animate([{ transform: 'translateY(-100%)' }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'forwards' });
    b.animate([{ transform: 'translateY(-100%)' }, { transform: 'none' }], { duration: 520, delay: 90, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'forwards' });
    sh.querySelector('.shutter__mark').animate([{ transform: 'scale(.3) rotate(-90deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, delay: 300, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
    setTimeout(() => {
      location.hash = hash;
      window.DP_SPACE && DP_SPACE.warp(false);
      sh.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { duration: 650, delay: 120, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'forwards' }).finished.then(() => sh.remove());
    }, 760);
  }

  /* ---------- Page ---------- */
  function render(app) {
    document.body.className = 'is-intro';
    const casino = games.list.filter((g) => g.id !== 'cases');
    const showcase = [5, 4, 3, 2, 1, 0].map((r) => Object.values(cards.byId).filter((c) => c.rarity.i === r).sort((x, y) => y.value - x.value)[0]).filter(Boolean);
    const gameCard = (g) => `<div class="ix-game" style="--h:${g.hue}"><div class="ix-game__art">${g.art || `<span class="game-card__icon">${I(g.icon)}</span>`}</div><b>${g.name}</b><span>${g.tagline}</span></div>`;
    app.innerHTML = `
      <div class="intro">
        <header class="ix-nav">
          <span class="brand"><span class="brand__mark">${I('crown')}</span><span class="brand__name">Dave’s Palace</span></span>
          <nav><a href="#ix-casino">Casino</a><a href="#ix-cases">Caisses</a><a href="#ix-jackpot">Jackpot</a></nav>
          <div class="ix-nav__cta"><button type="button" class="btn btn--ghost btn--sm js-login">Se connecter</button><button type="button" class="btn btn--primary btn--sm js-signup">S’inscrire</button></div>
        </header>

        <section class="ix-hero">
          <canvas class="ix-galaxy"></canvas>
          <div class="ix-hero__veil"></div>
          <div class="ix-hero__content">
            <span class="ix-eyebrow js-hero-in">Casino · Caisses · Collection</span>
            <h1 class="ix-title"><span class="ix-title__row">${[...'DAVE’S'].map((c, i) => `<i style="--i:${i}">${c}</i>`).join('')}</span><span class="ix-title__row ix-title__row--o">${[...'PALACE'].map((c, i) => `<i style="--i:${i + 6}">${c}</i>`).join('')}</span></h1>
            <p class="ix-lead js-hero-in">Le casino de Jean&#8209;Pascal Zadi, en orbite. Gagne des DaveCoins, ouvre des caisses et collectionne toute la bande en cartes néon.</p>
            <div class="ix-cta js-hero-in">
              <button type="button" class="btn btn--primary btn--lg js-signup js-mag">${I('sparkles', 'i--sm')}S’inscrire · 1 000 offerts</button>
              <button type="button" class="btn btn--ghost btn--lg js-login js-mag">Se connecter${I('chevron-right', 'i--sm')}</button>
            </div>
          </div>
          <div class="ix-king"><div class="orbit orbit-spin"></div><div class="orbit orbit-spin rev" style="width:150%;height:150%"></div><img src="${IMG}jpz.png" alt="Jean-Pascal Zadi"></div>
          <a class="ix-scroll" href="#ix-casino"><span>Découvrir</span><i></i></a>
        </section>

        <section class="ix-sec" id="ix-casino">
          <div class="ix-head" data-ix><span class="ix-eyebrow">01 · Le casino</span><h2>${casino.length} jeux pour faire grimper ton solde</h2><p>Machine à sous à jackpot, mines, tour, plinko, fusée, roue en direct, roulette, blackjack… Chaque jeu affiche son taux de retour.</p></div>
          <div class="ix-stats" data-ix>
            <div><b class="num js-count" data-to="${casino.length}">0</b><span>jeux</span></div>
            <div><b class="num js-count" data-to="99">0</b><span>% de RTP max</span></div>
            <div><b class="num js-count" data-to="1000">0</b><span>DaveCoins offerts</span></div>
            <div><b class="num js-count" data-to="${Object.keys(cards.byId).length}">0</b><span>cartes à collectionner</span></div>
          </div>
          <div class="ix-marquee" data-ix><div class="ix-marquee__track">${casino.map(gameCard).join('')}${casino.map(gameCard).join('')}</div></div>
        </section>

        <section class="ix-sec ix-sec--split" id="ix-cases">
          <div class="ix-head" data-ix><span class="ix-eyebrow">02 · Caisses & collection</span><h2>Ouvre des caisses, collectionne la bande</h2><p>Cinq caisses, quarante cartes néon de Commun à Mythique. Vends tes doubles pour récupérer des DaveCoins ou complète les albums pour débloquer leurs récompenses.</p>
            <button type="button" class="btn btn--primary js-signup">${I('package-open', 'i--sm')}Ouvrir ma première caisse</button></div>
          <div class="ix-fan">${showcase.map((c, i) => `<div class="ix-fan__card" style="--k:${i - (showcase.length - 1) / 2}">${cards.html(c)}</div>`).join('')}</div>
        </section>

        <section class="ix-sec ix-jackpot" id="ix-jackpot" data-ix>
          <span class="ix-eyebrow">03 · Jackpot global</span>
          <b class="ix-jackpot__amount num js-ixjp">${fmt(jackpot.get())}</b>
          <p>Il monte avec chaque mise du casino. Il tombe sur DaveMachine : 5 cartes Free JPZ ou jackpot mystère.</p>
        </section>

        <section class="ix-sec ix-sec--split ix-daily">
          <div class="ix-dwheel" data-ix><div class="ix-dwheel__disc"></div><img src="${IMG}jppz.jpg" alt=""></div>
          <div class="ix-head" data-ix><span class="ix-eyebrow">04 · Chaque jour</span><h2>Une roue gratuite toutes les 12 heures</h2><p>Jusqu’à 5 000 DaveCoins à chaque rotation, et des codes promo à activer depuis ton compte.</p></div>
        </section>

        <section class="ix-final" data-ix>
          <h2>Ta place t’attend au Palace</h2>
          <div class="ix-cta"><button type="button" class="btn btn--primary btn--lg js-signup js-mag">${I('sparkles', 'i--sm')}Créer mon compte</button><button type="button" class="btn btn--ghost btn--lg js-login js-mag">J’ai déjà un compte</button></div>
          <p class="muted">Jeu fictif, aucun argent réel. Les DaveCoins n’ont aucune valeur.</p>
        </section>
      </div>`;

    const root = app.querySelector('.intro');
    // boutons → connexion / inscription, avec transition
    root.addEventListener('click', (e) => {
      if (e.target.closest('.js-signup')) { e.preventDefault(); transitionTo('#/inscription'); }
      else if (e.target.closest('.js-login')) { e.preventDefault(); transitionTo('#/connexion'); }
      const a = e.target.closest('a[href^="#ix-"]');
      if (a) { e.preventDefault(); document.querySelector(a.getAttribute('href')).scrollIntoView({ behavior: 'smooth' }); }
    });

    // galaxie 3D (repli : le champ d'étoiles du site reste visible)
    const gal = galaxy(root.querySelector('.ix-galaxy'));
    if (!gal) root.querySelector('.ix-galaxy').remove();

    // entrée du héro : lettres, puis texte et boutons
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) {
      root.querySelectorAll('.ix-title i').forEach((el) => el.animate([{ transform: 'translateY(110%) rotate(8deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 1000, delay: 500 + (+el.style.getPropertyValue('--i')) * 60, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
      root.querySelectorAll('.js-hero-in').forEach((el, i) => el.animate([{ transform: 'translateY(24px)', opacity: 0, filter: 'blur(6px)' }, { transform: 'none', opacity: 1, filter: 'none' }], { duration: 900, delay: 1100 + i * 140, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
      root.querySelector('.ix-king').animate([{ transform: 'translateY(80px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 1400, delay: 900, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
    }
    M().magnetic(root.querySelectorAll('.js-mag'), 0.2);
    DP.emit('lobby'); // dessine les illustrations en canvas (roues) des cartes de jeux
    M().tilt(root.querySelectorAll('.ix-game'), 10);

    // révélations au défilement
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      io.unobserve(en.target);
      en.target.querySelectorAll('.js-count').forEach((c) => M().countUp(c, +c.dataset.to, (v) => fmt(Math.round(v)), 1600));
      if (en.target.classList.contains('ix-fan')) sound.play('card');
    }), { threshold: 0.25 });
    root.querySelectorAll('[data-ix], .ix-fan').forEach((el) => io.observe(el));

    // défilement : la caméra plonge, la barre se densifie
    const nav = root.querySelector('.ix-nav'), hero = root.querySelector('.ix-hero');
    const onScroll = () => {
      const p = window.scrollY / Math.max(1, hero.offsetHeight);
      if (gal) gal.setScroll(p);
      hero.style.setProperty('--p', Math.min(1, p).toFixed(3));
      nav.classList.toggle('solid', window.scrollY > 40);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // jackpot en direct
    const jpEl = root.querySelector('.js-ixjp');
    let jpShown = jackpot.get(), jpRaf = 0;
    const jpTick = () => {
      const t = jackpot.get();
      jpShown = t < jpShown ? t : jpShown + (t - jpShown) * 0.06;
      if (Math.abs(t - jpShown) < 0.01) jpShown = t;
      jpEl.textContent = fmt(Math.round(jpShown * 100) / 100);
      jpRaf = jpShown !== t ? requestAnimationFrame(jpTick) : 0;
    };
    const offJp = on('jackpot', () => { if (!jpRaf) jpRaf = requestAnimationFrame(jpTick); });
    const lights = ui.bulbs(root.querySelector('.ix-dwheel'), 28);
    window.addEventListener('resize', lights.size);

    return () => {
      gal && gal.destroy();
      io.disconnect();
      offJp();
      cancelAnimationFrame(jpRaf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', lights.size);
    };
  }

  window.DP_INTRO = { render, transitionTo };
})();
