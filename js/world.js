// Mundo: terreno, colisões, raycast e céu
'use strict';
LS.World = {
  SEG: 200, boxes: [], grid: new Map(), CELL: 16, towns: [], lootSpots: [], heights: null,

  // ---------- Altura ----------
  // relevo: planícies onduladas com distorção (sem formas "de ruído"), colinas com cristas, 2 maciços de montanha
  // largos (base larga, encostas com cristas e vales, pico com neve) e costa irregular. As cidades são aplainadas depois.
  MASSIFS: [{ x: 235, z: 15, r: 125, h: 92 }, { x: -240, z: -5, r: 95, h: 52 }],
  baseHeight(x, z) {
    const n = LS.util.noise, cl = LS.util.clamp, sm = k => k * k * (3 - 2 * k);
    const fbm = (px, pz, o) => { let v = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < o; i++) { v += a * n(px * f + i * 17.3, pz * f + i * 9.1); t += a; a *= 0.5; f *= 2.03; } return v / t; };
    const ridged = (px, pz, o) => { let v = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < o; i++) { const r = 1 - Math.abs(n(px * f + i * 5.7, pz * f + i * 3.3) * 2 - 1); v += a * r * r; t += a; a *= 0.5; f *= 2.1; } return v / t; };
    // distorção do domínio: as formas ficam orgânicas
    const wx = x + (n(x * 0.0045 + 11, z * 0.0045 + 5) - 0.5) * 90, wz = z + (n(x * 0.0045 + 71, z * 0.0045 + 23) - 0.5) * 90;
    // planícies e ondulações suaves
    let h = 4.5 + (fbm(wx * 0.0055, wz * 0.0055, 4) - 0.5) * 13 + (fbm(wx * 0.022, wz * 0.022, 3) - 0.5) * 3.2;
    // colinas com cristas (aparecem só em algumas regiões)
    const hm = sm(cl((fbm(wx * 0.004 + 50, wz * 0.004 + 50, 2) - 0.5) * 3.2, 0, 1));
    h += hm * ridged(wx * 0.012, wz * 0.012, 3) * 16;
    // maciços: base bem larga, corpo arredondado, cristas e vales nas encostas
    for (const M of this.MASSIFS) {
      const d = Math.hypot(x - M.x, z - M.z) / M.r;
      if (d >= 1) continue;
      const k = 1 - d, base = sm(k), peak = Math.pow(k, 2.2);
      const rd = ridged(wx * 0.018 + M.x, wz * 0.018 + M.z, 4);
      h += M.h * (base * 0.42 + peak * 0.58) * (0.72 + 0.5 * rd);
    }
    // costa irregular (baías e cabos) descendo pro mar
    const d = Math.hypot(x, z) + (fbm(x * 0.006 + 3, z * 0.006 + 9, 3) - 0.5) * 80;
    const e = sm(cl((d - 300) / 80, 0, 1));
    return LS.util.lerp(h, -8, e);
  },
  exactHeight(x, z) {
    let h = this.baseHeight(x, z);
    for (const t of this.towns) {
      const dd = Math.hypot(x - t.x, z - t.z);
      const k = LS.util.clamp(1 - (dd - t.r) / 30, 0, 1);
      if (k > 0) { const s = k * k * (3 - 2 * k); h = LS.util.lerp(h, t.h, s); }
    }
    return h;
  },
  // altura interpolada igual aos triângulos da malha
  heightAt(x, z) {
    const S = this.SEG, cell = LS.MAP_SIZE / S, half = LS.MAP_SIZE / 2;
    let gx = (x + half) / cell, gz = (z + half) / cell;
    if (gx < 0 || gz < 0 || gx >= S || gz >= S) return -8;
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz, W = S + 1, H = this.heights;
    const h00 = H[ix + iz * W], h10 = H[ix + 1 + iz * W], h01 = H[ix + (iz + 1) * W], h11 = H[ix + 1 + (iz + 1) * W];
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  },

  // ---------- Colisores AABB ----------
  addCollider(minX, minY, minZ, maxX, maxY, maxZ) {
    const b = { minX, minY, minZ, maxX, maxY, maxZ };
    this.boxes.push(b);
    const C = this.CELL;
    for (let cx = Math.floor(minX / C); cx <= Math.floor(maxX / C); cx++)
      for (let cz = Math.floor(minZ / C); cz <= Math.floor(maxZ / C); cz++) {
        const k = cx + ',' + cz;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(b);
      }
    return b;
  },
  // altura do telhado inclinado em (x,z)
  roofY(b, x, z) { const R = b.roof; return R.ridgeY - Math.abs(R.alongX ? z - R.cz : x - R.cx) * R.tanA; },
  // altura da superfície da pedra em (x,z) (raio vertical nos triângulos); -Infinity se (x,z) não está em cima dela
  rockY(T, x, z) {
    let best = -Infinity;
    for (let i = 0; i < T.length; i += 9) {
      const ax = T[i], ay = T[i + 1], az = T[i + 2], bx = T[i + 3], by = T[i + 4], bz = T[i + 5], cx = T[i + 6], cy = T[i + 7], cz = T[i + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(d) < 1e-9) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
      if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
      const y = u * ay + v * by + w * cy; if (y > best) best = y;
    }
    return best;
  },
  // altura real do topo de um colisor em (x,z): telhado inclinado, superfície da pedra ou topo da caixa
  topAt(b, x, z, r) {
    if (b.roof) return this.roofY(b, x, z);
    if (b.rock) { // o centro e 4 pontos em volta (o pé tem largura): pega o mais alto
      let t = -Infinity; const k = (r || 0) * 0.35;
      for (const [dx, dz] of [[0, 0], [k, 0], [-k, 0], [0, k], [0, -k]]) t = Math.max(t, this.rockH(b.rock, x + dx, z + dz));
      return t;
    }
    return b.maxY;
  },
  // verdadeiro se uma esfera (x,y,z,r) encosta em algum colisor
  sphereHits(x, y, z, r) {
    for (const b of this.nearBoxes(x, z, r + 0.5)) {
      if (b.glass) continue;
      if ((b.roof || b.rock) && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) { if (y - r < this.topAt(b, x, z) && y + r > b.minY) return true; continue; }
      const cx = Math.max(b.minX, Math.min(x, b.maxX)), cy = Math.max(b.minY, Math.min(y, b.maxY)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      if ((cx - x) ** 2 + (cy - y) ** 2 + (cz - z) ** 2 < r * r) return true;
    }
    return y - r < this.heightAt(x, z);
  },
  nearBoxes(x, z, r) {
    const C = this.CELL, out = new Set();
    for (let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++)
      for (let cz = Math.floor((z - r) / C); cz <= Math.floor((z + r) / C); cz++) {
        const l = this.grid.get(cx + ',' + cz);
        if (l) for (const b of l) out.add(b);
      }
    return out;
  },
  // altura do chão considerando topos de caixas abaixo dos pés
  groundAt(x, z, y, r) {
    let g = this.heightAt(x, z);
    for (const b of this.nearBoxes(x, z, r + 1)) {
      if (b.glass) continue;
      if (!(x + r * 0.5 > b.minX && x - r * 0.5 < b.maxX && z + r * 0.5 > b.minZ && z - r * 0.5 < b.maxZ)) continue;
      const top = this.topAt(b, x, z, r); // telhado inclinado / pedra: a superfície de verdade
      if (top <= y + 0.55 && top > g) g = top;
    }
    return g;
  },
  // empurra um cilindro (personagem) para fora das caixas; retorna true se colidiu
  // prev = posição antes do movimento: se o centro entrar numa caixa, sai pelo lado de onde veio (nunca atravessa)
  collideCircle(pos, r, height, prev) {
    let hit = false;
    // até 3 passadas: empurrar para fora de uma caixa pode encostar em outra (cantos, paredes juntas)
    for (let it = 0; it < 3; it++) { const h = this._collideOnce(pos, r, height, prev); hit = hit || h; if (!h) break; }
    return hit;
  },
  _collideOnce(pos, r, height, prev) {
    let hit = false; const stamp = ++this._rockStamp;
    for (const b of this.nearBoxes(pos.x, pos.z, r + 1)) {
      if (b.roof || b.floor) continue; // piso (galpão do duelo): só serve de chão, nunca empurra pro lado
      if (b.rock) { // pedra: colide com a superfície de verdade (uma vez por pedra, não por camada)
        if (b.rock.stamp === stamp) continue; b.rock.stamp = stamp;
        if (this.rockPush(pos, r, height, b.rock, prev)) hit = true;
        continue;
      }
      if (pos.y + height <= b.minY || pos.y >= b.maxY - 0.5) continue;
      const cx = LS.util.clamp(pos.x, b.minX, b.maxX), cz = LS.util.clamp(pos.z, b.minZ, b.maxZ);
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = r - d;
        pos.x += dx / d * push; pos.z += dz / d * push;
      } else { // centro dentro da caixa: sai pelo lado de onde veio (ou o mais próximo)
        let opts = [[pos.x - b.minX + r, -1, 0], [b.maxX - pos.x + r, 1, 0], [pos.z - b.minZ + r, 0, -1], [b.maxZ - pos.z + r, 0, 1]];
        if (prev) {
          const from = opts.filter(o => (o[1] < 0 && prev.x <= b.minX) || (o[1] > 0 && prev.x >= b.maxX) || (o[2] < 0 && prev.z <= b.minZ) || (o[2] > 0 && prev.z >= b.maxZ));
          if (from.length) opts = from;
        }
        opts.sort((a, c) => a[0] - c[0]);
        pos.x += opts[0][1] * opts[0][0]; pos.z += opts[0][2] * opts[0][0];
      }
    }
    return hit;
  },

  // altura da pedra em (x,z) pelo mapa de altura; -Infinity fora dela
  rockH(R, x, z) {
    const i = Math.floor((x - R.x0) / R.cs), k = Math.floor((z - R.z0) / R.cs);
    if (i < 0 || k < 0 || i >= R.nx || k >= R.nz) return -Infinity;
    return R.h[i + k * R.nx];
  },
  _rockStamp: 0, _rockHit: null, _rockBudget: Infinity,
  ROCK_DIRS: Array.from({ length: 16 }, (_, i) => [Math.cos(i / 16 * Math.PI * 2), Math.sin(i / 16 * Math.PI * 2)]),
  // empurra o cilindro pra fora da pedra: qualquer ponto do círculo dos pés mais alto que um degrau (55 cm)
  // conta como parede. Em cima da pedra (superfície suave) nada empurra; numa encosta íngreme escorrega pra baixo.
  rockPush(pos, r, height, R, prev) {
    const lim = pos.y + 0.55;
    if (R.maxH <= lim || R.minY >= pos.y + height) return false;
    if (pos.x + r < R.x0 || pos.x - r > R.x0 + R.nx * R.cs || pos.z + r < R.z0 || pos.z - r > R.z0 + R.nz * R.cs) return false;
    if (this.rockH(R, pos.x, pos.z) > lim) { // o centro entrou na pedra: volta pro passo anterior (nunca atravessa)
      if (prev && this.rockH(R, prev.x, prev.z) <= lim) { pos.x = prev.x; pos.z = prev.z; return true; }
      for (let d = 0.2; d < 12; d += 0.2) for (const [c, s] of this.ROCK_DIRS) { // nasceu dentro: sai pelo lado mais perto
        if (this.rockH(R, pos.x + c * d, pos.z + s * d) <= lim) { pos.x += c * (d + r * 0.5); pos.z += s * (d + r * 0.5); return true; }
      }
      return true;
    }
    let nx = 0, nz = 0, depth = 0;
    for (const [c, s] of this.ROCK_DIRS) {
      if (this.rockH(R, pos.x + c * r, pos.z + s * r) <= lim) continue;
      let lo = 0, hi = r;
      for (let k = 0; k < 5; k++) { const m = (lo + hi) / 2; if (this.rockH(R, pos.x + c * m, pos.z + s * m) > lim) hi = m; else lo = m; }
      const d = r - lo; nx -= c * d; nz -= s * d; if (d > depth) depth = d;
    }
    if (depth <= 1e-4) return false;
    const l = Math.hypot(nx, nz);
    if (l < 1e-6) { if (prev) { pos.x = prev.x; pos.z = prev.z; } return true; }
    // empurrão suave: no máximo ~3 m/s (descer encosta íngreme escorrega, não dá "tranco");
    // se ainda sobrar muito pra dentro, só não deixa avançar (volta pro passo anterior)
    const move = Math.min(depth, this._rockBudget); this._rockBudget -= move;
    if (depth - move > 0.12 && prev) { pos.x = prev.x; pos.z = prev.z; }
    else { pos.x += nx / l * move; pos.z += nz / l * move; }
    this._rockHit = { nx: nx / l, nz: nz / l, R };
    return true;
  },

  // ---------- Raycast contra caixas + terreno ----------
  rayBox(o, d, b, maxT) {
    let tmin = 0, tmax = maxT;
    const ax = ['x', 'y', 'z'], mn = [b.minX, b.minY, b.minZ], mx = [b.maxX, b.maxY, b.maxZ];
    for (let i = 0; i < 3; i++) {
      const oi = o[ax[i]], di = d[ax[i]];
      if (Math.abs(di) < 1e-9) { if (oi < mn[i] || oi > mx[i]) return -1; continue; }
      let t1 = (mn[i] - oi) / di, t2 = (mx[i] - oi) / di;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    return tmin;
  },
  raycast(o, d, maxDist) {
    let best = maxDist, hitBox = null; // hitBox: a caixa acertada (lastBox: pra parede de gel saber que levou tiro)
    const ex = o.x + d.x * maxDist, ez = o.z + d.z * maxDist;
    const minX = Math.min(o.x, ex), maxX = Math.max(o.x, ex), minZ = Math.min(o.z, ez), maxZ = Math.max(o.z, ez);
    // percorre as células da grade ao longo do raio (rápido mesmo para raios longos)
    const seen = new Set(), C = this.CELL, step = C * 0.5;
    const hl = Math.hypot(d.x, d.z) || 1e-6;
    const horiz = maxDist * hl;
    for (let s = 0; s <= horiz + step; s += step) {
      const t = Math.min(s, horiz) / hl;
      if (t > best + step / hl) break;
      const x = o.x + d.x * t, z = o.z + d.z * t;
      for (let cx = Math.floor((x - step) / C); cx <= Math.floor((x + step) / C); cx++)
        for (let cz = Math.floor((z - step) / C); cz <= Math.floor((z + step) / C); cz++) {
          const l = this.grid.get(cx + ',' + cz); if (!l) continue;
          for (const b of l) {
            if (seen.has(b)) continue; seen.add(b);
            if (b.glass) continue; // vidro: tiro e visão passam
            if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
            let tb = this.rayBox(o, d, b, best);
            if (tb >= 0 && b.roof) { // dentro da caixa do telhado: só acerta abaixo das telhas
              let hitT = -1;
              for (let t = tb; t < Math.min(best, tb + 30); t += 0.2) {
                const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
                if (px < b.minX || px > b.maxX || pz < b.minZ || pz > b.maxZ || py < b.minY - 0.01) break;
                if (py <= this.roofY(b, px, pz)) { hitT = t; break; }
              }
              tb = hitT;
            }
            if (tb >= 0 && tb < best) { best = tb; hitBox = b; }
          }
        }
      if (s >= horiz) break;
    }
    // terreno: avança em passos e refina
    const tstep = 1.5;
    let prevT = 0;
    for (let t = tstep; t < best + tstep; t += tstep) {
      const tt = Math.min(t, best);
      const y = o.y + d.y * tt, h = this.heightAt(o.x + d.x * tt, o.z + d.z * tt);
      if (y < h) {
        let a = prevT, c = tt;
        for (let i = 0; i < 6; i++) { const m = (a + c) / 2; if (o.y + d.y * m < this.heightAt(o.x + d.x * m, o.z + d.z * m)) c = m; else a = m; }
        best = a; hitBox = null; break;
      }
      prevT = tt;
      if (tt >= best) break;
    }
    this.lastBox = hitBox;
    return best;
  },
  hasLOS(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length(); d.divideScalar(len);
    return this.raycast(a, d, len) >= len - 0.3;
  },

  // ---------- Construção do terreno ----------
  buildTerrain(scene) {
    // cidades (posições fixas com variação)
    const names = ['Vila Porto', 'Centro', 'Fazenda', 'Base Militar', 'Mirante', 'Vila Sul', 'Usina'];
    const spots = [[-150, -130], [20, 10], [170, -160], [-170, 150], [140, 170], [10, 230], [-10, -230]];
    this.towns = [];
    spots.forEach((s, i) => {
      const x = s[0] + LS.util.rand(-20, 20), z = s[1] + LS.util.rand(-20, 20);
      this.towns.push({ name: names[i], x, z, r: i === 1 ? 62 : LS.util.rand(38, 50), h: Math.max(2.5, Math.min(this.baseHeight(x, z), 14)) });
    });
    const S = this.SEG, W = S + 1, half = LS.MAP_SIZE / 2, cell = LS.MAP_SIZE / S;
    this.heights = new Float32Array(W * W);
    for (let iz = 0; iz < W; iz++) for (let ix = 0; ix < W; ix++) this.heights[ix + iz * W] = this.exactHeight(-half + ix * cell, -half + iz * cell);

    const geo = new THREE.PlaneGeometry(LS.MAP_SIZE, LS.MAP_SIZE, S, S);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), tmix = new Float32Array(pos.count); // tmix: 0 grama .. 1 terra
    const c = new THREE.Color(), sand = new THREE.Color(0xe2cd92), wetSand = new THREE.Color(0xb9a274), grass = new THREE.Color(0x6cbf45), grass2 = new THREE.Color(0x4a9a36),
      dry = new THREE.Color(0x9fbf55), forest = new THREE.Color(0x3f8a34), rock = new THREE.Color(0x8a8378), rock2 = new THREE.Color(0x6e6a64),
      snow = new THREE.Color(0xf4f6fa), dirt = new THREE.Color(0x9b8360), n = LS.util.noise;
    for (let i = 0; i < pos.count; i++) {
      const ix = i % W, iz = Math.floor(i / W);
      const h = this.heights[i]; pos.setY(i, h);
      const x = pos.getX(i), z = pos.getZ(i);
      const hn = (ix < S ? this.heights[i + 1] : h), hs = (iz < S ? this.heights[i + W] : h);
      const slope = Math.hypot(hn - h, hs - h) / cell;
      let mx = 0;
      // grama com manchas grandes: verde, verde-escura (mata), amarelada (seca)
      const g1 = n(x * 0.012, z * 0.012), g2 = n(x * 0.03 + 40, z * 0.03 + 40);
      c.copy(grass).lerp(grass2, g2 * 0.8).lerp(g1 > 0.5 ? forest : dry, Math.abs(g1 - 0.5) * 1.3);
      // praia: areia molhada perto da água, seca acima
      if (h < 2.4) { const k = LS.util.clamp((2.4 - h) / 1.2, 0, 1); c.lerp(h < 0.8 ? wetSand : sand, k); mx = Math.max(mx, k * 0.6); }
      // rocha: encostas íngremes e altitude (com ruído pra borda não ficar reta)
      const alt = LS.util.clamp((h - 34 - n(x * 0.05, z * 0.05) * 12) / 14, 0, 1), stp = LS.util.clamp((slope - 0.55) * 2.2, 0, 1);
      const rk = Math.max(alt, stp);
      if (rk > 0) c.lerp(rock.clone().lerp(rock2, n(x * 0.08 + 9, z * 0.08)), rk);
      // neve no topo, mais embaixo nas faces menos inclinadas
      const sn = LS.util.clamp((h - 66 - n(x * 0.04 + 5, z * 0.04 + 5) * 10 + (0.9 - Math.min(slope, 0.9)) * 6) / 8, 0, 1);
      if (sn > 0) c.lerp(snow, sn);
      for (const t of this.towns) {
        const dd = Math.hypot(x - t.x, z - t.z);
        if (dd < t.r + 4) { // ruas em grade
          const lx = ((x - t.x) % 18 + 18) % 18, lz = ((z - t.z) % 18 + 18) % 18;
          if (lx < 4 || lz < 4) { c.lerp(dirt, 0.85); mx = 1; } else { c.lerp(dirt, 0.25); mx = Math.max(mx, 0.3); }
        }
      }
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; tmix[i] = mx;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('tmix', new THREE.BufferAttribute(tmix, 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, LS.Tex.terrainMaterial()); // grama e caminhos de terra texturizados
    mesh.receiveShadow = true;
    scene.add(mesh);
    this.terrainMesh = mesh;
    this.terrainColors = colors;

    const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshPhongMaterial({ color: 0x2a7fb8, transparent: true, opacity: 0.85, shininess: 80 }));
    water.rotation.x = -Math.PI / 2; water.position.y = LS.WATER_LEVEL;
    scene.add(water);
    this.water = water;
  },

  // ---------- Céu e iluminação ----------
  buildSky(scene) {
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a5a3a, 0.6);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xfff2e0, 0.3); scene.add(this.ambient); // ilumina interiores e sombras
    this.sun = new THREE.DirectionalLight(0xffffff, 0.9);
    this.sun.shadow.camera.left = -70; this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70; this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 400;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.03; // sem "acne" de sombra tremendo nas paredes
    scene.add(this.sun); scene.add(this.sun.target);
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
    scene.add(this.sunMesh);
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, LS.settings.renderDistance * 0.3, LS.settings.renderDistance);
    // nuvens instanciadas
    const cg = new THREE.BoxGeometry(1, 1, 1);
    const clouds = new THREE.InstancedMesh(cg, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }), 160);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i < 32; i++) {
      const cx = LS.util.rand(-450, 450), cz = LS.util.rand(-450, 450), cy = LS.util.rand(230, 270);
      for (let j = 0; j < 5; j++) {
        p.set(cx + LS.util.rand(-20, 20), cy + LS.util.rand(-3, 3), cz + LS.util.rand(-12, 12));
        s.set(LS.util.rand(15, 35), LS.util.rand(5, 9), LS.util.rand(12, 22));
        m.compose(p, q, s); clouds.setMatrixAt(k++, m);
      }
    }
    clouds.frustumCulled = false; this.clouds = clouds; scene.add(clouds);
    this.skyColors = [
      { t: 0, sky: new THREE.Color(0xd9c7c0), sun: new THREE.Color(0xffd2a8), i: 0.75 },
      { t: 0.25, sky: new THREE.Color(0x87ceeb), sun: new THREE.Color(0xffffff), i: 1.0 },
      { t: 0.7, sky: new THREE.Color(0x8fc6e8), sun: new THREE.Color(0xfff4dd), i: 0.95 },
      { t: 0.9, sky: new THREE.Color(0xf08a5d), sun: new THREE.Color(0xff9a5a), i: 0.65 },
      { t: 1, sky: new THREE.Color(0x3a3f6b), sun: new THREE.Color(0xb08cff), i: 0.35 }
    ];
  },
  // t = 0..1 (manhã até o anoitecer ao longo da partida)
  updateSky(t, scene, focus, dt) {
    t = LS.util.clamp(t, 0, 1);
    let a = this.skyColors[0], b = this.skyColors[this.skyColors.length - 1];
    for (let i = 0; i < this.skyColors.length - 1; i++) if (t >= this.skyColors[i].t && t <= this.skyColors[i + 1].t) { a = this.skyColors[i]; b = this.skyColors[i + 1]; break; }
    const k = (t - a.t) / Math.max(0.0001, b.t - a.t);
    scene.background.copy(a.sky).lerp(b.sky, k);
    scene.fog.color.copy(scene.background);
    this.sun.color.copy(a.sun).lerp(b.sun, k);
    this.sun.intensity = LS.util.lerp(a.i, b.i, k);
    this.hemi.intensity = 0.35 + this.sun.intensity * 0.35;
    const ang = 0.25 + t * 2.6; // ângulo do sol no céu
    const dir = new THREE.Vector3(Math.cos(ang) * 0.6, Math.sin(ang), -0.5).normalize();
    this.sun.position.copy(focus).addScaledVector(dir, 200);
    this.sun.target.position.copy(focus);
    this.sunMesh.position.copy(focus).addScaledVector(dir, LS.effDist() * 0.85);
    this.sunMesh.material.color.copy(this.sun.color);
    this.clouds.rotation.y += dt * 0.004;
  }
};
