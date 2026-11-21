// Fotos 3D dos itens (guarda-roupa, loja, Gold Royale): um boneco só, reaproveitado, que veste cada item e
// é fotografado com o renderizador do jogo. Uma foto por vez (fila), pra não travar o menu; fica tudo guardado.
'use strict';
LS.Thumbs = {
  cache: {}, queue: [], busy: false,
  // boneco "manequim" neutro: assim a foto mostra o item, não o seu visual
  BASE: { skin: '#e0ac69', hair: '#2a1a10', hairStyle: 'curto', eyes: '#3a2a1a', shirt: '#8c96a3', pattern: 'liso', pants: '#4a4f5a', legs: 'lisa',
    accent: '#d0901a', beard: 'nenhuma', glasses: 'nenhum', mask: 'nenhuma', hat: 'nenhum', top: 'camiseta' },
  CAMS: { // onde a câmera olha em cada tipo de item
    head: { pos: [0.55, 1.66, 1.5], at: [0, 1.56, 0], fov: 34 },
    torso: { pos: [0.75, 1.15, 2.3], at: [0, 1.05, 0], fov: 33 },
    legs: { pos: [0.7, 0.62, 2.2], at: [0, 0.45, 0], fov: 33 },
    full: { pos: [0.85, 1.0, 4.3], at: [0, 0.9, 0], fov: 30 }
  },
  lookFor(item) {
    const L = Object.assign({}, this.BASE);
    if (item.slot === 'portrait') return Object.assign(L, item.look); // rosto de um jogador (morte / espectador)
    if (item.slot === 'costume') Object.assign(L, item.look);
    else L[item.slot] = item.val;
    if (item.slot === 'beard') L.hair = '#5a3416';
    if (item.slot === 'legs') L.pants = '#3a5aa0'; // calça jeans: o estilo aparece melhor que no cinza
    return L;
  },
  focusFor(item) { if (item.slot === 'portrait') return 'head'; return item.slot === 'costume' ? 'full' : LS.Cosmetics.SLOTS[item.slot].focus; },
  key(item) { return item.id; },
  // pede a foto: cb(url) na hora (se já tem) ou quando ficar pronta
  get(item, cb) {
    const k = this.key(item);
    if (this.cache[k]) { cb(this.cache[k]); return this.cache[k]; }
    this.queue.push({ item, cb, k });
    if (!this.busy) this.pump();
    return null;
  },
  pump() {
    this.busy = true;
    const job = this.queue.shift();
    if (!job) { this.busy = false; return; }
    if (!this.cache[job.k]) { try { this.cache[job.k] = this.render(job.item); } catch (e) { console.warn('foto do item falhou', e); this.cache[job.k] = ''; } }
    job.cb(this.cache[job.k]);
    setTimeout(() => this.pump(), 0);
  },
  setup() {
    if (this.sc) return;
    const sc = this.sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x445066, 0.8));
    const key = new THREE.DirectionalLight(0xfff1dc, 0.85); key.position.set(2, 3, 4); sc.add(key);
    const rim = new THREE.DirectionalLight(0x9fdcff, 0.6); rim.position.set(-3, 2, -3); sc.add(rim);
    this.model = new LS.CharacterModel({ look: this.BASE }); sc.add(this.model.root);
    this.model.root.rotation.y = 0.45;
    for (let i = 0; i < 40; i++) this.model.animate({ dt: 0.05, speed: 0, aimPitch: 0, armed: false, idle: true });
    this.cam = new THREE.PerspectiveCamera(32, 1, 0.05, 30);
  },
  render(item) {
    this.setup();
    const m = this.model, tall = item.slot === 'hat' && (item.val === 'coroa diamante' || item.val === 'halo glitch' || item.val === 'dino' || item.val === 'auréola'); // chapéus altos: câmera um pouco acima
    const C = tall ? { pos: [0.6, 1.8, 1.8], at: [0, 1.68, 0], fov: 34 } : this.CAMS[this.focusFor(item)];
    m.applyLook(this.lookFor(item));
    m.root.rotation.y = item.slot === 'hairStyle' && item.val === 'rabo' ? -0.9 : 0.45; // rabo de cavalo: mostra de lado
    m.animate({ dt: 0.05, speed: 0, aimPitch: 0, armed: false, idle: true });
    this.cam.fov = C.fov; this.cam.position.set(...C.pos); this.cam.lookAt(...C.at);
    return LS.Banners.snap(this.sc, this.cam, 128, 128, { alpha: true, ss: 2 }).toDataURL('image/png');
  },
  // rosto de alguém (cartão de morte / espectador)
  face(look, img) {
    if (!look) return;
    const L = Object.assign({}, look); delete L.costume;
    img.classList.remove('ok'); img.removeAttribute('src'); img.dataset.want = JSON.stringify(L);
    const want = img.dataset.want;
    this.get({ id: 'face:' + want, slot: 'portrait', look: L }, url => { if (img.dataset.want === want) { img.src = url; img.classList.add('ok'); } });
  },
  // coloca a foto num <img> (quando ficar pronta)
  into(img, item) {
    const u = this.get(item, url => { if (img.isConnected || img.dataset.wait) { img.src = url; img.classList.add('ok'); } });
    if (u) { img.src = u; img.classList.add('ok'); } else img.dataset.wait = '1';
  }
};
