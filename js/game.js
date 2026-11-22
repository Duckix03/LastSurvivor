// Núcleo do jogo: renderização, partida, eventos e loop principal
'use strict';
LS.Game = {
  state: 'menu', // menu | loading | playing | paused | victory (comemoração) | ended
  mode: 'br', frozen: false, // mode: 'br' (battle royale) | 'duel'; frozen: ninguém anda nem atira (contagem do duelo)
  time: 0, fighters: [], bots: [], botDamageMul: 0.55, built: false, inventoryOpen: false,

  init() {
    const q = LS.settings.quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: q !== 'low', powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-container').appendChild(this.renderer.domElement);
    LS.Post.init(this.renderer); // oclusão de ambiente, contorno, vinheta e anti-serrilhado
    this.applyColors();
    this.scene = new THREE.Scene();
    // near 0.25 (era 0.1): 2,5x mais precisão de profundidade de longe, menos pisca-pisca em paredes e telhados.
    // logarithmicDepthBuffer foi avaliado e ficou desligado: anula o polygonOffset (marcas de bala, vidro) e custa desempenho.
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.25, 1000);
    LS.Input.init(this.renderer.domElement);
    LS.Input.onUnlock = () => { if (this.state === 'playing' && !this.inventoryOpen && !LS.Console.open && !LS.Duel.shopOpen && !LS.Spectate.active && !(this.mode === 'custom' && (LS.Custom.shopOpen || !['count', 'fight', 'end'].includes(LS.Custom.phase)))) this.pause(); };
    LS.HUD.init();
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    window.addEventListener('keydown', e => this.onKey(e));
    this.clock = new THREE.Clock();
    this.fpsAcc = 0; this.fpsFrames = 0;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  },

  // gera o mundo uma única vez (em etapas, para a barra de progresso)
  build(onDone) {
    if (this.built) { onDone(); return; }
    const fill = document.getElementById('loading-fill');
    const steps = [
      () => LS.World.buildTerrain(this.scene),
      () => LS.World.buildSky(this.scene),
      () => LS.World.buildProps(this.scene),
      () => { LS.Effects.init(this.scene); LS.Loot.init(this.scene); LS.Icons.preload(); LS.HUD.setMapImage(LS.World.buildMapImage(512)); },
      () => {
        this.zone = new LS.Zone(this.scene); this.plane = new LS.Plane(this.scene);
        this.player = new LS.Player(); this.scene.add(this.player.model.root);
        const names = LS.BOT_NAMES.slice().sort(() => Math.random() - 0.5);
        for (let i = 0; i < LS.BOT_COUNT; i++) { const b = new LS.Bot(names[i % names.length]); this.bots.push(b); this.scene.add(b.model.root); }
        this.botPool = this.bots.slice(); this.remotePlayers = [];
        this.fighters = [this.player].concat(this.bots);
      }
    ];
    let i = 0;
    const rng = LS.util.seeded(LS.MAP_SEED); // mesma ilha em todos os computadores (o online precisa)
    const next = () => {
      LS.util.withSeed(rng, steps[i]); i++;
      fill.style.width = (i / steps.length * 100) + '%';
      if (i < steps.length) setTimeout(next, 30);
      else { this.built = true; this.applySettings(); setTimeout(onDone, 150); }
    };
    setTimeout(next, 50);
  },

  // compila todos os shaders ANTES da partida: senão cada coisa que aparece pela 1ª vez
  // (personagens, itens, efeitos) trava o jogo por um instante enquanto a placa compila
  precompile() {
    const hidden = [];
    this.scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { this.renderer.compile(this.scene, this.camera); } catch (e) { console.warn(e); }
    hidden.forEach(o => { o.visible = false; });
  },

  startMatch() {
    LS.Audio.init();
    LS.UI.showScreen('loading');
    document.getElementById('loading-fill').style.width = this.built ? '100%' : '0%';
    this.build(() => {
      LS.Duel.exit(); this.mode = 'br'; this.lastKiller = null; LS.HUD.clearShots(); LS.Victory.hide();
      LS.Net.leave(); this.zone.rng = null;
      this.bots = this.botPool.slice(); this.fighters = [this.player].concat(this.bots);
      this.bots.forEach(b => { b.netId = null; if (!b.model.root.parent) this.scene.add(b.model.root); }); this.player.netId = null;
      LS.Loot.spawnAll(); LS.Effects.clear();
      this.fighters.forEach(f => f.reset());
      this.player.name = LS.playerProfile.name; this.player.model.applyLook(LS.playerProfile.look);
      this.bots.forEach(b => b.model.applyLook(LS.Skin.randomLook()));
      this.plane.reset(); this.zone.reset();
      this.precompile();
      this.time = 0; this.endTimer = 0; this.ended = false; LS.Spectate.stop(); LS.GelWall.clear();
      const df = LS.BOT_LEVEL; this.botDamageMul = df.dmg; this.bots.forEach(b => { b.skill = LS.util.rand(df.skill[0], df.skill[1]); });
      this.player.camYaw = Math.atan2(this.plane.end.x - this.plane.start.x, this.plane.end.z - this.plane.start.z);
      document.getElementById('killfeed').innerHTML = '';
      LS.UI.showScreen(null);
      LS.HUD.show(true);
      this.setInventory(false);
      document.getElementById('bigmap').classList.add('hidden');
      this.state = 'playing';
      LS.Input.enabled = true; LS.Input.lock();
      LS.Audio.stopAll(); LS.Audio.startLoop('plane', 'plane');
      LS.HUD.centerMsg('LAST SURVIVOR', LS.Touch.active ? 'Toque no botão ⬆ para saltar do avião' : 'Pressione ESPAÇO para saltar do avião', 4);
      LS.stats.games++; LS.saveStats();
    });
  },

  // partida online: mesma ilha, loot/avião/zona pela semente do servidor; bots só no host
  startOnline(d) {
    LS.Audio.init();
    LS.UI.showScreen('loading');
    document.getElementById('loading-fill').style.width = this.built ? '100%' : '0%';
    this.build(() => {
      LS.Duel.exit(); this.mode = 'br'; this.lastKiller = null; LS.HUD.clearShots(); LS.Victory.hide();
      const N = LS.Net; N.begin(d);
      LS.util.withSeed(d.seed, () => { LS.Loot.spawnAll(); this.plane.reset(); this.zone.reset(); });
      this.zone.rng = LS.util.seeded(d.seed + 7); LS.Effects.clear();
      // tira da cena os bots que não vão jogar
      for (const b of this.botPool) { b.reset(); b.netId = null; if (b.model.root.parent) b.model.root.parent.remove(b.model.root); }
      this.player.reset(); this.player.name = LS.playerProfile.name; this.player.model.applyLook(LS.playerProfile.look);
      N.register(this.player, d.you);
      const fighters = [this.player], host = d.host === d.you;
      for (const p of d.players) if (p.pid !== d.you) {
        const r = new LS.RemoteFighter(p.name, p.look); r.reset(); r.name = p.name; this.scene.add(r.model.root); N.register(r, p.pid); fighters.push(r);
      }
      const looks = LS.util.withSeed(d.seed + 99, () => d.bots.map(() => LS.Skin.randomLook())); // bots com a mesma cara pra todos
      this.bots = [];
      const df = LS.BOT_LEVEL; this.botDamageMul = df.dmg;
      d.bots.forEach((bd, i) => {
        let b;
        if (host) { b = this.botPool[i]; b.reset(); b.skill = LS.util.rand(df.skill[0], df.skill[1]); this.bots.push(b); }
        else { b = new LS.RemoteFighter(bd.name, looks[i]); b.reset(); }
        b.name = bd.name; b.model.applyLook(looks[i]); this.scene.add(b.model.root); N.register(b, bd.id); fighters.push(b);
      });
      if (host) N.send({ t: 'diff', dmg: df.dmg });
      this.fighters = fighters;
      this.precompile();
      this.time = 0; this.endTimer = 0; this.ended = false; LS.Spectate.stop(); LS.GelWall.clear();
      this.player.camYaw = Math.atan2(this.plane.end.x - this.plane.start.x, this.plane.end.z - this.plane.start.z);
      document.getElementById('killfeed').innerHTML = '';
      LS.UI.showScreen(null); LS.HUD.show(true); this.setInventory(false);
      document.getElementById('bigmap').classList.add('hidden');
      this.state = 'playing'; LS.Input.enabled = true; LS.Input.lock();
      LS.Audio.stopAll(); LS.Audio.startLoop('plane', 'plane');
      const humans = d.players.length;
      LS.HUD.centerMsg('PARTIDA ONLINE', humans + ' jogadores + ' + d.bots.length + ' bots · ' + (LS.Touch.active ? 'toque no ⬆ pra saltar' : 'ESPAÇO para saltar'), 4);
      LS.stats.games++; LS.saveStats();
    });
  },

  // modo DUELO: 1v1 contra um bot, ou 2v2 (você + bot parceiro contra 2 bots) no galpão (offline). Regras em js/duel.js
  startDuel() {
    LS.Audio.init();
    LS.UI.showScreen('loading');
    document.getElementById('loading-fill').style.width = this.built ? '100%' : '0%';
    this.build(() => {
      LS.Net.leave(); LS.Duel.exit(); this.mode = 'duel'; this.lastKiller = null; LS.HUD.clearShots(); LS.Victory.hide(); this.zone.rng = null;
      for (const b of this.botPool) { b.reset(); b.netId = null; if (b.model.root.parent) b.model.root.parent.remove(b.model.root); }
      const size = LS.Modes.duelSize, df = LS.BOT_LEVEL, n = size * 2 - 1;
      const names = LS.BOT_NAMES.slice().sort(() => Math.random() - 0.5);
      const bots = this.botPool.slice(0, n);
      bots.forEach((b, i) => {
        b._origName = b.name; b.name = names[i];
        b.model.applyLook(LS.Skin.randomLook()); b.skill = LS.util.rand(df.skill[0], df.skill[1]);
        this.scene.add(b.model.root);
      });
      this.bots = bots; this.botDamageMul = df.dmg;
      this.player.netId = null; this.player.reset();
      this.player.name = LS.playerProfile.name; this.player.model.applyLook(LS.playerProfile.look);
      const mine = [this.player].concat(bots.slice(0, size - 1)), foes = bots.slice(size - 1);
      this.fighters = mine.concat(foes);
      LS.Loot.clear(); LS.Effects.clear();
      this.plane.active = false; this.plane.mesh.visible = false;
      this.time = 0; this.endTimer = 0; this.ended = false; LS.Spectate.stop(); LS.GelWall.clear();
      LS.Duel.enter(this.scene, mine, foes); // monta o galpão, o 1º mapa e começa o round 1
      this.precompile();
      document.getElementById('killfeed').innerHTML = '';
      LS.UI.showScreen(null); LS.HUD.show(true); this.setInventory(false);
      document.getElementById('bigmap').classList.add('hidden');
      this.state = 'playing';
      if (LS.Duel.shopOpen) { LS.Input.enabled = false; LS.Input.unlock(); } // loja do round 1 aberta: mouse solto pra clicar nas armas
      else { LS.Input.enabled = true; LS.Input.lock(); }
      LS.Audio.stopAll();
      LS.stats.games++; LS.saveStats();
    });
  },

  // SALA PERSONALIZADA (online, só amigos): ilha plana, times, rounds. Regras em js/custom.js
  startCustom(d) {
    LS.Audio.init();
    LS.UI.showScreen('loading');
    document.getElementById('loading-fill').style.width = this.built ? '100%' : '0%';
    this.build(() => {
      LS.Duel.exit(); LS.Victory.hide(); LS.HUD.clearShots(); this.mode = 'custom'; this.lastKiller = null; this.zone.rng = null;
      this.time = 0; this.endTimer = 0; this.ended = false; LS.Spectate.stop(); LS.GelWall.clear();
      LS.Custom.setup(d);
      this.precompile();
      document.getElementById('killfeed').innerHTML = '';
      LS.UI.showScreen(null); LS.HUD.show(true); this.setInventory(false);
      document.getElementById('bigmap').classList.add('hidden');
      this.state = 'playing'; this.frozen = true;
      LS.Input.enabled = false; LS.Input.unlock(); // a loja/contagem libera
      LS.Audio.stopAll();
    });
  },

  jumpFromPlane(f) {
    f.state = 'fall';
    this.plane.exitPoint(f.pos); // sai pela rampa traseira
    f.pos.x += LS.util.rand(-0.8, 0.8); f.pos.z += LS.util.rand(-0.8, 0.8);
    const dir = new THREE.Vector3().subVectors(this.plane.end, this.plane.start).normalize();
    f.vel.copy(dir).multiplyScalar(12); f.vel.y = 0;
    f.model.root.visible = true;
    if (f.isPlayer) { LS.Audio.stopLoop('plane'); LS.Audio.startLoop('wind', 'wind'); f.camPitch = -0.6; }
  },

  aliveCount() { let n = 0; for (const f of this.fighters) if (f.alive) n++; return n; },

  // ---------- Eventos ----------
  onDamage(victim, attacker, dmg, head) {
    if (!victim.isPlayer) { if (victim.onHurt) victim.onHurt(attacker); return; }
    LS.Audio.hurt();
    let ang = null;
    if (attacker) {
      const rel = LS.util.angleDiff(this.player.camYaw, Math.atan2(attacker.pos.x - victim.pos.x, attacker.pos.z - victim.pos.z));
      ang = -rel;
    }
    LS.HUD.damaged(ang);
  },
  onKill(victim, killer, weapon, head) {
    victim.placement = this.aliveCount() + 1;
    const mine = killer === this.player || victim === this.player;
    LS.HUD.killFeed(killer && killer !== victim ? killer.name : '', victim.name, weapon || '?', head, mine);
    if (this.mode === 'duel' || this.mode === 'custom') {
      if (killer === this.player && victim !== this.player) LS.Audio.kill();
      if (victim === this.player) LS.Spectate.start(killer, weapon, head); else LS.Spectate.onKill(victim, killer); // killcam também no duelo e na sala
      if (this.mode === 'custom') LS.Custom.onKill(victim, killer); else LS.Duel.onKill(victim, killer); return;
    }
    if (killer === this.player && victim !== this.player) {
      LS.Audio.kill();
      LS.HUD.centerMsg('ELIMINOU ' + victim.name.toUpperCase(), (head ? 'Tiro na cabeça! · ' : '') + this.player.kills + ' abate(s)', 1.8);
    }
    if (victim === this.player) this.lastKiller = killer && killer !== victim ? killer : null;
    if (victim === this.player) { this.pendingWin = false; LS.Spectate.start(killer, weapon, head); } // killcam + cartão + espectador (js/spectate.js)
    else if (this.player.alive && this.aliveCount() === 1) { this.endTimer = 2; this.pendingWin = true; }
    else LS.Spectate.onKill(victim, killer);
  },
  onGunshot(shooter) { LS.HUD.gunshot(shooter); // indicador na tela / minimapa de onde vem o tiro
    for (const b of this.bots) if (b !== shooter && b.alive && b.state === 'ground') b.hearShot(shooter); },
  onPlayerHit(head, killed) { LS.HUD.hit(head || killed); LS.Audio.hitmarker(head); },

  // ---------- Teclas globais ----------
  onKey(e) {
    if (LS.Console.open) return; // digitando no console
    if (this.state !== 'playing') {
      if (e.code === 'Escape' && this.state === 'paused' && !LS.UI.subPanelOpen()) this.resume();
      return;
    }
    if (e.repeat) return;
    if (LS.Duel.shopOpen) return; // loja do duelo aberta
    if (e.code === 'Tab' && this.player.alive) { this.setInventory(!this.inventoryOpen); }
    else if (e.code === 'KeyM' && this.mode === 'br') LS.HUD.toggleBigMap();
    else if (e.code === 'Escape' && this.inventoryOpen) { this.setInventory(false); this.pause(); }
  },
  setInventory(open) {
    this.inventoryOpen = open;
    document.getElementById('inventory').classList.toggle('hidden', !open);
    if (open) { LS.HUD.renderInventory(); LS.Input.unlock(); }
    else if (this.state === 'playing') LS.Input.lock();
  },
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused'; LS.Input.enabled = false; LS.Input.unlock();
    this.setInventory(false);
    LS.UI.showScreen('pause');
    if (LS.Audio.ctx) LS.Audio.ctx.suspend();
  },
  resume() {
    if (this.state !== 'paused') return;
    LS.UI.showScreen(null);
    this.state = 'playing';
    if (LS.Spectate.active) LS.Input.enabled = false; // morto: o mouse fica solto (botões do espectador)
    else { LS.Input.enabled = true; LS.Input.lock(); }
    if (LS.Audio.ctx) LS.Audio.ctx.resume();
    this.clock.getDelta();
  },
  quitToMenu() {
    if (this.mode === 'custom' && LS.Custom.inGame) { LS.Custom.quit(); return; } // sala: sai dela (sem prêmio)
    LS.Spectate.stop(); LS.Net.leave(); this.frozen = false; LS.HUD.clearShots(); LS.Victory.hide();
    this.state = 'menu'; LS.Input.enabled = false; LS.Input.unlock();
    this.setInventory(false);
    LS.HUD.show(false); LS.Audio.stopAll();
    if (LS.Audio.ctx) LS.Audio.ctx.resume();
    LS.UI.showScreen('menu-main'); LS.UI.updateMenuStats();
    if (LS.Lobby.built) { LS.Lobby.model.applyLook(LS.playerProfile.look); LS.Lobby.syncUI(); }
  },
  // fim da partida: ganhou = comemoração "LAST SURVIVOR!" antes do menu; perdeu = menu direto
  finish(win) { if (win) this.celebrate(); else this.endMatch(false); },
  celebrate() {
    if (this.state === 'victory') return;
    LS.Spectate.stop();
    this.state = 'victory'; this.victoryT = 0; this.frozen = false;
    LS.Input.enabled = false; LS.Input.unlock(); this.setInventory(false);
    LS.HUD.show(false); LS.HUD.clearShots();
    document.getElementById('bigmap').classList.add('hidden');
    const P = this.player, duel = this.mode === 'duel';
    P.running = false; P.aiming = false; P.vel.set(0, 0, 0);
    this.vicBase = P.camYaw + Math.PI + 0.35; this.vicYaw = this.vicBase; // a câmera vem pra frente do jogador (um pouco de lado)
    const sub = duel ? (LS.Duel.size > 1 ? 'SEU TIME VENCEU O 2V2' : 'VOCÊ VENCEU O DUELO') + ' · ' + LS.Duel.score[0] + ' x ' + LS.Duel.score[1]
      : 'VITÓRIA #1 · ' + P.kills + ' ABATE' + (P.kills === 1 ? '' : 'S');
    LS.Victory.show(sub, () => this.endMatch(true, true));
    LS.Audio.stopAll(); LS.Audio.victory();
  },
  // durante a comemoração: câmera girando em volta do jogador, que pula comemorando
  updateVictory(dt) {
    this.victoryT += dt;
    const P = this.player, m = P.model, t = this.victoryT;
    this.vicYaw = this.vicBase + Math.sin(t * 0.35) * 0.22; // balança de leve, sempre de frente
    let d = 4.6 - Math.min(1, t * 0.5) * 0.9; const cy = P.pos.y + 1.45;
    const head = this._vh || (this._vh = new THREE.Vector3()), dir = this._vd || (this._vd = new THREE.Vector3());
    head.set(P.pos.x, P.pos.y + 1.4, P.pos.z); dir.set(Math.sin(this.vicYaw) * d, cy - head.y, Math.cos(this.vicYaw) * d);
    const len = dir.length(); dir.divideScalar(len);
    d *= Math.max(0.35, Math.min(1, (LS.World.raycast(head, dir, len) - 0.3) / len)); // não atravessa parede
    const cx = P.pos.x + Math.sin(this.vicYaw) * d, cz = P.pos.z + Math.cos(this.vicYaw) * d;
    this.camera.position.set(cx, cy, cz); this.camera.lookAt(P.pos.x, P.pos.y + 1.0, P.pos.z);
    this.camera.fov = LS.util.lerp(this.camera.fov, 50, Math.min(1, dt * 3)); this.camera.updateProjectionMatrix();
    P.yaw += LS.util.angleDiff(P.yaw, Math.atan2(cx - P.pos.x, cz - P.pos.z)) * Math.min(1, dt * 4); // olha pra câmera
    m.root.position.set(P.pos.x, P.pos.y, P.pos.z); m.root.rotation.y = P.yaw; m.root.visible = true;
    m.animate({ dt, speed: 0, aimPitch: 0, armed: !!P.weapon(), armedAim: false, running: !!P.weapon(), idle: true });
    for (const b of this.bots) if (b.alive) b.finishFrame(dt, 0);
    LS.Effects.update(dt);
    LS.World.updateSky(this.mode === 'duel' ? 0.33 : this.time / 430, this.scene, P.pos, dt);
  },
  endMatch(win, celebrated) {
    LS.Spectate.stop(); LS.Victory.hide(); LS.HUD.clearShots();
    LS.Net.leave();
    this.state = 'ended'; LS.Input.enabled = false; LS.Input.unlock();
    this.setInventory(false);
    LS.Audio.stopAll();
    const P = this.player;
    if (win) { if (!celebrated) LS.Audio.victory(); LS.stats.wins++; } else LS.Audio.defeat();
    LS.stats.kills += P.kills; LS.saveStats();
    const t = document.getElementById('end-title'), duel = this.mode === 'duel', sc = LS.Duel.score;
    t.textContent = win ? 'VITÓRIA!' : duel ? 'DERROTA' : 'FIM DE JOGO';
    t.className = win ? 'win' : 'lose';
    document.getElementById('end-sub').textContent = duel ? (LS.Duel.size > 1 ? (win ? 'Seu time venceu o 2v2!' : 'Seu time perdeu o 2v2. Tente de novo!') : (win ? 'Você venceu o duelo contra ' : 'Você perdeu o duelo contra ') + LS.Duel.opp.name + '!')
      : win ? 'Você é o último sobrevivente da ilha!' : this.lastKiller ? 'Você foi eliminado por ' + this.lastKiller.name + '. Tente novamente!' : 'Você foi eliminado. Tente novamente!';
    const rw = LS.Menu.award(P, win);
    document.getElementById('end-xp').textContent = '+' + rw.xp + ' XP · +' + rw.coins + ' moedas' + (rw.levelUp ? ' · SUBIU PARA O NÍVEL ' + rw.level + '!' : '');
    // botão pra ver o perfil do oponente (duelo) ou de quem te eliminou (bot)
    const foe = duel ? LS.Duel.opp : (this.lastKiller && this.lastKiller instanceof LS.Bot ? this.lastKiller : null), fb = document.getElementById('end-foe');
    LS.Profile.endFoe = foe; fb.classList.toggle('hidden', !foe);
    if (foe) fb.textContent = (duel ? 'PERFIL DO OPONENTE: ' : 'PERFIL DE QUEM TE ELIMINOU: ') + foe.name.toUpperCase();
    document.getElementById('end-place').textContent = duel ? sc[0] + ' x ' + sc[1] : '#' + (win ? 1 : P.placement);
    document.getElementById('end-place-l').textContent = duel ? 'PLACAR' : 'COLOCAÇÃO · DE ' + this.fighters.length;
    LS.Spectate.countUp(document.getElementById('end-kills'), P.kills); LS.Spectate.countUp(document.getElementById('end-dmg'), Math.round(P.damageDealt));
    document.getElementById('end-time').textContent = LS.util.fmtTime(this.time);
    LS.HUD.show(false);
    LS.UI.showScreen('endscreen');
  },

  // ---------- Configurações gráficas ----------
  // filtro de cor: só na imagem 3D (a HUD fica igual), feito pela GPU, praticamente não pesa.
  // Cada filtro é um alvo (contraste, saturação, brilho, sépia, matiz); a intensidade ("vivid", 0 a 1) vai do normal até ele.
  FILTERS: {
    classico: { c: 1.15, s: 1.3,  b: 1,    sep: 0,    hue: 0 },
    vivido:   { c: 1.14, s: 1.65, b: 1.04, sep: 0,    hue: 0 },
    suave:    { c: 0.94, s: 0.88, b: 1.06, sep: 0,    hue: 0 },
    cinema:   { c: 1.22, s: 0.82, b: 0.96, sep: 0.2,  hue: 0 },
    quente:   { c: 1.06, s: 1.25, b: 1.02, sep: 0.28, hue: -6 },
    frio:     { c: 1.08, s: 1.1,  b: 1.02, sep: 0,    hue: 14 },
    nitido:   { c: 1.3,  s: 1.15, b: 1.05, sep: 0,    hue: 0 }, // mais contraste: ajuda a ver gente na sombra
    pb:       { c: 1.18, s: 0,    b: 1.02, sep: 0,    hue: 0 },
  },
  applyColors() {
    const S = LS.settings, v = S.vivid === undefined ? 0.6 : S.vivid, F = this.FILTERS[S.filter] || this.FILTERS.classico;
    const m = (a, t) => (1 + (t - 1) * v).toFixed(3);
    const f = v > 0 ? 'contrast(' + m(1, F.c) + ') saturate(' + m(1, F.s) + ') brightness(' + m(1, F.b) + ')' +
      (F.sep ? ' sepia(' + (F.sep * v).toFixed(3) + ')' : '') + (F.hue ? ' hue-rotate(' + (F.hue * v).toFixed(1) + 'deg)' : '') : '';
    this.renderer.domElement.style.filter = (f + (this.fxFilter || '')).trim(); // fxFilter: tela sem cor ao morrer
  },
  applySettings() {
    const s = LS.settings, r = this.renderer;
    const q = s.quality;
    const base = q === 'low' ? 0.75 : q === 'medium' ? 1 : Math.min(window.devicePixelRatio, 2);
    r.setPixelRatio(Math.max(0.3, base * (s.resScale || 1) * (s.perfMode ? 0.85 : 1)));
    this.applyColors();
    const shadows = q !== 'low' && !s.perfMode;
    if (this.built) {
      const sun = LS.World.sun;
      const size = q === 'high' ? 2048 : 1024;
      if (sun.shadow.mapSize.x !== size || r.shadowMap.enabled !== shadows) {
        sun.shadow.mapSize.set(size, size);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
        r.shadowMap.enabled = shadows; sun.castShadow = shadows;
        this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
      }
      const fd = LS.effDist(); this.scene.fog.far = fd; this.scene.fog.near = fd * 0.3;
    } else r.shadowMap.enabled = shadows;
    this.camera.far = LS.effDist() + 100; this.camera.updateProjectionMatrix();
    LS.Audio.setVolume(s.muted ? 0 : s.volume);
  },

  // ---------- Loop ----------
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05) * LS.Console.timeScale;
    this.lastDt = dt;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { document.getElementById('fps').textContent = Math.round(this.fpsFrames / this.fpsAcc) + ' FPS'; this.fpsAcc = 0; this.fpsFrames = 0; }
    if (this.state === 'lobby' || (this.state === 'menu' && LS.Lobby.built)) { LS.Lobby.update(dt); LS.Post.render(LS.Lobby.scene, LS.Lobby.camera); LS.Input.endFrame(); return; }
    if (!this.built) return;
    if (this.state === 'playing' || (this.state === 'paused' && LS.Net.online)) this.update(dt * LS.Spectate.timeScale()); // câmera lenta na hora da morte
    else if (this.state === 'victory') this.updateVictory(dt);
    else if (this.state === 'menu' || this.state === 'ended') { // câmera orbitando a ilha no fundo
      const t = performance.now() * 0.00005;
      this.camera.position.set(Math.cos(t) * 260, 120, Math.sin(t) * 260);
      this.camera.lookAt(0, 10, 0);
      LS.World.updateSky(0.3, this.scene, new THREE.Vector3(0, 0, 0), dt);
    }
    if (this.state !== 'menu' || this.built) LS.Post.render(this.scene, this.camera);
    LS.ESP.draw(); // comando esp (desenha só quando ligado)
    LS.Input.endFrame();
  },
  update(dt) {
    this.time += dt;
    const P = this.player;
    const duel = this.mode === 'duel', custom = this.mode === 'custom', arena = duel || custom;
    if (!arena) {
      this.plane.update(dt);
      if (!this.plane.active || this.plane.progress > 0.97) {
        for (const f of this.fighters) if (f.state === 'plane' && !f.remote) this.jumpFromPlane(f);
      }
    }
    P.update(dt, this.camera);
    for (const b of this.bots) {
      if (this.frozen && b.alive) { b.vel.set(0, 0, 0); b.running = false; b.finishFrame(dt, 0); } // contagem: parado no lugar
      else b.update(dt);
    }
    LS.Net.update(dt); // online: jogadores remotos + envio da posição
    this.zone.update((duel && !LS.Duel.fighting()) || (custom && !LS.Custom.fighting) ? 0 : dt, this.fighters); // duelo/sala: o gás só anda durante a luta
    if (duel) LS.Duel.update(dt);
    if (custom) LS.Custom.update(dt);
    const focus = P.state === 'plane' ? this.plane.mesh.position : P.pos;
    LS.Loot.update(dt, focus);
    LS.Effects.update(dt);
    LS.GelWall.updateAll(dt); // paredes de gel (brotar / balançar / estourar)
    LS.World.updateSky(arena ? 0.33 : this.time / 430, this.scene, focus, dt); // duelo e sala: sempre de dia
    // lá do alto (avião/queda) a névoa e o limite de visão acompanham a altura: senão o chão inteiro fica dentro da névoa
    const fd = LS.effDist(), ch = Math.max(0, this.camera.position.y - LS.World.heightAt(this.camera.position.x, this.camera.position.z) - 25);
    this.scene.fog.near = fd * 0.3 + ch * 1.1; this.scene.fog.far = fd + ch * 0.9;
    const cf = fd + 100 + ch; if (Math.abs(this.camera.far - cf) > 2) { this.camera.far = cf; this.camera.updateProjectionMatrix(); }
    // lá do alto (avião / queda) a sombra nem aparece e os arbustos viram pontinhos:
    // pula o passe de sombra e esconde os arbustos (sem recompilar nada)
    const high = ch > 45;
    if (high !== this._high) {
      this._high = high;
      this.renderer.shadowMap.autoUpdate = !high;
      if (!high) this.renderer.shadowMap.needsUpdate = true;
      (LS.World.bushMeshes || []).forEach(m => { m.visible = !high; });
    }
    if (this.inventoryOpen && Math.floor(this.time * 4) !== Math.floor((this.time - dt) * 4)) LS.HUD.renderInventory();
    LS.HUD.update(dt, this);
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish(this.pendingWin && P.alive);
    }
  }
};
