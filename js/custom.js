// SALAS PERSONALIZADAS (só com amigos): X1 até 10v10 na ilha plana.
//  - Criar sala (precisa de conta): ID de 7 números, nome, senha opcional, jogadores por time (1 a 10), rounds (4 a 16)
//  - Entrar: lista das salas abertas dos seus amigos ou pelo ID (+ senha). O servidor só deixa entrar amigo do dono.
//  - Sala: vagas dos times em cima (AZUL x VERMELHO), espectadores embaixo. Toque numa vaga pra trocar.
//  - Partida: loja de armas a cada 2 rounds, cada jogador escolhe as SUAS 2 armas (dá pra trocar até o tempo acabar);
//    as armas não "acabam" como no duelo. Muros que descem e zona que fecha. Sem kill, moedas ou XP: é só diversão.
// DUELO EM PARTY (arena 'duel'): a mesma partida de sala, mas no galpão do duelo, a dupla da party contra 2 bots
// (os bots rodam no navegador do host). Entra pelo LS.Party (joinDuel), sem painel de sala.
'use strict';
LS.Custom = {
  ws: null, you: null, room: null, game: null, view: 'list', err: '', inGame: false, fighting: false, kills: 0,
  TEAM: { a: { name: 'AZUL', col: '#2fd6ff' }, b: { name: 'VERMELHO', col: '#ff4d6d' } },

  // ---------- painel ----------
  init() {
    const box = document.getElementById('custom-body');
    document.getElementById('panel-custom').addEventListener('click', e => { // no painel todo: os botões de baixo ficam fora do conteúdo que rola
      const el = e.target.closest('[data-cu]'); if (!el) return;
      LS.Audio.init(); LS.Audio.click();
      const a = el.dataset.cu;
      if (a === 'create') this.create();
      else if (a === 'join') this.joinFromInput();
      else if (a === 'enter') this.askJoin(el.dataset.id, el.dataset.lock === '1');
      else if (a === 'refresh') this.list();
      else if (a === 'login') { LS.UI.showScreen('panel-stats'); LS.Profile.open(); LS.Profile.openAuth('register', 'Crie uma conta (ou entre) pra jogar com os amigos.'); }
      else if (a === 'slot') this.send({ t: 'slot', s: el.dataset.s, i: +el.dataset.i });
      else if (a === 'kick') this.send({ t: 'kick', pid: el.dataset.pid });
      else if (a === 'start') this.send({ t: 'start' });
      else if (a === 'leave') this.leave();
      else if (a === 'back') LS.UI.back(); // o VOLTAR já sai da sala
      else if (a === 'copy') { try { navigator.clipboard.writeText(this.room.id); this.toast('ID copiado: ' + this.room.id); } catch (er) { this.toast('ID: ' + this.room.id); } }
      else if (a === 'showpass') { const i = document.getElementById('cu-pass'); if (i) i.type = i.type === 'password' ? 'text' : 'password'; }
    });
    box.addEventListener('change', e => {
      const id = e.target.id;
      if (id === 'cu-size') this.send({ t: 'set', size: +e.target.value });
      else if (id === 'cu-rounds') this.send({ t: 'set', rounds: +e.target.value });
      else if (id === 'cu-name') this.send({ t: 'set', name: e.target.value });
      else if (id === 'cu-pass') this.send({ t: 'set', pass: e.target.value });
      else if (id === 'cu-gel') this.send({ t: 'set', gelInf: e.target.value === '1' });
    });
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'cu-id' || e.target.id === 'cu-jpass')) this.joinFromInput(); });
  },
  open() {
    this.err = '';
    LS.UI.openPanel('panel-custom');
    if (this.ws && this.room) { this.view = 'room'; this.render(); return; }
    this.view = 'list'; this.rooms = null; this.render(); this.list();
  },
  url(p) { return LS.NET_URL.replace(/\/$/, '') + p; },
  async post(p, body) { // texto puro: sem "preflight" de CORS
    const r = await fetch(this.url(p), { method: 'POST', body: JSON.stringify(Object.assign({ auth: LS.Account && LS.Account.token }, body || {})) });
    return r.json();
  },
  async list() {
    if (!LS.Account.logged() || !LS.NET_URL) return;
    try { const d = await this.post('/room/list'); if (d.err) this.err = d.err; this.rooms = d.rooms || []; }
    catch (e) { this.err = 'Servidor fora do ar. Tente de novo daqui a pouco.'; this.rooms = []; }
    if (this.view === 'list') this.render();
  },
  async create() {
    if (this.busy) return; this.busy = true; this.err = ''; this.render();
    try { const d = await this.post('/room/new'); if (d.err || !d.id) { this.err = d.err || 'Não deu pra criar a sala.'; this.busy = false; this.render(); return; } this.connect(d.id, ''); }
    catch (e) { this.err = 'Servidor fora do ar. Tente de novo daqui a pouco.'; this.busy = false; this.render(); }
  },
  joinFromInput() {
    const id = (document.getElementById('cu-id').value || '').replace(/\D/g, ''), pass = document.getElementById('cu-jpass').value || '';
    if (id.length !== 7) { this.err = 'O ID da sala tem 7 números.'; this.render(); return; }
    this.connect(id, pass);
  },
  askJoin(id, lock) {
    if (!lock) { this.connect(id, ''); return; }
    const i = document.getElementById('cu-id'), p = document.getElementById('cu-jpass');
    i.value = id; p.value = ''; p.focus(); this.err = 'Essa sala tem senha: digite e toque em ENTRAR.'; this.renderMsg();
  },
  connect(id, pass) {
    this.leave(true);
    this.busy = true; this.err = ''; this.render();
    let ws; try { ws = new WebSocket(LS.Net.wsUrl('/ws/room/' + id)); } catch (e) { this.err = 'Erro ao conectar.'; this.busy = false; this.render(); return; }
    this.ws = ws; this.room = null;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', proto: LS.NET_PROTO, auth: LS.Account.token, pass, look: LS.playerProfile.look }));
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (ws === this.ws) this.onMsg(m); };
    ws.onclose = () => { if (ws !== this.ws) return; this.ws = null; this.busy = false; const was = this.inGame; this.room = null; if (was) this.exitMatch(); if (!this.err) this.err = 'Você saiu da sala.'; this.view = 'list'; if (LS.UI.current === 'panel-custom' || was) { if (was) LS.UI.showScreen('panel-custom'); this.render(); this.list(); } };
    ws.onerror = () => { if (ws === this.ws && !this.room) this.err = 'Não deu pra conectar na sala.'; };
  },
  leave(silent) {
    const ws = this.ws; this.ws = null; this.room = null; this.busy = false;
    if (this.pduel) { this.pduel = false; silent = true; document.getElementById('lobby-mm').classList.add('hidden'); }
    if (this.inGame) this.exitMatch();
    if (ws) { try { ws.close(); } catch (e) { } }
    if (!silent) { this.view = 'list'; this.err = ''; this.render(); this.list(); }
  },
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); },
  // duelo da party: entra com o ingresso que o PartyHub deu (sem painel de sala)
  joinDuel(id, ticket) {
    this.leave(true);
    let ws; try { ws = new WebSocket(LS.Net.wsUrl('/ws/pduel/' + id)); } catch (e) { LS.Party.toast('Não deu pra entrar no duelo.'); return; }
    this.ws = ws; this.room = null; this.pduel = true; this.err = ''; this.doneOk = false;
    const mm = document.getElementById('lobby-mm'), title = document.querySelector('#lobby-mm h3');
    mm.classList.remove('hidden'); title.textContent = 'DUELO EM PARTY'; document.getElementById('mm-count').textContent = 'esperando o seu amigo entrar…';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', proto: LS.NET_PROTO, ticket, look: LS.playerProfile.look }));
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (ws === this.ws) this.onMsg(m); };
    ws.onclose = () => {
      if (ws !== this.ws) return;
      this.ws = null; this.pduel = false; mm.classList.add('hidden'); title.textContent = 'PROCURANDO PARTIDA';
      const was = this.inGame;
      if (was) { this.exitMatch(); LS.Game.quitToMenu(); }
      if (!this.doneOk) LS.Party.toast(this.err || (was ? 'O duelo caiu.' : 'Não deu pra entrar no duelo.'));
    };
  },
  toast(t) { if (LS.HUD && LS.HUD.toast) LS.HUD.toast(t); const n = document.getElementById('cu-msg'); if (n) { n.textContent = t; n.className = 'cu-msg ok'; } },

  // ---------- mensagens do servidor ----------
  onMsg(m) {
    switch (m.t) {
      case 'welcome': this.you = m.you; return;
      case 'denied': this.err = m.why; return; // a conexão fecha logo depois
      case 'note': this.toast(m.msg); return;
      case 'room': this.room = m; this.busy = false; if (!this.inGame) { this.view = 'room'; if (LS.UI.current === 'panel-custom') this.render(); } return; // não puxa a tela de volta
      case 'game': this.begin(m); return;
      case 'phase': this.onPhase(m); return;
      case 'picks': this.picks = m.list; this.renderShop(); return;
      case 'lobby': this.exitMatch(); LS.UI.showScreen('panel-custom'); this.view = 'room'; this.render(); return;
      case 'done': this.doneOk = true; this.leave(true); LS.Game.quitToMenu(); return; // fim do duelo da party: volta pro lobby
    }
    if (this.inGame) LS.Net.onMsg(m);
  },

  // ---------- telas ----------
  esc(s) { return LS.Profile.esc(String(s == null ? '' : s)); },
  render() {
    const box = document.getElementById('custom-body'); if (!box) return;
    if (!LS.Account.logged()) {
      box.innerHTML = '<div class="fr-guest"><b>SALAS SÓ COM AMIGOS</b><p>Crie uma conta pra montar salas personalizadas e jogar X1 até 10v10 com os seus amigos.</p><button class="btn btn-primary" data-cu="login">CRIAR CONTA / ENTRAR</button></div>' +
        '<div class="panel-buttons"><button class="btn" data-cu="back">VOLTAR</button></div>';
      this.foot(box); return;
    }
    if (!LS.NET_URL) { box.innerHTML = '<div class="fr-guest"><b>ONLINE DESLIGADO</b><p>Esse jogo não tem servidor online configurado.</p></div><div class="panel-buttons"><button class="btn" data-cu="back">VOLTAR</button></div>'; this.foot(box); return; }
    box.innerHTML = this.view === 'room' && this.room ? this.roomHtml() : this.listHtml();
    this.foot(box);
    if (this.view === 'room' && this.room) this.fillAvatars(box);
  },
  // os botões (VOLTAR / SAIR / INICIAR) vão pra barra de baixo do painel, que não rola
  foot(box) {
    const f = document.getElementById('custom-foot'), b = box.querySelector(':scope > .panel-buttons');
    f.innerHTML = ''; if (b) { [...b.childNodes].forEach(n => f.appendChild(n)); b.remove(); }
  },
  renderMsg() { const n = document.getElementById('cu-msg'); if (n) { n.textContent = this.err; n.className = 'cu-msg' + (this.err ? '' : ' hidden'); } },
  thumb(cls) { return '<div class="cu-thumb ' + (cls || '') + '"><img src="' + this.mapThumb() + '" alt=""><span>ILHA PLANA</span></div>'; },
  listHtml() {
    const rs = this.rooms;
    let h = '<div class="cu-list">' +
      '<div class="cu-hero">' + this.thumb() + '<div class="cu-hero-txt"><b>SALA PERSONALIZADA</b><p>X1 até 10v10 com os seus amigos na ilha plana. Loja de armas a cada 2 rounds, muros que descem e zona fechando. <em>Sem kill, moedas ou XP: é só diversão.</em></p>' +
        '<button class="btn btn-primary" data-cu="create"' + (this.busy ? ' disabled' : '') + '>' + (this.busy ? 'CONECTANDO...' : 'CRIAR SALA') + '</button></div></div>' +
      '<div class="cu-join"><input id="cu-id" inputmode="numeric" maxlength="7" placeholder="ID da sala (7 números)" autocomplete="off"><input id="cu-jpass" type="password" maxlength="12" placeholder="Senha (se tiver)" autocomplete="off"><button class="btn" data-cu="join">ENTRAR</button></div>' +
      '<p id="cu-msg" class="cu-msg' + (this.err ? '' : ' hidden') + '">' + this.esc(this.err) + '</p>' +
      '<div class="fr-sec">SALAS DOS AMIGOS <em>' + (rs ? rs.length : '…') + '</em> <button class="cu-ref" data-cu="refresh">ATUALIZAR</button></div>';
    if (!rs) h += '<p class="fr-empty">Procurando...</p>';
    else if (!rs.length) h += '<p class="fr-empty">Nenhum amigo com sala aberta agora. Crie a sua e passe o ID!</p>';
    else h += rs.map(r => '<div class="cu-row">' + this.thumb('sm') + '<div class="cu-ri"><b>' + this.esc(r.name) + (r.hasPass ? ' <i class="cu-lock">' + LS.icon('lock') + '</i>' : '') + '</b>' +
      '<small>de ' + this.esc(r.hostName) + ' · ID ' + r.id + ' · ' + r.size + 'v' + r.size + ' · ' + r.rounds + ' rounds</small></div>' +
      '<span class="cu-n' + (r.state === 'game' ? ' live' : '') + '">' + (r.state === 'game' ? 'JOGANDO · ' : '') + r.n + '/' + (r.max + 10) + '</span>' +
      '<button class="btn small btn-primary" data-cu="enter" data-id="' + r.id + '" data-lock="' + (r.hasPass ? 1 : 0) + '">ENTRAR</button></div>').join('');
    return h + '</div><div class="panel-buttons"><button class="btn" data-cu="back">VOLTAR</button></div>';
  },
  member(pid) { return this.room && this.room.members.find(m => m.pid === pid); },
  roomHtml() {
    const R = this.room, own = R.owner === this.you, me = this.member(this.you), by = (t, i) => R.members.find(m => m.slot.t === t && m.slot.i === i);
    const nA = R.members.filter(m => m.slot.t === 'a').length, nB = R.members.filter(m => m.slot.t === 'b').length, nS = R.members.filter(m => m.slot.t === 's').length;
    const ready = nA > 0 && nB > 0;
    const opt = (a, b, v) => { let o = ''; for (let i = a; i <= b; i++) o += '<option value="' + i + '"' + (i === v ? ' selected' : '') + '>' + i + '</option>'; return o; };
    const slot = (t, i) => {
      const m = by(t, i), mine = m && m.pid === this.you, host = m && m.pid === R.owner;
      if (!m) return '<button class="cu-slot empty" data-cu="slot" data-s="' + t + '" data-i="' + i + '"><em>' + (i + 1) + '</em><span>' + (t === 's' ? 'Assistir' : 'Vaga livre') + '</span></button>';
      return '<div class="cu-slot' + (mine ? ' me' : '') + '"><em>' + (i + 1) + '</em><span class="cu-av" data-look="' + this.esc(JSON.stringify(m.look || {})) + '"></span><b>' + this.esc(m.name) + '</b>' +
        (host ? '<i class="cu-crown" title="Dono da sala">' + LS.icon('crown') + '</i>' : '') + (own && !mine ? '<button class="cu-kick" data-cu="kick" data-pid="' + m.pid + '" title="Remover">×</button>' : '') + '</div>';
    };
    let ta = '', tb = '', sp = '';
    for (let i = 0; i < R.size; i++) { ta += slot('a', i); tb += slot('b', i); }
    for (let i = 0; i < 10; i++) sp += slot('s', i);
    const set = own
      ? '<label>Nome<input id="cu-name" maxlength="20" value="' + this.esc(R.name) + '"></label>' +
        '<label>Senha<span class="cu-pw"><input id="cu-pass" type="password" maxlength="12" placeholder="sem senha" value="' + this.esc(R.pass || '') + '"><button data-cu="showpass" title="Mostrar">' + LS.icon('eye') + '</button></span></label>' +
        '<label>Jogadores por time<select id="cu-size">' + opt(1, 10, R.size) + '</select></label>' +
        '<label>Rounds<select id="cu-rounds">' + opt(4, 16, R.rounds) + '</select></label>' +
        '<label>Gelo infinito<select id="cu-gel"><option value="1"' + (R.gelInf !== false ? ' selected' : '') + '>SIM</option><option value="0"' + (R.gelInf === false ? ' selected' : '') + '>NÃO (2 por round)</option></select></label>'
      : '<div class="cu-kv"><span>Senha</span><b>' + (R.hasPass ? 'SIM' : 'NÃO') + '</b></div><div class="cu-kv"><span>Times</span><b>' + R.size + ' V ' + R.size + '</b></div><div class="cu-kv"><span>Rounds</span><b>' + R.rounds + '</b></div>' +
        '<div class="cu-kv"><span>Gelo</span><b>' + (R.gelInf !== false ? 'INFINITO' : '2 POR ROUND') + '</b></div>';
    return '<div class="cu-room">' +
      '<div class="cu-left">' +
        '<div class="cu-idbar"><span>ID <b>' + R.id + '</b></span>' + (R.hasPass ? '<i class="cu-lock">' + LS.icon('lock') + '</i>' : '') + '<button class="cu-ref" data-cu="copy">COPIAR ID</button></div>' +
        this.thumb('big') +
        '<div class="cu-set">' + set +
          '<div class="cu-kv"><span>Modo</span><b>TIMES · ' + R.size + 'V' + R.size + '</b></div><div class="cu-kv"><span>Loja</span><b>A CADA 2 ROUNDS</b></div>' +
          '<div class="cu-kv"><span>Muros</span><b>DESCEM AOS ' + LS.CustomMap.WALL_START + 's</b></div><div class="cu-kv"><span>Recompensas</span><b class="no">NENHUMA (DIVERSÃO)</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="cu-right">' +
        '<div class="cu-title"><b>' + this.esc(R.name) + '</b><span class="' + (ready ? 'ok' : '') + '">' + (ready ? 'PRONTO PRA COMEÇAR' : 'FALTAM JOGADORES') + ' (' + (nA + nB) + '/' + (R.size * 2) + ')</span></div>' +
        '<div class="cu-teams"><div class="cu-team a"><h4 style="--tc:' + this.TEAM.a.col + '">TIME AZUL <em>' + nA + '/' + R.size + '</em></h4>' + ta + '</div>' +
          '<div class="cu-vs">VS</div>' +
          '<div class="cu-team b"><h4 style="--tc:' + this.TEAM.b.col + '">TIME VERMELHO <em>' + nB + '/' + R.size + '</em></h4>' + tb + '</div></div>' +
        '<div class="cu-specs"><h4>' + LS.icon('eye') + ' ESPECTADORES <em>' + nS + '/10</em></h4><div class="cu-spec-row">' + sp + '</div></div>' +
        '<p id="cu-msg" class="cu-msg hidden"></p>' +
      '</div></div>' +
      '<div class="panel-buttons cu-btns"><button class="btn" data-cu="leave">SAIR DA SALA</button>' +
        (own ? '<button class="btn btn-primary" data-cu="start"' + (ready ? '' : ' disabled') + '>INICIAR</button>' : '<span class="cu-wait">Esperando ' + this.esc((this.member(R.owner) || {}).name || 'o dono') + ' iniciar…</span>') + '</div>';
  },
  fillAvatars(box) {
    box.querySelectorAll('.cu-av[data-look]').forEach(el => {
      let look = {}; try { look = JSON.parse(el.dataset.look); } catch (e) { }
      try { const u = LS.Profile.headshot(Object.assign({}, LS.defaultProfile.look, look), 0); el.innerHTML = '<img src="' + u + '" alt="">'; } catch (e) { /* sem WebGL */ }
    });
  },
  // miniatura do mapa (desenhada uma vez): ilha vista de cima com os muros
  mapThumb() {
    if (this._thumb) return this._thumb;
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d');
    const sea = g.createLinearGradient(0, 0, 0, 180); sea.addColorStop(0, '#5ec8f0'); sea.addColorStop(1, '#1d78b0'); g.fillStyle = sea; g.fillRect(0, 0, 320, 180);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(10 + i * 37, 20 + (i % 3) * 55); g.lineTo(30 + i * 37, 20 + (i % 3) * 55); g.stroke(); }
    const cx = 160, cy = 92, rb = 76, rg = 64;
    g.fillStyle = '#6d6659'; g.beginPath(); g.ellipse(cx, cy + 6, rb + 4, rb * 0.62 + 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ead9a2'; g.beginPath(); g.ellipse(cx, cy, rb, rb * 0.62, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5aad3c'; g.beginPath(); g.ellipse(cx, cy, rg, rg * 0.62, 0, 0, Math.PI * 2); g.fill();
    const rnd = LS.util.seeded(9); for (let i = 0; i < 260; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * rg * 0.95; g.fillStyle = rnd() < 0.5 ? '#4f9a35' : '#78c955'; g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.62, 3, 3); }
    g.fillStyle = '#a9a498'; g.strokeStyle = '#3a372f'; g.lineWidth = 1.5;
    [[-14, -10], [14, 10]].forEach(([x, y]) => { g.fillRect(cx + x - 3, cy + y * 0.62 - 20, 6, 40); g.strokeRect(cx + x - 3, cy + y * 0.62 - 20, 6, 40); });
    for (let i = 0; i < 5; i++) { g.fillStyle = '#2fd6ff'; g.fillRect(cx - 52, cy - 20 + i * 9, 5, 5); g.fillStyle = '#ff4d6d'; g.fillRect(cx + 47, cy - 20 + i * 9, 5, 5); }
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + 0.3, x = cx + Math.cos(a) * (rg + 6), y = cy + Math.sin(a) * (rg + 6) * 0.62; g.fillStyle = '#2f7a2c'; g.beginPath(); g.arc(x, y, 5, 0, 6.283); g.fill(); }
    return (this._thumb = c.toDataURL());
  },

  // ---------- partida ----------
  myTeam() { const p = this.game && this.game.players.find(x => x.pid === this.you); return p ? p.team : null; },
  teamIdx(t) { return t === 'a' ? 0 : 1; },
  begin(d) {
    this.arena = d.arena === 'duel' ? 'duel' : 'island'; document.getElementById('lobby-mm').classList.add('hidden');
    this.game = d; this.inGame = true; this.setupDone = false; this.pending = null; this.fighting = false; this.kills = 0; this.score = [0, 0]; this.round = 0; this.picks = {};
    LS.Game.startCustom(d);
  },
  // chamado pelo Game depois de montar o mundo
  setup(d) {
    const G = LS.Game, N = LS.Net, P = G.player, me = d.players.find(p => p.pid === this.you);
    this.isPlayer = !!me; this.team = me ? me.team : null;
    N.leave(); N.begin({ you: this.you, host: d.host || null }); N.ws = this.ws; N.online = true;
    for (const b of G.botPool) { b.reset(); b.netId = null; b.team = null; if (b.model.root.parent) b.model.root.parent.remove(b.model.root); }
    G.bots = []; this.dmg = 0;
    P.reset(); P.name = LS.playerProfile.name; P.model.applyLook(LS.playerProfile.look); P.team = this.team;
    const fighters = [];
    if (me) { N.register(P, this.you); fighters.push(P); }
    this.remote = {};
    for (const p of d.players) if (p.pid !== this.you) {
      const r = new LS.RemoteFighter(p.name, p.look); r.reset(); r.name = p.name; r.team = p.team; r.slotIdx = p.i;
      G.scene.add(r.model.root); N.register(r, p.pid); fighters.push(r); this.remote[p.pid] = r;
      if (this.team && p.team === this.team) this.allyTag(r);
    }
    // duelo da party: os 2 bots (time b) rodam no host; nos outros aparecem como jogadores remotos
    const host = d.host && d.host === this.you, df = LS.BOT_LEVEL;
    const looks = LS.util.withSeed(d.seed + 99, () => (d.bots || []).map(() => LS.Skin.randomLook()));
    (d.bots || []).forEach((bd, i) => {
      let b;
      if (host) { b = G.botPool[i]; b.reset(); b.skill = LS.util.rand(df.skill[0], df.skill[1]); G.bots.push(b); }
      else { b = new LS.RemoteFighter(bd.name, looks[i]); b.reset(); this.remote[bd.id] = b; }
      b.name = bd.name; b.team = bd.team; b.model.applyLook(looks[i]); G.scene.add(b.model.root); N.register(b, bd.id); fighters.push(b);
    });
    if (host) { G.botDamageMul = df.dmg; this.send({ t: 'diff', dmg: df.dmg }); }
    G.fighters = fighters;
    if (!this.czone) this.czone = new LS.CustomZone(G.scene);
    if (this.arena === 'duel') { // galpão do duelo (ordem dos mapas pela semente: igual pros dois)
      const D = LS.Duel;
      if (!D.built) D.buildShell(G.scene);
      D.rings.forEach(r => { r.visible = r.userData.size === 2; }); D.group.visible = true; D.mapGroup.visible = true; D.hemi.intensity = 0.18;
      if (!D.zone) D.zone = new LS.DuelZone(G.scene);
      const R = LS.util.seeded(d.seed + 5), o = [0, 1, 2, 3, 4]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = o[i]; o[i] = o[j]; o[j] = t; } // embaralha igual pros dois
      this.order = o; this.mapIdx = -1;
      this.zone = D.zone; this.czone.wall.visible = false; this.czone.nextRing.visible = false;
    } else {
      LS.CustomMap.build(G.scene); LS.CustomMap.show(true); LS.CustomMap.setWalls(0);
      this.zone = this.czone; if (LS.Duel.zone) { LS.Duel.zone.wall.visible = false; LS.Duel.zone.nextRing.visible = false; }
    }
    this.brZone = this.brZone || G.zone; if (this.brZone !== this.zone) { this.brZone.wall.visible = false; this.brZone.nextRing.visible = false; }
    this.zone.rng = null; this.zone.wall.visible = true; G.zone = this.zone; this.zone.reset(); this.zone.update(0, []);
    G.plane.active = false; G.plane.mesh.visible = false;
    LS.Loot.clear(); LS.Effects.clear();
    const hud = document.getElementById('hud'); hud.classList.add('duel', 'custom');
    document.getElementById('duel-score').classList.remove('hidden');
    const mine = this.team || 'a', foe = mine === 'a' ? 'b' : 'a';
    document.getElementById('ds-me').textContent = this.pduel ? 'SUA DUPLA' : this.TEAM[mine].name; // o lado esquerdo é sempre o seu time
    document.getElementById('ds-foe').textContent = this.pduel ? 'BOTS' : this.TEAM[foe].name;
    if (!me) { P.alive = false; P.model.root.visible = false; LS.Spectate.watchAll(); }
    this.setupDone = true;
    this.round = 1; if (me) this.placeAll(); // já em pé no lugar de nascer (parado) enquanto os outros carregam
    G.frozen = true; this.send({ t: 'loaded' });
    this.renderScore();
    if (this.pending) { const p = this.pending; this.pending = null; this.onPhase(p); }
  },
  allyTag(f) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(f.name, 128, 24); g.fillStyle = '#2fd6ff'; g.fillText(f.name, 128, 24);
    g.beginPath(); g.moveTo(116, 46); g.lineTo(140, 46); g.lineTo(128, 60); g.closePath(); g.fill();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.scale.set(1.6, 0.4, 1); s.renderOrder = 20; s.position.set(0, 2.35, 0); f.model.root.add(s);
  },
  // posição de cada um no começo do round (os lados trocam a cada round)
  sideOf(team) { const s = this.round % 2 ? -1 : 1; return team === 'a' ? s : -s; },
  info(id) { return this.game.players.find(p => p.pid === id) || (this.game.bots || []).find(b => b.id === id); },
  // lugar de nascer: ilha plana (fileiras dos times) ou galpão (cada dupla de um lado, como no duelo offline)
  spawnAt(team, i) {
    const side = this.sideOf(team);
    if (this.arena === 'duel') { const D = LS.Duel, A = D.ARENA; return { x: A.x + side * D.SPAWN_X, y: A.fy, z: A.z + (i ? D.TEAM_Z : -D.TEAM_Z), yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 }; }
    const s = LS.CustomMap.spawn(side, i); return { x: s.x, y: LS.CustomMap.C.fy, z: s.z, yaw: s.yaw };
  },
  mapName() { return this.arena === 'duel' ? (LS.Duel.MAPS[this.mapIdx] || LS.Duel.MAPS[0]).name.toUpperCase() : 'ILHA PLANA'; },
  placeAll() {
    const G = LS.Game, P = G.player, load = this.load || {};
    if (this.arena === 'duel') { const idx = this.order[((this.round || 1) - 1) % this.order.length]; if (idx !== this.mapIdx) { this.mapIdx = idx; LS.Duel.buildMap(idx); } } // o mapa muda a cada round
    for (const f of G.fighters) {
      const info = this.info(f.netId); if (!info) continue;
      const sp = this.spawnAt(info.team, info.i);
      if (G.bots.includes(f)) { // bot do host: nasce armado, já de olho no inimigo da frente
        f.reset(); f.team = info.team; f.alive = true; f.hp = 100;
        f.state = 'ground'; f.onGround = true; f.safeLand = true;
        f.pos.set(sp.x, sp.y, sp.z); f.vel.set(0, 0, 0); f.yaw = sp.yaw; f.pitch = 0;
        LS.Duel.equip(f, load[f.netId] || ['ak47', 'm1887']);
        f.vest = { level: 2, dur: LS.GEAR.vest.levels[2].dur }; f.helmet = { level: 2, dur: LS.GEAR.helmet.levels[2].dur }; f.bag = 1; f.model.setGear(2, 2, 1);
        f.meds = { medkit: 1, bandage: 3 }; f.gel = 2;
        f.model.root.visible = true; f.model.root.position.copy(f.pos); f.model.root.rotation.y = f.yaw;
        continue;
      }
      if (f === P) {
        if (LS.Spectate.active) LS.Spectate.stop();
        this.dmg += P.damageDealt || 0;
        P.reset(); P.team = this.team; P.netId = this.you;
        P.state = 'ground'; P.onGround = true; P.safeLand = true;
        P.pos.set(sp.x, sp.y, sp.z); P.vel.set(0, 0, 0); P.yaw = sp.yaw; P.camYaw = sp.yaw; P.camPitch = -0.05; P.recoilX = P.recoilY = 0; P.recoilPend = { x: 0, y: 0 };
        LS.Duel.equip(P, load[this.you] || ['ak47', 'm1887']);
        P.vest = { level: 2, dur: LS.GEAR.vest.levels[2].dur }; P.helmet = { level: 2, dur: LS.GEAR.helmet.levels[2].dur }; P.bag = 1; P.model.setGear(2, 2, 1);
        P.meds = { medkit: 1, bandage: 3 };
        P.gelInf = this.game.gelInf !== false; P.gel = P.gelInf ? 0 : 2; // bolas de gelo: infinitas ou 2 por round
        P.model.root.visible = true; P.model.root.position.copy(P.pos); P.model.root.rotation.y = P.yaw;
      } else {
        f.alive = true; f.hp = 100; f.pos.set(sp.x, sp.y, sp.z); f.yaw = sp.yaw; f.tgt = null; f.netHidden = true; f.state = 'ground';
      }
    }
    for (const b of G.bots) { // cada bot mira no inimigo à frente dele
      const foes = G.fighters.filter(f => f.alive && !LS.sameTeam(f, b)); if (!foes.length) continue;
      const e = foes.reduce((a, f) => (f.pos.distanceToSquared(b.pos) < a.pos.distanceToSquared(b.pos) ? f : a));
      b.target = e; b.alertPos = e.pos.clone(); b.alertT = 3; b.ai = 'investigate'; b.lockT = 0;
    }
  },
  onPhase(m) {
    if (this.inGame && !this.setupDone) { this.pending = m; return; } // o mundo ainda está carregando
    const G = LS.Game, prev = this.phase;
    this.phase = m.ph; this.round = m.round; this.rounds = m.rounds; this.score = m.score; this.load = m.load;
    if (!this.inGame) return;
    this.renderScore();
    if (m.ph !== 'shop') this.closeShop();
    if (m.ph === 'shop') {
      G.frozen = true; this.fighting = false;
      if (this.isPlayer) { this.placeAll(); this.openShop(m.left); }
      else LS.HUD.centerMsg('LOJA DOS TIMES', 'Cada jogador está escolhendo as armas', 3);
    } else if (m.ph === 'count') {
      G.frozen = true; this.fighting = false;
      this.placeAll();
      LS.Loot.clear(); LS.Effects.clear(); LS.GelWall.clear();
      this.zone.rng = LS.util.seeded(m.zs); this.zone.reset(); this.zone.update(0, []);
      this.fightT = 0; if (this.arena !== 'duel') LS.CustomMap.setWalls(0); this.wallMsg = false;
      if (this.isPlayer) { LS.Input.enabled = true; LS.Input.lock(); }
      this.countT = m.left; this.lastShown = null;
      const L = (this.load && this.load[this.you]) || [];
      LS.HUD.centerMsg('ROUND ' + m.round + ' DE ' + m.rounds, (L.length ? L.map(id => LS.WEAPONS[id].name).join(' + ') + ' · ' : '') + (this.arena === 'duel' ? 'Mapa: ' + LS.Duel.MAPS[this.mapIdx].name : 'Ilha plana'), 2.4);
      if (!this.isPlayer) LS.Spectate.retarget();
    } else if (m.ph === 'fight') {
      G.frozen = false; this.fighting = true; this.fightT = 0;
      LS.Duel.showCount('LUTE!', true); LS.Audio.alert();
    } else if (m.ph === 'end') {
      this.fighting = false;
      const my = this.team, w = m.win;
      if (my) LS.Duel.showCount(w === my ? 'ROUND VENCIDO!' : w ? 'ROUND PERDIDO' : 'EMPATE', false, w === my ? 'win' : w ? 'lose' : 'draw');
      else LS.Duel.showCount(w ? 'PONTO DO ' + this.TEAM[w].name : 'EMPATE', false, 'draw');
    } else if (m.ph === 'over') {
      this.fighting = false; G.frozen = true;
      this.showOver(m);
    }
    if (prev === 'over' && m.ph !== 'over') this.hideOver();
  },
  update(dt) {
    if (!this.inGame) return;
    if (this.phase === 'count' && this.countT > 0) {
      this.countT -= dt; const n = Math.ceil(this.countT);
      if (n !== this.lastShown && n > 0 && n <= 3) { this.lastShown = n; LS.Duel.showCount(String(n)); LS.Audio.click(); }
    }
    if (this.fighting && this.arena !== 'duel') {
      this.fightT += dt;
      const k = LS.CustomMap.wallsAt(this.fightT);
      if (k > 0 && !this.wallMsg) { this.wallMsg = true; LS.HUD.centerMsg('OS MUROS ESTÃO DESCENDO!', 'Sem campar: a ilha vai ficar aberta', 3); LS.Audio.alert(); }
      LS.CustomMap.setWalls(k);
    }
    if (this.shopOpen) this.tickShop(dt);
  },
  onKill(victim, killer) {
    if (killer === LS.Game.player && victim !== killer) this.kills++;
    this.renderAlive();
  },
  renderScore() {
    if (!this.game) return;
    const my = this.team || 'a', s = this.score || [0, 0], me = s[this.teamIdx(my)], foe = s[1 - this.teamIdx(my)], need = Math.floor((this.rounds || this.game.rounds) / 2) + 1;
    const pips = n => { let h = ''; for (let i = 0; i < Math.min(need, 9); i++) h += '<i' + (i < n ? ' class="on"' : '') + '></i>'; return h; };
    document.getElementById('ds-sme').textContent = me; document.getElementById('ds-sfoe').textContent = foe;
    document.getElementById('ds-pips-me').innerHTML = pips(me); document.getElementById('ds-pips-foe').innerHTML = pips(foe);
    document.getElementById('ds-round').textContent = (this.round || 1) + '/' + (this.rounds || this.game.rounds);
    document.getElementById('ds-map').textContent = this.mapName();
    this.renderAlive();
  },
  renderAlive() {
    const my = this.team || 'a', G = LS.Game;
    const dots = t => G.fighters.filter(f => f.team === t).map(f => '<i class="' + (f.alive ? 'on' : '') + '"></i>').join('');
    const a = document.getElementById('ds-alive-me'), b = document.getElementById('ds-alive-foe');
    if (a) a.innerHTML = dots(my); if (b) b.innerHTML = dots(my === 'a' ? 'b' : 'a');
  },
  // o que o cartão de morte mostra (round e placar do ponto de vista do seu time)
  cardInfo() { const s = this.score || [0, 0], i = this.teamIdx(this.team || 'a'); return { round: this.round, score: [s[i], s[1 - i]] }; },

  // ---------- loja (cada jogador escolhe as suas 2 armas) ----------
  openShop(left) {
    this.shopOpen = true; this.shopLeft = left; this.myPick = (this.load && this.load[this.you] || []).slice(); this.ready = false;
    LS.Game.setInventory(false); LS.Input.enabled = false; LS.Input.unlock();
    let el = document.getElementById('cs-shop');
    if (!el) {
      el = document.createElement('div'); el.id = 'cs-shop'; document.getElementById('hud').appendChild(el);
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-w],[data-cs]'); if (!b) return;
        LS.Audio.click();
        if (b.dataset.w) { const w = b.dataset.w, i = this.myPick.indexOf(w); if (i >= 0) this.myPick.splice(i, 1); else { if (this.myPick.length >= 2) this.myPick.shift(); this.myPick.push(w); } this.ready = false; }
        else if (b.dataset.cs === 'ok') this.ready = !this.ready && this.myPick.length > 0;
        this.send({ t: 'wpick', w: this.myPick, ready: this.ready }); this.renderShop();
      });
    }
    el.classList.remove('hidden'); this.renderShop();
  },
  closeShop() { this.shopOpen = false; const el = document.getElementById('cs-shop'); if (el) el.classList.add('hidden'); },
  tickShop(dt) {
    this.shopLeft = Math.max(0, this.shopLeft - dt);
    const f = document.getElementById('cs-timer'); if (f) f.style.width = (this.shopLeft / 15 * 100) + '%';
    const n = document.getElementById('cs-secs'); if (n) n.textContent = Math.ceil(this.shopLeft) + 's';
  },
  renderShop() {
    const el = document.getElementById('cs-shop'); if (!el || !this.shopOpen) return;
    const cats = {}; LS.WEAPON_IDS.forEach(id => { const w = LS.WEAPONS[id]; (cats[w.cat] = cats[w.cat] || []).push(id); });
    const mates = Object.entries(this.picks || {}).filter(([pid]) => pid !== this.you).map(([pid, v]) => {
      const p = this.game.players.find(x => x.pid === pid);
      return '<div class="cs-mate' + (v.r ? ' ok' : '') + '"><b>' + this.esc(p ? p.name : '?') + '</b><span>' + (v.w.length ? v.w.map(id => LS.WEAPONS[id].name).join(' + ') : 'escolhendo…') + '</span>' + (v.r ? '<i>PRONTO</i>' : '') + '</div>';
    }).join('');
    el.innerHTML = '<div class="shop-box cs-box"><div class="shop-head"><h2>LOJA DE ARMAS</h2><span>ROUNDS ' + this.round + ' E ' + (this.round + 1) + ' · <b id="cs-secs">' + Math.ceil(this.shopLeft) + 's</b></span></div>' +
      '<div class="shop-who">Escolha as <b>suas 2 armas</b>. Escolheu errado? Toque de novo pra trocar até o tempo acabar.</div>' +
      '<div class="shop-timer"><div id="cs-timer" style="width:' + (this.shopLeft / 15 * 100) + '%"></div></div>' +
      '<div class="cs-grid">' + Object.keys(cats).map(c => '<div class="cs-cat"><h5>' + c.toUpperCase() + '</h5>' + cats[c].map(id => {
        const sel = this.myPick.indexOf(id), w = LS.WEAPONS[id];
        return '<button class="cs-w' + (sel >= 0 ? ' sel' : '') + '" data-w="' + id + '">' + (sel >= 0 ? '<em>' + (sel + 1) + '</em>' : '') + '<img src="' + LS.Icons.get('weapon', id) + '" alt=""><b>' + w.name + '</b><small>' + w.dmg + ' dano · ' + w.mag + ' balas</small></button>';
      }).join('') + '</div>').join('') + '</div>' +
      (mates ? '<div class="cs-mates"><h5>SEU TIME</h5>' + mates + '</div>' : '') +
      '<div class="shop-foot"><div class="shop-picks">' + [0, 1].map(i => '<span class="' + (this.myPick[i] ? 'on' : '') + '">' + (this.myPick[i] ? LS.WEAPONS[this.myPick[i]].name : (i ? 'SECUNDÁRIA' : 'PRIMÁRIA')) + '</span>').join('') + '</div>' +
      '<button class="btn btn-primary" data-cs="ok"' + (this.myPick.length ? '' : ' disabled') + '>' + (this.ready ? 'PRONTO! (TROCAR)' : 'CONFIRMAR') + '</button></div></div>';
  },

  // ---------- fim ----------
  showOver(m) {
    let el = document.getElementById('cs-over');
    if (!el) { el = document.createElement('div'); el.id = 'cs-over'; document.body.appendChild(el); }
    const s = this.score || [0, 0], my = this.team, w = m.winner;
    const title = my ? (w === my ? 'VITÓRIA!' : w ? 'DERROTA' : 'EMPATE') : (w ? 'TIME ' + this.TEAM[w].name + ' VENCEU' : 'EMPATE');
    const cls = my ? (w === my ? 'win' : w ? 'lose' : 'draw') : 'draw';
    let rw = '';
    if (this.pduel && my) { // duelo da party conta como duelo: XP e moedas por round vencido
      const S = LS.stats, rounds = s[this.teamIdx(my)], win = w === my, before = LS.Menu.levelOf(S.xp || 0);
      const xp = rounds * 90 + (win ? 350 : 0) + Math.round(((this.dmg || 0) + (LS.Game.player.damageDealt || 0)) * 0.3), coins = rounds * 30 + (win ? 150 : 0);
      S.xp = (S.xp || 0) + xp; S.coins = (S.coins || 0) + coins; S.games = (S.games || 0) + 1; S.kills = (S.kills || 0) + this.kills; if (win) S.wins = (S.wins || 0) + 1;
      LS.saveStats(); const lv = LS.Menu.levelOf(S.xp);
      rw = '<p>Abates: <b>' + this.kills + '</b> · <b>+' + xp + ' XP · +' + coins + ' moedas</b>' + (lv > before ? ' · SUBIU PRO NÍVEL ' + lv + '!' : '') + '</p>';
    }
    el.innerHTML = '<div class="cso-box ' + cls + '"><small>' + (this.pduel ? 'DUELO EM PARTY · GALPÃO' : 'SALA PERSONALIZADA · ' + this.esc(this.game.name)) + '</small><h1>' + title + '</h1>' +
      (this.pduel ? '<div class="cso-score"><span style="color:' + this.TEAM.a.col + '">SUA DUPLA</span><b>' + s[0] + ' x ' + s[1] + '</b><span style="color:' + this.TEAM.b.col + '">BOTS</span></div>'
        : '<div class="cso-score"><span style="color:' + this.TEAM.a.col + '">AZUL</span><b>' + s[0] + ' x ' + s[1] + '</b><span style="color:' + this.TEAM.b.col + '">VERMELHO</span></div>') +
      (this.pduel ? rw : my ? '<p>Seus abates: <b>' + this.kills + '</b> · sem recompensas (é só diversão)</p>' : '') + '<p class="cso-back">' + (this.pduel ? 'Voltando pro lobby…' : 'Voltando pra sala…') + '</p></div>';
    el.className = 'show';
    LS.Spectate.stop(); LS.Input.enabled = false; LS.Input.unlock();
    if (my) { if (w === my) LS.Audio.victory(); else LS.Audio.defeat(); }
  },
  hideOver() { const el = document.getElementById('cs-over'); if (el) el.className = ''; },
  // volta do jogo pra tela da sala (a conexão continua)
  exitMatch() {
    if (!this.inGame) return;
    const G = LS.Game, N = LS.Net;
    this.inGame = false; this.fighting = false; this.closeShop(); this.hideOver();
    N.ws = null; N.leave(); // N.leave fecharia a conexão da sala: ela não é dele
    LS.Spectate.stop();
    for (const r of Object.values(this.remote || {})) if (r.model.root.parent) r.model.root.parent.remove(r.model.root);
    this.remote = {};
    for (const b of G.bots) { if (b.model.root.parent) b.model.root.parent.remove(b.model.root); b.netId = null; b.team = null; } // bots do duelo da party (host)
    G.bots = [];
    if (this.brZone) { G.zone = this.brZone; this.brZone.wall.visible = true; }
    if (this.zone) { this.zone.wall.visible = false; this.zone.nextRing.visible = false; }
    if (this.arena === 'duel') { const D = LS.Duel; if (D.group) { D.group.visible = false; D.mapGroup.visible = false; D.hemi.intensity = 0; } }
    this.arena = null;
    LS.CustomMap.show(false);
    document.getElementById('hud').classList.remove('duel', 'custom');
    document.getElementById('duel-score').classList.add('hidden');
    document.getElementById('duel-count').className = 'hidden';
    G.frozen = false; G.mode = 'br'; G.state = 'menu'; G.player.team = null;
    LS.Input.enabled = false; LS.Input.unlock(); G.setInventory(false);
    LS.HUD.show(false); LS.HUD.clearShots(); LS.Audio.stopAll();
    G.player.reset(); G.player.model.root.visible = false;
  },
  quit() {
    if (this.pduel) { this.doneOk = true; this.leave(true); LS.Game.quitToMenu(); return; } // saiu do duelo da party: volta pro lobby
    this.leave(true); LS.UI.showScreen('panel-custom'); this.view = 'list'; this.err = ''; this.render(); this.list();
  }
};
