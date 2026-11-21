// Modelo humanoide procedural com animações (andar, correr, pular, agachar, atirar, morrer)
'use strict';
LS.geoCache = {};
LS.boxGeo = function (w, h, d, oy) {
  const k = w + '_' + h + '_' + d + '_' + (oy || 0);
  if (!LS.geoCache[k]) { const g = new THREE.BoxGeometry(w, h, d); if (oy) g.translate(0, oy, 0); LS.geoCache[k] = g; }
  return LS.geoCache[k];
};
LS.lambert = function (color) { return LS.World.mat(color); };

// Cria o modelo de uma arma
LS.buildGunMesh = function (id) {
  const w = LS.WEAPONS[id], g = new THREE.Group(), L = w.len;
  const body = new THREE.Mesh(LS.boxGeo(0.09, 0.13, L * 0.6), LS.lambert(w.color)); body.position.z = L * 0.15; g.add(body);
  const barrel = new THREE.Mesh(LS.boxGeo(0.045, 0.045, L * 0.45), LS.lambert(0x151515)); barrel.position.set(0, 0.03, L * 0.6); g.add(barrel);
  const grip = new THREE.Mesh(LS.boxGeo(0.07, 0.16, 0.07), LS.lambert(0x222222)); grip.position.set(0, -0.12, 0); grip.rotation.x = 0.25; g.add(grip);
  if (w.cat !== 'Pistola') {
    const stock = new THREE.Mesh(LS.boxGeo(0.07, 0.12, L * 0.3), LS.lambert(w.cat === 'Rifle' && id === 'ak47' ? 0x6b4423 : 0x2a2a2a)); stock.position.set(0, -0.02, -L * 0.2); g.add(stock);
    if (w.cat === 'Rifle' || w.cat === 'SMG') { const mag = new THREE.Mesh(LS.boxGeo(0.06, 0.18, 0.08), LS.lambert(0x1a1a1a)); mag.position.set(0, -0.14, L * 0.25); mag.rotation.x = -0.2; g.add(mag); }
  }
  if (w.scope) { const sc = new THREE.Mesh(LS.boxGeo(0.07, 0.07, 0.3), LS.lambert(0x111111)); sc.position.set(0, 0.12, L * 0.15); g.add(sc); }
  g.userData.muzzle = new THREE.Object3D(); g.userData.muzzle.position.set(0, 0.03, L * 0.83); g.add(g.userData.muzzle);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
};

