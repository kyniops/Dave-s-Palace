/* DavePoker — Texas Hold'em No Limit entre joueurs (en ligne), tables à niveaux avec cave plafonnée.
 * Seul à une table, on joue contre des bots ; dès qu'un 2e joueur s'assoit, les bots partent.
 * Tout est décidé par le serveur (supabase/poker.sql) : la page affiche l'état reçu et envoie les actions.
 */
(function () {
  'use strict';
  const { IMG, fmt, sound, ui, esc } = DP;
  const I = ui.icon;
  const PE = window.DP_PKEVAL;
  const STAGES = { preflop: 'Avant le flop', flop: 'Flop', turn: 'Turn', river: 'River', done: 'Fin de la main', idle: 'En attente de joueurs' };
  // places autour de la table, la tienne en bas au centre (sens des aiguilles d'une montre)
  const POS = [[50, 92], [10, 72], [10, 26], [50, 7], [90, 26], [90, 72]];
  const BETPOS = [[50, 70], [26, 63], [26, 36], [50, 28], [74, 36], [74, 63]];
  // sur téléphone (table en hauteur), les places s'écartent moins du centre
  const POS_M = [[50, 91], [19, 72], [19, 28], [50, 8], [81, 28], [81, 72]];
  const BET_M = [[50, 76], [34, 62], [34, 38], [50, 23], [66, 38], [66, 62]];

  const cardHtml = (c, cls = '') => {
    if (c == null) return `<span class="pkc back ${cls}"></span>`;
    const r = PE.rank(c), s = PE.suit(c);
    return `<span class="pkc ${s === 1 || s === 2 ? 'red' : ''} ${cls}"><b>${PE.RANKS[r]}</b><i>${PE.SUITS[s]}</i><em>${PE.SUITS[s]}</em></span>`;
  };
  const online = () => !!(DP.engine && DP.engine.on && DP.cloud && DP.cloud.sb);
  const rpc = (fn, p, o) => DP.engine.call(fn, p, o);

  DP.games.register({
    id: 'poker',
    name: 'DavePoker',
    icon: 'spade',
    tagline: 'Texas Hold’em entre joueurs, 4 tables à niveaux',
    rtp: '100 %',
    hue: 145,
    art: `<div class="art-poker"><span class="pkc red" style="--k:-1"><b>A</b><i>♥</i><em>♥</em></span><span class="pkc" style="--k:1"><b>A</b><i>♠</i><em>♠</em></span></div>`,
    rules: `<p><strong>Texas Hold’em No Limit</strong>, de 2 à 6 joueurs par table. Tu reçois 2 cartes, 5 cartes communes arrivent au centre (flop, turn, river) : la meilleure main de 5 cartes gagne le pot.</p>
      <ul><li><strong>4 tables à niveaux</strong> : Petite (1/2), Moyenne (5/10), Grosse (25/50), High roller (100/200). Tu t’assois avec une <strong>cave</strong> entre 40 et 100 grosses blindes : un gros solde ne donne aucun avantage à la table.</li>
      <li>Tu peux te <strong>recaver</strong> entre deux mains, jusqu’au maximum de la table.</li>
      <li>Si tu pars et reviens <strong>dans l’heure</strong> à la même table, tu dois revenir avec au moins le tapis avec lequel tu es parti.</li>
      <li>Seul à une table, tu joues contre des <strong>bots</strong> de la bande. Dès qu’un 2e joueur s’assoit, ils quittent la table à la fin de la main.</li>
      <li><strong>20 secondes</strong> pour jouer : sinon parole (ou couché). Deux fois de suite et tu quittes la table à la fin de la main. Si tu fermes la page plus d’une minute, tu quittes aussi la table (tes jetons reviennent sur ton solde).</li>
      <li>Aucune commission : tout ce qui est misé revient aux joueurs.</li></ul>
      <p class="muted">Ordre des mains : quinte flush, carré, full, couleur, quinte, brelan, double paire, paire, hauteur.</p>`,
    mount(root) {
      root.innerHTML = '<div class="pk"></div>';
      const box = root.firstElementChild;
      let alive = true, timer = 0, channel = null, tableId = null, st = null, lastVer = -1, lastHand = -1, offset = 0, busy = false, again = false, myTurnSeen = false, raiseTo = 0, leaveArmed = 0;

      if (!online()) {
        box.innerHTML = `<div class="empty">${I('spade', 'i--lg')}<strong>Le poker se joue en ligne</strong>Connecte-toi avec ton compte en ligne pour t’asseoir à une table avec les autres joueurs.</div>`;
        return () => {};
      }

      /* ---------- Salon : les 4 tables ---------- */
      async function lobby() {
        stopTable();
        box.innerHTML = `<div class="empty">${I('spade', 'i--lg')}<strong>Chargement des tables…</strong></div>`;
        const L = await rpc('poker_lobby', {}, { silent: true });
        if (!alive) return;
        if (!L) { box.innerHTML = `<div class="empty">${I('spade', 'i--lg')}<strong>Le poker n’est pas encore installé</strong>Le script supabase/poker.sql doit être lancé sur le serveur.</div>`; return; }
        if (L.mine) return openTable(L.mine);
        const bal = DP.wallet.get();
        box.innerHTML = `<div class="pk-lobby">
          <p class="pk-lobby__intro">${I('info', 'i--sm')}Choisis ta table selon ton solde (<b class="num">${fmt(bal)}</b>). Tu t’assois avec une somme plafonnée : tout le monde joue à armes égales.</p>
          <div class="pk-tables">${L.tables.map((t) => {
            const humans = t.players.filter((p) => !p.bot), bots = t.players.length - humans.length;
            const back = L.leaves && L.leaves[t.id] > t.min ? L.leaves[t.id] : 0;
            const can = bal >= Math.max(t.min, back);
            return `<article class="pk-tab" data-lvl="${t.id}">
              <header><h3>${esc(t.name)}</h3><span class="pk-tab__bl num">${fmt(t.sb)} / ${fmt(t.bb)}</span></header>
              <ul class="dlist"><li><span>Cave</span><b class="num">${fmt(t.min)} – ${fmt(t.max)}</b></li>
                <li><span>Joueurs</span><b class="num">${humans.length} / ${t.seats}${bots ? ` <small class="muted">+ ${bots} bot${bots > 1 ? 's' : ''}</small>` : ''}</b></li></ul>
              <div class="pk-tab__who">${humans.length ? humans.map((p) => DP.profile.avatarHtml(p.name)).join('') : '<span class="muted">Personne pour l’instant : tu joueras contre les bots</span>'}</div>
              ${back ? `<p class="pk-tab__warn">${I('triangle-alert', 'i--sm')}Parti il y a moins d’une heure : cave minimum ${fmt(back)}</p>` : ''}
              <button type="button" class="btn ${can ? 'btn--primary' : 'btn--ghost'} btn--block js-sit" data-t="${t.id}" ${can ? '' : 'disabled'}>${can ? 'S’asseoir' : 'Solde insuffisant'}</button>
            </article>`;
          }).join('')}</div></div>`;
        box.querySelectorAll('.js-sit').forEach((b) => b.addEventListener('click', () => sitDialog(L.tables.find((t) => t.id === b.dataset.t), L.leaves && L.leaves[b.dataset.t])));
        DP_MOTION.reveal(box, '.pk-tab');
      }

      function sitDialog(t, back) {
        const mn = Math.max(t.min, back > t.min ? back : 0), mx = Math.min(Math.max(t.max, back || 0), Math.floor(DP.wallet.get()));
        if (mx < mn) { ui.toast('Pas assez de DaveCoins pour cette table.', 'error'); return; }
        let v = Math.min(mx, Math.max(mn, t.max));
        const modal = ui.el(`<div class="modal" role="dialog" aria-modal="true"><div class="modal__card pk-sit">
          <button class="modal__close icon-btn" type="button" aria-label="Fermer">${I('x')}</button>
          <h3>${I('spade')}Table ${esc(t.name)} · <span class="num">${fmt(t.sb)} / ${fmt(t.bb)}</span></h3>
          <p>Combien de DaveCoins poses-tu sur la table ? Tu les récupères en partant.</p>
          <div class="pk-sit__amt num js-v">${fmt(v)}</div>
          <input type="range" min="${mn}" max="${mx}" step="1" value="${v}" class="pk-range js-r">
          <div class="pk-sit__lim"><span>${fmt(mn)}</span><span>${fmt(mx)}</span></div>
          <button type="button" class="btn btn--primary btn--block js-go">S’asseoir</button></div></div>`);
        document.body.appendChild(modal);
        const r = modal.querySelector('.js-r');
        r.addEventListener('input', () => { v = +r.value; modal.querySelector('.js-v').textContent = fmt(v); });
        modal.addEventListener('click', async (e) => {
          if (e.target === modal || e.target.closest('.modal__close')) { modal.remove(); return; }
          const go = e.target.closest('.js-go');
          if (!go) return;
          go.disabled = true;
          const res = await rpc('poker_join', { p_table: t.id, p_buyin: v });
          go.disabled = false;
          if (!res) return;
          modal.remove();
          sound.play('chip');
          openTable(t.id, res.state);
        });
      }

      /* ---------- À la table ---------- */
      function stopTable() {
        clearInterval(timer); timer = 0;
        if (channel) { try { DP.cloud.sb.removeChannel(channel); } catch { /* ignore */ } channel = null; }
      }
      function openTable(id, first) {
        stopTable();
        tableId = id; lastVer = -1; lastHand = -1; st = null;
        box.innerHTML = '<div class="pkt"></div>';
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
        if (s && alive) apply(s);
        if (again) { again = false; tick(); }
      }
      function apply(s) {
        offset = s.now - Date.now();
        // plus assis (parti, absent, ou retiré après deux chronos) : retour au salon
        if (st && st.mySeat != null && s.mySeat == null) { ui.toast('Tu as quitté la table. Tes jetons sont revenus sur ton solde.', 'info', 4500); DP.engine.refresh(); st = s; lobby(); return; }
        const changed = s.ver !== lastVer;
        const prev = st;
        st = s;
        if (!changed) { paintTimer(); return; }
        lastVer = s.ver;
        if (s.hand !== lastHand) { if (lastHand >= 0 && s.stage !== 'idle') sound.play('card'); lastHand = s.hand; myTurnSeen = false; }
        if (prev && prev.stage !== 'done' && s.stage === 'done' && s.result) {
          const mine = (s.result.winners || []).find((w) => w.seat === s.mySeat);
          if (mine) sound.play('win', { x: 3 }); else sound.play('chip');
          DP.engine.refresh();
        } else if (prev && prev.board.length !== s.board.length) sound.play('cardFlip');
        else if (prev && prev.pot !== s.pot) sound.play('chip');
        paint();
      }
      const me = () => st && st.seats.find((x) => x.seat === st.mySeat);
      const myTurn = () => st && st.mySeat != null && st.toAct === st.mySeat && ['preflop', 'flop', 'turn', 'river'].includes(st.stage);

      function paint() {
        const el = box.querySelector('.pkt');
        if (!el || !st) return;
        const n = st.nseats, base = st.mySeat != null ? st.mySeat : 0, m = me(), narrow = window.matchMedia('(max-width: 760px)').matches;
        const potLive = st.pot + st.seats.reduce((a, x) => a + x.bet, 0);
        const shown = (st.result && st.result.shown) || {};
        const winSeats = new Set(((st.result && st.result.winners) || []).map((w) => w.seat));
        const seatHtml = (x) => {
          const k = (x.seat - base + n) % n, [px, py] = (narrow ? POS_M : POS)[k], [bx, by] = (narrow ? BET_M : BETPOS)[k];
          const inHand = ['playing', 'allin'].includes(x.status) || (st.stage === 'done' && shown[x.seat]);
          const cards = x.me && st.myCards ? st.myCards : shown[x.seat] ? shown[x.seat] : inHand && st.stage !== 'idle' ? [null, null] : [];
          const turn = st.toAct === x.seat && st.deadline;
          const avatar = x.isBot ? `<span class="avatar"><img src="${IMG}${x.bot}" alt=""></span>` : DP.profile.avatarHtml(x.name);
          return `<div class="pks ${x.status} ${x.me ? 'me' : ''} ${turn ? 'turn' : ''} ${winSeats.has(x.seat) && st.stage === 'done' ? 'won' : ''}" style="--x:${px}%;--y:${py}%">
              <div class="pks__cards">${cards.map((c, i) => cardHtml(c, x.status === 'folded' ? 'dim' : '')).join('')}</div>
              <div class="pks__plate">${avatar}<div><b>${esc(x.name)}${x.isBot ? ' <small>BOT</small>' : ''}</b><span class="num">${x.stack > 0 || x.status !== 'sitout' ? fmt(x.stack) : 'Recave'}</span></div>
                ${st.dealer === x.seat && st.stage !== 'idle' ? '<i class="pks__dealer">D</i>' : ''}
                ${turn ? `<span class="pks__timer"><i></i></span>` : ''}</div>
              ${x.last ? `<span class="pks__last">${esc(x.last)}</span>` : ''}
            </div>
            ${x.bet > 0 ? `<div class="pkbet num" style="--x:${bx}%;--y:${by}%">${fmt(x.bet)}</div>` : ''}`;
        };
        const res = st.stage === 'done' && st.result ? st.result.winners.map((w) => `<b>${esc(w.name)}</b> gagne <b class="num">${fmt(w.amount)}</b>${w.hand ? ` · ${esc(w.hand)}` : ''}`).join('<br>') : '';
        const board = st.board.concat(Array(5 - st.board.length).fill('x'));
        const strength = m && st.myCards && ['playing', 'allin'].includes(m.status) ? PE.name(PE.evaluate(st.myCards.concat(st.board))) : '';
        el.innerHTML = `
          <div class="pkt__bar">
            <button type="button" class="btn ${leaveArmed ? 'btn--danger' : 'btn--ghost'} btn--sm js-leave">${I('log-out', 'i--sm')}${st.mySeat == null ? 'Salon' : leaveArmed ? 'Confirmer : tu te couches' : 'Quitter la table'}</button>
            <span class="pkt__name">Table ${esc(st.name)} · <span class="num">${fmt(st.sb)} / ${fmt(st.bb)}</span>${st.hand ? ` · main n° ${st.hand}` : ''}</span>
            ${m ? `<button type="button" class="btn btn--ghost btn--sm js-rebuy" ${m.stack >= st.max || (['playing', 'allin'].includes(m.status) && st.stage !== 'done' && st.stage !== 'idle') ? 'disabled' : ''}>${I('plus', 'i--sm')}Recave</button>` : ''}
          </div>
          <div class="pkt__felt">
            <div class="pkt__oval"></div>
            <div class="pkt__center">
              <div class="pkt__board">${board.map((c) => (c === 'x' ? '<span class="pkc slot"></span>' : cardHtml(c, 'board'))).join('')}</div>
              <div class="pkt__pot">${potLive > 0 || st.stage === 'done' ? `Pot <b class="num">${fmt(st.stage === 'done' && st.result ? st.result.pot : potLive)}</b>` : esc(STAGES[st.stage] || '')}</div>
              ${res ? `<div class="pkt__res">${res}</div>` : st.stage === 'idle' ? `<div class="pkt__res muted">${st.seats.length < 2 ? 'Les bots arrivent…' : 'La main commence…'}</div>` : ''}
            </div>
            ${st.seats.map(seatHtml).join('')}
          </div>
          <div class="pkt__me">
            <div class="pkt__hand">${strength ? `<span>${esc(strength)}</span>` : m && m.status === 'sitout' ? '<span>Plus de jetons : recave pour rejouer</span>' : m && m.status === 'waiting' ? '<span>Tu joues dès la prochaine main</span>' : ''}</div>
            <div class="pkt__act"></div>
          </div>
          <details class="pkt__log"><summary>Journal de la table</summary><ol>${st.log.slice().reverse().map((l) => `<li>${esc(l)}</li>`).join('')}</ol></details>`;
        el.querySelector('.js-leave').addEventListener('click', leave);
        const rb = el.querySelector('.js-rebuy');
        if (rb) rb.addEventListener('click', rebuy);
        paintActions();
        paintTimer();
      }

      function paintTimer() {
        const bar = box.querySelector('.pks__timer i');
        if (!bar || !st || !st.deadline) return;
        const who = st.seats.find((x) => x.seat === st.toAct);
        const left = Math.max(0, st.deadline - (Date.now() + offset));
        const total = who && !who.isBot ? 20000 : left;
        bar.style.transition = 'none';
        bar.style.transform = `scaleX(${Math.min(1, left / Math.max(total, left, 1))})`;
        requestAnimationFrame(() => { bar.style.transition = `transform ${left}ms linear`; bar.style.transform = 'scaleX(0)'; });
        if (myTurn() && !myTurnSeen) { myTurnSeen = true; sound.play('bet'); }
      }

      function paintActions() {
        const act = box.querySelector('.pkt__act');
        if (!act) return;
        const m = me();
        if (!myTurn() || !m) { act.innerHTML = st && st.mySeat != null && st.toAct != null && st.toAct !== st.mySeat && ['playing'].includes(m && m.status) ? '<span class="muted">À un autre joueur…</span>' : ''; return; }
        const toCall = Math.max(0, st.curBet - m.bet), maxTo = m.bet + m.stack;
        const minTo = Math.min(maxTo, st.curBet + st.minRaise);
        const potLive = st.pot + st.seats.reduce((a, x) => a + x.bet, 0);
        const canRaise = m.stack > toCall;
        raiseTo = Math.min(maxTo, Math.max(minTo, raiseTo || minTo));
        const preset = (f) => Math.min(maxTo, Math.max(minTo, Math.round(st.curBet + (potLive + toCall) * f)));
        act.innerHTML = `
          <button type="button" class="btn btn--ghost js-a" data-a="fold">Se coucher</button>
          <button type="button" class="btn btn--ghost js-a" data-a="${toCall ? 'call' : 'check'}">${toCall ? `Suivre <span class="num">${fmt(Math.min(toCall, m.stack))}</span>` : 'Parole'}</button>
          ${canRaise ? `<div class="pkt__raise">
            <div class="pkt__presets"><button type="button" data-v="${minTo}">Min</button><button type="button" data-v="${preset(0.5)}">½ pot</button><button type="button" data-v="${preset(1)}">Pot</button><button type="button" data-v="${maxTo}">Tapis</button></div>
            <input type="range" class="pk-range js-rr" min="${minTo}" max="${maxTo}" step="1" value="${raiseTo}">
            <button type="button" class="btn btn--primary js-a" data-a="raise">${st.curBet ? 'Relancer à' : 'Miser'} <span class="num js-rv">${fmt(raiseTo)}</span></button></div>` : ''}`;
        const rr = act.querySelector('.js-rr');
        const setR = (v) => { raiseTo = v; if (rr) rr.value = v; const lab = act.querySelector('.js-rv'); if (lab) lab.textContent = v >= maxTo ? `${fmt(v)} (tapis)` : fmt(v); };
        if (rr) { rr.addEventListener('input', () => setR(+rr.value)); setR(raiseTo); }
        act.querySelectorAll('.pkt__presets button').forEach((b) => b.addEventListener('click', () => { sound.play('click'); setR(+b.dataset.v); }));
        act.querySelectorAll('.js-a').forEach((b) => b.addEventListener('click', () => send(b.dataset.a)));
      }

      async function send(a) {
        if (!myTurn()) return;
        box.querySelectorAll('.pkt__act button, .pkt__act input').forEach((b) => (b.disabled = true));
        const m = me();
        const isAll = a === 'raise' && raiseTo >= m.bet + m.stack;
        sound.play(a === 'fold' ? 'cardFlip' : a === 'check' ? 'click' : 'chip');
        const s = await rpc('poker_act', { p_table: tableId, p_action: isAll ? 'allin' : a, p_amount: a === 'raise' ? raiseTo : null });
        raiseTo = 0;
        if (s && alive) apply(s); else paintActions();
      }

      async function leave() {
        if (st && st.mySeat != null) {
          const m = me();
          // en pleine main : un 2e clic dans les 4 s pour confirmer (le bouton est redessiné à chaque action)
          if (m && m.status === 'playing' && !['idle', 'done'].includes(st.stage) && !(leaveArmed && Date.now() - leaveArmed < 4000)) {
            leaveArmed = Date.now(); sound.play('click'); paint();
            setTimeout(() => { if (alive && leaveArmed && Date.now() - leaveArmed >= 4000) { leaveArmed = 0; paint(); } }, 4100);
            return;
          }
          leaveArmed = 0;
          const r = await rpc('poker_leave', { p_table: tableId });
          if (!r) return;
          sound.play('coin');
          ui.toast('Tes jetons sont revenus sur ton solde.', 'win');
        }
        tableId = null; st = null;
        lobby();
      }

      function rebuy() {
        const m = me();
        if (!m) return;
        const mx = Math.min(st.max - m.stack, Math.floor(DP.wallet.get()));
        if (mx < 1) { ui.toast(m.stack >= st.max ? 'Tu as déjà le maximum de la table.' : 'Pas assez de DaveCoins.', 'error'); return; }
        let v = mx;
        const modal = ui.el(`<div class="modal" role="dialog" aria-modal="true"><div class="modal__card pk-sit">
          <button class="modal__close icon-btn" type="button" aria-label="Fermer">${I('x')}</button>
          <h3>${I('plus')}Recave</h3><p>Ajoute des jetons à ton tapis (maximum ${fmt(st.max)} sur cette table).</p>
          <div class="pk-sit__amt num js-v">${fmt(v)}</div>
          <input type="range" min="1" max="${mx}" step="1" value="${v}" class="pk-range js-r">
          <button type="button" class="btn btn--primary btn--block js-go">Ajouter</button></div></div>`);
        document.body.appendChild(modal);
        const r = modal.querySelector('.js-r');
        r.addEventListener('input', () => { v = +r.value; modal.querySelector('.js-v').textContent = fmt(v); });
        modal.addEventListener('click', async (e) => {
          if (e.target === modal || e.target.closest('.modal__close')) { modal.remove(); return; }
          if (!e.target.closest('.js-go')) return;
          const res = await rpc('poker_rebuy', { p_table: tableId, p_amount: v });
          if (!res) return;
          modal.remove(); sound.play('chip');
          apply(res.state);
        });
      }

      const onKey = (e) => {
        if (!myTurn() || /input|textarea|select/i.test(document.activeElement.tagName)) return;
        if (e.key === 'f') send('fold');
        if (e.key === 'c') { const m = me(); send(st.curBet > m.bet ? 'call' : 'check'); }
      };
      window.addEventListener('keydown', onKey);
      lobby();
      return () => { alive = false; stopTable(); window.removeEventListener('keydown', onKey); };
    }
  });
})();
