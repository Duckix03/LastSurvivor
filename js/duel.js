// Modo DUELO: 1v1 (ou 2v2 em equipes, com um bot parceiro) dentro de um galpão com contêineres.
// - 5 mapas (o mapa muda a cada round), sempre simétricos: os dois lados têm a mesma cobertura
// - cada um nasce num lado do galpão, de frente pro outro (os lados trocam a cada round)
// - gás que fecha (senão ninguém dá rush), primeiro a fazer 5 rounds vence
// - LOJA a cada 2 rounds: um escolhe as 2 armas (os dois usam), o outro assiste; na próxima loja inverte.
//   Arma escolhida fica "JÁ USADA" nas próximas lojas (10 armas, no máximo 5 lojas: todas aparecem)
// O galpão fica no mar, longe da ilha (z = -600): mesmo mundo, mesma física e mesmos tiros do battle royale.
'use strict';

// gás do duelo: mesma parede da zona do BR, mas pequena e presa dentro do galpão
LS.DuelZone = class extends LS.Zone {
  constructor(scene) {
    super(scene);
    this.phases = [
      { wait: 12, shrink: 18, r: 13, dps: 4 },
      { wait: 8, shrink: 14, r: 5, dps: 8 },
      { wait: 5, shrink: 10, r: 0, dps: 16 }
    ];
    this.msgTitle = 'O GÁS ESTÁ FECHANDO!'; this.msgSub = 'Saia do gás';
    this.wallU.color.value.set(0x8a4dff);
    this.reset();
  }
  reset() {
    const A = LS.Duel.ARENA;
    this.center = new THREE.Vector2(A.x, A.z); this.radius = 30;
    this.startC = this.center.clone(); this.startR = this.radius;
    this.phase = 0; this.shrinking = false; this.timer = this.phases[0].wait; this.dmgT = 1; this.finished = false;
    this.pickNext();
  }
  pickNext() {
    const A = LS.Duel.ARENA, ph = this.phases[Math.min(this.phase, this.phases.length - 1)];
    this.nextR = ph.r;
    const off = Math.max(0, this.radius - ph.r) * 0.35, a = Math.random() * Math.PI * 2;
    const x = LS.util.clamp(this.center.x + Math.cos(a) * off, A.x - 12, A.x + 12);
    const z = LS.util.clamp(this.center.y + Math.sin(a) * off, A.z - 7, A.z + 7);
    this.next = new THREE.Vector2(x, z);
    this.target = this.next; this.targetR = this.nextR;
  }
};