// Personagem em blocos (estilo voxel) com animações: andar, correr, pular, agachar, atirar, morrer
LS.CharacterModel = class {
  constructor(opts) {
    const K = LS.Skin, S = K.PX;
    this.look = opts.look || K.randomLook();
    this.seed = Math.floor(Math.random() * 1e6) + 1;
    this.tex = K.makeTexture(this.look, this.seed);
    this.mat = new THREE.MeshLambertMaterial({ map: this.tex, skinning: true });
    const M = c => LS.lambert(c);
    // ---- esqueleto em 15 peças (como o R15): tronco de cima/baixo, cabeça, braço/antebraço/mão e coxa/canela/pé ----
    this.root = new THREE.Group();
    const B = (name, parent, x, y) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, 0); parent.add(b); return b; };
    this.hipsY = 12 * S;
    this.hips = B('Hips', this.root, 0, this.hipsY);           // tronco de baixo (quadril)
    this.torso = B('Spine', this.hips, 0, 5 * S);              // tronco de cima, gira na cintura
    this.torsoC = new THREE.Group(); this.torsoC.position.y = -5 * S; this.torso.add(this.torsoC); // origem no quadril (colete, mochila)
    this.headG = B('Head', this.torso, 0, 7 * S);
    const arm = (side, P) => { const a = B(P + 'Arm', this.torso, side * 6 * S, 7 * S), f = B(P + 'ForeArm', a, 0, -5 * S), h = B(P + 'Hand', f, 0, -5 * S); return [a, f, h]; };
    const leg = (side, P) => { const u = B(P + 'UpLeg', this.hips, side * 2 * S, 0), l = B(P + 'Leg', u, 0, -6 * S), f = B(P + 'Foot', l, 0, -5 * S); return [u, l, f]; };
    [this.armR, this.foreR, this.handR] = arm(-1, 'Right'); [this.armL, this.foreL, this.handL] = arm(1, 'Left');
    [this.legR, this.shinR, this.footR] = leg(-1, 'Right'); [this.legL, this.shinL, this.footL] = leg(1, 'Left');
    this.bones = {};
    for (const n of LS.CharacterModel.BONES) this.root.traverse(o => { if (o.isBone && o.name === n) this.bones[n] = o; });
    // uma malha só, com cada pedaço preso no seu osso (1 desenho por personagem)
    this.root.updateMatrixWorld(true);
    this.body = new THREE.SkinnedMesh(LS.CharacterModel.skinGeometry(this), this.mat);
    this.body.frustumCulled = false; this.root.add(this.body); this.body.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(LS.CharacterModel.BONES.map(n => this.bones[n]));
    this.body.bind(this.skeleton);
    this.vestMesh = new THREE.Mesh(LS.boxGeo(8.8 * S, 8 * S, 4.8 * S, 4 * S), M(0x4a5a3a)); this.vestMesh.position.y = 3.6 * S; this.vestMesh.visible = false; this.torsoC.add(this.vestMesh);
    this.bagMesh = new THREE.Mesh(LS.boxGeo(6 * S, 8 * S, 3 * S, 4 * S), M(0x5a4a2a)); this.bagMesh.position.set(0, 3 * S, -3.5 * S); this.bagMesh.visible = false; this.torsoC.add(this.bagMesh);
    this.helmetMesh = new THREE.Mesh(LS.boxGeo(9 * S, 4 * S, 9 * S, 2 * S), M(0x3a4a2a)); this.helmetMesh.position.y = 5.5 * S; this.helmetMesh.visible = false; this.headG.add(this.helmetMesh);
    this.brim = new THREE.Mesh(LS.boxGeo(8 * S, 0.8 * S, 3 * S), M(0x333333)); this.brim.position.set(0, 6.4 * S, 5.4 * S); this.headG.add(this.brim);
    this.accG = new THREE.Group(); this.headG.add(this.accG);
    this.anim = null; // LS.AnimPlayer, criado quando tocar a primeira animação externa
    // a arma fica num encaixe preso no corpo; as duas mãos seguram a arma por IK (como nos jogos de tiro modernos)
    this.gunSocket = new THREE.Group(); this.hips.add(this.gunSocket);
    this.gunHolder = new THREE.Group(); this.gunSocket.add(this.gunHolder);
    this.gun = null; this.gunId = null;
    // paraquedas (asa de células; as linhas vão até as mãos)
    this.chute = this.buildChute(opts.chute); this.root.add(this.chute);
    this.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.applyLook(this.look);
    this.phase = 0; this.recoilT = 0; this.crouchK = 0; this.deadT = 0;
  }
  applyLook(look) {
    this.look = Object.assign({}, look);
    LS.Skin.paint(this.tex.userData.canvas, this.look, this.seed);
    this.tex.needsUpdate = true;
    this.buildAccessories(look);
    this.brim.visible = look.hairStyle === 'boné' && (!look.hat || look.hat === 'nenhum');
    if (this.brim.visible) this.brim.material = LS.lambert(new THREE.Color(look.shirt).multiplyScalar(0.55).getHex());
  }
  // acessórios 3D da cabeça: chapéus, óculos e barba cheia
  buildAccessories(look) {
    const S = LS.Skin.PX, g = this.accG;
    while (g.children.length) g.remove(g.children[0]);
    const acc = new THREE.Color(look.accent || '#2a2a2a').getHex(), M = c => LS.lambert(c);
    const add = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(LS.boxGeo(w * S, h * S, d * S), mat); m.position.set(x * S, y * S, z * S); m.castShadow = true; g.add(m); return m; };
    if (look.hat === 'gorro') { add(8.8, 3, 8.8, 0, 7.6, 0, M(acc)); add(9, 1, 9, 0, 6.2, 0, M(new THREE.Color(acc).multiplyScalar(0.75).getHex())); }
    else if (look.hat === 'chapéu') { add(12, 0.6, 12, 0, 6.8, 0, M(0x6a4a2a)); add(7.6, 2.6, 7.6, 0, 8.4, 0, M(0x6a4a2a)); add(7.8, 0.7, 7.8, 0, 7.4, 0, M(acc)); }
    else if (look.hat === 'faixa') add(8.5, 1, 8.5, 0, 6.6, 0, M(acc));
    // ---- itens da loja ----
    const gold = 0xffc531, hairC = new THREE.Color(look.hair).getHex(), glow = c => new THREE.MeshBasicMaterial({ color: c });
    if (look.hat === 'coroa') {
      add(9, 1.4, 9, 0, 6.7, 0, M(gold));
      [[-3.9, -3.9], [3.9, -3.9], [-3.9, 3.9], [3.9, 3.9], [0, 3.9], [0, -3.9], [3.9, 0], [-3.9, 0]].forEach(([x, z]) => add(1.2, 2, 1.2, x, 8.3, z, M(gold)));
      add(1.4, 1.2, 0.5, 0, 6.8, 4.6, glow(0xff2a4a)); add(0.5, 1.2, 1.4, 4.6, 6.8, 0, glow(0x2a8aff)); add(0.5, 1.2, 1.4, -4.6, 6.8, 0, glow(0x2aff8a));
    }
    else if (look.hat === 'cartola') { add(11.4, 0.6, 11.4, 0, 6.6, 0, M(0x151515)); add(7.4, 6, 7.4, 0, 9.9, 0, M(0x151515)); add(7.6, 1, 7.6, 0, 7.5, 0, M(0xb02020)); }
    else if (look.hat === 'orelhas de gato') { add(8.6, 0.8, 1.2, 0, 7.9, 0, M(acc)); [-1, 1].forEach(s => { add(2.4, 2.6, 1.4, s * 2.6, 9.2, 0, M(acc)); add(1.2, 1.4, 0.4, s * 2.6, 9.0, 0.6, M(0xff9ab8)); }); }
    else if (look.hat === 'chifres') { [-1, 1].forEach(s => { const a = add(1.6, 3, 1.6, s * 3.1, 8.6, 0.6, M(0xb01818)); a.rotation.z = -s * 0.45; const b = add(1.1, 1.8, 1.1, s * 4.0, 10.5, 0.6, M(0xd83030)); b.rotation.z = -s * 0.75; }); }
    else if (look.hat === 'fones') { add(9.6, 1, 2, 0, 8.5, 0, M(0x222428)); [-1, 1].forEach(s => { add(1, 4.6, 2, s * 4.8, 6.3, 0, M(0x222428)); add(1.6, 3, 3, s * 4.9, 3.9, 0, M(acc)); add(0.4, 1.6, 1.6, s * 5.8, 3.9, 0, glow(0x20f0ff)); }); }
    else if (look.hat === 'auréola') { const B = glow(0xfff1a0); add(7, 0.6, 1, 0, 10.6, 3, B); add(7, 0.6, 1, 0, 10.6, -3, B); add(1, 0.6, 5, 3, 10.6, 0, B); add(1, 0.6, 5, -3, 10.6, 0, B); }
    else if (look.hat === 'boné reto') { add(8.8, 2.4, 8.8, 0, 7.2, 0, M(acc)); add(8.8, 0.5, 4.2, 0, 6.2, 5.9, M(acc)); add(2, 1.4, 0.3, 0, 7.4, 4.5, M(0xffffff)); }
    // ---- itens só de codiguin ----
    else if (look.hat === 'coroa diamante') {
      const D = glow(0x5ae8ff), base = M(0xdfe9f5);
      add(9.2, 1.4, 9.2, 0, 6.7, 0, base);
      [[-3.9, -3.9], [3.9, -3.9], [-3.9, 3.9], [3.9, 3.9]].forEach(([x, z]) => add(1.3, 3, 1.3, x, 8.8, z, D));
      [[0, 3.9], [0, -3.9], [3.9, 0], [-3.9, 0]].forEach(([x, z]) => add(1.1, 2.2, 1.1, x, 8.4, z, D));
      add(1.6, 1.4, 0.5, 0, 6.8, 4.7, glow(0xffffff)); add(0.5, 1.4, 1.6, 4.7, 6.8, 0, glow(0x9a6aff)); add(0.5, 1.4, 1.6, -4.7, 6.8, 0, glow(0x9a6aff));
    }
    else if (look.hat === 'astronauta') {
      const W = M(0xeef1f6), T = M(0xff8a1f);
      add(10, 1, 10, 0, 7.1, 0, W); add(10, 9.6, 1, 0, 2.3, -5, W); [-1, 1].forEach(sd => { add(1, 9.6, 10, sd * 5, 2.3, 0, W); add(1.2, 2.2, 2.2, sd * 5.3, 3.2, 0, T); });
      add(10, 1.6, 1, 0, 6.3, 5, W); add(10, 2, 1, 0, -1.6, 5, W); [-1, 1].forEach(sd => add(1, 6.4, 1, sd * 4.5, 2.4, 5, W));
      const glass = new THREE.MeshBasicMaterial({ color: 0x3aa8ff, transparent: true, opacity: 0.38 });
      add(8, 6.4, 0.3, 0, 2.4, 5.1, glass);
    }
    else if (look.hat === 'pirata') {
      const K = M(0x17141a), Gd = M(gold);
      add(11.4, 0.7, 9, 0, 6.7, 0, K); add(8, 3, 6.6, 0, 8.4, -0.2, K);
      const f = add(11.4, 2.6, 0.8, 0, 7.9, 4.4, K); f.rotation.x = -0.25;
      add(11.6, 0.4, 0.9, 0, 6.95, 4.55, Gd);
      add(2, 1.8, 0.3, 0, 8.3, 4.95, M(0xf2efe6)); add(0.5, 0.5, 0.2, -0.45, 8.5, 5.1, M(0x111111)); add(0.5, 0.5, 0.2, 0.45, 8.5, 5.1, M(0x111111));
    }
    else if (look.hat === 'halo glitch') {
      const Mg = glow(0xff2bd6), Cy = glow(0x2ee6ff);
      add(7, 0.6, 1, 0, 10.6, 3, Mg); add(7, 0.6, 1, 0, 10.6, -3, Cy); add(1, 0.6, 5, 3, 10.6, 0, Cy); add(1, 0.6, 5, -3, 10.6, 0, Mg);
      add(3, 0.6, 1, 1.2, 11.3, 3, Cy); add(2, 0.6, 1, -2, 9.9, -3, Mg); add(1, 0.6, 2, 3.6, 11.2, -1, Mg);
    }
    if (look.hairStyle === 'black power' && (!look.hat || look.hat === 'nenhum')) { add(10.4, 5, 10.4, 0, 7.6, -0.4, M(hairC)); add(8.4, 1.6, 2, 0, 9.6, 3.6, M(hairC)); }
    else if (look.hairStyle === 'rabo') { add(2.2, 2.2, 2, 0, 5.6, -4.8, M(hairC)); add(1.6, 4.4, 1.6, 0, 3.0, -5.4, M(hairC)); }
    if (look.glasses === 'cyber') add(8.8, 1.3, 0.9, 0, 3.6, 4.35, glow(0x20f0ff));
    else if (look.glasses === 'aviador') add(8.4, 1.2, 0.6, 0, 3.6, 4.3, M(0x3a2a10));
    if (look.mask === 'gás') { add(4.2, 3, 2, 0, 1.6, 4.9, M(0x2a2d32)); [-1, 1].forEach(s => add(1.8, 1.8, 1.8, s * 2.6, 1.2, 5.3, M(0x50555c))); }
    if (look.glasses === 'escuros') add(8.4, 1.2, 0.6, 0, 3.6, 4.3, M(0x111111));
    else if (look.glasses === 'viseira') add(8.6, 1.2, 0.8, 0, 3.6, 4.3, new THREE.MeshBasicMaterial({ color: acc }));
    if (look.beard === 'cheia') add(7, 2.5, 1.2, 0, 0.6, 4.4, M(new THREE.Color(look.hair).getHex()));
    else if (look.beard === 'mago') { const Wb = M(0xf4f4f0); add(7.4, 2.6, 1.3, 0, 0.6, 4.45, Wb); add(5.4, 3.4, 1.2, 0, -2.2, 4.5, Wb); add(3, 2.4, 1.1, 0, -4.8, 4.5, Wb); }
    else if (look.beard === 'gelo') { const I = M(0xa8e8ff); add(7.2, 2.5, 1.2, 0, 0.6, 4.45, I); [-2.4, 0, 2.4].forEach(x => add(1.1, 1.8, 1, x, -1.4, 4.5, glow(0xd8f6ff))); }
    if (look.glasses === 'fogo') { [-1, 1].forEach(sd => { add(2.2, 1.2, 0.4, sd * 2, 3.6, 4.45, glow(0xff7a1a)); add(1, 1.4, 0.4, sd * 2.4, 4.9, 4.45, glow(0xffe14a)); add(0.8, 0.8, 0.4, sd * 1.6, 5.9, 4.45, glow(0xff4a1a)); }); }
    else if (look.glasses === 'matrix') add(8.8, 1.3, 0.9, 0, 3.6, 4.35, glow(0x3dff6a));
    this.hatVisible = look.hat && look.hat !== 'nenhum';
  }
  setGun(id) {
    if (this.gunId === id) return;
    if (this.gun) this.gunHolder.remove(this.gun);
    this.gun = null; this.gunId = id;
    if (id) { this.gun = LS.buildGunMesh(id); this.gunHolder.add(this.gun); }
  }
  // colete, capacete e mochila com o modelo de cada nível (mesmos modelos do chão)
  setGear(vest, helmet, bag) {
    const put = (key, parent, kind, lv) => {
      if (this['_' + key + 'Lv'] === lv) return;
      this['_' + key + 'Lv'] = lv;
      if (this[key]) parent.remove(this[key]);
      this[key] = lv ? LS.Items.mesh(LS.Items.gearGeometry(kind, lv)) : null;
      if (this[key]) parent.add(this[key]);
    };
    put('vestModel', this.torsoC, 'vest', vest); put('helmetModel', this.headG, 'helmet', helmet); put('bagModel', this.torsoC, 'bag', bag);
    this.vestMesh.visible = this.helmetMesh.visible = this.bagMesh.visible = false;
    this.brim.visible = !helmet && this.look.hairStyle === 'boné' && !this.hatVisible;
    this.accG.children.forEach(m => { if (m.position.y > 6 * LS.Skin.PX) m.visible = !helmet; });
  }
  // ---------- eventos de animação ----------
  // tiro: recuo; sniper (ferrolho) e escopetas (bomba/alavanca) ainda ciclam a arma depois do disparo
  shoot(def) {
    this.recoilT = 1;
    if (def && this.gun && (def.scope || def.cat === 'Escopeta')) { this.cycleK = 0; this.cycleDur = Math.min(0.9, 0.85 / def.rate); }
  }
  // troca de arma animada: guarda a atual (desce) e saca a nova (sobe)
  switchGun(id) {
    if (this.gunId === id && this.pendingGun === undefined) return;
    this.pendingGun = id;
    this.swapK = this.gunId ? 0 : 0.5; // desarmado: só sobe com a nova
  }
  // pente na mão esquerda (mesmo modelo do pente da arma)
  showHandMag(on) {
    const id = on ? this.gunId : null;
    if (this.handMagId === id) return;
    this.handMagId = id;
    if (this.handMag) { this.handL.remove(this.handMag); this.handMag = null; }
    if (!id || !LS.Items.gunTags(id).includes('mag')) return;
    const geo = LS.Items.gunPart(id, 'mag'); geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3()), S = LS.Skin.PX, g = new THREE.Group(), m = LS.Items.mesh(geo);
    m.position.copy(c).negate(); g.add(m); g.position.set(0, -2.6 * S, 0.6 * S); g.rotation.set(0.3, 0, 0);
    this.handL.add(g); this.handMag = g;
  }
  punch() { this.punchT = 1; this.punchSide = -(this.punchSide || -1); }
  hit() { this.hitT = 1; this.hitSide = Math.random() < 0.5 ? -1 : 1; }
  muzzleWorld(target) {
    if (this.gun) return this.gun.userData.muzzle.getWorldPosition(target);
    return this.headG.getWorldPosition(target);
  }
  // item de cura na mão esquerda durante o uso
  setMedInHand(type) {
    if (this.medType === type) return;
    this.medType = type;
    if (this.medMesh) { this.handL.remove(this.medMesh); this.medMesh = null; }
    if (type) {
      const S = LS.Skin.PX, m = LS.Items.mesh(LS.Items.itemGeometry({ type: 'med', id: type }));
      m.scale.setScalar(type === 'medkit' ? 0.55 : 0.8); m.position.set(0, -2.5 * S, 1.2 * S); m.rotation.set(Math.PI / 2, 0, 0);
      this.handL.add(m); this.medMesh = m;
    }
  }
  // ---------- ajudantes de pose (R15) ----------
  // braço: [inclinação, giro, abertura (+ = pra fora do corpo, nos dois lados), cotovelo (+ = dobra pra frente), punho]
  setArm(side, p) {
    const a = side > 0 ? this.armL : this.armR, f = side > 0 ? this.foreL : this.foreR, h = side > 0 ? this.handL : this.handR;
    a.rotation.set(p[0], side > 0 ? -p[1] : p[1], side > 0 ? p[2] : -p[2]);
    f.rotation.set(-LS.util.clamp(p[3] || 0, 0, 2.5), 0, 0); // cotovelo não dobra pra trás
    h.rotation.set(-(p[4] || 0), 0, 0);
  }
  // perna direta: coxa (+ = pra trás), joelho (+ = dobra), abertura (+ = pra fora); o pé fica meio nivelado
  legPose(side, thigh, knee, spread, footK) {
    const u = side > 0 ? this.legL : this.legR, l = side > 0 ? this.shinL : this.shinR, f = side > 0 ? this.footL : this.footR;
    u.rotation.set(thigh, 0, side > 0 ? spread : -spread); l.rotation.set(Math.max(0, knee), 0, 0);
    f.rotation.set(-(thigh + Math.max(0, knee)) * (footK === undefined ? 0.5 : footK), 0, 0);
  }
  // perna com IK de 2 ossos (coxa e canela do mesmo tamanho): o pé vai pra (fwd à frente, lift acima do chão)
  // e fica reto no chão; o joelho sempre dobra pra frente
  solveLeg(side, fwd, lift, hipY, spread) {
    const u = side > 0 ? this.legL : this.legR, l = side > 0 ? this.shinL : this.shinR, f = side > 0 ? this.footL : this.footR;
    const LEN = 12 * LS.Skin.PX - 1e-4;
    let dy = Math.max(0.04, hipY - lift), d = Math.hypot(fwd, dy);
    if (d > LEN) { fwd *= LEN / d; dy *= LEN / d; d = LEN; }
    const c = Math.acos(Math.min(1, d / LEN)), a = Math.atan2(fwd, dy) + c, knee = 2 * c;
    u.rotation.set(-a, 0, side > 0 ? spread : -spread); l.rotation.set(knee, 0, 0); f.rotation.set(a - knee, 0, 0);
  }

  // ---------- paraquedas ----------
  // asa moderna: 9 células em arco com faixas de 2 cores e bordo de ataque escuro; linhas da asa até as mãos (frente)
  // e os ombros (trás), refeitas a cada quadro
  buildChute(color) {
    const g = new THREE.Group(), PAL = [[0xff5a2a, 0xffd02a], [0x2a8aff, 0xf2f2f2], [0x2fd27a, 0x1d3b2a], [0xff3a8a, 0x2a2a2a], [0xffc21a, 0x2a5ab0], [0xe8e8e8, 0xd0302a]];
    const pc = color ? [color, 0xf2f2f2] : LS.util.pick(PAL);
    const N = 9, SPAN = 4.4, CHORD = 1.7, TH = 0.26, R = 3.2;
    this.wing = new THREE.Group(); this.wing.position.y = 3.7; g.add(this.wing);
    this.cells = [];
    for (let i = 0; i < N; i++) {
      const u = (i - (N - 1) / 2) / ((N - 1) / 2), a = u * 0.62, w = SPAN / N * 1.04, col = i % 2 ? pc[1] : pc[0];
      const piv = new THREE.Group(); piv.position.set(Math.sin(a) * R, Math.cos(a) * R - R, 0); piv.rotation.z = -a;
      const body = new THREE.Group(); piv.add(body);
      const m = new THREE.Mesh(LS.boxGeo(w, TH, CHORD), LS.lambert(col)); m.castShadow = true; body.add(m);
      const le = new THREE.Mesh(LS.boxGeo(w * 0.96, TH * 0.78, 0.07), LS.lambert(new THREE.Color(col).multiplyScalar(0.45).getHex()));
      le.position.z = CHORD / 2 + 0.03; body.add(le);
      this.wing.add(piv); this.cells.push({ piv, body, u, base: piv.position.clone(), rot: -a });
    }
    // pontos de amarração: embaixo das células 0, 2, 6 e 8, na frente e atrás
    this.lineAnch = [];
    for (const c of [0, 2, 6, 8]) for (const z of [0.65, -0.55]) this.lineAnch.push({ c, z });
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.lineAnch.length * 6), 3));
    this.lineMat = new THREE.LineBasicMaterial({ color: 0x1b1b1b, transparent: true, opacity: 0.85 });
    this.lines = new THREE.LineSegments(this.lineGeo, this.lineMat); this.lines.frustumCulled = false; g.add(this.lines);
    g.visible = false;
    return g;
  }
  // abertura (0..1), respiração, curva (puxa o lado) e murchar no pouso (collapse 0..1)
  poseChute(open, st, jolt, t, collapse) {
    const L = LS.util.lerp, ss = x => { x = LS.util.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
    const eo = 1 - Math.pow(1 - LS.util.clamp(open, 0, 1), 3), cl = ss(collapse || 0);
    // sobe da mochila até lá em cima, já abrindo; no pouso cai pra FRENTE murchando (não tampa a câmera, que fica atrás)
    this.wing.position.set(0, L(L(1.5, 3.7, eo), 0.35, cl), L(0, 2.2, cl));
    this.wing.rotation.set(-jolt * 0.35 + Math.sin(t * 0.9) * 0.03 + cl * 1.3, 0, Math.sin(t * 1.3) * 0.06 + st * 0.35);
    for (const c of this.cells) {
      const k = ss((open - Math.abs(c.u) * 0.35) / 0.65);               // enche do centro pras pontas
      const br = 1 + Math.sin(t * 3.1 + c.u * 2.2) * 0.07;               // "respira" em onda
      c.piv.position.set(c.base.x * L(0.12, 1, k) * L(1, 1.25, cl), c.base.y * L(0.3, 1, k), 0);
      c.piv.rotation.z = c.rot * k;
      c.body.scale.set(L(0.25, 1, k), L(0.15, 1, k) * br * L(1, 0.25, cl), L(0.35, 1, k));
      c.body.rotation.x = Math.max(0, Math.sign(c.u) * st) * Math.abs(c.u) * 0.45; // lado puxado: bordo de fuga desce
    }
    this.lineMat.opacity = 0.85 * (1 - cl);
  }
  // linhas: da asa até as mãos (frente) e os ombros (trás) — seguem o boneco em tempo real
  updateChuteLines() {
    const V = THREE.Vector3, t = this._cl || (this._cl = { a: new V(), h: [new V(), new V()], s: [new V(), new V()] });
    this.root.updateMatrixWorld(true);
    const S = LS.Skin.PX;
    [this.handR, this.handL].forEach((h, i) => this.chute.worldToLocal(h.localToWorld(t.h[i].set(0, -1.5 * S, 0))));
    [this.armR, this.armL].forEach((a, i) => this.chute.worldToLocal(a.localToWorld(t.s[i].set(0, 0, 0))));
    const P = this.lineGeo.attributes.position, arr = P.array;
    this.lineAnch.forEach((an, j) => {
      const c = this.cells[an.c];
      c.body.localToWorld(t.a.set(0, -0.13, an.z)); this.chute.worldToLocal(t.a);
      const side = c.u < 0 ? 0 : 1, end = an.z > 0 ? t.h[side] : t.s[side];   // u < 0 = lado direito do boneco
      arr.set([t.a.x, t.a.y, t.a.z, end.x, end.y, end.z], j * 6);
    });
    P.needsUpdate = true;
  }

  // ---------- armas: encaixe no corpo + as duas mãos por IK ----------
  // pontos de cada arma (no espaço da arma; frente = +Z): cabo (mão direita), guarda-mão (esquerda), coronha, pente...
  gunPoints(id) {
    const C = LS.CharacterModel.GUNPTS || (LS.CharacterModel.GUNPTS = {});
    if (C[id]) return C[id];
    const V = THREE.Vector3, g = LS.buildGunMesh(id), box = new THREE.Box3().setFromObject(g), cat = LS.WEAPONS[id].cat, P = g.userData.parts || {};
    const pistol = cat === 'Pistola', center = o => new THREE.Box3().setFromObject(o).getCenter(new V());
    const fore = { Rifle: 0.3, SMG: 0.3, Sniper: 0.24, Escopeta: 0.3 }[cat] || 0.3;
    const out = {
      cat, pistol,
      stock: pistol ? 0 : Math.max(0.15, -box.min.z),                                         // da coronha até o cabo
      rgrip: new V(0, pistol ? -0.06 : -0.06, pistol ? -0.02 : -0.03),                        // mão direita no cabo
      grip: pistol ? new V(0.035, -0.08, -0.01) : new V(0, Math.max(box.min.y * 0.4, -0.08), box.max.z * fore), // mão esquerda
      port: new V(-0.02, -0.03, box.max.z * 0.18),                                            // janela de munição (escopeta/Kar98)
      blade: { Rifle: -0.55, SMG: -0.5, Sniper: -0.72, Escopeta: -0.55 }[cat] || -0.15,      // postura de lado (ombro esquerdo à frente)
      magOff: null, pumpOff: null, boltOff: null,
    };
    if (P.mag) out.magOff = center(P.mag).sub(P.mag.position).add(new V(0, -0.035, 0));         // mão embaixo do pente
    if (P.pump) out.pumpOff = center(P.pump).sub(P.pump.position).add(new V(0, -0.03, 0));
    if (P.bolt) out.boltOff = center(P.bolt).sub(P.bolt.position).add(new V(-0.05, 0.01, 0));   // alavanca do ferrolho (lado direito)
    return (C[id] = out);
  }
  // onde a mão esquerda segura: guarda-mão, ou a bomba da escopeta (acompanha o "pump")
  gripPoint(target) {
    const G = this.gunId && this.gunPoints(this.gunId), P = this.gun && this.gun.userData.parts;
    if (!G) return target.set(0, 0, 0);
    if (P && P.pump && G.pumpOff) return target.copy(P.pump.position).add(G.pumpOff);
    return target.copy(G.grip);
  }
  // pose da arma: [x, y, z (ponto no tronco), inclinação (- = cano pra cima), giro (+ = pra esquerda), rolagem,
  //                coronha (1 = o ponto é a coronha encostada; 0 = o ponto é o cabo), postura de lado (giro do tronco)]
  gunPose(name, pitch) {
    const G = this.gunPoints(this.gunId), pis = G.pistol;
    switch (name) {
      case 'aim': return pis ? [-0.04, 0.33, 0.36, -pitch, 0.03, 0, 0, G.blade] : [-0.12, 0.34, 0.12, -pitch, 0, 0, 1, G.blade];
      case 'guard': return pis ? [-0.06, 0.13, 0.3, 0.8, 0.15, 0, 0, -0.1] : [-0.13, 0.32, 0.13, 0.45, 0.2, 0.1, 1, G.blade * 0.6];
      case 'low': return pis ? [-0.1, 0.07, 0.25, 1.1, 0.2, 0, 0, -0.05] : [-0.14, 0.28, 0.13, 0.8, 0.35, 0.15, 1, G.blade * 0.5];
      case 'carry': return pis ? [-0.06, 0.13, 0.3, 0.8, 0.15, 0, 0, -0.1] : [-0.12, 0.13, 0.14, -0.55, 0.75, -0.35, 1, -0.2];
      case 'reload': return pis ? [-0.04, 0.21, 0.3, 0.3, 0.25, 0.5, 0, -0.15] : [-0.1, 0.24, 0.14, 0.35, 0.35, 0.6, 1, G.blade * 0.7];
      case 'inspect': return pis ? [-0.03, 0.24, 0.3, 0.1, 0.6, 1.1, 0, -0.1] : [-0.1, 0.27, 0.14, 0.15, 0.7, 1.0, 1, G.blade * 0.6];
      case 'heal': return [-0.31, 0.03, 0.1, 1.3, 0.05, 0, 0, -0.05];       // arma abaixada do lado, só na mão direita
      case 'holster': return [-0.32, -0.06, 0.03, 1.5, 0, 0, 0, 0];          // na cintura (troca de arma)
      case 'dead': return [-0.3, 0.02, 0.12, 1.35, 0.1, 0.3, 0, 0];
    }
  }
  // coloca a arma no encaixe (filho do quadril): ponto no tronco + orientação alinhada ao corpo (não balança com o quadril)
  // (follow = a arma acompanha o quadril: no ar e na morte, quando o corpo deita)
  placeGun(gp, follow) {
    gp = gp || this._gp; if (!gp || !this.gun) return;
    const G = this.gunPoints(this.gunId), t = this._pg || (this._pg = { e: new THREE.Euler(0, 0, 0, 'YXZ'), q: new THREE.Quaternion(), p: new THREE.Vector3(), d: new THREE.Vector3() });
    t.q.setFromEuler(t.e.set(gp[3], gp[4], gp[5], 'YXZ'));
    if (follow) this.gunSocket.quaternion.copy(t.q); else this.gunSocket.quaternion.copy(this.hips.quaternion).invert().multiply(t.q);
    t.p.set(gp[0], gp[1], gp[2]).applyQuaternion(this.torso.quaternion).add(this.torso.position);
    t.d.set(0, 0, 1).applyQuaternion(this.gunSocket.quaternion).multiplyScalar(G.stock * gp[6]);
    this.gunSocket.position.copy(t.p).add(t.d);
  }
  // IK de 2 ossos do braço: leva a mão até um ponto da arma (pt no espaço da arma); cotovelo pra baixo e pra fora
  solveArm(side, k, pt) {
    if (k <= 0.001 || !this.gun || !pt) return;
    const V = THREE.Vector3, t = this._ik || (this._ik = { T: new V(), d: new V(), p: new V(), u: new V(), e: new V(), f: new V(), x: new V(), y: new V(), z: new V(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), q2: new THREE.Quaternion() });
    const arm = side > 0 ? this.armL : this.armR, fore = side > 0 ? this.foreL : this.foreR, hand = side > 0 ? this.handL : this.handR;
    this.gun.updateWorldMatrix(true, false);
    t.T.copy(pt); this.gun.localToWorld(t.T); this.torso.worldToLocal(t.T); // alvo no espaço do tronco
    const S = LS.Skin.PX, L1 = 5 * S, L2 = 6 * S, sh = arm.position;
    t.d.subVectors(t.T, sh); let dist = t.d.length(); if (dist < 1e-5) return;
    t.d.divideScalar(dist); dist = LS.util.clamp(dist, 0.35 * (L1 + L2), L1 + L2 - 1e-4);
    const ca = LS.util.clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1), sa = Math.sqrt(1 - ca * ca);
    t.p.set(0.55 * side, -1, -0.35); t.p.addScaledVector(t.d, -t.p.dot(t.d)).normalize(); // cotovelo: pra fora, pra baixo e pra trás
    t.u.copy(t.d).multiplyScalar(ca).addScaledVector(t.p, sa);                           // direção do braço
    t.e.copy(sh).addScaledVector(t.u, L1);                                               // cotovelo
    t.f.copy(sh).addScaledVector(t.d, dist).sub(t.e).normalize();                        // direção do antebraço
    t.y.copy(t.u).negate();
    t.z.copy(t.f).addScaledVector(t.u, -t.f.dot(t.u)); if (t.z.lengthSq() < 1e-8) t.z.copy(t.p).negate(); t.z.normalize();
    t.x.crossVectors(t.y, t.z);
    t.q.setFromRotationMatrix(t.m.makeBasis(t.x, t.y, t.z));
    arm.quaternion.slerp(t.q, k);
    t.q2.setFromAxisAngle(t.x.set(1, 0, 0), -Math.acos(LS.util.clamp(t.f.dot(t.u), -1, 1)));
    fore.quaternion.slerp(t.q2, k);
    hand.quaternion.slerp(t.q2.set(0, 0, 0, 1), k);
  }
  gripLeft(k, pt) { this.solveArm(1, k, pt); }
  // as duas mãos na arma (chamado de novo pela corrida depois de mexer no tronco)
  solveHands() {
    if (!this.gun) return;
    this.solveArm(-1, this._ikR || 0, this._rPt);
    this.solveArm(1, this._ikW || 0, this._ikPt);
  }
  // pente velho cai no chão, quica e some
  dropMag() {
    const P = this.gun && this.gun.userData.parts && this.gun.userData.parts.mag;
    if (!P || !LS.Effects || !LS.Effects.scene || !this.root.parent || this.root.parent !== LS.Effects.scene) return;
    const m = LS.Items.mesh(LS.Items.gunPart(this.gunId, 'mag'));
    this.gun.updateWorldMatrix(true, true); P.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    LS.Effects.dropMag(m);
  }

  // morte: os joelhos cedem, cai com aceleração, quica de leve e fica mole; depois de um tempo o corpo
  // dá um pulinho e encolhe até sumir (animação de eliminação)
  animDeath(dt) {
    const L = LS.util.lerp, cl = LS.util.clamp, ss = x => { x = cl(x, 0, 1); return x * x * (3 - 2 * x); };
    if (!this.deadT) { this.deadDir = Math.random() < 0.65 ? -1 : 1; this.deadRoll = (Math.random() - 0.5) * 0.5; this.deadT = 1e-4; this.deadHold = 0; this.poofed = false; this.chute.visible = false; this.setMedInHand(null); }
    this.deadT = Math.min(1.4, this.deadT + dt * 1.5);
    const k = this.deadT, buck = ss(k / 0.25), f = cl((k - 0.18) / 0.62, 0, 1), fall = f * f;
    const bounce = k > 0.8 ? Math.sin(cl((k - 0.8) / 0.4, 0, 1) * Math.PI) * 0.07 : 0;
    this.root.rotation.x = this.deadDir * (Math.PI / 2 * fall - bounce);
    this.root.rotation.z = this.deadRoll * fall;
    this.root.position.y += 0.11 * fall; // metade da grossura do corpo: deitado sem afundar no chão
    this.hips.position.y = this.hipsY - 0.24 * buck * (1 - fall);
    this.hips.rotation.set(0, 0, 0);
    this.legPose(-1, L(-0.55 * buck, -0.12, fall), L(1.25 * buck, 0.3, fall), L(0.02, 0.1, fall), 0.4);
    this.legPose(1, L(-0.25 * buck, 0.06, fall), L(0.85 * buck, 0.18, fall), L(0.02, 0.12, fall), 0.4);
    this.torso.rotation.set(0.35 * buck * (1 - fall), 0, 0);
    const up = this.deadDir < 0 ? -2.5 : -0.4; // de costas: braços pra cima; de bruços: pra frente
    this.setArm(-1, [L(-0.3 * buck, up, fall), 0, L(0.1, 0.5, fall), L(0.35, 0.45, fall)]);
    this.setArm(1, [L(-0.2 * buck, up + 0.25, fall), 0, L(0.1, 0.6, fall), L(0.3, 0.7, fall)]);
    this.headG.rotation.set(-0.25 * this.deadDir * fall, 0.3 * this.deadRoll, 0);
    // a arma vai junto, na mão direita, ao longo do corpo
    if (this.gun) {
      const tg = this.gunPose('dead'); this._gp = this._gp || tg.slice();
      for (let i = 0; i < 8; i++) this._gp[i] = L(this._gp[i], tg[i], 1 - Math.exp(-8 * dt));
      this.placeGun(this._gp, true); this._rPt = (this._rPt || new THREE.Vector3()).copy(this.gunPoints(this.gunId).rgrip); this.solveArm(-1, 1, this._rPt);
    }
    // eliminação: espera deitado, dá um pulinho e encolhe até sumir (com poeira)
    if (k >= 1.4) {
      this.deadHold += dt;
      const e = (this.deadHold - 1.4) / 0.45;
      if (e > 0 && !this.poofed) { this.poofed = true; if (LS.Effects && LS.Effects.scene && this.root.parent === LS.Effects.scene) LS.Effects.poof(this.root.position); }
      const sc = e <= 0 ? 1 : e < 0.25 ? 1 + 0.12 * ss(e / 0.25) : 1.12 * (1 - ss((e - 0.25) / 0.75));
      this.root.scale.setScalar(Math.max(1e-3, sc));
      if (e >= 1) this.root.visible = false;
    }
  }
  // animação do código + (se estiver tocando) a animação externa por cima
  animate(s) {
    // zera o que o código não controla, para uma animação externa que acabou não deixar o osso torto
    this.hips.position.x = 0; this.hips.position.z = 0; this.hips.rotation.y = 0;
    for (const n of LS.CharacterModel.JOINTS) this.bones[n].quaternion.set(0, 0, 0, 1);
    this.animateBase(s);
    if (LS.Anim) LS.Anim.loco(this, s); // corrida oficial (dash_run_f)
    if (this.anim) this.anim.apply(s.dt || 0, s);
  }
  // s: {speed, running, crouch, air, chute, fall, dive, steer, vy, aimPitch, armed, armedAim, dead, dt, idle,
  //     reload (0..1 ou -1), heal ('medkit'|'bandage'|null)}
  animateBase(s) {
    const dt = s.dt, L = LS.util.lerp, cl = LS.util.clamp, ss = x => { x = cl(x, 0, 1); return x * x * (3 - 2 * x); };
    const E = (cur, tgt, r) => cur + (tgt - cur) * (1 - Math.exp(-r * dt)); // suavização independente do FPS
    const mixA = (a, b, k) => a.map((v, i) => L(v, b[i], k));
    if (s.dead) { this.showHandMag(false); this.animDeath(dt); return; }
    if (this.deadT) { this.deadT = 0; this.root.rotation.x = 0; this.root.rotation.z = 0; this.root.scale.setScalar(1); }
    const now = performance.now() * 0.001;
    if (!s.fall) this.fallT = 0;
    if (!s.chute) this.chuteAge = 0;
    if ((s.fall || s.chute) && this.gun) { // no ar a arma fica nas costas da mão: só a direita segura, perto do corpo
      this.placeGun(this.gunPose('holster'), true); this._rPt = (this._rPt || new THREE.Vector3()).copy(this.gunPoints(this.gunId).rgrip);
    }
    if (s.fall) {
      // ---- queda livre: sai do avião em pé e vai deitando (box), braços abertos com cotovelos a 90°, joelhos dobrados;
      //      curva = baixa o ombro do lado e encolhe esse braço; W = mergulho de cabeça com braços colados pra trás ----
      this.chuteT = 0; this.chute.visible = false;
      this.fallT = (this.fallT || 0) + dt;
      this.diveK = E(this.diveK || 0, s.dive ? 1 : 0, 3);
      this.steerK = E(this.steerK || 0, s.steer || 0, 4);
      const dk = this.diveK, st = this.steerK, t = now * 1.0 + this.seed, exitK = ss(this.fallT / 1.0);
      const flut = (fq, a, ph) => (Math.sin(t * fq + ph) + Math.sin(t * fq * 2.3 + ph * 1.7) * 0.5) * a; // tremida do vento
      this.hips.position.y = this.hipsY;
      this.hips.rotation.x = E(this.hips.rotation.x, L(0.25, L(1.3, 2.05, dk), exitK), 5);
      this.hips.rotation.z = E(this.hips.rotation.z, st * L(0.6, 0.25, dk) + flut(1.1, 0.03, 0), 5);
      this.torso.rotation.set(L(-0.24, 0.04, dk) + flut(1.7, 0.02, 1), st * 0.12, 0);
      const box = side => {
        const turn = Math.max(0, side * st); // o braço do lado da curva encolhe
        return [-Math.PI / 2 + flut(2.1, 0.05, side), 0, 1.4 - turn * 0.55 + flut(2.6, 0.06, side * 2), 1.35 + turn * 0.45 + flut(3.1, 0.06, side)];
      };
      const dive = side => [0.38 + flut(3.3, 0.04, side), 0, 0.2 + flut(2.9, 0.03, side), 0.08];
      const exit = side => [-2.6, 0, 0.5, 0.4];                       // saindo do avião: braços pra cima
      for (const side of [-1, 1]) this.setArm(side, mixA(mixA(exit(side), box(side), exitK), dive(side), dk));
      for (const side of [-1, 1]) {
        const th = L(L(-0.2, 0.32, exitK), 0.03, dk) + flut(2.4, 0.04, side * 3), kn = L(L(0.5, 1.25, exitK), 0.1, dk) + flut(2.8, 0.08, side);
        this.legPose(side, th, kn, L(0.24, 0.04, dk) + Math.max(0, -side * st) * 0.1, 0.25);
      }
      this.headG.rotation.set(L(-0.95, -1.25, dk) * exitK, -st * 0.25, 0);
      if (this.gun) this.solveArm(-1, 0.5, this._rPt);
      return;
    }
    if (s.chute) {
      // ---- paraquedas: abre com "estouro", dá um tranco que balança o corpo como pêndulo (vai parando),
      //      mãos nas alças lá em cima; na curva puxa a alça do lado e o corpo inclina; pernas soltas balançando ----
      this.chuteT = Math.min(1, (this.chuteT || 0) + dt * 2.2);
      this.chuteAge = (this.chuteAge || 0) + dt;
      this.steerK = E(this.steerK || 0, s.steer || 0, 3);
      const age = this.chuteAge, st = this.steerK, t = now + this.seed;
      const jolt = Math.exp(-age * 1.8) * Math.sin(age * 6.5) * 0.55;          // tranco da abertura (pêndulo amortecido)
      const sway = Math.sin(t * 1.3) * 0.06;
      this.chute.visible = true; this.collapseT = 0; this.wasChute = true;
      this.poseChute(this.chuteT, st, jolt, t, 0);
      this.hips.rotation.x = E(this.hips.rotation.x, jolt, 12);
      this.hips.rotation.z = E(this.hips.rotation.z, sway * 0.8 + st * 0.35, 5);
      this.hips.position.y = this.hipsY;
      this.torso.rotation.set(-jolt * 0.25, 0, 0);
      for (const side of [-1, 1]) {
        const pull = Math.max(0, side * st);                                     // puxa a alça do lado da curva
        this.setArm(side, mixA([-2.78 + Math.sin(t * 1.9 + side) * 0.04, 0, 0.33, 0.55], [-1.85, 0, 0.45, 1.5], pull));
        const sw = Math.sin(t * 1.7 + (side > 0 ? 1.3 : 0)) * 0.1;
        this.legPose(side, -0.06 + sw + jolt * 0.7, 0.28 + Math.max(0, sw) * 1.6 + Math.max(0, -jolt) * 0.6, 0.06, 0.3);
      }
      this.headG.rotation.set(0.3 - jolt * 0.3, -st * 0.2, 0);
      if (this.gun) this.solveArm(-1, 0.5, this._rPt);
      this.updateChuteLines();
      return;
    }
    // pousou: o paraquedas cai pra frente murchando e some (as linhas somem junto)
    if (this.wasChute) { this.wasChute = false; this.collapseT = 1e-4; }
    if (this.collapseT > 0 && this.chute.visible) {
      this.collapseT = Math.min(1, this.collapseT + dt / 0.7);
      this.poseChute(1, 0, 0, now + this.seed, this.collapseT);
      if (this.collapseT >= 1) { this.chute.visible = false; this.collapseT = 0; }
    } else this.chute.visible = false;
    this.chuteT = 0;
    // ---- base: passada (pés com IK) entre parado / andando / correndo ----
    this.hips.rotation.x = E(this.hips.rotation.x, 0, 10);
    this.landT = Math.max(0, (this.landT || 0) - dt);
    this.crouchK = E(this.crouchK, s.crouch ? 1 : 0, 10);
    const ck = Math.max(this.crouchK, ss(this.landT / 0.35)); // agachado / impacto da aterrissagem
    const spd = s.speed || 0;
    this.runK = E(this.runK || 0, s.running ? 1 : 0, 6);
    this.moveK = E(this.moveK || 0, cl(spd / 4.5, 0, 1), 8);
    const stride = L(0.27, 0.34, this.runK) * this.moveK * (1 - ck * 0.35);   // meio passo (m): passada longa
    this.phase += dt * spd * L(1.65, 1.3, this.runK);                         // ritmo calmo: ~2,4 passos/s andando
    const amp = this.moveK * L(0.7, 1.0, this.runK) * (1 - ck * 0.4), sw = Math.sin(this.phase) * amp, cph = Math.cos(this.phase);
    const liftH = this.moveK * L(0.07, 0.13, this.runK) * (1 - ck * 0.5);
    // direita vai pra trás quando sw > 0 (o braço direito vai pra frente: passada cruzada)
    let fR = -stride * Math.sin(this.phase), fL = stride * Math.sin(this.phase);
    let lR = liftH * Math.max(0, -cph), lL = liftH * Math.max(0, cph), spread = 0.03 + ck * 0.07;
    fR += ck * 0.03; fL += ck * 0.03;
    this.hips.position.y = this.hipsY - 0.006 - ck * 0.22 + (Math.abs(cph) - 0.6) * amp * 0.045;
    // inclinação nas curvas (pela velocidade de giro)
    const yaw = this.root.rotation.y, turn = this.prevYaw === undefined ? 0 : LS.util.angleDiff(this.prevYaw, yaw) / Math.max(dt, 1e-3);
    this.prevYaw = yaw;
    this.leanK = E(this.leanK || 0, cl(-turn * 0.05 * (0.3 + this.moveK + this.runK), -0.28, 0.28), 6);
    const pitch = s.aimPitch || 0, def = this.gunId ? LS.WEAPONS[this.gunId] : null, armed = s.armed && !!this.gun;
    let tX = ck * 0.32 + this.runK * (s.armedAim ? 0.02 : 0.1) + this.moveK * 0.04, tY = 0, headX = 0;
    const aiming = armed && (!s.running || s.armedAim);
    // ---- braços sem arma: [inclinação, giro, abertura, cotovelo, punho] ----
    let aR, aL;
    {
      const fwR = Math.max(0, sw), fwL = Math.max(0, -sw), out = 0.1 + this.moveK * 0.04 + this.runK * 0.04;
      aR = [-sw * 0.8 - tX * 0.5, 0, out, 0.22 + fwR * L(0.5, 1.1, this.runK), 0];
      aL = [sw * 0.8 - tX * 0.5, 0, out, 0.22 + fwL * L(0.5, 1.1, this.runK), 0];
    }
    // ---- arma: pose no corpo + mãos por IK ----
    let gp = null, ikW = 0, ikMode = 'grip', toMag = 0, rBolt = 0;
    const G = this.gun ? this.gunPoints(this.gunId) : null;
    if (armed) {
      gp = this.gunPose(aiming ? 'aim' : s.running ? 'carry' : 'guard', pitch);
      ikW = 1;
      aL = [-0.4, 0, 0.12, 0.6, 0];                                   // mão esquerda solta (quando sai da arma)
    }
    const mix = (a, b, k) => [0, 1, 2, 3, 4].map(i => L(a[i] || 0, b[i] || 0, k));
    const parts = this.gun ? this.gun.userData.parts : {};
    for (const k in parts) { const p = parts[k]; p.position.copy(p.userData.base); p.rotation.set(0, 0, 0); p.visible = true; }
    const bell = e => Math.sin(cl(e, 0, 1) * Math.PI);
    const boltAnim = (e, P) => { if (!P) return; const rot = e < 0.25 ? e / 0.25 : e < 0.75 ? 1 : 1 - (e - 0.75) / 0.25, back = e < 0.25 ? 0 : e < 0.5 ? (e - 0.25) / 0.25 : e < 0.75 ? 1 - (e - 0.5) / 0.25 : 0;
      P.rotation.z = -1.1 * ss(rot); P.position.z = P.userData.base.z - 0.075 * ss(back); };
    const pouch = [-0.2, 0, 0.3, 1.05, 0]; // mão esquerda no bolso da cintura (pra fora do corpo)
    // ---- recarga: tira o pente (cai no chão), pega outro no bolso, encaixa, dá um tapa; escopeta/Kar98: cartucho a cartucho ----
    if (armed && s.reload >= 0 && def) {
      const r = s.reload, env = ss(Math.min(r / 0.1, (1 - r) / 0.12, 1));
      gp = mixA(gp, this.gunPose('reload', pitch), env);
      if (parts.mag) {
        const P = parts.mag, b = P.userData.base, D = 0.13;
        if (r < 0.1) this._magDropped = false;
        let dy = 0, vis = true;
        if (r >= 0.1 && r < 0.2) dy = -D * ss((r - 0.1) / 0.1);                       // puxa pra baixo
        else if (r >= 0.2 && r < 0.6) { vis = false; dy = -D; if (!this._magDropped) { this._magDropped = true; P.position.y = b.y - D; this.dropMag(); } }
        else if (r >= 0.6 && r < 0.72) dy = -D * (1 - ss((r - 0.6) / 0.12));          // pente novo sobe e encaixa
        else if (r >= 0.72 && r < 0.78) dy = 0.008 * bell((r - 0.72) / 0.06);         // tapa no fundo do pente
        P.position.y = b.y + dy; P.visible = vis;
        this.showHandMag(r >= 0.38 && r < 0.6);                                      // pente novo na mão
        toMag = r < 0.1 ? ss(r / 0.1) : r < 0.8 ? 1 : 1 - ss((r - 0.8) / 0.15); ikMode = 'mag';
        ikW = r < 0.2 ? 1 : r < 0.3 ? 1 - ss((r - 0.2) / 0.1) : r < 0.45 ? 0 : r < 0.6 ? ss((r - 0.45) / 0.15) : 1;
        aL = pouch;
        if (def.scope) { const e = cl((r - 0.82) / 0.18, 0, 1); boltAnim(e, parts.bolt); rBolt = bell(e); } // AWM: puxa o ferrolho no fim
      } else if (def.cat === 'Escopeta') {                         // um cartucho por vez
        const n = 4, c = ((r - 0.1) / 0.8) * n, inside = r > 0.1 && r < 0.9;
        ikMode = 'port'; toMag = env; aL = pouch; ikW = 1 - (inside ? bell(c % 1) : 0);
        if (parts.pump && r > 0.88) parts.pump.position.z = parts.pump.userData.base.z - 0.1 * bell((r - 0.88) / 0.12);
        if (parts.lever && r > 0.88) parts.lever.rotation.x = -0.9 * bell((r - 0.88) / 0.12);
      } else if (parts.bolt) {                                     // Kar98: a mão direita abre o ferrolho, a esquerda põe as balas
        const e = r < 0.15 ? ss(r / 0.15) * 0.5 : r < 0.85 ? 0.5 : 0.5 + ss((r - 0.85) / 0.15) * 0.5;
        boltAnim(e, parts.bolt); rBolt = r < 0.15 ? ss(r / 0.15) : r < 0.85 ? 1 : 1 - ss((r - 0.85) / 0.15);
        const c = cl((r - 0.2) / 0.6, 0, 1) * 2;
        ikMode = 'port'; toMag = env; aL = pouch; ikW = 1 - (r > 0.2 && r < 0.8 ? bell(c % 1) : 0);
      }
    }
    if (!(armed && s.reload >= 0)) this.showHandMag(false);
    // ---- ciclo depois do tiro: a mão direita puxa o ferrolho; a bomba e a alavanca levam a mão junto ----
    if (this.cycleK !== undefined && this.cycleK < 1) {
      this.cycleK = Math.min(1, this.cycleK + dt / (this.cycleDur || 0.6));
      const e = cl((this.cycleK - 0.12) / 0.88, 0, 1);
      if (parts.bolt) { boltAnim(e, parts.bolt); rBolt = Math.max(rBolt, bell(e)); }
      if (parts.pump) parts.pump.position.z = parts.pump.userData.base.z - 0.1 * bell(e);
      if (parts.lever) parts.lever.rotation.x = -0.9 * bell(e);
    }
    // ---- troca de arma: leva a atual até a cintura, troca no meio, saca a nova ----
    if (this.swapK !== undefined && this.swapK < 1) {
      this.swapK = Math.min(1, this.swapK + dt / 0.45);
      if (this.swapK >= 0.5 && this.pendingGun !== undefined) { this.setGun(this.pendingGun); this.pendingGun = undefined; }
      const down = this.swapK < 0.5 ? ss(this.swapK * 2) : 1 - ss((this.swapK - 0.5) * 2);
      if (gp && this.gun) gp = mixA(this.gunPose(aiming ? 'aim' : 'guard', pitch), this.gunPose('holster'), down);
      aL = mix(aL, [0, 0, 0.12, 0.25], down); ikW *= 1 - down;
    }
    // ---- cura: kit/bandagem na mão esquerda, na frente do peito; arma abaixada só na direita ----
    this.healK = E(this.healK || 0, s.heal ? 1 : 0, 8);
    this.setMedInHand(s.heal || (this.healK > 0.2 ? this.medType : null));
    if (this.healK > 0.01) {
      const band = s.heal === 'bandage' || this.medType === 'bandage', wob = band ? Math.sin(now * 9) * 0.15 : Math.sin(now * 5) * 0.06;
      aL = mix(aL, [-0.55 + wob, 0, -0.12 + (band ? Math.cos(now * 9) * 0.08 : 0), 1.55], this.healK);
      if (gp) gp = mixA(gp, this.gunPose('heal'), this.healK);
      ikW *= 1 - this.healK;
      headX += 0.25 * this.healK; // olha pro curativo
    }
    // ---- soco (sem arma): guarda de boxe, estica rápido girando o tronco e volta pra guarda ----
    if (this.punchT > 0) {
      this.punchT = Math.max(0, this.punchT - dt / 0.38);
      const t = 1 - this.punchT, ext = t < 0.3 ? ss(t / 0.3) : 1 - ss((t - 0.3) / 0.7), side = this.punchSide, guard = 1 - ss((t - 0.7) / 0.3);
      const hitArm = [-Math.PI / 2 - pitch * 0.5 + 0.05, 0, -0.18, 0.06], guardArm = [-0.6, 0, -0.12, 2.0];
      const g0 = mix(aR, guardArm, Math.min(1, guard * 1.5)), g1 = mix(aL, guardArm, Math.min(1, guard * 1.5));
      if (side > 0) { aR = mix(g0, hitArm, ext); aL = g1; } else { aL = mix(g1, hitArm, ext); aR = g0; }
      tY += side * 0.38 * ext;
    }
    // ---- parado: respiração, peso trocando de perna, olhar em volta e, de vez em quando, uma "mexida" ----
    const still = !s.air && this.moveK < 0.08 && ck < 0.3 && !(s.reload >= 0) && !s.heal && !(this.punchT > 0) && !(this.swapK < 1);
    this.idleK = E(this.idleK || 0, still ? 1 : 0, still ? 2.5 : 10);
    this.idleT = still ? (this.idleT || 0) + dt : 0;
    if (this.idleK > 0.01) {
      const ik = this.idleK, t = now + this.seed * 3.7;
      const breath = Math.sin(t * 2.1) * 0.5 + 0.5;                       // inspira/expira (~3 s)
      const shift = Math.sin(t * 0.55);                                   // troca o peso de perna devagar
      this.hips.position.y += (breath * 0.01 - 0.008 - Math.abs(shift) * 0.016) * ik; // joelhos sempre um pouco soltos
      this.idleSway = shift * 0.035 * ik;                                 // quadril cai pro lado do apoio
      lR += Math.max(0, shift) * 0.035 * ik; fR += Math.max(0, shift) * 0.04 * ik; // a perna sem peso dobra o joelho
      lL += Math.max(0, -shift) * 0.035 * ik; fL += Math.max(0, -shift) * 0.04 * ik;
      spread += 0.03 * ik;
      tX += (breath * 0.035 - 0.01) * ik;                                 // peito sobe e desce
      const look = Math.sin(t * 0.37) * Math.sin(t * 0.23 + 1.3);
      this.idleLook = look * 0.55 * ik;
      // armado e sem atirar/mirar há ~1 s: abaixa a arma (guarda baixa) em vez de ficar apontando pro nada
      this.lowK = E(this.lowK || 0, armed && !s.armedAim && this.idleT > 1 ? 1 : 0, s.armedAim ? 14 : 3);
      if (gp && this.lowK > 0.01) { const lk = this.lowK * ik; gp = mixA(gp, this.gunPose('low', pitch), lk); gp[1] += breath * 0.008 * lk; headX += 0.08 * lk; }
      if (!armed) { aR = mix(aR, [-0.05 - breath * 0.04, 0, 0.12 + breath * 0.03, 0.2 + breath * 0.05], ik); aL = mix(aL, [-0.05 - breath * 0.04, 0, 0.12 + breath * 0.03, 0.2 + breath * 0.05], ik); }
      // depois de uns segundos parado: alonga (sem arma) ou inspeciona a arma (armado), a cada ~9 s
      const cyc = 9 + (this.seed % 1) * 3, f = this.idleT > 4 ? (this.idleT - 4) % cyc : -1, fk = f >= 0 && f < 2.4 ? bell(f / 2.4) * ik : 0;
      if (fk > 0.001 && (!aiming || this.lowK > 0.5)) {
        if (gp) { gp = mixA(gp, this.gunPose('inspect', pitch), fk); headX += 0.3 * fk; this.idleLook *= 1 - fk; }
        else { const up = ss(fk * 1.6), p = [-2.9 * up, 0, 0.15 + 0.4 * (1 - up), 0.15 + 0.3 * (1 - up)]; aR = mix(aR, p, fk); aL = mix(aL, p, fk); tX -= 0.12 * fk; headX -= 0.2 * fk; }
      }
    } else { this.idleLook = 0; this.idleSway = 0; }
    // ---- pulo em 4 fases: impulso, subida (joelho pra cima), topo (encolhe) e descida (pernas se preparam) ----
    this.airK = E(this.airK || 0, s.air ? 1 : 0, s.air ? 16 : 20);
    if (s.air && !this.wasAir) this.jumpT = 0;                           // acabou de sair do chão
    this.wasAir = !!s.air;
    this.jumpT = (this.jumpT === undefined ? 9 : this.jumpT) + dt;
    let air = null;
    if (this.airK > 0.01) {
      const vy = s.vy || 0, a = this.airK;
      const rise = cl(vy / 8, 0, 1), fallK = cl(-vy / 9, 0, 1), apex = 1 - Math.max(rise, fallK);
      const kick = this.jumpT < 0.18 ? bell(this.jumpT / 0.18) : 0;     // estica o corpo logo no impulso
      air = {
        a, fallK,
        tR: -0.15 * kick + L(L(-0.95, -1.1, rise), -0.4, fallK), kR: L(L(1.4, 1.2, rise), 0.45, fallK) * (1 - kick * 0.6),
        tL: 0.3 * kick + L(L(-0.5, 0.1, rise), -0.12, fallK), kL: L(L(1.3, 0.75, rise), 0.3, fallK) * (1 - kick * 0.6),
      };
      this.hips.position.y += (0.05 * apex - 0.03 * kick) * a;           // encolhe no topo
      tX = L(tX, -0.12 * kick + 0.16 * apex + L(0.05, -0.06, fallK), a);  // tronco: arqueia no impulso, curva no topo
      headX += (-0.12 * kick + 0.12 * fallK) * a;                         // olha pro chão chegando
      if (!aiming && !(this.punchT > 0)) {
        const up = [-2.55 + 0.5 * apex, 0, 0.35, 0.5], side = [-0.3, 0, 1.15, 0.35], tuck = [-1.25, 0, 0.3, 1.1];
        const pose = mix(mix(up, tuck, apex), side, fallK);
        if (armed) { aL = mix(aL, [pose[0] * 0.4, 0, pose[2] * 0.6, pose[3]], a * 0.6); ikW *= 1 - a * 0.6; if (gp) gp[1] += 0.03 * apex * a; }
        else { aR = mix(aR, pose, a); aL = mix(aL, [pose[0] - 0.1, 0, pose[2], pose[3]], a); }
      }
    }
    // ---- aplica suavizando (sem saltos entre poses) ----
    this._aR = this._aR || [0, 0, 0.1, 0.2, 0]; this._aL = this._aL || [0, 0, 0.1, 0.2, 0]; this._t = this._t || [0, 0];
    for (let i = 0; i < 5; i++) { this._aR[i] = E(this._aR[i], aR[i] || 0, 16); this._aL[i] = E(this._aL[i], aL[i] || 0, 16); }
    this._t[0] = E(this._t[0], tX, 12); this._t[1] = E(this._t[1], tY, 14);
    if (gp) { if (!this._gp || this._gpId !== this.gunId && !(this.swapK < 1)) this._gp = gp.slice(); this._gpId = this.gunId; for (let i = 0; i < 8; i++) this._gp[i] = E(this._gp[i], gp[i], 14); }
    this.bladeK = E(this.bladeK || 0, gp ? gp[7] : 0, 10);                 // postura de lado (só armado)
    this._ikW = E(this._ikW || 0, armed ? ikW : 0, 18);
    this._ikR = E(this._ikR || 0, armed ? 1 : 0, 18);
    this._toMag = E(this._toMag || 0, toMag, 20);
    this._rBolt = E(this._rBolt || 0, rBolt, 22);
    this.hips.rotation.z = E(this.hips.rotation.z, this.leanK + (this.idleSway || 0), 10);
    // aditivos rápidos (não suavizados): recuo e reação a dano
    this.recoilT = Math.max(0, this.recoilT - dt * 8);
    this.hitT = Math.max(0, (this.hitT || 0) - dt * 4);
    const rk = aiming ? this.recoilT : 0, hk = this.hitT * this.hitT;
    this.setArm(-1, [this._aR[0] + hk * 0.25, this._aR[1], this._aR[2], this._aR[3], this._aR[4]]);
    this.setArm(1, [this._aL[0] + hk * 0.2, this._aL[1], this._aL[2], this._aL[3], this._aL[4]]);
    const tyaw = this._t[1] + this.bladeK;
    this.torso.rotation.set(this._t[0] - hk * 0.28, tyaw, (this.hitSide || 0) * 0.14 * hk);
    this._look = E(this._look || 0, this.idleLook || 0, 4);
    this.headG.rotation.set(-pitch * 0.6 - this.torso.rotation.x * 0.6 + headX + hk * 0.35, -this._t[1] * 0.6 - this.bladeK * 0.9 + this._look, 0);
    // ---- arma no encaixe + recuo (chute pra trás, cano sobe) + mãos ----
    if (this.gun && this._gp && armed) {
      this.placeGun(this._gp);
      this.gun.position.set(0, rk * 0.012, -rk * 0.055); this.gun.rotation.set(-rk * 0.12, 0, 0);
      const rPt = this._rPt || (this._rPt = new THREE.Vector3());
      rPt.copy(G.rgrip);
      if (this._rBolt > 0.01 && parts.bolt && G.boltOff) rPt.lerp(this._t2 = (this._t2 || new THREE.Vector3()).copy(parts.bolt.position).add(G.boltOff), this._rBolt);
      const pt = this._ikPt || (this._ikPt = new THREE.Vector3());
      this.gripPoint(pt);
      if (ikMode === 'mag' && parts.mag && G.magOff) pt.lerp(this._t3 = (this._t3 || new THREE.Vector3()).copy(parts.mag.position).add(G.magOff), this._toMag);
      else if (ikMode === 'port') pt.lerp(G.port, this._toMag);
      this.solveHands();
    }
    // ---- pernas: IK no chão; no ar, pose do pulo ----
    const hipY = this.hips.position.y;
    this.solveLeg(-1, fR, lR, hipY, spread); this.solveLeg(1, fL, lL, hipY, spread);
    if (air) {
      const a = air.a, sp = L(0.04, 0.14, air.fallK);
      for (const [side, th, kn] of [[-1, air.tR, air.kR], [1, air.tL, air.kL]]) {
        const u = side > 0 ? this.legL : this.legR, l = side > 0 ? this.shinL : this.shinR, f = side > 0 ? this.footL : this.footR;
        u.rotation.x = L(u.rotation.x, th, a); u.rotation.z = L(u.rotation.z, side > 0 ? sp : -sp, a);
        l.rotation.x = L(l.rotation.x, kn, a); f.rotation.x = L(f.rotation.x, -(th + kn) * 0.5, a);
      }
    }
  }
};
// ordem dos ossos no esqueleto (nomes padrão do Mixamo; equivalentes do R15 do lado)
LS.CharacterModel.BONES = [
  'Hips', 'Spine', 'Head',                        // LowerTorso, UpperTorso, Head
  'RightArm', 'RightForeArm', 'RightHand',        // RightUpperArm, RightLowerArm, RightHand
  'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightUpLeg', 'RightLeg', 'RightFoot',          // RightUpperLeg, RightLowerLeg, RightFoot
  'LeftUpLeg', 'LeftLeg', 'LeftFoot'];
