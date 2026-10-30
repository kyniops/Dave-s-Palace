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
  function settle(game, bet, payout, { silent = false } = {}) {
    payout = round2(payout);
    wallet.credit(payout);
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
    let ctx = null, master = null, verbIn = null, noiseBuf = null;
    const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
    const hz = (semi, base = 523.25) => base * Math.pow(2, semi / 12); // base = Do5

    function init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = 0.75;
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
          case 'gem': { // progression : chaque gemme sonne plus haut
            const s = PENTA[Math.min(i, PENTA.length - 1)];
            bell(hz(s), 0, 0.14, 0.45);
            if (i >= 4) sparkle(0.03, Math.min(8, i));
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
        }
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
        c.style.background = rng.pick(['#c8ff3d', '#ffffff', '#ffc65c', '#8fb4ff']);
        c.style.animationDelay = Math.random() * 0.4 + 's';
        c.style.animationDuration = 1.2 + Math.random() * 1.2 + 's';
        c.style.transform = `rotate(${Math.random() * 360}deg)`;
        stage.appendChild(c);
        setTimeout(() => c.remove(), 3000);
      }
    },
    /* ---------- Effets visuels ---------- */
    _fxLayer() {
      let l = document.getElementById('fx');
      if (!l) { l = ui.el('<div id="fx" aria-hidden="true"></div>'); document.body.appendChild(l); }
      return l;
    },
    /** Éclat de particules depuis le centre d'un élément (ou d'un point {x, y} écran). */
    burst(target, { n = 12, colors = ['#c8ff3d', '#ffffff', '#ffc65c'], spread = 1, size = 6 } = {}) {
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
    flash(el, color = 'rgba(200,255,61,.35)') {
      const f = document.createElement('i');
      f.className = 'fx-flash';
      f.style.background = `radial-gradient(circle, ${color}, transparent 70%)`;
      el.appendChild(f);
      f.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' }).finished.then(() => f.remove());
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

  /* ---------- Registre des jeux ---------- */
  const games = {
    list: [],
    register(def) { games.list.push(def); },
    find(id) { return games.list.find((g) => g.id === id); }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  window.DP = { IMG, store, rng, fmt, fmtMult, round2, esc, auth, wallet, bonus, stats, settle, sound, ui, games, on, off, emit, sleep };
})();
