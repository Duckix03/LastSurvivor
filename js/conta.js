// Aba CONTA das configurações: entrar / criar conta, login com Google e sincronização entre aparelhos.
//
// Google no navegador: botão oficial do Google (Google Identity Services) → o servidor confere o token.
// Google no app (APK): o Google não deixa logar dentro do app (WebView), então o app abre o jogo no
// navegador do celular com ?glogin=app, a pessoa entra lá, e o navegador devolve um código de uso único
// pro app (com.duckix03.lastsurvivor://login?code=...). O app troca o código pela sessão.
'use strict';
LS.Conta = {
  APP_SCHEME: 'com.duckix03.lastsurvivor',
  formMode: 'login',
  esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },
  box() { return document.getElementById('conta-box'); },
  G_ICON: '<svg viewBox="0 0 48 48" class="g-ico"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',

  init() {
    this.webLoginPage(); // navegador aberto pelo app pra fazer o login com Google
    this.box().addEventListener('click', e => {
      const b = e.target.closest('[data-ct]'); if (!b) return;
      LS.Audio.init(); LS.Audio.click();
      const a = b.dataset.ct;
      if (a === 'mode') { this.formMode = b.dataset.v; this.render(); }
      else if (a === 'go') this.formGo();
      else if (a === 'logout') LS.Account.logout().then(() => this.render());
      else if (a === 'unlink') this.run(() => LS.Account.googleUnlink(), 'Google desligado da conta.');
      else if (a === 'pass') this.run(() => LS.Account.setPassword(document.getElementById('ct-newpass').value), 'Senha criada! Agora dá pra entrar com nome e senha também.');
      else if (a === 'app-google') this.appGoogle(LS.Account.logged());
      else if (a === 'profile') { LS.Profile.open(); LS.UI.openPanel('panel-stats'); }
      else if (a === 'daily') this.run(async () => { const d = await LS.Account.daily(); LS.Menu.render(); this._msg = '+' + d.got + ' diamantes! Volte amanhã.'; }, null).then(() => this._msg && this.render(this._msg));
      else if (a === 'redeem') this.redeem();
    });
    this.box().addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('.ct-form')) this.formGo(); });
  },

  // ---------- tela ----------
  render(msg, err) {
    const el = this.box(); if (!el) return;
    const A = LS.Account, P = LS.playerProfile, me = A.me;
    if (!A.available()) { el.innerHTML = '<div class="ct-card"><p class="ct-txt">Contas indisponíveis no momento.</p></div>'; return; }
    const av = LS.Profile ? LS.Profile.avatarOf(P) : '';
    const note = msg ? '<p class="ct-msg ' + (err ? 'err' : 'ok') + '">' + this.esc(msg) + '</p>' : '';
    if (A.logged()) {
      const g = me.google;
      el.innerHTML = '<div class="ct-card">' +
        '<div class="ct-head"><img class="ct-av" src="' + av + '" alt=""><div class="ct-who"><b>' + this.esc(P.name) + '</b><small>ID ' + P.id + '</small></div>' +
        '<span class="ct-sync">✓ SINCRONIZADO</span></div>' +
        '<p class="ct-txt">Perfil, visual, itens da loja e estatísticas ficam salvos na conta e aparecem em <b>qualquer aparelho</b> (celular, app ou computador) em que você entrar.</p>' +
        note +
        '<div class="ct-row"><span class="ct-ico">' + this.G_ICON + '</span><div class="ct-rt"><b>Google</b><small>' + (g ? this.esc(g.email || 'conectado') : 'Não conectado: ligue pra entrar com 1 toque em outro aparelho') + '</small></div>' +
        (g ? '<button class="btn small" data-ct="unlink">DESLIGAR</button>' : '<div class="ct-gslot" id="ct-gbtn"></div>') + '</div>' +
        (me.hasPass ? '' : '<div class="ct-row"><span class="ct-ico">🔑</span><div class="ct-rt"><b>Senha</b><small>Sua conta entra só pelo Google. Crie uma senha se quiser entrar com nome e senha também.</small>' +
          '<div class="ct-inline"><input id="ct-newpass" type="password" maxlength="64" placeholder="nova senha (6 ou mais)" autocomplete="new-password"><button class="btn small" data-ct="pass">CRIAR</button></div></div></div>') +
        this.walletRows() +
        '<div class="ct-btns"><button class="btn" data-ct="profile">VER PERFIL</button><button class="btn" data-ct="logout">SAIR DA CONTA</button></div></div>';
    } else {
      const reg = this.formMode === 'register';
      el.innerHTML = '<div class="ct-card">' +
        '<div class="ct-head"><img class="ct-av" src="' + av + '" alt=""><div class="ct-who"><b>' + this.esc(P.name) + '</b><small>Convidado: o progresso fica só neste aparelho</small></div></div>' +
        '<p class="ct-txt">Entre pra <b>sincronizar</b> o seu perfil, visual, itens e estatísticas entre o celular e o computador, e pra ninguém usar o seu nome. Com conta você também ganha <b>diamantes</b> e resgata <b>codiguins</b>.</p>' +
        note +
        '<div class="ct-gwrap" id="ct-gbtn"></div>' +
        '<div class="ct-or"><span>ou com nome e senha</span></div>' +
        '<div class="ct-form">' +
        '<div class="ct-tabs"><button class="' + (reg ? '' : 'on') + '" data-ct="mode" data-v="login">ENTRAR</button><button class="' + (reg ? 'on' : '') + '" data-ct="mode" data-v="register">CRIAR CONTA</button></div>' +
        '<input id="ct-name" maxlength="16" spellcheck="false" autocomplete="username" placeholder="nome (3 a 16: letras, números, _ . -)" value="' + (reg && P.name !== 'Jogador' ? this.esc(P.name) : '') + '">' +
        '<input id="ct-pass" type="password" maxlength="64" placeholder="senha' + (reg ? ' (6 ou mais)' : '') + '" autocomplete="' + (reg ? 'new-password' : 'current-password') + '">' +
        (reg ? '<input id="ct-pass2" type="password" maxlength="64" placeholder="repita a senha" autocomplete="new-password">' : '') +
        '<button class="btn btn-primary" data-ct="go">' + (reg ? 'CRIAR CONTA' : 'ENTRAR') + '</button></div></div>';
    }
    this.googleButton(document.getElementById('ct-gbtn'), A.logged());
  },
  // diamantes, recompensa diária e codiguin (só com conta)
  walletRows() {
    const me = LS.Account.me, left = (me.dailyAt || 0) + 20 * 3600e3 - Date.now();
    return '<div class="ct-row"><span class="ct-ico dark">' + LS.icon('gem', 'gem-i') + '</span><div class="ct-rt"><b>' + (me.diamonds || 0).toLocaleString('pt-BR') + ' diamantes</b><small>Compram fantasias completas na loja. Ganhe em codiguins e todo dia aqui.</small></div>' +
      (left <= 0 ? '<button class="btn small btn-primary" data-ct="daily">+10 DIÁRIO</button>' : '<small class="ct-wait">próximo em ' + Math.ceil(left / 3600e3) + ' h</small>') + '</div>' +
      '<div class="ct-row"><span class="ct-ico dark">' + LS.icon('plus') + '</span><div class="ct-rt"><b>Codiguin</b><small>Itens exclusivos, moedas e diamantes.</small>' +
      '<div class="ct-inline"><input id="ct-code" maxlength="20" spellcheck="false" autocomplete="off" placeholder="DIGITE O CÓDIGO" style="text-transform:uppercase;letter-spacing:2px"><button class="btn small" data-ct="redeem">RESGATAR</button></div></div></div>';
  },
  async run(fn, okMsg) {
    try { this._msg = null; await fn(); if (okMsg) this.render(okMsg); } catch (e) { this.render(e.message, true); }
  },
  async redeem() {
    const inp = document.getElementById('ct-code'); if (!inp || !inp.value.trim()) return;
    try {
      const R = await LS.Account.redeemCode(inp.value.trim()), it = R.item && LS.Cosmetics.byId[R.item], p = [];
      if (it) p.push(it.name + (R.had ? ' (você já tinha)' : ''));
      if (R.coins) p.push('+' + R.coins.toLocaleString('pt-BR') + ' moedas');
      if (R.diamonds) p.push('+' + R.diamonds.toLocaleString('pt-BR') + ' diamantes');
      LS.Audio.victory(); LS.Menu.render(); this.render('Codiguin resgatado: ' + p.join(', ') + '!');
    } catch (e) { this.render(e.message, true); }
  },
  async formGo() {
    const n = document.getElementById('ct-name'), p = document.getElementById('ct-pass'), p2 = document.getElementById('ct-pass2');
    if (!n) return;
    const reg = this.formMode === 'register', name = n.value.trim(), pass = p.value;
    if (reg && p2 && pass !== p2.value) return this.render('As senhas não são iguais.', true);
    const btn = this.box().querySelector('[data-ct="go"]'); btn.disabled = true; btn.textContent = '...';
    await this.run(() => reg ? LS.Account.register(name, pass) : LS.Account.login(name, pass), reg ? 'Conta criada! Tudo sincronizado.' : 'Bem-vindo de volta!');
    if (LS.Profile && LS.Profile.bound) LS.Profile.renderTop();
  },

  // ---------- botão do Google ----------
  googleButton(slot, link) {
    if (!slot) return;
    if (!LS.GOOGLE_CLIENT_ID) {
      slot.innerHTML = '<button class="g-btn" disabled>' + this.G_ICON + '<span>' + (link ? 'LIGAR GOOGLE' : 'ENTRAR COM GOOGLE') + '</span><em>EM BREVE</em></button>';
      return;
    }
    if (LS.IS_APP) { // no app o login acontece no navegador do celular
      slot.innerHTML = '<button class="g-btn" data-ct="app-google">' + this.G_ICON + '<span>' + (link ? 'LIGAR GOOGLE' : 'ENTRAR COM GOOGLE') + '</span></button>';
      return;
    }
    slot.innerHTML = '<div class="g-loading">carregando Google…</div>';
    this.loadGis().then(() => {
      google.accounts.id.initialize({ client_id: LS.GOOGLE_CLIENT_ID, callback: r => this.onCredential(r.credential), auto_select: false, cancel_on_tap_outside: true });
      slot.innerHTML = '';
      google.accounts.id.renderButton(slot, { theme: 'filled_black', size: 'large', shape: 'pill', text: link ? 'continue_with' : 'signin_with', locale: 'pt-BR', width: link ? 220 : 300 });
    }).catch(() => { slot.innerHTML = '<div class="g-loading">Não deu pra carregar o Google (internet?)</div>'; });
  },
  loadGis() {
    if (window.google && google.accounts && google.accounts.id) return Promise.resolve();
    return this._gis || (this._gis = new Promise((ok, fail) => {
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = ok; s.onerror = () => { this._gis = null; fail(); }; document.head.appendChild(s);
    }));
  },
  async onCredential(cred) {
    if (this.webMode) return this.webCredential(cred);
    const A = LS.Account;
    if (A.logged()) await this.run(async () => { const d = await A.google(cred); A.apply(d.account); }, 'Google ligado! Agora é só entrar com ele em outro aparelho.');
    else { await this.run(() => A.googleLogin(cred), 'Pronto! Conta conectada e sincronizada.'); if (LS.Profile && LS.Profile.bound) LS.Profile.renderTop(); }
  },

  // ---------- app: abre o navegador pra entrar com Google ----------
  async appGoogle(link) {
    let url = LS.WEB_URL + '?glogin=app&name=' + encodeURIComponent(LS.playerProfile.name || '');
    try { if (link) url += '&link=' + await LS.Account.handoff(); } catch (e) { return this.render(e.message, true); }
    this.render('Termine o login no navegador e toque em VOLTAR PRO JOGO.');
    location.href = url; // o app abre links de fora no navegador do celular
  },
  // o navegador devolveu o código (com.duckix03.lastsurvivor://login?code=...)
  async onAppUrl(url) {
    const m = /[?&]code=([0-9a-f]{32})/.exec(url || ''); if (!m) return;
    try {
      await LS.Account.redeem(m[1]);
      if (LS.Profile && LS.Profile.bound) LS.Profile.renderTop();
      this.render('Pronto! Conta conectada e sincronizada.');
      const G = LS.Game.state; if ((G === 'menu' || G === 'lobby') && LS.UI.current !== 'panel-settings') { LS.UI.openPanel('panel-settings'); LS.UI.setTab('conta'); }
    } catch (e) { this.render(e.message, true); }
  },

  // ---------- navegador aberto pelo app (?glogin=app) ----------
  webLoginPage() {
    const q = new URLSearchParams(location.search);
    if (q.get('glogin') !== 'app' || LS.IS_APP) return;
    this.webMode = { name: q.get('name') || '', link: q.get('link') || '' };
    const ov = document.createElement('div'); ov.id = 'glogin';
    ov.innerHTML = '<div class="gl-box"><img src="favicon.png" alt="" class="gl-logo"><h2>LAST SURVIVOR</h2>' +
      '<p>' + (this.webMode.link ? 'Ligue o Google à conta que você usa no app.' : 'Entre com Google pra usar a sua conta no app.') + '</p>' +
      '<div id="gl-btn" class="gl-btn"></div><p id="gl-msg" class="gl-msg"></p>' +
      '<a id="gl-back" class="btn btn-primary gl-back hidden">VOLTAR PRO JOGO</a></div>';
    document.body.appendChild(ov);
    if (!LS.GOOGLE_CLIENT_ID) { document.getElementById('gl-msg').textContent = 'O login com Google ainda não está ativado.'; return; }
    this.loadGis().then(() => {
      google.accounts.id.initialize({ client_id: LS.GOOGLE_CLIENT_ID, callback: r => this.onCredential(r.credential) });
      google.accounts.id.renderButton(document.getElementById('gl-btn'), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: 'pt-BR', width: 280 });
    }).catch(() => { document.getElementById('gl-msg').textContent = 'Não deu pra carregar o Google. Confira a internet.'; });
  },
  async webCredential(cred) {
    const msg = document.getElementById('gl-msg'), W = this.webMode;
    msg.textContent = 'Conferindo…';
    // fala direto com o servidor, sem mexer na conta deste navegador
    const call = async (path, body, token) => {
      const r = await fetch(LS.NET_URL.replace(/\/$/, '') + path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Erro ' + r.status); return d;
    };
    try {
      const d = await call('/api/google', W.link ? { idToken: cred, linkCode: W.link } : { idToken: cred, name: W.name });
      const { code } = await call('/api/handoff', {}, d.token);
      const back = document.getElementById('gl-back');
      back.href = 'intent://login?code=' + code + '#Intent;scheme=' + this.APP_SCHEME + ';package=' + this.APP_SCHEME + ';end';
      back.classList.remove('hidden'); document.getElementById('gl-btn').style.display = 'none';
      msg.textContent = (d.linked ? 'Google ligado à conta ' : 'Entrou como ') + d.account.name + '. Toque pra voltar pro jogo:';
      setTimeout(() => { location.href = this.APP_SCHEME + '://login?code=' + code; }, 300); // tenta voltar sozinho
    } catch (e) { msg.textContent = e.message; }
  },
};
