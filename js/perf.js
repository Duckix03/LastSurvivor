// DESEMPENHO: gráfico automático, limite de FPS e recorte de personagens longe.
//  - Gráfico automático (padrão no celular): descobre a placa de vídeo, começa num nível que ela aguenta e vai
//    ajustando sozinho pelo FPS de verdade da partida (sobe quando sobra, desce quando pesa). Antes todo celular
//    começava no "batata" (resolução 51%, sem sombra e sem efeitos), até os mais fortes.
//  - Limite de FPS: celular com tela de 120 Hz desenhava 120 quadros por segundo (o dobro do trabalho e esquentava,
//    o que derruba o FPS depois). No lobby o celular desenha a 30.
//  - Personagens além da névoa não são desenhados; de longe, as peças pequenas (olhos, acessórios) também não.
'use strict';
LS.Gfx = {
  // níveis do automático: qualidade, resolução, distância, efeitos de tela, modo desempenho
  TIERS: [
    { q: 'low', res: 0.85, dist: 220, post: false, perf: true },
    { q: 'low', res: 1, dist: 260, post: false, perf: false },
    { q: 'medium', res: 0.85, dist: 300, post: false, perf: false },
    { q: 'medium', res: 1, dist: 350, post: false, perf: false },
    { q: 'high', res: 0.9, dist: 380, post: true, perf: false },
    { q: 'high', res: 1, dist: 450, post: true, perf: false }
  ],
  gpu: '', klass: 'unknown', hid: [],

  // placa de vídeo pelo nome (WEBGL_debug_renderer_info): forte / média / fraca
  detect() {
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      this.gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : '')) || '';
      const lose = gl && gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    } catch (e) { this.gpu = ''; }
    const g = this.gpu, n = (re) => { const m = re.exec(g); return m ? +m[1] : 0; };
    const adreno = n(/Adreno[^\d]*(\d{3})/i), maliG = n(/Mali-G(\d{2,3})/i), maliOld = /Mali-[T4]/i.test(g);
    if (/Apple/i.test(g) || adreno >= 640 || (adreno >= 700) || maliG >= 710 || /Mali-G7[6-9]|Mali-G[89]\d|Immortalis|Xclipse/i.test(g)) this.klass = 'strong';
    else if (adreno >= 610 || /Mali-G(5[2-9]|6\d|7[0-5])/i.test(g) || /PowerVR.*(GE8|GM9|BXM)/i.test(g)) this.klass = 'mid';
    else if (adreno > 0 || maliOld || /Mali-G(3\d|5[01])|PowerVR|SGX|Vivante|VideoCore/i.test(g)) this.klass = 'weak';
    else this.klass = 'unknown';
    return this.klass;
  },
  mobile() { return !!(LS.Touch && (LS.Touch.active || LS.Touch.detect())); },
  // nível de começo e o máximo que o automático pode subir
  startTier() { return this.mobile() ? { strong: 4, mid: 3, weak: 1, unknown: 2 }[this.klass] : { strong: 5, mid: 4, weak: 2, unknown: 4 }[this.klass]; },
  maxTier() { return this.mobile() ? { strong: 5, mid: 4, weak: 3, unknown: 4 }[this.klass] : 5; },

  // chamado bem cedo (antes do jogo criar o renderer): primeira vez no celular = automático ligado
  boot() {
    this.detect();
    const S = LS.settings;
    if (S.autoQ === undefined) S.autoQ = this.mobile(); // primeira vez (ou configuração antiga): celular no automático
    if (S.fpsCap === undefined) S.fpsCap = this.mobile() ? 60 : 0;
    if (S.autoQ) { const t = S.autoTier !== undefined ? Math.min(S.autoTier, this.maxTier()) : this.startTier(); this.setTier(t, true); }
  },
  // aplica um nível (nas configurações; não manda pra nuvem: gráfico é de cada aparelho)
  setTier(t, quiet) {
    const S = LS.settings, T = this.TIERS[Math.max(0, Math.min(this.TIERS.length - 1, t))];
    S.autoTier = Math.max(0, Math.min(this.TIERS.length - 1, t));
    S.quality = T.q; S.resScale = T.res; S.renderDistance = T.dist; S.postfx = T.post; S.perfMode = T.perf;
    try { localStorage.setItem('lastsurvivor_settings', JSON.stringify(S)); } catch (e) { /* ignora */ }
    if (!quiet && LS.Game && LS.Game.renderer) { LS.Game.applySettings(); if (LS.UI && LS.UI.syncSettings) LS.UI.syncSettings(); }
  },

  // ---------- limite de FPS: true = pula este quadro ----------
  skip(state) {
    const S = LS.settings, lobby = state === 'menu' || state === 'lobby';
    let cap = +S.fpsCap || 0;
    if (lobby && this.mobile()) cap = cap ? Math.min(cap, 30) : 30; // lobby no celular: 30 já fica lisinho e não esquenta
    if (!cap) return false;
    const now = performance.now(), iv = 1000 / cap;
    if (this._nd && now < this._nd - 1.5) return true;
    this._nd = this._nd && now - this._nd < iv ? this._nd + iv : now + iv;
    return false;
  },

  // ---------- automático: mede o FPS na partida e ajusta ----------
  frame(rawDt, playing) {
    const S = LS.settings;
    if (!S.autoQ || !playing || rawDt <= 0 || rawDt > 0.5) { this.acc = 0; this.n = 0; return; }
    const now = performance.now();
    if (!this.since) this.since = now;
    if (now - this.since < 4000) return; // começo da partida (compilando, carregando): não conta
    this.acc = (this.acc || 0) + rawDt; this.n = (this.n || 0) + 1;
    if (this.acc < 3) return;
    const fps = this.n / this.acc; this.acc = 0; this.n = 0;
    const target = Math.min(+S.fpsCap || 60, 60), t = S.autoTier | 0;
    this.lastFps = fps;
    if (fps < target * 0.78 && t > 0) { // pesado: desce um nível e bloqueia o de cima por um tempo
      this.block = { tier: t, until: now + 90000 }; this.good = 0; this.setTier(t - 1);
    } else if (fps >= target * 0.95) { // sobrando por ~12 s seguidos: sobe um nível (se não foi o que pesou agora há pouco)
      this.good = (this.good || 0) + 1;
      if (this.good >= 4 && t < this.maxTier() && !(this.block && this.block.tier === t + 1 && now < this.block.until)) { this.good = 0; this.setTier(t + 1); }
    } else this.good = 0;
  },
  newMatch() { this.since = 0; this.acc = 0; this.n = 0; this.good = 0; },

  // ---------- recorte de personagens (só durante o desenho; a lógica do jogo não vê) ----------
  details(model) {
    const now = performance.now();
    if (model._detT && now - model._detT < 2500) return model._det;
    const out = [], s = this._s || (this._s = new THREE.Vector3());
    model.root.updateMatrixWorld();
    model.root.traverse(o => { if (!o.isMesh || o.isSprite) return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); o.getWorldScale(s); if (g.boundingSphere.radius * Math.max(s.x, s.y, s.z) < 0.2) out.push(o); });
    model._det = out; model._detT = now + Math.random() * 400; // espalha os recálculos
    return out;
  },
  cullBefore(G) {
    const hid = this.hid; hid.length = 0;
    if (!G.fighters || !G.camera) return;
    const c = G.camera.position, far = G.scene.fog ? G.scene.fog.far + 8 : 1e9, far2 = far * far, lod2 = 35 * 35;
    for (const f of G.fighters) {
      const r = f.model && f.model.root; if (!r || !r.visible) continue;
      const dx = r.position.x - c.x, dy = r.position.y - c.y, dz = r.position.z - c.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > far2) { r.visible = false; hid.push(r); continue; }
      if (d2 > lod2) for (const m of this.details(f.model)) if (m.visible) { m.visible = false; hid.push(m); }
    }
  },
  cullAfter() { const hid = this.hid; for (let i = 0; i < hid.length; i++) hid[i].visible = true; hid.length = 0; },
};
