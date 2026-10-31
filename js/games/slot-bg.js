/* Fond 3D de DaveMachine (three.js) : une géante gazeuse se lève derrière la machine, entourée d'un
 * anneau de poussière dorée où gravitent des DaveCoins, sur un fond d'étoiles et de nébuleuses.
 * La scène réagit au jeu en lisant les classes de la machine (spinning, has-win, fs) et du body
 * (fs-party, jp-party) : l'anneau accélère, les étoiles filent, les couleurs changent.
 */
(function () {
  'use strict';
  const { IMG } = DP;

  const softDot = (inner, outer, size = 64) => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), h = size / 2;
    const gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return c;
  };

  DP.slotBg = (stage, slot) => {
    const THREE = window.THREE;
    const cv = document.createElement('canvas');
    cv.className = 'slot-bg';
    stage.prepend(cv);
    let renderer;
    try { if (!THREE) throw 0; renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); }
    catch { cv.classList.add('slot-bg--flat'); return () => cv.remove(); }
    const small = stage.clientWidth < 700;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    camera.position.set(0, 0.6, 9);
    const dotTex = new THREE.CanvasTexture(softDot('rgba(255,255,255,1)', 'rgba(255,255,255,.35)'));

    /* étoiles */
    const NS = small ? 1200 : 2600;
    const sPos = new Float32Array(NS * 3), sCol = new Float32Array(NS * 3);
    for (let i = 0; i < NS; i++) {
      sPos[i * 3] = (Math.random() - 0.5) * 70; sPos[i * 3 + 1] = (Math.random() - 0.5) * 44; sPos[i * 3 + 2] = -Math.random() * 80 + 4;
      const w = 0.55 + Math.random() * 0.45, warm = Math.random() < 0.25;
      sCol.set(warm ? [w, w * 0.8, w * 0.6] : [w * 0.85, w * 0.9, w], i * 3);
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
    const stars = new THREE.Points(sGeo, new THREE.PointsMaterial({ size: 0.28, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(stars);

    /* nébuleuses */
    const nebTex = [
      new THREE.CanvasTexture(softDot('rgba(192,77,255,.55)', 'rgba(120,40,200,.18)', 256)),
      new THREE.CanvasTexture(softDot('rgba(255,107,44,.5)', 'rgba(180,50,20,.16)', 256)),
      new THREE.CanvasTexture(softDot('rgba(255,45,138,.45)', 'rgba(140,20,90,.15)', 256))
    ];
    const nebulas = [[-9, 5, -22, 26, 0], [10, 3, -26, 30, 2], [2, 9, -30, 34, 1], [-6, -2, -18, 18, 1]].map(([x, y, z, s, k]) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebTex[k], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
      sp.position.set(x, y, z); sp.scale.set(s, s, 1); sp.userData.base = s;
      scene.add(sp);
      return sp;
    });

    /* planète */
    const R = 3.4;
    const planetGroup = new THREE.Group();
    planetGroup.position.set(0.4, -4.1, -3);
    scene.add(planetGroup);
    const tex = window.DP_PLANET_TEX ? new THREE.TextureLoader().load(window.DP_PLANET_TEX) : null;
    if (tex) { tex.wrapS = THREE.RepeatWrapping; }
    const planet = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshStandardMaterial({ map: tex, color: tex ? 0xffffff : 0xb05a30, roughness: 1, metalness: 0 }));
    planet.rotation.z = 0.32;
    planetGroup.add(planet);
    // atmosphère : halo qui s'allume sur le bord (effet de Fresnel)
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0xff8a3c) }, power: { value: 1 } },
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 color; uniform float power; varying vec3 vN; void main(){ float i = pow(max(0.0, 0.62 - dot(vN, vec3(0.0, 0.0, 1.0))), 4.0) * power * 0.9; gl_FragColor = vec4(color * i, i); }',
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    });
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.14, 64, 48), atmoMat);
    planetGroup.add(atmo);
    scene.add(new THREE.AmbientLight(0x2a1838, 0.9));
    const sun = new THREE.DirectionalLight(0xffd2a0, 1.35);
    sun.position.set(-6, 5, 4);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xff4fa3, 1.2);
    rim.position.set(7, -1, -6);
    scene.add(rim);

    /* anneau de poussière dorée */
    const ring = new THREE.Group();
    ring.rotation.set(0.3, 0, -0.14);
    planetGroup.add(ring);
    const NR = small ? 9000 : 22000;
    const rPos = new Float32Array(NR * 3), rCol = new Float32Array(NR * 3);
    const gold = new THREE.Color(0xffc145), orange = new THREE.Color(0xff6b2c), pink = new THREE.Color(0xff5ad1), white = new THREE.Color(0xfff3d6);
    for (let i = 0; i < NR; i++) {
      // bandes plus denses, avec une division sombre comme celle de Cassini
      let r;
      do { r = R * (1.4 + Math.pow(Math.random(), 0.9) * 1.25); } while (r > R * 2.05 && r < R * 2.15 && Math.random() < 0.85);
      const a = Math.random() * Math.PI * 2;
      rPos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.03, Math.sin(a) * r], i * 3);
      const k = (r / R - 1.4) / 1.25, c = new THREE.Color();
      c.copy(k < 0.5 ? white.clone().lerp(gold, k * 2) : gold.clone().lerp(Math.random() < 0.3 ? pink : orange, (k - 0.5) * 2));
      c.multiplyScalar(0.9 + Math.random() * 0.9);
      rCol.set([c.r, c.g, c.b], i * 3);
    }
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
    rGeo.setAttribute('color', new THREE.BufferAttribute(rCol, 3));
    const ringMat = new THREE.PointsMaterial({ size: small ? 0.2 : 0.16, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 });
    const dust = new THREE.Points(rGeo, ringMat);
    ring.add(dust);

    /* DaveCoins en orbite dans l'anneau */
    const coinTex = new THREE.TextureLoader().load(IMG + 'davecoin.png');
    const coins = Array.from({ length: small ? 6 : 10 }, (_, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: coinTex, transparent: true, depthWrite: false }));
      sp.userData = { a: (i / 10) * Math.PI * 2 + Math.random() * 0.4, r: R * (1.6 + Math.random() * 1.0), s: 0.35 + Math.random() * 0.3, ph: Math.random() * 6 };
      ring.add(sp);
      return sp;
    });

    /* boucle d'animation */
    function resize() {
      const w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // sur un écran étroit on recule un peu pour garder la planète et l'anneau en vue
      camera.position.z = w / h < 1 ? 12 : 9;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = performance.now(), t = 0, energy = 0.3, flash = 0, wasWin = false, mood = 0, warp = 0;
    const tint = new THREE.Color(), baseAtmo = new THREE.Color(0xff8a3c), fsAtmo = new THREE.Color(0xff3d9a), jpAtmo = new THREE.Color(0xffd36b);
    let mx = 0, my = 0;
    const onMove = (e) => { const r = stage.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width - 0.5; my = (e.clientY - r.top) / r.height - 0.5; };
    stage.addEventListener('pointermove', onMove);

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; t += dt;
      const spinning = slot.classList.contains('spinning');
      const win = slot.classList.contains('has-win');
      const party = document.body.classList.contains('fs-party') || slot.classList.contains('fs');
      const jp = document.body.classList.contains('jp-party');
      if (win && !wasWin) flash = 1;
      wasWin = win;
      const k = Math.min(1, dt * 2.5);
      energy += ((jp ? 1 : party ? 0.8 : spinning ? 0.75 : 0.25) - energy) * k;
      mood += ((jp ? 2 : party ? 1 : 0) - mood) * Math.min(1, dt * 1.5);
      warp += ((jp ? 1 : spinning ? 0.35 : party ? 0.25 : 0) - warp) * k;
      flash = Math.max(0, flash - dt * 1.2);

      // rotation de la planète et de l'anneau
      planet.rotation.y += dt * (0.04 + energy * 0.12);
      dust.rotation.y += dt * (0.05 + energy * 0.35);
      coins.forEach((c) => {
        const u = c.userData;
        u.a += dt * (0.12 + energy * 0.5) * (2.2 / (u.r / R));
        c.position.set(Math.cos(u.a) * u.r, Math.sin(t * 1.3 + u.ph) * 0.08, Math.sin(u.a) * u.r);
        const s = u.s * (1 + flash * 0.4);
        c.scale.set(s * Math.max(0.15, Math.abs(Math.cos(t * 2 + u.ph))), s, 1);
      });
      // étoiles : elles filent vers nous pendant le spin et le jackpot
      const p = sGeo.attributes.position.array;
      for (let i = 2; i < p.length; i += 3) { p[i] += dt * (0.4 + warp * 38); if (p[i] > 8) p[i] -= 84; }
      sGeo.attributes.position.needsUpdate = true;
      stars.material.size = 0.28 + warp * 0.2;
      // couleurs : orange au repos → rose en free spins → or au jackpot
      tint.copy(baseAtmo).lerp(fsAtmo, Math.min(1, mood)).lerp(jpAtmo, Math.max(0, mood - 1));
      atmoMat.uniforms.color.value.copy(tint);
      atmoMat.uniforms.power.value = 1 + energy * 0.9 + flash * 1.8;
      rim.color.copy(tint);
      ringMat.opacity = 0.75 + energy * 0.25;
      nebulas.forEach((n, i) => { const s = n.userData.base * (1 + Math.sin(t * 0.2 + i) * 0.05 + energy * 0.08); n.scale.set(s, s, 1); n.material.rotation += dt * 0.02 * (i % 2 ? 1 : -1); });
      // la caméra suit doucement la souris et tremble un peu au jackpot
      const shake = jp ? 0.05 : 0;
      camera.position.x += (mx * 1.4 - camera.position.x) * 0.04 + (Math.random() - 0.5) * shake;
      camera.position.y += (0.6 - my * 0.8 - camera.position.y) * 0.04 + (Math.random() - 0.5) * shake;
      camera.lookAt(0, -0.6, -2);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    if (reduced) { last = performance.now(); frame(last); cancelAnimationFrame(raf); }
    else raf = requestAnimationFrame(frame);
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduced) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', vis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', vis);
      stage.removeEventListener('pointermove', onMove);
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      renderer.dispose();
      cv.remove();
    };
  };
})();
