// PAREDE DE GEL (estilo bloquinho): muro curvo de cubos de gel azul, meio transparente, com topo de "gelo" irregular.
// Inspirada no modelo enviado (arco de ~4 m, 2,4 m de altura), refeita em blocos pra combinar com o jogo.
//  - nasce "brotando" do chão, do meio pras pontas, com um pulinho de geleia (sem base: só os cubos)
//  - balança de leve quando leva tiro (hit) e estoura em pedaços que voam (shatter)
//  - colisores por coluna: segura gente e bala
// Teste: console → "parede" (cria na sua frente) · "parede quebrar"
'use strict';
LS.GelWall = class {
  constructor(scene, x, y, z, yaw, opts) {
    opts = opts || {};
    this.scene = scene; this.t = 0; this.state = 'grow'; this.hp = opts.hp || 400; this.cols = []; this.id = opts.id || null; // id de rede (dono:n): o dano vindo da rede acha a parede por ele
    const B = LS.GelWall.B, rnd = LS.util.seeded(opts.seed || Math.floor(Math.random() * 1e6));
    const g = this.group = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw || 0;
    // colunas ao longo de um arco (a parede abraça quem está atrás dela)
    const N = 11, R = 3.4, span = 1.15, blocks = [];
    for (let c = 0; c < N; c++) {
      const u = c / (N - 1) - 0.5, a = u * span, edge = Math.abs(u) * 2; // 0 no meio, 1 nas pontas
      const cx = Math.sin(a) * R, cz = R - Math.cos(a) * R; // pontas curvam NA DIREÇÃO de quem está atrás: a parede abraça e protege
      const h = Math.max(3, Math.round(6 - edge * edge * 2 + (rnd() - 0.5) * 1.6)); // pontas mais baixas, topo irregular
      for (const row of [0, 1]) { // duas camadas: a de trás um pouco mais baixa (dá volume)
        const hh = row ? Math.max(2, h - 1 - (rnd() < 0.4 ? 1 : 0)) : h;
        for (let k = 0; k < hh; k++) {
          const top = k === hh - 1, j = (rnd() - 0.5) * 0.06;
          blocks.push({ c, row, k, a: -a, x: cx + Math.sin(a) * row * B * 0.9 + j, z: cz - Math.cos(a) * row * B * 0.9, y: k * B + B / 2,
            s: top ? 0.9 + rnd() * 0.12 : 1, col: top ? 2 : rnd() < 0.18 ? 1 : rnd() < 0.12 ? 3 : 0, top, delay: edge * 0.22 + k * 0.035 + row * 0.05 });
        }
      }
      this.cols.push({ c, a, cx, cz, h });
    }
    this.blocks = blocks;
    // um InstancedMesh pra todos os cubos (leve)
    const pal = [new THREE.Color(0x5fd8ff), new THREE.Color(0xa8efff), new THREE.Color(0xe8fbff), new THREE.Color(0x3cb8ea)]; // gel, brilho, topo gelado, fundo
    const geo = new THREE.BoxGeometry(B, B, B);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, emissive: 0x0a3a55, depthWrite: true });
    const im = this.mesh = new THREE.InstancedMesh(geo, mat, blocks.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    blocks.forEach((b, i) => im.setColorAt(i, pal[b.col].clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.05)));
    im.castShadow = true; im.receiveShadow = true; g.add(im);
    // bolinhas de ar dentro do gel (pontinhos claros que sobem devagar)
    const bub = new THREE.BoxGeometry(0.07, 0.07, 0.07), bm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
    this.bubbles = [];
    for (let i = 0; i < 14; i++) {
      const col = this.cols[Math.floor(rnd() * N)], m = new THREE.Mesh(bub, bm);
      m.userData = { x: col.cx + (rnd() - 0.5) * 0.25, z: col.cz + 0.05, top: col.h * B - 0.2, y: rnd() * col.h * B, sp: 0.15 + rnd() * 0.25 };
      g.add(m); this.bubbles.push(m);
    }
    scene.add(g);
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.S = new THREE.Vector3(); this.P = new THREE.Vector3(); this.E = new THREE.Euler();
    this.place(0);
    if (opts.collide !== false) this.addColliders();
    LS.GelWall.list.push(this);
  }
  static get B() { return 0.42; }
  static get GROW() { return 7; }
  // colisores: uma caixa por coluna (no mundo)
  addColliders() {
    const W = LS.World, B = LS.GelWall.B, g = this.group, v = new THREE.Vector3(); this.colliders = [];
    g.updateMatrixWorld(true);
    for (const c of this.cols) {
      v.set(c.cx, 0, c.cz - B * 0.45).applyMatrix4(g.matrixWorld);
      const r = B * 0.75, b = W.addCollider(v.x - r, g.position.y, v.z - r, v.x + r, g.position.y + c.h * B, v.z + r);
      b.gel = this; this.colliders.push(b);
    }
  }
  removeColliders() {
    const W = LS.World, set = new Set(this.colliders || []); if (!set.size) return;
    for (let i = W.boxes.length - 1; i >= 0; i--) if (set.has(W.boxes[i])) W.boxes.splice(i, 1);
    for (const [k, l] of W.grid) { if (!l.some(b => set.has(b))) continue; const f = l.filter(b => !set.has(b)); if (f.length) W.grid.set(k, f); else W.grid.delete(k); }
    this.colliders = [];
  }
  // posiciona os cubos: k = tempo desde o começo (brotar) · wob = balanço do tiro
  place(k) {
    const im = this.mesh, M = this.M, Q = this.Q, S = this.S, P = this.P, E = this.E;
    const pop = x => x <= 0 ? 0 : x >= 1 ? 1 : 1 + Math.sin(x * Math.PI) * 0.22 * (1 - x) + (1 - Math.pow(1 - x, 3)) - 1; // cresce com um pulinho
    const wob = this.wobT > 0 ? Math.sin(this.wobT * 40) * this.wobT * 0.12 : 0;
    this.blocks.forEach((b, i) => {
      const e = Math.min(1.2, Math.max(0, (k - b.delay) / 0.28)), s = Math.max(0.001, pop(Math.min(1, e)) * b.s);
      P.set(b.x + wob * (b.y / 2.5), b.y * Math.min(1, e * 1.4) - (1 - Math.min(1, e)) * 0.2, b.z);
      E.set(0, b.a, wob * 0.15 * (b.y / 2.5)); Q.setFromEuler(E); S.set(s, s * (b.top ? 0.85 : 1), s);
      M.compose(P, Q, S); im.setMatrixAt(i, M);
    });
    im.instanceMatrix.needsUpdate = true;
  }
  wobble() { if (this.state === 'grow' || this.state === 'idle') this.wobT = 0.35; } // só balança (tiro visual de outro jogador)
  static byId(id) { return LS.GelWall.list.find(w => w.id === id) || null; }
  hit(dmg) {
    if (this.state === 'dead' || this.state === 'shatter') return;
    this.wobT = 0.35; this.hp -= dmg || 0;
    if (this.hp <= 0) this.shatter();
  }
  // estoura: cada cubo voa girando, cai e some
  shatter() {
    if (this.state === 'shatter' || this.state === 'dead') return;
    this.state = 'shatter'; this.t = 0; this.removeColliders();
    const rnd = Math.random;
    this.blocks.forEach(b => { b.vx = Math.sin(b.a) * (1 + rnd() * 2) + (rnd() - 0.5) * 2; b.vz = (rnd() - 0.3) * 3; b.vy = 2 + rnd() * 4 + b.y * 0.6; b.rx = (rnd() - 0.5) * 12; b.rz = (rnd() - 0.5) * 12; b.px = b.x; b.py = b.y; b.pz = b.z; });
    if (LS.Audio.ctx) { const s = LS.GelWall.snd(this.group.position); LS.Audio.gelBreak(s.d, s.pan); }
  }
  update(dt) {
    this.t += dt;
    if (this.life !== undefined && this.state !== 'shatter' && this.state !== 'dead') { this.life -= dt; if (this.life <= 0) this.shatter(); } // some sozinha depois de um tempo
    for (const m of this.bubbles) { const u = m.userData; u.y += u.sp * dt; if (u.y > u.top) u.y = 0.1; m.position.set(u.x, u.y, u.z); m.visible = this.state !== 'shatter'; }
    if (this.state === 'grow') {
      this.place(this.t * LS.GelWall.GROW); // GROW alto = brota rápido (7 ≈ 0,12 s)
      if (this.t * LS.GelWall.GROW > 1.05) { this.state = 'idle'; this.place(9); }
    } else if (this.state === 'idle') {
      if (this.wobT > 0) { this.wobT = Math.max(0, this.wobT - dt); this.place(9); }
    } else if (this.state === 'shatter') {
      const im = this.mesh, M = this.M, Q = this.Q, S = this.S, P = this.P, E = this.E, k = this.t;
      this.blocks.forEach((b, i) => {
        b.vy -= 18 * dt; b.px += b.vx * dt; b.py = Math.max(0.1, b.py + b.vy * dt); b.pz += b.vz * dt; if (b.py <= 0.1) { b.vx *= 0.8; b.vz *= 0.8; b.vy *= -0.3; }
        const s = Math.max(0.001, (1 - k / 0.9) * 0.8);
        P.set(b.px, b.py, b.pz); E.set(b.rx * k, b.a, b.rz * k); Q.setFromEuler(E); S.set(s, s, s); M.compose(P, Q, S); im.setMatrixAt(i, M);
      });
      im.instanceMatrix.needsUpdate = true; im.material.opacity = 0.82 * Math.max(0, 1 - k / 0.9);
      if (k > 0.95) this.dispose();
    }
  }
  dispose() {
    this.state = 'dead'; this.removeColliders();
    if (this.group.parent) this.group.parent.remove(this.group);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    const L = LS.GelWall.list, i = L.indexOf(this); if (i >= 0) L.splice(i, 1);
  }
  static updateAll(dt) { if (LS.GelBall) LS.GelBall.update(dt); for (const w of LS.GelWall.list.slice()) w.update(dt); }
  // distância e lado (estéreo) de um ponto em relação a quem está jogando
  static snd(p) {
    const P = LS.Game.player; if (!P || !P.pos) return { d: 0, pan: 0 };
    const dx = p.x - P.pos.x, dz = p.z - P.pos.z, d = Math.hypot(dx, dz);
    return { d, pan: d < 0.5 ? 0 : -Math.sin(LS.util.angleDiff(P.camYaw, Math.atan2(dx, dz))) };
  }
  static clear() { for (const w of LS.GelWall.list.slice()) w.dispose(); if (LS.GelBall) LS.GelBall.clear(); }
};
LS.GelWall.list = [];

