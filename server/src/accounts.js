// Contas do Last Survivor — um Durable Object só ("global") guarda todas as contas.
//
// Por que existe: sem conta, qualquer um coloca o nome que quiser (até o seu). Com conta:
//   - o NOME é único e fica reservado pra quem criou a conta (com senha)
//   - os SELOS (owner, dev, criador de conteúdo, verificado) só são dados aqui no servidor, pelo dono do jogo
//   - CURTIDAS são de verdade: cada conta curte um perfil uma vez só
//
// Rotas (todas JSON, em /api/...):
//   POST /api/register {name, pass, profile}   cria a conta e já entra
//   POST /api/login    {name, pass}            entra (devolve o token da sessão)
//   POST /api/logout                           sai (apaga o token)
//   GET  /api/me                               sua conta
//   POST /api/profile  {look, bio, avatarBg, cover, weapon}   salva o visual e o perfil
//   POST /api/rename   {name}                  troca o nome (único; custa 10.000 moedas, mudar só maiúsculas é grátis)
//   POST /api/stats    {stats}                 salva as estatísticas
//   GET  /api/profile/<id>                     perfil público de alguém (pelo ID)
//   POST /api/like/<id>                        curte / descurte
//   POST /api/admin/claim {key}                vira OWNER usando a chave secreta (ADMIN_KEY)
//   POST /api/admin/badges {id, badges}        (só owner) dá/tira selos de uma conta
//   GET  /api/friends                          amigos (com online/offline) e pedidos recebidos/enviados
//   POST /api/friends/add {query}              manda pedido pelo ID (10 números) ou pelo nome
//   POST /api/friends/accept|decline|remove {id}
//   POST /api/ping                             "estou online" (o jogo manda de tempos em tempos)
//   POST /api/google {idToken, name, profile, stats, linkCode?}   entra com Google (cria a conta se for a 1ª vez)
//                                              ou, logado (ou com linkCode do app), liga o Google à sua conta
//   POST /api/google/unlink                    desliga o Google (só se a conta tiver senha)
//   POST /api/password {pass}                  cria uma senha (conta que só entrava pelo Google)
//   POST /api/handoff                          código de uso único (3 min) pra passar a sessão pro app / pro navegador
//   POST /api/handoff/redeem {code}            troca o código pela sessão
// Uso interno (só o Matchmaker chama, não fica exposto): /internal/resolve {token, name}
'use strict';

const TOKEN_DAYS = 90, RENAME_COST = 10000, PBKDF2_ITER = 10000; // trocar de nome custa 10.000 moedas (igual a js/config.js) // poucas iterações: o plano grátis tem só ~10 ms de CPU por pedido
const BADGES = ['owner', 'dev', 'cc', 'verificado'];
const MAX_FRIENDS = 200, ONLINE_MS = 150000; // online = mandou sinal nos últimos 2,5 min
const RESERVED = ['admin', 'adm', 'moderador', 'owner', 'dono', 'dev', 'suporte', 'support', 'convidado', 'guest', 'lastsurvivor', 'last_survivor', 'sistema', 'system', 'claude', 'anthropic'];
const NAME_RE = /^[A-Za-z0-9_.\-À-ÿ]{3,16}$/;
const LOOK_KEYS = ['skin', 'hair', 'hairStyle', 'eyes', 'shirt', 'pattern', 'pants', 'accent', 'beard', 'glasses', 'mask', 'hat', 'top', 'legs'];
const ITEM_RE = /^[a-zA-Z]{2,10}:[a-zA-Z0-9À-ÿ .\-]{1,24}$/; // itens da loja: "parte:valor" (ex.: hat:coroa)
const STAT_KEYS = ['games', 'wins', 'kills', 'xp', 'coins', 'dmg', 'best'];

