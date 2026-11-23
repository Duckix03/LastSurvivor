// Banners dos modos em 3D: monta uma mini cena com os modelos do próprio jogo (bonecos, armas, avião,
// contêineres), tira uma "foto" com o renderizador do jogo e usa como imagem do card.
// O herói do banner do Battle Royale é o SEU personagem do lobby (muda quando você muda o visual).
'use strict';
LS.Banners = {
  W: 640, H: 400, SS: 2, // tamanho final e supersampling (renderiza 2x maior e reduz: bordas lisas)
  cache: {},

  key(id) { return id + '|' + JSON.stringify(LS.playerProfile.look) + '|' + (LS.playerProfile.weapon || ''); },
  cached(id) { return this.cache[this.key(id)] || null; },
  // gera os que faltam, um por vez (sem travar o menu), e avisa cada um pronto
  generate(ids, onReady) {
    const todo = ids.filter(id => !this.cached(id));
    const next = () => {
      const id = todo.shift(); if (!id) return;
      try { const url = this.render(id); this.cache[this.key(id)] = url; onReady(id, url); } catch (e) { console.warn('banner 3D falhou', id, e); }
      setTimeout(next, 30);
    };
    setTimeout(next, 60);
  },

  // ---------- foto da cena ----------
  render(id) {
    const { scene, camera } = id === 'br' ? this.sceneBR() : this.sceneDuel(id === 'duel2' ? 2 : 1);
    const out = this.snap(scene, camera, this.W, this.H, { ss: this.SS });
    const g = out.getContext('2d');
    // vinheta e um pouco mais de contraste/saturação (igual ao "cores vivas" do jogo)
    const v = g.createRadialGradient(this.W / 2, this.H * 0.45, this.H * 0.35, this.W / 2, this.H * 0.45, this.W * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = v; g.fillRect(0, 0, this.W, this.H);
    const f = document.createElement('canvas'); f.width = this.W; f.height = this.H;
    const fg = f.getContext('2d'); fg.filter = 'contrast(1.1) saturate(1.2)'; fg.drawImage(out, 0, 0);
    return f.toDataURL('image/jpeg', 0.9);
  },
  // tira a "foto" de uma cena com o renderizador do jogo (numa imagem fora da tela) e devolve um canvas W x H.
  // opts.ss = supersampling (renderiza maior e reduz: bordas lisas); opts.alpha = fundo transparente (foto de perfil)
  snap(scene, camera, W, H, opts = {}) {
    const R = LS.Game.renderer, ss = opts.ss || 2, w = W * ss, h = H * ss;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    const rt = new THREE.WebGLRenderTarget(w, h);
    const prev = R.getRenderTarget(), prevAuto = R.shadowMap.autoUpdate, prevCol = R.getClearColor(new THREE.Color()), prevA = R.getClearAlpha();
    if (opts.alpha) R.setClearColor(0x000000, 0);
    R.shadowMap.needsUpdate = true;
    R.setRenderTarget(rt); R.clear(); R.render(scene, camera);
    const px = new Uint8Array(w * h * 4);
    R.readRenderTargetPixels(rt, 0, 0, w, h, px);
    R.setRenderTarget(prev); R.shadowMap.autoUpdate = prevAuto; R.setClearColor(prevCol, prevA);
    rt.dispose();
    const big = document.createElement('canvas'); big.width = w; big.height = h;
    const bg = big.getContext('2d'), img = bg.createImageData(w, h), row = w * 4;
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row); // o WebGL vem de cabeça pra baixo
    bg.putImageData(img, 0, 0);
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const g = out.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(big, 0, 0, W, H);
    return out;
  },

  // ---------- peças ----------
  gradientTex(stops) {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    stops.forEach(([k, col]) => gr.addColorStop(k, col)); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    return new THREE.CanvasTexture(c);
  },
  glowSprite(color, size, opacity) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color, transparent: true, opacity: opacity || 1, depthWrite: false, fog: false }));
    s.scale.set(size, size, 1); return s;
  },
  // boneco do jogo numa pose (o animate roda alguns quadros pra pose assentar)
  fighter(look, gun, gear, pose) {
    const m = new LS.CharacterModel({ look, chute: 0xff8a1f });
    m.setGun(gun || null); if (gear) m.setGear(gear[0], gear[1], gear[2]);
    const s = Object.assign({ dt: 0.05, speed: 0, aimPitch: 0, armed: !!gun, armedAim: !!gun, idle: false, running: false }, pose || {});
    for (let i = 0; i < 40; i++) m.animate(s);
    m.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return m;
  },
  sun(scene, color, intensity, pos, target, size) {
    const d = new THREE.DirectionalLight(color, intensity); d.position.copy(pos); d.target.position.copy(target);
    const R = LS.Game.renderer;
    if (R.shadowMap.enabled) {
      d.castShadow = true; d.shadow.mapSize.set(1024, 1024); d.shadow.bias = -0.0008;
      Object.assign(d.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 0.5, far: 120 });
    }
    scene.add(d); scene.add(d.target); return d;
  },

  // ---------- Battle Royale: seu personagem num morro, avião e paraquedas no pôr do sol ----------
  sceneBR() {
    const sc = new THREE.Scene(), U = LS.util;
    sc.background = this.gradientTex([[0, '#2c2f7a'], [0.45, '#c95a7a'], [0.75, '#ffad66'], [1, '#ffd9a0']]);
    sc.fog = new THREE.Fog(0xf0a080, 60, 260);
    sc.add(new THREE.HemisphereLight(0xffd2a8, 0x3a5a2a, 0.75));
    this.sun(sc, 0xffc488, 1.0, new THREE.Vector3(-30, 22, -40), new THREE.Vector3(0, 0, 0), 12);
    const rim = new THREE.DirectionalLight(0xff9a5a, 0.6); rim.position.set(20, 8, -30); sc.add(rim);
    const fill = new THREE.DirectionalLight(0xffe6cc, 0.55); fill.position.set(6, 4, 12); sc.add(fill); // luz de frente: rosto aparecendo
    // sol e brilho atrás
    const sunG = this.glowSprite(0xffe2a0, 70, 0.9); sunG.position.set(-55, 22, -150); sc.add(sunG);
    const sunC = this.glowSprite(0xffffff, 18); sunC.position.set(-55, 22, -149); sc.add(sunC);
    // mar, ilhas e montanha ao fundo
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x2a7fb8, shininess: 90, specular: 0xffc080 }));
    sea.position.y = -6; sc.add(sea);
    const land = (x, z, r, h, col) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12), new THREE.MeshLambertMaterial({ color: col })); m.scale.y = h / r; m.position.set(x, -6, z); sc.add(m); return m; };
    land(-40, -120, 70, 14, 0x4a8a3a); land(60, -150, 60, 10, 0x3f7a34);
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(34, 46, 7), new THREE.MeshLambertMaterial({ color: 0x8a8378 })); mtn.position.set(-10, 14, -130); sc.add(mtn);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(11, 15, 7), new THREE.MeshLambertMaterial({ color: 0xf4f6fa })); snow.position.set(-10, 31, -130); sc.add(snow);
    // morro do herói (grama com textura do jogo), pedras e árvores
    const hill = new THREE.Mesh(new THREE.SphereGeometry(16, 40, 20), LS.Tex.material(0x5fae3f, 'grass')); hill.scale.y = 0.22; hill.position.set(2, -3.5, 0); hill.receiveShadow = true; sc.add(hill);
    const rockM = new THREE.MeshLambertMaterial({ color: 0x8a8378 });
    [[3.6, -0.3, 1.6, 1.1], [-1.5, -0.6, 2.4, 0.8], [5.5, -1.2, -1, 1.4]].forEach(([x, y, z, s]) => { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockM); r.position.set(x, y, z); r.rotation.set(s, s * 2, 0); r.castShadow = r.receiveShadow = true; sc.add(r); });
    const trunk = new THREE.MeshLambertMaterial({ color: 0x6b4a2a }), leaf = new THREE.MeshLambertMaterial({ color: 0x3f8a34 });
    [[-7, -1.2, -6, 1.2], [9, -1.6, -8, 1.4], [-11, -2.2, -12, 1.6], [13, -2.6, -14, 1.5]].forEach(([x, y, z, s]) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.25 * s, 1.6 * s, 6), trunk); t.position.set(x, y + 0.8 * s, z); sc.add(t);
      for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry((1.4 - i * 0.3) * s, 1.6 * s, 7), leaf); c.position.set(x, y + (1.9 + i * 0.9) * s, z); c.castShadow = true; sc.add(c); }
    });
    // seu personagem mirando, com o parceiro de squad atrás
    const look = LS.playerProfile.look;
    const hero = this.fighter(look, LS.playerProfile.weapon || 'm4a1', [2, 2, 2], { aimPitch: 0.05 });
    hero.root.position.set(1.0, 0, 1.6); hero.root.rotation.y = 0.55; sc.add(hero.root);
    const mate = LS.util.withSeed(77, () => LS.Skin.randomLook());
    const buddy = this.fighter(mate, 'kar98', [3, 2, 1], { aimPitch: 0.12 });
    buddy.root.position.set(-1.4, -0.2, -0.6); buddy.root.rotation.y = -0.35; sc.add(buddy.root);
    // avião e gente de paraquedas no céu
    const pl = LS.PlaneModel.build().root; pl.scale.setScalar(0.55); pl.position.set(-14, 15, -40); pl.rotation.set(0.05, -1.25, -0.12); sc.add(pl);
    [[-3, 8.5, -22, 11], [10, 11, -32, 12], [-22, 9, -38, 13]].forEach(([x, y, z, seed]) => {
      const p = this.fighter(LS.util.withSeed(seed, () => LS.Skin.randomLook()), null, null, { chute: true, armed: false, armedAim: false });
      p.root.position.set(x, y, z); p.root.rotation.y = 0.6; sc.add(p.root);
    });
    const cam = new THREE.PerspectiveCamera(42, 1.6, 0.1, 600);
    cam.position.set(1.6, 1.0, 6.4); cam.lookAt(-1.2, 2.2, -4);
    return { scene: sc, camera: cam };
  },

  // ---------- Duelo: os times frente a frente no corredor de contêineres ----------
  sceneDuel(n) {
    const sc = new THREE.Scene(), D = LS.Duel, T = D.textures();
    sc.background = new THREE.Color(0x10141e);
    sc.fog = new THREE.Fog(0x2a1f4a, 18, 60);
    sc.add(new THREE.HemisphereLight(0xdfe6ff, 0x3a3540, 0.55));
    this.sun(sc, 0xfff2dc, 0.7, new THREE.Vector3(2, 14, 6), new THREE.Vector3(0, 0, -2), 12);
    const cyan = new THREE.PointLight(0x2fd6ff, 1.6, 16); cyan.position.set(-5, 2.5, 2); sc.add(cyan);
    const red = new THREE.PointLight(0xff3b5a, 1.6, 16); red.position.set(5, 2.5, 2); sc.add(red);
    const gas = new THREE.PointLight(0x8a4dff, 1.4, 30); gas.position.set(0, 4, -16); sc.add(gas);
    // piso, parede do fundo, teto com luminárias
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8e8c86, map: D.repeatTex(T.concrete, 10, 10) }));
    floor.receiveShadow = true; sc.add(floor);
    const yl = new THREE.MeshBasicMaterial({ color: 0xe8c400 });
    [-3.6, 3.6].forEach(x => { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 40).rotateX(-Math.PI / 2), yl); l.position.set(x, 0.01, -10); sc.add(l); });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), new THREE.MeshLambertMaterial({ color: 0x8c9aa8, map: D.repeatTex(T.wall, 20, 6) })); wall.position.set(0, 6, -20); sc.add(wall);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.4), new THREE.MeshBasicMaterial({ map: T.sign })); sign.position.set(0, 5.6, -19.9); sc.add(sign);
    const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
    for (let z = 2; z > -20; z -= 5) { const l = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.3), lamp); l.position.set(0, 7.5, z); sc.add(l); }
    // contêineres dos dois lados (mesmos do galpão) e caixas
    const geo = new THREE.BoxGeometry(D.CW, D.CH, D.CD).translate(0, D.CH / 2, 0);
    const cont = (x, y, z, rotY, col) => { const m = new THREE.Mesh(geo, D.contMat(col)); m.position.set(x, y, z); m.rotation.y = rotY; m.castShadow = m.receiveShadow = true; sc.add(m); };
    cont(-6.2, 0, -3, Math.PI / 2, 0x2e6bb0); cont(-6.2, D.CH, -3, Math.PI / 2, 0xb03a2e); cont(-6.4, 0, -10, Math.PI / 2, 0x6a6e74);
    cont(6.2, 0, -3, Math.PI / 2, 0x3a8a3a); cont(6.4, 0, -10, Math.PI / 2, 0xc98a1e); cont(6.4, D.CH, -10, Math.PI / 2, 0xd8d6cc);
    cont(0, 0, -13, 0, 0x7a3a8a);
    const crateM = new THREE.MeshLambertMaterial({ map: T.crate });
    [[-1.0, 0, -6.5, 1.2, 0.3], [-1.0, 1.2, -6.5, 1.2, -0.2], [1.6, 0, -8, 1.1, 0.5]].forEach(([x, y, z, s, r]) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s).translate(0, s / 2, 0), crateM); c.position.set(x, y, z); c.rotation.y = r; c.castShadow = c.receiveShadow = true; sc.add(c);
    });
    // gás roxo nas laterais
    [-1, 1].forEach(s => { const g = this.glowSprite(0x8a4dff, 22, 0.5); g.position.set(s * 13, 3, -8); sc.add(g); });
    // times: azul à esquerda olhando pra direita, vermelho à direita olhando pra esquerda
    const looks = LS.util.withSeed(4242 + n, () => [0, 1, 2, 3].map(() => LS.Skin.randomLook()));
    const meLook = LS.playerProfile.look;
    const put = (look, gun, x, z, rot, gear) => { const f = this.fighter(look, gun, gear, { aimPitch: 0 }); f.root.position.set(x, 0, z); f.root.rotation.y = rot; sc.add(f.root); };
    if (n > 1) {
      put(meLook, 'm4a1', -1.4, 0.9, 0.95, [2, 2, 1]); put(looks[0], 'ump', -3.3, -1.3, 0.75, [2, 1, 1]);
      put(looks[1], 'ak47', 1.4, 0.9, -0.95, [2, 2, 1]); put(looks[2], 'spas12', 3.3, -1.3, -0.75, [1, 2, 1]);
    } else {
      put(meLook, 'm4a1', -1.6, 0.8, 1.0, [2, 2, 1]); put(looks[1], 'ak47', 1.6, 0.8, -1.0, [2, 2, 1]);
    }
    const front = new THREE.DirectionalLight(0xffffff, 0.35); front.position.set(0, 3, 10); sc.add(front);
    const cam = new THREE.PerspectiveCamera(46, 1.6, 0.1, 100);
    cam.position.set(0, 1.1, 5.0); cam.lookAt(0, 1.45, -2);
    return { scene: sc, camera: cam };
  }
};
