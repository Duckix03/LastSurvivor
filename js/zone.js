// Zona segura que encolhe progressivamente + avião de lançamento
'use strict';
LS.Zone = class {
  constructor(scene) {
    this.scene = scene;
    this.phases = [
      { wait: 80, shrink: 45, r: 220, dps: 1 },
      { wait: 50, shrink: 40, r: 135, dps: 2 },
      { wait: 40, shrink: 35, r: 80, dps: 4 },
      { wait: 32, shrink: 30, r: 42, dps: 6 },
      { wait: 25, shrink: 25, r: 18, dps: 9 },
      { wait: 20, shrink: 22, r: 0, dps: 14 }
    ];
    const geo = new THREE.CylinderGeometry(1, 1, 400, 64, 1, true);
    // parede de gás com shader próprio: animada (faixas e ondas subindo) e NUNCA cortada pelo limite de distância da câmera
    // (antes a parte de trás do cilindro passava do "far" e aparecia cortada numa linha reta)
    this.wallU = { time: { value: 0 }, camY: { value: 0 }, radius: { value: 430 }, color: { value: new THREE.Color(0x5a5cff) } }; // azul-arroxeado: contrasta com o céu
    this.wall = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.wallU, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false,
      vertexShader: `varying vec2 vUv; varying float vY; varying float vDist;
        void main() {
          vUv = uv; vY = (modelMatrix * vec4(position, 1.0)).y; vDist = length((modelViewMatrix * vec4(position, 1.0)).xyz);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          if (p.w > 0.0) p.z = min(p.z, p.w * 0.99999); // prende no fundo em vez de cortar
          gl_Position = p;
        }`,
      fragmentShader: `uniform float time; uniform float camY; uniform float radius; uniform vec3 color; varying vec2 vUv; varying float vY; varying float vDist;
        void main() {
          float u = vUv.x * 6.2832 * radius / 12.0;                      // uma faixa a cada ~12 m
          float near = 1.0 - smoothstep(40.0, 350.0, vDist);              // detalhe só de perto; de longe fica um véu liso
          float stripes = smoothstep(0.7, 1.0, sin(u - time * 0.6) * 0.5 + 0.5) * near;
          float waves = (sin(vY * 0.1 - time * 1.8 + sin(u * 0.3) * 1.2) * 0.5 + 0.5) * near;
          float ground = exp(-max(vY, 0.0) * 0.04);                       // mais forte perto do chão
          float top = 1.0 - smoothstep(140.0, 290.0, vY);                 // some lá em cima
          float a = (0.36 + stripes * 0.2 + waves * 0.08 + ground * 0.25) * top;  // pelo menos tão visível quanto a antiga (0,28)
          a *= 1.0 - 0.75 * smoothstep(90.0, 170.0, camY);                  // lá do alto (avião) vira só um véu leve
          vec3 c = mix(color * 0.85, vec3(0.7, 0.88, 1.0), stripes * 0.5 + ground * 0.2);
          gl_FragColor = vec4(c, a);
        }`
    }));
    this.wall.frustumCulled = false;
    this.wall.position.y = 100;
    this.wall.renderOrder = 5;
    scene.add(this.wall);
    const rg = new THREE.RingGeometry(0.995, 1, 96); rg.rotateX(-Math.PI / 2);
    this.nextRing = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, fog: false }));
    this.nextRing.material.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n if (gl_Position.w > 0.0) gl_Position.z = min(gl_Position.z, gl_Position.w * 0.99999);'); };
    this.nextRing.frustumCulled = false;
    this.nextRing.position.y = 60;
    scene.add(this.nextRing);
    this.reset();
  }
  reset() {
    this.center = new THREE.Vector2(0, 0); this.radius = 430;
    this.startC = this.center.clone(); this.startR = this.radius;
    this.phase = 0; this.shrinking = false; this.timer = this.phases[0].wait; this.dmgT = 1; this.finished = false; this._mt = 0;
    this.pickNext();
  }
  pickNext() {
    const R = this.rng || Math.random; // online: gerador com semente (zona igual pra todos)
    const ph = this.phases[Math.min(this.phase, this.phases.length - 1)];
    this.nextR = ph.r;
    const maxOff = Math.max(0, Math.min(this.radius, 330) - ph.r);
    for (let i = 0; i < 40; i++) {
      const a = R() * Math.PI * 2, o = Math.sqrt(R()) * maxOff * (this.phase === 0 ? 0.55 : 1);
      const x = this.center.x + Math.cos(a) * o, z = this.center.y + Math.sin(a) * o;
      this.next = new THREE.Vector2(x, z);
      if (LS.World.heightAt(x, z) > 1.5 && Math.hypot(x, z) + ph.r < 380) break;
    }
    this.target = this.next; this.targetR = this.nextR;
  }
  get dps() { return this.phases[Math.min(this.phase, this.phases.length - 1)].dps; }
  isOutside(pos) { return Math.hypot(pos.x - this.center.x, pos.z - this.center.y) > this.radius; }

  // ONLINE: a zona anda pelo relógio da partida (segundos desde o 'go' do servidor), não pelo dt do aparelho. Assim a zona está no mesmo
  // tamanho/lugar pra todo mundo (antes cada aparelho encolhia no seu ritmo: o dano fora da zona e o círculo no mapa não batiam).
  // Os passos são de no máximo 0,25 s: a lógica de fases é a mesma, só roda em pedaços.
  syncTo(matchT, fighters) {
    let d = matchT - this._mt; this._mt = Math.max(this._mt, matchT);
    if (!(d > 0)) { this.update(0, fighters); return; }
    // salto grande (voltou de uma queda de conexão, aba voltou): recupera o estado da zona SEM aplicar de uma vez todo o dano do tempo perdido
    while (d > 1e-6) { const st = Math.min(d, 0.25); this.update(st, d > 2 ? [] : fighters); d -= st; }
  }
  update(dt, fighters) {
    if (!this.finished) {
      this.timer -= dt;
      const ph = this.phases[this.phase];
      if (!this.shrinking && this.timer <= 0) {
        this.shrinking = true; this.timer = ph.shrink + this.timer; // (+ this.timer: leva a sobra do passo pra próxima fase. Sem isso cada troca de fase perdia até um quadro e o resultado dependia do FPS)
        this.startC = this.center.clone(); this.startR = this.radius;
        LS.HUD.centerMsg(this.msgTitle || 'A ZONA ESTÁ ENCOLHENDO!', this.msgSub || 'Vá para a área segura', 3); LS.Audio.alert();
      } else if (this.shrinking) {
        const k = 1 - Math.max(0, this.timer) / ph.shrink;
        this.center.lerpVectors(this.startC, this.next, k);
        this.radius = LS.util.lerp(this.startR, this.nextR, k);
        if (this.timer <= 0) {
          this.shrinking = false; this.phase++;
          if (this.phase >= this.phases.length) { this.finished = true; this.phase = this.phases.length - 1; this.timer = 0; }
          else { this.timer = this.phases[this.phase].wait + this.timer; this.pickNext(); } // (sobra do passo: mesma razão acima)
        }
      }
    }
    // dano fora da zona
    this.dmgT -= dt;
    if (this.dmgT <= 0) {
      this.dmgT = 1;
      for (const f of fighters) {
        if (f.alive && f.state === 'ground' && this.isOutside(f.pos)) {
          f.takeDamage(this.dps, null, false, 'Zona', true);
          if (f.isPlayer) LS.Audio.zoneTick();
        }
      }
    }
    const r = Math.max(this.radius, 0.5);
    this.wall.position.x = this.center.x; this.wall.position.z = this.center.y;
    this.wall.scale.set(r, 1, r); this.wallU.radius.value = Math.max(r, 1); this.wallU.time.value += dt; if (LS.Game && LS.Game.camera) this.wallU.camY.value = LS.Game.camera.position.y;
    this.nextRing.visible = !this.finished && !this.shrinking;
    this.nextRing.position.x = this.next.x; this.nextRing.position.z = this.next.y;
    this.nextRing.scale.set(Math.max(this.nextR, 0.5), 1, Math.max(this.nextR, 0.5));
  }
};
