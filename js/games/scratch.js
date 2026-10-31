/* DaveTicket — ticket à gratter. 9 cases cachées sous une pellicule : 3 photos identiques = gain
 * (multiplicateur de la photo × prix du ticket). Le résultat est tiré à l'achat ; gratter ne fait que le révéler.
 * RTP 95 % : chances et gains identiques côté serveur (supabase/scratch.sql, fonction scratch_buy).
 */
(function () {
  'use strict';
  const { IMG, rng, fmt, fmtMult, wallet, settle, sound, ui, round2, sleep } = DP;

  // du moins cher au plus cher ; P = chance de gagner avec cette photo
  const SYMS = [
    { id: 'carl', name: 'Carl', img: 'carl.jpg', x: 1, p: 0.1 },
    { id: 'tdam', name: 'Tdam', img: 'tdam.png', x: 2, p: 0.095 },
    { id: 'yohan', name: 'Yohan', img: 'yohan.jpg', x: 3, p: 0.06 },
    { id: 'billy', name: 'Billy', img: 'billy.jpg', x: 5, p: 0.03 },
    { id: 'mathis', name: 'Mathis', img: 'mathis.jpg', x: 10, p: 0.012 },
    { id: 'tonyargent', name: 'Tony Billets', img: 'tonyargent.jpg', x: 25, p: 0.004 },
    { id: 'eltigre', name: 'El Tigre', img: 'eltigre.jpg', x: 100, p: 0.0006 },
    { id: 'forton', name: 'Absolute Forton', img: 'forton.jpg', x: 1000, p: 0.00005 }
  ];
  const TICKETS = [
    { price: 5, label: 'Bronze', cls: 'bronze' },
    { price: 25, label: 'Argent', cls: 'silver' },
    { price: 100, label: 'Or', cls: 'gold' },
    { price: 500, label: 'Royal', cls: 'royal' }
  ];
  const xm = (x) => '×' + x;
  const CLEAR = 0.5; // part grattée d'une case pour la découvrir entièrement

  /** Tirage local (hors ligne), même règle que le serveur. */
  function draw() {
    let r = rng.float(), win = -1;
    for (let i = 0; i < SYMS.length; i++) { if (r < SYMS[i].p) { win = i; break; } r -= SYMS[i].p; }
    const grid = win >= 0 ? [win, win, win] : [];
    const cnt = SYMS.map((_, i) => (i === win ? 3 : 0));
    while (grid.length < 9) { const s = rng.int(0, SYMS.length - 1); if (cnt[s] < 2) { grid.push(s); cnt[s]++; } }
    for (let i = grid.length - 1; i > 0; i--) { const j = rng.int(0, i); [grid[i], grid[j]] = [grid[j], grid[i]]; }
    return { grid, win };
  }

  DP.games.register({
    id: 'scratch',
    name: 'DaveTicket',
    icon: 'ticket',
    tagline: 'Gratte, trouve 3 photos identiques',
    rtp: '95 %',
    hue: 140,
    art: `<div class="art-ticket"><div class="art-ticket__t"><b>DAVE TICKET</b><span><img src="${IMG}forton.jpg" alt=""><img src="${IMG}eltigre.jpg" alt=""><i></i></span><em>×1000</em></div></div>`,
    rules: `<p>Achète un ticket, puis gratte les 9 cases avec la souris ou le doigt.</p>
      <ul><li><strong>3 photos identiques</strong> = tu gagnes le prix du ticket × le multiplicateur de la photo.</li>
      <li>Un ticket contient au plus un trio gagnant.</li>
      <li>${SYMS.slice().reverse().map((s) => `${s.name} <strong>${xm(s.x)}</strong>`).join(' · ')}</li>
      <li>Environ 1 ticket sur 3 est gagnant. Le résultat est décidé à l’achat : gratter ne change rien, c’est pour le plaisir.</li></ul>`,
    mount(root) {
      const { panel, stage } = ui.layout(root);
      let tier = TICKETS[0];
      const tierSeg = ui.segmented(panel, {
        label: 'Ticket', value: tier.price,
        options: TICKETS.map((t) => ({ value: t.price, label: t.label })),
        onChange(v) { tier = TICKETS.find((t) => t.price === v); fresh(); paint(); }
      });
      const priceOut = ui.readout(panel, 'Prix du ticket', '');
      const maxOut = ui.readout(panel, 'Gain max', '');
      const buyBtn = ui.button(panel, 'Acheter un ticket');
      const allBtn = ui.button(panel, ui.icon('sparkles', 'i--sm') + 'Tout gratter', 'btn btn--ghost btn--block');
      const lastOut = ui.readout(panel, 'Dernier gain', '—');

      stage.innerHTML = `<div class="tk-wrap"><div class="tk">
          <header class="tk__head"><span class="tk__brand">Dave’s Palace</span><b class="tk__title">Ticket à gratter</b><span class="tk__price num"></span></header>
          <p class="tk__rule">Trouve <b>3 photos identiques</b> et gagne leur multiplicateur</p>
          <div class="tk__zone"><div class="tk__grid"></div><canvas class="tk__foil"></canvas><div class="tk__hint">Achète un ticket pour gratter</div></div>
          <div class="tk__pay">${SYMS.slice().reverse().map((s) => `<span><img src="${IMG}${s.img}" alt="">${xm(s.x)}</span>`).join('')}</div>
        </div></div>`;
      const tk = stage.querySelector('.tk');
      const gridEl = stage.querySelector('.tk__grid');
      const zone = stage.querySelector('.tk__zone');
      const cv = stage.querySelector('.tk__foil');
      const hint = stage.querySelector('.tk__hint');
      const g = cv.getContext('2d', { willReadFrequently: true });

      let alive = true, busy = false, cur = null; // cur = { grid, win, cost, pay, srv, open:Set, done }
      let drawing = false, last = null, lastTick = 0;

      const cellsHtml = (grid) => grid.map((k, i) => {
        const s = SYMS[k];
        return `<div class="tk__cell" data-i="${i}"><img src="${IMG}${s.img}" alt="${s.name}" draggable="false"><span class="num">${xm(s.x)}</span></div>`;
      }).join('');

      /** Pellicule argentée (ou dorée) par-dessus toute la grille. */
      function foil() {
        const r = zone.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
        const W = cv.width, H = cv.height;
        g.globalCompositeOperation = 'source-over';
        const lg = g.createLinearGradient(0, 0, W, H);
        const pal = { bronze: ['#8a5a32', '#d79a63', '#7a4a26'], silver: ['#9aa3b2', '#e9edf3', '#8a93a3'], gold: ['#b8862b', '#ffe08a', '#a8761b'], royal: ['#6d3bd1', '#d9b8ff', '#5a2bb8'] }[tier.cls];
        lg.addColorStop(0, pal[0]); lg.addColorStop(0.5, pal[1]); lg.addColorStop(1, pal[2]);
        g.fillStyle = lg; g.fillRect(0, 0, W, H);
        // grain + motif
        for (let i = 0; i < (W * H) / 900; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; g.fillRect(Math.random() * W, Math.random() * H, 2 * dpr, 2 * dpr); }
        g.save(); g.translate(W / 2, H / 2); g.rotate(-0.35);
        g.font = `800 ${Math.round(14 * dpr)}px system-ui, sans-serif`; g.fillStyle = 'rgba(0,0,0,.13)'; g.textAlign = 'center';
        for (let y = -H; y < H; y += 34 * dpr) for (let x = -W; x < W; x += 92 * dpr) g.fillText('DAVE', x + ((y / (34 * dpr)) % 2) * 46 * dpr, y);
        g.restore();
        // séparations des 9 cases
        g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2 * dpr;
        for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo((W * i) / 3, 0); g.lineTo((W * i) / 3, H); g.stroke(); g.beginPath(); g.moveTo(0, (H * i) / 3); g.lineTo(W, (H * i) / 3); g.stroke(); }
        g.fillStyle = 'rgba(0,0,0,.35)'; g.font = `700 ${Math.round(22 * dpr)}px system-ui, sans-serif`; g.textBaseline = 'middle';
        for (let i = 0; i < 9; i++) g.fillText('?', (W * ((i % 3) + 0.5)) / 3, (H * (Math.floor(i / 3) + 0.5)) / 3);
        cv.style.opacity = '1';
      }

      /** Ticket neuf (pas encore acheté) : cases factices sous la pellicule. */
      function fresh() {
        cur = null;
        tk.className = `tk tk--${tier.cls} is-idle`;
        gridEl.innerHTML = cellsHtml([0, 1, 2, 3, 4, 5, 6, 7, 0]);
        requestAnimationFrame(foil);
        hint.hidden = false;
      }

      function paint() {
        stage.querySelector('.tk__price').textContent = fmt(tier.price);
        priceOut.set(`<span class="num">${fmt(tier.price)}</span>`);
        maxOut.set(`<span class="num">${fmt(tier.price * SYMS[SYMS.length - 1].x)}</span>`);
        const playing = !!(cur && !cur.done);
        buyBtn.disabled = busy || playing;
        buyBtn.textContent = cur && cur.done ? 'Acheter un autre ticket' : 'Acheter un ticket';
        allBtn.disabled = !playing || busy;
        tierSeg.disable(busy || playing);
      }

      async function buy() {
        if (busy || (cur && !cur.done)) return;
        const price = tier.price;
        const E = DP.engine;
        let srv = null;
        busy = true; paint();
        if (E && E.on) {
          srv = await E.call('scratch_buy', { p_price: price }, { defer: true });
          if (!srv || !alive) { busy = false; paint(); return; }
          E.debitView(price);
        } else if (!wallet.place(price)) { busy = false; paint(); return; }
        const d = srv ? { grid: srv.grid, win: srv.win } : draw();
        const pay = srv ? +srv.payout : d.win >= 0 ? round2(price * SYMS[d.win].x) : 0;
        cur = { ...d, cost: price, pay, srv: !!srv, open: new Set(), done: false };
        sound.play('card');
        tk.className = `tk tk--${tier.cls}`;
        stage.querySelectorAll('.result-pop').forEach((n) => n.remove());
        gridEl.innerHTML = cellsHtml(d.grid);
        foil();
        hint.hidden = true;
        tk.animate([{ transform: 'translateY(14px) rotate(-1.5deg)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.2,1.3,.4,1)' });
        busy = false; paint();
      }

      /* ---------- Grattage ---------- */
      const pos = (e) => {
        const r = cv.getBoundingClientRect();
        return { x: ((e.clientX - r.left) / r.width) * cv.width, y: ((e.clientY - r.top) / r.height) * cv.height };
      };
      function scratchLine(a, b) {
        const dpr = cv.width / Math.max(1, cv.getBoundingClientRect().width);
        g.globalCompositeOperation = 'destination-out';
        g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 34 * dpr;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x + 0.01, b.y); g.stroke();
      }
      /** Part grattée de chaque case ; une case grattée à moitié se découvre entièrement. */
      function check() {
        if (!cur || cur.done) return;
        const W = cv.width, H = cv.height, cw = W / 3, ch = H / 3;
        for (let i = 0; i < 9; i++) {
          if (cur.open.has(i)) continue;
          const x = Math.floor((i % 3) * cw), y = Math.floor(Math.floor(i / 3) * ch);
          const data = g.getImageData(x, y, Math.floor(cw), Math.floor(ch)).data;
          let clear = 0, n = 0;
          for (let k = 3; k < data.length; k += 4 * 16) { n++; if (data[k] < 40) clear++; }
          if (clear / n >= CLEAR) reveal(i);
        }
        if (cur.open.size === 9) finish();
      }
      function reveal(i) {
        if (!cur || cur.open.has(i)) return;
        cur.open.add(i);
        const W = cv.width, H = cv.height;
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = '#000';
        g.fillRect(Math.floor(((i % 3) * W) / 3) - 1, Math.floor((Math.floor(i / 3) * H) / 3) - 1, Math.ceil(W / 3) + 2, Math.ceil(H / 3) + 2);
        const cell = gridEl.children[i];
        cell.classList.add('open');
        const k = cur.grid[i];
        // suspense : deux cases de la même photo déjà découvertes
        const same = [...cur.open].filter((j) => cur.grid[j] === k).length;
        if (same >= 2) { cell.classList.add('pair'); [...cur.open].filter((j) => cur.grid[j] === k).forEach((j) => gridEl.children[j].classList.add('pair')); }
        sound.play(same >= 2 ? 'scatter' : 'cardFlip', { i: same });
      }
      async function finish() {
        if (!cur || cur.done) return;
        cur.done = true;
        const c = cur;
        cv.style.opacity = '0';
        if (c.srv) DP.engine.reveal();
        settle('scratch', c.cost, c.pay, { silent: true });
        lastOut.set(c.pay > 0 ? `<span class="pos">+${fmt(c.pay)}</span>` : '0');
        if (c.win >= 0) {
          [...gridEl.children].forEach((el, i) => { el.classList.toggle('win', c.grid[i] === c.win); el.classList.toggle('dim', c.grid[i] !== c.win); });
          const x = SYMS[c.win].x;
          sound.play(x >= 10 ? 'jackpot' : 'win', { x });
          ui.result(stage, { win: true, mult: x, amount: c.pay });
          if (x >= 25) { ui.shake(stage, 2); ui.coinRain(stage, 30); }
        } else {
          [...gridEl.children].forEach((el) => el.classList.add('dim'));
          sound.play('lose');
          ui.result(stage, { win: false });
        }
        paint();
      }
      async function scratchAll() {
        if (!cur || cur.done || busy) return;
        busy = true; paint();
        const order = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => !cur.open.has(i));
        for (const i of order) { if (!alive || !cur) return; reveal(i); await sleep(110); }
        busy = false;
        check();
        paint();
      }

      cv.addEventListener('pointerdown', (e) => {
        if (!cur || cur.done || busy) return;
        drawing = true; last = pos(e);
        cv.setPointerCapture(e.pointerId);
        scratchLine(last, last);
      });
      cv.addEventListener('pointermove', (e) => {
        if (!drawing) return;
        const p = pos(e);
        scratchLine(last, p);
        last = p;
        const now = performance.now();
        if (now - lastTick > 70) { lastTick = now; sound.play('tick', { p: Math.random() }); check(); }
      });
      const up = () => { if (!drawing) return; drawing = false; check(); };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);

      buyBtn.addEventListener('click', buy);
      allBtn.addEventListener('click', scratchAll);
      const onKey = (e) => {
        if (e.code !== 'Space' || /input|select|textarea/i.test(document.activeElement.tagName)) return;
        e.preventDefault();
        if (cur && !cur.done) scratchAll(); else buy();
      };
      window.addEventListener('keydown', onKey);
      const onResize = () => { if (!cur) foil(); };
      window.addEventListener('resize', onResize);

      fresh();
      paint();

      return () => {
        alive = false;
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        // ticket acheté mais pas fini de gratter : on le règle quand même
        if (cur && !cur.done) {
          cur.done = true;
          if (cur.srv) DP.engine.reveal();
          settle('scratch', cur.cost, cur.pay, { silent: true });
        }
      };
    }
  });
})();
