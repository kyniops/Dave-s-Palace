/* Dashboards : celui du joueur (#/dashboard) et celui de l'admin (#/admin).
 * Tout est lu dans le localStorage du navigateur : chaque compte créé ici apparaît côté admin.
 */
(() => {
  const { auth, wallet, bonus, promo, jackpot, stats, store, ui, games, cards, inventory, fmt, fmtMult, esc, round2, dayKey, PROMO_CODES, on } = DP;
  const I = ui.icon;
  const M = window.DP_MOTION;
  /* Accès admin : réservé au compte « dave » (vérifié par la connexion), puis code d'accès.
   * Le code n'est pas écrit dans le site : on compare seulement son empreinte SHA-256. */
  const ADMIN_USER = 'dave';
  const ADMIN_HASH = '4a4d7abd77fa45064f844eed0925b248bb1aa18f9aa312a8787956d307f7fee9';
  const isAdmin = () => {
    const u = auth.current();
    if (!u || u.toLowerCase() !== ADMIN_USER) return false;
    // en ligne, il faut une vraie session Supabase sur ce compte
    return !(DP.cloud && DP.cloud.online) || !!DP.cloud.uid();
  };
  const sha256 = async (txt) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  const INCOME = { daily: 'Roue quotidienne', rescue: 'Dépannage', promo: 'Codes promo', album: 'Albums complétés', sale: 'Ventes de cartes', level: 'Niveaux', mission: 'Missions', achievement: 'Succès', rakeback: 'Rakeback' };

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
        <a href="#/profil" data-reveal>${DP.profile ? DP.profile.avatarHtml(name, 'avatar avatar--lg') : `<span class="avatar avatar--lg">${esc(name.charAt(0).toUpperCase())}</span>`}</a>
        <div><h1>${esc(name)}</h1><p>Ton dashboard · ${s.since ? 'suivi depuis le ' + new Date(s.since).toLocaleDateString('fr-FR') : 'toutes tes infos en un coup d’œil'}</p></div>
        ${(() => { const sm = DP.progress && DP.progress.summary(); return sm ? `<a class="drank" href="#/progression" style="--rc:${sm.rank.c}">${DP.progress.badge(sm.level, 46)}<span><b>Rang ${sm.rank.name} · niveau ${sm.level}</b><i><em style="width:${(sm.pct * 100).toFixed(1)}%"></em></i><small>Missions ${sm.missionsDone}/3 · Succès ${sm.achDone}/${sm.achTotal}${sm.claimable ? ` · <b class="pos">${sm.claimable} à récupérer</b>` : ''}</small></span></a>` : ''; })()}
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
  const adminOpen = () => { try { return isAdmin() && sessionStorage.getItem('dp_admin') === auth.current(); } catch { return false; } };

  function lockScreen(view, done) {
    view.innerHTML = `
      <div class="page-head" data-reveal><span class="game-head__ico">${I('shield', 'i--lg')}</span><div><h1>Admin</h1><p>Zone réservée. Entre le code d’accès.</p></div></div>
      <form class="code-box" data-reveal novalidate>
        <label class="field"><span>Code d’accès</span><input name="code" type="password" autocomplete="off" maxlength="40"></label>
        <button class="btn btn--primary btn--lg" type="submit">${I('lock', 'i--sm')}Déverrouiller</button>
        <p class="code-box__msg" role="status"></p>
      </form>`;
    const form = view.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      let good = false;
      try { good = isAdmin() && (await sha256(form.code.value.trim())) === ADMIN_HASH; } catch { good = false; }
      if (!good) {
        form.querySelector('.code-box__msg').textContent = 'Code incorrect.';
        form.querySelector('.code-box__msg').className = 'code-box__msg neg';
        DP.sound.play('error');
        form.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 260 });
        return;
      }
      try { sessionStorage.setItem('dp_admin', auth.current()); } catch { /* ignore */ }
      DP.sound.play('win');
      done();
    });
    M.reveal(view, '[data-reveal]');
    form.code.focus();
    return () => {};
  }

  const SAVE_KEYS = ['davecoin_', 'dp_stats_', 'dp_inv_', 'dp_prog_', 'dp_profile_', 'dp_codes_', 'dp_bonus_', 'dp_rescue_'];

  /** Lit toutes les données de chaque compte (du serveur en ligne, sinon du navigateur). */
  function collect(players) {
    const parse = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
    const local = (n) => Object.fromEntries(SAVE_KEYS.map((k) => [k, store.get(k + n)]).filter(([, v]) => v !== null));
    // son propre compte : le cache local est la version la plus récente
    const src = players
      ? players.map((p) => { const raw = p.name === auth.current() ? local(p.name) : (p.data || {}); return { n: p.name, id: p.id, raw, get: (k) => raw[k] ?? null }; })
      : auth.users().map((u) => { const raw = local(u.prenom); return { n: u.prenom, raw, get: (k) => raw[k] ?? null }; });
    return src.map(({ n, id, raw, get }) => {
      const s = Object.assign({ played: 0, wagered: 0, won: 0, wins: 0, biggestWin: 0, biggestMult: 0, perGame: {}, games: {}, days: {}, curve: [], income: {}, history: [] }, parse(get('dp_stats_'), {}));
      const invRaw = Object.assign({ cards: {} }, parse(get('dp_inv_'), {})).cards;
      const inv = Object.entries(invRaw).filter(([id]) => cards.byId[id]);
      const bal = parseFloat(get('davecoin_'));
      return {
        name: n, id, raw, s,
        banned: !!(players && (players.find((p) => p.id === id) || {}).banned),
        badName: !!auth.usernameProblem(n),
        balance: isNaN(bal) ? 0 : round2(bal),
        net: round2(s.won - s.wagered),
        copies: inv.reduce((a, [, c]) => a + c, 0),
        unique: inv.length,
        invValue: round2(inv.reduce((a, [id, c]) => a + cards.byId[id].value * c, 0)),
        codes: parse(get('dp_codes_'), []),
        last: s.history[0] ? s.history[0].t : s.curve.length ? s.curve[s.curve.length - 1].t : null
      };
    });
  }

  const adminErr = (e) => (/refus|denied|permission/i.test((e && e.message) || '') ? 'Accès refusé par le serveur : ce compte n’est pas admin.' : /function|does not exist|schema cache/i.test((e && e.message) || '') ? 'Le script supabase/admin.sql n’a pas encore été exécuté dans Supabase.' : 'Erreur : ' + ((e && e.message) || e));

  /** Applique une modification à la sauvegarde d'un joueur (en ligne via le serveur, sinon dans ce navigateur). */
  async function applyTo(u, mutate) {
    const parse = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
    const o = {
      bal: parseFloat(u.raw.davecoin_), reset: false,
      prog: Object.assign({ xp: 0, ach: {}, free: {} }, parse(u.raw.dp_prog_, {})),
      inv: Object.assign({ cards: {}, shiny: {}, claimed: {} }, parse(u.raw.dp_inv_, {}))
    };
    if (isNaN(o.bal)) o.bal = 1000;
    o.prog.free = o.prog.free || {};
    mutate(o);
    let data = { ...u.raw, davecoin_: String(round2(Math.max(0, o.bal))), dp_prog_: JSON.stringify(o.prog), dp_inv_: JSON.stringify(o.inv) };
    if (o.reset) data = { davecoin_: '1000' };
    const level = DP.progress.levelInfo((parse(data.dp_prog_, {}).xp) || 0).level;
    const online = DP.cloud && DP.cloud.online;
    const engineOn = DP.engine && DP.engine.on;
    if (!engineOn && (u.name === auth.current() || !online)) {
      SAVE_KEYS.forEach((k) => store.remove(k + u.name));
      Object.entries(data).forEach(([k, v]) => store.set(k + u.name, v));
      if (u.name === auth.current()) { DP.emit('balance', wallet.get()); DP.emit('inventory'); DP.emit('progress'); if (online) await DP.cloud.pushNow(); }
    } else {
      await DP.cloud.admin.setSave(u.id, data, round2(Math.max(0, +data.davecoin_ || 0)), level);
    }
    u.raw = data;
  }

  /** Signaux d'alerte : banni, pseudo interdit, résultats statistiquement improbables (triche probable). */
  function suspicion(u) {
    const s = u.s, why = [];
    if (s.played >= 30 && s.wagered > 0 && s.won / s.wagered > 1.6) why.push(`RTP ${Math.round((s.won / s.wagered) * 100)} % sur ${s.played} parties`);
    if (u.balance > 50000 && s.wagered < u.balance * 0.2) why.push('solde élevé avec très peu de mises');
    if (s.played > 0 && s.wins / s.played > 0.85 && s.played >= 30) why.push(`${Math.round((s.wins / s.played) * 100)} % de victoires`);
    return why;
  }
  const flags = (u) => {
    const sus = suspicion(u);
    return `${u.banned ? '<span class="dbadge bad">Banni</span>' : ''}${u.badName ? '<span class="dbadge warn">Pseudo interdit</span>' : ''}${sus.length ? `<span class="dbadge warn" title="${esc(sus.join(' · '))}">Suspect</span>` : ''}`;
  };

  function manage(u, done) {
    const online = DP.cloud && DP.cloud.online;
    const parse = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
    const lvl = DP.progress.levelInfo((parse(u.raw.dp_prog_, {}).xp) || 0).level;
    const cardOpts = (DP.cases ? DP.cases.list : []).map((c) => `<optgroup label="${esc(c.name)}">${Object.values(cards.byId).filter((x) => x.set === c.id).sort((a, b) => a.value - b.value).map((x) => `<option value="${x.id}">${esc(x.name)} · ${x.rarity.label} · ${fmt(x.value)}</option>`).join('')}</optgroup>`).join('');
    const caseOpts = (DP.cases ? DP.cases.list : []).map((c) => `<option value="${c.id}">${esc(c.name)} (${fmt(c.price)})</option>`).join('');
    const modal = ui.el(`<div class="modal" role="dialog" aria-modal="true"><div class="modal__card dmanage">
      <button class="modal__close icon-btn" type="button" aria-label="Fermer">${I('x')}</button>
      <h3>${I('shield')}Gérer ${esc(u.name)}</h3>
      <p class="muted">Solde actuel <b class="num">${fmt(u.balance)}</b> · niveau <b class="num">${lvl}</b> · ${u.unique} cartes différentes</p>
      ${suspicion(u).length ? `<p class="dmanage__warn">${I('triangle-alert', 'i--sm')}Suspect : ${esc(suspicion(u).join(' · '))}</p>` : ''}
      <form class="dmanage__row" data-a="coins"><label>DaveCoins</label><input name="v" type="number" step="1" min="0" placeholder="Montant" required>
        <button class="btn btn--primary btn--sm" name="op" value="add" type="submit">Ajouter</button><button class="btn btn--ghost btn--sm" name="op" value="sub" type="submit">Retirer</button><button class="btn btn--ghost btn--sm" name="op" value="set" type="submit">Fixer à</button></form>
      <form class="dmanage__row" data-a="level"><label>Niveau</label><input name="v" type="number" min="1" max="${DP.progress.MAX_LEVEL}" step="1" value="${lvl}" required>
        <button class="btn btn--primary btn--sm" type="submit">Appliquer</button></form>
      <form class="dmanage__row" data-a="case"><label>Caisse offerte</label><select name="id">${caseOpts}</select><input name="n" type="number" min="1" max="50" value="1">
        <button class="btn btn--primary btn--sm" type="submit">Offrir</button></form>
      <form class="dmanage__row" data-a="card"><label>Carte</label><select name="id">${cardOpts}</select><input name="n" type="number" min="1" max="50" value="1">
        <label class="dmanage__chk"><input name="shiny" type="checkbox">Brillante</label>
        <button class="btn btn--primary btn--sm" name="op" value="give" type="submit">Donner</button><button class="btn btn--ghost btn--sm" name="op" value="take" type="submit">Retirer</button></form>
      ${online ? `<form class="dmanage__row" data-a="rename"><label>Pseudo</label><input name="v" maxlength="20" value="${esc(u.name)}" required style="width:180px">
        <button class="btn btn--primary btn--sm" type="submit">Renommer</button>${u.badName ? '<span class="dbadge bad">Pseudo interdit</span>' : ''}</form>
      <form class="dmanage__row" data-a="ban"><label>${u.banned ? 'Compte banni' : 'Bannir'}</label>
        ${u.banned ? `<button class="btn btn--primary btn--sm" type="submit">Débannir</button>` : `<input name="why" maxlength="80" placeholder="Raison (optionnel)" style="width:220px"><button class="btn btn--ghost btn--sm btn--danger" type="submit">Bannir</button>`}</form>` : ''}
      <div class="dmanage__danger"><button class="btn btn--ghost btn--sm js-reset" type="button">${I('trash-2', 'i--sm')}Réinitialiser le compte</button><span class="muted">Remet à zéro : 1 000 DaveCoins, aucune carte, niveau 1.</span></div>
      <p class="dmanage__msg" role="status"></p>
    </div></div>`);
    document.body.appendChild(modal);
    const msg = modal.querySelector('.dmanage__msg');
    const close = () => { modal.remove(); done(); };
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('.modal__close')) close(); });
    const run = async (mutate, text) => {
      modal.querySelectorAll('button').forEach((b) => (b.disabled = true));
      try { await applyTo(u, mutate); msg.className = 'dmanage__msg pos'; msg.textContent = text; DP.sound.play('win'); ui.toast(`${u.name} : ${text}`, 'win'); setTimeout(close, 700); }
      catch (err) { msg.className = 'dmanage__msg neg'; msg.textContent = adminErr(err); DP.sound.play('error'); modal.querySelectorAll('button').forEach((b) => (b.disabled = false)); }
    };
    const runServer = async (fn, text) => {
      modal.querySelectorAll('button').forEach((b) => (b.disabled = true));
      try { await fn(); msg.className = 'dmanage__msg pos'; msg.textContent = text; DP.sound.play('win'); ui.toast(`${u.name} : ${text}`, 'win'); setTimeout(close, 700); }
      catch (err) { msg.className = 'dmanage__msg neg'; msg.textContent = /interdit|invalide|pris|Pseudo/i.test(err.message || '') ? err.message : adminErr(err); DP.sound.play('error'); modal.querySelectorAll('button').forEach((b) => (b.disabled = false)); }
    };
    modal.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target, a = f.dataset.a, op = e.submitter ? e.submitter.value : '';
      if (a === 'rename') { const v = f.v.value.trim(); if (v && v !== u.name) runServer(() => DP.cloud.admin.rename(u.id, v), `renommé en ${v}`); return; }
      if (a === 'ban') {
        const b = f.querySelector('button');
        if (!u.banned && !ui.confirmClick(b, 'Confirmer le bannissement')) return;
        runServer(() => DP.cloud.admin.ban(u.id, !u.banned, f.why ? f.why.value.trim() : ''), u.banned ? 'débanni' : 'banni');
        return;
      }
      if (a === 'coins') {
        const v = round2(Math.abs(parseFloat(f.v.value)));
        if (!(v >= 0)) return;
        run((o) => { o.bal = op === 'set' ? v : op === 'sub' ? o.bal - v : o.bal + v; }, op === 'set' ? `solde fixé à ${fmt(v)}` : `${op === 'sub' ? '-' : '+'}${fmt(v)} DaveCoins`);
      } else if (a === 'level') {
        const L = Math.max(1, Math.min(DP.progress.MAX_LEVEL, Math.round(+f.v.value)));
        run((o) => { o.prog.xp = DP.progress.xpFor(L); o.prog.level = L; o.prog.top = Math.max(o.prog.top || 1, L); }, `niveau ${L}`);
      } else if (a === 'case') {
        const n = Math.max(1, Math.round(+f.n.value));
        run((o) => { o.prog.free[f.id.value] = (o.prog.free[f.id.value] || 0) + n; }, `${n} × ${DP.progress.caseName(f.id.value)} offerte${n > 1 ? 's' : ''}`);
      } else if (a === 'card') {
        const n = Math.max(1, Math.round(+f.n.value)), id = f.id.value, sh = f.shiny.checked, card = cards.byId[id];
        run((o) => {
          const bag = sh ? o.inv.shiny : o.inv.cards;
          bag[id] = Math.max(0, (bag[id] || 0) + (op === 'take' ? -n : n));
          if (!bag[id]) delete bag[id];
        }, `${op === 'take' ? '-' : '+'}${n} ${card.name}${sh ? ' brillante' : ''}`);
      }
    });
    let confirmReset = false;
    modal.querySelector('.js-reset').addEventListener('click', (e) => {
      if (!confirmReset) { confirmReset = true; e.currentTarget.innerHTML = `${I('trash-2', 'i--sm')}Confirmer la réinitialisation`; e.currentTarget.classList.add('btn--danger'); return; }
      run((o) => { o.reset = true; }, 'compte réinitialisé');
    });
  }

  function admin(view, ctx) {
    const u0 = auth.current();
    if (!isAdmin() && u0 && u0.toLowerCase() === ADMIN_USER && DP.cloud && DP.cloud.online && !DP.cloud.uid()) {
      // session en ligne pas encore restaurée (rechargement de la page) : on attend au lieu de renvoyer au lobby
      view.innerHTML = `<div class="empty">${I('shield', 'i--lg')}<strong>Connexion…</strong></div>`;
      let alive = true;
      Promise.resolve(DP.cloud.ready).then(() => { if (alive && view.isConnected && location.hash === '#/admin') ctx.rerender(); });
      return () => { alive = false; };
    }
    if (!isAdmin()) { location.replace('#/lobby'); return () => {}; }
    if (!adminOpen()) return lockScreen(view, () => ctx.rerender());
    const online = DP.cloud && DP.cloud.online;
    if (online && !ctx.players) {
      view.innerHTML = `<div class="empty">${I('users', 'i--lg')}<strong>Chargement des joueurs…</strong></div>`;
      let alive = true;
      DP.cloud.players({ withData: true }).then((players) => { if (alive && view.isConnected) admin(view, { ...ctx, players }); }).catch(() => {});
      return () => { alive = false; };
    }
    const users = collect(online ? ctx.players : null);
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
        <div><h1>Admin</h1><p>Toute l’économie du casino, compte par compte (${DP.cloud && DP.cloud.online ? 'tous les joueurs en ligne' : 'données de ce navigateur'})</p></div>
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
          <form class="dadmin-row js-jpset"><input name="amount" type="number" min="0" step="1" placeholder="Nouveau montant"><button class="btn btn--ghost btn--sm" type="submit">Fixer le jackpot</button><button class="btn btn--ghost btn--sm js-clearfeed" type="button">Vider le fil des gains</button></form>
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
      usersBox.innerHTML = `<table class="history dtable dusers"><thead><tr>${COLS.map(([k, l]) => `<th class="${k === 'name' ? '' : 'num'} sortable ${k === sortKey ? 'on' : ''}" data-k="${k}">${l}${k === sortKey ? (sortDir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}<th class="num">Actions</th></tr></thead>
        <tbody>${list.map((u) => `<tr data-u="${esc(u.name)}">
          <td>${DP.profile.link(u.name, `<span class="g">${DP.profile.avatarHtml(u.name)}${esc(u.name)}${u.name === auth.current() ? ' <small class="muted">(toi)</small>' : ''}</span>`)}${flags(u)}</td>
          <td class="num js-ubal">${fmt(u.balance)}</td><td class="num">${fmt(u.s.played)}</td><td class="num">${fmt(u.s.wagered)}</td>
          <td class="num ${tone(u.net)}">${signed(u.net)}</td><td class="num">${pct(u.s.won, u.s.wagered)}</td>
          <td class="num">${u.unique} <small class="muted">(${u.copies})</small></td><td class="num">${fmt(u.invValue)}</td><td class="num muted">${ago(u.last)}</td>
          <td class="num"><button class="btn btn--ghost btn--sm js-manage" type="button">${I('shield', 'i--sm')}Gérer</button></td>
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
    // gérer un joueur : solde, niveau, caisses offertes, cartes, réinitialisation
    usersBox.addEventListener('click', (e) => {
      const b = e.target.closest('.js-manage');
      if (!b) return;
      const u = users.find((x) => x.name === b.closest('tr').dataset.u);
      if (u) manage(u, refresh);
    });
    view.querySelector('.js-jpset').addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = round2(parseFloat(e.target.amount.value));
      if (!(v >= 0)) return;
      try {
        if (online) await DP.cloud.admin.setJackpot(v);
        else { store.set('dp_jackpot', String(v)); DP.emit('jackpot', v); }
        ui.toast(`Jackpot fixé à ${fmt(v)}`, 'win'); DP.sound.play('win');
      } catch (err) { ui.toast(adminErr(err), 'error'); }
    });
    view.querySelector('.js-clearfeed').addEventListener('click', async () => {
      if (!online) return ui.toast('Le fil des gains n’existe qu’en ligne.', 'error');
      try { await DP.cloud.admin.clearFeed(); ui.toast('Fil des gains vidé', 'win'); } catch (err) { ui.toast(adminErr(err), 'error'); }
    });
    view.querySelector('.js-lock').addEventListener('click', () => { try { sessionStorage.removeItem('dp_admin'); } catch { /* ignore */ } ctx.rerender(); });

    const offDays = dayBars(view.querySelector('.js-days'), days, { mode: 'count' });
    const jpEls = view.querySelectorAll('.js-jp');
    const offJp = on('jackpot', (v) => jpEls.forEach((el) => (el.textContent = fmt(v))));
    // pas d'animation d'entrée quand la page se met à jour après une action
    if (!ctx.quiet) { M.reveal(view, '[data-reveal]'); countUps(view); }
    let gone = false, inner = null;
    async function refresh() {
      if (gone) return;
      let players;
      if (online) { try { players = await DP.cloud.players({ withData: true }); } catch { return; } }
      if (gone || !view.isConnected) return;
      const y = window.scrollY;
      cleanup();
      gone = false;
      inner = admin(view, { ...ctx, players, quiet: true });
      window.scrollTo(0, y);
    }
    function cleanup() { gone = true; offDays(); offJp(); }
    return () => { if (inner) inner(); else cleanup(); };
  }

  window.DP_DASH = { player, admin, isAdmin };
})();
