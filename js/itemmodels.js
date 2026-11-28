// Modelos 3D em blocos dos itens: 10 armas, munições, cura e equipamentos (colete, capacete, mochila nv. 1-3).
// Cada modelo é UMA malha (caixas fundidas com cor por vértice): detalhado e barato (1 draw call por item).
// Peça = [x, y, z, largura, altura, profundidade, cor, rotX, rotY, rotZ] com (x,y,z) = centro da caixa.
'use strict';
// marca uma peça como móvel (pente, ferrolho, bomba, alavanca): vira uma malha separada na mão do personagem
const T = (tag, part) => { part.tag = tag; return part; };
LS.Items = {
  _mat: null, _geo: {},
  material() { return this._mat || (this._mat = new THREE.MeshLambertMaterial({ vertexColors: true })); },
  RARITY_NAMES: ['Comum', 'Incomum', 'Raro', 'Lendário'],

  // funde as peças numa geometria só (unit converte "pixels" do personagem em metros)
  merge(parts, unit = 1) {
    const pos = [], nor = [], col = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(), one = new THREE.Vector3(1, 1, 1);
    for (const p of parts) {
      // índices em vez de "const [x, ..., rx = 0] = p": essa desestruturação com valor padrão quebra no Safari/iPhone
      // (bug do JavaScriptCore: "undefined is not a function" depois de rodar muitas vezes) e deixava o lobby preto
      const x = p[0], y = p[1], z = p[2], w = p[3], h = p[4], d = p[5], color = p[6], rx = p[7] || 0, ry = p[8] || 0, rz = p[9] || 0;
      const g = new THREE.BoxGeometry(w * unit, h * unit, d * unit).toNonIndexed();
      m.compose(new THREE.Vector3(x * unit, y * unit, z * unit), q.setFromEuler(e.set(rx, ry, rz)), one);
      g.applyMatrix4(m);
      c.setHex(color);
      const P = g.attributes.position.array, N = g.attributes.normal.array;
      for (let i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(N[i]); }
      for (let i = 0; i < P.length / 3; i++) col.push(c.r, c.g, c.b);
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    return geo;
  },
  // geometria em cache; center = recentraliza (versão "no chão")
  geometry(key, build, unit, center) {
    const k = key + (center ? '@c' : '');
    if (!this._geo[k]) {
      const g = this.merge(build(), unit);
      if (center) { const bb = g.boundingBox, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2; g.translate(-cx, -bb.min.y, -cz); g.computeBoundingBox(); g.computeBoundingSphere(); }
      this._geo[k] = g;
    }
    return this._geo[k];
  },
  mesh(geo) { const m = new THREE.Mesh(geo, this.material()); m.castShadow = true; return m; },

  // ---------------- armas (z = cano para frente, origem = mão no punho) ----------------
  GUNS: {
    // M1911: ferrolho de aço com serrilhado e janela, cão, cabo de madeira quadriculado com parafusos dourados
    m1911: { vox: {
      vs: 0.0072, o: [6, 8], muzzle: [30, 11],
      key: { Q: [2, 0x111111], a: [4, 0x5c5d62], A: [5, 0x4e4f54], s: [5.4, 0x2e2f33], E: [4.2, 0x1c1c1e], O: [2.6, 0x0a0a0a], F: [5, 0x3e3f43], h: [3, 0x1e1e20], W: [5.4, 0x7a5230], w: [5.8, 0x5a3a1e], Y: [6.2, 0xc8a050], U: [2, 0x34353a], r: [1.2, 0x111111], B: [5, 0x1e1e1e, 'mag'] },
      rows: [
        '..Q.......................QQ..',
        '..aaaaaaaaaaaaaaaaaaaaaaaaaaa.',
        '.hAsAsAAAAAAAAAAAEEEEEAAAAAAAO',
        'hhAsAsAAAAAAAAAAAEEEEEAAAAAAAO',
        'hhAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        '.hFFFFFFFFFFFFFFFFFFFFFFFFFF..',
        '...WWWWWWFFr...UFF............',
        '...WYwwwW..r...U..............',
        '...WwwwwWUUUUUUU..............',
        '..WwwwwwW.....................',
        '..WwwYwwW.....................',
        '..WWWWWWW.....................',
        '.WWWWWWW......................',
        '.BBBBBBB......................'] } },
    // Desert Eagle (baseada no modelo do Duckix03): ferrolho prata com trilho em cima, serrilhado, janela de ejeção, cão e cabo preto texturizado
    deagle: { vox: { vs: 0.0071, o: [8.5, 14], muzzle: [41, 17.5], key: {
        Q: [2, 0x1a1a1a], a: [4, 0xd8d9dd], A: [6, 0xc4c5c9], s: [6.5, 0x8a8b8f], E: [4.6, 0x2a2a2c], O: [3, 0x0a0a0a], h: [4, 0x2a2a2a],
        F: [5.4, 0x9c9da2], U: [2, 0xa8a9ad], r: [1, 0x1a1a1a], G: [6, 0x1e1e1e], g: [6.5, 0x141414], Y: [6.7, 0xb8b9bd], B: [6, 0x2c2c2e, 'mag'] },
      rows: [
        '......QQ..............................QQ.',
        '.....aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '....AAsAsAsAAAAAAAAAAAEEEEEEEEEAAAAAAAAAA',
        '.hhhAAsAsAsAAAAAAAAAAAEEEEEEEEEAAAAAAAAAA',
        '..hhAAsAsAsAAAAAAAAAAAEEEEEEEEEAAAAAAAAAO',
        '..hhAAsAsAsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAO',
        '...hAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        '..hhFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF.',
        'hhhhFFFFFFFFFFFFFFFFFFFF.................',
        '....GGGGGGGGGGUUUUUUUUU..................',
        '.....GGGGGGGGGUUUr..UU...................',
        '.....ggggggggGUUUr..UU...................',
        '.....YYGGGGGGGUUUUUUUU...................',
        '....GGGGGGGGGGUUUUUUUU...................',
        '....GggggggggG...........................',
        '....GGGGGGGGGG...........................',
        '...GGGGGGGGGGG...........................',
        '...GGYYggggggG...........................',
        '...GGGGGGGGGGG...........................',
        '...GGGGGGGGGG............................',
        '..GGGggggggggG...........................',
        '..BBBBBBBBBBBB...........................',
        '...BBBBBBBBBBB...........................'] } },
    // MP5: coronha fixa vazada, tambor de mira, tubo do ferrolho por cima, guarda-mão com nervuras e carregador curvo
    mp5: { vox: {
      vs: 0.016, o: [15, 11], muzzle: [45, 15],
      key: { P: [3, 0x141414], S: [3, 0x1e1e1e], R: [4, 0x2c2c2e], r: [3, 0x3a3a3c], E: [3.3, 0x121213], Q: [2, 0x151515], C: [2.4, 0x262628], H: [4.4, 0x202022], h: [4.8, 0x151516], L: [2, 0x3a3b3f], Z: [3, 0x2a2a2c], G: [4, 0x1b1b1c], g: [4.4, 0x121213], U: [2, 0x1e1e1e], t: [1, 0x0c0c0c], M: [3, 0x2a2a2c, 'mag'], m: [3.4, 0x1c1c1e, 'mag'], B: [3.6, 0x141414, 'mag'], X: [2, 0x111111] },
      rows: [
        '.............QQQQ...................QQQQ.....',
        '.............QQQQ.....CCCCCCCCCCCCCCCQQ......',
        '...........rrrrrrrrrrrrrrrrrrrrrrrCCCQQ...ZZZ',
        'PPSSSSSSSSSRRRRRRRRRRRRRRRRRRRRRRRLLLLLLLLZZZ',
        'PPSSSSSSSSSRRRRRRREEEEEEERRRRRRRRRLLLLLLLLZZZ',
        'PPSS.....SSRRRRRRREEEEEEERRRRRRRRR........ZZZ',
        'PPSS.....SSRRRRRRRRRRRRRRRRRRRRRRR...........',
        'PPSS.....SSRRRRRRRRRRRRRRRHhHhHhHXX..........',
        'PPSS.....SS..RRRR.t...UMMMMhHhHhHXX..........',
        'PPSSSSSSSSS..GGGGGt...UMMMM..................',
        'PPSSSSSSSSS..ggggGt...U.mmmm.................',
        '.............GGGGUUUUUU.MMMM.................',
        '.............GGGGG......MMMM.................',
        '............ggggG........mmmm................',
        '............GGGGG........MMMM................',
        '............ggggG........MMMM................',
        '..........................mmmm...............',
        '..........................MMMM...............',
        '...........................BBBB..............'] } },
    // UMP45 (baseada no modelo de referência): polímero preto, trilho com dentes, janela de ejeção, ventilação no guarda-mão,
    // carregador reto comprido com nervuras, cabo inclinado e coronha esqueletada
    ump: { vox: { vs: 0.0187, o: [18, 14], muzzle: [46, 16.5], key: {
        Q: [1.2, 0x141414], T: [2, 0x18191b], t: [2, 0x0b0b0c], D: [4, 0x1f2023], R: [4, 0x2b2c2f], K: [4.6, 0x1a1b1d], E: [3.3, 0x0e0e0f],
        V: [3.3, 0x111112], L: [2, 0x3d3f43], Z: [2.7, 0x232425], X: [2, 0x161616], S: [2, 0x1d1e21], P: [3, 0x121212],
        G: [4, 0x1e1f22], g: [4.4, 0x151618], U: [2, 0x1d1e21], r: [1, 0x0c0c0c], M: [3, 0x26272a, 'mag'], m: [3.4, 0x1a1b1d, 'mag'], B: [3.8, 0x121212, 'mag'] },
      rows: [
        '.................QQ....................QQ.....',
        '...............tTtTtTtTtTtTtTtTt......QQQ.....',
        '..............DDDDDDDDDDDDDDDDDDDDDDDDDDD.....',
        'PPSSSSSSSSSSSSKKKKRRRRRRRRRRRRRRRRRRRRRRR.....',
        'PPSSSSSSSSSSSSKKKKRRREEEEEEERRRRVRVRVRVRRLLLZZ',
        'PP....SS.SSSSSKKKKRRREEEEEEERRRRVRVRVRVRRLLLZZ',
        'PP....SSSSSSSSKKKKRRRRRRRRRRRRRRRRRRRRRRRLLLZZ',
        'PP....SSSSSS....DDDDDDDDDDDDDDDDDDDDDDDXX.....',
        'PP.SSSSSS........DDDDDDDDDMMMMM.........X.....',
        'PPSSSS..........GGGGUr..UUMMMMM...............',
        'PPS.............GGGGUUUUUUMMMMM...............',
        '...............gggggg......mmmm...............',
        '...............GGGGG.......MMMM...............',
        '...............gggg........MMMM...............',
        '...............GGGG.........mmmm..............',
        '............................MMMM..............',
        '............................MMMM..............',
        '............................mmmm..............',
        '............................MMMM..............',
        '.............................MMM..............',
        '.............................BBBB.............',
        '.............................BBBB.............'] } },
    // AK-47: madeira (coronha, guarda-mão e cabo), tampa da caixa, tubo de gás, freio de boca e pente banana
    ak47: { vox: {
      vs: 0.018, o: [17, 12], muzzle: [56, 17],
      key: { P: [3.4, 0x2a1a0e], W: [4, 0x8a5228], w: [3.6, 0x6e3e1a], v: [4.4, 0x5a3014], R: [4, 0x323234], T: [3.4, 0x3c3c3e], E: [3.3, 0x151516], k: [4.8, 0x1e1e1e], Q: [1.6, 0x161616], g: [2.4, 0x2a2a2c], L: [2, 0x1c1c1d], K: [3, 0x262628], Z: [2.6, 0x111112], G: [4, 0x7a4620], n: [4.4, 0x5e3416], U: [2, 0x2a2a2c], t: [1, 0x0e0e0e], M: [3, 0x6a3010, 'mag'], m: [3.4, 0x522408, 'mag'] },
      rows: [
        '................................................QQ......',
        '...............................QQQ..............QQ......',
        '..............TTTTTTTTTTTTTTTTgggggggggggggggggKKKK.....',
        'PPWWWWWWWWWWWWRRRRRRRRRRRRRRRRRRRwwwwwwwwwwwKLLLLLLLZZZZ',
        'PPWWWWWWWWWWWWRRRRREEEEEEEkkkkRRRwwwwwwwwwwwKLLLLLLLZZZZ',
        'PPWwwwwwwwwwwWRRRRREEEEEEERRRRRRRWWWWWWWWWWWLLLLLL......',
        'PPWWWWWWWWWWWWRRRRRRRRRRRRRRRRRRRWvWWvWWvWWvK...........',
        'PPWWWWWWWWWWWWRRRRRRRRRRRRRRRRRRRWvWWvWWvWWvW...........',
        'PP..WWWWWWWWWWRRRRRRRRRRRRRRRRRRRWWWWWWWWWWWW...........',
        'PP..WWWWWWWWWW.RRRRR.t...UMMMMM.........................',
        '......WWWWWWWW.GGGGG.t...UMMMMM.........................',
        '...............nnnnG.....U.mmmmm........................',
        '...............GGGGGUUUUUU.MMMMM........................',
        '...............GGGGG........mmmmm.......................',
        '..............nnnnG.........MMMMM.......................',
        '..............GGGGG...........mmmmm.....................',
        '..............GGGGG...........MMMMM.....................',
        '................................mmmmm...................',
        '................................MMMMM...................',
        '..................................MMMMM.................',
        '..................................MMMMM.................'] } },
    // M4A1: coronha retrátil, trilho picatinny com dentes, guarda-mão quadrado com furos, assistente do ferrolho e carregador STANAG
    m4a1: { vox: {
      vs: 0.017, o: [17, 12], muzzle: [53, 16],
      key: { P: [3, 0x141414], S: [3, 0x262628], s: [3.4, 0x1c1c1e], d: [3.4, 0x161618], B: [2.6, 0x1e1e20], R: [4, 0x2e2f31], D: [4, 0x252628], E: [3.3, 0x121213], f: [4.6, 0x1a1a1c], c: [2, 0x1a1a1c], T: [3, 0x1a1a1c], t: [3, 0x101011], Q: [1.6, 0x141414], H: [4.6, 0x2a2b2d], h: [4.2, 0x151516], L: [2, 0x1a1a1b], K: [2.6, 0x202022], Z: [2.8, 0x111112], G: [4, 0x1e1e20], n: [4.4, 0x141415], U: [2, 0x1e1e20], q: [1, 0x0d0d0d], M: [3, 0x2a2a2c, 'mag'], m: [3.4, 0x1e1e20, 'mag'], b: [3.6, 0x141414, 'mag'] },
      rows: [
        '.............tQQQQQt.t.t.t.t.tt.t.t.t.t.t.t.QQ.......',
        '.............TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTQQ.......',
        '.............RRRRRRRRRRRRRRRRRHHHHHHHHHHHHHHKKK....ZZ',
        'PPsssssss...cRRRRREEEEEEffRRRRHHhHHhHHhHHhHHLLLLLLLZZ',
        'PPSSSSSSSBBBBRRRRREEEEEERRRRRRHHhHHhHHhHHhHHLLLLLLLZZ',
        'PPSdSdSdSBBBBRRRRRRRRRRRRRRRRRHHhHHhHHhHHhHH.......ZZ',
        'PPSdSdSdS....DDDDDDDDDDDDDDDDDHHhHHhHHhHHhHH.........',
        'PPSSSSSSS....DDDDDDDDDDDDDDDDDHHHHHHHHHHHHHH.........',
        'PPSSSSSSS......DDDDD.q...UMMMMM......................',
        'PP.............GGGGG.q...UMMMMM......................',
        '...............nGnGG.q...Ummmmm......................',
        '...............nGnGGUUUUUUMMMMMM.....................',
        '...............nGnGG......MMMMMM.....................',
        '..............GnGnG.......mmmmmM.....................',
        '..............GnGnG........MMMMMM....................',
        '..............GGGGG........MMMMMM....................',
        '...........................mmmmmM....................',
        '............................MMMMMM...................',
        '............................MMMMMM...................',
        '............................bbbbbb...................'] } },
    // AWM: chassi verde com apoio de rosto, luneta grande, ferrolho de lado, cano longo com freio e bipé dobrado
    awm: { vox: {
      vs: 0.02, o: [15, 8], muzzle: [67, 15], pivot: { bolt: [30, 15] },
      key: { P: [3.4, 0x161616], S: [4, 0x4a6a32], s: [3.6, 0x3a5a28], c: [3.4, 0x3e5a2a], R: [3.4, 0x2a2a2c], E: [2.8, 0x121213], O: [2.8, 0x141414], o: [3.4, 0x1e1e1e], l: [2.2, 0x3a7ac0], r: [3.4, 0x1e1e1e], v: [4.4, 0x2e4420], L: [2, 0x1c1c1d], Z: [3, 0x232325], z: [3.4, 0x111112], G: [4, 0x3e5a2a], n: [4.4, 0x2e4420], U: [2, 0x2a2a2c], q: [1, 0x0d0d0d], M: [3, 0x222224, 'mag'], b: [3.4, 0x141414, 'mag'], X: [2, 0x1a1a1c] },
      extra: [{ c: 29.5, r: 14.5, len: 1, h: 1, d: 2.4, x: 2.9, color: 0x1e1e20, tag: 'bolt' }, { c: 29.5, r: 13.5, len: 1.4, h: 1.4, d: 1.4, x: 4.6, color: 0x111111, tag: 'bolt' }],
      rows: [
        '..............OOOOoOOOOOOOOOOOOOOOOOOOl............................',
        '..............OOOO...rr.rrrrr.rr..OOOOl............................',
        '.....................rr.rrrrr.rr...................................',
        '....................RRRRRRRRRRRRR..............................zZzZ',
        '..................RRRRRREEEEERRRRRLLLLLLLLLLLLLLLLLLLLLLLLLLLLLzZzZ',
        '....cccccccccccc..RRRRRRRRRRRRRRRRLLLLLLLLLLLLLLLLLLLLLLLLLLLLLzZzZ',
        'PPSSSSSSSSSSSSSSSssssssssssssssssSSSSSSSSSSSSSS................zZzZ',
        'PPSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSvSSvSSvSSvSS....................',
        'PPSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSvSSvSSvSSvSS....................',
        'PPSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS....................',
        'PPSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS.......XX.........................',
        'PPSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS.......XX.........................',
        'PPSSSSSSSSS..GGGGG.q..U.MMMMM...........XX.........................',
        'PPSSSSSSSSS..nGnGG.q..U.MMMMM.........XXXXXX.......................',
        '.............nGnGGUUUUU.MMMMM......................................',
        '.............nGnGG......bbbbb......................................',
        '............GnGnG..................................................',
        '............GGGGG..................................................',
        '...................................................................',
        '...................................................................'] } },
    // Kar98k: madeira inteira até a frente, luneta, ferrolho de lado, braçadeiras e cano fino
    kar98: { vox: {
      vs: 0.02, o: [16, 9], muzzle: [64, 14], pivot: { bolt: [28, 13] },
      key: { P: [3.4, 0x2a1a0e], W: [3.6, 0x7a4a24], w: [3.2, 0x63391a], R: [3, 0x2a2a2c], E: [2.4, 0x111112], O: [2.6, 0x141414], l: [2, 0x3a7ac0], r: [3.2, 0x1e1e1e], L: [1.8, 0x1c1c1d], Z: [2.4, 0x111112], Q: [1.2, 0x161616], K: [4, 0x2a2a2c], U: [2, 0x2a2a2c], q: [1, 0x0d0d0d], M: [3.4, 0x2a2a2c, 'mag'] },
      extra: [{ c: 27.5, r: 12.5, len: 1, h: 1, d: 2.4, x: 2.7, color: 0x1e1e20, tag: 'bolt' }, { c: 27.5, r: 11.4, len: 1.4, h: 1.4, d: 1.4, x: 4.2, color: 0x111111, tag: 'bolt' }],
      rows: [
        '................OOOOOOOOOOOOOOOOOOOOOl..........................',
        '................OOO..rr......rr..OOOOl..........................',
        '.....................rr......rr...........................QQ....',
        '....................RRRRRRRRRRRR..........................QQ.ZZZ',
        '................RRRRREEEEEERRRRwLLLLKKLLLLLLLLKKLLLLLLLLLLLLLZZZ',
        'PPWwwwwwwwwwwwW.RRRRRRRRRRRRRRRLLLLLKKLLLLLLLLKKLLLLLLLLLLLLLZZZ',
        'PPWWWWWWWWWWWWWwwwwwwwwwwwwwwwwwwwwwKKwwwWWWWWKK................',
        'PPWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWKKWWWWWWWWKK................',
        'PPWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWKKWWW.......................',
        'PPWWWWWWWWWWWWWWWW.q..UMMMM.....................................',
        'PPWWWWWWWW....WWWW.q..U.........................................',
        'PPWWWWWWWW...WWWW.UUUUU.........................................',
        '.............WWWW...............................................',
        '................................................................',
        '................................................................',
        '................................................................',
        '................................................................',
        '................................................................'] } },
    // M1887: caixa gravada, telha de madeira, cano duplo e a alavanca (que mexe ao recarregar)
    m1887: { vox: {
      vs: 0.018, o: [16, 7], muzzle: [59, 14], pivot: { lever: [27, 7] },
      key: { P: [3.4, 0x2a1a0e], W: [3.8, 0x7a4a24], w: [3.4, 0x5e3416], R: [4, 0x2a2a2c], e: [4.4, 0x8a7a4a], r: [3.4, 0x38383a], F: [4.4, 0x8a5228], f: [4.8, 0x6e3e1a], L: [2.4, 0x1a1a1b], l: [2, 0x222224], Q: [1.2, 0xc8a050], Z: [2.8, 0x111112] },
      extra: [{ c: 22.5, r: 6.5, len: 9, h: 1, d: 1.2, x: 0, color: 0x2a2a2c, tag: 'lever' }, { c: 22.5, r: 2.5, len: 7, h: 1, d: 1.2, x: 0, color: 0x2a2a2c, tag: 'lever' }, { c: 18.5, r: 4.5, len: 1, h: 3, d: 1.2, x: 0, color: 0x2a2a2c, tag: 'lever' }, { c: 26.5, r: 4.5, len: 1, h: 3, d: 1.2, x: 0, color: 0x2a2a2c, tag: 'lever' }],
      rows: [
        '...........................................................',
        '........................................................Q..',
        '............................LLLLLLLLLLLLLLLLLLLLLLLLLLLLLZZ',
        '................rrrrrrrrrrrrLLLLLLLLLLLLLLLLLLLLLLLLLLLLLZZ',
        '................ReeeeeeeeeeRlllllllllllllllllllllllllllll..',
        '................ReeeeeeeeeeRlllllllllllllllllllllllllllll..',
        'PPWWWWWWWWWWWW..RRRRRRRRRRRRFfFfFfFfFfFfFllllllllllllllll..',
        'PPWwwwwwwwwwwW..RRRRRRRRRRRRFFFFFFFFFFFFF..................',
        'PPWWWWWWWWWWWW..RRRRRRRRRRRR...............................',
        'PPWWWWWWWWWWWWWWRRRRRRRRRRRR...............................',
        'PPWWWWWWWW.....WWW.........................................',
        'PP..WWWWWW.....WWW.........................................',
        'PP..WWWWWW...WWWW..........................................',
        'PP...........WWWW..........................................',
        '...........................................................',
        '...........................................................',
        '...........................................................'] } },
    // SPAS-12: coronha dobrável de metal, capa ventilada no cano, bomba grande e cabo de pistola
    spas12: { vox: {
      vs: 0.018, o: [19, 9], muzzle: [59, 15],
      key: { S: [1.6, 0x3a3a3c], P: [3.2, 0x161616], R: [4, 0x1e1e20], T: [3, 0x2a2a2c], E: [3.3, 0x0f0f10], d: [4.4, 0x151516], Q: [1.4, 0x161616], L: [2.6, 0x151516], l: [2.4, 0x222224], Z: [3, 0x111112], v: [3, 0x050505], F: [4.6, 0x2e2e30, 'pump'], f: [5, 0x1e1e20, 'pump'], G: [4, 0x1c1c1e], n: [4.4, 0x121213], U: [2, 0x2a2a2c], q: [1, 0x0d0d0d] },
      rows: [
        '...........................................................',
        '............................QQ.............................',
        '................TTTTTTTTTTTTTTTLLLvLLvLLvLLvLLvLLvLLvLZZZZZ',
        '................RRRRRRRRRRRRRRRLLLLLLLLLLLLLLLLLLLLLLLZZZZZ',
        '..SSSSSSSSSSSSSSRRRREEEEEEERRRRllllllllllllllllllllll.ZZZZZ',
        '..S...........SSRRRREEEEEEERRRRlFFFFFFFFFFFFFllllllll......',
        '..S...........SSRRRRRRRRRRRRRRR.FfFfFfFfFfFfF..............',
        '..S...........SSRdRRdRRdRRdRRdR.FFFFFFFFFFFFF..............',
        '..S...........SSRdRRdRRdRRdRRdR............................',
        'PPPP..........SS.RRRRR.q...U...............................',
        'PPPSSSSSSSSSSSSS.GGGGG.q...U...............................',
        '.................nGnGGUUUUUU...............................',
        '.................nGnGG.....................................',
        '.................nGnGG.....................................',
        '................GnGnG......................................',
        '................GGGGG......................................',
        '...........................................................',
        '...........................................................'] } },
  },
  // ARMAS EM VOXEL (estilo Minecraft): a arma é desenhada de lado em "pixels" (cada letra = um material) e cada pixel
  // vira um bloquinho com a espessura do material (centrado no meio da arma). Pixels vizinhos iguais viram um bloco só.
  // Espessura menor que a do vizinho = rebaixo (janela, ventilação); maior = relevo (serrilhado, texturas do cabo).
  // Como cada bloco ocupa só o seu quadradinho, nada fica um por cima do outro (sem z-fight).
  //   rows: de cima pra baixo · key: letra -> [espessura em voxels, cor, tag?] · vs: tamanho do voxel (m) · o: [coluna, linha] da mão (topo do cabo)
  //   linha = contada de baixo pra cima (0 = última string) · coluna 0 = traseira (coronha) · a arma aponta pra +z
  sprite(def) {
    const rows = def.rows, H = rows.length, vs = def.vs, ox = def.o[0], oy = def.o[1], out = [], open = {};
    for (let r = 0; r < H; r++) {
      const y = H - 1 - r, line = rows[r], runs = [];
      for (let c = 0; c < line.length;) { const ch = line[c]; let e = c; while (e + 1 < line.length && line[e + 1] === ch) e++; if (ch !== '.' && ch !== ' ') runs.push([ch, c, e]); c = e + 1; }
      // junta com o bloco da linha de cima se for igual (mesma letra e mesmas colunas): menos blocos
      const next = {};
      for (const [ch, c0, c1] of runs) { const k = ch + c0 + '_' + c1; if (open[k]) { open[k].y0 = y; next[k] = open[k]; delete open[k]; } else next[k] = { ch, c0, c1, y0: y, y1: y }; }
      for (const k in open) out.push(open[k]);
      for (const k in open) delete open[k]; Object.assign(open, next);
    }
    for (const k in open) out.push(open[k]);
    // peças fora do plano (alavanca do ferrolho de lado, alavanca da M1887): { c, r = centro em colunas/linhas, len, h, d, x = deslocamento pro lado }
    const extra = (def.extra || []).map(e => { const p = [e.x * vs, (e.r - oy) * vs, (e.c - ox) * vs, e.d * vs, e.h * vs, e.len * vs, e.color]; return e.tag ? T(e.tag, p) : p; });
    return out.map(b => {
      const K = def.key[b.ch]; if (!K) throw new Error('arma: letra sem material: ' + b.ch);
      const len = b.c1 - b.c0 + 1, h = b.y1 - b.y0 + 1;
      const p = [0, (b.y0 + h / 2 - oy) * vs, (b.c0 + len / 2 - ox) * vs, K[0] * vs, h * vs, len * vs, K[1]];
      return K[2] ? T(K[2], p) : p;
    }).concat(extra);
  },
  // pivô de uma peça móvel (m, antes da escala): vox usa [coluna, linha]
  pivotOf(id, tag) { const g = this.GUNS[id]; if (g.vox) { const v = g.vox, pv = (v.pivot || {})[tag]; return pv ? [0, (pv[1] - v.o[1]) * v.vs, (pv[0] - v.o[0]) * v.vs] : [0, 0, 0]; } return (g.pivot || {})[tag] || [0, 0, 0]; },
  // peças comuns das armas
  G: {
    grip: (c, r = 0.25) => [[0, -0.07, -0.02, 0.045, 0.12, 0.06, c, r]],
    guard: (z) => [[0, -0.032, z, 0.012, 0.008, 0.06, 0x161616], [0, -0.016, z + 0.032, 0.012, 0.036, 0.008, 0x161616], [0, -0.014, z - 0.008, 0.008, 0.026, 0.01, 0x161616]],
    scope: (y, z, L) => [[0, y, z, 0.046, 0.046, L, 0x111111], [0, y, z + L / 2 + 0.03, 0.064, 0.064, 0.07, 0x111111], [0, y, z - L / 2 - 0.02, 0.056, 0.056, 0.05, 0x111111],
      [0, y, z + L / 2 + 0.066, 0.05, 0.05, 0.004, 0x3a7ac0], [0, y + 0.034, z, 0.03, 0.026, 0.03, 0x222222], [0.034, y, z, 0.026, 0.03, 0.03, 0x222222],
      [0, y - 0.04, z - L / 3, 0.02, 0.034, 0.025, 0x222222], [0, y - 0.04, z + L / 3, 0.02, 0.034, 0.025, 0x222222]]
  },
  gunParts(id) { const g = this.GUNS[id]; return g.vox ? this.sprite(g.vox) : g.parts(this.G); },
  gunGeometry(id, center) { return this.geometry('gun:' + id, () => this.gunParts(id), this.GUNS[id].scale || 1, center); },
  // corpo da arma sem as peças móveis / só uma peça móvel (posições relativas ao pivô)
  gunBody(id) { return this.geometry('gunbody:' + id, () => this.gunParts(id).filter(p => !p.tag), this.GUNS[id].scale || 1); },
  gunTags(id) { return [...new Set(this.gunParts(id).filter(p => p.tag).map(p => p.tag))]; },
  gunPart(id, tag) {
    const pv = this.pivotOf(id, tag);
    return this.geometry('gunpart:' + id + ':' + tag, () => this.gunParts(id).filter(p => p.tag === tag).map(p => { const q = p.slice(); q[0] -= pv[0]; q[1] -= pv[1]; q[2] -= pv[2]; return q; }), this.GUNS[id].scale || 1);
  },

  // ---------------- munição e cura ----------------
  AMMO: {
    light: () => { const p = [[0, 0.07, 0, 0.3, 0.14, 0.2, 0xc9a640], [0, 0.07, 0, 0.31, 0.05, 0.21, 0x8a6a20]];
      for (const x of [-0.08, 0, 0.08]) for (const z of [-0.04, 0.04]) p.push([x, 0.16, z, 0.035, 0.05, 0.035, 0xd8a640], [x, 0.195, z, 0.024, 0.024, 0.024, 0x9a9a9a]);
      return p; },
    rifle: () => [[0, 0.1, 0, 0.34, 0.2, 0.16, 0x4a5a32], [0, 0.215, 0, 0.35, 0.03, 0.17, 0x3e4d2a], [0, 0.245, 0, 0.12, 0.02, 0.03, 0x2a2a2a],
      [0.05, 0.234, 0, 0.02, 0.02, 0.02, 0x2a2a2a], [-0.05, 0.234, 0, 0.02, 0.02, 0.02, 0x2a2a2a], [0, 0.1, 0, 0.35, 0.04, 0.17, 0x6fd15a],
      [0.21, 0.06, 0.03, 0.03, 0.12, 0.03, 0xd8a640], [0.21, 0.135, 0.03, 0.02, 0.03, 0.02, 0x3a8a3a], [0.21, 0.06, -0.03, 0.03, 0.12, 0.03, 0xd8a640], [0.21, 0.135, -0.03, 0.02, 0.03, 0.02, 0x3a8a3a]],
    sniper: () => { const p = [[0, 0.02, 0, 0.3, 0.04, 0.14, 0x6a4a2a], [0, 0.08, 0, 0.19, 0.02, 0.045, 0x5a5a5a]];
      for (let i = 0; i < 5; i++) { const x = -0.072 + i * 0.036; p.push([x, 0.13, 0, 0.03, 0.18, 0.03, 0xd8a640], [x, 0.235, 0, 0.02, 0.04, 0.02, 0x4aa3ff]); }
      return p; },
    shell: () => { const p = [];
      for (let r = 0; r < 2; r++) for (let i = 0; i < (r ? 2 : 3); i++) { const x = (i - (r ? 0.5 : 1)) * 0.065, y = 0.032 + r * 0.06;
        p.push([x, y, 0.01, 0.058, 0.058, 0.12, 0xd8352a], [x, y, -0.065, 0.062, 0.062, 0.03, 0xd8a640]); }
      return p; }
  },
  // bola de gelo (vira a parede de gel): bolinha de bloquinhos branco-azulada
  GEL: () => [[0, 0.13, 0, 0.2, 0.2, 0.2, 0xe8fbff], [0, 0.13, 0, 0.26, 0.14, 0.14, 0xbdf2ff], [0, 0.13, 0, 0.14, 0.26, 0.14, 0xd4f7ff], [0, 0.13, 0, 0.14, 0.14, 0.26, 0xa8ecff],
    [0.05, 0.19, 0.08, 0.05, 0.05, 0.05, 0xffffff], [-0.06, 0.08, 0.1, 0.04, 0.04, 0.04, 0x7fdcff]],
  MEDS: {
    medkit: () => [[0, 0.14, 0, 0.44, 0.28, 0.3, 0xf2f2f2], [0, 0.2, 0, 0.45, 0.016, 0.31, 0xc8c8c8],
      [0, 0.13, 0.156, 0.18, 0.06, 0.012, 0xe02020], [0, 0.13, 0.156, 0.06, 0.18, 0.012, 0xe02020], [0, 0.13, -0.156, 0.18, 0.06, 0.012, 0xe02020], [0, 0.13, -0.156, 0.06, 0.18, 0.012, 0xe02020],
      [0, 0.315, 0, 0.14, 0.03, 0.04, 0x555555], [0.06, 0.29, 0, 0.02, 0.03, 0.03, 0x555555], [-0.06, 0.29, 0, 0.02, 0.03, 0.03, 0x555555],
      [0.13, 0.25, 0.157, 0.04, 0.03, 0.014, 0x888888], [-0.13, 0.25, 0.157, 0.04, 0.03, 0.014, 0x888888]],
    bandage: () => [[0, 0.09, 0, 0.13, 0.13, 0.16, 0xf5ead0], [0, 0.09, 0, 0.13, 0.13, 0.16, 0xf5ead0, 0, 0, Math.PI / 4], [0, 0.09, 0, 0.045, 0.045, 0.17, 0xb8ac90],
      [0, 0.009, 0.15, 0.11, 0.012, 0.16, 0xf5ead0], [0.068, 0.09, 0, 0.018, 0.04, 0.12, 0x9a9a9a], [0, 0.016, 0.21, 0.03, 0.006, 0.03, 0xe02020]]
  },

  // ---------------- equipamentos (em "pixels" do personagem: torso y 0..12, cabeça y 0..8) ----------------
  GEAR_COLORS: {
    vest: [null, [0x6a7a4a, 0x55633a], [0x34465e, 0x26364c], [0x232529, 0x16181b]],
    helmet: [null, [0x5a6a3a, 0x46542c], [0x24304a, 0x18203a], [0x1e2024, 0x111214]],
    bag: [null, [0x7a5a3a, 0x5a4028], [0x4a5a38, 0x37442a], [0x2c3226, 0x1e2219]]
  },
  gearParts(kind, lv) {
    const [c, k] = this.GEAR_COLORS[kind][lv], tag = LS.LEVEL_COLORS[lv], p = [];
    if (kind === 'vest') {
      p.push([0, 6.5, 2.4, 8.6, 7, 0.6, c], [0, 6.5, -2.4, 8.6, 7, 0.6, c], [4.3, 6, 0, 0.5, 5, 4.2, c], [-4.3, 6, 0, 0.5, 5, 4.2, c],
        [2.6, 11.2, 0, 1.6, 1.8, 5.4, c], [-2.6, 11.2, 0, 1.6, 1.8, 5.4, c], [-2.6, 10.4, 2.8, 0.9, 0.9, 0.1, tag]);
      if (lv === 1) for (const y of [4.6, 8]) p.push([0, y, 2.72, 8.62, 0.3, 0.08, k], [0, y, -2.72, 8.62, 0.3, 0.08, k]);
      if (lv === 2) { for (const x of [-2.4, 0, 2.4]) p.push([x, 5, 2.95, 1.8, 2.2, 0.5, k]); p.push([1.9, 8.6, 2.75, 3, 0.9, 0.1, 0xe8e8e8]); }
      if (lv === 3) { for (const x of [-2.7, -0.9, 0.9, 2.7]) p.push([x, 5.2, 3.05, 1.5, 2.6, 0.7, k], [x, 6.7, 3.05, 1.1, 0.6, 0.4, 0x0e0e0e]);
        p.push([1.4, 9.2, 2.95, 3.6, 1.4, 0.5, k], [0, 6.5, -2.95, 6, 5, 0.5, k]); }
    } else if (kind === 'helmet') {
      // a faixa vai até o topo da cabeça (y 8) e a tampa é mais larga que a cabeça (8,6 > 8): nenhuma face do capacete
      // fica no mesmo plano da cabeça (antes a tampa tinha 8 de largura e piscava/atravessava nos cantos)
      p.push([0, 6.47, 0, 9, 2.94, 9, c], [0, 8.4, 0, 8.6, 0.9, 8.6, c], [0, 5.0, 0, 9.6, 0.4, 9.6, k]);
      if (lv === 1) p.push([4.62, 4, 0.5, 0.25, 3, 0.6, 0x3a3020], [-4.62, 4, 0.5, 0.25, 3, 0.6, 0x3a3020], [0, 8.85, 0, 5, 0.1, 5, k]);
      if (lv === 2) p.push([0, 4.9, 4.75, 8.4, 2.6, 0.3, 0x6f93b8], [4.6, 6, 3.8, 0.4, 0.6, 0.6, 0x111111], [-4.6, 6, 3.8, 0.4, 0.6, 0.6, 0x111111], [0, 7.0, 0, 9.1, 0.4, 9.1, 0xe8e8e8]);
      if (lv === 3) p.push([4.65, 6.6, 0, 0.3, 0.8, 6, 0x333333], [-4.65, 6.6, 0, 0.3, 0.8, 6, 0x333333], [0, 7.4, 4.75, 1.8, 1.2, 0.5, 0x333333],
        [0, 8.6, 5.0, 3.0, 1.2, 1.4, 0x2a2a2a], [0.8, 8.6, 5.75, 0.9, 0.9, 0.1, 0x3aff7a], [-0.8, 8.6, 5.75, 0.9, 0.9, 0.1, 0x3aff7a],
        [4.8, 4, 0, 0.8, 2.6, 2.6, 0x2a2a2a], [-4.8, 4, 0, 0.8, 2.6, 2.6, 0x2a2a2a]);
      p.push([0, 8.85, -2.6, 1.2, 0.1, 1.2, tag]);
    } else if (kind === 'bag') {
      if (lv === 1) p.push([0, 6, -3.9, 6, 7, 2.2, c], [0, 4.3, -5.3, 4.2, 3, 0.6, k], [0, 9.6, -3.9, 6.2, 0.6, 2.4, k], [2, 8.2, -5.05, 1, 1, 0.1, tag]);
      if (lv === 2) p.push([0, 6.2, -4.3, 7, 8.6, 3, c], [3.7, 5, -4.3, 0.4, 4, 2.2, k], [-3.7, 5, -4.3, 0.4, 4, 2.2, k], [0, 11.1, -4.6, 8.4, 1.8, 1.8, 0xb8a070],
        [0, 4.5, -5.95, 5, 3.4, 0.3, k], [2.5, 8.5, -5.85, 1, 1, 0.1, tag]);
      if (lv === 3) { p.push([0, 6.2, -4.8, 8, 10.4, 4, c], [0, 11.5, -4.9, 8.2, 0.8, 4.2, k], [3.2, 5, -6.9, 1, 1, 0.1, tag]);
        for (const y of [3, 5, 7, 9]) p.push([0, y, -6.85, 7, 0.3, 0.1, k]);
        p.push([0, 1.6, -4.8, 7.6, 1.6, 3.4, 0x6a6a52]); }
    }
    return p;
  },
  gearGeometry(kind, lv, center) { return this.geometry(kind + lv, () => this.gearParts(kind, lv), LS.Skin.PX, center); },

  // ---------------- modelo de qualquer item do chão ----------------
  itemGeometry(it) {
    if (it.type === 'weapon') return this.gunGeometry(it.id, true);
    if (it.type === 'ammo') return this.geometry('ammo:' + it.id, this.AMMO[it.id], 1, true);
    if (it.type === 'med') return this.geometry('med:' + it.id, this.MEDS[it.id], 1, true);
    if (it.type === 'gel') return this.geometry('gel', this.GEL, 1, true);
    return this.gearGeometry(it.type, it.level, true);
  },
  // nível de raridade (0 comum .. 3 lendário) e cor
  rarity(it) {
    if (it.type === 'weapon') return LS.WEAPONS[it.id].rarity;
    if (it.type === 'med') return it.id === 'medkit' ? 2 : 1;
    if (it.type === 'ammo') return 0;
    if (it.type === 'gel') return 2;
    return it.level;
  },
  color(it) { return it.type === 'ammo' ? LS.AMMO_TYPES[it.id].color : LS.LEVEL_COLORS[this.rarity(it)]; }
};

// arma na mão do personagem (mesma API de antes: grupo com userData.muzzle)
LS.buildGunMesh = function (id) {
  const I = LS.Items, g = new THREE.Group(), def = I.GUNS[id], k = def.scale || 1;
  g.add(I.mesh(I.gunBody(id)));
  // peças móveis em grupos de pivô: userData.parts.mag / bolt / pump / lever (animadas pelo personagem)
  g.userData.parts = {};
  for (const tag of I.gunTags(id)) {
    const pv = I.pivotOf(id, tag).map(v => v * k), piv = new THREE.Group();
    piv.position.set(...pv); piv.userData.base = piv.position.clone(); piv.add(I.mesh(I.gunPart(id, tag)));
    g.add(piv); g.userData.parts[tag] = piv;
  }
  const mz = def.vox ? [(def.vox.muzzle[1] - def.vox.o[1]) * def.vox.vs, (def.vox.muzzle[0] - def.vox.o[0]) * def.vox.vs] : def.muzzle; // vox: [coluna, linha] da boca do cano
  g.userData.muzzle = new THREE.Object3D(); g.userData.muzzle.position.set(0, mz[0] * k, mz[1] * k); g.add(g.userData.muzzle);
  return g;
};
