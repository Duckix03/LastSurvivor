// Contas: nome único com senha, guardado no servidor (server/src/accounts.js). Sem conta = convidado
// (joga normal, mas o nome não é protegido e não tem curtidas nem selos).
// O login fica salvo neste navegador (token). O perfil (visual, recado, foto, capa) e as estatísticas
// são salvos na conta sozinhos, então aparecem em qualquer computador que você entrar.
'use strict';
LS.Account = {
  KEY: 'lastsurvivor_auth', CACHE: 'lastsurvivor_acc',
  token: null, me: null,

  init() {
    try { this.token = localStorage.getItem(this.KEY) || null; this.me = JSON.parse(localStorage.getItem(this.CACHE) || 'null'); } catch (e) { /* ignora */ }
    // salvar o perfil/estatísticas no navegador também salva na conta (com um pequeno atraso)
    const sp = LS.saveProfile, ss = LS.saveStats;
    LS.saveProfile = () => { sp(); this.save(); };
    LS.saveStats = () => { ss(); this.saveStats(); };
    if (this.token && this.me) this.apply(this.me, true); // mostra já o que estava guardado
    if (this.token) this.refresh();
  },
  available() { return !!LS.NET_URL; },
  logged() { return !!(this.token && this.me); },

  async api(path, body, method) {
    if (!this.available()) throw new Error('O jogo está sem servidor configurado (LS.NET_URL).');
    let r;
    try {
      r = await fetch(LS.NET_URL.replace(/\/$/, '') + path, {
        method: method || (body ? 'POST' : 'GET'),
        headers: Object.assign({ 'Content-Type': 'application/json' }, this.token ? { Authorization: 'Bearer ' + this.token } : {}),
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) { throw new Error('Não deu pra falar com o servidor. Confira a internet.'); }
    const d = await r.json().catch(() => ({ error: 'O servidor respondeu algo estranho (ele já foi atualizado?).' }));
    if (!r.ok) {
      if (r.status === 401 && this.token && !/^\/api\/(login|google|handoff|password)/.test(path)) this.drop(); // sessão vencida
      throw new Error(d.error || 'Erro ' + r.status);
    }
    return d;
  },
  async refresh() { try { const d = await this.api('/api/me'); this.apply(d.account); } catch (e) { /* sem internet: segue com o guardado */ } },

  // coloca os dados da conta no jogo (a conta manda: nome, ID, selos, curtidas, visual...)
  apply(acc, fromCache) {
    const P = LS.playerProfile;
    if (!P.guestId && P.id && P.id !== acc.id) P.guestId = P.id; // ID de convidado deste navegador (volta se sair da conta)
    this.me = acc;
    try { localStorage.setItem(this.CACHE, JSON.stringify(acc)); } catch (e) { /* ignora */ }
    P.name = acc.name; P.id = acc.id; P.badges = acc.badges || []; P.likes = acc.likes || 0;
    const pr = acc.profile || {};
    if (pr.look && Object.keys(pr.look).length) Object.assign(P.look, pr.look);
    if (pr.bio != null) P.bio = pr.bio;
    P.avatar = { type: '3d', bg: pr.avatarBg || 0 }; P.cover = pr.cover || 'br';
    if (pr.weapon !== undefined) P.weapon = pr.weapon;
    if (Array.isArray(pr.owned)) P.owned = [...new Set([...(P.owned || []), ...pr.owned])]; // itens da loja (junta com os deste navegador)
    if (!fromCache && acc.stats) {
      if ((acc.stats.games || 0) > 0 || (acc.stats.xp || 0) > 0) Object.assign(LS.stats, acc.stats);
      else this.saveStats(true); // conta nova: leva as estatísticas deste navegador pra ela
    }
    this._quiet = true; LS.saveProfile(); localStorage.setItem('lastsurvivor_stats', JSON.stringify(LS.stats)); this._quiet = false;
    this.refreshUI();
  },
  refreshUI() {
    if (LS.Maint) LS.Maint.sync(); // entrou/saiu da conta: DEV passa pela manutenção
    if (LS.Menu && LS.Profile && LS.Profile.bound) LS.Menu.render();
    if (LS.Lobby && LS.Lobby.built) { LS.Lobby.model.applyLook(LS.playerProfile.look); LS.Lobby.model.setGun(LS.playerProfile.weapon || null); LS.Lobby.syncUI(); }
    const n = document.getElementById('lobby-name');
    if (n) n.disabled = false; // só leitura; tocar abre o perfil (trocar de nome custa moedas)
    if (LS.UI && LS.UI.current === 'panel-stats' && LS.Profile.bound) LS.Profile.render();
  },
  setToken(t) { this.token = t; try { localStorage.setItem(this.KEY, t); } catch (e) { /* ignora */ } },
  drop() {
    const P = LS.playerProfile;
    this.token = null; this.me = null;
    try { localStorage.removeItem(this.KEY); localStorage.removeItem(this.CACHE); } catch (e) { /* ignora */ }
    P.badges = []; P.likes = 0; P.id = P.guestId || String(1000000000 + Math.floor(Math.random() * 8999999999));
    this._quiet = true; LS.saveProfile(); this._quiet = false;
    this.refreshUI(); if (LS.Profile && LS.Profile.bound) LS.Profile.renderTop();
  },

  // ---------- ações ----------
  payload() { const P = LS.playerProfile; return { look: P.look, bio: P.bio, avatarBg: (P.avatar && P.avatar.bg) || 0, cover: P.cover, weapon: P.weapon || null, owned: P.owned || [] }; },
  async register(name, pass) { const d = await this.api('/api/register', { name, pass, profile: this.payload(), stats: LS.stats }); this.setToken(d.token); this.apply(d.account); },
  async login(name, pass) { const d = await this.api('/api/login', { name, pass }); this.setToken(d.token); this.apply(d.account); },
  // Google: idToken vem do botão do Google. Logado = liga o Google nesta conta; sem conta = entra (ou cria)
  async google(idToken, extra) {
    const link = this.logged();
    const d = await this.api('/api/google', Object.assign({ idToken, link, name: LS.playerProfile.name, profile: this.payload(), stats: LS.stats }, extra || {}));
    return d;
  },
  async googleLogin(idToken) { const d = await this.google(idToken); this.setToken(d.token); this.apply(d.account); return d; },
  async googleUnlink() { const d = await this.api('/api/google/unlink', {}); this.apply(d.account); },
  async setPassword(pass) { const d = await this.api('/api/password', { pass }); this.apply(d.account); },
  async handoff() { return (await this.api('/api/handoff', {})).code; },
  async redeem(code) { const d = await this.api('/api/handoff/redeem', { code }); this.setToken(d.token); this.apply(d.account); return d; },
  // diamantes e codiguins (o servidor guarda os diamantes)
  async buyDiamond(item) { const d = await this.api('/api/buy', { item }); this.apply(d.account); return d; },
  async daily() { const d = await this.api('/api/daily', {}); this.apply(d.account); return d; },
  async redeemCode(code) {
    const d = await this.api('/api/redeem', { code }); const R = d.reward;
    if (R.coins) { LS.stats.coins = (LS.stats.coins || 0) + R.coins; LS.saveStats(); }
    this.apply(d.account);
    if (R.item && LS.Cosmetics.byId[R.item]) LS.Cosmetics.give(R.item); // libera as peças (fantasia)
    return R;
  },
  async adminCodes() { return (await this.api('/api/admin/codes', null, 'GET')).codes; },
  async adminCreateCode(o) { return (await this.api('/api/admin/codes/create', o)).code; },
  async adminDeleteCode(code) { return (await this.api('/api/admin/codes/delete', { code })).codes; },
  // criadores de conteúdo: codiguins próprios dentro dos limites do owner
  async ccState() { return await this.api('/api/cc/codes', null, 'GET'); },
  async ccCreate(o) { return await this.api('/api/cc/codes/create', o); },
  async ccDelete(code) { return await this.api('/api/cc/codes/delete', { code }); },
  async adminGame(set) { return (await this.api('/api/admin/game', set || null, set ? 'POST' : 'GET')).game; },
  async ccLimits(set) { return (await this.api('/api/admin/cc-limits', set || null, set ? 'POST' : 'GET')).limits; },
  async logout() { try { await this.api('/api/logout', {}); } catch (e) { /* tanto faz */ } this.drop(); },
  // troca o nome da conta: o servidor cobra as moedas (manda as moedas atuais antes, pra ele saber quantas tem)
  async rename(name) {
    await this.api('/api/stats', { stats: LS.stats });
    const d = await this.api('/api/rename', { name });
    if (d.account.stats) { LS.stats.coins = d.account.stats.coins; localStorage.setItem('lastsurvivor_stats', JSON.stringify(LS.stats)); }
    this.apply(d.account); return d;
  },
  async claim(key) { const d = await this.api('/api/admin/claim', { key }); this.apply(d.account); },
  async setBadges(id, badges) { return (await this.api('/api/admin/badges', { id, badges })).profile; },
  async profile(id) { return await this.api('/api/profile/' + id); },
  async like(id) { return await this.api('/api/like/' + id, {}); },
  save() {
    if (!this.logged() || this._quiet) return;
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.api('/api/profile', this.payload()).then(d => { this.me = d.account; try { localStorage.setItem(this.CACHE, JSON.stringify(d.account)); } catch (e) { } }).catch(() => {}), 800);
  },
  saveStats(now) {
    if (!this.logged() || (this._quiet && !now)) return;
    clearTimeout(this._statT);
    this._statT = setTimeout(() => this.api('/api/stats', { stats: LS.stats }).catch(() => {}), now ? 0 : 1500);
  }
};

// "X jogando" do lado do título no lobby: cada aba aberta manda um sinal a cada 40 s (código aleatório da aba,
// não identifica ninguém) e o servidor devolve quantas abas mandaram sinal no último minuto e meio.
LS.Presence = {
  n: null, timer: null,
  init() {
    if (!LS.NET_URL) return;
    try { this.sid = sessionStorage.getItem('ls_sid'); } catch (e) { /* ignora */ }
    if (!this.sid) { const a = new Uint8Array(12); crypto.getRandomValues(a); this.sid = Array.from(a, b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); try { sessionStorage.setItem('ls_sid', this.sid); } catch (e) { /* ignora */ } }
    this.ping();
    this.timer = setInterval(() => { if (!document.hidden) this.ping(); }, 40000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.ping(); });
  },
  async ping() {
    try {
      const r = await fetch(LS.NET_URL.replace(/\/$/, '') + '/api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid: this.sid }) });
      const j = await r.json();
      if (typeof j.online === 'number') this.show(Math.max(1, j.online)); // no mínimo você
      if (j.theme) LS.LobbyThemes.setServer(j.theme); // tema do lobby escolhido pelo dono do jogo
      if (j.maint !== undefined) LS.Maint.set(j.maint, j.msg);
    } catch (e) { /* sem internet/servidor: some o contador */ this.show(null); }
  },
  show(n) {
    const box = document.getElementById('lb-online'), el = document.getElementById('lb-online-n');
    if (!box || !el) return;
    if (n === null) { box.classList.add('hidden'); return; }
    const from = this.n === null ? n : this.n; this.n = n;
    box.classList.remove('hidden');
    // conta subindo/descendo rapidinho até o número novo
    const t0 = performance.now(), fmt = v => Math.round(v).toLocaleString('pt-BR');
    const step = now => { const k = Math.min(1, (now - t0) / 700); el.textContent = fmt(from + (n - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    box.title = n === 1 ? 'Só você com o jogo aberto agora' : n.toLocaleString('pt-BR') + ' pessoas com o jogo aberto agora';
  }
};

// MANUTENÇÃO: quando o dono liga (ADMIN → MANUTENÇÃO), só ele e quem tem o selo DEV entram no jogo.
// Os outros veem esta tela no menu (o servidor também recusa a fila e as salas). Sem internet não bloqueia.
LS.Maint = {
  on: false, msg: '',
  staff() { const a = LS.Account, b = a && a.logged() && a.me ? a.me.badges || [] : []; return b.includes('owner') || b.includes('dev'); },
  set(on, msg) { this.on = !!on; this.msg = msg || ''; this.sync(); },
  recheck() { LS.Presence.ping(); },
  sync() {
    const G = LS.Game, idle = !G || G.state === 'menu' || G.state === 'lobby', staff = this.staff();
    document.body.classList.toggle('ls-maint-staff', this.on && staff);
    const show = this.on && !staff && idle && !(LS.UI && LS.UI.current === 'panel-settings'); // configurações abertas = entrando na conta
    let el = document.getElementById('maint');
    if (!show) { if (el) el.remove(); return; }
    if (LS.Lobby && LS.Lobby.searching) LS.Lobby.cancelSearch();
    if (!el) {
      el = document.createElement('div'); el.id = 'maint';
      el.innerHTML = '<div class="mt-box"><div class="mt-icon"><svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" fill="currentColor"/></svg></div>' +
        '<h1>Estamos atualizando o jogo!</h1><p>O Last Survivor está em manutenção rapidinho pra receber novidades. Volte daqui a pouquinho!</p><div class="mt-msg hidden"></div>' +
        '<div class="mt-btns"><button class="btn btn-primary mt-retry">TENTAR DE NOVO</button><button class="btn mt-dev">SOU DEV · ENTRAR</button></div><small class="mt-who"></small></div>';
      document.body.appendChild(el);
      el.querySelector('.mt-retry').addEventListener('click', e => { const b = e.currentTarget; b.disabled = true; b.textContent = 'CONFERINDO…'; this.recheck(); setTimeout(() => { b.disabled = false; b.textContent = 'TENTAR DE NOVO'; }, 1500); });
      el.querySelector('.mt-dev').addEventListener('click', () => { LS.UI.onAction('settings'); LS.UI.setTab('conta'); this.sync(); });
    }
    const m = el.querySelector('.mt-msg'); m.textContent = this.msg; m.classList.toggle('hidden', !this.msg);
    const a = LS.Account; el.querySelector('.mt-who').textContent = a && a.logged() && a.me ? 'Você entrou como ' + a.me.name + ' (sem selo DEV).' : '';
  }
};