LS.CharacterModel.JOINTS = ['RightForeArm', 'RightHand', 'LeftForeArm', 'LeftHand', 'RightLeg', 'RightFoot', 'LeftLeg', 'LeftFoot'];
// pedaços de cada osso: [osso, parte do atlas, linha inicial, linha final, pivô, recuo] (linhas em pixels, de cima pra baixo)
// recuo: cada peça de baixo é um tiquinho mais fina que a de cima (em pixels, por lado). Assim, quando o cotovelo,
// o joelho ou a cintura dobram, os lados das duas peças nunca ficam no mesmo plano (sem z-fighting)
LS.CharacterModel.PIECES = [
  ['Hips', 'body', 7, 12, 'bottom', 0.25], ['Spine', 'body', 0, 7, 'bottom', 0.1], ['Head', 'head', 0, 8, 'bottom', 0],
  ['RightArm', 'arm', 0, 5, 'top', 0], ['RightForeArm', 'arm', 5, 10, 'top', 0.15], ['RightHand', 'arm', 10, 12, 'top', 0.3],
  ['LeftArm', 'arm', 0, 5, 'top', 0], ['LeftForeArm', 'arm', 5, 10, 'top', 0.15], ['LeftHand', 'arm', 10, 12, 'top', 0.3],
  ['RightUpLeg', 'leg', 0, 6, 'top', 0], ['RightLeg', 'leg', 6, 11, 'top', 0.15], ['RightFoot', 'leg', 11, 12, 'top', 0.3],
  ['LeftUpLeg', 'leg', 0, 6, 'top', 0], ['LeftLeg', 'leg', 6, 11, 'top', 0.15], ['LeftFoot', 'leg', 11, 12, 'top', 0.3]];
// junta os 15 pedaços numa geometria só, com peso 1 no osso de cada pedaço (igual para todos os personagens)
LS.CharacterModel.skinGeometry = function (model) {
  if (this._skinGeo) return this._skinGeo;
  const pos = [], nor = [], uv = [], idx = [], si = [], sw = [], wp = new THREE.Vector3();
  for (const [bone, part, y0, y1, pivot, inset] of this.PIECES) {
    const g = LS.Skin.slice(part, y0, y1, pivot), bi = this.BONES.indexOf(bone), base = pos.length / 3;
    const [, , w, , d] = LS.Skin.PARTS[part], kx = (w - 2 * inset) / w, kz = (d - 2 * inset) / d;
    model.bones[bone].getWorldPosition(wp).sub(model.root.position);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i) * kx + wp.x, P.getY(i) + wp.y, P.getZ(i) * kz + wp.z); nor.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(U.getX(i), U.getY(i));
      si.push(bi, 0, 0, 0); sw.push(1, 0, 0, 0);
    }
    const I = g.index; for (let i = 0; i < I.count; i++) idx.push(I.getX(i) + base);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(idx);
  return (this._skinGeo = geo);
};
