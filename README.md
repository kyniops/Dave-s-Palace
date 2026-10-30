# Dave’s Palace

Le casino royal de Jean-Pascal Zadi. Tu mises des **DaveCoins**, tu vises le jackpot.
Aucun serveur, aucune installation : ouvre `index.html` dans ton navigateur et c’est parti.

> Jeu fictif : aucun argent réel, les DaveCoins n’ont aucune valeur.

## Les jeux

| Jeu | Principe | RTP |
|---|---|---|
| **DaveMachine** | Machine à sous 5×3, 20 lignes, wild JPZ, 3+ DaveCoins = 15 free spins ×2 (cumulables), achat du bonus | 96,1 % |
| **DaveMine** | Grille 5×5, trouve les DaveCoins, évite les bombes (1 à 24) | 99 % |
| **PlinkoDave** | 8/12/16 lignes, 3 niveaux de risque, jusqu’à ×1000 | 99 % |
| **DaveRocket** | Jeu crash avec compte à rebours, encaissement dès 1.01×, auto-encaissement | 99 % |
| **DaveRoulette** | Roulette européenne en canvas (bille physique, déflecteurs), jetons animés | 97,3 % |
| **DaveJack** | Blackjack 6 jeux : doubler, séparer, blackjack payé 3:2 | ≈ 99,4 % |
| **DaveChicken** | Traverse la route voie après voie, 4 difficultés | 99 % |
| **DaveDice** | Parie sur la bande (AXB, Olman, Sauce Blanche, Sévaré, Slymefire, Tdam), 3 dés | 95,8 % |
| **DaveFlip** | DaveCoin ou JPZ, enchaîne les victoires ×1,98 | 99 % |

## Fonctionnalités

- Comptes locaux (inscription / connexion), **1 000 DaveCoins** offerts au départ
- Bonus quotidien de 1 000 DaveCoins + dépannage si ton solde tombe à 0
- Profil avec statistiques et historique des 50 dernières parties
- Tirages avec `crypto.getRandomValues`, gains calculés à partir des probabilités réelles
- Quitter une page en pleine partie règle la partie (encaissement ou remboursement), aucune mise perdue
- Sound design 100 % synthétisé (Web Audio : compresseur, réverbération, gammes qui montent à chaque réussite), effets visuels (particules, secousses, pluie de DaveCoins), raccourcis clavier, responsive mobile
- Direction artistique « espace profond » : champ d'étoiles animé en parallaxe, étoiles filantes, verre fumé, icônes [Lucide](https://lucide.dev) (licence ISC)

Les anciens comptes et soldes (clés `utilisateurs`, `utilisateurCourant`, `davecoin_<pseudo>`) sont repris tels quels.

## Structure

```
index.html            point d'entrée unique (navigation par #/...)
assets/img/           images (JPZ, DaveCoin, la bande…)
css/main.css          design system, lobby, navigation
js/space.js           fond étoilé animé (canvas)
js/icons.js           icônes SVG (Lucide + icônes maison)
css/games.css         mise en page des jeux + styles de chaque jeu
js/core.js            portefeuille, comptes, stats, sons, composants UI
js/app.js             routeur, accueil, lobby, profil
js/games/*.js         un fichier par jeu (slot-engine.js = maths de DaveMachine, testables sous Node)
```

### Ajouter un jeu

Crée `js/games/monjeu.js`, appelle `DP.games.register({ id, name, icon, hue, tagline, rtp, rules, mount(root) })`
et ajoute la balise `<script>` dans `index.html`. `mount` reçoit le conteneur et renvoie une fonction de nettoyage.
Utilise `DP.wallet.place(mise)` pour débiter et `DP.settle(id, mise, gain)` pour régler la partie.
