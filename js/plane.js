// Avião do salto: cargueiro moderno (estilo A400M/C-130) em low-poly liso.
// A pintura (faixa laranja, janelas, porta, rampa, flaps) é cor por vértice nas próprias faces: não tem
// adesivo colado em cima de outra peça, então não tem z-fighting. As peças que se cruzam (asa, motor, cauda)
// se atravessam de verdade (nunca ficam coplanares). Hélices giram, a rampa traseira abre na hora do salto
// e as luzes de navegação piscam.
'use strict';
LS.PlaneModel = {
  C: { white: 0xe9edf2, white2: 0xd9dee5, belly: 0x9aa4b0, grey: 0x7b8591, grey2: 0x8f99a5, dark: 0x2c323a, glass: 0x142230, frame: 0x3a434e,
    orange: 0xff8a1f, orange2: 0xe5730f, metal: 0xb6bec7, black: 0x16191d, yellow: 0xffc21a, door: 0xc4cbd3 },

  // ---------- geometria ----------
  // liga seções (polígonos 3D fechados, mesmo nº de pontos) em quads. color(i, j, mid, f) devolve a cor da face
  // entre as seções i e i+1, aresta j..j+1 (f = fração ao longo do comprimento). smooth = normais suaves em volta.
  loft(out, sections, color, opt = {}) {
    const S = sections.length, N = sections[0].length, V = THREE.Vector3;
    const fn = [];
    for (let i = 0; i < S - 1; i++) { fn[i] = []; for (let j = 0; j < N; j++) {
      const a = sections[i][j], b = sections[i][(j + 1) % N], c = sections[i + 1][(j + 1) % N], d = sections[i + 1][j];
      const n = new V().subVectors(c, a).cross(new V().subVectors(d, b)); fn[i][j] = n; } }
    // orientação: normal pra fora (compara com o centro da seção na face de maior área)
    let best = null, area = -1;
    for (let i = 0; i < S - 1; i++) for (let j = 0; j < N; j++) if (fn[i][j].length() > area) { area = fn[i][j].length(); best = [i, j]; }
    const ctr = s => s.reduce((m, p) => m.add(p), new V()).multiplyScalar(1 / s.length);
    const [bi, bj] = best, mid0 = new V().add(sections[bi][bj]).add(sections[bi + 1][(bj + 1) % N]).multiplyScalar(0.5);
    const flip = fn[bi][bj].dot(mid0.sub(ctr(sections[bi]).add(ctr(sections[bi + 1])).multiplyScalar(0.5))) < 0;
    for (const row of fn) for (const n of row) { if (flip) n.negate(); if (n.lengthSq() > 1e-12) n.normalize(); }
    const vn = (i, j) => { // normal suave no vértice (i, j)
      const n = new V(); j = (j + N) % N;
      for (const ii of [i - 1, i]) if (ii >= 0 && ii < S - 1) for (const jj of [j - 1, j]) n.add(fn[ii][(jj + N) % N]);
      return n.lengthSq() > 1e-12 ? n.normalize() : n.set(0, 1, 0);
    };
    for (let i = 0; i < S - 1; i++) for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      const a = sections[i][j], b = sections[i][j1], c = sections[i + 1][j1], d = sections[i + 1][j];
      const mid = new V().add(a).add(b).add(c).add(d).multiplyScalar(0.25);
      const hex = color(i, j, mid, (i + 0.5) / (S - 1));
      const fnn = fn[i][j];
      if (fnn.lengthSq() < 1e-12) continue; // face degenerada (ponta)
      const na = opt.smooth ? vn(i, j) : fnn, nb = opt.smooth ? vn(i, j1) : fnn, nc = opt.smooth ? vn(i + 1, j1) : fnn, nd = opt.smooth ? vn(i + 1, j) : fnn;
      if (!flip) { this.tri(out, a, b, c, na, nb, nc, hex); this.tri(out, a, c, d, na, nc, nd, hex); }
      else { this.tri(out, a, c, b, na, nc, nb, hex); this.tri(out, a, d, c, na, nd, nc, hex); }
    }
    // tampas (pontas de asa/cauda)
    const cap = (s, hex, outward) => {
      const c = ctr(s), n = new V();
      for (let j = 0; j < N; j++) n.add(new V().subVectors(s[j], c).cross(new V().subVectors(s[(j + 1) % N], c)));
      if (n.lengthSq() < 1e-12) return; n.normalize();
      const rev = n.dot(outward) < 0; if (rev) n.negate();
      for (let j = 0; j < N; j++) { const p = s[j], q = s[(j + 1) % N]; if (rev) this.tri(out, c, q, p, n, n, n, hex); else this.tri(out, c, p, q, n, n, n, hex); }
    };
    if (opt.capStart) cap(sections[0], opt.capStart, new V().subVectors(ctr(sections[0]), ctr(sections[1])));
    if (opt.capEnd) cap(sections[S - 1], opt.capEnd, new V().subVectors(ctr(sections[S - 1]), ctr(sections[S - 2])));
  },
  tri(out, a, b, c, na, nb, nc, hex) {
    const col = this._c || (this._c = new THREE.Color()); col.setHex(hex);
    out.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    out.nor.push(na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z);
    for (let k = 0; k < 3; k++) out.col.push(col.r, col.g, col.b);
  },
  // caixa colorida (com rotação) direto na lista
  box(out, cx, cy, cz, w, h, d, hex, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'ZYX')), new THREE.Vector3(1, 1, 1)));
    const P = g.attributes.position.array, Nn = g.attributes.normal.array, col = new THREE.Color(hex);
    for (let i = 0; i < P.length; i++) { out.pos.push(P[i]); out.nor.push(Nn[i]); }
    for (let i = 0; i < P.length / 3; i++) out.col.push(col.r, col.g, col.b);
    g.dispose();
  },
  geo(out) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
    g.computeBoundingSphere();
    return g;
  },
  // anel "quadrado arredondado" (superelipse): o cargueiro tem barriga mais reta. n múltiplo de 4 (tem vértice bem embaixo)
  ring(z, cx, cy, rx, ry, n = 24, p = 2.5) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const t = k / n * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      out.push(new THREE.Vector3(cx + rx * Math.sign(c) * Math.abs(c) ** (2 / p), cy + ry * Math.sign(s) * Math.abs(s) ** (2 / p), z));
    }
    return out;
  },

  // ---------- montagem ----------
  build(opt = {}) {
    const C = this.C, body = { pos: [], nor: [], col: [] }, root = new THREE.Group(), inner = new THREE.Group();
    root.add(inner);

    // fuselagem: [z, cy, rx, ry]. A barriga de z=-3,3 até -8,4 é uma reta (a rampa fecha rente a ela)
    const F = [[-12.0, 2.05, 0.10, 0.08], [-11.7, 2.0, 0.42, 0.32], [-10.6, 1.72, 0.80, 0.56], [-9.2, 1.38, 1.12, 0.80], [-8.4, 1.15, 1.30, 0.87],
      [-6.0, 0.55, 1.72, 1.225], [-4.6, 0.22, 1.84, 1.453], [-3.3, 0.10, 1.86, 1.85], [-2.9, 0.10, 1.86, 1.85], [-2.0, 0.10, 1.86, 1.85],
      [3.0, 0.10, 1.86, 1.85], [8.0, 0.10, 1.84, 1.84], [9.2, 0.06, 1.72, 1.70], [10.2, 0.0, 1.45, 1.42], [10.9, -0.08, 1.12, 1.08],
      [11.5, -0.14, 0.70, 0.64], [11.85, -0.17, 0.32, 0.28], [12.0, -0.18, 0.06, 0.05]];
    const NS = 24;
    const fus = F.map(([z, cy, rx, ry]) => this.ring(z, 0, cy, rx, ry, NS));
    const fAt = z => { for (let i = 0; i < F.length - 1; i++) if (z >= F[i][0] && z <= F[i + 1][0]) { const f = (z - F[i][0]) / (F[i + 1][0] - F[i][0]); return F[i].map((v, k) => v + (F[i + 1][k] - v) * f); } return F[0]; };
    this.loft(body, fus, (i, j, m) => {
      const [, cy, rx, ry] = fAt(m.z), v = (m.y - cy) / ry, side = Math.abs(m.x) / rx;
      if (m.z > 11.55 || (m.z > 10.95 && v < 0.18)) return C.dark;                        // radome (bico)
      if (m.z > 9.3 && m.z < 11.55 && v > 0.25 && v < 0.8) return side < 0.1 ? C.frame : C.glass;   // faixa de vidro da cabine (com a coluna do meio)
      if (m.z > -2.9 && m.z < -2.0 && v > -0.55 && v < 0.45 && side > 0.8) return C.door;  // portas laterais dos paraquedistas
      if (m.z > -8.4 && m.z < -3.3 && v < -0.9) return C.dark;                             // vão da rampa
      if (v > 0.05 && v < 0.26 && m.z > -8.2 && m.z < 9.3) return C.orange;                // faixa laranja
      if (v > -0.26 && v <= 0.05 && m.z > -8.2 && m.z < 9.3) return C.grey2; // faixa cinza embaixo
      if (v < -0.45) return C.belly;
      return m.y > cy + ry * 0.6 ? C.white : C.white2;
    }, { smooth: true });

    // carenagens do trem de pouso (laterais da barriga)
    for (const sx of [-1, 1]) {
      const sp = [[-2.8, 0.05, 0.05], [-2.4, 0.32, 0.4], [-1.6, 0.46, 0.55], [2.4, 0.46, 0.55], [3.2, 0.3, 0.38], [3.6, 0.05, 0.05]]
        .map(([z, rx, ry]) => this.ring(z, sx * 1.62, -1.32, rx, ry, 12, 2.2));
      this.loft(body, sp, (i, j, m) => m.y < -1.55 ? C.grey : C.belly, { smooth: true });
    }

    // asa alta: perfil (fração da corda, espessura) do bordo de ataque pro de fuga e volta por baixo
    const AF = [[0, 0], [0.06, 0.55], [0.28, 1.0], [0.6, 0.82], [0.82, 0.45], [1.0, 0.04], [0.82, -0.12], [0.5, -0.26], [0.22, -0.3], [0.05, -0.2]];
    const wingSec = (x, zLE, chord, th, y) => AF.map(([f, t]) => new THREE.Vector3(x, y + t * th, zLE - f * chord));
    const wy = 1.78, span = 14.2;
    const WS = [[-span, 0.45], [-9.2, 0.62], [-1.9, 0.84], [1.9, 0.84], [9.2, 0.62], [span, 0.45]].map(([x, k]) => {
      const a = Math.abs(x) / span, chord = 3.5 * k, zLE = 2.9 - a * 0.7, th = 0.48 - a * 0.26, y = wy + a * 0.32;
      return wingSec(x, zLE, chord, th, y);
    });
    this.loft(body, WS, (i, j, m) => {
      const ax = Math.abs(m.x);
      if (j === 0 || j === AF.length - 1) return C.metal;                        // bordo de ataque
      if (ax > span - 0.55) return C.orange;                                     // ponta da asa
      if ((j === 3 || j === 4) && ax > 2.1 && ax < 13.2) return ax > 9.4 ? C.grey2 : C.grey; // flap / aileron
      return j < 5 ? C.white : C.white2;
    }, { capStart: C.orange, capEnd: C.orange });

    // motores turboélice: 4 naceles embaixo da asa
    const engines = [-8.1, -4.3, 4.3, 8.1], props = [];
    for (const ex of engines) {
      const a = Math.abs(ex) / span, zLE = 2.9 - a * 0.7, y0 = wy + a * 0.32 - 0.42;
      const N = [[zLE + 1.75, 0.34, 0.34], [zLE + 1.62, 0.44, 0.46], [zLE + 1.2, 0.5, 0.56], [zLE - 0.6, 0.47, 0.6], [zLE - 2.2, 0.36, 0.44], [zLE - 3.1, 0.16, 0.2]]
        .map(([z, rx, ry]) => this.ring(z, ex, y0 - (z < zLE - 0.6 ? 0 : 0), rx, ry, 16, 2.2));
      this.loft(body, N, (i, j, m) => i === 0 ? C.metal : m.y < y0 - 0.38 ? C.grey2 : (m.z < zLE - 1.9 && m.y < y0 ? C.dark : C.white2), { smooth: true, capStart: C.black });
      // escapamento
      this.box(body, ex + (ex > 0 ? -0.42 : 0.42), y0 - 0.12, zLE - 1.0, 0.16, 0.18, 0.7, C.dark);
      // hélice (peça separada que gira)
      const pg = { pos: [], nor: [], col: [] }, zf = zLE + 2.15;
      const spin = [[0.0, 0.02], [0.18, 0.2], [0.42, 0.3], [0.62, 0.32]].map(([dz, r]) => this.ring(-dz, 0, 0, r, r, 12, 2));
      this.loft(pg, spin, () => C.dark, { smooth: true, capEnd: C.dark });
      for (let b = 0; b < 6; b++) {
        const ang = b / 6 * Math.PI * 2, s = Math.sin(ang), c = Math.cos(ang);
        // pá: raiz escura + ponta amarela, levemente torcida
        this.box(pg, c * 0.85, s * 0.85, -0.3, 0.2, 1.2, 0.05, C.black, 0, 0.35, ang - Math.PI / 2);
        this.box(pg, c * 1.56, s * 1.56, -0.3, 0.17, 0.24, 0.05, C.yellow, 0, 0.35, ang - Math.PI / 2);
      }
      const prop = new THREE.Mesh(this.geo(pg), null); prop.position.set(ex, y0, zf); prop.userData.dir = ex > 0 ? 1 : -1;
      inner.add(prop); props.push(prop);
    }

    // cauda: deriva vertical (perfil fino em x)
    const FIN = [[0, 0], [0.12, 0.6], [0.4, 1.0], [0.75, 0.6], [1.0, 0.05], [0.75, -0.6], [0.4, -1.0], [0.12, -0.6]];
    const finSec = (y, zLE, chord, th) => FIN.map(([f, t]) => new THREE.Vector3(t * th, y, zLE - f * chord));
    const FS = [[1.55, -7.2, 4.5, 0.17], [2.3, -7.6, 4.3, 0.16], [6.6, -10.3, 2.1, 0.08]].map(a => finSec(...a));
    this.loft(body, FS, (i, j, m) => (m.y > 5.85 ? C.dark : m.y > 3.1 ? C.orange : C.white), { capEnd: C.dark });
    // leme (parte de trás mais escura) e estabilizadores horizontais
    const stab = [[-5.6, 0.48], [-0.9, 1], [0.9, 1], [5.6, 0.48]].map(([x, k]) => {
      const a = Math.abs(x) / 5.6; return wingSec(x, -9.15 - a * 0.9, 2.7 * k + 0.0, 0.26 - a * 0.1, 1.95 + a * 0.05);
    });
    this.loft(body, stab, (i, j, m) => (j === 0 || j === AF.length - 1 ? C.metal : (j === 3 || j === 4) && Math.abs(m.x) > 1 ? C.grey : j < 5 ? C.white : C.belly),
      { capStart: C.white, capEnd: C.white });

    // detalhes pequenos: antenas, tubos de pitot, janelinhas, degrau da porta
    this.box(body, 0, 2.02, 4.6, 0.05, 0.38, 0.32, C.dark, 0.25, 0, 0);
    this.box(body, 0, 1.98, -1.9, 0.05, 0.3, 0.26, C.dark, 0.25, 0, 0);
    this.box(body, 0, -1.83, 6.2, 0.05, 0.3, 0.24, C.dark, -0.25, 0, 0);
    for (const sx of [-1, 1]) {
      this.box(body, sx * 1.05, -0.35, 11.2, 0.05, 0.05, 0.42, C.metal, 0, sx * 0.25, 0);
      for (let k = 0; k < 6; k++) { // janelinhas redondas (salientes uns cm: não ficam coplanares com o casco)
        const z = 6.6 - k * 1.55, [, cy, rx] = fAt(z);
        this.box(body, sx * (rx * 0.94), cy + 0.98, z, 0.08, 0.3, 0.3, C.glass);
      }
    }

    // rampa traseira (abre na hora do salto): dobradiça na frente da reta da barriga
    const rg = { pos: [], nor: [], col: [] };
    const hz = -3.3, hy = 0.10 - 1.85, ez = -8.4, ey = 1.15 - 0.87, rl = Math.hypot(ez - hz, ey - hy), rang = Math.atan2(ey - hy, hz - ez);
    const rs = [[0, 1.1], [-rl, 0.7]].map(([z, hw]) => [new THREE.Vector3(-hw, -0.02, z), new THREE.Vector3(hw, -0.02, z), new THREE.Vector3(hw, -0.09, z), new THREE.Vector3(-hw, -0.09, z)]);
    this.loft(rg, rs, (i, j) => (j === 2 ? C.grey2 : C.grey), { capStart: C.grey, capEnd: C.grey });
    for (let k = 1; k < 5; k++) { const hw = 1.1 - 0.4 * k / 5; this.box(rg, 0, -0.105, -rl * k / 5, hw * 1.7, 0.03, 0.06, C.grey); } // frisos
    const ramp = new THREE.Mesh(this.geo(rg), null); ramp.position.set(0, hy, hz); ramp.userData.closed = rang; ramp.rotation.x = rang;
    inner.add(ramp);

    // material: cor por vértice (ou silhueta lisa no céu do lobby)
    const mat = opt.silhouette !== undefined ? new THREE.MeshBasicMaterial({ color: opt.silhouette, fog: false })
      : new THREE.MeshLambertMaterial({ vertexColors: true });
    const hull = new THREE.Mesh(this.geo(body), mat); inner.add(hull);
    ramp.material = mat; for (const p of props) p.material = mat;
    // borrão das hélices girando
    const discMat = new THREE.MeshBasicMaterial({ color: opt.silhouette !== undefined ? opt.silhouette : 0x20242a, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide, fog: opt.silhouette === undefined });
    for (const p of props) { const d = new THREE.Mesh(new THREE.CircleGeometry(1.75, 28), discMat); d.position.z = -0.31; d.renderOrder = 2; p.add(d); }

    // luzes (brilham sozinhas): navegação vermelha (esquerda, +x) e verde (direita), branca na cauda, faróis piscando
    const light = (hex, x, y, z, s = 0.2) => { const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color: hex, fog: false })); m.position.set(x, y, z); inner.add(m); return m; };
    const tipY = wy + 0.32 + 0.05, tipZ = 2.9 - 0.7 - 0.8;
    const lights = {
      red: light(0xff2a2a, span + 0.12, tipY, tipZ), green: light(0x2aff5a, -span - 0.12, tipY, tipZ), tail: light(0xffffff, 0, 2.05, -12.1, 0.16),
      strobeL: light(0xffffff, span + 0.12, tipY, tipZ - 0.5, 0.16), strobeR: light(0xffffff, -span - 0.12, tipY, tipZ - 0.5, 0.16),
      beaconT: light(0xff3030, 0, 1.96, -0.9, 0.22), beaconB: light(0xff3030, 0, -1.8, 1.2, 0.22),
    };
    return { root, inner, hull, props, ramp, lights, rampOpen: 0, exitLocal: new THREE.Vector3(0, -1.2, -10.6) };
  },

  // anima: hélices, luzes, balanço leve e rampa (open 0..1)
  animate(m, t, dt, open) {
    for (const p of m.props) p.rotation.z += dt * 38 * p.userData.dir;
    m.rampOpen = LS.util.lerp(m.rampOpen, open ? 1 : 0, Math.min(1, dt * 1.6));
    m.ramp.rotation.x = m.ramp.userData.closed - m.rampOpen * 0.62;
    const L = m.lights, blink = (t % 1.3) < 0.07, beacon = (t % 1.0) < 0.12;
    L.strobeL.visible = L.strobeR.visible = blink;
    L.beaconT.visible = beacon; L.beaconB.visible = (t + 0.5) % 1.0 < 0.12;
    m.inner.rotation.z = Math.sin(t * 0.45) * 0.03;
    m.inner.rotation.x = Math.sin(t * 0.31) * 0.012;
    m.inner.position.y = Math.sin(t * 0.7) * 0.3;
  },
};

