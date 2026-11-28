// EMOTES: roda de emotes (segure B no PC · botão de carinha no celular · ícone no lobby).
// O emote toca no seu boneco (animação convertida em anims/emotes.json) e os outros jogadores veem pela rede
// (vai junto nas flags do estado: bits 8..11 = qual emote). Andar, pular, atirar, mirar, recarregar ou curar cancela.
'use strict';
LS.Emotes = {
  // id (1..15, vai na rede) · clip (em anims/emotes.json) · loops: quantas vezes toca (1 = uma vez só)
  LIST: [
    { id: 1, key: 'risada', name: 'Risada', clip: 'emote_risada', loops: 1, free: true },
    { id: 2, key: 'reputacao', name: 'Reputação', clip: 'emote_reputacao', loops: 1, free: true },
    { id: 3, key: 'hype', name: 'Hype', clip: 'emote_hype', loops: 1, free: true,
      fix: { hips: 0.35, spine: 0.5, ground: true } } // corrige a pose (coluna torta + pé no chão), sem refazer a dança: veja fixClip()
  ],
  SLOTS: 8, // a roda tem 8 espaços; os vazios aparecem como "em breve"
  open: false, sel: -1, mode: 'game', acc: { x: 0, y: 0 },
  local: null, // { m: modelo, t: tempo restante, id, lobby }

  init() {
    this.LIST.forEach(e => { if (!LS.Anim.LIBRARY.find(x => x.name === e.clip)) LS.Anim.LIBRARY.push({ name: e.clip, url: 'anims/emotes.json', loop: false }); });
    this.preload();
    const w = document.createElement('div'); w.id = 'emote-wheel'; w.className = 'hidden'; document.body.appendChild(w); this.el = w;
    w.addEventListener('mousemove', e => { if (!LS.Input.locked) this.pick(this.angleFrom(e.clientX, e.clientY)); });
    w.addEventListener('click', e => {
      const s = e.target.closest('[data-em]');
      if (s) { this.sel = +s.dataset.em; this.close(true); } else if (e.target === w || e.target.closest('.ew-mid')) this.close(false);
    });
    w.addEventListener('touchstart', e => {
      const s = e.target.closest('[data-em]'); e.preventDefault();
      if (s) { this.sel = +s.dataset.em; this.close(true); } else this.close(false);
    }, { passive: false });
    document.addEventListener('keydown', e => {
      if (e.code !== 'KeyB' || e.repeat || this.typing(e)) return;
      if (!this.open && this.canOpen()) { this.show(LS.Input.locked ? 'hold' : 'click'); e.preventDefault(); }
    });
    document.addEventListener('keyup', e => { if (e.code === 'KeyB' && this.open && this.mode === 'hold') this.close(true); });
    document.addEventListener('mousemove', e => { // segurando B com o mouse preso: o movimento escolhe o emote (a câmera não gira)
      if (!this.open || this.mode !== 'hold' || !LS.Input.locked) return;
      this.acc.x = LS.util.clamp(this.acc.x + (e.movementX || 0), -120, 120); this.acc.y = LS.util.clamp(this.acc.y + (e.movementY || 0), -120, 120);
      if (Math.hypot(this.acc.x, this.acc.y) > 28) this.pick(Math.atan2(this.acc.y, this.acc.x)); else this.pick(null);
    });
    document.addEventListener('mousedown', e => { if (this.open && this.mode === 'hold' && e.button === 0) { e.stopPropagation(); this.close(true); } }, true);
  },
  async preload() { try { await LS.Anim.ensure(this.LIST[0].clip); } catch (e) { console.warn('Emotes: ' + e.message); } },
  typing(e) { const t = e.target; return LS.Console && LS.Console.open || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)); },
  byId(id) { return this.LIST.find(e => e.id === id); },
  // emotes que você tem (por enquanto a Risada é de todo mundo; os próximos podem vir da loja/eventos como item 'emote:nome')
  owned() { return this.LIST.filter(e => e.free || (LS.Cosmetics.byId['emote:' + e.key] && LS.Cosmetics.owns('emote:' + e.key))); },
  inLobby() { const G = LS.Game; return G.state === 'menu' && LS.UI.current === 'menu-main' && LS.Lobby.built; },
  canOpen() {
    const G = LS.Game;
    if (this.inLobby()) return true;
    return G.state === 'playing' && !G.inventoryOpen && G.player && G.player.alive && G.player.state === 'ground' && !LS.Spectate.active;
  },
  // clipe do emote já com a correção de pose (se o emote tiver `fix`); a correção roda uma vez só por clipe carregado
  async clip(e) { return this.fixClip(await LS.Anim.ensure(e.clip), e.fix); },
  // ---------- correção de pose (sem refazer a animação) ----------
  // O clipe do Hype veio de um Biped do 3ds Max e, depois de convertido, o boneco ficava com a coluna torta (inclinada pro lado e
  // "corcunda", com o quadril jogado pra trás) e os pés afundando no chão. Em vez de refazer a dança, a pose é ajustada por cima:
  //   fix.hips / fix.spine (0..1): quanto do balanço de inclinação do quadril / do tronco a dança mantém (0 = bem reto, 1 = como veio).
  //       A inclinação fixa, aquele "torto" que não muda nunca, sai sempre inteira; só o balanço da dança fica, diminuído.
  //       As pernas mantêm exatamente a pose delas no mundo (só o bloco do quadril endireita); braços e cabeça acompanham o tronco.
  //   fix.ground (true/false): sobe o quadril, quadro a quadro, só o necessário pra sola do pé mais baixo ficar em cima do chão.
  fixClip(c, fix) {
    if (!c || !fix || c._fixed) return c;
    c._fixed = true;
    const Q = THREE.Quaternion, V = THREE.Vector3, S = LS.Skin.PX, n = c.frames, Y = new V(0, 1, 0);
    const get = (b, f) => new Q().fromArray(c.q[b], f * 4), put = (b, f, x) => x.normalize().toArray(c.q[b], f * 4);
    const LEGS = [['RightUpLeg', 'RightLeg', 'RightFoot', -1], ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 1]];
    // rotação que leva a direção "pra cima" de cada quadro pra uma direção arrumada: sem a inclinação média, balanço × keep
    const straighten = (ups, keep) => {
      const m = new V(); ups.forEach(u => m.add(u)); m.divideScalar(ups.length);
      return ups.map(u => new Q().setFromUnitVectors(u, new V((u.x - m.x) * keep, 1, (u.z - m.z) * keep).normalize()));
    };
    const kh = fix.hips !== undefined ? fix.hips : 0.35, ks = fix.spine !== undefined ? fix.spine : 0.5;
    const Qh = [], Ws = [];
    for (let f = 0; f < n; f++) { Qh.push(get('Hips', f)); Ws.push(Qh[f].clone().multiply(get('Spine', f))); } // Ws: tronco no mundo
    const Rh = straighten(Qh.map(h => Y.clone().applyQuaternion(h)), kh);
    const Rs = straighten(Ws.map(w => Y.clone().applyQuaternion(w)), ks);
    for (let f = 0; f < n; f++) {
      const h2 = Rh[f].clone().multiply(Qh[f]), hi = h2.clone().invert();   // quadril novo
      const keepLeg = hi.clone().multiply(Qh[f]);                            // faz a perna continuar igual no mundo
      for (const [up] of LEGS) put(up, f, keepLeg.clone().multiply(get(up, f)));
      put('Spine', f, hi.clone().multiply(Rs[f]).multiply(Ws[f]));          // tronco novo (local ao quadril novo)
      put('Hips', f, h2);
    }
    if (fix.ground === false) return c;
    // pés no chão: altura da sola mais baixa (quinas do pé: 4 px de largura/fundo, 1 px abaixo do tornozelo) em cada quadro
    const GROUND = 0.003, hipsY = 12 * S, a = new V(), k = new V();
    for (let f = 0; f < n; f++) {
      const Wh = get('Hips', f); let low = Infinity;
      for (const [u, l, ft, side] of LEGS) {
        const Wu = Wh.clone().multiply(get(u, f)), Wl = Wu.clone().multiply(get(l, f)), Wf = Wl.clone().multiply(get(ft, f));
        a.set(side * 2 * S, 0, 0).add(k.set(0, -6 * S, 0).applyQuaternion(Wu)).add(k.set(0, -5 * S, 0).applyQuaternion(Wl)); // tornozelo
        for (const dx of [-1.7, 1.7]) for (const dz of [-1.7, 1.7]) low = Math.min(low, a.y + k.set(dx * S, -S, dz * S).applyQuaternion(Wf).y);
      }
      c.p[f * 3 + 1] += Math.max(0, GROUND - (hipsY + c.p[f * 3 + 1] + low)); // só sobe, nunca afunda
    }
    return c;
  },
  // ---------- roda ----------
  show(mode) {
    this.mode = mode; this.open = true; this.sel = -1; this.acc = { x: 0, y: 0 };
    const own = this.owned(), R = 118;
    let h = '<div class="ew-ring">';
    for (let i = 0; i < this.SLOTS; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / this.SLOTS, e = own[i];
      h += '<button class="ew-slot' + (e ? '' : ' empty') + '" ' + (e ? 'data-em="' + i + '"' : '') + ' style="left:calc(50% + ' + (Math.cos(a) * R).toFixed(1) + 'px);top:calc(50% + ' + (Math.sin(a) * R).toFixed(1) + 'px)">' +
        (e ? this.icon(e) + '<span>' + e.name + '</span>' : '<i>?</i><span>EM BREVE</span>') + '</button>';
    }
    h += '<div class="ew-mid"><b>EMOTES</b><small>' + (mode === 'hold' ? 'mexa o mouse e solte o B' : LS.Touch && LS.Touch.active ? 'toque num emote' : 'clique num emote') + '</small></div></div>';
    this.el.innerHTML = h; this.el.classList.remove('hidden');
  },
  icon(e) { // um ícone em pixel por emote
    if (e.key === 'hype') return '<svg class="ew-ico" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#0b0d13" d="M7 0h2v2h1v2h1V2h2v4h1v6h-1v2h-2v1H5v-1H3v-2H2V6h1V4h2v1h1V2h1z"/>' + // foguinho
      '<path fill="#ff5a1a" d="M7 1h1v2h1v2h2V3h1v4h1v4h-1v2h-2v1H6v-1H4v-2H3V7h1V5h1v1h2V3z"/><path fill="#ffc531" d="M7 7h1v1h1v1h1v3H9v1H7v-1H6V9h1z"/><path fill="#fff4b0" d="M7 10h2v2H7z"/></svg>';
    if (e.key === 'reputacao') return '<svg class="ew-ico" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#0b0d13" d="M7 0h2v3h2v2h4v2h-2v2h1v5h-3v-1H5v1H2V9h1V7H1V5h4V3h2z"/>' + // estrela dourada com brilho
      '<path fill="#ffc531" d="M7 1h2v3h2v2h3v1h-2v2h1v4h-1v-1h-1v-1H5v1H4v1H3V9h1V7H2V6h3V4h2z"/><path fill="#fff4b0" d="M7 2h1v3H6v1H4v1h2V6h1z"/><path fill="#c87a00" d="M10 9h1v2H9v1H7v-1h2v-1h1z"/></svg>';
    return '<svg class="ew-ico" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="2" y="2" width="12" height="12" fill="#ffd23a"/><rect x="1" y="4" width="1" height="8" fill="#ffd23a"/><rect x="14" y="4" width="1" height="8" fill="#ffd23a"/><rect x="4" y="1" width="8" height="1" fill="#ffd23a"/><rect x="4" y="14" width="8" height="1" fill="#ffd23a"/>' +
      '<rect x="4" y="5" width="3" height="1" fill="#3a2000"/><rect x="9" y="5" width="3" height="1" fill="#3a2000"/><rect x="4" y="8" width="8" height="4" fill="#3a2000"/><rect x="5" y="10" width="6" height="2" fill="#ff5a6a"/><rect x="2" y="7" width="1" height="2" fill="#7ad8ff"/><rect x="13" y="7" width="1" height="2" fill="#7ad8ff"/></svg>';
  },
  angleFrom(x, y) { const r = this.el.querySelector('.ew-ring').getBoundingClientRect(), dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2); return Math.hypot(dx, dy) < 40 ? null : Math.atan2(dy, dx); },
  pick(ang) {
    let i = -1;
    if (ang !== null) { i = Math.round((ang + Math.PI / 2) / (2 * Math.PI / this.SLOTS)); i = ((i % this.SLOTS) + this.SLOTS) % this.SLOTS; if (!this.owned()[i]) i = -1; }
    this.sel = i;
    this.el.querySelectorAll('.ew-slot').forEach((s, k) => s.classList.toggle('on', k === i));
    const e = this.owned()[i], mid = this.el.querySelector('.ew-mid b'); if (mid) mid.textContent = e ? e.name.toUpperCase() : 'EMOTES';
  },
  close(play) {
    if (!this.open) return;
    this.open = false; this.el.classList.add('hidden');
    const e = play && this.sel >= 0 ? this.owned()[this.sel] : null;
    if (e) this.start(e);
  },
  // ---------- tocar ----------
  async start(e) {
    const G = LS.Game, lobby = this.inLobby();
    if (!lobby && !this.canOpen()) return;
    let clip; try { clip = await this.clip(e); } catch (err) { LS.HUD.toast('Emote indisponível: ' + err.message); return; }
    const m = lobby ? LS.Lobby.model : G.player.model;
    this.stop();
    LS.Anim.player(m).play(clip, { loop: (e.loops || 1) > 1, fade: 0.2 });
    m.gunSocket.visible = false; // mãos livres (a arma volta quando o emote acaba)
    this.local = { m, t: clip.duration * (e.loops || 1), id: e.id, lobby };
    if (!lobby) G.player.emote = e.id;
    if (LS.Audio && LS.Audio.click) LS.Audio.click();
  },
  stop() {
    const L = this.local; if (!L) return;
    this.local = null;
    if (L.m.anim) L.m.anim.stop(0.25);
    L.m.gunSocket.visible = true;
    if (!L.lobby && LS.Game.player) LS.Game.player.emote = 0;
  },
  // todo quadro (antes de atualizar o jogo): roda aberta trava a câmera; o emote acaba sozinho ou quando você faz outra coisa
  tick(dt) {
    if (this.open) {
      LS.Input.mouse.dx = 0; LS.Input.mouse.dy = 0;
      if (!this.canOpen()) this.close(false);
    }
    const L = this.local; if (!L) return;
    L.t -= dt;
    if (L.t <= 0.2) return this.stop(); // sai suave no fim (sem repetir o começo)
    if (L.lobby) { if (!this.inLobby()) this.stop(); return; }
    const G = LS.Game, P = G.player, I = LS.Input, k = I.keys;
    const moving = k.KeyW || k.KeyA || k.KeyS || k.KeyD || k.Space || Math.hypot(P.vel.x, P.vel.z) > 0.6;
    if (G.state !== 'playing' || !P.alive || P.state !== 'ground' || moving || I.mouse.left || I.mouse.right || P.reloadT > 0 || P.healType || P.fireCd > 0 || P.crouch) this.stop();
  },
  // jogador remoto: começa/para o emote que veio pela rede
  async remote(f, id) {
    const m = f.model;
    if (!id) { if (m.anim) m.anim.stop(0.25); m.gunSocket.visible = true; return; }
    const e = this.byId(id); if (!e) return;
    try { const c = await this.clip(e); if (f._em !== id) return; LS.Anim.player(m).play(c, { loop: false, fade: 0.2 }); m.gunSocket.visible = false; } catch (err) { /* ignora */ }
  }
};
