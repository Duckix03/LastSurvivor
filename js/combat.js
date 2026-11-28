// Base comum de jogador e bots: inventário, armas, dano, cura + disparo
'use strict';
LS.Fighter = class {
  constructor(name, isPlayer, modelOpts) {
    this.name = name; this.isPlayer = isPlayer;
    this.model = new LS.CharacterModel(modelOpts || {});
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.reset();
  }
  reset() {
    this.hp = 100; this.alive = true; this.emote = 0;
    this.vest = { level: 0, dur: 0 }; this.helmet = { level: 0, dur: 0 }; this.bag = 0;
    this.weapons = [null, null]; this.slot = 0;
    this.ammo = { light: 0, rifle: 0, sniper: 0, shell: 0 };
    this.meds = { medkit: 0, bandage: 0 };
    this.gel = 0; this.gelCd = 0; this.gelInf = false; // bolas de gelo (parede de gel)
    this.kills = 0; this.damageDealt = 0;
    this.reloadT = 0; this.fireCd = 0; this.healT = 0; this.healType = null;
    this.crouch = false; this.running = false; this.aiming = false; this.onGround = false;
    this.state = 'plane'; // plane | fall | chute | ground
    this.recoilKick = 0; this.lastShotT = 0; this.placement = 0; this.bloom = 0; this.sprayN = 0; this.lastFireT = -9;
    this.model.setGun(null); this.model.setGear(0, 0, 0);
    this.model.root.visible = false;
  }
  weapon() { return this.weapons[this.slot]; }
  wdef() { const w = this.weapon(); return w ? LS.WEAPONS[w.id] : null; }
  bagMult() { return LS.GEAR.bag.levels[this.bag]; }
  maxAmmo(t) { return Math.round(LS.AMMO_TYPES[t].baseMax * this.bagMult()); }
  maxMed(t) { return Math.round(LS.MEDS[t].baseMax * this.bagMult()); }
  headY() { return this.crouch ? 1.28 : 1.57; }
  eyePos(out) { return out.set(this.pos.x, this.pos.y + this.headY(), this.pos.z); }

  switchWeapon(i) {
    if (i === this.slot || !this.weapons[i]) return false;
    this.slot = i; this.reloadT = 0; this.fireCd = Math.max(this.fireCd, 0.45);
    this.model.switchGun(this.weapons[i].id); // guarda a atual e saca a nova
    return true;
  }
  // devolve texto da coleta ou null
  pickup(it, allowSwap) {
    if (!it.alive) return null;
    const label = LS.Loot.label(it);
    if (it.type === 'weapon') {
      let s = this.weapons[0] ? (this.weapons[1] ? -1 : 1) : 0;
      if (s < 0) {
        if (!allowSwap) return null;
        s = this.slot;
        this.dropWeapon(s);
      }
      this.weapons[s] = { id: it.id, mag: it.ammoInMag };
      if (!this.weapon() || s === this.slot || !this.weapons[this.slot]) { this.slot = s; this.model.switchGun(it.id); this.reloadT = 0; }
      LS.Loot.remove(it, this); return label;
    }
    if (it.type === 'ammo') {
      const space = this.maxAmmo(it.id) - this.ammo[it.id]; if (space <= 0) return null;
      const take = Math.min(space, it.amount); this.ammo[it.id] += take; it.amount -= take;
      if (it.amount <= 0) LS.Loot.remove(it, this);
      return LS.AMMO_TYPES[it.id].name + ' +' + take;
    }
    if (it.type === 'med') {
      const space = this.maxMed(it.id) - this.meds[it.id]; if (space <= 0) return null;
      const take = Math.min(space, it.amount); this.meds[it.id] += take; it.amount -= take;
      if (it.amount <= 0) LS.Loot.remove(it, this);
      return LS.MEDS[it.id].name + ' +' + take;
    }
    if (it.type === 'gel') {
      const space = LS.GEL.max - (this.gel || 0); if (space <= 0 || this.gelInf) return null;
      const take = Math.min(space, it.amount); this.gel += take; it.amount -= take;
      if (it.amount <= 0) LS.Loot.remove(it, this);
      return LS.GEL.name + ' +' + take;
    }
    if (it.type === 'vest' || it.type === 'helmet') {
      const g = this[it.type], def = LS.GEAR[it.type].levels[it.level];
      if (it.level < g.level || (it.level === g.level && g.dur >= def.dur * 0.6)) return null;
      g.level = it.level; g.dur = def.dur;
    } else if (it.type === 'bag') {
      if (it.level <= this.bag) return null;
      this.bag = it.level;
    }
    this.model.setGear(this.vest.level, this.helmet.level, this.bag);
    LS.Loot.remove(it, this); return label;
  }
  dropWeapon(s) {
    const w = this.weapons[s]; if (!w) return;
    // online: a arma largada ganha id ÚNICO (dono + contador, que nunca volta a zero) e os outros jogadores ficam sabendo ('dropw').
    // Antes o id era 'x1, x2...' local: colidia com o de outro jogador e a coleta era desfeita; e a arma nem aparecia pros outros.
    const N = LS.Net, onl = !!(N && N.online && this.netId && N.owns(this));
    const nid = onl ? 'd' + this.netId + '_' + (this.dropSeq = (this.dropSeq | 0) + 1) : undefined;
    const it = LS.Loot.spawn('weapon', w.id, 0, 1, this.pos.x + Math.sin(this.yaw) * 1.2, this.pos.y + 0.1, this.pos.z + Math.cos(this.yaw) * 1.2, nid);
    it.ammoInMag = w.mag;
    if (onl) { const r = v => Math.round(v * 100) / 100; N.send({ t: 'dropw', i: this.netId, id: nid, w: w.id, m: w.mag, p: [r(it.pos.x), r(it.pos.y), r(it.pos.z)] }); }
    this.weapons[s] = null;
    if (s === this.slot) { this.reloadT = 0; const o = 1 - s; if (this.weapons[o]) { this.slot = o; this.model.switchGun(this.weapons[o].id); } else this.model.switchGun(null); }
  }
  startReload() {
    const w = this.weapon(), d = this.wdef();
    if (!w || this.reloadT > 0 || w.mag >= d.mag || this.ammo[d.ammo] <= 0) return false;
    this.reloadT = d.reload; this.cancelHeal();
    if (this.isPlayer) LS.Audio.reload(d);
    return true;
  }
  startHeal(type) {
    if (this.meds[type] <= 0 || this.hp >= 100 || this.healType) return false;
    this.healType = type; this.healT = LS.MEDS[type].time; this.reloadT = 0;
    return true;
  }
  cancelHeal() { this.healType = null; this.healT = 0; }

  updateTimers(dt) {
    this.fireCd = Math.max(0, this.fireCd - dt); this.gelCd = Math.max(0, (this.gelCd || 0) - dt);
    this.recoilKick = Math.max(0, this.recoilKick - dt * 6);
    // a mira "fecha" rápido quando para de atirar (estilo celular)
    if (this.bloom > 0 && LS.Game.time - this.lastFireT > 0.1) { const R = this.recoilDef(); this.bloom = Math.max(0, this.bloom - dt * Math.max(0.06, R.bm * 4.5)); }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        const w = this.weapon(), d = this.wdef();
        if (w) { const need = d.mag - w.mag, take = Math.min(need, this.ammo[d.ammo]); w.mag += take; this.ammo[d.ammo] -= take; }
      }
    }
    if (this.healType) {
      this.healT -= dt;
      if (this.healT <= 0) {
        const m = LS.MEDS[this.healType];
        this.hp = Math.min(100, this.hp + m.heal); this.meds[this.healType]--;
        if (this.isPlayer) LS.Audio.heal();
        this.healType = null;
      }
    }
  }
  // soco quando está sem arma: curto alcance, cone de 60° na frente
  tryPunch() {
    if (this.weapon() || this.fireCd > 0 || this.healType || this.state !== 'ground' || !this.alive) return false;
    this.fireCd = 0.45; this.model.punch();
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const f of LS.Game.fighters) {
      if (f === this || !f.alive || f.netHidden || LS.sameTeam(this, f)) continue;
      const dx = f.pos.x - this.pos.x, dz = f.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1e-3;
      if (d < 1.7 && Math.abs(f.pos.y - this.pos.y) < 1.2 && (dx * fx + dz * fz) / d > 0.5) {
        // parede no meio? o soco não atravessa (antes só testava distância e cone)
        const eye = (this._pe || (this._pe = new THREE.Vector3())).set(this.pos.x, this.pos.y + 1.2, this.pos.z), ch = (this._pc || (this._pc = new THREE.Vector3())).set(f.pos.x, f.pos.y + 1.0, f.pos.z);
        if (!LS.World.hasLOS(eye, ch)) continue;
        f.takeDamage(12, this, false, 'Soco');
        if (this.isPlayer) { LS.Audio.hitmarker(false); if (LS.HUD.hitmarker) LS.HUD.hitmarker(false); }
        break;
      }
    }
    return true;
  }
  recoilDef() { const w = this.weapon(); return (w && LS.RECOIL[w.id]) || LS.RECOIL._def; }
  // dispersão atual do jogador (rad, meio-ângulo do cone): base da arma × postura + abertura de tiro contínuo
  currentSpread() {
    const d = this.wdef(); if (!d) return 0;
    const R = this.recoilDef(), moving = Math.hypot(this.vel.x, this.vel.z) > 1.2;
    let s = d.spread;
    if (d.cat === 'Sniper') s *= this.aiming ? 0.5 : 14;
    else s *= this.aiming ? R.ads : R.hip;
    if (this.crouch) s *= 0.75;
    if (moving) s *= this.aiming ? 1.7 : 1.35;
    if (!this.onGround) s *= 2.5;
    return s + this.bloom * (this.aiming ? 0.55 : 1);
  }
  // tenta atirar na direção dada; devolve true se disparou
  tryFire(origin, dir, accuracyMul) {
    const w = this.weapon(), d = this.wdef();
    if (!w || this.fireCd > 0 || this.reloadT > 0 || this.healType || this.state !== 'ground') return false;
    if (w.mag <= 0) { this.fireCd = 0.25; if (this.isPlayer) LS.Audio.empty(); this.startReload(); return false; }
    w.mag--; this.fireCd = 1 / d.rate;
    let spread;
    if (this.isPlayer) spread = this.currentSpread() * (accuracyMul || 1);
    else { // bots: mesma conta de antes (a dificuldade deles continua igual)
      spread = d.spread * (accuracyMul || 1);
      if (!this.aiming) spread *= d.cat === 'Sniper' ? 8 : 1.8;
      if (this.crouch) spread *= 0.7;
      if (this.vel.lengthSq() > 4) spread *= 1.6;
      if (!this.onGround) spread *= 2.5;
    }
    LS.Combat.fire(this, origin, dir, d, spread);
    if (this.isPlayer) { // sequência de tiros (pro padrão do recuo) e abertura da mira
      const R = this.recoilDef(), now = LS.Game.time;
      this.sprayN = now - this.lastFireT < 1 / d.rate + 0.2 ? this.sprayN + 1 : 0;
      this.lastFireT = now;
      this.bloom = Math.min(R.bm, this.bloom + R.b * (this.sprayN === 0 ? 0.5 : 1));
    }
    this.model.shoot(d);
    this.recoilKick = Math.min(this.recoilKick + d.recoil, 12);
    this.lastShotT = LS.Game.time;
    if (w.mag <= 0) this.startReload();
    return true;
  }
  takeDamage(amount, attacker, head, weaponName, ignoreArmor) {
    if (!this.alive) return 0;
    let dmg = amount;
    if (!ignoreArmor) {
      const g = head ? this.helmet : this.vest;
      if (g.level > 0 && g.dur > 0) {
        const def = LS.GEAR[head ? 'helmet' : 'vest'].levels[g.level];
        const absorbed = dmg * def.red;
        dmg -= absorbed; g.dur = Math.max(0, g.dur - absorbed * 1.5);
      }
    }
    this.hp -= dmg;
    if (this.healType && !ignoreArmor) this.cancelHeal();
    if (attacker) attacker.damageDealt += dmg;
    LS.Game.onDamage(this, attacker, dmg, head);
    if (this.hp <= 0) { this.hp = 0; this.die(attacker, weaponName, head); }
    else if (dmg > 0.5) this.model.hit(); // reação ao dano
    return dmg;
  }
  die(killer, weaponName, head) {
    this.alive = false; this.healType = null; this.reloadT = 0;
    if (killer && killer !== this) killer.kills++;
    // espalha o inventário no chão
    const U = LS.util, p = this.pos, gy = LS.World.groundAt(p.x, p.z, p.y + 0.5, 0.3) + 0.1;
    const drop = (type, id, lv, amt, extra) => {
      const a = Math.random() * Math.PI * 2, r = U.rand(0.6, 1.8);
      const it = LS.Loot.spawn(type, id, lv, amt, p.x + Math.cos(a) * r, gy, p.z + Math.sin(a) * r);
      if (extra !== undefined) it.ammoInMag = extra;
    };
    if (LS.Game.mode === 'br') { // no duelo e na sala não cai loot: cada round começa com as armas do round
      this.weapons.forEach(w => { if (w) drop('weapon', w.id, 0, 1, w.mag); });
      for (const t in this.ammo) if (this.ammo[t] > 0) drop('ammo', t, 0, this.ammo[t]);
      for (const t in this.meds) if (this.meds[t] > 0) drop('med', t, 0, this.meds[t]);
      if (this.gel > 0) drop('gel', 'gel', 0, this.gel);
      if (this.vest.level && this.vest.dur > 10) drop('vest', null, this.vest.level, 1);
      if (this.helmet.level && this.helmet.dur > 10) drop('helmet', null, this.helmet.level, 1);
      if (this.bag) drop('bag', null, this.bag, 1);
    }
    this.weapons = [null, null]; this.model.setGun(null);
    LS.Game.onKill(this, killer, weaponName, head);
  }
};

