// Configuration de la roulette
const NUMBERS = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

// État du jeu
let gameState = {
    chipValue: 10,
    totalBet: 0,
    bets: {},
    betHistory: [],
    isSpinning: false,
    history: []
};

// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    initWheel();
    initEventListeners();
    updateDisplay();
});

// Dessiner la roue
function initWheel() {
    const canvas = document.getElementById('wheelCanvas');
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) / 2 - 10;
    
    const segmentAngle = (2 * Math.PI) / NUMBERS.length;
    
    NUMBERS.forEach((num, index) => {
        const startAngle = index * segmentAngle - Math.PI / 2;
        const endAngle = startAngle + segmentAngle;
        
        // Couleur du segment
        let color;
        if (num === 0) color = '#00e701';
        else if (RED_NUMBERS.includes(num)) color = '#ef4444';
        else color = '#2f4553';
        
        // Dessiner le segment
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        
        // Bordure
        ctx.strokeStyle = '#1a2c38';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Numéro
        const textAngle = startAngle + segmentAngle / 2;
        const textRadius = radius - 25;
        const textX = centerX + textRadius * Math.cos(textAngle);
        const textY = centerY + textRadius * Math.sin(textAngle);
        
        ctx.save();
        ctx.translate(textX, textY);
        ctx.rotate(textAngle + Math.PI / 2);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(num, 0, 0);
        ctx.restore();
    });
    
    // Cercle central
    ctx.beginPath();
    ctx.arc(centerX, centerY, 40, 0, 2 * Math.PI);
    ctx.fillStyle = '#1a2c38';
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Bras centraux (style "pales" jaunes)
    const spokeColor = '#f59e0b';
    const spokeLength = 55;
    const spokeWidth = 6;
    for (let i = 0; i < 3; i++) {
        const angle = (i * 2 * Math.PI) / 3;
        const x1 = centerX + Math.cos(angle) * 12;
        const y1 = centerY + Math.sin(angle) * 12;
        const x2 = centerX + Math.cos(angle) * spokeLength;
        const y2 = centerY + Math.sin(angle) * spokeLength;
        
        ctx.save();
        ctx.strokeStyle = spokeColor;
        ctx.lineWidth = spokeWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
    }
}

// Événements
function initEventListeners() {
    // Sélection de chip
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', function() {
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            gameState.chipValue = parseInt(this.dataset.value);
        });
    });
    
    // Paris sur la table
    document.querySelectorAll('.bet-cell').forEach(cell => {
        cell.addEventListener('click', function() {
            if (gameState.isSpinning) return;
            placeBet(this.dataset.bet, this.dataset.type, this);
        });
    });
    
    // Actions rapides
    document.querySelector('[data-action="half"]').addEventListener('click', halfBet);
    document.querySelector('[data-action="double"]').addEventListener('click', doubleBet);
    
    // Boutons
    document.getElementById('spinBtn').addEventListener('click', spin);
    document.getElementById('undoBtn').addEventListener('click', undoBet);
    document.getElementById('clearBtn').addEventListener('click', clearBets);
    
    // Pari rapide Rouge/Noir
    const redCell = document.querySelector('.bet-cell.outside.red[data-bet="red"]');
    const blackCell = document.querySelector('.bet-cell.outside.black[data-bet="black"]');
    
    // Les boutons de pari rapide dans le panneau gauche ont été retirés
    
    // Boutons bas de page Rouge/Noir
    const bottomRedBtn = document.getElementById('bottomRed');
    const bottomBlackBtn = document.getElementById('bottomBlack');
    if (bottomRedBtn && redCell) {
        bottomRedBtn.addEventListener('click', function() {
            if (gameState.isSpinning) return;
            placeBet('red', 'outside', redCell);
        });
    }
    if (bottomBlackBtn && blackCell) {
        bottomBlackBtn.addEventListener('click', function() {
            if (gameState.isSpinning) return;
            placeBet('black', 'outside', blackCell);
        });
    }
}