LS.Plane = class {
  constructor(scene) {
    this.model = LS.PlaneModel.build();
    this.mesh = this.model.root; scene.add(this.mesh);
    this.speed = 38; this.t = 0;
  }
  reset() {
    // trajeto aleatório atravessando a ilha
    const a = Math.random() * Math.PI * 2, off = LS.util.rand(-120, 120);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), perp = new THREE.Vector3(-dir.z, 0, dir.x);
    this.start = dir.clone().multiplyScalar(-420).addScaledVector(perp, off); this.start.y = 190;
    this.end = dir.clone().multiplyScalar(420).addScaledVector(perp, off); this.end.y = 190;
    this.length = this.start.distanceTo(this.end);
    this.progress = 0; this.active = true;
    this.mesh.visible = true;
    this.mesh.position.copy(this.start);
    this.mesh.lookAt(this.end);
    this.model.rampOpen = 0;
  }
  // só é possível saltar com o avião sobre a ilha
  canJump() { return this.active && this.progress > 0.08 && this.progress < 0.97; }
  // ponto de saída: atrás da rampa
  exitPoint(out) { this.mesh.updateMatrixWorld(); return out.copy(this.model.exitLocal).applyMatrix4(this.mesh.matrixWorld); }
  // ONLINE: o avião NÃO anda mais só com o dt do aparelho (celular a 20 FPS, aba em segundo plano, câmera lenta da morte... cada um acabava com o
  // avião num lugar diferente, e os bots/jogadores "saltavam do nada"). A posição certa vem do relógio da partida (LS.Net.matchTime(), em segundos
  // desde o 'go' do servidor): progresso = velocidade * tempo / comprimento. O dt local só suaviza (PLL): anda com o dt e é puxado pro valor certo.
  sync(matchT, dt) {
    if (!this.active) return;
    const want = this.speed * matchT / this.length, err = want - this.progress;
    this.t += dt;
    if (Math.abs(err) * this.length > 40) this.progress = want;                 // longe demais (aba voltou, reconectou): vai direto pro lugar certo
    else this.progress += this.speed * dt / this.length + err * Math.min(1, dt * 4); // perto: anda e é puxado de leve (sem tranco na câmera)
    this.mesh.position.lerpVectors(this.start, this.end, Math.min(1, Math.max(0, this.progress)));
    LS.PlaneModel.animate(this.model, this.t, dt, this.progress > 0.04 && this.progress < 1.0);
    if (this.progress >= 1.1) { this.active = false; this.mesh.visible = false; }
  }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    this.progress += this.speed * dt / this.length;
    this.mesh.position.lerpVectors(this.start, this.end, Math.min(1, this.progress));
    LS.PlaneModel.animate(this.model, this.t, dt, this.progress > 0.04 && this.progress < 1.0);
    if (this.progress >= 1.1) { this.active = false; this.mesh.visible = false; }
  }
};
