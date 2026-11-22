// Mapa das salas personalizadas: ILHA PLANA no mar (longe da ilha principal e do galpão do duelo).
//  - chão de grama com tufos, faixa de areia, borda de pedra descendo pro mar e coqueiros
//  - 20 lugares de nascer: 10 de cada lado (2 fileiras de 5), os lados trocam a cada round
//  - 2 MUROS grandes no meio: depois de um tempo da luta descem devagar pra baixo do chão (ninguém campera)
//  - zona (LS.CustomZone) que fecha devagar, igual pra todos (semente do servidor)
'use strict';
LS.CustomMap = {
  C: { x: 0, z: 660, fy: 0.6, R: 58, beach: 68 },     // centro, altura do chão, raio da grama e da areia
  WALLS: [{ x: -11, z: -8, len: 30 }, { x: 11, z: 8, len: 30 }], WH: 6.5, WT: 1.4, // muros: posição, comprimento, altura, espessura
  WALL_START: 25, WALL_DUR: 22,                        // segundos de luta até começar a descer / quanto demora
  built: false,

  build(scene) {
    if (this.built) { this.group.visible = true; return; }
    this.built = true;
    const C = this.C, W = LS.World, g = this.group = new THREE.Group(); scene.add(g);
    const L = o => new THREE.MeshLambertMaterial(o);
    const tex = (w, h, paint, rx, ry) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || 1); t.magFilter = THREE.NearestFilter; return t;
    };
    const rnd = LS.util.seeded(4321);
    // grama em pixels (estilo bloquinho)
    const grassT = tex(64, 64, (x, w, h) => {
      for (let i = 0; i < w; i += 4) for (let j = 0; j < h; j += 4) { const v = rnd(); x.fillStyle = v < 0.25 ? '#4f9a35' : v < 0.6 ? '#5aad3c' : v < 0.88 ? '#66bb44' : '#78c955'; x.fillRect(i, j, 4, 4); }
    }, C.R / 4, C.R / 4);
    const sandT = tex(64, 64, (x, w, h) => {
      for (let i = 0; i < w; i += 4) for (let j = 0; j < h; j += 4) { const v = rnd(); x.fillStyle = v < 0.3 ? '#e2cf94' : v < 0.75 ? '#ead9a2' : '#f2e3b3'; x.fillRect(i, j, 4, 4); }
    }, 24, 3);
    const rockT = tex(64, 64, (x, w, h) => {
      for (let i = 0; i < w; i += 8) for (let j = 0; j < h; j += 8) { const v = rnd(); x.fillStyle = v < 0.3 ? '#6e6a60' : v < 0.7 ? '#7d786c' : '#8d887b'; x.fillRect(i, j, 8, 8); }
    }, 30, 2);
    const grass = new THREE.Mesh(new THREE.CircleGeometry(C.R, 72).rotateX(-Math.PI / 2), L({ map: grassT }));
    grass.position.set(C.x, C.fy, C.z); grass.receiveShadow = true; g.add(grass);
    const sandG = new THREE.RingGeometry(C.R, C.beach, 72, 1).rotateX(-Math.PI / 2);
    const sand = new THREE.Mesh(sandG, L({ map: sandT })); sand.position.set(C.x, C.fy, C.z); sand.receiveShadow = true; g.add(sand);
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(C.beach, C.beach + 7, C.fy + 9, 72, 1, true), L({ map: rockT }));
    cliff.position.set(C.x, (C.fy - 9) / 2, C.z); g.add(cliff);
    // o "chão" da ilha (o terreno nem chega aqui): só segura em pé, não empurra
    W.addCollider(C.x - C.beach - 2, -9, C.z - C.beach - 2, C.x + C.beach + 2, C.fy, C.z + C.beach + 2).floor = true;
    // tufos de grama (instâncias)
    const bladeT = tex(16, 16, (x) => {
      x.clearRect(0, 0, 16, 16);
      [[2, 6, '#7fd05a'], [5, 2, '#9be070'], [8, 5, '#8ad864'], [11, 1, '#a8e87e'], [13, 7, '#7fd05a']].forEach(([px, top, col]) => { x.fillStyle = col; x.fillRect(px, top, 2, 16 - top); });
    });
    bladeT.wrapS = bladeT.wrapT = THREE.ClampToEdgeWrapping;
    const tuft = new THREE.PlaneGeometry(0.7, 0.3); tuft.translate(0, 0.15, 0);
    const t2 = tuft.clone().rotateY(Math.PI / 2), merged = this.merge([tuft, t2]);
    const N = 1800, im = new THREE.InstancedMesh(merged, L({ map: bladeT, alphaTest: 0.5, side: THREE.DoubleSide }), N);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (C.R - 1.5);
      p.set(C.x + Math.cos(a) * r, C.fy, C.z + Math.sin(a) * r);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI); const k = 0.7 + rnd() * 0.6; s.set(k, k * (0.7 + rnd() * 0.5), k);
      M.compose(p, q, s); im.setMatrixAt(i, M); im.setColorAt(i, col.setHSL(0.27 + rnd() * 0.05, 0.45, 0.72 + rnd() * 0.12)); // a cor multiplica a textura: claro = mais perto da grama do chão
    }
    im.receiveShadow = true; g.add(im);
    // muros (bloco de concreto com faixas) — descem pra baixo do chão durante a luta
    const wallT = tex(64, 64, (x, w, h) => {
      for (let j = 0; j < h; j += 8) for (let i = 0; i < w; i += 16) { const off = (j / 8) % 2 ? 8 : 0, v = rnd(); x.fillStyle = v < 0.4 ? '#9c978c' : v < 0.8 ? '#a9a498' : '#b4afa3'; x.fillRect((i + off) % w, j, 15, 7); }
      x.fillStyle = '#d8b21c'; x.fillRect(0, 56, 64, 8); x.fillStyle = '#222'; for (let i = 0; i < 64; i += 16) x.fillRect(i, 56, 8, 8);
    }, 1, 1);
    this.walls = this.WALLS.map(wd => {
      const geo = new THREE.BoxGeometry(this.WT, this.WH, wd.len), uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (i >= 16 && i < 24 ? 1 : wd.len / 4), uv.getY(i) * (this.WH / 4)); // tijolo na escala certa
      const mesh = new THREE.Mesh(geo, L({ map: wallT })); mesh.castShadow = true; mesh.receiveShadow = true;
      const x = C.x + wd.x, z = C.z + wd.z; mesh.position.set(x, C.fy + this.WH / 2, z); g.add(mesh);
      const col = W.addCollider(x - this.WT / 2, C.fy, z - wd.len / 2, x + this.WT / 2, C.fy + this.WH, z + wd.len / 2);
      return { mesh, col, x, z };
    });
    // coqueiros na areia (com tronco que segura)
    const trunkM = L({ color: 0x8a6440 }), leafM = L({ color: 0x3f9a3a, side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + 0.3, r = C.R + 4 + (i % 3);
      const x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r, h = 5 + (i % 3);
      const palm = new THREE.Group(); palm.position.set(x, C.fy, z); palm.rotation.y = a; g.add(palm);
      for (let k = 0; k < h; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.02, 0.5), trunkM); b.position.set(k * 0.06, k + 0.5, 0); b.castShadow = true; palm.add(b); }
      for (let k = 0; k < 6; k++) { const lf = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.7), leafM); lf.position.set(h * 0.06, h + 0.1, 0); lf.rotation.y = k / 6 * Math.PI * 2; lf.rotation.z = -0.35; lf.geometry.translate(1.3, 0, 0); lf.castShadow = true; palm.add(lf); }
      W.addCollider(x - 0.3, C.fy, z - 0.3, x + 0.3, C.fy + h, z + 0.3);
    }
    this.setWalls(0);
  },
  show(v) { if (this.group) this.group.visible = v; },
  merge(geos) { // junta geometrias simples (sem índice) numa só
    const parts = geos.map(gg => gg.index ? gg.toNonIndexed() : gg), out = new THREE.BufferGeometry();
    ['position', 'normal', 'uv'].forEach(k => {
      const n = parts.reduce((a, gg) => a + gg.attributes[k].array.length, 0), arr = new Float32Array(n); let o = 0;
      parts.forEach(gg => { arr.set(gg.attributes[k].array, o); o += gg.attributes[k].array.length; });
      out.setAttribute(k, new THREE.BufferAttribute(arr, parts[0].attributes[k].itemSize));
    });
    return out;
  },
  // k = 0: muros em pé · k = 1: lá embaixo do chão
  setWalls(k) {
    if (!this.walls) return;
    k = LS.util.clamp(k, 0, 1); if (k === this.wallK) return; this.wallK = k;
    const C = this.C, off = k * (this.WH + 0.4);
    for (const w of this.walls) {
      w.mesh.position.y = C.fy + this.WH / 2 - off;
      w.mesh.visible = k < 1;
      w.col.maxY = C.fy + this.WH - off; w.col.minY = C.fy - off - 0.2;
    }
  },
  // segundos de luta → altura dos muros (igual pra todos)
  wallsAt(t) { return (t - this.WALL_START) / this.WALL_DUR; },
  // onde cada um nasce: side = -1 (esquerda) ou 1; i = 0..9 (2 fileiras de 5)
  spawn(side, i) {
    const C = this.C, row = Math.floor(i / 5), c = i % 5;
    return { x: C.x + side * (40 + row * 3.4), z: C.z + (c - 2) * 3.8, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 };
  },
  inside(f) { // não deixa sair da ilha (a borda de pedra)
    const C = this.C, dx = f.pos.x - C.x, dz = f.pos.z - C.z, d = Math.hypot(dx, dz), M = C.beach - 1.2;
    if (d > M) { f.pos.x = C.x + dx * M / d; f.pos.z = C.z + dz * M / d; }
  }
};

