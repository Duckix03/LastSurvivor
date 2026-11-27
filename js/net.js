// Modo online: busca de jogadores (30 s), partida com o servidor (Cloudflare) como autoridade e
// jogadores remotos. Sem LS.NET_URL configurado, o jogo continua só contra bots.
//
// Quem é "dono" de cada personagem manda a posição dele (o próprio jogador; os bots são do "host").
// Tiros: quem atira manda o disparo e os acertos; o SERVIDOR confere e decide o dano. A vida de todos
// vem do servidor, então editar o jogo no navegador não dá vida infinita nem tira mais dano.
'use strict';

// ---------- jogador (ou bot) controlado por outro computador: só mostra o que chega pela rede ----------
const RF_STATES = ['plane', 'fall', 'chute', 'ground'];
LS.RemoteFighter = class extends LS.Fighter {
  constructor(name, look) {
    super(name, false, { look: look || undefined });
    this.remote = true; this.tgt = null; this.spd = 0;
  }
  reset() { super.reset(); this.tgt = null; this.spd = 0; this.netFlags = 0; this.seenT = 0; this.netHidden = true; this.buf = []; this.lastGear = null; this._gk = -1; }
  // o servidor só manda quem dá pra ver: quem some do pacote fica escondido (e não leva tiro "fantasma")
  // tm = relógio do servidor deste pacote: os últimos pacotes ficam num buffer e o boneco é desenhado ~100 ms no passado,
  // interpolando entre dois pacotes (movimento liso mesmo com ping oscilando)
  netTarget(s, tm) {
    if (!this.buf) this.buf = [];
    const b = this.buf, last = b[b.length - 1];
    if (!this.tgt || this.netHidden) { this.pos.set(s[1], s[2], s[3]); this.yaw = s[4]; b.length = 0; }
    else if (last && Math.hypot(s[1] - last.x, s[3] - last.z) + Math.abs(s[2] - last.y) > 12) b.length = 0; // teleporte: não interpola
    if (Array.isArray(s[9])) this.lastGear = s[9]; else if (this.lastGear) s[9] = this.lastGear; // o servidor só reenvia colete/capacete quando muda
    if (typeof tm === 'number') {
      if (s[12] > 0) tm -= s[12]; // s[12] = há quantos ms o servidor recebeu este estado: carimba com a hora REAL, não a do tick (tira o tremido de até 50 ms)
      const l = b[b.length - 1];
      if (!l || tm > l.tm) { // (pacote repetido ou fora de ordem não entra)
        // ficou parado (o cliente só manda um sinal de vida a cada ~200 ms) e voltou a mexer: segura a posição antiga até um instante
        // antes do pacote novo, senão o boneco "desliza" no começo do movimento. Só quando o salto é pequeno (parado de verdade).
        if (l && tm - l.tm > 120 && tm - l.tm < 3000 && Math.hypot(s[1] - l.x, s[3] - l.z) + Math.abs(s[2] - l.y) < 1.5) b.push({ tm: tm - 40, x: l.x, y: l.y, z: l.z, yaw: l.yaw, pitch: l.pitch });
        b.push({ tm, x: s[1], y: s[2], z: s[3], yaw: s[4], pitch: s[5] }); if (b.length > 12) b.shift();
      }
    }
    if (this.netHidden) this.netJustShown = true;
    this.tgt = s; this.seenT = performance.now(); this.netHidden = false;
  }
  // posição no instante rt (relógio do servidor): entre dois pacotes; depois do último, segue na mesma velocidade por até 150 ms
  interp(rt) {
    const b = this.buf, n = b.length, o = this._io || (this._io = {});
    if (!n) return null;
    const lerpTo = (a, c, u) => { o.x = a.x + (c.x - a.x) * u; o.y = a.y + (c.y - a.y) * u; o.z = a.z + (c.z - a.z) * u; o.yaw = a.yaw + LS.util.angleDiff(a.yaw, c.yaw) * u; o.pitch = a.pitch + (c.pitch - a.pitch) * u; return o; };
    if (rt <= b[0].tm) return lerpTo(b[0], b[0], 0);
    for (let i = n - 1; i > 0; i--) {
      const a = b[i - 1], c = b[i];
      if (a.tm <= rt && rt <= c.tm) return lerpTo(a, c, c.tm > a.tm ? (rt - a.tm) / (c.tm - a.tm) : 1);
    }
    // passou do último pacote: continua na mesma velocidade, mas com 3 travas (antes qualquer pacote "colado" no anterior dava uma velocidade
    // absurda e o boneco era lançado metros pra frente, atravessando parede):
    //  1) a velocidade vem de uma amostra com pelo menos 60 ms de distância (pacotes que chegam juntos por jitter não contam);
    //  2) a velocidade é limitada ao máximo que o personagem consegue de verdade naquele estado;
    //  3) só extrapola por até EXTRAP_MS (e a colisão do boneco, em update(), segura o resto).
    const c = b[n - 1]; let a = null;
    for (let i = n - 2; i >= 0; i--) if (c.tm - b[i].tm >= 60) { a = b[i]; break; }
    if (!a) return lerpTo(c, c, 0);
    LS.Net.exN++; // extrapolando
    const sec = (c.tm - a.tm) / 1000, over = Math.min(rt - c.tm, LS.Net.EXTRAP_MS) / 1000;
    let vx = (c.x - a.x) / sec, vz = (c.z - a.z) / sec;
    const sp = Math.hypot(vx, vz), vmax = this.state === 'ground' ? LS.Net.MAXV_GROUND : LS.Net.MAXV_AIR;
    if (sp > vmax) { vx *= vmax / sp; vz *= vmax / sp; }
    o.x = c.x + vx * over; o.y = c.y; o.z = c.z + vz * over; o.yaw = c.yaw; o.pitch = c.pitch; return o;
  }
  // desenha o boneco SEM atravessar paredes. A posição de verdade já veio válida do dono (que colide no computador dele), mas entre dois pacotes
  // o boneco anda em linha reta (e depois do último pacote, extrapolando), e uma linha reta corta quina e entra em parede.
  // Aqui ele anda do ponto onde estava até o novo em passos de 15 cm, com a mesma colisão do jogador. Se mesmo assim ficou longe do ponto
  // certo (perdeu um pedaço do caminho: lag, parede que só existe pra um dos lados), pula direto pro ponto certo em vez de ficar preso.
  collideTo(px, pz, tx, tz, y) {
    const W = LS.World, dx = tx - px, dz = tz - pz, dist = Math.hypot(dx, dz), o = this._co || (this._co = { x: 0, z: 0 });
    o.x = tx; o.z = tz;
    if (dist < 1e-3 || dist > LS.Net.COLLIDE_MAX_STEP) return o; // parado, ou salto ENORME (teleporte de verdade): não mexe
    const p = this._cp || (this._cp = new THREE.Vector3()), pv = this._cv || (this._cv = { x: 0, z: 0 }), steps = Math.min(220, Math.ceil(dist / 0.15)); // varre em fatias de 15 cm também nos saltos grandes (lag): antes passava de 6 m sem colidir
    p.set(px, y, pz); W._rockBudget = Infinity;
    for (let i = 0; i < steps; i++) { pv.x = p.x; pv.z = p.z; p.x += dx / steps; p.z += dz / steps; W.collideCircle(p, 0.38, 1.8, pv); }
    const far = Math.hypot(p.x - tx, p.z - tz);
    if (far > LS.Net.COLLIDE_SNAP) { // ficou longe do ponto de verdade. Só pula pra lá se NÃO tem parede no caminho (ou se a diferença é grande demais pra ser parede)
      const A = this._la || (this._la = new THREE.Vector3()), B = this._lb || (this._lb = new THREE.Vector3());
      A.set(p.x, y + 0.9, p.z); B.set(tx, y + 0.9, tz);
      if (far > LS.Net.COLLIDE_FAR || W.hasLOS(A, B)) return o;
    }
    o.x = p.x; o.z = p.z; return o;
  }
  update(dt) {
    const s = this.tgt; if (!s) { this.model.root.visible = false; return; }
    if (this.alive && performance.now() - this.seenT > 500) { this.netHidden = true; this.model.root.visible = false; return; } // 'hide' do servidor esconde na hora; isto é só a rede de segurança (corpo caído some pela própria animação)
    this.state = RF_STATES[s[7]] || 'ground';
    const k = 1 - Math.exp(-12 * dt), px = this.pos.x, pz = this.pos.z, N = LS.Net;
    const iv = N.tmOff !== null && this.buf && this.buf.length ? this.interp(N.srvNow() - N.interpMs - (this.netId && this.netId[0] === 'b' ? N.BOT_EXTRA_MS : 0)) : null;
    if (iv) { // interpolado entre pacotes
      let nx = iv.x, nz = iv.z;
      if (this.state === 'ground' && this.alive && N.COLLIDE_PUPPETS) { const c = this.collideTo(px, pz, nx, nz, iv.y); nx = c.x; nz = c.z; }
      this.netJustShown = false;
      this.pos.set(nx, iv.y, nz); this.yaw = iv.yaw; this.pitch = iv.pitch;
    }
    else { // sem relógio do servidor (servidor antigo): suaviza em direção ao último pacote, como antes
      const tv = (this._v || (this._v = new THREE.Vector3())).set(s[1], s[2], s[3]); // posição recebida
      if (this.pos.distanceTo(tv) > 12) this.pos.copy(tv);
      else this.pos.lerp(tv, k);
      this.yaw += LS.util.angleDiff(this.yaw, s[4]) * k; this.pitch = s[5];
    }
    this.spd = LS.util.lerp(this.spd, Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-3), 1 - Math.exp(-8 * dt));
    this.vel.set(0, s[6], 0);
    const f = this.netFlags = s[11] | 0;
    this.crouch = !!(f & 1); this.running = !!(f & 2); this.aiming = !!(f & 4); this.onGround = !(f & 8);
    // arma e equipamento que aparecem no boneco
    const wid = s[8] || null;
    if ((this.weapons[0] && this.weapons[0].id) !== wid) { this.weapons = [wid ? { id: wid, mag: 99 } : null, null]; this.slot = 0; this.model.switchGun(wid); }
    const g = s[9] || [];
    this.vest = { level: g[0] | 0, dur: g[1] || 0 }; this.helmet = { level: g[2] | 0, dur: g[3] || 0 }; this.bag = g[4] | 0;
    const gk = this.vest.level + this.helmet.level * 64 + this.bag * 4096;
    if (gk !== this._gk) { this._gk = gk; this.model.setGear(this.vest.level, this.helmet.level, this.bag); } // só quando muda (antes rodava todo quadro)
    if (this.alive) this.hp = s[10];
    this.model.root.position.copy(this.pos); this.model.root.rotation.y = this.yaw;
    this.model.root.visible = this.state !== 'plane';
    if (!this.alive) { this.model.animate({ dt, dead: true }); return; }
    this.model.animate({ dt, vy: s[6], fall: this.state === 'fall', dive: !!(f & 128), steer: 0, speed: this.spd, running: this.running, crouch: this.crouch,
      air: this.state === 'ground' && !this.onGround, chute: this.state === 'chute', aimPitch: this.pitch, armed: !!wid, armedAim: this.aiming, dead: false,
      reload: f & 16 ? 0.5 : -1, heal: f & 32 ? 'medkit' : f & 64 ? 'bandage' : null });
  }
};

