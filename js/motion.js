/* Dave's Palace — motion design : ouverture, révélations en cascade, titres mot à mot,
 * cartes inclinées en 3D, boutons aimantés, compteurs qui défilent.
 */
(function () {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE = 'cubic-bezier(.16,1,.3,1)';

  const motion = {
    /** Écran d'ouverture (une fois par session). */
    splash(icon) {
      let seen = false;
      try { seen = sessionStorage.getItem('dp_splash') === '1'; sessionStorage.setItem('dp_splash', '1'); } catch { /* ignore */ }
      if (seen || reduced) return;
      const name = 'Dave’s Palace';
      const el = document.createElement('div');
      el.className = 'splash';
      el.innerHTML = `<div class="splash__in"><div class="splash__mark">${icon}</div>
        <div class="splash__name">${[...name].map((c) => `<span>${c === ' ' ? '&nbsp;' : c}</span>`).join('')}</div>
        <div class="splash__bar"><i></i></div></div>`;
      document.body.appendChild(el);
      el.querySelector('.splash__mark').animate([{ transform: 'scale(.4) rotate(-90deg)', opacity: 0 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 700, easing: EASE });
      el.querySelectorAll('.splash__name span').forEach((s, i) => s.animate([{ transform: 'translateY(120%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 600, delay: 200 + i * 35, easing: EASE, fill: 'backwards' }));
      el.querySelector('.splash__bar i').animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 900, delay: 300, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'backwards' });
      el.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { duration: 700, delay: 1350, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'forwards' })
        .finished.then(() => el.remove());
    },

    /** Découpe un titre en mots qui montent l'un après l'autre. */
    splitWords(el, delay = 0) {
      if (!el || el.dataset.split) return;
      el.dataset.split = '1';
      const walk = (node) => {
        [...node.childNodes].forEach((n) => {
          if (n.nodeType === 3) {
            const frag = document.createDocumentFragment();
            n.textContent.split(/(\s+)/).forEach((part) => {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
              const w = document.createElement('span'); w.className = 'w';
              const inner = document.createElement('span'); inner.textContent = part;
              w.appendChild(inner); frag.appendChild(w);
            });
            n.replaceWith(frag);
          } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
        });
      };
      walk(el);
      if (reduced) return;
      el.querySelectorAll('.w > span').forEach((s, i) => s.animate([{ transform: 'translateY(105%) rotate(4deg)' }, { transform: 'none' }], { duration: 900, delay: delay + i * 70, easing: EASE, fill: 'backwards' }));
    },

    /** Révélation en cascade des blocs marqués [data-reveal] (ou des enfants directs). */
    reveal(root, selector = '[data-reveal]', base = 0) {
      if (reduced) return;
      const els = [...root.querySelectorAll(selector)];
      els.forEach((el, i) => {
        el.animate([{ opacity: 0, transform: 'translateY(22px)', clipPath: 'inset(0 0 100% 0)' }, { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0% 0)' }],
          { duration: 800, delay: base + i * 70, easing: EASE, fill: 'backwards' });
      });
    },

    /** Les éléments apparaissent quand ils entrent dans l'écran. */
    onView(els, base = 0) {
      if (reduced || !('IntersectionObserver' in window)) return;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          const i = +e.target.dataset.i || 0;
          e.target.animate([{ opacity: 0, transform: 'translateY(30px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: base + (i % 5) * 60, easing: EASE, fill: 'backwards' });
        });
      }, { threshold: 0.1 });
      els.forEach((el, i) => { el.dataset.i = i; io.observe(el); });
    },

    /** Inclinaison 3D qui suit la souris. */
    tilt(els, max = 8) {
      if (reduced || matchMedia('(hover: none)').matches) return;
      els.forEach((el) => {
        el.addEventListener('pointermove', (e) => {
          const r = el.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
          el.style.transform = `rotateY(${x * max}deg) rotateX(${-y * max}deg) translateY(-4px)`;
        });
        el.addEventListener('pointerleave', () => (el.style.transform = ''));
      });
    },

    /** Boutons aimantés : ils glissent légèrement vers le curseur. */
    magnetic(els, force = 0.25) {
      if (reduced || matchMedia('(hover: none)').matches) return;
      els.forEach((el) => {
        el.addEventListener('pointermove', (e) => {
          const r = el.getBoundingClientRect();
          el.style.translate = `${(e.clientX - r.left - r.width / 2) * force}px ${(e.clientY - r.top - r.height / 2) * force}px`;
        });
        el.addEventListener('pointerleave', () => (el.style.translate = ''));
      });
    },

    /** Compteur qui défile jusqu'à sa valeur. */
    countUp(el, to, fmt, dur = 1200) {
      if (!el) return;
      if (reduced || !(to > 0)) { el.textContent = fmt(to); return; }
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        el.textContent = fmt(to * (1 - Math.pow(1 - k, 4)));
        if (k < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
      };
      requestAnimationFrame(step);
    },

    /** Repère orange qui glisse vers l'entrée active du menu. */
    navIndicator(nav) {
      let ind = nav.querySelector('.nav-ind');
      if (!ind) { ind = document.createElement('i'); ind.className = 'nav-ind'; nav.appendChild(ind); }
      const on = nav.querySelector('.nav-item.on');
      if (!on) { ind.style.opacity = 0; return; }
      ind.style.opacity = 1;
      ind.style.height = on.offsetHeight + 'px';
      ind.style.transform = `translateY(${on.offsetTop}px)`;
      ind.style.top = '0px';
    }
  };

  window.DP_MOTION = motion;
})();
