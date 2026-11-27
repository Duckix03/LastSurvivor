// Menus, painéis de configuração e inicialização
'use strict';
LS.UI = {
  screens: ['menu-main', 'lobby', 'panel-modes', 'panel-custom', 'panel-shop', 'panel-friends', 'panel-arsenal', 'panel-stats', 'panel-news', 'panel-mail', 'panel-settings', 'panel-controls', 'panel-credits', 'loading', 'pause', 'endscreen'],
  current: 'menu-main', backTo: 'menu-main', stack: [], // stack: de onde cada painel foi aberto (VOLTAR volta um passo)

  showScreen(id) {
    this.screens.forEach(s => document.getElementById(s).classList.toggle('active', s === id));
    this.current = id;
    if (id === 'menu-main' || id === null) this.stack = []; // no menu (ou jogando) não tem pra onde voltar
  },
  subPanelOpen() { return ['panel-modes', 'panel-custom', 'panel-shop', 'panel-friends', 'panel-settings', 'panel-controls', 'panel-credits', 'panel-arsenal', 'panel-stats', 'panel-news', 'panel-mail'].includes(this.current); },
  openPanel(id) {
    if (this.current && this.current !== id) this.stack.push(this.current);
    this.backTo = this.current !== id ? this.current : this.backTo; this.showScreen(id);
  },
  // volta pra tela de antes (painel aberto de dentro de outro painel volta pra ele, não fica preso)
  // painéis: o conteúdo rola numa caixa por dentro (.panel-scroll). Antes o painel inteiro rolava e a borda em degradê,
  // as listras e a faixa dos botões rolavam junto (borda cortada no meio, faixa escura "vazando" no celular)
  wrapPanels() {
    document.querySelectorAll('.panel-screen > .panel:not(.set-panel)').forEach(p => {
      if (p.querySelector(':scope > .panel-scroll')) return;
      const box = document.createElement('div'); box.className = 'panel-scroll';
      [...p.children].filter(c => c.tagName !== 'H2' && !c.classList.contains('panel-buttons') && c.id !== 'pf-modal').forEach(c => box.appendChild(c));
      const btns = p.querySelector(':scope > .panel-buttons');
      p.insertBefore(box, btns || null);
      p.classList.add('wrapped');
    });
  },
  back() {
    if (this.current === 'panel-custom' && LS.Custom) LS.Custom.leave(true); // sair da tela da sala = sair da sala
    let to = this.stack.pop();
    while (to && (to === this.current || to === 'loading')) to = this.stack.pop();
    this.showScreen(to || 'menu-main');
  },
  updateMenuStats() {
    if (LS.Menu) LS.Menu.render();
  },

  // ---------- Configurações ----------
  bindSettings() {
    const S = LS.settings, $ = id => document.getElementById(id);
    const pc = x => Math.round(x * 100) + '%';
    const SENS = [['set-s-general', 'sensGeneral'], ['set-s-reddot', 'sensRedDot'], ['set-s-4x', 'sens4x'], ['set-s-6x', 'sens6x'], ['set-s-8x', 'sens8x']];
    let sync = () => {
      for (const [id, k] of SENS) { $(id).value = S[k]; $('val-' + id.slice(4)).textContent = S[k]; }
      $('set-res').value = S.resScale; $('val-res').textContent = pc(S.resScale);
      document.querySelectorAll('#set-quality [data-q]').forEach(b => b.classList.toggle('on', b.dataset.q === S.quality));
      document.querySelectorAll('#set-filter [data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === (S.filter || 'classico')));
      const v = S.vivid === undefined ? 0.6 : S.vivid; $('set-vivid').value = v; $('val-vivid').textContent = pc(v);
      $('set-dist').value = S.renderDistance; $('val-dist').textContent = S.renderDistance + ' m';
      $('set-postfx').checked = S.postfx !== false;
      $('set-perf').checked = S.perfMode;
      $('set-fps').checked = S.showFps;
      $('set-vol').value = S.volume; $('val-vol').textContent = pc(S.volume);
      const mv = S.musicVol === undefined ? 0.5 : S.musicVol; $('set-music').value = mv; $('val-music').textContent = pc(mv);
      $('set-aa').checked = S.aimAssist !== false;
      $('set-fullscreen').checked = !!LS.Full.el();
      $('set-btns').value = S.btnSize || 1; $('val-btns').textContent = pc(S.btnSize || 1); // celular
      $('set-btna').value = S.btnAlpha === undefined ? 0.85 : S.btnAlpha; $('val-btna').textContent = pc(S.btnAlpha === undefined ? 0.85 : S.btnAlpha);
      $('set-uis').value = S.uiSize || 1; $('val-uis').textContent = pc(S.uiSize || 1);
    };
    const sync0 = sync;
    sync = () => { // + gráfico automático e limite de FPS
      sync0();
      $('set-autoq').checked = !!S.autoQ;
      const T = LS.Gfx, lv = (S.autoTier | 0) + 1;
      $('set-autoq-info').textContent = S.autoQ ? 'nível ' + lv + ' de 6' + (T.lastFps ? ' · ' + Math.round(T.lastFps) + ' FPS na última partida' : '') + ' · placa: ' + (T.klass === 'strong' ? 'forte' : T.klass === 'mid' ? 'média' : T.klass === 'weak' ? 'fraca' : '?') : 'desligado: você escolhe a qualidade';
      document.querySelectorAll('#set-fpscap [data-cap]').forEach(b => b.classList.toggle('on', +b.dataset.cap === (+S.fpsCap || 0)));
    };
    this.syncSettings = sync;
    const changed = () => { LS.saveSettings(); sync(); LS.Game.applySettings(); };
    // abas
    this.setTab = tab => {
      this.settingsTab = tab;
      document.querySelectorAll('#set-tabs [data-st]').forEach(b => b.classList.toggle('on', b.dataset.st === tab));
      document.querySelectorAll('#panel-settings .set-pane').forEach(p => p.classList.toggle('on', p.dataset.pane === tab));
      $('set-reset').style.visibility = tab === 'conta' ? 'hidden' : ''; // "padrão" não mexe na conta
      if (tab === 'conta' && LS.Conta) LS.Conta.render();
    };
    $('set-tabs').addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (b) { LS.Audio.click(); this.setTab(b.dataset.st); } });
    for (const [id, k] of SENS) $(id).addEventListener('input', e => { S[k] = +e.target.value; LS.saveSettings(); sync(); });
    const manual = () => { if (S.autoQ) { S.autoQ = false; } }; // mexeu no gráfico na mão: desliga o automático
    $('set-quality').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) { LS.Audio.click(); manual(); S.quality = b.dataset.q; changed(); } });
    $('set-autoq').addEventListener('change', e => { S.autoQ = e.target.checked; if (S.autoQ) LS.Gfx.setTier(S.autoTier !== undefined ? S.autoTier : LS.Gfx.startTier()); changed(); });
    $('set-fpscap').addEventListener('click', e => { const b = e.target.closest('[data-cap]'); if (b) { LS.Audio.click(); S.fpsCap = +b.dataset.cap; changed(); } });
    $('set-filter').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { LS.Audio.click(); S.filter = b.dataset.f; if (!S.vivid) S.vivid = 0.6; changed(); } });
    $('set-vol').addEventListener('input', e => { S.volume = +e.target.value; changed(); });
    $('set-music').addEventListener('input', e => { S.musicVol = +e.target.value; changed(); if (LS.Music) LS.Music.sync(); });
    $('set-dist').addEventListener('input', e => { manual(); S.renderDistance = +e.target.value; changed(); });
    $('set-fps').addEventListener('change', e => { S.showFps = e.target.checked; changed(); });
    $('set-res').addEventListener('input', e => { manual(); S.resScale = +e.target.value; changed(); });
    $('set-perf').addEventListener('change', e => { manual(); S.perfMode = e.target.checked; changed(); });
    $('set-postfx').addEventListener('change', e => { manual(); S.postfx = e.target.checked; changed(); });
    $('set-aa').addEventListener('change', e => { S.aimAssist = e.target.checked; changed(); });
    $('set-vivid').addEventListener('input', e => { S.vivid = +e.target.value; changed(); });
    const touchSet = (id, key) => $(id).addEventListener('input', e => { S[key] = +e.target.value; LS.saveSettings(); sync(); LS.Touch.fit(); });
    touchSet('set-btns', 'btnSize'); touchSet('set-btna', 'btnAlpha'); touchSet('set-uis', 'uiSize');
    $('set-fullscreen').addEventListener('change', e => {
      S.fullscreen = e.target.checked; LS.saveSettings();
      if (e.target.checked) LS.Full.enter().catch(() => { e.target.checked = false; });
      else LS.Full.exit();
    });
    document.addEventListener('fullscreenchange', sync);
    sync(); this.setTab('sens');
  },

  onAction(a) {
    LS.Audio.init(); LS.Audio.click();
    switch (a) {
      case 'play': LS.Touch.goFull(); if (LS.Game.state !== 'menu' && LS.Game.state !== 'lobby') LS.Game.quitToMenu(); LS.Lobby.startSearch(); break;
      case 'customize': LS.Lobby.open(); break;
      case 'arsenal': LS.Menu.renderArsenal(); this.openPanel('panel-arsenal'); break;
      case 'stats': LS.Menu.renderStats(); this.openPanel('panel-stats'); break;
      case 'stats-reset': LS.Menu.resetStats(); break;
      case 'news': this.openPanel('panel-news'); break;
      case 'mail': LS.Mail.open(); break;
      case 'modes': LS.Modes.open(); break;
      case 'shop': LS.Shop.open('shop'); break;
      case 'royale': LS.Shop.open('royale'); break;
      case 'friends': LS.Friends.open(); break;
      case 'custom': LS.Custom.open(); break;
      case 'mute': LS.Menu.toggleMute(); break;
      case 'fullscreen': LS.Menu.toggleFullscreen(); break;
      case 'lobby-start': LS.Touch.goFull(); LS.Lobby.startSearch(); break;
      case 'lobby-cancel': LS.Lobby.cancelSearch(); LS.Party.cancelled(); break;
      case 'lobby-random': LS.Lobby.random(); break;
      case 'lobby-reset': LS.Lobby.reset(); break;
      case 'lobby-back': LS.Lobby.cancelSearch(); LS.Wardrobe.leave(); LS.Game.quitToMenu(); break;
      case 'settings': this.syncSettings(); this.openPanel('panel-settings'); LS.Account.cloudUI(); break;
      case 'controls': this.openPanel('panel-controls'); break;
      case 'hud-edit': LS.HudEdit.start(); break;
      case 'hud-code': LS.HudEdit.start(); LS.HudEdit.codeOpen = true; LS.HudEdit.render(); break;
      case 'settings-cloud': LS.Account.pushSettings(true); break;
      case 'credits': this.openPanel('panel-credits'); break;
      case 'back': this.back(); break;
      case 'settings-reset':
        { // volta ao padrão só o que está na aba aberta
          const D = LS.defaultSettings, TAB = { sens: ['sensGeneral', 'sensRedDot', 'sens4x', 'sens6x', 'sens8x'],
            gfx: ['resScale', 'quality', 'filter', 'vivid', 'renderDistance', 'postfx', 'perfMode', 'showFps'], geral: ['volume', 'musicVol', 'aimAssist', 'btnSize', 'btnAlpha', 'uiSize'] };
          for (const k of TAB[this.settingsTab] || []) LS.settings[k] = D[k];
          if (this.settingsTab === 'gfx') { const P = LS.Gfx, mob = P.mobile(); LS.settings.autoQ = mob; LS.settings.fpsCap = mob ? 60 : 0; delete LS.settings.autoTier; if (mob) P.setTier(P.startTier(), true); }
          LS.saveSettings(); this.syncSettings(); LS.Game.applySettings(); LS.Touch.fit();
        }
        break;
      case 'resume': LS.Game.resume(); break;
      case 'quit': LS.Game.quitToMenu(); break;
    }
  }
};

