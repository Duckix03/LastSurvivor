// Catálogo de visuais: o que é grátis, o que é vendido na LOJA (moedas) e o que sai no GOLD ROYALE.
// Os itens que já existiam continuam grátis; os novos (coroa, terno, máscara de gás, estampas...) são comprados.
// O que você tem fica em LS.playerProfile.owned (salvo no navegador e na conta).
'use strict';
LS.Cosmetics = {
  RARITY: [
    { name: 'COMUM', color: '#9aa4b0' }, { name: 'RARO', color: '#3ab4ff' },
    { name: 'ÉPICO', color: '#b060ff' }, { name: 'LENDÁRIO', color: '#ffc531' },
    { name: 'CÓDIGO', color: '#2ee6ff' }, // só sai em codiguin
    { name: 'MÍTICO', color: '#ff3a4a' } // prêmio máximo de evento
  ],
  // cada parte do visual: campo no "look", nome e onde a câmera foca na foto 3D
  SLOTS: {
    hairStyle: { label: 'Cabelo', focus: 'head', list: 'HAIR_STYLES' },
    beard: { label: 'Barba', focus: 'head', list: 'BEARDS' },
    glasses: { label: 'Óculos', focus: 'head', list: 'GLASSES' },
    mask: { label: 'Máscara', focus: 'head', list: 'MASKS' },
    hat: { label: 'Chapéu', focus: 'head', list: 'HATS' },
    top: { label: 'Roupa', focus: 'torso', list: 'TOPS' },
    pattern: { label: 'Estampa', focus: 'torso', list: 'PATTERNS' },
    legs: { label: 'Calça', focus: 'legs', list: null },
    neck: { label: 'Colar', focus: 'torso', list: 'NECKS' }
  },
  // itens novos: [parte, valor, nome, raridade (0-3), preço]
  PREMIUM: [
    ['hat', 'coroa', 'Coroa Real', 3, 4000], ['hat', 'auréola', 'Auréola', 3, 3500], ['hat', 'cartola', 'Cartola', 2, 1800],
    ['hat', 'chifres', 'Chifres', 2, 1600], ['hat', 'fones', 'Fones Neon', 1, 1000], ['hat', 'orelhas de gato', 'Orelhas de Gato', 1, 900], ['hat', 'boné reto', 'Boné Aba Reta', 0, 500], ['hat', 'viseira', 'Viseira Esportiva', 1, 700],
    ['glasses', 'cyber', 'Visor Cyber', 2, 1600], ['glasses', 'coração', 'Óculos Coração', 1, 800], ['glasses', 'aviador', 'Aviador', 0, 500],
    ['mask', 'caveira', 'Caveira', 2, 1500], ['mask', 'gás', 'Máscara de Gás', 2, 1800], ['mask', 'ninja', 'Capuz Ninja', 1, 1000], ['mask', 'sorriso', 'Sorriso Neon', 1, 800],
    ['top', 'armadura', 'Armadura', 3, 3200], ['top', 'terno', 'Terno', 2, 2000], ['top', 'couro', 'Jaqueta de Couro', 1, 1100], ['top', 'kimono', 'Kimono', 1, 1200],
    ['pattern', 'galáxia', 'Galáxia', 3, 2600], ['pattern', 'chamas', 'Chamas', 2, 1500], ['pattern', 'raio', 'Raio', 1, 800], ['pattern', 'tigre', 'Tigre', 1, 900], ['pattern', 'xadrez', 'Xadrez', 0, 450],
    ['legs', 'chamas', 'Calça Chamas', 2, 1400], ['legs', 'camuflada', 'Calça Camuflada', 1, 800], ['legs', 'listra', 'Calça Listrada', 1, 700], ['legs', 'rasgada', 'Calça Rasgada', 0, 400],
    ['hairStyle', 'black power', 'Black Power', 1, 900], ['hairStyle', 'rabo', 'Rabo de Cavalo', 0, 500]
  ],
  // só de codiguin (não vende na loja nem sai no Gold Royale): [parte, valor, nome]
  EXCLUSIVE: [
    ['hat', 'coroa diamante', 'Coroa de Diamante'], ['hat', 'astronauta', 'Capacete Espacial'], ['hat', 'pirata', 'Chapéu de Pirata'], ['hat', 'halo glitch', 'Halo Glitch'],
    ['beard', 'mago', 'Barba de Mago'], ['beard', 'gelo', 'Barba de Gelo'], ['glasses', 'fogo', 'Olhos de Fogo'], ['glasses', 'matrix', 'Visor Matrix'],
    ['pattern', 'glitch', 'Glitch'], ['pattern', 'circuito', 'Circuito'], ['pattern', 'diamante', 'Diamante']
  ],
  EXCLUSIVE_COSTUMES: [
    { id: 'lenda', name: 'Lenda dos Códigos', look: { hat: 'coroa diamante', pattern: 'diamante', top: 'jaqueta', shirt: '#1a2a4a', accent: '#123a5a', pants: '#111111', legs: 'lisa', glasses: 'nenhum', mask: 'nenhuma' } },
    { id: 'astronauta', name: 'Astronauta', look: { hat: 'astronauta', top: 'colete', shirt: '#e8e8e8', pattern: 'liso', accent: '#ff8a1f', pants: '#e8e8e8', legs: 'lisa', glasses: 'nenhum', mask: 'nenhuma', beard: 'nenhuma' } },
    { id: 'pirata', name: 'Capitão Pirata', look: { hat: 'pirata', beard: 'mago', top: 'jaqueta', shirt: '#f0f0f0', pattern: 'listras', accent: '#6a1a1a', pants: '#2a2a3a', legs: 'lisa', glasses: 'nenhum', mask: 'nenhuma' } },
    { id: 'hacker', name: 'Hacker', look: { glasses: 'matrix', pattern: 'circuito', top: 'camiseta', shirt: '#101410', accent: '#1a1f1a', pants: '#111111', legs: 'lisa', hat: 'nenhum', mask: 'nenhuma' } }
  ],
  // peças que só vêm junto com a fantasia (não vendem separado): [parte, valor, nome, raridade]
  COSTUME_PIECES: [['hat', 'dino', 'Capuz de Dino', 3], ['pattern', 'escamas', 'Escamas de Dino', 3]],
  // EVENTO DE NATAL: só saem no Spin de Natal (SnowTickets) ou em codiguin. [parte, valor, nome, raridade]
  EVENT_ITEMS: [['hat', 'gorro natal', 'Gorro de Natal', 2], ['mask', 'floco', 'Máscara Floco', 2], ['top', 'natal', 'Jaqueta Natalina', 3, 1],
    ['pattern', 'estrela', 'Corrente Estrela', 1], ['legs', 'natal', 'Calça Natalina', 1],
    ['hat', 'tiara rena', 'Tiara de Rena', 2], ['neck', 'pisca', 'Colar Pisca-Pisca', 3],
    ['mask', 'gengibre', 'Rosto de Biscoito', 2], ['top', 'gengibre', 'Corpo de Biscoito', 3, 1], ['legs', 'gengibre', 'Pernas de Biscoito', 1]],
  EVENT_COSTUMES: [
    { id: 'frost', name: 'Frost Reaper', rarity: 5, look: { hat: 'gorro natal', mask: 'floco', top: 'natal', pattern: 'estrela', legs: 'natal', shirt: '#141416', accent: '#c8182a', pants: '#141416', hair: '#e8e8e8', hairStyle: 'curto', glasses: 'nenhum', beard: 'nenhuma', neck: 'nenhum' } },
    { id: 'gengibre', name: 'Biscoito de Gengibre', rarity: 5, look: { skin: '#b8692e', hair: '#b8692e', hairStyle: 'careca', mask: 'gengibre', top: 'gengibre', pattern: 'liso', legs: 'gengibre', shirt: '#b8692e', accent: '#b8692e', pants: '#b8692e', hat: 'nenhum', glasses: 'nenhum', beard: 'nenhuma', neck: 'nenhum' } }
  ],
  // fantasias completas: comprar dá todas as peças de uma vez. Pagas em DIAMANTES (dprice)
  COSTUMES: [
    { id: 'rei', dprice: 4000, name: 'Rei do Galpão', rarity: 3, price: 7500, look: { hat: 'coroa', top: 'terno', shirt: '#b03030', pattern: 'liso', pants: '#111111', legs: 'lisa', glasses: 'nenhum', mask: 'nenhuma', beard: 'cheia', accent: '#e0a020' } },
    { id: 'ninja', dprice: 1000, name: 'Ninja das Sombras', rarity: 2, price: 3200, look: { mask: 'ninja', top: 'kimono', shirt: '#1c1c22', pattern: 'liso', accent: '#c0302a', pants: '#111111', legs: 'lisa', hat: 'nenhum', glasses: 'nenhum' } },
    { id: 'caveira', dprice: 1500, name: 'Motoqueiro Caveira', rarity: 2, price: 3800, look: { mask: 'caveira', top: 'couro', shirt: '#2a2a2a', pattern: 'chamas', pants: '#111111', legs: 'chamas', hat: 'nenhum', glasses: 'nenhum' } },
    { id: 'cyber', dprice: 3500, name: 'Cyber Punk', rarity: 3, price: 6000, look: { glasses: 'cyber', hat: 'fones', top: 'armadura', pattern: 'raio', accent: '#20d0e0', hairStyle: 'moicano', hair: '#d040a0', pants: '#1f2f6f', legs: 'listra', mask: 'nenhuma' } },
    { id: 'anjo', dprice: 2200, name: 'Anjo', rarity: 3, price: 5200, look: { hat: 'auréola', top: 'camiseta', shirt: '#e0e0e0', pattern: 'galáxia', pants: '#e0e0e0', legs: 'lisa', glasses: 'nenhum', mask: 'nenhuma', accent: '#f0f0f0' } },
    { id: 'dino', dprice: 1800, name: 'Dino Rex', rarity: 3, price: 0, look: { hat: 'dino', pattern: 'escamas', top: 'camiseta', shirt: '#3f9a3a', accent: '#2f7a2c', pants: '#2f7a2c', legs: 'lisa', glasses: 'nenhum', mask: 'nenhuma', beard: 'nenhuma' } },
    { id: 'gasmask', dprice: 1200, name: 'Sobrevivente Tóxico', rarity: 2, price: 3600, look: { mask: 'gás', hat: 'boné reto', top: 'colete', shirt: '#3a4a2a', pattern: 'camuflado', accent: '#3a5a2a', pants: '#3a4a2a', legs: 'camuflada', glasses: 'nenhum' } }
  ],
  ROYALE_COST: 500, ROYALE_10: 5000, // 10 giros (+1 grátis)

  init() {
    const K = LS.Skin;
    this.items = [];
    // grátis: tudo o que já existia
    for (const slot in this.SLOTS) {
      const S = this.SLOTS[slot], list = S.list ? K[S.list] : ['lisa'];
      list.forEach(v => this.items.push({ id: slot + ':' + v, slot, val: v, name: this.cap(v), rarity: 0, price: 0, free: true }));
    }
    // acessórios da loja: só saem no GOLD ROYALE (o preço vira o valor de referência: repetido devolve 25%)
    this.PREMIUM.forEach(([slot, val, name, rarity, price]) => this.items.push({ id: slot + ':' + val, slot, val, name, rarity, price, free: false, royale: true }));
    this.COSTUMES.forEach(c => this.items.push({ id: 'costume:' + c.id, slot: 'costume', val: c.id, name: c.name, rarity: c.rarity, price: c.price, dprice: c.dprice, free: false, look: c.look }));
    this.COSTUME_PIECES.forEach(([slot, val, name, rarity]) => this.items.push({ id: slot + ':' + val, slot, val, name, rarity, price: 0, free: false, piece: true }));
    this.EXCLUSIVE.forEach(([slot, val, name]) => this.items.push({ id: slot + ':' + val, slot, val, name, rarity: 4, price: 0, free: false, code: true }));
    this.EVENT_ITEMS.forEach(([slot, val, name, rarity, piece]) => this.items.push({ id: slot + ':' + val, slot, val, name, rarity, price: [300, 500, 800, 1200][rarity], free: false, ev: true, piece: !!piece }));
    this.EVENT_COSTUMES.forEach(c => this.items.push({ id: 'costume:' + c.id, slot: 'costume', val: c.id, name: c.name, rarity: c.rarity, price: 0, free: false, ev: true, look: c.look }));
    this.EXCLUSIVE_COSTUMES.forEach(c => this.items.push({ id: 'costume:' + c.id, slot: 'costume', val: c.id, name: c.name, rarity: 4, price: 0, free: false, code: true, look: c.look }));
    this.byId = {}; this.items.forEach(i => { this.byId[i.id] = i; });
    // presets antigos (Sobrevivente, Militar...) viram fantasias grátis
    Object.keys(K.PRESETS).forEach(n => { const it = { id: 'costume:' + n, slot: 'costume', val: n, name: n, rarity: 0, price: 0, free: true, look: K.PRESETS[n] }; this.items.push(it); this.byId[it.id] = it; });
    const P = LS.playerProfile;
    if (!Array.isArray(P.owned)) P.owned = [];
    if (!P.look.legs) P.look.legs = 'lisa';
  },
  cap(v) { return v.charAt(0).toUpperCase() + v.slice(1); },
  coins() { return LS.stats.coins || 0; },
  // diamantes ficam na conta (servidor); convidado não tem
  diamonds() { return LS.Account && LS.Account.logged() ? (LS.Account.me.diamonds || 0) : 0; },
  // fantasia com preço em diamante: o servidor cobra e guarda; depois o jogo libera as peças
  async buyDiamond(id) {
    const it = this.byId[id];
    if (!it || !it.dprice) return 'Item inválido.';
    if (this.owns(id)) return 'Você já tem esse item.';
    if (!LS.Account.logged()) return 'Entre na sua conta pra usar diamantes (Configurações → Conta).';
    if (this.diamonds() < it.dprice) return 'Diamantes insuficientes: faltam ' + (it.dprice - this.diamonds()).toLocaleString('pt-BR') + '.';
    try { await LS.Account.buyDiamond(id); } catch (e) { return e.message; }
    this.give(id);
    return '';
  },
  // peças que a fantasia libera
  pieces(c) { return Object.keys(c.look).map(k => this.byId[k + ':' + c.look[k]]).filter(i => i && !i.free); },
  owns(id) {
    const it = this.byId[id]; if (!it) return false;
    if (it.free) return true;
    if (LS.playerProfile.owned.includes(id)) return true;
    if (it.slot === 'costume') { const ps = this.pieces(it); return ps.length > 0 && ps.every(p => LS.playerProfile.owned.includes(p.id)); }
    return false;
  },
  itemFor(slot, val) { return this.byId[slot + ':' + val]; },
  ownsValue(slot, val) { const it = this.itemFor(slot, val); return !it || this.owns(it.id); },
  give(id) {
    const it = this.byId[id], P = LS.playerProfile;
    if (!it) return;
    const ids = it.slot === 'costume' ? [id].concat(this.pieces(it).map(p => p.id)) : [id];
    ids.forEach(x => { if (!P.owned.includes(x)) P.owned.push(x); });
    LS.saveProfile();
  },
  // comprar com moedas: devolve '' se deu certo, ou o motivo
  buy(id) {
    const it = this.byId[id];
    if (!it || it.free) return 'Item inválido.';
    if (this.owns(id)) return 'Você já tem esse item.';
    if (it.code) return 'Esse item só sai em codiguin.';
    if (it.piece) return 'Essa peça vem junto com a fantasia.';
    if (it.royale) return 'Esse item só sai no Gold Royale.';
    if (it.ev) return 'Esse item só sai no Spin de Natal (ou em codiguin).';
    if (it.dprice) return 'Esse item é comprado com diamantes.';
    if (this.coins() < it.price) return 'Moedas insuficientes: faltam ' + (it.price - this.coins()).toLocaleString('pt-BR') + '.';
    LS.stats.coins -= it.price; LS.saveStats();
    this.give(id);
    return '';
  },
  // o visual só usa o que você tem (o resto volta pro grátis): evita usar item da loja sem comprar
  sanitize(look) {
    const L = Object.assign({}, look);
    if (L.glasses === 'redondos') L.glasses = 'estrela'; // virou o óculos de estrela
    const def = { hairStyle: 'curto', beard: 'nenhuma', glasses: 'nenhum', mask: 'nenhuma', hat: 'nenhum', top: 'camiseta', pattern: 'liso', legs: 'lisa', neck: 'nenhum' };
    for (const slot in this.SLOTS) if (L[slot] && !this.ownsValue(slot, L[slot])) L[slot] = def[slot];
    return L;
  },

  // ---------- Gold Royale ----------
  // chance por raridade (comum muito mais fácil que lendário); repetido vira moedas de volta
  ROYALE_WEIGHT: [46, 32, 16, 6],
  royalePool() { return this.items.filter(i => !i.free && !i.code && !i.piece && !i.ev && i.slot !== 'costume'); },
  spin() {
    const pool = this.royalePool(), W = this.ROYALE_WEIGHT;
    let tot = 0; pool.forEach(i => { tot += W[i.rarity]; });
    let r = Math.random() * tot, pick = pool[0];
    for (const i of pool) { r -= W[i.rarity]; if (r <= 0) { pick = i; break; } }
    const dup = this.owns(pick.id), refund = dup ? Math.round(pick.price * 0.25) : 0;
    if (dup) { LS.stats.coins = this.coins() + refund; LS.saveStats(); } else this.give(pick.id);
    return { item: pick, dup, refund };
  },
  // ---------- Spin de Natal (SnowTickets) ----------
  // peso de cada prêmio: a fantasia Frost Reaper é o prêmio máximo (3%). Repetido devolve tickets
  // a Jaqueta Natalina e o Corpo de Biscoito não saem sozinhos: só vêm com o personagem (juntar as outras peças não libera ele)
  // Frost Reaper e Biscoito de Gengibre são os prêmios máximos (3% cada)
  XMAS_W: { 'costume:frost': 3, 'costume:gengibre': 3, 'neck:pisca': 8, 'hat:tiara rena': 9, 'mask:gengibre': 9, 'hat:gorro natal': 12, 'mask:floco': 13, 'legs:gengibre': 12, 'pattern:estrela': 15, 'legs:natal': 16 },
  XMAS_COST: 60, XMAS_10: 600, XMAS_REFUND: [10, 15, 20, 30, 0, 60],
  snow() { return LS.stats.snow || 0; },
  // personagem de evento que traz essa peça (Jaqueta Natalina → Frost Reaper)
  pieceOf(it) { return this.items.find(c => c.slot === 'costume' && c.ev && c.look && c.look[it.slot] === it.val) || null; },
  xmasPool() { return Object.keys(this.XMAS_W).map(id => this.byId[id]).filter(Boolean); },
  xmasDone() { return this.xmasPool().every(i => this.owns(i.id)); },
  xspin() {
    const pool = this.xmasPool(), W = this.XMAS_W;
    let r = Math.random() * pool.reduce((s, i) => s + W[i.id], 0), pick = pool[0];
    for (const i of pool) { r -= W[i.id]; if (r <= 0) { pick = i; break; } }
    const dup = this.owns(pick.id), refund = dup ? this.XMAS_REFUND[pick.rarity] : 0;
    if (dup) { LS.stats.snow = this.snow() + refund; LS.saveStats(); } else this.give(pick.id);
    return { item: pick, dup, refund };
  },
  xpay(n) {
    const cost = n >= 11 ? this.XMAS_10 : this.XMAS_COST * n;
    if (this.snow() < cost) return false;
    LS.stats.snow -= cost; LS.saveStats();
    return true;
  },
  pay(n) {
    const cost = n >= 11 ? this.ROYALE_10 : this.ROYALE_COST * n;
    if (this.coins() < cost) return false;
    LS.stats.coins -= cost; LS.saveStats();
    return true;
  }
};
