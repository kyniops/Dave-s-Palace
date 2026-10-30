/* Dashboards : celui du joueur (#/profil) et celui de l'admin (#/admin).
 * Tout est lu dans le localStorage du navigateur : chaque compte créé ici apparaît côté admin.
 */
(() => {
  const { auth, wallet, bonus, promo, jackpot, stats, store, ui, games, cards, inventory, fmt, fmtMult, esc, round2, dayKey, PROMO_CODES, on } = DP;
  const I = ui.icon;
  const M = window.DP_MOTION;
  // L'accès admin est un simple verrou d'interface : tout le site tourne dans le navigateur.
  const ADMIN_CODE = 'palace-admin';
  const INCOME = { daily: 'Roue quotidienne', rescue: 'Dépannage', promo: 'Codes promo', album: 'Albums complétés', sale: 'Ventes de cartes' };

  const signed = (v) => (v > 0 ? '+' : '') + fmt(round2(v));
  const tone = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1).replace('.', ',') + ' %' : '—');
  const ago = (t) => {
    if (!t) return '—';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'à l’instant';
    if (m < 60) return `il y a ${m} min`;
    if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
    return `il y a ${Math.round(m / 1440)} j`;
  };
  const dur = (ms) => {
    const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min ${String(s % 60).padStart(2, '0')}`;
  };
  const gameName = (id) => (games.find(id) || { name: id }).name;
  const lastDays = (n) => Array.from({ length: n }, (_, i) => dayKey(Date.now() - (n - 1 - i) * 86400000));
  const shortDay = (k) => { const [, m, d] = k.split('-'); return `${+d}/${+m}`; };

  /* ---------- Graphiques (SVG dessinés à la largeur réelle du conteneur) ---------- */
  const tip = (() => {
    let el;
    return {
      show(html, x, y) {
        if (!el) { el = document.createElement('div'); el.className = 'dtip'; document.body.appendChild(el); }
        el.innerHTML = html; el.hidden = false;
        const r = el.getBoundingClientRect();
        el.style.left = Math.min(innerWidth - r.width - 8, Math.max(8, x - r.width / 2)) + 'px';
        el.style.top = Math.max(8, y - r.height - 14) + 'px';
      },
      hide() { if (el) el.hidden = true; }
    };
  })();

  /** Courbe du solde : aire + ligne, réticule et info-bulle au survol. */
  function lineChart(box, pts) {
    if (pts.length < 2) { box.innerHTML = `<div class="dchart__empty">${I('trending-up', 'i--lg')}Joue quelques parties pour voir ton solde évoluer.</div>`; return () => {}; }
    const draw = () => {
      const W = box.clientWidth, H = box.clientHeight || 240, P = { l: 8, r: 8, t: 16, b: 22 };
      const vals = pts.map((p) => p.b);
      let lo = Math.min(...vals), hi = Math.max(...vals);
      if (hi - lo < 1) { hi += 1; lo = Math.max(0, lo - 1); }
      const pad = (hi - lo) * 0.12; lo = Math.max(0, lo - pad); hi += pad;
      const X = (i) => P.l + (i / (pts.length - 1)) * (W - P.l - P.r);
      const Y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
      const when = (t) => { const x = new Date(t); return x.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.b).toFixed(1)}`).join('');
      const grid = [0.25, 0.5, 0.75].map((k) => { const v = lo + (hi - lo) * (1 - k); const y = Y(v); return `<line x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}" class="dgrid"/><text x="${P.l}" y="${y - 5}" class="dlabel">${fmt(Math.round(v))}</text>`; }).join('');
      box.innerHTML = `<svg width="${W}" height="${H}" class="dsvg">
        <defs><linearGradient id="dl-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".32"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
        ${grid}
        <path d="${d}L${X(pts.length - 1)},${H - P.b}L${X(0)},${H - P.b}Z" fill="url(#dl-fill)" class="dl-area"/>
        <path d="${d}" class="dl-line" pathLength="1"/>
        <text x="${P.l}" y="${H - 5}" class="dlabel">${when(pts[0].t)}</text>
        <text x="${W - P.r}" y="${H - 5}" class="dlabel" text-anchor="end">${when(pts[pts.length - 1].t)}</text>
        <line class="dl-cross" y1="${P.t}" y2="${H - P.b}" visibility="hidden"/><circle class="dl-dot" r="5" visibility="hidden"/>
      </svg>`;
      const svg = box.querySelector('svg'), cross = svg.querySelector('.dl-cross'), dot = svg.querySelector('.dl-dot');
      svg.addEventListener('pointermove', (e) => {
        const r = svg.getBoundingClientRect();
        const i = Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - r.left - P.l) / (W - P.l - P.r)) * (pts.length - 1))));
        const x = X(i), y = Y(pts[i].b);
        cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
        dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('visibility', 'visible');
        const prev = i ? pts[i].b - pts[i - 1].b : 0;
        tip.show(`<b>${fmt(pts[i].b)}</b> DaveCoins<span class="${tone(prev)}">${i ? signed(prev) : 'Départ'}</span><small>${new Date(pts[i].t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>`, r.left + x, r.top + y);
      });
      svg.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hide(); });
    };
    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(box);
    return () => { ro.disconnect(); tip.hide(); };
  }

  /** Barres verticales par jour. mode 'net' : positif / négatif autour de zéro ; 'count' : nombre de parties. */
  function dayBars(box, days, { mode = 'net' } = {}) {
    const keys = lastDays(14);
    const rows = keys.map((k) => ({ k, d: days[k] || { n: 0, wagered: 0, won: 0, income: 0 } }));
    const val = (r) => (mode === 'net' ? round2(r.d.won - r.d.wagered) : r.d.n);
    if (!rows.some((r) => r.d.n)) { box.innerHTML = `<div class="dchart__empty">${I('history', 'i--lg')}Aucune partie ces 14 derniers jours.</div>`; return () => {}; }
    const draw = () => {
      const W = box.clientWidth, H = box.clientHeight || 220, P = { t: 14, b: 22 };
      const max = Math.max(1, ...rows.map((r) => Math.abs(val(r))));
      const hasNeg = mode === 'net' && rows.some((r) => val(r) < 0);
      const zero = hasNeg ? P.t + (H - P.t - P.b) / 2 : H - P.b;
      const span = hasNeg ? (H - P.t - P.b) / 2 : H - P.t - P.b;
      const bw = W / rows.length;
      box.innerHTML = `<svg width="${W}" height="${H}" class="dsvg">
        <line x1="0" x2="${W}" y1="${zero}" y2="${zero}" class="dgrid dgrid--zero"/>
        ${rows.map((r, i) => {
          const v = val(r), h = Math.max(v ? 3 : 0, (Math.abs(v) / max) * span), x = i * bw + bw * 0.18, w = bw * 0.64;
          const y = v >= 0 ? zero - h : zero;
          const cls = mode === 'count' ? 'db-bar' : v >= 0 ? 'db-bar db-bar--pos' : 'db-bar db-bar--neg';
          return `<rect class="db-hit" x="${i * bw}" y="0" width="${bw}" height="${H - P.b}" data-i="${i}"/>
            <rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" style="--k:${i}"/>
            ${i % 2 === rows.length % 2 ? '' : `<text x="${x + w / 2}" y="${H - 6}" class="dlabel" text-anchor="middle">${shortDay(r.k)}</text>`}`;
        }).join('')}
      </svg>`;
      box.querySelectorAll('.db-hit').forEach((h) => {
        h.addEventListener('pointerenter', () => {
          const r = rows[+h.dataset.i], b = h.getBoundingClientRect();
          const net = round2(r.d.won - r.d.wagered);
          tip.show(`<b>${new Date(r.k + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</b>${fmt(r.d.n)} parties · ${fmt(r.d.wagered)} misés<span class="${tone(net)}">Bilan ${signed(net)}</span>${r.d.income ? `<small>+${fmt(r.d.income)} de bonus</small>` : ''}`, b.left + b.width / 2, b.top + 20);
        });
        h.addEventListener('pointerleave', tip.hide);
      });
    };
    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(box);
    return () => { ro.disconnect(); tip.hide(); };
  }

  /** Tableau par jeu avec barre de volume misé. */
  function gameTable(perGame, { showTheo = false } = {}) {
    const rows = Object.entries(perGame).filter(([, g]) => g.n).sort((a, b) => b[1].wagered - a[1].wagered);
    if (!rows.length) return `<div class="empty">${I('dices', 'i--lg')}<strong>Pas encore de données</strong>Les statistiques par jeu apparaissent après tes premières parties.</div>`;
    const max = Math.max(...rows.map(([, g]) => g.wagered), 1);
    return `<div class="table-wrap"><table class="history dtable">
      <thead><tr><th>Jeu</th><th class="num">Parties</th><th>Misé</th><th class="num">Redistribué</th><th class="num">Bilan</th><th class="num">RTP réel</th>${showTheo ? '<th class="num">RTP théorique</th>' : '<th class="num">Record</th>'}</tr></thead>
      <tbody>${rows.map(([id, g]) => {
        const def = games.find(id), net = round2(g.won - g.wagered);
        return `<tr><td><span class="g">${def ? I(def.icon, 'i--sm') : ''}${esc(gameName(id))}</span></td>
          <td class="num">${fmt(g.n)}</td>
          <td><div class="dbar"><i style="width:${(g.wagered / max) * 100}%"></i><span class="num">${fmt(g.wagered)}</span></div></td>
          <td class="num">${fmt(g.won)}</td>
          <td class="num ${tone(net)}">${signed(net)}</td>
          <td class="num">${pct(g.won, g.wagered)}</td>
          <td class="num muted">${showTheo ? (def ? def.rtp : '—') : g.best ? '+' + fmt(g.best) : '—'}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  /** Répartition des cartes possédées par rareté (barre segmentée + légende). */
  function rarityBar(entries) {
    const by = {};
    entries.forEach(({ card, n }) => { const r = card.rarity; (by[r.i] = by[r.i] || { r, n: 0 }).n += n; });
    const list = Object.values(by).sort((a, b) => a.r.i - b.r.i), total = list.reduce((a, x) => a + x.n, 0);
    if (!total) return '<p class="muted">Aucune carte pour l’instant.</p>';
    return `<div class="dseg">${list.map((x) => `<i style="flex:${x.n};--c:${x.r.c}" title="${x.r.label} : ${x.n}"></i>`).join('')}</div>
      <ul class="dlegend">${list.map((x) => `<li><i style="--c:${x.r.c}"></i>${x.r.label}<b class="num">${fmt(x.n)}</b></li>`).join('')}</ul>`;
  }

  const kpi = (label, value, { cls = '', sub = '', icon = '', count = null } = {}) =>
    `<div class="dkpi" data-reveal><span class="dkpi__label">${icon ? I(icon, 'i--sm') : ''}${label}</span><strong class="num ${cls}" ${count != null ? `data-count="${count}"` : ''}>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;

  function countUps(view) {
    view.querySelectorAll('[data-count]').forEach((el) => {
      const to = +el.dataset.count, prefix = el.textContent.trim().startsWith('+') ? '+' : '';
      if (M && M.countUp && Math.abs(to) > 0) M.countUp(el, to, (v) => prefix + fmt(round2(v)), 1100);
    });
  }

  /* ================= Dashboard joueur ================= */
  function player(view, { historyTable, openBonus }) {
    const name = auth.current();
    const s = stats.get();
    const bal = wallet.get();
    const net = round2(s.won - s.wagered);
    const inv = inventory.totals();
    const allCards = Object.keys(cards.byId).length;
    const incomeTotal = round2(Object.values(s.income).reduce((a, v) => a + v, 0));
    const perGame = Object.keys(s.games).length ? s.games : Object.fromEntries(Object.entries(s.perGame).map(([k, n]) => [k, { n, wagered: 0, won: 0, best: 0 }]));
    const fav = Object.entries(perGame).sort((a, b) => b[1].n - a[1].n)[0];
    const codesUsed = promo.used();
    const jpLast = jackpot.last();
    const curve = s.curve.length ? s.curve : [];

    view.innerHTML = `
      <div class="page-head dhead">
        <span class="avatar avatar--lg" data-reveal>${esc(name.charAt(0).toUpperCase())}</span>
        <div><h1>${esc(name)}</h1><p>Ton dashboard · ${s.since ? 'suivi depuis le ' + new Date(s.since).toLocaleDateString('fr-FR') : 'toutes tes infos en un coup d’œil'}</p></div>
        <div class="dhead__act"><a class="btn btn--ghost" href="#/inventaire">${I('layers-2', 'i--sm')}Inventaire</a><a class="btn btn--primary" href="#/caisses">${I('package-open', 'i--sm')}Caisses</a></div>
      </div>

      <section class="dkpis">
        ${kpi('Solde', fmt(bal), { icon: 'wallet', count: bal, sub: 'DaveCoins disponibles' })}
        ${kpi('Bilan des jeux', signed(net), { icon: 'trending-up', cls: tone(net), count: net, sub: `${fmt(s.won)} gagnés · ${fmt(s.wagered)} misés` })}
        ${kpi('Parties', fmt(s.played), { icon: 'dices', count: s.played, sub: fav ? 'Jeu préféré : ' + esc(gameName(fav[0])) : 'Aucune partie' })}
        ${kpi('Victoires', s.played ? pct(s.wins, s.played) : '—', { icon: 'trophy', sub: `${fmt(s.wins)} parties gagnantes` })}
        ${kpi('RTP perso', pct(s.won, s.wagered), { icon: 'percent', sub: 'Part des mises récupérée' })}
        ${kpi('Plus gros gain', s.biggestWin ? '+' + fmt(s.biggestWin) : '—', { icon: 'crown', sub: s.biggestMult ? 'Meilleur multi ' + fmtMult(s.biggestMult) : '' })}
      </section>

      <div class="dgrid-layout">
        <section class="dpanel dpanel--8 dpanel--fill" data-reveal>
          <header><h2>Évolution du solde</h2><span>${curve.length} points</span></header>
          <div class="dchart js-curve"></div>
        </section>

        <section class="dpanel dpanel--4" data-reveal>
          <header><h2>Bonus</h2><span>${I('gift', 'i--sm')}</span></header>
          <div class="dbonus">
            <div class="dbonus__row"><span>Roue quotidienne</span><b class="js-daily"></b></div>
            <button class="btn btn--primary btn--block js-open-bonus" type="button">${I('gift', 'i--sm')}Ouvrir la roue</button>
            <div class="dbonus__row"><span>Dépannage</span><b class="js-rescue"></b></div>
            <div class="dbonus__row"><span>Codes utilisés</span><b>${codesUsed.length} / ${Object.keys(PROMO_CODES).length}</b></div>
          </div>
          <h3 class="dsub">Gains hors jeu <b class="num">+${fmt(incomeTotal)}</b></h3>
          <ul class="dlist">${Object.entries(INCOME).map(([k, l]) => `<li><span>${l}</span><b class="num ${s.income[k] ? 'pos' : 'muted'}">${s.income[k] ? '+' + fmt(s.income[k]) : '0'}</b></li>`).join('')}</ul>
        </section>

        <section class="dpanel" data-reveal>
          <header><h2>Par jeu</h2><span>${Object.keys(perGame).length} jeux joués</span></header>
          ${gameTable(perGame)}
        </section>

        <section class="dpanel dpanel--6 dpanel--fill" data-reveal>
          <header><h2>14 derniers jours</h2><span>Bilan par jour</span></header>
          <div class="dchart dchart--bars js-days"></div>
        </section>

        <section class="dpanel dpanel--6 djp" data-reveal>
          <header><h2>Jackpot global</h2><a href="#/jeu/machine">DaveMachine${I('chevron-right', 'i--sm')}</a></header>
          <b class="djp__amount num js-jp">${fmt(jackpot.get())}</b>
          <p class="muted">${jpLast ? `Dernier gagnant : <b>${esc(jpLast.name)}</b> · ${fmt(jpLast.amount)} · ${ago(jpLast.t)}` : 'Personne ne l’a encore remporté.'}</p>
          <h3 class="dsub">Records</h3>
          <ul class="dlist">
            <li><span>Plus gros gain net</span><b class="num">${s.biggestWin ? '+' + fmt(s.biggestWin) : '—'}</b></li>
            <li><span>Meilleur multiplicateur</span><b class="num">${s.biggestMult ? fmtMult(s.biggestMult) : '—'}</b></li>
            <li><span>Total misé</span><b class="num">${fmt(s.wagered)}</b></li>
            <li><span>Total gagné</span><b class="num">${fmt(s.won)}</b></li>
          </ul>
        </section>

        <section class="dpanel dpanel--12 dcoll" data-reveal>
          <header><h2>Collection</h2><a href="#/inventaire">Voir l’inventaire${I('chevron-right', 'i--sm')}</a></header>
          <div class="dcoll__col">
          <div class="dmini">
            <div><span>Cartes uniques</span><b class="num">${inv.unique} / ${allCards}</b></div>
            <div><span>Exemplaires</span><b class="num">${fmt(inv.copies)}</b></div>
            <div><span>Valeur à la revente</span><b class="num">${fmt(inv.value)}</b></div>
          </div>
          ${rarityBar(inventory.entries())}
          </div>
          <div class="dcoll__col">
          <h3 class="dsub">Albums</h3>
          <ul class="dalbums">${cards.sets.map((set) => {
            const p = inventory.setProgress(set);
            return `<li><span>${esc(set.name)}</span><div class="dprog"><i style="width:${(p.owned / p.total) * 100}%"></i></div><b class="num">${p.owned}/${p.total}</b>${p.claimed ? `<em class="pos">${I('check', 'i--sm')}Récompensé</em>` : p.complete ? '<em class="pos">À réclamer</em>' : `<em class="muted">+${fmt(set.reward)}</em>`}</li>`;
          }).join('')}</ul>
          </div>
        </section>
      </div>

      <div class="section-head"><h2>Historique</h2><span>50 dernières parties</span></div>
      ${historyTable(s.history)}`;

    const offs = [lineChart(view.querySelector('.js-curve'), curve), dayBars(view.querySelector('.js-days'), s.days)];
    view.querySelector('.js-open-bonus').addEventListener('click', openBonus);

    // minuteurs des bonus, rafraîchis chaque seconde
    const paintTimers = () => {
      const d = bonus.dailyLeft(), r = bonus.rescueLeft();
      view.querySelector('.js-daily').innerHTML = d ? `<span class="muted">dans ${dur(d)}</span>` : '<span class="pos">Disponible</span>';
      view.querySelector('.js-rescue').innerHTML = bonus.canRescue() ? '<span class="pos">Disponible</span>' : r ? `<span class="muted">dans ${dur(r)}</span>` : '<span class="muted">Solde &gt; 0</span>';
      view.querySelector('.js-open-bonus').disabled = d > 0;
    };
    paintTimers();
    const timer = setInterval(paintTimers, 1000);
    const jpEl = view.querySelector('.js-jp');
    const offJp = on('jackpot', (v) => { jpEl.textContent = fmt(v); });
    const offBonus = on('bonus', paintTimers);

    M.reveal(view, '[data-reveal]');
    countUps(view);
    return () => { offs.forEach((f) => f()); clearInterval(timer); offJp(); offBonus(); };
  }

  /* ================= Dashboard admin ================= */
  const adminOpen = () => { try { return sessionStorage.getItem('dp_admin') === '1'; } catch { return false; } };

  function lockScreen(view, done) {
    view.innerHTML = `
      <div class="page-head" data-reveal><span class="game-head__ico">${I('shield', 'i--lg')}</span><div><h1>Admin</h1><p>Zone réservée. Entre le code d’accès.</p></div></div>
      <form class="code-box" data-reveal novalidate>
        <label class="field"><span>Code d’accès</span><input name="code" type="password" autocomplete="off" maxlength="40"></label>
        <button class="btn btn--primary btn--lg" type="submit">${I('lock', 'i--sm')}Déverrouiller</button>
        <p class="code-box__msg" role="status"></p>
      </form>`;
    const form = view.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (form.code.value.trim() !== ADMIN_CODE) {
        form.querySelector('.code-box__msg').textContent = 'Code incorrect.';
        form.querySelector('.code-box__msg').className = 'code-box__msg neg';
        DP.sound.play('error');
        form.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 260 });
        return;
      }
      try { sessionStorage.setItem('dp_admin', '1'); } catch { /* ignore */ }
      DP.sound.play('win');
      done();
    });
    M.reveal(view, '[data-reveal]');
    form.code.focus();
    return () => {};
  }

  /** Lit toutes les données de chaque compte du navigateur. */
  function collect() {
    return auth.users().map((u) => {
      const n = u.prenom, s = stats.of(n);
      const invRaw = Object.assign({ cards: {} }, store.json('dp_inv_' + n, {})).cards;
      const inv = Object.entries(invRaw).filter(([id]) => cards.byId[id]);
      const bal = parseFloat(store.get('davecoin_' + n));
      return {
        name: n, s,
        balance: isNaN(bal) ? 0 : round2(bal),
        net: round2(s.won - s.wagered),
        copies: inv.reduce((a, [, c]) => a + c, 0),
        unique: inv.length,
        invValue: round2(inv.reduce((a, [id, c]) => a + cards.byId[id].value * c, 0)),
        codes: store.json('dp_codes_' + n, []),
        last: s.history[0] ? s.history[0].t : s.curve.length ? s.curve[s.curve.length - 1].t : null
      };
    });
  }

  function admin(view, ctx) {
    if (!adminOpen()) return lockScreen(view, () => ctx.rerender());
    const users = collect();
    const sum = (f) => round2(users.reduce((a, u) => a + f(u), 0));
    const wagered = sum((u) => u.s.wagered), won = sum((u) => u.s.won), played = sum((u) => u.s.played);
    const circ = sum((u) => u.balance);
    const perGame = {}, days = {}, income = {};
    users.forEach((u) => {
      Object.entries(u.s.games).forEach(([id, g]) => {
        const t = (perGame[id] = perGame[id] || { n: 0, wagered: 0, won: 0, best: 0 });
        t.n += g.n; t.wagered = round2(t.wagered + g.wagered); t.won = round2(t.won + g.won); t.best = Math.max(t.best, g.best);
      });
      Object.entries(u.s.days).forEach(([k, d]) => {
        const t = (days[k] = days[k] || { n: 0, wagered: 0, won: 0, income: 0 });
        t.n += d.n; t.wagered = round2(t.wagered + d.wagered); t.won = round2(t.won + d.won); t.income = round2(t.income + d.income);
      });
      Object.entries(u.s.income).forEach(([k, v]) => (income[k] = round2((income[k] || 0) + v)));
    });
    const codeUse = Object.keys(PROMO_CODES).map((c) => ({ c, n: users.filter((u) => u.codes.some((x) => x.code === c)).length }));
    const jpLast = jackpot.last();
    let sortKey = 'balance', sortDir = -1;

    view.innerHTML = `
      <div class="page-head dhead">
        <span class="game-head__ico" data-reveal>${I('shield', 'i--lg')}</span>
        <div><h1>Admin</h1><p>Toute l’économie du casino, compte par compte (données de ce navigateur)</p></div>
        <div class="dhead__act"><button class="btn btn--ghost js-lock" type="button">${I('lock', 'i--sm')}Verrouiller</button></div>
      </div>

      <section class="dkpis">
        ${kpi('Comptes', fmt(users.length), { icon: 'users', count: users.length, sub: `${users.filter((u) => u.last && Date.now() - u.last < 7 * 86400000).length} actifs cette semaine` })}
        ${kpi('En circulation', fmt(circ), { icon: 'coins', count: circ, sub: 'Somme des soldes' })}
        ${kpi('Total misé', fmt(wagered), { icon: 'dices', count: wagered, sub: `${fmt(played)} parties` })}
        ${kpi('Marge du casino', signed(round2(wagered - won)), { icon: 'trending-up', cls: tone(wagered - won), sub: `${fmt(won)} redistribués` })}
        ${kpi('RTP réel global', pct(won, wagered), { icon: 'percent', sub: 'Gains / mises, tous jeux' })}
        ${kpi('Jackpot', fmt(jackpot.get()), { icon: 'crown', sub: jpLast ? `Dernier : ${esc(jpLast.name)} (${fmt(jpLast.amount)})` : `Départ ${fmt(jackpot.SEED)}` })}
      </section>

      <section class="dpanel" data-reveal>
        <header><h2>Joueurs</h2><span>Clique sur une colonne pour trier</span></header>
        <div class="table-wrap js-users"></div>
      </section>

      <div class="dgrid-layout">
        <section class="dpanel" data-reveal>
          <header><h2>Économie par jeu</h2><span>Tous les joueurs</span></header>
          ${gameTable(perGame, { showTheo: true })}
        </section>
        <section class="dpanel" data-reveal>
          <header><h2>Activité</h2><span>Parties par jour, 14 jours</span></header>
          <div class="dchart dchart--bars js-days"></div>
        </section>
        <section class="dpanel dpanel--6" data-reveal>
          <header><h2>DaveCoins distribués hors jeu</h2><b class="num">+${fmt(Object.values(income).reduce((a, v) => a + v, 0))}</b></header>
          <ul class="dlist">${Object.entries(INCOME).map(([k, l]) => `<li><span>${l}</span><b class="num">${fmt(income[k] || 0)}</b></li>`).join('')}</ul>
          <h3 class="dsub">Collection</h3>
          <ul class="dlist">
            <li><span>Cartes en circulation</span><b class="num">${fmt(sum((u) => u.copies))}</b></li>
            <li><span>Valeur totale des inventaires</span><b class="num">${fmt(sum((u) => u.invValue))}</b></li>
          </ul>
        </section>
        <section class="dpanel dpanel--6" data-reveal>
          <header><h2>Codes promo</h2><span>${Object.keys(PROMO_CODES).length} codes actifs</span></header>
          <ul class="dlist">${codeUse.map((x) => `<li><span>${I('ticket', 'i--sm')}${x.c.toUpperCase()}<small class="muted"> · ${fmt(PROMO_CODES[x.c])} chacun</small></span><b class="num">${x.n} / ${users.length} · ${fmt(x.n * PROMO_CODES[x.c])}</b></li>`).join('')}</ul>
          <h3 class="dsub">Jackpot</h3>
          <ul class="dlist">
            <li><span>Cagnotte actuelle</span><b class="num js-jp">${fmt(jackpot.get())}</b></li>
            <li><span>Valeur de départ</span><b class="num">${fmt(jackpot.SEED)}</b></li>
            <li><span>Dernier gagnant</span><b>${jpLast ? `${esc(jpLast.name)} · ${fmt(jpLast.amount)} · ${ago(jpLast.t)}` : '—'}</b></li>
          </ul>
        </section>
      </div>`;

    const usersBox = view.querySelector('.js-users');
    const COLS = [['name', 'Joueur'], ['balance', 'Solde'], ['played', 'Parties'], ['wagered', 'Misé'], ['net', 'Bilan'], ['rtp', 'RTP'], ['unique', 'Cartes'], ['invValue', 'Inventaire'], ['last', 'Activité']];
    const valOf = (u, k) => (k === 'played' ? u.s.played : k === 'wagered' ? u.s.wagered : k === 'rtp' ? (u.s.wagered ? u.s.won / u.s.wagered : -1) : u[k] == null ? -1 : u[k]);
    const paintUsers = () => {
      if (!users.length) { usersBox.innerHTML = `<div class="empty">${I('users', 'i--lg')}<strong>Aucun compte</strong></div>`; return; }
      const list = users.slice().sort((a, b) => { const x = valOf(a, sortKey), y = valOf(b, sortKey); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sortDir; });
      usersBox.innerHTML = `<table class="history dtable dusers"><thead><tr>${COLS.map(([k, l]) => `<th class="${k === 'name' ? '' : 'num'} sortable ${k === sortKey ? 'on' : ''}" data-k="${k}">${l}${k === sortKey ? (sortDir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}<th class="num">Créditer</th></tr></thead>
        <tbody>${list.map((u) => `<tr data-u="${esc(u.name)}">
          <td><span class="g"><span class="avatar">${esc(u.name.charAt(0).toUpperCase())}</span>${esc(u.name)}${u.name === auth.current() ? ' <small class="muted">(toi)</small>' : ''}</span></td>
          <td class="num js-ubal">${fmt(u.balance)}</td><td class="num">${fmt(u.s.played)}</td><td class="num">${fmt(u.s.wagered)}</td>
          <td class="num ${tone(u.net)}">${signed(u.net)}</td><td class="num">${pct(u.s.won, u.s.wagered)}</td>
          <td class="num">${u.unique} <small class="muted">(${u.copies})</small></td><td class="num">${fmt(u.invValue)}</td><td class="num muted">${ago(u.last)}</td>
          <td class="num"><form class="dgive"><input type="number" step="1" placeholder="±" aria-label="Montant à créditer à ${esc(u.name)}"><button class="btn btn--ghost" type="submit">OK</button></form></td>
        </tr>`).join('')}</tbody></table>`;
    };
    paintUsers();
    usersBox.addEventListener('click', (e) => {
      const th = e.target.closest('th.sortable');
      if (!th) return;
      sortDir = th.dataset.k === sortKey ? -sortDir : th.dataset.k === 'name' ? 1 : -1;
      sortKey = th.dataset.k;
      DP.sound.play('click');
      paintUsers();
    });
    // créditer / débiter un joueur
    usersBox.addEventListener('submit', (e) => {
      e.preventDefault();
      const tr = e.target.closest('tr'), u = users.find((x) => x.name === tr.dataset.u);
      const amount = round2(parseFloat(e.target.querySelector('input').value));
      if (!u || !amount) return;
      u.balance = Math.max(0, round2(u.balance + amount));
      if (u.name === auth.current()) wallet.set(u.balance);
      else store.set('davecoin_' + u.name, String(u.balance));
      DP.sound.play(amount > 0 ? 'win' : 'click');
      ui.toast(`${esc(u.name)} : ${signed(amount)} DaveCoins`, amount > 0 ? 'win' : '');
      paintUsers();
    });
    view.querySelector('.js-lock').addEventListener('click', () => { try { sessionStorage.removeItem('dp_admin'); } catch { /* ignore */ } ctx.rerender(); });

    const offDays = dayBars(view.querySelector('.js-days'), days, { mode: 'count' });
    const jpEls = view.querySelectorAll('.js-jp');
    const offJp = on('jackpot', (v) => jpEls.forEach((el) => (el.textContent = fmt(v))));
    M.reveal(view, '[data-reveal]');
    countUps(view);
    return () => { offDays(); offJp(); };
  }

  window.DP_DASH = { player, admin, ADMIN_CODE };
})();
