// Sons sintetizados com Web Audio API (nenhum arquivo externo)
'use strict';
LS.Audio = {
  ctx: null, master: null, noiseBuf: null, loops: {},

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = LS.settings.volume;
    this.master.connect(this.ctx.destination);
    // buffer de ruído branco reutilizável
    const len = this.ctx.sampleRate * 1.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },

  setVolume(v) { if (this.master) this.master.gain.value = v; },

  _noise(dur, filterType, freq, q, vol, when, dest) {
    const c = this.ctx, t = when || c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  },

  _tone(type, f0, f1, dur, vol, when, dest) {
    const c = this.ctx, t = when || c.currentTime;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  // volume por distância (som 3D simplificado) + pan estéreo
  _spatial(distance, pan) {
    const c = this.ctx;
    const g = c.createGain();
    const atten = distance === undefined ? 1 : LS.util.clamp(1 - distance / 220, 0, 1);
    g.gain.value = atten * atten;
    if (c.createStereoPanner && pan !== undefined) {
      const p = c.createStereoPanner(); p.pan.value = LS.util.clamp(pan, -1, 1);
      g.connect(p); p.connect(this.master);
    } else g.connect(this.master);
    return { node: g, atten };
  },

  gunshot(wdef, distance, pan) {
    if (!this.ctx) return;
    const s = wdef.snd;
    const sp = this._spatial(distance, pan);
    if (sp.atten <= 0.01) return;
    // estalo + corpo grave + cauda; tiros distantes ficam abafados
    const far = distance ? LS.util.clamp(distance / 200, 0, 1) : 0;
    this._noise(s.dur, 'bandpass', s.freq * (1 - far * 0.6), 0.8, s.vol, 0, sp.node);
    this._noise(s.dur * 2.2, 'lowpass', 900 - far * 500, 0.5, s.vol * 0.6, 0, sp.node);
    this._tone('sine', s.body * 1.8, s.body * 0.4, s.dur * 1.2, s.vol * 0.9, 0, sp.node);
  },

  reload(wdef) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone('square', 1800, 900, 0.04, 0.12, t);
    this._noise(0.06, 'highpass', 3000, 1, 0.25, t + 0.05);
    this._tone('square', 1400, 700, 0.05, 0.12, t + wdef.reload * 0.7);
    this._noise(0.08, 'highpass', 2500, 1, 0.3, t + wdef.reload * 0.7 + 0.04);
    this._tone('square', 2200, 1200, 0.03, 0.15, t + wdef.reload - 0.1);
  },

  empty() { if (this.ctx) this._tone('square', 2400, 2000, 0.03, 0.1); },
  footstep(vol) { if (this.ctx) this._noise(0.07, 'lowpass', 600, 1, 0.12 * (vol || 1)); },
  jump() { if (this.ctx) this._noise(0.12, 'lowpass', 500, 1, 0.15); },
  land() { if (this.ctx) { this._noise(0.15, 'lowpass', 300, 1, 0.35); } },
  hitmarker(head) { if (this.ctx) this._tone('triangle', head ? 2400 : 1600, head ? 2000 : 1300, 0.06, 0.25); },
  hurt() { if (this.ctx) { this._noise(0.15, 'bandpass', 400, 2, 0.4); this._tone('sawtooth', 160, 80, 0.15, 0.15); } },
  pickup() { if (this.ctx) { const t = this.ctx.currentTime; this._tone('sine', 700, 900, 0.07, 0.2, t); this._tone('sine', 1100, 1300, 0.08, 0.18, t + 0.07); } },
  heal() { if (this.ctx) { const t = this.ctx.currentTime; this._tone('sine', 500, 1000, 0.3, 0.2, t); } },
  zoneTick() { if (this.ctx) this._tone('sawtooth', 120, 90, 0.2, 0.18); },
  kill() { if (this.ctx) { const t = this.ctx.currentTime; this._tone('triangle', 900, 900, 0.08, 0.25, t); this._tone('triangle', 1350, 1350, 0.15, 0.25, t + 0.08); } },
  alert() { if (this.ctx) { const t = this.ctx.currentTime; for (let i = 0; i < 3; i++) this._tone('square', 880, 880, 0.12, 0.12, t + i * 0.22); } },
  click() { if (this.ctx) this._tone('square', 1200, 800, 0.03, 0.08); },
  victory() { if (this.ctx) { const t = this.ctx.currentTime; [523, 659, 784, 1046].forEach((f, i) => this._tone('triangle', f, f, 0.4, 0.25, t + i * 0.15)); } },
  death() { if (this.ctx) { const t = this.ctx.currentTime; this._noise(0.6, 'lowpass', 160, 1, 0.55); this._tone('sine', 180, 42, 1.1, 0.4); this._tone('triangle', 520, 260, 0.5, 0.08, t + 0.05); } },
  defeat() { if (this.ctx) { const t = this.ctx.currentTime; [392, 330, 262].forEach((f, i) => this._tone('triangle', f, f * 0.98, 0.5, 0.25, t + i * 0.25)); } },

  // som contínuo (avião / vento do paraquedas)
  startLoop(name, type) {
    if (!this.ctx || this.loops[name]) return;
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(type === 'plane' ? 0.18 : 0.12, c.currentTime + 0.5);
    g.connect(this.master);
    const nodes = [];
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = type === 'plane' ? 300 : 900;
    src.connect(f); f.connect(g); src.start(); nodes.push(src);
    if (type === 'plane') {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 62;
      const og = c.createGain(); og.gain.value = 0.25; o.connect(og); og.connect(g); o.start(); nodes.push(o);
    }
    this.loops[name] = { g, nodes };
  },
  stopLoop(name) {
    const l = this.loops[name]; if (!l) return;
    const c = this.ctx;
    l.g.gain.cancelScheduledValues(c.currentTime);
    l.g.gain.setValueAtTime(l.g.gain.value, c.currentTime);
    l.g.gain.linearRampToValueAtTime(0, c.currentTime + 0.4);
    l.nodes.forEach(n => n.stop(c.currentTime + 0.5));
    delete this.loops[name];
  },
  stopAll() { Object.keys(this.loops).forEach(k => this.stopLoop(k)); }
};
