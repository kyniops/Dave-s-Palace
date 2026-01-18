# 📁 Structure du Projet Dave's Palace

## Vue d'ensemble
Le projet est maintenant organisé de manière claire et logique pour une meilleure maintenabilité.

## Arborescence

```
Dave-s-Palace/
│
├── README.md                      # Documentation principale
├── STRUCTURE.md                   # Ce fichier
│
├── templates/                     # Tous les fichiers HTML
│   ├── index.html                # Page d'accueil
│   ├── connexion.html            # Page de connexion
│   ├── inscription.html          # Page d'inscription
│   ├── main_menu.html            # Menu principal
│   ├── dave_dice.html            # Jeu des dés
│   ├── dave_jack.html            # Jeu du blackjack
│   ├── dave_roulette.html        # Jeu de la roulette
│   ├── davemine.html             # Jeu des mines
│   ├── plinko_dave.html          # Jeu Plinko
│   ├── dave_machine.html         # Machine à sous
│   └── plinkodave.html           # Alternative Plinko
│
└── static/                        # Tous les fichiers statiques
    │
    ├── style.css                  # Styles globaux (racine)
    ├── global.css                 # Styles globaux (racine)
    ├── auth.js                    # Scripts d'authentification (racine)
    │
    ├── css/                       # Feuilles de style organisées par type
    │   ├── common/                # Styles communs et réutilisables
    │   │   └── header.css         # Styles du header
    │   │
    │   ├── pages/                 # Styles des pages
    │   │   ├── auth.css           # Style connexion/inscription
    │   │   ├── index.css          # Style page d'accueil
    │   │   ├── main_menu.css      # Style menu principal
    │   │   └── inscription.css    # Style inscription
    │   │
    │   ├── games/                 # Styles des jeux
    │   │   ├── dave_dice.css      # Style dés
    │   │   ├── dave_jack.css      # Style blackjack
    │   │   ├── dave_roulette.css  # Style roulette
    │   │   ├── davemine.css       # Style mines
    │   │   └── plinko_dave.css    # Style Plinko
    │   │
    │   └── sections/              # Ressources et assets
    │       └── assets/            # Images et ressources
    │           ├── casino.png
    │           ├── jpz.png
    │           └── ... autres images
    │
    ├── js/                        # Scripts organisés par type
    │   ├── common/                # Scripts communs et utilitaires
    │   │   └── davecoin.js        # Gestion des DaveCoins
    │   │
    │   └── games/                 # Scripts des jeux
    │       ├── dave_dice.js       # Logique du jeu des dés
    │       ├── dave_jack.js       # Logique du blackjack
    │       ├── dave_roulette.js   # Logique de la roulette
    │       ├── davemine.js        # Logique des mines
    │       └── plinko_dave.js     # Logique du Plinko
    │
    └── assets/                    # Assets supplémentaires
        └── Capture_decran_*.png   # Images et favicon
```

## Convention de nommage

### 📄 Fichiers CSS
- **Jeux (games/)** : `{nom_jeu}.css` - Ex: `dave_dice.css`
- **Pages (pages/)** : `{nom_page}.css` - Ex: `main_menu.css`, `auth.css`
- **Commun (common/)** : Styles réutilisables - Ex: `header.css`

### 📝 Fichiers JavaScript
- **Jeux (games/)** : `{nom_jeu}.js` - Ex: `dave_roulette.js`
- **Commun (common/)** : Modules utilitaires - Ex: `davecoin.js`

### 🌐 Fichiers HTML
- **Jeux** : `{nom_jeu}.html` - Ex: `dave_dice.html`, `plinko_dave.html`
- **Pages** : `{nom_page}.html` - Ex: `index.html`, `main_menu.html`
- **Authentification** : `connexion.html`, `inscription.html`

## Chemins d'importation

### Depuis un template HTML

**CSS des jeux:**
```html
<link rel="stylesheet" href="../static/css/games/dave_dice.css">
```

**CSS des pages:**
```html
<link rel="stylesheet" href="../static/css/pages/main_menu.css">
```

**CSS commun:**
```html
<link rel="stylesheet" href="../static/css/common/header.css">
```

**JavaScript des jeux:**
```html
<script src="../static/js/games/dave_roulette.js"></script>
```

**JavaScript commun:**
```html
<script src="../static/js/common/davecoin.js"></script>
```

## Bonnes pratiques

### ✅ À faire
- Placer les nouveaux jeux dans `css/games/` et `js/games/`
- Placer les styles des pages dans `css/pages/`
- Placer les modules réutilisables dans `js/common/`
- Utiliser des chemins relatifs (`../static/...`)
- Regrouper les ressources par type de contenu

### ❌ À ne pas faire
- Utiliser des chemins absolus (C:\Users\...)
- Mélanger les CSS des jeux et des pages
- Placer des assets sans rapport dans la racine
- Modifier les chemins sans mettre à jour tous les fichiers qui les utilisent

## Maintenance

Lors de l'ajout d'un nouveau jeu ou d'une nouvelle page :

1. Créer les fichiers CSS dans le bon dossier (`games/` ou `pages/`)
2. Créer les fichiers JS dans `js/games/`
3. Créer le fichier HTML dans `templates/`
4. Mettre à jour les chemins d'importation
5. Tester les chemins relatifs dans tous les navigateurs

---

**Dernière mise à jour:** 18 Janvier 2026
**Statut:** Structure organisée et optimisée ✨
