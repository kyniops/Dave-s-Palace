// Dave Dice Game Logic
class DaveDiceGame {
    constructor() {
        this.davecoin = (window.Davecoin ? window.Davecoin.get() : 1000);
        this.currentBet = 0;
        this.selectedCase = null;
        this.isRolling = false;
        
        // Game cases with their images and names
        this.cases = [
            { id: 'axb', image: '../static/css/sections/assets/axb.png', name: 'AXB' },
            { id: 'olman', image: '../static/css/sections/assets/olman.png', name: 'OLMAN' },
            { id: 'sauceblanche', image: '../static/css/sections/assets/sauceblanche.png', name: 'SAUCE BLANCHE' },
            { id: 'sevare', image: '../static/css/sections/assets/sévaré.png', name: 'SÉVARÉ' },
            { id: 'slymefire', image: '../static/css/sections/assets/slymefire.png', name: 'SLYMEFIRE' },
            { id: 'tdam', image: '../static/css/sections/assets/tdam.png', name: 'TDAM' }
        ];
        
        this.betAmounts = [10, 10000, 25000, 100000, 200000];
        
        this.initializeGame();
    }
    
    initializeGame() {
        if (window.Davecoin) {
            window.Davecoin.ensureInitialized();
            window.Davecoin.updateHeader();
            this.davecoin = window.Davecoin.get();
        }
        this.createGameBoard();
        this.createBettingButtons();
        this.createDiceDisplay();
        this.updateDavecoinDisplay();
        this.setupEventListeners();
    }
    
    createGameBoard() {
        const gameBoard = document.createElement('div');
        gameBoard.className = 'game-board';
        
        this.cases.forEach(caseData => {
            const caseElement = document.createElement('div');
            caseElement.className = 'game-case';
            caseElement.dataset.caseId = caseData.id;
            
            caseElement.innerHTML = `
                <img class="case-image" src="${caseData.image}" alt="${caseData.name}">
                <p class="case-name">${caseData.name}</p>
            `;
            
            caseElement.addEventListener('click', () => this.selectCase(caseData.id));
            gameBoard.appendChild(caseElement);
        });
        
        document.querySelector('.dice-container').appendChild(gameBoard);
    }
    
    createBettingButtons() {
        const bettingSection = document.createElement('div');
        bettingSection.className = 'betting-section';
        
        this.betAmounts.forEach(amount => {
            const button = document.createElement('button');
            button.className = 'bet-button';
            button.textContent = `${amount.toLocaleString()}`;
            button.dataset.bet = amount;
            
            button.addEventListener('click', () => this.selectBet(amount));
            bettingSection.appendChild(button);
        });
        
        document.querySelector('.dice-container').appendChild(bettingSection);
    }
    
    createDiceDisplay() {
        const diceSection = document.createElement('div');
        diceSection.className = 'dice-section';
        
        const rollButton = document.createElement('button');
        rollButton.className = 'roll-button';
        rollButton.textContent = 'LANCER LES DÉS';
        rollButton.addEventListener('click', () => this.rollDice());
        
        const diceDisplay = document.createElement('div');
        diceDisplay.className = 'dice-display';
        
        // Create 3 dice
        for (let i = 0; i < 3; i++) {
            const die = document.createElement('div');
            die.className = 'dice';
            die.id = `dice-${i}`;
            // Afficher une image aléatoire au lieu du point d'interrogation
            const randomCase = this.cases[Math.floor(Math.random() * this.cases.length)];
            die.innerHTML = `<img src="${randomCase.image}" alt="${randomCase.name.charAt(0)}" style="width: 70px; height: 70px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2)); transition: all 0.3s ease;">`;
            diceDisplay.appendChild(die);
        }
        
        const resultDisplay = document.createElement('div');
        resultDisplay.className = 'result-display';
        resultDisplay.innerHTML = '<p class="result-text">Sélectionnez une case et une mise pour commencer</p>';
        
        diceSection.appendChild(rollButton);
        diceSection.appendChild(diceDisplay);
        diceSection.appendChild(resultDisplay);
        
        document.querySelector('.dice-container').appendChild(diceSection);
    }
    
    setupEventListeners() {
        // Additional setup if needed
    }
    
