// Dave Jack Game (Blackjack)
class DaveJack {
    constructor() {
        this.deck = [];
        this.playerHand = [];
        this.dealerHand = [];
        this.playerScore = 0;
        this.dealerScore = 0;
        this.gameActive = false;
        this.betAmount = 0;
        this.davecoin = 1000;
        // Animation/deal control
        this.dealerRevealed = false;
        this.playerDealDelay = 0;      // Slight/no delay for player
        this.dealerDealDelay = 350;    // Deal dealer a bit slower
        this.roundId = 0;              // Cancels in-flight actions on new game
        
        // Card suits and values
        this.suits = ['♠', '♥', '♦', '♣'];
        this.values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        
        this.init();
    }
    
    init() {
        this.createUI();
        if (window.Davecoin) {
            window.Davecoin.ensureInitialized();
            this.davecoin = window.Davecoin.get();
            window.Davecoin.updateHeader();
        } else {
            this.loadDavecoin();
        }
        this.updateDavecoinDisplay();
    }
    
    createUI() {
        document.body.innerHTML = `
            <div class="background-overlay"></div>
            
            <header class="jack-header">
                <h1 class="jack-title">Dave's Jack Game</h1>
                <p class="jack-subtitle">Bienvenue au Dave's Jack Game!</p>
            </header>
            
            <div class="jack-container">
                <div class="davecoin-display">
                    <div class="davecoin-amount" id="davecoin-amount">${this.davecoin}</div>
                    <div class="davecoin-label">Davecoins</div>
                </div>
                
                <div class="betting-section" id="betting-section">
                    <button class="bet-button" data-bet="10">10</button>
                    <button class="bet-button" data-bet="25">25</button>
                    <button class="bet-button" data-bet="50">50</button>
                    <button class="bet-button" data-bet="100">100</button>
                    <button class="bet-button" data-bet="250">250</button>
                    <button class="bet-button" data-bet="500">500</button>
                </div>
                
                <div class="game-table" id="game-table" style="display: none;">
                    <div class="card-area">
                        <div class="hand-section">
                            <div class="hand-title">Dealer</div>
                            <div class="score-display" id="dealer-score">Score: 0</div>
                            <div class="cards-container" id="dealer-cards"></div>
                        </div>
                        
                        <div class="hand-section">
                            <div class="hand-title">Player</div>
                            <div class="score-display" id="player-score">Score: 0</div>
                            <div class="cards-container" id="player-cards"></div>
                        </div>
                    </div>
                    
                    <div class="game-status" id="game-status"></div>
                    
                    <div class="game-controls" id="game-controls">
                        <button class="control-button deal" id="deal-button">Deal</button>
                        <button class="control-button hit" id="hit-button" disabled>Hit</button>
                        <button class="control-button stand" id="stand-button" disabled>Stand</button>
                        <button class="control-button" id="new-game-button" style="display: none;">New Game</button>
                    </div>
                </div>
            </div>
        `;
        
        this.attachEventListeners();
    }
    
