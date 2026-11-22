// SONS DAS ARMAS (rework): cada categoria tem 3 variações PRÉ-RENDERIZADAS (OfflineAudioContext) de perto e
// 1 estrondo de longe. Na hora do tiro só toca o buffer (leve até com 30 bots atirando), com tom aleatório,
// atraso pela distância (o som viaja a 343 m/s), agudos sumindo de longe, estéreo pelo lado e eco no reverb.
// Recarga, mecânica (ferrolho/bomba), bala passando perto, cápsula caindo e acerto no colete continuam ao vivo.
'use strict';
LS.GUN_PROFILES = {
  //            estalo (Hz, s)       corpo (Hz, s)        cauda (s, Hz)        soco  mecânica   tom de referência
  'Pistola':  { crack: 2600, crackDur: 0.05, body: 170, bodyDur: 0.11, tail: 0.45, tailFreq: 1700, punch: 0.9, mech: 'slide', ref: 900 },
  'SMG':      { crack: 3300, crackDur: 0.04, body: 205, bodyDur: 0.08, tail: 0.35, tailFreq: 2100, punch: 0.75, mech: null, ref: 1200 },
  'Rifle':    { crack: 2300, crackDur: 0.06, body: 112, bodyDur: 0.16, tail: 0.75, tailFreq: 1400, punch: 1.05, mech: null, ref: 800 },
  'Sniper':   { crack: 1800, crackDur: 0.09, body: 68, bodyDur: 0.32, tail: 1.8, tailFreq: 950, punch: 1.35, mech: 'bolt', ref: 500 },
  'Escopeta': { crack: 1150, crackDur: 0.11, body: 58, bodyDur: 0.32, tail: 1.0, tailFreq: 1050, punch: 1.35, mech: 'pump', ref: 340 }
};

