/* DavePoker — Texas Hold'em No Limit entre joueurs (en ligne), tables à niveaux avec cave plafonnée.
 * Seul à une table, on joue contre des bots ; dès qu'un 2e joueur s'assoit, les bots partent.
 * Tout est décidé par le serveur (supabase/poker.sql) : la page affiche l'état reçu et envoie les actions.
 *
 * Affichage : la table est construite une seule fois puis mise à jour pièce par pièce (places, cartes, mises, pot),
 * ce qui permet les animations : distribution des cartes, jetons qui glissent vers le pot puis vers le gagnant,
 * chrono en anneau autour de l'avatar, tapis qui défilent.
 */
(function () {
  'use strict';
  const { IMG, fmt, sound, ui, esc } = DP;
  const I = ui.icon;
  const PE = window.DP_PKEVAL;
    const BETTING = ['preflop', 'flop', 'turn', 'river'];
  // places (en % de la scène), la tienne en bas ; ordre = sens des aiguilles d'une montre
  const LAYOUT = {
    wide: {
      seat: [[50, 87], [7, 71], [7, 25], [50, 14], [93, 25], [93, 71]],
      bet: [[50, 67], [23, 66], [23, 34], [37, 31], [77, 34], [77, 66]],
      side: ['me', 'l', 'l', 't', 'r', 'r'], pot: [50, 37], dealer: [50, 4]
    },
    tall: {
      seat: [[50, 89], [12, 69], [12, 29], [50, 10], [88, 29], [88, 69]],
      bet: [[50, 75], [31, 61], [31, 39], [31, 22], [69, 39], [69, 61]],
      side: ['me', 'l', 'l', 't', 'r', 'r'], pot: [50, 38], dealer: [50, 2]
    }
  };
  const red = (c) => PE.suit(c) === 1 || PE.suit(c) === 2;
  const cardHtml = (c, cls = '') => c == null
    ? `<span class="pkk back ${cls}"><span class="pkk__crown">${I('crown')}</span></span>`
    : `<span class="pkk ${red(c) ? 'red' : ''} ${cls}"><b>${PE.RANKS[PE.rank(c)]}</b><i>${PE.SUITS[PE.suit(c)]}</i><em>${PE.SUITS[PE.suit(c)]}</em></span>`;
  const chips = (n = 3) => `<span class="pkchips">${Array.from({ length: n }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</span>`;
  // bulles de lumière du fond (positions, tailles et vitesses au hasard)
  const bokeh = (n) => Array.from({ length: n }, () => `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--y:${(Math.random() * 100).toFixed(1)}%;--s:${(14 + Math.random() * 70).toFixed(0)}px;--t:${(7 + Math.random() * 10).toFixed(1)}s;--o:${(0.25 + Math.random() * 0.55).toFixed(2)};--dx:${(Math.random() * 80 - 40).toFixed(0)}px;--dy:${(-30 - Math.random() * 70).toFixed(0)}px"></i>`).join('');
  // actions affichées au-dessus des joueurs, en anglais (le serveur les écrit en français)
  const ACT_EN = [[/^Couché/, 'Fold'], [/^Parole/, 'Check'], [/^Suit/, 'Call'], [/^Relance/, 'Raise'], [/^Mise/, 'Bet'], [/^Tapis/, 'All-in'], [/^Petite blinde/, 'SB'], [/^Grosse blinde/, 'BB'], [/^Quitte/, 'Left']];
  const actEN = (t) => { const f = ACT_EN.find(([re]) => re.test(t)); return f ? f[1] : t; };
  const online = () => !!(DP.engine && DP.engine.on && DP.cloud && DP.cloud.sb);
  const rpc = (fn, p, o) => DP.engine.call(fn, p, o);

  DP.games.register({
    id: 'poker',
    name: 'DavePoker',
    icon: 'spade',
    tagline: 'Texas Hold’em entre joueurs : crée ta table ou rejoins tes potes',
    rtp: '100 %',
    hue: 145,
    art: `<div class="art-poker"><span class="pkk red" style="--k:-1"><b>A</b><i>♥</i><em>♥</em></span><span class="pkk" style="--k:1"><b>A</b><i>♠</i><em>♠</em></span></div>`,
    rules: `<p><strong>Texas Hold’em No Limit</strong>, de 2 à 6 joueurs par table. Tu reçois 2 cartes, 5 cartes communes arrivent au centre (flop, turn, river) : la meilleure main de 5 cartes gagne le pot.</p>
      <ul><li><strong>Crée ta table</strong> (nom, niveau, de 2 à 6 places, publique ou privée) ou <strong>rejoins</strong> une table du salon. Une table privée se rejoint avec son <strong>code à 4 lettres</strong> : donne-le à tes potes.</li>
      <li><strong>4 niveaux</strong> : Petite (1/2), Moyenne (5/10), Grosse (25/50), High roller (100/200). Tu t’assois avec une <strong>cave</strong> entre 40 et 100 grosses blindes : un gros solde ne donne aucun avantage à la table.</li>
      <li>La partie commence dès que <strong>2 joueurs</strong> sont assis. Une table vide disparaît au bout de 2 minutes.</li>
      <li>Tu peux te <strong>recaver</strong> entre deux mains, jusqu’au maximum de la table.</li>
      <li>Si tu pars et reviens <strong>dans l’heure</strong> à une table du même niveau, tu dois revenir avec au moins le tapis avec lequel tu es parti.</li>
      <li><strong>20 secondes</strong> pour jouer : sinon parole (ou couché). Deux fois de suite et tu quittes la table à la fin de la main. Si tu fermes la page plus d’une minute, tu quittes aussi la table (tes jetons reviennent sur ton solde).</li>
      <li>Raccourcis : <strong>F</strong> se coucher, <strong>C</strong> suivre / parole, <strong>R</strong> relancer.</li>
      <li>Aucune commission : tout ce qui est misé revient aux joueurs.</li></ul>
      <p class="muted">Ordre des mains : quinte flush, carré, full, couleur, quinte, brelan, double paire, paire, hauteur.</p>`,
    mount(root) {
      root.innerHTML = '<div class="pk"></div>';
      const box = root.firstElementChild;
      let alive = true, timer = 0, soon = 0, channel = null, tableId = null, st = null, prev = null, lastVer = -1, offset = 0, busy = false, again = false;
      let raiseOpen = false, raiseTo = 0, leaveArmed = 0, myTurnKey = '', turnKey = '', T = null; // T = éléments de la table

      const seated = (on) => document.body.classList.toggle('pk-seated', on);
      if (!online()) {
        box.innerHTML = `<div class="empty">${I('spade', 'i--lg')}<strong>Le poker se joue en ligne</strong>Connecte-toi avec ton compte en ligne pour t’asseoir à une table avec les autres joueurs.</div>`;
        return () => {};
      }

      /* ================= Salon : tables ouvertes + création ================= */
      let lobbyTimer = 0, lobbyData = null;
      const LV_ORDER = ['petite', 'moyenne', 'grosse', 'highroller'];
      const lvClass = (id) => 'lv' + Math.max(0, LV_ORDER.indexOf(id));
      async function lobby() {
        stopTable(); seated(false);
        clearInterval(lobbyTimer);
        box.innerHTML = `<div class="empty">${I('spade', 'i--lg')}<strong>Chargement des tables…</strong></div>`;
        const ok = await loadLobby(true);
        if (!ok || !alive || tableId) return;
        // la liste se met à jour toute seule tant qu'on est dans le salon
        lobbyTimer = setInterval(() => { if (!tableId && alive && !document.querySelector('.modal')) loadLobby(false); }, 6000);
      }
      async function loadLobby(first) {
        const L = await rpc('poker_lobby', {}, { silent: true });
        if (!alive || tableId) return false;
        if (!L) { if (first) box.innerHTML = `<div class="empty">${I('spade', 'i--lg')}<strong>Le poker n’est pas encore installé</strong>Le script supabase/poker.sql doit être lancé sur le serveur.</div>`; return false; }
        if (L.mine) { clearInterval(lobbyTimer); openTable(L.mine); return false; }
        lobbyData = L;
        paintLobby(first);
        return true;
      }
      function paintLobby(first) {
        const L = lobbyData, bal = DP.wallet.get();
        const tables = L.tables || [];
        const card = (t) => {
          const back = L.leaves && L.leaves[t.level] > t.min ? L.leaves[t.level] : 0;
          const full = t.players.length >= t.seats;
          const can = !full && bal >= Math.max(t.min, back);
          return `<article class="pkl__t ${lvClass(t.level)}" data-t="${t.id}">
            <div class="pkl__felt"><span class="pkl__bl num">${fmt(t.sb)}<small>/</small>${fmt(t.bb)}</span><span class="pkl__name">${esc((L.levels[t.level] || {}).name || '')}</span>
              ${t.private ? `<span class="pkl__lock" title="Table privée">${I('lock', 'i--sm')}</span>` : ''}
              <div class="pkl__seats" data-n="${t.seats}">${Array.from({ length: t.seats }, (_, k) => (t.players[k] ? `<i class="on" title="${esc(t.players[k].name)}"></i>` : '<i></i>')).join('')}</div></div>
            <div class="pkl__title"><b>${esc(t.name)}</b><small>par ${esc(t.owner || '?')}${t.playing ? ' · <span class="pkl__live">en jeu</span>' : ''}</small></div>
            <ul class="pkl__info"><li><span>Cave</span><b class="num">${fmt(t.min)} – ${fmt(t.max)}</b></li>
              <li><span>Joueurs</span><b class="num">${t.players.length} / ${t.seats}</b></li></ul>
            <div class="pkl__who">${t.players.map((p) => DP.profile.avatarHtml(p.name)).join('')}</div>
            ${back ? `<p class="pkl__warn">${I('triangle-alert', 'i--sm')}Parti il y a moins d’une heure : cave minimum ${fmt(back)}</p>` : ''}
            <button type="button" class="pkb ${can ? 'pkb--go' : 'pkb--off'} js-sit" data-t="${t.id}" ${can ? '' : 'disabled'}>${full ? 'Table pleine' : can ? (t.private ? 'Rejoindre avec le code' : 'Rejoindre') : 'Solde insuffisant'}</button>
          </article>`;
        };
        box.innerHTML = `<div class="pkl">
          <div class="pkx-bg" aria-hidden="true">${bokeh(14)}</div>
          <header class="pkl__head"><div><span class="pkl__eyebrow">${I('spade', 'i--sm')}Salle de poker</span><h2>Tables ouvertes</h2></div>
            <div class="pkl__acts"><p>Ton solde <b class="num">${fmt(bal)}</b></p>
              <button type="button" class="pkb pkb--sm pkb--off js-code">${I('lock', 'i--sm')}J’ai un code</button>
              <button type="button" class="pkb pkb--go js-create">${I('plus', 'i--sm')}Créer une table</button></div></header>
          ${tables.length ? `<div class="pkl__grid">${tables.map(card).join('')}</div>`
            : `<div class="pkl__empty">${I('spade', 'i--lg')}<strong>Aucune table ouverte</strong><span>Crée la première et invite tes potes : la partie commence dès que vous êtes deux.</span>
                <button type="button" class="pkb pkb--go js-create">${I('plus', 'i--sm')}Créer une table</button></div>`}
        </div>`;
        box.querySelectorAll('.js-sit').forEach((b) => b.addEventListener('click', () => { const t = tables.find((x) => x.id === b.dataset.t); sitDialog(t, L.leaves && L.leaves[t.level]); }));
        box.querySelectorAll('.js-create').forEach((b) => b.addEventListener('click', createDialog));
        box.querySelector('.js-code').addEventListener('click', codeDialog);
        if (first) DP_MOTION.reveal(box, '.pkl__head, .pkl__t, .pkl__empty');
      }

      /** Créer une table : nom, niveau, places, privée, cave. */
      function createDialog() {
        const L = lobbyData; if (!L) return;
        const bal = Math.floor(DP.wallet.get());
        const lvls = LV_ORDER.filter((k) => L.levels[k]).map((k) => ({ id: k, ...L.levels[k] }));
        let lv = (lvls.filter((x) => bal >= Math.max(x.min, (L.leaves || {})[x.id] || 0)).pop() || lvls[0]);
        lv = lvls.find((x) => x.id === 'petite' && bal >= x.min) || lv;
        let seats = 6, priv = false, buy = 0;
        const me = DP.auth.current() || 'moi';
        const modal = ui.el(`<div class="modal" role="dialog" aria-modal="true"><div class="modal__card pk-new">
          <button class="modal__close icon-btn" type="button" aria-label="Fermer">${I('x')}</button>
          <h3>${I('plus')}Créer une table</h3>
          <label class="pk-new__f"><span>Nom de la table</span><input class="js-name" maxlength="24" value="${esc(('Table de ' + me).slice(0, 24))}"></label>
          <div class="pk-new__f"><span>Niveau</span><div class="pk-new__lv">${lvls.map((x) => {
            const need = Math.max(x.min, (L.leaves || {})[x.id] || 0);
            return `<button type="button" class="${lvClass(x.id)}" data-lv="${x.id}" ${bal >= need ? '' : 'disabled'}><b class="num">${fmt(x.sb)}/${fmt(x.bb)}</b><span>${esc(x.name)}</span><small class="num">${fmt(x.min)} – ${fmt(x.max)}</small></button>`;
          }).join('')}</div></div>
          <div class="pk-new__row">
            <div class="pk-new__f"><span>Places</span><div class="seg js-seats">${[2, 3, 4, 5, 6].map((n) => `<button type="button" data-n="${n}">${n}</button>`).join('')}</div></div>
            <div class="pk-new__f"><span>Accès</span><div class="seg js-priv"><button type="button" data-p="0">Publique</button><button type="button" data-p="1">${I('lock', 'i--sm')}Privée</button></div></div>
          </div>
          <p class="pk-new__hint js-hint"></p>
          <div class="pk-new__f"><span>Ta cave</span><div class="pk-sit__amt num js-v"></div><input type="range" class="pk-range js-r" step="1"><div class="pk-sit__lim"><span class="js-mn"></span><span class="js-mx"></span></div></div>
          <button type="button" class="pkb pkb--go js-go">Créer et s’asseoir</button></div></div>`);
        document.body.appendChild(modal);
        const r = modal.querySelector('.js-r');
        const paint = () => {
          modal.querySelectorAll('[data-lv]').forEach((b) => b.classList.toggle('on', b.dataset.lv === lv.id));
          modal.querySelectorAll('.js-seats button').forEach((b) => b.classList.toggle('on', +b.dataset.n === seats));
          modal.querySelectorAll('.js-priv button').forEach((b) => b.classList.toggle('on', (b.dataset.p === '1') === priv));
          const back = (L.leaves || {})[lv.id] > lv.min ? L.leaves[lv.id] : 0;
          const mn = Math.max(lv.min, back), mx = Math.min(Math.max(lv.max, back), bal);
          r.min = mn; r.max = Math.max(mn, mx);
          buy = Math.min(Math.max(buy || mx, mn), mx);
          r.value = buy;
          modal.querySelector('.js-v').textContent = fmt(buy);
          modal.querySelector('.js-mn').textContent = fmt(mn); modal.querySelector('.js-mx').textContent = fmt(mx);
          modal.querySelector('.js-hint').innerHTML = priv ? `${I('lock', 'i--sm')}Un code à 4 lettres sera créé : donne-le à tes potes pour qu’ils te rejoignent.` : `${I('users', 'i--sm')}Tout le monde voit la table dans le salon et peut s’asseoir.`;
          modal.querySelector('.js-go').disabled = mx < mn;
        };
        paint();
        r.addEventListener('input', () => { buy = +r.value; modal.querySelector('.js-v').textContent = fmt(buy); });
        modal.addEventListener('click', async (e) => {
          if (e.target === modal || e.target.closest('.modal__close')) { modal.remove(); return; }
          const b = e.target.closest('button');
          if (!b || b.disabled) return;
          if (b.dataset.lv) { lv = lvls.find((x) => x.id === b.dataset.lv); buy = 0; sound.play('click'); paint(); return; }
          if (b.dataset.n) { seats = +b.dataset.n; sound.play('click'); paint(); return; }
          if (b.dataset.p) { priv = b.dataset.p === '1'; sound.play('click'); paint(); return; }
          if (b.classList.contains('js-go')) {
            b.disabled = true;
            const res = await rpc('poker_create', { p_name: modal.querySelector('.js-name').value, p_level: lv.id, p_seats: seats, p_private: priv, p_buyin: buy });
            b.disabled = false;
            if (!res) return;
            modal.remove(); sound.play('chip');
            if (res.state && res.state.code) ui.toast(`Table privée créée · code ${res.state.code}`, 'win', 6000);
            clearInterval(lobbyTimer);
            openTable(res.state.id, res.state);
          }
        });
      }

      /** Rejoindre une table privée avec son code (sans la chercher dans la liste). */
      function codeDialog() {
        const L = lobbyData; if (!L) return;
        const modal = ui.el(`<div class="modal" role="dialog" aria-modal="true"><div class="modal__card pk-sit">
          <button class="modal__close icon-btn" type="button" aria-label="Fermer">${I('x')}</button>
          <h3>${I('lock')}Table privée</h3><p>Entre le code à 4 lettres que ton pote t’a donné.</p>
          <input class="pk-code js-c" maxlength="4" autocomplete="off" spellcheck="false" placeholder="ABCD">
          <button type="button" class="pkb pkb--go js-go">Trouver la table</button></div></div>`);
        document.body.appendChild(modal);
        const inp = modal.querySelector('.js-c'); inp.focus();
        inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z]/g, ''); });
        const go = () => {
          const code = inp.value.trim();
          if (code.length !== 4) { ui.toast('Le code fait 4 lettres.', 'error'); return; }
          const privs = (L.tables || []).filter((t) => t.private && t.players.length < t.seats);
          if (!privs.length) { ui.toast('Aucune table privée ouverte pour l’instant.', 'error'); return; }
          modal.remove();
          // le serveur vérifie le code ; on essaie les tables privées ouvertes, de la plus récente à la plus ancienne
          sitDialog(null, 0, code, privs);
        };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        modal.addEventListener('click', (e) => {
          if (e.target === modal || e.target.closest('.modal__close')) { modal.remove(); return; }
          if (e.target.closest('.js-go')) go();
        });
      }

      function amountDialog({ title, text, min, max, value, cta, onGo }) {
        let v = value;
        const modal = ui.el(`<div class="modal" role="dialog" aria-modal="true"><div class="modal__card pk-sit">
          <button class="modal__close icon-btn" type="button" aria-label="Fermer">${I('x')}</button>
          <h3>${title}</h3><p>${text}</p>
          <div class="pk-sit__amt num js-v">${fmt(v)}</div>
          <input type="range" min="${min}" max="${max}" step="1" value="${v}" class="pk-range js-r">
          <div class="pk-sit__lim"><span>${fmt(min)}</span><span>${fmt(max)}</span></div>
          <button type="button" class="pkb pkb--go js-go">${cta}</button></div></div>`);
        document.body.appendChild(modal);
        const r = modal.querySelector('.js-r');
        r.addEventListener('input', () => { v = +r.value; modal.querySelector('.js-v').textContent = fmt(v); });
        modal.addEventListener('click', async (e) => {
          if (e.target === modal || e.target.closest('.modal__close')) { modal.remove(); return; }
          const go = e.target.closest('.js-go');
          if (!go) return;
          go.disabled = true;
          const ok = await onGo(v);
          go.disabled = false;
          if (ok) modal.remove();
        });
      }
      function sitDialog(t, back, code, candidates) {
        // via « J'ai un code » : on ne sait pas encore quelle table, la cave suit le niveau le plus bas des tables privées
        const ref = t || candidates.reduce((a, x) => (x.min < a.min ? x : a), candidates[0]);
        const mn = Math.max(ref.min, back > ref.min ? back : 0), mx = Math.min(Math.max(ref.max, back || 0), Math.floor(DP.wallet.get()));
        if (mx < mn) { ui.toast('Pas assez de DaveCoins pour cette table.', 'error'); return; }
        const askCode = t && t.private && !code;
        let v = Math.min(mx, Math.max(mn, ref.max));
        const modal = ui.el(`<div class="modal" role="dialog" aria-modal="true"><div class="modal__card pk-sit">
          <button class="modal__close icon-btn" type="button" aria-label="Fermer">${I('x')}</button>
          <h3>${I('spade')}${t ? esc(t.name) : 'Table privée'} · <span class="num">${fmt(ref.sb)} / ${fmt(ref.bb)}</span></h3>
          <p>Combien de DaveCoins poses-tu sur la table ? Tu les récupères en partant.</p>
          ${askCode ? '<input class="pk-code js-c" maxlength="4" autocomplete="off" spellcheck="false" placeholder="CODE">' : ''}
          <div class="pk-sit__amt num js-v">${fmt(v)}</div>
          <input type="range" min="${mn}" max="${mx}" step="1" value="${v}" class="pk-range js-r">
          <div class="pk-sit__lim"><span>${fmt(mn)}</span><span>${fmt(mx)}</span></div>
          <button type="button" class="pkb pkb--go js-go">S’asseoir</button></div></div>`);
        document.body.appendChild(modal);
        const r = modal.querySelector('.js-r'), ci = modal.querySelector('.js-c');
        if (ci) { ci.focus(); ci.addEventListener('input', () => { ci.value = ci.value.toUpperCase().replace(/[^A-Z]/g, ''); }); }
        r.addEventListener('input', () => { v = +r.value; modal.querySelector('.js-v').textContent = fmt(v); });
        modal.addEventListener('click', async (e) => {
          if (e.target === modal || e.target.closest('.modal__close')) { modal.remove(); return; }
          const go = e.target.closest('.js-go');
          if (!go) return;
          const c = code || (ci ? ci.value.trim() : null);
          if (askCode && (!c || c.length !== 4)) { ui.toast('Entre le code à 4 lettres de la table.', 'error'); return; }
          go.disabled = true;
          let res = null, joined = null;
          for (const x of (t ? [t] : candidates)) {
            // cave choisie, gardée dans les limites de la table (le maximum monte jusqu'au tapis avec lequel tu es parti dans l'heure)
            const bx = t ? back || 0 : ((lobbyData && lobbyData.leaves) || {})[x.level] || 0;
            const lo = Math.max(x.min, bx > x.min ? bx : 0), hi = Math.max(x.max, bx);
            res = await rpc('poker_join', { p_table: x.id, p_buyin: t ? v : Math.min(Math.max(v, lo), hi), p_code: c || null }, { silent: !t });
            if (res) { joined = x; break; }
            if (!/Code/i.test(DP.engine.lastError || '')) break;
          }
          go.disabled = false;
          if (!res) { if (!t) ui.toast(DP.engine.lastError || 'Code incorrect.', 'error'); return; }
          modal.remove(); sound.play('chip');
          clearInterval(lobbyTimer);
          openTable(joined.id, res.state);
        });
      }

      /* ================= À la table ================= */
      function stopTable() {
        clearInterval(timer); timer = 0; clearTimeout(soon);
        if (channel) { try { DP.cloud.sb.removeChannel(channel); } catch { /* ignore */ } channel = null; }
      }
      function openTable(id, first) {
        stopTable(); seated(true);
        tableId = id; lastVer = -1; st = null; prev = null; raiseOpen = false; raiseTo = 0; turnKey = ''; myTurnKey = '';
        build();
        channel = DP.cloud.sb.channel('pk-' + id + '-' + Date.now())
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'poker_tables', filter: `id=eq.${id}` }, () => tick())
          .subscribe();
        timer = setInterval(tick, 1000);
        if (first) apply(first);
        tick();
      }
      async function tick() {
        if (!alive || !tableId) return;
        if (busy) { again = true; return; }
        busy = true;
        const s = await rpc('poker_tick', { p_table: tableId }, { silent: true });
        busy = false;
        if (s && alive && tableId) apply(s);
        if (again) { again = false; tick(); }
      }
      function apply(s) {
        offset = s.now - Date.now();
        clearTimeout(soon);
        const at = s.deadline || s.nextAt;
        if (at && tableId) soon = setTimeout(tick, Math.max(40, at - (Date.now() + offset) + 60));
        if (st && st.mySeat != null && s.mySeat == null) { ui.toast('Tu as quitté la table. Tes jetons sont revenus sur ton solde.', 'info', 4500); DP.engine.refresh(); st = null; lobby(); return; }
        if (s.ver === lastVer) { paintTimer(); return; }
        lastVer = s.ver;
        prev = st; st = s;
        update();
      }
      const me = () => st && st.seats.find((x) => x.seat === st.mySeat);
      const myTurn = () => !!(st && st.mySeat != null && st.toAct === st.mySeat && BETTING.includes(st.stage));
      const L = () => (box.clientWidth < 700 ? LAYOUT.tall : LAYOUT.wide);

      /* ---------- Construction (une seule fois) ---------- */
      function build() {
        box.innerHTML = `<div class="pkx">
          <div class="pkx-bg" aria-hidden="true">${bokeh(22)}</div>
          <header class="pkx-hud">
            <button type="button" class="pkx-hb js-leave">${I('log-out', 'i--sm')}<span>Quitter</span></button>
            <div class="pkx-title"><b class="js-tname"></b><span class="js-tinfo num"></span><button type="button" class="pkx-code js-tcode" hidden title="Copier le code"></button></div>
            <div class="pkx-hud__r">
              <button type="button" class="pkx-hb js-rebuy" title="Recave">${I('plus', 'i--sm')}<span>Recave</span></button>
              <button type="button" class="pkx-hb pkx-hb--sq js-fs" title="Plein écran" aria-label="Plein écran">${I('layout-dashboard', 'i--sm')}</button>
            </div>
          </header>
          <div class="pkx-stage">
            <div class="pkx-table"><div class="pkx-rail"></div><div class="pkx-felt"><div class="pkx-line"></div>
              <div class="pkx-brand"><span>Dave’s Palace</span><small>Poker Club</small></div>
              <span class="pkx-suits l">♠ ♥</span><span class="pkx-suits r">♦ ♣</span></div></div>
            <div class="pkx-dealer"><img src="${IMG}jpz.png" alt="JPZ, le croupier"><span>Croupier</span></div>
            <div class="pkx-pot">${chips(4)}<b class="num js-pot">0</b></div>
            <div class="pkx-board">${'<span class="pkk slot"></span>'.repeat(5)}</div>
            <div class="pkx-msg js-msg"></div>
            ${Array.from({ length: 6 }, (_, k) => `<div class="pkx-seat empty" data-k="${k}">
                <div class="pkx-cards"></div>
                <div class="pkx-ring"><div class="pkx-av"></div></div>
                <div class="pkx-plate"><b class="nm"></b><span class="num stk"></span></div>
                <span class="pkx-badge"></span>
                <span class="pkx-hand"></span>
              </div>`).join('')}
            ${Array.from({ length: 6 }, (_, k) => `<div class="pkx-bet" data-k="${k}">${chips(2)}<b class="num"></b></div>`).join('')}
            <i class="pkx-dbtn">D</i>
          </div>
          <div class="pkx-dock">
            <div class="pkx-raise" hidden>
              <div class="pkx-presets"></div>
              <input type="range" class="pk-range pk-range--v js-rr" step="1" aria-label="Montant de la relance" orient="vertical">
            </div>
            <div class="pkx-acts"></div>
          </div>
          <details class="pkx-log"><summary>${I('history', 'i--sm')}Journal de la table</summary><ol></ol></details>
        </div>`;
        const q = (s) => box.querySelector(s);
        T = {
          root: q('.pkx'), stage: q('.pkx-stage'), pot: q('.pkx-pot'), potV: q('.js-pot'), board: [...box.querySelectorAll('.pkx-board .pkk')], msg: q('.js-msg'),
          seats: [...box.querySelectorAll('.pkx-seat')], bets: [...box.querySelectorAll('.pkx-bet')], dbtn: q('.pkx-dbtn'), dealer: q('.pkx-dealer'),
          raise: q('.pkx-raise'), presets: q('.pkx-presets'), rr: q('.js-rr'), acts: q('.pkx-acts'), log: q('.pkx-log ol'),
          tname: q('.js-tname'), tinfo: q('.js-tinfo'), tcode: q('.js-tcode'), leave: q('.js-leave'), rebuy: q('.js-rebuy')
        };
        T.leave.addEventListener('click', leave);
        T.tcode.addEventListener('click', () => {
          const c = st && st.code; if (!c) return;
          (navigator.clipboard ? navigator.clipboard.writeText(c) : Promise.reject()).then(() => ui.toast(`Code ${c} copié : envoie-le à tes potes !`, 'win'), () => ui.toast(`Code de la table : ${c}`, 'info'));
        });
        T.rebuy.addEventListener('click', rebuy);
        q('.js-fs').addEventListener('click', () => {
          if (document.fullscreenElement) document.exitFullscreen();
          else if (T.root.requestFullscreen) T.root.requestFullscreen().catch(() => {});
        });
        T.rr.addEventListener('input', () => setRaise(+T.rr.value));
        T.presets.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { sound.play('click'); setRaise(+b.dataset.v); } });
        T.acts.addEventListener('click', (e) => { const b = e.target.closest('button[data-a]'); if (b && !b.disabled) action(b.dataset.a); });
        layout();
      }

      /** Place les éléments selon la disposition (large ou en hauteur). */
      function layout() {
        if (!T) return;
        const lay = L();
        T.root.classList.toggle('is-tall', lay === LAYOUT.tall);
        T.seats.forEach((el, k) => { el.style.left = lay.seat[k][0] + '%'; el.style.top = lay.seat[k][1] + '%'; el.dataset.side = lay.side[k]; });
        T.bets.forEach((el, k) => { el.style.left = lay.bet[k][0] + '%'; el.style.top = lay.bet[k][1] + '%'; });
        T.pot.style.left = lay.pot[0] + '%'; T.pot.style.top = lay.pot[1] + '%';
      }

      /* ---------- Animations ---------- */
      // un objet qui vole d'un point à un autre de la scène (en % de la scène)
      function fly(from, to, html, { dur = 480, delay = 0, cls = '' } = {}) {
        if (!T || !from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const W = T.stage.clientWidth, H = T.stage.clientHeight;
        const el = ui.el(`<div class="pkx-fly ${cls}" style="left:${from[0]}%;top:${from[1]}%">${html}</div>`);
        T.stage.appendChild(el);
        const dx = ((to[0] - from[0]) / 100) * W, dy = ((to[1] - from[1]) / 100) * H;
        const a = el.animate([
          { transform: 'translate(-50%, -50%) scale(.7) rotate(-20deg)', opacity: 0 },
          { opacity: 1, offset: 0.12 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(0deg)`, opacity: 1 }
        ], { duration: dur, delay, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'both' });
        a.onfinish = () => el.remove();
      }
      // emplacement à l'écran (0 = toi en bas, 3 = en face) selon le nombre de places de la table
      const SLOTS = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 5], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
      const kOf = (seat) => (SLOTS[st.nseats] || SLOTS[6])[(seat - (st.mySeat != null ? st.mySeat : 0) + st.nseats) % st.nseats];
      // montant qui défile
      function countTo(el, to) {
        const from = +(el.dataset.v || 0);
        el.dataset.v = to;
        if (from === to || !el.isConnected) { el.textContent = fmt(to); return; }
        const t0 = performance.now(), d = 520;
        const step = (t) => { const p = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(Math.round(from + (to - from) * e)); if (p < 1 && el.isConnected) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }

      /* ---------- Mise à jour ---------- */
      function update() {
        if (!T || !st) return;
        const lay = L(), n = st.nseats;
        const shown = (st.result && st.result.shown) || {};
        const winners = st.stage === 'done' && st.result ? st.result.winners || [] : [];
        const winSeats = new Set(winners.map((w) => w.seat));
        const newHand = prev && prev.hand !== st.hand && st.stage !== 'idle';
        const m = me();

        T.tname.textContent = st.name;
        T.tcode.hidden = !st.code;
        if (st.code) T.tcode.innerHTML = `${I('lock', 'i--sm')}Code <b>${esc(st.code)}</b>`;
        T.tinfo.textContent = `${fmt(st.sb)} / ${fmt(st.bb)}${st.hand ? ` · main n° ${st.hand}` : ''}`;
        T.leave.querySelector('span').textContent = leaveArmed ? 'Confirmer : tu te couches' : 'Quitter';
        T.leave.classList.toggle('armed', !!leaveArmed);
        T.rebuy.hidden = !m;
        if (m) T.rebuy.disabled = m.stack >= st.max || (['playing', 'allin'].includes(m.status) && BETTING.includes(st.stage));

        // 1) jetons des mises vers le pot (fin d'un tour d'enchères)
        if (prev && prev.hand === st.hand) {
          const prevBets = prev.seats.filter((x) => x.bet > 0);
          const now = new Map(st.seats.map((x) => [x.seat, x.bet]));
          if (prevBets.length && prevBets.every((x) => !now.get(x.seat))) {
            prevBets.forEach((x, i) => fly(lay.bet[kOf(x.seat)], lay.pot, chips(2), { dur: 420, delay: i * 50, cls: 'chip' }));
            sound.play('chip');
          }
        }
        // 2) places
        const seatOf = (k) => st.seats.find((x) => kOf(x.seat) === k);
        T.seats.forEach((el, k) => {
          const x = seatOf(k);
          el.classList.toggle('empty', !x);
          if (!x) {
            // place libérée : on vide tout (cartes, badge, main) pour le prochain occupant
            if (el.dataset.name) { el.dataset.name = ''; el.className = 'pkx-seat empty'; const c = el.querySelector('.pkx-cards'); c.innerHTML = ''; c.dataset.key = ''; el.querySelector('.pkx-badge').className = 'pkx-badge'; el.querySelector('.pkx-badge').textContent = ''; el.querySelector('.pkx-hand').textContent = ''; }
            return;
          }
          const turn = st.toAct === x.seat && BETTING.includes(st.stage);
          el.className = `pkx-seat ${x.status} ${x.me ? 'me' : ''} ${turn ? 'turn' : ''} ${winSeats.has(x.seat) ? 'won' : ''} ${x.leaving ? 'leaving' : ''}`;
          if (el.dataset.name !== x.name + (x.bot || '')) {
            el.dataset.name = x.name + (x.bot || '');
            el.querySelector('.pkx-av').innerHTML = x.isBot ? `<img src="${IMG}${x.bot}" alt="">` : DP.profile.avatarHtml(x.name, 'avatar');
            el.querySelector('.nm').innerHTML = `${esc(x.name)}${x.isBot ? '<small>BOT</small>' : ''}`;
            el.querySelector('.stk').dataset.v = x.stack;
          }
          const stk = el.querySelector('.stk');
          if (x.status === 'sitout' && x.stack <= 0) { stk.textContent = 'Recave'; stk.dataset.v = 0; } else countTo(stk, x.stack);
          // badge d'action (pop à chaque nouvelle action)
          const badge = el.querySelector('.pkx-badge');
          const lbl = x.status === 'allin' ? 'All-in' : x.last ? actEN(x.last) : '';
          if (badge.textContent !== lbl) { badge.textContent = lbl; badge.className = 'pkx-badge' + (lbl ? ' on' : '') + (/^(Fold|Left)/.test(lbl) ? ' fold' : /^(Raise|Bet|All-in)/.test(lbl) ? ' raise' : ''); }
          // cartes
          const inHand = ['playing', 'allin', 'folded'].includes(x.status) && st.stage !== 'idle';
          let cards = [];
          if (x.me && st.myCards && inHand) cards = st.myCards;
          else if (shown[x.seat]) cards = shown[x.seat];
          else if (inHand && x.status !== 'folded') cards = [null, null];
          const key = cards.map((c) => (c == null ? 'b' : c)).join('-') + (x.status === 'folded' ? 'f' : '') + st.hand;
          const box2 = el.querySelector('.pkx-cards');
          if (box2.dataset.key !== key) {
            const wasBack = box2.dataset.key && box2.dataset.key.startsWith('b-b');
            box2.dataset.key = key;
            box2.innerHTML = cards.map((c, i) => cardHtml(c, `${x.status === 'folded' ? 'dim' : ''} ${newHand ? 'dealt' : wasBack && c != null ? 'flip' : ''}`).replace('class="pkk', `style="--d:${newHand ? (k * 2 + i) * 70 + 260 : 0}ms" class="pkk`)).join('');
          }
          // main en cours (sous tes cartes)
          const hand = el.querySelector('.pkx-hand');
          hand.textContent = x.me && st.myCards && ['playing', 'allin'].includes(x.status) ? PE.name(PE.evaluate(st.myCards.concat(st.board))) : winSeats.has(x.seat) ? ((winners.find((w) => w.seat === x.seat) || {}).hand || '') : '';
        });
        // distribution : les cartes partent du croupier
        if (newHand) {
          sound.play('card');
          st.seats.filter((x) => ['playing', 'allin'].includes(x.status)).forEach((x) => {
            const k = kOf(x.seat), to = [lay.seat[k][0], lay.seat[k][1] - 7];
            [0, 1].forEach((i) => fly(lay.dealer, to, cardHtml(null, 'mini'), { dur: 380, delay: (k * 2 + i) * 70, cls: 'card' }));
          });
        }
        // 3) mises devant les joueurs
        T.bets.forEach((el, k) => {
          const x = seatOf(k);
          const v = x ? x.bet : 0;
          el.classList.toggle('on', v > 0);
          if (v > 0) countTo(el.querySelector('b'), v);
        });
        // 4) bouton du donneur
        if (st.dealer >= 0 && st.stage !== 'idle' && st.seats.some((x) => x.seat === st.dealer) && kOf(st.dealer) != null) {
          const k = kOf(st.dealer), p = lay.seat[k], q = lay.bet[k];
          T.dbtn.style.left = (p[0] * 0.55 + q[0] * 0.45 + (k === 0 ? 7 : k === 3 ? -7 : 0)) + '%';
          T.dbtn.style.top = (p[1] * 0.55 + q[1] * 0.45) + '%';
          T.dbtn.classList.add('on');
        } else T.dbtn.classList.remove('on');
        // JPZ le croupier, quand la place d'en face est libre
        T.dealer.classList.toggle('on', !seatOf(3));
        // 5) tableau (cartes communes) : elles se retournent une à une
        let fresh = 0;
        T.board.forEach((el, i) => {
          const c = st.board[i];
          const key = c == null ? '' : String(c);
          if (el.dataset.c === key) return;
          el.dataset.c = key;
          const html = c == null ? '<span class="pkk slot"></span>' : cardHtml(c, 'board flip');
          const nel = ui.el(html);
          if (c != null) { nel.style.setProperty('--d', fresh * 140 + 'ms'); fresh++; }
          nel.dataset.c = key;
          el.replaceWith(nel); T.board[i] = nel;
        });
        if (fresh) setTimeout(() => sound.play('cardFlip'), 100);
        // victoire : surbrillance des cartes gagnantes à l'abattage
        // 6) pot
        const potShown = st.stage === 'done' && st.result ? st.result.pot : st.pot;
        countTo(T.potV, potShown);
        T.pot.classList.toggle('on', potShown > 0);
        // 7) message central
        T.msg.innerHTML = winners.length ? winners.map((w) => `<div><b>${esc(w.name)}</b> gagne <b class="num">${fmt(w.amount)}</b>${w.hand ? `<small>${esc(w.hand)}</small>` : ''}</div>`).join('')
          : st.stage === 'idle' ? `<span>${st.seats.length < 2 ? (st.code ? `En attente d’un 2e joueur · code ${esc(st.code)}` : 'En attente d’un 2e joueur…') : 'La main commence…'}</span>` : '';
        T.msg.classList.toggle('win', winners.length > 0);
        // 8) gains : les jetons partent du pot vers le gagnant
        if (prev && prev.stage !== 'done' && st.stage === 'done' && winners.length) {
          winners.forEach((w, i) => fly(lay.pot, lay.seat[kOf(w.seat)], chips(4), { dur: 650, delay: 420 + i * 120, cls: 'chip' }));
          const mine = winners.find((w) => w.seat === st.mySeat);
          setTimeout(() => { if (alive) sound.play(mine ? 'win' : 'chip', { x: 3 }); }, 500);
          if (mine && st.result.pot >= st.bb * 20) setTimeout(() => alive && ui.coinRain(T.stage, 24), 600);
          DP.engine.refresh();
        }
        // 9) journal
        T.log.innerHTML = st.log.slice().reverse().map((l) => `<li>${esc(l)}</li>`).join('');
        paintActions();
        paintTimer();
      }

      /* ---------- Chrono en anneau ---------- */
      function paintTimer() {
        if (!T || !st) return;
        const key = `${st.hand}-${st.toAct}-${st.deadline}`;
        if (key === turnKey) return;
        turnKey = key;
        T.seats.forEach((el) => el.style.removeProperty('--dur'));
        if (!st.deadline || st.toAct == null || !BETTING.includes(st.stage) || kOf(st.toAct) == null) return;
        const el = T.seats[kOf(st.toAct)];
        const who = st.seats.find((x) => x.seat === st.toAct);
        const left = Math.max(0, st.deadline - (Date.now() + offset));
        const total = who && !who.isBot ? Math.max(left, 20000) : Math.max(left, 1);
        const ring = el.querySelector('.pkx-ring');
        ring.style.animation = 'none'; void ring.offsetWidth; ring.style.animation = '';
        el.style.setProperty('--dur', total + 'ms');
        el.style.setProperty('--del', -(total - left) + 'ms');
        if (myTurn() && myTurnKey !== key) { myTurnKey = key; sound.play('bet'); }
      }

      /* ---------- Boutons d'action ---------- */
      function setRaise(v) {
        raiseTo = v;
        if (T.rr.value !== String(v)) T.rr.value = v;
        const lab = T.acts.querySelector('.js-rv');
        const m = me();
        if (lab && m) lab.textContent = v >= m.bet + m.stack ? `${fmt(v)} · all-in` : fmt(v);
      }
      function paintActions() {
        if (!T) return;
        const m = me();
        if (!myTurn() || !m) {
          raiseOpen = false; T.raise.hidden = true;
          const waiting = m && m.status === 'playing' && BETTING.includes(st.stage);
          T.acts.innerHTML = m && m.status === 'sitout' ? `<div class="pkx-wait">Plus de jetons : <button type="button" class="pkb pkb--go pkb--sm js-rb">Recave</button></div>`
            : m && m.status === 'waiting' ? '<div class="pkx-wait">Tu joues dès la prochaine main</div>'
              : waiting ? '<div class="pkx-wait"><span class="pkx-dots"><i></i><i></i><i></i></span>Au tour des autres</div>' : '';
          const rb = T.acts.querySelector('.js-rb'); if (rb) rb.addEventListener('click', rebuy);
          return;
        }
        const toCall = Math.max(0, st.curBet - m.bet), maxTo = m.bet + m.stack;
        const minTo = Math.min(maxTo, st.curBet + st.minRaise);
        const pot = st.pot + st.seats.reduce((a, x) => a + x.bet, 0);
        const canRaise = m.stack > toCall;
        raiseTo = Math.min(maxTo, Math.max(minTo, raiseTo || minTo));
        const preset = (f) => Math.min(maxTo, Math.max(minTo, Math.round(st.curBet + (pot + toCall) * f)));
        T.raise.hidden = !(raiseOpen && canRaise);
        if (raiseOpen && canRaise) {
          T.rr.min = minTo; T.rr.max = maxTo; T.rr.value = raiseTo;
          T.presets.innerHTML = [['All-in', maxTo], ['Pot', preset(1)], ['¾ Pot', preset(0.75)], ['½ Pot', preset(0.5)], ['Min', minTo]].map(([l, v]) => `<button type="button" data-v="${v}">${l}</button>`).join('');
        }
        // gros boutons d'action : icône, libellé, montant et touche du clavier
        const btn = (cls, a, ico, label, sub, key) => `<button type="button" class="pka pka--${cls}" data-a="${a}">
            <span class="pka__ico">${I(ico)}</span><span class="pka__txt"><b>${label}</b>${sub != null ? `<small class="num ${a === 'raise' ? 'js-rv' : ''}">${sub}</small>` : ''}</span><kbd>${key}</kbd></button>`;
        const allCall = toCall && toCall >= m.stack;
        T.acts.innerHTML = btn('fold', 'fold', 'x', 'Fold', null, 'F')
          + (toCall ? btn('call', 'call', allCall ? 'zap' : 'check', allCall ? 'All-in' : 'Call', fmt(Math.min(toCall, m.stack)), 'C') : btn('call', 'check', 'check', 'Check', null, 'C'))
          + (canRaise ? (raiseOpen ? btn('raise', 'raise', 'trending-up', st.curBet ? 'Raise' : 'Bet', fmt(raiseTo), 'R') : btn('raise', 'open', 'trending-up', st.curBet ? 'Raise' : 'Bet', `min ${fmt(minTo)}`, 'R')) : '');
        setRaise(raiseTo);
      }
      async function action(a) {
        if (!myTurn()) return;
        if (a === 'open') { raiseOpen = true; sound.play('click'); paintActions(); return; }
        T.acts.querySelectorAll('button').forEach((b) => (b.disabled = true));
        const m = me();
        const isAll = a === 'raise' && raiseTo >= m.bet + m.stack;
        sound.play(a === 'fold' ? 'cardFlip' : a === 'check' ? 'click' : 'chip');
        if (a === 'call' || a === 'raise') {
          const k = kOf(m.seat);
          fly(L().seat[k], L().bet[k], chips(2), { dur: 300, cls: 'chip' });
        }
        const s = await rpc('poker_act', { p_table: tableId, p_action: isAll ? 'allin' : a, p_amount: a === 'raise' ? raiseTo : null });
        raiseOpen = false; raiseTo = 0;
        if (s && alive) apply(s); else paintActions();
      }

      async function leave() {
        if (st && st.mySeat != null) {
          const m = me();
          // en pleine main : un 2e clic dans les 4 s pour confirmer
          if (m && m.status === 'playing' && BETTING.includes(st.stage) && !(leaveArmed && Date.now() - leaveArmed < 4000)) {
            leaveArmed = Date.now(); sound.play('click'); update();
            setTimeout(() => { if (alive && leaveArmed && Date.now() - leaveArmed >= 4000) { leaveArmed = 0; update(); } }, 4100);
            return;
          }
          leaveArmed = 0;
          const r = await rpc('poker_leave', { p_table: tableId });
          if (!r) return;
          sound.play('coin');
          ui.toast('Tes jetons sont revenus sur ton solde.', 'win');
        }
        tableId = null; st = null;
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        lobby();
      }
      function rebuy() {
        const m = me();
        if (!m) return;
        const mx = Math.min(st.max - m.stack, Math.floor(DP.wallet.get()));
        if (mx < 1) { ui.toast(m.stack >= st.max ? 'Tu as déjà le maximum de la table.' : 'Pas assez de DaveCoins.', 'error'); return; }
        amountDialog({
          title: `${I('plus')}Recave`, text: `Ajoute des jetons à ton tapis (maximum ${fmt(st.max)} sur cette table).`, min: 1, max: mx, value: mx, cta: 'Ajouter',
          onGo: async (v) => { const res = await rpc('poker_rebuy', { p_table: tableId, p_amount: v }); if (!res) return false; sound.play('chip'); apply(res.state); return true; }
        });
      }

      const onKey = (e) => {
        if (!myTurn() || /input|textarea|select/i.test(document.activeElement.tagName) || document.querySelector('.modal')) return;
        const k = e.key.toLowerCase();
        if (k === 'f') action('fold');
        if (k === 'c') { const m = me(); action(st.curBet > m.bet ? 'call' : 'check'); }
        if (k === 'r') action(raiseOpen ? 'raise' : 'open');
      };
      const onResize = () => { if (!T) return; layout(); if (st) { prev = st; update(); } };
      window.addEventListener('keydown', onKey);
      window.addEventListener('resize', onResize);
      document.addEventListener('fullscreenchange', onResize);
      lobby();
      return () => {
        alive = false; stopTable(); seated(false); clearInterval(lobbyTimer);
        window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); document.removeEventListener('fullscreenchange', onResize);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      };
    }
  });
})();
