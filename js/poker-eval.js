/* DavePoker — évaluation des mains de Texas Hold'em (même calcul que pk_eval côté serveur).
 * Carte = entier 0..51 : rang = c >> 2 (0 = 2 … 12 = As), couleur = c & 3 (0 ♠, 1 ♥, 2 ♦, 3 ♣).
 * Score = catégorie puis 5 rangs départageants, chacun sur 4 bits (rang + 1, 0 = absent) : plus grand = meilleur.
 */
(function (root) {
  'use strict';
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SUITS = ['♠', '♥', '♦', '♣'];
  const ONE = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'valet', 'dame', 'roi', 'as'];
  const MANY = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'valets', 'dames', 'rois', 'as'];

  const score = (cat, k) => { let s = cat; for (let i = 0; i < 5; i++) s = s * 16 + (k[i] == null ? 0 : k[i] + 1); return s; };
  // plus haute quinte dans un masque de rangs (l'As compte aussi comme 1), ou -1
  function straight(mask) {
    const m = (mask << 1) | ((mask >> 12) & 1);
    for (let hi = 12; hi >= 3; hi--) if (((m >> (hi - 3)) & 31) === 31) return hi;
    return -1;
  }
  function evaluate(cards) {
    const cnt = new Array(13).fill(0), sc = [0, 0, 0, 0];
    let mask = 0;
    cards.forEach((c) => { cnt[c >> 2]++; sc[c & 3]++; mask |= 1 << (c >> 2); });
    const fs = sc.findIndex((n) => n >= 5);
    if (fs >= 0) {
      let fm = 0; cards.forEach((c) => { if ((c & 3) === fs) fm |= 1 << (c >> 2); });
      const hi = straight(fm);
      if (hi >= 0) return score(8, [hi]);
    }
    let quads = -1; const trips = [], pairs = [], singles = [];
    for (let r = 12; r >= 0; r--) {
      if (cnt[r] === 4) quads = r; else if (cnt[r] === 3) trips.push(r); else if (cnt[r] === 2) pairs.push(r); else if (cnt[r] === 1) singles.push(r);
    }
    if (quads >= 0) return score(7, [quads, Math.max(-1, ...trips, ...pairs, ...singles)]);
    if (trips.length && (trips.length >= 2 || pairs.length)) return score(6, [trips[0], Math.max(trips[1] ?? -1, pairs[0] ?? -1)]);
    if (fs >= 0) return score(5, cards.filter((c) => (c & 3) === fs).map((c) => c >> 2).sort((a, b) => b - a).slice(0, 5));
    const hi = straight(mask);
    if (hi >= 0) return score(4, [hi]);
    if (trips.length) return score(3, [trips[0], ...singles.slice(0, 2)]);
    if (pairs.length >= 2) return score(2, [pairs[0], pairs[1], Math.max(pairs[2] ?? -1, singles[0] ?? -1)]);
    if (pairs.length === 1) return score(1, [pairs[0], ...singles.slice(0, 3)]);
    return score(0, singles.slice(0, 5));
  }
  const cat = (s) => Math.floor(s / 1048576);
  const kick = (s, i) => (Math.floor(s / Math.pow(16, 4 - i)) % 16) - 1;
  function name(s) {
    const c = cat(s), k1 = kick(s, 0), k2 = kick(s, 1);
    switch (c) {
      case 8: return k1 === 12 ? 'Quinte flush royale' : `Quinte flush hauteur ${ONE[k1]}`;
      case 7: return `Carré de ${MANY[k1]}`;
      case 6: return `Full aux ${MANY[k1]} par les ${MANY[k2]}`;
      case 5: return `Couleur hauteur ${ONE[k1]}`;
      case 4: return `Quinte hauteur ${ONE[k1]}`;
      case 3: return `Brelan de ${MANY[k1]}`;
      case 2: return `Double paire ${MANY[k1]} et ${MANY[k2]}`;
      case 1: return `Paire de ${MANY[k1]}`;
      default: return `Hauteur ${ONE[k1]}`;
    }
  }
  const api = { evaluate, name, cat, RANKS, SUITS, rank: (c) => c >> 2, suit: (c) => c & 3 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DP_PKEVAL = api;
})(typeof window !== 'undefined' ? window : globalThis);
