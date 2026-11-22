// Entrada de teclado e mouse (pointer lock)
'use strict';
LS.Input = {
  keys: {}, pressed: {}, mouse: { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 },
  locked: false, enabled: false, onUnlock: null, lockT: 0,

  init(canvasEl) {
    this.canvas = canvasEl;
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (LS.Console && LS.Console.open) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.left = this.mouse.right = false; });
    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      // logo depois de prender o mouse o navegador às vezes manda um "pulo" enorme (a câmera virava sozinha): ignora
      if (performance.now() - this.lockT < 120 || Math.abs(e.movementX) > 500 || Math.abs(e.movementY) > 500) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });
    document.addEventListener('mousedown', e => {
      if (!this.enabled || (LS.Console && LS.Console.open) || (LS.Touch && LS.Touch.active)) return; // celular: os botões de toque cuidam disso
      if (!this.locked) { this.lock(); return; }
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    document.addEventListener('wheel', e => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked && !was) this.lockT = performance.now();
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
  },

  lock() {
    if (LS.Touch && LS.Touch.active) return; // celular não tem mouse preso
    if (this.canvas && this.canvas.requestPointerLock) {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { /* usuário precisa clicar novamente */ });
    }
  },
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); },

  wasPressed(code) { return !!this.pressed[code]; },
  // chamado no fim de cada frame
  endFrame() {
    this.pressed = {};
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0; this.mouse.leftPressed = false;
  }
};