LS.Combat = {
  _o: new THREE.Vector3(), _d: new THREE.Vector3(), _tmp: new THREE.Vector3(), _end: new THREE.Vector3(),
  // interseção raio-esfera; retorna t ou -1
  raySphere(o, d, cx, cy, cz, r) {
    const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
    const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r;
    const h = b * b - c; if (h < 0) return -1;
    const t = -b - Math.sqrt(h); return t >= 0 ? t : -1;
  },
  // testa o raio contra todos os personagens vivos
  hitFighter(o, d, maxT, shooter) {
    let best = null, bt = maxT, head = false;
    for (const f of LS.Game.fighters) {
      if (!f.alive || f === shooter || f.state === 'plane' || f.netHidden || LS.sameTeam(shooter, f)) continue; // sem fogo amigo: a bala passa pelo parceiro
      const dx = f.pos.x - o.x, dz = f.pos.z - o.z;
      if (dx * dx + dz * dz > (maxT + 3) * (maxT + 3)) continue;
      const k = f.crouch ? 0.7 : 1, p = f.pos;
      // cabeça: onde ela está desenhada (inclinada correndo/agachado); se a animação estiver estranha, volta pro ponto padrão
      let hx = p.x, hy = p.y + f.headY(), hz = p.z;
      if (f.model && f.model.root.visible && f.model.root.parent && f.state === 'ground') {
        const c = f.model.headCenter(this._hc || (this._hc = new THREE.Vector3()));
        if (Math.abs(c.x - hx) + Math.abs(c.y - hy) + Math.abs(c.z - hz) < 0.8) { hx = c.x; hy = c.y; hz = c.z; }
      }
      let t = this.raySphere(o, d, hx, hy, hz, 0.24);
      if (t >= 0 && t < bt) { bt = t; best = f; head = true; }
      for (const hy of [0.35, 0.8, 1.25]) {
        t = this.raySphere(o, d, p.x, p.y + hy * k, p.z, 0.36);
        if (t >= 0 && t < bt) { bt = t; best = f; head = false; }
      }
    }
    return best ? { f: best, t: bt, head } : null;
  },
  // visual = tiro de um jogador remoto: só efeitos (o dano vem do servidor)
  // direção dentro do cone de dispersão. Uma bala: mais perto do centro (a maioria cai no meio da mira).
  // Escopeta: desenho fixo em anéis (sempre o mesmo formato, que nem nos jogos de celular) com um pouco de variação.
  coneDir(out, dir, spread, i, n) {
    out.copy(dir); if (spread <= 0) return out;
    const up = Math.abs(dir.y) > 0.95 ? this._ux || (this._ux = new THREE.Vector3(1, 0, 0)) : this._uy || (this._uy = new THREE.Vector3(0, 1, 0));
    const r1 = (this._r1 || (this._r1 = new THREE.Vector3())).crossVectors(dir, up).normalize();
    const r2 = (this._r2 || (this._r2 = new THREE.Vector3())).crossVectors(r1, dir).normalize();
    let a, r;
    if (n > 1) {
      if (i === 0) { a = Math.random() * 6.283; r = 0.12 * Math.random(); }
      else { const ring = i <= Math.ceil((n - 1) * 0.4) ? 0.5 : 0.95, k = i / (n - 1); a = k * 6.283 * (ring < 0.9 ? 1 : 1.0) + (ring < 0.9 ? 0.4 : 0) + (Math.random() - 0.5) * 0.35; r = ring * (0.88 + Math.random() * 0.12); }
    } else { a = Math.random() * 6.283; r = Math.random() * (0.35 + 0.65 * Math.random()); }
    const t = Math.tan(spread * r);
    return out.addScaledVector(r1, Math.cos(a) * t).addScaledVector(r2, Math.sin(a) * t).normalize();
  },
  fire(shooter, origin, dir, wdef, spread, visual) {
    if (!visual && LS.Net.online && LS.Net.owns(shooter)) LS.Net.send({ t: 'fire', i: shooter.netId, w: shooter.weapon().id, o: [origin.x, origin.y, origin.z].map(v => Math.round(v * 100) / 100), d: [dir.x, dir.y, dir.z].map(v => Math.round(v * 1000) / 1000) });
    const muzzle = shooter.model.muzzleWorld(new THREE.Vector3());
    const listener = LS.Game.player;
    // som
    if (shooter.isPlayer) LS.Audio.gunshot(wdef);
    else if (listener) {
      const dist = shooter.pos.distanceTo(listener.pos);
      const rel = Math.atan2(shooter.pos.x - listener.pos.x, shooter.pos.z - listener.pos.z);
      LS.Audio.gunshot(wdef, dist, -Math.sin(LS.util.angleDiff(listener.yaw, rel)));
    }
    const near = shooter.isPlayer || (listener && shooter.pos.distanceTo(listener.pos) < 60);
    if (near) {
      LS.Effects.muzzle(muzzle, dir, wdef, true);
      if (wdef.cat !== 'Escopeta' && wdef.cat !== 'Sniper') LS.Effects.shell(muzzle, shooter.yaw, false);
      if (shooter.isPlayer) LS.Audio.shellDrop(0);
    }
    LS.Game.onGunshot(shooter);
    let whizzed = false;
    for (let p = 0; p < wdef.pellets; p++) {
      let d;
      if (shooter.isPlayer) d = this.coneDir(this._d, dir, spread, p, wdef.pellets);
      else { d = this._d.copy(dir); d.x += (Math.random() - 0.5) * 2 * spread; d.y += (Math.random() - 0.5) * 2 * spread; d.z += (Math.random() - 0.5) * 2 * spread; d.normalize(); } // bots: como antes
      const maxR = wdef.range * 1.6;
      const wt = LS.World.raycast(origin, d, maxR), wbox = LS.World.lastBox;
      const hit = this.hitFighter(origin, d, wt, shooter);
      if (!hit && wbox && wbox.gel) { // parede de gel: o dano é de quem atirou de verdade (e é avisado aos outros); o tiro "visual" de outro jogador só balança.
        // (antes cada computador calculava o seu, com espalhamento 0 nos tiros visuais: a vida e a hora de estourar divergiam)
        if (visual) wbox.gel.wobble(); else { wbox.gel.hit(wdef.dmg); LS.Net.gelHit(shooter, wbox.gel, wdef.dmg); }
      }
      const t = hit ? hit.t : wt;
      const end = this._end.copy(origin).addScaledVector(d, t);
      if (p < 3) LS.Effects.tracer(muzzle, end);
      // bala passando perto do jogador
      if (!shooter.isPlayer && listener && listener.alive && !whizzed && (!hit || hit.f !== listener)) {
        const toL = this._tmp.set(listener.pos.x - origin.x, listener.pos.y + 1.4 - origin.y, listener.pos.z - origin.z);
        const along = toL.dot(d);
        if (along > 0 && along < t + 2) {
          const closest = toL.addScaledVector(d, -along).length();
          if (closest < 2.5) { whizzed = true; LS.Audio.whiz(LS.util.rand(-0.6, 0.6)); }
        }
      }
      if (hit) {
        // queda de dano com a distância
        const fall = t > wdef.range ? LS.util.clamp(1 - (t - wdef.range) / (wdef.range * 0.6), 0.25, 1) : 1;
        let dmg = (hit.head && wdef.hsDmg ? wdef.hsDmg : wdef.dmg * (hit.head ? (wdef.cat === 'Sniper' ? 2.5 : 1.8) : 1)) * fall;
        if (!shooter.isPlayer) dmg *= LS.Game.botDamageMul;
        LS.Effects.impact(end, true, d);
        if (visual) continue;
        const g = hit.head ? hit.f.helmet : hit.f.vest, armored = g.level > 0 && g.dur > 0;
        const dealt = hit.f.takeDamage(dmg, shooter, hit.head, wdef.name);
        if (shooter.isPlayer && !LS.Net.online) { // online: marcador e número só quando o servidor confirmar
          LS.Game.onPlayerHit(hit.head, !hit.f.alive);
          LS.Effects.damageNumber(end, dealt, hit.head);
          if (armored) LS.Audio.armorHit();
        } else if (shooter.isPlayer && hit.f.netId && hit.f.alive) LS.Net.optHit(hit.head, hit.f); // online: marcador/som na hora; o dano e o número vêm do servidor
      } else if (wt < maxR) LS.Effects.impact(end, false, d);
    }
  }
};
