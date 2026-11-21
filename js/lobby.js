// Lobby: cena 3D com o personagem, personalização e busca de partida
'use strict';
LS.Lobby = {
  built: false, rotY: 0.4, dragging: false, mmT: 0, mmCount: 1, searching: false,

  build() {
    if (this.built) return;
    this.built = true;
    const sc = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 420); // enxerga o céu e a cidade ao longe
    LS.LobbyScene.build(sc, this);
    // personagem do jogador (segura a arma escolhida no Arsenal)
    this.model = new LS.CharacterModel({ look: LS.playerProfile.look });
    this.model.setGun(LS.playerProfile.weapon || null);
    sc.add(this.model.root);
    // dois sobreviventes conversando no fundo
    this.extras = [];
    [[-2.2, -1.9, 0.35], [2.2, -1.9, -0.35]].forEach(([x, z, ry]) => {
      const m = new LS.CharacterModel({}); m.root.position.set(x, 0, z); m.root.rotation.y = ry; m.setGun(ry > 0 ? 'm4a1' : 'ak47'); m.setGear(2, 1, 1);
      sc.add(m.root); this.extras.push(m);
    });
    // rotação com o mouse
    document.getElementById('lobby').addEventListener('mousedown', e => {
      if (LS.Game.state === 'lobby' && (e.target.id === 'lobby' || e.target.classList.contains('lobby-hint'))) { this.dragging = true; this.lastX = e.clientX; }
    });
    document.getElementById('menu-main').addEventListener('mousedown', e => {
      if (LS.Game.state === 'menu' && !e.target.closest('button')) { this.dragging = true; this.lastX = e.clientX; }
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', e => { if (this.dragging) { this.rotY += (e.clientX - this.lastX) * 0.01; this.lastX = e.clientX; } });
    window.addEventListener('resize', () => { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); });
    document.body.appendChild(document.getElementById('lobby-mm'));
    this.buildUI();
    this.syncUI();
  },

  buildUI() {
    LS.Wardrobe.init(); // guarda-roupa em grade (js/wardrobe.js)
    // o nome é trocado no perfil (custa moedas): tocar no campo abre a edição do perfil
    const name = document.getElementById('lobby-name');
    name.readOnly = true; name.title = 'Trocar de nome: no perfil (' + LS.RENAME_COST.toLocaleString('pt-BR') + ' moedas)';
    name.addEventListener('click', () => { LS.Audio.init(); LS.Audio.click(); LS.Wardrobe.leave(); LS.Game.quitToMenu(); LS.Profile.open(); LS.UI.openPanel('panel-stats'); LS.Profile.openEdit(); });
  },
  changed() {
    LS.saveProfile();
    if (LS.Profile && LS.Profile.bound) LS.Profile.renderTop(); // foto 3D acompanha o visual
    this.model.applyLook(LS.playerProfile.look);
    this.syncUI();
  },
  syncUI() {
    document.getElementById('lobby-name').value = LS.playerProfile.name;
    document.getElementById('menu-player-name').textContent = LS.playerProfile.name;
    const n = document.getElementById('lobby-name'); n.disabled = false; // só leitura; tocar abre o perfil
  },
  open() {
    this.build();
    this.cancelSearch();
    this.model.applyLook(LS.playerProfile.look);
    this.extras.forEach(m => m.applyLook(LS.Skin.randomLook()));
    this.syncUI(); LS.Wardrobe.open();
    LS.HUD.show(false);
    LS.UI.showScreen('lobby');
    LS.Game.state = 'lobby';
  },
  random() { const n = LS.playerProfile.name; LS.playerProfile.look = Object.assign(LS.Skin.randomLook(), { legs: 'lisa' }); LS.playerProfile.name = n; LS.Wardrobe.sel = null; LS.Wardrobe.preview = null; this.changed(); LS.Wardrobe.render(); },
  reset() { LS.playerProfile.look = Object.assign({ legs: 'lisa' }, LS.defaultProfile.look); LS.Wardrobe.sel = null; LS.Wardrobe.preview = null; this.changed(); LS.Wardrobe.render(); },
  startSearch() {
    if (this.searching) return;
    if (LS.Wardrobe.preview) LS.Wardrobe.leave(); // não entra em partida com item só provado
    this.searching = true; this.mmCount = 1; this.mmT = 0;
    document.getElementById('lobby-mm').classList.remove('hidden');
    this.updateCount();
    if (LS.Modes.id === 'duel') { document.querySelector('#lobby-mm h3').textContent = 'PROCURANDO OPONENTE'; this.mmT = LS.util.rand(1, 1.8); return; } // duelo: 1v1 contra bot (offline por enquanto)
    if (!LS.Net.configured()) return; // sem servidor: busca "de mentira" e partida contra bots (como antes)
    // online: procura jogadores de verdade por até 30 s; se não achar ninguém, joga contra bots
    this.online = true;
    const title = document.querySelector('#lobby-mm h3'), cnt = document.getElementById('mm-count');
    title.textContent = 'PROCURANDO JOGADORES'; cnt.textContent = 'conectando ao servidor…';
    LS.Net.find({
      onQueue: (n, left) => { cnt.textContent = n + (n === 1 ? ' jogador' : ' jogadores') + ' · ' + left + ' s'; },
      onStart: d => { this.searching = false; this.online = false; document.getElementById('lobby-mm').classList.add('hidden'); LS.Game.startOnline(d); },
      onFail: why => {
        if (!this.searching) return;
        this.online = false;
        title.textContent = why === 'nomatch' ? 'NINGUÉM ONLINE AGORA' : why === 'outdated' ? 'JOGO DESATUALIZADO' : 'SERVIDOR INDISPONÍVEL';
        cnt.textContent = 'começando contra bots…';
        if (why === 'outdated') { // versão velha não entra no online (crossplay com regras diferentes dá bug)
          cnt.textContent = LS.IS_APP ? 'baixe o app novo pra jogar online · contra bots…' : 'recarregue a página pra jogar online · contra bots…';
          if (LS.IS_APP && !this._askedUpdate) { this._askedUpdate = true; setTimeout(() => { if (confirm('Tem uma versão nova do Last Survivor!\nBaixar agora pra jogar online?')) location.href = LS.APP_DOWNLOAD_URL; }, 1600); }
        }
        setTimeout(() => { if (!this.searching) return; this.searching = false; document.getElementById('lobby-mm').classList.add('hidden'); title.textContent = 'PROCURANDO PARTIDA'; LS.Game.startMatch(); }, 1400);
      },
    });
  },
  cancelSearch() {
    this.searching = false; this.online = false; LS.Net.cancel();
    document.getElementById('lobby-mm').classList.add('hidden');
    const t = document.querySelector('#lobby-mm h3'); if (t) t.textContent = 'PROCURANDO PARTIDA';
  },
  updateCount() { document.getElementById('mm-count').textContent = this.mmCount + ' / ' + LS.Modes.maxPlayers() + ' jogadores'; },
  launch() { if (LS.Modes.id === 'duel') LS.Game.startDuel(); else LS.Game.startMatch(); },

  update(dt) {
    const t = performance.now() * 0.001;
    const menuNow = LS.Game.state === 'menu';
    if (!this.dragging) { if (menuNow) this.rotY = LS.util.lerp(this.rotY, Math.sin(t * 0.4) * 0.25, Math.min(1, dt * 2)); else this.rotY += dt * 0.25; }
    this.model.root.rotation.y = this.rotY; this.model.root.position.y = 0;
    const armed = !!this.model.gunId;
    this.model.animate({ dt, speed: 0, aimPitch: 0, armed, running: armed, armedAim: false, idle: true });
    this.extras.forEach((m, i) => { // colegas de squad nas laterais, parados e olhando em volta
      m.animate({ dt, speed: 0, aimPitch: 0, armed: !!m.gunId, running: !!m.gunId, armedAim: false, idle: true });
      m.headG.rotation.y = Math.sin(t * 0.5 + i * 2.3) * 0.3;
    });
    this.ring.material.opacity = 0.45 + Math.sin(t * 2) * 0.15;
    LS.LobbyScene.update(this, dt, t);
    // câmera: personagem à direita do painel
    const aspect = window.innerWidth / window.innerHeight;
    const inMenu = LS.Game.state === 'menu';
    // menu: câmera perto e baixa, personagem grande no centro em cima do pedestal (estilo lobby de BR mobile)
    const tx = inMenu ? 0 : -1.9, dist = (inMenu ? 4.4 : 6.4) / Math.min(1, aspect / 1.5), cy = inMenu ? 1.45 : 1.6, ly = inMenu ? 1.2 : 0.95;
    const k = Math.min(1, dt * 4);
    this.camX = LS.util.lerp(this.camX === undefined ? tx : this.camX, tx, k);
    this.camD = LS.util.lerp(this.camD === undefined ? dist : this.camD, dist, k);
    this.camY = LS.util.lerp(this.camY === undefined ? cy : this.camY, cy, k); this.camLY = LS.util.lerp(this.camLY === undefined ? ly : this.camLY, ly, k);
    this.camera.position.set(this.camX + Math.sin(t * 0.3) * 0.08, this.camY, this.camD);
    this.camera.lookAt(this.camX, this.camLY, 0);
    if (this.searching && !this.online) {
      this.mmT -= dt;
      if (this.mmT <= 0) {
        this.mmT = LS.util.rand(0.03, 0.12);
        const max = LS.Modes.maxPlayers();
        if (max <= 2) this.mmT = LS.util.rand(0.6, 1.1); // duelo: acha o oponente rapidinho
        this.mmCount = Math.min(max, this.mmCount + LS.util.randInt(1, 2));
        this.updateCount();
        if (this.mmCount >= max) { this.searching = false; setTimeout(() => { document.getElementById('lobby-mm').classList.add('hidden'); const t = document.querySelector('#lobby-mm h3'); if (t) t.textContent = 'PROCURANDO PARTIDA'; this.launch(); }, 500); }
      }
    }
  }
};