// ---------- BOLA DE GELO: o item que vira a parede ----------
//  Q (ou o botão ❄ no celular) arremessa; onde ela cair nasce a parede, virada pra quem jogou.
//  Battle royale: começa com 0 (acha no chão) · Duelo: 2 por round · Sala: infinita (ou 2 por round se o dono desligar)
LS.GelBall = {
  SPEED: 15, UP: 3.2, GRAV: 22, CD: 0.55, LIFE: 30, PER_OWNER: 4,
  FIX: 1 / 60, // PASSO FIXO da simulação: todo computador calcula a mesma trajetória e a parede nasce no mesmo lugar (antes usava o dt de cada aparelho)
  balls: [], known: new Set(),
  mesh() {
    if (!this._geo) this._geo = LS.Items.itemGeometry({ type: 'gel', id: 'gel' });
    return LS.Items.mesh(this._geo);
  },
  // o jogador (ou quem estiver no comando local) arremessa: tira do inventário e avisa a rede
  throwFrom(f, dir) {
    if (!f.alive || f.state !== 'ground' || (f.gelCd || 0) > 0) return false;
    if (!f.gelInf && !(f.gel > 0)) return false;
    if (!f.gelInf) f.gel--;
    f.gelCd = this.CD;
    const o = f.eyePos(new THREE.Vector3()); o.y -= 0.25; o.x += dir.x * 0.6; o.z += dir.z * 0.6;
    const v = new THREE.Vector3(dir.x, Math.max(-0.4, dir.y), dir.z).normalize().multiplyScalar(this.SPEED); v.y += this.UP;
    // arredonda ANTES de simular: quem atira e quem recebe pela rede partem exatamente dos mesmos números
    const r2 = n => Math.round(n * 100) / 100;
    o.set(r2(o.x), r2(o.y), r2(o.z)); v.set(r2(v.x), r2(v.y), r2(v.z));
    const n = f.gelSeq = (f.gelSeq | 0) + 1, id = f.netId ? f.netId + ':' + n : null;
    if (LS.Net.online && LS.Net.owns(f)) LS.Net.send({ t: 'gel', i: f.netId, n, o: [o.x, o.y, o.z], v: [v.x, v.y, v.z] });
    this.spawn(f, o, v, id, 0);
    if (LS.Audio.ctx) { if (f.isPlayer) LS.Audio.gelThrow(); else { const s = LS.GelWall.snd(f.pos); if (s.d < 40) LS.Audio.gelThrow(s.d, s.pan); } }
    return true;
  },
  // cria a bolinha voando (também usado quando chega da rede e na reconexão: age = há quantos segundos ela foi jogada, pra "adiantar" a simulação)
  spawn(owner, o, v, id, age) {
    if (id) { if (this.known.has(id)) return; this.known.add(id); if (this.known.size > 400) this.known.delete(this.known.values().next().value); } // mesma bola não nasce duas vezes
    const m = this.mesh(); m.scale.setScalar(1.5); m.position.copy(o); LS.Game.scene.add(m);
    const b = { owner, pos: o.clone(), vel: v.clone(), from: o.clone(), m, t: 0, acc: 0, id };
    this.balls.push(b);
    if (age > 0.05) this.advance(b, age);
  },
  // um passo fixo da bola; devolve o ponto de pouso se ela parou
  step(b) {
    const W = LS.World, d = this._d || (this._d = new THREE.Vector3()), dt = this.FIX;
    b.t += dt; b.vel.y -= this.GRAV * dt;
    d.copy(b.vel).multiplyScalar(dt); const len = d.length(); d.divideScalar(len || 1);
    const hit = W.raycast(b.pos, d, len + 0.15);
    let land = null;
    if (hit < len + 0.1) land = b.pos.clone().addScaledVector(d, Math.max(0, hit - 0.5)); // bateu (chão, parede, caixa): nasce um pouco antes
    else b.pos.addScaledVector(d, len);
    if (!land) { const g = W.groundAt(b.pos.x, b.pos.z, b.pos.y + 0.2, 0.2); if (b.pos.y <= g + 0.05) land = b.pos.clone(); }
    if (!land && b.t > 2.5) land = b.pos.clone();
    return land;
  },
  // adianta a simulação (reconexão): se a bola já pousou, a parede nasce já com o tempo de vida que sobrou
  advance(b, secs) {
    let k = Math.floor(secs / this.FIX);
    while (k-- > 0) {
      const land = this.step(b);
      if (land) { const i = this.balls.indexOf(b); if (i >= 0) this.balls.splice(i, 1); if (b.m.parent) b.m.parent.remove(b.m); this.burst(b.owner, land, b.from, b.id, secs - b.t); return; }
    }
    b.m.position.copy(b.pos);
  },
  update(dt) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i]; b.acc += dt;
      let land = null, n = 0;
      while (!land && b.acc >= this.FIX && n++ < 12) { b.acc -= this.FIX; land = this.step(b); }
      b.m.position.copy(b.pos); b.m.rotation.x += dt * 9; b.m.rotation.z += dt * 6;
      if (land) { this.balls.splice(i, 1); if (b.m.parent) b.m.parent.remove(b.m); this.burst(b.owner, land, b.from, b.id, 0); }
    }
  },
  // a bolinha estoura e a parede brota de frente pra onde ela foi jogada (a origem do arremesso é igual em todo mundo; a posição atual do dono não era)
  burst(owner, p, from, id, elapsed) {
    const W = LS.World, y = W.groundAt(p.x, p.z, p.y + 0.6, 0.3), el = elapsed || 0;
    const life = this.LIFE - el; if (life <= 0) return;
    const f = from || p, yaw = Math.atan2(f.x - p.x, f.z - p.z);
    // no máximo algumas paredes por pessoa (a mais velha estoura) e um teto geral
    const mine = LS.GelWall.list.filter(w => w.owner === owner && w.state !== 'shatter');
    if (owner && mine.length >= this.PER_OWNER) mine[0].shatter();
    const all = LS.GelWall.list.filter(w => w.state !== 'shatter'); if (all.length >= 40) all[0].shatter();
    const w = new LS.GelWall(LS.Game.scene, p.x, y, p.z, yaw, { seed: Math.floor(p.x * 73 + p.z * 31), id });
    w.owner = owner; w.life = life;
    if (el > 0.3) { w.state = 'idle'; w.place(9); } // reconexão: a parede já estava de pé
    else if (LS.Audio.ctx) { const s = LS.GelWall.snd(p); LS.Audio.gelPop(s.d, s.pan); }
  },
  clear() { for (const b of this.balls) if (b.m.parent) b.m.parent.remove(b.m); this.balls = []; this.known = new Set(); }
};
