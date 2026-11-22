// Cenário do lobby: terraço de prédio no pôr do sol (cena composta, paleta única roxo → laranja).
// Céu em degradê com o sol baixo, 3 camadas de silhueta da cidade (cada uma mais clara: perspectiva atmosférica),
// heliponto pintado sob o personagem, parapeito com grade, caixa d'água, saída da escada com luz quente,
// varal de lâmpadas, antena piscando e o avião do battle royale cruzando o céu de vez em quando.
'use strict';
LS.LobbyScene = {
  PAL: { top: 0x1a1236, mid: 0x5a2a6e, hor: 0xff8a5c, sun: 0xffd9a0, fog: 0x7a3a6e,
    city: [0x2a1a44, 0x45245a, 0x6a3468], roof: 0x5e5468, wall: 0x4a4258, trim: 0x2c2638, warm: 0xffc070 },
  // T = tema (js/lobbythemes.js): cores, luzes, céu e a decoração especial. Sem tema = o pôr do sol padrão
  build(sc, L, T) {
    T = T || {};
    const P = Object.assign({}, this.PAL, T.pal || {}), R = LS.Tex.rng(77), rand = (a, b) => a + R() * (b - a), LT = T.light || {};
    sc.background = new THREE.Color(P.top);
    sc.fog = new THREE.Fog(P.fog, (T.fog || [18, 140])[0], (T.fog || [18, 140])[1]);
    // luz: sol quente por trás (contorno), céu roxo de preenchimento, luz suave na frente
    const hl = LT.hemi || [0xb08ad0, 0x2a2030, 0.75]; sc.add(new THREE.HemisphereLight(hl[0], hl[1], hl[2]));
    const sl = LT.sun || [0xffb070, 1.1, 6, 7, -10];
    const sun = new THREE.DirectionalLight(sl[0], sl[1]); sun.position.set(sl[2], sl[3], sl[4]); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 }); sun.shadow.bias = -0.0006;
    sc.add(sun);
    const fl = LT.front || [0xffe6d0, 0.45]; const front = new THREE.DirectionalLight(fl[0], fl[1]); front.position.set(-3, 4, 8); sc.add(front);

    const solid = [], glow = [];
    const S = (x, y, z, w, h, d, c, rx, ry, rz) => solid.push([x, y + h / 2, z, w, h, d, c, rx || 0, ry || 0, rz || 0]);
    const G = (x, y, z, w, h, d, c) => glow.push([x, y + h / 2, z, w, h, d, c]);
    const tex = (w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); };
    L.anims = [];

    // ---------- céu: degradê + sol + faixas de nuvem ----------
    const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(P.top) }, mid: { value: new THREE.Color(P.mid) }, hor: { value: new THREE.Color(P.hor) }, sun: { value: new THREE.Color(P.sun) }, sunDir: { value: new THREE.Vector3().fromArray(T.sunDir || [0.35, 0.08, -1]).normalize() }, disk: { value: T.disk || 0.9965 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sun; uniform vec3 sunDir; uniform float disk; varying vec3 vD;
        void main(){ float h = vD.y; vec3 c = h > 0.18 ? mix(mid, top, smoothstep(0.18, 0.75, h)) : mix(hor, mid, smoothstep(-0.02, 0.18, h));
          float s = max(dot(normalize(vD), sunDir), 0.0); c += sun * (pow(s, 6.0) * 0.45 + pow(s, 60.0) * 0.5); c = mix(c, sun * 1.05 + 0.05, smoothstep(disk, disk + 0.0015, s));
          gl_FragColor = vec4(c, 1.0); }` });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat); sky.renderOrder = -10; sc.add(sky);
    const bandTex = tex(256, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.8)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2, h / 3, 0, 0, 7); g.fill(); });
    const bc = T.bands || [0xff9a80, 0xd07aa0, 0xffb08a, 0xb070a0];
    if (T.stars) LS.LobbyThemes.stars(sc, T.stars);
    for (const [x, y, z, sx, i] of [[-60, 52, -230, 160, 0], [70, 70, -240, 130, 1], [10, 38, -220, 200, 2], [-90, 85, -250, 110, 3]]) {
      const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: bandTex, color: bc[i], transparent: true, opacity: T.bandAlpha || 0.55, fog: false, depthWrite: false })); b.scale.set(sx, sx * 0.12, 1); b.position.set(x, y, z); b.renderOrder = -9; sc.add(b);
      L.anims.push({ type: 'drift', m: b, x0: x, sp: rand(0.4, 1.0) });
    }

    // ---------- silhuetas da cidade (3 camadas) ----------
    const blinkGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8), blinkMat = new THREE.MeshBasicMaterial({ color: 0xff3030, fog: false });
    const skyline = (z, col, hMin, hMax, wMin, wMax, windows) => {
      const P2 = [], W = [];
      for (let x = -180; x < 180;) {
        const w = rand(wMin, wMax), h = R() < 0.12 ? rand(hMax, hMax * 1.6) : rand(hMin, hMax); // topo (algumas torres mais altas)
        P2.push([x + w / 2, (h - 60) / 2, z, w, h + 60, 6, col]);                                                    // corpo (base enterrada)
        if (R() < 0.25) P2.push([x + w / 2, h + 1.5, z, w * 0.5, 3, 4, col]);                                        // degrau no topo
        if (R() < 0.18) { P2.push([x + w / 2, h + 4, z, 0.4, 8, 0.4, col]); const a = new THREE.Mesh(blinkGeo, blinkMat); a.position.set(x + w / 2, h + 8.5, z); sc.add(a); L.anims.push({ type: 'blink', m: a, ph: R() * 6 }); }
        if (windows) for (let y = Math.max(-14, h - 40); y < h - 2; y += 3) for (let k = 0; k < Math.floor(w / 3); k++) if (R() < (T.windows || 0.12)) W.push([x + 1.5 + k * 3, y, z + 3.05, 1.2, 1.2, 0.1, R() < 0.7 ? (P.win || 0xffc070) : 0xffe0b0]);
        x += w + rand(0, 2);
      }
      sc.add(new THREE.Mesh(LS.Items.merge(P2), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
      if (W.length) sc.add(new THREE.Mesh(LS.Items.merge(W), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
    };
    skyline(-190, P.city[2], 2, 22, 10, 22, false);
    skyline(-130, P.city[1], -4, 14, 8, 18, false);
    skyline(-75, P.city[0], -10, 6, 7, 15, T.windows !== 0);
    if (T.sea) { const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 260), new THREE.MeshBasicMaterial({ color: T.sea })); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -12, -220); sc.add(sea); }

    // ---------- terraço ----------
    const floorTex = tex(256, 256, T.floorPaint || ((g, w) => { // placas de concreto com juntas
      g.fillStyle = '#d8d0dc'; g.fillRect(0, 0, w, w); const RR = LS.Tex.rng(5);
      for (let i = 0; i < 1400; i++) { const v = 190 + RR() * 50; g.fillStyle = `rgba(${v},${v - 6},${v + 4},0.35)`; g.fillRect(RR() * w, RR() * w, 2, 2); }
      g.strokeStyle = 'rgba(90,80,100,0.6)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, w - 3);
    }));
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(12, 8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 17), new THREE.MeshLambertMaterial({ color: P.roof, map: floorTex }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -3); floor.receiveShadow = true; sc.add(floor);
    // heliponto pintado sob o personagem
    const padTex = tex(512, 512, (g, w) => {
      g.strokeStyle = T.padColor || '#ffc531'; g.lineWidth = 22; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 20, 0, 7); g.stroke();
      g.lineWidth = 6; g.setLineDash([26, 18]); g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 62, 0, 7); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = 'bold 240px "Lilita One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', w / 2, w / 2 + 14);
    });
    const pad = new THREE.Mesh(new THREE.CircleGeometry(2.3, 48), new THREE.MeshLambertMaterial({ map: padTex, transparent: true, opacity: 0.9, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.01; pad.receiveShadow = true; sc.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.38, 2.46, 64), new THREE.MeshBasicMaterial({ color: T.ring || 0xff8a1f, transparent: true, opacity: 0.6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; sc.add(ring); L.ring = ring;
    // parapeito (fundo e laterais) com grade de metal
    S(0, 0, -11.4, 26, 1.0, 0.5, P.wall); S(0, 1.0, -11.4, 26.2, 0.12, 0.62, P.trim);
    for (const sx of [-1, 1]) { S(sx * 12.9, 0, -3, 0.5, 1.0, 17, P.wall); S(sx * 12.9, 1.0, -3, 0.62, 0.12, 17.2, P.trim); }
    for (let x = -12.6; x <= 12.6; x += 1.4) S(x, 1.12, -11.4, 0.06, 0.85, 0.06, 0x2a2434);
    S(0, 1.95, -11.4, 25.4, 0.07, 0.07, 0x2a2434);
    // caixa d'água de madeira sobre pés (fundo à esquerda)
    { const x = -8.6, z = -8.6;
      for (const [a, b] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) S(x + a, 0, z + b, 0.16, 2.4, 0.16, 0x3a2c2a);
      S(x, 2.4, z, 2.3, 0.12, 2.3, 0x3a2c2a);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; S(x + Math.cos(a) * 0.95, 2.52, z + Math.sin(a) * 0.95, 0.75, 2.4, 0.18, 0x7a4e36, 0, -a + Math.PI / 2, 0); }
      for (const y of [2.9, 4.4]) S(x, y, z, 2.1, 0.08, 2.1, 0x2a2232);
      S(x, 4.92, z, 2.2, 0.35, 2.2, 0x5a3a2c); S(x, 5.27, z, 1.1, 0.4, 1.1, 0x5a3a2c); }
    // ar-condicionados (esquerda)
    for (const [x, z] of [[-10.4, -4.5], [-10.4, -2.3]]) { S(x, 0, z, 1.5, 1.0, 1.7, 0x8a8494); S(x + 0.76, 0.2, z, 0.04, 0.6, 1.2, 0x5a5464); for (let i = 0; i < 5; i++) S(x + 0.79, 0.25 + i * 0.12, z, 0.02, 0.05, 1.1, 0x3a3444); S(x, 1.0, z, 0.9, 0.06, 0.9, 0x6a6474); }
    // saída da escada com porta e luminária quente (direita)
    { const x = 9.6, z = -8.2; S(x, 0, z, 3.2, 2.9, 2.6, P.wall); S(x, 2.9, z, 3.5, 0.18, 2.9, P.trim);
      S(x - 1.62, 0, z + 0.2, 0.06, 2.1, 1.1, 0x6a4430); S(x - 1.66, 1.0, z - 0.2, 0.04, 0.08, 0.08, 0xd8c070);
      G(x - 1.66, 2.25, z + 0.2, 0.12, 0.16, 0.5, P.warm); S(x - 1.7, 2.42, z + 0.2, 0.2, 0.06, 0.6, P.trim);
      const pl = new THREE.PointLight(0xffb060, 1.4, 6); pl.position.set(x - 2.2, 2.2, z + 0.2); sc.add(pl); }
    // antena com luz piscando + parabólica
    { const x = 11.2, z = -10.2; S(x, 0, z, 0.5, 0.2, 0.5, P.trim); S(x, 0.2, z, 0.1, 6.2, 0.1, 0x3a3444); for (const y of [2.4, 3.8, 5.1]) S(x, y, z, 1.0 - y * 0.12, 0.05, 0.05, 0x3a3444);
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: 0xff3030 })); a.position.set(x, 6.5, z); sc.add(a); L.anims.push({ type: 'blink', m: a, ph: 1 });
      S(7.2, 2.9, -8.2, 0.12, 0.6, 0.12, 0x3a3444); S(7.2, 3.6, -8.0, 1.1, 1.1, 0.12, 0xb0aab8, -0.5, 0.4, 0); }
    // caixotes de suprimento organizados + lona (direita, à frente)
    for (const [x, y, z, r] of [[8.9, 0, -2.8, 0.1], [10.1, 0, -3.1, -0.05], [9.4, 0.9, -2.95, 0.3]]) { S(x, y, z, 1.0, 0.9, 1.0, 0x5a6a3a, 0, r, 0); S(x, y + 0.42, z, 1.04, 0.08, 1.04, 0x3a4a26, 0, r, 0); }
    S(10.4, 0, -0.9, 1.6, 0.5, 1.2, 0x3a4a5a, 0, 0.2, 0);
    // varal de lâmpadas quentes atravessando o fundo
    S(-7.5, 0, -10.6, 0.12, 4.2, 0.12, 0x2a2434); S(7.5, 0, -10.6, 0.12, 4.2, 0.12, 0x2a2434);
    L.bulbs = [];
    const bulbGeo = new THREE.SphereGeometry(0.09, 8, 6), wire = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, x = -7.5 + t * 15, y = 4.1 - Math.sin(t * Math.PI) * 1.0; wire.push(new THREE.Vector3(x, y, -10.6));
      if (i % 2 === 0 && i > 0 && i < 24) { const b = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: P.warm })); b.position.set(x, y - 0.12, -10.6); sc.add(b); L.bulbs.push({ m: b, ph: R() * 6, i: i / 2 }); } }
    sc.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: 0x1a1420 })));

    // decoração do tema (abóboras, árvore de natal, bonecos de neve, coqueiros...): entra no mesmo lote de blocos
    L.bulbFx = T.bulbs || null;
    if (T.decor) T.decor({ sc, L, S, G, P, R, rand, tex, solid, glow, anim: f => L.anims.push({ type: 'fn', f }) });
    const solidMesh = new THREE.Mesh(LS.Items.merge(solid), LS.Items.material()); solidMesh.castShadow = solidMesh.receiveShadow = true; sc.add(solidMesh);
    if (glow.length) sc.add(new THREE.Mesh(LS.Items.merge(glow), new THREE.MeshBasicMaterial({ vertexColors: true })));

    // ---------- avião do BR cruzando o céu + pássaros ----------
    const pm = LS.PlaneModel.build({ silhouette: 0x2a1e3a }), plane = pm.root; // o mesmo avião do jogo, em silhueta contra o pôr do sol
    plane.rotation.y = Math.PI / 2; plane.position.set(-260, 75, -180); plane.scale.setScalar(0.62); sc.add(plane); L.plane = { g: plane, m: pm, x: -260 };
    if (T.plane === false) plane.visible = false;
    const birdTex = T.birds === 'bats' ? LS.LobbyThemes.batTex() : tex(64, 32, g => { g.strokeStyle = T.birds === 'gulls' ? '#ffffff' : '#1a1028'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(6, 10); g.quadraticCurveTo(20, 8, 32, 20); g.quadraticCurveTo(44, 8, 58, 10); g.stroke(); });
    L.birds = []; L.birdMode = T.birds || 'birds';
    for (let i = 0; i < (T.birds === false ? 0 : 7); i++) { const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: birdTex, fog: false, transparent: true, depthWrite: false })); b.scale.set(2.4, 1.2, 1); sc.add(b);
      L.birds.push({ m: b, off: [(i % 2 ? 1 : -1) * Math.ceil(i / 2) * 3, Math.ceil(i / 2) * -1.4], ph: R() * 6 }); }
  },

  update(L, dt, t) {
    for (const a of L.anims) {
      if (a.type === 'blink') a.m.visible = Math.sin(t * 2.5 + a.ph) > 0.3;
      else if (a.type === 'drift') a.m.position.x = a.x0 + Math.sin(t * 0.03 * a.sp) * 20;
      else if (a.type === 'fn') a.f(t, dt);
    }
    if (L.bulbFx) for (const b of L.bulbs) L.bulbFx(b, t);
    else for (const b of L.bulbs) b.m.material.color.setRGB(1, 0.75 + Math.sin(t * 3 + b.ph) * 0.06, 0.44);
    // avião passa a cada ~40 s
    const p = L.plane; p.x += dt * 16; if (p.x > 300) p.x = -300;
    p.g.position.x = p.x; LS.PlaneModel.animate(p.m, t, dt, false);
    // pássaros em V atravessando devagar
    const bx = ((t * 3.2) % 240) - 120;
    if (L.birdMode === 'bats') { // morcegos: voam soltos e batem asa rápido, passando na frente da lua
      L.birds.forEach((b, i) => { const a = t * (0.35 + i * 0.04) + b.ph; b.m.position.set(Math.sin(a) * (30 + i * 6) + 20, 38 + Math.sin(a * 2.3) * 6 + i * 1.5, -95 + Math.cos(a) * 10); b.m.scale.y = 1.2 * (0.45 + 0.55 * Math.abs(Math.sin(t * 16 + b.ph))); });
    } else for (const b of L.birds) { b.m.position.set(bx + b.off[0], 34 + b.off[1] + Math.sin(t * 0.8) * 1.5, -90); b.m.scale.y = 1.2 * (0.75 + 0.25 * Math.abs(Math.sin(t * 8 + b.ph))); }
  }
};