// Placer un pari
function placeBet(betId, betType, element) {
    const balance = window.Davecoin.get();
    
    if (balance < gameState.chipValue) {
        alert('Insufficient Davecoins!');
        return;
    }
    
    if (!gameState.bets[betId]) {
        gameState.bets[betId] = {
            amount: 0,
            type: betType,
            element: element
        };
    }
    
    console.log(`Bet placed: ${betId} (${betType}) - Amount: ${gameState.chipValue}`);

    gameState.bets[betId].amount += gameState.chipValue;
    gameState.totalBet += gameState.chipValue;
    gameState.betHistory.push({betId, amount: gameState.chipValue});
    
    window.Davecoin.add(-gameState.chipValue);
    updateBetDisplay(betId, element);
    updateDisplay();
}

// Afficher les jetons sur la table
function updateBetDisplay(betId, element) {
    let chipEl = element.querySelector('.bet-chip');
    if (!chipEl) {
        chipEl = document.createElement('div');
        chipEl.className = 'bet-chip';
        element.appendChild(chipEl);
    }
    chipEl.textContent = gameState.bets[betId].amount;
}

// Annuler le dernier pari
function undoBet() {
    if (gameState.isSpinning || gameState.betHistory.length === 0) return;
    
    const lastBet = gameState.betHistory.pop();
    const bet = gameState.bets[lastBet.betId];
    
    bet.amount -= lastBet.amount;
    gameState.totalBet -= lastBet.amount;
    window.Davecoin.add(lastBet.amount);
    
    if (bet.amount <= 0) {
        const chipEl = bet.element.querySelector('.bet-chip');
        if (chipEl) chipEl.remove();
        delete gameState.bets[lastBet.betId];
    } else {
        updateBetDisplay(lastBet.betId, bet.element);
    }
    
    updateDisplay();
}

// Effacer tous les paris
function clearBets() {
    if (gameState.isSpinning) return;
    
    window.Davecoin.add(gameState.totalBet);
    
    document.querySelectorAll('.bet-chip').forEach(chip => chip.remove());
    
    gameState.bets = {};
    gameState.betHistory = [];
    gameState.totalBet = 0;
    
    updateDisplay();
}

// Diviser par 2
function halfBet() {
    if (gameState.isSpinning || gameState.totalBet === 0) return;
    
    const halfAmount = Math.floor(gameState.totalBet / 2);
    window.Davecoin.add(halfAmount);
    
    Object.keys(gameState.bets).forEach(betId => {
        const bet = gameState.bets[betId];
        bet.amount = Math.floor(bet.amount / 2);
        if (bet.amount > 0) {
            updateBetDisplay(betId, bet.element);
        } else {
            const chipEl = bet.element.querySelector('.bet-chip');
            if (chipEl) chipEl.remove();
            delete gameState.bets[betId];
        }
    });
    
    gameState.totalBet = Math.ceil(gameState.totalBet / 2);
    updateDisplay();
}

// Doubler
function doubleBet() {
    if (gameState.isSpinning || gameState.totalBet === 0) return;
    
    const balance = window.Davecoin.get();
    if (balance < gameState.totalBet) {
        alert('Insufficient Davecoins to double!');
        return;
    }
    
    window.Davecoin.add(-gameState.totalBet);
    
    Object.keys(gameState.bets).forEach(betId => {
        const bet = gameState.bets[betId];
        bet.amount *= 2;
        updateBetDisplay(betId, bet.element);
    });
    
    gameState.totalBet *= 2;
    updateDisplay();
}

// Lancer la roulette
function spin() {
    if (gameState.isSpinning || gameState.totalBet === 0) return;
    
    gameState.isSpinning = true;
    document.getElementById('spinBtn').disabled = true;
    
    // Animation de la bille
    const ball = document.getElementById('ball');
    const canvas = document.getElementById('wheelCanvas');
    const baseBallRadius = Math.min(canvas.width, canvas.height) / 2 - 40;
    const winningIndex = Math.floor(Math.random() * NUMBERS.length);
    const winningNumber = NUMBERS[winningIndex];
    
    // Calculer la cible angulaire (centre du segment gagnant)
    const segmentAngle = (2 * Math.PI) / NUMBERS.length;
    const targetAngle = (winningIndex * segmentAngle - Math.PI / 2) + (segmentAngle / 2);
    
    let rotation = 0;
    let speed = 30;
    const spinDuration = 4000;
    const startTime = Date.now();
    
    // Point de départ et d'arrivée (avec plusieurs tours)
    const startAngle = Math.random() * 2 * Math.PI;
    const totalSpins = 6;
    const endAngle = targetAngle + totalSpins * 2 * Math.PI;
    
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
    
    const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / spinDuration, 1);
        
        const eased = easeOutCubic(progress);
        const angle = startAngle + (endAngle - startAngle) * eased;
        const radius = Math.max(20, baseBallRadius - (progress * 20));
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        
        ball.style.transform = `translate(${x}px, ${y}px)`;
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            finishSpin(winningNumber);
        }
    };
    
    animate();
}

