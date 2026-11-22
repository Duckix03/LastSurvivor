// Servidor online do Last Survivor — Cloudflare Worker + Durable Objects
//
//  /ws/find            → Matchmaker (um só no mundo): junta quem está procurando partida por até 30 s.
//                        2+ jogadores → cria uma partida; sozinho → "nomatch" (o jogo começa contra bots).
//  /ws/match/<id>      → Match (um por partida): é a AUTORIDADE da partida.
//                        Guarda a vida de todos, confere cada tiro (arma, ritmo, distância) e calcula o dano,
//                        recusa teleporte/velocidade impossível, decide quem pegou cada item, mortes e vencedor.
//                        Os bots que completam as 31 vagas rodam no navegador do "host" (um dos jogadores).
//                        Anti-wallhack: cada jogador só recebe a posição de quem ele poderia ver (vis.js).
//  /api/...            → Accounts (um só no mundo): contas com nome único, senha, curtidas e selos (accounts.js).
'use strict';
import { viewPoints, bodyPoints, canSee } from './vis.js';
import { Accounts } from './accounts.js';
export { Accounts };

// versão mínima do jogo pro online (LS.NET_PROTO em js/config.js). Navegador e app (APK) jogam juntos (crossplay),
// mas só se estiverem na mesma versão das regras. Subiu o LS.NET_PROTO? Suba aqui também e rode "npx wrangler deploy".
const MIN_PROTO = 1;
const SEARCH_MS = 30000;   // tempo procurando jogadores
const MAX_PLAYERS = 31;    // vagas da partida (jogadores + bots)
const JOIN_MS = 12000;     // tempo pra todos entrarem na sala depois do matchmaking
const TICK_MS = 1000 / 12; // envio de posições (12 por segundo)
const VIS_NEAR = 18;       // perto assim sempre aparece (passos, briga de perto)
const VIS_MAX = 650;       // longe assim nunca aparece (some na neblina de qualquer jeito)
const VIS_LINGER = 1000;   // depois de visto, continua aparecendo por 1 s (sem "piscar" na quina)
const HEAR_R = 320;        // até onde um tiro é ouvido

// tabela de armas (igual a js/config.js): o dano é calculado aqui, não no navegador
const WEAPONS = {
  m1911: { dmg: 22, rate: 4, range: 120, pellets: 1, cat: 'Pistola' },
  deagle: { dmg: 48, rate: 2, range: 150, pellets: 1, cat: 'Pistola' },
  mp5: { dmg: 17, rate: 13, range: 110, pellets: 1, cat: 'SMG' },
  ump: { dmg: 21, rate: 10, range: 120, pellets: 1, cat: 'SMG' },
  ak47: { dmg: 32, rate: 9, range: 250, pellets: 1, cat: 'Rifle' },
  m4a1: { dmg: 27, rate: 11, range: 250, pellets: 1, cat: 'Rifle' },
  awm: { dmg: 105, rate: 0.75, range: 600, pellets: 1, cat: 'Sniper' },
  kar98: { dmg: 80, rate: 1, range: 550, pellets: 1, cat: 'Sniper' },
  m1887: { dmg: 15, rate: 1.1, range: 40, pellets: 9, cat: 'Escopeta' },
  spas12: { dmg: 12, rate: 1.6, range: 35, pellets: 8, cat: 'Escopeta' },
  punch: { dmg: 12, rate: 2.2, range: 2.6, pellets: 1, cat: 'Soco' },
};
const GEAR = { vest: [0, 0.3, 0.4, 0.5], helmet: [0, 0.3, 0.4, 0.5] }; // redução de dano por nível
const BOT_NAMES = ['Viper', 'Shadow', 'Falcon', 'Ghost', 'Blaze', 'Raven', 'Storm', 'Titan', 'Nova', 'Hunter', 'Cobra', 'Wolf', 'Phantom', 'Reaper', 'Ace',
  'Tiger', 'Sniper_BR', 'Rex', 'Lince', 'Jaguar', 'Trovão', 'Fênix', 'Sombra', 'Zé_Bala', 'Kaiser', 'Onça', 'Dragão', 'Bravo', 'Raio', 'Furacão', 'Mamba', 'Orion'];

const rid = (n = 12) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); };
const cleanName = s => String(s || 'Jogador').replace(/[<>&"'`]/g, '').trim().slice(0, 16) || 'Jogador';
const send = (ws, obj) => { try { ws.send(JSON.stringify(obj)); } catch (e) { /* conexão fechada */ } };
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const cors = { 'Access-Control-Allow-Origin': '*' };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') return new Response('Last Survivor server ok', { headers: cors });
    if (url.pathname === '/ws/find') return env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global')).fetch(req);
    if (url.pathname.startsWith('/api/')) return env.ACCOUNTS.get(env.ACCOUNTS.idFromName('global')).fetch(req);
    if (url.pathname === '/room/new' || url.pathname === '/room/list') return roomRoutes(req, env, url); // salas personalizadas
    const rm = url.pathname.match(/^\/ws\/room\/(\d{7})$/);
    if (rm) return env.ROOM.get(env.ROOM.idFromName(rm[1])).fetch(req);
    const m = url.pathname.match(/^\/ws\/match\/([a-z0-9]{8,32})$/);
    if (m) return env.MATCH.get(env.MATCH.idFromName(m[1])).fetch(req);
    return new Response('not found', { status: 404, headers: cors });
  },
};

