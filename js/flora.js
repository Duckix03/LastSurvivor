// Árvores e arbustos estilo cartoon: modelos low-poly montados por código (cor por vértice, faces chapadas),
// sombreado "toon" em 3 tons e textura de folhas. Instanciados por espécie (poucas draw calls).
'use strict';
LS.Flora = {
  geos: {},
  // gradiente de 3 degraus do sombreado cartoon
  toonGrad() {
    if (!this._grad) {
      const t = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.LuminanceFormat);
      t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; this._grad = t;
    }
    return this._grad;
  },
  material(tex) {
    const k = '_m' + tex;
    if (!this[k]) {
      const m = LS.Tex.triplanar(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: this.toonGrad() }), tex), base = m.onBeforeCompile;
      m.onBeforeCompile = sh => { // neve em cima das copas e dos arbustos (só nas faces viradas pra cima)
        base(sh); sh.uniforms.uSnow = LS.Tex.snowU;
        sh.fragmentShader = 'uniform float uSnow;\n' + sh.fragmentShader.replace('diffuseColor.rgb *= texture2D(tpMap, tpUV * tpScale).rgb * tpGain;',
          'diffuseColor.rgb *= texture2D(tpMap, tpUV * tpScale).rgb * tpGain;\n if (uSnow > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.88, 0.95), uSnow * 0.8 * smoothstep(0.55, 0.92, vTpN.y));');
      };
      m.customProgramCacheKey = () => 'tp_' + tex + '_flora_snow';
      this[k] = m;
    }
    return this[k];
  },
  // junta peças (geometria + posição/escala/rotação + cor) numa malha só, com faces chapadas
  merge(parts) {
    const pos = [], col = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    for (const p of parts) {
      const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
      m.compose(new THREE.Vector3(...p.p), q.setFromEuler(e.set(...(p.r || [0, 0, 0]))), new THREE.Vector3(...(p.s || [1, 1, 1])));
      g.applyMatrix4(m);
      const P = g.attributes.position.array;
      for (let i = 0; i < P.length; i += 9) { // cada triângulo com um tom levemente diferente (visual "facetado")
        c.setHex(p.c).multiplyScalar(0.92 + ((i * 7919) % 17) / 100);
        for (let k = 0; k < 9; k++) pos.push(P[i + k]);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b);
      }
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    return geo;
  },
  ico: r => new THREE.IcosahedronGeometry(r, 0), // 20 triângulos (antes 80): low-poly de verdade e 4x mais leve
  cone: (r, h) => new THREE.ConeGeometry(r, h, 7),
  cyl: (a, b, h) => new THREE.CylinderGeometry(a, b, h, 5),
  // espécies: tronco + copa (mesma matriz de instância); alturas em metros para escala 1
  SPECIES: {
    pinheiro: F => ({
      trunk: [{ g: F.cyl(0.16, 0.3, 2.3), p: [0, 1.05, 0], c: 0x6b4426 }],
      crown: [{ g: F.cone(2.1, 2.4), p: [0, 2.4, 0], c: 0x2e7a3e }, { g: F.cone(1.65, 2.2), p: [0, 3.6, 0], c: 0x3a8c45 }, { g: F.cone(1.15, 1.9), p: [0, 4.7, 0], c: 0x4aa050 }],
      height: 5.7, trunkR: 0.3 }),
    abeto: F => ({
      trunk: [{ g: F.cyl(0.14, 0.26, 2.1), p: [0, 0.95, 0], c: 0x5e3c22 }],
      crown: [{ g: F.cone(1.7, 2.1), p: [0, 2.2, 0], c: 0x2a6e44 }, { g: F.cone(1.45, 2.0), p: [0, 3.2, 0], c: 0x337d4c }, { g: F.cone(1.15, 1.8), p: [0, 4.15, 0], c: 0x3e8c55 },
        { g: F.cone(0.8, 1.6), p: [0, 5.0, 0], c: 0x4a9a60 }],
      height: 5.8, trunkR: 0.26 }),
    redonda: F => ({
      trunk: [{ g: F.cyl(0.2, 0.32, 2.7), p: [0, 1.25, 0], c: 0x7a4e2a }, { g: F.cyl(0.07, 0.11, 1.1), p: [0.42, 2.35, 0], r: [0, 0, -0.85], c: 0x7a4e2a },
        { g: F.cyl(0.06, 0.1, 0.9), p: [-0.35, 2.5, 0.2], r: [0.3, 0, 0.8], c: 0x7a4e2a }],
      crown: [{ g: F.ico(1.55), p: [0, 3.55, 0], c: 0x5aa83c }, { g: F.ico(1.05), p: [1.0, 3.15, 0.3], c: 0x4c9632 }, { g: F.ico(1.15), p: [-0.9, 3.25, -0.4], c: 0x66b444 },
        { g: F.ico(1.05), p: [0.2, 4.45, 0.1], c: 0x58a03a }, { g: F.ico(0.95), p: [-0.2, 3.05, 0.95], c: 0x4a8f30 }],
      height: 5.4, trunkR: 0.32 }),
    oval: F => ({
      trunk: [{ g: F.cyl(0.17, 0.28, 3.0), p: [0, 1.4, 0], c: 0x8a6a4a }],
      crown: [{ g: F.ico(1.25), p: [0, 4.0, 0], s: [1, 1.45, 1], c: 0x78b83e }, { g: F.ico(0.85), p: [0.75, 3.4, 0.2], c: 0x6aaa34 }, { g: F.ico(0.8), p: [-0.65, 3.6, -0.3], c: 0x86c44a },
        { g: F.ico(0.7), p: [0.1, 5.35, 0.1], c: 0x8acc50 }],
      height: 6.0, trunkR: 0.28 }),
    outono: F => {
      const t = F.SPECIES.redonda(F), cs = [0xe08a2a, 0xd2702a, 0xf0a040, 0xe6952e, 0xc8602a];
      t.crown.forEach((p, i) => p.c = cs[i % cs.length]); return t;
    },
    // arbustos (sem tronco)
    arbusto: F => ({ crown: [{ g: F.ico(0.7), p: [0, 0.45, 0], c: 0x4a9a3a }, { g: F.ico(0.5), p: [0.55, 0.35, 0.15], c: 0x3f8a35 },
      { g: F.ico(0.55), p: [-0.5, 0.38, -0.1], c: 0x55a640 }, { g: F.ico(0.45), p: [0.05, 0.78, -0.12], c: 0x5fb048 }] }),
    frutinhas: F => { const b = F.SPECIES.arbusto(F), R = LS.Tex.rng(11);
      for (let i = 0; i < 12; i++) { const a = R() * 6.28, y = 0.3 + R() * 0.55; b.crown.push({ g: new THREE.IcosahedronGeometry(0.075, 0), p: [Math.cos(a) * 0.72, y, Math.sin(a) * 0.62], c: 0xd8283a }); }
      return b; },
    florido: F => { const b = F.SPECIES.arbusto(F), R = LS.Tex.rng(23);
      for (let i = 0; i < 14; i++) { const a = R() * 6.28, y = 0.4 + R() * 0.55; b.crown.push({ g: new THREE.IcosahedronGeometry(0.08, 0), p: [Math.cos(a) * 0.66, y, Math.sin(a) * 0.58], c: R() < 0.5 ? 0xff8ac8 : 0xfff4a0 }); }
      return b; }
  },
  spec(kind) {
    if (!this.geos[kind]) {
      const d = this.SPECIES[kind](this);
      this.geos[kind] = { trunk: d.trunk ? this.merge(d.trunk) : null, crown: this.merge(d.crown), height: d.height || 1.2, trunkR: d.trunkR || 0 };
    }
    return this.geos[kind];
  },
  // escolhe a espécie de uma árvore / arbusto
  pickTree() { const r = Math.random(); return r < 0.27 ? 'pinheiro' : r < 0.5 ? 'abeto' : r < 0.78 ? 'redonda' : r < 0.9 ? 'oval' : 'outono'; },
  pickBush() { const r = Math.random(); return r < 0.6 ? 'arbusto' : r < 0.82 ? 'frutinhas' : 'florido'; },
  // list: [{ kind, x, y, z, s, rot }] -> InstancedMesh por espécie e por PEDAÇO do mapa (130 m):
  // cada pedaço tem sua própria esfera de recorte, então só é desenhado o que a câmera (e a sombra) enxerga.
  CHUNK: 130,
  instance(scene, list, shadow = true) {
    const groups = {}, C = this.CHUNK;
    for (const it of list) { const k = it.kind + '|' + Math.floor(it.x / C) + '|' + Math.floor(it.z / C); (groups[k] || (groups[k] = [])).push(it); }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), out = [];
    for (const k in groups) {
      const arr = groups[k], sp = this.spec(arr[0].kind);
      // esfera que envolve todas as instâncias do pedaço
      let cx = 0, cy = 0, cz = 0; for (const it of arr) { cx += it.x; cy += it.y; cz += it.z; } cx /= arr.length; cy /= arr.length; cz /= arr.length;
      let r = 0; for (const it of arr) r = Math.max(r, Math.hypot(it.x - cx, it.y - cy, it.z - cz) + (sp.height || 2) * it.s * 1.2 + 2);
      const parts = [[sp.crown, this.material('leaves')]]; if (sp.trunk) parts.push([sp.trunk, this.material('bark')]);
      for (const [geo, mat] of parts) {
        const g = new THREE.BufferGeometry(); for (const a in geo.attributes) g.setAttribute(a, geo.attributes[a]); // mesmos dados, esfera própria
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy + (sp.height || 1) * 0.5, cz), r);
        const im = new THREE.InstancedMesh(g, mat, arr.length);
        arr.forEach((it, i) => { q.setFromAxisAngle(up, it.rot); m.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.s, it.s * (it.sy || 1), it.s)); im.setMatrixAt(i, m); });
        im.frustumCulled = true; im.castShadow = shadow; im.receiveShadow = true; scene.add(im); out.push(im);
      }
    }
    return out;
  }
};
