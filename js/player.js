// Física de movimento compartilhada + jogador controlado pelo usuário
'use strict';

// ---------- Física comum (jogador e bots) ----------
// wish: {x,z} direção desejada (normalizada ou zero), opts: {speed, jump}
LS.Fighter.prototype.physics = function (dt, wish, opts) {
  const W = LS.World;
  W._rockBudget = 2.5 * dt + 0.01; // quanto a pedra pode empurrar neste quadro (empurrão suave, ~3 m/s)
  try { this._physics(dt, wish, opts); } finally { W._rockBudget = Infinity; }
};
LS.Fighter.prototype._physics = function (dt, wish, opts) {
  const W = LS.World, p = this.pos, v = this.vel, R = 0.38;
  if (this.state === 'plane') return;
  if (this.state === 'fall' || this.state === 'chute') {
    const dive = this.state === 'fall' && opts.dive;
    const hs = this.state === 'fall' ? (dive ? 24 : 15) : 10;
    v.x = LS.util.lerp(v.x, wish.x * hs, Math.min(1, dt * 2));
    v.z = LS.util.lerp(v.z, wish.z * hs, Math.min(1, dt * 2));
    const term = this.state === 'fall' ? (dive ? -62 : -38) : -7;
    v.y = Math.max(term, v.y - LS.GRAVITY * dt);
    if (this.state === 'chute') v.y = LS.util.lerp(v.y, term, Math.min(1, dt * 3));
    const oy = p.y;
    { const hx = v.x * dt, hz = v.z * dt, steps = Math.min(40, Math.max(1, Math.ceil(Math.hypot(hx, hz) / 0.15))), pv = this._prev || (this._prev = { x: 0, z: 0 });
      p.y += v.y * dt;
      for (let i = 0; i < steps; i++) { pv.x = p.x; pv.z = p.z; p.x += hx / steps; p.z += hz / steps; W.collideCircle(p, R, 1.8, pv); } }
    const g = W.groundAt(p.x, p.z, oy, R); // procura o chão a partir de onde estava: mergulho rápido não atravessa telhado
    if (this.state === 'fall' && (p.y - g < 90 || opts.openChute)) { this.state = 'chute'; if (this.isPlayer) { LS.Audio.stopLoop('wind'); LS.Audio.startLoop('chute', 'wind'); } }
    if (p.y <= Math.max(g, LS.WATER_LEVEL - 1.2)) {
      p.y = Math.max(g, LS.WATER_LEVEL - 1.2); v.set(0, 0, 0);
      this.state = 'ground'; this.onGround = true; this.model.landT = 0.35;
      if (this.isPlayer) { LS.Audio.stopLoop('chute'); LS.Audio.land(); }
      if (LS.Game.player && this.pos.distanceTo(LS.Game.player.pos) < 60) LS.Effects.landDust(this.pos);
    }
    W.collideCircle(p, R, 1.8);
    this.clampToIsland();
    return;
  }
  // em terra
  const ground0 = W.heightAt(p.x, p.z);
  const swimming = ground0 < LS.WATER_LEVEL - 1.0 && p.y < LS.WATER_LEVEL;
  let speed = opts.speed * (swimming ? 0.5 : 1);
  const accel = this.onGround || swimming ? 14 : 3;
  v.x = LS.util.lerp(v.x, wish.x * speed, Math.min(1, dt * accel));
  v.z = LS.util.lerp(v.z, wish.z * speed, Math.min(1, dt * accel));
  if (opts.jump && this.onGround && !swimming) { v.y = 8.2; this.onGround = false; if (this.isPlayer) LS.Audio.jump(); }
  v.y -= LS.GRAVITY * dt;
  const oldY = p.y, prev = this._prev || (this._prev = { x: 0, z: 0 });
  prev.x = p.x; prev.z = p.z;
  // anda em passos de no máximo 0,15 m, testando a colisão em cada um: rápido demais (speed, lag) não atravessa parede
  const hx = v.x * dt, hz = v.z * dt, steps = Math.min(40, Math.max(1, Math.ceil(Math.hypot(hx, hz) / 0.15)));
  this.blocked = false; p.y += v.y * dt; W._rockHit = null;
  for (let i = 0; i < steps; i++) {
    prev.x = p.x; prev.z = p.z;
    p.x += hx / steps; p.z += hz / steps;
    if (W.collideCircle(p, R, this.crouch ? 1.2 : 1.8, prev)) this.blocked = true;
  }
  this.clampToIsland();
  let g = W.groundAt(p.x, p.z, Math.max(oldY, p.y), R);
  if (swimming) g = Math.max(g, LS.WATER_LEVEL - 1.3);
  if (p.y <= g) {
    if (!this.onGround && v.y < -14 && this.isPlayer) LS.Audio.land();
    if (!this.onGround && v.y < -5) this.model.landT = Math.min(0.3, -v.y * 0.018);
    if (!this.onGround && v.y < -20 && !this.safeLand) this.takeDamage((-v.y - 20) * 3, null, false, 'Queda', true);
    p.y = g; v.y = 0; this.onGround = true; this.safeLand = false;
  } else if (this.onGround && p.y - g < 0.6 && v.y <= 0) { p.y = g; v.y = 0; } // desce rampas sem "voar"
  else this.onGround = false;
  // escalar pedras: só quando a pedra de verdade barrou o passo e a pessoa está andando contra ela
  // (como no Roblox). Sobe até o ponto da frente ficar na altura de um degrau; aí passa pra cima dela.
  this.climbing = false;
  const rh = W._rockHit;
  if (!swimming && rh && (wish.x || wish.z) && -(wish.x * rh.nx + wish.z * rh.nz) > 0.35) {
    const hA = W.rockH(rh.R, p.x - rh.nx * (R + 0.3), p.z - rh.nz * (R + 0.3)); // altura da pedra logo à frente
    if (hA - p.y <= 3.4) {
      v.y = Math.max(v.y, 4.2); this.climbing = true; this.onGround = false;
      if (hA - p.y < 0.8) { const sp = Math.max(2.5, Math.min(Math.hypot(v.x, v.z), 4)); v.x = wish.x * sp; v.z = wish.z * sp; } // passa da beirada (sem acelerar)
    }
  }
  // bate a cabeça em tetos (as caixas das pedras não contam: a pedra é tratada pela superfície)
  for (const b of W.nearBoxes(p.x, p.z, 1)) {
    if (b.rock) continue;
    if (p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ && p.y + 1.8 > b.minY && p.y < b.minY && v.y > 0) { v.y = 0; p.y = b.minY - 1.8; }
  }
};
LS.Fighter.prototype.clampToIsland = function () {
  if (LS.Game.mode === 'duel') return; // o galpão do duelo fica no mar (as paredes seguram)
  if (LS.Game.mode === 'custom') { LS.CustomMap.inside(this); return; } // ilha plana: não passa da borda
  const d = Math.hypot(this.pos.x, this.pos.z), M = 360;
  if (d > M) { this.pos.x *= M / d; this.pos.z *= M / d; }
};