// ===================== Matchmaker: fila de 30 s =====================
export class Matchmaker {
  constructor(state, env) { this.state = state; this.env = env; this.queue = []; this.deadline = 0; this.timer = null; this.ticker = null; }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket esperado', { status: 426, headers: cors });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const p = { ws: server, name: 'Jogador', look: null, token: rid(16), ready: false };
    server.addEventListener('message', ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'hello' && !p.ready) {
        p.ready = true;
        if (num(m.proto) < MIN_PROTO) { send(server, { t: 'outdated', min: MIN_PROTO }); try { server.close(1000, 'outdated'); } catch (e) { } return; }
        p.app = !!m.app; p.look = m.look && typeof m.look === 'object' ? m.look : null;
        this.joinQueue(p, m);
      }
    });
    const drop = () => { p.gone = true; const i = this.queue.indexOf(p); if (i >= 0) { this.queue.splice(i, 1); this.broadcastQueue(); } if (!this.queue.length) this.reset(); };
    server.addEventListener('close', drop); server.addEventListener('error', drop);
    return new Response(null, { status: 101, webSocket: client });
  }
  // nome de verdade: quem tem conta joga com o nome da conta; sem conta não dá pra usar o nome de uma conta
  async joinQueue(p, m) {
    p.name = cleanName(m.name);
    try {
      const r = await this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('global')).fetch('https://accounts/internal/resolve', { method: 'POST', body: JSON.stringify({ token: m.auth, name: p.name }) });
      const d = await r.json(); if (d && d.name) { p.name = cleanName(d.name); p.accId = d.id || null; p.badges = d.badges || []; }
    } catch (e) { /* contas fora do ar: segue com o nome mandado */ }
    if (p.gone) return;
    this.queue.push(p);
    if (!this.deadline) this.armTimer();
    this.broadcastQueue();
    if (this.queue.length >= MAX_PLAYERS) this.flush();
  }
  armTimer() {
    this.deadline = Date.now() + SEARCH_MS;
    this.timer = setTimeout(() => this.flush(), SEARCH_MS);
    this.ticker = setInterval(() => this.broadcastQueue(), 1000);
  }
  reset() { clearTimeout(this.timer); clearInterval(this.ticker); this.timer = this.ticker = null; this.deadline = 0; }
  broadcastQueue() {
    const left = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
    for (const q of this.queue) send(q.ws, { t: 'queue', n: this.queue.length, left, max: MAX_PLAYERS });
  }
  async flush() {
    const group = this.queue.splice(0, MAX_PLAYERS);
    this.reset();
    if (this.queue.length) { this.armTimer(); this.broadcastQueue(); }
    if (group.length < 2) { for (const p of group) { send(p.ws, { t: 'nomatch' }); try { p.ws.close(1000, 'nomatch'); } catch (e) { } } return; }
    const id = rid(12), seed = Math.floor(Math.random() * 2 ** 31);
    const roster = group.map((p, i) => ({ token: p.token, pid: 'p' + (i + 1), name: p.name, look: p.look }));
    await this.env.MATCH.get(this.env.MATCH.idFromName(id)).fetch('https://match/init', { method: 'POST', body: JSON.stringify({ id, seed, roster }) });
    for (const p of group) { send(p.ws, { t: 'match', id, token: p.token }); try { p.ws.close(1000, 'match'); } catch (e) { } }
  }
}

