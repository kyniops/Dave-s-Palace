## Dave's Palace — Mini Casino en Flask

Application web de type mini-casino développée avec Flask (Python). Elle propose plusieurs pages de jeux et des écrans d'inscription/connexion très simples basés sur un fichier JSON local.

### Fonctionnalités
- Page d’accueil et menu principal
- Inscription et connexion avec stockage JSON (`user.json`)
- Pages de jeux: dés, machine à sous, roulette, blackjack (vues HTML et styles)

### Prérequis
- **Python 3.10+** (testé avec Python 3.12)
- **pip** disponible dans votre terminal

### Installation
1. Cloner le dépôt
```bash
git clone <URL_DU_DEPOT_GITHUB>
cd Dave-s-Palace-main
```
2. (Optionnel) Créer un environnement virtuel
```bash
python -m venv .venv
# Windows PowerShell
. .venv/Scripts/Activate.ps1
```
3. Installer les dépendances minimales
```bash
python -m pip install --upgrade pip
python -m pip install flask
```

### Lancement
Depuis Windows PowerShell, exécuter depuis le dossier contenant `app.py`:
```bash
cd "Dave-s-Palace-main/Dave's Palace"
python app.py
```
Ouvrir ensuite le navigateur à l’adresse: `http://127.0.0.1:5000/`.

Arrêt du serveur: `Ctrl + C` dans le terminal.

### Structure du projet
```
Dave-s-Palace-main/
├── Dave's Palace/
│   ├── app.py
│   ├── user.json
│   ├── templates/
│   │   ├── index.html
│   │   ├── inscription.html
│   │   ├── connexion.html
│   │   ├── main_menu.html
│   │   ├── dave_dice.html
│   │   ├── dave_machine.html
│   │   └── dave_roulette.html
│   └── static/
│       ├── global.css
│       ├── style.css
│       └── css/sections/
│           ├── header.css
│           ├── dave_dice.css
│           └── inscription.css
└── README.md
```

### Routes principales (dans `app.py`)
- `/` → page d’accueil (`index.html`)
- `/inscription` → inscription (GET/POST) avec stockage dans `user.json`
- `/connexion` → connexion (GET/POST) redirige vers `main_menu.html` si succès
- `/dave_dice`, `/dave_machine`, `/dave_roulette`, `/dave_jack` → pages de jeux

### Notes de développement
- Les données utilisateur sont stockées en clair dans `user.json` (pour la démonstration). Ne pas utiliser en production tel quel.
- Le serveur est lancé en mode `debug=True` pour faciliter le développement.

### Dépannage
- Erreur « Import \"flask\" could not be resolved »:
  - Installer Flask: `python -m pip install flask`
  - Vérifier l’import: `python -c "import flask; import importlib.metadata as m; print(m.version('flask'))"`
  - Vérifier que vous utilisez le bon interpréteur Python dans votre IDE.

### Licence
Indiquez ici la licence si nécessaire (MIT, Apache-2.0, etc.).
