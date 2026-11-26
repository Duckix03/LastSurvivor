// Sistema de loot: geração, visual e consulta de itens no chão
'use strict';
LS.Loot = {
  items: [], time: 0,
  init(scene) {
    this.scene = scene; this.pulling = [];
    this.ringGeo = new THREE.RingGeometry(0.45, 0.6, 24); this.ringGeo.rotateX(-Math.PI / 2);
    this.ringMats = {}; this.haloMats = {}; this.beamMats = {};
    // brilho redondo (sprite aditivo) e feixe de luz (cilindro aberto com degradê para cima)
    const tex = (w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); return t; };
    this.haloTex = tex(64, 64, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.35, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
    this.beamTex = tex(4, 64, (g, w, h) => { const r = g.createLinearGradient(0, 0, 0, h); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.7, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0.9)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
    this.beamGeo = new THREE.CylinderGeometry(0.05, 0.11, 1, 10, 1, true); this.beamGeo.translate(0, 0.5, 0);
  },
  clear() {
    for (const it of this.items) this.scene.remove(it.mesh);
    for (const p of this.pulling || []) this.scene.remove(p.mesh);
    this.items = []; this.pulling = [];
  },

  ringMat(color) {
    if (!this.ringMats[color]) this.ringMats[color] = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
    return this.ringMats[color];
  },
  haloMat(color) {
    if (!this.haloMats[color]) this.haloMats[color] = new THREE.SpriteMaterial({ map: this.haloTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 });
    return this.haloMats[color];
  },
  beamMat(color) {
    if (!this.beamMats[color]) this.beamMats[color] = new THREE.MeshBasicMaterial({ map: this.beamTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    return this.beamMats[color];
  },
  // modelo 3D do item + anel no chão + brilho da raridade (+ feixe de luz no loot raro)
  makeMesh(it) {
    const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
    const I = LS.Items, rar = I.rarity(it), color = I.color(it);
    const model = I.mesh(I.itemGeometry(it));
    if (it.type === 'weapon') { model.rotation.y = Math.PI / 2; model.scale.setScalar(1.3); }
    else if (it.type === 'vest' || it.type === 'bag' || it.type === 'helmet') model.scale.setScalar(1.15);
    model.position.y = -0.1;
    inner.add(model);
    const r = new THREE.Mesh(this.ringGeo, this.ringMat(color)); r.position.y = 0.03; g.add(r);
    const halo = new THREE.Sprite(this.haloMat(color)); halo.scale.setScalar(0.7 + rar * 0.2); halo.position.y = 0.35; g.add(halo);
    if (rar >= 2) { // feixe: roxo (raro) mais baixo, dourado (lendário) alto e forte
      const b = new THREE.Mesh(this.beamGeo, this.beamMat(color)); b.scale.set(1, rar === 3 ? 8 : 3.5, 1); b.renderOrder = 2; g.add(b);
      g.userData.beam = b;
    }
    g.userData.inner = inner; g.userData.halo = halo; g.userData.rar = rar;
    return g;
  },

  // nid (opcional): id de rede já definido (armas largadas têm id único por dono; antes 'x1, x2...' colidia entre jogadores)
  spawn(type, id, level, amount, x, y, z, nid) {
    const it = { type, id, level: level || 0, amount: amount || 1, pos: new THREE.Vector3(x, y, z), alive: true, netId: nid || ((this.idPfx || 'x') + (this.seq = (this.seq || 0) + 1)) };
    if (type === 'weapon' && it.ammoInMag === undefined) it.ammoInMag = LS.WEAPONS[id].mag;
    it.mesh = this.makeMesh(it);
    it.mesh.position.copy(it.pos);
    it.mesh.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(it.mesh);
    this.items.push(it);
    return it;
  },
  spawnRandomAt(spot) {
    const r = Math.random(), U = LS.util;
    const x = spot.x, y = spot.y, z = spot.z;
    if (r < 0.32) {
      const id = U.weighted(LS.weaponSpawnTable);
      this.spawn('weapon', id, 0, 1, x, y, z);
      const a = LS.WEAPONS[id].ammo;
      this.spawn('ammo', a, 0, LS.AMMO_TYPES[a].pickup, x + U.rand(-0.8, 0.8), y, z + U.rand(0.6, 1));
    } else if (r < 0.6) {
      const a = U.pick(Object.keys(LS.AMMO_TYPES));
      this.spawn('ammo', a, 0, LS.AMMO_TYPES[a].pickup, x, y, z);
    } else if (r < 0.66) { // bola de gelo (parede): só achando no chão
      this.spawn('gel', 'gel', 0, Math.random() < 0.35 ? 2 : 1, x, y, z);
    } else if (r < 0.8) {
      this.spawn('med', Math.random() < 0.4 ? 'medkit' : 'bandage', 0, Math.random() < 0.4 ? 1 : 2, x, y, z);
    } else {
      const lv = Math.random() < 0.55 ? 1 : Math.random() < 0.75 ? 2 : 3;
      this.spawn(U.pick(['vest', 'helmet', 'bag']), null, lv, 1, x, y, z);
    }
  },
  spawnAll() {
    this.clear(); this.idPfx = 'w'; this.seq = 0; // ids iguais em todos os computadores (mesma semente)
    for (const s of LS.World.lootSpots) if (Math.random() < 0.85) this.spawnRandomAt(s);
    this.idPfx = 'x';
  },
  // by = quem pegou: o item é "puxado" até ele, encolhe e some (só o visual; no jogo ele já foi pego)
  remove(it, by) {
    if (!it.alive) return;
    it.alive = false;
    if (LS.Net && LS.Net.online && by && LS.Net.owns(by)) LS.Net.send({ t: 'pick', id: it.netId, by: by.netId }); // avisa que pegou
    const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1);
    const P = LS.Game && LS.Game.player;
    if (by && it.mesh.visible && P && by.pos.distanceTo(P.pos) < 80) {
      it.mesh.children.forEach(c => { if (c !== it.mesh.userData.inner) c.visible = false; });
      this.pulling.push({ mesh: it.mesh, by, t: 0, from: it.mesh.position.clone().add(it.mesh.userData.inner.position) });
      it.mesh.userData.inner.position.set(0, 0, 0);
    } else this.scene.remove(it.mesh);
  },
  label(it) {
    const lv = ['', ' Nv.1', ' Nv.2', ' Nv.3'];
    if (it.type === 'weapon') return LS.WEAPONS[it.id].name + ' (' + LS.WEAPONS[it.id].cat + ')';
    if (it.type === 'ammo') return LS.AMMO_TYPES[it.id].name + ' x' + it.amount;
    if (it.type === 'med') return LS.MEDS[it.id].name + ' x' + it.amount;
    if (it.type === 'gel') return LS.GEL.name + ' x' + it.amount;
    if (it.type === 'vest') return 'Colete' + lv[it.level];
    if (it.type === 'helmet') return 'Capacete' + lv[it.level];
    if (it.type === 'bag') return 'Mochila' + lv[it.level];
    return '';
  },
  nearest(pos, maxDist, filter) {
    let best = null, bd = maxDist * maxDist;
    for (const it of this.items) {
      const dx = it.pos.x - pos.x, dz = it.pos.z - pos.z, d2 = dx * dx + dz * dz;
      if (d2 < bd && Math.abs(it.pos.y - pos.y) < 3 && (!filter || filter(it))) { bd = d2; best = it; }
    }
    return best;
  },
  update(dt, focus) {
    this.time += dt;
    const vis2 = LS.settings.perfMode ? 80 * 80 : 140 * 140, T = this.time;
    // pulso do brilho e do feixe (materiais compartilhados: um cálculo para todos)
    const pulse = 0.5 + 0.5 * Math.sin(T * 3);
    for (const k in this.haloMats) this.haloMats[k].opacity = 0.16 + pulse * 0.18;
    for (const k in this.beamMats) this.beamMats[k].opacity = 0.28 + pulse * 0.17;
    for (const it of this.items) {
      const dx = it.pos.x - focus.x, dz = it.pos.z - focus.z, d2 = dx * dx + dz * dz, u = it.mesh.userData;
      it.mesh.visible = d2 < vis2 || (u.rar >= 3 && d2 < vis2 * 4); // o feixe dourado aparece de mais longe
      if (d2 < 3600) {
        u.inner.position.y = 0.22 + Math.sin(T * 2.4 + it.pos.x) * 0.07;
        u.inner.rotation.y += dt * 1.1;
        u.halo.position.y = u.inner.position.y + 0.15;
      }
    }
    for (let i = this.pulling.length - 1; i >= 0; i--) {
      const p = this.pulling[i]; p.t += dt / 0.28;
      const k = Math.min(1, p.t), e = k * k, to = p.by.pos;
      p.mesh.position.set(LS.util.lerp(p.from.x, to.x, e), LS.util.lerp(p.from.y, to.y + 1.0, e) + Math.sin(k * Math.PI) * 0.35, LS.util.lerp(p.from.z, to.z, e));
      p.mesh.scale.setScalar(Math.max(0.05, 1 - e * 0.9));
      p.mesh.userData.inner.rotation.y += dt * 12;
      if (k >= 1) { this.scene.remove(p.mesh); this.pulling.splice(i, 1); }
    }
  }
};
