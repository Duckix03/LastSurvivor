// HUD PERSONALIZADO (celular): arrastar cada botão/bloco da HUD, mudar tamanho e opacidade.
//  - O layout fica em LS.settings.hud = { v: 1, it: { id: [dx, dy, tamanho, opacidade] } }
//    dx/dy em milésimos da tela (vale em qualquer celular), tamanho e opacidade em %.
//  - Vai junto com as configurações (navegador + conta).
//  - CÓDIGO DO HUD: um texto curto pra copiar e mandar pros amigos (ou colar o de alguém).
'use strict';
LS.HudEdit = {
  ITEMS: [
    { id: 'fire', name: 'Atirar' }, { id: 'fire2', name: 'Atirar (esquerda)' }, { id: 'aim', name: 'Mirar' }, { id: 'jump', name: 'Pular' },
    { id: 'crouch', name: 'Agachar' }, { id: 'reload', name: 'Recarregar' }, { id: 'med', name: 'Kit médico' }, { id: 'band', name: 'Bandagem' },
    { id: 'gel', name: 'Bola de gelo' }, { id: 'use', name: 'Pegar' }, { id: 'zoom', name: 'Zoom da luneta' }, { id: 'run', name: 'Correr' },
    { id: 'bag', name: 'Mochila' }, { id: 'map', name: 'Mapa' }, { id: 'pause', name: 'Pausa' }, { id: 'joy', name: 'Joystick' },
    { id: 'minimap-wrap', name: 'Minimapa', hud: 1 }, { id: 'top-left', name: 'Vivos / abates / tempo', hud: 1 }, { id: 'bottom-left', name: 'Vida e itens', hud: 1 },
    { id: 'weapon-slots', name: 'Armas', hud: 1 }, { id: 'ammo-box', name: 'Munição', hud: 1 }, { id: 'killfeed', name: 'Abates (feed)', hud: 1 }, { id: 'squad', name: 'Esquadrão', hud: 1 }
  ],
  draft: null, sel: null, open: false,

  el(id) { return id === 'joy' ? document.getElementById('joy') : this.byId(id) && this.byId(id).hud ? document.getElementById(id) : document.querySelector('#touch-ui [data-tb="' + id + '"]'); },
  byId(id) { return this.ITEMS.find(i => i.id === id); },
  layout() { const h = this.open ? this.draft : LS.settings.hud; return (h && h.it) || {}; },

  // aplica o layout nos elementos (só no celular)
  apply() {
    if (!LS.Touch || !LS.Touch.active) return;
    const L = this.layout(), W = window.innerWidth, H = window.innerHeight;
    for (const it of this.ITEMS) {
      const el = this.el(it.id); if (!el) continue;
      const v = L[it.id];
      if (!v) { el.classList.remove('hud-ed'); el.style.translate = ''; el.style.scale = ''; el.style.removeProperty('--ho'); continue; }
      el.classList.add('hud-ed');
      el.style.translate = (v[0] * W / 1000).toFixed(1) + 'px ' + (v[1] * H / 1000).toFixed(1) + 'px';
      el.style.scale = (v[2] / 100).toFixed(2);
      el.style.setProperty('--ho', (v[3] / 100).toFixed(2));
    }
  },
  init() {
    window.addEventListener('resize', () => { this.apply(); if (this.open) this.drawSel(); });
    this.apply();
  },

  // ---------- código do HUD (copiar / colar) ----------
  encode(h) {
    const it = (h && h.it) || {}, parts = [];
    for (const k of Object.keys(it)) if (this.byId(k)) parts.push(k + ':' + it[k].map(n => Math.round(n)).join(','));
    return 'LSHUD1.' + btoa(unescape(encodeURIComponent(parts.join(';')))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(code) {
    const m = /^\s*LSHUD1\.([A-Za-z0-9_-]{0,1400})\s*$/.exec(String(code || ''));
    if (!m) return null;
    let txt; try { txt = decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))); } catch (e) { return null; }
    const it = {};
    if (txt) for (const p of txt.split(';')) {
      const [k, v] = p.split(':'); if (!this.byId(k) || !v) return null;
      const n = v.split(',').map(Number); if (n.length !== 4 || n.some(x => !isFinite(x))) return null;
      it[k] = this.clampV(n);
    }
    return { v: 1, it };
  },
  clampV(n) { const c = (x, a, b) => Math.max(a, Math.min(b, Math.round(x))); return [c(n[0], -1000, 1000), c(n[1], -1000, 1000), c(n[2], 40, 200), c(n[3], 15, 100)]; },

  // ---------- editor ----------
  start() {
    if (!LS.Touch.active) { LS.Party && LS.Party.toast ? LS.Party.toast('O editor de HUD é pro celular.') : alert('O editor de HUD é pro celular.'); return; }
    const G = LS.Game;
    this.prevScreen = LS.UI.current; this.hudWas = !document.getElementById('hud').classList.contains('hidden');
    this.draft = JSON.parse(JSON.stringify(LS.settings.hud || { v: 1, it: {} })); if (!this.draft.it) this.draft.it = {};
    this.open = true; this.sel = null; this.codeOpen = false;
    LS.UI.showScreen(null); LS.HUD.show(true);
    document.body.classList.add('hud-editing');
    let box = document.getElementById('hud-edit');
    if (!box) { box = document.createElement('div'); box.id = 'hud-edit'; document.body.appendChild(box); this.bind(box); }
    box.classList.remove('hidden');
    this.render(); this.apply();
  },
  finish(save) {
    if (!this.open) return;
    if (save) { LS.settings.hud = this.draft; LS.saveSettings(); }
    this.open = false; this.draft = null; this.sel = null;
    document.body.classList.remove('hud-editing');
    document.getElementById('hud-edit').classList.add('hidden');
    this.apply();
    if (!this.hudWas) LS.HUD.show(false);
    if (this.prevScreen) LS.UI.showScreen(this.prevScreen);
    if (save && LS.Party && LS.Party.toast) LS.Party.toast('HUD salvo!');
  },
  // o que está embaixo do dedo: o menor bloco que contém o ponto (botões ganham dos blocos grandes)
  pick(x, y) {
    let best = null, area = Infinity;
    for (const it of this.ITEMS) {
      const el = this.el(it.id); if (!el || !el.offsetParent && el.id !== 'joy') continue;
      const r = el.getBoundingClientRect(); if (!r.width) continue;
      if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) { const a = r.width * r.height * (it.hud ? 4 : 1); if (a < area) { area = a; best = it.id; } }
    }
    return best;
  },
  val(id) { return this.draft.it[id] || [0, 0, 100, 100]; },
  set(id, v) { this.draft.it[id] = this.clampV(v); if (v[0] === 0 && v[1] === 0 && v[2] === 100 && v[3] === 100) delete this.draft.it[id]; this.apply(); this.drawSel(); },
  bind(box) {
    box.addEventListener('pointerdown', e => {
      if (e.target.closest('.he-bar, .he-code')) return;
      e.preventDefault();
      const id = this.pick(e.clientX, e.clientY);
      this.sel = id; this.render();
      if (!id) return;
      const v = this.val(id);
      this.drag = { id, x: e.clientX, y: e.clientY, v0: v.slice(), r0: this.el(id).getBoundingClientRect() };
      try { box.setPointerCapture(e.pointerId); } catch (er) { }
    });
    box.addEventListener('pointermove', e => {
      const d = this.drag; if (!d) return;
      const W = window.innerWidth, H = window.innerHeight;
      let dx = e.clientX - d.x, dy = e.clientY - d.y;
      dx = Math.max(-d.r0.left, Math.min(W - d.r0.right, dx)); dy = Math.max(-d.r0.top, Math.min(H - d.r0.bottom, dy)); // não sai da tela
      const v = this.val(d.id);
      this.set(d.id, [d.v0[0] + dx / W * 1000, d.v0[1] + dy / H * 1000, v[2], v[3]]);
    });
    const up = () => { if (this.drag) { this.drag = null; this.renderBar(); } };
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    box.addEventListener('input', e => {
      const id = this.sel; if (!id) return;
      const v = this.val(id);
      if (e.target.id === 'he-size') { v[2] = +e.target.value; } else if (e.target.id === 'he-alpha') { v[3] = +e.target.value; } else return;
      this.set(id, v); this.renderVals();
    });
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-he]'); if (!b) return;
      LS.Audio.click();
      const a = b.dataset.he;
      if (a === 'save') this.finish(true);
      else if (a === 'cancel') this.finish(false);
      else if (a === 'one' && this.sel) { delete this.draft.it[this.sel]; this.apply(); this.render(); }
      else if (a === 'all') { if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'CERTEZA?'; return; } this.draft.it = {}; this.sel = null; this.apply(); this.render(); }
      else if (a === 'code') { this.codeOpen = !this.codeOpen; this.render(); }
      else if (a === 'copy') { const t = document.getElementById('he-mycode'); t.select(); try { navigator.clipboard.writeText(t.value); } catch (er) { try { document.execCommand('copy'); } catch (er2) { } } this.note('Código copiado! Mande pros amigos.'); }
      else if (a === 'paste') {
        const h = this.decode(document.getElementById('he-incode').value);
        if (!h) { this.note('Código inválido. Ele começa com LSHUD1.', true); return; }
        this.draft = h; this.sel = null; this.codeOpen = false; this.apply(); this.render(); this.note('HUD do código aplicado! Toque em SALVAR pra manter.');
      }
    });
  },
  note(t, bad) { const n = document.getElementById('he-note'); if (n) { n.textContent = t; n.className = 'he-note' + (bad ? ' bad' : ''); } },
  render() {
    const box = document.getElementById('hud-edit'); if (!box) return;
    box.innerHTML = '<div id="he-sel" class="hidden"></div><div class="he-bar"></div>' + (this.codeOpen ? this.codeHtml() : '');
    this.renderBar(); this.drawSel();
  },
  codeHtml() {
    return '<div class="he-code"><div class="pm-box"><h3>CÓDIGO DO HUD</h3><p>Copie o seu e mande pros amigos, ou cole o código de alguém aqui.</p>' +
      '<label class="he-lbl">SEU CÓDIGO</label><div class="he-row"><input id="he-mycode" readonly value="' + this.encode(this.draft) + '"><button class="btn small btn-primary" data-he="copy">COPIAR</button></div>' +
      '<label class="he-lbl">COLAR CÓDIGO</label><div class="he-row"><input id="he-incode" placeholder="LSHUD1.…" autocomplete="off" spellcheck="false"><button class="btn small" data-he="paste">USAR</button></div>' +
      '<p id="he-note" class="he-note"></p><div class="pm-foot"><button class="btn" data-he="code">FECHAR</button></div></div></div>';
  },
  renderBar() {
    const bar = document.querySelector('#hud-edit .he-bar'); if (!bar) return;
    const it = this.sel && this.byId(this.sel), v = it ? this.val(it.id) : null;
    // a barra fica longe do que está sendo editado (em cima ou embaixo)
    let low = false; if (it) { const r = this.el(it.id).getBoundingClientRect(); low = r.top + r.height / 2 < window.innerHeight * 0.45; }
    bar.classList.toggle('low', low);
    bar.innerHTML = (it ? '<div class="he-name"><b>' + it.name + '</b><button class="btn small" data-he="one">↺ VOLTAR</button></div>' +
        '<label class="he-sl">TAMANHO <input type="range" id="he-size" min="40" max="200" step="5" value="' + v[2] + '"><output id="he-size-v">' + v[2] + '%</output></label>' +
        '<label class="he-sl">OPACIDADE <input type="range" id="he-alpha" min="15" max="100" step="5" value="' + v[3] + '"><output id="he-alpha-v">' + v[3] + '%</output></label>'
      : '<div class="he-name"><b>EDITAR HUD</b><span>Toque num botão pra escolher e arraste pra mover.</span></div>') +
      '<div class="he-btns"><button class="btn small" data-he="code">CÓDIGO</button><button class="btn small" data-he="all">PADRÃO</button><button class="btn small" data-he="cancel">CANCELAR</button><button class="btn small btn-primary" data-he="save">SALVAR</button></div>';
  },
  renderVals() { const v = this.val(this.sel); const a = document.getElementById('he-size-v'), b = document.getElementById('he-alpha-v'); if (a) a.textContent = v[2] + '%'; if (b) b.textContent = v[3] + '%'; },
  drawSel() {
    const s = document.getElementById('he-sel'); if (!s) return;
    if (!this.sel) { s.classList.add('hidden'); return; }
    const r = this.el(this.sel).getBoundingClientRect();
    s.classList.remove('hidden'); Object.assign(s.style, { left: (r.left - 4) + 'px', top: (r.top - 4) + 'px', width: (r.width + 8) + 'px', height: (r.height + 8) + 'px' });
  }
};
