/* Dave's Palace — cœur de l'application
 * Comptes, portefeuille DaveCoin, statistiques, sons, RNG et composants UI partagés.
 * Les clés localStorage historiques (utilisateurs, utilisateurCourant, davecoin_<user>)
 * sont conservées pour que les anciens comptes et soldes restent valides.
 */
(function () {
  'use strict';

  const IMG = 'assets/img/';
  const START_BALANCE = 1000;
  const DAILY_COOLDOWN = 12 * 3600 * 1000; // roue quotidienne : une rotation toutes les 12 h
  // Cases de la roue quotidienne : [gain, poids]
  const DAILY_WHEEL = [[100, 18], [500, 8], [150, 16], [1000, 4], [200, 14], [2500, 1.5], [100, 18], [750, 6], [250, 12], [5000, 0.5]];
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
    /** Tire la case de la roue quotidienne (sans encore créditer). */
    drawDaily() {
      const total = DAILY_WHEEL.reduce((a, s) => a + s[1], 0);
      let r = rng.float() * total;
      for (let i = 0; i < DAILY_WHEEL.length; i++) { r -= DAILY_WHEEL[i][1]; if (r < 0) return i; }
      return 0;
    },
    claimDaily(index) {
      if (bonus.dailyLeft() > 0) return 0;
      const amount = DAILY_WHEEL[index][0];
      store.set(bonus._key('bonus'), String(Date.now()));
      wallet.credit(amount);
      stats.income('daily', amount);
      emit('bonus');
      return amount;
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
      stats.income('rescue', RESCUE_AMOUNT);
      emit('bonus');
      return RESCUE_AMOUNT;
    },
    DAILY_WHEEL, DAILY_MAX: 5000, RESCUE_AMOUNT
  };

  /* ---------- Jackpot global progressif ----------
   * Partagé par tous les comptes du navigateur. Il ne fait que monter : 1 % de chaque mise
   * du casino l'alimente, plus une croissance continue (le « réseau » des autres machines).
   * Il se gagne uniquement sur DaveMachine, puis repart de sa valeur de départ.
   */
  const JACKPOT_SEED = 25000, JACKPOT_RATE = 0.01;
  const jackpot = {
    SEED: JACKPOT_SEED,
    get() { const v = parseFloat(store.get('dp_jackpot')); return isNaN(v) || v < JACKPOT_SEED ? JACKPOT_SEED : round2(v); },
    feed(amount) {
      if (!(amount > 0)) return;
      const v = round2(jackpot.get() + amount);
      store.set('dp_jackpot', String(v));
      emit('jackpot', v);
    },
    /** Remporte la cagnotte : renvoie le montant et remet le jackpot à sa valeur de départ. */
    win(name) {
      const v = jackpot.get();
      store.set('dp_jackpot', String(JACKPOT_SEED));
      store.setJson('dp_jackpot_last', { name, amount: v, t: Date.now() });
      emit('jackpot', JACKPOT_SEED);
      emit('jackpotwin', { name, amount: v });
      return v;
    },
    last() { return store.json('dp_jackpot_last', null); }
  };
  setInterval(() => jackpot.feed(round2(0.3 + rng.float() * 2.4)), 2500);
  // un autre onglet a modifié le jackpot : on rafraîchit l'affichage
  window.addEventListener('storage', (e) => { if (e.key === 'dp_jackpot') emit('jackpot', jackpot.get()); });

  /* ---------- Codes promo (une fois par compte) ---------- */
  const PROMO_CODES = { dave33: 3333, fan2jc: 5000 };
  const promo = {
    key() { return 'dp_codes_' + auth.current(); },
    used() { return store.json(promo.key(), []); },
    redeem(raw) {
      const code = String(raw || '').trim().toLowerCase();
      if (!code) return { error: 'Entre un code.' };
      const amount = PROMO_CODES[code];
      if (!amount) return { error: 'Ce code n’existe pas.' };
      const used = promo.used();
      if (used.some((u) => u.code === code)) return { error: 'Tu as déjà utilisé ce code sur ce compte.' };
      used.push({ code, amount, t: Date.now() });
      store.setJson(promo.key(), used);
      wallet.credit(amount);
      stats.income('promo', amount);
      emit('bonus');
      return { code, amount };
    }
  };

  /* ---------- Statistiques ---------- */
  const dayKey = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const stats = {
    key() { return 'dp_stats_' + auth.current(); },
    /** Stats d'un compte (games : détail par jeu, curve : évolution du solde, days : activité par jour, income : bonus, codes, ventes…). */
    of(name) {
      return Object.assign(
        { played: 0, wagered: 0, won: 0, wins: 0, biggestWin: 0, biggestMult: 0, perGame: {}, games: {}, days: {}, curve: [], income: {}, history: [], since: null },
        store.json('dp_stats_' + name, {})
      );
    },
    get() { return stats.of(auth.current()); },
    _point(s) {
      s.curve.push({ t: Date.now(), b: wallet.get() });
      if (s.curve.length > 300) s.curve = s.curve.slice(-300);
      if (!s.since) s.since = Date.now();
    },
    _day(s) {
      const k = dayKey();
      const keys = Object.keys(s.days).sort();
      if (keys.length > 60) keys.slice(0, keys.length - 60).forEach((x) => delete s.days[x]);
      return (s.days[k] = s.days[k] || { n: 0, wagered: 0, won: 0, income: 0 });
    },
    /** DaveCoins reçus hors partie : daily, rescue, promo, album, sale. */
    income(kind, amount) {
      if (!(amount > 0) || !auth.current()) return;
      const s = stats.get();
      s.income[kind] = round2((s.income[kind] || 0) + amount);
      const d = stats._day(s);
      d.income = round2(d.income + amount);
      stats._point(s);
      store.setJson(stats.key(), s);
      emit('stats', s);
      emit('income', { kind, amount });
    },
    record(game, bet, payout) {
      const s = stats.get();
      const mult = bet > 0 ? payout / bet : 0;
      s.played++;
      if (payout > bet) s.wins++;
      const g = (s.games[game] = s.games[game] || { n: 0, wagered: 0, won: 0, best: 0 });
      g.n++; g.wagered = round2(g.wagered + bet); g.won = round2(g.won + payout);
      if (payout - bet > g.best) g.best = round2(payout - bet);
      const d = stats._day(s);
      d.n++; d.wagered = round2(d.wagered + bet); d.won = round2(d.won + payout);
      stats._point(s);
      s.wagered = round2(s.wagered + bet);
      s.won = round2(s.won + payout);
      if (payout - bet > s.biggestWin) s.biggestWin = round2(payout - bet);
      if (mult > s.biggestMult) s.biggestMult = round2(mult);
      s.perGame[game] = (s.perGame[game] || 0) + 1;
      s.history.unshift({ game, bet: round2(bet), payout: round2(payout), mult: round2(mult), t: Date.now() });
      s.history = s.history.slice(0, 50);
      store.setJson(stats.key(), s);
      emit('stats', s);
      emit('played', s.history[0]);
    }
  };

  /** Clôture une partie : crédite le gain, enregistre les stats, joue le son adapté. */
  /** credit:false = la valeur est gagnée sous forme d'objets (cartes) et non versée en DaveCoins. */
  function settle(game, bet, payout, { silent = false, credit = true } = {}) {
    payout = round2(payout);
    if (credit) wallet.credit(payout);
    if (bet > 0) jackpot.feed(round2(bet * JACKPOT_RATE));
    stats.record(game, bet, payout);
    if (!silent) {
      if (payout > bet) sound.play(payout >= bet * 10 ? 'jackpot' : 'win', { x: payout / bet });
      else if (payout === 0) sound.play('lose');
    }
    return payout;
  }

  /* ---------- Sound design (Web Audio, 100 % synthétisé) ----------
   * Chaîne : voix → bus maître → compresseur → sortie, avec un envoi vers une réverbération.
   * Les sons « de progression » (gemmes, voies, scatters) montent sur une gamme pentatonique
   * pour que chaque réussite sonne un cran plus haut que la précédente.
   */
  const sound = (() => {
    let ctx = null, master = null, verbIn = null, noiseBuf = null, sfxVol = 1;
    const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
    const hz = (semi, base = 523.25) => base * Math.pow(2, semi / 12); // base = Do5

    function init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = 0.75 * sfxVol;
      master.connect(comp).connect(ctx.destination);
      // Réverbération : réponse impulsionnelle générée (bruit qui décroît)
      const len = ctx.sampleRate * 1.8;
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      const verb = ctx.createConvolver();
      verb.buffer = ir;
      verbIn = ctx.createGain();
      verbIn.gain.value = 1;
      verbIn.connect(verb).connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      return ctx;
    }
    function ready() {
      if (api.muted) return null;
      if (!ctx && !init()) return null;
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function out(node, rev) {
      node.connect(master);
      if (rev) { const s = ctx.createGain(); s.gain.value = rev; node.connect(s).connect(verbIn); }
    }
    /** Oscillateur avec enveloppe. */
    function tone({ f, f2, type = 'sine', t = 0, a = 0.004, d = 0.15, v = 0.15, rev = 0.12, detune = 0 }) {
      if (!ready()) return;
      const t0 = ctx.currentTime + t;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.detune.value = detune;
      o.frequency.setValueAtTime(f, t0);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(v, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
      o.connect(g); out(g, rev);
      o.start(t0); o.stop(t0 + a + d + 0.05);
    }
    /** Bruit filtré (chocs, souffles, clics). */
    function noise({ t = 0, d = 0.1, v = 0.2, type = 'bandpass', f = 2000, f2, q = 1, a = 0.002, rev = 0.05 }) {
      if (!ready()) return;
      const t0 = ctx.currentTime + t;
      const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf;
      flt.type = type; flt.Q.value = q;
      flt.frequency.setValueAtTime(f, t0);
      if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t0 + d);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(v, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
      src.connect(flt).connect(g); out(g, rev);
      src.start(t0, Math.random() * 0.5); src.stop(t0 + a + d + 0.05);
    }
    /** Note « cloche » : fondamentale + octave + quinte légère. */
    function bell(f, t = 0, v = 0.12, d = 0.5, rev = 0.35) {
      tone({ f, t, d, v, rev });
      tone({ f: f * 2, t, d: d * 0.6, v: v * 0.35, rev, type: 'triangle' });
      tone({ f: f * 3, t, d: d * 0.3, v: v * 0.12, rev });
    }
    const sparkle = (t = 0, n = 6) => { for (let i = 0; i < n; i++) noise({ t: t + i * 0.045 + Math.random() * 0.02, d: 0.04, v: 0.08, type: 'highpass', f: 6000 + Math.random() * 3000, rev: 0.3 }); };
    const chipClack = (t = 0, v = 0.3) => { noise({ t, d: 0.035, v, type: 'bandpass', f: 3400, q: 4 }); tone({ f: 2600 + Math.random() * 300, t, d: 0.05, v: v * 0.2, type: 'triangle', rev: 0 }); };
    const arp = (notes, step, t = 0, v = 0.12, d = 0.35, base) => notes.forEach((s, i) => bell(hz(s, base), t + i * step, v, d));

    const api = {
      muted: store.get('dp_muted') === '1',
      /** Volume des effets (0 à 1). */
      setVolume(v) { sfxVol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = 0.75 * sfxVol; },
      toggle() { api.muted = !api.muted; store.set('dp_muted', api.muted ? '1' : '0'); emit('sound', api.muted); return api.muted; },
      tone(f, d = 0.1, type = 'sine', v = 0.15, t = 0) { tone({ f, d, type, v, t }); },
      play(name, o = {}) {
        if (!ready()) return;
        const i = o.i || 0;
        switch (name) {
          case 'click': noise({ d: 0.02, v: 0.12, type: 'highpass', f: 3500 }); tone({ f: 1500, d: 0.025, v: 0.03, rev: 0 }); break;
          case 'tick': noise({ d: 0.018, v: 0.1, f: 2800 + (o.p || 0) * 600, q: 8 }); break;
          case 'bet': chipClack(0, 0.35); chipClack(0.06, 0.25); chipClack(0.1, 0.15); break;
          case 'chip': chipClack(0, 0.3); break;
          case 'card': noise({ d: 0.08, v: 0.28, type: 'bandpass', f: 1800, f2: 5000, q: 0.8 }); noise({ t: 0.06, d: 0.02, v: 0.15, f: 3000, q: 3 }); break;
          case 'cardFlip': noise({ d: 0.06, v: 0.2, f: 1200, f2: 4000, q: 1.2 }); tone({ f: 700, d: 0.05, v: 0.05, type: 'triangle' }); break;
          case 'spin': noise({ d: 0.4, v: 0.16, f: 300, f2: 1800, q: 1.4, a: 0.05 }); break;
          case 'whoosh': noise({ d: 0.3, v: 0.2, f: 600, f2: 3000, q: 1, a: 0.03 }); break;
          case 'reelStop':
            tone({ f: 150, f2: 55, d: 0.12, v: 0.35, rev: 0 });
            noise({ d: 0.05, v: 0.22, type: 'lowpass', f: 900 });
            tone({ f: hz(PENTA[i] - 12), d: 0.08, v: 0.04, type: 'triangle' });
            break;
          case 'scatter': bell(hz(PENTA[3 + i * 2]), 0, 0.16, 0.8, 0.5); sparkle(0.02, 5); break;
          case 'anticip': {
            const d = o.d || 1.2;
            tone({ f: 110, f2: 440, d, v: 0.07, type: 'sawtooth', a: 0.2, rev: 0.2 });
            tone({ f: 165, f2: 660, d, v: 0.05, type: 'sawtooth', a: 0.2, rev: 0.2, detune: 8 });
            noise({ d, v: 0.06, type: 'highpass', f: 1500, f2: 8000, a: 0.3, rev: 0.3 });
            break;
          }
          case 'gem':
          case 'streak': { // progression : chaque réussite monte d'un cran et ajoute une couche
            const lvl = Math.min(i, 15);
            const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24, 26];
            const s = MAJOR[lvl];
            const v = 0.1 + lvl * 0.008;
            noise({ d: 0.025, v: 0.1 + lvl * 0.01, type: 'bandpass', f: Math.min(9000, hz(s) * 4), q: 5 });   // attaque
            if (lvl >= 5) tone({ f: hz(s - 5), f2: hz(s), d: 0.05, v: v * 0.6, type: 'triangle', rev: 0 });    // petite note d'élan
            bell(hz(s), lvl >= 5 ? 0.04 : 0, v, 0.4 + lvl * 0.04);
            if (lvl >= 2) tone({ f: hz(s + 12), d: 0.3, v: v * 0.4, type: 'triangle', t: 0.02, rev: 0.3 });   // octave
            if (lvl >= 3) sparkle(0.03, Math.min(14, lvl + 1));
            if (lvl >= 4) [4, 7].forEach((k) => tone({ f: hz(s + k), d: 0.6, v: v * 0.3, type: 'triangle', t: 0.05, rev: 0.45 })); // accord
            if (lvl >= 6) tone({ f: hz(s - 24), d: 0.4, v: 0.13, rev: 0.1 });                                 // basse
            if (lvl >= 8) noise({ d: 0.5, v: 0.06 + lvl * 0.006, type: 'highpass', f: 1500, f2: 9000, a: 0.05, rev: 0.35 }); // souffle
            if (lvl >= 11) arp([12, 16, 19, 24].map((k) => k + s - 12), 0.04, 0.12, 0.07, 0.3);             // cascade
            break;
          }
          case 'step': {
            const s = PENTA[Math.min(i, PENTA.length - 1)];
            tone({ f: hz(s - 12), d: 0.12, v: 0.12, type: 'square', rev: 0.15 });
            tone({ f: hz(s), d: 0.2, v: 0.08, type: 'triangle', t: 0.04, rev: 0.25 });
            noise({ d: 0.06, v: 0.08, type: 'highpass', f: 4000 });
            break;
          }
          case 'peg': tone({ f: hz(PENTA[i % 10] + 12), d: 0.07, v: 0.035, type: 'triangle', rev: 0.15 }); break;
          case 'land': { // plinko : l'intensité dépend du multiplicateur
            const x = o.x || 0;
            if (x < 1) tone({ f: 260, f2: 200, d: 0.12, v: 0.06, type: 'triangle' });
            else if (x < 3) { bell(hz(7), 0, 0.1, 0.3); }
            else if (x < 20) arp([0, 4, 7, 12], 0.05, 0, 0.11, 0.3);
            else { arp([0, 4, 7, 12, 16, 19, 24], 0.05, 0, 0.13, 0.4); sparkle(0.2, 10); }
            break;
          }
          case 'boom':
            noise({ d: 0.9, v: 0.7, type: 'lowpass', f: 2500, f2: 80, rev: 0.3 });
            tone({ f: 90, f2: 28, d: 0.7, v: 0.6, rev: 0.1 });
            noise({ t: 0.05, d: 0.4, v: 0.25, type: 'bandpass', f: 600, f2: 150, q: 0.7 });
            break;
          case 'lose': tone({ f: 392, f2: 370, d: 0.18, v: 0.07, type: 'triangle' }); tone({ f: 311, f2: 294, d: 0.35, v: 0.07, type: 'triangle', t: 0.14 }); break;
          case 'error': tone({ f: 200, d: 0.09, v: 0.07, type: 'square', rev: 0 }); tone({ f: 150, d: 0.12, v: 0.07, type: 'square', t: 0.1, rev: 0 }); break;
          case 'coin': bell(hz(11), 0, 0.1, 0.12, 0.1); bell(hz(16), 0.07, 0.12, 0.35, 0.25); break;
          case 'cashout': chipClack(0, 0.3); arp([0, 7, 12, 16], 0.06, 0.02, 0.12, 0.4); sparkle(0.15, 6); break;
          case 'win': { // plus le multiplicateur est gros, plus l'arpège est long
            const x = o.x || 2;
            const n = Math.max(3, Math.min(9, Math.round(2 + Math.log2(x + 1) * 1.6)));
            arp([0, 4, 7, 12, 16, 19, 24, 28, 31].slice(0, n), 0.065, 0, 0.12, 0.4);
            sparkle(0.1, Math.min(10, n));
            if (x >= 10) tone({ f: hz(-12), d: 0.8, v: 0.1, type: 'triangle', t: n * 0.065, rev: 0.4 });
            break;
          }
          case 'jackpot':
            arp([0, 4, 7, 12, 16, 19, 24], 0.07, 0, 0.13, 0.5);
            [0, 4, 7, 12].forEach((s) => tone({ f: hz(s), d: 1.2, v: 0.06, type: 'triangle', t: 0.5, rev: 0.5 }));
            sparkle(0.3, 12);
            break;
          case 'bigwin': { // boucle d'arpèges qui montent pendant tout le compteur
            const d = o.d || 3;
            const loops = Math.floor(d / 0.5);
            for (let k = 0; k < loops; k++) arp([0, 4, 7, 12].map((s) => s + Math.min(k, 7)), 0.08, k * 0.5, 0.09, 0.3);
            sparkle(0, Math.round(d * 10));
            tone({ f: hz(-24), f2: hz(-12), d, v: 0.08, type: 'sawtooth', a: 0.3, rev: 0.3 });
            break;
          }
          case 'tierUp':
            [0, 4, 7, 12, 16].forEach((s) => tone({ f: hz(s), d: 0.7, v: 0.07, type: 'triangle', rev: 0.4 }));
            noise({ d: 0.35, v: 0.15, type: 'highpass', f: 2000, f2: 9000, rev: 0.3 });
            break;
          case 'fs':
            noise({ d: 0.9, v: 0.14, type: 'highpass', f: 400, f2: 7000, a: 0.3, rev: 0.4 });
            arp([0, 4, 7, 12, 16, 19, 24, 28], 0.06, 0.25, 0.12, 0.5);
            [0, 7, 12, 16].forEach((s) => tone({ f: hz(s - 12), d: 1.6, v: 0.06, type: 'triangle', t: 0.75, rev: 0.6 }));
            sparkle(0.7, 14);
            break;
          case 'ball': noise({ d: 0.015, v: 0.08 + (o.v || 0), f: 3800 + Math.random() * 800, q: 10, rev: 0.02 }); break;
          case 'ballDrop': [0, 0.11, 0.2, 0.27, 0.32].forEach((t, k) => { noise({ t, d: 0.02, v: 0.22 / (k + 1), f: 3000, q: 6 }); tone({ f: 1800, t, d: 0.03, v: 0.04 / (k + 1), rev: 0 }); }); break;
          case 'flip': noise({ d: 0.5, v: 0.08, type: 'bandpass', f: 2500, f2: 6000, q: 6 }); for (let k = 0; k < 7; k++) tone({ f: 2200 + k * 90, t: k * 0.07, d: 0.03, v: 0.03, rev: 0 }); break;
          case 'dice': for (let k = 0; k < 5; k++) noise({ t: k * 0.05 + Math.random() * 0.02, d: 0.03, v: 0.18, type: 'bandpass', f: 1200 + Math.random() * 900, q: 3 }); break;
          case 'pop': tone({ f: 500, f2: 1100, d: 0.07, v: 0.1, rev: 0.1 }); break;
          case 'count': tone({ f: 400 + (o.k || 0) * 900, d: 0.04, v: 0.05, type: 'square', rev: 0.05 }); break;
          case 'slam':
            [0, 4, 7, 12, 16, 19, 24].forEach((st) => tone({ f: hz(st - 12), d: 1.6, v: 0.06, type: 'triangle', rev: 0.6 }));
            tone({ f: 110, f2: 40, d: 0.6, v: 0.4, rev: 0.2 });
            noise({ d: 0.8, v: 0.25, type: 'lowpass', f: 3000, f2: 200, rev: 0.4 });
            sparkle(0.1, 18);
            break;
        }
      },
      /** Bruit des rouleaux qui tournent : cliquetis rapide + souffle. set(n) = rouleaux encore en rotation. */
      reels(total = 5) {
        if (!ready()) return { set() {}, stop() {} };
        const g = ctx.createGain(); g.gain.value = 0.0001;
        const nz = ctx.createBufferSource(); nz.buffer = noiseBuf; nz.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.2;
        // le cliquetis vient d'une modulation d'amplitude rapide (les symboles qui défilent)
        const am = ctx.createGain(); am.gain.value = 0.5;
        const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 17;
        const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.5;
        lfo.connect(lfoAmt).connect(am.gain);
        const hum = ctx.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 92;
        const humG = ctx.createGain(); humG.gain.value = 0.25;
        nz.connect(bp).connect(am).connect(g);
        hum.connect(humG).connect(g);
        out(g, 0.05);
        const t0 = ctx.currentTime;
        [nz, lfo, hum].forEach((n) => n.start(t0));
        g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.12);
        return {
          set(n) {
            const now = ctx.currentTime;
            g.gain.setTargetAtTime(n > 0 ? 0.05 + 0.11 * (n / total) : 0.0001, now, 0.05);
            lfo.frequency.setTargetAtTime(9 + 8 * (n / total), now, 0.1);
          },
          stop() {
            const now = ctx.currentTime;
            g.gain.cancelScheduledValues(now);
            g.gain.setTargetAtTime(0.0001, now, 0.04);
            [nz, lfo, hum].forEach((n) => n.stop(now + 0.3));
          }
        };
      },
      /** Musique de bonus en boucle (basse + arpège) pendant les free spins. */
      fsMusic() {
        if (!ready()) return { stop() {} };
        let alive = true, step = 0;
        const BPM = 132, beat = 60 / BPM;
        const prog = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]];
        const tick = () => {
          if (!alive || api.muted) return;
          const chord = prog[Math.floor(step / 8) % prog.length];
          const s = step % 8;
          if (s % 2 === 0) tone({ f: hz(chord[0] - 24), d: beat * 0.9, v: 0.07, type: 'triangle', rev: 0.1 });
          tone({ f: hz(chord[s % 3] + (s >= 4 ? 12 : 0)), d: beat * 0.45, v: 0.04, type: 'square', rev: 0.25 });
          if (s % 4 === 2) noise({ d: 0.05, v: 0.05, type: 'highpass', f: 7000 });
          if (s % 4 === 0) tone({ f: 120, f2: 50, d: 0.12, v: 0.12, rev: 0 });
          step++;
        };
        const id = setInterval(tick, beat * 500);
        tick();
        return { stop() { alive = false; clearInterval(id); } };
      },
      /** Son continu (moteur de fusée) : renvoie { set(m), stop() }. */
      engine() {
        if (!ready()) return { set() {}, stop() {} };
        const g = ctx.createGain(); g.gain.value = 0.0001;
        const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter();
        o1.type = 'sawtooth'; o2.type = 'sawtooth'; o2.detune.value = 12;
        lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 4;
        const nz = ctx.createBufferSource(); nz.buffer = noiseBuf; nz.loop = true;
        const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 800; nf.Q.value = 0.8;
        const ng = ctx.createGain(); ng.gain.value = 0.25;
        o1.connect(lp); o2.connect(lp); nz.connect(nf).connect(ng).connect(lp);
        lp.connect(g); out(g, 0.1);
        const t0 = ctx.currentTime;
        o1.start(t0); o2.start(t0); nz.start(t0);
        g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.4);
        return {
          set(m) {
            const f = 55 + Math.min(500, Math.log(m) * 140);
            const now = ctx.currentTime;
            o1.frequency.setTargetAtTime(f, now, 0.1);
            o2.frequency.setTargetAtTime(f * 1.5, now, 0.1);
            lp.frequency.setTargetAtTime(400 + Math.min(4000, Math.log(m) * 1500), now, 0.1);
          },
          stop() {
            const now = ctx.currentTime;
            g.gain.cancelScheduledValues(now);
            g.gain.setTargetAtTime(0.0001, now, 0.06);
            [o1, o2, nz].forEach((n) => n.stop(now + 0.4));
          }
        };
      }
    };
    return api;
  })();

  /* ---------- Composants UI ---------- */
  const ui = {
    el(html) {
      const t = document.createElement('template');
      t.innerHTML = html.trim();
      return t.content.firstElementChild;
    },
    coin(cls = '') { return `<img class="coin ${cls}" src="${IMG}davecoin.png" alt="DaveCoin">`; },
    /** Icône SVG (Lucide) en ligne. */
    icon(name, cls = '') {
      const body = (window.DP_ICONS || {})[name] || '';
      return `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    },
    toast(text, type = 'info', ms = 2600) {
      let wrap = document.getElementById('toasts');
      if (!wrap) { wrap = ui.el('<div id="toasts" aria-live="polite"></div>'); document.body.appendChild(wrap); }
      const ico = { error: 'triangle-alert', win: 'sparkles', info: 'info' }[type] || 'info';
      const t = ui.el(`<div class="toast toast--${type}">${ui.icon(ico)}<span></span></div>`);
      t.querySelector('span').textContent = text;
      wrap.appendChild(t);
      requestAnimationFrame(() => t.classList.add('in'));
      setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
    },
    /** Bandeau de résultat affiché par-dessus la scène d'un jeu. */
    result(stage, { win, mult, amount, label }) {
      stage.querySelectorAll('.result-pop').forEach((n) => n.remove());
      const partial = win && mult != null && mult < 1; // une partie de la mise seulement est rendue
      const pop = ui.el(`<div class="result-pop ${partial ? '' : win ? 'is-win' : 'is-lose'}">
        <div class="result-pop__mult num">${label || (mult != null ? fmtMult(mult) : '')}</div>
        <div class="result-pop__amount">${win ? ui.coin('coin--sm') + '<span class="num">' + fmt(amount) + '</span>' : 'Perdu'}</div>
      </div>`);
      stage.appendChild(pop);
      if (win && !partial) {
        ui.burst(pop, { n: Math.min(40, 14 + Math.round((mult || 1) * 2)), spread: 1.6 });
        if (mult >= 10) { ui.flash(stage); ui.shake(stage, mult >= 50 ? 2 : 1); }
      }
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
        c.style.background = rng.pick(['#ff6b2c', '#ffffff', '#ffc65c', '#8fb4ff']);
        c.style.animationDelay = Math.random() * 0.4 + 's';
        c.style.animationDuration = 1.2 + Math.random() * 1.2 + 's';
        c.style.transform = `rotate(${Math.random() * 360}deg)`;
        stage.appendChild(c);
        setTimeout(() => c.remove(), 3000);
      }
    },
    /** Couronne d'ampoules autour d'un élément rond. Modes : .is-spinning (chenillard), .is-win (flash). */
    /**
     * Roue de casino en canvas, partagée par DaveWheel et la roue quotidienne :
     * jante en or brossé gravée, cases à facettes avec grain et relief, anneau décoratif, reflet de verre.
     * segs : [{ c, label, ink, size, icon }] (case i centrée sur i × 360/n, en partant du haut).
     * o : { hi (case gagnante), labelR, rIn, pegs }
     */
    wheel(g, S, ang, segs, o = {}) {
      const n = segs.length, seg = (Math.PI * 2) / n, R = S / 2;
      const rOut = R * 0.905, rIn = R * (o.rIn || 0.3), hi = o.hi;
      const TAU = Math.PI * 2;
      const shade = (hex, k) => {
        const v = parseInt(hex.slice(1), 16);
        const ch = (x) => Math.max(0, Math.min(255, Math.round(k > 0 ? x + (255 - x) * k : x * (1 + k))));
        return `rgb(${ch(v >> 16)},${ch((v >> 8) & 255)},${ch(v & 255)})`;
      };
      // grain (créé une fois)
      if (!ui._grain) {
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const x = c.getContext('2d'), d = x.createImageData(128, 128);
        for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 38; }
        x.putImageData(d, 0, 0);
        ui._grain = c;
      }
      const gold = (a0) => {
        if (!g.createConicGradient) { const l = g.createLinearGradient(-R, -R, R, R); l.addColorStop(0, '#ffe7a3'); l.addColorStop(0.5, '#8a5a17'); l.addColorStop(1, '#ffe7a3'); return l; }
        const cg = g.createConicGradient(a0, 0, 0);
        ['#fff3c4', '#c48a2c', '#7a4d12', '#e9b955', '#fff7d6', '#a9721f', '#6b420e', '#d9a441', '#fff3c4'].forEach((col, i, arr) => cg.addColorStop(i / (arr.length - 1), col));
        return cg;
      };
      g.clearRect(0, 0, S, S);
      g.save();
      g.translate(R, R);

      /* jante */
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fillStyle = gold(-0.6); g.fill();
      g.save(); g.globalAlpha = 0.5; g.fillStyle = g.createPattern(ui._grain, 'repeat'); g.fill(); g.restore();
      const bev = g.createLinearGradient(-R, -R, R, R);
      bev.addColorStop(0, 'rgba(255,255,255,.75)'); bev.addColorStop(0.5, 'rgba(255,255,255,0)'); bev.addColorStop(1, 'rgba(0,0,0,.55)');
      g.beginPath(); g.arc(0, 0, R * 0.985, 0, TAU); g.lineWidth = R * 0.018; g.strokeStyle = bev; g.stroke();
      // gravures
      g.strokeStyle = 'rgba(60,35,5,.45)'; g.lineWidth = Math.max(1, R * 0.004);
      for (let k = 0; k < 144; k++) {
        const a = (k / 144) * TAU, r0 = R * (k % 3 ? 0.955 : 0.945);
        g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * R * 0.972, Math.sin(a) * R * 0.972); g.stroke();
      }
      // gorge sombre
      g.beginPath(); g.arc(0, 0, R * 0.928, 0, TAU); g.fillStyle = '#05060a'; g.fill();
      const lip = g.createLinearGradient(-R, -R, R, R);
      lip.addColorStop(0, 'rgba(0,0,0,.8)'); lip.addColorStop(1, 'rgba(255,230,160,.6)');
      g.lineWidth = R * 0.01; g.strokeStyle = lip; g.stroke();

      /* cases */
      g.rotate(ang);
      segs.forEach((s, i) => {
        const a0 = i * seg - seg / 2 - Math.PI / 2, a1 = a0 + seg, am = a0 + seg / 2;
        g.save();
        g.beginPath(); g.arc(0, 0, rOut, a0, a1); g.arc(0, 0, rIn, a1, a0, true); g.closePath();
        const base = g.createRadialGradient(0, 0, rIn, 0, 0, rOut);
        base.addColorStop(0, shade(s.c, -0.65)); base.addColorStop(0.55, s.c); base.addColorStop(0.9, shade(s.c, 0.18)); base.addColorStop(1, shade(s.c, -0.25));
        g.fillStyle = base; g.fill();
        g.clip();
        // facette : moitié éclairée, moitié dans l'ombre
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, rOut, a0, am); g.closePath(); g.fillStyle = 'rgba(255,255,255,.13)'; g.fill();
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, rOut, am, a1); g.closePath(); g.fillStyle = 'rgba(0,0,0,.2)'; g.fill();
        // stries concentriques + grain
        g.strokeStyle = 'rgba(255,255,255,.045)'; g.lineWidth = 1;
        for (let r = rIn; r < rOut; r += Math.max(2, R * 0.012)) { g.beginPath(); g.arc(0, 0, r, a0, a1); g.stroke(); }
        g.globalCompositeOperation = 'overlay'; g.fillStyle = g.createPattern(ui._grain, 'repeat'); g.fillRect(-R, -R, S, S);
        g.globalCompositeOperation = 'source-over';
        // biseau du bord extérieur et ombre intérieure
        g.beginPath(); g.arc(0, 0, rOut - R * 0.012, a0, a1); g.lineWidth = R * 0.016; g.strokeStyle = 'rgba(255,255,255,.22)'; g.stroke();
        g.beginPath(); g.arc(0, 0, rIn + R * 0.02, a0, a1); g.lineWidth = R * 0.04; g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke();
        g.restore();

        // séparateur en or avec ombre portée
        const sx = Math.cos(a0), sy = Math.sin(a0);
        g.beginPath(); g.moveTo(sx * rIn, sy * rIn); g.lineTo(sx * rOut, sy * rOut);
        g.lineWidth = Math.max(2, R * 0.012); g.strokeStyle = 'rgba(0,0,0,.45)'; g.stroke();
        g.lineWidth = Math.max(1, R * 0.006); g.strokeStyle = '#e8c26c'; g.stroke();

        // contenu (icône + valeur)
        g.save();
        g.rotate(i * seg);
        const lr = R * (o.labelR || 0.66);
        if (s.icon === 'coin' || s.icon === 'star') {
          const ir = R * 0.045, iy = -lr + R * (s.size || 0.1) * 0.95;
          if (s.icon === 'coin') {
            const cg = g.createRadialGradient(-ir * 0.3, iy - ir * 0.3, 0, 0, iy, ir);
            cg.addColorStop(0, '#fff3c4'); cg.addColorStop(0.6, '#e9b143'); cg.addColorStop(1, '#8a5a17');
            g.beginPath(); g.arc(0, iy, ir, 0, TAU); g.fillStyle = cg; g.fill();
            g.beginPath(); g.arc(0, iy, ir * 0.62, 0, TAU); g.lineWidth = Math.max(1, ir * 0.18); g.strokeStyle = 'rgba(122,77,18,.7)'; g.stroke();
          } else {
            g.beginPath();
            for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU - Math.PI / 2, rr = k % 2 ? ir * 0.45 : ir * 1.15; g.lineTo(Math.cos(a) * rr, iy + Math.sin(a) * rr); }
            g.closePath(); g.fillStyle = '#fff7d6'; g.shadowColor = '#fff'; g.shadowBlur = R * 0.04; g.fill(); g.shadowBlur = 0;
          }
        }
        if (s.label) {
          g.font = `700 ${R * (s.size || 0.1)}px "Chakra Petch", sans-serif`;
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.lineJoin = 'round';
          g.lineWidth = R * 0.016; g.strokeStyle = s.ink === '#fff' || s.ink === '#f4f6fb' ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.35)';
          g.strokeText(s.label, 0, -lr);
          g.fillStyle = s.ink; g.fillText(s.label, 0, -lr);
        }
        g.restore();

        // gagnant / perdants
        if (hi != null) {
          g.beginPath(); g.arc(0, 0, rOut, a0, a1); g.arc(0, 0, rIn, a1, a0, true); g.closePath();
          if (hi === i) { g.lineWidth = R * 0.022; g.strokeStyle = '#fff'; g.shadowColor = s.c; g.shadowBlur = R * 0.08; g.stroke(); g.shadowBlur = 0; }
          else { g.fillStyle = 'rgba(3,4,7,.68)'; g.fill(); }
        }
      });

      /* anneau décoratif autour du moyeu */
      g.beginPath(); g.arc(0, 0, rIn + R * 0.012, 0, TAU); g.lineWidth = R * 0.024; g.strokeStyle = gold(0.4); g.stroke();
      for (let k = 0; k < n * (n > 20 ? 1 : 2); k++) {
        const a = (k / (n * (n > 20 ? 1 : 2))) * TAU;
        g.beginPath(); g.arc(Math.cos(a) * (rIn + R * 0.045), Math.sin(a) * (rIn + R * 0.045), R * 0.006, 0, TAU); g.fillStyle = 'rgba(255,226,168,.55)'; g.fill();
      }

      /* reflet de verre (fixe) */
      g.rotate(-ang);
      const gl = g.createRadialGradient(-R * 0.35, -R * 0.45, R * 0.02, -R * 0.1, -R * 0.15, rOut * 1.05);
      gl.addColorStop(0, 'rgba(255,255,255,.22)'); gl.addColorStop(0.35, 'rgba(255,255,255,.05)'); gl.addColorStop(0.75, 'rgba(0,0,0,0)'); gl.addColorStop(1, 'rgba(0,0,0,.4)');
      g.beginPath(); g.arc(0, 0, rOut, 0, TAU); g.fillStyle = gl; g.fill();
      // croissant spéculaire en haut à gauche
      g.save();
      g.beginPath(); g.arc(0, 0, rOut * 0.97, Math.PI * 1.08, Math.PI * 1.62); g.arc(-R * 0.06, -R * 0.06, rOut * 0.86, Math.PI * 1.62, Math.PI * 1.08, true); g.closePath();
      const sp = g.createLinearGradient(-R, -R, 0, 0); sp.addColorStop(0, 'rgba(255,255,255,.28)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sp; g.fill();
      g.restore();

      /* picots en laiton sur les séparateurs */
      if (o.pegs !== false) {
        g.rotate(ang);
        for (let i = 0; i < n; i++) {
          const a = i * seg - seg / 2 - Math.PI / 2, px = Math.cos(a) * R * 0.915, py = Math.sin(a) * R * 0.915, pr = R * (n > 20 ? 0.012 : 0.02);
          g.beginPath(); g.arc(px + pr * 0.25, py + pr * 0.35, pr, 0, TAU); g.fillStyle = 'rgba(0,0,0,.6)'; g.fill();
          const pg = g.createRadialGradient(px - pr * 0.35, py - pr * 0.35, 0, px, py, pr);
          pg.addColorStop(0, '#fffaf0'); pg.addColorStop(0.45, '#f0c867'); pg.addColorStop(1, '#7a4d12');
          g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fillStyle = pg; g.fill();
        }
      }
      g.restore();
    },
    /** Confirmation en deux clics : le 1er arme le bouton (« Confirmer ? »), le 2e valide. Renvoie true au 2e clic. */
    confirmClick(btn, text = 'Confirmer la vente') {
      if (btn.dataset.armed === '1') { clearTimeout(btn._armT); btn.dataset.armed = ''; return true; }
      btn._label = btn.innerHTML;
      btn.dataset.armed = '1';
      btn.classList.add('btn--confirm');
      btn.innerHTML = text + ' ?';
      sound.play('click');
      btn._armT = setTimeout(() => { if (!btn.isConnected) return; btn.dataset.armed = ''; btn.classList.remove('btn--confirm'); btn.innerHTML = btn._label; }, 3500);
      return false;
    },
    bulbs(el, n = 32) {
      el.querySelectorAll('.bulbring').forEach((x) => x.remove());
      const ring = document.createElement('div');
      ring.className = 'bulbring';
      ring.innerHTML = Array.from({ length: n }, (_, i) => `<i style="--a:${(i * 360) / n}deg;--i:${i}"></i>`).join('');
      el.appendChild(ring);
      const size = () => ring.style.setProperty('--r', ring.clientWidth / 2 + 'px');
      size();
      return { ring, size };
    },
    /* ---------- Effets visuels ---------- */
    _fxLayer() {
      let l = document.getElementById('fx');
      if (!l) { l = ui.el('<div id="fx" aria-hidden="true"></div>'); document.body.appendChild(l); }
      return l;
    },
    /** Éclat de particules depuis le centre d'un élément (ou d'un point {x, y} écran). */
    burst(target, { n = 12, colors = ['#ff6b2c', '#ffffff', '#ffc65c'], spread = 1, size = 6 } = {}) {
      if (!target) return;
      const r = target.getBoundingClientRect ? target.getBoundingClientRect() : { left: target.x, top: target.y, width: 0, height: 0 };
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const layer = ui._fxLayer();
      for (let i = 0; i < n; i++) {
        const p = document.createElement('i');
        p.className = 'fx-p' + (Math.random() < 0.35 ? ' star' : '');
        const s = size * (0.5 + Math.random());
        p.style.cssText = `left:${cx}px;top:${cy}px;width:${s}px;height:${s}px;background:${rng.pick(colors)}`;
        layer.appendChild(p);
        const a = Math.random() * Math.PI * 2, d = (40 + Math.random() * 80) * spread;
        p.animate([
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 30}px)) scale(.2)`, opacity: 0 }
        ], { duration: 600 + Math.random() * 500, easing: 'cubic-bezier(.15,.8,.3,1)' }).finished.then(() => p.remove());
      }
    },
    /** Petit texte qui s'envole (ex. « +12 »). */
    floatText(target, text, cls = '') {
      const r = target.getBoundingClientRect();
      const t = document.createElement('span');
      t.className = 'fx-float ' + cls;
      t.textContent = text;
      t.style.left = r.left + r.width / 2 + 'px';
      t.style.top = r.top + r.height / 2 + 'px';
      ui._fxLayer().appendChild(t);
      t.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-110%) scale(1.15)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-260%) scale(1)', opacity: 0 }],
        { duration: 1200, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished.then(() => t.remove());
    },
    shake(el, level = 1) {
      if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const a = 3 * level;
      el.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-a}px,${a / 2}px)` }, { transform: `translate(${a}px,${-a / 2}px)` }, { transform: `translate(${-a / 2}px,${-a}px)` }, { transform: `translate(${a / 2}px,${a}px)` }, { transform: 'translate(0,0)' }],
        { duration: 380 + level * 60, easing: 'ease-out' });
    },
    /** Bref éclair blanc neutre (pas de halo coloré). */
    flash(el) {
      const f = document.createElement('i');
      f.className = 'fx-flash';
      el.appendChild(f);
      f.animate([{ opacity: 0 }, { opacity: 0.12, offset: 0.12 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' }).finished.then(() => f.remove());
    },
    coinRain(el, n = 30) {
      for (let i = 0; i < n; i++) {
        const c = document.createElement('img');
        c.src = IMG + 'davecoin.png';
        c.className = 'coin-drop';
        c.style.left = Math.random() * 100 + '%';
        c.style.width = 22 + Math.random() * 28 + 'px';
        c.style.animationDelay = Math.random() * 1.2 + 's';
        c.style.animationDuration = 1.3 + Math.random() * 1.2 + 's';
        el.appendChild(c);
        setTimeout(() => c.remove(), 4200);
      }
    },
    /** Structure standard d'un jeu : panneau de contrôle + scène. */
    layout(root) {
      root.innerHTML = '<div class="game"><aside class="panel glass"></aside><section class="stage glass"></section></div>';
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
    button(parent, text, cls = 'btn btn--primary btn--lg btn--block') {
      const b = ui.el(`<button type="button" class="${cls}"></button>`);
      b.innerHTML = text;
      parent.appendChild(b);
      return b;
    }
  };

  /* ---------- Inventaire de cartes ----------
   * Le catalogue des cartes (cards.byId, cards.sets) est rempli par DaveCases au chargement.
   * L'inventaire stocke seulement le nombre d'exemplaires de chaque carte.
   */
  const cards = { byId: {}, sets: [] };
  const SHINY_MULT = 7, FUSE_COST = 5;
  const inventory = {
    SHINY_MULT, FUSE_COST,
    key() { return 'dp_inv_' + auth.current(); },
    _get() { return Object.assign({ cards: {}, shiny: {}, claimed: {} }, store.json(inventory.key(), {})); },
    _save(d) { store.setJson(inventory.key(), d); emit('inventory', d); },
    count(id) { return inventory._get().cards[id] || 0; },
    shinyCount(id) { return inventory._get().shiny[id] || 0; },
    add(ids) {
      const d = inventory._get();
      ids.forEach((id) => (d.cards[id] = (d.cards[id] || 0) + 1));
      inventory._save(d);
      emit('cards', ids);
    },
    /** Vend n exemplaires d'une carte (normale ou brillante) : retire de l'inventaire et crédite la valeur. */
    sell(id, n = 1, shiny = false) {
      const d = inventory._get(), bag = shiny ? d.shiny : d.cards;
      const have = bag[id] || 0;
      n = Math.min(n, have);
      if (n <= 0 || !cards.byId[id]) return 0;
      bag[id] = have - n;
      if (!bag[id]) delete bag[id];
      inventory._save(d);
      const value = round2(cards.byId[id].value * (shiny ? SHINY_MULT : 1) * n);
      wallet.credit(value);
      stats.income('sale', value);
      emit('sold', { id, n, shiny });
      return value;
    },
    /** Retire des cartes sans les vendre (DaveUpgrade). list : [{ id, shiny, n }]. */
    take(list) {
      const d = inventory._get();
      if (!list.every((x) => ((x.shiny ? d.shiny : d.cards)[x.id] || 0) >= x.n)) return false;
      list.forEach((x) => { const bag = x.shiny ? d.shiny : d.cards; bag[x.id] -= x.n; if (!bag[x.id]) delete bag[x.id]; });
      inventory._save(d);
      return true;
    },
    /** Fusion : 5 exemplaires identiques deviennent 1 carte brillante (valeur ×7). */
    fuse(id) {
      const d = inventory._get();
      if ((d.cards[id] || 0) < FUSE_COST || !cards.byId[id]) return false;
      d.cards[id] -= FUSE_COST;
      if (!d.cards[id]) delete d.cards[id];
      d.shiny[id] = (d.shiny[id] || 0) + 1;
      inventory._save(d);
      emit('fused', { id });
      return true;
    },
    entries() {
      const d = inventory._get();
      const out = Object.entries(d.cards).filter(([id]) => cards.byId[id]).map(([id, n]) => ({ card: cards.byId[id], n, shiny: false }));
      Object.entries(d.shiny).filter(([id]) => cards.byId[id]).forEach(([id, n]) => out.push({ card: cards.byId[id], n, shiny: true }));
      return out;
    },
    totals() {
      const e = inventory.entries();
      return {
        copies: e.reduce((a, x) => a + x.n, 0),
        unique: new Set(e.map((x) => x.card.id)).size,
        shiny: e.filter((x) => x.shiny).reduce((a, x) => a + x.n, 0),
        value: round2(e.reduce((a, x) => a + x.card.value * x.n * (x.shiny ? SHINY_MULT : 1), 0))
      };
    },
    setProgress(set) {
      const d = inventory._get();
      const owned = set.cards.filter((c) => d.cards[c.id] > 0 || d.shiny[c.id] > 0).length;
      return { owned, total: set.cards.length, complete: owned === set.cards.length, claimed: !!d.claimed[set.id] };
    },
    /** Récompense unique quand toutes les cartes d'un album sont possédées. */
    claimSet(set) {
      const p = inventory.setProgress(set);
      if (!p.complete || p.claimed) return 0;
      const d = inventory._get();
      d.claimed[set.id] = true;
      inventory._save(d);
      wallet.credit(set.reward);
      stats.income('album', set.reward);
      emit('album', set.id);
      return set.reward;
    }
  };

  /* ---------- Jetons de casino (partagés : roulette, dés…) ---------- */
  const chips = {
    LIST: [
      { v: 1, c: '#5b6378', e: '#e9ecf2', ink: '#fff' },
      { v: 5, c: '#e5484d', e: '#fff', ink: '#fff' },
      { v: 10, c: '#3d6bff', e: '#fff', ink: '#fff' },
      { v: 25, c: '#12a06e', e: '#fff', ink: '#fff' },
      { v: 100, c: '#15171f', e: '#ff6b2c', ink: '#ff6b2c' },
      { v: 500, c: '#ffb547', e: '#15171f', ink: '#1f1300' },
      { v: 1000, c: '#ff6b2c', e: '#15171f', ink: '#1a0700' }
    ],
    of(v) { return [...chips.LIST].reverse().find((c) => v >= c.v) || chips.LIST[0]; },
    short(v) { return v >= 1000 ? round2(v / 1000) + 'k' : String(round2(v)); },
    /** Jeton en SVG : bord à encoches, anneau pointillé, valeur au centre. */
    svg(v, cls = '') {
      const c = chips.of(v), t = chips.short(v);
      const notches = Array.from({ length: 6 }, (_, i) => `<rect x="46" y="2" width="8" height="14" rx="2" fill="${c.e}" transform="rotate(${i * 60} 50 50)"/>`).join('');
      return `<svg class="chip-svg ${cls}" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="52" r="48" fill="rgba(0,0,0,.45)"/>
        <circle cx="50" cy="50" r="48" fill="${c.c}"/>${notches}
        <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2"/>
        <circle cx="50" cy="50" r="33" fill="${c.c}" stroke="${c.e}" stroke-width="2.5" stroke-dasharray="5 4"/>
        <circle cx="50" cy="50" r="27" fill="rgba(255,255,255,.08)"/>
        <ellipse cx="38" cy="30" rx="20" ry="9" fill="rgba(255,255,255,.18)" transform="rotate(-25 38 30)"/>
        <text x="50" y="51" fill="${c.ink}" font-family="Geist, sans-serif" font-weight="600" font-size="${t.length > 3 ? 19 : 24}" text-anchor="middle" dominant-baseline="central">${t}</text>
      </svg>`;
    },
    /** Pile de jetons pour un montant donné. */
    stack(v) {
      const layers = Math.min(4, 1 + Math.floor(Math.log10(v / chips.of(v).v + 1) * 3));
      return Array.from({ length: layers }, (_, i) => `<i style="--k:${i}">${chips.svg(v)}</i>`).join('');
    },
    /** Sélecteur de jetons (rack). */
    rack(parent, { value = 10, onChange } = {}) {
      const node = ui.el(`<div class="field"><div class="field__head"><label>Jeton</label></div>
        <div class="chip-rack">${chips.LIST.map((c) => `<button type="button" class="chip-btn" data-chip="${c.v}" aria-label="Jeton ${c.v}">${chips.svg(c.v)}</button>`).join('')}</div></div>`);
      parent.appendChild(node);
      const btns = [...node.querySelectorAll('.chip-btn')];
      let cur = value;
      const paint = () => btns.forEach((b) => b.classList.toggle('on', +b.dataset.chip === cur));
      node.addEventListener('click', (e) => {
        const b = e.target.closest('.chip-btn');
        if (!b || b.disabled) return;
        cur = +b.dataset.chip;
        sound.play('chip');
        paint();
        onChange && onChange(cur);
      });
      paint();
      return {
        get: () => cur,
        disable(d) { btns.forEach((b) => (b.disabled = d)); },
        btnFor: (v) => btns.find((b) => +b.dataset.chip === v) || btns[0]
      };
    },
    /** Un jeton s'envole d'un élément vers un autre. */
    fly(fromEl, toEl, v, ms = 380) {
      const from = fromEl.getBoundingClientRect(), to = toEl.getBoundingClientRect();
      const f = ui.el(`<div class="chip-fly">${chips.svg(v)}</div>`);
      f.style.left = from.left + from.width / 2 + 'px';
      f.style.top = from.top + from.height / 2 + 'px';
      ui._fxLayer().appendChild(f);
      const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
      return f.animate([{ transform: 'translate(-50%,-50%) scale(1)' },
        { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 60}px)) scale(1.1) rotate(180deg)`, offset: 0.5 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.62) rotate(360deg)` }], { duration: ms, easing: 'cubic-bezier(.3,.7,.4,1)' }).finished.then(() => f.remove());
    }
  };

  /* ---------- Registre des jeux ---------- */
  const games = {
    list: [],
    register(def) { games.list.push(def); },
    find(id) { return games.list.find((g) => g.id === id); }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  window.DP = { IMG, store, rng, fmt, fmtMult, round2, esc, dayKey, PROMO_CODES, auth, wallet, bonus, promo, jackpot, stats, settle, sound, ui, chips, cards, inventory, games, on, off, emit, sleep };
})();
