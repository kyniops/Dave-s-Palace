/* Musique d'ambiance en boucle + panneau de volume (musique et effets).
 * Les navigateurs bloquent le son tant qu'on n'a pas interagi : la musique démarre au premier clic.
 */
(() => {
  const { store, sound, ui, on, emit } = DP;
  const I = ui.icon;
  const num = (k, d) => { const v = parseFloat(store.get(k)); return isNaN(v) ? d : Math.max(0, Math.min(1, v)); };
  const state = {
    musicVol: num('dp_music_vol', 0.35),
    musicMuted: store.get('dp_music_muted') === '1',
    sfxVol: num('dp_sfx_vol', 1)
  };

  /* Deux versions du même morceau : l'acoustique tourne partout, la phonk prend le relais pendant les
   * gros moments (gros gain, free spins, jackpot, carte légendaire, fusée qui s'envole) puis repasse la main.
   * Le passage se fait par un fondu croisé ; la phonk démarre juste avant un de ses « drops ». */
  const mk = (src) => { const a = new Audio(src); a.loop = true; a.preload = 'auto'; a.volume = 0; return a; };
  const tracks = { calm: mk('assets/audio/ambiance.mp3'), hype: mk('assets/audio/phonk.mp3') };
  tracks.hype.preload = 'none'; // téléchargée seulement au premier jeu ouvert
  // la phonk est plus forte : on la cale un peu plus bas pour garder le même ressenti
  const GAIN = { calm: 0.6, hype: 0.5 };
  const XFADE = 2000;
  let started = false, current = 'calm', duck = 1;
  const fades = new Map();
  const target = (k) => (state.musicMuted ? 0 : state.musicVol * GAIN[k] * duck);

  /** Fondu d'une piste vers un volume ; la piste se met en pause une fois silencieuse. */
  function fadeTo(k, v, ms = 900) {
    const a = tracks[k];
    cancelAnimationFrame(fades.get(k));
    if (v > 0 && a.paused && started) a.play().catch(() => {});
    const from = a.volume, t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // douce au début et à la fin
      a.volume = Math.max(0, Math.min(1, from + (v - from) * e));
      if (p < 1) fades.set(k, requestAnimationFrame(step));
      else if (v === 0) a.pause();
    };
    fades.set(k, requestAnimationFrame(step));
  }
  /** Version voulue selon la page : jeux et caisses → phonk, le reste → acoustique. */
  // moments où la phonk passe à pleine puissance (analyse du morceau), pris à tour de rôle
  const DROPS = [15, 73, 139, 169];
  let dropIdx = 0, hypeUntil = 0, hold = false, hypeTimer = 0;
  const wanted = () => (hold || Date.now() < hypeUntil ? 'hype' : 'calm');
  function update() {
    const k = wanted();
    if (k === current) return;
    if (k === 'hype' && started) {
      // nouvelle montée : on se cale une seconde avant un drop pour que le beat tombe quand le son arrive
      tracks.hype.currentTime = Math.max(0, DROPS[dropIdx++ % DROPS.length] - 1);
    }
    switchTo(k, k === 'hype' ? 1100 : 2600);
  }
  /** Lance la phonk pendant `ms` (prolongée si un autre gros moment arrive). */
  function hype(ms = 14000) {
    hypeUntil = Math.max(hypeUntil, Date.now() + ms);
    clearTimeout(hypeTimer);
    hypeTimer = setTimeout(update, hypeUntil - Date.now() + 50);
    update();
  }
  on('bigwin', (e) => hype(e && e.x >= 50 ? 24000 : 14000));
  function switchTo(k, ms = XFADE) {
    if (k === current && !tracks[k].paused) return fadeTo(k, target(k), ms);
    const old = current;
    current = k;
    if (!started || state.musicMuted) return;
    tracks[k].play().catch(() => {});
    fadeTo(k, target(k), ms);
    if (old !== k) fadeTo(old, 0, ms);
  }
  const refresh = (ms = 300) => { fadeTo(current, target(current), ms); const other = current === 'calm' ? 'hype' : 'calm'; if (!tracks[other].paused) fadeTo(other, 0, ms); };
  function play() {
    if (state.musicMuted) return;
    current = wanted();
    const p = tracks[current].play();
    if (p && p.then) p.then(() => { started = true; fadeTo(current, target(current), 1800); }).catch(() => {});
  }
  const kick = () => { if (!started) play(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, kick, { passive: true }));
  // onglet caché : la musique se met en pause, et reprend au retour
  document.addEventListener('visibilitychange', () => {
    const a = tracks[current];
    if (document.hidden) { if (!a.paused) { a.pause(); a._was = true; } }
    else if (a._was) { a._was = false; if (!state.musicMuted) a.play().catch(() => {}); }
  });
  // free spins et jackpot de DaveMachine : phonk pendant toute la séquence, puis encore quelques secondes
  new MutationObserver(() => {
    const h = document.body.classList.contains('fs-party') || document.body.classList.contains('jp-party');
    if (h === hold) return;
    hold = h;
    if (!h) hype(6000); else update();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  /* ---------- Réglages ---------- */
  function setMusic(v) {
    state.musicVol = v; store.set('dp_music_vol', String(v));
    if (v > 0 && state.musicMuted) { state.musicMuted = false; store.set('dp_music_muted', '0'); }
    if (!state.musicMuted && !started) play(); else refresh(200);
    emit('volume');
  }
  function toggleMusic() {
    state.musicMuted = !state.musicMuted;
    store.set('dp_music_muted', state.musicMuted ? '1' : '0');
    if (state.musicMuted) { fadeTo('calm', 0, 400); fadeTo('hype', 0, 400); }
    else if (!started) play();
    else switchTo(wanted(), 600);
    emit('volume');
  }
  function setSfx(v) {
    state.sfxVol = v; store.set('dp_sfx_vol', String(v));
    sound.setVolume(v);
    if (v > 0 && sound.muted) sound.toggle();
    emit('volume');
  }
  function toggleSfx() { sound.toggle(); emit('volume'); }
  sound.setVolume(state.sfxVol);

  /* ---------- Bouton + panneau ---------- */
  const allMuted = () => (state.musicMuted || state.musicVol === 0) && (sound.muted || state.sfxVol === 0);
  const icon = () => I(allMuted() ? 'volume-x' : 'volume-2');
  function panelHtml() {
    const row = (k, label, vol, muted) => `<div class="volrow" data-k="${k}">
        <button type="button" class="icon-btn volrow__mute" aria-label="${muted ? 'Activer' : 'Couper'} : ${label}">${I(muted || vol === 0 ? 'volume-x' : 'volume-2')}</button>
        <div class="volrow__main"><span>${label}<b class="num">${muted ? 'coupé' : Math.round(vol * 100) + ' %'}</b></span>
        <input type="range" min="0" max="100" step="1" value="${Math.round(vol * 100)}" aria-label="Volume ${label}" style="--v:${muted ? 0 : vol * 100}%"></div>
      </div>`;
    return `${row('music', 'Musique', state.musicVol, state.musicMuted)}${row('sfx', 'Effets', state.sfxVol, sound.muted)}
      <button type="button" class="btn btn--ghost btn--sm btn--block volpop__all">${I(allMuted() ? 'volume-2' : 'volume-x', 'i--sm')}${allMuted() ? 'Tout réactiver' : 'Tout couper'}</button>`;
  }
  /** Transforme un bouton en commande de volume (ouvre un panneau au clic). */
  function attach(btn) {
    btn.innerHTML = icon();
    btn.setAttribute('aria-label', 'Volume');
    let pop = null;
    const close = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('pointerdown', outside, true); } };
    const outside = (e) => { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(); };
    const paint = () => { if (!btn.isConnected) return; btn.innerHTML = icon(); if (pop) pop.innerHTML = panelHtml(); };
    btn.addEventListener('click', () => {
      if (pop) return close();
      pop = document.createElement('div');
      pop.className = 'volpop';
      pop.innerHTML = panelHtml();
      document.body.appendChild(pop);
      const r = btn.getBoundingClientRect();
      pop.style.top = r.bottom + 10 + 'px';
      pop.style.right = Math.max(8, innerWidth - r.right) + 'px';
      document.addEventListener('pointerdown', outside, true);
      pop.addEventListener('input', (e) => {
        const inp = e.target.closest('input[type=range]');
        if (!inp) return;
        const v = +inp.value / 100, k = inp.closest('.volrow').dataset.k;
        inp.style.setProperty('--v', inp.value + '%');
        inp.closest('.volrow').querySelector('b').textContent = inp.value + ' %';
        if (k === 'music') setMusic(v); else setSfx(v);
        btn.innerHTML = icon();
      });
      pop.addEventListener('change', (e) => { if (e.target.closest('.volrow[data-k=sfx]')) sound.play('chip'); });
      pop.addEventListener('click', (e) => {
        const m = e.target.closest('.volrow__mute');
        if (m) { if (m.closest('.volrow').dataset.k === 'music') toggleMusic(); else toggleSfx(); paint(); return; }
        if (e.target.closest('.volpop__all')) {
          const mute = !allMuted();
          if (mute !== state.musicMuted) toggleMusic();
          if (mute !== sound.muted) toggleSfx();
          paint();
        }
      });
    });
    on('volume', paint);
    return btn;
  }

  DP.music = { attach, tracks, hype, current: () => current, playing: () => !(state.musicMuted || state.musicVol === 0) };
})();
