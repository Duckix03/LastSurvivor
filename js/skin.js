// Visual de personagem em blocos: texturas pixeladas geradas por código (atlas 64x64)
'use strict';
LS.Skin = {
  PX: 1.8 / 32, // tamanho de 1 "pixel" em metros
  SKINS: ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#5c3a21'],
  HAIRS: ['#1a1a1a', '#4a2a10', '#8a5a2a', '#d8b860', '#a0301a', '#e8e8e8', '#3a60c0', '#d040a0'],
  SHIRTS: ['#ff8a1f', '#3a6ea5', '#b03030', '#2d7a3a', '#6a3a9a', '#2a2a2a', '#e0e0e0', '#d0b020', '#c05a8a'],
  PANTS: ['#2a2a3a', '#3a4a2a', '#4a3a2a', '#1f2f6f', '#555555', '#7a5a3a', '#111111'],
  EYES: ['#2a5aa0', '#3a2a1a', '#2a8a3a', '#555555'],
  HAIR_STYLES: ['curto', 'longo', 'careca', 'moicano', 'boné'],
  PATTERNS: ['liso', 'listras', 'zíper', 'camuflado', 'faixa'],
  ACCENTS: ['#2a2a2a', '#f0f0f0', '#c0302a', '#2a5ab0', '#3a5a2a', '#e0a020', '#20d0e0', '#a040e0', '#6a4a2a'],
  BEARDS: ['nenhuma', 'curta', 'cheia', 'bigode'],
  GLASSES: ['nenhum', 'escuros', 'estrela', 'viseira'],
  MASKS: ['nenhuma', 'bandana', 'máscara'],
  HATS: ['nenhum', 'gorro', 'chapéu', 'faixa'],
  TOPS: ['camiseta', 'jaqueta', 'moletom', 'regata', 'colete'],
  // trajes prontos (originais do LAST SURVIVOR)
  PRESETS: {
    'Sobrevivente': { shirt: '#ff8a1f', pattern: 'zíper', top: 'jaqueta', accent: '#2a2a2a', pants: '#2a2a3a', hat: 'nenhum', glasses: 'nenhum', mask: 'nenhuma', beard: 'nenhuma' },
    'Militar': { shirt: '#2d7a3a', pattern: 'camuflado', top: 'colete', accent: '#3a5a2a', pants: '#3a4a2a', hat: 'gorro', glasses: 'escuros', mask: 'nenhuma' },
    'Explorador': { shirt: '#d0b020', pattern: 'liso', top: 'camiseta', accent: '#6a4a2a', pants: '#7a5a3a', hat: 'chapéu', glasses: 'nenhum', mask: 'nenhuma', beard: 'curta' },
    'Neon': { shirt: '#2a2a2a', pattern: 'liso', top: 'moletom', accent: '#a040e0', pants: '#111111', hat: 'nenhum', glasses: 'viseira', mask: 'nenhuma', hairStyle: 'moicano' },
    'Caçador': { shirt: '#b03030', pattern: 'listras', top: 'jaqueta', accent: '#6a4a2a', pants: '#4a3a2a', hat: 'faixa', glasses: 'nenhum', mask: 'bandana' },
    'Urbano': { shirt: '#e0e0e0', pattern: 'faixa', top: 'regata', accent: '#2a5ab0', pants: '#1f2f6f', hat: 'nenhum', glasses: 'estrela', mask: 'nenhuma', beard: 'bigode' }
  },
  // posição de cada parte no atlas: [x, y, largura, altura, profundidade] em pixels
  PARTS: { head: [0, 0, 8, 8, 8], body: [0, 16, 8, 12, 4], arm: [24, 16, 4, 12, 4], leg: [40, 16, 4, 12, 4] },

  randomLook() {
    const p = LS.util.pick;
    const r = (arr, chance) => Math.random() < chance ? p(arr.slice(1)) : arr[0];
    return { skin: p(this.SKINS), hair: p(this.HAIRS), hairStyle: p(this.HAIR_STYLES), eyes: p(this.EYES),
      shirt: p(this.SHIRTS), pattern: p(this.PATTERNS), pants: p(this.PANTS), accent: p(this.ACCENTS),
      beard: r(this.BEARDS, 0.3), glasses: r(this.GLASSES, 0.25), mask: r(this.MASKS, 0.12), hat: r(this.HATS, 0.3), top: p(this.TOPS) };
  },

  // retângulos das 6 faces de uma parte, na ordem das faces do BoxGeometry (+x, -x, +y, -y, +z, -z)
  faceRects(part) {
    const [ox, oy, w, h, d] = this.PARTS[part];
    return [
      [ox + d + w, oy + d, d, h], // +x (lado esquerdo do personagem)
      [ox, oy + d, d, h],         // -x (lado direito)
      [ox + d, oy, w, d],         // topo
      [ox + d + w, oy, w, d],     // base
      [ox + d, oy + d, w, h],     // frente (+z)
      [ox + 2 * d + w, oy + d, w, h] // costas
    ];
  },
  // geometria em caixa com UVs apontando para o atlas (compartilhada por todos)
  geoCache: {},
  geometry(part, pivot) {
    const k = part + pivot;
    if (this.geoCache[k]) return this.geoCache[k];
    const [, , w, h, d] = this.PARTS[part], S = this.PX;
    const g = new THREE.BoxGeometry(w * S, h * S, d * S);
    const uv = g.attributes.uv, rects = this.faceRects(part);
    for (let f = 0; f < 6; f++) {
      const [x0, y0, rw, rh] = rects[f];
      for (let i = 0; i < 4; i++) {
        const idx = f * 4 + i, ix = uv.getX(idx), iy = 1 - uv.getY(idx);
        uv.setXY(idx, (x0 + ix * rw) / 64, 1 - (y0 + iy * rh) / 64);
      }
    }
    if (pivot === 'bottom') g.translate(0, h * S / 2, 0);
    if (pivot === 'top') g.translate(0, -h * S / 2, 0);
    this.geoCache[k] = g;
    return g;
  },

  // fatia de uma parte (linhas y0..y1 da altura, em pixels): braço/antebraço/mão, coxa/canela/pé, tronco de cima/baixo
  slice(part, y0, y1, pivot) {
    const k = part + '_' + y0 + '_' + y1 + pivot;
    if (this.geoCache[k]) return this.geoCache[k];
    const [ox, oy, w, h, d] = this.PARTS[part], S = this.PX, hh = y1 - y0, R = this.faceRects(part);
    const g = new THREE.BoxGeometry(w * S, hh * S, d * S), uv = g.attributes.uv;
    const side = r => [r[0], r[1] + y0, r[2], hh], strip = y => [ox + d, oy + d + y, w, 1]; // corte: mesma cor da frente naquela altura
    const rects = [side(R[0]), side(R[1]), y0 === 0 ? R[2] : strip(y0), y1 === h ? R[3] : strip(y1 - 1), side(R[4]), side(R[5])];
    for (let f = 0; f < 6; f++) {
      const [x0, yy, rw, rh] = rects[f];
      for (let i = 0; i < 4; i++) {
        const id = f * 4 + i, ix = uv.getX(id), iy = 1 - uv.getY(id);
        uv.setXY(id, (x0 + ix * rw) / 64, 1 - (yy + iy * rh) / 64);
      }
    }
    if (pivot === 'bottom') g.translate(0, hh * S / 2, 0);
    if (pivot === 'top') g.translate(0, -hh * S / 2, 0);
    return (this.geoCache[k] = g);
  },

  // ---------- pintura ----------
  paint(canvas, look, seed) {
    const ctx = canvas.getContext('2d');
    let s = seed || 1;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const col = (hex, k) => { const c = new THREE.Color(hex).multiplyScalar(k); c.r = Math.min(1, c.r); c.g = Math.min(1, c.g); c.b = Math.min(1, c.b); return '#' + c.getHexString(); };
    const px = (x, y, hex, noise = 0.1) => { ctx.fillStyle = col(hex, 1 + (rnd() - 0.5) * noise * 2); ctx.fillRect(x, y, 1, 1); };
    const rect = (r, hex, noise, rows) => { // pinta um retângulo de face (rows = [início, fim] opcional)
      const [x0, y0, w, h] = r, a = rows ? rows[0] : 0, b = rows ? rows[1] : h;
      for (let y = a; y < b; y++) for (let x = 0; x < w; x++) px(x0 + x, y0 + y, hex, noise);
    };
    ctx.clearRect(0, 0, 64, 64);
    // ---- cabeça ----
    const H = this.faceRects('head'), F = H[4];
    H.forEach(r => rect(r, look.skin, 0.05));
    const hair = look.hairStyle === 'boné' ? col(look.shirt, 0.7) : look.hair;
    const st = look.hairStyle;
    if (st === 'curto' || st === 'boné' || st === 'black power') {
      rect(H[2], hair, 0.15); rect(F, hair, 0.15, [0, st === 'boné' ? 2 : 1]);
      rect(H[0], hair, 0.15, [0, st === 'boné' ? 2 : 3]); rect(H[1], hair, 0.15, [0, st === 'boné' ? 2 : 3]); rect(H[5], hair, 0.15, [0, st === 'boné' ? 3 : 5]);
      if (st === 'curto') { px(F[0], F[1] + 1, hair); px(F[0] + 7, F[1] + 1, hair); }
    } else if (st === 'longo' || st === 'rabo') {
      rect(H[2], hair, 0.15); rect(F, hair, 0.15, [0, 2]); rect(H[0], hair, 0.15); rect(H[1], hair, 0.15); rect(H[5], hair, 0.15);
      for (let y = 2; y < 8; y++) { px(F[0], F[1] + y, hair); px(F[0] + 7, F[1] + y, hair); }
    } else if (st === 'moicano') {
      for (let y = 0; y < 8; y++) { px(H[2][0] + 3, H[2][1] + y, hair); px(H[2][0] + 4, H[2][1] + y, hair); }
      for (let y = 0; y < 6; y++) { px(H[5][0] + 3, H[5][1] + y, hair); px(H[5][0] + 4, H[5][1] + y, hair); }
      px(F[0] + 3, F[1], hair); px(F[0] + 4, F[1], hair);
    }
    // rosto
    const fy = F[1], fx = F[0];
    if (st !== 'careca') { [1, 2, 5, 6].forEach(x => px(fx + x, fy + 3, col(look.hair, 0.8), 0)); }
    px(fx + 1, fy + 4, '#ffffff', 0); px(fx + 2, fy + 4, look.eyes, 0); px(fx + 5, fy + 4, look.eyes, 0); px(fx + 6, fy + 4, '#ffffff', 0);
    px(fx + 3, fy + 5, col(look.skin, 0.85), 0); px(fx + 4, fy + 5, col(look.skin, 0.85), 0);
    [2, 3, 4, 5].forEach(x => px(fx + x, fy + 6, col(look.skin, 0.6), 0));
    const acc = look.accent || '#2a2a2a', bc = look.hair;
    if (look.beard === 'curta') { for (let x = 0; x < 8; x++) { if (rnd() < 0.7) px(fx + x, fy + 7, bc, 0.25); } [0, 1, 6, 7].forEach(x => px(fx + x, fy + 6, bc, 0.25)); }
    else if (look.beard === 'cheia') { for (let y = 5; y < 8; y++) for (let x = 0; x < 8; x++) { if (y === 6 && x >= 2 && x <= 5) continue; px(fx + x, fy + y, bc, 0.15); } [H[0], H[1]].forEach(r => rect(r, bc, 0.15, [5, 8])); }
    else if (look.beard === 'bigode') [2, 3, 4, 5].forEach(x => px(fx + x, fy + 5, bc, 0.1));
    else if (look.beard === 'mago' || look.beard === 'gelo') { const c2 = look.beard === 'mago' ? '#f4f4f0' : '#a8e8ff'; for (let y = 5; y < 8; y++) for (let x = 0; x < 8; x++) { if (y === 6 && x >= 2 && x <= 5) continue; px(fx + x, fy + y, c2, 0.06); } [H[0], H[1]].forEach(r => rect(r, c2, 0.06, [5, 8])); }
    if (look.mask === 'bandana') { for (let y = 5; y < 8; y++) for (let x = 0; x < 8; x++) px(fx + x, fy + y, (x + y) % 3 === 0 ? '#f0f0f0' : acc, 0.08); [H[0], H[1]].forEach(r => rect(r, acc, 0.08, [5, 7])); }
    else if (look.mask === 'caveira') {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px(fx + x, fy + y, '#ece6d6', 0.05);
      [H[0], H[1]].forEach(r => rect(r, '#ddd6c4', 0.06, [2, 8]));
      [[1, 3], [2, 3], [1, 4], [2, 4], [5, 3], [6, 3], [5, 4], [6, 4]].forEach(([x, y]) => px(fx + x, fy + y, '#141414', 0));
      px(fx + 3, fy + 5, '#2a2a2a', 0); px(fx + 4, fy + 5, '#2a2a2a', 0);
      for (let x = 1; x < 7; x++) { px(fx + x, fy + 6, '#2a2a2a', 0); px(fx + x, fy + 7, x % 2 ? '#f4f0e4' : '#2a2a2a', 0); }
    }
    else if (look.mask === 'ninja') {
      const nj = '#16171b';
      [H[0], H[1], H[2], H[5]].forEach(r => rect(r, nj, 0.08));
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (y < 3 || y > 4) px(fx + x, fy + y, nj, 0.08);
      px(fx + 1, fy + 4, '#ffffff', 0); px(fx + 2, fy + 4, look.eyes, 0); px(fx + 5, fy + 4, look.eyes, 0); px(fx + 6, fy + 4, '#ffffff', 0);
      rect([fx, fy + 2, 8, 1], acc, 0.05);
    }
    else if (look.mask === 'gás') { for (let y = 5; y < 8; y++) for (let x = 0; x < 8; x++) px(fx + x, fy + y, '#33363b', 0.08); [H[0], H[1]].forEach(r => rect(r, '#2a2a2a', 0.05, [5, 6])); }
    else if (look.mask === 'sorriso') {
      for (let y = 5; y < 8; y++) for (let x = 0; x < 8; x++) px(fx + x, fy + y, '#111114', 0.05);
      [[1, 5], [6, 5], [2, 6], [3, 6], [4, 6], [5, 6]].forEach(([x, y]) => px(fx + x, fy + y, '#20f0ff', 0));
    }
    else if (look.mask === 'floco') { // Frost Reaper: máscara preta com um floco de neve
      for (let y = 5; y < 8; y++) for (let x = 0; x < 8; x++) px(fx + x, fy + y, '#111114', 0.05);
      [H[0], H[1]].forEach(r => rect(r, '#111114', 0.05, [5, 8]));
      [[4, 5], [3, 6], [4, 6], [5, 6], [4, 7]].forEach(([x, y]) => px(fx + x, fy + y, '#ffffff', 0));
      [[3, 5], [5, 5], [3, 7], [5, 7]].forEach(([x, y]) => px(fx + x, fy + y, '#a8d8ff', 0));
    }
    else if (look.mask === 'máscara') { for (let y = 5; y < 8; y++) for (let x = 0; x < 8; x++) px(fx + x, fy + y, '#3a3d42', 0.08); px(fx + 2, fy + 6, '#1a1a1a', 0); px(fx + 5, fy + 6, '#1a1a1a', 0); }
    if (look.glasses === 'escuros') [1, 2, 5, 6].forEach(x => px(fx + x, fy + 4, '#101010', 0)); // o resto é 3D (lentes redondas)
    else if (look.glasses === 'cyber') { for (let x = 0; x < 8; x++) px(fx + x, fy + 4, '#20f0ff', 0); [H[0], H[1]].forEach(r => rect(r, '#20f0ff', 0, [4, 5])); }
    else if (look.glasses === 'coração') { [1, 2, 5, 6].forEach(x => px(fx + x, fy + 3, '#ff6aa8', 0)); [0, 1, 2, 5, 6, 7].forEach(x => px(fx + x, fy + 4, '#ff3d8a', 0)); [3, 4].forEach(x => px(fx + x, fy + 4, '#c02060', 0)); [1, 6].forEach(x => px(fx + x, fy + 5, '#ff3d8a', 0)); }
    else if (look.glasses === 'aviador') { for (let x = 0; x < 8; x++) px(fx + x, fy + 3, '#d8b050', 0); [1, 2, 5, 6].forEach(x => px(fx + x, fy + 4, '#3a2a10', 0)); }
    else if (look.glasses === 'fogo') { [1, 2, 5, 6].forEach(x => px(fx + x, fy + 4, x === 2 || x === 5 ? '#ffe14a' : '#ff7a1a', 0)); }
    else if (look.glasses === 'matrix') { for (let x = 0; x < 8; x++) px(fx + x, fy + 4, x % 2 ? '#3dff6a' : '#1a8a3a', 0); [H[0], H[1]].forEach(r => rect(r, '#3dff6a', 0, [4, 5])); }
    else if (look.glasses === 'viseira') { for (let x = 0; x < 8; x++) px(fx + x, fy + 4, acc, 0.05); [H[0], H[1]].forEach(r => rect(r, '#202020', 0.05, [4, 5])); }
    // ---- corpo ----
    const B = this.faceRects('body');
    B.forEach(r => rect(r, look.shirt, 0.06));
    const front = B[4];
    if (look.pattern === 'listras') [B[0], B[1], B[4], B[5]].forEach(r => { for (let y = 1; y < r[3] - 1; y += 3) rect(r, col(look.shirt, 1.35), 0.04, [y, y + 1]); });
    else if (look.pattern === 'zíper') { for (let y = 0; y < 11; y++) { px(front[0] + 3, front[1] + y, col(look.shirt, 0.6), 0); px(front[0] + 4, front[1] + y, col(look.shirt, 0.6), 0); } px(front[0] + 4, front[1] + 1, '#c0c0c0', 0); }
    else if (look.pattern === 'camuflado') B.forEach(r => { for (let i = 0; i < r[2] * r[3] / 4; i++) { const x = Math.floor(rnd() * r[2]), y = Math.floor(rnd() * r[3]); const c = rnd() < 0.5 ? 0.7 : 1.25; px(r[0] + x, r[1] + y, col(look.shirt, c)); if (x + 1 < r[2]) px(r[0] + x + 1, r[1] + y, col(look.shirt, c)); } });
    else if (look.pattern === 'xadrez') B.forEach(r => { for (let y = 0; y < r[3]; y++) for (let x = 0; x < r[2]; x++) if ((Math.floor(x / 2) + Math.floor(y / 2)) % 2) px(r[0] + x, r[1] + y, col(look.shirt, 0.62), 0.05); });
    else if (look.pattern === 'tigre') [B[0], B[1], B[4], B[5]].forEach(r => { for (let i = 0; i < 4; i++) { const y0 = 1 + i * 3; for (let x = 0; x < r[2]; x++) { const y = y0 + Math.round(Math.sin(x * 1.3 + i) * 0.8); if (rnd() < 0.85) px(r[0] + x, r[1] + Math.max(0, Math.min(r[3] - 1, y)), '#16120e', 0.1); } } });
    else if (look.pattern === 'chamas') [B[0], B[1], B[4], B[5]].forEach(r => { for (let x = 0; x < r[2]; x++) { const h = 3 + Math.floor(rnd() * 5); for (let y = 0; y < h; y++) px(r[0] + x, r[1] + r[3] - 2 - y, y > h - 2 ? '#ffe14a' : y > h * 0.5 ? '#ff8a1f' : '#e0301a', 0.08); } });
    else if (look.pattern === 'galáxia') B.forEach(r => { for (let y = 0; y < r[3]; y++) for (let x = 0; x < r[2]; x++) { const v = rnd(); px(r[0] + x, r[1] + y, v < 0.08 ? '#ffffff' : v < 0.3 ? '#5a2a9a' : v < 0.45 ? '#2a3a8a' : '#120f2a', 0.1); } });
    else if (look.pattern === 'glitch') B.forEach(r => { for (let y = 0; y < r[3]; y++) { const line = rnd(); for (let x = 0; x < r[2]; x++) { const v = rnd(); px(r[0] + x, r[1] + y, line < 0.18 && v < 0.8 ? (line < 0.09 ? '#ff2bd6' : '#2ee6ff') : v < 0.05 ? '#ffffff' : '#15141e', 0.06); } } });
    else if (look.pattern === 'circuito') B.forEach(r => { for (let y = 0; y < r[3]; y++) for (let x = 0; x < r[2]; x++) px(r[0] + x, r[1] + y, '#0d1a12', 0.05);
      for (let i = 0; i < r[2] * r[3] / 10; i++) { let x = Math.floor(rnd() * r[2]), y = Math.floor(rnd() * r[3]); const n = 2 + Math.floor(rnd() * 4), hz = rnd() < 0.5;
        for (let k = 0; k < n; k++) { if (x >= 0 && x < r[2] && y >= 0 && y < r[3]) px(r[0] + x, r[1] + y, '#2fd46a', 0); hz ? x++ : y++; }
        if (x >= 0 && x < r[2] && y >= 0 && y < r[3]) px(r[0] + x, r[1] + y, '#c8ffd8', 0); } });
    else if (look.pattern === 'diamante') B.forEach(r => { for (let y = 0; y < r[3]; y++) for (let x = 0; x < r[2]; x++) { const a = (x + y) % 4, b = ((x - y) % 4 + 4) % 4;
      px(r[0] + x, r[1] + y, a === 0 && b === 0 ? '#ffffff' : a === 0 || b === 0 ? '#5ae8ff' : '#123a5a', 0.05); } });
    else if (look.pattern === 'escamas') { // dino: escamas verdes e barriga clara listrada
      B.forEach(r => { for (let y = 0; y < r[3]; y++) for (let x = 0; x < r[2]; x++) px(r[0] + x, r[1] + y, (x + (y % 2) * 1) % 2 === 0 && y % 2 === 0 ? '#2f7a2c' : '#3f9a3a', 0.08); });
      for (let y = 2; y < 12; y++) for (let x = 2; x < 6; x++) px(front[0] + x, front[1] + y, y % 2 ? '#d8e07a' : '#c6ce62', 0.04);
    }
    else if (look.pattern === 'estrela') { // Frost Reaper: camisa escura com corrente e estrela dourada
      [[1, 0], [2, 1], [3, 2], [4, 2], [5, 1], [6, 0]].forEach(([x, y]) => px(front[0] + x, front[1] + y, '#e8b830', 0));
      [[3, 3], [4, 3], [2, 4], [3, 4], [4, 4], [5, 4], [3, 5], [4, 5]].forEach(([x, y]) => px(front[0] + x, front[1] + y, (x === 3 && y === 3) ? '#fff2a0' : '#ffd23a', 0));
      [[2, 6], [5, 6]].forEach(([x, y]) => px(front[0] + x, front[1] + y, '#c89418', 0));
    }
    else if (look.pattern === 'raio') { [[4, 0], [3, 1], [3, 2], [2, 3], [2, 4], [3, 4], [4, 4], [5, 4], [4, 5], [4, 6], [3, 7], [3, 8], [2, 9]].forEach(([x, y]) => { px(front[0] + x, front[1] + y, '#ffe14a', 0); if (x + 1 < 8) px(front[0] + x + 1, front[1] + y, '#ffc020', 0); }); }
    else if (look.pattern === 'faixa') { for (let y = 0; y < 11; y++) { const x = Math.floor(y * 8 / 11); px(front[0] + x, front[1] + y, '#f0f0f0'); if (x + 1 < 8) px(front[0] + x + 1, front[1] + y, '#f0f0f0'); } }
    const top = look.top || 'camiseta';
    if (top === 'jaqueta' || top === 'moletom') {
      [B[0], B[1], B[5]].forEach(r => rect(r, acc, 0.07)); rect(B[2], acc, 0.07);
      for (let y = 0; y < 12; y++) for (let x = 0; x < 8; x++) { const open = top === 'jaqueta' && x >= 3 && x <= 4; if (!open) px(front[0] + x, front[1] + y, acc, 0.07); }
      if (top === 'moletom') { rect([front[0] + 2, front[1] + 7, 4, 2], col(acc, 0.8), 0.05); rect(H[5], col(acc, 0.85), 0.07, [4, 8]); }
      else { px(front[0] + 2, front[1] + 1, col(acc, 0.6), 0); px(front[0] + 5, front[1] + 1, col(acc, 0.6), 0); }
    } else if (top === 'colete') {
      [B[4], B[5]].forEach(r => { for (let y = 1; y < 10; y++) for (let x = 0; x < 8; x++) if (x < 3 || x > 4 || r === B[5]) px(r[0] + x, r[1] + y, col(acc, 0.9), 0.08); });
      rect([front[0], front[1] + 5, 3, 2], col(acc, 0.65), 0.05); rect([front[0] + 5, front[1] + 5, 3, 2], col(acc, 0.65), 0.05);
    } else if (top === 'terno') {
      const dk = '#23262d'; [B[0], B[1], B[5]].forEach(r => rect(r, dk, 0.05)); rect(B[2], dk, 0.05);
      for (let y = 0; y < 12; y++) for (let x = 0; x < 8; x++) { const v = x >= 3 - (y < 2 ? 1 : 0) && x <= 4 + (y < 2 ? 1 : 0) && y < 6; px(front[0] + x, front[1] + y, v ? '#f2f2f2' : (x === 2 || x === 5) && y < 5 ? col(dk, 1.4) : dk, 0.05); }
      for (let y = 1; y < 6; y++) { px(front[0] + 3, front[1] + y, look.shirt, 0.03); px(front[0] + 4, front[1] + y, col(look.shirt, 0.85), 0.03); }
      px(front[0] + 6, front[1] + 3, '#f2f2f2', 0);
    } else if (top === 'kimono') {
      for (let y = 0; y < 9; y++) { const x = Math.min(7, Math.floor(y * 0.9)); px(front[0] + x, front[1] + y, '#f4efe4', 0.03); if (x + 1 < 8) px(front[0] + x + 1, front[1] + y, '#e2dccf', 0.03); }
      [B[0], B[1], B[4], B[5]].forEach(r => rect(r, acc, 0.06, [7, 9]));
    } else if (top === 'armadura') {
      const mt = '#8a9099'; B.forEach(r => rect(r, mt, 0.07));
      [B[0], B[1], B[4], B[5]].forEach(r => { rect(r, col(mt, 0.7), 0.03, [4, 5]); rect(r, col(mt, 0.7), 0.03, [8, 9]); rect(r, acc, 0.04, [0, 1]); });
      rect([front[0] + 2, front[1] + 1, 4, 3], col(mt, 1.25), 0.05); px(front[0] + 3, front[1] + 2, acc, 0); px(front[0] + 4, front[1] + 2, acc, 0);
    } else if (top === 'couro') {
      const lt = '#1c1c1f'; [B[0], B[1], B[5]].forEach(r => rect(r, lt, 0.08)); rect(B[2], lt, 0.08);
      for (let y = 0; y < 12; y++) for (let x = 0; x < 8; x++) { const open = x >= 3 && x <= 4 && y < 9; if (!open) px(front[0] + x, front[1] + y, lt, 0.08); }
      for (let y = 0; y < 11; y++) px(front[0] + (y < 9 ? 5 : 4), front[1] + y, '#c8c8cc', 0);
      rect([front[0], front[1], 3, 2], col(lt, 1.6), 0.05); rect([front[0] + 5, front[1], 3, 2], col(lt, 1.6), 0.05);
    } else if (top === 'natal') { // Frost Reaper: jaqueta vermelha aberta, pelinho branco nas bordas e flocos de neve
      const rd = '#c8182a', fur = '#f4f4f4';
      const flake = (r, cx, cy) => { [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]].forEach(([dx, dy]) => { const x = cx + dx, y = cy + dy; if (x >= 0 && x < r[2] && y >= 0 && y < r[3]) px(r[0] + x, r[1] + y, '#ffffff', 0); }); };
      [B[0], B[1], B[5]].forEach(r => rect(r, rd, 0.07)); rect(B[2], rd, 0.07);
      for (let y = 0; y < 11; y++) for (let x = 0; x < 8; x++) { const open = x >= 3 && x <= 4 && y < 10; if (!open) px(front[0] + x, front[1] + y, (x === 2 || x === 5) && y < 10 ? fur : rd, x === 2 || x === 5 ? 0.03 : 0.07); }
      for (let x = 0; x < 8; x++) if (x < 3 || x > 4) px(front[0] + x, front[1], fur, 0.03); // gola
      [B[0], B[1], B[4], B[5]].forEach(r => rect(r, fur, 0.03, [10, 11])); rect(B[2], fur, 0.03); // barra e ombros de pelinho
      flake(front, 0, 6); flake(front, 7, 3); flake(B[5], 2, 3); flake(B[5], 5, 7); flake(B[0], 1, 5); flake(B[1], 2, 7);
    } else if (top === 'regata') { [B[0], B[1]].forEach(r => rect(r, look.skin, 0.05, [0, 2])); rect([front[0], front[1], 2, 2], look.skin, 0.05); rect([front[0] + 6, front[1], 2, 2], look.skin, 0.05); }
    [B[0], B[1], B[4], B[5]].forEach(r => rect(r, '#3a2412', 0.1, [11, 12])); // cinto
    // ---- braços ----
    const A = this.faceRects('arm');
    const SLV = { jaqueta: acc, moletom: acc, terno: '#23262d', kimono: look.shirt, armadura: '#8a9099', couro: '#1c1c1f', natal: '#c8182a' }; // roupas de manga comprida
    const longS = !!SLV[top], sleeve = longS ? SLV[top] : look.shirt, sl = top === 'regata' ? 0 : longS ? 10 : 4;
    A.forEach((r, i) => { if (i === 2) rect(r, sl ? sleeve : look.skin, 0.06); else if (i === 3) rect(r, look.skin, 0.05); else { rect(r, sleeve, 0.06, [0, sl]); rect(r, look.skin, 0.05, [sl, 12]); } });
    if (top === 'natal') A.forEach((r, i) => { // punho de pelinho, floco na manga e luva preta sem dedos
      if (i === 3) { rect(r, '#141416', 0.05); return; } if (i === 2) return;
      rect(r, '#f4f4f4', 0.03, [8, 10]); rect(r, '#141416', 0.05, [10, 12]); px(r[0] + 1, r[1] + 11, look.skin, 0.03); px(r[0] + 2, r[1] + 11, look.skin, 0.03);
      if (i === 4 || i === 0) { px(r[0] + 1, r[1] + 3, '#ffffff', 0); px(r[0] + 2, r[1] + 4, '#ffffff', 0); px(r[0] + 1, r[1] + 5, '#ffffff', 0); px(r[0] + 2, r[1] + 3, '#a8d8ff', 0); }
    });
    // ---- pernas ----
    const L = this.faceRects('leg');
    L.forEach((r, i) => { if (i === 2) rect(r, look.pants, 0.06); else if (i === 3) rect(r, '#1c1c1c', 0.1); else { rect(r, look.pants, 0.06, [0, 10]); rect(r, '#1c1c1c', 0.12, [10, 12]); } });
    const lg = look.legs || 'lisa', sides = [L[0], L[1], L[4], L[5]];
    if (lg === 'rasgada') { [L[4], L[5]].forEach(r => { rect([r[0] + 1, r[1] + 5, 2, 1], look.skin, 0.05); px(r[0] + 1, r[1] + 6, look.skin, 0.05); px(r[0] + 2, r[1] + 2, col(look.pants, 1.4), 0.05); px(r[0] + 1, r[1] + 8, col(look.pants, 1.35), 0.05); }); }
    else if (lg === 'listra') [L[0], L[1]].forEach(r => { for (let y = 0; y < 10; y++) { px(r[0] + 1, r[1] + y, '#f0f0f0', 0.03); px(r[0] + 2, r[1] + y, '#f0f0f0', 0.03); } });
    else if (lg === 'camuflada') sides.forEach(r => { for (let i = 0; i < 14; i++) { const x = Math.floor(rnd() * r[2]), y = Math.floor(rnd() * 10); px(r[0] + x, r[1] + y, col(look.pants, rnd() < 0.5 ? 0.6 : 1.4), 0.05); } });
    else if (lg === 'natal') { // Frost Reaper: faixa vermelha do lado, floco na coxa e tênis vermelho e branco com pelinho
      [L[0], L[1]].forEach(r => { for (let y = 0; y < 9; y++) { px(r[0] + 1, r[1] + y, '#c8182a', 0.04); px(r[0] + 2, r[1] + y, '#c8182a', 0.04); } });
      [L[4]].forEach(r => { [[1, 3], [0, 4], [1, 4], [2, 4], [1, 5]].forEach(([x, y]) => px(r[0] + x, r[1] + y, '#ffffff', 0)); });
      sides.forEach(r => { rect(r, '#f4f4f4', 0.03, [9, 10]); rect(r, '#c8182a', 0.05, [10, 11]); rect(r, '#f4f4f4', 0.03, [11, 12]); });
      [L[4]].forEach(r => px(r[0] + 1, r[1] + 10, '#ffd23a', 0)); rect(L[3], '#f4f4f4', 0.03);
    }
    else if (lg === 'chamas') sides.forEach(r => { for (let x = 0; x < r[2]; x++) { const h = 2 + Math.floor(rnd() * 4); for (let y = 0; y < h; y++) px(r[0] + x, r[1] + 9 - y, y > h - 2 ? '#ffe14a' : y > h * 0.5 ? '#ff8a1f' : '#e0301a', 0.06); } });
  },
  makeTexture(look, seed) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    this.paint(cv, look, seed);
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.userData = { canvas: cv };
    return t;
  }
};

// perfil do jogador (nome + visual), salvo no navegador
LS.defaultProfile = { name: 'Jogador', look: { skin: '#e0ac69', hair: '#1a1a1a', hairStyle: 'curto', eyes: '#3a2a1a', shirt: '#ff8a1f', pattern: 'zíper', pants: '#2a2a3a', accent: '#2a2a2a', beard: 'nenhuma', glasses: 'nenhum', mask: 'nenhuma', hat: 'nenhum', top: 'camiseta' } };
LS.playerProfile = JSON.parse(JSON.stringify(LS.defaultProfile));
try {
  const p = JSON.parse(localStorage.getItem('lastsurvivor_profile') || 'null');
  if (p && p.look) {
    const look = Object.assign(LS.playerProfile.look, p.look);
    Object.assign(LS.playerProfile, p, { look, name: String(p.name || 'Jogador').slice(0, 16) }); // nome, visual, arma do lobby, ID, curtidas, recado, foto...
  }
} catch (e) { /* perfil corrompido: usa o padrão */ }
LS.saveProfile = () => localStorage.setItem('lastsurvivor_profile', JSON.stringify(LS.playerProfile));
