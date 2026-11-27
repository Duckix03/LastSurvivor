// Construções, árvores, rochas e arbustos
'use strict';
Object.assign(LS.World, {
  buildings: [], unitBox: null, matCache: {},

  mat(color) {
    if (!this.matCache[color]) this.matCache[color] = new THREE.MeshLambertMaterial({ color });
    return this.matCache[color];
  },
  // caixa visual (+ colisor opcional). cx,cz = centro; y0 = base
  // as caixas são agrupadas por cor e viram InstancedMesh (poucas draw calls)
  // tex (opcional): textura da parede ('plaster', 'planks', 'brick')
  box(scene, cx, y0, cz, w, h, d, color, collide = true, shadow = true, tex) {
    if (!this.boxBatches) this.boxBatches = {};
    const key = color + (shadow ? 's' : 'n') + (tex || '');
    if (!this.boxBatches[key]) this.boxBatches[key] = { color, shadow, tex, mats: [] };
    this.boxBatches[key].mats.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, y0, cz), new THREE.Quaternion(), new THREE.Vector3(w, h, d)));
    if (collide === true) this.addCollider(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2);
  },
  // caixa só visual com rotação (telhados inclinados)
  boxR(cx, y0, cz, w, h, d, color, quat) {
    if (!this.boxBatches) this.boxBatches = {};
    const key = color + 's';
    if (!this.boxBatches[key]) this.boxBatches[key] = { color, shadow: true, mats: [] };
    this.boxBatches[key].mats.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, y0, cz), quat, new THREE.Vector3(w, h, d)));
  },
  finalizeBoxes(scene) {
    if (!this.unitBox) { this.unitBox = new THREE.BoxGeometry(1, 1, 1); this.unitBox.translate(0, 0.5, 0); }
    // todas as caixas da mesma "família" (sem textura / com a mesma textura, com ou sem sombra) viram UM InstancedMesh por pedaço
    // de 330 m, com a cor em cada caixa (instanceColor). Antes era um por COR: ~450 draw calls só de casas (muitas com 1 caixa só).
    // MAPA IGUAL EM TODOS OS APARELHOS: o three.js gasta 4 Math.random() (o sorteio com semente do mapa) a cada malha/geometria/material
    // criado. Pra árvores e pedras (geradas depois daqui) ficarem no MESMO lugar da versão antiga, os materiais por cor continuam sendo
    // criados como antes e a diferença de malhas é "queimada" no sorteio no final.
    const C = 330, v = new THREE.Vector3(), sc = new THREE.Vector3(), qq = new THREE.Quaternion(), col = new THREE.Color();
    const chunkKey = (mm, n) => (n < 400 ? 'all' : Math.floor(mm.elements[12] / C) + '|' + Math.floor(mm.elements[14] / C));
    const fam = {}, glassMat = {};
    let oldChunks = 0;
    for (const k in this.boxBatches) {
      const bt = this.boxBatches[k], glass = bt.color === LS.GLASS;
      // igual ao código antigo: material por cor (fica no cache; quem pedir essa cor depois recebe o mesmo)
      if (glass) glassMat[k] = new THREE.MeshPhongMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.32, shininess: 120, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      else if (bt.tex) LS.Tex.material(bt.color, bt.tex); else this.mat(bt.color);
      const seen = {}; for (const mm of bt.mats) seen[chunkKey(mm, bt.mats.length)] = 1; oldChunks += Object.keys(seen).length;
      const fk = glass ? 'glass' + k : (bt.tex || 'plain') + (bt.shadow ? 's' : 'n');
      const f = fam[fk] || (fam[fk] = { glass, gk: k, tex: bt.tex, shadow: bt.shadow, items: [] });
      for (const mm of bt.mats) f.items.push([mm, bt.color]);
    }
    const R = Math.random; let used = 0;
    Math.random = () => { used++; return R(); };
    try {
      for (const fk in fam) {
        const f = fam[fk];
        const mat = f.glass ? glassMat[f.gk] : f.tex ? LS.Tex.material(0xffffff, f.tex) : this.mat(0xffffff);
        const chunks = {};
        for (const it of f.items) { const ck = chunkKey(it[0], f.items.length); (chunks[ck] || (chunks[ck] = [])).push(it); }
        for (const ck in chunks) {
          const list = chunks[ck], box = new THREE.Box3();
          for (const it of list) { it[0].decompose(v, qq, sc); const r = Math.hypot(sc.x, sc.y, sc.z) * 0.5; box.expandByPoint(new THREE.Vector3(v.x - r, v.y - r, v.z - r)); box.expandByPoint(new THREE.Vector3(v.x + r, v.y + sc.y + r, v.z + r)); }
          const g = new THREE.BufferGeometry(); g.setIndex(this.unitBox.index); for (const a in this.unitBox.attributes) g.setAttribute(a, this.unitBox.attributes[a]);
          g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
          const im = new THREE.InstancedMesh(g, mat, list.length);
          list.forEach((it, i) => { im.setMatrixAt(i, it[0]); if (!f.glass) im.setColorAt(i, col.set(it[1])); });
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
          im.castShadow = f.shadow; im.receiveShadow = true; im.frustumCulled = true;
          scene.add(im);
        }
      }
    } finally { Math.random = R; }
    const want = oldChunks * 2 * 4; // antes: 1 geometria + 1 malha por pedaço, 4 sorteios cada
    if (used > want) console.warn('finalizeBoxes: sorteio passou do antigo', used, want);
    for (let n = used; n < want; n++) R();
    this.boxBatches = {};
  },
  // parede ao longo de X (axis='x') ou Z, com porta opcional no centro
  wall(scene, cx, y0, cz, len, h, t, axis, color, door) {
    if (!door) {
      if (axis === 'x') this.box(scene, cx, y0, cz, len, h, t, color); else this.box(scene, cx, y0, cz, t, h, len, color);
      return;
    }
    const dw = 1.8, dh = 2.5, seg = (len - dw) / 2, off = dw / 2 + seg / 2;
    if (axis === 'x') {
      this.box(scene, cx - off, y0, cz, seg, h, t, color); this.box(scene, cx + off, y0, cz, seg, h, t, color);
      this.box(scene, cx, y0 + dh, cz, dw, h - dh, t, color);
    } else {
      this.box(scene, cx, y0, cz - off, t, h, seg, color); this.box(scene, cx, y0, cz + off, t, h, seg, color);
      this.box(scene, cx, y0 + dh, cz, t, h - dh, dw, color);
    }
  },
  house(scene, cx, cz, w, d) {
    const y0 = this.heightAt(cx, cz) - 0.05, h = 3.6, t = 0.35;
    const colors = [0xe8dcc4, 0xd9a07a, 0xb7c9a8, 0xc9c3d6, 0xe6c26e, 0xa7c4d9, 0xf0f0f0];
    const col = LS.util.pick(colors), roofCol = LS.util.pick([0x8a3b2a, 0x5a4a42, 0x3d5a6b, 0x6b4a2a]);
    const doorSide = LS.util.randInt(0, 3);
    this.wall(scene, cx, y0, cz - d / 2, w, h, t, 'x', col, doorSide === 0);
    this.wall(scene, cx, y0, cz + d / 2, w, h, t, 'x', col, doorSide === 1);
    this.wall(scene, cx - w / 2, y0, cz, d - t, h, t, 'z', col, doorSide === 2);
    this.wall(scene, cx + w / 2, y0, cz, d - t, h, t, 'z', col, doorSide === 3 || (w > 11 && doorSide === 2));
    this.box(scene, cx, y0, cz, w - t, 0.08, d - t, 0x8a6a4a, false, false); // piso
    this.box(scene, cx, y0 + h, cz, w + 0.8, 0.45, d + 0.8, roofCol);      // telhado
    // móveis simples (cobertura)
    if (Math.random() < 0.7) this.box(scene, cx + LS.util.rand(-w / 4, w / 4), y0, cz + LS.util.rand(-d / 4, d / 4), 1.6, 0.9, 0.9, 0x6b4a2a);
    const n = LS.util.randInt(2, 3);
    for (let i = 0; i < n; i++) this.lootSpots.push({ x: cx + LS.util.rand(-w / 2 + 1.2, w / 2 - 1.2), z: cz + LS.util.rand(-d / 2 + 1.2, d / 2 - 1.2), y: y0 + 0.1, indoor: true });
    this.buildings.push({ x: cx, z: cz, w, d, color: col });
  },
  tower(scene, cx, cz, w, d) {
    const y0 = this.heightAt(cx, cz) - 0.1, h = LS.util.rand(9, 22);
    const col = LS.util.pick([0x9aa3ad, 0xc4b8a8, 0x7d8a96, 0xb0a090]);
    this.box(scene, cx, y0, cz, w, h, d, col, true, true, 'plaster');
    for (let y = 2; y < h - 1; y += 3) { // faixas de janelas
      this.box(scene, cx, y0 + y, cz, w + 0.16, 1.1, d + 0.16, 0x2b3a4a, false, false);
    }
    this.box(scene, cx, y0 + h, cz, w - 1, 1.2, d - 1, 0x666666);
    this.buildings.push({ x: cx, z: cz, w, d, color: col });
    // loot ao redor
    this.lootSpots.push({ x: cx + w / 2 + 1.5, z: cz, y: this.heightAt(cx + w / 2 + 1.5, cz) + 0.1 });
  },
  container(scene, cx, cz, alongX) {
    const y0 = this.heightAt(cx, cz) - 0.1, col = LS.util.pick([0xb03a2e, 0x2e6bb0, 0x3a8a3a, 0xc98a1e, 0x6a6a6a]);
    if (alongX) this.box(scene, cx, y0, cz, 6, 2.6, 2.4, col); else this.box(scene, cx, y0, cz, 2.4, 2.6, 6, col);
    this.buildings.push({ x: cx, z: cz, w: alongX ? 6 : 2.4, d: alongX ? 2.4 : 6, color: col });
    const ox = alongX ? 0 : 2.2, oz = alongX ? 2.2 : 0;
    this.lootSpots.push({ x: cx + ox, z: cz + oz, y: this.heightAt(cx + ox, cz + oz) + 0.1 });
  },
  // colisores de uma pedra girada: fatia a malha em camadas horizontais e usa a caixa de cada fatia.
  // Assim a pedra é sólida onde aparece (antes o colisor era um quadrado menor e dava para entrar nela).
  // Retorna o maior x ocupado (para colocar loot ao lado).
  rockColliders(geo, mtx, h, layers = 5) {
    const pa = geo.attributes.position, V = [];
    for (let i = 0; i < pa.count; i++) V.push(new THREE.Vector3().fromBufferAttribute(pa, i).applyMatrix4(mtx));
    // triângulos da pedra no mundo: a altura de quem pisa vem da superfície de verdade (não do topo das camadas)
    const tris = new Float32Array(V.length * 3); V.forEach((v, i) => { tris[i * 3] = v.x; tris[i * 3 + 1] = v.y; tris[i * 3 + 2] = v.z; });
    let yMin = Infinity, yMax = -Infinity, xMax = -Infinity;
    for (const v of V) { yMin = Math.min(yMin, v.y); yMax = Math.max(yMax, v.y); xMax = Math.max(xMax, v.x); }
    const y0 = Math.max(yMin, h - 1), field = this.rockField(V, yMin);
    for (let k = 0; k < layers; k++) {
      const a = y0 + (yMax - y0) * k / layers, b = y0 + (yMax - y0) * (k + 1) / layers;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      const add = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
      for (const v of V) if (v.y >= a && v.y <= b) add(v.x, v.z);
      for (let t = 0; t < V.length; t += 3) for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
        const p = V[t + i], q = V[t + j];
        for (const yp of [a, b]) if ((p.y - yp) * (q.y - yp) < 0) { const s = (yp - p.y) / (q.y - p.y); add(p.x + (q.x - p.x) * s, p.z + (q.z - p.z) * s); }
      }
      if (x0 > x1) continue;
      const sh = 0.04; // um fio menor que a pedra: sem parede invisível nas quinas
      const col = this.addCollider(x0 + sh, k === 0 ? Math.min(a, h - 1) : a, z0 + sh, x1 - sh, b, z1 - sh); col.climb = true; col.rockTris = tris; col.rock = field;
    }
    return xMax;
  },
  // mapa de altura da superfície da pedra (células de 20 cm): a colisão e o chão vêm do formato de verdade,
  // não das caixas das camadas (que sobram nas quinas e empurravam/deixavam atravessar)
  rockField(V, yMin) {
    const cs = 0.2;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const v of V) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); }
    const nx = Math.max(1, Math.ceil((x1 - x0) / cs)), nz = Math.max(1, Math.ceil((z1 - z0) / cs)), h = new Float32Array(nx * nz).fill(-Infinity);
    for (let t = 0; t < V.length; t += 3) {
      const A = V[t], B = V[t + 1], Cc = V[t + 2];
      const d = (B.z - Cc.z) * (A.x - Cc.x) + (Cc.x - B.x) * (A.z - Cc.z); if (Math.abs(d) < 1e-9) continue;
      const i0 = Math.max(0, Math.floor((Math.min(A.x, B.x, Cc.x) - x0) / cs)), i1 = Math.min(nx - 1, Math.floor((Math.max(A.x, B.x, Cc.x) - x0) / cs));
      const k0 = Math.max(0, Math.floor((Math.min(A.z, B.z, Cc.z) - z0) / cs)), k1 = Math.min(nz - 1, Math.floor((Math.max(A.z, B.z, Cc.z) - z0) / cs));
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) * cs, z = z0 + (k + 0.5) * cs;
        const u = ((B.z - Cc.z) * (x - Cc.x) + (Cc.x - B.x) * (z - Cc.z)) / d, w = ((Cc.z - A.z) * (x - Cc.x) + (A.x - Cc.x) * (z - Cc.z)) / d, q = 1 - u - w;
        if (u < -1e-3 || w < -1e-3 || q < -1e-3) continue;
        const y = u * A.y + w * B.y + q * Cc.y, idx = i + k * nx; if (y > h[idx]) h[idx] = y;
      }
    }
    let maxH = -Infinity; for (const y of h) if (y > maxH) maxH = y;
    return { x0, z0, cs, nx, nz, h, maxH, minY: yMin, stamp: 0 };
  },
  insideTown(x, z, pad) {
    for (const t of this.towns) if (Math.hypot(x - t.x, z - t.z) < t.r + (pad || 0)) return t;
    return null;
  },

  buildProps(scene) {
    // ---- cidades ----
    this.towns.forEach((t, ti) => {
      for (let gx = -4; gx <= 4; gx++) for (let gz = -4; gz <= 4; gz++) {
        const cx = t.x + gx * 18 + 11, cz = t.z + gz * 18 + 11;
        if (Math.hypot(cx - t.x, cz - t.z) > t.r - 6) continue;
        const r = Math.random();
        if (t.name === 'Base Militar') { if (r < 0.55) this.container(scene, cx + LS.util.rand(-3, 3), cz, Math.random() < 0.5); else if (r < 0.85) this.house(scene, cx, cz, 12, 9, 'galpao'); continue; }
        if (t.name === 'Centro' && r < 0.3) { this.tower(scene, cx, cz, LS.util.rand(9, 12), LS.util.rand(9, 12)); continue; }
        if (r < 0.72) {
          const k = Math.random(), kind = k < 0.62 ? 'casa' : k < 0.84 ? 'loja' : 'galpao';
          this.house(scene, cx, cz, LS.util.rand(8, 12), LS.util.rand(8, 11), kind);
        }
        else if (r < 0.88) this.container(scene, cx, cz, Math.random() < 0.5);
      }
    });
    // ---- casas isoladas ----
    let placed = 0, tries = 0;
    while (placed < 18 && tries++ < 500) {
      const a = Math.random() * Math.PI * 2, rr = LS.util.rand(40, 300);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = this.exactHeight(x, z);
      if (h < 2 || h > 25 || this.insideTown(x, z, 25) || this.nearBuilding(x, z, 16)) continue; // a fazenda tem quintal cercado
      // terreno precisa ser razoavelmente plano
      if (Math.abs(this.heightAt(x + 6, z) - this.heightAt(x - 6, z)) > 1.5 || Math.abs(this.heightAt(x, z + 6) - this.heightAt(x, z - 6)) > 1.5) continue;
      this.house(scene, x, z, LS.util.rand(9, 10.5), LS.util.rand(8, 9), 'fazenda'); placed++;
    }
    this.finalizeBoxes(scene);
    this.finalizeRoofs(scene);
    this.rebuildTerrainMesh();
    // ---- árvores (cartoon, instanciadas por espécie: pinheiro, abeto, redonda, oval e de outono) ----
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const MAXT = 700, trees = []; tries = 0;
    while (trees.length < MAXT && tries++ < 6000) {
      const x = LS.util.rand(-330, 330), z = LS.util.rand(-330, 330), h = this.heightAt(x, z);
      if (h < 2 || h > 55 || this.insideTown(x, z, 4)) continue;
      if (LS.util.noise(x * 0.02 + 5, z * 0.02 + 5) < 0.38) continue; // aglomerados (florestas)
      let blocked = false;
      for (const b of this.nearBoxes(x, z, 2)) if (x > b.minX - 2 && x < b.maxX + 2 && z > b.minZ - 2 && z < b.maxZ + 2) { blocked = true; break; }
      if (blocked) continue;
      const kind = LS.Flora.pickTree(), sc = LS.util.rand(0.85, 1.35), sy = LS.util.rand(0.9, 1.15), sp = LS.Flora.spec(kind);
      trees.push({ kind, x, y: h - 0.1, z, s: sc, sy, rot: Math.random() * Math.PI * 2 });
      const tr = Math.max(0.3, sp.trunkR * sc); // raio real do tronco
      this.addCollider(x - tr, h - 1, z - tr, x + tr, h + sp.height * sc * sy, z + tr);
    }
    LS.Flora.instance(scene, trees);
    // ---- rochas ----
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rockGeo, this.mat(0x8a8580), 160);
    let nk = 0; tries = 0;
    const e = new THREE.Euler();
    while (nk < 160 && tries++ < 3000) {
      const x = LS.util.rand(-330, 330), z = LS.util.rand(-330, 330), h = this.heightAt(x, z);
      if (h < 1 || this.insideTown(x, z, 3) || this.nearBuilding(x, z, 3)) continue;
      const sc = LS.util.rand(0.8, 2.6);
      e.set(Math.random() * 3, Math.random() * 3, 0); q.setFromEuler(e);
      p.set(x, h + sc * 0.3, z); s.set(sc * 1.3, sc, sc * 1.1); m.compose(p, q, s); rocks.setMatrixAt(nk++, m);
      const ext = this.rockColliders(rockGeo, m, h); // camadas que seguem o formato da pedra (dá para escalar)
      if (Math.random() < 0.25) this.lootSpots.push({ x: ext + 1, z, y: this.heightAt(ext + 1, z) + 0.1 });
    }
    q.identity();
    rocks.count = nk; rocks.frustumCulled = false; rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);
    // ---- arbustos (sem colisão, bons para se esconder) ----
    const bushes = [];
    tries = 0;
    while (bushes.length < 400 && tries++ < 4000) {
      const x = LS.util.rand(-330, 330), z = LS.util.rand(-330, 330), h = this.heightAt(x, z);
      if (h < 1.5 || h > 40 || this.nearBuilding(x, z, 1.2)) continue;
      const sc = LS.util.rand(0.8, 1.4);
      bushes.push({ kind: LS.Flora.pickBush(), x, y: h - 0.05, z, s: sc, sy: LS.util.rand(0.85, 1.1), rot: Math.random() * Math.PI * 2 });
    }
    this.bushMeshes = LS.Flora.instance(scene, bushes, false);
    // ---- pontos de loot na natureza ----
    for (let i = 0; i < 60; i++) {
      const x = LS.util.rand(-300, 300), z = LS.util.rand(-300, 300), h = this.heightAt(x, z);
      if (h > 1.5 && h < 40) this.lootSpots.push({ x, z, y: h + 0.1 });
    }
  },

  // imagem 2D do mapa para o minimapa
  buildMapImage(size) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d'), img = g.createImageData(size, size);
    const half = LS.MAP_SIZE / 2;
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const x = -half + (px / size) * LS.MAP_SIZE, z = -half + (py / size) * LS.MAP_SIZE, h = this.heightAt(x, z);
      let r, gg, b;
      if (h < 0) { r = 40; gg = 110; b = 170; }
      else if (h < 1.6) { r = 215; gg = 195; b = 140; }
      else if (h > 70) { r = 235; gg = 238; b = 242; }
      else if (h > 30) { r = 125; gg = 118; b = 108; }
      else { const k = h / 30; r = 80 + k * 40; gg = 145 - k * 20; b = 60 + k * 30; }
      const i = (px + py * size) * 4; img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const sc = size / LS.MAP_SIZE;
    g.fillStyle = '#d8d0c0';
    for (const bd of this.buildings) g.fillRect((bd.x - bd.w / 2 + half) * sc, (bd.z - bd.d / 2 + half) * sc, Math.max(1, bd.w * sc), Math.max(1, bd.d * sc));
    g.font = 'bold ' + Math.round(size / 40) + 'px Segoe UI'; g.textAlign = 'center';
    for (const t of this.towns) {
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(t.name, (t.x + half) * sc + 1, (t.z + half) * sc - t.r * sc - 3 + 1);
      g.fillStyle = '#fff'; g.fillText(t.name, (t.x + half) * sc, (t.z + half) * sc - t.r * sc - 3);
    }
    return cv;
  }
});
