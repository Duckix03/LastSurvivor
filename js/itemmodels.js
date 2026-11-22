// Modelos 3D em blocos dos itens: 10 armas, munições, cura e equipamentos (colete, capacete, mochila nv. 1-3).
// Cada modelo é UMA malha (caixas fundidas com cor por vértice): detalhado e barato (1 draw call por item).
// Peça = [x, y, z, largura, altura, profundidade, cor, rotX, rotY, rotZ] com (x,y,z) = centro da caixa.
'use strict';
// marca uma peça como móvel (pente, ferrolho, bomba, alavanca): vira uma malha separada na mão do personagem
const T = (tag, part) => { part.tag = tag; return part; };
LS.Items = {
  _mat: null, _geo: {},
  material() { return this._mat || (this._mat = new THREE.MeshLambertMaterial({ vertexColors: true })); },
  RARITY_NAMES: ['Comum', 'Incomum', 'Raro', 'Lendário'],

  // funde as peças numa geometria só (unit converte "pixels" do personagem em metros)
  merge(parts, unit = 1) {
    const pos = [], nor = [], col = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(), one = new THREE.Vector3(1, 1, 1);
    for (const p of parts) {
      // índices em vez de "const [x, ..., rx = 0] = p": essa desestruturação com valor padrão quebra no Safari/iPhone
      // (bug do JavaScriptCore: "undefined is not a function" depois de rodar muitas vezes) e deixava o lobby preto
      const x = p[0], y = p[1], z = p[2], w = p[3], h = p[4], d = p[5], color = p[6], rx = p[7] || 0, ry = p[8] || 0, rz = p[9] || 0;
      const g = new THREE.BoxGeometry(w * unit, h * unit, d * unit).toNonIndexed();
      m.compose(new THREE.Vector3(x * unit, y * unit, z * unit), q.setFromEuler(e.set(rx, ry, rz)), one);
      g.applyMatrix4(m);
      c.setHex(color);
      const P = g.attributes.position.array, N = g.attributes.normal.array;
      for (let i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(N[i]); }
      for (let i = 0; i < P.length / 3; i++) col.push(c.r, c.g, c.b);
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    return geo;
  },
  // geometria em cache; center = recentraliza (versão "no chão")
  geometry(key, build, unit, center) {
    const k = key + (center ? '@c' : '');
    if (!this._geo[k]) {
      const g = this.merge(build(), unit);
      if (center) { const bb = g.boundingBox, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2; g.translate(-cx, -bb.min.y, -cz); g.computeBoundingBox(); g.computeBoundingSphere(); }
      this._geo[k] = g;
    }
    return this._geo[k];
  },
  mesh(geo) { const m = new THREE.Mesh(geo, this.material()); m.castShadow = true; return m; },

  // ---------------- armas (z = cano para frente, origem = mão no punho) ----------------
  GUNS: {
    m1911: { muzzle: [0.045, 0.21], parts: (G) => [
      [0, 0.045, 0.07, 0.05, 0.055, 0.25, 0x4a4a4e], [0, 0.045, -0.03, 0.054, 0.04, 0.04, 0x38383c], [0, 0.005, 0.08, 0.044, 0.03, 0.2, 0x2a2a2a],
      [0, 0.045, 0.2, 0.03, 0.03, 0.014, 0x111111], [0, -0.06, -0.015, 0.046, 0.12, 0.065, 0x6b4a2a, 0.22], [0, -0.06, -0.015, 0.05, 0.1, 0.04, 0x5a3a1e, 0.22],
      ...G.guard(0.05), [0, 0.065, -0.06, 0.014, 0.025, 0.018, 0x1a1a1a], [0, 0.077, 0.18, 0.008, 0.012, 0.012, 0x111111], [0, 0.077, -0.035, 0.03, 0.012, 0.01, 0x111111], T('mag', [0, -0.12, -0.029, 0.04, 0.02, 0.055, 0x1a1a1a, 0.22])] },
    // Desert Eagle: ferrolho prata grande com trilho reto em cima, serrilhado atrás, guarda-mato quadrado e punho preto
    deagle: { muzzle: [0.05, 0.226], parts: () => {
      const S1 = 0xc4c5c9, S2 = 0xa8a9ad, p = [
        [0, 0.05, 0.085, 0.05, 0.06, 0.27, S1], [0, 0.084, 0.09, 0.03, 0.009, 0.24, 0xb2b3b7], [0, 0.008, 0.07, 0.046, 0.027, 0.2, S2],
        [0, 0.0, -0.05, 0.046, 0.03, 0.04, S2], [0.026, 0.062, 0.04, 0.004, 0.02, 0.05, 0x6a6b6f], [0, 0.05, 0.221, 0.024, 0.024, 0.008, 0x0e0e0e],
        [0, 0.092, 0.205, 0.008, 0.009, 0.01, 0x222222], [0, 0.093, -0.035, 0.028, 0.012, 0.012, 0x222222], [0, 0.072, -0.062, 0.014, 0.03, 0.02, 0x2a2a2a, -0.3],
        [0.027, 0.026, 0.03, 0.004, 0.009, 0.045, 0x2a2a2a], [0, -0.065, -0.025, 0.05, 0.13, 0.07, 0x1e1e1e, 0.2],
        [0.026, -0.065, -0.025, 0.004, 0.1, 0.05, 0x111111, 0.2], [-0.026, -0.065, -0.025, 0.004, 0.1, 0.05, 0x111111, 0.2], T('mag', [0, -0.133, -0.038, 0.052, 0.012, 0.072, 0x2a2a2a, 0.2]),
        [0, -0.035, 0.045, 0.012, 0.01, 0.07, S2], [0, -0.015, 0.08, 0.012, 0.045, 0.01, S2], [0, -0.012, 0.035, 0.008, 0.028, 0.01, 0x222222]];
      for (let i = 0; i < 5; i++) for (const sx of [1, -1]) p.push([sx * 0.026, 0.05, -0.045 + i * 0.008, 0.004, 0.045, 0.004, 0x8a8b8f]); // serrilhado
      return p; } },
    mp5: { muzzle: [0.035, 0.45], parts: (G) => [
      [0, 0.03, 0.08, 0.06, 0.09, 0.32, 0x262626], [0, 0.065, 0.2, 0.03, 0.03, 0.2, 0x2e2e2e], [0, 0.09, -0.04, 0.036, 0.036, 0.036, 0x161616],
      [0, 0.09, 0.25, 0.02, 0.035, 0.03, 0x161616], [0, 0.01, 0.31, 0.075, 0.075, 0.14, 0x1e1e1e], [0, 0.035, 0.41, 0.03, 0.03, 0.08, 0x111111],
      T('mag', [0, -0.09, 0.15, 0.035, 0.12, 0.055, 0x1a1a1a, -0.25]), T('mag', [0, -0.19, 0.18, 0.035, 0.1, 0.055, 0x1a1a1a, -0.5]), ...G.grip(0x1e1e1e), ...G.guard(0.05),
      [0.025, 0.03, -0.17, 0.012, 0.012, 0.18, 0x333333], [-0.025, 0.03, -0.17, 0.012, 0.012, 0.18, 0x333333], [0, 0.0, -0.265, 0.06, 0.1, 0.02, 0x222222]] },
    // UMP: caixa de polímero preta, trilho longo com dentes, carregador reto comprido e coronha esqueletada aberta
    ump: { scale: 1.2, muzzle: [0.074, 0.45], parts: () => {
      const B = 0x26272a, D = 0x1c1c1e, K = 0x141414, p = [
        [0, 0.035, 0.12, 0.062, 0.095, 0.34, B], [0, 0.09, 0.12, 0.05, 0.018, 0.34, 0x1d1e20], [0, 0.108, 0.12, 0.03, 0.016, 0.36, K],
        [0, 0.132, -0.03, 0.032, 0.032, 0.03, K], [0, 0.132, 0.275, 0.02, 0.036, 0.022, K],
        [0, 0.03, 0.335, 0.066, 0.05, 0.1, 0x222326], [0, 0.074, 0.335, 0.052, 0.046, 0.09, 0x1f2022], [0, 0.074, 0.41, 0.026, 0.026, 0.07, 0x0f0f0f], [0, 0.074, 0.44, 0.034, 0.034, 0.02, 0x0f0f0f],
        [-0.032, 0.075, 0.22, 0.02, 0.016, 0.032, K], [0, -0.03, 0.17, 0.05, 0.04, 0.07, B],
        T('mag', [0, -0.14, 0.18, 0.036, 0.2, 0.06, D, -0.08]), T('mag', [0, -0.245, 0.19, 0.042, 0.018, 0.068, K, -0.08]),
        [0, -0.065, -0.02, 0.045, 0.12, 0.06, D, 0.28], [0, -0.045, 0.06, 0.012, 0.01, 0.09, D], [0, -0.02, 0.105, 0.012, 0.05, 0.01, D], [0, -0.02, 0.05, 0.008, 0.03, 0.01, 0x0f0f0f],
        [0, 0.04, -0.06, 0.05, 0.07, 0.03, D], [0, 0.06, -0.17, 0.03, 0.022, 0.24, D], [0, -0.01, -0.185, 0.03, 0.02, 0.238, D, -0.25],
        [0, 0.01, -0.305, 0.034, 0.13, 0.025, K], [0, 0.01, -0.322, 0.036, 0.13, 0.01, 0x0d0d0d]];
      for (let i = 0; i < 11; i++) p.push([0, 0.119, -0.035 + i * 0.031, 0.034, 0.006, 0.012, 0x101010]); // dentes do trilho
      for (const z of [0.02, 0.06, 0.1]) for (const sx of [1, -1]) p.push([sx * 0.032, 0.03, z, 0.004, 0.05, 0.012, 0x1a1b1d]); // nervuras
      return p; } },
    ak47: { muzzle: [0.035, 0.69], parts: (G) => [
      [0, 0.03, 0.1, 0.065, 0.085, 0.36, 0x2e2e2e], [0, 0.078, 0.08, 0.05, 0.014, 0.3, 0x3a3a3a], [0, 0.0, 0.37, 0.07, 0.07, 0.18, 0x8a5228],
      [0, 0.068, 0.36, 0.05, 0.04, 0.16, 0x7a4620], [0, 0.035, 0.55, 0.026, 0.026, 0.2, 0x111111], [0, 0.075, 0.6, 0.016, 0.045, 0.02, 0x1a1a1a],
      [0, 0.035, 0.665, 0.036, 0.036, 0.04, 0x1a1a1a], T('mag', [0, -0.08, 0.2, 0.04, 0.12, 0.07, 0x6a3010, -0.3]), T('mag', [0, -0.18, 0.245, 0.04, 0.11, 0.07, 0x6a3010, -0.6]),
      ...G.grip(0x7a4620, 0.3), ...G.guard(0.05), [0, -0.01, -0.2, 0.05, 0.09, 0.26, 0x8a5228, -0.12], [0, -0.035, -0.34, 0.054, 0.12, 0.02, 0x2a2a2a, -0.12],
      [0.04, 0.05, 0.18, 0.02, 0.015, 0.02, 0x2a2a2a]] },
    m4a1: { muzzle: [0.05, 0.635], parts: (G) => [
      [0, 0.0, 0.1, 0.06, 0.07, 0.28, 0x2d2d2d], [0, 0.06, 0.12, 0.06, 0.06, 0.32, 0x262626], [0, 0.098, 0.18, 0.03, 0.016, 0.42, 0x1a1a1a],
      [0, 0.04, 0.36, 0.074, 0.08, 0.18, 0x222222], [0, 0.04, 0.36, 0.078, 0.012, 0.16, 0x111111], [0, 0.05, 0.52, 0.026, 0.026, 0.16, 0x111111],
      [0, 0.1, 0.47, 0.016, 0.06, 0.02, 0x1a1a1a], [0, 0.05, 0.615, 0.034, 0.034, 0.03, 0x151515], T('mag', [0, -0.1, 0.17, 0.035, 0.15, 0.065, 0x2a2a2a, -0.15]),
      ...G.grip(0x222222), ...G.guard(0.05), [0, 0.04, -0.13, 0.032, 0.032, 0.18, 0x222222], [0, 0.01, -0.21, 0.05, 0.1, 0.12, 0x2a2a2a],
      [0, 0.118, 0.0, 0.03, 0.025, 0.03, 0x1a1a1a]] },
    awm: { muzzle: [0.06, 0.93], pivot: { bolt: [0.03, 0.06, 0.04] }, parts: (G) => [
      [0, 0.0, 0.05, 0.07, 0.1, 0.55, 0x4a6a32], [0, 0.06, 0.15, 0.055, 0.05, 0.3, 0x2a2a2a], [0, 0.06, 0.58, 0.035, 0.035, 0.56, 0x1a1a1a],
      [0, 0.06, 0.885, 0.05, 0.046, 0.07, 0x111111], ...G.scope(0.135, 0.15, 0.34), T('bolt', [0.05, 0.06, 0.04, 0.05, 0.015, 0.015, 0x222222]),
      T('bolt', [0.077, 0.05, 0.04, 0.026, 0.026, 0.026, 0x111111]), [0, -0.01, -0.3, 0.07, 0.15, 0.2, 0x4a6a32], [0, 0.072, -0.28, 0.06, 0.03, 0.16, 0x3a5a28],
      [0, -0.01, -0.41, 0.074, 0.16, 0.02, 0x111111], ...G.grip(0x4a6a32, 0.25), T('mag', [0, -0.07, 0.12, 0.04, 0.07, 0.09, 0x222222]), ...G.guard(0.05),
      [0.02, -0.035, 0.4, 0.012, 0.012, 0.22, 0x222222], [-0.02, -0.035, 0.4, 0.012, 0.012, 0.22, 0x222222]] },
    kar98: { muzzle: [0.035, 0.86], pivot: { bolt: [0.02, 0.045, 0.0] }, parts: (G) => [
      [0, -0.01, 0.2, 0.06, 0.07, 0.7, 0x7a4a24], [0, -0.04, -0.28, 0.06, 0.14, 0.26, 0x7a4a24, -0.15], [0, -0.06, -0.04, 0.05, 0.1, 0.07, 0x6a3e1c, 0.4],
      [0, -0.06, -0.42, 0.062, 0.15, 0.02, 0x2a2a2a, -0.15], [0, 0.04, 0.08, 0.045, 0.04, 0.2, 0x2a2a2a], [0, 0.035, 0.55, 0.026, 0.026, 0.62, 0x1a1a1a],
      [0, 0.045, 0.4, 0.04, 0.026, 0.3, 0x6a3e1c], [0, 0.02, 0.33, 0.066, 0.08, 0.02, 0x2a2a2a], [0, 0.02, 0.54, 0.066, 0.08, 0.02, 0x2a2a2a],
      T('bolt', [0.04, 0.05, 0.0, 0.05, 0.014, 0.014, 0x2a2a2a]), T('bolt', [0.066, 0.04, 0.0, 0.024, 0.024, 0.024, 0x1a1a1a]), ...G.scope(0.11, 0.1, 0.3), ...G.guard(0.04)] },
    m1887: { muzzle: [0.05, 0.71], pivot: { lever: [0, -0.045, 0.1] }, parts: () => [
      [0, 0.02, 0.06, 0.055, 0.08, 0.18, 0x2a2a2a], [0, 0.05, 0.42, 0.032, 0.032, 0.56, 0x1a1a1a], [0, 0.012, 0.36, 0.03, 0.03, 0.42, 0x222222],
      [0, 0.015, 0.3, 0.052, 0.052, 0.18, 0x7a4a24], [0, -0.02, -0.06, 0.045, 0.06, 0.1, 0x7a4a24], [0, -0.03, -0.22, 0.05, 0.08, 0.26, 0x7a4a24, -0.2],
      [0, -0.065, -0.36, 0.054, 0.13, 0.03, 0x5a3416, -0.2], T('lever', [0, -0.055, 0.03, 0.012, 0.012, 0.14, 0x2a2a2a]), T('lever', [0, -0.1, 0.01, 0.012, 0.012, 0.1, 0x2a2a2a]),
      T('lever', [0, -0.078, -0.04, 0.012, 0.05, 0.012, 0x2a2a2a]), T('lever', [0, -0.078, 0.095, 0.012, 0.05, 0.012, 0x2a2a2a]), [0, 0.07, -0.03, 0.014, 0.025, 0.02, 0x1a1a1a]] },
    spas12: { muzzle: [0.06, 0.71], parts: (G) => [
      [0, 0.03, 0.08, 0.06, 0.09, 0.26, 0x1c1c1c], [0, 0.06, 0.45, 0.034, 0.034, 0.5, 0x151515], [0, 0.078, 0.4, 0.046, 0.03, 0.3, 0x2a2a2a],
      [0, 0.094, 0.32, 0.03, 0.006, 0.04, 0x4a4a4a], [0, 0.094, 0.4, 0.03, 0.006, 0.04, 0x4a4a4a], [0, 0.094, 0.48, 0.03, 0.006, 0.04, 0x4a4a4a],
      [0, 0.02, 0.4, 0.032, 0.032, 0.4, 0x222222], T('pump', [0, 0.02, 0.32, 0.062, 0.062, 0.16, 0x2e2e2e]), T('pump', [0, 0.02, 0.32, 0.066, 0.012, 0.12, 0x1a1a1a]),
      ...G.grip(0x222222), ...G.guard(0.05), [0, 0.06, -0.2, 0.015, 0.015, 0.32, 0x333333], [0, -0.02, -0.18, 0.015, 0.015, 0.28, 0x333333],
      [0, 0.02, -0.36, 0.04, 0.1, 0.02, 0x333333]] }
  },
  // peças comuns das armas
  G: {
    grip: (c, r = 0.25) => [[0, -0.07, -0.02, 0.045, 0.12, 0.06, c, r]],
    guard: (z) => [[0, -0.032, z, 0.012, 0.008, 0.06, 0x161616], [0, -0.016, z + 0.032, 0.012, 0.036, 0.008, 0x161616], [0, -0.014, z - 0.008, 0.008, 0.026, 0.01, 0x161616]],
    scope: (y, z, L) => [[0, y, z, 0.046, 0.046, L, 0x111111], [0, y, z + L / 2 + 0.03, 0.064, 0.064, 0.07, 0x111111], [0, y, z - L / 2 - 0.02, 0.056, 0.056, 0.05, 0x111111],
      [0, y, z + L / 2 + 0.066, 0.05, 0.05, 0.004, 0x3a7ac0], [0, y + 0.034, z, 0.03, 0.026, 0.03, 0x222222], [0.034, y, z, 0.026, 0.03, 0.03, 0x222222],
      [0, y - 0.04, z - L / 3, 0.02, 0.034, 0.025, 0x222222], [0, y - 0.04, z + L / 3, 0.02, 0.034, 0.025, 0x222222]]
  },
  gunGeometry(id, center) { return this.geometry('gun:' + id, () => this.GUNS[id].parts(this.G), this.GUNS[id].scale || 1, center); },
  // corpo da arma sem as peças móveis / só uma peça móvel (posições relativas ao pivô)
  gunBody(id) { return this.geometry('gunbody:' + id, () => this.GUNS[id].parts(this.G).filter(p => !p.tag), this.GUNS[id].scale || 1); },
  gunTags(id) { return [...new Set(this.GUNS[id].parts(this.G).filter(p => p.tag).map(p => p.tag))]; },
  gunPart(id, tag) {
    const pv = (this.GUNS[id].pivot || {})[tag] || [0, 0, 0];
    return this.geometry('gunpart:' + id + ':' + tag, () => this.GUNS[id].parts(this.G).filter(p => p.tag === tag).map(p => { const q = p.slice(); q[0] -= pv[0]; q[1] -= pv[1]; q[2] -= pv[2]; return q; }), this.GUNS[id].scale || 1);
  },

  // ---------------- munição e cura ----------------
  AMMO: {
    light: () => { const p = [[0, 0.07, 0, 0.3, 0.14, 0.2, 0xc9a640], [0, 0.07, 0, 0.31, 0.05, 0.21, 0x8a6a20]];
      for (const x of [-0.08, 0, 0.08]) for (const z of [-0.04, 0.04]) p.push([x, 0.16, z, 0.035, 0.05, 0.035, 0xd8a640], [x, 0.195, z, 0.024, 0.024, 0.024, 0x9a9a9a]);
      return p; },
    rifle: () => [[0, 0.1, 0, 0.34, 0.2, 0.16, 0x4a5a32], [0, 0.215, 0, 0.35, 0.03, 0.17, 0x3e4d2a], [0, 0.245, 0, 0.12, 0.02, 0.03, 0x2a2a2a],
      [0.05, 0.234, 0, 0.02, 0.02, 0.02, 0x2a2a2a], [-0.05, 0.234, 0, 0.02, 0.02, 0.02, 0x2a2a2a], [0, 0.1, 0, 0.35, 0.04, 0.17, 0x6fd15a],
      [0.21, 0.06, 0.03, 0.03, 0.12, 0.03, 0xd8a640], [0.21, 0.135, 0.03, 0.02, 0.03, 0.02, 0x3a8a3a], [0.21, 0.06, -0.03, 0.03, 0.12, 0.03, 0xd8a640], [0.21, 0.135, -0.03, 0.02, 0.03, 0.02, 0x3a8a3a]],
    sniper: () => { const p = [[0, 0.02, 0, 0.3, 0.04, 0.14, 0x6a4a2a], [0, 0.08, 0, 0.19, 0.02, 0.045, 0x5a5a5a]];
      for (let i = 0; i < 5; i++) { const x = -0.072 + i * 0.036; p.push([x, 0.13, 0, 0.03, 0.18, 0.03, 0xd8a640], [x, 0.235, 0, 0.02, 0.04, 0.02, 0x4aa3ff]); }
      return p; },
    shell: () => { const p = [];
      for (let r = 0; r < 2; r++) for (let i = 0; i < (r ? 2 : 3); i++) { const x = (i - (r ? 0.5 : 1)) * 0.065, y = 0.032 + r * 0.06;
        p.push([x, y, 0.01, 0.058, 0.058, 0.12, 0xd8352a], [x, y, -0.065, 0.062, 0.062, 0.03, 0xd8a640]); }
      return p; }
  },
  // bola de gelo (vira a parede de gel): bolinha de bloquinhos branco-azulada
  GEL: () => [[0, 0.13, 0, 0.2, 0.2, 0.2, 0xe8fbff], [0, 0.13, 0, 0.26, 0.14, 0.14, 0xbdf2ff], [0, 0.13, 0, 0.14, 0.26, 0.14, 0xd4f7ff], [0, 0.13, 0, 0.14, 0.14, 0.26, 0xa8ecff],
    [0.05, 0.19, 0.08, 0.05, 0.05, 0.05, 0xffffff], [-0.06, 0.08, 0.1, 0.04, 0.04, 0.04, 0x7fdcff]],
  MEDS: {
    medkit: () => [[0, 0.14, 0, 0.44, 0.28, 0.3, 0xf2f2f2], [0, 0.2, 0, 0.45, 0.016, 0.31, 0xc8c8c8],
      [0, 0.13, 0.156, 0.18, 0.06, 0.012, 0xe02020], [0, 0.13, 0.156, 0.06, 0.18, 0.012, 0xe02020], [0, 0.13, -0.156, 0.18, 0.06, 0.012, 0xe02020], [0, 0.13, -0.156, 0.06, 0.18, 0.012, 0xe02020],
      [0, 0.315, 0, 0.14, 0.03, 0.04, 0x555555], [0.06, 0.29, 0, 0.02, 0.03, 0.03, 0x555555], [-0.06, 0.29, 0, 0.02, 0.03, 0.03, 0x555555],
      [0.13, 0.25, 0.157, 0.04, 0.03, 0.014, 0x888888], [-0.13, 0.25, 0.157, 0.04, 0.03, 0.014, 0x888888]],
    bandage: () => [[0, 0.09, 0, 0.13, 0.13, 0.16, 0xf5ead0], [0, 0.09, 0, 0.13, 0.13, 0.16, 0xf5ead0, 0, 0, Math.PI / 4], [0, 0.09, 0, 0.045, 0.045, 0.17, 0xb8ac90],
      [0, 0.009, 0.15, 0.11, 0.012, 0.16, 0xf5ead0], [0.068, 0.09, 0, 0.018, 0.04, 0.12, 0x9a9a9a], [0, 0.016, 0.21, 0.03, 0.006, 0.03, 0xe02020]]
  },

  // ---------------- equipamentos (em "pixels" do personagem: torso y 0..12, cabeça y 0..8) ----------------
  GEAR_COLORS: {
    vest: [null, [0x6a7a4a, 0x55633a], [0x34465e, 0x26364c], [0x232529, 0x16181b]],
    helmet: [null, [0x5a6a3a, 0x46542c], [0x24304a, 0x18203a], [0x1e2024, 0x111214]],
    bag: [null, [0x7a5a3a, 0x5a4028], [0x4a5a38, 0x37442a], [0x2c3226, 0x1e2219]]
  },
  gearParts(kind, lv) {
    const [c, k] = this.GEAR_COLORS[kind][lv], tag = LS.LEVEL_COLORS[lv], p = [];
    if (kind === 'vest') {
      p.push([0, 6.5, 2.4, 8.6, 7, 0.6, c], [0, 6.5, -2.4, 8.6, 7, 0.6, c], [4.3, 6, 0, 0.5, 5, 4.2, c], [-4.3, 6, 0, 0.5, 5, 4.2, c],
        [2.6, 11.2, 0, 1.6, 1.8, 5.4, c], [-2.6, 11.2, 0, 1.6, 1.8, 5.4, c], [-2.6, 10.4, 2.8, 0.9, 0.9, 0.1, tag]);
      if (lv === 1) for (const y of [4.6, 8]) p.push([0, y, 2.72, 8.62, 0.3, 0.08, k], [0, y, -2.72, 8.62, 0.3, 0.08, k]);
      if (lv === 2) { for (const x of [-2.4, 0, 2.4]) p.push([x, 5, 2.95, 1.8, 2.2, 0.5, k]); p.push([1.9, 8.6, 2.75, 3, 0.9, 0.1, 0xe8e8e8]); }
      if (lv === 3) { for (const x of [-2.7, -0.9, 0.9, 2.7]) p.push([x, 5.2, 3.05, 1.5, 2.6, 0.7, k], [x, 6.7, 3.05, 1.1, 0.6, 0.4, 0x0e0e0e]);
        p.push([1.4, 9.2, 2.95, 3.6, 1.4, 0.5, k], [0, 6.5, -2.95, 6, 5, 0.5, k]); }
    } else if (kind === 'helmet') {
      // a faixa vai até o topo da cabeça (y 8) e a tampa é mais larga que a cabeça (8,6 > 8): nenhuma face do capacete
      // fica no mesmo plano da cabeça (antes a tampa tinha 8 de largura e piscava/atravessava nos cantos)
      p.push([0, 6.47, 0, 9, 2.94, 9, c], [0, 8.4, 0, 8.6, 0.9, 8.6, c], [0, 5.0, 0, 9.6, 0.4, 9.6, k]);
      if (lv === 1) p.push([4.62, 4, 0.5, 0.25, 3, 0.6, 0x3a3020], [-4.62, 4, 0.5, 0.25, 3, 0.6, 0x3a3020], [0, 8.85, 0, 5, 0.1, 5, k]);
      if (lv === 2) p.push([0, 4.9, 4.75, 8.4, 2.6, 0.3, 0x6f93b8], [4.6, 6, 3.8, 0.4, 0.6, 0.6, 0x111111], [-4.6, 6, 3.8, 0.4, 0.6, 0.6, 0x111111], [0, 7.0, 0, 9.1, 0.4, 9.1, 0xe8e8e8]);
      if (lv === 3) p.push([4.65, 6.6, 0, 0.3, 0.8, 6, 0x333333], [-4.65, 6.6, 0, 0.3, 0.8, 6, 0x333333], [0, 7.4, 4.75, 1.8, 1.2, 0.5, 0x333333],
        [0, 8.6, 5.0, 3.0, 1.2, 1.4, 0x2a2a2a], [0.8, 8.6, 5.75, 0.9, 0.9, 0.1, 0x3aff7a], [-0.8, 8.6, 5.75, 0.9, 0.9, 0.1, 0x3aff7a],
        [4.8, 4, 0, 0.8, 2.6, 2.6, 0x2a2a2a], [-4.8, 4, 0, 0.8, 2.6, 2.6, 0x2a2a2a]);
      p.push([0, 8.85, -2.6, 1.2, 0.1, 1.2, tag]);
    } else if (kind === 'bag') {
      if (lv === 1) p.push([0, 6, -3.9, 6, 7, 2.2, c], [0, 4.3, -5.3, 4.2, 3, 0.6, k], [0, 9.6, -3.9, 6.2, 0.6, 2.4, k], [2, 8.2, -5.05, 1, 1, 0.1, tag]);
      if (lv === 2) p.push([0, 6.2, -4.3, 7, 8.6, 3, c], [3.7, 5, -4.3, 0.4, 4, 2.2, k], [-3.7, 5, -4.3, 0.4, 4, 2.2, k], [0, 11.1, -4.6, 8.4, 1.8, 1.8, 0xb8a070],
        [0, 4.5, -5.95, 5, 3.4, 0.3, k], [2.5, 8.5, -5.85, 1, 1, 0.1, tag]);
      if (lv === 3) { p.push([0, 6.2, -4.8, 8, 10.4, 4, c], [0, 11.5, -4.9, 8.2, 0.8, 4.2, k], [3.2, 5, -6.9, 1, 1, 0.1, tag]);
        for (const y of [3, 5, 7, 9]) p.push([0, y, -6.85, 7, 0.3, 0.1, k]);
        p.push([0, 1.6, -4.8, 7.6, 1.6, 3.4, 0x6a6a52]); }
    }
    return p;
  },
  gearGeometry(kind, lv, center) { return this.geometry(kind + lv, () => this.gearParts(kind, lv), LS.Skin.PX, center); },

  // ---------------- modelo de qualquer item do chão ----------------
  itemGeometry(it) {
    if (it.type === 'weapon') return this.gunGeometry(it.id, true);
    if (it.type === 'ammo') return this.geometry('ammo:' + it.id, this.AMMO[it.id], 1, true);
    if (it.type === 'med') return this.geometry('med:' + it.id, this.MEDS[it.id], 1, true);
    if (it.type === 'gel') return this.geometry('gel', this.GEL, 1, true);
    return this.gearGeometry(it.type, it.level, true);
  },
  // nível de raridade (0 comum .. 3 lendário) e cor
  rarity(it) {
    if (it.type === 'weapon') return LS.WEAPONS[it.id].rarity;
    if (it.type === 'med') return it.id === 'medkit' ? 2 : 1;
    if (it.type === 'ammo') return 0;
    if (it.type === 'gel') return 2;
    return it.level;
  },
  color(it) { return it.type === 'ammo' ? LS.AMMO_TYPES[it.id].color : LS.LEVEL_COLORS[this.rarity(it)]; }
};

// arma na mão do personagem (mesma API de antes: grupo com userData.muzzle)
LS.buildGunMesh = function (id) {
  const I = LS.Items, g = new THREE.Group(), def = I.GUNS[id], k = def.scale || 1;
  g.add(I.mesh(I.gunBody(id)));
  // peças móveis em grupos de pivô: userData.parts.mag / bolt / pump / lever (animadas pelo personagem)
  g.userData.parts = {};
  for (const tag of I.gunTags(id)) {
    const pv = ((def.pivot || {})[tag] || [0, 0, 0]).map(v => v * k), piv = new THREE.Group();
    piv.position.set(...pv); piv.userData.base = piv.position.clone(); piv.add(I.mesh(I.gunPart(id, tag)));
    g.add(piv); g.userData.parts[tag] = piv;
  }
  g.userData.muzzle = new THREE.Object3D(); g.userData.muzzle.position.set(0, def.muzzle[0] * k, def.muzzle[1] * k); g.add(g.userData.muzzle);
  return g;
};
