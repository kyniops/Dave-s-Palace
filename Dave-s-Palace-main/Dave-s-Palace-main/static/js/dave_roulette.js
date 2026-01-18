// Dave Roulette Game
(function() {
    let currentBet = null;
    let betAmount = 100;
    let isSpinning = false;
    
    // Numéros de la roulette (ordre européen réel)
    const rouletteNumbers = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    const blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
    
    function getNumberColor(number) {
        if (number === 0) return 'green';
        return redNumbers.includes(number) ? 'red' : 'black';
    }
    
    function initializeWheel() {
        const wheelNumbers = document.querySelector('.wheel-numbers');
        const numbers = wheelNumbers.querySelectorAll('.number');
        
        numbers.forEach((numberEl, index) => {
            const angle = (index / numbers.length) * 360; // Commencer à droite (position 0)
            const radius = 170; // Rayon du cercle augmenté pour écarter vers l'extérieur
            const x = Math.cos((angle - 90) * Math.PI / 180) * radius; // -90 pour commencer en haut
            const y = Math.sin((angle - 90) * Math.PI / 180) * radius;
            
            // Positionner le numéro et l'orienter pour qu'il reste lisible
            numberEl.style.transform = `translate(${x}px, ${y}px) rotate(${-angle}deg)`;
        });
    }
    
    function placeBet(betType) {
        currentBet = betType;
        
        // Update active button
        document.querySelectorAll('.bet-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (betType) {
            const activeBtn = document.querySelector(`[data-bet="${betType}"]`);
            if (activeBtn) activeBtn.classList.add('active');
        }
    }
    
    function getBetMultiplier(betType, winningNumber) {
        const color = getNumberColor(winningNumber);
        
        switch(betType) {
            case 'red': return color === 'red' ? 2 : 0;
            case 'black': return color === 'black' ? 2 : 0;
            case 'even': return winningNumber !== 0 && winningNumber % 2 === 0 ? 2 : 0;
            case 'odd': return winningNumber !== 0 && winningNumber % 2 === 1 ? 2 : 0;
            case 'number': 
                const betNumber = parseInt(document.getElementById('numberBet').value);
                return betNumber === winningNumber ? 36 : 0;
            default: return 0;
        }
    }
    
    function spinRoulette() {
        if (isSpinning) return;
        
        const betAmount = parseInt(document.getElementById('betAmount').value);
        const numberBet = document.getElementById('numberBet').value;
        
        if (!currentBet && !numberBet) {
            alert('Veuillez choisir un type de pari ou entrer un numéro!');
            return;
        }
        
        if (betAmount > Davecoin.get()) {
            alert('Fonds insuffisants!');
            return;
        }
        
        isSpinning = true;
        const spinButton = document.getElementById('spinButton');
        spinButton.disabled = true;
        spinButton.textContent = '🎡 TOURNE...';
        
        // Déduire la mise
        Davecoin.add(-betAmount);
        
        // Animation de la roulette
        const wheelNumbers = document.querySelector('.wheel-numbers');
        const randomSpins = Math.floor(Math.random() * 5) + 5; // 5-10 tours complets
        const finalPosition = Math.floor(Math.random() * 37);
        
        // Calculer l'angle pour que le numéro gagnant soit en haut (à la position de la flèche)
        const anglePerNumber = 360 / 37;
        const targetAngle = finalPosition * anglePerNumber;
        const finalAngle = randomSpins * 360 - targetAngle; // Négatif pour tourner dans le sens horaire
        
        wheelNumbers.style.transform = `rotate(${finalAngle}deg)`;
        
        setTimeout(() => {
            const winningNumber = rouletteNumbers[finalPosition % 37];
            const winningColor = getNumberColor(winningNumber);
            
            // Calculer les gains
            let totalWin = 0;
            
            if (currentBet) {
                const multiplier = getBetMultiplier(currentBet, winningNumber);
                totalWin += betAmount * multiplier;
            }
            
            if (numberBet && parseInt(numberBet) === winningNumber) {
                totalWin += betAmount * 36;
            }
            
            // Ajouter les gains
            if (totalWin > 0) {
                Davecoin.add(totalWin);
            }
            
            // Afficher le résultat
            showResult(winningNumber, winningColor, totalWin, betAmount);
            
            // Réinitialiser
            isSpinning = false;
            spinButton.disabled = false;
            spinButton.textContent = '🎡 LANCER LA ROULETTE';
            placeBet(null);
            document.getElementById('numberBet').value = '';
            
        }, 4500);
    }
    
    function showResult(number, color, winAmount, betAmount) {
        const resultArea = document.getElementById('resultArea');
        const resultNumber = document.getElementById('resultNumber');
        const resultMessage = document.getElementById('resultMessage');
        
        resultNumber.textContent = number;
        resultNumber.className = `result-number ${color}`;
        
        if (winAmount > 0) {
            resultMessage.textContent = `🎉 Félicitations! Vous avez gagné ${winAmount} DaveCoins! 🎉`;
            resultMessage.style.color = '#27ae60';
        } else {
            resultMessage.textContent = `😢 Perdu! Vous avez perdu ${betAmount} DaveCoins. 😢`;
            resultMessage.style.color = '#e74c3c';
        }
        
        resultArea.classList.add('show');
        
        setTimeout(() => {
            resultArea.classList.remove('show');
        }, 5000);
    }
    
    // Initialisation
    document.addEventListener('DOMContentLoaded', function() {
        initializeWheel();
        
        // Event listeners
        document.querySelectorAll('.bet-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                placeBet(this.dataset.bet);
            });
        });
        
        document.getElementById('spinButton').addEventListener('click', spinRoulette);
        
        document.getElementById('betAmount').addEventListener('change', function() {
            betAmount = parseInt(this.value) || 100;
        });
        
        // S'assurer que le DaveCoin est initialisé
        Davecoin.ensureInitialized();
    });
    
})();