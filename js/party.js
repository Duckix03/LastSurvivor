// PARTY: jogar com amigos. Até 4 no Battle Royale (o esquadrão inteiro é a party, completado com bots)
// e 2 no Duelo (a dupla contra 2 bots no galpão, online).
//  - Fica conectado no servidor (PartyHub) enquanto o jogo está aberto e você tem conta
//  - Convite só pra amigo online · os amigos aparecem do seu lado no lobby (P2, P3 e P4)
//  - O líder escolhe o modo e aperta JOGAR; os outros esperam. Trocou pro Duelo com 3 ou 4? Escolhe quem fica, os outros saem
'use strict';
LS.Party = {
  ws: null, you: null, party: null, invites: [], st: 'lobby', retry: 0, nextTry: 0, pingT: 0, deadTok: null, stopped: false,
  CAP: { br: 4, duel: 2 }, MODE_NAME: { br: 'Battle Royale', duel: 'Duelo' },

  init() {
    const play = document.querySelector('#menu-main .lb-play');
    const bar = document.createElement('div'); bar.id = 'party-bar'; play.insertBefore(bar, play.firstChild);
    const inv = document.createElement('div'); inv.id = 'party-inv'; document.body.appendChild(inv);
    const modal = document.createElement('div'); modal.id = 'party-modal'; modal.className = 'hidden'; document.body.appendChild(modal);
    const click = e => {
      const el = e.target.closest('[data-pa]'); if (!el) return;
      e.stopPropagation(); LS.Audio.init(); LS.Audio.click();
      const a = el.dataset.pa, acc = el.dataset.acc;
      if (a === 'slot') this.openInvite();
      else if (a === 'login') { this.closeModal(); LS.UI.openPanel('panel-stats'); LS.Profile.open(); LS.Profile.openAuth('register', 'Crie uma conta (ou entre) pra jogar em party com os amigos.'); }
      else if (a === 'invite') this.invite(acc, el.dataset.name);
      else if (a === 'uninvite') this.send({ t: 'uninvite', acc });
      else if (a === 'kick') { if (el.dataset.sure !== '1') { el.dataset.sure = '1'; el.classList.add('sure'); setTimeout(() => { if (el.isConnected) { el.dataset.sure = ''; el.classList.remove('sure'); } }, 2500); return; } this.send({ t: 'kick', acc }); }
      else if (a === 'leave') this.send({ t: 'leave' });
      else if (a === 'close') this.closeModal();
      else if (a === 'keep') { this.send({ t: 'mode', mode: 'duel', keep: [acc] }); this.closeModal(); }
      else if (a === 'accept' || a === 'decline') { const p = el.dataset.party; this.send({ t: a, party: p }); this.invites = this.invites.filter(i => i.party !== p); this.renderInvites(); }
      else if (a === 'friends') { this.closeModal(); LS.Friends.open(); }
    };
    bar.addEventListener('click', click); inv.addEventListener('click', click); modal.addEventListener('click', e => { if (e.target === modal) this.closeModal(); else click(e); });
    setInterval(() => this.tick(), 1000);
    this.render();
  },

  // ---------- estado ----------
  members() { return this.party ? this.party.members : []; },
  others() { return this.members().filter(m => m.acc !== this.you); },
  inParty() { return !!this.party && this.party.members.length > 1; },
  isLeader() { return !this.inParty() || this.party.leader === this.you; },
  mode() { return this.inParty() ? this.party.mode : LS.Modes.id; },
  cap(mode) { return this.CAP[mode || this.mode()] || 4; },
  online() { return !!this.ws && this.ws.readyState === 1 && !!this.you; },
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); },
  toast(t) {
    let el = document.getElementById('party-toast');
    if (!el) { el = document.createElement('div'); el.id = 'party-toast'; document.body.appendChild(el); }
    el.textContent = t; el.className = ''; void el.offsetWidth; el.className = 'show';
    clearTimeout(this._toastT); this._toastT = setTimeout(() => { el.className = ''; }, 3200);
    if (LS.Game.state === 'playing' && LS.HUD.toast) LS.HUD.toast(t);
  },

  // ---------- conexão ----------
  tick() {
    const tok = LS.Account && LS.Account.token, want = !!LS.NET_URL && LS.Account.logged() && !this.stopped && tok !== this.deadTok;
    if (want && !this.ws && Date.now() >= this.nextTry) this.connect();
    if (!want && this.ws) this.close();
    if (!this.ws) return;
    const st = LS.Game.state === 'menu' || LS.Game.state === 'lobby' ? 'lobby' : 'game';
    if (st !== this.st) { this.st = st; this.send({ t: 'st', s: st }); if (st === 'lobby') this.renderInvites(); }
    const lk = JSON.stringify(LS.playerProfile.look || {});
    if (this.online() && lk !== this.lookKey) { this.lookKey = lk; this.send({ t: 'look', look: LS.playerProfile.look }); }
    if (this.ws.readyState === 1 && Date.now() - this.pingT > 25000) { this.pingT = Date.now(); try { this.ws.send('ping'); } catch (e) { } } // mantém a conexão viva (o servidor responde sem acordar)
    const now = Date.now(), n = this.invites.length;
    this.invites = this.invites.filter(i => i.exp > now); if (this.invites.length !== n) this.renderInvites();
  },
  connect() {
    let ws; try { ws = new WebSocket(LS.Net.wsUrl('/ws/party')); } catch (e) { this.nextTry = Date.now() + 15000; return; }
    this.ws = ws; this.pingT = Date.now();
    ws.onopen = () => {
      this.st = LS.Game.state === 'menu' || LS.Game.state === 'lobby' ? 'lobby' : 'game';
      this.lookKey = JSON.stringify(LS.playerProfile.look || {});
      ws.send(JSON.stringify({ t: 'hello', proto: LS.NET_PROTO, auth: LS.Account.token, look: LS.playerProfile.look, st: this.st }));
    };
    ws.onmessage = ev => { if (ws !== this.ws || ev.data === 'pong') return; let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.onMsg(m); };
    ws.onclose = ev => {
      if (ws !== this.ws) return;
      this.ws = null; this.you = null; const had = this.inParty(); this.party = null;
      if (ev.code === 4003) this.deadTok = LS.Account.token; // conta inválida: só tenta de novo com outra conta
      else if (ev.code === 4001 || ev.code === 4002) this.stopped = true; // aberto em outra aba / jogo desatualizado
      this.nextTry = Date.now() + Math.min(30000, 2000 * Math.pow(2, this.retry++));
      if (had) this.toast('Conexão da party caiu. Reconectando…');
      this.render();
    };
    ws.onerror = () => { };
  },
  close() { const ws = this.ws; this.ws = null; this.you = null; this.party = null; this.invites = []; if (ws) { try { ws.close(); } catch (e) { } } this.render(); this.renderInvites(); },

  onMsg(m) {
    switch (m.t) {
      case 'hi': this.you = m.you; this.retry = 0; return;
      case 'party': this.setParty(m.party); return;
      case 'kicked': this.setParty(null); this.toast(m.why || 'Você saiu da party.'); return;
      case 'note': this.toast(m.msg); return;
      case 'dup': this.toast('Sua conta abriu o jogo em outro lugar: a party ficou lá.'); return;
      case 'invite': {
        this.invites = this.invites.filter(i => i.party !== m.party);
        this.invites.push({ party: m.party, from: m.from, name: m.name, look: m.look, mode: m.mode, n: m.n, exp: Date.now() + 58000 });
        if (this.invites.length > 3) this.invites.shift();
        this.renderInvites(); if (this.st === 'lobby') LS.Audio.alert();
        return;
      }
      case 'cancel': if (LS.Lobby.searching) { LS.Lobby.cancelSearch(); this.toast(m.by + ' cancelou a busca.'); } return;
      case 'go': this.onGo(m); return;
    }
  },
  setParty(p) {
    const was = this.inParty();
    this.party = p;
    if (this.inParty()) {
      // o modo é o do líder (no duelo em party é sempre 2v2)
      this.applying = true;
      if (LS.Modes.id !== p.mode) LS.Modes.set(p.mode);
      if (p.mode === 'duel' && LS.Modes.duelSize !== 2) LS.Modes.setSize(2);
      this.applying = false;
      if (!was) this.toast(this.isLeader() ? 'Party formada! Você é o líder.' : 'Você entrou na party de ' + this.leaderName() + '!');
    } else if (was && LS.Lobby.searching && LS.Lobby.partySearch) LS.Lobby.cancelSearch();
    this.render(); this.renderModal();
  },
  leaderName() { const l = this.members().find(m => m.acc === this.party.leader); return l ? l.name : '?'; },

  // ---------- regras do modo (chamadas pelo LS.Modes) ----------
  // pode trocar pra esse modo? (só o líder; duelo com mais de 2: escolhe quem fica)
  allowMode(id) {
    if (this.applying || !this.inParty()) return true;
    if (!this.isLeader()) { this.toast('Só o líder da party escolhe o modo.'); return false; }
    if (id === 'duel' && this.party.members.length > 2) { this.openKeep(); return false; }
    return true;
  },
  modeChanged(id) { if (!this.applying && this.inParty() && this.isLeader() && this.party.mode !== id) this.send({ t: 'mode', mode: id }); },

  // ---------- JOGAR ----------
  // em party o líder chama todo mundo; quem não é líder espera. Devolve true se a party cuidou do JOGAR
  play() {
    if (!this.inParty()) return false;
    if (!this.isLeader()) { this.toast('Aguardando ' + this.leaderName() + ' (líder) iniciar a partida.'); return true; }
    const off = this.others().filter(m => !m.on), busy = this.others().filter(m => m.on && m.st === 'game');
    if (off.length) { this.toast(off.map(m => m.name).join(', ') + ' está offline.'); return true; }
    if (busy.length) { this.toast('Esperando ' + busy.map(m => m.name).join(', ') + ' voltar pro lobby.'); return true; }
    if (this.party.mode === 'duel' && this.party.members.length !== 2) { this.toast('O duelo em party é de 2 jogadores.'); return true; }
    this.send({ t: 'go' });
    return true;
  },
  onGo(m) {
    const G = LS.Game;
    if (G.state !== 'menu' && G.state !== 'lobby') return;
    this.closeModal();
    if (LS.Lobby.searching) LS.Lobby.cancelSearch(); // estava buscando sozinho: vai com a party
    if (LS.Custom.ws && !LS.Custom.inGame) LS.Custom.leave(true); // estava numa sala personalizada: sai dela
    if (m.mode === 'duel') LS.Custom.joinDuel(m.id, m.ticket);
    else LS.Lobby.startSearch({ group: m.group, gsize: m.gsize });
  },
  // alguém cancelou a busca: a party toda cancela junto
  cancelled() { if (this.inParty()) this.send({ t: 'cancel' }); },
  invite(acc, name) {
    if (!this.online()) { this.toast('Conectando na party… tente de novo em instantes.'); return; }
    if (this.inParty() && !this.isLeader()) { this.toast('Só o líder pode convidar.'); return; }
    if (this.members().length >= this.cap()) { this.toast(this.mode() === 'duel' ? 'No duelo a party é de 2. Troque pro Battle Royale pra chamar mais gente.' : 'A party já está cheia.'); return; }
    this.send({ t: 'invite', to: acc, mode: LS.Modes.id });
    this._sent = this._sent || {}; this._sent[acc] = Date.now();
    this.renderModal();
  },

  // ---------- telas ----------
  esc(s) { return LS.Profile.esc(String(s == null ? '' : s)); },
  avatar(look) { try { return LS.Profile.headshot(Object.assign({}, LS.defaultProfile.look, look || {}), 0); } catch (e) { return ''; } },
  // barrinha em cima do JOGAR: você + amigos + vagas (+)
  render() {
    const bar = document.getElementById('party-bar'); if (!bar) return;
    const logged = LS.Account.logged() && !!LS.NET_URL, cap = this.cap(), list = this.inParty() ? this.members() : [];
    const me = { acc: this.you, name: LS.playerProfile.name, look: LS.playerProfile.look, on: true };
    const order = list.length ? [list.find(m => m.acc === this.you) || me].concat(list.filter(m => m.acc !== this.you)) : [me];
    const lead = this.inParty() ? this.party.leader : this.you, amLead = this.isLeader();
    let h = '<div class="pb-slots">';
    for (let i = 0; i < cap; i++) {
      const m = order[i];
      if (m) {
        const av = this.avatar(m.acc === this.you ? LS.playerProfile.look : m.look);
        h += '<div class="pb-slot' + (m.acc === this.you ? ' me' : '') + (m.on === false ? ' off' : '') + '" title="' + this.esc(m.name) + '">' +
          '<div class="pb-av">' + (av ? '<img src="' + av + '" alt="">' : '') + (m.acc === lead && this.inParty() ? '<i class="pb-crown"></i>' : '') + (m.st === 'game' ? '<em class="pb-busy">JOGANDO</em>' : '') + '</div>' +
          '<b>' + (m.acc === this.you ? 'VOCÊ' : this.esc(m.name)) + '</b>' +
          (amLead && this.inParty() && m.acc !== this.you ? '<button class="pb-x" data-pa="kick" data-acc="' + m.acc + '" title="Tirar da party">×</button>' : '') + '</div>';
      } else h += '<button class="pb-slot add" data-pa="' + (logged ? 'slot' : 'login') + '" title="Chamar amigo pra party"><div class="pb-av"><span>+</span></div><b>CONVIDAR</b></button>';
    }
    h += '</div>';
    if (this.inParty()) h += '<div class="pb-info"><span><b>PARTY ' + list.length + '/' + cap + '</b> · ' + this.MODE_NAME[this.party.mode] + (amLead ? ' · você é o líder' : ' · líder: ' + this.esc(this.leaderName())) + '</span><button data-pa="leave">SAIR</button></div>';
    bar.innerHTML = h;
    bar.classList.toggle('in', this.inParty());
    const btn = document.querySelector('#menu-main .lb-play-btn');
    if (btn) { const wait = this.inParty() && !amLead; btn.classList.toggle('wait', wait); btn.textContent = wait ? 'AGUARDANDO LÍDER' : 'JOGAR'; }
    if (LS.Lobby && LS.Lobby.built) LS.Lobby.setParty(this.inParty() ? this.others() : null, lead);
  },
  // convites que chegaram (só aparecem no lobby)
  renderInvites() {
    const box = document.getElementById('party-inv'); if (!box) return;
    if (this.st !== 'lobby' || !this.invites.length) { box.innerHTML = ''; return; }
    box.innerHTML = this.invites.map(i => {
      const av = this.avatar(i.look), left = Math.max(0, (i.exp - Date.now()) / 1000);
      return '<div class="pi-card"><div class="pb-av">' + (av ? '<img src="' + av + '" alt="">' : '') + '</div><div class="pi-txt"><b>' + this.esc(i.name) + '</b><span>te chamou pra party · ' + this.MODE_NAME[i.mode] + ' (' + i.n + '/' + this.cap(i.mode) + ')</span></div>' +
        '<div class="pi-btns"><button class="btn small btn-primary" data-pa="accept" data-party="' + i.party + '">ACEITAR</button><button class="btn small" data-pa="decline" data-party="' + i.party + '">RECUSAR</button></div>' +
        '<i class="pi-time" style="animation-duration:' + left.toFixed(1) + 's"></i></div>';
    }).join('');
  },
  // lista de amigos pra convidar
  async openInvite() {
    if (this.inParty() && !this.isLeader()) { this.toast('Só o líder pode convidar.'); return; }
    if (this.members().length >= this.cap() && this.inParty()) { this.toast(this.mode() === 'duel' ? 'No duelo a party é de 2. Troque pro Battle Royale pra chamar mais gente.' : 'A party já está cheia (4 jogadores).'); return; }
    this.modal = 'invite'; this.friends = null; this.renderModal();
    document.getElementById('party-modal').classList.remove('hidden');
    try { const d = await LS.Account.api('/api/friends'); this.friends = d.friends || []; LS.Friends.data = d; } catch (e) { this.friends = []; this.fErr = e.message; }
    this.renderModal();
  },
  // duelo é em dupla: o líder escolhe quem fica
  openKeep() { this.modal = 'keep'; this.renderModal(); document.getElementById('party-modal').classList.remove('hidden'); },
  closeModal() { this.modal = null; const el = document.getElementById('party-modal'); if (el) el.classList.add('hidden'); },
  renderModal() {
    const el = document.getElementById('party-modal'); if (!el || !this.modal) return;
    let h;
    if (this.modal === 'keep') {
      if (!this.inParty() || this.party.members.length <= 2) { this.closeModal(); return; }
      h = '<div class="pm-box"><h3>DUELO É EM DUPLA</h3><p>Escolha quem joga com você. Os outros saem da party (podem ser chamados de novo no Battle Royale).</p><div class="pm-list">' +
        this.others().map(m => { const av = this.avatar(m.look); return '<div class="pm-row"><div class="pb-av">' + (av ? '<img src="' + av + '" alt="">' : '') + '</div><b>' + this.esc(m.name) + '</b><button class="btn small btn-primary" data-pa="keep" data-acc="' + m.acc + '">FICA COMIGO</button></div>'; }).join('') +
        '</div><div class="pm-foot"><button class="btn" data-pa="close">CANCELAR</button></div></div>';
    } else {
      const fr = this.friends, inP = new Set(this.members().map(m => m.acc)), inv = new Set(this.party ? this.party.inv : []), full = this.members().length >= this.cap();
      const rows = !fr ? '<p class="fr-empty">Carregando amigos…</p>' : !fr.length ? '<p class="fr-empty">Você ainda não tem amigos. Adicione pelo ID ou pelo nome!</p><button class="btn btn-primary" data-pa="friends">ADICIONAR AMIGOS</button>' :
        fr.slice().sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0)).map(f => {
          const av = this.avatar(f.look), there = inP.has(f.id), sent = inv.has(f.id) || (this._sent && Date.now() - (this._sent[f.id] || 0) < 3000);
          const btn = there ? '<span class="pm-tag">NA PARTY</span>' : sent ? '<span class="pm-tag ok">CONVIDADO</span>' : !f.online ? '<span class="pm-tag">OFFLINE</span>' :
            '<button class="btn small btn-primary" data-pa="invite" data-acc="' + f.id + '" data-name="' + this.esc(f.name) + '"' + (full ? ' disabled' : '') + '>CONVIDAR</button>';
          return '<div class="pm-row' + (f.online ? '' : ' off') + '"><div class="pb-av' + (f.online ? ' on' : '') + '">' + (av ? '<img src="' + av + '" alt="">' : '') + '</div><b>' + this.esc(f.name) + '<small>' + (f.online ? 'Online' : 'Offline') + '</small></b>' + btn + '</div>';
        }).join('');
      h = '<div class="pm-box"><h3>CHAMAR PRA PARTY</h3><p>' + (this.mode() === 'duel' ? 'Duelo: você + 1 amigo contra 2 bots.' : 'Battle Royale: até 4 no mesmo esquadrão (o resto é completado com bots).') + ' ' + this.members().length + '/' + this.cap() + '</p>' +
        (this.online() ? '' : '<p class="pf-err">Conectando na party…</p>') + '<div class="pm-list">' + rows + '</div><div class="pm-foot"><button class="btn" data-pa="close">FECHAR</button></div></div>';
    }
    el.innerHTML = h;
  }
};