const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Content-Type': 'application/json' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: H });
const fail = (msg, status = 400) => json({ error: msg }, status);
const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
const randHex = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); };
const txt = (s, max) => String(s == null ? '' : s).replace(/[<>&"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const nint = (v, max) => Math.max(0, Math.min(max, Math.floor(+v || 0)));

async function hashPass(pass, saltHex) {
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256));
}
// ---------- login com Google: confere o "ID token" (JWT RS256) com as chaves públicas do Google ----------
const b64u = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - str.length % 4) % 4)), c => c.charCodeAt(0));
const GOOGLE_ISS = ['accounts.google.com', 'https://accounts.google.com'];
let googleKeys = null; // { keys, exp } (cache em memória)
async function googleKey(kid) {
  if (!googleKeys || googleKeys.exp < Date.now() || !googleKeys.keys.some(k => k.kid === kid)) {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    const age = +((/max-age=(\d+)/.exec(r.headers.get('cache-control') || '') || [])[1]) || 3600;
    googleKeys = { keys: (await r.json()).keys || [], exp: Date.now() + age * 1000 };
  }
  return googleKeys.keys.find(k => k.kid === kid) || null;
}
async function verifyGoogle(token, clientId) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || !clientId) return null;
  const dec = new TextDecoder();
  const head = JSON.parse(dec.decode(b64u(parts[0]))), body = JSON.parse(dec.decode(b64u(parts[1])));
  if (head.alg !== 'RS256') return null;
  const jwk = await googleKey(head.kid); if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  const now = Date.now() / 1000;
  if (!ok || !GOOGLE_ISS.includes(body.iss) || body.aud !== clientId || !(body.exp > now) || !body.sub) return null;
  if (body.email && body.email_verified === false) return null;
  return { sub: String(body.sub), email: txt(body.email, 120) };
}
// compara sem vazar o tempo
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

