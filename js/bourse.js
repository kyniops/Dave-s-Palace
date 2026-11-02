/* DaveBourse — actions de la bande achetées en DaveCoins. Les prix bougent au hasard toutes les 30 s (calculés par le serveur),
 * des actus les font parfois bondir ou chuter. Les quantités du serveur sont « brutes » : quantité affichée = q ÷ f
 * (f change quand une action se regroupe ou se divise, la valeur ne bouge pas). Frais à l'achat et à la vente. Tout se passe sur le serveur (supabase/market.sql).
 */
(() => {
  'use strict';
  const { IMG, fmt, esc, ui, sound, wallet, store, auth, on, round2 } = DP;
  const I = ui.icon;

  const INFO = {
    DAVE: { logo: 'casino.png', kind: 'Action solide', tip: 'Bouge peu' },
    JPZ: { logo: 'jpz.png', kind: 'Grosse action', tip: 'Moyennement agitée' },
    TDAM: { logo: 'tdam.png', kind: 'Action tech', tip: 'Agitée, grosses tendances' },
    OLMAN: { logo: 'olman.png', kind: 'Crypto', tip: 'Très volatile' },
    SLYME: { logo: 'slymefire.png', kind: 'Memecoin', tip: 'Pump ou crash, imprévisible' }
  };
  const RANGES = [['1h', '1 h'], ['24h', '24 h'], ['7d', '7 j']];

  /** Prix lisible : 2 décimales au-dessus de 100, plus de précision pour les petits prix. */
  const pf = (p) => {
    p = +p || 0;
    if (p >= 100) return fmt(p);
    if (p >= 1) return p.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    return p.toLocaleString('fr-FR', { minimumSignificantDigits: 4, maximumSignificantDigits: 4 });
  };
  const qf = (q) => (+q || 0).toLocaleString('fr-FR', { maximumFractionDigits: q >= 100 ? 2 : 4 });
  const chg = (a, b) => (b ? (a / b - 1) * 100 : 0);
  const sgn = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
  const tone = (x) => (x > 0.0001 ? 'pos' : x < -0.0001 ? 'neg' : '');
  const ago = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : `il y a ${Math.round(m / 60)} h`; };
  const portfolio = () => (auth.current() && store.json('dp_prog_' + auth.current(), {}).mk) || {};

  /** Mini-courbe SVG. */
  function spark(pts, up) {
    if (!pts || pts.length < 2) return '';
    const mn = Math.min(...pts), mx = Math.max(...pts), w = 96, h = 30, r = mx - mn || 1;
    const d = pts.map((p, i) => `${(i / (pts.length - 1)) * w},${h - 2 - ((p - mn) / r) * (h - 4)}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${d}" fill="none" stroke="${up ? '#4ade80' : '#f87171'}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function render(view) {
    if (!(DP.engine && DP.engine.on)) {
      view.innerHTML = `<div class="page-head" data-reveal><span class="game-head__ico">${I('coins', 'i--lg')}</span><div><h1>DaveBourse</h1><p>La bourse fonctionne sur le site en ligne, avec un compte.</p></div></div>`;
      return () => {};
    }
    let alive = true, st = null, sel = store.get('dp_mk_sel', 'OLMAN'), range = store.get('dp_mk_range', '24h'), chart = [], busy = false, hover = null, newsSig = '';
    if (!INFO[sel]) sel = 'OLMAN';
    if (!RANGES.some(([k]) => k === range)) range = '24h';

    view.innerHTML = `
      <div class="page-head" data-reveal><span class="game-head__ico">${I('coins', 'i--lg')}</span>
        <div><h1>DaveBourse</h1><p>Achète des actions de la bande, revends au bon moment. Les prix bougent toutes les 30 secondes, des actus les font parfois exploser ou s’écrouler. <span class="js-feeinfo"></span></p></div></div>
      <div class="mk-news" data-reveal><span class="mk-news__lbl">${I('zap', 'i--sm')}Actus</span><div class="mk-news__win"><div class="mk-news__track js-news"></div></div></div>
      <div class="mk" data-reveal>
        <div class="mk-list js-list"></div>
        <section class="mk-main glass">
          <div class="mk-head js-head"></div>
          <div class="mk-chart"><canvas></canvas><div class="mk-tip" hidden></div><div class="seg mk-ranges js-ranges">${RANGES.map(([k, l]) => `<button type="button" data-r="${k}" class="${k === range ? 'on' : ''}">${l}</button>`).join('')}</div></div>
          <div class="mk-trade">
            <div class="mk-box">
              <div class="mk-box__h">${I('plus', 'i--sm')}Acheter</div>
              <div class="bet"><div class="bet__input">${ui.coin('coin--sm')}<input class="js-amt" type="number" inputmode="decimal" min="1" step="any"></div>
                <button type="button" data-q=".1">10 %</button><button type="button" data-q=".25">25 %</button><button type="button" data-q=".5">50 %</button><button type="button" data-q="1">Max</button></div>
              <p class="mk-prev js-prev"></p>
              <button class="btn btn--primary btn--block js-buy" type="button"></button>
            </div>
            <div class="mk-box">
              <div class="mk-box__h">${I('wallet', 'i--sm')}Ta position</div>
              <div class="js-pos"></div>
              <div class="mk-sell">${[[0.25, '25 %'], [0.5, '50 %'], [1, 'Tout']].map(([f, l]) => `<button class="btn btn--ghost js-sell" data-f="${f}" type="button">Vendre ${l}</button>`).join('')}</div>
            </div>
          </div>
        </section>
      </div>
      <section class="mk-port glass js-port" data-reveal></section>`;

    const $ = (s) => view.querySelector(s);
    const listEl = $('.js-list'), headEl = $('.js-head'), posEl = $('.js-pos'), portEl = $('.js-port'), newsEl = $('.js-news');
    const amtIn = $('.js-amt'), buyBtn = $('.js-buy'), prevEl = $('.js-prev');
    const cv = $('.mk-chart canvas'), tip = $('.mk-tip'), g = cv.getContext('2d');
    amtIn.value = Math.max(1, Math.min(500, Math.round(wallet.get() * 0.1)));

    const asset = (s = sel) => (st && st.assets.find((a) => a.sym === s)) || null;
    const fee = () => (st ? +st.fee : 0.01);

    /* ---------- Liste des actions ---------- */
    function paintList() {
      if (!st) { listEl.innerHTML = '<div class="empty">Chargement du marché…</div>'; return; }
      const pf_ = portfolio();
      listEl.innerHTML = st.assets.map((a) => {
        const c = chg(+a.p, +a.p24), inf = INFO[a.sym] || {}, own = pf_[a.sym];
        return `<button type="button" class="mk-row${a.sym === sel ? ' on' : ''}" data-s="${a.sym}">
          <img src="${IMG}${inf.logo}" alt="">
          <span class="mk-row__n"><b>$${a.sym}</b><small>${esc(inf.kind || a.name)}${own ? ' · <i>en portefeuille</i>' : ''}</small></span>
          <span class="mk-row__sp">${spark((a.spark || []).map(Number).concat(+a.p), c >= 0)}</span>
          <span class="mk-row__p"><b class="num">${pf(a.p)}</b><small class="num ${tone(c)}">${sgn(c)}</small></span>
        </button>`;
      }).join('');
    }
    listEl.addEventListener('click', (e) => {
      const b = e.target.closest('.mk-row');
      if (!b || b.dataset.s === sel) return;
      sound.play('click');
      sel = b.dataset.s; store.set('dp_mk_sel', sel);
      chart = []; paintAll(); loadChart();
    });

    /* ---------- En-tête de l'action choisie ---------- */
    function paintHead() {
      const a = asset();
      if (!a) { headEl.innerHTML = ''; return; }
      const inf = INFO[a.sym] || {};
      const first = chart.length ? +chart[0][1] : +a.p24, c = chg(+a.p, first);
      headEl.innerHTML = `<img src="${IMG}${inf.logo}" alt=""><div><h2>$${a.sym} <small>${esc(a.name)}</small></h2><span class="mk-tag">${esc(inf.kind || '')} · ${esc(inf.tip || '')}</span></div>
        <div class="mk-head__p"><b class="num">${pf(a.p)}</b><span class="num ${tone(c)}">${sgn(c)} <small>${RANGES.find(([k]) => k === range)[1]}</small></span></div>`;
    }

    /* ---------- Courbe ---------- */
    function drawChart() {
      const W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const a = asset();
      const pts = chart.map(([t, p]) => [+t, +p]);
      if (a && pts.length && pts[pts.length - 1][1] !== +a.p) pts.push([Date.now(), +a.p]);
      if (pts.length < 2) { g.fillStyle = '#7d8597'; g.font = '13px sans-serif'; g.fillText('Le marché vient d’ouvrir : la courbe se remplit toutes les 30 s.', 16, H / 2); return; }
      const ps = pts.map((x) => x[1]), mn = Math.min(...ps), mx = Math.max(...ps), pad = (mx - mn) * 0.12 || mx * 0.01 || 1;
      const lo = mn - pad, hi = mx + pad, L = 8, R = W - 64, T = 14, B = H - 22;
      const X = (i) => L + (i / (pts.length - 1)) * (R - L), Y = (p) => B - ((p - lo) / (hi - lo)) * (B - T);
      const up = ps[ps.length - 1] >= ps[0], col = up ? '#4ade80' : '#f87171';
      // grille + prix
      g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; g.fillStyle = '#7d8597'; g.font = '11px sans-serif'; g.textAlign = 'left';
      for (let k = 0; k <= 4; k++) { const p = lo + ((hi - lo) * k) / 4, y = Y(p); g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); g.fillText(pf(p), R + 8, y + 4); }
      // aire
      const grd = g.createLinearGradient(0, T, 0, B); grd.addColorStop(0, up ? 'rgba(74,222,128,.28)' : 'rgba(248,113,113,.28)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.beginPath(); pts.forEach(([, p], i) => (i ? g.lineTo(X(i), Y(p)) : g.moveTo(X(i), Y(p)))); g.lineTo(X(pts.length - 1), B); g.lineTo(X(0), B); g.closePath(); g.fillStyle = grd; g.fill();
      // ligne
      g.beginPath(); pts.forEach(([, p], i) => (i ? g.lineTo(X(i), Y(p)) : g.moveTo(X(i), Y(p)))); g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
      // prix d'achat moyen
      const own = portfolio()[sel];
      if (own && +own.q > 0) {
        const pa = ((+own.c * (1 - fee())) / +own.q) * (+a.f || 1);
        if (pa > lo && pa < hi) { g.setLineDash([4, 4]); g.strokeStyle = '#ffc145'; g.beginPath(); g.moveTo(L, Y(pa)); g.lineTo(R, Y(pa)); g.stroke(); g.setLineDash([]); g.fillStyle = '#ffc145'; g.fillText('ton achat', L + 4, Y(pa) - 5); }
      }
      // point courant
      const lx = X(pts.length - 1), ly = Y(ps[ps.length - 1]);
      g.beginPath(); g.arc(lx, ly, 4, 0, Math.PI * 2); g.fillStyle = col; g.fill();
      g.beginPath(); g.arc(lx, ly, 8 + 3 * Math.sin(Date.now() / 300), 0, Math.PI * 2); g.strokeStyle = col; g.globalAlpha = 0.35; g.stroke(); g.globalAlpha = 1;
      // survol
      if (hover != null) {
        const i = Math.max(0, Math.min(pts.length - 1, Math.round(((hover - L) / (R - L)) * (pts.length - 1))));
        const x = X(i), y = Y(pts[i][1]);
        g.strokeStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke();
        g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
        const d = new Date(pts[i][0]);
        tip.hidden = false;
        tip.innerHTML = `<b class="num">${pf(pts[i][1])}</b><span>${range === '7d' ? d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }) + ' ' : ''}${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>`;
        tip.style.left = Math.min(W - tip.offsetWidth - 4, Math.max(4, x - tip.offsetWidth / 2)) + 'px';
        tip.style.top = Math.max(4, y - 48) + 'px';
      } else tip.hidden = true;
    }
    let raf = 0;
    const loop = () => { if (!alive) return; drawChart(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    cv.addEventListener('pointermove', (e) => { hover = e.offsetX; });
    cv.addEventListener('pointerleave', () => { hover = null; });
    $('.js-ranges').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.r === range) return;
      sound.play('click');
      range = b.dataset.r; store.set('dp_mk_range', range);
      view.querySelectorAll('.js-ranges button').forEach((x) => x.classList.toggle('on', x === b));
      loadChart();
    });

    /* ---------- Achat ---------- */
    function paintBuy() {
      const a = asset(), v = round2(parseFloat(amtIn.value) || 0);
      buyBtn.disabled = busy || !a || v < 1 || v > wallet.get();
      buyBtn.innerHTML = `${I('plus', 'i--sm')}Acheter du $${sel}`;
      prevEl.innerHTML = a && v > 0 ? `≈ <b class="num">${qf((v * (1 - fee())) / +a.p)}</b> $${sel} · frais <span class="num">${fmt(v * fee())}</span>` : '&nbsp;';
    }
    amtIn.addEventListener('input', paintBuy);
    view.querySelector('.mk-box .bet').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-q]');
      if (!b) return;
      sound.play('click');
      const max = Math.min(wallet.get(), DP.MAX_BET || 5000);
      amtIn.value = Math.max(0, Math.floor(max * +b.dataset.q * 100) / 100);
      paintBuy();
    });
    buyBtn.addEventListener('click', async () => {
      const v = round2(parseFloat(amtIn.value) || 0);
      if (busy || v < 1) return;
      busy = true; paintBuy();
      const r = await DP.engine.call('market_buy', { p_sym: sel, p_amount: v });
      busy = false;
      if (r) {
        sound.play('bet');
        ui.floatText(buyBtn, `+${qf(r.q)} $${r.sym}`);
        ui.toast(`Achat : ${qf(r.q)} $${r.sym} à ${pf(r.price)}`, 'info');
      }
      paintAll(); refresh();
    });

    /* ---------- Position ---------- */
    function paintPos() {
      const a = asset(), own = portfolio()[sel], sells = view.querySelectorAll('.js-sell');
      if (!a || !own || !(+own.q > 0)) {
        posEl.innerHTML = `<p class="muted mk-empty">Tu n’as pas de $${sel}. Achète quand tu penses que ça va monter, revends plus cher.</p>`;
        sells.forEach((b) => (b.disabled = true));
        return;
      }
      const qd = +own.q / (+a.f || 1), val = qd * +a.p, net = val * (1 - fee()), pl = net - +own.c, plp = (pl / +own.c) * 100;
      const wait = Math.max(0, (+own.t + (st ? +st.hold : 60) * 1000 - Date.now()) / 1000);
      posEl.innerHTML = `<div class="mk-pos">
          <div><span>Quantité</span><b class="num">${qf(qd)} $${sel}</b></div>
          <div><span>Investi</span><b class="num">${fmt(own.c)}</b></div>
          <div><span>Si tu vends tout</span><b class="num">${fmt(net)}</b></div>
          <div><span>Gain / perte</span><b class="num ${tone(pl)}">${pl >= 0 ? '+' : '−'}${fmt(Math.abs(pl))} <small>(${sgn(plp, 1)})</small></b></div>
        </div>${wait > 0 ? `<p class="mk-wait">${I('timer', 'i--sm')}Revente possible dans <b class="num">${Math.ceil(wait)} s</b></p>` : ''}`;
      sells.forEach((b) => (b.disabled = busy || wait > 0));
    }
    view.querySelector('.mk-sell').addEventListener('click', async (e) => {
      const b = e.target.closest('.js-sell');
      if (!b || b.disabled || busy) return;
      busy = true; paintPos();
      const r = await DP.engine.call('market_sell', { p_sym: sel, p_frac: +b.dataset.f });
      busy = false;
      if (r) {
        const pl = round2(r.pay - r.cost);
        sound.play(pl > 0 ? 'win' : 'coin', { x: Math.max(1, r.pay / Math.max(1, r.cost)) });
        ui.floatText(b, (pl >= 0 ? '+' : '−') + fmt(Math.abs(pl)));
        if (pl > 0 && pl >= r.cost * 0.2) { ui.coinRain(view.querySelector('.mk-main'), Math.min(60, 15 + Math.round(pl / 50))); ui.burst(b, { n: 30, colors: ['#4ade80', '#ffc145', '#ffffff'] }); }
        ui.toast(`Vendu : +${fmt(r.pay)} DaveCoins (${pl >= 0 ? 'gain' : 'perte'} ${pl >= 0 ? '+' : '−'}${fmt(Math.abs(pl))})`, pl >= 0 ? 'win' : 'info');
      }
      paintAll(); refresh();
    });

    /* ---------- Portefeuille ---------- */
    function paintPort() {
      const own = portfolio(), keys = Object.keys(own).filter((k) => +own[k].q > 0);
      if (!st || !keys.length) { portEl.innerHTML = `<div class="mk-port__h"><h3>${I('wallet', 'i--sm')}Ton portefeuille</h3><span class="muted">Vide pour l’instant</span></div>`; return; }
      let inv = 0, net = 0;
      const rows = keys.map((k) => {
        const a = asset(k), o = own[k];
        const qd = a ? +o.q / (+a.f || 1) : 0, n = a ? qd * +a.p * (1 - fee()) : 0, pl = n - +o.c;
        inv += +o.c; net += n;
        return `<button type="button" class="mk-prow" data-s="${k}"><img src="${IMG}${(INFO[k] || {}).logo}" alt=""><b>$${k}</b><span class="num">${qf(qd)}</span><span class="num">${fmt(n)}</span><span class="num ${tone(pl)}">${pl >= 0 ? '+' : '−'}${fmt(Math.abs(pl))}</span></button>`;
      });
      const pl = net - inv;
      portEl.innerHTML = `<div class="mk-port__h"><h3>${I('wallet', 'i--sm')}Ton portefeuille</h3>
          <span>Valeur <b class="num">${fmt(net)}</b> · investi <b class="num">${fmt(inv)}</b> · <b class="num ${tone(pl)}">${pl >= 0 ? '+' : '−'}${fmt(Math.abs(pl))} (${sgn(inv ? (pl / inv) * 100 : 0, 1)})</b></span></div>
        <div class="mk-prow mk-prow--h"><span></span><span>Action</span><span>Quantité</span><span>Valeur nette</span><span>Gain / perte</span></div>${rows.join('')}`;
    }
    portEl.addEventListener('click', (e) => {
      const b = e.target.closest('.mk-prow[data-s]');
      if (!b || b.dataset.s === sel) return;
      sel = b.dataset.s; store.set('dp_mk_sel', sel); chart = []; paintAll(); loadChart();
      view.querySelector('.mk-main').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    /* ---------- Actus (bandeau à part, séparé des gagnants) ---------- */
    function paintNews() {
      const list = (st && st.news) || [];
      const sig = list.map((n) => n.t + n.sym).join();
      if (sig === newsSig) { newsEl.querySelectorAll('[data-t]').forEach((x) => { x.textContent = ago(+x.dataset.t); }); return; }
      newsSig = sig;
      if (!list.length) { newsEl.innerHTML = '<span class="mk-news__it muted">Pas encore d’actu : le marché est calme.</span>'; newsEl.classList.remove('run'); return; }
      const html = list.map((n) => `<span class="mk-news__it"><img src="${IMG}${(INFO[n.sym] || {}).logo}" alt=""><b>$${n.sym}</b>${esc(n.txt)}<em class="num ${tone(+n.pct)}">${sgn(+n.pct, 1)}</em><small data-t="${n.t}">${ago(+n.t)}</small></span>`).join('');
      newsEl.innerHTML = html + html;
      newsEl.style.animationDuration = Math.max(30, list.length * 7) + 's';
      newsEl.classList.add('run');
    }

    function paintAll() {
      if (!alive) return;
      $('.js-feeinfo').textContent = st ? `Frais de ${Math.round(fee() * 100)} % à l’achat et à la vente.` : '';
      paintList(); paintHead(); paintBuy(); paintPos(); paintPort(); paintNews();
    }

    /* ---------- Données ---------- */
    let lastNews = null;
    async function refresh() {
      const r = await DP.engine.call('market_state', {}, { silent: true });
      if (!alive || !r) return;
      const prev = st;
      st = r;
      // nouvelle actu pendant qu'on regarde : petit signal sur l'action concernée
      const top = st.news && st.news[0];
      if (prev && top && lastNews && top.t + top.sym !== lastNews) {
        sound.play(+top.pct >= 0 ? 'confirm' : 'error');
        ui.toast(`$${top.sym} : ${top.txt} (${sgn(+top.pct, 1)})`, +top.pct >= 0 ? 'win' : 'info', 4500);
      }
      lastNews = top ? top.t + top.sym : '';
      // le dernier point de la courbe suit le prix courant
      const a = asset();
      if (a && chart.length && +chart[chart.length - 1][0] < +st.t) chart.push([+st.t, +a.p]);
      paintAll();
    }
    async function loadChart() {
      const want = sel + range;
      const r = await DP.engine.call('market_chart', { p_sym: sel, p_range: range }, { silent: true });
      if (!alive || !r || sel + range !== want) return;
      chart = r;
      paintHead();
    }
    paintAll();
    refresh().then(loadChart);
    const tPoll = setInterval(refresh, 10000);
    const tChart = setInterval(loadChart, 60000);
    const tSec = setInterval(() => { if (alive) { paintPos(); paintNews(); } }, 1000);
    const offs = [on('balance', () => { paintBuy(); }), on('progress', () => { paintList(); paintPos(); paintPort(); })];

    return () => { alive = false; cancelAnimationFrame(raf); clearInterval(tPoll); clearInterval(tChart); clearInterval(tSec); offs.forEach((f) => f && f()); };
  }

  DP.bourse = { render };
})();
