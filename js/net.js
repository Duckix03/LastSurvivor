// Modo online: busca de jogadores (30 s), partida com o servidor (Cloudflare) como autoridade e
// jogadores remotos. Sem LS.NET_URL configurado, o jogo continua só contra bots.
//
// Quem é "dono" de cada personagem manda a posição dele (o próprio jogador; os bots são do "host").
// Tiros: quem atira manda o disparo e os acertos; o SERVIDOR confere e decide o dano. A vida de todos
// vem do servidor, então editar o jogo no navegador não dá vida infinita nem tira mais dano.
'use strict';

// ---------- jogador (ou bot) controlado por outro computador: só mostra o que chega pela rede ----------
LS.RemoteFighter = class extends LS.Fighter {
  constructor(name, look) {
    super(name, false, { look: look || undefined });
    this.remote = true; this.tgt = null; this.spd = 0;
  }
  reset() { super.reset(); this.tgt = null; this.spd = 0; this.netFlags = 0; this.seenT = 0; this.netHidden = true; }
  // o servidor só manda quem dá pra ver: quem some do pacote fica escondido (e não leva tiro "fantasma")
  netTarget(s) {
    if (!this.tgt || this.netHidden) { this.pos.set(s[1], s[2], s[3]); this.yaw = s[4]; }
    this.tgt = s; this.seenT = performance.now(); this.netHidden = false;
  }
  update(dt) {
    const s = this.tgt; if (!s) { this.model.root.visible = false; return; }
    if (performance.now() - this.seenT > 700) { this.netHidden = true; this.model.root.visible = false; return; }
    const states = ['plane', 'fall', 'chute', 'ground'];
    this.state = states[s[7]] || 'ground';
    const k = 1 - Math.exp(-12 * dt), px = this.pos.x, pz = this.pos.z;
    const tv = (this._v || (this._v = new THREE.Vector3())).set(s[1], s[2], s[3]); // posição recebida
    if (this.pos.distanceTo(tv) > 12) this.pos.copy(tv);
    else this.pos.lerp(tv, k);
    this.yaw += LS.util.angleDiff(this.yaw, s[4]) * k; this.pitch = s[5];
    this.spd = LS.util.lerp(this.spd, Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-3), 1 - Math.exp(-8 * dt));
    this.vel.set(0, s[6], 0);
    const f = this.netFlags = s[11] | 0;
    this.crouch = !!(f & 1); this.running = !!(f & 2); this.aiming = !!(f & 4); this.onGround = !(f & 8);
    // arma e equipamento que aparecem no boneco
    const wid = s[8] || null;
    if ((this.weapons[0] && this.weapons[0].id) !== wid) { this.weapons = [wid ? { id: wid, mag: 99 } : null, null]; this.slot = 0; this.model.switchGun(wid); }
    const g = s[9] || [];
    this.vest = { level: g[0] | 0, dur: g[1] || 0 }; this.helmet = { level: g[2] | 0, dur: g[3] || 0 }; this.bag = g[4] | 0;
    this.model.setGear(this.vest.level, this.helmet.level, this.bag);
    if (this.alive) this.hp = s[10];
    this.model.root.position.copy(this.pos); this.model.root.rotation.y = this.yaw;
    this.model.root.visible = this.state !== 'plane';
    if (!this.alive) { this.model.animate({ dt, dead: true }); return; }
    this.model.animate({ dt, vy: s[6], fall: this.state === 'fall', dive: !!(f & 128), steer: 0, speed: this.spd, running: this.running, crouch: this.crouch,
      air: this.state === 'ground' && !this.onGround, chute: this.state === 'chute', aimPitch: this.pitch, armed: !!wid, armedAim: this.aiming, dead: false,
      reload: f & 16 ? 0.5 : -1, heal: f & 32 ? 'medkit' : f & 64 ? 'bandage' : null });
  }
};

