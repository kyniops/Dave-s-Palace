// Poulet de Stake - Réplique simple (UI et mécaniques principales)
document.addEventListener('DOMContentLoaded', function () {
  const betInput = document.getElementById('bet-input');
  const halfBtn = document.querySelector('.quick-btn[data-action="half"]');
  const doubleBtn = document.querySelector('.quick-btn[data-action="double"]');
  const goBtn = document.getElementById('go-button');
  const cashoutBtn = document.getElementById('cashout-button');
  const difficultySelect = document.getElementById('difficulty-select');
  const columnsEl = document.getElementById('columns');
  const multsEl = document.getElementById('multipliers');
  const chickenEl = document.getElementById('chicken');
  const multiplierEl = document.getElementById('multiplier');
  const profitEl = document.getElementById('profit');

  const NUM_COLS = 10;
  const NUM_ROWS = 1;
  const BASE_MULTS = [1.03, 1.09, 1.15, 1.23, 1.31, 1.42, 1.55, 1.72, 1.93, 2.18];

  let traps = [];           // Array of booleans (per column) indicating trap on the single route
  let currentCol = -1;      // -1 before starting
  let currentRow = 0;       // Single row (index 0)
  let active = false;
  let betAmount = 0;
  let currentMult = 1.0;

  function updateHeader() {
    if (window.Davecoin) {
      window.Davecoin.ensureInitialized();
      window.Davecoin.updateHeader();
    }
  }

  function buildBoard() {
    columnsEl.innerHTML = '';
    columnsEl.style.gridTemplateColumns = `repeat(${NUM_COLS}, 1fr)`;
    columnsEl.style.gridTemplateRows = `repeat(${NUM_ROWS}, 1fr)`;
    for (let c = 0; c < NUM_COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.col = String(c);
      cell.dataset.row = '0';
      const label = document.createElement('div');
      label.className = 'mult-label';
      label.textContent = `${BASE_MULTS[c].toFixed(2)}x`;
      cell.appendChild(label);
      columnsEl.appendChild(cell);
    }
    multsEl.innerHTML = '';
    for (let i = 0; i < NUM_COLS; i++) {
      const m = document.createElement('div');
      m.className = 'mult';
      m.textContent = `${BASE_MULTS[i].toFixed(2)}x`;
      multsEl.appendChild(m);
    }
  }

  function genTraps() {
    const diff = difficultySelect.value;
    const trapChance = diff === 'easy' ? 0.2 : (diff === 'medium' ? 0.35 : 0.5);
    traps = [];
    for (let c = 0; c < NUM_COLS; c++) {
      traps.push(Math.random() < trapChance);
    }
  }

  function setStatus(text) {
    const existing = document.querySelector('.status-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'status-toast';
    toast.textContent = text;
    document.getElementById('board').appendChild(toast);
    setTimeout(() => toast.remove(), 1500);
  }

  function validateBet() {
    const v = parseInt(betInput.value || '0', 10) || 0;
    const balance = window.Davecoin ? window.Davecoin.get() : 0;
    const ok = v >= 1 && v <= balance;
    betAmount = ok ? v : 0;
    goBtn.disabled = !ok || active;
    return ok;
  }

  function placeChicken() {
    chickenEl.classList.add('move');
    currentCol = -1;
    currentRow = 0;
    multiplierEl.textContent = '1.00×';
    profitEl.textContent = '0.00';
    const cellRect = columnsEl.children[(currentRow) + (0) * NUM_ROWS]?.getBoundingClientRect();
    // Start at left edge
    chickenEl.style.left = '12px';
    const trackRect = document.getElementById('track').getBoundingClientRect();
    const rowHeight = trackRect.height / NUM_ROWS;
    const topPx = 12 + currentRow * rowHeight + rowHeight / 2 - 36;
    chickenEl.style.top = `${topPx}px`;
  }

  function debitBet() {
    if (window.Davecoin) {
      window.Davecoin.add(-betAmount);
      updateHeader();
    }
  }

  function endLose() {
    active = false;
    goBtn.disabled = !validateBet();
    cashoutBtn.disabled = true;
    setStatus('Lose');
  }

  function updateProfit() {
    const p = betAmount * (currentMult - 1);
    profitEl.textContent = p.toFixed(2);
    multiplierEl.textContent = `${currentMult.toFixed(2)}×`;
  }

  function cashout() {
    if (!active) return;
    const winAmount = Math.floor(betAmount * currentMult);
    if (window.Davecoin) {
      window.Davecoin.add(winAmount);
      updateHeader();
    }
    setStatus(`Cashout ${winAmount}`);
    active = false;
    cashoutBtn.disabled = true;
    goBtn.disabled = !validateBet();
  }

  function moveChickenTo(c, r) {
    const trackRect = document.getElementById('track').getBoundingClientRect();
    const colWidth = trackRect.width / NUM_COLS;
    const rowHeight = trackRect.height / NUM_ROWS;
    const leftPx = 12 + c * colWidth + colWidth / 2 - 36;
    const topPx = 12 + r * rowHeight + rowHeight / 2 - 36;
    chickenEl.style.left = `${leftPx}px`;
    chickenEl.style.top = `${topPx}px`;
  }

  function onCellClick(e) {
    if (!active) return;
    const cell = e.currentTarget;
    const col = parseInt(cell.dataset.col, 10);
    const row = 0;
    if (col !== currentCol + 1) return; // Only next column selectable

    const isTrap = traps[col] === true;
    if (isTrap) {
      cell.classList.add('trap');
      moveChickenTo(col, row);
      endLose();
      return;
    }
    // Advance
    currentCol = col;
    currentRow = row;
    moveChickenTo(col, row);
    currentMult = BASE_MULTS[currentCol];
    updateProfit();
    cashoutBtn.disabled = false;
    if (currentCol === NUM_COLS - 1) {
      cashout();
    }
  }

  function attachCellEvents() {
    const cells = columnsEl.querySelectorAll('.cell');
    cells.forEach(cell => cell.addEventListener('click', onCellClick));
  }

  function startGame() {
    if (!validateBet()) { setStatus('Mise invalide'); return; }
    active = true;
    cashoutBtn.disabled = true;
    goBtn.disabled = true;
    genTraps();
    placeChicken();
    debitBet();
    setStatus('Go!');
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
  goBtn.addEventListener('click', startGame);
  cashoutBtn.addEventListener('click', cashout);

  updateHeader();
  buildBoard();
  attachCellEvents();
  validateBet();
});
