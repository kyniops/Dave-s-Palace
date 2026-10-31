# Dave’s Palace

Le casino royal de Jean-Pascal Zadi. Tu mises des **DaveCoins**, tu vises le jackpot.
Aucun serveur, aucune installation : ouvre `index.html` dans ton navigateur et c’est parti.

> Jeu fictif : aucun argent réel, les DaveCoins n’ont aucune valeur.

## Les jeux

| Jeu | Principe | RTP |
|---|---|---|
| **DaveMachine** | Machine à sous 5×3, 20 lignes, uniquement des visages de la bande, wild JPZ, 3 cartes Free JPZ = 15 free spins ×2 en hyperespace, **jackpot global progressif**, tirage auto | 96,5 % (hors jackpot) |
| **DaveMine** | Grille 5×5, trouve les DaveCoins, évite les bombes (1 à 24) | 99 % |
| **PlinkoDave** | 8/12/16 lignes, 3 niveaux de risque, jusqu’à ×1000 | 99 % |
| **DaveRocket** | Jeu crash avec compte à rebours, encaissement dès 1.01×, auto-encaissement | 99 % |
| **DaveRoulette** | Roulette européenne en canvas (bille physique, déflecteurs), jetons animés | 97,3 % |
| **DaveJack** | Blackjack 6 jeux : doubler, séparer, blackjack payé 3:2 | ≈ 99,4 % |
| **DaveChicken** | Traverse la route voie après voie, 4 difficultés | 99 % |
| **DaveDice** | Pose des jetons sur un ou plusieurs membres de la bande, 3 dés en 3D : ×2 / ×3 / ×12 par case | 95,8 % |
| **DaveFlip** | DaveCoin ou JPZ, enchaîne les victoires ×1,98 | 99 % |
| **DaveCases** | 5 caisses à thème : Bande (10), Gamers (25), Kawaï (50), Aura (100), Royale JPZ (500) ; 33 cartes, chaque photo dans une seule caisse ; ouverture ×1 à ×4, mode Battle, chances affichées | 95 % |
| **DaveTower** | 10 étages, une porte par étage, 4 difficultés, encaissement à tout moment | 98 % |
| **DaveWheel** | Roue en direct : 12 s de mises, la bande mise avec toi, ×2 / ×3,1 / ×5 / JPZ ×50 | ≈ 96 % |

## Fonctionnalités

- **Boucle principale** : gagne des DaveCoins au casino, ouvre des caisses, récupère des cartes de la bande plus ou moins rares (Commun, Peu commun, Rare, Épique, Légendaire, Mythique). Vends-les pour récupérer des DaveCoins ou garde-les dans ton **inventaire** pour compléter les 5 albums (album complet = 10× le prix de la caisse, une fois).

- **Page de présentation** animée avant la connexion : galaxie 3D (three.js) qui plonge au scroll, sections révélées en motion design, volet de transition vers l'inscription / la connexion
- Comptes locaux (inscription / connexion), **1 000 DaveCoins** offerts au départ
- Roue quotidienne toutes les 12 h (100 à 5 000 DaveCoins) + dépannage si ton solde tombe à 0
- Page **Codes** : codes promo qui donnent des DaveCoins, une fois par compte
- **Jackpot global** : 1 % de chaque mise l'alimente ; gagné sur DaveMachine avec 5 cartes Free JPZ ou par déclenchement mystère (chance proportionnelle à la mise)
- **Progression** (#/progression) : niveaux 1 à 100 (1 DaveCoin misé = 1 XP) et 7 rangs de Bronze à JPZ, récompenses à chaque niveau et caisse offerte tous les 5 niveaux ; 3 missions quotidiennes (facile, moyenne, difficile) ; 58 succès
- **DaveUpgrade** : sacrifie des cartes (et des DaveCoins) pour viser une carte plus chère ; chance = 95 % × mise ÷ valeur visée (max 80 %), aiguille sur une jauge
- **Fusion** : 5 cartes identiques deviennent une carte **brillante** (valeur ×7, cadre arc-en-ciel)
- **Profil** (#/profil) : photo (importée ou tirée de tes cartes), bannière (8 à débloquer, photo de carte ou image importée), titre gagné grâce aux succès et aux rangs, bio, vitrine de 3 cartes
- **Dashboard joueur** (#/dashboard) : solde, bilan, taux de victoire, RTP perso, courbe du solde, détail par jeu, bilan des 14 derniers jours, bonus et minuteurs, gains hors jeu, collection et albums, jackpot, historique des 50 dernières parties
- **Dashboard admin** (#/admin, code `palace-admin`) : tous les comptes du navigateur (tri par colonne, créditer / débiter un joueur), économie par jeu avec RTP réel et théorique, activité, DaveCoins distribués, codes promo, jackpot
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
js/progress.js        niveaux, rangs, missions, succès, caisses offertes
js/profile.js         profil personnalisable (photo, bannière, titres, vitrine)
js/dashboard.js       dashboards joueur et admin
js/app.js             routeur, accueil, lobby, profil
js/intro.js           page de présentation (galaxie three.js, transitions)
css/intro.css         styles de la page de présentation
js/games/*.js         un fichier par jeu (slot-engine.js = maths de DaveMachine, testables sous Node)
```

### Ajouter un jeu

Crée `js/games/monjeu.js`, appelle `DP.games.register({ id, name, icon, hue, tagline, rtp, rules, mount(root) })`
et ajoute la balise `<script>` dans `index.html`. `mount` reçoit le conteneur et renvoie une fonction de nettoyage.
Utilise `DP.wallet.place(mise)` pour débiter et `DP.settle(id, mise, gain)` pour régler la partie.
