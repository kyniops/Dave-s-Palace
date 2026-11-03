/* Texture de planète (géante gazeuse : bandes + turbulences), posée en variable CSS --planet-tex.
 * Les planètes du site la font défiler pour donner l'impression qu'elles tournent ; le fond 3D de DaveMachine l'utilise aussi.
 * C'est une image fixe (assets/img/planet.jpg) : la générer dans le navigateur échouait chez les joueurs dont le
 * navigateur bloque le dessin sur canvas (protection anti-pistage) et ralentissait les petites machines.
 */
(function () {
  'use strict';
  // adresse complète : dans une variable CSS, un chemin relatif serait lu depuis le dossier css/
  const url = new URL('assets/img/planet.jpg?v=1', document.baseURI).href;
  document.documentElement.style.setProperty('--planet-tex', `url("${url}")`);
  window.DP_PLANET_TEX = url;
})();