LS.Net = {
  online: false, ws: null, you: null, host: null, ents: {}, remotes: [], sendT: 0, findWs: null,
  configured() { return !!LS.NET_URL; },
  isHost() { return this.online && this.host === this.you; },
  // este computador controla esse personagem? (o próprio jogador; os bots se for o host)
  owns(f) { return !!f && !!f.netId && (f.netId === this.you || (f.netId[0] === 'b' && this.isHost() && !f.remote)); },
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); },
  wsUrl(path) { return LS.NET_URL.replace(/^http/, 'ws').replace(/\/$/, '') + path; },

  // ---------- busca de partida ----------
  // cb: { onQueue(n, left), onStart(data), onFail(motivo) }
  find(cb) {
    this.cancel();
    let done = false;
    const fail = why => { if (done) return; done = true; this.cancel(); cb.onFail(why); };
    let ws;
    try { ws = new WebSocket(this.wsUrl('/ws/find')); } catch (e) { fail('erro'); return; }
    this.findWs = ws;
    const to = setTimeout(() => fail('sem resposta'), 45000);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', proto: LS.NET_PROTO, ver: LS.VERSION, app: LS.IS_APP, name: LS.playerProfile.name, look: LS.playerProfile.look, auth: LS.Account && LS.Account.token }));
    ws.onerror = () => { clearTimeout(to); fail('erro'); };
    ws.onclose = () => { clearTimeout(to); if (!done && !this._matching) fail('fechou'); };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'queue') cb.onQueue(m.n, m.left);
      else if (m.t === 'nomatch') { clearTimeout(to); fail('nomatch'); }
      else if (m.t === 'outdated') { clearTimeout(to); fail('outdated'); }
      else if (m.t === 'maint') { clearTimeout(to); fail('maint'); LS.Maint && LS.Maint.recheck(); }
      else if (m.t === 'match') { clearTimeout(to); this._matching = true; this.joinMatch(m, cb, () => { done = true; }, fail); }
    };
  },
  joinMatch(m, cb, ok, fail) {
    let ws;
    try { ws = new WebSocket(this.wsUrl('/ws/match/' + m.id + '?token=' + m.token)); } catch (e) { fail('erro'); return; }
    this.ws = ws;
    const to = setTimeout(() => fail('sala não começou'), 20000);
    ws.onerror = () => { clearTimeout(to); fail('erro'); };
    ws.onclose = () => { clearTimeout(to); if (this.online) this.onDisconnect(); else fail('fechou'); };
    ws.onmessage = ev => {
      let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.t === 'start') { clearTimeout(to); ok(); this._matching = false; this.findWs = null; cb.onStart(d); }
      else this.onMsg(d);
    };
  },
  cancel() {
    this._matching = false;
    if (this.findWs) { try { this.findWs.close(); } catch (e) { } this.findWs = null; }
    if (this.ws && !this.online) { try { this.ws.close(); } catch (e) { } this.ws = null; }
  },
  leave() {
    const ws = this.ws; this.online = false; this.ws = null;
    if (ws) { try { ws.close(); } catch (e) { } }
    for (const r of this.remotes) if (r.model.root.parent) r.model.root.parent.remove(r.model.root);
    this.remotes = []; this.ents = {};
  },
  onDisconnect() {
    if (!this.online) return;
    this.online = false;
    const G = LS.Game;
    if (G.state === 'playing' || G.state === 'paused') LS.HUD.centerMsg('CONEXÃO PERDIDA', 'A partida online caiu', 3);
  },

  // ---------- começo da partida ----------
  begin(d) {
    this.online = true; this.you = d.you; this.host = d.host; this.ents = {}; this.remotes = []; this.sendT = 0;
  },
  register(f, id) { f.netId = id; this.ents[id] = f; if (f.remote) this.remotes.push(f); },

  // ---------- todo quadro ----------
  update(dt) {
    if (!this.online) return;
    for (const r of this.remotes) r.update(dt);
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 1 / 12;
    const G = LS.Game, e = [];
    const pack = (f, pitch) => {
      const w = f.weapon(), fl = (f.crouch ? 1 : 0) | (f.running ? 2 : 0) | (f.aiming || f.fireCd > 0 || f.ai === 'fight' ? 4 : 0) | (f.state === 'ground' && !f.onGround ? 8 : 0) |
        (f.reloadT > 0 ? 16 : 0) | (f.healType === 'medkit' ? 32 : 0) | (f.healType === 'bandage' ? 64 : 0) | (f.dive || f.diving ? 128 : 0);
      const r = v => Math.round(v * 100) / 100;
      e.push([f.netId, r(f.pos.x), r(f.pos.y), r(f.pos.z), r(f.yaw), r(pitch), r(f.vel.y), { plane: 0, fall: 1, chute: 2, ground: 3 }[f.state] || 0,
        w ? w.id : null, [f.vest.level, Math.round(f.vest.dur), f.helmet.level, Math.round(f.helmet.dur), f.bag], fl]);
    };
    if (G.player.alive) pack(G.player, G.player.camPitch);
    if (this.isHost()) for (const b of G.bots) if (b.alive && b.netId) pack(b, b.pitch);
    if (e.length) this.send({ t: 'st', e });
  },

  // ---------- eventos do servidor ----------
  onMsg(m) {
    const G = LS.Game, E = id => this.ents[id];
    switch (m.t) {
      case 'snap': for (const s of m.e) { const f = E(s[0]); if (f && f.remote) f.netTarget(s); } break;
      case 'fire': { // tiro de outro jogador/bot remoto: só o efeito (som, clarão, traçante); o dano vem do servidor
        const f = E(m.i); if (!f || !f.remote || !LS.WEAPONS[m.w]) break;
        LS.Combat.fire(f, new THREE.Vector3(...m.o), new THREE.Vector3(...m.d).normalize(), LS.WEAPONS[m.w], 0, true);
        f.model.shoot(LS.WEAPONS[m.w]);
        break;
      }
      case 'dmg': {
        const v = E(m.v), a = m.a ? E(m.a) : null; if (!v || !v.alive) break;
        v.hp = m.hp;
        if (this.owns(v)) {
          if (m.ab > 0) { const g = m.h ? v.helmet : v.vest; g.dur = Math.max(0, g.dur - m.ab * 1.5); }
          if (a && v.healType) v.cancelHeal();
        }
        if (a) a.damageDealt += m.d;
        if (m.d > 0.5 && v.hp > 0) v.model.hit();
        G.onDamage(v, a, m.d, !!m.h);
        if (a && a === G.player) { // acertou alguém: marcador e número de dano (confirmados pelo servidor)
          G.onPlayerHit(!!m.h, v.hp <= 0);
          LS.Effects.damageNumber(new THREE.Vector3(v.pos.x, v.pos.y + 1.2, v.pos.z), m.d, !!m.h);
          if (m.ab > 0) LS.Audio.armorHit();
        }
        break;
      }
      case 'hp': { const v = E(m.v); if (v && v.alive && !this.owns(v)) v.hp = m.hp; break; }
      case 'kill': {
        const v = E(m.v), a = m.a ? E(m.a) : null; if (!v || !v.alive) break;
        const mine = this.owns(v);
        v.hp = 0; v._netApply = true;
        if (m.p && v.remote && v.netHidden) v.pos.set(m.p[0], m.p[1], m.p[2]); // morreu longe: efeito no lugar certo
        LS.Loot.idPfx = 'k' + m.k + '_'; LS.Loot.seq = 0;
        if (!mine) { v.weapons = [null, null]; for (const t in v.ammo) v.ammo[t] = 0; for (const t in v.meds) v.meds[t] = 0; v.vest = { level: 0, dur: 0 }; v.helmet = { level: 0, dur: 0 }; v.bag = 0; }
        const before = LS.Loot.items.length;
        LS.util.withSeed(m.k * 7919 + 13, () => v.die(a, m.w, !!m.h));
        v._netApply = false; v.placement = m.pl;
        if (mine) { // quem era dono do personagem conta pros outros o que ele deixou cair
          const items = LS.Loot.items.slice(before).map(it => [it.type, it.id, it.level, it.amount, Math.round(it.pos.x * 100) / 100, Math.round(it.pos.y * 100) / 100, Math.round(it.pos.z * 100) / 100, it.ammoInMag]);
          if (items.length) this.send({ t: 'drops', k: m.k, items });
        }
        LS.Loot.idPfx = 'x'; LS.Loot.seq = 0;
        break;
      }
      case 'drops': {
        LS.Loot.idPfx = 'k' + m.k + '_'; LS.Loot.seq = 0;
        for (const d of m.items) { const it = LS.Loot.spawn(d[0], d[1], d[2], d[3], d[4], d[5], d[6]); if (d[7] !== undefined && d[7] !== null) it.ammoInMag = d[7]; }
        LS.Loot.idPfx = 'x'; LS.Loot.seq = 0;
        break;
      }
      case 'pick': { // outro jogador pegou o item
        const it = LS.Loot.items.find(x => x.netId === m.id);
        if (it) LS.Loot.remove(it, E(m.by) || null);
        break;
      }
      case 'gel': { // bola de gelo de outro jogador: mesma física daqui, a parede nasce no mesmo lugar
        const f = E(m.i); if (!f || this.owns(f) || !Array.isArray(m.o) || !Array.isArray(m.v)) break;
        LS.GelBall.spawn(f, new THREE.Vector3(...m.o), new THREE.Vector3(...m.v)); break;
      }
      case 'fix': { const f = E(m.i); if (f && this.owns(f)) { f.pos.set(m.p[0], m.p[1], m.p[2]); f.vel.set(0, 0, 0); } break; }
      case 'host': this.host = m.host; if (m.host === this.you) this.takeOverBots(); break;
      case 'end': {
        if (G.ended || G.state === 'ended') break;
        const win = m.winner === this.you;
        if (win) { G.endTimer = 2; G.pendingWin = true; }
        break;
      }
    }
  },
  // o host saiu e este computador assumiu os bots: troca os bots remotos por bots com IA aqui
  takeOverBots() {
    const G = LS.Game;
    LS.HUD.centerMsg('VOCÊ AGORA CONTROLA OS BOTS', 'o host saiu da partida', 2.5);
    let pool = G.botPool.filter(b => !G.fighters.includes(b));
    for (const r of this.remotes.slice()) {
      if (r.netId[0] !== 'b' || !pool.length) continue;
      const b = pool.shift();
      b.reset(); b.name = r.name; b.model.applyLook(r.model.look);
      const s = r.tgt; // o último pacote é o mais novo (o bot podia estar escondido, sem atualizar o boneco)
      if (s) { r.pos.set(s[1], s[2], s[3]); r.yaw = s[4]; r.state = ['plane', 'fall', 'chute', 'ground'][s[7]] || 'ground'; }
      const wid = s ? s[8] : (r.weapons[0] && r.weapons[0].id), g = s ? (s[9] || []) : null;
      b.pos.copy(r.pos); b.yaw = r.yaw; b.state = r.state === 'plane' ? 'fall' : r.state; b.hp = r.hp; b.alive = r.alive;
      if (wid && LS.WEAPONS[wid]) { b.weapons[0] = { id: wid, mag: LS.WEAPONS[wid].mag }; b.ammo[LS.WEAPONS[wid].ammo] = 60; b.model.setGun(wid); }
      if (g) { b.vest = { level: g[0] | 0, dur: g[1] || 0 }; b.helmet = { level: g[2] | 0, dur: g[3] || 0 }; b.bag = g[4] | 0; }
      else { b.vest = Object.assign({}, r.vest); b.helmet = Object.assign({}, r.helmet); b.bag = r.bag; }
      b.model.setGear(b.vest.level, b.helmet.level, b.bag);
      b.model.root.visible = r.alive; G.scene.add(b.model.root);
      if (r.model.root.parent) r.model.root.parent.remove(r.model.root);
      const i = G.fighters.indexOf(r); if (i >= 0) G.fighters[i] = b;
      this.remotes.splice(this.remotes.indexOf(r), 1);
      b.netId = r.netId; this.ents[r.netId] = b; G.bots.push(b);
    }
  },
  // acerto feito por algo controlado aqui: o servidor confere e calcula o dano
  reportHit(attacker, victim, head, weaponName) {
    if (!victim.netId) return;
    const w = weaponName === 'Soco' ? 'punch' : attacker.weapon() && attacker.weapon().id;
    if (!w) return;
    this.send({ t: 'hit', a: attacker.netId, v: victim.netId, h: head ? 1 : 0, w });
  },
};