// ---------- Jogador ----------
LS.Player = class extends LS.Fighter {
  constructor() {
    super(LS.playerProfile.name, true, { look: LS.playerProfile.look, chute: 0xff8a1f });
    this.camYaw = 0; this.camPitch = -0.1; this.camDist = 3.6;
    this.stepT = 0; this.prompt = ''; this.pickMsgT = 0;
    this.camPos = new THREE.Vector3(); this.aimDir = new THREE.Vector3(0, 0, 1);
    this.recoilX = 0; this.recoilY = 0; this.recoilPend = { x: 0, y: 0 }; this.shake = 0; this._aaT = 0; this._aaTarget = null;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
  }
  update(dt, camera) {
    const I = LS.Input, k = I.keys;
    // sensibilidade: a geral vale sempre; mirando/luneta multiplica pela do red dot ou da luneta (4x/6x/8x).
    // O (70/fov)^-0.9 deixa a mira mais lenta quanto maior o zoom, e o ajuste do jogador vai por cima
    const S = LS.settings, sk = LS.sensKey(this.aiming && !!this.wdef(), !!this.scopeUp, this.scopeZoom || 1);
    const sens = 0.0022 * LS.sensMult(S.sensGeneral) * (sk === 'sensGeneral' ? 1 : LS.sensMult(S[sk])) * (70 / camera.fov) ** -0.9;
    if (!LS.Game.inventoryOpen) {
      const aa = this.aimAssist(dt);
      this.camYaw -= I.mouse.dx * sens * aa.slow + aa.yaw;
      this.camPitch -= I.mouse.dy * sens * aa.slow - aa.pitch;
    }
    this.stepRecoil(dt);
    this.camPitch = LS.util.clamp(this.camPitch, -1.35, 1.2);
    if (!this.alive) { if (LS.Spectate.active) LS.Spectate.frame(camera); else this.updateCamera(dt, camera); return; } // morto: killcam / espectador
    this.updateTimers(dt);

    // direção de movimento relativa à câmera
    let fx = 0, fz = 0;
    if (k.KeyW) fz += 1; if (k.KeyS) fz -= 1; if (k.KeyA) fx += 1; if (k.KeyD) fx -= 1;
    if (I.axis && (I.axis.x || I.axis.y)) { fx = -I.axis.x; fz = -I.axis.y; } // celular: joystick (direção livre)
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
    let wx = sy * fz + cy * fx, wz = cy * fz - sy * fx;
    const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
    const frozen = LS.Game.frozen; // contagem do duelo: só gira a câmera
    if (frozen) { wx = 0; wz = 0; }

    if (LS.Console.fly && this.state !== 'plane') {
      // voo livre (comando "fly"): segue a câmera, ESPAÇO sobe, C/CTRL desce, SHIFT acelera; atravessa tudo
      this.state = 'ground'; this.onGround = false; this.safeLand = true; this.crouch = false;
      const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch), up = (k.Space ? 1 : 0) - (k.KeyC || k.ControlLeft ? 1 : 0);
      let mx = sy * cp * fz + cy * fx, my = sp * fz + up, mz = cy * cp * fz - sy * fx;
      const ml = Math.hypot(mx, my, mz), spd = (k.ShiftLeft ? 40 : 14) * LS.Console.speedMul;
      if (ml > 0) { mx /= ml; my /= ml; mz /= ml; }
      this.vel.set(mx * spd, my * spd, mz * spd);
      this.pos.addScaledVector(this.vel, dt); this.clampToIsland();
      this.pos.y = Math.max(this.pos.y, LS.World.heightAt(this.pos.x, this.pos.z));
      this.yaw = this.camYaw; this.running = !!k.ShiftLeft; this.aiming = I.mouse.right && !!this.weapon();
      this.flyAnim = true;
    } else if (this.state === 'plane') {
      if (I.wasPressed('Space') && LS.Game.plane.canJump()) LS.Game.jumpFromPlane(this);
    } else if (this.state !== 'ground') {
      this.physics(dt, { x: wx, z: wz }, { openChute: I.wasPressed('Space'), dive: !!k.KeyW });
      this.steer = fx; this.dive = !!k.KeyW;
      this.yaw = this.camYaw;
    } else {
      if (I.wasPressed('KeyC')) this.crouch = !this.crouch;
      const w = this.weapon();
      this.aiming = I.mouse.right && !!w && !LS.Game.inventoryOpen;
      this.running = k.ShiftLeft && fz > 0 && !this.aiming && !this.healType;
      if (this.running) this.crouch = false;
      let speed = (this.crouch ? 2.3 : this.running ? 7.6 : 4.6) * LS.Console.speedMul;
      if (this.aiming) speed *= 0.6;
      if (this.healType) speed *= 0.45;
      if (this.reloadT > 0) speed *= 0.85;
      const jump = I.wasPressed('Space') && !this.crouch && !frozen;
      if (I.wasPressed('Space') && this.crouch) this.crouch = false;
      this.physics(dt, { x: wx, z: wz }, { speed, jump });
      // estilo Free Fire: o corpo só trava na direção da câmera atirando, mirando ou correndo;
      // andando, vira para onde está andando; parado, fica virado como estava (a câmera gira livre)
      const attacking = !LS.Game.inventoryOpen && (I.mouse.left || this.fireCd > 0 && !!this.wdef());
      const lock = this.running || this.aiming || attacking;
      const face = lock ? this.camYaw : wl > 0 ? Math.atan2(wx, wz) : this.yaw;
      if (!LS.Game.inventoryOpen && I.mouse.leftPressed) this.yaw = this.camYaw; // primeiro tiro/soco já sai pra frente
      else this.yaw += LS.util.angleDiff(this.yaw, face) * (1 - Math.exp(-(lock ? 22 : 10) * dt));
      this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw)); // mantém entre -180° e 180°
      // passos
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (this.onGround && hs > 1) { this.stepT -= dt * hs; if (this.stepT <= 0) { this.stepT = 2.6; LS.Audio.footstep(this.crouch ? 0.4 : this.running ? 1.3 : 0.8); } }

      if (!LS.Game.inventoryOpen && !frozen) {
        if (I.wasPressed('Digit1')) this.switchWeapon(0);
        if (I.wasPressed('Digit2')) this.switchWeapon(1);
        if (I.mouse.wheel && this.scopeUp && this.wdef()) { const mz = this.wdef().zoom; this.scopeZoom = LS.util.clamp((this.scopeZoom || mz) - I.mouse.wheel * 0.5, 2, mz); }
        else if (I.mouse.wheel) this.switchWeapon(1 - this.slot);
        if (I.wasPressed('KeyR')) this.startReload();
        if (I.wasPressed('KeyH')) this.startHeal('medkit');
        if (I.wasPressed('KeyG')) this.startHeal('bandage');
        const d = this.wdef();
        if (!d && I.mouse.leftPressed) this.tryPunch(); // sem arma: soco
        if (d && (d.auto ? I.mouse.left : I.mouse.leftPressed)) {
          if (this.running) this.running = false;
          const origin = this.shotOrigin(), sd = LS.Console.silentDir(this, origin);
          if (this.tryFire(origin, sd || this.aimDir, sd ? 0.15 : 1)) this.kickRecoil(d);
        }
      }
      this.handleLoot();
    }
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    this.model.animate({ dt, vy: this.vel.y, fall: this.state === 'fall', dive: this.dive, steer: this.steer, speed: Math.hypot(this.vel.x, this.vel.z), running: this.running, crouch: this.crouch, air: this.state === 'ground' && !this.onGround,
      chute: this.state === 'chute', aimPitch: this.camPitch + this.recoilY, armed: !!this.weapon(), armedAim: this.aiming || this.fireCd > 0, dead: !this.alive,
      reload: this.reloadT > 0 && this.wdef() ? 1 - this.reloadT / this.wdef().reload : -1, heal: this.healType });
    this.model.root.visible = this.state !== 'plane';
    this.updateCamera(dt, camera);
  }
  // ---------- recuo (estilo celular) ----------
  // cada tiro dá um "chute" pra cima (e um pouco pro lado, num padrão fixo da arma). O chute entra rápido,
  // a maior parte volta sozinha quando para de atirar e só um pouco fica na mira (dá pra compensar puxando o mouse).
  kickRecoil(d) {
    const R = this.recoilDef(), n = this.sprayN, deg = Math.PI / 180;
    const ramp = d.auto ? Math.min(1, 0.5 + n * 0.14) : 1; // primeiros tiros da rajada sobem menos
    const v = R.v * ramp * (this.crouch ? 0.8 : 1) * (this.aiming ? 0.85 : 1) * (0.92 + Math.random() * 0.16);
    const side = n < 3 && d.auto ? 0 : Math.sin(n * 0.55 + R.seed) * R.h * (d.auto ? Math.min(1, (n - 2) / 4) : 1);
    const h = side + (Math.random() - 0.5) * R.h * 0.35;
    this.recoilPend.y += v * deg; this.recoilPend.x += h * deg;
    this.shake = Math.min(1, this.shake + R.shake);
  }
  stepRecoil(dt) {
    const P = this.recoilPend, take = Math.min(1, dt * 30); // chute entra em ~40 ms (sem tranco)
    const ky = P.y * take, kx = P.x * take; P.y -= ky; P.x -= kx;
    const keep = this.recoilDef().keep ?? 0.28; // a parte que fica na mira (sniper quase nada; fuzil ~30%)
    this.recoilY += ky * (1 - keep); this.camPitch += ky * keep;
    this.recoilX += kx * (1 - keep); this.camYaw += kx * keep;
    if (LS.Game.time - this.lastFireT > 0.08) {
      const r = 1 - Math.exp(-this.recoilDef().rec * dt);
      this.recoilY -= this.recoilY * r; this.recoilX -= this.recoilX * r;
    }
    this.shake = Math.max(0, this.shake - dt * 5);
  }

  // ---------- assistência de mira (bem leve, quase imperceptível) ----------
  // só quando está atirando ou mirando e o inimigo já está quase na mira (cone de 2–3°):
  // a sensibilidade cai um pouco em cima dele (fica "grudento") e a mira escorrega devagar pro peito.
  // Nunca puxa de longe, nunca trava e não atravessa parede.
  // No CELULAR é bem mais forte (dedo é menos preciso que mouse, como nos jogos de celular): cone maior,
  // gruda mais, puxa mais rápido e ajuda um pouco até na luneta.
  aimAssist(dt) {
    const out = this._aa || (this._aa = { slow: 1, yaw: 0, pitch: 0 });
    out.slow = 1; out.yaw = 0; out.pitch = 0;
    const d = this.wdef(), I = LS.Input;
    const mob = !!(LS.Touch && LS.Touch.active);
    const A = mob ? { cone: [4.5, 6.5], slow: 0.45, pull: [4.5, 2.6], range: 220 } : { cone: [2.2, 3.0], slow: 0.16, pull: [1.2, 0.6], range: 160 };
    if (LS.settings.aimAssist === false || !this.alive || this.state !== 'ground' || !d || this.reloadT > 0 || this.healType || (this.scopeUp && !mob)) return out;
    if (this.scopeUp) { A.cone = [1.6, 1.6]; A.slow = 0.3; A.pull = [1.0, 0.6]; A.range = d.range; } // celular na luneta: só um pouquinho
    const firing = I.mouse.left;
    if (!firing && !this.aiming) { this._aaTarget = null; return out; }
    const cone = (this.aiming ? A.cone[0] : A.cone[1]) * Math.PI / 180;
    const eye = this.camPos, aim = this.aimDir;
    const errOf = f => {
      const ty = f.pos.y + (f.crouch ? 0.8 : 1.1), dx = f.pos.x - eye.x, dy = ty - eye.y, dz = f.pos.z - eye.z;
      const len = Math.hypot(dx, dy, dz); if (len < 0.5) return null;
      const yawT = Math.atan2(dx, dz), pitchT = Math.asin(dy / len);
      const yawA = Math.atan2(aim.x, aim.z), pitchA = Math.asin(LS.util.clamp(aim.y, -1, 1));
      const ey = LS.util.angleDiff(yawA, yawT), ep = pitchT - pitchA;
      return { ey, ep, err: Math.hypot(ey * Math.cos(pitchA), ep), len, ty };
    };
    this._aaT -= dt;
    if (this._aaT <= 0) { // escolhe o alvo ~10x por segundo
      this._aaT = 0.1; this._aaTarget = null;
      const maxD = Math.min(d.range, A.range), cands = [];
      for (const f of LS.Game.fighters) {
        if (f === this || !f.alive || f.netHidden || f.state !== 'ground' || LS.sameTeam(this, f)) continue;
        if (f.pos.distanceToSquared(this.pos) > maxD * maxD) continue;
        const e = errOf(f); if (e && e.err < cone * 1.3) cands.push({ f, e });
      }
      cands.sort((a, b) => a.e.err - b.e.err);
      for (const c of cands.slice(0, 3)) {
        if (LS.World.hasLOS(this._w.copy(eye).addScaledVector(aim, 0.6), new THREE.Vector3(c.f.pos.x, c.e.ty, c.f.pos.z))) { this._aaTarget = c.f; break; }
      }
    }
    const f = this._aaTarget; if (!f || !f.alive || f.netHidden) return out;
    const e = errOf(f); if (!e || e.err > cone) return out;
    const k = 1 - e.err / cone; // 0 na borda do cone, 1 no centro
    out.slow = 1 - A.slow * k;  // menos sensível em cima do alvo (16% no PC, 45% no celular)
    // escorrega pro peito: no PC no máximo ~1,2°/s atirando e ~0,6°/s mirando; no celular ~4,5°/s e ~2,6°/s
    const maxStep = (firing ? A.pull[0] : A.pull[1]) * Math.PI / 180 * dt * (0.4 + 0.6 * k);
    const step = Math.min(e.err * dt * (mob ? 3 : 1.5), maxStep), inv = e.err > 1e-5 ? step / e.err : 0;
    out.yaw = -e.ey * inv; out.pitch = e.ep * inv;
    return out;
  }
  shotOrigin() {
    // começa o raio da câmera na altura do personagem (evita acertar paredes atrás dele)
    const head = this.eyePos(this._w);
    const t0 = Math.max(0, this._v.subVectors(head, this.camPos).dot(this.aimDir));
    return new THREE.Vector3().copy(this.camPos).addScaledVector(this.aimDir, t0);
  }
  handleLoot() {
    this.prompt = '';
    // coleta automática de itens próximos
    const near = LS.Loot.nearest(this.pos, 1.7, it => it.type !== 'weapon' || !this.weapons[0] || !this.weapons[1]);
    if (near) {
      const msg = this.pickup(near, false);
      if (msg) { LS.Audio.pickup(); LS.HUD.toast('+ ' + msg); }
    }
    // armas com slots cheios: E para trocar
    const wpn = LS.Loot.nearest(this.pos, 2.0, it => it.type === 'weapon');
    if (wpn && this.weapons[0] && this.weapons[1]) {
      this.prompt = '<b>E</b> Trocar ' + LS.WEAPONS[this.weapon().id].name + ' por ' + LS.Loot.label(wpn);
      if (LS.Input.wasPressed('KeyE')) { const msg = this.pickup(wpn, true); if (msg) { LS.Audio.pickup(); LS.HUD.toast('+ ' + msg); } }
    } else {
      const other = LS.Loot.nearest(this.pos, 2.5, it => it.type !== 'weapon');
      if (other && !near) this.prompt = LS.Loot.label(other) + ' <span style="color:#aaa">(cheio / sem melhoria)</span>';
    }
  }
  updateCamera(dt, camera) {
    const wd = this.wdef(), sniper = !!(wd && wd.scope);
    if (wd && this.scopeFor !== wd.name) { this.scopeFor = wd.name; this.scopeZoom = wd.zoom; }
    // sniper: luneta de verdade (abaixa durante o ferrolho e a recarga); outras armas: só aproximam a câmera
    const scopeUp = this.aiming && sniper && this.fireCd < 0.25 && this.reloadT <= 0 && this.state === 'ground';
    this.scopeUp = scopeUp;
    let zoom = 1;
    if (this.aiming && wd) zoom = sniper ? (scopeUp ? this.scopeZoom : 1.25) : wd.zoom;
    const baseFov = 70;
    const targetFov = baseFov / zoom + (this.state === 'fall' ? (this.dive ? 20 : 10) : 0);
    camera.fov = LS.util.lerp(camera.fov, targetFov, Math.min(1, dt * (sniper ? 18 : 14)));
    camera.updateProjectionMatrix();
    const scoped = scopeUp && camera.fov < baseFov / 1.8;
    // respiração: segurar SHIFT com a luneta estabiliza a mira por alguns segundos
    if (this.breath === undefined) { this.breath = 4; this.breathPenalty = 0; }
    this.holding = scoped && LS.Input.keys.ShiftLeft && this.breath > 0 && this.breathPenalty <= 0;
    if (this.holding) { this.breath -= dt; if (this.breath <= 0) this.breathPenalty = 2; }
    else this.breath = Math.min(4, this.breath + dt * 0.6);
    this.breathPenalty = Math.max(0, this.breathPenalty - dt);
    LS.HUD.setScope(scoped, this.scopeZoom, this.breath / 4, this.holding);
    this.model.root.visible = this.state !== 'plane' && !scoped;

    let target, dist;
    if (this.state === 'plane') {
      target = LS.Game.plane.mesh.position.clone(); target.y += 2; dist = 32;
    } else {
      const spec = !this.alive && LS.Duel.spectateTarget(); // duelo 2v2: morto, assiste o parceiro
      target = (spec || this).eyePos(new THREE.Vector3());
      target.y += this.state === 'ground' ? 0.15 : 1.5;
      dist = this.state === 'ground' ? (scopeUp ? 0 : this.aiming ? 2.6 : 3.4) : this.state === 'fall' ? 8 : 9;
      if (scopeUp) target.y -= 0.15; // olho na luneta
      if (!this.alive) dist = 6;
      // ombro direito (centralizado ao usar a luneta)
      this.sideK = LS.util.lerp(this.sideK === undefined ? 0.75 : this.sideK, scopeUp ? 0 : (this.state === 'ground' ? (this.aiming ? 1.0 : 0.75) : 0), Math.min(1, dt * 14));
      // o ponto do ombro não pode atravessar parede (senão a câmera "vê" através dela, tipo shift lock)
      const sx = -Math.cos(this.camYaw), sz = Math.sin(this.camYaw), sdir = this._s || (this._s = new THREE.Vector3());
      sdir.set(sx, 0, sz);
      let side = this.sideK;
      if (side > 0.01) side = Math.max(0, Math.min(side, LS.World.raycast(target, sdir, side + 0.4) - 0.4));
      target.x += sx * side; target.z += sz * side;
    }
    this.camDist = LS.util.lerp(this.camDist, dist, Math.min(1, dt * (scopeUp ? 18 : 10)));
    // balanço da luneta (respiração); menor agachado e quase nenhum segurando o fôlego
    let yaw = this.camYaw + this.recoilX, pitch = this.camPitch + this.recoilY;
    if (scoped) {
      const tt = performance.now() * 0.001, moving = Math.hypot(this.vel.x, this.vel.z) > 0.5;
      const amp = 0.0045 * (this.holding ? 0.1 : 1) * (this.crouch ? 0.6 : 1) * (moving ? 2.2 : 1) * (this.breathPenalty > 0 ? 1.8 : 1);
      yaw += (Math.sin(tt * 0.9) + Math.sin(tt * 2.3) * 0.4) * amp;
      pitch += (Math.cos(tt * 1.3) * 0.8 + Math.sin(tt * 3.1) * 0.2) * amp;
    }
    const cp = Math.cos(pitch);
    const fwd = this.aimDir.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).normalize();
    // colisão da câmera
    const back = this._v.copy(fwd).negate();
    let d = this.camDist;
    if (this.state !== 'plane') { const hit = LS.World.raycast(target, back, this.camDist + 0.45); d = Math.min(d, hit - 0.45); } // folga > near (0,25) da câmera
    d = Math.max(scopeUp ? 0 : 0.3, d);
    this.camPos.copy(target).addScaledVector(back, d);
    // a câmera é uma esfera de 0,32 m: se encostar numa parede de lado (o raio passa raspando), aproxima até sair
    // (de costas colado na parede ela pode ir até a cabeça do boneco, nunca para o outro lado)
    if (this.state !== 'plane' && !scopeUp) {
      const W = LS.World, cp = this.camPos;
      while (d > 0.05 && W.sphereHits(cp.x, cp.y, cp.z, 0.32)) { d = Math.max(0.05, d - 0.15); cp.copy(target).addScaledVector(back, d); }
    }
    camera.position.copy(this.camPos);
    camera.lookAt(this._w.copy(this.camPos).add(fwd));
    // tremida do tiro: só inclina a tela um tiquinho (o centro da mira não sai do lugar)
    if (this.shake > 0.001 && !scoped) camera.rotateZ((Math.random() - 0.5) * this.shake * 0.02);
  }
};
