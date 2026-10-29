/* Dave's Palace — cœur de l'application
 * Comptes, portefeuille DaveCoin, statistiques, sons, RNG et composants UI partagés.
 * Les clés localStorage historiques (utilisateurs, utilisateurCourant, davecoin_<user>)
 * sont conservées pour que les anciens comptes et soldes restent valides.
 */
(function () {
  'use strict';

  const IMG = 'assets/img/';
  const START_BALANCE = 1000;
  const DAILY_BONUS = 1000;
  const DAILY_COOLDOWN = 24 * 3600 * 1000;
  const RESCUE_AMOUNT = 500;
  const RESCUE_COOLDOWN = 3600 * 1000;

  /* ---------- Stockage sûr ---------- */
  const store = {
    get(key, fallback = null) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* stockage indisponible */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
    json(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    setJson(key, value) { this.set(key, JSON.stringify(value)); }
  };

  /* ---------- Aléatoire cryptographique ---------- */
  const rng = {
    float() {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] / 4294967296;
    },
    int(min, max) { return min + Math.floor(rng.float() * (max - min + 1)); },
    pick(arr) { return arr[Math.floor(rng.float() * arr.length)]; },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng.float() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
  };

  /* ---------- Formatage ---------- */
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  function fmt(n) {
    n = round2(n);
    const opts = Number.isInteger(n) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return n.toLocaleString('fr-FR', opts);
  }
  const fmtMult = (m) => (m >= 100 ? m.toFixed(0) : m.toFixed(2)) + '×';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Comptes ---------- */
  const auth = {
    users() { return store.json('utilisateurs', []); },
    current() { return store.get('utilisateurCourant'); },
    login(name, password) {
      name = (name || '').trim();
      const ok = auth.users().some((u) => u.prenom === name && u.motdepasse === password);
      if (!ok) return 'Nom d’utilisateur ou mot de passe incorrect.';
      store.set('utilisateurCourant', name);
      wallet.ensure();
      emit('auth');
      return null;
    },
    register(name, password) {
      name = (name || '').trim();
      if (name.length < 2) return 'Le pseudo doit faire au moins 2 caractères.';
      if (name.length > 20) return 'Le pseudo doit faire 20 caractères maximum.';
      if (!password || password.length < 3) return 'Le mot de passe doit faire au moins 3 caractères.';
      const users = auth.users();
      if (users.some((u) => u.prenom.toLowerCase() === name.toLowerCase())) return 'Ce pseudo est déjà pris.';
      users.push({ prenom: name, motdepasse: password });
      store.setJson('utilisateurs', users);
      store.set('utilisateurCourant', name);
      wallet.ensure();
      emit('auth');
      return null;
    },
    logout() { store.remove('utilisateurCourant'); emit('auth'); }
  };

  /* ---------- Événements ---------- */
  const listeners = {};
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => off(evt, fn); }
  function off(evt, fn) { listeners[evt] = (listeners[evt] || []).filter((f) => f !== fn); }
  function emit(evt, data) { (listeners[evt] || []).forEach((f) => f(data)); }

  /* ---------- Portefeuille DaveCoin ---------- */
  const wallet = {
    key() { return 'davecoin_' + (auth.current() || 'guest'); },
    ensure() { if (store.get(wallet.key()) === null) store.set(wallet.key(), String(START_BALANCE)); },
    get() {
      wallet.ensure();
      const v = parseFloat(store.get(wallet.key()));
      return isNaN(v) ? 0 : round2(v);
    },
    set(v) {
      const val = Math.max(0, round2(v));
      store.set(wallet.key(), String(val));
      emit('balance', val);
      return val;
    },
    canAfford(amount) { return amount > 0 && amount <= wallet.get() + 1e-9; },
    /** Débite une mise. Renvoie false (et prévient le joueur) si elle est invalide. */
    place(amount) {
      amount = round2(amount);
      if (!(amount > 0)) { ui.toast('Mise invalide.', 'error'); return false; }
      if (!wallet.canAfford(amount)) { ui.toast('Pas assez de DaveCoins !', 'error'); sound.play('error'); return false; }
      wallet.set(wallet.get() - amount);
      return true;
    },
    credit(amount) { if (amount > 0) wallet.set(wallet.get() + amount); }
  };

  /* ---------- Bonus ---------- */
  const bonus = {
    _key(k) { return 'dp_' + k + '_' + auth.current(); },
    dailyLeft() {
      const last = parseInt(store.get(bonus._key('bonus'), '0'), 10) || 0;
      return Math.max(0, last + DAILY_COOLDOWN - Date.now());
    },
    claimDaily() {
      if (bonus.dailyLeft() > 0) return 0;
      store.set(bonus._key('bonus'), String(Date.now()));
      wallet.credit(DAILY_BONUS);
      emit('bonus');
      return DAILY_BONUS;
    },
    rescueLeft() {
      const last = parseInt(store.get(bonus._key('rescue'), '0'), 10) || 0;
      return Math.max(0, last + RESCUE_COOLDOWN - Date.now());
    },
    canRescue() { return wallet.get() < 1 && bonus.rescueLeft() === 0; },
    claimRescue() {
      if (!bonus.canRescue()) return 0;
      store.set(bonus._key('rescue'), String(Date.now()));
      wallet.credit(RESCUE_AMOUNT);
      emit('bonus');
      return RESCUE_AMOUNT;
    },
    DAILY_BONUS, RESCUE_AMOUNT
  };

  /* ---------- Statistiques ---------- */
  const stats = {
    key() { return 'dp_stats_' + auth.current(); },
    get() {
      return Object.assign(
        { played: 0, wagered: 0, won: 0, biggestWin: 0, biggestMult: 0, perGame: {}, history: [] },
        store.json(stats.key(), {})
      );
    },
    record(game, bet, payout) {
      const s = stats.get();
      const mult = bet > 0 ? payout / bet : 0;
      s.played++;
      s.wagered = round2(s.wagered + bet);
      s.won = round2(s.won + payout);
      if (payout - bet > s.biggestWin) s.biggestWin = round2(payout - bet);
      if (mult > s.biggestMult) s.biggestMult = round2(mult);
      s.perGame[game] = (s.perGame[game] || 0) + 1;
      s.history.unshift({ game, bet: round2(bet), payout: round2(payout), mult: round2(mult), t: Date.now() });
      s.history = s.history.slice(0, 50);
      store.setJson(stats.key(), s);
      emit('stats', s);
    }
  };

  /** Clôture une partie : crédite le gain, enregistre les stats, joue le son adapté. */
  function settle(game, bet, payout) {
    payout = round2(payout);
    wallet.credit(payout);
    stats.record(game, bet, payout);
    if (payout > bet) sound.play(payout >= bet * 10 ? 'jackpot' : 'win');
    else if (payout === 0) sound.play('lose');
    return payout;
  }

  /* ---------- Sons (synthétisés, aucun fichier) ---------- */
  const sound = {
    ctx: null,
    muted: store.get('dp_muted') === '1',
    toggle() { sound.muted = !sound.muted; store.set('dp_muted', sound.muted ? '1' : '0'); emit('sound', sound.muted); return sound.muted; },
    _ctx() {
      if (!sound.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        sound.ctx = new AC();
      }
      if (sound.ctx.state === 'suspended') sound.ctx.resume();
      return sound.ctx;
    },
    tone(freq, dur = 0.1, type = 'sine', vol = 0.15, delay = 0, slideTo = null) {
      if (sound.muted) return;
      const ctx = sound._ctx();
      if (!ctx) return;
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    play(name) {
      const T = sound.tone;
      switch (name) {
        case 'click': T(520, 0.05, 'square', 0.04); break;
        case 'tick': T(1400, 0.03, 'square', 0.03); break;
        case 'bet': T(300, 0.08, 'triangle', 0.12); T(450, 0.08, 'triangle', 0.1, 0.05); break;
        case 'card': T(900, 0.04, 'triangle', 0.06, 0, 300); break;
        case 'chip': T(2200, 0.03, 'sine', 0.08); T(1800, 0.04, 'sine', 0.06, 0.02); break;
        case 'pop': T(660, 0.06, 'sine', 0.1, 0, 990); break;
        case 'gem': T(880, 0.08, 'sine', 0.12); T(1320, 0.12, 'sine', 0.1, 0.05); break;
        case 'boom': T(140, 0.45, 'sawtooth', 0.2, 0, 40); T(80, 0.5, 'square', 0.12, 0.02, 30); break;
        case 'win': [523, 659, 784].forEach((f, i) => T(f, 0.14, 'triangle', 0.14, i * 0.08)); break;
        case 'jackpot': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => T(f, 0.18, 'triangle', 0.15, i * 0.09)); break;
        case 'lose': T(300, 0.25, 'sawtooth', 0.07, 0, 150); break;
        case 'error': T(200, 0.12, 'square', 0.06); T(160, 0.15, 'square', 0.06, 0.1); break;
        case 'coin': T(1046, 0.07, 'square', 0.06); T(1568, 0.18, 'square', 0.06, 0.06); break;
      }
    }
  };

  /* ---------- Composants UI ---------- */
  const ui = {
    el(html) {
      const t = document.createElement('template');
      t.innerHTML = html.trim();
      return t.content.firstElementChild;
    },
    coin(cls = '') { return `<img class="coin ${cls}" src="${IMG}davecoin.png" alt="DaveCoin">`; },
    toast(text, type = 'info', ms = 2600) {
      let wrap = document.getElementById('toasts');
      if (!wrap) { wrap = ui.el('<div id="toasts" aria-live="polite"></div>'); document.body.appendChild(wrap); }
      const t = ui.el(`<div class="toast toast--${type}"></div>`);
      t.textContent = text;
      wrap.appendChild(t);
      requestAnimationFrame(() => t.classList.add('in'));
      setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
    },
    /** Bandeau de résultat affiché par-dessus la scène d'un jeu. */
    result(stage, { win, mult, amount, label }) {
      stage.querySelectorAll('.result-pop').forEach((n) => n.remove());
      const partial = win && mult != null && mult < 1; // une partie de la mise seulement est rendue
      const pop = ui.el(`<div class="result-pop ${partial ? '' : win ? 'is-win' : 'is-lose'}">
        <div class="result-pop__mult">${label || (mult != null ? fmtMult(mult) : '')}</div>
        <div class="result-pop__amount">${win ? '+' + fmt(amount) + ' ' + ui.coin('coin--sm') : 'Perdu'}</div>
      </div>`);
      stage.appendChild(pop);
      setTimeout(() => pop.classList.add('out'), 1900);
      setTimeout(() => pop.remove(), 2300);
      if (win) ui.confettiIf(stage, mult);
    },
    confettiIf(stage, mult) {
      if (!mult || mult < 5) return;
      const n = Math.min(80, 20 + mult * 2);
      for (let i = 0; i < n; i++) {
        const c = document.createElement('i');
        c.className = 'confetti';
        c.style.left = Math.random() * 100 + '%';
        c.style.background = rng.pick(['#f5c451', '#ffe7a0', '#3ddc84', '#a78bfa', '#ff6b8b']);
        c.style.animationDelay = Math.random() * 0.4 + 's';
        c.style.animationDuration = 1.2 + Math.random() * 1.2 + 's';
        c.style.transform = `rotate(${Math.random() * 360}deg)`;
        stage.appendChild(c);
        setTimeout(() => c.remove(), 3000);
      }
    },
    /** Structure standard d'un jeu : panneau de contrôle + scène. */
    layout(root) {
      root.innerHTML = '<div class="game"><aside class="panel"></aside><section class="stage"></section></div>';
      return { panel: root.querySelector('.panel'), stage: root.querySelector('.stage') };
    },
    /** Champ de mise avec raccourcis ½ / 2× / Max. */
    betInput(parent, { label = 'Mise', initial = 10, gameId = '' } = {}) {
      const saved = parseFloat(store.get('dp_lastbet_' + gameId));
      const start = saved > 0 ? saved : initial;
      const node = ui.el(`<div class="field">
        <div class="field__head"><label>${label}</label><span class="field__hint"></span></div>
        <div class="bet">
          <div class="bet__input">${ui.coin('coin--sm')}<input type="number" inputmode="decimal" min="0.01" step="any" value="${start}"></div>
          <button type="button" data-a="half">½</button>
          <button type="button" data-a="double">2×</button>
          <button type="button" data-a="max">Max</button>
        </div>
      </div>`);
      parent.appendChild(node);
      const input = node.querySelector('input');
      const hint = node.querySelector('.field__hint');
      const btns = node.querySelectorAll('button');
      const clamp = (v) => round2(Math.max(0, Math.min(v, wallet.get())));
      node.addEventListener('click', (e) => {
        const a = e.target.closest('button')?.dataset.a;
        if (!a) return;
        sound.play('click');
        let v = parseFloat(input.value) || 0;
        if (a === 'half') v = Math.max(0.01, round2(v / 2));
        if (a === 'double') v = clamp(v * 2 || 1);
        if (a === 'max') v = clamp(wallet.get());
        input.value = v;
        input.dispatchEvent(new Event('input'));
      });
      const api = {
        el: node,
        input,
        get() { return round2(parseFloat(input.value) || 0); },
        set(v) { input.value = round2(v); input.dispatchEvent(new Event('input')); },
        hint(text) { hint.textContent = text || ''; },
        disable(d) { input.disabled = d; btns.forEach((b) => (b.disabled = d)); },
        remember() { store.set('dp_lastbet_' + gameId, String(api.get())); },
        onChange(fn) { input.addEventListener('input', fn); }
      };
      return api;
    },
    /** Sélecteur segmenté (difficulté, risque…). */
    segmented(parent, { label, options, value, onChange }) {
      const node = ui.el(`<div class="field">
        <div class="field__head"><label>${label}</label></div>
        <div class="seg">${options.map((o) => `<button type="button" data-v="${o.value}">${o.label}</button>`).join('')}</div>
      </div>`);
      parent.appendChild(node);
      const btns = [...node.querySelectorAll('button')];
      let current = value;
      const paint = () => btns.forEach((b) => b.classList.toggle('on', b.dataset.v === String(current)));
      paint();
      node.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        sound.play('click');
        current = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
        paint();
        onChange && onChange(current);
      });
      return {
        get: () => current,
        disable(d) { btns.forEach((b) => (b.disabled = d)); }
      };
    },
    /** Ligne de statistique affichée dans le panneau. */
    readout(parent, label, value = '') {
      const node = ui.el(`<div class="readout"><span>${label}</span><strong></strong></div>`);
      node.querySelector('strong').innerHTML = value;
      parent.appendChild(node);
      return { set(v) { node.querySelector('strong').innerHTML = v; }, el: node };
    },
    button(parent, text, cls = 'btn btn--gold btn--lg btn--block') {
      const b = ui.el(`<button type="button" class="${cls}"></button>`);
      b.innerHTML = text;
      parent.appendChild(b);
      return b;
    }
  };

  /* ---------- Registre des jeux ---------- */
  const games = {
    list: [],
    register(def) { games.list.push(def); },
    find(id) { return games.list.find((g) => g.id === id); }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  window.DP = { IMG, store, rng, fmt, fmtMult, round2, esc, auth, wallet, bonus, stats, settle, sound, ui, games, on, off, emit, sleep };
})();