// Terminer le spin
function finishSpin(winningNumber) {
    // Afficher le résultat
    const resultDisplay = document.getElementById('resultDisplay');
    let color = 'green';
    if (RED_NUMBERS.includes(winningNumber)) color = 'red';
    else if (BLACK_NUMBERS.includes(winningNumber)) color = 'black';
    
    resultDisplay.textContent = winningNumber;
    resultDisplay.style.color = color === 'green' ? '#00e701' : (color === 'red' ? '#ef4444' : '#fff');
    resultDisplay.classList.add('show');
    
    // Calculer les gains
    let totalWin = 0;
    
    Object.keys(gameState.bets).forEach(betId => {
        const bet = gameState.bets[betId];
        const win = calculateWin(betId, bet.type, bet.amount, winningNumber);
        totalWin += win;
    });
    
    if (totalWin > 0) {
        window.Davecoin.add(totalWin);
        setTimeout(() => {
            alert(`You won ${totalWin} Davecoins!`);
        }, 500);
    }
    
    // Ajouter à l'historique
    gameState.history.unshift({number: winningNumber, color});
    if (gameState.history.length > 10) gameState.history.pop();
    updateHistory();
    
    // Nettoyer
    setTimeout(() => {
        resultDisplay.classList.remove('show');
        clearBets();
        gameState.isSpinning = false;
        document.getElementById('spinBtn').disabled = false;
    }, 2000);
}

// Calculer les gains
function calculateWin(betId, betType, amount, winningNumber) {
    switch (betType) {
        case 'straight':
            return parseInt(betId) === winningNumber ? amount * 36 : 0;
            
        case 'column':
            const colNum = parseInt(betId.replace('column', ''));
            // Column 1: 1, 4, 7... (n % 3 === 1)
            // Column 2: 2, 5, 8... (n % 3 === 2)
            // Column 3: 3, 6, 9... (n % 3 === 0)
            const remainder = winningNumber % 3;
            
            if (winningNumber !== 0) {
                if (colNum === 1 && remainder === 1) return amount * 3;
                if (colNum === 2 && remainder === 2) return amount * 3;
                if (colNum === 3 && remainder === 0) return amount * 3;
            }
            return 0;
            
        case 'dozen':
            const [start, end] = betId.split('-').map(Number);
            if (winningNumber >= start && winningNumber <= end) {
                return amount * 3;
            }
            return 0;
            
        case 'outside':
            if (betId === 'red' && RED_NUMBERS.includes(winningNumber)) return amount * 2;
            if (betId === 'black' && BLACK_NUMBERS.includes(winningNumber)) return amount * 2;
            if (betId === 'even' && winningNumber % 2 === 0 && winningNumber !== 0) return amount * 2;
            if (betId === 'odd' && winningNumber % 2 === 1) return amount * 2;
            if (betId === '1-18' && winningNumber >= 1 && winningNumber <= 18) return amount * 2;
            if (betId === '19-36' && winningNumber >= 19 && winningNumber <= 36) return amount * 2;
            return 0;
            
        default:
            return 0;
    }
}

// Mettre à jour l'affichage
function updateDisplay() {
    document.querySelector('.amount-value').textContent = gameState.totalBet.toFixed(2);
}

// Mettre à jour l'historique
function updateHistory() {
    const container = document.getElementById('historyContainer');
    container.innerHTML = '';
    
    gameState.history.forEach(item => {
        const div = document.createElement('div');
        div.className = `history-item ${item.color}`;
        div.textContent = item.number;
        container.appendChild(div);
    });
}
