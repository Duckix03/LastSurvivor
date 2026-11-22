// Bots controlados por IA: saltam do avião, buscam loot, detectam inimigos, lutam e fogem da zona
'use strict';
LS.Bot = class extends LS.Fighter {
  constructor(name) {
    super(name, false, {});
    this.skill = LS.util.rand(0.35, 1); // 0 = ruim, 1 = bom
  }
  reset() {
    super.reset();
    this.ai = 'loot'; this.target = null; this.goal = null; this.thinkT = Math.random() * 0.3;
    this.jumpAt = LS.util.rand(0.12, 0.85); this.landing = null;
    this.avoidT = 0; this.avoidDir = { x: 0, z: 0 }; this.stuckT = 0; this.lastPos = new THREE.Vector3();
    this.strafeT = 0; this.strafeDir = 1; this.aimErr = new THREE.Vector3(); this.lockT = 0;
    this.lootTarget = null; this.alertPos = null; this.alertT = 0; this.lastSeenT = -99; this.wantJump = false;
    this.wanderGoal = null; this.crouchT = 0;
  }
  preferredRange() {
    const d = this.wdef(); if (!d) return 0;
    return { 'Escopeta': 7, 'SMG': 14, 'Pistola': 16, 'Rifle': 30, 'Sniper': 70 }[d.cat];
  }
  hasUsableWeapon() {
    for (const w of this.weapons) if (w && (w.mag > 0 || this.ammo[LS.WEAPONS[w.id].ammo] > 0)) return true;
    return false;
  }
  bestSlotFor(dist) {
    let best = -1, bs = -1;
    this.weapons.forEach((w, i) => {
      if (!w) return; const d = LS.WEAPONS[w.id];
      if (w.mag <= 0 && this.ammo[d.ammo] <= 0) return;
      const pr = { 'Escopeta': 7, 'SMG': 14, 'Pistola': 16, 'Rifle': 30, 'Sniper': 70 }[d.cat];
      const s = d.dmg * d.pellets * d.rate / (1 + Math.abs(dist - pr) / 20);
      if (s > bs) { bs = s; best = i; }
    });
    return best;
  }
  wantsItem(it) {
    if (it.type === 'weapon') {
      if (!this.weapons[0] || !this.weapons[1]) return true;
      return false;
    }
    if (it.type === 'ammo') {
      const uses = this.weapons.some(w => w && LS.WEAPONS[w.id].ammo === it.id);
      return uses && this.ammo[it.id] < this.maxAmmo(it.id) * 0.8;
    }
    if (it.type === 'med') return this.meds[it.id] < this.maxMed(it.id);
    if (it.type === 'gel') return false; // bots não usam a parede
    if (it.type === 'vest' || it.type === 'helmet') return it.level > this[it.type].level;
    if (it.type === 'bag') return it.level > this.bag;
    return false;
  }
  onHurt(attacker) {
    if (attacker && attacker.alive && attacker !== this) {
      if (!this.target || !this.target.alive || Math.random() < 0.6) this.target = attacker;
      this.alertPos = attacker.pos.clone(); this.alertT = 6;
    }
  }
  hearShot(shooter) {
    if ((this.target && this.target.alive) || LS.sameTeam(this, shooter)) return;
    if (this.pos.distanceTo(shooter.pos) < 110) { this.alertPos = shooter.pos.clone(); this.alertT = 8; }
  }

  // ---------- decisão (executada algumas vezes por segundo) ----------
  think() {
    const G = LS.Game, myEye = this.eyePos(new THREE.Vector3());
    // 1) inimigo visível
    if (this.target && (!this.target.alive || this.target.state === 'plane')) this.target = null;
    const range = this.wdef() && this.wdef().cat === 'Sniper' ? 160 : 100;
    const cands = [];
    for (const f of G.fighters) {
      if (f === this || !f.alive || f.state !== 'ground' || f.netHidden || LS.sameTeam(this, f)) continue;
      const d = this.pos.distanceTo(f.pos);
      let r = range * (f.crouch ? 0.6 : 1) * (f.lastShotT > G.time - 1.5 ? 1.5 : 1);
      if (d < r) cands.push({ f, d });
    }
    cands.sort((a, b) => a.d - b.d);
    let seen = null;
    const eye2 = new THREE.Vector3();
    for (let i = 0; i < Math.min(3, cands.length); i++) {
      const c = cands[i];
      // campo de visão (~200°) a não ser que esteja muito perto
      const ang = Math.atan2(c.f.pos.x - this.pos.x, c.f.pos.z - this.pos.z);
      if (c.d > 12 && Math.abs(LS.util.angleDiff(this.yaw, ang)) > 1.75 && c.f !== this.target) continue;
      c.f.eyePos(eye2); eye2.y -= 0.3;
      if (LS.World.hasLOS(myEye, eye2)) { seen = c.f; break; }
    }
    if (seen) {
      if (!this.target || !this.target.alive || seen === this.target || this.pos.distanceTo(seen.pos) < this.pos.distanceTo(this.target.pos) * 0.6) {
        if (seen !== this.target) { this.lockT = 0; this.aimErr.set(LS.util.rand(-1, 1), LS.util.rand(-0.5, 1), LS.util.rand(-1, 1)).multiplyScalar(2.2 - this.skill); }
        this.target = seen;
      }
      this.lastSeenT = G.time; this.targetVisible = seen === this.target;
    } else this.targetVisible = false;
    if (this.target && G.time - this.lastSeenT > 6) this.target = null;
    // duelo: sempre sabe mais ou menos onde o oponente mais perto está (vai caçar em vez de vagar)
    if (G.mode === 'duel' && !this.targetVisible) {
      let o = null, od = Infinity;
      for (const f of G.fighters) { if (f === this || !f.alive || LS.sameTeam(this, f)) continue; const d = this.pos.distanceToSquared(f.pos); if (d < od) { od = d; o = f; } }
      if (this.target && (!this.target.alive || LS.sameTeam(this, this.target))) this.target = null;
      if (o) { this.alertPos = o.pos.clone(); this.alertT = 2; if (!this.target) this.target = o; this.lastSeenT = Math.max(this.lastSeenT, G.time - 5); }
    }

    // 2) escolhe arma conforme a distância
    if (this.target && this.reloadT <= 0) {
      const s = this.bestSlotFor(this.pos.distanceTo(this.target.pos));
      if (s >= 0 && s !== this.slot) this.switchWeapon(s);
    } else if (!this.weapon() && this.weapons[1 - this.slot]) this.switchWeapon(1 - this.slot);

    // 3) zona
    const Z = G.zone;
    const zoneR = Z.shrinking ? Z.targetR : Z.nextR;
    const zc = Z.shrinking ? Z.target : Z.next;
    const outDist = Math.hypot(this.pos.x - zc.x, this.pos.z - zc.y) - zoneR * 0.85;
    const outsideNow = Math.hypot(this.pos.x - Z.center.x, this.pos.z - Z.center.y) > Z.radius - 3;

    // 4) estado
    const armed = this.hasUsableWeapon();
    if (this.target && armed && !(outsideNow && this.hp < 50)) this.ai = 'fight';
    else if (this.target && !armed) this.ai = 'flee';
    else if (outsideNow || (outDist > 0 && Z.timer < 25)) this.ai = 'zone';
    else if (this.hp < 70 && (this.meds.medkit || this.meds.bandage) && G.time - this.lastSeenT > 3) this.ai = 'heal';
    else {
      this.lootTarget = LS.Loot.nearest(this.pos, armed ? 35 : 80, it => this.wantsItem(it));
      if (this.lootTarget) this.ai = 'loot';
      else if (this.alertPos && this.alertT > 0) this.ai = 'investigate';
      else this.ai = 'wander';
    }
    // pega itens próximos
    const near = LS.Loot.nearest(this.pos, 1.6, it => this.wantsItem(it));
    if (near) this.pickup(near, false);
    if (this.ai === 'heal' && !this.healType) this.startHeal(this.hp < 50 && this.meds.medkit ? 'medkit' : (this.meds.bandage ? 'bandage' : 'medkit'));
    if (this.ai !== 'heal' && this.healType && this.target) this.cancelHeal();
    if (!this.target && this.weapon() && this.weapon().mag < this.wdef().mag * 0.5) this.startReload();
  }

  goTo(x, z, dt) {
    const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.5) return { x: 0, z: 0 };
    let wx = dx / d, wz = dz / d;
    if (this.avoidT > 0) { wx = this.avoidDir.x; wz = this.avoidDir.z; }
    return { x: wx, z: wz };
  }

  update(dt) {
    if (!this.alive) { this.model.root.position.copy(this.pos); this.model.animate({ dt, dead: true }); return; }
    const G = LS.Game;
    this.updateTimers(dt);
    this.alertT -= dt;
    if (this.state === 'plane') {
      if (G.plane.progress >= this.jumpAt && G.plane.canJump()) {
        G.jumpFromPlane(this);
        const spots = LS.World.lootSpots;
        const s = Math.random() < 0.7 ? LS.util.pick(LS.World.towns) : LS.util.pick(spots);
        this.landing = { x: s.x + LS.util.rand(-25, 25), z: s.z + LS.util.rand(-25, 25) };
      }
      return;
    }
    if (this.state !== 'ground') {
      if (!this.landing) this.landing = { x: this.pos.x, z: this.pos.z }; // pulou forçado (fim da rota do avião)
      const w = this.goTo(this.landing.x, this.landing.z, dt);
      this.diving = Math.hypot(this.landing.x - this.pos.x, this.landing.z - this.pos.z) > 50;
      this.physics(dt, w, { dive: this.diving });
      this.yaw = Math.atan2(w.x, w.z) || this.yaw;
      this.finishFrame(dt, 0);
      return;
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.25 + Math.random() * 0.15; this.think(); }

    let wish = { x: 0, z: 0 }, speed = 4.6, jump = false, faceYaw = null;
    this.running = false; this.aiming = false;
    const Z = G.zone;
    switch (this.ai) {
      case 'fight': {
        const t = this.target; if (!t) break;
        const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        faceYaw = Math.atan2(dx, dz);
        const pr = this.preferredRange();
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = LS.util.rand(0.6, 1.8); this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.crouch = Math.random() < 0.25 * this.skill && d > 15; if (Math.random() < 0.15) jump = true; }
        const fx = dx / (d || 1), fz = dz / (d || 1);
        let fwd = d > pr * 1.3 ? 1 : d < pr * 0.6 ? -1 : 0;
        if (!this.targetVisible) fwd = 1;
        wish = { x: fx * fwd + fz * this.strafeDir * 0.8, z: fz * fwd - fx * this.strafeDir * 0.8 };
        const l = Math.hypot(wish.x, wish.z); if (l > 0) { wish.x /= l; wish.z /= l; }
        if (this.crouch) speed = 2.3;
        if (this.targetVisible) {
          this.aiming = d > 20; this.lockT += dt;
          const err = this.aimErr.clone().multiplyScalar(Math.max(0.15, 1 - this.lockT * (0.4 + this.skill * 0.6)));
          const aimPt = new THREE.Vector3(t.pos.x, t.pos.y + (t.crouch ? 0.8 : 1.2), t.pos.z).add(err.multiplyScalar(1 + d / 40));
          const eye = this.eyePos(new THREE.Vector3());
          const dir = aimPt.sub(eye).normalize();
          this.pitch = Math.asin(LS.util.clamp(dir.y, -1, 1));
          const facing = Math.abs(LS.util.angleDiff(this.yaw, faceYaw)) < 0.25;
          const wd = this.wdef();
          const reactOk = this.lockT > 0.55 - this.skill * 0.3;
          if (wd && facing && reactOk && d < wd.range * 1.4) {
            // bots disparam em rajadas
            if (wd.auto || Math.random() < dt * (2 + this.skill * 4)) this.tryFire(eye, dir, 2.6 - this.skill * 1.2);
          }
        }
        break;
      }
      case 'flee': {
        const t = this.target;
        if (t) { const dx = this.pos.x - t.pos.x, dz = this.pos.z - t.pos.z, d = Math.hypot(dx, dz) || 1; wish = this.goTo(this.pos.x + dx / d * 20, this.pos.z + dz / d * 20, dt);
          if (d < 1.6 && !this.weapon()) { this.yaw = Math.atan2(-dx, -dz); this.tryPunch(); } } // encurralado: soco
        const it = LS.Loot.nearest(this.pos, 40, i => i.type === 'weapon');
        if (it) wish = this.goTo(it.pos.x, it.pos.z, dt);
        this.running = true; speed = 7.4; this.crouch = false;
        break;
      }
      case 'zone': {
        const zc = Z.shrinking ? Z.target : Z.next;
        wish = this.goTo(zc.x, zc.y, dt); this.running = true; speed = 7.4; this.crouch = false;
        break;
      }
      case 'heal': this.crouch = true; speed = 0; break;
      case 'loot': {
        const it = this.lootTarget;
        if (it && it.alive) { wish = this.goTo(it.pos.x, it.pos.z, dt); if (this.pos.distanceTo(it.pos) > 15) { this.running = true; speed = 7.4; } }
        this.crouch = false;
        break;
      }
      case 'investigate': {
        const a = this.alertPos; wish = this.goTo(a.x, a.z, dt); this.crouch = false;
        if (Math.hypot(a.x - this.pos.x, a.z - this.pos.z) < 4) this.alertT = 0;
        break;
      }
      default: { // vagar dentro da zona
        if (!this.wanderGoal || Math.hypot(this.wanderGoal.x - this.pos.x, this.wanderGoal.z - this.pos.z) < 3) {
          const zc = Z.shrinking ? Z.target : Z.next, zr = (Z.shrinking ? Z.targetR : Z.nextR) * 0.8;
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * zr;
          this.wanderGoal = { x: zc.x + Math.cos(a) * r, z: zc.y + Math.sin(a) * r };
        }
        wish = this.goTo(this.wanderGoal.x, this.wanderGoal.z, dt); this.crouch = false;
      }
    }
    if (this.running) this.crouch = false;
    if (this.healType) speed *= 0.45;
    // detecção de travamento -> desvio lateral / pulo
    this.avoidT -= dt;
    const moving = Math.hypot(wish.x, wish.z) > 0.1 && speed > 0;
    this.stuckT += dt;
    if (this.stuckT > 0.5) {
      const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
      if (moving && moved < speed * 0.5 * 0.35 && this.avoidT <= 0) {
        const side = Math.random() < 0.5 ? 1 : -1;
        this.avoidDir = { x: wish.z * side, z: -wish.x * side };
        this.avoidT = LS.util.rand(0.6, 1.3); jump = jump || Math.random() < 0.5;
        if (this.ai === 'loot' && this.lootTarget && Math.random() < 0.3) this.lootTarget = null;
        this.wanderGoal = null;
      }
      this.lastPos.copy(this.pos); this.stuckT = 0;
    }
    this.physics(dt, wish, { speed, jump });
    if (faceYaw === null && moving) faceYaw = Math.atan2(wish.x, wish.z);
    if (faceYaw !== null) this.yaw += LS.util.angleDiff(this.yaw, faceYaw) * Math.min(1, dt * (6 + this.skill * 6));
    if (this.ai !== 'fight') this.pitch *= 0.9;
    this.finishFrame(dt, Math.hypot(this.vel.x, this.vel.z));
  }
  finishFrame(dt, hs) {
    const P = LS.Game.player;
    const d2 = P ? (this.pos.x - P.pos.x) ** 2 + (this.pos.z - P.pos.z) ** 2 : 0;
    const ed = LS.effDist(), far = d2 > ed * ed * 0.5;
    this.model.root.visible = !far && this.state !== 'plane';
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    const animR = LS.settings.perfMode ? 70 : 160;
    if (!far && d2 < animR * animR) this.model.animate({ dt, vy: this.vel.y, fall: this.state === 'fall', dive: this.state === 'fall' && this.diving, steer: 0, speed: hs, running: this.running, crouch: this.crouch, air: this.state === 'ground' && !this.onGround,
      chute: this.state === 'chute', aimPitch: this.pitch, armed: !!this.weapon(), armedAim: this.ai === 'fight', dead: false,
      reload: this.reloadT > 0 && this.wdef() ? 1 - this.reloadT / this.wdef().reload : -1, heal: this.healType });
    else this.model.chute.visible = this.state === 'chute';
  }
};
