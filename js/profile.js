// Perfil no estilo Free Fire: personagem 3D do lado, foto de perfil (foto 3D do seu boneco), nome, ID,
// curtidas, recado (bio), selos (verificado, criador de conteúdo, dev, owner), patente, nível e estatísticas.
// Nome, curtidas e selos de verdade vêm da CONTA (js/account.js). Também mostra o perfil de outros jogadores:
// de contas (busca por ID) e de bots (no fim da partida).
// (Não tem envio de imagem de propósito: assim ninguém coloca foto imprópria no perfil.)
'use strict';
LS.Profile = {
  // selos: quem tem algum fica com o "verificado" azul do lado do nome
  BADGES: {
    owner: { label: 'OWNER', cls: 'b-owner', icon: '<path d="M3 18h18l-2-10-5 4-2-7-2 7-5-4z" fill="currentColor"/>' },
    dev: { label: 'DEV', cls: 'b-dev', icon: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' },
    cc: { label: 'CRIADOR DE CONTEÚDO', cls: 'b-cc', icon: '<rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor"/><path d="M10 9l5 3-5 3z" fill="#fff"/>' },
    verificado: { label: 'VERIFICADO', cls: 'b-ver', icon: '<path d="M12 2l2.6 2 3.3-.3.9 3.2 2.9 1.6-1.2 3.1 1.2 3.1-2.9 1.6-.9 3.2-3.3-.3L12 22l-2.6-2-3.3.3-.9-3.2-2.9-1.6 1.2-3.1-1.2-3.1 2.9-1.6.9-3.2 3.3.3z" fill="currentColor"/><path d="M8 12l3 3 5-6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' }
  },
  BG: [['#ff8a1f', '#ffc531'], ['#2fd6ff', '#3a5bff'], ['#ff4d6d', '#7a1fff'], ['#8cf060', '#1f8a5a'], ['#ffe3a0', '#ff7a59'], ['#2a3246', '#5a6478'], ['#ff5ad1', '#ffb36b'], ['#1a1a1a', '#ff3b3b']],
  RANKS: [[0, 'BRONZE', '#c98a5a'], [5, 'PRATA', '#c9d2e3'], [10, 'OURO', '#ffc531'], [15, 'PLATINA', '#5ad1c9'], [20, 'DIAMANTE', '#7ab8ff'], [30, 'MESTRE', '#c08cff'], [40, 'DESAFIANTE', '#ff4d6d']],
  BIOS: ['Só jogo de capa 🎯', 'Rush ou nada!', 'Sniper desde 2019', 'Mira na cabeça e fé', 'Procurando squad', 'Não confia no gás', 'Bora x1 no galpão?', 'Main escopeta 💥', 'Último em pé, sempre', 'GG no final'],
  cache: {},

  // ---------- dados do jogador ----------
  init() {
    const P = LS.playerProfile;
    if (!P.id) P.id = String(1000000000 + Math.floor(Math.random() * 8999999999)); // ID de 10 dígitos, fixo pra sempre
    if (typeof P.likes !== 'number') P.likes = 0;
    if (typeof P.bio !== 'string' || P.bio === 'Bora sobreviver! 🪂') P.bio = 'Bora sobreviver!'; // (o 🪂 não aparece em todo computador)
    if (!Array.isArray(P.badges)) P.badges = [];
    if (!P.avatar || P.avatar.type !== '3d') P.avatar = { type: '3d', bg: (P.avatar && P.avatar.bg) || 0 }; // (imagem enviada não existe mais)
    if (!P.cover) P.cover = 'br';
    LS.saveProfile();
    this.bind(); this.bound = true;
    this.renderTop();
    document.getElementById('end-foe').addEventListener('click', () => {
      if (!this.endFoe) return; LS.Audio.init(); LS.Audio.click();
      this.open(this.fakeProfile(this.endFoe)); LS.UI.openPanel('panel-stats');
    });
  },
  // selos só existem em conta (o servidor é quem dá); convidado não tem
  badgesOf(p) { if (p === LS.playerProfile && !LS.Account.logged()) return []; return (p.badges || []).filter((b, i, l) => this.BADGES[b] && l.indexOf(b) === i); },
  rankOf(level) { let r = this.RANKS[0]; for (const k of this.RANKS) if (level >= k[0]) r = k; return { name: r[1], color: r[2] }; },
  hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; },
  esc(t) { return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },

  // ---------- fotos 3D (com os modelos do jogo) ----------
  lights(sc) {
    sc.add(new THREE.HemisphereLight(0xffffff, 0x445066, 0.75));
    const key = new THREE.DirectionalLight(0xfff1dc, 0.8); key.position.set(2, 3, 4); sc.add(key);
    const rim = new THREE.DirectionalLight(0x9fdcff, 0.7); rim.position.set(-3, 2, -3); sc.add(rim);
  },
  model(look, gun, pose) {
    const m = new LS.CharacterModel({ look });
    m.setGun(gun || null);
    const s = Object.assign({ dt: 0.05, speed: 0, aimPitch: 0, armed: !!gun, running: !!gun, armedAim: false, idle: true }, pose || {});
    for (let i = 0; i < 40; i++) m.animate(s);
    return m;
  },
  // foto de rosto (fundo transparente) pintada sobre um degradê
  headshot(look, bg) {
    const k = 'h|' + JSON.stringify(look) + '|' + bg;
    if (this.cache[k]) return this.cache[k];
    const sc = new THREE.Scene(); this.lights(sc);
    const m = this.model(look, null); m.root.rotation.y = 0.35; sc.add(m.root);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20); cam.position.set(0.18, 1.62, 1.35); cam.lookAt(0, 1.5, 0);
    const shot = LS.Banners.snap(sc, cam, 160, 160, { alpha: true, ss: 2 });
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d'), cols = this.BG[bg % this.BG.length], gr = g.createLinearGradient(0, 0, 160, 160);
    gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1]); g.fillStyle = gr; g.fillRect(0, 0, 160, 160);
    g.globalAlpha = 0.18; g.fillStyle = '#fff'; for (let i = -160; i < 160; i += 22) { g.beginPath(); g.moveTo(i, 160); g.lineTo(i + 10, 160); g.lineTo(i + 170, 0); g.lineTo(i + 160, 0); g.fill(); }
    g.globalAlpha = 1; g.drawImage(shot, 0, 0);
    return (this.cache[k] = c.toDataURL('image/png'));
  },
  // personagem de corpo inteiro (fundo transparente) pro lado do perfil
  fullbody(look, gun) {
    const k = 'f|' + JSON.stringify(look) + '|' + gun;
    if (this.cache[k]) return this.cache[k];
    const sc = new THREE.Scene(); this.lights(sc);
    const m = this.model(look, gun); m.root.rotation.y = 0.5; sc.add(m.root);
    const cam = new THREE.PerspectiveCamera(28, 0.62, 0.1, 30); cam.position.set(0.3, 1.05, 4.3); cam.lookAt(0, 0.95, 0);
    return (this.cache[k] = LS.Banners.snap(sc, cam, 310, 500, { alpha: true, ss: 2 }).toDataURL('image/png'));
  },
  // foto do perfil de alguém (a enviada pela pessoa, ou a foto 3D do boneco)
  avatarOf(p) {
    try { return this.headshot(p.look, (p.avatar && p.avatar.bg) || 0); } catch (e) { return ''; }
  },
  coverOf(p) {
    const id = p.cover || 'br';
    if (id.startsWith('g')) return null; // capa de cor lisa (degradê)
    return LS.Banners.cached(id);
  },

  // ---------- topo do lobby ----------
  renderTop() {
    const el = document.getElementById('lb-avatar'); if (!el || !LS.Game.renderer) return;
    const P = LS.playerProfile, url = this.avatarOf(P);
    el.innerHTML = url ? '<img src="' + url + '" alt="">' : this.esc((P.name || 'J').charAt(0).toUpperCase());
    const v = document.getElementById('lb-verified'); if (v) v.innerHTML = this.badgesOf(P).length ? this.verifiedIcon() : LS.Account.logged() ? '' : '<span class="lb-guest">CONVIDADO</span>';
  },
  verifiedIcon() { return '<svg class="pf-vtick" viewBox="0 0 24 24">' + this.BADGES.verificado.icon + '</svg>'; },

  // ---------- perfil de outro jogador (bots): dados fixos tirados do nome ----------
  fakeProfile(f) {
    const R = LS.util.seeded(this.hash(f.name + '|' + JSON.stringify(f.model.look)));
    const level = 3 + Math.floor(R() * 55), games = 20 + Math.floor(R() * 900), wins = Math.floor(games * (0.03 + R() * 0.2));
    const kills = Math.floor(games * (0.8 + R() * 3));
    return { other: true, name: f.name, look: f.model.look, weapon: f.weapons && f.weapons[0] ? f.weapons[0].id : (f.model.gunId || 'ak47'),
      id: String(1000000000 + (this.hash(f.name) % 8999999999)), likes: Math.floor(R() * R() * 4000), bio: this.BIOS[Math.floor(R() * this.BIOS.length)],
      badges: [], avatar: { type: '3d', bg: Math.floor(R() * this.BG.length) }, cover: ['br', 'duel1', 'duel2', 'g1'][Math.floor(R() * 4)],
      stats: { games, wins, kills, xp: 150 * (level - 1) * (level - 1) + Math.floor(R() * 150 * level), dmg: kills * (60 + R() * 40), best: wins ? 1 : 2 + Math.floor(R() * 10), coins: Math.floor(R() * 20000) } };
  },

  // ---------- painel ----------
  open(p) { // sem p = o seu perfil
    this.view = p || null; this.closeModal();
    this.render();
    LS.Banners.generate(['br', 'duel1', 'duel2'], () => { if (LS.UI.current === 'panel-stats') this.render(); }); // capas
  },
  render() {
    const own = !this.view, p = own ? LS.playerProfile : this.view, s = own ? LS.stats : p.stats;
    const M = LS.Menu, lvl = M.levelOf(s.xp), a = M.xpFor(lvl), b = M.xpFor(lvl + 1), rank = this.rankOf(lvl), badges = this.badgesOf(p);
    const games = s.games || 0, wins = s.wins || 0, deaths = Math.max(1, games - wins);
    const cover = this.coverOf(p), gcol = this.BG[(+String(p.cover || 'g0').slice(1) || 0) % this.BG.length];
    const coverStyle = cover ? 'background-image:url(' + cover + ')' : 'background:linear-gradient(160deg,' + gcol[0] + ',' + gcol[1] + ')';
    let body = '', full = '';
    try { full = this.fullbody(p.look, p.weapon || null); } catch (e) { /* sem WebGL */ }
    const liked = !own && (p.real ? !!p.liked : this.liked && this.liked[p.id]);
    body += '<div class="pf"><div class="pf-left"><div class="pf-cover" style="' + coverStyle + '"></div><div class="pf-left-shade"></div>' + (full ? '<img class="pf-char" src="' + full + '" alt="">' : '') +
      '<div class="pf-rank" style="--rk:' + rank.color + '"><svg viewBox="0 0 24 24"><path d="M12 2l8 4.6v10.8L12 22l-8-4.6V6.6z" fill="currentColor"/><path d="M12 6.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#fff" opacity=".9"/></svg><div><small>PATENTE</small><b>' + rank.name + '</b></div></div></div>';
    const guest = own && !LS.Account.logged();
    body += '<div class="pf-right">' + (guest ? '<div class="pf-guest"><div><b>VOCÊ É CONVIDADO</b><span>Crie uma conta pra <b>reservar o seu nome</b>, receber curtidas, ganhar selos e levar o perfil pra qualquer computador.</span></div>' +
      '<button class="btn small btn-primary" data-pf="register">CRIAR CONTA</button><button class="btn small" data-pf="login">ENTRAR</button></div>' : '') + '<div class="pf-head">' +
      '<div class="pf-avatar">' + (this.avatarOf(p) ? '<img src="' + this.avatarOf(p) + '" alt="">' : '') + (own ? '<button class="pf-cam" data-pf="photo" title="Trocar foto">' + this.camIcon() + '</button>' : '') + '<span class="pf-lvl">' + lvl + '</span></div>' +
      '<div class="pf-idbox"><div class="pf-name">' + this.esc(p.name || 'Jogador') + (badges.length ? this.verifiedIcon() : '') + '</div>' +
      '<div class="pf-sub">ID: <b>' + p.id + '</b> <button class="pf-copy" data-pf="copy" title="Copiar ID">COPIAR</button> · BR</div>' +
      '<div class="pf-badges">' + (badges.length ? badges.map(k => { const B = this.BADGES[k]; return '<span class="pf-badge ' + B.cls + '"><svg viewBox="0 0 24 24">' + B.icon + '</svg>' + B.label + '</span>'; }).join('') : '<span class="pf-nobadge">Sem selos</span>') + '</div></div>' +
      '<div class="pf-likes' + (liked ? ' on' : '') + '"' + (own ? '' : ' data-pf="like"') + ' title="' + (own ? 'Curtidas que você recebeu' : 'Curtir') + '"><svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.6 3 5 6.6 5c2.1 0 3.6 1.2 5.4 3 1.8-1.8 3.3-3 5.4-3C21 5 23.1 8.6 21.6 11.8 19.5 16.4 12 21 12 21z" fill="currentColor"/></svg><b>' + (p.likes + (liked && !p.real ? 1 : 0)).toLocaleString('pt-BR') + '</b><span>CURTIDAS</span></div></div>';
    body += '<div class="pf-xp"><span>NÍVEL ' + lvl + '</span><div><i style="width:' + Math.round(((s.xp || 0) - a) / (b - a) * 100) + '%"></i></div><span>' + ((s.xp || 0) - a) + ' / ' + (b - a) + ' XP</span></div>';
    body += '<div class="pf-bio"><small>RECADO</small><p>' + (p.bio ? this.esc(p.bio) : '<i>Sem recado</i>') + '</p>' + (own ? '<button data-pf="edit" title="Editar">' + this.penIcon() + '</button>' : '') + '</div>';
    body += '<div class="stats-grid pf-stats">' +
      '<div><b>' + games + '</b><span>PARTIDAS</span></div><div><b>' + wins + '</b><span>VITÓRIAS</span></div><div><b>' + (games ? Math.round(wins / games * 100) : 0) + '%</b><span>TAXA DE VITÓRIA</span></div>' +
      '<div><b>' + (s.kills || 0) + '</b><span>ABATES</span></div><div><b>' + ((s.kills || 0) / deaths).toFixed(2) + '</b><span>ABATES / MORTE</span></div><div><b>' + (s.best ? '#' + s.best : '-') + '</b><span>MELHOR COLOCAÇÃO</span></div>' +
      '</div></div></div>';
    document.getElementById('stats-body').innerHTML = body;
    const isOwner = own && LS.Account.logged() && (p.badges || []).includes('owner');
    document.getElementById('pf-buttons').innerHTML = own
      ? '<button class="btn" data-pf="edit">EDITAR</button><button class="btn" data-pf="photo">FOTO</button><button class="btn" data-pf="cover">CAPA</button><button class="btn" data-pf="search">BUSCAR ID</button>' +
        (LS.Account.logged() ? '<button class="btn" data-pf="account">CONTA</button>' : '') + (isOwner ? '<button class="btn btn-admin" data-pf="admin">ADMIN</button>' : '') + '<button class="btn btn-primary" data-pf="back">VOLTAR</button>'
      : (p.real ? '' : '<span class="pf-botnote">Perfil de bot</span>') + '<button class="btn' + (liked ? '' : ' btn-like') + '" data-pf="like">' + (liked ? 'CURTIDO ♥' : 'CURTIR ♥') + '</button><button class="btn btn-primary" data-pf="back">VOLTAR</button>';
    document.querySelector('#panel-stats h2').textContent = own ? 'MEU PERFIL' : 'PERFIL DO JOGADOR';
  },
  camIcon() { return '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>'; },
  penIcon() { return '<svg viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16z M14 6l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'; },

  // ---------- janelinhas: editar, foto, capa ----------
  modal(html, cls) {
    const m = document.getElementById('pf-modal');
    m.innerHTML = '<div class="pf-modal-box' + (cls ? ' ' + cls : '') + '">' + html + '</div>'; m.classList.remove('hidden');
  },
  closeModal() { document.getElementById('pf-modal').classList.add('hidden'); },
  // trocar de nome custa LS.RENAME_COST moedas; o recado é grátis. Grátis também: o 1º nome (saindo de "Jogador"),
  // mudar só maiúsculas/minúsculas e o nome automático de conta criada pelo Google
  renameCost(name) {
    const P = LS.playerProfile, me = LS.Account.logged() ? LS.Account.me : null;
    if (!name || name === P.name || name.toLowerCase() === P.name.toLowerCase()) return 0;
    if (P.name === 'Jogador' || (me && me.freeRename)) return 0;
    return LS.RENAME_COST;
  },
  openEdit() {
    const P = LS.playerProfile, coins = LS.stats.coins || 0, fmt = n => n.toLocaleString('pt-BR');
    this.modal('<h3>EDITAR PERFIL</h3><label>Nome <small id="pf-name-cost"></small></label><input id="pf-in-name" maxlength="16" spellcheck="false" autocomplete="off" value="' + this.esc(P.name) + '">' +
      '<p class="pf-hint pf-rename">Trocar de nome custa <b>' + LS.icon('coin', 'coin-i') + fmt(LS.RENAME_COST) + '</b> · você tem <b>' + LS.icon('coin', 'coin-i') + fmt(coins) + '</b>. O recado é grátis.</p>' +
      '<label>Recado <small id="pf-bio-n"></small> <small class="pf-free">GRÁTIS</small></label><textarea id="pf-in-bio" maxlength="80" rows="3">' + this.esc(P.bio || '') + '</textarea>' +
      '<p id="pf-err" class="pf-err hidden"></p><div class="pf-modal-btns"><button class="btn" data-pf="close">CANCELAR</button><button class="btn btn-primary" data-pf="save" id="pf-save">SALVAR</button></div>');
    const bio = document.getElementById('pf-in-bio'), n = document.getElementById('pf-bio-n'), upd = () => { n.textContent = bio.value.length + '/80'; };
    const nm = document.getElementById('pf-in-name'), cost = document.getElementById('pf-name-cost'), save = document.getElementById('pf-save');
    const updName = () => { // mostra quanto vai custar enquanto digita
      const c = this.renameCost(nm.value.trim());
      const changed = nm.value.trim() && nm.value.trim() !== P.name;
      cost.innerHTML = !changed ? '' : c ? LS.icon('coin', 'coin-i') + fmt(c) : 'GRÁTIS';
      cost.className = !changed ? '' : c ? (coins < c ? 'pf-cost no' : 'pf-cost') : 'pf-free';
      save.innerHTML = changed && c ? 'TROCAR · ' + LS.icon('coin', 'coin-i') + fmt(c) : 'SALVAR';
    };
    bio.addEventListener('input', upd); upd(); nm.addEventListener('input', updName); updName(); nm.focus();
  },
  async saveEdit() {
    const P = LS.playerProfile, name = document.getElementById('pf-in-name').value.trim().slice(0, 16) || P.name;
    P.bio = document.getElementById('pf-in-bio').value.replace(/\s+/g, ' ').trim().slice(0, 80); // recado: grátis, salva sempre
    LS.saveProfile();
    if (name !== P.name) {
      const cost = this.renameCost(name), coins = LS.stats.coins || 0;
      if (cost && coins < cost) return this.modalError('Moedas insuficientes: trocar de nome custa ' + cost.toLocaleString('pt-BR') + ' moedas (faltam ' + (cost - coins).toLocaleString('pt-BR') + '). O recado foi salvo.');
      if (LS.Account.logged()) { // conta: o servidor confere se o nome está livre e cobra as moedas
        const btn = document.getElementById('pf-save'); btn.disabled = true; btn.textContent = '...';
        try { await LS.Account.rename(name); } catch (e) { btn.disabled = false; this.modalError(e.message); return; }
      } else {
        if (cost) { LS.stats.coins = coins - cost; LS.saveStats(); }
        P.name = name; LS.saveProfile();
      }
    }
    this.closeModal(); this.render(); LS.Menu.render(); this.renderTop();
    if (LS.Lobby.built) LS.Lobby.syncUI();
  },
  modalError(msg) { const e = document.getElementById('pf-err'); if (e) { e.textContent = msg; e.classList.remove('hidden', 'ok'); } },
  openPhoto() {
    const P = LS.playerProfile, cur = P.avatar || {};
    const opts = this.BG.map((_, i) => '<button class="pf-ph' + (cur.type !== 'img' && (cur.bg || 0) === i ? ' sel' : '') + '" data-pf="ph" data-v="' + i + '"><img src="' + this.headshot(P.look, i) + '" alt=""></button>').join('');
    this.modal('<h3>FOTO DE PERFIL</h3><p class="pf-hint">Uma foto 3D do seu personagem: muda junto quando você troca o visual. Escolha o fundo.</p>' +
      '<div class="pf-ph-grid">' + opts + '</div>' +
      '<div class="pf-modal-btns"><button class="btn btn-primary" data-pf="close">PRONTO</button></div>');
  },
  setPhoto(bg) { LS.playerProfile.avatar = { type: '3d', bg }; LS.saveProfile(); this.openPhoto(); this.render(); this.renderTop(); },
  openCover() {
    const P = LS.playerProfile, cur = P.cover || 'br';
    const banners = [['br', 'Battle Royale'], ['duel1', 'Duelo 1v1'], ['duel2', 'Duelo 2v2']].map(([id, name]) => { const u = LS.Banners.cached(id);
      return '<button class="pf-cv' + (cur === id ? ' sel' : '') + '" data-pf="cv" data-v="' + id + '" style="' + (u ? 'background-image:url(' + u + ')' : 'background:#1a1e28') + '"><span>' + name + '</span></button>'; });
    const grads = [0, 1, 2, 3, 6, 7].map(i => '<button class="pf-cv' + (cur === 'g' + i ? ' sel' : '') + '" data-pf="cv" data-v="g' + i + '" style="background:linear-gradient(160deg,' + this.BG[i][0] + ',' + this.BG[i][1] + ')"></button>');
    this.modal('<h3>CAPA DO PERFIL</h3><div class="pf-cv-grid">' + banners.join('') + grads.join('') + '</div><div class="pf-modal-btns"><button class="btn btn-primary" data-pf="close">PRONTO</button></div>');
  },
  setCover(id) { LS.playerProfile.cover = id; LS.saveProfile(); this.openCover(); this.render(); },
  async like() {
    const p = this.view; if (!p) return;
    if (p.real) {
      if (!LS.Account.logged()) { this.openAuth('register', 'Crie uma conta (ou entre) pra curtir perfis.'); return; }
      try { const d = await LS.Account.like(p.id); p.liked = d.liked; p.likes = d.likes; LS.Audio.click(); this.render(); } catch (e) { this.modal('<h3>OPS</h3><p class="pf-hint">' + this.esc(e.message) + '</p><div class="pf-modal-btns"><button class="btn btn-primary" data-pf="close">OK</button></div>'); }
      return;
    }
    this.liked = this.liked || {};
    this.liked[p.id] = !this.liked[p.id];
    LS.Audio.click(); this.render();
  },

  // ---------- conta: entrar / criar ----------
  openAuth(mode, note) {
    this.authMode = mode;
    const reg = mode === 'register';
    this.modal('<div class="pf-tabs"><button class="' + (reg ? 'on' : '') + '" data-pf="register">CRIAR CONTA</button><button class="' + (reg ? '' : 'on') + '" data-pf="login">ENTRAR</button></div>' +
      (note ? '<p class="pf-hint">' + this.esc(note) + '</p>' : '') +
      '<label>Nome' + (reg ? ' <small>(3 a 16: letras, números, _ . -)</small>' : '') + '</label><input id="pf-a-name" maxlength="16" spellcheck="false" autocomplete="username" value="' + (reg ? this.esc(LS.playerProfile.name === 'Jogador' ? '' : LS.playerProfile.name) : '') + '">' +
      '<label>Senha' + (reg ? ' <small>(6 ou mais)</small>' : '') + '</label><input id="pf-a-pass" type="password" maxlength="64" autocomplete="' + (reg ? 'new-password' : 'current-password') + '">' +
      (reg ? '<label>Repita a senha</label><input id="pf-a-pass2" type="password" maxlength="64" autocomplete="new-password"><p class="pf-hint pf-warn">Não tem e-mail pra recuperar: <b>guarde bem a sua senha</b>.</p>' : '') +
      '<p id="pf-err" class="pf-err hidden"></p><div class="pf-modal-btns"><button class="btn" data-pf="close">CANCELAR</button><button class="btn btn-primary" data-pf="auth-go">' + (reg ? 'CRIAR CONTA' : 'ENTRAR') + '</button></div>');
    const first = document.getElementById('pf-a-name');
    (first.value ? document.getElementById('pf-a-pass') : first).focus();
  },
  async authGo() {
    const name = document.getElementById('pf-a-name').value.trim(), pass = document.getElementById('pf-a-pass').value, reg = this.authMode === 'register';
    if (reg && pass !== document.getElementById('pf-a-pass2').value) return this.modalError('As senhas não são iguais.');
    const btn = document.querySelector('[data-pf="auth-go"]'); btn.disabled = true; btn.textContent = '...';
    try { if (reg) await LS.Account.register(name, pass); else await LS.Account.login(name, pass); this.closeModal(); this.open(); this.renderTop(); }
    catch (e) { this.modalError(e.message); btn.disabled = false; btn.textContent = reg ? 'CRIAR CONTA' : 'ENTRAR'; }
  },
  openAccount() {
    const P = LS.playerProfile;
    this.modal('<h3>MINHA CONTA</h3><p class="pf-hint">Você está como <b>' + this.esc(P.name) + '</b> (ID ' + P.id + '). Seu perfil e estatísticas ficam salvos na conta.</p>' +
      '<label>Chave de admin <small>(só pro dono do jogo)</small></label><div class="pf-row"><input id="pf-key" type="password" autocomplete="off"><button class="btn small" data-pf="claim">USAR</button></div>' +
      '<p id="pf-err" class="pf-err hidden"></p><div class="pf-modal-btns"><button class="btn" data-pf="reset">ZERAR ESTATÍSTICAS</button><button class="btn" data-pf="logout">SAIR DA CONTA</button><button class="btn btn-primary" data-pf="close">FECHAR</button></div>');
  },
  async claimGo() {
    try { await LS.Account.claim(document.getElementById('pf-key').value.trim()); this.closeModal(); this.render(); this.renderTop(); }
    catch (e) { this.modalError(e.message); }
  },
  // ---------- buscar jogador pelo ID ----------
  openSearch() {
    this.modal('<h3>BUSCAR JOGADOR</h3><p class="pf-hint">Digite o ID de 10 números (fica no perfil de cada um).</p><div class="pf-row"><input id="pf-sid" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="1234567890"><button class="btn small btn-primary" data-pf="search-go">BUSCAR</button></div>' +
      '<p id="pf-err" class="pf-err hidden"></p><div class="pf-modal-btns"><button class="btn" data-pf="close">FECHAR</button></div>');
    document.getElementById('pf-sid').focus();
  },
  async searchGo() {
    const id = document.getElementById('pf-sid').value.replace(/\D/g, '');
    if (id.length !== 10) return this.modalError('O ID tem 10 números.');
    if (id === LS.playerProfile.id) { this.closeModal(); return this.open(); }
    try { const d = await LS.Account.profile(id); this.closeModal(); this.open(this.realProfile(d.profile, d.liked)); }
    catch (e) { this.modalError(e.message); }
  },
  // perfil de uma conta de verdade (vindo do servidor)
  realProfile(a, liked) {
    const pr = a.profile || {};
    return { other: true, real: true, liked, name: a.name, id: a.id, likes: a.likes, badges: a.badges || [], bio: pr.bio || '',
      look: Object.assign({}, LS.defaultProfile.look, pr.look || {}), weapon: pr.weapon || null, avatar: { type: '3d', bg: pr.avatarBg || 0 }, cover: pr.cover || 'br',
      stats: Object.assign({ games: 0, wins: 0, kills: 0, xp: 0, best: 0 }, a.stats || {}) };
  },
  // ---------- painel do owner: dar selos ----------
  // ---------- painel ADMIN: abas SELOS e GERADOR DE CODIGUIN ----------
  openAdmin(tab) {
    this.admTab = tab = tab || this.admTab || 'badges';
    const tabs = '<div class="adm-tabs"><button class="' + (tab === 'badges' ? 'on' : '') + '" data-pf="adm-tab" data-v="badges">SELOS</button>' +
      '<button class="' + (tab === 'codes' ? 'on' : '') + '" data-pf="adm-tab" data-v="codes">GERADOR DE CODIGUIN</button></div>';
    if (tab === 'codes') return this.openCodes(tabs);
    const on = LS.Console.dev;
    this.modal('<h3>PAINEL ADMIN</h3>' + tabs + '<p class="pf-hint">Dê ou tire selos de qualquer conta pelo ID.</p><div class="pf-row"><input id="pf-adm-id" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="ID da conta"><button class="btn small" data-pf="adm-find">BUSCAR</button></div>' +
      '<div id="pf-adm-box"></div><p id="pf-err" class="pf-err hidden"></p>' +
      '<div class="pf-adm-sec"><label class="pf-switch"><input type="checkbox" id="pf-dev-chk"' + (on ? ' checked' : '') + '><span></span></label>' +
      '<div><b>Console de dev</b><small id="pf-dev-st">' + (on ? 'Ligado neste navegador. Abra com a tecla <kbd>\'</kbd> (do lado do 1) ou <kbd>F2</kbd>.' : 'Desligado. Comandos de teste (dar armas, voar, modo deus...). Só funcionam offline.') + '</small></div></div>' +
      '<div id="pf-dev-confirm" class="pf-confirm hidden"><b>Ativar o console de dev?</b><p>Ele tem comandos de trapaça pra testar o jogo (dar itens, voar, invencível, ver todos). Só fica ligado <b>neste navegador</b> e os comandos não funcionam nas partidas online.</p>' +
      '<div class="pf-modal-btns"><button class="btn" data-pf="dev-no">CANCELAR</button><button class="btn btn-primary" data-pf="dev-yes">SIM, ATIVAR</button></div></div>' +
      '<div class="pf-modal-btns"><button class="btn btn-primary" data-pf="close">FECHAR</button></div>', 'adm');
    document.getElementById('pf-dev-chk').addEventListener('change', e => {
      if (e.target.checked) { e.target.checked = false; document.getElementById('pf-dev-confirm').classList.remove('hidden'); } // só liga depois de confirmar
      else { LS.Console.setDev(false); this.devStatus(); }
    });
    document.getElementById('pf-adm-id').focus();
  },
  // ---------- gerador de codiguin ----------
  CG_TABS: [
    { id: 'costume', label: 'FANTASIAS', test: i => i.slot === 'costume' && !i.code }, { id: 'code', label: 'EXCLUSIVOS', test: i => i.code },
    { id: 'hat', label: 'CHAPÉUS', test: i => i.slot === 'hat' && !i.code }, { id: 'face', label: 'ROSTO', test: i => ['glasses', 'mask', 'hairStyle', 'beard'].includes(i.slot) && !i.code },
    { id: 'body', label: 'ROUPAS', test: i => (i.slot === 'top' || i.slot === 'pattern') && !i.code }, { id: 'legs', label: 'CALÇAS', test: i => i.slot === 'legs' }
  ],
  openCodes(tabs) {
    const cg = this.cg || (this.cg = { item: null, money: false, kind: 'coins', coins: 1000, diamonds: 100, uses: 100, days: 30 });
    this.modal('<h3>PAINEL ADMIN</h3>' + tabs +
      '<div class="cg">' +
      '<button class="btn cg-pick" data-pf="cg-pick">SELECIONAR ITEM PARA CODIGUINHO</button>' +
      '<div id="cg-sel" class="cg-sel"></div>' +
      '<label class="cg-chk"><input type="checkbox" id="cg-money"' + (cg.money ? ' checked' : '') + '><span></span>Dar moedas ou diamantes?</label>' +
      '<div id="cg-money-box" class="cg-money' + (cg.money ? '' : ' hidden') + '">' +
      '<select id="cg-kind"><option value="coins">Moedas</option><option value="diamonds">Diamantes</option><option value="both">Os 2</option></select>' +
      '<label class="cg-amt" data-k="coins">' + LS.icon('coin', 'coin-i') + '<input id="cg-coins" type="number" min="0" max="1000000" value="' + cg.coins + '"></label>' +
      '<label class="cg-amt" data-k="diamonds">' + LS.icon('gem', 'gem-i') + '<input id="cg-diamonds" type="number" min="0" max="100000" value="' + cg.diamonds + '"></label></div>' +
      '<div class="cg-opts"><label>Código <small>(vazio = aleatório)</small><input id="cg-code" maxlength="20" spellcheck="false" autocomplete="off" placeholder="EX: NATAL2026"></label>' +
      '<label>Usos <small>(0 = sem limite)</small><input id="cg-uses" type="number" min="0" value="' + cg.uses + '"></label>' +
      '<label>Vale por <small>(dias, 0 = sempre)</small><input id="cg-days" type="number" min="0" value="' + cg.days + '"></label></div>' +
      '<button class="btn btn-primary cg-make" data-pf="cg-make">GERAR CODIGUIN</button>' +
      '<p id="pf-err" class="pf-err hidden"></p><div id="cg-out"></div>' +
      '<div class="cg-list-h">CODIGUINS CRIADOS</div><div id="cg-list" class="cg-list"><p class="pf-hint">Carregando…</p></div>' +
      '</div><div class="pf-modal-btns"><button class="btn btn-primary" data-pf="close">FECHAR</button></div>', 'adm wide');
    const kind = document.getElementById('cg-kind'); kind.value = cg.kind;
    const syncMoney = () => {
      cg.money = document.getElementById('cg-money').checked; cg.kind = kind.value;
      document.getElementById('cg-money-box').classList.toggle('hidden', !cg.money);
      document.querySelectorAll('.cg-amt').forEach(el => el.classList.toggle('hidden', !(cg.kind === 'both' || cg.kind === el.dataset.k)));
    };
    document.getElementById('cg-money').addEventListener('change', syncMoney); kind.addEventListener('change', syncMoney); syncMoney();
    this.cgSel(); this.cgList();
  },
  cgSel() {
    const el = document.getElementById('cg-sel'); if (!el) return;
    const it = this.cg.item && LS.Cosmetics.byId[this.cg.item];
    if (!it) { el.innerHTML = '<p class="pf-hint">Nenhum item (dá pra fazer codiguin só de moedas/diamantes).</p>'; return; }
    const R = LS.Cosmetics.RARITY[it.rarity];
    el.innerHTML = '<div class="cg-item" style="--rc:' + R.color + '"><img alt="" data-tid="' + it.id + '"><div><span class="cg-rar">' + R.name + '</span><b>' + this.esc(it.name) + '</b><small>' + this.esc(it.id) + '</small></div>' +
      '<button class="btn small" data-pf="cg-clear">TIRAR</button></div>';
    LS.Thumbs.into(el.querySelector('img'), it);
  },
  cgPicker(tab) {
    this.cgTab = tab || this.cgTab || 'costume';
    const C = LS.Cosmetics, T = this.CG_TABS.find(t => t.id === this.cgTab) || this.CG_TABS[0];
    const items = C.items.filter(i => !i.free && T.test(i)).sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
    let pk = document.getElementById('cg-picker');
    if (!pk) { pk = document.createElement('div'); pk.id = 'cg-picker'; document.querySelector('#pf-modal .pf-modal-box').appendChild(pk); }
    pk.innerHTML = '<div class="cgp-head"><b>ESCOLHA O ITEM</b><button class="btn small" data-pf="cg-pclose">FECHAR</button></div>' +
      '<div class="cgp-tabs">' + this.CG_TABS.map(t => '<button class="' + (t.id === T.id ? 'on' : '') + '" data-pf="cg-ptab" data-v="' + t.id + '">' + t.label + '</button>').join('') + '</div>' +
      '<div class="cgp-grid">' + items.map(it => { const R = C.RARITY[it.rarity];
        return '<button class="wr-card' + (this.cg.item === it.id ? ' on' : '') + '" data-pf="cg-item" data-v="' + it.id + '" style="--rc:' + R.color + '"><div class="wr-img"><img alt="" data-tid="' + it.id + '"></div>' +
          '<b>' + this.esc(it.name) + '</b><small>' + R.name + '</small></button>'; }).join('') + '</div>';
    pk.querySelectorAll('img[data-tid]').forEach(img => LS.Thumbs.into(img, C.byId[img.dataset.tid]));
  },
  cgSelect(id) { this.cg.item = id; const pk = document.getElementById('cg-picker'); if (pk) pk.remove(); this.cgSel(); },
  async cgMake() {
    const cg = this.cg, v = id => document.getElementById(id).value;
    cg.coins = +v('cg-coins') || 0; cg.diamonds = +v('cg-diamonds') || 0; cg.uses = +v('cg-uses') || 0; cg.days = +v('cg-days') || 0;
    const o = { code: v('cg-code').trim(), item: cg.item, maxUses: cg.uses, days: cg.days,
      coins: cg.money && cg.kind !== 'diamonds' ? cg.coins : 0, diamonds: cg.money && cg.kind !== 'coins' ? cg.diamonds : 0 };
    const btn = document.querySelector('[data-pf="cg-make"]'); btn.disabled = true;
    try {
      const c = await LS.Account.adminCreateCode(o);
      document.getElementById('pf-err').classList.add('hidden');
      document.getElementById('cg-out').innerHTML = '<div class="cg-out"><small>CODIGUIN CRIADO</small><b>' + c.code + '</b><span>' + this.cgDesc(c) + '</span>' +
        '<button class="btn btn-primary small" data-pf="cg-copy" data-v="' + c.code + '">COPIAR</button></div>';
      document.getElementById('cg-code').value = '';
      this.cgList();
    } catch (e) { this.modalError(e.message); }
    btn.disabled = false;
  },
  cgDesc(c) {
    const it = c.item && LS.Cosmetics.byId[c.item], p = [];
    if (it) p.push(this.esc(it.name)); else if (c.item) p.push(this.esc(c.item));
    if (c.coins) p.push(LS.icon('coin', 'coin-i') + c.coins.toLocaleString('pt-BR'));
    if (c.diamonds) p.push(LS.icon('gem', 'gem-i') + c.diamonds.toLocaleString('pt-BR'));
    return p.join(' + ');
  },
  async cgList() {
    const el = document.getElementById('cg-list'); if (!el) return;
    try {
      const list = await LS.Account.adminCodes();
      el.innerHTML = list.length ? list.map(c => {
        const exp = c.exp ? (c.exp < Date.now() ? '<em class="cg-dead">vencido</em>' : 'até ' + new Date(c.exp).toLocaleDateString('pt-BR')) : 'sem validade';
        const full = c.maxUses && c.uses >= c.maxUses;
        return '<div class="cg-row' + (full || (c.exp && c.exp < Date.now()) ? ' off' : '') + '"><b>' + c.code + '</b><span>' + this.cgDesc(c) + '</span>' +
          '<small>' + c.uses + '/' + (c.maxUses || '∞') + ' usos · ' + exp + '</small>' +
          '<button class="btn small" data-pf="cg-copy" data-v="' + c.code + '">COPIAR</button><button class="btn small cg-del" data-pf="cg-del" data-v="' + c.code + '">APAGAR</button></div>';
      }).join('') : '<p class="pf-hint">Nenhum codiguin ainda.</p>';
    } catch (e) { el.innerHTML = '<p class="pf-err">' + this.esc(e.message) + '</p>'; }
  },
  cgCopy(code) {
    const done = () => this.modalError('Copiado: ' + code);
    try { navigator.clipboard.writeText(code).then(done, done); } catch (e) { done(); }
    setTimeout(() => { const e = document.getElementById('pf-err'); if (e) e.classList.add('ok'); }, 0);
  },
  async cgDel(code) {
    const b = document.querySelector('[data-pf="cg-del"][data-v="' + code + '"]');
    if (b && !b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'CERTEZA?'; return; } // 2 toques pra apagar
    try { await LS.Account.adminDeleteCode(code); this.cgList(); } catch (e) { this.modalError(e.message); }
  },
  devStatus() {
    const on = LS.Console.dev, chk = document.getElementById('pf-dev-chk'), st = document.getElementById('pf-dev-st');
    if (chk) chk.checked = on;
    if (st) st.innerHTML = on ? 'Ligado neste navegador. Abra com a tecla <kbd>\'</kbd> (do lado do 1) ou <kbd>F2</kbd>.' : 'Desligado. Comandos de teste (dar armas, voar, modo deus...). Só funcionam offline.';
    document.getElementById('pf-dev-confirm').classList.add('hidden');
  },
  async admFind() {
    const id = document.getElementById('pf-adm-id').value.replace(/\D/g, '');
    try {
      const a = id === LS.playerProfile.id ? LS.Account.me : (await LS.Account.profile(id)).profile;
      this.admTarget = a.id;
      document.getElementById('pf-adm-box').innerHTML = '<p class="pf-adm-name">' + this.esc(a.name) + ' <small>(' + a.id + ')</small></p><div class="pf-adm-badges">' +
        Object.keys(this.BADGES).map(k => '<label class="pf-chk"><input type="checkbox" value="' + k + '"' + ((a.badges || []).includes(k) ? ' checked' : '') + '><span class="pf-badge ' + this.BADGES[k].cls + '"><svg viewBox="0 0 24 24">' + this.BADGES[k].icon + '</svg>' + this.BADGES[k].label + '</span></label>').join('') +
        '</div><button class="btn small btn-primary" data-pf="adm-save">SALVAR SELOS</button>';
      document.getElementById('pf-err').classList.add('hidden');
    } catch (e) { this.modalError(e.message); }
  },
  async admSave() {
    const badges = [...document.querySelectorAll('#pf-adm-box input:checked')].map(i => i.value);
    try {
      const a = await LS.Account.setBadges(this.admTarget, badges);
      if (a.id === LS.playerProfile.id) await LS.Account.refresh();
      this.modalError('Salvo! ' + a.name + ': ' + (a.badges.length ? a.badges.map(b => this.BADGES[b].label).join(', ') : 'sem selos'));
      document.getElementById('pf-err').classList.add('ok');
    } catch (e) { this.modalError(e.message); }
  },

  bind() {
    const root = document.getElementById('panel-stats');
    root.addEventListener('click', e => {
      const el = e.target.closest('[data-pf]'); if (!el) return;
      const a = el.dataset.pf; LS.Audio.init();
      if (a !== 'like') LS.Audio.click();
      switch (a) {
        case 'back': this.closeModal(); LS.UI.back(); break;
        case 'edit': this.openEdit(); break;
        case 'save': this.saveEdit(); break;
        case 'close': this.closeModal(); break;
        case 'photo': this.openPhoto(); break;
        case 'ph': this.setPhoto(+el.dataset.v); break;
        case 'register': this.openAuth('register'); break;
        case 'login': this.openAuth('login'); break;
        case 'auth-go': this.authGo(); break;
        case 'account': this.openAccount(); break;
        case 'claim': this.claimGo(); break;
        case 'logout': LS.Account.logout().then(() => { this.closeModal(); this.open(); this.renderTop(); }); break;
        case 'search': this.openSearch(); break;
        case 'search-go': this.searchGo(); break;
        case 'admin': this.openAdmin(); break;
        case 'adm-tab': this.openAdmin(el.dataset.v); break;
        case 'cg-pick': this.cgPicker(); break;
        case 'cg-ptab': this.cgPicker(el.dataset.v); break;
        case 'cg-item': this.cgSelect(el.dataset.v); break;
        case 'cg-pclose': { const pk = document.getElementById('cg-picker'); if (pk) pk.remove(); break; }
        case 'cg-clear': this.cg.item = null; this.cgSel(); break;
        case 'cg-make': this.cgMake(); break;
        case 'cg-copy': this.cgCopy(el.dataset.v); break;
        case 'cg-del': this.cgDel(el.dataset.v); break;
        case 'adm-find': this.admFind(); break;
        case 'adm-save': this.admSave(); break;
        case 'dev-yes': LS.Console.setDev(true); this.devStatus(); break;
        case 'dev-no': this.devStatus(); break;
        case 'cover': LS.Banners.generate(['br', 'duel1', 'duel2'], () => { if (!document.getElementById('pf-modal').classList.contains('hidden')) this.openCover(); }); this.openCover(); break;
        case 'cv': this.setCover(el.dataset.v); break;
        case 'like': this.like(); break;
        case 'reset': this.closeModal(); LS.Menu.resetStats(); this.render(); break;
        case 'copy': {
          const id = (this.view || LS.playerProfile).id;
          try { navigator.clipboard.writeText(id); } catch (err) { /* sem permissão */ }
          el.textContent = 'COPIADO!'; setTimeout(() => { el.textContent = 'COPIAR'; }, 1200);
          break;
        }
      }
    });
    root.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const id = e.target.id;
      if (id === 'pf-in-name') this.saveEdit();
      else if (id === 'pf-a-name' || id === 'pf-a-pass' || id === 'pf-a-pass2') this.authGo();
      else if (id === 'pf-sid') this.searchGo();
      else if (id === 'pf-adm-id') this.admFind();
      else if (id === 'pf-key') this.claimGo();
    });
  }
};