// zona da ilha plana: começa cobrindo a ilha e fecha devagar (centro sorteado pela semente do servidor)
LS.CustomZone = class extends LS.Zone {
  constructor(scene) {
    super(scene);
    this.phases = [
      { wait: 22, shrink: 38, r: 34, dps: 3 },
      { wait: 14, shrink: 32, r: 15, dps: 6 },
      { wait: 10, shrink: 26, r: 0, dps: 12 }
    ];
    this.msgTitle = 'A ZONA ESTÁ FECHANDO!'; this.msgSub = 'Fique dentro do círculo';
    this.reset();
  }
  reset() {
    const C = LS.CustomMap.C;
    this.center = new THREE.Vector2(C.x, C.z); this.radius = C.beach + 6;
    this.startC = this.center.clone(); this.startR = this.radius;
    this.phase = 0; this.shrinking = false; this.timer = this.phases[0].wait; this.dmgT = 1; this.finished = false;
    this.pickNext();
  }
  pickNext() {
    const C = LS.CustomMap.C, R = this.rng || Math.random, ph = this.phases[Math.min(this.phase, this.phases.length - 1)];
    this.nextR = ph.r;
    const off = Math.max(0, Math.min(this.radius, C.beach) - ph.r) * 0.4, a = R() * Math.PI * 2, o = R() * off;
    let x = this.center.x + Math.cos(a) * o, z = this.center.y + Math.sin(a) * o;
    const d = Math.hypot(x - C.x, z - C.z), lim = Math.max(0, C.R - 8 - ph.r); // o círculo novo fica na grama
    if (d > lim && d > 0) { x = C.x + (x - C.x) * lim / d; z = C.z + (z - C.z) * lim / d; }
    this.next = new THREE.Vector2(x, z);
    this.target = this.next; this.targetR = this.nextR;
  }
};
