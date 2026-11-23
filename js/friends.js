// Amigos: adicionar pelo ID ou pelo nome, pedidos (aceitar / recusar), lista com online/offline, ver perfil e remover.
// Tudo fica no servidor de contas (precisa estar logado). O jogo avisa "estou online" a cada minuto.
'use strict';
LS.Friends = {
  data: null, msg: '', err: '',
  init() {
    document.getElementById('friends-body').addEventListener('click', e => {
      const el = e.target.closest('[data-fr]'); if (!el) return;
      LS.Audio.init(); LS.Audio.click();
      const a = el.dataset.fr, id = el.dataset.id;
      if (a === 'add') this.add();
      else if (a === 'login') { LS.UI.showScreen('panel-stats'); LS.Profile.open(); LS.Profile.openAuth('register', 'Crie uma conta (ou entre) pra ter amigos.'); }
      else if (a === 'profile') this.profile(id);
      else if (['accept', 'decline', 'remove'].includes(a)) {
        if (a === 'remove' && el.dataset.sure !== '1') { el.dataset.sure = '1'; el.textContent = 'CERTEZA?'; setTimeout(() => { if (el.isConnected) { el.dataset.sure = ''; el.textContent = 'REMOVER'; } }, 2500); return; }
        this.act(a, id);
      }
    });
    document.getElementById('friends-body').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'fr-q') this.add(); });
    // avisa que está online e confere pedidos novos de tempos em tempos
    setInterval(() => { if (!document.hidden) this.tick(); }, 60000); // aba escondida: não gasta pedido (e volta a avisar assim que você volta)
    document.addEventListener('visibilitychange', () => { if (!document.hidden && performance.now() - (this._tt || 0) > 20000) this.tick(); });
    setTimeout(() => this.tick(), 4000);
  },
  async tick() {
    if (!LS.Account.logged()) { this.badge(0); return; }
    this._tt = performance.now();
    try { const d = await LS.Account.api('/api/friends'); this.data = d; /* o servidor já marca "online" ao listar amigos: o /api/ping separado era um pedido a mais */ this.badge(d.incoming.length); if (LS.UI.current === 'panel-friends') this.render(); } catch (e) { /* sem internet */ }
  },
  badge(n) {
    const b = document.getElementById('lb-fr-badge'), d = document.getElementById('lb-fr-dot');
    if (b) { b.textContent = n; b.classList.toggle('hidden', !n); }
    if (d) d.classList.toggle('hidden', !n);
  },
  async open() {
    this.msg = ''; this.err = '';
    LS.UI.openPanel('panel-friends'); this.render();
    if (LS.Account.logged()) { try { this.data = await LS.Account.api('/api/friends'); this.badge(this.data.incoming.length); } catch (e) { this.err = e.message; } this.render(); }
  },
  async add() {
    const q = (document.getElementById('fr-q').value || '').trim();
    if (!q) return;
    try { const d = await LS.Account.api('/api/friends/add', { query: q }); this.data = d; this.msg = d.msg; this.err = ''; }
    catch (e) { this.err = e.message; this.msg = ''; }
    this.render();
    if (!this.err) document.getElementById('fr-q').value = '';
  },
  async act(a, id) {
    try { const d = await LS.Account.api('/api/friends/' + a, { id }); this.data = d; this.msg = d.msg; this.err = ''; this.badge(d.incoming.length); }
    catch (e) { this.err = e.message; this.msg = ''; }
    this.render();
  },
  async profile(id) {
    try { const d = await LS.Account.profile(id); LS.UI.openPanel('panel-stats'); LS.Profile.open(LS.Profile.realProfile(d.profile, d.liked)); }
    catch (e) { this.err = e.message; this.render(); }
  },
  ago(t) {
    if (!t) return 'Offline';
    const m = Math.floor((Date.now() - t) / 60000);
    return m < 60 ? 'Visto há ' + Math.max(1, m) + ' min' : m < 1440 ? 'Visto há ' + Math.floor(m / 60) + ' h' : 'Visto há ' + Math.floor(m / 1440) + ' dia(s)';
  },
  row(f, kind) {
    const P = LS.Profile, look = Object.assign({}, LS.defaultProfile.look, f.look || {});
    let av = ''; try { av = P.headshot(look, f.avatarBg || 0); } catch (e) { /* sem WebGL */ }
    const tick = (f.badges || []).some(b => b !== 'tester') ? P.verifiedIcon() : '';
    const status = kind === 'friend' ? '<span class="fr-st' + (f.online ? ' on' : '') + '">' + (f.online ? 'Online' : this.ago(f.last)) + '</span>' : kind === 'in' ? '<span class="fr-st">Quer ser seu amigo</span>' : '<span class="fr-st">Pedido enviado</span>';
    const btns = kind === 'friend' ? '<button class="btn small" data-fr="profile" data-id="' + f.id + '">PERFIL</button><button class="btn small fr-x" data-fr="remove" data-id="' + f.id + '">REMOVER</button>'
      : kind === 'in' ? '<button class="btn small btn-primary" data-fr="accept" data-id="' + f.id + '">ACEITAR</button><button class="btn small" data-fr="decline" data-id="' + f.id + '">RECUSAR</button>'
      : '<button class="btn small" data-fr="decline" data-id="' + f.id + '">CANCELAR</button>';
    return '<div class="fr-row"><div class="fr-av' + (f.online && kind === 'friend' ? ' on' : '') + '">' + (av ? '<img src="' + av + '" alt="">' : '') + '</div><div class="fr-info"><b>' + P.esc(f.name) + tick + '</b><small>ID ' + f.id + '</small>' + status + '</div><div class="fr-btns">' + btns + '</div></div>';
  },
  render() {
    const box = document.getElementById('friends-body');
    if (!LS.Account.logged()) {
      box.innerHTML = '<div class="fr-guest"><b>AMIGOS PRECISAM DE CONTA</b><p>Crie uma conta (é rapidinho) pra adicionar amigos pelo ID ou pelo nome e ver quem está online.</p><button class="btn btn-primary" data-fr="login">CRIAR CONTA / ENTRAR</button></div>';
      return;
    }
    const d = this.data || { friends: [], incoming: [], outgoing: [] }, on = d.friends.filter(f => f.online).length;
    let h = '<div class="fr-add"><input id="fr-q" maxlength="16" autocomplete="off" spellcheck="false" placeholder="ID (10 números) ou nome do jogador"><button class="btn btn-primary" data-fr="add">ADICIONAR</button></div>' +
      '<p class="fr-me">Seu ID: <b>' + LS.playerProfile.id + '</b> · seu nome: <b>' + LS.Profile.esc(LS.playerProfile.name) + '</b> (passe pros amigos)</p>' +
      (this.msg ? '<p class="pf-err ok">' + LS.Profile.esc(this.msg) + '</p>' : '') + (this.err ? '<p class="pf-err">' + LS.Profile.esc(this.err) + '</p>' : '');
    if (d.incoming.length) h += '<div class="fr-sec">PEDIDOS DE AMIZADE <em>' + d.incoming.length + '</em></div>' + d.incoming.map(f => this.row(f, 'in')).join('');
    h += '<div class="fr-sec">AMIGOS <em>' + d.friends.length + '</em> <span>' + on + ' online</span></div>' +
      (d.friends.length ? d.friends.map(f => this.row(f, 'friend')).join('') : '<p class="fr-empty">Nenhum amigo ainda. Adicione pelo ID ou pelo nome aí em cima!</p>');
    if (d.outgoing.length) h += '<div class="fr-sec">ENVIADOS <em>' + d.outgoing.length + '</em></div>' + d.outgoing.map(f => this.row(f, 'out')).join('');
    const q = document.getElementById('fr-q'), keep = q ? q.value : '';
    box.innerHTML = h;
    if (keep) document.getElementById('fr-q').value = keep;
  }
};