    selectCase(caseId) {
        // Remove previous selection
        document.querySelectorAll('.game-case').forEach(el => el.classList.remove('selected'));
        
        // Add selection to clicked case
        const selectedElement = document.querySelector(`[data-case-id="${caseId}"]`);
        selectedElement.classList.add('selected');
        
        this.selectedCase = caseId;
        this.updateRollButtonState();
        this.updateResultDisplay();
    }
    
    selectBet(amount) {
        // Remove previous bet selection
        document.querySelectorAll('.bet-button').forEach(el => el.classList.remove('active'));
        
        // Add selection to clicked bet
        const selectedButton = document.querySelector(`[data-bet="${amount}"]`);
        selectedButton.classList.add('active');
        
        this.currentBet = amount;
        this.updateRollButtonState();
        this.updateResultDisplay();
    }
    
    updateRollButtonState() {
        const rollButton = document.querySelector('.roll-button');
        const available = (window.Davecoin ? window.Davecoin.get() : this.davecoin);
        const canRoll = this.selectedCase && this.currentBet > 0 && available >= this.currentBet && !this.isRolling;
        
        rollButton.disabled = !canRoll;
        if (!canRoll) {
            if (this.isRolling) {
                rollButton.textContent = 'LANCEMENT...';
            } else if (this.selectedCase && this.currentBet > 0 && available < this.currentBet) {
                rollButton.textContent = 'DAVECOIN INSUFFISANT';
            } else {
                rollButton.textContent = 'LANCER LES DÉS';
            }
        } else {
            rollButton.textContent = 'LANCER LES DÉS';
        }
    }
    
    updateResultDisplay() {
        const resultDisplay = document.querySelector('.result-display');
        const available = (window.Davecoin ? window.Davecoin.get() : this.davecoin);
        if (this.selectedCase && this.currentBet > 0) {
            if (available < this.currentBet) {
                resultDisplay.innerHTML = '<p class="result-text lose">Davecoin insuffisant!</p>';
            } else {
                resultDisplay.innerHTML = `<p class="result-text">Mise: ${this.currentBet.toLocaleString()} Davecoin sur ${this.getCaseName(this.selectedCase)}</p>`;
            }
        }
    }
    
    getCaseName(caseId) {
        const caseData = this.cases.find(c => c.id === caseId);
        return caseData ? caseData.name : caseId;
    }
    
    updateDavecoinDisplay() {
        const davecoinElement = document.querySelector('.davecoin-amount');
        if (!davecoinElement) {
            // Create davecoin display if it doesn't exist
            const davecoinDisplay = document.createElement('div');
            davecoinDisplay.className = 'davecoin-display';
            davecoinDisplay.innerHTML = `
                <h2 class="davecoin-amount">${(window.Davecoin ? window.Davecoin.get() : this.davecoin).toLocaleString()}</h2>
                <p class="davecoin-label">Davecoin</p>
            `;
            document.querySelector('.dice-container').insertBefore(davecoinDisplay, document.querySelector('.dice-container').firstChild);
        } else {
            const val = (window.Davecoin ? window.Davecoin.get() : this.davecoin);
            davecoinElement.textContent = val.toLocaleString();
        }
    }
    