export class Accounts {
  constructor(state, env) { this.state = state; this.env = env; this.st = state.storage; this.fails = new Map(); }

  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: H });
    const url = new URL(req.url), path = url.pathname;
    try {
      if (path === '/internal/resolve') return json(await this.resolve(await req.json()));
      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
      if (path === '/api/register') return await this.register(body);
      if (path === '/api/login') return await this.login(body);
      if (path === '/api/google') return await this.google(body, await this.auth(req, true));
      if (path === '/api/handoff/redeem') return await this.redeem(body);
      let m = path.match(/^\/api\/profile\/(\d{10})$/);
      if (m && req.method === 'GET') return await this.publicProfile(m[1], await this.auth(req, true));
      const me = await this.auth(req);
      if (!me) return fail('Você precisa entrar na sua conta.', 401);
      if (path === '/api/me') { await this.seen(me); return json({ account: this.mine(me) }); }
      if (path === '/api/logout') { await this.st.delete('t:' + me._token); return json({ ok: true }); }
      if (path === '/api/profile') return await this.saveProfile(me, body);
      if (path === '/api/rename') return await this.rename(me, body);
      if (path === '/api/stats') return await this.saveStats(me, body);
      m = path.match(/^\/api\/like\/(\d{10})$/);
      if (m) return await this.like(me, m[1]);
      if (path === '/api/admin/claim') return await this.claim(me, body);
      if (path === '/api/admin/badges') return await this.setBadges(me, body);
      if (path === '/api/ping') { await this.seen(me); return json({ ok: true }); }
      if (path === '/api/google/unlink') return await this.googleUnlink(me);
      if (path === '/api/password') return await this.setPassword(me, body);
      if (path === '/api/handoff') return await this.handoff(me);
      if (path === '/api/friends') return await this.friends(me);
      m = path.match(/^\/api\/friends\/(add|accept|decline|remove)$/);
      if (m) return await this.friendAction(me, m[1], body);
      return fail('Rota não encontrada.', 404);
    } catch (e) {
      return fail('Erro no servidor.', 500);
    }
  }

  // ---------- sessão ----------
  async auth(req, optional) {
    const h = req.headers.get('Authorization') || '', tok = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!/^[0-9a-f]{64}$/.test(tok)) return null;
    const t = await this.st.get('t:' + tok);
    if (!t || t.exp < Date.now()) { if (t) await this.st.delete('t:' + tok); return null; }
    const a = await this.st.get('a:' + t.id);
    if (a) a._token = tok;
    return a || null;
  }
  async newToken(id) {
    const tok = randHex(32);
    await this.st.put('t:' + tok, { id, exp: Date.now() + TOKEN_DAYS * 864e5 });
    return tok;
  }
  // o que o dono da conta vê (sem a senha)
  mine(a) { return { id: a.id, name: a.name, badges: a.badges, likes: a.likes, profile: a.profile, stats: a.stats, renameAt: a.renameAt || 0, google: a.google ? { email: a.google.email } : null, hasPass: !!a.hash, freeRename: !!a.autoName }; }
  pub(a) { return { id: a.id, name: a.name, badges: a.badges, likes: a.likes, profile: a.profile, stats: a.stats, created: a.created }; }

  cleanProfile(p, old) {
    p = p && typeof p === 'object' ? p : {};
    const o = old || { look: {}, bio: '', avatarBg: 0, cover: 'br', weapon: null, owned: [] };
    const look = Object.assign({}, o.look);
    if (p.look && typeof p.look === 'object') for (const k of LOOK_KEYS) if (p.look[k] != null) look[k] = txt(p.look[k], 24);
    return {
      look,
      bio: p.bio != null ? txt(p.bio, 80) : o.bio,
      avatarBg: p.avatarBg != null ? nint(p.avatarBg, 7) : o.avatarBg,
      cover: p.cover != null && /^(br|duel1|duel2|g\d)$/.test(p.cover) ? p.cover : o.cover,
      weapon: p.weapon !== undefined ? (p.weapon && /^[a-z0-9]{2,8}$/.test(p.weapon) ? p.weapon : null) : o.weapon,
      owned: Array.isArray(p.owned) ? [...new Set(p.owned.filter(x => typeof x === 'string' && ITEM_RE.test(x)))].slice(0, 400) : (o.owned || []),
    };
  }
  checkName(name) {
    if (!NAME_RE.test(name)) return 'O nome precisa ter de 3 a 16 letras, números, _ . ou -';
    if (RESERVED.includes(name.toLowerCase())) return 'Esse nome é reservado.';
    return null;
  }
  async newId() {
    for (let i = 0; i < 20; i++) {
      const id = String(1000000000 + Math.floor(Math.random() * 8999999999));
      if (!(await this.st.get('a:' + id))) return id;
    }
    throw new Error('sem id');
  }
  // trava tentativas de senha em sequência (8 erros = 1 minuto esperando)
  locked(name) { const f = this.fails.get(name); return f && f.n >= 8 && Date.now() - f.t < 60000; }
  failed(name) { const f = this.fails.get(name) || { n: 0, t: 0 }; if (Date.now() - f.t > 60000) f.n = 0; f.n++; f.t = Date.now(); this.fails.set(name, f); }

  // ---------- rotas ----------
  async register(b) {
    const name = String(b.name || '').trim().slice(0, 32), pass = String(b.pass || '');
    const bad = this.checkName(name); if (bad) return fail(bad);
    if (pass.length < 6 || pass.length > 64) return fail('A senha precisa ter de 6 a 64 caracteres.');
    const key = 'u:' + name.toLowerCase();
    if (await this.st.get(key)) return fail('Esse nome já tem dono. Escolha outro.');
    const id = await this.newId(), salt = randHex(16);
    const a = { id, name, salt, hash: await hashPass(pass, salt), created: Date.now(), badges: [], likes: 0,
      profile: this.cleanProfile(b.profile), stats: this.cleanStats(b.stats) };
    await this.st.put(key, id); await this.st.put('a:' + id, a);
    return json({ token: await this.newToken(id), account: this.mine(a) });
  }
  async login(b) {
    const name = txt(b.name, 16).toLowerCase(), pass = String(b.pass || '');
    if (this.locked(name)) return fail('Muitas tentativas. Espere 1 minuto.', 429);
    const id = await this.st.get('u:' + name), a = id && await this.st.get('a:' + id);
    if (a && !a.hash) return fail('Essa conta entra com o Google (botão "Entrar com Google").', 401);
    if (!a || !same(await hashPass(pass, a.salt), a.hash)) { this.failed(name); return fail('Nome ou senha errados.', 401); }
    this.fails.delete(name);
    return json({ token: await this.newToken(a.id), account: this.mine(a) });
  }
  // ---------- Google ----------
  async google(b, me) {
    const g = await verifyGoogle(b.idToken, this.env.GOOGLE_CLIENT_ID).catch(() => null);
    if (!g) return fail(this.env.GOOGLE_CLIENT_ID ? 'Não deu pra confirmar o login do Google. Tente de novo.' : 'O login com Google ainda não foi ativado no servidor.', 401);
    // ligar o Google a uma conta (logado no navegador, ou o app mandou um código da sessão dele)
    if (!me && b.linkCode) { const h = await this.takeHandoff(b.linkCode); if (h) { me = await this.st.get('a:' + h.id); if (me) me._token = h.token; } }
    const owner = await this.st.get('g:' + g.sub);
    if (me && (b.linkCode || b.link)) {
      if (owner && owner !== me.id) return fail('Esse Google já está ligado a outra conta.');
      if (me.google && me.google.sub !== g.sub) await this.st.delete('g:' + me.google.sub);
      me.google = g; const tok = me._token; delete me._token;
      await this.st.put('g:' + g.sub, me.id); await this.st.put('a:' + me.id, me);
      return json({ token: tok, account: this.mine(me), linked: true });
    }
    // entrar: já tem conta com esse Google
    if (owner) { const a = await this.st.get('a:' + owner); if (a) return json({ token: await this.newToken(a.id), account: this.mine(a) }); }
    // primeira vez: cria a conta (sem senha) com um nome livre
    const name = await this.freeName([String(b.name || ''), (g.email || '').split('@')[0]]);
    const id = await this.newId();
    const a = { id, name, salt: null, hash: null, google: g, autoName: true, created: Date.now(), badges: [], likes: 0,
      profile: this.cleanProfile(b.profile), stats: this.cleanStats(b.stats) };
    await this.st.put('u:' + name.toLowerCase(), id); await this.st.put('g:' + g.sub, id); await this.st.put('a:' + id, a);
    return json({ token: await this.newToken(id), account: this.mine(a), created: true });
  }
  async freeName(wish) {
    const clean = n => n.normalize('NFC').replace(/[^A-Za-z0-9_.\-À-ÿ]/g, '').slice(0, 12);
    for (const w of wish.map(clean)) {
      if (w.length >= 3 && w.toLowerCase() !== 'jogador' && !this.checkName(w) && !(await this.st.get('u:' + w.toLowerCase()))) return w;
    }
    const base = (wish.map(clean).find(w => w.length >= 3 && w.toLowerCase() !== 'jogador') || 'Sobrevivente').slice(0, 11);
    for (let i = 0; i < 30; i++) { const n = base + Math.floor(1000 + Math.random() * 9000); if (!(await this.st.get('u:' + n.toLowerCase()))) return n; }
    throw new Error('sem nome');
  }
  async googleUnlink(a) {
    if (!a.google) return json({ account: this.mine(a) });
    if (!a.hash) return fail('Sua conta só entra pelo Google. Crie uma senha antes de desligar.');
    await this.st.delete('g:' + a.google.sub); delete a.google; delete a._token; await this.st.put('a:' + a.id, a);
    return json({ account: this.mine(a) });
  }
  async setPassword(a, b) {
    if (a.hash) return fail('Sua conta já tem senha.');
    const pass = String(b.pass || '');
    if (pass.length < 6 || pass.length > 64) return fail('A senha precisa ter de 6 a 64 caracteres.');
    a.salt = randHex(16); a.hash = await hashPass(pass, a.salt); delete a._token; await this.st.put('a:' + a.id, a);
    return json({ account: this.mine(a) });
  }
  // código de uso único pra levar a sessão de um lugar pro outro (navegador → app, app → navegador pra ligar o Google)
  async handoff(a) {
    const code = randHex(16);
    await this.st.put('h:' + code, { id: a.id, token: a._token, exp: Date.now() + 180000 });
    return json({ code });
  }
  async takeHandoff(code) {
    if (!/^[0-9a-f]{32}$/.test(String(code || ''))) return null;
    const h = await this.st.get('h:' + code); if (!h) return null;
    await this.st.delete('h:' + code);
    return h.exp > Date.now() ? h : null;
  }
  async redeem(b) {
    const h = await this.takeHandoff(b.code); if (!h) return fail('Código vencido. Tente entrar de novo.', 401);
    const a = await this.st.get('a:' + h.id); if (!a) return fail('Conta não encontrada.', 404);
    return json({ token: await this.newToken(a.id), account: this.mine(a) });
  }
  async saveProfile(a, b) {
    a.profile = this.cleanProfile(b, a.profile);
    delete a._token; await this.st.put('a:' + a.id, a);
    return json({ account: this.mine(a) });
  }
  async rename(a, b) {
    const name = String(b.name || '').trim().slice(0, 32);
    const bad = this.checkName(name); if (bad) return fail(bad);
    if (name === a.name) return json({ account: this.mine(a) });
    const caseOnly = name.toLowerCase() === a.name.toLowerCase();
    const free = caseOnly || !!a.autoName; // só maiúsculas/minúsculas, ou o nome automático da conta do Google
    a.stats = this.cleanStats(a.stats);
    if (!free && a.stats.coins < RENAME_COST) return fail('Moedas insuficientes: trocar de nome custa ' + RENAME_COST.toLocaleString('pt-BR') + ' (você tem ' + a.stats.coins.toLocaleString('pt-BR') + ').');
    const key = 'u:' + name.toLowerCase(), owner = await this.st.get(key);
    if (owner && owner !== a.id) return fail('Esse nome já tem dono. Escolha outro.');
    if (!caseOnly) { await this.st.delete('u:' + a.name.toLowerCase()); a.renameAt = Date.now(); }
    if (!free) a.stats.coins -= RENAME_COST;
    delete a.autoName;
    await this.st.put(key, a.id);
    a.name = name; delete a._token; await this.st.put('a:' + a.id, a);
    return json({ account: this.mine(a), paid: free ? 0 : RENAME_COST });
  }
  cleanStats(s) { s = s && typeof s === 'object' ? s : {}; const o = {}; for (const k of STAT_KEYS) o[k] = nint(s[k], 1e9); return o; }
  async saveStats(a, b) {
    a.stats = this.cleanStats(b.stats);
    delete a._token; await this.st.put('a:' + a.id, a);
    return json({ ok: true });
  }
  async publicProfile(id, viewer) {
    const a = await this.st.get('a:' + id);
    if (!a) return fail('Nenhum jogador com esse ID.', 404);
    const liked = viewer ? !!(await this.st.get('l:' + id + ':' + viewer.id)) : false;
    return json({ profile: this.pub(a), liked });
  }
  async like(me, id) {
    if (id === me.id) return fail('Não dá pra curtir o próprio perfil.');
    const a = await this.st.get('a:' + id);
    if (!a) return fail('Nenhum jogador com esse ID.', 404);
    const k = 'l:' + id + ':' + me.id, had = await this.st.get(k);
    if (had) { await this.st.delete(k); a.likes = Math.max(0, a.likes - 1); } else { await this.st.put(k, 1); a.likes++; }
    await this.st.put('a:' + id, a);
    return json({ liked: !had, likes: a.likes });
  }
  async claim(a, b) {
    if (this.locked('#claim')) return fail('Muitas tentativas. Espere 1 minuto.', 429);
    const key = String(this.env.ADMIN_KEY || '');
    if (key.length < 12) return fail('A chave de admin não foi configurada no servidor (npx wrangler secret put ADMIN_KEY).');
    if (!same(String(b.key || ''), key)) { this.failed('#claim'); return fail('Chave errada.', 403); }
    for (const x of ['owner', 'dev', 'verificado']) if (!a.badges.includes(x)) a.badges.push(x);
    delete a._token; await this.st.put('a:' + a.id, a);
    return json({ account: this.mine(a) });
  }
  async setBadges(me, b) {
    if (!me.badges.includes('owner')) return fail('Só o owner pode dar selos.', 403);
    const a = await this.st.get('a:' + String(b.id || ''));
    if (!a) return fail('Nenhum jogador com esse ID.', 404);
    a.badges = (Array.isArray(b.badges) ? b.badges : []).filter((x, i, l) => BADGES.includes(x) && l.indexOf(x) === i);
    await this.st.put('a:' + a.id, a);
    return json({ profile: this.pub(a) });
  }

  // ---------- amizades ----------
  // guardado na própria conta: friends (amigos), fin (pedidos recebidos), fout (pedidos enviados)
  async seen(a) { await this.st.put('s:' + a.id, Date.now()); }
  lists(a) { a.friends = a.friends || []; a.fin = a.fin || []; a.fout = a.fout || []; return a; }
  async card(id) {
    const a = await this.st.get('a:' + id); if (!a) return null;
    const last = (await this.st.get('s:' + id)) || 0;
    return { id: a.id, name: a.name, badges: a.badges, avatarBg: (a.profile && a.profile.avatarBg) || 0, look: a.profile && a.profile.look, online: Date.now() - last < ONLINE_MS, last };
  }
  async friends(me) {
    await this.seen(me); this.lists(me);
    const map = async ids => (await Promise.all(ids.map(id => this.card(id)))).filter(Boolean);
    const friends = await map(me.friends);
    friends.sort((x, y) => (y.online - x.online) || y.last - x.last);
    return json({ friends, incoming: await map(me.fin), outgoing: await map(me.fout) });
  }
  async save(a) { delete a._token; await this.st.put('a:' + a.id, a); }
  async friendAction(me, act, b) {
    this.lists(me);
    let other;
    if (act === 'add') {
      const q = String(b.query || '').trim();
      const id = /^\d{10}$/.test(q) ? q : await this.st.get('u:' + q.toLowerCase());
      other = id && await this.st.get('a:' + id);
      if (!other) return fail('Nenhum jogador com esse ID ou nome.', 404);
    } else {
      other = await this.st.get('a:' + String(b.id || ''));
      if (!other) return fail('Jogador não encontrado.', 404);
    }
    this.lists(other);
    if (other.id === me.id) return fail('Esse é você! 😄');
    const del = (l, x) => { const i = l.indexOf(x); if (i >= 0) l.splice(i, 1); };
    let msg = '';
    if (act === 'add') {
      if (me.friends.includes(other.id)) return fail('Vocês já são amigos.');
      if (me.friends.length >= MAX_FRIENDS) return fail('Você chegou no limite de ' + MAX_FRIENDS + ' amigos.');
      if (me.fin.includes(other.id)) { // a outra pessoa já tinha pedido: vira amizade direto
        del(me.fin, other.id); del(other.fout, me.id); me.friends.push(other.id); other.friends.push(me.id); msg = 'Agora vocês são amigos!';
      } else {
        if (me.fout.includes(other.id)) return fail('Pedido já enviado. Espere a resposta.');
        if (other.fin.length >= 100) return fail('Essa pessoa tem pedidos demais. Tente depois.');
        me.fout.push(other.id); other.fin.push(me.id); msg = 'Pedido enviado pra ' + other.name + '!';
      }
    } else if (act === 'accept') {
      if (!me.fin.includes(other.id)) return fail('Esse pedido não existe mais.');
      del(me.fin, other.id); del(other.fout, me.id);
      if (!me.friends.includes(other.id)) me.friends.push(other.id);
      if (!other.friends.includes(me.id)) other.friends.push(me.id);
      msg = 'Agora você e ' + other.name + ' são amigos!';
    } else if (act === 'decline') { // recusar o pedido recebido ou cancelar o enviado
      del(me.fin, other.id); del(other.fout, me.id); del(me.fout, other.id); del(other.fin, me.id); msg = 'Pedido removido.';
    } else if (act === 'remove') { del(me.friends, other.id); del(other.friends, me.id); msg = other.name + ' saiu da sua lista de amigos.'; }
    await this.save(me); await this.save(other);
    const r = await this.friends(me), d = await r.json();
    return json(Object.assign({ msg }, d));
  }

  // ---------- pra partida online: nome de verdade de quem tem conta ----------
  // com conta: usa o nome da conta. Sem conta: pode usar um nome, menos o de uma conta (aí vira Convidado).
  async resolve(b) {
    const tok = String(b.token || '');
    if (/^[0-9a-f]{64}$/.test(tok)) {
      const t = await this.st.get('t:' + tok);
      const a = t && t.exp > Date.now() && await this.st.get('a:' + t.id);
      if (a) return { name: a.name, id: a.id, badges: a.badges };
    }
    const name = txt(b.name, 16) || 'Jogador';
    if (await this.st.get('u:' + name.toLowerCase()) || RESERVED.includes(name.toLowerCase())) return { name: 'Convidado' + Math.floor(1000 + Math.random() * 9000) };
    return { name };
  }
}
