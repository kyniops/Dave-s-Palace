# Poulet de Stake - Réplique

## Installation
- Ouvrir `templates/dave_chicken.html` dans votre navigateur via votre serveur statique habituel.
- Le projet utilise des fichiers statiques (HTML/CSS/JS) et le module Davecoin déjà présent.

## Utilisation
- Saisir la mise (Davecoins), choisir la difficulté (Easy/Medium/Hard), cliquer `Go`.
- Cliquez dans la colonne suivante pour faire avancer le poulet sur l'une des 3 cases.
- `Cashout` crédite immédiatement les gains (mise × multiplicateur courant).

## Mécaniques
- 10 colonnes, 3 rangées par colonne.
- Les pièges sont générés à chaque manche (1 ou 2 par colonne selon difficulté).
- Les multiplicateurs par colonne: 1.03x → 2.18x.

## Performances
- Animations CSS basées sur `transition` pour la position du poulet.
- Compatibilité moderne: Chrome, Edge, Firefox, Safari récents.

## Tests
- Vérifier progression, pièges, cashout.
- Comparer visuellement couleurs, layout et comportements avec l’original.