// ===================== Match: a autoridade da partida =====================
export class Match {
  constructor(state, env) { this.state = state; this.env = env; this.reset(); }
  reset() {
    this.roster = null; this.ents = new Map(); this.socks = new Map(); this.started = false; this.ended = false;
    this.killSeq = 0; this.taken = new Set(); this.host = null; this.tick = null; this.joinTimer = null; this.botDmg = 0.75; this.t0 = 0;
    this.vis = new Map();
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') { this.init(await req.json()); return new Response('ok'); }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket esperado', { status: 426, headers: cors });
    const r = this.roster && this.roster.find(x => x.token === url.searchParams.get('token'));
    if (!r || this.started || this.socks.has(r.pid)) return new Response('sem vaga', { status: 403, headers: cors });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.socks.set(r.pid, server);
    server.addEventListener('message', ev => { try { this.onMsg(r.pid, JSON.parse(ev.data)); } catch (e) { /* mensagem inválida */ } });
    const gone = () => this.onLeave(r.pid);
    server.addEventListener('close', gone); server.addEventListener('error', gone);
    if (this.socks.size === this.roster.length) this.start();
    return new Response(null, { status: 101, webSocket: client });
  }

  init(d) {
    this.reset();
    this.id = d.id; this.seed = d.seed | 0; this.roster = d.roster;
    for (const r of this.roster) this.ents.set(r.pid, this.newEnt(r.pid, r.pid, r.name));
    this.joinTimer = setTimeout(() => this.start(), JOIN_MS);
  }
  newEnt(id, owner, name) { return { id, owner, name, hp: 100, alive: true, st: null, pos: null, lastT: 0, vest: [0, 0], helmet: [0, 0], weapon: null, state: 0, shots: [], envT: 0, envAcc: 0, vel: null }; }

  start() {
    if (this.started || !this.roster) return;
    clearTimeout(this.joinTimer);
    // quem não conectou fica de fora
    for (const r of this.roster) if (!this.socks.has(r.pid)) this.ents.delete(r.pid);
    const humans = this.roster.filter(r => this.socks.has(r.pid));
    if (!humans.length) { this.reset(); return; }
    this.started = true; this.t0 = Date.now();
    this.host = humans[0].pid;
    const nBots = Math.max(0, MAX_PLAYERS - humans.length), bots = [];
    // nomes dos bots embaralhados pela semente (iguais pra todos)
    let s = this.seed || 1; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const names = BOT_NAMES.slice().sort(() => rnd() - 0.5);
    for (let i = 0; i < nBots; i++) { const id = 'b' + i; this.ents.set(id, this.newEnt(id, this.host, names[i % names.length])); bots.push({ id, name: names[i % names.length] }); }
    const players = humans.map(r => ({ pid: r.pid, name: r.name, look: r.look }));
    for (const [pid, ws] of this.socks) send(ws, { t: 'start', you: pid, host: this.host, seed: this.seed, players, bots });
    this.tick = setInterval(() => this.broadcastSnap(), TICK_MS);
  }

  // cada jogador recebe só quem ele pode ver; o host recebe todos (os bots dele precisam enxergar os jogadores)
  broadcastSnap() {
    const now = Date.now(), tm = now - this.t0;
    for (const [pid, ws] of this.socks) send(ws, { t: 'snap', e: this.snapFor(pid, now, pid === this.host), tm });
  }
  snapFor(pid, now, full) {
    const me = this.ents.get(pid), e = [];
    let views = null; const getViews = () => views || (views = viewPoints(me.pos));
    for (const x of this.ents.values()) {
      if (!x.st || x.owner === pid) continue;
      if (full || (me && !me.alive) || this.visible(pid, me, x, now, getViews)) e.push(x.st); // morto (espectador) vê todo mundo
    }
    return e;
  }
  visible(pid, me, x, now, getViews) {
    if (x.state !== 3) return true;           // no avião/caindo/de paraquedas: dá pra ver no céu
    if (!me || !me.pos) return false;
    if (!x.pos) return false;
    const d = Math.hypot(x.pos[0] - me.pos[0], x.pos[1] - me.pos[1], x.pos[2] - me.pos[2]);
    if (d < VIS_NEAR) return true;
    if (d > VIS_MAX) return false;
    const key = pid + '|' + x.id;
    let c = this.vis.get(key); if (!c) this.vis.set(key, c = { next: 0, until: 0 });
    if (now >= c.next) { // confere a linha de visão ~3x por segundo por par
      c.next = now + 280 + Math.random() * 120;
      if (canSee(getViews(), bodyPoints(x.pos, x.vel))) c.until = now + VIS_LINGER;
    }
    return now < c.until;
  }
  // ouve o tiro: perto da origem, perto do caminho da bala, ou já está vendo quem atirou
  hears(pid, shooter, o, d, range) {
    if (pid === this.host) return true;
    const me = this.ents.get(pid); if (!me || !me.pos || !me.alive) return true; // espectador ouve/vê os tiros de quem assiste
    const px = me.pos[0] - o[0], py = me.pos[1] - o[1], pz = me.pos[2] - o[2];
    if (Math.hypot(px, py, pz) < HEAR_R) return true;
    const t = Math.max(0, Math.min(range * 1.6 + 4, px * d[0] + py * d[1] + pz * d[2]));
    if (Math.hypot(px - d[0] * t, py - d[1] * t, pz - d[2] * t) < 40) return true;
    const c = this.vis.get(pid + '|' + shooter.id);
    return !!c && Date.now() < c.until;
  }
  bcast(obj, exceptPid) { const msg = JSON.stringify(obj); for (const [pid, ws] of this.socks) if (pid !== exceptPid) { try { ws.send(msg); } catch (e) { } } }
  owns(pid, ent) { return ent && ent.owner === pid; }
  aliveCount() { let n = 0; for (const e of this.ents.values()) if (e.alive) n++; return n; }

  onMsg(pid, m) {
    if (!this.started || this.ended) return;
    switch (m.t) {
      case 'st': { // posições/estado dos personagens deste jogador (o próprio + bots, se for o host)
        if (!Array.isArray(m.e)) return;
        const now = Date.now();
        for (const s of m.e.slice(0, 40)) {
          if (!Array.isArray(s)) continue;
          const ent = this.ents.get(String(s[0]));
          if (!this.owns(pid, ent) || !ent.alive) continue;
          const x = num(s[1]), y = num(s[2]), z = num(s[3]), state = num(s[7]) | 0;
          // anti-teleporte / velocidade impossível (no chão ~8 m/s; no ar até ~70 m/s)
          if (ent.pos && state !== 0) {
            const dt = Math.max(0.05, (now - ent.lastT) / 1000), dh = Math.hypot(x - ent.pos[0], z - ent.pos[2]);
            const maxV = state === 3 ? 14 : 75;
            if (dh > maxV * dt + 2.5 && ent.state !== 0) { if (ent.owner === pid) send(this.socks.get(pid), { t: 'fix', i: ent.id, p: ent.pos }); continue; }
          }
          if (ent.pos && ent.lastT) { const vdt = Math.max(0.05, (now - ent.lastT) / 1000); ent.vel = [(x - ent.pos[0]) / vdt, 0, (z - ent.pos[2]) / vdt]; }
          ent.pos = [x, y, z]; ent.lastT = now; ent.state = state;
          ent.weapon = typeof s[8] === 'string' && WEAPONS[s[8]] ? s[8] : null;
          const g = Array.isArray(s[9]) ? s[9] : [];
          ent.vest = [Math.min(3, num(g[0]) | 0), num(g[1])]; ent.helmet = [Math.min(3, num(g[2]) | 0), num(g[3])];
          ent.st = [ent.id, x, y, z, num(s[4]), num(s[5]), num(s[6]), state, ent.weapon, g.slice(0, 5), Math.round(ent.hp), s[10] | 0];
        }
        break;
      }
      case 'fire': { // um disparo: guarda o "orçamento" de projéteis (pra validar os acertos) e repassa o efeito pros outros
        const ent = this.ents.get(String(m.i)), w = WEAPONS[m.w];
        if (!this.owns(pid, ent) || !ent.alive || !w || (m.w !== 'punch' && m.w !== ent.weapon)) return;
        const now = Date.now(), minGap = 1000 / w.rate * 0.7, last = ent.shots[ent.shots.length - 1];
        if (last && now - last.t < minGap) return; // mais rápido que a arma permite
        ent.shots.push({ t: now, w: m.w, left: w.pellets }); if (ent.shots.length > 6) ent.shots.shift();
        if (m.w !== 'punch') {
          const o = Array.isArray(m.o) && m.o.length === 3 ? m.o.map(v => num(v)) : (ent.pos || [0, 0, 0]);
          let d = Array.isArray(m.d) && m.d.length === 3 ? m.d.map(v => num(v)) : [0, 0, 1];
          const dl = Math.hypot(d[0], d[1], d[2]) || 1; d = d.map(v => v / dl);
          const msg = JSON.stringify({ t: 'fire', i: ent.id, o, d, w: m.w });
          for (const [rp, ws] of this.socks) if (rp !== pid && this.hears(rp, ent, o, d, w.range)) { try { ws.send(msg); } catch (e) { } }
        }
        break;
      }
      case 'hit': { // acerto informado por quem atirou: o servidor confere e calcula o dano
        const a = this.ents.get(String(m.a)), v = this.ents.get(String(m.v));
        if (!this.owns(pid, a) || !a.alive || !v || !v.alive || a === v || !a.pos || !v.pos) return;
        const now = Date.now(), shot = [...a.shots].reverse().find(s => s.left > 0 && now - s.t < 600 && s.w === m.w);
        if (!shot) return;
        const w = WEAPONS[shot.w], dist = Math.hypot(a.pos[0] - v.pos[0], a.pos[1] - v.pos[1], a.pos[2] - v.pos[2]);
        if (dist > w.range * 1.6 + 4) return;
        shot.left--;
        const head = !!m.h && shot.w !== 'punch';
        const fall = dist > w.range ? Math.max(0.25, Math.min(1, 1 - (dist - w.range) / (w.range * 0.6))) : 1;
        let dmg = w.dmg * fall * (head ? (w.cat === 'Sniper' ? 2.5 : 1.8) : 1);
        if (a.id[0] === 'b') dmg *= this.botDmg;
        this.applyDamage(v, a, dmg, head, shot.w, false);
        break;
      }
      case 'env': { // dano do ambiente (zona, queda) no próprio personagem: limitado por segundo
        const v = this.ents.get(String(m.v));
        if (!this.owns(pid, v) || !v.alive) return;
        const now = Date.now(); if (now - v.envT > 1000) { v.envT = now; v.envAcc = 0; }
        const d = Math.max(0, Math.min(num(m.d), 120 - v.envAcc)); if (d <= 0) return;
        v.envAcc += d;
        this.applyDamage(v, null, d, false, String(m.k || 'Zona').slice(0, 12), true);
        break;
      }
      case 'heal': { // cura do próprio personagem (até 100, no máximo 75 por vez)
        const v = this.ents.get(String(m.v));
        if (!this.owns(pid, v) || !v.alive) return;
        v.hp = Math.min(100, v.hp + Math.max(0, Math.min(75, num(m.n))));
        this.bcast({ t: 'hp', v: v.id, hp: Math.round(v.hp) });
        break;
      }
      case 'pick': { // item do chão: o primeiro que pegar leva
        const id = String(m.id).slice(0, 24);
        if (this.taken.has(id)) { send(this.socks.get(pid), { t: 'nopick', id }); return; }
        this.taken.add(id); this.bcast({ t: 'pick', id, by: String(m.by || '') }, pid);
        break;
      }
      case 'drops': { // o que um personagem deixou cair ao morrer (quem era dono dele manda a lista)
        if (!Array.isArray(m.items)) return;
        this.bcast({ t: 'drops', k: m.k | 0, items: m.items.slice(0, 20) }, pid);
        break;
      }
      case 'diff': if (pid === this.host) this.botDmg = Math.max(0.3, Math.min(1.2, num(m.dmg, 0.75))); break;
      case 'ping': send(this.socks.get(pid), { t: 'pong', c: m.c, tm: Date.now() - this.t0 }); break;
    }
  }

  applyDamage(v, a, dmg, head, weapon, ignoreArmor) {
    let absorbed = 0;
    if (!ignoreArmor) {
      const g = head ? v.helmet : v.vest, red = (head ? GEAR.helmet : GEAR.vest)[g[0]] || 0;
      if (g[0] > 0 && g[1] > 0) { absorbed = dmg * red; dmg -= absorbed; g[1] = Math.max(0, g[1] - absorbed * 1.5); }
    }
    v.hp -= dmg;
    this.bcast({ t: 'dmg', v: v.id, a: a ? a.id : null, d: Math.round(dmg * 10) / 10, ab: Math.round(absorbed * 10) / 10, hp: Math.max(0, Math.round(v.hp * 10) / 10), h: head ? 1 : 0, w: weapon });
    if (v.hp <= 0) this.kill(v, a, weapon, head);
  }
  kill(v, a, weapon, head) {
    if (!v.alive) return;
    v.alive = false; v.hp = 0; this.killSeq++;
    if (v.st) v.st[10] = 0;
    const left = this.aliveCount();
    this.bcast({ t: 'kill', v: v.id, a: a ? a.id : null, w: weapon, h: head ? 1 : 0, k: this.killSeq, pl: left + 1, p: v.pos });
    if (left <= 1 && !this.ended) {
      this.ended = true;
      let winner = null; for (const e of this.ents.values()) if (e.alive) winner = e.id;
      this.bcast({ t: 'end', winner });
      setTimeout(() => this.close(), 15000);
    }
  }
  onLeave(pid) {
    if (!this.socks.has(pid)) return;
    this.socks.delete(pid);
    if (!this.started) return;
    const me = this.ents.get(pid);
    if (me && me.alive && !this.ended) this.kill(me, null, 'Saiu', false);
    // o host saiu: outro jogador assume os bots
    if (pid === this.host && this.socks.size) {
      this.host = this.socks.keys().next().value;
      // o novo host recebe a posição de todo mundo antes de assumir os bots (não estavam todos no pacote dele)
      send(this.socks.get(this.host), { t: 'snap', e: this.snapFor(this.host, Date.now(), true), tm: Date.now() - this.t0 });
      for (const e of this.ents.values()) if (e.id[0] === 'b') e.owner = this.host;
      this.bcast({ t: 'host', host: this.host });
    }
    if (!this.socks.size) this.close();
  }
  close() {
    clearInterval(this.tick); clearTimeout(this.joinTimer);
    for (const ws of this.socks.values()) { try { ws.close(1000, 'fim'); } catch (e) { } }
    this.reset();
  }
}

