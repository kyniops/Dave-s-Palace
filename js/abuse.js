/* ADMIN ABUSE — événement lancé par l'admin pour tout le casino (supabase/abuse.sql).
 * Pendant l'événement : bannière avec compte à rebours, musique « Miaou Miaou », effets partout (chats et pièces
 * qui tombent, confettis, lumières disco, bordure arc-en-ciel), cadeau à ramasser (pluie de DaveCoins, caisse Aura),
 * XP et gains boostés (appliqués par le serveur). Annonce du bonus de gain à chaque partie gagnante.
 */
(() => {
  'use strict';
  const { IMG, fmt, ui, sound, store, auth, on, emit } = DP;
  const I = ui.icon;
  const sb = () => DP.cloud && DP.cloud.sb;
  const GAMES = { all: 'tous les jeux', machine: 'DaveMachine', mines: 'DaveMine', tower: 'DaveTower', plinko: 'PlinkoDave', rocket: 'DaveRocket', roulette: 'DaveRoulette', blackjack: 'DaveJack', chicken: 'DaveChicken', dice: 'DaveDice', flip: 'DaveFlip', scratch: 'DaveTicket' };
  const CATS = ['🐱', '😺', '😸', '😹', '😻', '🙀', '🐈', '🐾'];
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  let ev = null, endsAt = 0, banner = null, fx = null, timers = [], tick = 0, channel = null, poll = 0, lastBonus = 0;

  /* ---------- État ---------- */
  async function refresh() {
    if (!sb()) return;
    let r = null;
    try { const res = await sb().rpc('abuse_state'); r = res.error ? null : res.data; } catch { r = null; }
    if (r && r.id) start(r); else stop();
  }
  const boostsText = (b) => [
    b.gain > 1 ? `Gains ×${b.gain} sur ${GAMES[b.game] || b.game}` : '',
    b.xp > 1 ? `XP ×${b.xp}` : '',
    b.rain > 0 ? `Pluie de ${fmt(b.rain)} DaveCoins` : '',
    b.case ? 'Caisse Aura offerte' : ''
  ].filter(Boolean);

  function start(r) {
    const fresh = !ev || ev.id !== r.id;
    ev = r;
    endsAt = Date.now() + r.left_s * 1000;
    if (fresh) {
      document.body.classList.add('abuse-party');
      buildBanner();
      startFx();
      if (sound) { sound.play('fs'); }
      ui.toast('ADMIN ABUSE ! ' + boostsText(r.boosts).join(' · '), 'win', 5000);
    }
    paintBanner();
  }
  function stop() {
    if (!ev) return;
    ev = null;
    document.body.classList.remove('abuse-party');
    stopFx();
    if (banner) { banner.remove(); banner = null; }
    ui.toast('Fin de l’Admin Abuse. Merci d’être passé !', 'info', 3500);
  }

  /* ---------- Bannière ---------- */
  function buildBanner() {
    if (banner) banner.remove();
    banner = document.createElement('div');
    banner.className = 'abuse-banner';
    banner.innerHTML = `<div class="abuse-banner__title"><span class="abuse-cat">🐱</span><b>ADMIN ABUSE</b><span class="abuse-cat">🐱</span></div>
      <div class="abuse-banner__boosts js-ab-boosts"></div>
      <div class="abuse-banner__right"><span class="abuse-banner__time num js-ab-time"></span><button type="button" class="btn btn--primary btn--sm js-ab-claim" hidden>${I('gift', 'i--sm')}Ramasser</button></div>`;
    document.body.appendChild(banner);
    banner.querySelector('.js-ab-claim').addEventListener('click', claim);
  }
  function paintBanner() {
    if (!banner || !ev) return;
    banner.querySelector('.js-ab-boosts').innerHTML = boostsText(ev.boosts).map((t) => `<span>${DP.esc(t)}</span>`).join('');
    const btn = banner.querySelector('.js-ab-claim');
    btn.hidden = ev.claimed || !(ev.boosts.rain > 0 || ev.boosts.case) || !(DP.engine && DP.engine.on);
    paintTime();
  }
  function paintTime() {
    if (!banner) return;
    const s = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    banner.querySelector('.js-ab-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (s <= 0) refresh();
  }
  async function claim(e) {
    const btn = e.currentTarget;
    btn.disabled = true;
    const r = await DP.engine.call('abuse_claim');
    btn.disabled = false;
    if (!r) return;
    ev.claimed = true;
    paintBanner();
    sound.play('win', { x: 30 });
    coinRain(60);
    ui.toast(`Cadeau ramassé : ${r.coins ? '+' + fmt(r.coins) + ' DaveCoins' : ''}${r.coins && r.case ? ' et ' : ''}${r.case ? 'une caisse Aura gratuite' : ''} !`, 'win', 4500);
    emit('progress');
  }

  /* ---------- Effets partout ---------- */
  function layer() {
    if (!fx) {
      fx = document.createElement('div');
      fx.className = 'abuse-fx';
      fx.innerHTML = '<i class="abuse-fx__disco"></i><i class="abuse-fx__border"></i>';
      document.body.appendChild(fx);
    }
    return fx;
  }
  function drop(html, cls, dur) {
    if (!ev) return; // événement fini : plus rien ne tombe
    const el = document.createElement('span');
    el.className = 'abuse-drop ' + cls;
    el.innerHTML = html;
    el.style.left = Math.random() * 98 + '%';
    el.style.setProperty('--d', dur + 's');
    el.style.setProperty('--r', (Math.random() * 720 - 360).toFixed(0) + 'deg');
    el.style.setProperty('--x', (Math.random() * 160 - 80).toFixed(0) + 'px');
    layer().appendChild(el);
    setTimeout(() => el.remove(), dur * 1000 + 200);
  }
  const catRain = (n) => { for (let i = 0; i < n; i++) setTimeout(() => drop(CATS[Math.floor(Math.random() * CATS.length)], 'abuse-drop--cat', 3 + Math.random() * 3), i * 120); };
  const coinRain = (n) => { for (let i = 0; i < n; i++) setTimeout(() => drop(`<img src="${IMG}davecoin.png" alt="">`, 'abuse-drop--coin', 2.2 + Math.random() * 2), i * 60); };
  function confetti() {
    const p = document.createElement('i');
    p.style.cssText = `position:fixed;left:${10 + Math.random() * 80}%;top:${15 + Math.random() * 60}%;width:1px;height:1px`;
    document.body.appendChild(p);
    ui.burst(p, { n: 40, colors: ['#ff3d9a', '#ffc145', '#2ea8ff', '#3ee68b', '#a855f7', '#ffffff'], spread: 2.4, size: 7 });
    setTimeout(() => p.remove(), 1500);
  }
  function startFx() {
    stopFx();
    layer();
    clearInterval(tick); tick = setInterval(paintTime, 1000);
    if (reduced()) return; // animations réduites : bannière et musique seulement
    catRain(14); coinRain(30);
    timers.push(setInterval(() => !document.hidden && catRain(6), 4000));
    timers.push(setInterval(() => !document.hidden && coinRain(12), 5500));
    timers.push(setInterval(() => !document.hidden && confetti(), 2200));
  }
  function stopFx() {
    timers.forEach(clearInterval); timers = [];
    clearInterval(tick); tick = 0;
    if (fx) { fx.remove(); fx = null; }
  }

  /* ---------- Bonus de gain annoncé après chaque partie gagnante ---------- */
  function checkBonus() {
    if (!ev || !auth.current()) return;
    let ab = null;
    try { ab = (store.json('dp_prog_' + auth.current(), {}) || {}).ab; } catch { ab = null; }
    if (!ab || !(+ab.t > lastBonus)) return;
    const first = lastBonus === 0;
    lastBonus = +ab.t;
    if (first && Date.now() - ab.t > 15000) return; // ancien bonus déjà vu
    ui.toast(`Admin Abuse : gains ×${ab.m} ! Bonus +${fmt(+ab.v)} DaveCoins`, 'win', 3500);
    coinRain(18);
  }
  on('balance', checkBonus);

  /* ---------- Démarrage : temps réel + vérification régulière ---------- */
  function boot() {
    if (!sb()) return;
    refresh();
    clearInterval(poll); poll = setInterval(refresh, 20000);
    if (!channel) {
      try {
        channel = sb().channel('abuse-palace').on('postgres_changes', { event: '*', schema: 'public', table: 'abuse_events' }, () => setTimeout(refresh, 300)).subscribe();
      } catch { channel = null; }
    }
  }
  on('session', boot);
  setTimeout(boot, 1500);

  DP.abuse = { refresh, active: () => ev, GAMES };
})();
