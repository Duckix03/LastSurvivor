// Servidor online do Last Survivor — Cloudflare Worker + Durable Objects
//
//  /ws/find            → Matchmaker (um só no mundo): junta quem está procurando partida por até 30 s.
//                        2+ jogadores → cria uma partida; sozinho → "nomatch" (o jogo começa contra bots).
//  /ws/match/<id>      → Match (um por partida): é a AUTORIDADE da partida.
//                        Guarda a vida de todos, confere cada tiro (arma, ritmo, distância) e calcula o dano,
//                        recusa teleporte/velocidade impossível, decide quem pegou cada item, mortes e vencedor.
//                        Os bots que completam as 31 vagas rodam no navegador do "host" (um dos jogadores).
//                        Anti-wallhack: cada jogador só recebe a posição de quem ele poderia ver (vis.js).
//  /ws/party           → PartyHub (um só no mundo): party de amigos (até 4 no BR, 2 no duelo), convites e o "vamos!" do líder.
//  /ws/pduel/<id>      → PartyDuel (um por duelo): dupla da party contra 2 bots no galpão (igual à sala, com bots do host).
//  /api/...            → Accounts (um só no mundo): contas com nome único, senha, curtidas e selos (accounts.js).
'use strict';
import { viewPoints, bodyPoints, canSee } from './vis.js';
import { Accounts } from './accounts.js';
export { Accounts };

// versão mínima do jogo pro online (LS.NET_PROTO em js/config.js). Navegador e app (APK) jogam juntos (crossplay),
// mas só se estiverem na mesma versão das regras. Subiu o LS.NET_PROTO? Suba aqui também e rode "npx wrangler deploy".
const MIN_PROTO = 2;   // 2: esquadrões de 4 (times) e party
const SEARCH_MS = 30000;   // tempo procurando jogadores
const MAX_PLAYERS = 32;    // vagas da partida (jogadores + bots): 8 esquadrões de 4
const SQUAD = 4, MAX_TEAMS = MAX_PLAYERS / SQUAD; // squad (padrão). Solo = times de 1, Duo = times de 2: uma fila pra cada
const teamSz = v => (v === 1 || v === 2 ? v : SQUAD);
const JOIN_MS = 12000;     // tempo pra todos entrarem na sala depois do matchmaking
const READY_MS = 20000;    // depois do 'start', tempo máximo esperando todo mundo terminar de carregar o mapa (aí manda o 'go' de qualquer jeito)
const DEFER_MS = 500, DEFER_MAX = 6; // fila: se alguém ainda está entrando (conferindo a conta) na hora de fechar a partida, espera até 3 s
const TICK_MS = 1000 / 30; // envio de posições aos jogadores (30 por segundo; só vai o que mudou, então não pesa). Quanto menor, menos o estado espera o próximo tick
const IDLE_MS = 15000;     // cliente novo que some por tanto tempo (sem nem o ping) é considerado caído
const GRACE_MS = 8000;     // queda de conexão: o personagem espera tanto tempo pelo jogador voltar (reconexão)
const VIS_NEAR = 18;       // perto assim sempre aparece (passos, briga de perto)
const VIS_MAX = 650;       // longe assim nunca aparece (some na neblina de qualquer jeito)
const VIS_LINGER = 600;    // depois de visto, continua aparecendo por 0,6 s (sem "piscar" na quina). Antes 1 s; o tiro agora também confere parede, então o resto é só visual
const HOST_STALE_MS = 5000; // o host não manda NENHUM bot por tanto tempo (app minimizado/travado): o servidor passa os bots pra outro jogador
const HIST_MS = 1500;       // histórico de posições de cada personagem (compensação de lag dos tiros)
const REWIND_MAX = 700;     // o tiro pode olhar no máximo tanto pro passado
const HIT_BASE = 1.0, HIT_BASE_AIR = 2.5; // folga fixa (m) do caminho da bala até o alvo
// folga extra por metro de distância = espalhamento (meio-ângulo, rad) no PIOR caso legítimo: andando, sem mirar + abertura de rajada (js/config.js: spread × hip × 1,35 + bm).
// Fica em WEAPONS[x].hs. Bots usam um cubo de espalhamento e multiplicadores maiores (HIT_SLOPE_BOT). Se acertos legítimos forem recusados, suba os 'hs'.
const HIT_SLOPE_BOT = 0.14, HIT_SLOPE_BOT_MUL = 3.5, HIT_SLOPE_AIR = 2.5;
const SHOT_ORIGIN_MAX = 7;  // a origem do tiro tem que estar a no máximo isso do atirador (câmera em 3ª pessoa incluída)
const PUNCH_RANGE = 3.4;
const HEAR_R = 320;        // até onde um tiro é ouvido

// tabela de armas (igual a js/config.js): o dano é calculado aqui, não no navegador
const WEAPONS = {
  m1911: { dmg: 22, rate: 4, range: 120, pellets: 1, cat: 'Pistola', hs: 0.06 },
  deagle: { dmg: 48, hsDmg: 200, rate: 2, range: 150, pellets: 1, cat: 'Pistola', hs: 0.09 }, // hsDmg: dano FIXO na cabeça (substitui o multiplicador); 200 mata mesmo com capacete nível 3 (corta 50%) e vida 100
  mp5: { dmg: 17, rate: 13, range: 110, pellets: 1, cat: 'SMG', hs: 0.075 },
  ump: { dmg: 21, rate: 10, range: 120, pellets: 1, cat: 'SMG', hs: 0.075 },
  ak47: { dmg: 32, rate: 9, range: 250, pellets: 1, cat: 'Rifle', hs: 0.09 },
  m4a1: { dmg: 27, rate: 11, range: 250, pellets: 1, cat: 'Rifle', hs: 0.07 },
  awm: { dmg: 105, rate: 0.75, range: 600, pellets: 1, cat: 'Sniper', hs: 0.045 },
  kar98: { dmg: 80, rate: 1, range: 550, pellets: 1, cat: 'Sniper', hs: 0.065 },
  m1887: { dmg: 15, rate: 1.1, range: 40, pellets: 9, cat: 'Escopeta', hs: 0.14 },
  spas12: { dmg: 12, rate: 1.6, range: 35, pellets: 8, cat: 'Escopeta', hs: 0.155 },
  punch: { dmg: 12, rate: 2.2, range: 2.6, pellets: 1, cat: 'Soco', hs: 0 },
};
const GEAR = { vest: [0, 0.3, 0.4, 0.5], helmet: [0, 0.3, 0.4, 0.5] }; // redução de dano por nível
const BOT_NAMES = ['Viper', 'Shadow', 'Falcon', 'Ghost', 'Blaze', 'Raven', 'Storm', 'Titan', 'Nova', 'Hunter', 'Cobra', 'Wolf', 'Phantom', 'Reaper', 'Ace',
  'Tiger', 'Sniper_BR', 'Rex', 'Lince', 'Jaguar', 'Trovão', 'Fênix', 'Sombra', 'Zé_Bala', 'Kaiser', 'Onça', 'Dragão', 'Bravo', 'Raio', 'Furacão', 'Mamba', 'Orion'];

const rid = (n = 12) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); };
const cleanName = s => String(s || 'Jogador').replace(/[<>&"'`]/g, '').trim().slice(0, 16) || 'Jogador';
const send = (ws, obj) => { try { ws.send(JSON.stringify(obj)); } catch (e) { /* conexão fechada */ } };
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const cors = { 'Access-Control-Allow-Origin': '*' };
// Região dos Durable Objects: eles nascem perto de quem os cria 1ª vez. Sem dica, a partida pode abrir na Europa/EUA
// mesmo com todo mundo no Brasil. LOC_HINT (wrangler.toml): sam, wnam, enam, weur, eeur, apac, oc, afr, me. Vazio = sem dica.
const hintName = env => (env && env.LOC_HINT !== undefined ? String(env.LOC_HINT) : 'sam');
const hint = env => { const h = hintName(env); return h ? { locationHint: h } : undefined; };
// Contas e diretório de salas também usam a dica de região (vale quando o objeto é criado; depois disso a Cloudflare ignora)
const accountsDO = env => env.ACCOUNTS.get(env.ACCOUNTS.idFromName('global'), hint(env));
const roomDirDO = env => env.ROOMDIR.get(env.ROOMDIR.idFromName('global'), hint(env));
// Preflight do CORS respondido AQUI, na borda: não acorda o Durable Object e o navegador guarda a resposta por até 2 h
// (sem Max-Age o Chrome repete o OPTIONS a cada ~5 s, dobrando os pedidos e somando um ping inteiro em cada chamada)
const PREFLIGHT = Object.assign({ 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '7200' }, cors);
const mmName = env => { const h = hintName(env); return h ? 'mm-' + h : 'global'; };

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: PREFLIGHT });
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') return new Response('Last Survivor server ok', { headers: cors });
    if (url.pathname === '/ws/find') { const sz = teamSz(+url.searchParams.get('s')); return env.MATCHMAKER.get(env.MATCHMAKER.idFromName(mmName(env) + (sz === SQUAD ? '' : '-s' + sz)), hint(env)).fetch(req); } // solo/duo/squad: filas separadas
    if (url.pathname.startsWith('/api/')) return accountsDO(env).fetch(req);
    if (url.pathname === '/room/new' || url.pathname === '/room/list') return roomRoutes(req, env, url); // salas personalizadas
    const rm = url.pathname.match(/^\/ws\/room\/(\d{7})$/);
    if (rm) return env.ROOM.get(env.ROOM.idFromName(rm[1])).fetch(req);
    if (url.pathname === '/ws/party') return env.PARTY.get(env.PARTY.idFromName('global')).fetch(req);
    const pd = url.pathname.match(/^\/ws\/pduel\/([a-z0-9]{12})$/);
    if (pd) return env.PDUEL.get(env.PDUEL.idFromName(pd[1])).fetch(req);
    const m = url.pathname.match(/^\/ws\/match\/([a-z0-9]{8,32})$/);
    if (m) return env.MATCH.get(env.MATCH.idFromName(m[1])).fetch(req);
    return new Response('not found', { status: 404, headers: cors });
  },
};