// ===================== Salas personalizadas (só amigos) =====================
// /room/new {auth}  → cria a sala (precisa de conta) e devolve o ID de 7 números
// /room/list {auth} → salas abertas dos seus amigos
// /ws/room/<id>     → Room (uma por sala): lobby (vagas dos times + espectadores, nome, senha, rounds) e a partida.
//   Partida: times de até 10, rounds (4 a 16), loja de armas por jogador a cada 2 rounds, sem kill/moedas/XP.
//   A autoridade é a mesma do Match (vida, tiros, dano), só que sem bots e sem fogo amigo.
const RM_TEAM = 10, RM_SPEC = 10, RM_SHOP = 15, RM_COUNT = 4, RM_END = 4.5, RM_OVER = 9;
const RM_WEAPONS = Object.keys(WEAPONS).filter(w => w !== 'punch');
const jsonR = o => new Response(JSON.stringify(o), { headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
async function resolveAcc(env, token) {
  try { const r = await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('global')).fetch('https://accounts/internal/resolve', { method: 'POST', body: JSON.stringify({ token, name: 'x' }) }); return await r.json(); }
  catch (e) { return {}; }
}
export async function roomRoutes(req, env, url) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: Object.assign({ 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' }, cors) });
  const b = await req.json().catch(() => ({}));
  const acc = await resolveAcc(env, b.auth);
  if (!acc.id) return jsonR({ err: 'Entre na sua conta pra usar salas personalizadas (são só com amigos).' });
  const dir = env.ROOMDIR.get(env.ROOMDIR.idFromName('global'));
  if (url.pathname === '/room/list') return dir.fetch('https://dir/list', { method: 'POST', body: JSON.stringify({ me: acc.id, friends: acc.friends || [] }) });
  // nova sala
  const d = await (await dir.fetch('https://dir/alloc', { method: 'POST', body: JSON.stringify({ hostAcc: acc.id, hostName: acc.name }) })).json();
  await env.ROOM.get(env.ROOM.idFromName(d.id)).fetch('https://room/init', { method: 'POST', body: JSON.stringify({ id: d.id, hostAcc: acc.id, hostName: acc.name }) });
  return jsonR({ id: d.id });
}

// lista de salas abertas (pra mostrar as dos amigos)
export class RoomDir {
  constructor(state, env) { this.rooms = new Map(); }
  async fetch(req) {
    const url = new URL(req.url), b = await req.json().catch(() => ({}));
    if (url.pathname === '/alloc') {
      let id; do { id = String(1000000 + Math.floor(Math.random() * 9000000)); } while (this.rooms.has(id));
      this.rooms.set(id, { id, hostAcc: b.hostAcc, hostName: b.hostName, name: 'Sala de ' + b.hostName, n: 0, max: 4, hasPass: false, state: 'lobby', t: Date.now() });
      return jsonR({ id });
    }
    if (url.pathname === '/update') { const r = this.rooms.get(b.id); if (r) Object.assign(r, b.info || {}, { t: Date.now() }); return jsonR({ ok: true }); }
    if (url.pathname === '/remove') { this.rooms.delete(String(b.id)); return jsonR({ ok: true }); }
    if (url.pathname === '/list') {
      const f = new Set(b.friends || []); f.add(b.me);
      const now = Date.now(), out = [];
      for (const r of this.rooms.values()) {
        if (now - r.t > 3 * 60000) { this.rooms.delete(r.id); continue; } // sala sem sinal de vida
        if (f.has(r.hostAcc) && r.n > 0) out.push(r);
      }
      out.sort((x, y) => y.t - x.t);
      return jsonR({ rooms: out.slice(0, 40) });
    }
    return new Response('?', { status: 404 });
  }
}

export class Room extends Match {
  reset() {
    super.reset();
    this.members = new Map(); this.seq = 0; this.ph = 'lobby'; this.round = 0; this.score = [0, 0];
    this.cfg = this.cfg || { name: 'Sala', pass: '', size: 2, rounds: 8 };
    clearTimeout(this.phT); this.phT = null; this.endPending = false;
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') {
      const d = await req.json();
      this.cfg = { name: ('Sala de ' + cleanName(d.hostName)).slice(0, 20), pass: '', size: 2, rounds: 8 };
      this.reset();
      this.id = d.id; this.hostAcc = d.hostAcc; this.hostName = d.hostName; this.alive = true;
      clearInterval(this.beat); this.beat = setInterval(() => this.publish(), 60000);
      clearTimeout(this.idle); this.idle = setTimeout(() => { if (!this.members.size) this.closeRoom(); }, 90000);
      return new Response('ok');
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket esperado', { status: 426, headers: cors });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const m = { ws: server, pid: null, ok: false };
    server.addEventListener('message', ev => { let d; try { d = JSON.parse(ev.data); } catch (e) { return; } this.onRoomMsg(m, d); });
    const gone = () => { if (m.pid) this.leave(m.pid); };
    server.addEventListener('close', gone); server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }
  deny(m, why) { send(m.ws, { t: 'denied', why }); try { m.ws.close(1000, 'denied'); } catch (e) { } }
  async hello(m, d) {
    if (!this.alive) return this.deny(m, 'Essa sala não existe mais.');
    if (num(d.proto) < MIN_PROTO) return this.deny(m, 'Atualize o jogo pra entrar.');
    const acc = await resolveAcc(this.env, d.auth);
    if (!acc.id) return this.deny(m, 'Entre na sua conta pra jogar com amigos.');
    const isHost = acc.id === this.hostAcc;
    if (!isHost) {
      let fr = [];
      try { const r = await this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('global')).fetch('https://accounts/internal/friends', { method: 'POST', body: JSON.stringify({ id: this.hostAcc }) }); fr = (await r.json()).friends || []; } catch (e) { }
      if (!fr.includes(acc.id)) return this.deny(m, 'Só amigos de ' + this.hostName + ' podem entrar nessa sala.');
      if (this.cfg.pass && String(d.pass || '') !== this.cfg.pass) return this.deny(m, d.pass ? 'Senha errada.' : 'Essa sala tem senha.');
    }
    // a mesma conta entrou de novo: derruba a conexão antiga
    for (const o of this.members.values()) if (o.accId === acc.id) { try { o.ws.close(1000, 'outra aba'); } catch (e) { } this.leave(o.pid); }
    const free = this.freeSlot(this.ph === 'lobby');
    if (!free) return this.deny(m, 'A sala está cheia.');
    m.pid = 'u' + (++this.seq); m.ok = true; m.accId = acc.id; m.name = cleanName(acc.name); m.look = d.look && typeof d.look === 'object' ? d.look : null;
    m.badges = acc.badges || []; m.slot = free; m.joinT = Date.now(); m.picks = null;
    this.members.set(m.pid, m); this.socks.set(m.pid, m.ws);
    if (isHost || !this.owner || !this.members.has(this.owner)) this.owner = m.pid; // o criador sempre manda; sem ele, quem chegou primeiro
    send(m.ws, { t: 'welcome', you: m.pid });
    this.sendRoom();
    if (this.ph !== 'lobby') send(m.ws, this.gameMsg()), send(m.ws, this.phaseMsg());
  }
  // vaga livre: times primeiro (se pode), depois espectador
  freeSlot(team) {
    const used = new Set([...this.members.values()].map(o => o.slot.t + o.slot.i));
    if (team) for (let i = 0; i < this.cfg.size; i++) for (const t of ['a', 'b']) if (!used.has(t + i)) return { t, i };
    for (let i = 0; i < RM_SPEC; i++) if (!used.has('s' + i)) return { t: 's', i };
    return null;
  }
  roomMsg() {
    return { t: 'room', id: this.id, name: this.cfg.name, hasPass: !!this.cfg.pass, pass: null, size: this.cfg.size, rounds: this.cfg.rounds, owner: this.owner, ph: this.ph,
      members: [...this.members.values()].map(o => ({ pid: o.pid, name: o.name, look: o.look, acc: o.accId, badges: o.badges, slot: o.slot })) };
  }
  sendRoom() {
    const base = this.roomMsg();
    for (const o of this.members.values()) send(o.ws, o.pid === this.owner ? Object.assign({}, base, { pass: this.cfg.pass }) : base); // só o dono vê a senha
    this.publish();
  }
  publish() {
    if (!this.id) return;
    const info = { name: this.cfg.name, hasPass: !!this.cfg.pass, n: this.members.size, max: this.cfg.size * 2, size: this.cfg.size, rounds: this.cfg.rounds, state: this.ph === 'lobby' ? 'lobby' : 'game',
      hostName: (this.members.get(this.owner) || {}).name || this.hostName };
    const dir = this.env.ROOMDIR.get(this.env.ROOMDIR.idFromName('global'));
    this.state.waitUntil ? this.state.waitUntil(dir.fetch('https://dir/update', { method: 'POST', body: JSON.stringify({ id: this.id, info }) }).catch(() => { })) : dir.fetch('https://dir/update', { method: 'POST', body: JSON.stringify({ id: this.id, info }) }).catch(() => { });
  }
  closeRoom() {
    this.alive = false; clearInterval(this.beat); clearTimeout(this.idle); clearInterval(this.tick); clearTimeout(this.phT);
    for (const o of this.members.values()) { try { o.ws.close(1000, 'fim'); } catch (e) { } }
    this.env.ROOMDIR.get(this.env.ROOMDIR.idFromName('global')).fetch('https://dir/remove', { method: 'POST', body: JSON.stringify({ id: this.id }) }).catch(() => { });
    this.reset();
  }
  leave(pid) {
    const m = this.members.get(pid); if (!m) return;
    this.members.delete(pid); this.socks.delete(pid);
    if (this.ph !== 'lobby') {
      const e = this.ents.get(pid);
      if (e && e.alive) this.kill(e, null, 'Saiu', false);
      if (e) e.gone = true;
      // um time ficou sem ninguém conectado: o outro vence
      const left = t => [...this.ents.values()].some(x => x.team === t && !x.gone);
      if (this.ph !== 'over' && (!left('a') || !left('b'))) { if (!left('a') && left('b')) this.score[1] = Math.max(this.score[1], this.score[0] + 1); else if (left('a')) this.score[0] = Math.max(this.score[0], this.score[1] + 1); this.setPhase('over', RM_OVER); }
    }
    if (pid === this.owner) { // passa o comando pra quem entrou primeiro
      let first = null; for (const o of this.members.values()) if (!first || o.joinT < first.joinT) first = o;
      this.owner = first ? first.pid : null;
    }
    if (!this.members.size) { clearTimeout(this.idle); this.idle = setTimeout(() => { if (!this.members.size) this.closeRoom(); }, 15000); this.backToLobby(true); return; }
    this.sendRoom();
  }

  onRoomMsg(m, d) {
    if (!m.ok) { if (d.t === 'hello' && !m.busy) { m.busy = true; this.hello(m, d); } return; }
    const pid = m.pid, own = pid === this.owner;
    switch (d.t) {
      case 'slot': { // trocar de vaga (só no lobby)
        if (this.ph !== 'lobby') return;
        const t = d.s === 'a' || d.s === 'b' || d.s === 's' ? d.s : null, i = d.i | 0;
        if (!t || i < 0 || i >= (t === 's' ? RM_SPEC : this.cfg.size)) return;
        if ([...this.members.values()].some(o => o.slot.t === t && o.slot.i === i)) return;
        m.slot = { t, i }; this.sendRoom(); return;
      }
      case 'set': { // dono muda nome, senha, tamanho dos times e rounds
        if (!own || this.ph !== 'lobby') return;
        if (typeof d.name === 'string') this.cfg.name = d.name.replace(/[<>&"'`]/g, '').trim().slice(0, 20) || this.cfg.name;
        if (typeof d.pass === 'string') this.cfg.pass = d.pass.replace(/[^0-9A-Za-z]/g, '').slice(0, 12);
        if (d.rounds !== undefined) this.cfg.rounds = Math.max(4, Math.min(16, d.rounds | 0));
        if (d.size !== undefined) {
          this.cfg.size = Math.max(1, Math.min(RM_TEAM, d.size | 0));
          for (const o of this.members.values()) if (o.slot.t !== 's' && o.slot.i >= this.cfg.size) { o.slot = { t: 'x', i: 99 }; o.slot = this.freeSlot(true) || this.freeSlot(false) || { t: 's', i: 0 }; }
        }
        this.sendRoom(); return;
      }
      case 'kick': { if (!own || d.pid === pid) return; const o = this.members.get(String(d.pid)); if (o) { send(o.ws, { t: 'denied', why: 'Você foi removido da sala.' }); try { o.ws.close(1000, 'kick'); } catch (e) { } this.leave(o.pid); } return; }
      case 'start': {
        if (!own || this.ph !== 'lobby') return;
        const team = t => [...this.members.values()].filter(o => o.slot.t === t).length;
        if (!team('a') || !team('b')) { send(m.ws, { t: 'note', msg: 'Precisa de pelo menos 1 jogador em cada time.' }); return; }
        this.startGame(); return;
      }
      case 'wpick': { // escolha de armas na loja (dá pra trocar até acabar o tempo)
        if (this.ph !== 'shop') return;
        const e = this.ents.get(pid); if (!e) return;
        const w = Array.isArray(d.w) ? d.w.filter(x => RM_WEAPONS.includes(x)).slice(0, 2) : [];
        if (w.length === 2 && w[0] === w[1]) w.pop();
        e.picks = w; e.ready = !!d.ready && w.length > 0;
        this.sendPicks(e.team);
        if ([...this.ents.values()].every(x => x.gone || x.ready)) { clearTimeout(this.phT); this.phaseDone(); }
        return;
      }
      case 'ping': send(m.ws, { t: 'pong', c: d.c }); return;
      case 'loaded': {
        if (this.ph !== 'starting' || !this.loaded) return;
        this.loaded.add(pid);
        if ([...this.ents.values()].every(e => e.gone || this.loaded.has(e.id) || !this.socks.has(e.id))) { clearTimeout(this.phT); this.nextRound(); }
        return;
      }
    }
    if (this.ph === 'lobby' || this.ph === 'over') return;
    // mensagens da partida: só quem joga, sem fogo amigo, dano só durante a luta
    const me = this.ents.get(pid); if (!me) return;
    if (d.t === 'hit') { const v = this.ents.get(String(d.v)); if (this.ph !== 'fight' || !v || v.team === me.team) return; }
    if (d.t === 'env' && this.ph !== 'fight') return;
    if (d.t === 'st' && this.ph !== 'fight') me.pos = null; // fora da luta (loja/contagem) cada um vai pro lugar de nascer: sem trava de teleporte
    if (d.t === 'st' || d.t === 'fire' || d.t === 'hit' || d.t === 'env' || d.t === 'heal') super.onMsg(pid, d);
  }
  sendPicks(team) {
    const list = {}; for (const e of this.ents.values()) if (e.team === team) list[e.id] = { w: e.picks || [], r: !!e.ready };
    for (const e of this.ents.values()) if (e.team === team) { const ws = this.socks.get(e.id); if (ws) send(ws, { t: 'picks', list }); }
  }

  // ---------- partida ----------
  startGame() {
    clearInterval(this.tick);
    this.ents = new Map(); this.vis = new Map(); this.taken = new Set(); this.killSeq = 0;
    this.seed = Math.floor(Math.random() * 2 ** 31); this.round = 0; this.score = [0, 0];
    for (const o of this.members.values()) if (o.slot.t === 'a' || o.slot.t === 'b') {
      const e = this.newEnt(o.pid, o.pid, o.name); e.team = o.slot.t; e.idx = o.slot.i; e.picks = null; e.load = ['ak47', 'm1887']; this.ents.set(o.pid, e);
    }
    this.started = true; this.ended = false; this.host = null; this.t0 = Date.now();
    this.ph = 'starting'; this.sendRoom();
    this.bcast(this.gameMsg());
    this.tick = setInterval(() => this.broadcastSnap(), TICK_MS);
    // espera todo mundo carregar a ilha (no máximo 40 s) antes da primeira loja
    this.loaded = new Set(); clearTimeout(this.phT); this.phT = setTimeout(() => this.nextRound(), 40000);
  }
  gameMsg() {
    return { t: 'game', seed: this.seed, rounds: this.cfg.rounds, size: this.cfg.size, name: this.cfg.name,
      players: [...this.ents.values()].map(e => { const o = this.members.get(e.id); return { pid: e.id, name: e.name, look: o ? o.look : null, team: e.team, i: e.idx }; }) };
  }
  phaseMsg(extra) {
    const load = {}; for (const e of this.ents.values()) load[e.id] = e.load;
    return Object.assign({ t: 'phase', ph: this.ph, round: this.round, rounds: this.cfg.rounds, left: Math.max(0, (this.phEnd - Date.now()) / 1000), score: this.score, load, zs: this.seed + this.round * 101 }, this.phExtra || {}, extra || {});
  }
  setPhase(ph, secs, extra) {
    clearTimeout(this.phT);
    this.ph = ph; this.phEnd = Date.now() + secs * 1000; this.phExtra = extra || null;
    this.bcast(this.phaseMsg());
    if (secs > 0) this.phT = setTimeout(() => this.phaseDone(), secs * 1000);
  }
  nextRound() {
    this.round++; this.endPending = false;
    for (const e of this.ents.values()) { if (e.gone) continue; e.hp = 100; e.alive = true; e.pos = null; e.lastT = 0; e.shots = []; e.vest = [2, 70]; e.helmet = [2, 70]; e.ready = false; if (e.st) e.st[10] = 100; }
    if ((this.round - 1) % 2 === 0) { // loja nos rounds 1, 3, 5...
      for (const e of this.ents.values()) { e.picks = e.load.slice(); e.ready = !!e.gone; }
      this.setPhase('shop', num(+this.env.SHOP_SECS) || RM_SHOP); // SHOP_SECS: só pra testes locais
      for (const t of ['a', 'b']) this.sendPicks(t);
    } else this.setPhase('count', RM_COUNT);
  }
  phaseDone() {
    if (this.ph === 'shop') { for (const e of this.ents.values()) if (e.picks && e.picks.length) e.load = e.picks.slice(); this.setPhase('count', RM_COUNT); }
    else if (this.ph === 'count') this.setPhase('fight', 0);
    else if (this.ph === 'end') { if (this.phExtra && this.phExtra.done) this.setPhase('over', RM_OVER, { winner: this.score[0] > this.score[1] ? 'a' : this.score[1] > this.score[0] ? 'b' : null }); else this.nextRound(); }
    else if (this.ph === 'over') this.backToLobby();
  }
  teamAlive(t) { for (const e of this.ents.values()) if (e.team === t && e.alive && !e.gone) return true; return false; }
  kill(v, a, weapon, head) {
    if (!v.alive) return;
    v.alive = false; v.hp = 0; this.killSeq++;
    if (v.st) v.st[10] = 0;
    this.bcast({ t: 'kill', v: v.id, a: a ? a.id : null, w: weapon, h: head ? 1 : 0, k: this.killSeq, pl: 0, p: v.pos });
    if (this.ph === 'fight' && !this.endPending && (!this.teamAlive('a') || !this.teamAlive('b'))) { this.endPending = true; setTimeout(() => this.roundOver(), 400); } // espera um tiquinho: os dois times podem cair juntos (zona)
  }
  roundOver() {
    if (this.ph !== 'fight') return;
    const a = this.teamAlive('a'), b = this.teamAlive('b'), w = a && !b ? 0 : b && !a ? 1 : -1;
    if (w >= 0) this.score[w]++;
    const need = Math.floor(this.cfg.rounds / 2) + 1, done = this.score[0] >= need || this.score[1] >= need || this.round >= this.cfg.rounds;
    this.setPhase('end', RM_END, { win: w < 0 ? null : w ? 'b' : 'a', done });
  }
  backToLobby(silent) {
    clearInterval(this.tick); clearTimeout(this.phT); this.tick = null;
    this.started = false; this.ended = true; this.ents = new Map(); this.ph = 'lobby'; this.round = 0;
    if (!silent) { this.bcast({ t: 'lobby' }); this.sendRoom(); }
  }
  // espectador (quem não joga) recebe todo mundo
  snapFor(pid, now, full) { return super.snapFor(pid, now, full || !this.ents.has(pid)); }
  onLeave() { /* a sala cuida (leave) */ }
  close() { /* a partida não fecha a sala */ }
}
