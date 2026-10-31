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

  const audio = new Audio('assets/audio/ambiance.mp3');
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;
  let started = false, fadeRaf = 0;
  const target = () => (state.musicMuted ? 0 : state.musicVol * 0.6);

  /** Fondu doux vers le volume voulu. */
  function fadeTo(v, ms = 900) {
    cancelAnimationFrame(fadeRaf);
    const from = audio.volume, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      audio.volume = Math.max(0, Math.min(1, from + (v - from) * k));
      if (k < 1) fadeRaf = requestAnimationFrame(step);
      else if (v === 0 && state.musicMuted) audio.pause();
    };
    fadeRaf = requestAnimationFrame(step);
  }
  function play() {
    if (state.musicMuted) return;
    const p = audio.play();
    if (p && p.then) p.then(() => { started = true; fadeTo(target(), 1800); }).catch(() => {});
  }
  const kick = () => { if (!started) play(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, kick, { passive: true }));
  // onglet caché : la musique se met en pause, et reprend au retour
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (!audio.paused) { audio.pause(); audio._was = true; } }
    else if (audio._was) { audio._was = false; if (!state.musicMuted) audio.play().catch(() => {}); }
  });

  /* ---------- Réglages ---------- */
  function setMusic(v) {
    state.musicVol = v; store.set('dp_music_vol', String(v));
    if (v > 0 && state.musicMuted) { state.musicMuted = false; store.set('dp_music_muted', '0'); }
    if (!state.musicMuted && audio.paused) play(); else fadeTo(target(), 200);
    emit('volume');
  }
  function toggleMusic() {
    state.musicMuted = !state.musicMuted;
    store.set('dp_music_muted', state.musicMuted ? '1' : '0');
    if (state.musicMuted) fadeTo(0, 400); else { if (audio.paused) play(); else fadeTo(target(), 600); }
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

  DP.music = { attach, audio };
})();
