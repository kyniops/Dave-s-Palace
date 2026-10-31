/* Inspection d'une carte : clic sur une carte (inventaire, albums, cartes d'une caisse, vitrine du profil)
 * → la carte en grand, en 3D. On la fait tourner en la glissant (souris ou doigt), on peut la retourner,
 * et le reflet holographique suit l'angle. À côté : rareté, caisse, valeur, chance et exemplaires possédés.
 */
(() => {
  'use strict';
  const { IMG, ui, sound, fmt, esc, cards, inventory } = DP;
  const I = ui.icon;
  // cartes qu'on ne peut pas inspecter : bandes qui défilent, choix de l'upgrade, fusion, sélecteurs du profil…
  const SKIP = 'button, a, .strip, .strip-row, .fuse__stage, .modal, .ustake, .upick, .ppick, .insp, .js-noinspect';
  const CONTEXTS = '.inv-slot, .album, .cases__drops, .pshow, .landing__card, .ix-fan';

  function inspect(card, { shiny = false, owned = true } = {}) {
    if (!card) return;
    document.querySelectorAll('.modal.insp-modal').forEach((m) => m.remove());
    const n = inventory.count(card.id), sh = inventory.shinyCount(card.id);
    const set = cards.sets.find((s) => s.id === card.set);
    const pct = card.chance * 100;
    const odds = card.chance > 0 ? `1 sur ${fmt(Math.round(1 / card.chance))} <small class="muted">(${pct.toFixed(pct < 0.01 ? 3 : pct < 1 ? 2 : 1).replace('.', ',')} %)</small>` : '—';
    const value = shiny ? card.value * inventory.SHINY_MULT : card.value;
    const modal = ui.el(`<div class="modal insp-modal" role="dialog" aria-modal="true" aria-label="Inspection de la carte">
      <div class="insp" style="--r:${card.rarity.c}">
        <button class="modal__close icon-btn" type="button" aria-label="Fermer">${I('x')}</button>
        <div class="insp__stage">
          <div class="insp__glow"></div>
          <div class="insp__card">
            <div class="insp__front">${cards.html(card, { owned, shiny, cls: 'js-noinspect' })}</div>
            <div class="insp__back" data-r="${card.rarity.i}"><div class="insp__backin"><span class="insp__crown">${I('crown')}</span><b>Dave’s Palace</b><small>${esc(set ? set.name : '')}</small><em class="num">N° ${String(card.no).padStart(2, '0')} / ${card.of}</em></div></div>
          </div>
          <p class="insp__hint">${I('hand', 'i--sm')}Glisse pour tourner la carte</p>
        </div>
        <aside class="insp__info">
          <span class="insp__rar" data-r="${card.rarity.i}">${shiny ? '★ Brillante · ' : ''}${card.rarity.label}</span>
          <h2>${owned ? esc(card.name) : '???'}</h2>
          <p class="muted">Carte n° ${card.no} sur ${card.of} · ${esc(set ? set.name : '')}</p>
          <ul class="dlist">
            <li><span>Valeur de revente</span><b class="num">${ui.coin('coin--xs')} ${fmt(value)}</b></li>
            ${shiny ? '' : `<li><span>Version brillante</span><b class="num">${ui.coin('coin--xs')} ${fmt(card.value * inventory.SHINY_MULT)}</b></li>`}
            <li><span>Chance dans la caisse</span><b class="num">${odds}</b></li>
            <li><span>Prix de la caisse</span><b class="num">${ui.coin('coin--xs')} ${fmt(set ? set.price : 0)}</b></li>
            <li><span>Tu en as</span><b class="num">${n + sh ? `${n} normale${n > 1 ? 's' : ''}${sh ? ` · ${sh} brillante${sh > 1 ? 's' : ''}` : ''}` : '<span class="muted">aucune</span>'}</b></li>
          </ul>
          <div class="insp__act">
            <button type="button" class="btn btn--ghost btn--sm js-flip">${I('repeat', 'i--sm')}Retourner</button>
            <button type="button" class="btn btn--ghost btn--sm js-reset">${I('rotate-ccw', 'i--sm')}Recentrer</button>
            ${set ? `<a class="btn btn--primary btn--sm js-go" href="#/caisses/${set.id}">${I('package-open', 'i--sm')}Voir la caisse</a>` : ''}
          </div>
        </aside>
      </div>
    </div>`);
    document.body.appendChild(modal);
    sound.play('cardFlip');

    const stage = modal.querySelector('.insp__stage');
    const body = modal.querySelector('.insp__card');
    const face = modal.querySelector('.insp__front .tcard');
    const hint = modal.querySelector('.insp__hint');
    let rx = -6, ry = -18, vx = 0, vy = 0, drag = null, raf = 0, alive = true, t0 = performance.now(), idle = true, target = null;

    function apply(t) {
      // petit balancement quand on ne touche à rien
      const sway = idle && !drag && !target ? Math.sin((t - t0) / 900) * 6 : 0;
      const y = ry + sway, x = rx + (idle && !drag && !target ? Math.cos((t - t0) / 1300) * 2 : 0);
      body.style.transform = `rotateX(${x.toFixed(2)}deg) rotateY(${y.toFixed(2)}deg)`;
      // le reflet suit l'angle de la carte
      const ny = ((((y % 360) + 540) % 360) - 180) / 180, nx = Math.max(-1, Math.min(1, x / 60));
      face.classList.add('is-tracked');
      face.style.setProperty('--mx', (50 + ny * 60).toFixed(1) + '%');
      face.style.setProperty('--my', (50 - nx * 60).toFixed(1) + '%');
      face.style.setProperty('--ang', (115 + ny * 70).toFixed(1) + 'deg');
    }
    function loop(t) {
      if (!alive) return;
      if (target) {
        rx += (target.x - rx) * 0.16; ry += (target.y - ry) * 0.16;
        if (Math.abs(target.x - rx) < 0.1 && Math.abs(target.y - ry) < 0.1) { rx = target.x; ry = target.y; target = null; t0 = t; }
      } else if (!drag && (Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01)) {
        // inertie après un lancer
        ry += vy; rx = Math.max(-55, Math.min(55, rx + vx)); vx *= 0.93; vy *= 0.93;
      }
      apply(t);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      drag = { x: e.clientX, y: e.clientY, t: performance.now() };
      vx = vy = 0; target = null; idle = false;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-drag');
      hint.classList.add('gone');
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now(), dt = Math.max(1, now - drag.t);
      ry += dx * 0.45; rx = Math.max(-55, Math.min(55, rx - dy * 0.35));
      vy = (dx * 0.45) / dt * 16; vx = (-dy * 0.35) / dt * 16;
      drag = { x: e.clientX, y: e.clientY, t: now };
    });
    const release = () => { if (!drag) return; drag = null; stage.classList.remove('is-drag'); if (Math.abs(vy) < 0.3 && Math.abs(vx) < 0.3) vx = vy = 0; };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
    stage.addEventListener('dblclick', () => { target = { x: -6, y: Math.round(ry / 360) * 360 - 18 }; });

    modal.querySelector('.js-flip').addEventListener('click', () => {
      sound.play('cardFlip');
      idle = false;
      // vers la face la plus proche de l'autre côté
      const base = Math.round((ry + 18) / 180) * 180;
      target = { x: 0, y: base + 180 };
    });
    modal.querySelector('.js-reset').addEventListener('click', () => { sound.play('click'); idle = true; target = { x: -6, y: Math.round(ry / 360) * 360 - 18 }; });

    const close = () => { if (!alive) return; alive = false; cancelAnimationFrame(raf); modal.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') { idle = false; target = { x: rx, y: ry - 45 }; }
      if (e.key === 'ArrowRight') { idle = false; target = { x: rx, y: ry + 45 }; }
    };
    document.addEventListener('keydown', onKey);
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('.modal__close') || e.target.closest('.js-go')) close(); });
    return close;
  }
  cards.inspect = inspect;

  // clic sur une carte d'une collection → inspection
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('.tcard[data-card]');
    if (!t || t.closest(SKIP) || !t.closest(CONTEXTS)) return;
    const card = cards.byId[t.dataset.card];
    if (!card) return;
    e.preventDefault();
    inspect(card, { shiny: t.classList.contains('shiny'), owned: !t.classList.contains('missing') });
  });
})();