    attachEventListeners() {
        // Betting buttons
        document.querySelectorAll('.bet-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.setBet(parseInt(e.target.dataset.bet));
            });
        });
        
        // Game control buttons
        document.getElementById('deal-button').addEventListener('click', () => this.deal());
        document.getElementById('hit-button').addEventListener('click', () => this.hit());
        document.getElementById('stand-button').addEventListener('click', () => this.stand());
        document.getElementById('new-game-button').addEventListener('click', () => this.resetGame());
    }
    
    setBet(amount) {
        const available = (window.Davecoin ? window.Davecoin.get() : this.davecoin);
        if (amount > available) {
            alert("Pas assez de Davecoins!");
            return;
        }
        
        this.betAmount = amount;
        
        // Update button states
        document.querySelectorAll('.bet-button').forEach(button => {
            button.classList.remove('active');
            if (parseInt(button.dataset.bet) === amount) {
                button.classList.add('active');
            }
        });
        
        document.getElementById('game-table').style.display = 'block';
        document.getElementById('deal-button').disabled = false;
    }
    
    createDeck() {
        this.deck = [];
        for (let suit of this.suits) {
            for (let value of this.values) {
                this.deck.push({ suit, value });
            }
        }
        this.shuffleDeck();
    }
    
    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }
    
    async deal() {
        if (this.betAmount === 0) {
            alert("Veuillez sélectionner une mise!");
            return;
        }

        // Clear previous cards
        document.getElementById('player-cards').innerHTML = '';
        document.getElementById('dealer-cards').innerHTML = '';

        this.gameActive = true;
        this.dealerRevealed = false;
        // Increment round to cancel any previous async flows
        this.roundId++;
        const round = this.roundId;
        this.createDeck();
        this.playerHand = [];
        this.dealerHand = [];

        // Update button states
        document.getElementById('deal-button').disabled = true;
        document.getElementById('hit-button').disabled = true;
        document.getElementById('stand-button').disabled = true;
        document.getElementById('betting-section').style.display = 'none';

        // Deal sequence: Player1, Dealer1, Player2, Dealer2(hidden)
        await this.dealSequence(round);

        // Enable controls after initial deal
        document.getElementById('hit-button').disabled = false;
        document.getElementById('stand-button').disabled = false;

        // Check for blackjack
        if (this.calculateScore(this.playerHand) === 21) {
            this.stand();
        }
    }
    
    drawCard() {
        return this.deck.pop();
    }
    
    calculateScore(hand) {
        let score = 0;
        let aces = 0;
        
        for (let card of hand) {
            if (card.value === 'A') {
                aces++;
                score += 11;
            } else if (['J', 'Q', 'K'].includes(card.value)) {
                score += 10;
            } else {
                score += parseInt(card.value);
            }
        }
        
        // Adjust for aces
        while (score > 21 && aces > 0) {
            score -= 10;
            aces--;
        }
        
        return score;
    }
    
    hit() {
        if (!this.gameActive) return;
        
        // Deal a face-down card to player then flip
        // Converted to async via helper
        return (async () => {
            await this.dealCardTo('player');
            if (this.calculateScore(this.playerHand) > 21) {
                this.endGame('lose');
            }
        })();
    }
    
    stand() {
        if (!this.gameActive) return;
        
        return (async () => {
            const round = this.roundId;
            // Reveal dealer's hidden hole card first
            const dealerContainer = document.getElementById('dealer-cards');
            const holeCardEl = dealerContainer && dealerContainer.children[1];
            if (holeCardEl && holeCardEl.classList.contains('hidden')) {
                await this.flipCard(holeCardEl, this.dealerDealDelay, round);
                this.dealerRevealed = true;
                this.updateScores();
            }

            // Dealer draws until 17 or more, flipping each
            while (this.calculateScore(this.dealerHand) < 17) {
                await this.dealCardTo('dealer', { round });
            }

            const playerScore = this.calculateScore(this.playerHand);
            const dealerScore = this.calculateScore(this.dealerHand);

            let result;
            if (playerScore > 21) {
                result = 'lose';
            } else if (dealerScore > 21) {
                result = 'win';
            } else if (playerScore === dealerScore) {
                result = 'push';
            } else if (playerScore === 21) {
                result = 'blackjack';
            } else if (playerScore > dealerScore) {
                result = 'win';
            } else {
                result = 'lose';
            }

            this.endGame(result);
        })();
    }
    
    updateUI() {
        this.renderCards('player-cards', this.playerHand);
        this.renderCards('dealer-cards', this.dealerHand, !this.gameActive);
    }
    
    renderCards(containerId, hand, showAll = true) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        hand.forEach((card, index) => {
            const cardElement = document.createElement('div');
            cardElement.className = 'card';
            
            const isRed = card.suit === '♥' || card.suit === '♦';
            cardElement.classList.add(isRed ? 'red' : 'black');
            cardElement.innerHTML = `
                <div>${card.value}</div>
                <div style="font-size: 2rem;">${card.suit}</div>
                <div style="transform: rotate(180deg);">${card.value}</div>
            `;

            // Keep dealer's second card hidden if showAll=false
            if (containerId === 'dealer-cards' && index === 1 && !showAll) {
                cardElement.classList.add('hidden');
            }
            
            container.appendChild(cardElement);
        });
    }
    
    // Helpers for sequential deal and flip animations
    createCardElement(card, faceDown = true) {
        const el = document.createElement('div');
        el.className = 'card';
        const isRed = card.suit === '♥' || card.suit === '♦';
        el.classList.add(isRed ? 'red' : 'black');
        el.innerHTML = `
            <div>${card.value}</div>
            <div style="font-size: 2rem;">${card.suit}</div>
            <div style="transform: rotate(180deg);">${card.value}</div>
        `;
        if (faceDown) el.classList.add('hidden');
        return el;
    }

    flipCard(el, delay = 0, round = this.roundId) {
        return new Promise(resolve => {
            setTimeout(() => {
                if (round !== this.roundId || !this.gameActive) { resolve(); return; }
                el.classList.add('flipping');
                // Reveal mid-animation
                setTimeout(() => {
                    if (round !== this.roundId || !this.gameActive) { resolve(); return; }
                    el.classList.remove('hidden');
                }, 300);
                // End of animation
                setTimeout(() => {
                    if (round !== this.roundId || !this.gameActive) { resolve(); return; }
                    el.classList.remove('flipping');
                    resolve();
                }, 600);
            }, delay);
        });
    }

    dealCardTo(target, { keepHidden = false, delay = null, round = this.roundId } = {}) {
        return new Promise(async (resolve) => {
            if (round !== this.roundId || !this.gameActive) { resolve(); return; }
            const card = this.drawCard();
            if (target === 'player') {
                this.playerHand.push(card);
            } else {
                this.dealerHand.push(card);
            }

            const containerId = target === 'player' ? 'player-cards' : 'dealer-cards';
            const container = document.getElementById(containerId);
            const el = this.createCardElement(card, true);
            container.appendChild(el);

            // Flip unless asked to keep hidden (dealer hole card)
            const d = (delay !== null) ? delay : (target === 'dealer' ? this.dealerDealDelay : this.playerDealDelay);
            if (!keepHidden) {
                await this.flipCard(el, d, round);
            }

            this.updateScores();
            resolve();
        });
    }

    async dealSequence(round = this.roundId) {
        // Player 1
        await this.dealCardTo('player', { round });
        // Dealer 1
        await this.dealCardTo('dealer', { round });
        // Player 2
        await this.dealCardTo('player', { round });
        // Dealer 2 (keep hidden)
        await this.dealCardTo('dealer', { keepHidden: true, round });
    }

    updateScores() {
        const playerScore = this.calculateScore(this.playerHand);
        document.getElementById('player-score').textContent = `Score: ${playerScore}`;

        const dealerScoreEl = document.getElementById('dealer-score');
        if (this.gameActive && !this.dealerRevealed) {
            // Show only first card score until hole card revealed
            if (this.dealerHand.length > 0) {
                const firstCardScore = this.calculateScore([this.dealerHand[0]]);
                dealerScoreEl.textContent = `Score: ${firstCardScore}`;
            } else {
                dealerScoreEl.textContent = `Score: ?`;
            }
        } else {
            const dealerScore = this.calculateScore(this.dealerHand);
            dealerScoreEl.textContent = `Score: ${dealerScore}`;
        }
    }
    
    endGame(result) {
        this.gameActive = false;
        
        const statusElement = document.getElementById('game-status');
        statusElement.className = 'game-status ' + result;
        
        let message, winnings = 0;
        
        switch (result) {
            case 'win':
                message = 'Vous gagnez!';
                winnings = this.betAmount;
                break;
            case 'blackjack':
                message = 'Blackjack! 🎉';
                winnings = Math.floor(this.betAmount * 1.5);
                break;
            case 'push':
                message = 'Push (Égalité)';
                winnings = 0;
                break;
            case 'lose':
                message = 'Vous perdez!';
                winnings = -this.betAmount;
                break;
        }
        
        statusElement.textContent = message;
        
        // Update Davecoin (module if available)
        if (window.Davecoin) {
            window.Davecoin.add(winnings);
            this.davecoin = window.Davecoin.get();
            window.Davecoin.updateHeader();
        } else {
            this.davecoin += winnings;
            this.saveDavecoin();
        }
        this.updateDavecoinDisplay();
        
        // Update button states
        document.getElementById('hit-button').disabled = true;
        document.getElementById('stand-button').disabled = true;
        document.getElementById('new-game-button').style.display = 'inline-block';
        
        // Show all dealer cards
        this.renderCards('dealer-cards', this.dealerHand, true);
        this.updateScores();
    }
    
    resetGame() {
        this.gameActive = false;
        // Cancel any in-flight animations/deals by bumping roundId
        this.roundId++;
        this.dealerRevealed = false;
        this.playerHand = [];
        this.dealerHand = [];
        this.betAmount = 0;
        
        document.getElementById('game-table').style.display = 'none';
        document.getElementById('betting-section').style.display = 'flex';
        document.getElementById('game-status').textContent = '';
        document.getElementById('game-status').className = 'game-status';
        document.getElementById('new-game-button').style.display = 'none';
        document.getElementById('deal-button').disabled = true;
        document.getElementById('hit-button').disabled = true;
        document.getElementById('stand-button').disabled = true;
        // Clear board and reset scores
        document.getElementById('player-cards').innerHTML = '';
        document.getElementById('dealer-cards').innerHTML = '';
        document.getElementById('player-score').textContent = 'Score: 0';
        document.getElementById('dealer-score').textContent = 'Score: 0';
        
        // Clear active bet buttons
        document.querySelectorAll('.bet-button').forEach(button => {
            button.classList.remove('active');
        });
    }
    
    updateDavecoinDisplay() {
        const val = window.Davecoin ? window.Davecoin.get() : this.davecoin;
        document.getElementById('davecoin-amount').textContent = val;
    }
    
    loadDavecoin() {
        const saved = localStorage.getItem('davecoin');
        if (saved) {
            this.davecoin = parseInt(saved);
        } else if (window.Davecoin) {
            this.davecoin = window.Davecoin.get();
        }
    }
    
    saveDavecoin() {
        if (window.Davecoin) {
            window.Davecoin.set(this.davecoin);
        } else {
            localStorage.setItem('davecoin', this.davecoin);
        }
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    new DaveJack();
});