// Configuration du jeu
const config = {
    rows: 16,
    startPegs: 3,
    pegRadius: 5,
    ballRadius: 8,
    gravity: 0.3,
    bounceFactor: 0.7,
    friction: 0.99,
    canvasWidth: 700,
    canvasHeight: 600,
};

// Multiplicateurs (17 slots au bas)
const multipliers = [100, 25, 10, 5, 2, 0.5, 0.25, 0.2, 0.2, 0.2, 0.25, 0.5, 2, 5, 10, 25, 100];

// Couleurs pour les multiplicateurs
const multiplierColors = [
    '#ff0000', '#ff4444', '#ff6666', '#ff8800', '#ffaa00',
    '#ffcc00', '#4CAF50', '#4CAF50', '#4CAF50', '#4CAF50', '#4CAF50',
    '#ffcc00', '#ffaa00', '#ff8800', '#ff6666', '#ff4444', '#ff0000'
];

// Prix et solde
const BALL_COST = 100;

// Variables globales
let canvas, ctx;
let pegs = [];
let balls = [];
let slots = [];
let isDropping = false;
let dropQueue = 0;
let lastDropTime = 0;
let canClick = true;
let coinImage = new Image();

// Classe Peg (obstacle)
class Peg {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = config.pegRadius;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.closePath();
    }
}

// Classe Ball
class Ball {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = 0;
        this.radius = config.ballRadius;
        this.active = true;
    }

    update() {
        // Appliquer la gravité
        this.vy += config.gravity;
        
        // Appliquer la friction
        this.vx *= config.friction;
        this.vy *= config.friction;

        // Mettre à jour la position
        this.x += this.vx;
        this.y += this.vy;

        // Calculer les limites du triangle (barrières invisibles)
        const triangleLeft = (config.canvasWidth / 2) - (9 * 40); // 9 pegs de chaque côté au bas
        const triangleRight = (config.canvasWidth / 2) + (9 * 40);
        
        // Collision avec les barrières invisibles du triangle
        if (this.x - this.radius < triangleLeft) {
            this.vx *= -config.bounceFactor;
            this.x = triangleLeft + this.radius;
        }
        if (this.x + this.radius > triangleRight) {
            this.vx *= -config.bounceFactor;
            this.x = triangleRight - this.radius;
        }

        // Collision avec les pegs
        pegs.forEach(peg => {
            const dx = this.x - peg.x;
            const dy = this.y - peg.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDist = this.radius + peg.radius;

            if (distance < minDist) {
                // Calculer l'angle de collision
                const angle = Math.atan2(dy, dx);
                
                // Séparer la balle du peg
                const overlap = minDist - distance;
                this.x += Math.cos(angle) * overlap;
                this.y += Math.sin(angle) * overlap;

                // Calculer la nouvelle vitesse
                const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                this.vx = Math.cos(angle) * speed * config.bounceFactor;
                this.vy = Math.sin(angle) * speed * config.bounceFactor;
            }
        });

        // Vérifier si la balle a atteint le bas
        if (this.y > config.canvasHeight - 50) {
            this.active = false;
            
            // S'assurer que la balle est dans les limites avant de vérifier le slot
            const triangleLeft = (config.canvasWidth / 2) - (9 * 40);
            const triangleRight = (config.canvasWidth / 2) + (9 * 40);
            
            // Forcer la balle à rester dans les limites
            if (this.x < triangleLeft) this.x = triangleLeft;
            if (this.x > triangleRight) this.x = triangleRight;
            
            this.checkSlot();
        }
    }

    checkSlot() {
        const slotWidth = config.canvasWidth / slots.length;
        const slotIndex = Math.floor(this.x / slotWidth);
        const finalSlot = Math.max(0, Math.min(slots.length - 1, slotIndex));
        
        // Vérifier que le multiplicateur existe
        if (typeof multipliers[finalSlot] === 'undefined') {
            console.error('Multiplicateur indéfini pour le slot:', finalSlot);
            return;
        }
        
        // Calculer le gain
        const multiplier = multipliers[finalSlot];
        const winAmount = BALL_COST * multiplier;
        Davecoin.add(winAmount); // Utiliser le système DaveCoin global
        
        // Afficher le multiplicateur et le gain
        document.getElementById('multiplier').textContent = `${multiplier}x`;
        document.getElementById('winAmount').textContent = `${winAmount > 0 ? '+' : ''}${winAmount.toFixed(0)}`;
        updateBalance();
        
        // Animer le slot
        const multiplierBoxes = document.querySelectorAll('.multiplier-box');
        if (multiplierBoxes[finalSlot]) {
            multiplierBoxes[finalSlot].classList.add('active');
            setTimeout(() => {
                if (multiplierBoxes[finalSlot]) {
                    multiplierBoxes[finalSlot].classList.remove('active');
                }
            }, 500);
        }
    }

    draw() {
        ctx.save();
        
        // Dessiner l'image de la pièce si elle est chargée
        if (coinImage.complete && coinImage.naturalWidth > 0) {
            ctx.translate(this.x, this.y);
            // Rotation pour effet dynamique
            const rotation = (this.x + this.y) * 0.1;
            ctx.rotate(rotation);
            
            const size = this.radius * 2;
            ctx.drawImage(coinImage, -size / 2, -size / 2, size, size);
        } else {
            // Fallback: dessiner une balle normale si l'image n'est pas chargée
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            
            const gradient = ctx.createRadialGradient(
                this.x - this.radius / 3,
                this.y - this.radius / 3,
                0,
                this.x,
                this.y,
                this.radius
            );
            gradient.addColorStop(0, '#ffeb3b');
            gradient.addColorStop(1, '#ffa000');
            
            ctx.fillStyle = gradient;
            ctx.fill();
            ctx.strokeStyle = '#ff8f00';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.closePath();
        }
        
        ctx.restore();
    }
}