    async rollDice() {
        const available = (window.Davecoin ? window.Davecoin.get() : this.davecoin);
        if (!this.selectedCase || this.currentBet === 0 || available < this.currentBet || this.isRolling) {
            return;
        }
        
        this.isRolling = true;
        this.updateRollButtonState();
        
        // Deduct bet amount
        if (window.Davecoin) {
            window.Davecoin.add(-this.currentBet);
            this.davecoin = window.Davecoin.get();
            window.Davecoin.updateHeader();
        } else {
            this.davecoin -= this.currentBet;
        }
        this.updateDavecoinDisplay();
        
        // Rolling animation
        const diceElements = document.querySelectorAll('.dice');
        diceElements.forEach(die => {
            // Retirer les effets visuels précédents
            die.classList.remove('winning-dice');
            const img = die.querySelector('img');
            if (img) {
                // Retirer l'aura jaune/verte
                img.style.filter = 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))';
                img.style.transform = 'rotate(0deg) scale(1)';
            }
            
            die.classList.add('rolling');
            // Garder l'image existante mais ajouter un effet de rotation
            if (img) {
                img.style.transform = 'rotate(360deg)';
                img.style.transition = 'transform 0.1s ease';
            }
        });
        
        // Rolling animation
        let rollCount = 0;
        const rollInterval = setInterval(() => {
            diceElements.forEach(die => {
                const randomCase = this.cases[Math.floor(Math.random() * this.cases.length)];
                const img = die.querySelector('img');
                img.src = randomCase.image;
                img.alt = randomCase.name.charAt(0);
                // Ajouter un effet de rotation aléatoire
                img.style.transform = `rotate(${Math.random() * 360}deg) scale(${0.9 + Math.random() * 0.2})`;
            });
            rollCount++;
            
            if (rollCount >= 10) {
                clearInterval(rollInterval);
                this.finalizeRoll();
            }
        }, 150);
    }
    
    finalizeRoll() {
        const diceElements = document.querySelectorAll('.dice');
        diceElements.forEach(die => {
            die.classList.remove('rolling');
            // Remettre l'image droite
            const img = die.querySelector('img');
            if (img) {
                img.style.transform = 'rotate(0deg) scale(1)';
            }
        });
        
        // Generate final results
        const results = [];
        for (let i = 0; i < 3; i++) {
            const randomCase = this.cases[Math.floor(Math.random() * this.cases.length)];
            results.push(randomCase.id);
            const img = diceElements[i].querySelector('img');
            img.src = randomCase.image;
            img.alt = randomCase.name.charAt(0);
        }
        
        // Calculate winnings
        const matches = results.filter(result => result === this.selectedCase).length;
        let winnings = 0;
        let multiplier = 0;
        
        if (matches === 1) {
            multiplier = 2; // Double
            winnings = this.currentBet * 2;
        } else if (matches === 2) {
            multiplier = 3; // Triple
            winnings = this.currentBet * 3;
        } else if (matches === 3) {
            multiplier = 4; // Quadruple (NEW!)
            winnings = this.currentBet * 4;
        }
        
        // Highlight winning dice
        this.highlightWinningDice(results, diceElements);
        
        // Update Davecoin
        if (winnings > 0) {
            if (window.Davecoin) {
                window.Davecoin.add(winnings);
                this.davecoin = window.Davecoin.get();
                window.Davecoin.updateHeader();
            } else {
                this.davecoin += winnings;
            }
            this.showResult(true, matches, multiplier, winnings);
            // Add pulse effect to davecoin display
            this.addPulseEffect();
        } else {
            this.showResult(false, 0, 0, 0);
        }
        
        this.isRolling = false;
        this.updateRollButtonState();
        this.updateDavecoinDisplay();
    }
    
    highlightWinningDice(results, diceElements) {
        // Remove previous winning classes and reset all filters
        diceElements.forEach(die => {
            die.classList.remove('winning-dice');
            const img = die.querySelector('img');
            if (img) {
                img.style.filter = 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))';
            }
        });
        
        // Add winning class to matching dice
        results.forEach((result, index) => {
            if (result === this.selectedCase) {
                diceElements[index].classList.add('winning-dice');
                // Add glow effect to the image inside
                const img = diceElements[index].querySelector('img');
                if (img) {
                    img.style.filter = 'drop-shadow(0 0 10px #ffd700) brightness(1.2)';
                }
            }
        });
    }
    
    addPulseEffect() {
        const davecoinDisplay = document.querySelector('.davecoin-display');
        davecoinDisplay.classList.add('pulse-gold');
        
        setTimeout(() => {
            davecoinDisplay.classList.remove('pulse-gold');
        }, 2000);
    }
    
    showResult(won, matches, multiplier, winnings) {
        const resultDisplay = document.querySelector('.result-display');
        let message = '';
        
        if (won) {
            message = `🎉 VICTOIRE! ${matches} dé(s) correspondant(s) - Multiplicateur x${multiplier} - Vous gagnez ${winnings.toLocaleString()} Davecoin!`;
            resultDisplay.innerHTML = `<p class="result-text win">${message}</p>`;
        } else {
            message = `😞 Pas de chance! Aucun dé ne correspond à ${this.getCaseName(this.selectedCase)}. Vous perdez votre mise.`;
            resultDisplay.innerHTML = `<p class="result-text lose">${message}</p>`;
        }
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Create the main container
    const container = document.createElement('div');
    container.className = 'dice-container';
    document.body.appendChild(container);
    
    // Initialize the game
    new DaveDiceGame();
});