LS.Duel = {
  ARENA: { x: 0, z: -600, w: 50, d: 32, fy: 0.5, h: 10 }, // centro, largura (x), fundo (z), altura do piso, pé-direito
  WIN: 5, SPAWN_X: 21.5, TEAM_Z: 2.8, COUNTDOWN: 3, SHOP_TIME: 15, SHOP_EVERY: 2,
  CW: 6.06, CD: 2.44, CH: 2.6, // contêiner de 20 pés
  COLORS: [0xb03a2e, 0x2e6bb0, 0x3a8a3a, 0xc98a1e, 0x6a6e74, 0x2a8a8a, 0xd8d6cc, 0x7a3a8a],
  // mapas: 'center' fica no meio; 'half' é espelhado no outro lado (x,z → -x,-z), então os dois lados são iguais.
  // ['c', x, z, girado(0 = comprido em x, 1 = em z), andares, cor] · ['k', x, z, tamanho, quantas empilhadas] caixa de madeira · ['b', x, z] barril
  // x vai de -25 a 25 e z de -16 a 16; quem nasce fica em x = ±21,5, z = 0
  MAPS: [
    { name: 'Corredores',
      center: [['c', 0, 0, 0, 1, 1]],
      half: [['c', 7.5, 7, 0, 1, 0], ['c', 7.5, -7, 0, 2, 3], ['c', 14, 11, 1, 1, 2], ['k', 17.3, 0, 1.3, 1], ['k', 17.6, 1.35, 1.0, 1],
        ['b', 11, -1.6], ['b', 11.8, -2.3], ['k', 2.5, 12.5, 1.2, 2]] },
    { name: 'Cruz',
      center: [['k', 0, 0, 1.3, 2]],
      half: [['c', 0, 5.4, 1, 1, 4], ['c', 5.4, 0, 0, 1, 1], ['c', 14, 10.5, 0, 2, 0], ['c', 14, -10.5, 0, 1, 5],
        ['k', 18, 4.5, 1.2, 1], ['k', 18, -4.5, 1.2, 1], ['k', 10.5, 5.5, 1.1, 1], ['b', 8.5, -12.5], ['b', 9.3, -13.1]] },
    { name: 'Labirinto',
      center: [['c', 0, 0, 1, 1, 3]],
      half: [['c', 6, 7.5, 0, 1, 1], ['c', 6, -9, 0, 2, 0], ['c', 12, 2.5, 1, 1, 2], ['c', 16.5, -9.5, 1, 1, 6], ['c', 17.5, 12.5, 0, 1, 4],
        ['k', 18, -2.5, 1.2, 1], ['k', 7.5, 1.5, 1.1, 1], ['b', 3.5, -12.5], ['b', 4.3, -13.1]] },
    { name: 'Torres',
      center: [['k', 0, 0, 1.4, 1], ['b', 1.2, 1.1], ['b', -1.2, -1.1]],
      half: [['c', 0, 4.2, 0, 2, 1], ['c', 9, -1, 1, 1, 3], ['c', 13.5, 11, 0, 2, 2], ['c', 13.5, -11.5, 0, 1, 7],
        ['k', 17.5, 1.5, 1.2, 2], ['k', 6, 11, 1.1, 1], ['b', 18.5, -8], ['b', 19.2, -8.6], ['b', 18.6, -9.3]] },
    { name: 'Pátio',
      center: [['k', 0, 0, 1.4, 2], ['b', -1.5, 1.2], ['b', 1.5, -1.2]],
      half: [['c', 0, 11, 0, 1, 5], ['c', 10.5, 0, 1, 1, 0], ['c', 10, 10.5, 0, 2, 1], ['c', 10, -10.5, 0, 1, 3],
        ['k', 17, 4, 1.2, 1], ['k', 17, -4, 1.2, 1], ['k', 5.5, 5.5, 1.1, 1]] }
  ],

  active: false, built: false, score: [0, 0], round: 0, phase: 'off', t: 0,
  mapColliders: [], kills: 0, dmg: 0,

  fighting() { return this.active && this.phase === 'fight'; },
  totalKills() { return this.kills + (LS.Game.player ? LS.Game.player.kills : 0); },

  // ---------- entrar / sair do modo ----------
  // mine = [jogador, parceiro?], foes = [inimigo, inimigo?]
  enter(scene, mine, foes) {
    const G = LS.Game;
    this.scene = scene; this.mine = mine; this.foes = foes; this.opp = foes[0]; this.size = foes.length;
    this.all = mine.concat(foes);
    mine.forEach(f => { f.team = 'a'; }); foes.forEach(f => { f.team = 'b'; });
    if (!this.built) this.buildShell(scene);
    this.rings.forEach(r => { r.visible = r.userData.size === this.size; });
    this.group.visible = true; this.mapGroup.visible = true;
    if (!this.zone) this.zone = new LS.DuelZone(scene);
    this.brZone = this.brZone || G.zone;
    this.brZone.wall.visible = false; this.brZone.nextRing.visible = false;
    this.zone.wall.visible = true; this.hemi.intensity = 0.18;
    G.zone = this.zone;
    this.active = true; this.score = [0, 0]; this.round = 0; this.kills = 0; this.dmg = 0;
    this.loadout = null; this.used = []; this.shopN = 0;
    this.firstPicker = Math.random() < 0.5 ? 'me' : 'foe'; // quem escolhe primeiro é sorteado
    // ordem dos mapas sorteada a cada partida (os 5 aparecem antes de repetir)
    this.order = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
    document.getElementById('hud').classList.add('duel');
    document.getElementById('duel-score').classList.remove('hidden');
    const team = this.size > 1;
    document.getElementById('ds-foe').textContent = team ? 'INIMIGOS' : this.opp.name.toUpperCase();
    document.getElementById('ds-me').textContent = team ? 'SEU TIME' : (G.player.name || 'Você').toUpperCase();
    if (team) this.addAllyTag(mine[1]);
    this.startRound();
  },
  exit() {
    if (!this.active) return;
    const G = LS.Game;
    this.active = false; this.phase = 'off'; G.frozen = false;
    if (this.brZone) { G.zone = this.brZone; this.brZone.wall.visible = true; }
    if (this.zone) { this.zone.wall.visible = false; this.zone.nextRing.visible = false; }
    if (this.group) { this.group.visible = false; this.mapGroup.visible = false; this.hemi.intensity = 0; }
    (this.all || []).forEach(f => { f.team = null; if (f._origName) { f.name = f._origName; f._origName = null; } });
    if (this.allyTag && this.allyTag.parent) this.allyTag.parent.remove(this.allyTag);
    document.getElementById('hud').classList.remove('duel');
    document.getElementById('duel-score').classList.add('hidden');
    document.getElementById('duel-count').className = 'hidden';
    this.hideShop();
  },

  // ---------- rounds ----------
  startRound() {
    const G = LS.Game;
    const wasDead = LS.Spectate.active;
    if (wasDead) { LS.Spectate.stop(); LS.Input.enabled = true; } // renasceu: some a killcam/espectador
    this.round++;
    this.mapIdx = this.order[(this.round - 1) % this.order.length];
    this.buildMap(this.mapIdx);
    LS.Effects.clear(); LS.Loot.clear(); LS.GelWall.clear();
    const side = this.round % 2 ? -1 : 1, L = this.loadout || []; // lados trocam a cada round
    const zs = this.size > 1 ? [-this.TEAM_Z, this.TEAM_Z] : [0];
    this.mine.forEach((f, i) => this.spawn(f, side, L, zs[i]));
    this.foes.forEach((f, i) => this.spawn(f, -side, L, zs[i]));
    const P = G.player;
    P.camYaw = P.yaw; P.camPitch = -0.05; P.recoilX = P.recoilY = 0; P.recoilPend = { x: 0, y: 0 };
    for (const b of G.bots) { // cada bot já começa de olho no inimigo à frente dele
      const enemies = b.team === 'a' ? this.foes : this.mine, e = enemies[this.mine.indexOf(b) >= 0 ? this.mine.indexOf(b) : this.foes.indexOf(b)] || enemies[0];
      b.target = e; b.alertPos = e.pos.clone(); b.alertT = 3; b.ai = 'investigate'; b.lockT = 0;
    }
    this.zone.reset(); this.zone.update(0, []);
    G.frozen = true;
    this.renderScore();
    if (!this.loadout || (this.round - 1) % this.SHOP_EVERY === 0) this.openShop(); // loja nos rounds 1, 3, 5...
    else { this.beginCountdown(); if (wasDead) LS.Input.lock(); }
  },
  beginCountdown() {
    this.phase = 'countdown'; this.t = this.COUNTDOWN + 0.6; this.lastShown = null;
    const L = this.loadout || [];
    LS.HUD.centerMsg('ROUND ' + this.round, 'Mapa: ' + this.MAPS[this.mapIdx].name + ' · ' + L.map(id => LS.WEAPONS[id].name).join(' + ') +
      (LS.Input.locked ? '' : '<br>Clique na tela para mirar'), 2.4);
  },
  // dá as armas do round (as mesmas pros dois), com o pente cheio e 3 pentes de reserva
  equip(f, L) {
    f.weapons = [L[0] ? { id: L[0], mag: LS.WEAPONS[L[0]].mag } : null, L[1] ? { id: L[1], mag: LS.WEAPONS[L[1]].mag } : null];
    f.slot = 0; f.model.setGun(L[0] || null); f.reloadT = 0;
    f.ammo = { light: 0, rifle: 0, sniper: 0, shell: 0 };
    L.forEach(id => { const d = LS.WEAPONS[id]; f.ammo[d.ammo] += d.mag * 3; });
  },
  // coloca o lutador no lado dele, olhando pro outro, com as armas do round
  spawn(f, side, L, z) {
    const A = this.ARENA;
    f.reset();
    f.state = 'ground'; f.onGround = true; f.safeLand = true;
    f.pos.set(A.x + side * this.SPAWN_X, A.fy, A.z + (z || 0)); f.vel.set(0, 0, 0);
    f.yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2; f.pitch = 0;
    this.equip(f, L);
    f.vest = { level: 2, dur: LS.GEAR.vest.levels[2].dur }; f.helmet = { level: 2, dur: LS.GEAR.helmet.levels[2].dur }; f.bag = 1;
    f.model.setGear(2, 2, 1);
    f.meds = { medkit: 1, bandage: 3 }; f.gel = 2; // bolas de gelo: sempre 2 no começo do round
    f.model.root.visible = true; f.model.root.position.copy(f.pos); f.model.root.rotation.y = f.yaw;
  },
  onKill() {
    this.renderAlive();
    if (this.phase !== 'fight') return;
    if (this.mine.some(f => f.alive) && this.foes.some(f => f.alive)) return; // 2v2: o round só acaba quando um time inteiro cai
    this.phase = 'resolve'; this.t = 0.25; // espera um tiquinho: se os dois times caírem juntos (gás), é empate
  },
  // 2v2: morto, a câmera acompanha o parceiro vivo
  spectateTarget() {
    if (!this.active || this.size < 2) return null;
    const a = this.mine[1];
    return a && a.alive ? a : null;
  },
  // nome do parceiro em cima da cabeça (aparece até atrás da parede, pra não confundir com inimigo)
  addAllyTag(ally) {
    if (!this.allyTag) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      this.allyTagCanvas = c;
      this.allyTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
      this.allyTag.scale.set(1.6, 0.4, 1); this.allyTag.renderOrder = 20;
    }
    const g = this.allyTagCanvas.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(ally.name, 128, 24); g.fillStyle = '#2fd6ff'; g.fillText(ally.name, 128, 24);
    g.beginPath(); g.moveTo(116, 46); g.lineTo(140, 46); g.lineTo(128, 60); g.closePath(); g.fill();
    this.allyTag.material.map.needsUpdate = true;
    this.allyTag.position.set(0, 2.35, 0);
    ally.model.root.add(this.allyTag);
  },
  update(dt) {
    if (!this.active) return;
    const G = LS.Game;
    if (this.phase === 'countdown') {
      this.t -= dt;
      const n = this.t > this.COUNTDOWN ? null : Math.ceil(this.t);
      if (n !== this.lastShown && n !== null && n > 0) { this.lastShown = n; this.showCount(String(n)); LS.Audio.click(); }
      if (this.t <= 0) {
        G.frozen = false; this.phase = 'fight';
        this.showCount('LUTE!', true); LS.Audio.alert();
      }
    } else if (this.phase === 'resolve') {
      this.t -= dt;
      if (this.t <= 0) this.resolve();
    } else if (this.phase === 'shop') {
      this.updateShop(dt);
    } else if (this.phase === 'roundEnd') {
      this.t -= dt;
      if (this.t <= 0) {
        if (this.score[0] >= this.WIN || this.score[1] >= this.WIN) this.finish();
        else this.startRound();
      }
    }
  },
  resolve() {
    const G = LS.Game, P = G.player, o = this.opp;
    this.kills += P.kills; this.dmg += P.damageDealt; P.kills = 0; P.damageDealt = 0;
    const meUp = this.mine.some(f => f.alive), foeUp = this.foes.some(f => f.alive);
    let title, cls;
    if (meUp && !foeUp) { this.score[0]++; title = 'ROUND VENCIDO!'; cls = 'win'; }
    else if (!meUp && foeUp) { this.score[1]++; title = 'ROUND PERDIDO'; cls = 'lose'; }
    else { title = 'EMPATE'; cls = 'draw'; }
    const done = this.score[0] >= this.WIN || this.score[1] >= this.WIN;
    this.showCount(title, false, cls);
    const a = this.size > 1 ? 'Seu time ' : 'Você ', b = this.size > 1 ? ' Inimigos' : ' ' + o.name;
    LS.HUD.centerMsg('', a + this.score[0] + ' x ' + this.score[1] + b + (done ? '' : ' · próximo round...'), 3);
    this.phase = 'roundEnd'; this.t = done ? 2.6 : 3.4;
    this.renderScore();
  },
  finish() {
    const G = LS.Game, P = G.player, win = this.score[0] >= this.WIN;
    this.phase = 'done'; G.frozen = true;
    P.kills = this.kills; P.damageDealt = this.dmg; P.placement = win ? 1 : 2;
    document.getElementById('duel-count').className = 'hidden';
    G.finish(win); // ganhou: comemoração "LAST SURVIVOR!" antes do menu
  },

  // ---------- LOJA (a cada 2 rounds) ----------
  openShop() {
    const G = LS.Game;
    this.phase = 'shop'; this.shopOpen = true; G.frozen = true;
    this.picker = (this.shopN % 2 === 0) === (this.firstPicker === 'me') ? 'me' : 'foe'; // alterna quem escolhe
    this.shopN++;
    let avail = LS.WEAPON_IDS.filter(id => !this.used.includes(id));
    if (avail.length < 2) { this.used = []; avail = LS.WEAPON_IDS.slice(); } // (só com muitos empates) libera todas de novo
    this.avail = avail; this.picks = []; this.shopT = this.SHOP_TIME; this.shopDone = 0; this.hoverId = null;
    if (this.picker === 'foe') { this.botPlan = this.botChoose(avail); this.botT = LS.util.rand(2.2, 3.4); this.hoverT = 0; }
    G.setInventory(false);
    LS.Input.enabled = false; LS.Input.unlock(); // mouse solto pra clicar
    this.bindShop();
    const r = this.round, last = r + this.SHOP_EVERY - 1;
    document.getElementById('shop-rounds').textContent = 'ROUNDS ' + r + ' E ' + last;
    document.getElementById('duel-shop').classList.remove('hidden');
    LS.Audio.alert();
    this.renderShop();
  },
  hideShop() {
    this.shopOpen = false;
    const el = document.getElementById('duel-shop'); if (el) el.classList.add('hidden');
  },
  // bot: uma de longe/média (rifle ou sniper) + uma de perto (escopeta ou SMG), quando tem
  botChoose(avail) {
    const U = LS.util, cat = id => LS.WEAPONS[id].cat;
    const far = avail.filter(id => cat(id) === 'Rifle' || cat(id) === 'Sniper');
    const a = far.length && Math.random() < 0.85 ? U.pick(far) : U.pick(avail);
    const rest = avail.filter(id => id !== a), near = rest.filter(id => cat(id) === 'Escopeta' || cat(id) === 'SMG');
    const b = near.length && Math.random() < 0.8 ? U.pick(near) : U.pick(rest);
    return [a, b];
  },
  bindShop() {
    if (this._shopBound) return; this._shopBound = true;
    document.getElementById('shop-grid').addEventListener('click', e => {
      const c = e.target.closest('[data-wid]'); if (!c || this.picker !== 'me' || this.shopDone) return;
      const id = c.dataset.wid; if (!this.avail.includes(id)) return;
      const i = this.picks.indexOf(id);
      if (i >= 0) this.picks.splice(i, 1); else if (this.picks.length < 2) this.picks.push(id); else { this.picks[1] = id; }
      LS.Audio.init(); LS.Audio.click(); this.renderShop();
    });
    document.getElementById('shop-ok').addEventListener('click', () => {
      if (this.picker !== 'me' || this.picks.length < 2 || this.shopDone) return;
      LS.Audio.click(); this.confirmShop(true);
    });
  },
  confirmShop(byClick) {
    this.shopDone = byClick ? 0.9 : 1.6; // mostra a escolha um instante antes de fechar
    if (byClick) { LS.Input.enabled = true; LS.Input.lock(); } // o clique conta como gesto: já prende o mouse
    this.renderShop();
  },
  updateShop(dt) {
    if (this.shopDone > 0) {
      this.shopDone -= dt;
      if (this.shopDone <= 0) this.closeShop();
      return;
    }
    this.shopT -= dt;
    if (this.picker === 'me') {
      if (this.shopT <= 0) { // acabou o tempo: completa com armas aleatórias
        const rest = this.avail.filter(id => !this.picks.includes(id)).sort(() => Math.random() - 0.5);
        while (this.picks.length < 2) this.picks.push(rest.pop());
        this.confirmShop(false);
      }
    } else {
      // bot "passeando" o cursor pelas armas antes de escolher
      this.hoverT -= dt;
      if (this.hoverT <= 0) {
        this.hoverT = LS.util.rand(0.25, 0.5);
        const free = this.avail.filter(id => !this.picks.includes(id));
        this.hoverId = Math.random() < 0.45 ? this.botPlan[this.picks.length] : LS.util.pick(free);
        this.renderShop();
      }
      this.botT -= dt;
      if (this.botT <= 0) {
        this.picks.push(this.botPlan[this.picks.length]); this.hoverId = null; LS.Audio.click();
        this.botT = LS.util.rand(1.4, 2.4);
        if (this.picks.length >= 2) this.confirmShop(false);
        this.renderShop();
      }
    }
    const fill = document.getElementById('shop-timer-fill');
    if (fill) fill.style.width = Math.max(0, this.shopT / this.SHOP_TIME * 100) + '%';
  },
  closeShop() {
    const G = LS.Game;
    this.hideShop();
    this.used.push(...this.picks);
    this.loadout = this.picks.slice();
    this.all.forEach(f => this.equip(f, this.loadout));
    LS.Input.enabled = true; // se não prendeu o mouse ainda, o 1º clique na tela prende
    this.beginCountdown();
  },
  renderShop() {
    const me = this.picker === 'me', foe = this.opp.name, W = LS.WEAPONS;
    const who = document.getElementById('shop-who'), done = this.shopDone > 0;
    const names = this.picks.map(id => W[id].name).join(' + ');
    if (done) who.innerHTML = (me ? 'VOCÊ ESCOLHEU' : foe.toUpperCase() + ' ESCOLHEU') + ': <b>' + names + '</b>';
    else if (me) who.innerHTML = '<b>SUA VEZ!</b> Escolha <b>2 armas</b> pra ' + (this.size > 1 ? 'os 4 jogadores' : 'vocês dois') + ' usarem nos próximos 2 rounds';
    else who.innerHTML = '<span class="watch">ASSISTINDO</span> <b>' + foe.toUpperCase() + '</b> está escolhendo as armas...';
    who.className = 'shop-who ' + (me ? 'me' : 'foe');
    const max = { dmg: 120, rate: 13, range: 600 };
    const bar = (l, v, m) => '<div class="sw-stat"><span>' + l + '</span><i><u style="width:' + Math.round(Math.min(1, v / m) * 100) + '%"></u></i></div>';
    document.getElementById('shop-grid').innerHTML = LS.WEAPON_IDS.map(id => {
      const w = W[id], used = !this.avail.includes(id), sel = this.picks.includes(id), hov = this.hoverId === id && !sel;
      const cls = 'shop-card' + (used ? ' used' : '') + (sel ? ' sel' : '') + (hov ? ' hover' : '') + (!me || done ? ' locked' : '');
      return '<div class="' + cls + '" data-wid="' + id + '">' + (sel ? '<span class="sw-badge">' + (me ? 'VOCÊ' : foe) + '</span>' : '') + (used ? '<span class="sw-used">JÁ USADA</span>' : '') +
        '<img src="' + LS.Icons.get('weapon', id) + '" alt=""><b>' + w.name + '</b><small>' + w.cat.toUpperCase() + '</small>' +
        bar('Dano', w.dmg * w.pellets, max.dmg) + bar('Cadência', w.rate, max.rate) + bar('Alcance', w.range, max.range) + '</div>';
    }).join('');
    document.getElementById('shop-picks').innerHTML = [0, 1].map(i => {
      const id = this.picks[i];
      return '<div class="sp-slot' + (id ? ' on' : '') + '">' + (id ? '<img src="' + LS.Icons.get('weapon', id) + '" alt=""><span>' + W[id].name + '</span>' : '<span>ARMA ' + (i + 1) + '</span>') + '</div>';
    }).join('');
    const ok = document.getElementById('shop-ok');
    ok.style.display = me ? '' : 'none';
    ok.disabled = this.picks.length < 2 || done;
    ok.textContent = done ? 'PRONTO!' : 'CONFIRMAR';
  },

  // ---------- HUD ----------
  renderScore() {
    const pips = n => { let h = ''; for (let i = 0; i < this.WIN; i++) h += '<i' + (i < n ? ' class="on"' : '') + '></i>'; return h; };
    document.getElementById('ds-sme').textContent = this.score[0];
    document.getElementById('ds-sfoe').textContent = this.score[1];
    document.getElementById('ds-pips-me').innerHTML = pips(this.score[0]);
    document.getElementById('ds-pips-foe').innerHTML = pips(this.score[1]);
    document.getElementById('ds-round').textContent = this.round;
    document.getElementById('ds-map').textContent = this.MAPS[this.mapIdx].name;
    this.renderAlive();
  },
  // 2v2: bolinhas de quem ainda está vivo em cada time
  renderAlive() {
    const dots = list => this.size > 1 ? list.map(f => '<i' + (f.alive ? ' class="up"' : '') + '></i>').join('') : '';
    document.getElementById('ds-alive-me').innerHTML = dots(this.mine);
    document.getElementById('ds-alive-foe').innerHTML = dots(this.foes);
  },
  showCount(text, go, cls) {
    const el = document.getElementById('duel-count');
    el.textContent = text; el.className = ''; void el.offsetWidth;
    el.className = 'show' + (go ? ' go' : '') + (cls ? ' ' + cls : '');
  },

  // ---------- texturas (geradas por código) ----------
  canvasTex(w, h, paint, rx, ry) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    if (rx) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry || rx); }
    return t;
  },
  textures() {
    if (this.tex) return this.tex;
    const noise = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { const v = Math.random() * 255 | 0; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + a + ')'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };
    const ribs = (g, w, h, n, vertical) => { // chapa ondulada: faixas claras e escuras
      const step = (vertical ? w : h) / n;
      for (let i = 0; i < n; i++) {
        const gr = vertical ? g.createLinearGradient(i * step, 0, (i + 1) * step, 0) : g.createLinearGradient(0, i * step, 0, (i + 1) * step);
        gr.addColorStop(0, '#9a9a9a'); gr.addColorStop(0.35, '#ffffff'); gr.addColorStop(0.65, '#d8d8d8'); gr.addColorStop(1, '#7a7a7a');
        g.fillStyle = gr; if (vertical) g.fillRect(i * step, 0, step, h); else g.fillRect(0, i * step, w, step);
      }
    };
    const frame = (g, w, h, t) => { g.strokeStyle = 'rgba(30,30,30,0.75)'; g.lineWidth = t; g.strokeRect(t / 2, t / 2, w - t, h - t); };
    this.tex = {
      side: this.canvasTex(512, 128, (g, w, h) => { ribs(g, w, h, 30, true); noise(g, w, h, 900, 0.08); frame(g, w, h, 8);
        g.fillStyle = 'rgba(40,40,40,0.8)'; [[0, 0], [w - 14, 0], [0, h - 14], [w - 14, h - 14]].forEach(([x, y]) => g.fillRect(x, y, 14, 14)); }),
      door: this.canvasTex(256, 256, (g, w, h) => { ribs(g, w, h, 10, false); noise(g, w, h, 500, 0.08); frame(g, w, h, 12);
        g.fillStyle = 'rgba(30,30,30,0.7)'; g.fillRect(w / 2 - 2, 0, 4, h);
        g.strokeStyle = 'rgba(25,25,25,0.85)'; g.lineWidth = 5;
        [0.2, 0.38, 0.62, 0.8].forEach(k => { g.beginPath(); g.moveTo(w * k, 10); g.lineTo(w * k, h - 10); g.stroke(); g.fillStyle = 'rgba(25,25,25,0.9)'; g.fillRect(w * k - 7, h * 0.5 - 4, 14, 8); });
        g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = 'bold 18px sans-serif'; g.fillText('LSVU 207', 20, 40); }),
      top: this.canvasTex(512, 128, (g, w, h) => { ribs(g, w, h, 14, true); noise(g, w, h, 900, 0.1); frame(g, w, h, 6); }),
      crate: this.canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = '#c99a5a'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#b8874a' : '#d1a465'; g.fillRect(0, i * h / 5, w, h / 5 - 2); }
        noise(g, w, h, 400, 0.12);
        g.strokeStyle = '#7a5530'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
        g.beginPath(); g.moveTo(10, 10); g.lineTo(w - 10, h - 10); g.stroke(); }),
      concrete: this.canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#b5b3ad'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) { const r = 10 + Math.random() * 40, x = Math.random() * w, y = Math.random() * h, l = 150 + Math.random() * 50 | 0;
          const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(' + l + ',' + l + ',' + (l - 6) + ',0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
        noise(g, w, h, 3000, 0.1);
        g.strokeStyle = 'rgba(60,60,60,0.45)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); }, 1, 1),
      wall: this.canvasTex(128, 128, (g, w, h) => { ribs(g, w, h, 8, true); noise(g, w, h, 400, 0.08); }, 1, 1),
      roller: this.canvasTex(128, 128, (g, w, h) => { ribs(g, w, h, 12, false); noise(g, w, h, 300, 0.1); }, 1, 1),
      hazard: this.canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#f2c500'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a';
        for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + h, h); g.lineTo(i * 32 + h, h); g.fill(); } }, 1, 1),
      sign: this.canvasTex(1024, 160, (g, w, h) => {
        g.fillStyle = '#1b2a3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff8a1f'; g.fillRect(0, h - 16, w, 16);
        g.font = 'bold 66px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText('GALPÃO 7 · ZONA DE DUELO', w / 2, h / 2 - 6, w - 40); })
    };
    return this.tex;
  },
  // texturas que repetem num tamanho certo (cada parede tem o seu)
  repeatTex(t, rx, ry) { const c = t.clone(); c.needsUpdate = true; c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(rx, ry); return c; },
  lambert(opts) { return new THREE.MeshLambertMaterial(opts); },

  // ---------- galpão (feito uma vez só) ----------
  buildShell(scene) {
    this.built = true;
    const A = this.ARENA, T = this.textures(), W = LS.World;
    const g = this.group = new THREE.Group(); scene.add(g);
    this.mapGroup = new THREE.Group(); scene.add(this.mapGroup);
    const hw = A.w / 2, hd = A.d / 2, fy = A.fy, H = A.h, th = 0.6;
    const add = (geo, mat, x, y, z, opts) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      m.castShadow = !!(opts && opts.cast); m.receiveShadow = !(opts && opts.noRecv);
      g.add(m); return m;
    };
    // piso de concreto + colisor (o "chão" do galpão: a ilha nem chega aqui)
    const floor = add(new THREE.PlaneGeometry(A.w + 2 * th, A.d + 2 * th).rotateX(-Math.PI / 2), this.lambert({ color: 0x8e8c86, map: this.repeatTex(T.concrete, A.w / 4, A.d / 4) }), A.x, fy, A.z);
    floor.receiveShadow = true;
    W.addCollider(A.x - hw - 3, -8, A.z - hd - 3, A.x + hw + 3, fy, A.z + hd + 3).floor = true;
    // faixas amarelas no chão e as marcas de onde cada um nasce
    const deco = (w, d, color, x, z, map) => {
      const mat = this.lambert({ color, map: map || null, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      add(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat, x, fy + 0.006, z);
    };
    const yl = 0xe8c400;
    deco(A.w - 2, 0.18, yl, A.x, A.z - hd + 1); deco(A.w - 2, 0.18, yl, A.x, A.z + hd - 1);
    deco(0.18, A.d - 2, yl, A.x - hw + 1, A.z); deco(0.18, A.d - 2, yl, A.x + hw - 1, A.z);
    deco(0.14, A.d - 6, 0xffffff, A.x, A.z); // linha do meio
    this.rings = [];
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff8a1f, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), ringGeo = new THREE.RingGeometry(1.1, 1.35, 40).rotateX(-Math.PI / 2);
    [-1, 1].forEach(s => {
      [[0, 1], [-this.TEAM_Z, 2], [this.TEAM_Z, 2]].forEach(([z, size]) => { // marcas de onde nasce: 1 por lado (1v1) ou 2 (2v2)
        const ring = new THREE.Mesh(ringGeo, ringMat); ring.userData.size = size;
        ring.position.set(A.x + s * this.SPAWN_X, fy + 0.008, A.z + z); g.add(ring); this.rings.push(ring);
      });
      deco(2.2, 0.5, 0x1a1a1a, A.x + s * (hw - 4.5), A.z + 5, this.repeatTex(T.hazard, 4, 1));
      deco(2.2, 0.5, 0x1a1a1a, A.x + s * (hw - 4.5), A.z - 5, this.repeatTex(T.hazard, 4, 1));
    });
    // paredes de chapa (com colisor) e rodapé de concreto
    const wallMat = (len) => this.lambert({ color: 0x8c9aa8, map: this.repeatTex(T.wall, len / 1.6, H / 4) });
    const wall = (x, z, sx, sz) => {
      add(new THREE.BoxGeometry(sx, H, sz).translate(0, H / 2, 0), wallMat(Math.max(sx, sz)), x, fy, z);
      W.addCollider(x - sx / 2, fy - 1, z - sz / 2, x + sx / 2, fy + H + 2, z + sz / 2);
    };
    wall(A.x, A.z - hd - th / 2, A.w + 2 * th, th); wall(A.x, A.z + hd + th / 2, A.w + 2 * th, th);
    wall(A.x - hw - th / 2, A.z, th, A.d); wall(A.x + hw + th / 2, A.z, th, A.d);
    const skirt = this.lambert({ map: this.repeatTex(T.concrete, 8, 0.4), color: 0x9a988f });
    add(new THREE.BoxGeometry(A.w, 1.1, 0.12).translate(0, 0.55, 0), skirt, A.x, fy, A.z - hd + 0.06);
    add(new THREE.BoxGeometry(A.w, 1.1, 0.12).translate(0, 0.55, 0), skirt, A.x, fy, A.z + hd - 0.06);
    add(new THREE.BoxGeometry(0.12, 1.1, A.d).translate(0, 0.55, 0), skirt, A.x - hw + 0.06, fy, A.z);
    add(new THREE.BoxGeometry(0.12, 1.1, A.d).translate(0, 0.55, 0), skirt, A.x + hw - 0.06, fy, A.z);
    // pilares de aço amarelos nas paredes compridas
    const colMat = this.lambert({ color: 0xd9a300 });
    for (let x = -20; x <= 20; x += 10) [-1, 1].forEach(s => {
      const z = A.z + s * (hd - 0.3);
      add(new THREE.BoxGeometry(0.5, H, 0.5).translate(0, H / 2, 0), colMat, A.x + x, fy, z, { cast: true });
      W.addCollider(A.x + x - 0.25, fy, z - 0.25, A.x + x + 0.25, fy + H, z + 0.25);
    });
    // portões de enrolar atrás de cada lado (só visual) com moldura listrada
    [-1, 1].forEach(s => {
      const x = A.x + s * (hw - 0.04), rot = new THREE.MeshLambertMaterial({ color: 0xa8b0b8, map: this.repeatTex(T.roller, 1, 6) });
      const door = add(new THREE.PlaneGeometry(7, 5.5), rot, x, fy + 2.75, A.z); door.rotation.y = -s * Math.PI / 2;
      const hz = this.lambert({ map: this.repeatTex(T.hazard, 1, 6) });
      [-1, 1].forEach(k => { const p = add(new THREE.BoxGeometry(0.1, 5.8, 0.35), hz, x - s * 0.03, fy + 2.9, A.z + k * 3.65); });
      const top = add(new THREE.BoxGeometry(0.1, 0.35, 7.6), this.lambert({ map: this.repeatTex(T.hazard, 8, 1) }), x - s * 0.03, fy + 5.9, A.z);
    });
    // placa na parede do fundo
    const sign = add(new THREE.PlaneGeometry(14, 2.2), this.lambert({ map: T.sign }), A.x, fy + 6.6, A.z - hd + 0.04);
    sign.receiveShadow = false;
    const sign2 = add(new THREE.PlaneGeometry(14, 2.2), this.lambert({ map: T.sign }), A.x, fy + 6.6, A.z + hd - 0.04);
    sign2.rotation.y = Math.PI; sign2.receiveShadow = false;
    // telhado (não faz sombra: a luz do sol "entra" pelas claraboias), treliças, claraboias e luminárias
    const roof = add(new THREE.PlaneGeometry(A.w + 2 * th, A.d + 2 * th).rotateX(Math.PI / 2), this.lambert({ color: 0x4a525e, map: this.repeatTex(T.wall, A.w / 2, A.d / 2), side: THREE.DoubleSide }), A.x, fy + H, A.z, { noRecv: true });
    const truss = this.lambert({ color: 0x3a3f48 });
    for (let x = -hw + 2.5; x <= hw - 2.5; x += 5) {
      add(new THREE.BoxGeometry(0.3, 0.7, A.d), truss, A.x + x, fy + H - 0.7, A.z, { noRecv: true });
    }
    add(new THREE.BoxGeometry(A.w, 0.4, 0.3), truss, A.x, fy + H - 1.0, A.z - 6, { noRecv: true });
    add(new THREE.BoxGeometry(A.w, 0.4, 0.3), truss, A.x, fy + H - 1.0, A.z + 6, { noRecv: true });
    const sky = new THREE.MeshBasicMaterial({ color: 0xdcecff }), lamp = new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), wire = new THREE.MeshBasicMaterial({ color: 0x222222 });
    for (let x = -20; x <= 20; x += 10) {
      add(new THREE.BoxGeometry(5, 0.05, 3.5), sky, A.x + x, fy + H - 0.03, A.z, { noRecv: true });
      [-6, 6].forEach(z => {
        add(new THREE.BoxGeometry(2.4, 0.12, 0.35), lamp, A.x + x + 2.5, fy + H - 2.2, A.z + z, { noRecv: true });
        add(new THREE.BoxGeometry(0.03, 1.2, 0.03), wire, A.x + x + 1.5, fy + H - 1.6, A.z + z, { noRecv: true });
        add(new THREE.BoxGeometry(0.03, 1.2, 0.03), wire, A.x + x + 3.5, fy + H - 1.6, A.z + z, { noRecv: true });
      });
    }
    // luz de dentro do galpão (sem sombra, barata): clareia o que o telhado "escurece"
    const hemi = new THREE.HemisphereLight(0xfff4e0, 0x55524c, 0.35); hemi.position.set(A.x, fy + H, A.z);
    hemi.intensity = 0; scene.add(hemi); this.hemi = hemi; // só acende no duelo (apagar não recompila os shaders; tirar da cena recompilaria)
    // materiais dos contêineres por cor
    this.contMats = {};
    // peças escondidas com cada tipo de material: o precompile compila tudo antes (senão trava no 1º round com barril, caixa...)
    const warm = new THREE.Group(); warm.visible = false; g.add(warm);
    const box = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    this.crateMat = this.lambert({ map: T.crate });
    this.barrelMats = [this.lambert({ color: 0x2e5fa8 }), this.lambert({ color: 0xb8342a }), this.lambert({ color: 0x222222 })];
    [this.crateMat, this.barrelMats[0]].concat(this.contMat(this.COLORS[0])).forEach(m => warm.add(new THREE.Mesh(box, m)));
    warm.position.set(A.x, fy + 1, A.z);
  },
  contMat(color) {
    this.contMats = this.contMats || {}; // (os banners 3D usam antes do galpão existir)
    if (this.contMats[color]) return this.contMats[color];
    const T = this.textures(), c = new THREE.Color(color);
    const side = this.lambert({ color: c, map: T.side }), door = this.lambert({ color: c, map: T.door }), top = this.lambert({ color: c.clone().multiplyScalar(0.9), map: T.top });
    const bottom = this.lambert({ color: 0x222222 });
    return (this.contMats[color] = [door, door, top, bottom, side, side]); // +x, -x, +y, -y, +z, -z
  },

  // ---------- mapas (trocam a cada round) ----------
  clearMap() {
    const W = LS.World, set = new Set(this.mapColliders);
    if (set.size) {
      for (let i = W.boxes.length - 1; i >= 0; i--) if (set.has(W.boxes[i])) W.boxes.splice(i, 1);
      for (const [k, l] of W.grid) {
        if (!l.some(b => set.has(b))) continue;
        const f = l.filter(b => !set.has(b));
        if (f.length) W.grid.set(k, f); else W.grid.delete(k);
      }
    }
    this.mapColliders = [];
    while (this.mapGroup.children.length) {
      const m = this.mapGroup.children.pop();
      if (m.geometry && !m.geometry._shared) m.geometry.dispose();
    }
  },
  buildMap(i) {
    this.clearMap();
    const M = this.MAPS[i], items = M.center.slice();
    for (const it of M.half) { items.push(it); const m = it.slice(); m[1] = -m[1]; m[2] = -m[2]; items.push(m); } // espelho: lados iguais
    for (const it of items) {
      if (it[0] === 'c') this.addContainer(it[1], it[2], it[3], it[4], this.COLORS[(it[5] || 0) % this.COLORS.length]);
      else if (it[0] === 'k') this.addCrate(it[1], it[2], it[3], it[4]);
      else if (it[0] === 'b') this.addBarrel(it[1], it[2]);
    }
  },
  collider(minX, minY, minZ, maxX, maxY, maxZ) { this.mapColliders.push(LS.World.addCollider(minX, minY, minZ, maxX, maxY, maxZ)); },
  sharedGeo(key, make) { this._geo = this._geo || {}; if (!this._geo[key]) { this._geo[key] = make(); this._geo[key]._shared = true; } return this._geo[key]; },
  addContainer(x, z, rot, floors, color) {
    const A = this.ARENA, wx = A.x + x, wz = A.z + z, L = this.CW, D = this.CD, H = this.CH;
    const geo = this.sharedGeo('cont', () => new THREE.BoxGeometry(L, H, D).translate(0, H / 2, 0));
    for (let f = 0; f < floors; f++) {
      const col = f === 0 ? color : this.COLORS[(this.COLORS.indexOf(color) + 3) % this.COLORS.length]; // de cima com outra cor
      const m = new THREE.Mesh(geo, this.contMat(col));
      m.position.set(wx, A.fy + f * H, wz); m.rotation.y = rot ? Math.PI / 2 : 0;
      m.castShadow = true; m.receiveShadow = true; this.mapGroup.add(m);
    }
    const hx = (rot ? D : L) / 2, hz = (rot ? L : D) / 2;
    this.collider(wx - hx, A.fy, wz - hz, wx + hx, A.fy + H * floors, wz + hz);
  },
  addCrate(x, z, s, n) {
    const A = this.ARENA, wx = A.x + x, wz = A.z + z;
    const geo = this.sharedGeo('crate' + s, () => new THREE.BoxGeometry(s, s, s).translate(0, s / 2, 0));
    this.crateMat = this.crateMat || this.lambert({ map: this.textures().crate });
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(geo, this.crateMat);
      m.position.set(wx, A.fy + k * s, wz); m.rotation.y = k * 0.25; // a de cima meio torta
      m.castShadow = true; m.receiveShadow = true; this.mapGroup.add(m);
    }
    this.collider(wx - s / 2, A.fy, wz - s / 2, wx + s / 2, A.fy + s * n, wz + s / 2);
  },
  addBarrel(x, z) {
    const A = this.ARENA, wx = A.x + x, wz = A.z + z;
    const geo = this.sharedGeo('barrel', () => new THREE.CylinderGeometry(0.34, 0.34, 0.95, 14).translate(0, 0.475, 0));
    const band = this.sharedGeo('band', () => new THREE.CylinderGeometry(0.355, 0.355, 0.06, 14));
    this.barrelMats = this.barrelMats || [this.lambert({ color: 0x2e5fa8 }), this.lambert({ color: 0xb8342a }), this.lambert({ color: 0x222222 })];
    const m = new THREE.Mesh(geo, this.barrelMats[Math.abs(Math.round(x * 3 + z)) % 2]);
    m.position.set(wx, A.fy, wz); m.castShadow = true; m.receiveShadow = true; this.mapGroup.add(m);
    [0.3, 0.65].forEach(y => { const b = new THREE.Mesh(band, this.barrelMats[2]); b.position.set(wx, A.fy + y, wz); this.mapGroup.add(b); });
    this.collider(wx - 0.34, A.fy, wz - 0.34, wx + 0.34, A.fy + 0.95, wz + 0.34);
  }
};