window.addEventListener('load', () => {
  if (typeof THREE === 'undefined') {
    document.body.innerHTML = '<div style="color:#fff;font-family:sans-serif;padding:40px;font-size:20px">Não foi possível carregar o Three.js. Verifique sua conexão com a internet e recarregue a página.</div>';
    return;
  }
  if (window.__bootP) window.__bootP(0.7, 'MONTANDO O LOBBY…');
  LS.UI.wrapPanels();
  if (!LS.Full.can()) { // iPhone: sem tela cheia no navegador → esconde o botão e a opção
    document.querySelectorAll('[data-action="fullscreen"]').forEach(b => b.style.display = 'none');
    const sf = document.getElementById('set-fullscreen'); if (sf) sf.closest('.setting').style.display = 'none';
  }
  LS.checkAppVersion(); // app velho: tela de "atualize"
  LS.Gfx.boot(); // gráfico automático (celular): escolhe o nível pela placa de vídeo antes de criar o renderer
  LS.Game.init();
  LS.App.init(); // app Android (APK): botão voltar etc. No navegador não faz nada
  LS.Touch.init(); // celular: controles de toque (só liga em tela de toque)
  LS.Cosmetics.init(); // itens grátis / da loja (antes do guarda-roupa)
  LS.Lobby.build();
  LS.Anim.initLoco(); // carrega a run_f (anims/locomocao.json) para a corrida
  LS.Anim.initDrop(); // arrastar .glb/.fbx para a janela toca a animação no personagem
  LS.Modes.init();
  LS.Account.init(); // conta (se já entrou neste navegador)
  LS.Presence.init(); // "X jogando" no lobby
  LS.Mail.init(); // correio (avisos e presentes do dono do jogo)
  LS.Profile.init();
  LS.Conta.init(); // aba CONTA das configurações (e a página de login com Google aberta pelo app)
  LS.Shop.init(); LS.Friends.init(); LS.Custom.init(); LS.Menu.initBanners();
  LS.Party.init(); // party com amigos (até 4 no BR, 2 no duelo)
  LS.HudEdit.init(); // HUD personalizado do celular (posição, tamanho e opacidade)
  LS.Menu.init();
  document.getElementById('arsenal-list').addEventListener('click', e => { const b = e.target.closest('[data-wpn]'); if (b) { LS.Audio.init(); LS.Audio.click(); LS.Menu.pickLobbyWeapon(b.dataset.wpn); } });
  LS.UI.bindSettings();
  LS.UIKit.init(); // caixas de seleção, números, sliders e animações próprias (js/uikit.js)
  LS.UI.updateMenuStats();
  LS.Audio.armUnlock(); // música do lobby toca assim que carrega (ou no 1º toque, onde o navegador exige)
  // tela de carregamento some depois que o lobby já foi desenhado (2 quadros)
  if (window.__bootP) { window.__bootP(0.92, 'QUASE LÁ…'); requestAnimationFrame(() => requestAnimationFrame(() => window.__bootP(1, 'PRONTO!'))); }
  document.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', () => LS.UI.onAction(b.dataset.action)));
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape' && LS.UI.subPanelOpen()) LS.UI.back();
    else if (e.code === 'Escape' && LS.UI.current === 'lobby') { if (LS.Lobby.searching) { LS.Lobby.cancelSearch(); LS.Party.cancelled(); } else { LS.Wardrobe.leave(); LS.Game.quitToMenu(); } }
  });
});
