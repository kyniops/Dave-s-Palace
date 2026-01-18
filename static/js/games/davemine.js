let gameActive = false;
let revealedTiles = 0;
let minePositions = [];
let currentBet = 0;
let currentMultiplier = 1.0;

// Initialiser le grid
function initGrid() {
    const grid = document.getElementById('gameGrid');
    grid.innerHTML = '';
    for (let i = 0; i < 25; i++) {
        const tile = document.createElement('div');
        tile.className = 'tile disabled';
        tile.dataset.index = i;
        tile.onclick = () => revealTile(i);
        grid.appendChild(tile);
    }
}

// Calculer les gemmes
function updateGems() {
    const mines = parseInt(document.getElementById('minesCount').value);
    const gems = 25 - mines;
    document.getElementById('gemsCount').textContent = gems;
}

// Mettre à jour le montant du pari
function updateBetDisplay() {
    const amount = parseFloat(document.getElementById('betAmount').value) || 0;
    document.getElementById('betUSD').textContent = '0,00 $US';
}

// Demi pari
function halfBet() {
    const input = document.getElementById('betAmount');
    const current = parseFloat(input.value) || 0;
    input.value = (current / 2).toFixed(8);
    updateBetDisplay();
}

// Doubler le pari
function doubleBet() {
    const input = document.getElementById('betAmount');
    const current = parseFloat(input.value) || 0;
    input.value = (current * 2).toFixed(8);
    updateBetDisplay();
}

// Calculer le multiplicateur
function calculateMultiplier(revealed, totalMines) {
    const totalGems = 25 - totalMines;
    if (revealed === 0) return 1.0;
    
    let multiplier = 1.0;
    for (let i = 0; i < revealed; i++) {
        const gemsLeft = totalGems - i;
        const tilesLeft = 25 - totalMines - i;
        multiplier *= (25 - i) / gemsLeft;
    }
    
    return multiplier * 0.97; // House edge
}

// Commencer le jeu
function startGame() {
    const betAmount = parseFloat(document.getElementById('betAmount').value) || 0;
    const balance = Davecoin.get();

    if (betAmount <= 0) {
        alert('Veuillez entrer un montant de pari valide');
        return;
    }

    if (betAmount > balance) {
        alert('Solde insuffisant');
        return;
    }

    // Déduire le pari
    Davecoin.add(-betAmount);
    currentBet = betAmount;
    
    // Initialiser le jeu
    gameActive = true;
    revealedTiles = 0;
    currentMultiplier = 1.0;
    
    // Générer les positions des mines
    const minesCount = parseInt(document.getElementById('minesCount').value);
    minePositions = [];
    while (minePositions.length < minesCount) {
        const pos = Math.floor(Math.random() * 25);
        if (!minePositions.includes(pos)) {
            minePositions.push(pos);
        }
    }

    // Activer les tuiles
    const tiles = document.querySelectorAll('.tile');
    tiles.forEach(tile => {
        tile.className = 'tile';
        tile.textContent = '';
    });

    // Changer le bouton
    const playBtn = document.getElementById('playBtn');
    playBtn.textContent = 'Encaisser';
    playBtn.className = 'play-btn cashout-btn';
    playBtn.onclick = cashout;

    updateProfit();
}

// Révéler une tuile
function revealTile(index) {
    if (!gameActive) return;
    
    const tile = document.querySelector(`[data-index="${index}"]`);
    if (tile.classList.contains('revealed')) return;

    tile.classList.add('revealed');

    if (minePositions.includes(index)) {
        // Mine trouvée
        tile.classList.add('mine');
        tile.textContent = '💣';
        gameOver(false);
    } else {
        // Gemme trouvée
        tile.classList.add('gem');
        tile.textContent = '💎';
        revealedTiles++;
        
        const minesCount = parseInt(document.getElementById('minesCount').value);
        currentMultiplier = calculateMultiplier(revealedTiles, minesCount);
        updateProfit();

        // Vérifier si toutes les gemmes sont révélées
        const totalGems = 25 - minesCount;
        if (revealedTiles === totalGems) {
            cashout();
        }
    }
}

// Encaisser
function cashout() {
    if (!gameActive) return;
    
    const profit = currentBet * currentMultiplier;
    Davecoin.add(profit);
    gameOver(true);
}

// Fin du jeu
function gameOver(won) {
    gameActive = false;
    
    // Révéler toutes les mines
    const tiles = document.querySelectorAll('.tile');
    tiles.forEach((tile, index) => {
        if (!tile.classList.contains('revealed')) {
            tile.classList.add('revealed', 'disabled');
            if (minePositions.includes(index)) {
                tile.classList.add('mine');
                tile.textContent = '💣';
            }
        }
    });

    // Réinitialiser le bouton
    setTimeout(() => {
        const playBtn = document.getElementById('playBtn');
        playBtn.textContent = 'Pari';
        playBtn.className = 'play-btn';
        playBtn.onclick = startGame;
        
        currentMultiplier = 1.0;
        currentBet = 0;
        updateProfit();
        
        setTimeout(initGrid, 2000);
    }, 1500);
}

// Sélection aléatoire
function selectRandom() {
    if (!gameActive) return;
    
    const tiles = document.querySelectorAll('.tile:not(.revealed)');
    if (tiles.length === 0) return;
    
    const randomTile = tiles[Math.floor(Math.random() * tiles.length)];
    const index = parseInt(randomTile.dataset.index);
    revealTile(index);
}

// Mettre à jour le profit
function updateProfit() {
    const profit = currentBet * (currentMultiplier - 1);
    document.getElementById('profitAmount').textContent = profit.toFixed(8);
    document.getElementById('multiplier').textContent = currentMultiplier.toFixed(2);
    document.getElementById('profitUSD').textContent = '0,00 $US';
}

// Événements
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('minesCount').addEventListener('change', updateGems);
    document.getElementById('betAmount').addEventListener('input', updateBetDisplay);

    // Initialisation
    initGrid();
    updateGems();
    updateBetDisplay();
    
    // Initialiser Davecoin
    if (window.Davecoin) {
        Davecoin.ensureInitialized();
        Davecoin.updateHeader();
    }
});