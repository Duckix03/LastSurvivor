// Pós-processamento leve (1 passe de tela, sem desenhar a cena de novo): oclusão de ambiente pela profundidade
// (escurece cantos, frestas e a base das paredes), contorno suave nas bordas, vinheta e anti-serrilhado.
// A cena é desenhada numa textura com profundidade e depois um único shader de tela faz tudo.
'use strict';
LS.Post = {
  rt: null, quad: null,
  enabled() {
    const s = LS.settings;
    return s.postfx !== false && s.quality !== 'low' && !s.perfMode && this.ok !== false;
  },
  init(renderer) {
    this.renderer = renderer;
    // precisa de textura de profundidade (WebGL2 ou extensão no WebGL1)
    this.ok = renderer.capabilities.isWebGL2 || !!renderer.extensions.get('WEBGL_depth_texture');
    if (!this.ok) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: false });
    this.rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    const AO_N = LS.Touch && LS.Touch.detect() ? 8 : 16; // celular: metade das amostras de oclusão (o efeito mais caro da tela)
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture },
        res: { value: new THREE.Vector2(size.x, size.y) }, near: { value: 0.25 }, far: { value: 1000 },
        projScale: { value: 500 }, aoStrength: { value: 1.15 }, edge: { value: 0.38 }, vignette: { value: 0.16 }, fogFar: { value: 400 },
      },
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: '#define AO_N ' + AO_N + '\n' + `
        uniform sampler2D tColor, tDepth; uniform vec2 res; uniform float near, far, projScale, aoStrength, edge, vignette, fogFar;
        varying vec2 vUv;
        float lin(float d){ float z = d * 2.0 - 1.0; return (2.0 * near * far) / (far + near - z * (far - near)); }
        float depthAt(vec2 uv){ return lin(texture2D(tDepth, uv).x); }
        float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
        float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); } // ruído suave (sem granulado)
        void main(){
          vec2 px = 1.0 / res;
          // ---- anti-serrilhado simples (borda pelo brilho: mistura na direção da borda) ----
          vec3 cM = texture2D(tColor, vUv).rgb;
          float lM = luma(cM), lN = luma(texture2D(tColor, vUv + vec2(0.0, px.y)).rgb), lS = luma(texture2D(tColor, vUv - vec2(0.0, px.y)).rgb);
          float lE = luma(texture2D(tColor, vUv + vec2(px.x, 0.0)).rgb), lW = luma(texture2D(tColor, vUv - vec2(px.x, 0.0)).rgb);
          float lMin = min(lM, min(min(lN, lS), min(lE, lW))), lMax = max(lM, max(max(lN, lS), max(lE, lW)));
          vec3 col = cM;
          if (lMax - lMin > max(0.05, lMax * 0.12)) {
            vec2 dir = vec2(-(lN - lS), lE - lW);                // ao longo da borda
            dir = normalize(dir + 1e-5) * px * 0.75;
            col = (texture2D(tColor, vUv + dir).rgb + texture2D(tColor, vUv - dir).rgb + cM * 2.0) * 0.25;
          }
          float raw = texture2D(tDepth, vUv).x;
          if (raw < 1.0) {
            float z = lin(raw);
            float dN = depthAt(vUv + vec2(0.0, px.y)), dS = depthAt(vUv - vec2(0.0, px.y)), dE = depthAt(vUv + vec2(px.x, 0.0)), dW = depthAt(vUv - vec2(px.x, 0.0));
            // inclinação da superfície (por pixel): usa o lado mais suave, pra não errar nas bordas
            float gx = abs(dE - z) < abs(z - dW) ? dE - z : z - dW, gy = abs(dN - z) < abs(z - dS) ? dN - z : z - dS;
            // ---- oclusão de ambiente: 16 amostras em espiral FIXA (sem ruído/granulado); só conta o que fica NA FRENTE
            //      do plano da superfície e com uma folga que cresce com a distância (dobrinhas do terreno não contam) ----
            // rotação do padrão em 2x2 pixels (4 ângulos): não forma cópias da silhueta e não fica granulado
            vec2 cell = mod(floor(gl_FragCoord.xy), 2.0);
            float rad = clamp(0.45 * projScale / z, 2.0, 40.0), occ = 0.0, ang = (cell.x * 2.0 + cell.y) * 1.5708;
            float th0 = 0.03 + z * 0.012, th1 = 0.18 + z * 0.01;
            for (int i = 0; i < AO_N; i++) {
              float fi = float(i) + 1.0;
              ang += 2.39996 * (16.0 / float(AO_N));
              vec2 op = vec2(cos(ang), sin(ang)) * rad * sqrt(fi / float(AO_N));   // em pixels
              float expect = z + op.x * gx + op.y * gy;                       // onde o próprio plano estaria
              float d = expect - depthAt(vUv + op * px);                      // > 0: algo na frente (canto/fresta)
              occ += smoothstep(th0, th1, d) * (1.0 - smoothstep(0.3, 0.55, d)); // só contato (sem "aura" atrás de quem está na frente)
            }
            float ao = clamp(1.0 - (occ / float(AO_N)) * 0.8 * aoStrength, 0.35, 1.0);
            // ---- contorno suave: bordas de profundidade, só de perto (de longe vira serrilhado no morro) ----
            float jump = max(max(abs(dN - z), abs(dS - z)), max(abs(dE - z), abs(dW - z))) / z;
            float ed = smoothstep(0.06, 0.16, jump) * edge * (1.0 - smoothstep(18.0, 55.0, z));
            float fade = 1.0 - smoothstep(25.0, min(90.0, fogFar * 0.5), z);  // efeito só perto, some aos poucos
            col *= mix(1.0, ao * (1.0 - ed), fade);
          }
          // ---- vinheta ----
          vec2 q = vUv - 0.5; col *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); this.quad.frustumCulled = false;
    this.qScene = new THREE.Scene(); this.qScene.add(this.quad); this.qCam = new THREE.Camera();
  },
  resize() {
    if (!this.rt) return;
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (s.x === this.rt.width && s.y === this.rt.height) return;
    this.rt.setSize(s.x, s.y); this.mat.uniforms.res.value.set(s.x, s.y);
  },
  render(scene, camera) {
    const r = this.renderer;
    if (!this.rt || !this.enabled()) { r.render(scene, camera); return; }
    this.resize();
    const U = this.mat.uniforms;
    U.near.value = camera.near; U.far.value = camera.far;
    U.projScale.value = this.rt.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    U.fogFar.value = scene.fog ? scene.fog.far : 400;
    r.setRenderTarget(this.rt); r.render(scene, camera);
    r.setRenderTarget(null); r.render(this.qScene, this.qCam);
  },
};