Object.assign(LS.Audio, {
  gunBank: {},
  // gera os buffers (uma vez, em segundo plano)
  prepGuns() {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return;
    const sr = this.ctx.sampleRate;
    for (const cat in LS.GUN_PROFILES) {
      const P = LS.GUN_PROFILES[cat], B = this.gunBank[cat] = { near: [], far: null };
      for (let v = 0; v < 3; v++) {
        const len = P.tail + 0.4, oc = new OAC(2, Math.ceil(sr * len), sr);
        this.renderShot(oc, P, v); oc.startRendering().then(buf => { B.near.push(buf); }).catch(() => {});
      }
      const len = P.tail * 1.8 + 0.8, oc = new OAC(2, Math.ceil(sr * len), sr);
      this.renderFar(oc, P); oc.startRendering().then(buf => { B.far = buf; }).catch(() => {});
    }
  },
  // tiro de perto: transiente seco + estalo + corpo grave saturado + cauda (com leve abertura estéreo)
  renderShot(c, P, v) {
    const t = 0.005, r = (a, b) => a + Math.random() * (b - a);
    const sat = c.createGain(); sat.gain.value = 1;
    const sh = c.createWaveShaper(); sh.curve = this.shaperCurve; const so = c.createGain(); so.gain.value = 0.75;
    const merger = c.createChannelMerger(2), L = c.createGain(), R = c.createGain(); L.connect(merger, 0, 0); R.connect(merger, 0, 1); merger.connect(c.destination);
    sat.connect(sh); sh.connect(so); so.connect(L); so.connect(R);
    this.nz(c, sat, t, 0.012, 'highpass', 4500, 0.7, 1.1);                                       // estalo seco do disparo
    this.nz(c, sat, t, P.crackDur * r(0.9, 1.1), 'bandpass', P.crack * r(0.92, 1.08), 1.1, 0.95);  // "crack" característico
    this.os(c, sat, t, 'sine', P.body * 2.6 * r(0.95, 1.05), P.body * 0.42, P.bodyDur, 1.1 * P.punch); // pressão no peito
    this.nz(c, sat, t, P.bodyDur * 1.3, 'lowpass', 420, 0.8, 0.75 * P.punch, 0.002, 120);
    this.os(c, sat, t, 'square', P.crack * 0.18, P.crack * 0.12, 0.03, 0.12);                      // metal da arma
    // cauda: cada lado um pouco diferente (largura estéreo)
    this.nz(c, L, t + 0.008, P.tail * r(0.95, 1.1), 'lowpass', P.tailFreq * r(0.9, 1.1), 0.6, 0.36, 0.02, P.tailFreq * 0.3, this.pinkBuf);
    this.nz(c, R, t + 0.012, P.tail * r(0.95, 1.1), 'lowpass', P.tailFreq * r(0.9, 1.1), 0.6, 0.36, 0.02, P.tailFreq * 0.3, this.pinkBuf);
  },
  // de longe: estrondo abafado que rola (sem o estalo)
  renderFar(c, P) {
    const t = 0.01, out = c.createGain(); out.gain.value = 1; out.connect(c.destination);
    this.os(c, out, t, 'sine', P.body * 1.4, P.body * 0.5, P.bodyDur * 2, 0.7 * P.punch, 0.01);
    this.nz(c, out, t, P.tail * 1.7, 'lowpass', 520, 0.6, 0.8, 0.03, 140, this.pinkBuf);
    this.nz(c, out, t + 0.25, P.tail * 1.2, 'lowpass', 380, 0.6, 0.35, 0.08, 120, this.pinkBuf);       // eco rolando
    this.nz(c, out, t, 0.08, 'bandpass', P.crack * 0.45, 0.9, 0.25, 0.004);
  },
  play(buf, dest, t, rate, gain) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(dest); s.start(t);
  },
  // cliques metálicos da ação da arma
  _mech(kind, t, dest, vol) {
    const c = this.ctx, click = (dt, f, v) => { this.nz(c, dest, t + dt, 0.035, 'bandpass', f, 6, v * vol); this.os(c, dest, t + dt, 'square', f * 0.5, f * 0.4, 0.02, v * vol * 0.3); };
    if (kind === 'bolt') { click(0.55, 2400, 0.35); click(0.72, 1800, 0.4); click(0.95, 2600, 0.35); click(1.08, 2000, 0.45); }
    else if (kind === 'pump') { this.nz(c, dest, t + 0.42, 0.12, 'bandpass', 900, 2, 0.45 * vol); click(0.52, 1500, 0.5); this.nz(c, dest, t + 0.6, 0.1, 'bandpass', 1200, 2, 0.4 * vol); click(0.68, 2200, 0.5); }
    else if (kind === 'slide') click(0.04, 3200, 0.15);
  },

  gunshot(wdef, distance, pan) {
    if (!this.ctx) return;
    const c = this.ctx, P = LS.GUN_PROFILES[wdef.cat] || LS.GUN_PROFILES.Rifle, B = this.gunBank[wdef.cat] || {};
    const d = distance || 0, far = LS.util.clamp(d / 280, 0, 1);
    const atten = distance === undefined ? 1 : Math.pow(1 - far, 1.5);
    if (atten < 0.01) return;
    const t = c.currentTime + (distance ? d / 343 : 0) + 0.002, vol = wdef.snd.vol;
    const rate = LS.util.clamp(wdef.snd.freq / P.ref, 0.82, 1.25) * this.rnd(0.96, 1.04); // cada arma no seu tom, cada tiro um pouco diferente
    const out = c.createGain(); out.gain.value = atten;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 19000 - far * 17200; out.connect(lp);
    let last = lp;
    if (c.createStereoPanner && pan !== undefined) { const p = c.createStereoPanner(); p.pan.value = LS.util.clamp(pan, -1, 1); lp.connect(p); last = p; }
    last.connect(this.sfx);
    const rv = c.createGain(); rv.gain.value = 0.35 + far * 0.6; last.connect(rv); rv.connect(this.reverb);
    if (B.near && B.near.length) {
      this.play(B.near[Math.floor(Math.random() * B.near.length)], out, t, rate, vol * 1.15 * (1 - far * 0.85));
      if (B.far && far > 0.08) this.play(B.far, out, t + 0.02, rate * 0.97, vol * 1.3 * Math.min(1, far * 2.2));
    } else { // os buffers ainda não ficaram prontos (primeiros segundos): versão ao vivo simples
      this.nz(c, out, t, P.crackDur, 'bandpass', P.crack, 1.1, vol);
      this.os(c, out, t, 'sine', P.body * 2.4, P.body * 0.45, P.bodyDur, vol * P.punch);
      this.nz(c, out, t, P.tail, 'lowpass', P.tailFreq, 0.6, vol * 0.4, 0.02);
    }
    if (d < 40) this._mech(P.mech, t, out, (1 - d / 40) * 0.9); // ferrolho / bomba só de perto
  },

  reload(wdef) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, T = wdef.reload, out = this.sfx;
    // "clack" metálico: ruído ressonante + um parcial e uma pancadinha grave
    const clk = (dt, f, v, dur) => { this.nz(c, out, t + dt, dur || 0.04, 'bandpass', f * this.rnd(0.95, 1.05), 7, v); this.os(c, out, t + dt, 'triangle', f * 0.55, f * 0.5, 0.04, v * 0.3); this.os(c, out, t + dt, 'sine', 180, 110, 0.04, v * 0.4); };
    if (wdef.cat === 'Escopeta') {
      const n = Math.max(1, Math.min(wdef.mag, 6)), step = (T - 0.4) / n;
      for (let i = 0; i < n; i++) { this.nz(c, out, t + 0.15 + i * step, 0.08, 'bandpass', 700, 2, 0.3); clk(0.2 + i * step, 1800, 0.3); }
      this._mech('pump', t + T - 0.75, out, 0.9);
    } else if (wdef.cat === 'Sniper') {
      clk(0.1, 2200, 0.3); clk(0.25, 1700, 0.35);
      this.nz(c, out, t + T * 0.45, 0.12, 'bandpass', 1100, 3, 0.3); clk(T * 0.5, 2000, 0.4);
      clk(T - 0.4, 2400, 0.35); clk(T - 0.25, 1800, 0.45);
    } else {
      // solta o pente (desliza), o pente novo entra (encaixa), puxa o ferrolho
      clk(0.08, 2000, 0.3); this.nz(c, out, t + 0.12, 0.18, 'bandpass', 650, 2, 0.15, 0.01, 350);
      this.nz(c, out, t + T * 0.5, 0.08, 'bandpass', 900, 3, 0.25, 0.005, 1400); clk(T * 0.62, 1600, 0.45, 0.05);
      clk(T - 0.22, 2600, 0.35); clk(T - 0.12, 2100, 0.5);
    }
  },
  // bala no colete/capacete: "tim" metálico
  armorHit() { if (!this.ctx) return; const c = this.ctx, t = this.now(); this.metal(c, this.ui, t, 2600, [[1, 1, 0.14], [1.52, 0.6, 0.1], [2.21, 0.4, 0.07]], 0.12); this.nz(c, this.ui, t, 0.04, 'highpass', 5000, 1, 0.16); },
  // bala passando perto: assobio com efeito doppler + estalo supersônico
  whiz(pan) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime; let dest = this.sfx;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.setValueAtTime(LS.util.clamp((pan || 0) - 0.5, -1, 1), t); p.pan.linearRampToValueAtTime(LS.util.clamp((pan || 0) + 0.5, -1, 1), t + 0.16); p.connect(this.sfx); dest = p; }
    this.nz(c, dest, t, 0.16, 'bandpass', 5200, 4, 0.24, 0.03, 1500);
    this.nz(c, dest, t, 0.01, 'highpass', 7000, 0.7, 0.18);
  },
  shellDrop(distance) {
    if (!this.ctx || (distance || 0) > 15) return;
    const c = this.ctx, t = c.currentTime + 0.35 + Math.random() * 0.1, v = 0.08 * (1 - (distance || 0) / 15);
    this.metal(c, this.sfx, t, 4100, [[1, 1, 0.06], [1.4, 0.5, 0.04]], v); this.metal(c, this.sfx, t + 0.09, 4500, [[1, 1, 0.04]], v * 0.6);
  }
});
