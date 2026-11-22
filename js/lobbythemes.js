// Temas do lobby: o mesmo terraço, com céu, luz e decoração especiais (Halloween, Natal, Ano Novo, Verão, Festa Junina).
// O dono do jogo escolhe o tema no painel ADMIN → TEMAS e vale pra todo mundo (o servidor manda junto com o "X jogando").
// "Automático" escolhe pela data. Tudo em blocos, no estilo do jogo.
// Regra contra z-fighting (faces piscando): duas peças nunca têm faces no mesmo plano viradas pro mesmo lado
// e com área em comum — sempre uma diferença de pelo menos 1-2 cm (tampas maiores, enfeites saltados pra fora).
'use strict';
LS.LobbyThemes = {
  LIST: [
    { id: 'padrao', name: 'Pôr do sol', sw: ['#5a2a6e', '#ff8a5c'] },
    { id: 'halloween', name: 'Halloween', sw: ['#1a0c2c', '#ff7a1a'] },
    { id: 'natal', name: 'Natal', sw: ['#1a3460', '#e8f2ff'] },
    { id: 'anonovo', name: 'Ano Novo', sw: ['#0a1030', '#ffd34d'] },
    { id: 'verao', name: 'Verão', sw: ['#2a8ae8', '#ffd890'] },
    { id: 'junina', name: 'Festa Junina', sw: ['#6a3050', '#ffb030'] },
  ],
  // automático (calendário do Brasil)
  byDate(d) {
    d = d || new Date(); const m = d.getMonth() + 1, day = d.getDate(), md = m * 100 + day;
    if (md >= 1020 && md <= 1102) return 'halloween';
    if (md >= 1201 && md <= 1226) return 'natal';
    if (md >= 1227 || md <= 106) return 'anonovo';
    if (md >= 107 && md <= 228) return 'verao';
    if (m === 6 || m === 7) return 'junina';
    return 'padrao';
  },
  // tema escolhido pelo dono (vem do servidor; fica guardado pra abrir já com ele) e prévia local do painel admin
  server: (() => { try { return localStorage.getItem('ls_theme') || 'auto'; } catch (e) { return 'auto'; } })(), preview: null,
  active() { return this.resolve(this.preview || this.server); },
  setServer(id) { if (!id || id === this.server) return; this.server = id; try { localStorage.setItem('ls_theme', id); } catch (e) { /* ignora */ } if (LS.Lobby) LS.Lobby.applyTheme(); },
  setPreview(id) { this.preview = id; if (LS.Lobby) LS.Lobby.applyTheme(); },
  resolve(id) { return !id || id === 'auto' ? this.byDate() : (this.T[id] ? id : 'padrao'); },
  name(id) { if (!id || id === 'auto') return 'Automático (' + this.name(this.byDate()) + ')'; const t = this.LIST.find(x => x.id === id); return t ? t.name : id; },

  // ---------- peças ----------
  _q: new THREE.Quaternion(), _q2: new THREE.Quaternion(), _e: new THREE.Euler(),
  // grupo girado: part(lx, cy, lz, w, h, d, cor, {glow, rx, ry, rz}) — posições locais (centro da peça), girado em volta de (ox, oz)
  grp(ctx, ox, oz, gy, oy) {
    const c = Math.cos(gy || 0), s = Math.sin(gy || 0), q = this._q, q2 = this._q2, e = this._e;
    return (lx, cy, lz, w, h, d, col, o) => {
      o = o || {};
      q.setFromAxisAngle(LS.LobbyThemes._Y, gy || 0);
      if (o.rx || o.ry || o.rz) q.multiply(q2.setFromEuler(e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ')));
      e.setFromQuaternion(q, 'XYZ');
      (o.glow ? ctx.glow : ctx.solid).push([ox + lx * c + lz * s, (oy || 0) + cy, oz - lx * s + lz * c, w, h, d, col, e.x, e.y, e.z]);
    };
  },
  _Y: new THREE.Vector3(0, 1, 0),
  spriteTex(draw, w, h) { const c = document.createElement('canvas'); c.width = w || 64; c.height = h || w || 64; draw(c.getContext('2d'), c.width, c.height); const t = new THREE.CanvasTexture(c); return t; },
  dotTex() { return this._dot || (this._dot = this.spriteTex((g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,0.75)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); }, 32)); },
  batTex() {
    return this.spriteTex((g, w, h) => { g.fillStyle = '#0c0614'; g.beginPath(); g.moveTo(32, 12); g.quadraticCurveTo(22, 2, 4, 6); g.quadraticCurveTo(10, 12, 8, 18); g.quadraticCurveTo(16, 14, 20, 20); g.quadraticCurveTo(26, 16, 32, 22);
      g.quadraticCurveTo(38, 16, 44, 20); g.quadraticCurveTo(48, 14, 56, 18); g.quadraticCurveTo(54, 12, 60, 6); g.quadraticCurveTo(42, 2, 32, 12); g.fill(); g.fillRect(29, 9, 6, 8); }, 64, 32);
  },
  // estrelas no céu (pontinhos fixos, alguns piscando)
  stars(sc, n) {
    const R = LS.Tex.rng(311), pos = [];
    for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, y = 0.12 + R() * 0.85, r = Math.sqrt(1 - y * y); pos.push(Math.cos(a) * r * 270, y * 270, -Math.abs(Math.sin(a) * r * 270) - 20); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
    m.renderOrder = -9; sc.add(m);
  },
  // partículas caindo/subindo (neve, confete, faísca): caixa [x0..x1] [y0..y1] [z0..z1]
  particles(ctx, n, o) {
    const R = ctx.R, pos = new Float32Array(n * 3), col = o.colors ? new Float32Array(n * 3) : null, ph = new Float32Array(n), c = new THREE.Color();
    const [x0, x1, y0, y1, z0, z1] = o.box;
    for (let i = 0; i < n; i++) { pos[i * 3] = x0 + R() * (x1 - x0); pos[i * 3 + 1] = y0 + R() * (y1 - y0); pos[i * 3 + 2] = z0 + R() * (z1 - z0); ph[i] = R() * 6.28;
      if (col) { c.setHex(o.colors[i % o.colors.length]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ map: o.map || this.dotTex(), size: o.size || 0.12, color: col ? 0xffffff : (o.color || 0xffffff), vertexColors: !!col, transparent: true, opacity: o.opacity || 0.95,
      depthWrite: false, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.frustumCulled = false; ctx.sc.add(m);
    const vy = o.vy || -1;
    ctx.anim((t, dt) => {
      for (let i = 0; i < n; i++) {
        let y = pos[i * 3 + 1] + vy * dt * (0.7 + (ph[i] % 1) * 0.6);
        if (vy < 0 && y < y0) y = y1; if (vy > 0 && y > y1) { y = y0; if (o.respawn) o.respawn(pos, i); }
        pos[i * 3 + 1] = y; pos[i * 3] += Math.sin(t * (o.sway || 0.8) + ph[i]) * dt * (o.swayAmp || 0.3);
      }
      g.attributes.position.needsUpdate = true;
      if (o.fade) m.material.opacity = o.fade(t);
    });
    return m;
  },
  light(ctx, col, inten, dist, x, y, z) { const l = new THREE.PointLight(col, inten, dist, 2); l.position.set(x, y, z); ctx.sc.add(l); return l; },
  // fonte de pixels 3x5 (placa do Ano Novo)
  FONT: { '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001', '5': '111100111001111', '6': '111100111101111',
    '7': '111001010010010', '8': '111101111101111', '9': '111101111001111', 'F': '111100110100100', 'E': '111100110100111', 'L': '100100100100111', 'I': '111010010010111', 'Z': '111001010100111' },
  pixelText(part, text, cx, cy, z, px, col) {
    const W = text.length * 4 - 1;
    [...text].forEach((ch, k) => { const f = this.FONT[ch]; if (!f) return;
      for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (f[r * 3 + q] === '1') part(cx + (k * 4 + q - (W - 1) / 2) * px, cy + (2 - r) * px, z, px * 0.92, px * 0.92, px * 0.5, col, { glow: true });
    });
  },

  // ---------- os temas ----------
  T: {
    padrao: {},

    // ===== HALLOWEEN: noite roxa, lua cheia enorme, abóboras acesas, lápides, caldeirão borbulhando, morcegos e fantasminha =====
    halloween: {
      pal: { top: 0x07040f, mid: 0x221035, hor: 0x6a2a34, sun: 0xffe8c0, fog: 0x2a1838, city: [0x0e0818, 0x180c28, 0x261234], roof: 0x4a4458, wall: 0x37314a, trim: 0x1e1a2a, warm: 0xff8a20, win: 0xff9a40 },
      fog: [14, 120], sunDir: [-0.3, 0.2, -1], disk: 0.9935, stars: 500, windows: 0.06, bands: [0x4a2a5a, 0x3a2050, 0x5a3050, 0x2a1840], bandAlpha: 0.4,
      light: { hemi: [0x6a5aa0, 0x100818, 0.6], sun: [0x9ab0ff, 0.7, -5, 8, -10], front: [0xffa060, 0.32] },
      birds: 'bats', padColor: '#ff7a1a', ring: 0x9a40ff,
      bulbs(b, t) { const f = 0.8 + Math.sin(t * 9 + b.ph * 3) * 0.12 + (Math.sin(t * 23 + b.ph) > 0.92 ? -0.4 : 0); b.m.material.color.setRGB(b.i % 2 ? 0.62 * f : 1 * f, b.i % 2 ? 0.25 * f : 0.5 * f, b.i % 2 ? 1 * f : 0.08 * f); },
      decor(ctx) {
        const TH = LS.LobbyThemes;
        const pumpkin = (x, z, s, ry, lit) => {
          const p = TH.grp(ctx, x, z, ry);
          p(0, 0.4 * s, 0, s, 0.8 * s, s, 0xe8721c);
          p(0, 0.43 * s, 0, 0.56 * s, 0.86 * s, 1.08 * s, 0xd05e18);  // gomos (alturas diferentes: sem face em comum)
          p(0, 0.42 * s, 0, 1.08 * s, 0.84 * s, 0.56 * s, 0xd8661a);
          p(0, 0.95 * s, 0, 0.14 * s, 0.2 * s, 0.14 * s, 0x4a6a2a);
          p(0.14 * s, 0.93 * s, 0.02 * s, 0.24 * s, 0.05 * s, 0.12 * s, 0x5a8a30, { rz: -0.4 });
          if (lit) { const fz = 0.575 * s, gc = 0xffb028; // rosto aceso, saltado pra fora do gomo
            p(-0.19 * s, 0.56 * s, fz, 0.16 * s, 0.14 * s, 0.04 * s, gc, { glow: true }); p(0.19 * s, 0.56 * s, fz, 0.16 * s, 0.14 * s, 0.04 * s, gc, { glow: true });
            p(0, 0.43 * s, fz, 0.08 * s, 0.08 * s, 0.04 * s, gc, { glow: true });
            p(0, 0.27 * s, fz, 0.42 * s, 0.09 * s, 0.04 * s, gc, { glow: true }); p(-0.2 * s, 0.33 * s, fz, 0.09 * s, 0.09 * s, 0.04 * s, gc, { glow: true }); p(0.2 * s, 0.33 * s, fz, 0.09 * s, 0.09 * s, 0.04 * s, gc, { glow: true }); }
        };
        pumpkin(-4.0, -4.9, 0.85, 0.35, true); pumpkin(-3.2, -5.7, 0.55, -0.2, true); pumpkin(4.3, -4.7, 0.9, -0.4, true); pumpkin(5.15, -4.05, 0.5, 0.3, false);
        pumpkin(6.1, -7.6, 1.25, -0.15, true); pumpkin(-6.4, -7.9, 1.1, 0.25, true); pumpkin(2.6, -9.4, 0.6, 0.1, true);
        TH.light(ctx, 0xff8a30, 1.3, 7, 4.6, 1.2, -4.0); TH.light(ctx, 0xff8a30, 1.0, 6, -4.2, 1.2, -4.4);
        // lápides
        const grave = (x, z, ry, tilt, cross) => {
          const p = TH.grp(ctx, x, z, ry);
          p(0, 0.06, 0, 0.92, 0.12, 0.44, 0x3e3e4a);
          if (cross) { p(0, 0.62, 0, 0.14, 1.0, 0.14, 0x777786, { rz: tilt }); p(0, 0.85, 0, 0.56, 0.14, 0.12, 0x777786, { rz: tilt }); }
          else { p(0, 0.57, 0, 0.7, 0.9, 0.18, 0x6e6e7e, { rz: tilt }); p(Math.sin(-tilt) * 0.06, 1.08, 0, 0.5, 0.12, 0.16, 0x6e6e7e, { rz: tilt }); p(Math.sin(-tilt) * 0.08, 1.18, 0, 0.3, 0.08, 0.14, 0x6e6e7e, { rz: tilt });
            p(0, 0.62, 0.1, 0.36, 0.06, 0.02, 0x4a4a58, { rz: tilt }); p(0, 0.62, 0.1, 0.06, 0.3, 0.02, 0x4a4a58, { rz: tilt }); } // cruz entalhada (saltada 1 cm)
          for (let i = 0; i < 4; i++) p(-0.36 + i * 0.24, 0.17, 0.25, 0.12, 0.1 + (i % 2) * 0.08, 0.08, 0x3a5a2a);
        };
        grave(-1.6, -9.3, 0.15, 0.06, false); grave(0.3, -9.7, -0.1, -0.05, true); grave(-3.3, -9.0, 0.3, -0.1, false); grave(1.4, -8.6, -0.25, 0.12, false);
        // caldeirão com fogo embaixo e bolhas verdes
        { const x = 6.6, z = -5.6, p = TH.grp(ctx, x, z, 0.4);
          for (const [a, b] of [[-0.42, -0.42], [0.42, -0.42], [0, 0.48]]) p(a, 0.17, b, 0.12, 0.34, 0.12, 0x15151c);
          p(0, 0.58, 0, 1.1, 0.62, 1.1, 0x1a1a24); p(0, 0.32, 0, 0.9, 0.12, 0.9, 0x1a1a24);
          p(0, 0.92, 0.57, 1.26, 0.1, 0.12, 0x24242e); p(0, 0.92, -0.57, 1.26, 0.1, 0.12, 0x24242e); p(0.57, 0.92, 0, 0.12, 0.1, 1.02, 0x24242e); p(-0.57, 0.92, 0, 0.12, 0.1, 1.02, 0x24242e);
          p(0, 0.95, 0, 0.98, 0.06, 0.98, 0x5aff6a, { glow: true });
          for (let i = 0; i < 3; i++) p(0, 0.06, 0, 0.9, 0.1, 0.12, 0x5a3a24, { ry: i * 1.05 });
          TH.light(ctx, 0x60ff80, 1.5, 5, x, 1.6, z);
          const bub = [], bm = new THREE.MeshBasicMaterial({ color: 0x8aff8a, transparent: true }), bg = new THREE.BoxGeometry(0.1, 0.1, 0.1);
          for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(bg, bm.clone()); ctx.sc.add(m); bub.push({ m, ph: i / 6, ox: (ctx.R() - 0.5) * 0.6, oz: (ctx.R() - 0.5) * 0.6 }); }
          const fire = []; for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffc030 : 0xff6a10 })); m.position.set(x + (i - 1.5) * 0.14, 0.2, z); ctx.sc.add(m); fire.push(m); }
          ctx.anim(t => {
            bub.forEach(b => { const k = (t * 0.6 + b.ph) % 1; b.m.position.set(x + b.ox, 1.0 + k * 0.9, z + b.oz); b.m.material.opacity = 1 - k; b.m.scale.setScalar(0.6 + k); });
            fire.forEach((m, i) => { m.scale.y = 0.7 + Math.abs(Math.sin(t * 11 + i * 1.7)) * 0.8; m.position.y = 0.12 + m.scale.y * 0.11; });
          });
        }
        // fantasminha flutuando no fundo
        { const tx = TH.spriteTex((g, w) => { g.fillStyle = 'rgba(240,240,255,0.92)'; g.beginPath(); g.moveTo(14, 60); g.lineTo(14, 26); g.quadraticCurveTo(14, 4, 32, 4); g.quadraticCurveTo(50, 4, 50, 26); g.lineTo(50, 60);
            for (let i = 0; i < 4; i++) g.quadraticCurveTo(46 - i * 9, 52, 41 - i * 9, 60); g.fill(); g.fillStyle = '#1a1028'; g.fillRect(23, 22, 6, 9); g.fillRect(36, 22, 6, 9); g.beginPath(); g.ellipse(32, 40, 4, 5, 0, 0, 7); g.fill(); }, 64);
          const gh = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, opacity: 0.85, depthWrite: false })); gh.scale.set(1.3, 1.3, 1); ctx.sc.add(gh);
          ctx.anim(t => { gh.position.set(-5.2 + Math.sin(t * 0.25) * 2.2, 2.8 + Math.sin(t * 1.6) * 0.25, -9.4); gh.material.opacity = 0.6 + Math.sin(t * 0.9) * 0.25; });
        }
        // névoa baixa rolando
        { const ft = LS.LobbyThemes.dotTex();
          for (let i = 0; i < 6; i++) { const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, color: 0x8a6ab8, transparent: true, opacity: 0.16, depthWrite: false })); f.scale.set(7, 1.6, 1); ctx.sc.add(f);
            const x0 = -10 + i * 4, z0 = -9 + (i % 2) * 2.5; ctx.anim(t => { f.position.set(x0 + Math.sin(t * 0.15 + i) * 1.5, 0.45, z0); }); } }
      }
    },

    // ===== NATAL: entardecer azul com neve caindo, chão nevado, árvore de natal com pisca-pisca, bonecos de neve, presentes e trenó no céu =====
    natal: {
      pal: { top: 0x0b1934, mid: 0x2a4a7c, hor: 0xa8c4e8, sun: 0xfff6e6, fog: 0x6a88b4, city: [0x1a2a48, 0x2c4066, 0x40588a], roof: 0xf2f6ff, wall: 0x5a6278, trim: 0x3a4258, warm: 0xffd890 },
      fog: [16, 130], sunDir: [-0.45, 0.22, -1], disk: 0.9955, stars: 260, windows: 0.2, bands: [0x9ab0d8, 0x7a90c0, 0xb8c8e8, 0x6a7aa8], bandAlpha: 0.45,
      light: { hemi: [0xc8dcff, 0x2a3048, 0.9], sun: [0xbcd0ff, 0.75, -6, 8, -9], front: [0xffe6c8, 0.5] },
      plane: false, padColor: '#e83a3a', ring: 0x3ad06a,
      floorPaint(g, w) { // neve fofa com marquinhas
        g.fillStyle = '#f4f8ff'; g.fillRect(0, 0, w, w); const RR = LS.Tex.rng(9);
        for (let i = 0; i < 900; i++) { const v = 215 + RR() * 40; g.fillStyle = `rgba(${v - 10},${v - 2},255,0.35)`; g.fillRect(RR() * w, RR() * w, 3, 2); }
        for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(RR() * w, RR() * w, 2, 2); }
      },
      bulbs(b, t) { const C = [[1, 0.2, 0.2], [0.2, 1, 0.35], [1, 0.82, 0.25], [0.3, 0.55, 1]], c = C[(b.i + Math.floor(t * 1.5)) % 4], f = Math.sin(t * 4 + b.ph) > -0.6 ? 1 : 0.3; b.m.material.color.setRGB(c[0] * f, c[1] * f, c[2] * f); },
      decor(ctx) {
        const TH = LS.LobbyThemes, S = ctx.S, W = 0xf4f8ff;
        // neve em cima do parapeito, da caixa d'água, da escada e dos ar-condicionados (sempre um pouco maior que a peça: sem face em comum)
        S(0, 1.12, -11.4, 26.32, 0.09, 0.7, W); for (const sx of [-1, 1]) S(sx * 12.9, 1.12, -3, 0.7, 0.09, 17.32, W);
        S(-8.6, 5.67, -8.6, 1.18, 0.1, 1.18, W); S(-8.6, 5.27, -8.6, 2.26, 0.06, 2.26, W); S(9.6, 3.08, -8.2, 3.58, 0.12, 2.98, W);
        for (const z of [-4.5, -2.3]) S(-10.4, 1.06, z, 1.58, 0.08, 1.78, W);
        for (const [x, z, s] of [[-11.6, -10.4, 1.4], [11.2, -6.0, 1.1], [-11.8, 3.4, 1.2], [11.6, 2.4, 0.9]]) { S(x, 0, z, s, 0.22, s * 0.8, W); S(x + 0.1, 0.22, z - 0.05, s * 0.66, 0.16, s * 0.5, W); S(x - 0.05, 0.38, z, s * 0.34, 0.1, s * 0.3, W); }
        // árvore de natal
        const tx = -4.1, tz = -6.1, p = TH.grp(ctx, tx, tz, 0.3);
        p(0, 0.32, 0, 0.42, 0.64, 0.42, 0x5a3a22); p(0, 0.14, 0, 1.0, 0.28, 1.0, 0xb02a2a); p(0, 0.3, 0, 1.06, 0.06, 1.06, 0xe8c040);
        const tiers = [[2.5, 0.62, 0.86], [2.0, 0.62, 1.44], [1.5, 0.6, 2.0], [1.0, 0.56, 2.52], [0.52, 0.5, 2.98]];
        tiers.forEach(([w, h, cy], i) => { p(0, cy, 0, w, h, w, i % 2 ? 0x1e7a3a : 0x22863f); p(0, cy + h / 2 + 0.02, 0, w * 0.82, 0.05, w * 0.82, 0xeaf2ff); }); // neve no topo de cada andar
        const orn = { r: [], g: [], b: [], w: [] }, keys = ['r', 'g', 'b', 'w'], ornGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const mats = { r: new THREE.MeshBasicMaterial({ color: 0xff3030 }), g: new THREE.MeshBasicMaterial({ color: 0xffd040 }), b: new THREE.MeshBasicMaterial({ color: 0x40a0ff }), w: new THREE.MeshBasicMaterial({ color: 0xffffff }) };
        const c = Math.cos(0.3), s = Math.sin(0.3); let k = 0;
        tiers.slice(0, 4).forEach(([w, h, cy]) => { const half = w / 2 + 0.05;
          for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const off of w > 1.2 ? [-0.3, 0.3] : [0]) {
            const lx = ax ? ax * half : off * w, lz = az ? az * half : off * w, key = keys[k++ % 4], m = new THREE.Mesh(ornGeo, mats[key]);
            m.position.set(tx + lx * c + lz * s, cy - h * 0.25, tz - lx * s + lz * c); ctx.sc.add(m); orn[key].push(m); } });
        { const st = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.1), new THREE.MeshBasicMaterial({ color: 0xffe060 })); st.position.set(tx, 3.48, tz); st.rotation.z = Math.PI / 4; ctx.sc.add(st);
          const st2 = st.clone(); st2.rotation.z = 0; st2.scale.set(0.8, 0.8, 1.2); ctx.sc.add(st2); ctx.anim(t => { st.rotation.y = st2.rotation.y = t * 0.8; }); }
        TH.light(ctx, 0xffd890, 1.2, 7, tx + 0.6, 2.2, tz + 1.2);
        ctx.anim(t => keys.forEach((key, i) => { const on = Math.sin(t * 3 + i * 1.6) > -0.3; mats[key].color.setHex(on ? [0xff3030, 0xffd040, 0x40a0ff, 0xffffff][i] : [0x601010, 0x605010, 0x103060, 0x606070][i]); }));
        // presentes (laço sempre saltado 2 cm pra fora)
        const gift = (x, z, w, h, d, col, rib, ry) => { const q = TH.grp(ctx, x, z, ry);
          q(0, h / 2, 0, w, h, d, col); q(0, h / 2, 0, w + 0.04, h + 0.04, 0.12, rib); q(0, h / 2, 0, 0.12, h + 0.03, d + 0.04, rib);
          q(-0.08, h + 0.09, 0, 0.16, 0.12, 0.06, rib, { rz: 0.5 }); q(0.08, h + 0.09, 0, 0.16, 0.12, 0.06, rib, { rz: -0.5 }); };
        gift(-3.0, -5.0, 0.6, 0.5, 0.6, 0xd83030, 0xffd040, 0.4); gift(-4.9, -4.9, 0.5, 0.42, 0.7, 0x2a8a4a, 0xf0f0f0, -0.3); gift(-3.5, -4.3, 0.42, 0.34, 0.42, 0x3a6ad8, 0xff4a4a, 0.9); gift(3.2, -3.6, 0.5, 0.4, 0.5, 0xe8c040, 0xd83030, -0.5);
        // bonecos de neve (cartola, cachecol, nariz de cenoura, olhos e botões de carvão)
        const snowman = (x, z, sc, ry) => { const q = TH.grp(ctx, x, z, ry), u = v => v * sc;
          q(0, u(0.5), 0, u(1.0), u(1.0), u(1.0), W); q(0, u(1.32), 0, u(0.74), u(0.7), u(0.74), 0xeef4ff); q(0, u(1.93), 0, u(0.56), u(0.54), u(0.56), W);
          q(0, u(1.67), 0, u(0.66), u(0.12), u(0.66), 0xd83030); q(u(0.2), u(1.47), u(0.41), u(0.14), u(0.4), u(0.06), 0xd83030, { rz: 0.15 });
          q(-u(0.12), u(2.0), u(0.3), u(0.08), u(0.08), u(0.04), 0x15151a); q(u(0.12), u(2.0), u(0.3), u(0.08), u(0.08), u(0.04), 0x15151a);
          q(0, u(1.9), u(0.38), u(0.09), u(0.09), u(0.24), 0xff8a20);
          for (let i = 0; i < 3; i++) q(0, u(1.18 + i * 0.16), u(0.39), u(0.08), u(0.08), u(0.04), 0x15151a);
          q(0, u(2.23), 0, u(0.72), u(0.05), u(0.72), 0x15151a); q(0, u(2.47), 0, u(0.42), u(0.44), u(0.42), 0x1a1a22); q(0, u(2.31), 0, u(0.44), u(0.07), u(0.44), 0xd83030);
          q(u(0.55), u(1.42), 0, u(0.5), u(0.06), u(0.06), 0x5a3a22, { rz: 0.5 }); q(-u(0.55), u(1.42), 0, u(0.5), u(0.06), u(0.06), 0x5a3a22, { rz: -0.5 }); };
        snowman(4.5, -4.6, 0.95, -0.45); snowman(6.3, -6.9, 0.7, -0.2);
        // neve caindo
        TH.particles(ctx, 1400, { box: [-28, 28, -1, 22, -22, 9], vy: -0.9, size: 0.17, sway: 0.7, swayAmp: 0.35 });
        // trenó do Papai Noel cruzando o céu (silhueta na frente da lua)
        { const tx2 = TH.spriteTex((g) => { g.fillStyle = '#0a1226';
            g.beginPath(); g.moveTo(150, 52); g.lineTo(200, 52); g.quadraticCurveTo(214, 52, 214, 40); g.lineTo(206, 40); g.quadraticCurveTo(204, 46, 196, 46); g.lineTo(156, 46); g.fill(); // esqui
            g.fillRect(160, 26, 34, 18); g.fillRect(186, 14, 10, 14); g.beginPath(); g.arc(175, 20, 7, 0, 7); g.fill(); // trenó + Noel
            for (let i = 0; i < 3; i++) { const x = 20 + i * 42; g.fillRect(x, 30, 26, 10); g.fillRect(x + 22, 20, 6, 12); g.fillRect(x + 2, 40, 3, 10); g.fillRect(x + 20, 40, 3, 10);
              g.fillRect(x + 24, 12, 2, 8); g.fillRect(x + 28, 10, 2, 6); g.fillRect(x + 20, 12, 2, 6); }
            g.strokeStyle = '#0a1226'; g.lineWidth = 2; g.beginPath(); g.moveTo(150, 34); g.lineTo(130, 34); g.stroke(); }, 256, 64);
          const sl = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx2, transparent: true, fog: false, depthWrite: false })); sl.scale.set(36, 9, 1); ctx.sc.add(sl);
          ctx.anim(t => { const k = (t * 0.022) % 1; sl.position.set(240 - k * 480, 62 + Math.sin(k * 6.28 * 2) * 6, -200); });
        }
      }
    },

    // ===== ANO NOVO: noite com fogos de artifício, placa "FELIZ 2027" acesa, balões dourados e prateados e confete =====
    anonovo: {
      pal: { top: 0x04061a, mid: 0x121c48, hor: 0x3a2a6c, sun: 0xc8d4ff, fog: 0x1a2048, city: [0x0a1030, 0x121a40, 0x1c2652], roof: 0x4c4c66, wall: 0x3a3a52, trim: 0x22223a, warm: 0xffd870, win: 0xffd870 },
      fog: [18, 140], sunDir: [-0.55, 0.42, -1], disk: 0.9975, stars: 420, windows: 0.24, bands: [0x2a2a6a, 0x3a2a7a, 0x22225a, 0x3a3a8a], bandAlpha: 0.35,
      light: { hemi: [0x9098e0, 0x101020, 0.62], sun: [0x8aa0ff, 0.55, -6, 8, -9], front: [0xffe0b0, 0.55] },
      plane: false, birds: false, padColor: '#ffd34d', ring: 0xffd34d,
      bulbs(b, t) { const f = Math.sin(t * 5 + b.ph * 4) > 0 ? 1 : 0.45; if (b.i % 2) b.m.material.color.setRGB(f, 0.84 * f, 0.36 * f); else b.m.material.color.setRGB(0.92 * f, 0.94 * f, f); },
      decor(ctx) {
        const TH = LS.LobbyThemes, d = new Date(), year = String(d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear());
        // placa com o ano (fonte de pixels acesa), em pé no parapeito do fundo
        { const p = TH.grp(ctx, 3.8, -10.95, 0);
          p(-1.6, 1.2, 0, 0.12, 2.4, 0.12, 0x2a2a3a); p(1.6, 1.2, 0, 0.12, 2.4, 0.12, 0x2a2a3a);
          p(0, 3.2, -0.02, 3.9, 1.95, 0.1, 0x14142a); p(0, 3.2, -0.06, 4.06, 2.1, 0.06, 0x8a6a20); // moldura dourada atrás (maior)
          TH.pixelText(p, 'FELIZ', 0, 3.72, 0.07, 0.14, 0xffffff);
          TH.pixelText(p, year, 0, 2.86, 0.07, 0.22, 0xffd34d); }
        TH.light(ctx, 0xffd890, 0.9, 6, 3.8, 3.0, -9.6);
        // balões dourados, prateados e roxos (cachos que balançam)
        const cluster = (x, z, cols) => {
          const g = new THREE.Group(); g.position.set(x, 0, z); ctx.sc.add(g);
          const wgt = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.22), new THREE.MeshLambertMaterial({ color: 0x2a2a3a })); wgt.position.y = 0.08; g.add(wgt);
          const bs = cols.map((c, i) => { const a = i / cols.length * Math.PI * 2, r = i ? 0.38 : 0, h = 2.3 + (i % 3) * 0.32;
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.54, 0.44), new THREE.MeshStandardMaterial({ color: c, metalness: 0.55, roughness: 0.28, emissive: c, emissiveIntensity: 0.12 }));
            m.position.set(Math.cos(a) * r, h, Math.sin(a) * r); m.castShadow = true; g.add(m);
            const knot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), m.material); knot.position.set(0, -0.31, 0); m.add(knot);
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.16, 0), m.position.clone().add(new THREE.Vector3(0, -0.34, 0))]), new THREE.LineBasicMaterial({ color: 0xdddddd }));
            g.add(line); return { m, line, base: m.position.clone(), ph: i * 1.3 }; });
          ctx.anim(t => bs.forEach(b => { b.m.position.set(b.base.x + Math.sin(t * 0.9 + b.ph) * 0.06, b.base.y + Math.sin(t * 1.3 + b.ph) * 0.05, b.base.z); b.m.rotation.y = Math.sin(t * 0.5 + b.ph) * 0.4;
            const a = b.line.geometry.attributes.position; a.setXYZ(1, b.m.position.x, b.m.position.y - 0.34, b.m.position.z); a.needsUpdate = true; }));
        };
        cluster(-4.3, -5.4, [0xf0c040, 0xd8dce8, 0x8a4ae0, 0xf0c040, 0xd8dce8, 0xf0c040]); cluster(5.6, -5.0, [0xd8dce8, 0xf0c040, 0x8a4ae0, 0xd8dce8, 0xf0c040]);
        // garrafas e taças na mesinha (direita)
        { const p = TH.grp(ctx, 6.9, -7.6, -0.3);
          p(0, 0.45, 0, 1.4, 0.06, 0.8, 0x2a2a3a); for (const [a, b] of [[-0.6, -0.32], [0.6, -0.32], [-0.6, 0.32], [0.6, 0.32]]) p(a, 0.21, b, 0.06, 0.42, 0.06, 0x1a1a24);
          p(-0.35, 0.73, 0, 0.16, 0.5, 0.16, 0x1e4a2a); p(-0.35, 1.06, 0, 0.07, 0.18, 0.07, 0xe8c040); p(0.2, 0.62, 0.1, 0.1, 0.28, 0.1, 0xf0e0a0, { glow: true }); p(0.42, 0.62, -0.1, 0.1, 0.28, 0.1, 0xf0e0a0, { glow: true }); }
        // confete caindo devagar
        TH.particles(ctx, 500, { box: [-16, 16, 0, 12, -14, 6], vy: -0.6, size: 0.1, colors: [0xffd34d, 0xff4d8a, 0x4dc8ff, 0x8aff4d, 0xffffff, 0xb04dff], sway: 1.6, swayAmp: 0.5 });
        // fogos de artifício
        const N = 90, tex = TH.dotTex(), cols = [0xffd34d, 0xff4d6d, 0x4dc8ff, 0x8aff6a, 0xff8a1f, 0xd07aff, 0xffffff];
        const bursts = [0, 1, 2, 3, 4].map(() => { const pos = new Float32Array(N * 3), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          const m = new THREE.Points(g, new THREE.PointsMaterial({ map: tex, size: 3.2, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
          m.frustumCulled = false; ctx.sc.add(m); return { m, g, pos, vel: new Float32Array(N * 3), t: -1, o: new THREE.Vector3() }; });
        let next = 0.3;
        const launch = b => { b.t = 0; b.o.set((ctx.R() - 0.5) * 140, 38 + ctx.R() * 34, -140 - ctx.R() * 40); b.m.material.color.setHex(cols[Math.floor(ctx.R() * cols.length)]);
          for (let i = 0; i < N; i++) { const u = ctx.R() * 2 - 1, a = ctx.R() * 6.283, r = Math.sqrt(1 - u * u), sp = 14 + ctx.R() * 4; b.vel[i * 3] = Math.cos(a) * r * sp; b.vel[i * 3 + 1] = u * sp; b.vel[i * 3 + 2] = Math.sin(a) * r * sp * 0.4; } };
        ctx.anim((t, dt) => {
          next -= dt; if (next <= 0) { next = 0.7 + ctx.R() * 1.1; const b = bursts.find(x => x.t < 0); if (b) launch(b); }
          for (const b of bursts) { if (b.t < 0) { b.m.visible = false; continue; } b.t += dt; b.m.visible = true;
            const RISE = 0.9;
            if (b.t < RISE) { const k = b.t / RISE, y = b.o.y - 40 * (1 - k) * (1 - k); for (let i = 0; i < N; i++) { b.pos[i * 3] = b.o.x + (i % 7 - 3) * 0.05; b.pos[i * 3 + 1] = y - (i % 9) * 0.35 * (1 - k); b.pos[i * 3 + 2] = b.o.z; } b.m.material.opacity = 0.9; b.m.material.size = 1.6; }
            else { const e = b.t - RISE, drag = (1 - Math.exp(-e * 2.2)) / 2.2;
              for (let i = 0; i < N; i++) { b.pos[i * 3] = b.o.x + b.vel[i * 3] * drag; b.pos[i * 3 + 1] = b.o.y + b.vel[i * 3 + 1] * drag - 4 * e * e; b.pos[i * 3 + 2] = b.o.z + b.vel[i * 3 + 2] * drag; }
              b.m.material.size = 3.4; b.m.material.opacity = Math.max(0, 1 - e / 2.2) * (0.75 + 0.25 * Math.sin(e * 40)); if (e > 2.3) b.t = -1; }
            b.g.attributes.position.needsUpdate = true; }
        });
      }
    },

    // ===== VERÃO: dia de sol, céu azul, mar no horizonte, deque de madeira, coqueiros, guarda-sol, espreguiçadeiras, boia e pranchas =====
    verao: {
      pal: { top: 0x1f78e0, mid: 0x5ab0f0, hor: 0xd8f0ff, sun: 0xfff6d8, fog: 0xa8d8f8, city: [0x7ea6c8, 0x94b8d8, 0xaecbe6], roof: 0xb89a74, wall: 0xd8d0c0, trim: 0xa89880, warm: 0xffffff },
      fog: [30, 230], sunDir: [0.35, 0.5, -1], disk: 0.9972, windows: 0, sea: 0x2a8ac8, bands: [0xffffff, 0xf4f8ff, 0xffffff, 0xeef4ff], bandAlpha: 0.75,
      light: { hemi: [0xd0e6ff, 0x7a6a50, 0.78], sun: [0xfff0d0, 1.0, 6, 11, 5], front: [0xffffff, 0.18] },
      birds: 'gulls', padColor: '#ffffff', ring: 0x2ad0e0,
      floorPaint(g, w) { // deque de tábuas
        const RR = LS.Tex.rng(13); for (let i = 0; i < 8; i++) { const v = 196 + RR() * 30; g.fillStyle = `rgb(${v},${v * 0.78 | 0},${v * 0.55 | 0})`; g.fillRect(0, i * 32, w, 32);
          g.fillStyle = 'rgba(90,60,30,0.55)'; g.fillRect(0, i * 32 + 30, w, 2); g.fillRect((i * 97) % w, i * 32, 2, 30);
          for (let k = 0; k < 30; k++) { g.fillStyle = 'rgba(120,80,40,0.12)'; g.fillRect(RR() * w, i * 32 + RR() * 28, 18, 1); } }
      },
      bulbs(b, t) { const C = [[1, 0.5, 0.6], [0.4, 0.9, 1], [1, 0.9, 0.4], [0.6, 1, 0.6]], c = C[b.i % 4]; b.m.material.color.setRGB(c[0], c[1], c[2]); },
      decor(ctx) {
        const TH = LS.LobbyThemes;
        const palm = (x, z, h, ry, lean) => { const p = TH.grp(ctx, x, z, ry);
          p(0, 0.35, 0, 1.0, 0.7, 1.0, 0xc8684a); p(0, 0.72, 0, 1.06, 0.06, 1.06, 0xa8543a); // vaso
          const segs = Math.round(h / 0.42); let cx = 0;
          for (let i = 0; i < segs; i++) { cx = Math.sin(i / segs * 1.2) * lean; p(cx, 0.9 + i * 0.42, 0, 0.3 - i * 0.006, 0.44, 0.3 - i * 0.006, i % 2 ? 0x8a6a44 : 0x7a5a38, { rz: -lean * 0.12 }); }
          const top = 0.9 + segs * 0.42;
          for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; p(cx + Math.cos(a) * 0.75, top - 0.12, Math.sin(a) * 0.75, 1.6, 0.06, 0.38, i % 2 ? 0x2a9a3a : 0x34b048, { ry: -a, rz: -0.42 });
            p(cx + Math.cos(a) * 1.45, top - 0.62, Math.sin(a) * 1.45, 0.7, 0.05, 0.32, 0x2a9a3a, { ry: -a, rz: -0.95 }); }
          for (let i = 0; i < 3; i++) p(cx + Math.cos(i * 2.1) * 0.2, top - 0.22, Math.sin(i * 2.1) * 0.2, 0.2, 0.2, 0.2, 0x6a4a2a); };
        palm(-4.6, -7.0, 3.4, 0.3, 0.6); palm(6.2, -7.6, 3.8, -0.6, -0.5);
        // guarda-sol + 2 espreguiçadeiras
        { const x = 4.5, z = -4.3, p = TH.grp(ctx, x, z, -0.4);
          p(0, 1.15, 0, 0.07, 2.3, 0.07, 0xf0f0f0); p(0, 0.05, 0, 0.5, 0.1, 0.5, 0xd0d0d8);
          for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; p(Math.cos(a) * 0.62, 2.18, Math.sin(a) * 0.62, 1.25, 0.05, 0.5, i % 2 ? 0xffffff : 0xff4a4a, { ry: -a, rz: -0.28 + (i % 2) * 0.002 }); }
          p(0, 2.38, 0, 0.14, 0.12, 0.14, 0xff4a4a);
          for (const [dx, c] of [[-0.75, 0x2ad0e0], [0.75, 0xffd040]]) { p(dx, 0.3, 0.6, 0.62, 0.08, 1.3, 0xf4f4f4); p(dx, 0.36, 0.6, 0.56, 0.06, 1.24, c);
            p(dx, 0.62, 1.3, 0.56, 0.06, 0.62, c, { rx: -1.0 }); for (const a of [-0.26, 0.26]) for (const b of [0.05, 1.15]) p(dx + a, 0.14, b, 0.05, 0.28, 0.05, 0xf4f4f4); } }
        // boia (anel de blocos) e bola de praia
        { const x = -3.5, z = -3.7; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; TH.grp(ctx, x + Math.cos(a) * 0.45, z + Math.sin(a) * 0.45, -a)(0, i % 2 ? 0.1 : 0.106, 0, 0.2, i % 2 ? 0.2 : 0.212, 0.3, i % 2 ? 0xffffff : 0xff5a3a); } }
        { const p = TH.grp(ctx, -2.7, -5.2, 0.6); p(0, 0.2, 0, 0.4, 0.4, 0.4, 0xffffff); p(0, 0.2, 0, 0.42, 0.42, 0.14, 0xff4a4a); p(0, 0.2, 0, 0.14, 0.425, 0.42, 0x3a8aff); p(0, 0.2, 0, 0.13, 0.43, 0.13, 0xffd040); }
        // pranchas encostadas no parapeito do fundo
        for (const [x, c, s] of [[1.6, 0x2ad0e0, 0xffffff], [2.5, 0xff8a3a, 0xffffff], [3.3, 0xffd040, 0x2a6ad8]]) { const p = TH.grp(ctx, x, -10.85, 0);
          p(0, 1.05, 0, 0.5, 2.1, 0.08, c, { rx: -0.18 }); p(0, 1.05, 0.0, 0.1, 2.12, 0.1, s, { rx: -0.18 }); }
        // caixa térmica
        { const p = TH.grp(ctx, -5.6, -4.5, 0.2); p(0, 0.28, 0, 0.8, 0.56, 0.5, 0x2a7ad8); p(0, 0.6, 0, 0.84, 0.1, 0.54, 0xf4f4f4); p(0, 0.7, 0, 0.5, 0.06, 0.08, 0xf4f4f4); }
      }
    },

    // ===== FESTA JUNINA: fim de tarde, bandeirinhas, fogueira com faíscas, barraca de quentão e milho, fardos de palha =====
    junina: {
      pal: { top: 0x161236, mid: 0x6a3052, hor: 0xffa058, sun: 0xffd090, fog: 0x7a4054, city: [0x2a1640, 0x4a2458, 0x70345e], roof: 0x8a7462, wall: 0x5a4a48, trim: 0x3a2e30, warm: 0xffc860 },
      fog: [16, 135], stars: 120, windows: 0.16, bands: [0xffa070, 0xe08090, 0xffc090, 0xc07090],
      light: { hemi: [0xd8a0b0, 0x2a2030, 0.75], sun: [0xffb070, 1.1, 6, 7, -10], front: [0xffd8b0, 0.42] },
      padColor: '#ffd040', ring: 0xff5a3a,
      floorPaint(g, w) { // terra batida
        g.fillStyle = '#c8a888'; g.fillRect(0, 0, w, w); const RR = LS.Tex.rng(17);
        for (let i = 0; i < 1600; i++) { const v = 150 + RR() * 70; g.fillStyle = `rgba(${v},${v * 0.8 | 0},${v * 0.62 | 0},0.4)`; g.fillRect(RR() * w, RR() * w, 3, 3); }
      },
      bulbs(b, t) { const f = 0.85 + Math.sin(t * 7 + b.ph * 2) * 0.12; b.m.material.color.setRGB(f, 0.78 * f, 0.38 * f); },
      decor(ctx) {
        const TH = LS.LobbyThemes;
        // bandeirinhas (triângulos coloridos pendurados em cordões)
        { const cols = [0xff3a3a, 0xffd040, 0x3a8aff, 0x3ad06a, 0xff6ad0, 0xff8a1f], pos = [], col = [], c = new THREE.Color(), lines = [];
          const string = (x0, x1, y, z, sag, n) => { const pts = [];
            for (let i = 0; i <= 40; i++) { const k = i / 40; pts.push(new THREE.Vector3(x0 + (x1 - x0) * k, y - Math.sin(k * Math.PI) * sag, z)); }
            lines.push(pts);
            for (let i = 1; i < n; i++) { const k = i / n, x = x0 + (x1 - x0) * k, yy = y - Math.sin(k * Math.PI) * sag; c.setHex(cols[i % cols.length]);
              pos.push(x - 0.17, yy, z, x + 0.17, yy, z, x, yy - 0.42, z); for (let v = 0; v < 3; v++) col.push(c.r, c.g, c.b); } };
          string(-7.5, 7.5, 3.75, -10.15, 0.8, 30); string(-8.2, 8.2, 3.5, -6.6, 0.7, 30); string(-7.6, 7.6, 3.3, -3.4, 0.55, 26);
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
          const fl = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); ctx.sc.add(fl);
          const lm = new THREE.LineBasicMaterial({ color: 0x2a2020 }); lines.forEach(pts => ctx.sc.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm)));
          ctx.anim(t => { fl.rotation.x = Math.sin(t * 1.4) * 0.006; });
          for (const [x, z, h] of [[-8.2, -6.6, 3.5], [8.2, -6.6, 3.5], [-7.6, -3.4, 3.3], [7.6, -3.4, 3.3]]) ctx.S(x, 0, z, 0.14, h, 0.14, 0x5a3a24); }
        // fogueira: pedras, lenha em pirâmide, fogo tremendo, luz e faíscas subindo
        { const x = 4.5, z = -5.0, p = TH.grp(ctx, x, z, 0.2);
          for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; p(Math.cos(a) * 0.78, 0.12, Math.sin(a) * 0.78, 0.3, 0.24 + (i % 3) * 0.04, 0.3, i % 2 ? 0x7a7a84 : 0x6a6a72, { ry: a }); }
          for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; p(Math.cos(a) * 0.24, 0.48, Math.sin(a) * 0.24, 0.14, 1.05, 0.14, i % 2 ? 0x6a4428 : 0x5a3a22, { ry: -a, rz: 0.32 }); }
          const fire = []; const fc = [0xff4a10, 0xff8a1f, 0xffc030, 0xffe070];
          for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), new THREE.MeshBasicMaterial({ color: fc[i % 4], transparent: true, opacity: 0.92 }));
            ctx.sc.add(m); fire.push({ m, a: i / 7 * 6.28, r: i < 4 ? 0.14 : 0.04, ph: i * 1.3 }); }
          const fl = TH.light(ctx, 0xff9a40, 1.8, 8, x, 1.3, z);
          ctx.anim(t => { fire.forEach(f => { const s = 0.7 + Math.abs(Math.sin(t * 9 + f.ph)) * 0.9; f.m.scale.set(1, s, 1); f.m.position.set(x + Math.cos(f.a + t) * f.r, 0.35 + s * 0.15 + (f.r < 0.1 ? 0.3 : 0), z + Math.sin(f.a + t) * f.r); f.m.rotation.y = t * 2 + f.ph; });
            fl.intensity = 1.5 + Math.sin(t * 13) * 0.25 + Math.sin(t * 7.3) * 0.2; });
          TH.particles(ctx, 70, { box: [x - 0.35, x + 0.35, 0.6, 4.2, z - 0.35, z + 0.35], vy: 1.3, size: 0.09, color: 0xffb040, add: true, sway: 3, swayAmp: 0.4 }); }
        // barraca do quentão e do milho
        { const p = TH.grp(ctx, -4.7, -7.2, 0.25);
          for (const [a, b] of [[-1.2, -0.55], [1.2, -0.55], [-1.2, 0.55], [1.2, 0.55]]) p(a, 1.2, b, 0.12, 2.4, 0.12, 0x6a4428);
          p(0, 0.5, 0.45, 2.5, 1.0, 0.3, 0xb07a48); p(0, 1.04, 0.45, 2.62, 0.08, 0.42, 0x8a5a34);
          for (let i = 0; i < 7; i++) p(-1.2 + i * 0.4, 2.52 + (i % 2) * 0.014, 0, 0.4, 0.06, 1.5, i % 2 ? 0xffffff : 0xe83a3a, { rx: 0.2 });
          p(0, 2.2, 0.68, 1.6, 0.36, 0.06, 0xfff0d0);
          for (let i = 0; i < 4; i++) { p(-0.9 + i * 0.22, 1.13, 0.42, 0.12, 0.1, 0.32, 0xffd040, { ry: 0.1 * i }); p(-0.9 + i * 0.22, 1.12, 0.6, 0.13, 0.08, 0.06, 0x6aa040); }
          p(0.65, 1.28, 0.4, 0.42, 0.4, 0.42, 0x3a3a44); p(0.65, 1.5, 0.4, 0.46, 0.05, 0.46, 0x2a2a30); }
        { const sign = TH.spriteTex((g, w, h) => { g.fillStyle = '#fff0d0'; g.fillRect(0, 0, w, h); g.fillStyle = '#c42a2a'; g.font = 'bold 38px "Lilita One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('QUENTÃO • MILHO', w / 2, h / 2 + 2); }, 512, 64);
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.32), new THREE.MeshLambertMaterial({ map: sign })); const a = 0.25;
          pl.position.set(-4.7 + 0.745 * Math.sin(a), 2.2, -7.2 + 0.745 * Math.cos(a)); pl.rotation.y = a; ctx.sc.add(pl); }
        // fardos de palha (cinta saltada pra fora)
        const bale = (x, z, ry) => { const p = TH.grp(ctx, x, z, ry); p(0, 0.3, 0, 1.1, 0.6, 0.6, 0xd8b85a); p(-0.3, 0.3, 0, 0.06, 0.64, 0.64, 0x8a6a2a); p(0.3, 0.3, 0, 0.06, 0.64, 0.64, 0x8a6a2a); };
        bale(3.0, -7.6, 0.3); bale(6.6, -3.9, -0.8); bale(-3.1, -4.4, 0.5);
      }
    },
  },
};