// mesmo estado de antes? (posição/rotação já arredondadas, arma, colete/capacete e flags)
const rowSame = (a, b) => {
  for (let i = 1; i <= 8; i++) if (a[i] !== b[i]) return false;
  if (a[10] !== b[10]) return false;
  const g = a[9], h = b[9];
  for (let i = 0; i < 5; i++) if (g[i] !== h[i]) return false;
  return true;
};

LS.Net = {
  online: false, ws: null, you: null, host: null, ents: {}, remotes: [], sendT: 0, findWs: null,
  SEND_HZ: 20,        // posições enviadas por segundo: igual ao tick do servidor (20 Hz). Com 15 Hz os pacotes chegavam em intervalos de 50/50/100 ms (batimento 15 x 20) e o boneco "engasgava"
  HEARTBEAT_MS: 200,  // personagem parado (mesmo estado): manda só um sinal de vida a cada tanto, em vez de 20x por segundo (economiza o limite do plano grátis)
  MAX_BUFFERED: 32768, // se o navegador já tem tanto na fila de envio (rede ruim), pula esta posição: a mais nova vale mais que a velha atrasada
  BOT_EXTRA_MS: 50,   // bots chegam a 10 Hz: precisam de um pouco mais de atraso de interpolação
  MIN_INTERP_MS: 75,  // piso do atraso adaptativo (suba pra 100 se o contador 'ex%' do canto passar de ~5%)
  exN: 0, exT: 0,     // contador: quantas vezes o desenho precisou extrapolar (passou do último pacote)
  INTERP_MS: 100,     // atraso de interpolação inicial (ms)
  interpMs: 100, jit: 0, jitN: 0, snapRx: 0, snapTm: 0, // atraso de interpolação ADAPTATIVO: segue o jitter medido dos pacotes (75 a 220 ms)
  EXTRAP_MS: 100,     // quanto tempo (no máximo) o boneco remoto pode ser extrapolado depois do último pacote (antes 150, sem limite de velocidade)
  MAXV_GROUND: 9.5,   // m/s: corrida é 7,6; folga pra jitter. Acima disso a extrapolação é cortada
  MAXV_AIR: 28,       // m/s horizontal no ar (mergulho do paraquedas é 24)
  COLLIDE_PUPPETS: true, // bonecos remotos (jogadores e bots) respeitam as paredes ao serem desenhados
  COLLIDE_MAX_STEP: 40,  // m: deslocamento maior que isso num quadro = teleporte de verdade, não varre
  COLLIDE_FAR: 8,        // m: preso atrás de parede a mais que isso do ponto de verdade: pula pro ponto de verdade (o dono é quem manda)
  COLLIDE_SNAP: 1.5,     // m: se a colisão deixar o boneco mais longe que isso do ponto de verdade, ele pula pro ponto de verdade
  // RELÓGIO DA PARTIDA: o avião, a zona (e tudo que andava com o dt do aparelho) passam a andar por um relógio único, o do servidor.
  // goTm = hora do servidor em que o 'go' foi dado; clkOff = diferença entre o performance.now() daqui e a hora do servidor (medida no pong, estilo NTP)
  goTm: null, clkOff: null, clkRtt: Infinity, clkT: 0, _goSeen: false, _ckIv: null,
  _ls: {}, _qRtt: 0, _opt: [],
  rtt: 0, tmOff: null, pingT: 0, lastRx: 0, matchId: null, matchToken: null, _reconn: false, _undo: {}, _undoKeys: [],
  srvNow() { return performance.now() - this.tmOff; }, // relógio do servidor (ms desde o começo da partida)
  // segundos desde o 'go' do servidor, pela hora do servidor: igual em todos os aparelhos, não importa FPS, aba em segundo plano ou câmera lenta.
  // null = ainda sem relógio (servidor antigo, ou os primeiros instantes): quem chama anda pelo dt local, como antes.
  matchTime() {
    if (!this.online || this.goTm === null || this.clkOff === null) return null;
    return Math.max(0, (performance.now() - this.clkOff - this.goTm) / 1000);
  },
  // amostra de relógio vinda de um pong: o servidor carimbou 'tm' mais ou menos na METADE da viagem (c + rtt/2). Vale a amostra de menor RTT (a mais confiável).
  clockSample(c, rtt, tm) {
    const off = c + rtt / 2 - tm, now = performance.now();
    if (this.clkOff !== null && rtt > this.clkRtt * 1.15 + 3 && now - this.clkT < 15000) return; // amostra pior que a que já temos: ignora (até ela ficar velha)
    if (this.clkOff === null || rtt < this.clkRtt * 0.7 || Math.abs(off - this.clkOff) > 150) this.clkOff = off; // bem melhor, ou o relógio andou muito: confia direto
    else this.clkOff += (off - this.clkOff) * 0.25;                                                              // parecida: suaviza (sem salto no avião)
    this.clkRtt = rtt; this.clkT = now;
  },
  // pings rápidos logo que a sala abre: o relógio já está acertado quando o 'go' chega (o loop do jogo ainda não está rodando e não pinga)
  startClockSync() {
    clearInterval(this._ckIv); let n = 0;
    const ping = () => { if (!this.online || !this.ws) { clearInterval(this._ckIv); return; } this.send({ t: 'ping', c: performance.now(), r: Math.round(this.rtt) }); if (++n >= 10) clearInterval(this._ckIv); };
    ping(); this._ckIv = setInterval(ping, 250);
  },
  configured() { return !!LS.NET_URL; },
  isHost() { return this.online && this.host === this.you; },
  // este computador controla esse personagem? (o próprio jogador; os bots se for o host)
  owns(f) { return !!f && !!f.netId && (f.netId === this.you || (f.netId[0] === 'b' && this.isHost() && !f.remote)); },
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); },
  wsUrl(path) { return LS.NET_URL.replace(/^http/, 'ws').replace(/\/$/, '') + path; },

  // ---------- busca de partida ----------
  // cb: { onQueue(n, left), onStart(data), onFail(motivo) } · party: { group, gsize } (a party cai junta no mesmo esquadrão)
  find(cb, party) {
    this.cancel();
    let done = false;
    const fail = why => { if (done) return; done = true; this.cancel(); cb.onFail(why); };
    let ws;
    try { ws = new WebSocket(this.wsUrl('/ws/find')); } catch (e) { fail('erro'); return; }
    this.findWs = ws;
    const to = setTimeout(() => fail('sem resposta'), 45000);
    let pt = null; // ping enquanto procura: o servidor usa pra escolher como host (dono dos bots) quem tem o menor ping
    const qping = () => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'ping', c: performance.now(), r: Math.round(this._qRtt || 0) })); };
    this._qRtt = 0;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'hello', proto: LS.NET_PROTO, ver: LS.VERSION, app: LS.IS_APP, rdy: 1, name: LS.playerProfile.name, look: LS.playerProfile.look, auth: LS.Account && LS.Account.token, group: party ? party.group : undefined, gsize: party ? party.gsize : undefined }));
      qping(); pt = setInterval(qping, 1500);
    };
    ws.onerror = () => { clearTimeout(to); clearInterval(pt); fail('erro'); };
    ws.onclose = () => { clearTimeout(to); clearInterval(pt); if (!done && !this._matching) fail('fechou'); };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'queue') cb.onQueue(m.n, m.left);
      else if (m.t === 'pong') { const r = performance.now() - m.c; if (r >= 0 && r < 10000) this._qRtt = this._qRtt ? this._qRtt * 0.6 + r * 0.4 : r; }
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
    this.matchId = m.id; this.matchToken = m.token; // guardados pra reconectar se a conexão cair no meio da partida
    this.goTm = null; this.clkOff = null; this.clkRtt = Infinity; this._goSeen = false; // relógio da partida nova (o 'go' pode chegar antes de o mapa terminar de carregar)
    const to = setTimeout(() => fail('sala não começou'), 20000);
    ws.onerror = () => { clearTimeout(to); fail('erro'); };
    ws.onclose = () => { clearTimeout(to); if (this.online) { if (ws === this.ws) this.lost(); } else fail('fechou'); };
    ws.onmessage = ev => {
      let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.t === 'start') { clearTimeout(to); ok(); this._matching = false; this.findWs = null; cb.onStart(d); }
      else this.onMsg(d);
    };
  },
  // espera o 'go' do servidor (todos os jogadores carregaram o mapa). Sem resposta em maxMs, segue sozinho (servidor antigo/rede ruim)
  waitGo(cb, maxMs) {
    let done = false;
    const fin = () => { if (done) return; done = true; clearTimeout(t); this._goCb = null; this.lastRx = performance.now(); cb(); };
    const t = setTimeout(fin, maxMs); this._goCb = fin;
    if (this._goSeen) fin(); // o 'go' chegou enquanto este aparelho ainda montava o mapa (antes ficava esperando até 30 s por um 'go' que já tinha passado)
  },
  cancel() {
    this._matching = false;
    if (this.findWs) { try { this.findWs.close(); } catch (e) { } this.findWs = null; }
    if (this.ws && !this.online) { try { this.ws.close(); } catch (e) { } this.ws = null; }
  },
  leave() {
    this._goCb = null;
    const ws = this.ws; this.online = false; this.ws = null; this._reconn = false; this.matchId = null; this.matchToken = null;
    this.tmOff = null; this.rtt = 0; this.lastRx = 0; clearInterval(this._ckIv); clearInterval(this._pingIv);
    this.goTm = null; this.clkOff = null; this.clkRtt = Infinity; this._goSeen = false;
    if (ws) { try { if (ws.readyState === 1) ws.send('{"t":"bye"}'); ws.close(); } catch (e) { } } // "bye": saída de propósito (sem tempo de espera no servidor)
    for (const r of this.remotes) if (r.model.root.parent) r.model.root.parent.remove(r.model.root);
    this.remotes = []; this.ents = {};
  },
  onDisconnect() {
    if (!this.online) return;
    this.online = false;
    const G = LS.Game;
    if (G.state === 'playing' || G.state === 'paused') LS.HUD.centerMsg('CONEXÃO PERDIDA', 'A partida online caiu', 3);
  },
  // a conexão caiu no meio da partida: tenta voltar por ~7 s (o servidor segura o personagem por 8 s)
  lost() {
    if (!this.online || this._reconn) return;
    if (!this.matchId) { this.onDisconnect(); return; } // sala personalizada: sem reconexão
    this._reconn = true;
    const t0 = performance.now();
    LS.HUD.centerMsg('RECONECTANDO...', 'a conexão caiu', 2);
    const attempt = () => {
      if (!this.online || !this._reconn) return;
      if (performance.now() - t0 > 7000) { this._reconn = false; this.onDisconnect(); return; }
      let ws; try { ws = new WebSocket(this.wsUrl('/ws/match/' + this.matchId + '?token=' + this.matchToken)); } catch (e) { setTimeout(attempt, 800); return; }
      let opened = false;
      ws.onopen = () => {
        if (!this.online || !this._reconn) { try { ws.close(); } catch (e) { } return; }
        opened = true; this.ws = ws; this._reconn = false; this.lastRx = performance.now(); this.pingT = 0; this._ls = {};
        ws.onmessage = ev => { let d; try { d = JSON.parse(ev.data); } catch (e) { return; } this.onMsg(d); };
        ws.onclose = () => { if (this.online && ws === this.ws) this.lost(); };
        LS.HUD.centerMsg('RECONECTADO', '', 1.2);
      };
      ws.onerror = () => { };
      ws.onclose = () => { if (!opened) setTimeout(attempt, 700); };
    };
    attempt();
  },

  // ---------- começo da partida ----------
  begin(d) {
    this.online = true; this.you = d.you; this.host = d.host; this.ents = {}; this.remotes = []; this.sendT = 0;
    this.tmOff = null; this.rtt = 0; this.pingT = 0; this.lastRx = performance.now(); this._reconn = false; this._undo = {}; this._undoKeys = [];
    this.interpMs = this.INTERP_MS; this.jit = 0; this.jitN = 0; this.snapRx = 0; this.snapTm = 0; this._ls = {}; this._opt = [];
    this.startClockSync(); this._dk = new Set(); this._gh = null;
    // ping a cada 2 s por TEMPORIZADOR (não pelo quadro do jogo): mede o RTT e mantém a conexão viva mesmo com a aba/app em segundo plano
    clearInterval(this._pingIv);
    this._pingIv = setInterval(() => {
      if (!this.online) { clearInterval(this._pingIv); return; }
      this.send({ t: 'ping', c: performance.now(), r: Math.round(this.rtt) });
    }, 2000);
  },
  // guarda como desfazer a coleta de um item (se o servidor disser que outro jogador chegou primeiro)
  keepUndo(id, f, d) { this._undo[id] = { f, d }; this._undoKeys.push(id); if (this._undoKeys.length > 12) delete this._undo[this._undoKeys.shift()]; },
  undoPick(id) {
    const u = this._undo[id]; if (!u) return; delete this._undo[id];
    const f = u.f, d = u.d;
    for (const t in d.ammo) if (d.ammo[t] > 0 && f.ammo[t] !== undefined) f.ammo[t] = Math.max(0, f.ammo[t] - d.ammo[t]);
    for (const t in d.meds) if (d.meds[t] > 0 && f.meds[t] !== undefined) f.meds[t] = Math.max(0, f.meds[t] - d.meds[t]);
    if (d.gel > 0) f.gel = Math.max(0, (f.gel || 0) - d.gel);
    let wchg = false;
    d.w.forEach((x, i) => { if (x) { f.weapons[i] = x.prev; wchg = true; } });
    if (wchg) { if (!f.weapons[f.slot]) f.slot = f.weapons[0] ? 0 : f.weapons[1] ? 1 : f.slot; f.reloadT = 0; f.model.switchGun(f.weapon() ? f.weapon().id : null); }
    if (d.vest) f.vest = d.vest; if (d.helmet) f.helmet = d.helmet; if (d.bag !== undefined) f.bag = d.bag;
    f.model.setGear(f.vest.level, f.helmet.level, f.bag);
    if (f === LS.Game.player) LS.HUD.toast('Outro jogador pegou esse item primeiro');
  },
  register(f, id) { f.netId = id; this.ents[id] = f; if (f.remote) this.remotes.push(f); },
  // marcador de acerto NA HORA (som + marcador na mira): o servidor ainda confere e manda o dano/número depois. Antes o feedback do tiro
  // só aparecia depois de um ping inteiro. Se o servidor recusar o tiro (não chega 'dmg'), o registro expira em 1,2 s.
  optHit(head, victim) { if (victim && victim.netGrace) return; /* alvo imune (reconectando): sem marcador de acerto à toa */ this._opt.push(performance.now()); if (this._opt.length > 12) this._opt.shift(); LS.Game.onPlayerHit(!!head, false); },
  takeOpt() { const t = performance.now(); while (this._opt.length && t - this._opt[0] > 1200) this._opt.shift(); return this._opt.length ? (this._opt.shift(), true) : false; },
  // jitter dos pacotes (como o RTCP: média do desvio entre o intervalo de chegada e o intervalo de envio do servidor).
  // Rede boa: o atraso cai pra ~75 ms (o boneco fica mais perto do tempo real); rede oscilando: sobe até 220 ms (sem engasgar).
  trackJitter(tm) {
    const now = performance.now(), gTm = tm - this.snapTm, gRx = now - this.snapRx;
    if (this.snapRx && gTm > 0 && gTm <= 150) { // intervalos longos = ninguém mudou (parado), não é jitter
      this.jit += (Math.abs(gRx - gTm) - this.jit) / 16;
      if (++this.jitN >= 20) {
        const target = Math.max(this.MIN_INTERP_MS, Math.min(220, 60 + 3.5 * this.jit));
        this.interpMs += (target - this.interpMs) * (target > this.interpMs ? 0.05 : 0.01); // sobe rápido, desce devagar
      }
    }
    this.snapRx = now; this.snapTm = tm;
  },

  // ---------- todo quadro ----------
  update(dt) {
    if (!this.online) return;
    for (const r of this.remotes) { this.exT++; r.update(dt); } // exT = quadros x remotos desenhados (base do contador)
    const nowp = performance.now();
    // (o ping agora roda num setInterval em begin(): continua com o app minimizado, em vez de depender do requestAnimationFrame)
    // nada vindo do servidor por 6 s: a conexão morreu em silêncio (comum no celular): tenta voltar
    if (this.matchId && !this._reconn && this.lastRx && nowp - this.lastRx > 5000) { const old = this.ws; this.lost(); if (old) { try { old.close(); } catch (e) { } } }
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT += 1 / this.SEND_HZ; if (this.sendT < 0) this.sendT = 0; // soma (não zera): mantém a taxa certa mesmo com FPS baixo
    if (this.ws && this.ws.bufferedAmount > this.MAX_BUFFERED) return; // rede entupida: não empilha posição velha
    const G = LS.Game, e = [], ls = this._ls, now = nowp;
    const pack = (f, pitch) => {
      const w = f.weapon(), fl = (f.crouch ? 1 : 0) | (f.running ? 2 : 0) | (f.aiming || f.fireCd > 0 || f.ai === 'fight' ? 4 : 0) | (f.state === 'ground' && !f.onGround ? 8 : 0) |
        (f.reloadT > 0 ? 16 : 0) | (f.healType === 'medkit' ? 32 : 0) | (f.healType === 'bandage' ? 64 : 0) | (f.dive || f.diving ? 128 : 0);
      const r = v => Math.round(v * 100) / 100;
      const row = [f.netId, r(f.pos.x), r(f.pos.y), r(f.pos.z), r(f.yaw), r(pitch), r(f.vel.y), { plane: 0, fall: 1, chute: 2, ground: 3 }[f.state] || 0,
        w ? w.id : null, [f.vest.level, Math.round(f.vest.dur), f.helmet.level, Math.round(f.helmet.dur), f.bag], fl];
      const old = ls[f.netId];
      if (old && now - old.t < this.HEARTBEAT_MS && rowSame(old.row, row)) return; // nada mudou: só o sinal de vida a cada HEARTBEAT_MS
      ls[f.netId] = { row, t: now };
      e.push(row);
    };
    if (G.player.alive) pack(G.player, G.player.camPitch);
    if (this.isHost()) { // bots: metade a cada envio (10 Hz cada), corta o upload do host quase pela metade; o cliente compensa com +BOT_EXTRA_MS de interpolação
      this._bk = (this._bk | 0) ^ 1;
      // a metade de cada vez é decidida pelo número do bot (fixo). Antes era pela posição na lista de vivos: quando um bot morria, os seguintes
      // trocavam de metade e alguns ficavam 150 ms sem pacote (o boneco extrapolava e engasgava)
      for (const b of G.bots) if (b.alive && b.netId && ((parseInt(b.netId.slice(1), 10) & 1) === this._bk)) pack(b, b.pitch);
    }
    if (e.length) this.send({ t: 'st', e });
    this.flushGel();
  },
  // dano em parede de gel: acumula por parede/atirador e manda junto (a escopeta acerta 9 vezes no mesmo quadro)
  gelHit(shooter, gel, dmg) {
    if (!this.online || !gel || !gel.id || !shooter || !shooter.netId || !this.owns(shooter)) return;
    const a = this._gh || (this._gh = {}), k = gel.id + '|' + shooter.netId;
    if (!a[k]) a[k] = { i: shooter.netId, w: gel.id, d: 0 };
    a[k].d += dmg;
  },
  flushGel() { const a = this._gh; if (!a) return; this._gh = null; for (const k in a) this.send({ t: 'gh', i: a[k].i, w: a[k].w, d: Math.round(a[k].d) }); },

  // ---------- eventos do servidor ----------
  onMsg(m) {
    const G = LS.Game, E = id => this.ents[id];
    this.lastRx = performance.now();
    switch (m.t) {
      case 'snap': {
        if (typeof m.tm === 'number') { const o = performance.now() - m.tm; if (this.tmOff === null || o < this.tmOff) this.tmOff = o; else this.tmOff += (o - this.tmOff) * 0.01; } // relógio do servidor (segue o pacote mais rápido)
        if (typeof m.tm === 'number') this.trackJitter(m.tm);
        for (const s of m.e) { const f = E(s[0]); if (f && f.remote) f.netTarget(s, m.tm); }
        break;
      }
      case 'pong': { const r = performance.now() - m.c; if (r >= 0 && r < 10000) { this.rtt = this.rtt ? this.rtt * 0.7 + r * 0.3 : r; if (typeof m.tm === 'number') this.clockSample(m.c, r, m.tm); } break; }
      case 'nopick': this.undoPick(m.id); break; // outro jogador pegou antes: desfaz a coleta aqui
      case 'resync': { // voltou de uma queda de conexão: acerta vida, mortes e itens que perdeu
        for (const h of m.hp || []) { const v = E(h[0]); if (v && v.alive) v.hp = h[1]; }
        for (const k of m.kills || []) this.onMsg(k);
        for (const d of m.drops || []) this.onMsg(d);   // loot das mortes que aconteceram durante a queda (o handler 'drops' ignora o que já tinha)
        for (const d of m.wd || []) this.onMsg(d);      // armas largadas por jogadores
        for (const g of m.gels || []) { const f = E(g.i); if (f && Array.isArray(g.o) && Array.isArray(g.v)) LS.GelBall.spawn(f, new THREE.Vector3(...g.o), new THREE.Vector3(...g.v), g.i + ':' + (g.n | 0), g.age || 0); } // paredes de gel que existem agora
        for (const id of m.picks || []) this.onMsg({ t: 'pick', id, by: '' });
        break;
      }
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
          if (!this.takeOpt()) G.onPlayerHit(!!m.h, v.hp <= 0); // marcador já foi mostrado na hora do tiro
          else if (v.hp <= 0) G.onPlayerHit(!!m.h, true);        // só falta o marcador de abate
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
        // quem SAIU da partida não tem dono pra contar o que deixou cair: o host dropa o que dá pra saber pelo pacote de estado (arma, colete, capacete, mochila)
        const leaver = m.w === 'Saiu' && !mine && this.isHost() && v.remote && v.netId[0] !== 'b', keep = mine || leaver;
        if (mine) this._dk.add(m.k);
        if (!keep) { v.weapons = [null, null]; for (const t in v.ammo) v.ammo[t] = 0; for (const t in v.meds) v.meds[t] = 0; v.vest = { level: 0, dur: 0 }; v.helmet = { level: 0, dur: 0 }; v.bag = 0; }
        else if (leaver) { for (const t in v.ammo) v.ammo[t] = 0; for (const t in v.meds) v.meds[t] = 0; v.gel = 0; v.weapons.forEach(w => { if (w && LS.WEAPONS[w.id]) { w.mag = LS.WEAPONS[w.id].mag; v.ammo[LS.WEAPONS[w.id].ammo] = 30; } }); this._dk.add(m.k); }
        const before = LS.Loot.items.length;
        LS.util.withSeed(m.k * 7919 + 13, () => v.die(a, m.w, !!m.h));
        v._netApply = false; v.placement = m.pl;
        if (keep) { // quem era dono do personagem (ou o host, se ele saiu) conta pros outros o que ele deixou cair
          const items = LS.Loot.items.slice(before).map(it => [it.type, it.id, it.level, it.amount, Math.round(it.pos.x * 100) / 100, Math.round(it.pos.y * 100) / 100, Math.round(it.pos.z * 100) / 100, it.ammoInMag]);
          if (items.length) this.send({ t: 'drops', k: m.k, items });
        }
        LS.Loot.idPfx = 'x'; LS.Loot.seq = 0;
        break;
      }
      case 'drops': {
        if (!this._dk) this._dk = new Set();
        if (this._dk.has(m.k)) break; this._dk.add(m.k); // (na reconexão o mesmo loot podia vir duas vezes)
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
      case 'gel': { // bola de gelo de outro jogador: mesma física (passo fixo) daqui, a parede nasce no mesmo lugar
        const f = E(m.i); if (!f || this.owns(f) || !Array.isArray(m.o) || !Array.isArray(m.v)) break;
        LS.GelBall.spawn(f, new THREE.Vector3(...m.o), new THREE.Vector3(...m.v), m.i + ':' + (m.n | 0), 0); break;
      }
      case 'gh': { const w = LS.GelWall.byId(m.w); if (w) w.hit(m.d); break; } // dano que outro jogador causou numa parede de gel
      case 'dropw': { // arma largada por outro jogador (id único): aparece no chão aqui também
        if (!LS.WEAPONS[m.w] || !Array.isArray(m.p) || LS.Loot.items.some(x => x.netId === m.id)) break;
        const it = LS.Loot.spawn('weapon', m.w, 0, 1, m.p[0], m.p[1], m.p[2], m.id); if (it && typeof m.m === 'number') it.ammoInMag = m.m; break;
      }
      case 'hide': { for (const id of m.ids || []) { const f = E(id); if (f && f.remote && f.alive) { f.netHidden = true; f.model.root.visible = false; } } break; } // saiu de vista: some na hora e não leva tiro "fantasma"
      case 'rej': this.takeOpt(); break; // o servidor recusou o tiro (parede/posição): descarta o marcador otimista
      case 'grace': { const f = E(m.v); if (f) f.netGrace = !!m.on; break; }
      case 'fix': { const f = E(m.i); if (f && this.owns(f)) { f.pos.set(m.p[0], m.p[1], m.p[2]); f.vel.set(0, 0, 0); } break; }
      case 'go': { // todos terminaram de carregar: a partida começa
        if (typeof m.tm === 'number') this.goTm = m.tm; // (servidor antigo não manda: matchTime() fica null e tudo anda pelo dt local, como antes)
        this._goSeen = true;
        const f = this._goCb; this._goCb = null; if (f) f(); break;
      }
      case 'host': { const was = this.host === this.you; this.host = m.host; if (m.host === this.you) this.takeOverBots(); else if (was) this.demoteBots(); break; }
      case 'end': {
        if (G.ended || G.state === 'ended') break;
        const P = G.player, win = m.team != null && P.team != null ? m.team === P.team : m.winner === this.you; // esquadrão: venceu o seu time (mesmo com você morto)
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
      b.reset(); b.name = r.name; b.team = r.team; b.model.applyLook(r.model.look); // mesmo esquadrão (sem fogo amigo)
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
    if (G.mode === 'br') G.markSquad(); // nome azul dos aliados vai pro boneco novo
  },
  // o servidor tirou a posse dos bots deste computador (ele estava travado/minimizado): os bots viram bonecos remotos de novo, controlados pelo novo host
  demoteBots() {
    const G = LS.Game;
    for (const b of G.bots.slice()) {
      if (!b.netId || b.remote) continue;
      const r = new LS.RemoteFighter(b.name, b.model.look);
      r.reset(); r.team = b.team; r.pos.copy(b.pos); r.yaw = b.yaw; r.alive = b.alive; r.hp = b.hp;
      r.model.root.visible = false; G.scene.add(r.model.root);
      if (b.model.root.parent) b.model.root.parent.remove(b.model.root);
      const i = G.fighters.indexOf(b); if (i >= 0) G.fighters[i] = r;
      G.bots.splice(G.bots.indexOf(b), 1);
      this.register(r, b.netId);
    }
    if (G.mode === 'br') G.markSquad();
  },
  // acerto feito por algo controlado aqui: o servidor confere e calcula o dano
  reportHit(attacker, victim, head, weaponName) {
    if (!victim.netId || victim.netGrace) return;
    const w = weaponName === 'Soco' ? 'punch' : attacker.weapon() && attacker.weapon().id;
    if (!w) return;
    // vt = o instante (relógio do servidor) em que ESTE aparelho estava desenhando o alvo: o servidor compara o tiro com a posição do alvo naquele instante
    // (compensação de lag). Alvo controlado aqui mesmo não tem atraso de interpolação: sem vt, o servidor usa a janela padrão.
    const m = { t: 'hit', a: attacker.netId, v: victim.netId, h: head ? 1 : 0, w };
    if (this.tmOff !== null && victim.remote) m.vt = Math.round(this.srvNow() - this.interpMs - (victim.netId[0] === 'b' ? this.BOT_EXTRA_MS : 0));
    this.send(m);
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
  const pickup = LS.Fighter.prototype.pickup;
  LS.Fighter.prototype.pickup = function (it, allowSwap) {
    const N = LS.Net;
    if (!N.online || !it || !it.netId || !N.owns(this)) return pickup.apply(this, arguments);
    const b = { w: this.weapons.slice(), ammo: Object.assign({}, this.ammo), meds: Object.assign({}, this.meds), gel: this.gel || 0, vest: Object.assign({}, this.vest), helmet: Object.assign({}, this.helmet), bag: this.bag };
    const r = pickup.apply(this, arguments);
    if (r && !it.alive) { // o item sumiu do chão (o servidor foi avisado): guarda o que mudou, pra desfazer se outro jogador chegou primeiro
      const d = { ammo: {}, meds: {}, gel: (this.gel || 0) - b.gel };
      for (const t in this.ammo) d.ammo[t] = this.ammo[t] - b.ammo[t];
      for (const t in this.meds) d.meds[t] = this.meds[t] - b.meds[t];
      d.w = [0, 1].map(i => (this.weapons[i] && this.weapons[i].id) !== (b.w[i] && b.w[i].id) ? { prev: b.w[i] } : null);
      d.vest = this.vest.level !== b.vest.level || this.vest.dur !== b.vest.dur ? b.vest : null;
      d.helmet = this.helmet.level !== b.helmet.level || this.helmet.dur !== b.helmet.dur ? b.helmet : null;
      d.bag = this.bag !== b.bag ? b.bag : undefined;
      N.keepUndo(it.netId, this, d);
    }
    return r;
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
