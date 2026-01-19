document.addEventListener('DOMContentLoaded', function () {
  const betInput = document.getElementById('bet-input');
  const halfBtn = document.querySelector('.quick-btn[data-action="half"]');
  const doubleBtn = document.querySelector('.quick-btn[data-action="double"]');
  const spinBtn = document.getElementById('spin-button');
  const statusEl = document.getElementById('status');
  const slotMachine = document.getElementById('slot-machine');
  const reelsContainer = document.querySelector('.reels');
  const lever = document.getElementById('lever');
  const knob = lever ? lever.querySelector('.knob') : null;
  let scanBar = null;
  const reelEls = [
    document.getElementById('reel-1'),
    document.getElementById('reel-2'),
    document.getElementById('reel-3'),
  ];

  const symbolImages = [
    { key: 'davecoin', src: '../static/css/sections/assets/davecoin2.png', mult: 10 },
    { key: 'stack', src: '../static/css/sections/assets/axb.png', mult: 8 },
    { key: 'casino', src: '../static/css/sections/assets/casino.png', mult: 6 },
    { key: 'jpz', src: '../static/css/sections/assets/jpz.png', mult: 5 },
    { key: 'olman', src: '../static/css/sections/assets/olman.png', mult: 4 },
    { key: 'sauce', src: '../static/css/sections/assets/sauceblanche.png', mult: 3 },
    { key: 'tdam', src: '../static/css/sections/assets/tdam.png', mult: 2 },
    { key: 'slymefire', src: '../static/css/sections/assets/slymefire.png', mult: 2 },
    { key: 'sevare', src: '../static/css/sections/assets/sévaré.png', mult: 2 },
  ];

  let spinning = false;
  let betAmount = 10;
  let highlightBar = null;

  function updateHeader() {
    if (window.Davecoin) {
      window.Davecoin.ensureInitialized();
      window.Davecoin.updateHeader();
    }
  }

  function setStatus(text, type = '') {
    statusEl.textContent = text || '';
    statusEl.className = 'status' + (type ? ' ' + type : '');
  }

  function createSymbolEl(sym) {
    const d = document.createElement('div');
    d.className = 'symbol';
    const img = document.createElement('img');
    img.src = sym.src;
    img.alt = sym.key;
    d.appendChild(img);
    return d;
  }

  function populateReel(el, top3) {
    el.innerHTML = '';
    top3.forEach(s => el.appendChild(createSymbolEl(s)));
  }

  function randomSymbol() {
    return symbolImages[Math.floor(Math.random() * symbolImages.length)];
  }

  function initReels() {
    const initial = [randomSymbol(), randomSymbol(), randomSymbol()];
    populateReel(reelEls[0], initial);
    populateReel(reelEls[1], [randomSymbol(), randomSymbol(), randomSymbol()]);
    populateReel(reelEls[2], [randomSymbol(), randomSymbol(), randomSymbol()]);
    if (!reelsContainer.querySelector('.highlight-bar')) {
      highlightBar = document.createElement('div');
      highlightBar.className = 'highlight-bar';
      reelsContainer.appendChild(highlightBar);
    } else {
      highlightBar = reelsContainer.querySelector('.highlight-bar');
    }
    if (!reelsContainer.querySelector('.scan-bar')) {
      scanBar = document.createElement('div');
      scanBar.className = 'scan-bar';
      scanBar.style.setProperty('--scan-h', '6px');
      reelsContainer.appendChild(scanBar);
    } else {
      scanBar = reelsContainer.querySelector('.scan-bar');
    }
  }
  function startBarAnimOnce(duration = 800) {
    return new Promise((resolve) => {
      if (scanBar) {
        scanBar.style.setProperty('--sync-duration', duration + 'ms');
        scanBar.style.setProperty('--sync-iter', '1');
        scanBar.classList.add('animate');
      }
      if (lever && knob) {
        lever.classList.add('sync');
        knob.style.setProperty('--sync-duration', duration + 'ms');
        knob.style.setProperty('--sync-iter', '1');
        knob.classList.add('animate');
      }
      let ended = 0;
      const need = scanBar ? 1 : 0;
      function checkDone() {
        ended++;
        if (ended >= need) {
          if (scanBar) scanBar.classList.remove('animate');
          if (lever && knob) {
            knob.classList.remove('animate');
            lever.classList.remove('sync');
          }
          resolve();
        }
      }
      if (scanBar) scanBar.addEventListener('animationend', checkDone, { once: true });
      if (knob) knob.addEventListener('animationend', checkDone, { once: true });
      if (need === 0) resolve();
    });
  }

  function validateBet() {
    const v = parseInt(betInput.value || '0', 10) || 0;
    const balance = window.Davecoin ? window.Davecoin.get() : 0;
    const ok = v >= 1 && v <= balance;
    betAmount = ok ? v : 0;
    spinBtn.disabled = !ok || spinning;
    return ok;
  }

  function pullLever() {
    if (!lever) return;
    lever.classList.add('pull');
    setTimeout(() => lever.classList.remove('pull'), 500);
  }

  function spinReel(el, durationMs, finalTop3) {
    return new Promise(resolve => {
      const start = Date.now();
      let lastTick = 0;
      function tick() {
        const now = Date.now();
        const elapsed = now - start;
        if (elapsed - lastTick >= 80) {
          lastTick = elapsed;
          const a = randomSymbol();
          const b = randomSymbol();
          const c = randomSymbol();
          populateReel(el, [a, b, c]);
        }
        if (elapsed < durationMs) {
          requestAnimationFrame(tick);
        } else {
          populateReel(el, finalTop3);
          resolve();
        }
      }
      tick();
    });
  }

  function computeWin(midSyms) {
    const [s1, s2, s3] = midSyms;
    let winnings = 0;
    if (s1.key === s2.key && s2.key === s3.key) {
      const mult = s1.mult;
      winnings = betAmount * mult;
    } else if (s1.key === s2.key || s2.key === s3.key) {
      winnings = Math.floor(betAmount * 1);
    }
    return winnings;
  }

  async function doSpin() {
    if (spinning) return;
    if (!validateBet()) {
      setStatus('Mise invalide ou insuffisante', 'error');
      return;
    }
    spinning = true;
    spinBtn.disabled = true;
    setStatus('Spinning…');
    pullLever();
    await startBarAnimOnce(800);
    if (window.Davecoin) window.Davecoin.add(-betAmount);
    updateHeader();

    const finalSymbols = [randomSymbol(), randomSymbol(), randomSymbol()];
    const finalTop3Reel1 = [randomSymbol(), finalSymbols[0], randomSymbol()];
    const finalTop3Reel2 = [randomSymbol(), finalSymbols[1], randomSymbol()];
    const finalTop3Reel3 = [randomSymbol(), finalSymbols[2], randomSymbol()];

    const p1 = spinReel(reelEls[0], 1600, finalTop3Reel1);
    const p2 = spinReel(reelEls[1], 2000, finalTop3Reel2);
    const p3 = spinReel(reelEls[2], 2400, finalTop3Reel3);

    await p1;
    await p2;
    await p3;

    const mid = [finalTop3Reel1[1], finalTop3Reel2[1], finalTop3Reel3[1]];
    const win = computeWin(mid);
    if (win > 0 && window.Davecoin) {
      window.Davecoin.add(win);
      updateHeader();
      setStatus('Gagné ' + win + ' Davecoins!', 'success');
    } else {
      setStatus('Perdu…', 'lose');
    }
    spinning = false;
    spinBtn.disabled = !validateBet();
  }

  halfBtn.addEventListener('click', function () {
    const v = Math.max(1, Math.floor((parseInt(betInput.value || '0', 10) || 0) / 2));
    betInput.value = String(v);
    validateBet();
  });
  doubleBtn.addEventListener('click', function () {
    const v = Math.max(1, (parseInt(betInput.value || '0', 10) || 0) * 2);
    betInput.value = String(v);
    validateBet();
  });
  betInput.addEventListener('input', validateBet);
  spinBtn.addEventListener('click', doSpin);

  updateHeader();
  initReels();
  validateBet();
});
