// Animações externas no boneco de blocos: carrega .glb/.gltf/.fbx (Mixamo, Quaternius, Kenney...),
// converte ("retarget") para os 15 ossos do personagem (estilo R15) e toca por cima das animações do código.
//
// Como funciona o retarget: para cada osso, pega quanto o osso do modelo de fora girou em relação à pose
// de descanso dele (T-pose / A-pose), no espaço do mundo, e aplica esse mesmo giro no nosso osso a partir
// de uma pose de descanso equivalente. Assim não importa a escala, o eixo ou a pose base do arquivo.
//
// Uso rápido (console, tecla '):  anim load anims/danca.glb danca  ·  anim play danca  ·  anim stop
// Ou arraste um arquivo .glb/.fbx para a janela do jogo.
'use strict';
LS.Anim = {
  // 15 ossos, como o R15 (ordem: sempre o pai antes do filho)
  BONES: ['Hips', 'Spine', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand',
    'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftUpLeg', 'LeftLeg', 'LeftFoot'],
  PARENT: { Hips: null, Spine: 'Hips', Head: 'Spine', RightArm: 'Spine', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
    LeftArm: 'Spine', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm', RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg',
    LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg' },
  // máscaras: quais ossos a animação controla (o resto continua com a animação do código)
  MASKS: {
    full: null, // preenchida abaixo com todos os ossos
    upper: ['Spine', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand'],
    lower: ['RightUpLeg', 'RightLeg', 'RightFoot', 'LeftUpLeg', 'LeftLeg', 'LeftFoot'],
  },
  FPS: 30,
  clips: {},  // nome -> clipe já convertido
  // biblioteca opcional: animações que ficam no repositório e carregam quando forem usadas
  // exemplo: { name: 'danca', url: 'anims/danca.glb' }
  LIBRARY: [
    // movimentação (feitas pelo Duckix03): andar pra frente/trás/lados, correr e parado
    { name: 'walk_f', url: 'anims/locomocao.json' }, { name: 'walk_b', url: 'anims/locomocao.json' },
    { name: 'walk_l', url: 'anims/locomocao.json' }, { name: 'walk_r', url: 'anims/locomocao.json' },
    { name: 'run_f', url: 'anims/locomocao.json' }, { name: 'stand_idle', url: 'anims/locomocao.json' },
    { name: 'dash_run_f', url: 'anims/locomocao.json' }, // corrida oficial
  ],

  // ---------- nomes de ossos ----------
  norm(n) {
    return String(n || '').toLowerCase().replace(/^.*:/, '').replace(/mixamorig/g, '').replace(/^bip(0*1)?(?=[^a-z]|$)/, '').replace(/[^a-z0-9]/g, '').replace(/^(bone|bn|def|jnt|joint)(?=[a-z])/, '');
  },
  _sided(bases, side) {
    const s = side === 'R' ? ['right', 'r'] : ['left', 'l'], out = [];
    for (const b of bases) for (const p of s) out.push(p + b, b + p);
    return out;
  },
  aliases() {
    if (this._al) return this._al;
    const S = (b, side) => this._sided(b, side);
    const ARM = ['arm', 'upperarm', 'armupper'], FORE = ['forearm', 'lowerarm', 'armlower', 'elbow'], HAND = ['hand', 'wrist'], UPLEG = ['upleg', 'thigh', 'upperleg', 'legupper'], LEG = ['leg', 'lowerleg', 'leglower', 'calf', 'shin', 'knee'], FOOT = ['foot', 'ankle'];
    const FINGER = ['handmiddle1', 'middle1', 'middlefinger1', 'finger21', 'finger2', 'handindex1', 'index1', 'finger11', 'finger1'], TOE = ['toebase', 'toe', 'toes', 'ball'];
    this._al = {
      Hips: ['hips', 'pelvis', 'hip'],
      Spine: ['spine2', 'chest', 'upperchest', 'spine1', 'spine02', 'spine03', 'spine'],
      Head: ['head'],
      RightArm: S(ARM, 'R'), LeftArm: S(ARM, 'L'), RightForeArm: S(FORE, 'R'), LeftForeArm: S(FORE, 'L'), RightHand: S(HAND, 'R'), LeftHand: S(HAND, 'L'),
      RightUpLeg: S(UPLEG, 'R'), LeftUpLeg: S(UPLEG, 'L'), RightLeg: S(LEG, 'R'), LeftLeg: S(LEG, 'L'), RightFoot: S(FOOT, 'R'), LeftFoot: S(FOOT, 'L'),
      // pontas: servem para saber para onde cada osso aponta na pose de descanso
      _Spine: ['neck', 'neck1', 'head'], _Head: ['headtopend', 'headend', 'headtop'],
      _RightArm: S(FORE, 'R'), _LeftArm: S(FORE, 'L'), _RightForeArm: S(HAND, 'R'), _LeftForeArm: S(HAND, 'L'), _RightHand: S(FINGER, 'R'), _LeftHand: S(FINGER, 'L'),
      _RightUpLeg: S(LEG, 'R'), _LeftUpLeg: S(LEG, 'L'), _RightLeg: S(FOOT, 'R'), _LeftLeg: S(FOOT, 'L'), _RightFoot: S(TOE, 'R'), _LeftFoot: S(TOE, 'L'),
    };
    return this._al;
  },
  findBones(root) {
    const byName = {};
    root.traverse(o => { const k = this.norm(o.name); if (k && (!byName[k] || (o.isBone && !byName[k].isBone))) byName[k] = o; });
    const al = this.aliases(), out = {};
    for (const key in al) for (const a of al[key]) if (byName[a]) { out[key] = byName[a]; break; }
    return out;
  },

  // ---------- carregar arquivos ----------
  CDN: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/',
  _scripts: {},
  _script(path) {
    if (!this._scripts[path]) this._scripts[path] = new Promise((ok, fail) => {
      const s = document.createElement('script'); s.src = this.CDN + path; s.onload = ok;
      s.onerror = () => fail(new Error('Não consegui baixar ' + path)); document.head.appendChild(s);
    });
    return this._scripts[path];
  },
  async _loader(ext) {
    if (ext === 'fbx') {
      await this._script('libs/fflate.min.js'); await this._script('loaders/FBXLoader.js');
      return new THREE.FBXLoader();
    }
    await this._script('loaders/GLTFLoader.js');
    return new THREE.GLTFLoader();
  },
  // src: URL (string) ou File (arrastado / escolhido). name: nome do clipe (opcional)
  async load(src, name) {
    const isFile = typeof src !== 'string', fname = isFile ? src.name : src.split('?')[0];
    const ext = (fname.split('.').pop() || '').toLowerCase();
    if (!['glb', 'gltf', 'fbx', 'json'].includes(ext)) throw new Error('Formato não suportado: .' + ext + ' (use .glb, .gltf, .fbx ou .json)');
    if (ext === 'json') return this.fromJSON(JSON.parse(isFile ? await src.text() : await (await fetch(src)).text()), name);
    const loader = await this._loader(ext);
    const url = isFile ? URL.createObjectURL(src) : src;
    let root, clips;
    try {
      const res = await new Promise((ok, fail) => loader.load(url, ok, undefined, e => fail(new Error('Erro ao carregar ' + fname + (e && e.message ? ': ' + e.message : '')))));
      root = res.scene || res; clips = res.animations || (res.scene && res.scene.animations) || [];
    } finally { if (isFile) URL.revokeObjectURL(url); }
    clips = clips.filter(c => c.duration > 0 && c.tracks.length);
    if (!clips.length) throw new Error(fname + ' não tem animações.');
    const base = name || fname.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase().replace(/\s+/g, '_');
    const names = [];
    clips.forEach((c, i) => {
      const n = clips.length === 1 ? base : base + '_' + (this.norm(c.name) || i);
      this.clips[n] = this.retarget(root, c, n);
      names.push(n);
    });
    return names;
  },
  async ensure(name) {
    if (this.clips[name]) return this.clips[name];
    const e = this.LIBRARY.find(x => x.name === name);
    if (!e) throw new Error('Animação "' + name + '" não carregada. Carregadas: ' + (Object.keys(this.clips).join(', ') || 'nenhuma'));
    await this.load(e.url + (e.url.includes('?') ? '&' : '?') + 'v=' + LS.VERSION, e.name); // ?v= evita pegar o .json antigo do cache
    if (!this.clips[name]) throw new Error('Animação "' + name + '" não está em ' + e.url);
    if (e.loop === false || e.mask) Object.assign(this.clips[name], { loop: e.loop !== false, mask: e.mask || 'full' });
    return this.clips[name];
  },

  // ---------- .json: clipes já convertidos (só o movimento dos 15 ossos, sem modelo 3D) ----------
  toJSON(names) {
    names = names && names.length ? names : Object.keys(this.clips);
    const r = a => Array.from(a, x => Math.round(x * 1e4) / 1e4);
    return { format: 'lastsurvivor-anim', version: 1, clips: names.map(n => {
      const c = this.clips[n]; if (!c) throw new Error('Animação "' + n + '" não carregada.');
      const q = {}; for (const b in c.q) q[b] = r(c.q[b]);
      return { name: c.name, fps: c.fps, duration: c.duration, frames: c.frames, loop: c.loop, mask: c.mask, q, p: r(c.p) };
    }) };
  },
  fromJSON(j, name) {
    if (!j || j.format !== 'lastsurvivor-anim' || !Array.isArray(j.clips)) throw new Error('Arquivo .json não é de animação do Last Survivor.');
    return j.clips.map(c => {
      const n = j.clips.length === 1 && name ? name : c.name, q = {};
      for (const b in c.q) q[b] = Float32Array.from(c.q[b]);
      this.clips[n] = { name: n, fps: c.fps, duration: c.duration, frames: c.frames, loop: c.loop !== false, mask: c.mask || 'full', q, p: Float32Array.from(c.p) };
      return n;
    });
  },
  // baixa os clipes convertidos como .json (para colocar em anims/ sem levar o modelo 3D junto)
  download(names, file) {
    const blob = new Blob([JSON.stringify(this.toJSON(names))], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = file || 'animacoes.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  // ---------- retarget (converte o clipe para os nossos ossos) ----------
  retarget(root, clip, name) {
    const V = THREE.Vector3, Q = THREE.Quaternion, M = THREE.Matrix4;
    root.updateMatrixWorld(true);
    const src = this.findBones(root);
    for (const b of ['Hips', 'Spine', 'RightArm', 'LeftArm', 'RightUpLeg', 'LeftUpLeg'])
      if (!src[b]) throw new Error('Osso "' + b + '" não encontrado no arquivo (o modelo precisa ter um esqueleto humanoide).');

    // pose de descanso de cada osso, no mundo: pelo bind do SkinnedMesh se existir, senão a pose atual do nó
    const bind = new Map();
    root.traverse(o => {
      if (!o.isSkinnedMesh || !o.skeleton) return;
      o.skeleton.bones.forEach((bn, i) => { if (!bind.has(bn)) bind.set(bn, o.bindMatrix.clone().multiply(new M().copy(o.skeleton.boneInverses[i]).invert())); });
    });
    const node0 = new Map(); for (const k in src) node0.set(k, src[k].matrixWorld.clone()); // pose dos nós antes da animação
    const makeRest = useBind => {
      const rest = {};
      for (const k in src) {
        const m = (useBind && bind.get(src[k])) || node0.get(k), p = new V(), q = new Q(), s = new V();
        m.decompose(p, q, s); rest[k] = { p, q };
      }
      // base do personagem de fora (esquerda, cima, frente) -> C leva para a nossa (+X, +Y, +Z)
      const left = rest.LeftUpLeg.p.clone().sub(rest.RightUpLeg.p).add(rest.LeftArm.p.clone().sub(rest.RightArm.p)).normalize();
      const up = rest.Spine.p.clone().sub(rest.Hips.p);
      up.sub(left.clone().multiplyScalar(up.dot(left))).normalize();
      const fwd = new V().crossVectors(left, up).normalize();
      const C = new Q().setFromRotationMatrix(new M().makeBasis(left, up, fwd)).invert();
      return { rest, C };
    };
    // alguns arquivos (ex.: Biped do 3ds Max, com "bip_Pelvis") têm o bind do modelo num eixo diferente do esqueleto animado:
    // testa o 1º quadro com as duas poses de descanso e fica com a que deixa o quadril em pé
    let pick = makeRest(true);
    if (bind.size) {
      const alt = makeRest(false), mx = new THREE.AnimationMixer(root); mx.clipAction(clip).play(); mx.setTime(0); root.updateMatrixWorld(true);
      const hq = src.Hips.getWorldQuaternion(new Q()), upY = o => new V(0, 1, 0).applyQuaternion(o.C.clone().multiply(hq).multiply(o.rest.Hips.q.clone().invert()).multiply(o.C.clone().invert())).y;
      if (upY(alt) > upY(pick) + 0.3) pick = alt;
      mx.stopAllAction(); mx.uncacheRoot(root); root.updateMatrixWorld(true);
    }
    const rest = pick.rest, C = pick.C, Ci = C.clone().invert();

    // pose de descanso equivalente nos nossos ossos (ex.: braços abertos se o arquivo está em T-pose)
    const DOWN = new V(0, -1, 0), UP = new V(0, 1, 0), FWD = new V(0, 0, 1);
    const DIR = { Spine: UP, Head: UP, RightFoot: FWD, LeftFoot: FWD }; // o resto (braços e pernas) aponta pra baixo
    const R = { Hips: new Q() };
    for (const b of this.BONES) {
      if (b === 'Hips') continue;
      const dir = DIR[b] || DOWN, par = this.PARENT[b];
      let from = rest[b], tip = rest['_' + b];
      // sem a ponta (ex.: arquivo sem dedos): continua na direção do osso pai; pé sem dedão fica reto
      if (from && !tip && dir !== FWD && par && rest[par]) { tip = from; from = rest[par]; }
      if (!from || !tip) { R[b] = new Q(); continue; }
      const d = tip.p.clone().sub(from.p).applyQuaternion(C);
      R[b] = d.lengthSq() > 1e-10 ? new Q().setFromUnitVectors(dir, d.normalize()) : new Q();
    }
    // altura do quadril para escalar o movimento do corpo (pula, agacha...)
    const hipY = rest.Hips.p.clone().applyQuaternion(C).y;
    const foot = rest.RightFoot || rest.LeftFoot, footY = foot ? foot.p.clone().applyQuaternion(C).y : hipY - (rest.Hips.p.y || 1);
    const scale = (12 * LS.Skin.PX) / Math.max(1e-4, hipY - footY);

    // amostra o clipe quadro a quadro
    const mixer = new THREE.AnimationMixer(root), action = mixer.clipAction(clip);
    action.play();
    const fps = this.FPS, n = Math.max(2, Math.ceil(clip.duration * fps) + 1);
    const out = { name, fps, duration: clip.duration, frames: n, q: {}, p: new Float32Array(n * 3), loop: true, mask: 'full' };
    const has = this.BONES.filter(b => src[b]);
    has.forEach(b => out.q[b] = new Float32Array(n * 4));
    const W = {}, wq = new Q(), d = new Q(), lq = new Q(), pw = new V();
    const restQi = {}; has.forEach(b => restQi[b] = rest[b].q.clone().invert());
    for (let f = 0; f < n; f++) {
      mixer.setTime(Math.min(clip.duration, f / fps));
      root.updateMatrixWorld(true);
      for (const b of this.BONES) {
        if (!src[b]) { W[b] = (W[this.PARENT[b]] || new Q()).clone(); continue; } // sem cabeça no arquivo: segue o tronco
        src[b].getWorldQuaternion(wq);
        d.copy(C).multiply(wq).multiply(restQi[b]).multiply(Ci);  // giro desde o descanso, na nossa base
        W[b] = d.clone().multiply(R[b]);
        const par = this.PARENT[b];
        lq.copy(par ? W[par] : new Q()).invert().multiply(W[b]);
        if (out.q[b]) lq.toArray(out.q[b], f * 4);
      }
      src.Hips.getWorldPosition(pw);
      pw.sub(rest.Hips.p).applyQuaternion(C).multiplyScalar(scale);
      pw.toArray(out.p, f * 3);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(root);
    // sem andar sozinho pelo mapa: tira o deslocamento horizontal (fica só o sobe/desce e o balanço)
    const x0 = out.p[0], z0 = out.p[2];
    for (let f = 0; f < n; f++) { out.p[f * 3] -= x0 + (out.p[(n - 1) * 3] - x0) * f / (n - 1); out.p[f * 3 + 2] -= z0 + (out.p[(n - 1) * 3 + 2] - z0) * f / (n - 1); }
    return out;
  },

  // ---------- corrida oficial: dash_run_f quando o personagem corre (player e bots) ----------
  // sem arma: corpo inteiro da run_f. Com arma: pernas, quadril e um pouco do tronco da run_f; braços e cabeça
  // continuam no código (arma em guarda / mira / recarga) e são compensados para a arma não balançar com o tronco.
  RUN_CLIP: 'dash_run_f', RUN_SPEED: 7.6,
  initLoco() { this.ensure(this.RUN_CLIP).catch(e => console.warn('Corrida (' + this.RUN_CLIP + '): ' + e.message)); },
  loco(m, s) {
    const c = this.clips[this.RUN_CLIP]; if (!c) return;
    const cl = LS.util.clamp, dt = s.dt || 0, spd = s.speed || 0;
    const st = m._loco || (m._loco = { w: 0, arm: s.armed ? 1 : 0, t: Math.random() * c.duration, q: new THREE.Quaternion(), q2: new THREE.Quaternion(), before: new THREE.Quaternion(), corr: new THREE.Quaternion() });
    const on = s.running && spd > 2.5 && !s.air && !s.crouch && !s.dead && !s.fall && !s.chute && !(m.anim && m.anim.playing);
    st.w = cl(st.w + (on ? dt / 0.18 : -dt / 0.15), 0, 1);
    st.arm = cl(st.arm + (s.armed ? dt / 0.2 : -dt / 0.2), 0, 1);
    if (st.w <= 0) return;
    st.t = (st.t + dt * cl(spd / this.RUN_SPEED, 0.6, 1.4)) % c.duration; // passada acompanha a velocidade
    const fr = st.t * c.fps, i0 = Math.floor(fr) % c.frames, i1 = Math.min(c.frames - 1, i0 + 1), a = fr - Math.floor(fr);
    const clipQ = b => { const arr = c.q[b]; if (!arr) return null; st.q.fromArray(arr, i0 * 4); st.q2.fromArray(arr, i1 * 4); return st.q.slerp(st.q2, a); };
    const w = st.w * st.w * (3 - 2 * st.w), arm = st.arm, B = m.bones;
    const blend = (b, k) => { const q = clipQ(b); if (q && k > 0) B[b].quaternion.slerp(q, k); };
    st.before.copy(m.hips.quaternion).multiply(m.torso.quaternion);         // tronco antes (em relação ao corpo)
    // pernas e quadril: sempre da run_f
    for (const b of this.MASKS.lower) blend(b, w);
    const p = c.p, h = m.hips.position, L = LS.util.lerp;
    h.y = L(h.y, m.hipsY + L(p[i0 * 3 + 1], p[i1 * 3 + 1], a), w);
    blend('Hips', w * L(1, 0.45, arm));
    // tronco: inclinação inteira sem arma; com arma, menos (ainda menos mirando, para a mira não descer)
    blend('Spine', w * L(1, s.armedAim ? 0.2 : 0.35, arm));
    // braços e cabeça: com arma, desfaz o giro que o tronco ganhou (arma fica firme); sem arma, braços da run_f
    st.corr.copy(m.hips.quaternion).multiply(m.torso.quaternion).invert().multiply(st.before);
    for (const b of ['RightArm', 'LeftArm', 'Head']) {
      const q = B[b].quaternion;
      if (arm > 0) { st.q2.copy(st.corr).multiply(q); q.slerp(st.q2, arm * w); }
      blend(b, w * (1 - arm));
    }
    // antebraços e mãos: sem arma, da animação; com arma, quem manda é a IK das mãos
    for (const b of ['RightForeArm', 'RightHand', 'LeftForeArm', 'LeftHand']) blend(b, w * (1 - arm));
    // com arma: a arma acompanha o tronco e as duas mãos voltam pra ela (a pose de corrida armada vem do código)
    if (s.armed && m.gun) { m.placeGun(); m.solveHands(); }
  },

  // ---------- ajudantes ----------
  player(model) { return model.anim || (model.anim = new LS.AnimPlayer(model)); },
  async play(model, name, opts) { const c = await this.ensure(name); this.player(model).play(c, opts); return c; },
  // modelo que os comandos controlam: o seu na partida, senão o do lobby
  target() {
    const G = LS.Game;
    if (G && G.player && G.built && G.state !== 'menu' && G.state !== 'lobby' && G.player.model) return G.player.model;
    return LS.Lobby && LS.Lobby.model;
  },
  toggleBones(model) {
    if (model._skelHelper) { model._skelHelper.parent && model._skelHelper.parent.remove(model._skelHelper); model._skelHelper = null; return false; }
    const scene = model.root.parent; if (!scene) return false;
    const h = new THREE.SkeletonHelper(model.root); h.material.depthTest = false; h.material.linewidth = 2; h.renderOrder = 999;
    scene.add(h); model._skelHelper = h; return true;
  },
  // arrastar um arquivo para a janela: carrega e toca no personagem
  initDrop() {
    window.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.items].some(i => i.kind === 'file')) e.preventDefault(); });
    window.addEventListener('drop', async e => {
      const f = e.dataTransfer && e.dataTransfer.files[0]; if (!f || !/\.(glb|gltf|fbx|json)$/i.test(f.name)) return;
      e.preventDefault();
      try {
        const names = await this.load(f);
        const m = this.target(); if (m) this.player(m).play(this.clips[names[0]]);
        console.log('Animação carregada: ' + names.join(', ') + ' (tocando ' + names[0] + ')');
      } catch (err) { console.error(err.message); }
    });
  },
};

LS.Anim.MASKS.full = LS.Anim.BONES.slice();

// Toca um clipe convertido por cima da animação do código, com transição suave
LS.AnimPlayer = class {
  constructor(model) {
    this.m = model; this.clip = null; this.t = 0; this.w = 0; this.on = false;
    this.bones = model.bones;
    this._a = new THREE.Quaternion(); this._b = new THREE.Quaternion();
  }
  // opts: { loop, mask: 'full'|'upper'|'lower', fade (s), speed }
  play(clip, opts = {}) {
    this.clip = clip; this.t = 0; this.on = true;
    this.loop = opts.loop !== undefined ? opts.loop : clip.loop;
    this.mask = LS.Anim.MASKS[opts.mask || clip.mask] || LS.Anim.MASKS.full;
    this.fade = opts.fade !== undefined ? opts.fade : 0.25; this.speed = opts.speed || 1;
    if (this.w < 0.01) this.w = 0;
  }
  stop(fade) { this.on = false; if (fade !== undefined) this.fade = fade; }
  get playing() { return this.on && !!this.clip; }
  apply(dt, s) {
    const c = this.clip; if (!c) return;
    const blocked = s.dead || s.fall || s.chute;
    const goal = this.on && !blocked ? 1 : 0, step = this.fade > 0 ? dt / this.fade : 1;
    this.w = goal > this.w ? Math.min(goal, this.w + step) : Math.max(goal, this.w - step);
    if (this.w <= 0) { if (!this.on) this.clip = null; return; }
    this.t += dt * this.speed;
    if (this.t >= c.duration) {
      if (this.loop) this.t = c.duration > 0 ? this.t % c.duration : 0;
      else { this.t = c.duration; this.on = false; }
    }
    const fr = Math.min(c.frames - 1, this.t * c.fps), i0 = Math.floor(fr), i1 = Math.min(c.frames - 1, i0 + 1), a = fr - i0;
    const w = this.w * this.w * (3 - 2 * this.w); // transição suave
    for (const b of this.mask) {
      const arr = c.q[b]; if (!arr) continue;
      this._a.fromArray(arr, i0 * 4); this._b.fromArray(arr, i1 * 4); this._a.slerp(this._b, a);
      this.bones[b].quaternion.slerp(this._a, w);
    }
    if (this.mask.includes('Hips')) {
      const p = c.p, h = this.m.hips.position, k0 = i0 * 3, k1 = i1 * 3, L = LS.util.lerp;
      h.x = L(h.x, L(p[k0], p[k1], a), w);
      h.y = L(h.y, this.m.hipsY + L(p[k0 + 1], p[k1 + 1], a), w);
      h.z = L(h.z, L(p[k0 + 2], p[k1 + 2], a), w);
    }
  }
};