// Initialiser le canvas
function initCanvas() {
    canvas = document.getElementById('plinkoCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = config.canvasWidth;
    canvas.height = config.canvasHeight;
}

// Créer les pegs en forme de triangle
function createPegs() {
    pegs = [];
    const startY = 80;
    const verticalSpacing = 35;
    const horizontalSpacing = 40;
    
    for (let row = 0; row < config.rows; row++) {
        const pegsInRow = config.startPegs + row;
        const y = startY + row * verticalSpacing;
        
        // Centrer chaque rangée pour former un triangle
        const rowWidth = (pegsInRow - 1) * horizontalSpacing;
        const startX = (config.canvasWidth - rowWidth) / 2;

        for (let col = 0; col < pegsInRow; col++) {
            const x = startX + col * horizontalSpacing;
            pegs.push(new Peg(x, y));
        }
    }
}

// Créer les slots
function createSlots() {
    slots = [];
    const lastRowPegs = config.startPegs + config.rows - 1;
    const numSlots = lastRowPegs + 1; // Doit être 18 (17 multiplicateurs)
    
    // Vérifier que le nombre de slots correspond aux multiplicateurs
    console.log('Nombre de slots:', numSlots, 'Nombre de multiplicateurs:', multipliers.length);
    
    for (let i = 0; i < numSlots; i++) {
        slots.push(i);
    }

    // Créer les boîtes de multiplicateurs dans le HTML
    const multipliersContainer = document.getElementById('multipliers');
    multipliersContainer.innerHTML = '';
    
    multipliers.forEach((mult, index) => {
        const box = document.createElement('div');
        box.className = 'multiplier-box';
        box.textContent = `${mult}x`;
        box.style.backgroundColor = multiplierColors[index];
        multipliersContainer.appendChild(box);
    });
}

// Lancer une balle
function dropBall() {
    // Cette fonction n'est plus utilisée car la logique est dans dropMultipleBalls
}

// Mettre à jour l'affichage du solde (utilise maintenant le système global DaveCoin)
function updateBalance() {
    // Le solde est maintenant affiché via le système global DaveCoin
    // Cette fonction peut être utilisée pour d'autres mises à jour si nécessaire
    console.log('Solde mis à jour:', Davecoin.get());
}

// Gérer la file d'attente de lancement
function handleDropQueue() {
    // Cette fonction n'est plus utilisée
}

// Lancer plusieurs balles
function dropMultipleBalls(count) {
    if (!canClick) return;
    
    // Lancer immédiatement la première balle
    if (Davecoin.get() >= BALL_COST) {
        Davecoin.add(-BALL_COST); // Déduire le coût avec le système DaveCoin global
        updateBalance();
        const ball = new Ball(config.canvasWidth / 2, 20);
        balls.push(ball);
    } else {
        alert('Solde insuffisant! Besoin de ' + BALL_COST + ' DaveCoin');
        return;
    }
    
    // Désactiver les boutons pendant 0.5 seconde
    canClick = false;
    const dropBtn = document.getElementById('dropBtn');
    
    dropBtn.disabled = true;
    dropBtn.style.opacity = '0.5';
    
    setTimeout(() => {
        canClick = true;
        dropBtn.disabled = false;
        dropBtn.style.opacity = '1';
    }, 500);
}

// Boucle d'animation
function animate() {
    ctx.clearRect(0, 0, config.canvasWidth, config.canvasHeight);

    // Dessiner les pegs
    pegs.forEach(peg => peg.draw());

    // Mettre à jour et dessiner les balles
    balls = balls.filter(ball => ball.active);
    balls.forEach(ball => {
        ball.update();
        ball.draw();
    });

    requestAnimationFrame(animate);
}

// Initialisation
function init() {
    // Initialiser l'affichage du compteur DaveCoin en haut à droite
    Davecoin.updateHeader();
    
    // Charger l'image de la pièce DAVE
    coinImage.src = '../static/css/sections/assets/davecoin2.png'; // Chemin relatif vers l'image
    
    initCanvas();
    createPegs();
    createSlots();
    updateBalance();
    animate();

    // Event listeners pour les boutons
    document.getElementById('dropBtn').addEventListener('click', () => dropMultipleBalls(1));
}

// Démarrer le jeu quand la page est chargée
window.addEventListener('load', init);