// ---------- ganchos no combate (só mudam alguma coisa durante uma partida online) ----------
(function () {
  const takeDamage = LS.Fighter.prototype.takeDamage;
  LS.Fighter.prototype.takeDamage = function (amount, attacker, head, weaponName, ignoreArmor) {
    const N = LS.Net;
    if (!N.online || this._netApply) return takeDamage.apply(this, arguments);
    if (!this.alive) return 0;
    if (!attacker) { if (N.owns(this)) N.send({ t: 'env', v: this.netId, d: amount, k: weaponName }); return 0; } // zona, queda
    if (N.owns(attacker)) N.reportHit(attacker, this, head, weaponName);
    return 0; // o número de dano aparece quando o servidor confirmar
  };
  const tryPunch = LS.Fighter.prototype.tryPunch;
  LS.Fighter.prototype.tryPunch = function () {
    if (LS.Net.online && LS.Net.owns(this) && !this.weapon() && !(this.fireCd > 0) && this.state === 'ground' && this.alive) LS.Net.send({ t: 'fire', i: this.netId, w: 'punch' });
    return tryPunch.apply(this, arguments);
  };
  const updateTimers = LS.Fighter.prototype.updateTimers;
  LS.Fighter.prototype.updateTimers = function (dt) {
    const healing = this.healType, hp0 = this.hp;
    updateTimers.call(this, dt);
    if (LS.Net.online && healing && !this.healType && this.hp > hp0 && LS.Net.owns(this)) LS.Net.send({ t: 'heal', v: this.netId, n: this.hp - hp0 });
  };
})();
