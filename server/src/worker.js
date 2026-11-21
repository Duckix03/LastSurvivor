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