// ===================== Matchmaker: fila de 30 s =====================
export class Matchmaker {
  constructor(state, env) { this.state = state; this.env = env; this.queue = []; this.deadline = 0; this.timer = null; this.ticker = null; this.pending = 0; this.defers = 0; }

  // tamanho dos times desta fila (cada fila é um objeto: solo, duo ou squad)
  get squad() { return this.size || SQUAD; }
  get maxTeams() { return Math.floor(MAX_PLAYERS / this.squad); }
  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket esperado', { status: 426, headers: cors });
    this.size = teamSz(+new URL(req.url).searchParams.get('s'));
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const p = { ws: server, name: 'Jogador', look: null, token: rid(16), ready: false };
    server.addEventListener('message', ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'hello' && !p.ready) {
        p.ready = true;
        if (num(m.proto) < MIN_PROTO) { send(server, { t: 'outdated', min: MIN_PROTO }); try { server.close(1000, 'outdated'); } catch (e) { } return; }
        p.app = !!m.app; p.look = m.look && typeof m.look === 'object' ? m.look : null; p.rdy = !!m.rdy; // rdy: cliente novo, que avisa quando terminou de carregar
        // party: quem tem o mesmo "group" (código secreto que o PartyHub deu) cai no mesmo esquadrão
        p.group = typeof m.group === 'string' && /^[a-z0-9]{16}$/.test(m.group) ? m.group : null;
        p.gsize = Math.max(1, Math.min(this.squad, num(m.gsize, 1) | 0)); p.t = Date.now();
        this.pending++; // ainda conferindo a conta: o fechamento da fila espera esse jogador (senão 2 pessoas que entraram juntas caíam em filas separadas)
        this.joinQueue(p, m).catch(() => { }).then(() => { this.pending = Math.max(0, this.pending - 1); });
      } else if (m.t === 'ping') { // ping na fila: responde e guarda o ping do jogador (vai escolher o host da partida)
        const r = num(m.r); if (r > 0) p.rtt = Math.min(5000, r);
        send(server, { t: 'pong', c: m.c });
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
      const r = await accountsDO(this.env).fetch('https://accounts/internal/resolve', { method: 'POST', body: JSON.stringify({ token: m.auth, name: p.name }) });
      const d = await r.json(); if (d && d.name) { p.name = cleanName(d.name); p.accId = d.id || null; p.badges = d.badges || []; }
      if (d && d.maint) { send(p.ws, { t: 'maint' }); try { p.ws.close(1000, 'maint'); } catch (e) { } return; } // manutenção: só owner/DEV jogam
    } catch (e) { /* contas fora do ar: segue com o nome mandado */ }
    if (p.gone) return;
    this.queue.push(p);
    if (!this.deadline) this.armTimer();
    this.broadcastQueue();
    if (this.units(false).length >= this.maxTeams) this.flush();
  }
  armTimer() {
    this.deadline = Date.now() + SEARCH_MS;
    this.timer = setTimeout(() => this.flush(), SEARCH_MS);
    this.ticker = setInterval(() => this.broadcastQueue(), 1000);
  }
  reset() { clearTimeout(this.timer); clearInterval(this.ticker); this.timer = this.ticker = null; this.deadline = 0; }
  // esquadrões na fila: cada party é um (no máximo 4), cada jogador sozinho é outro.
  // ready: party incompleta que chegou faz menos de 6 s espera o resto (os amigos conectam quase juntos)
  units(ready) {
    const map = new Map(), out = [], now = Date.now();
    for (const p of this.queue) {
      const k = p.group ? 'g' + p.group : 't' + p.token;
      let u = map.get(k); if (!u) { u = []; u.t = p.t; u.size = p.group ? p.gsize : 1; map.set(k, u); out.push(u); }
      if (u.length < this.squad) u.push(p);
    }
    return ready ? out.filter(u => u.length >= u.size || now - u.t > 6000) : out;
  }
  broadcastQueue() {
    const left = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
    for (const q of this.queue) send(q.ws, { t: 'queue', n: this.queue.length, left, max: MAX_PLAYERS });
  }
  async flush() {
    if (this.pending > 0 && this.defers < DEFER_MAX) { // tem gente quase entrando na fila: espera um pouquinho antes de fechar a partida
      this.defers++; clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), DEFER_MS); return;
    }
    this.defers = 0;
    const units = this.units(true).slice(0, this.maxTeams), group = [];
    units.forEach((u, ti) => u.forEach(p => { p.team = ti; group.push(p); }));
    // quem passou de 4 numa party (não devia acontecer) também sai da fila
    const taken = new Set(group), extra = this.queue.filter(p => p.group && !taken.has(p) && units.some(u => u[0].group === p.group));
    this.queue = this.queue.filter(p => !taken.has(p) && !extra.includes(p));
    for (const p of extra) { send(p.ws, { t: 'nomatch' }); try { p.ws.close(1000, 'nomatch'); } catch (e) { } }
    this.reset();
    if (this.queue.length) { this.armTimer(); this.broadcastQueue(); }
    if (group.length < 2) { for (const p of group) { send(p.ws, { t: 'nomatch' }); try { p.ws.close(1000, 'nomatch'); } catch (e) { } } return; }
    const id = rid(12), seed = Math.floor(Math.random() * 2 ** 31);
    const roster = group.map((p, i) => ({ token: p.token, pid: 'p' + (i + 1), name: p.name, look: p.look, rtt: p.rtt || 0, rdy: !!p.rdy, team: p.team }));
    await this.env.MATCH.get(this.env.MATCH.idFromName(id), hint(this.env)).fetch('https://match/init', { method: 'POST', body: JSON.stringify({ id, seed, roster, size: this.squad }) });
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
    clearInterval(this.idleT); this.idleT = null;
    this.seen = new Map(); this.pingers = new Set(); this.grace = new Map(); this.bye = new Set();
    this.killLog = []; this.dropped = new Set(); this.sent = new Map(); this.verSeq = 0;
    this.dropMsgs = []; this.wDrops = []; this.gels = []; this.botSeenT = 0; // reenviados na reconexão (resync)
    clearTimeout(this.goTimer); this.goTimer = null; this.need = null; this.ready = new Set(); this.goSent = false; this.goTm = null;
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') { this.init(await req.json()); return new Response('ok'); }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket esperado', { status: 426, headers: cors });
    const r = this.roster && this.roster.find(x => x.token === url.searchParams.get('token'));
    if (!r) return new Response('sem vaga', { status: 403, headers: cors });
    // partida já começou: só entra de novo quem já era da partida (reconexão: o token é secreto de cada jogador)
    const resume = this.started && !this.ended && this.ents.has(r.pid) && (this.grace.has(r.pid) || this.socks.has(r.pid));
    if ((this.started && !resume) || (!resume && this.socks.has(r.pid))) return new Response('sem vaga', { status: 403, headers: cors });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    if (resume) {
      clearTimeout(this.grace.get(r.pid)); this.grace.delete(r.pid);
      const old = this.socks.get(r.pid); this.socks.delete(r.pid); // conexão antiga (meio-aberta): troca pela nova
      if (old) { try { old.close(1000, 'reconectou'); } catch (e) { } }
      const ent = this.ents.get(r.pid); if (ent) { ent.grace = false; this.bcast({ t: 'grace', v: ent.id, on: 0 }); }
      this.sent.delete(r.pid); this.bye.delete(r.pid);
    }
    this.socks.set(r.pid, server); this.seen.set(r.pid, Date.now());
    server.addEventListener('message', ev => { try { this.onMsg(r.pid, JSON.parse(ev.data)); } catch (e) { /* mensagem inválida */ } });
    const gone = () => this.onSockGone(r.pid, server);
    server.addEventListener('close', gone); server.addEventListener('error', gone);
    if (resume) this.sendResync(r.pid);
    else if (this.socks.size === this.roster.length) this.start();
    return new Response(null, { status: 101, webSocket: client });
  }
  // volta pro jogo depois de uma queda: manda o que ele perdeu (vida, mortes, itens pegos) pra ficar igual aos outros
  sendResync(pid) {
    const ws = this.socks.get(pid); if (!ws) return;
    const hp = []; for (const e of this.ents.values()) if (e.alive) hp.push([e.id, Math.round(e.hp)]);
    const now = Date.now(), gels = this.gels.filter(g => now - g.t < 36000).map(g => ({ i: g.i, n: g.n, o: g.o, v: g.v, age: Math.round(now - g.t) / 1000 }));
    send(ws, { t: 'resync', hp, kills: this.killLog, picks: [...this.taken], drops: this.dropMsgs, wd: this.wDrops.filter(d => !this.taken.has(d.id)), gels });
    if (this.host !== pid) send(ws, { t: 'host', host: this.host });
    if (this.goSent) send(ws, { t: 'go', tm: this.goTm }); // tm = hora do servidor em que a partida começou (o avião e a zona andam por ela)
  }

  init(d) {
    this.reset();
    this.id = d.id; this.seed = d.seed | 0; this.roster = d.roster; this.size = teamSz(d.size);
    for (const r of this.roster) { const e = this.newEnt(r.pid, r.pid, r.name); if (num(r.rtt) > 0) e.rtt = Math.min(5000, num(r.rtt)); this.ents.set(r.pid, e); }
    this.joinTimer = setTimeout(() => this.start(), JOIN_MS);
  }
  newEnt(id, owner, name) { return { id, owner, name, hp: 100, alive: true, st: null, pos: null, lastT: 0, vest: [0, 0], helmet: [0, 0], weapon: null, state: 0, shots: [], envT: 0, envAcc: 0, vel: null, ver: 0, gearVer: 0, gearS: '', stLite: null, rtt: 999, grace: false, fireCr: 3, fireT: 0, ground: false, hist: [], healT: 0, pickT: 0, pickN: 0, ghT: 0, ghN: 0, dwT: 0, dwN: 0 }; }

  start() {
    if (this.started || !this.roster) return;
    clearTimeout(this.joinTimer);
    // quem não conectou fica de fora
    for (const r of this.roster) if (!this.socks.has(r.pid)) this.ents.delete(r.pid);
    const humans = this.roster.filter(r => this.socks.has(r.pid));
    if (!humans.length) { this.reset(); return; }
    this.started = true; this.t0 = Date.now(); this.botSeenT = this.t0;
    // host = quem tem o menor ping medido na fila (os bots rodam no navegador dele: o ping dele vira atraso dos bots pra todos). Sem medida: o primeiro.
    let hostR = humans[0], hostRtt = Infinity;
    for (const r of humans) { const e = this.ents.get(r.pid), rt = e && e.rtt > 0 ? e.rtt : 999; if (rt < hostRtt) { hostRtt = rt; hostR = r; } }
    this.host = hostR.pid;
    // esquadrões de 4: os times de quem conectou (renumerados 0, 1, 2...), completados com bots; o resto dos bots em times de 4
    const tmap = new Map(), count = [];
    for (const r of humans) { const k = r.team != null ? 't' + r.team : r.pid; if (!tmap.has(k)) { tmap.set(k, count.length); count.push(0); } r.t = tmap.get(k); count[r.t]++; this.ents.get(r.pid).team = r.t; }
    const nBots = Math.max(0, MAX_PLAYERS - humans.length), bots = [];
    // nomes dos bots embaralhados pela semente (iguais pra todos)
    let s = this.seed || 1; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const names = BOT_NAMES.slice().sort(() => rnd() - 0.5);
    let ti = 0;
    for (let i = 0; i < nBots; i++) {
      while (ti < count.length && count[ti] >= (this.size || SQUAD)) ti++;
      if (ti >= count.length) count.push(0);
      count[ti]++;
      const id = 'b' + i, e = this.newEnt(id, this.host, names[i % names.length]); e.team = ti; this.ents.set(id, e); bots.push({ id, name: names[i % names.length], team: ti });
    }
    const players = humans.map(r => ({ pid: r.pid, name: r.name, look: r.look, team: r.t }));
    // BARREIRA DE CARREGAMENTO: cada navegador monta o mapa DEPOIS do 'start' (o 1º jogo da sessão leva alguns segundos).
    // Antes, quem carregava mais rápido já jogava e, se o host dos bots demorava, os outros caíam numa cidade fantasma sem bots.
    // Agora os clientes novos (rdy) avisam 'ready' quando terminam e todos começam juntos no 'go'. Cliente antigo não espera ninguém.
    this.need = new Set(humans.filter(r => r.rdy).map(r => r.pid)); this.ready = new Set(); this.goSent = false;
    const sync = this.need.size > 0 ? 1 : 0;
    for (const [pid, ws] of this.socks) send(ws, { t: 'start', you: pid, host: this.host, seed: this.seed, players, bots, size: this.size || SQUAD, caps: ['hits'], sync: sync && this.need.has(pid) ? 1 : 0 });
    if (sync) this.goTimer = setTimeout(() => this.sendGo(), READY_MS); else { this.goSent = true; this.goTm = Date.now() - this.t0; }
    this.tick = setInterval(() => this.broadcastSnap(), TICK_MS);
    this.idleT = setInterval(() => this.checkIdle(), 1000);
  }
  // todo mundo que ia esperar já terminou de carregar (ou saiu)? então libera a partida
  checkGo() {
    if (this.goSent || !this.need) return;
    for (const pid of this.need) if (!this.ready.has(pid) && this.socks.has(pid)) return;
    this.sendGo();
  }
  sendGo() {
    if (this.goSent) return;
    this.goSent = true; clearTimeout(this.goTimer); this.goTimer = null;
    this.goTm = Date.now() - this.t0; // mesma régua do 'tm' dos snaps e dos pongs: todos os clientes calculam "há quanto tempo a partida começou" a partir dela
    this.bcast({ t: 'go', tm: this.goTm });
  }
  // cliente novo (que manda ping) calado por muito tempo = conexão morta: derruba e abre a janela de reconexão
  checkIdle() {
    const now = Date.now();
    for (const [pid, ws] of this.socks) {
      if (this.pingers.has(pid) && now - (this.seen.get(pid) || now) > IDLE_MS) { try { ws.close(1000, 'idle'); } catch (e) { } this.onSockGone(pid, ws); }
    }
    // HEARTBEAT DO HOST (pelo servidor): os bots rodam no quadro (requestAnimationFrame) do navegador do host. App minimizado/travado = bots
    // congelados pra todo mundo, mesmo com a conexão viva. Sem NENHUM estado de bot por HOST_STALE_MS, a posse dos bots passa pra outro jogador.
    if (this.host && this.goSent && !this.ended) {
      const last = Math.max(this.botSeenT, this.t0 + (this.goTm || 0));
      if (now - last > HOST_STALE_MS) {
        let anyBot = false; for (const e of this.ents.values()) if (e.id[0] === 'b' && e.alive) { anyBot = true; break; }
        const nh = anyBot ? this.pickHost(this.host) : null;
        if (nh) { this.botSeenT = now; this.switchHost(nh); }
      }
    }
  }
  // passa os bots pra outro jogador: ele recebe a posição de todo mundo antes de assumir (os bots não estavam todos no pacote dele)
  switchHost(nh) {
    this.host = nh;
    send(this.socks.get(nh), { t: 'snap', e: this.snapFor(nh, Date.now(), true, false), tm: Date.now() - this.t0 });
    this.sent.delete(nh);
    for (const e of this.ents.values()) if (e.id[0] === 'b') e.owner = nh;
    this.botSeenT = Date.now();
    this.bcast({ t: 'host', host: nh });
  }
  // escolhe o host (dono dos bots) entre quem está conectado: o de menor ping
  pickHost(exclude) {
    let best = null, br = Infinity;
    for (const pid of this.socks.keys()) { if (pid === exclude) continue; const e = this.ents.get(pid), r = e && typeof e.rtt === 'number' ? e.rtt : 999; if (r < br) { br = r; best = pid; } }
    return best;
  }

  // cada jogador recebe só quem ele pode ver; o host recebe todos (os bots dele precisam enxergar os jogadores)
  broadcastSnap() {
    const now = Date.now(), tm = now - this.t0;
    // hora real de cada estado: quantos ms atrás o servidor recebeu (cliente usa pra carimbar certo, em vez da hora do tick)
    for (const x of this.ents.values()) if (x.st && x.stLite) { const a = Math.max(0, Math.min(250, now - x.lastT)); x.st[12] = a; x.stLite[12] = a; }
    for (const [pid, ws] of this.socks) {
      const hide = [], e = this.snapFor(pid, now, pid === this.host, true, hide);
      if (hide.length) send(ws, { t: 'hide', ids: hide }); // quem saiu de vista: o cliente esconde NA HORA (antes o boneco ficava parado e acertável por ~0,7 s)
      if (e.length) send(ws, { t: 'snap', e, tm }); // nada novo = nada enviado
    }
  }
  // dedupe: só manda quem mudou desde o último envio pra esse jogador; colete/capacete (gear) só quando muda ou a cada 1 s
  snapFor(pid, now, full, dedupe, hideOut) {
    const me = this.ents.get(pid), e = [];
    let views = null; const getViews = () => views || (views = viewPoints(me.pos));
    let sent = null; if (dedupe && this.pingers.has(pid)) { sent = this.sent.get(pid);  // só pra cliente novo (que manda ping): o antigo recebe tudo, como antes
      if (!sent) this.sent.set(pid, sent = new Map()); }
    for (const x of this.ents.values()) {
      if (!x.st || x.owner === pid) continue;
      const show = full || (me && !me.alive) || this.visible(pid, me, x, now, getViews); // morto (espectador) vê todo mundo
      if (!show) { if (sent) { if (hideOut && sent.has(x.id)) hideOut.push(x.id); sent.delete(x.id); } continue; } // sumiu de vista: quando voltar, é reenviado por inteiro
      if (!sent) { e.push(x.st); continue; }
      const c = sent.get(x.id);
      if (c && c.v === x.ver) continue;
      const gear = !c || c.g !== x.gearVer || now - c.t > 1000;
      e.push(gear ? x.st : x.stLite);
      sent.set(x.id, { v: x.ver, g: gear ? x.gearVer : c.g, t: gear ? now : c.t });
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
  // times com alguém vivo (quem não tem time conta sozinho)
  aliveTeams() { const t = new Set(); for (const e of this.ents.values()) if (e.alive) t.add(e.team != null ? 't' + e.team : e.id); return t; }

  onMsg(pid, m) {
    if (!this.started || this.ended) return;
    this.seen.set(pid, Date.now());
    switch (m.t) {
      case 'st': { // posições/estado dos personagens deste jogador (o próprio + bots, se for o host)
        if (!Array.isArray(m.e)) return;
        const now = Date.now();
        for (const s of m.e.slice(0, 40)) {
          if (!Array.isArray(s)) continue;
          const ent = this.ents.get(String(s[0]));
          if (!this.owns(pid, ent) || !ent.alive) continue;
          const x = num(s[1]), y = num(s[2]), z = num(s[3]), state = num(s[7]) | 0;
          // anti-teleporte / velocidade impossível. Quem já pisou no chão fica com o limite de CHÃO pra sempre (mandar 'state' de queda não libera nada).
          // No chão o máximo real é ~7,6 m/s; no ar (mergulho ~24 m/s). Também confere a vertical (voar / subir sem pular).
          if (ent.pos && state !== 0 && ent.state !== 0) {
            const dt = Math.max(0.05, (now - ent.lastT) / 1000), dh = Math.hypot(x - ent.pos[0], z - ent.pos[2]), dy = y - ent.pos[1];
            const gr = ent.ground;
            const maxV = gr ? 12.5 : 40, up = gr ? 12 * dt + 2.5 : 60 * dt + 6, down = gr ? 60 * dt + 4 : 100 * dt + 8;
            if (dh > maxV * dt + 2.5 || dy > up || -dy > down) { if (ent.owner === pid) send(this.socks.get(pid), { t: 'fix', i: ent.id, p: ent.pos }); continue; }
          }
          if (ent.pos && ent.lastT) { const vdt = Math.max(0.05, (now - ent.lastT) / 1000); ent.vel = [(x - ent.pos[0]) / vdt, 0, (z - ent.pos[2]) / vdt]; }
          ent.pos = [x, y, z]; ent.lastT = now; ent.state = state; if (state === 3) ent.ground = true;
          ent.hist.push({ t: now, p: ent.pos }); while (ent.hist.length > 2 && now - ent.hist[0].t > HIST_MS) ent.hist.shift(); if (ent.hist.length > 80) ent.hist.shift();
          if (ent.id[0] === 'b') this.botSeenT = now; // sinal de vida dos bots (host)
          ent.weapon = typeof s[8] === 'string' && WEAPONS[s[8]] ? s[8] : null;
          const g = Array.isArray(s[9]) ? s[9] : [];
          ent.vest = [Math.min(3, num(g[0]) | 0), num(g[1])]; ent.helmet = [Math.min(3, num(g[2]) | 0), num(g[3])];
          const gs = g.slice(0, 5), gj = JSON.stringify(gs); if (gj !== ent.gearS) { ent.gearS = gj; ent.gearVer++; }
          ent.st = [ent.id, x, y, z, num(s[4]), num(s[5]), num(s[6]), state, ent.weapon, gs, Math.round(ent.hp), s[10] | 0];
          ent.stLite = ent.st.slice(); ent.stLite[9] = null; // versão sem colete/capacete (o cliente guarda o último que recebeu)
          ent.ver = ++this.verSeq;
        }
        break;
      }
      case 'fire': { // um disparo: guarda o "orçamento" de projéteis (pra validar os acertos) e repassa o efeito pros outros
        const ent = this.ents.get(String(m.i)), w = WEAPONS[m.w];
        if (!this.owns(pid, ent) || !ent.alive || !w || (m.w !== 'punch' && m.w !== ent.weapon)) return;
        const now = Date.now(), cap = w.rate > 3 ? 3 : 2;
        // balde de fichas: enche na cadência da arma (+10%) e guarda até `cap` tiros. Aceita rajada curta (pacotes que chegam juntos por jitter/TCP) mas mantém a média da arma
        ent.fireCr = Math.min(cap, ent.fireCr + (ent.fireT ? (now - ent.fireT) / 1000 * w.rate * 1.1 : 0)); ent.fireT = now;
        if (ent.fireCr < 1) return; // mais rápido que a arma permite
        ent.fireCr -= 1;
        let o = null, d = null;
        if (m.w !== 'punch') {
          o = Array.isArray(m.o) && m.o.length === 3 ? m.o.map(v => num(v)) : (ent.pos || [0, 0, 0]);
          // a origem do tiro tem que estar perto de quem atira (senão dava pra "atirar de dentro da casa do outro")
          if (ent.pos) { const eye = [ent.pos[0], ent.pos[1] + 1.55, ent.pos[2]]; if (Math.hypot(o[0] - eye[0], o[1] - eye[1], o[2] - eye[2]) > SHOT_ORIGIN_MAX) o = eye; }
          d = Array.isArray(m.d) && m.d.length === 3 ? m.d.map(v => num(v)) : [0, 0, 1];
          const dl = Math.hypot(d[0], d[1], d[2]) || 1; d = d.map(v => v / dl);
        }
        ent.shots.push({ t: now, w: m.w, left: w.pellets, o, d }); if (ent.shots.length > 6) ent.shots.shift();
        if (m.w !== 'punch') {
          const msg = JSON.stringify({ t: 'fire', i: ent.id, o, d, w: m.w });
          for (const [rp, ws] of this.socks) if (rp !== pid && this.hears(rp, ent, o, d, w.range)) { try { ws.send(msg); } catch (e) { } }
        }
        break;
      }
      case 'hits': { // vários acertos num pacote só (as balas da escopeta saíam uma mensagem cada): cada um passa pela mesma conferência
        if (!Array.isArray(m.l)) return;
        for (const h of m.l.slice(0, 12)) if (h && typeof h === 'object') this.onMsg(pid, Object.assign({}, h, { t: 'hit' }));
        break;
      }
      case 'hit': { // acerto informado por quem atirou: o servidor confere (ritmo, alcance, posição do alvo NO MOMENTO do tiro, parede) e calcula o dano
        const a = this.ents.get(String(m.a)), v = this.ents.get(String(m.v));
        if (!this.owns(pid, a) || !a.alive || !v || !v.alive || v.grace || a === v || !a.pos || !v.pos) return;
        if (a.team != null && a.team === v.team) return; // sem fogo amigo
        const now = Date.now(), shot = [...a.shots].reverse().find(s => s.left > 0 && now - s.t < 600 && s.w === m.w);
        if (!shot) return;
        const w = WEAPONS[shot.w], ok = this.validHit(a, v, shot, w, m, now);
        if (!ok) { send(this.socks.get(pid), { t: 'rej', v: v.id }); return; }
        shot.left--;
        const head = ok.head && shot.w !== 'punch';
        const fall = ok.dist > w.range ? Math.max(0.25, Math.min(1, 1 - (ok.dist - w.range) / (w.range * 0.6))) : 1;
        let dmg = (head && w.hsDmg ? w.hsDmg : w.dmg * (head ? (w.cat === 'Sniper' ? 2.5 : 1.8) : 1)) * fall;
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
        const nowH = Date.now(); if (v.state !== 3 || nowH - v.healT < 1500) return; v.healT = nowH; // no chão, no máximo uma cura a cada 1,5 s
        v.hp = Math.min(100, v.hp + Math.max(0, Math.min(75, num(m.n))));
        this.bcast({ t: 'hp', v: v.id, hp: Math.round(v.hp) });
        break;
      }
      case 'pick': { // item do chão: o primeiro que pegar leva
        const id = String(m.id).slice(0, 24);
        const pe = this.ents.get(String(m.by));
        if (!this.owns(pid, pe) || !pe.alive || this.taken.size > 5000) return;
        const nowP = Date.now(); if (nowP - pe.pickT > 1000) { pe.pickT = nowP; pe.pickN = 0; } if (++pe.pickN > 10) return; // no máximo 10 coletas por segundo
        if (this.taken.has(id)) { send(this.socks.get(pid), { t: 'nopick', id }); return; }
        this.taken.add(id); this.bcast({ t: 'pick', id, by: String(m.by || '') }, pid);
        break;
      }
      case 'gel': { // bola de gelo (vira parede de gel): repassa, no máximo 1 a cada 0,4 s por personagem. Guarda pra reenviar a quem reconectar.
        const ent = this.ents.get(String(m.i)), now = Date.now();
        if (!this.owns(pid, ent) || !ent.alive || now - (ent.gelT || 0) < 400 || !Array.isArray(m.o) || !Array.isArray(m.v)) return;
        ent.gelT = now;
        const g = { i: ent.id, n: m.n | 0, o: m.o.slice(0, 3).map(v => num(v)), v: m.v.slice(0, 3).map(v => Math.max(-40, Math.min(40, num(v)))) };
        this.gels.push(Object.assign({ t: now }, g)); if (this.gels.length > 60) this.gels.shift();
        this.bcast(Object.assign({ t: 'gel' }, g), pid);
        break;
      }
      case 'gh': { // dano numa parede de gel: quem atirou calcula e o servidor repassa (todos aplicam a mesma soma: a parede estoura junto)
        const ent = this.ents.get(String(m.i)); if (!this.owns(pid, ent) || !ent.alive) return;
        const now = Date.now(); if (now - ent.ghT > 1000) { ent.ghT = now; ent.ghN = 0; } if (++ent.ghN > 25) return;
        const d = Math.max(0, Math.min(400, num(m.d))); if (d <= 0) return;
        this.bcast({ t: 'gh', w: String(m.w).slice(0, 32), d }, pid);
        break;
      }
      case 'dropw': { // arma largada (troca de arma): id único + aviso aos outros (antes os outros nem viam a arma e o id colidia)
        const ent = this.ents.get(String(m.i)); if (!this.owns(pid, ent) || !ent.alive || !WEAPONS[m.w] || m.w === 'punch' || !Array.isArray(m.p)) return;
        const now = Date.now(); if (now - ent.dwT > 1000) { ent.dwT = now; ent.dwN = 0; } if (++ent.dwN > 6) return;
        const id = String(m.id).slice(0, 32), p = m.p.slice(0, 3).map(n => num(n));
        if (!id || this.taken.has(id) || (ent.pos && Math.hypot(p[0] - ent.pos[0], p[2] - ent.pos[2]) > 12)) return;
        const msg = { t: 'dropw', id, w: m.w, m: Math.max(0, Math.min(200, num(m.m))), p };
        this.wDrops.push(msg); if (this.wDrops.length > 200) this.wDrops.shift();
        this.bcast(msg, pid);
        break;
      }
      case 'drops': { // o que um personagem deixou cair ao morrer (quem era dono dele manda a lista)
        if (!Array.isArray(m.items)) return;
        const k = m.k | 0, kr = this.killLog.find(x => x.k === k);
        // só quem era dono do morto, e só uma vez. Quem SAIU da partida não tem mais dono: o host dropa o que dá pra saber (arma, colete, capacete, mochila)
        if (!kr || this.dropped.has(k) || !(this.owns(pid, this.ents.get(kr.v)) || (kr.w === 'Saiu' && pid === this.host))) return;
        this.dropped.add(k);
        const dm = { t: 'drops', k, items: m.items.slice(0, 20) };
        this.dropMsgs.push(dm); if (this.dropMsgs.length > 60) this.dropMsgs.shift();
        this.bcast(dm, pid);
        break;
      }
      case 'diff': if (pid === this.host) this.botDmg = Math.max(0.3, Math.min(1.2, num(m.dmg, 0.75))); break;
      case 'ping': { this.pingers.add(pid); const pe = this.ents.get(pid); if (pe && typeof m.r === 'number' && isFinite(m.r)) pe.rtt = Math.max(0, Math.min(5000, m.r)); send(this.socks.get(pid), { t: 'pong', c: m.c, tm: Date.now() - this.t0 }); break; }
      case 'ready': if (this.need && this.need.has(pid)) { this.ready.add(pid); this.checkGo(); } break; // terminou de carregar o mapa
      case 'bye': this.bye.add(pid); break; // saiu de propósito: sem tempo de espera pra reconectar
    }
  }

  // posição de um personagem num instante do passado (interpola o histórico de pacotes que o servidor recebeu)
  histAt(e, T) {
    const h = e.hist; if (!h || !h.length) return e.pos;
    if (T >= h[h.length - 1].t) return h[h.length - 1].p;
    if (T <= h[0].t) return h[0].p;
    for (let i = h.length - 1; i > 0; i--) {
      const A = h[i - 1], B = h[i];
      if (A.t <= T && T <= B.t) { const u = B.t > A.t ? (T - A.t) / (B.t - A.t) : 1; return [A.p[0] + (B.p[0] - A.p[0]) * u, A.p[1] + (B.p[1] - A.p[1]) * u, A.p[2] + (B.p[2] - A.p[2]) * u]; }
    }
    return e.pos;
  }
  // confere um acerto. Devolve { head, dist } ou null (recusado).
  //  1) COMPENSAÇÃO DE LAG: o atirador vê o alvo ~100-220 ms atrás (interpolação) + metade do ping. O cliente manda 'vt' = o instante (relógio do servidor)
  //     que ele estava vendo; o tiro é comparado com a posição do alvo NESSE instante (±90 ms), e não com a posição de agora (que já pode estar dentro da casa).
  //  2) O caminho da bala (origem + direção do disparo) tem que passar perto do alvo, com folga pequena (HIT_BASE + espalhamento da arma).
  //  3) PAREDE: nada (parede, telhado, pedra, morro) entre a origem/olho do atirador e o corpo do alvo (vis.js).
  //  4) Headshot só vale se o raio também passou perto da cabeça naquele instante.
  validHit(a, v, shot, w, m, now) {
    let cands;
    if (typeof m.vt === 'number' && isFinite(m.vt)) { const T = Math.max(now - REWIND_MAX, Math.min(now, this.t0 + m.vt)); cands = [T - 90, T - 45, T, T + 45, T + 90]; }
    else cands = [now - 450, now - 350, now - 250, now - 150, now - 60, now]; // sem 'vt' (cliente antigo): janela inteira de lag
    const eye = [a.pos[0], a.pos[1] + 1.55, a.pos[2]];
    let best = null;
    if (shot.w === 'punch') {
      for (const T of cands) { const p = this.histAt(v, Math.min(T, now)), d = Math.hypot(p[0] - a.pos[0], p[2] - a.pos[2]); if (d <= PUNCH_RANGE && Math.abs(p[1] - a.pos[1]) < 2.2 && (!best || d < best.d)) best = { p, d, dist: d }; }
      if (!best) return null;
      if (!this.losOk(shot, v, [[a.pos[0], a.pos[1] + 1.2, a.pos[2]], eye], best.p)) return null;
      return { head: false, dist: best.dist };
    }
    let slope = w.hs === undefined ? 0.09 : w.hs; if (a.id[0] === 'b') slope = Math.max(HIT_SLOPE_BOT, slope * HIT_SLOPE_BOT_MUL); if (a.state !== 3) slope *= HIT_SLOPE_AIR;
    const o = shot.o, dd = shot.d, base = v.state === 3 ? HIT_BASE : HIT_BASE_AIR;
    let headOk = false;
    for (const T of cands) {
      const p = this.histAt(v, Math.min(T, now));
      const vx = p[0] - o[0], vy = p[1] + 1.0 - o[1], vz = p[2] - o[2], t = vx * dd[0] + vy * dd[1] + vz * dd[2];
      if (t < -2) continue;
      const perp = Math.hypot(vx - dd[0] * t, vy - dd[1] * t, vz - dd[2] * t);
      if (perp > base + Math.max(0, t) * slope) continue;
      if (!best || perp < best.perp) best = { p, perp, t };
      const hy = p[1] + 1.57 - o[1], ht = vx * dd[0] + hy * dd[1] + vz * dd[2];
      if (Math.hypot(vx - dd[0] * ht, hy - dd[1] * ht, vz - dd[2] * ht) <= 0.55 + Math.max(0, ht) * slope * 0.5) headOk = true; // cabeça: folga de espalhamento menor que a do corpo
    }
    if (!best) return null;
    const dist = Math.hypot(o[0] - best.p[0], o[1] - best.p[1], o[2] - best.p[2]);
    if (dist > w.range * 1.6 + 4) return null;
    if (!this.losOk(shot, v, [o, eye], best.p)) return null;
    return { head: !!m.h && headOk, dist };
  }
  // linha de visão do atirador até o corpo do alvo (resultado guardado por tiro: os 9 balins da escopeta pagam a conta uma vez só)
  losOk(shot, v, views, p) {
    if (!shot.los) shot.los = new Map();
    let ok = shot.los.get(v.id);
    if (ok === undefined) { ok = canSee(views, bodyPoints(p, null)); shot.los.set(v.id, ok); }
    return ok;
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
    const left = this.aliveCount(), teams = this.aliveTeams();
    const wiped = v.team != null && !teams.has('t' + v.team); // o esquadrão inteiro caiu: colocação do time
    const km = { t: 'kill', v: v.id, a: a ? a.id : null, w: weapon, h: head ? 1 : 0, k: this.killSeq, pl: wiped ? teams.size + 1 : left + 1, p: v.pos };
    this.killLog.push(km); this.bcast(km);
    if (teams.size <= 1 && !this.ended) {
      this.ended = true;
      let winner = null, team = null; for (const e of this.ents.values()) if (e.alive) { winner = e.id; team = e.team != null ? e.team : null; }
      this.bcast({ t: 'end', winner, team });
      setTimeout(() => this.close(), 15000);
    }
  }
  // a conexão de um jogador caiu. Em partida normal ele ganha GRACE_MS pra reconectar antes de ser eliminado
  onSockGone(pid, ws) {
    if (this.socks.get(pid) !== ws) return; // conexão antiga, que já foi trocada por uma nova
    this.socks.delete(pid);
    if (!this.started) return;
    this.checkGo(); // quem caiu enquanto carregava não segura os outros
    const e = this.ents.get(pid);
    if (this.ended || !e || !e.alive || this.bye.has(pid)) { this.finalLeave(pid); return; }
    e.grace = true; this.bcast({ t: 'grace', v: e.id, on: 1 }); clearTimeout(this.grace.get(pid)); // imune enquanto reconecta: os outros param de mostrar marcador de acerto nele
    this.grace.set(pid, setTimeout(() => { this.grace.delete(pid); this.finalLeave(pid); }, GRACE_MS));
  }
  onLeave(pid) { this.socks.delete(pid); this.finalLeave(pid); }
  finalLeave(pid) {
    this.socks.delete(pid); clearTimeout(this.grace.get(pid)); this.grace.delete(pid);
    if (!this.started) return;
    const me = this.ents.get(pid);
    if (me) me.grace = false;
    if (me && me.alive && !this.ended) this.kill(me, null, 'Saiu', false);
    // o host saiu: assume quem tem o menor ping
    if (pid === this.host && this.socks.size) { const nh = this.pickHost(); if (nh) this.switchHost(nh); } // o host saiu: assume quem tem o menor ping
    if (!this.socks.size && !this.grace.size) this.close();
  }
  close() {
    clearInterval(this.tick); clearInterval(this.idleT); clearTimeout(this.joinTimer);
    for (const t of this.grace.values()) clearTimeout(t);
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
  try { const r = await accountsDO(env).fetch('https://accounts/internal/resolve', { method: 'POST', body: JSON.stringify({ token, name: 'x' }) }); return await r.json(); }
  catch (e) { return {}; }
}
export async function roomRoutes(req, env, url) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: Object.assign({ 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' }, cors) });
  const b = await req.json().catch(() => ({}));
  const acc = await resolveAcc(env, b.auth);
  if (acc.maint) return jsonR({ err: 'O jogo está em manutenção. Volte daqui a pouquinho!' });
  if (!acc.id) return jsonR({ err: 'Entre na sua conta pra usar salas personalizadas (são só com amigos).' });
  const dir = roomDirDO(env);
  if (url.pathname === '/room/list') return dir.fetch('https://dir/list', { method: 'POST', body: JSON.stringify({ me: acc.id, friends: acc.friends || [] }) });
  // nova sala
  const d = await (await dir.fetch('https://dir/alloc', { method: 'POST', body: JSON.stringify({ hostAcc: acc.id, hostName: acc.name }) })).json();
  await env.ROOM.get(env.ROOM.idFromName(d.id), hint(env)).fetch('https://room/init', { method: 'POST', body: JSON.stringify({ id: d.id, hostAcc: acc.id, hostName: acc.name }) });
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
    this.cfg = this.cfg || { name: 'Sala', pass: '', size: 2, rounds: 8, gelInf: true };
    clearTimeout(this.phT); this.phT = null; this.endPending = false;
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') {
      const d = await req.json();
      this.cfg = { name: ('Sala de ' + cleanName(d.hostName)).slice(0, 20), pass: '', size: 2, rounds: 8, gelInf: true };
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
      try { const r = await accountsDO(this.env).fetch('https://accounts/internal/friends', { method: 'POST', body: JSON.stringify({ id: this.hostAcc }) }); fr = (await r.json()).friends || []; } catch (e) { }
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
    return { t: 'room', id: this.id, name: this.cfg.name, hasPass: !!this.cfg.pass, pass: null, size: this.cfg.size, rounds: this.cfg.rounds, gelInf: this.cfg.gelInf !== false, owner: this.owner, ph: this.ph,
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
    const dir = roomDirDO(this.env);
    this.state.waitUntil ? this.state.waitUntil(dir.fetch('https://dir/update', { method: 'POST', body: JSON.stringify({ id: this.id, info }) }).catch(() => { })) : dir.fetch('https://dir/update', { method: 'POST', body: JSON.stringify({ id: this.id, info }) }).catch(() => { });
  }
  closeRoom() {
    this.alive = false; clearInterval(this.beat); clearTimeout(this.idle); clearInterval(this.tick); clearTimeout(this.phT);
    for (const o of this.members.values()) { try { o.ws.close(1000, 'fim'); } catch (e) { } }
    roomDirDO(this.env).fetch('https://dir/remove', { method: 'POST', body: JSON.stringify({ id: this.id }) }).catch(() => { });
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
        if (d.gelInf !== undefined) this.cfg.gelInf = !!d.gelInf; // gelo infinito (desligado: 2 por round)
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
      case 'ping': this.pingers.add(pid); send(m.ws, { t: 'pong', c: d.c }); return;
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
    if (d.t === 'hit') { const v = this.ents.get(String(d.v)), a = this.ents.get(String(d.a)) || me; if (this.ph !== 'fight' || !v || v.team === a.team) return; } // quem atira pode ser um bot do host
    if (d.t === 'env' && this.ph !== 'fight') return;
    if (d.t === 'st' && this.ph !== 'fight') for (const e of this.ents.values()) if (e.owner === pid) e.pos = null; // fora da luta (loja/contagem) cada um vai pro lugar de nascer: sem trava de teleporte (os bots do host também)
    if (d.t === 'gel' && this.ph !== 'fight') return;
    if (d.t === 'st' || d.t === 'fire' || d.t === 'hit' || d.t === 'env' || d.t === 'heal' || d.t === 'gel' || d.t === 'gh' || d.t === 'dropw') super.onMsg(pid, d);
  }
  sendPicks(team) {
    const list = {}; for (const e of this.ents.values()) if (e.team === team) list[e.id] = { w: e.picks || [], r: !!e.ready };
    for (const e of this.ents.values()) if (e.team === team) { const ws = this.socks.get(e.id); if (ws) send(ws, { t: 'picks', list }); }
  }

  // ---------- partida ----------
  startGame() {
    clearInterval(this.tick);
    this.ents = new Map(); this.vis = new Map(); this.sent = new Map(); this.taken = new Set(); this.killSeq = 0;
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
    return { t: 'game', seed: this.seed, rounds: this.cfg.rounds, size: this.cfg.size, name: this.cfg.name, gelInf: this.cfg.gelInf !== false,
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
    for (const e of this.ents.values()) { if (e.gone) continue; e.hp = 100; e.alive = true; e.pos = null; e.lastT = 0; e.shots = []; e.ground = false; e.hist = []; e.vest = [2, 70]; e.helmet = [2, 70]; e.ready = false; if (e.st) e.st[10] = 100; }
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
    this.started = false; this.ended = true; this.ents = new Map(); this.sent = new Map(); this.ph = 'lobby'; this.round = 0;
    if (!silent) { this.bcast({ t: 'lobby' }); this.sendRoom(); }
  }
  // espectador (quem não joga) recebe todo mundo
  snapFor(pid, now, full, dedupe, hideOut) { return super.snapFor(pid, now, full || !this.ents.has(pid), dedupe, hideOut); }
  onLeave() { /* a sala cuida (leave) */ }
  close() { /* a partida não fecha a sala */ }
}

// ===================== Party (até 4 amigos no BR, 2 no duelo) =====================
// /ws/party → PartyHub (um só no mundo). Cada jogador com conta fica conectado aqui enquanto o jogo está aberto.
//  - convite só pra amigo online · o líder escolhe o modo e aperta JOGAR (os outros esperam)
//  - BR: todos recebem o mesmo "group" e o Matchmaker põe a party inteira no mesmo esquadrão (completa com bots)
//  - Duelo: só 2. Trocou pro duelo com 3 ou 4? O líder escolhe quem fica, os outros saem da party
// Usa a hibernação do Cloudflare (a conexão fica aberta sem gastar a cota do plano grátis): o estado das parties
// fica guardado no storage e cada conexão guarda quem ela é (serializeAttachment).
const PARTY_GRACE = 30000, INVITE_MS = 60000;
// tamanho máximo da party: duelo 2; battle royale = o time do modo (solo 1, duo 2, squad 4)
const partyCap = (mode, size) => (mode === 'duel' ? 2 : teamSz(size));
const MODE_TXT = { duel: 'Duelo', 1: 'Solo', 2: 'Duo', 4: 'Squad' };
// visual do boneco: só as chaves conhecidas, textos curtos (cada conexão hibernada guarda no máximo 2 KB)
const LOOK_KEYS = ['skin', 'hair', 'hairStyle', 'eyes', 'shirt', 'pattern', 'pants', 'accent', 'beard', 'glasses', 'mask', 'hat', 'top', 'legs', 'costume', 'neck'];
const cleanLook = l => { if (!l || typeof l !== 'object') return null; const o = {}; for (const k of LOOK_KEYS) if (typeof l[k] === 'string' && l[k].length <= 28) o[k] = l[k]; return o; };
export class PartyHub {
  constructor(state, env) {
    this.state = state; this.env = env; this.parties = {}; this.socks = null;
    state.blockConcurrencyWhile(async () => { this.parties = (await state.storage.get('parties')) || {}; });
    try { state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch (e) { /* sem auto-resposta: o ping acorda o objeto, sem problema */ }
  }
  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket esperado', { status: 426, headers: cors });
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ acc: null });
    return new Response(null, { status: 101, webSocket: client });
  }
  // quem está conectado (refeito quando o objeto acorda da hibernação)
  sockMap() {
    if (!this.socks) { this.socks = new Map(); for (const ws of this.state.getWebSockets()) { const a = this.att(ws); if (a.acc) this.socks.set(a.acc, ws); } }
    return this.socks;
  }
  att(ws) { try { return ws.deserializeAttachment() || {}; } catch (e) { return {}; } }
  setAtt(ws, a) { try { ws.serializeAttachment(a); } catch (e) { } }
  save() { return this.state.storage.put('parties', this.parties); }
  partyOf(acc) { for (const p of Object.values(this.parties)) if (p.members.includes(acc)) return p; return null; }
  note(ws, msg) { send(ws, { t: 'note', msg }); }
  // estado da party pra todos os membros
  view(p) {
    const S = this.sockMap(), now = Date.now();
    return { id: p.id, leader: p.leader, mode: p.mode, size: p.mode === 'duel' ? 2 : teamSz(p.size), members: p.members.map(acc => { const i = p.info[acc] || {}, ws = S.get(acc), a = ws ? this.att(ws) : {};
      return { acc, name: i.name || '?', look: i.look || null, badges: i.badges || [], on: !!ws, st: a.st || 'lobby' }; }),
      inv: Object.keys(p.inv).filter(acc => p.inv[acc] > now) };
  }
  push(p) { const v = this.view(p), S = this.sockMap(); for (const acc of p.members) { const ws = S.get(acc); if (ws) send(ws, { t: 'party', party: v }); } }
  // tira alguém da party (saiu, foi expulso ou ficou offline). Party sem ninguém some; o líder saiu: o próximo assume
  drop(p, acc, why) {
    const i = p.members.indexOf(acc); if (i < 0) return;
    p.members.splice(i, 1); delete p.info[acc]; delete p.off[acc];
    const ws = this.sockMap().get(acc);
    if (ws) send(ws, why ? { t: 'kicked', why, party: null } : { t: 'party', party: null });
    if (!p.members.length) { delete this.parties[p.id]; return; }
    if (p.leader === acc) p.leader = p.members[0];
    this.push(p);
  }
  async webSocketMessage(ws, raw) {
    if (raw === 'ping') { try { ws.send('pong'); } catch (e) { } return; }
    let d; try { d = JSON.parse(raw); } catch (e) { return; }
    const a = this.att(ws);
    if (d.t === 'hello') return this.hello(ws, a, d);
    if (!a.acc) return;
    const me = a.acc, S = this.sockMap();
    let p = this.partyOf(me);
    const lead = p && p.leader === me;
    switch (d.t) {
      case 'st': a.st = d.s === 'game' ? 'game' : 'lobby'; this.setAtt(ws, a); if (p) this.push(p); return;
      case 'look': a.look = cleanLook(d.look); this.setAtt(ws, a); if (p) { p.info[me].look = a.look; this.push(p); await this.save(); } return;
      case 'invite': {
        const to = String(d.to || ''), mode = d.mode === 'duel' ? 'duel' : 'br', size = teamSz(d.size);
        if (to === me) return;
        let fr = []; // amigos conferidos na hora (a lista não fica na conexão: pode passar de 2 KB)
        try { const r = await this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('global')).fetch('https://accounts/internal/friends', { method: 'POST', body: JSON.stringify({ id: me }) }); fr = (await r.json()).friends || []; } catch (e) { }
        if (!fr.includes(to)) return this.note(ws, 'Só dá pra chamar amigos pra party.');
        p = this.partyOf(me); // pode ter mudado enquanto conferia
        if (p && p.leader !== me) return this.note(ws, 'Só o líder da party pode convidar.');
        const tws = S.get(to); if (!tws) return this.note(ws, 'Esse amigo não está online agora.');
        if (p && p.members.includes(to)) return this.note(ws, 'Ele já está na sua party.');
        const m = p ? p.mode : mode, cap = p ? partyCap(p.mode, p.size) : partyCap(mode, size);
        if (cap < 2) return this.note(ws, 'No Solo não tem party. Troque pra Duo ou Squad pra jogar com amigos.');
        if (p && p.members.length >= cap) return this.note(ws, m === 'duel' ? 'No duelo a party é de 2. Troque pro Battle Royale pra chamar mais gente.' : cap === 2 ? 'No Duo a party é de 2. Troque pro Squad pra chamar mais gente.' : 'A party já está cheia (4 jogadores).');
        if (!p) { const id = rid(10); p = this.parties[id] = { id, leader: me, mode, size: mode === 'duel' ? 2 : size, members: [me], info: {}, inv: {}, off: {} }; p.info[me] = { name: a.name, look: a.look, badges: a.badges }; }
        p.inv[to] = Date.now() + INVITE_MS;
        send(tws, { t: 'invite', party: p.id, from: me, name: a.name, look: a.look, mode: p.mode, size: partyCap(p.mode, p.size), n: p.members.length });
        this.note(ws, 'Convite enviado!');
        this.push(p); await this.save(); return;
      }
      case 'accept': {
        const q = this.parties[String(d.party || '')];
        if (!q || !(q.inv[me] > Date.now())) return this.note(ws, 'Esse convite expirou.');
        if (q.members.length >= partyCap(q.mode, q.size)) { delete q.inv[me]; await this.save(); return this.note(ws, 'Essa party já está cheia.'); }
        if (p && p !== q) this.drop(p, me);
        delete q.inv[me];
        if (!q.members.includes(me)) { q.members.push(me); q.info[me] = { name: a.name, look: a.look, badges: a.badges }; }
        this.push(q); await this.save(); return;
      }
      case 'decline': {
        const q = this.parties[String(d.party || '')]; if (!q || !q.inv[me]) return;
        delete q.inv[me];
        const lw = S.get(q.leader); if (lw) this.note(lw, a.name + ' recusou o convite.');
        this.push(q); await this.save(); return;
      }
      case 'leave': if (p) { this.drop(p, me); await this.save(); } return;
      case 'kick': {
        if (!lead) return;
        const who = String(d.acc || ''); if (who === me || !p.members.includes(who)) return;
        this.drop(p, who, 'Você foi removido da party pelo líder.'); await this.save(); return;
      }
      case 'uninvite': { if (lead) { delete p.inv[String(d.acc || '')]; this.push(p); await this.save(); } return; }
      case 'mode': {
        if (!lead) return;
        const mode = d.mode === 'duel' ? 'duel' : 'br', size = mode === 'duel' ? 2 : teamSz(d.size), cap = partyCap(mode, size);
        if (p.members.length > cap) { // time menor que a party (duelo/duo: 2, solo: 1): o líder escolhe quem fica, o resto sai
          const keep = Array.isArray(d.keep) ? [...new Set(d.keep.map(String))].filter(x => x !== me && p.members.includes(x)) : [];
          if (keep.length !== cap - 1 || (cap === 1 && !d.confirm)) return this.note(ws, cap === 1 ? 'Confirme: no Solo a party é desfeita.' : 'Escolha quem fica com você.');
          const txt = MODE_TXT[mode === 'duel' ? 'duel' : size];
          for (const acc of p.members.slice()) if (acc !== me && !keep.includes(acc)) this.drop(p, acc, 'O líder trocou pro ' + txt + (cap === 1 ? ' (sozinho) e a party foi desfeita.' : ' (só ' + cap + ' jogadores) e você saiu da party.'));
        }
        p.mode = mode; p.size = size; this.push(p); await this.save(); return;
      }
      case 'cancel': { // alguém cancelou a busca: cancela pra party toda
        if (!p) return;
        for (const acc of p.members) { const w = S.get(acc); if (w && acc !== me) send(w, { t: 'cancel', by: a.name }); }
        return;
      }
      case 'go': {
        if (!lead) return this.note(ws, 'Só o líder pode iniciar a partida.');
        if (p.members.length < 2) return;
        const away = p.members.filter(acc => { const w = S.get(acc); return !w || this.att(w).st === 'game'; });
        if (away.length) return this.note(ws, 'Esperando ' + away.map(acc => (p.info[acc] || {}).name || '?').join(', ') + ' voltar pro lobby.');
        if (p.mode === 'duel') {
          if (p.members.length !== 2) return this.note(ws, 'O duelo em party é de 2 jogadores.');
          const id = rid(12), players = p.members.map(acc => ({ acc, name: p.info[acc].name, look: p.info[acc].look, ticket: rid(16) }));
          try { await this.env.PDUEL.get(this.env.PDUEL.idFromName(id)).fetch('https://pduel/init', { method: 'POST', body: JSON.stringify({ id, players }) }); }
          catch (e) { return this.note(ws, 'Não deu pra criar o duelo. Tente de novo.'); }
          for (const pl of players) { const w = S.get(pl.acc); if (w) send(w, { t: 'go', mode: 'duel', id, ticket: pl.ticket }); }
        } else {
          const group = rid(16);
          const size = teamSz(p.size);
          if (p.members.length > size) return this.note(ws, 'A party tem gente demais pra esse modo.');
          for (const acc of p.members) { const w = S.get(acc); if (w) send(w, { t: 'go', mode: 'br', group, gsize: p.members.length, size }); }
        }
        return;
      }
    }
  }
  async hello(ws, a, d) {
    if (a.acc || a.busy) return;
    a.busy = true; this.setAtt(ws, a);
    if (num(d.proto) < MIN_PROTO) { send(ws, { t: 'outdated' }); try { ws.close(4002, 'outdated'); } catch (e) { } return; }
    const acc = await resolveAcc(this.env, d.auth);
    if (!acc.id) { send(ws, { t: 'noauth' }); try { ws.close(4003, 'noauth'); } catch (e) { } return; }
    const S = this.sockMap(), old = S.get(acc.id);
    if (old && old !== ws) { this.setAtt(old, { acc: null }); send(old, { t: 'dup' }); try { old.close(4001, 'outra aba'); } catch (e) { } } // a mesma conta abriu em outro lugar
    const n = { acc: acc.id, name: cleanName(acc.name), badges: (acc.badges || []).slice(0, 6), look: cleanLook(d.look), st: d.st === 'game' ? 'game' : 'lobby' };
    this.setAtt(ws, n); S.set(acc.id, ws);
    send(ws, { t: 'hi', you: acc.id });
    const p = this.partyOf(acc.id);
    if (p) { delete p.off[acc.id]; p.info[acc.id] = { name: n.name, look: n.look || (p.info[acc.id] || {}).look, badges: n.badges }; this.push(p); await this.save(); }
    else send(ws, { t: 'party', party: null });
  }
  async webSocketClose(ws) { await this.gone(ws); }
  async webSocketError(ws) { await this.gone(ws); }
  async gone(ws) {
    const a = this.att(ws); if (!a.acc) return;
    const S = this.sockMap(); if (S.get(a.acc) === ws) S.delete(a.acc); else return; // já reconectou por outra conexão
    const p = this.partyOf(a.acc);
    if (p) { p.off[a.acc] = Date.now(); this.push(p); await this.save(); await this.armAlarm(Date.now() + PARTY_GRACE + 1000); }
  }
  async armAlarm(t) { const cur = await this.state.storage.getAlarm(); if (!cur || cur > t) await this.state.storage.setAlarm(t); } // não adia um alarme que já vinha antes
  // quem caiu e não voltou em 30 s sai da party; convites vencidos somem
  async alarm() {
    const now = Date.now(); let more = false;
    for (const p of Object.values(this.parties)) {
      for (const acc of Object.keys(p.off)) { if (this.sockMap().has(acc)) { delete p.off[acc]; continue; } if (now - p.off[acc] >= PARTY_GRACE) this.drop(p, acc); else more = true; }
      for (const acc of Object.keys(p.inv)) if (p.inv[acc] < now) delete p.inv[acc];
      if (this.parties[p.id] && p.members.length === 1 && !Object.keys(p.inv).length && !this.sockMap().has(p.members[0])) delete this.parties[p.id];
    }
    await this.save();
    if (more) await this.armAlarm(now + 5000);
  }
}

// ===================== Duelo em party: a dupla contra 2 bots no galpão =====================
// Igual a uma sala (vida/tiros/dano no servidor, loja de cada jogador a cada 2 rounds, primeiro a 5), mas:
// só entra quem tem o ingresso que o PartyHub deu, começa sozinho e os 2 bots (time b) rodam no navegador do host.
export class PartyDuel extends Room {
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') {
      const d = await req.json();
      this.cfg = { name: 'Duelo em dupla', pass: '', size: 2, rounds: 9, gelInf: false };
      this.reset();
      this.id = d.id; this.pd = (d.players || []).slice(0, 2); this.alive = true;
      // quem não entrar em 20 s fica de fora (o outro joga sozinho contra os 2 bots)
      clearTimeout(this.idle); this.idle = setTimeout(() => { if (this.ph !== 'lobby') return; if (this.members.size) this.startGame(); else this.closeRoom(); }, 20000);
      return new Response('ok');
    }
    return super.fetch(req);
  }
  async hello(m, d) {
    if (!this.alive || !this.pd) return this.deny(m, 'Esse duelo não existe mais.');
    if (num(d.proto) < MIN_PROTO) return this.deny(m, 'Atualize o jogo pra entrar.');
    const i = this.pd.findIndex(x => x.ticket === String(d.ticket || ''));
    if (i < 0) return this.deny(m, 'Ingresso inválido.');
    if (this.ph !== 'lobby') return this.deny(m, 'O duelo já começou.');
    const p = this.pd[i];
    for (const o of this.members.values()) if (o.accId === p.acc) { try { o.ws.close(1000, 'outra aba'); } catch (e) { } this.leave(o.pid); }
    m.pid = 'u' + (i + 1); m.ok = true; m.accId = p.acc; m.name = cleanName(p.name); m.look = d.look && typeof d.look === 'object' ? d.look : p.look || null;
    m.badges = []; m.slot = { t: 'a', i }; m.joinT = Date.now(); m.picks = null;
    this.members.set(m.pid, m); this.socks.set(m.pid, m.ws);
    if (!this.owner || !this.members.has(this.owner)) this.owner = m.pid;
    send(m.ws, { t: 'welcome', you: m.pid });
    if (this.members.size >= this.pd.length) { clearTimeout(this.idle); this.startGame(); }
  }
  publish() { }
  sendRoom() { }
  closeRoom() {
    this.alive = false; clearTimeout(this.idle); clearInterval(this.tick); clearTimeout(this.phT);
    for (const o of this.members.values()) { try { o.ws.close(1000, 'fim'); } catch (e) { } }
    this.reset();
  }
  startGame() {
    if (this.ph !== 'lobby' || !this.members.size) return;
    clearInterval(this.tick);
    this.ents = new Map(); this.vis = new Map(); this.taken = new Set(); this.killSeq = 0;
    this.seed = Math.floor(Math.random() * 2 ** 31); this.round = 0; this.score = [0, 0];
    const humans = [...this.members.values()].sort((x, y) => x.slot.i - y.slot.i);
    for (const o of humans) { const e = this.newEnt(o.pid, o.pid, o.name); e.team = 'a'; e.idx = o.slot.i; e.picks = null; e.load = ['ak47', 'm1887']; this.ents.set(o.pid, e); }
    this.host = humans[0].pid;
    let s = this.seed || 1; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const names = BOT_NAMES.slice().sort(() => rnd() - 0.5);
    for (let i = 0; i < 2; i++) { const e = this.newEnt('b' + i, this.host, names[i]); e.team = 'b'; e.idx = i; e.bot = true; e.load = this.botLoad(); this.ents.set(e.id, e); }
    this.started = true; this.ended = false; this.t0 = Date.now();
    this.ph = 'starting';
    this.bcast(this.gameMsg());
    this.tick = setInterval(() => this.broadcastSnap(), TICK_MS);
    this.loaded = new Set(); clearTimeout(this.phT); this.phT = setTimeout(() => this.nextRound(), 40000);
  }
  // bot: uma de longe (rifle/sniper) + uma de perto (escopeta/SMG), como no duelo offline
  botLoad() {
    const cat = c => RM_WEAPONS.filter(w => c.includes(WEAPONS[w].cat)), pick = l => l[Math.floor(Math.random() * l.length)];
    return [pick(cat(['Rifle', 'Sniper'])), pick(cat(['Escopeta', 'SMG']))];
  }
  gameMsg() {
    const list = [...this.ents.values()];
    return { t: 'game', arena: 'duel', seed: this.seed, rounds: this.cfg.rounds, size: 2, name: this.cfg.name, gelInf: false, host: this.host,
      players: list.filter(e => !e.bot).map(e => { const o = this.members.get(e.id); return { pid: e.id, name: e.name, look: o ? o.look : null, team: e.team, i: e.idx }; }),
      bots: list.filter(e => e.bot).map(e => ({ id: e.id, name: e.name, team: e.team, i: e.idx })) };
  }
  nextRound() {
    super.nextRound();
    if (this.ph === 'shop') for (const e of this.ents.values()) if (e.bot) { e.load = this.botLoad(); e.picks = e.load.slice(); e.ready = true; }
  }
  phaseDone() {
    if (this.ph === 'over') { this.bcast({ t: 'done' }); setTimeout(() => this.closeRoom(), 1500); this.ph = 'done'; this.ended = true; return; }
    super.phaseDone();
  }
  onRoomMsg(m, d) {
    if (m.ok && ['slot', 'set', 'kick', 'start'].includes(d.t)) return; // sem lobby: nada de trocar vaga/configurar
    if (m.ok && d.t === 'diff' && m.pid === this.host && this.ph !== 'lobby') { this.botDmg = Math.max(0.3, Math.min(1.2, num(d.dmg, 0.75))); return; }
    super.onRoomMsg(m, d);
  }
  leave(pid) {
    const was = this.host;
    super.leave(pid);
    if (!this.alive) return;
    if (!this.members.size) { this.closeRoom(); return; }
    if (pid === was && this.ph !== 'lobby') { // o host saiu: o outro assume os bots
      this.host = this.members.keys().next().value;
      for (const e of this.ents.values()) if (e.bot) e.owner = this.host;
      this.bcast({ t: 'host', host: this.host });
    }
  }
  backToLobby(silent) { if (silent) return; super.backToLobby(silent); }
}
