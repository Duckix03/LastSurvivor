// MÚSICA DO LOBBY: faixa original gerada na hora (Web Audio), 104 BPM em Lá menor.
// Lá m – Fá – Dó – Sol, 16 compassos que se repetem:
//   1–4 abertura (pad + chimbal + arpejo leve) · 5–12 completa (bumbo, palma, baixo "pulsando" e arpejo com eco)
//   13–14 respiro (sem bumbo) · 15–16 volta com virada e subida de ruído
// Toca no menu e no guarda-roupa; com um painel aberto fica abafada; some quando a partida começa.
'use strict';
LS.Music = {
  BPM: 104, playing: false, step: 0, nextT: 0,
  CHORDS: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], // Lá m, Fá, Dó, Sol (MIDI)
  init(ctx, master) {
    this.ctx = ctx; this.A = LS.Audio;
    this.vol = ctx.createGain(); this.vol.gain.value = 0;
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 20000; this.tone.Q.value = 0.5;
    this.vol.connect(this.tone); this.tone.connect(master);
    this.bus = ctx.createGain(); this.bus.gain.value = 0.55; this.bus.connect(this.vol);
    this.duck = ctx.createGain(); this.duck.connect(this.bus); // baixo e pad "respiram" com o bumbo
    // eco do arpejo (3/16 com retorno)
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 60 / this.BPM * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.38; const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2600;
    this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay); dl.connect(this.bus);
    this.rev = ctx.createGain(); this.rev.gain.value = 0.25; this.rev.connect(this.A.reverb);
    this.sync();
  },
  hz(m) { return 440 * Math.pow(2, (m - 69) / 12); },
  vol01() { const s = LS.settings; return s.muted ? 0 : (s.musicVol === undefined ? 0.5 : s.musicVol); },
  // liga/desliga conforme a tela (chamado pelo jogo de tempos em tempos)
  sync() {
    if (!this.ctx) return;
    const G = LS.Game, on = !!G && (G.state === 'menu' || G.state === 'lobby') && this.vol01() > 0 && !document.hidden;
    if (on && !this.playing) this.start(); else if (!on && this.playing) this.stop();
    if (this.playing) {
      const t = this.ctx.currentTime, covered = LS.UI && LS.UI.subPanelOpen();
      this.vol.gain.setTargetAtTime(this.vol01() * 0.9, t, 0.4);
      this.tone.frequency.setTargetAtTime(covered ? 1100 : 20000, t, covered ? 0.15 : 0.4); // painel aberto: abafa
    }
  },
  start() {
    this.playing = true; this.step = 0; this.bar = 0; this.nextT = this.ctx.currentTime + 0.1;
    this.vol.gain.cancelScheduledValues(this.ctx.currentTime); this.vol.gain.setValueAtTime(0, this.ctx.currentTime);
    this.vol.gain.linearRampToValueAtTime(this.vol01() * 0.9, this.ctx.currentTime + 2.5);
    clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 25);
  },
  stop() {
    this.playing = false; clearInterval(this.timer);
    const t = this.ctx.currentTime; this.vol.gain.cancelScheduledValues(t); this.vol.gain.setValueAtTime(this.vol.gain.value, t); this.vol.gain.linearRampToValueAtTime(0, t + 0.8);
  },
  // agenda as próximas notas um pouquinho à frente (relógio do áudio, não do JS: não atrasa)
  tick() {
    const sd = 60 / this.BPM / 4;
    if (this.nextT < this.ctx.currentTime - 0.1) this.nextT = this.ctx.currentTime + 0.05; // travou um pouco: não toca tudo atrasado de uma vez
    if (this.nextT < this.ctx.currentTime - 0.1) this.nextT = this.ctx.currentTime + 0.05; // travou um pouco: não toca tudo atrasado de uma vez
    while (this.nextT < this.ctx.currentTime + 0.2) {
      const swing = this.step % 2 ? sd * 0.08 : 0; // um tiquinho de balanço
      this.play(this.step, this.nextT + swing);
      this.nextT += sd; this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar = (this.bar + 1) % 16;
    }
  },
  play(s, t) {
    const A = this.A, c = this.ctx, bar = this.bar, ch = this.CHORDS[bar % 4], sec = bar < 4 ? 'intro' : bar < 12 ? 'full' : bar < 14 ? 'break' : 'build';
    const drums = sec === 'full' || sec === 'build';
    // ---- bateria ----
    if (drums && [0, 6, 8, 11].includes(s)) this.kick(t);
    if (drums && (s === 4 || s === 12)) this.clap(t);
    if (sec === 'build' && bar === 15 && s >= 12) this.clap(t, 0.5 + (s - 12) * 0.15); // virada
    if (s % 2 === 0) A.nz(c, this.bus, t, 0.03, 'highpass', 8000, 0.7, s % 4 === 2 ? 0.08 : 0.045);          // chimbal fechado
    if (s === 14 && sec !== 'intro') A.nz(c, this.bus, t, 0.22, 'highpass', 7000, 0.7, 0.05);                  // chimbal aberto
    if (sec === 'build' && bar === 15 && s === 0) A.nz(c, this.bus, t, 60 / this.BPM * 4, 'bandpass', 600, 1, 0.12, 1.5, 7000, A.pinkBuf); // subida
    // ---- pad (acorde do compasso) ----
    if (s === 0) for (const m of ch) for (const det of [-7, 7]) this.pad(this.hz(m + 12) * Math.pow(2, det / 1200), t, 60 / this.BPM * 4);
    // ---- baixo ----
    if (sec !== 'intro' && sec !== 'break' && [0, 3, 6, 8, 11, 14].includes(s)) this.bass(this.hz(ch[0] - 24 + (s === 6 || s === 14 ? 12 : 0)), t);
    if (sec === 'break' && s === 0) this.bass(this.hz(ch[0] - 24), t, 1.6);
    // ---- arpejo (notas do acorde, com eco) ----
    const pat = sec === 'intro' ? [0, 6, 10] : bar % 8 < 4 ? [0, 3, 6, 8, 10, 13] : [0, 2, 4, 7, 9, 12, 14];
    if (pat.includes(s)) { const notes = [ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1] + 12], m = notes[pat.indexOf(s) % notes.length] + 12; this.pluck(this.hz(m), t); }
  },
  kick(t) {
    const A = this.A, c = this.ctx;
    A.os(c, this.bus, t, 'sine', 155, 44, 0.32, 0.85, 0.002); A.nz(c, this.bus, t, 0.012, 'highpass', 3000, 0.7, 0.12);
    // ducking: baixo e pad abaixam e voltam (aquele "respirar")
    const g = this.duck.gain; g.cancelScheduledValues(t); g.setValueAtTime(0.35, t); g.linearRampToValueAtTime(1, t + 0.22);
  },
  clap(t, v) {
    const A = this.A, c = this.ctx, k = v || 1;
    for (let i = 0; i < 3; i++) A.nz(c, this.bus, t + i * 0.009, 0.05, 'bandpass', 1500, 1.2, 0.16 * k);
    A.nz(c, this.bus, t + 0.02, 0.18, 'bandpass', 1300, 0.9, 0.09 * k); A.nz(c, this.rev, t, 0.2, 'bandpass', 1500, 1, 0.12 * k);
  },
  pad(f, t, dur) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(700, t); lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.6); lp.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.028, t + 0.6); g.gain.setValueAtTime(0.028, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2);
    o.connect(lp); lp.connect(g); g.connect(this.duck); g.connect(this.rev); o.start(t); o.stop(t + dur + 0.3);
  },
  bass(f, t, len) {
    const c = this.ctx, d = len || 0.24, o = c.createOscillator(), o2 = c.createOscillator(); o.type = 'sawtooth'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(180, t + d);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const g2 = c.createGain(); g2.gain.value = 0.9;
    o.connect(lp); lp.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.duck); o.start(t); o2.start(t); o.stop(t + d + 0.05); o2.stop(t + d + 0.05);
  },
  pluck(f, t) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3800, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.2);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(lp); lp.connect(g); g.connect(this.bus); g.connect(this.delay); o.start(t); o.stop(t + 0.3);
  }
};
// app em segundo plano / aba escondida: silencia (e para de agendar notas)
document.addEventListener('visibilitychange', () => {
  const A = LS.Audio; if (!A.ctx) return;
  if (document.hidden) A.ctx.suspend(); else if (!(LS.Game && LS.Game.state === 'paused' && !LS.Net.online)) A.ctx.resume();
  LS.Music.sync();
});
