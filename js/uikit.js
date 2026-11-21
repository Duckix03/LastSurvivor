// Kit de interface: deixa os controles do navegador com a cara do jogo, com animações.
//  - <select> vira uma caixa de seleção própria (lista que abre animada, teclado e toque)
//  - <input type=number> ganha botões − / + (sem as setinhas do navegador)
//  - sliders (range) mostram a parte preenchida
//  - botões e abas fazem a "onda" (ripple) no toque/clique
// Funciona sozinho: observa a página e arruma o que for aparecendo (painéis montados por JS também).
'use strict';
LS.UIKit = {
  init() {
    this.enhanceAll(document);
    new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) this.enhanceAll(n);
    }).observe(document.body, { childList: true, subtree: true });
    // slider: parte preenchida acompanha o valor
    document.addEventListener('input', e => { if (e.target.type === 'range') this.fill(e.target); }, true);
    // onda no toque
    document.addEventListener('pointerdown', e => this.ripple(e), true);
    // fecha a lista aberta ao tocar fora / rolar / redimensionar
    document.addEventListener('pointerdown', e => { if (this.open && !e.target.closest('.xsel, .xsel-list')) this.close(); });
    window.addEventListener('resize', () => this.close());
    document.addEventListener('scroll', e => { if (this.open && !e.target.closest?.('.xsel-list')) this.close(); }, true);
    // valores trocados por código (ex.: configurações sincronizando) também atualizam os sliders
    const wrap = (obj, fn) => { const f = obj[fn]; if (typeof f === 'function') obj[fn] = function () { const r = f.apply(this, arguments); LS.UIKit.fillAll(); return r; }; };
    if (LS.UI) { wrap(LS.UI, 'openPanel'); wrap(LS.UI, 'showScreen'); if (LS.UI.syncSettings) wrap(LS.UI, 'syncSettings'); }
    this.fillAll();
  },
  enhanceAll(root) {
    const q = s => (root.matches && root.matches(s) ? [root] : []).concat([...(root.querySelectorAll ? root.querySelectorAll(s) : [])]);
    q('select:not([data-xsel])').forEach(s => this.select(s));
    q('input[type=number]:not([data-xnum])').forEach(i => this.number(i));
    q('input[type=range]').forEach(r => this.fill(r));
  },

  // ---------- sliders ----------
  fill(r) {
    const min = +r.min || 0, max = r.max === '' ? 100 : +r.max, v = +r.value;
    r.style.setProperty('--p', ((v - min) / ((max - min) || 1) * 100).toFixed(1) + '%');
  },
  fillAll() { document.querySelectorAll('input[type=range]').forEach(r => this.fill(r)); },

  // ---------- número com − / + ----------
  number(inp) {
    inp.dataset.xnum = '1';
    const w = document.createElement('span'); w.className = 'xnum';
    inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
    const btn = (d, t) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'xnum-b'; b.textContent = t; b.tabIndex = -1;
      let rep; const step = () => { const s = +inp.step || 1, min = inp.min === '' ? -Infinity : +inp.min, max = inp.max === '' ? Infinity : +inp.max;
        inp.value = Math.max(min, Math.min(max, (+inp.value || 0) + d * s * (rep && rep.n > 8 ? 10 : 1))); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); };
      b.addEventListener('pointerdown', e => { e.preventDefault(); step(); rep = { n: 0 }; rep.t = setTimeout(function go() { rep.n++; step(); rep.t = setTimeout(go, 70); }, 380); }); // segurar repete
      const stop = () => { if (rep) clearTimeout(rep.t); rep = null; };
      b.addEventListener('pointerup', stop); b.addEventListener('pointerleave', stop); b.addEventListener('pointercancel', stop);
      return b; };
    w.insertBefore(btn(-1, '−'), inp); w.appendChild(btn(1, '+'));
  },

  // ---------- caixa de seleção ----------
  select(sel) {
    sel.dataset.xsel = '1';
    const box = document.createElement('div'); box.className = 'xsel'; box.tabIndex = 0;
    box.innerHTML = '<span class="xsel-v"></span><svg class="xsel-ch" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    sel.parentNode.insertBefore(box, sel); sel.classList.add('xsel-native');
    const show = () => { const o = sel.options[sel.selectedIndex]; box.querySelector('.xsel-v').textContent = o ? o.textContent : ''; };
    show(); sel.addEventListener('change', show);
    box._sel = sel; box._show = show;
    box.addEventListener('click', () => (this.open && this.open.box === box ? this.close() : this.openList(box)));
    box.addEventListener('keydown', e => {
      const L = this.open && this.open.box === box ? this.open : null;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (L) this.pick(box, L.hi); else this.openList(box); }
      else if (e.key === 'Escape' && L) { e.preventDefault(); e.stopPropagation(); this.close(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); const d = e.key === 'ArrowDown' ? 1 : -1;
        if (!L) { sel.selectedIndex = Math.max(0, Math.min(sel.options.length - 1, sel.selectedIndex + d)); sel.dispatchEvent(new Event('change', { bubbles: true })); return; }
        L.hi = Math.max(0, Math.min(sel.options.length - 1, L.hi + d)); this.hilite(L);
      }
    });
  },
  openList(box) {
    this.close();
    const sel = box._sel, r = box.getBoundingClientRect();
    const list = document.createElement('div'); list.className = 'xsel-list';
    list.innerHTML = [...sel.options].map((o, i) => '<div class="xsel-o' + (i === sel.selectedIndex ? ' on' : '') + '" data-i="' + i + '" style="--i:' + i + '"><span>' + o.textContent.replace(/</g, '&lt;') + '</span>' +
      '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>').join('');
    document.body.appendChild(list);
    const h = list.offsetHeight, below = window.innerHeight - r.bottom - 8, up = below < h && r.top > below;
    list.style.left = r.left + 'px'; list.style.width = r.width + 'px'; list.style.fontSize = getComputedStyle(box).fontSize;
    list.style.top = (up ? r.top - h - 6 : r.bottom + 6) + 'px'; list.classList.add(up ? 'up' : 'down');
    list.addEventListener('pointerdown', e => e.preventDefault()); // não tira o foco da caixa
    list.addEventListener('click', e => { const o = e.target.closest('.xsel-o'); if (o) this.pick(box, +o.dataset.i); });
    list.addEventListener('pointermove', e => { const o = e.target.closest('.xsel-o'); if (o && this.open) { this.open.hi = +o.dataset.i; this.hilite(this.open); } });
    box.classList.add('open');
    this.open = { box, list, hi: sel.selectedIndex };
    this.hilite(this.open);
    if (LS.Audio && LS.Audio.click) try { LS.Audio.click(); } catch (e) { /* sem áudio */ }
  },
  hilite(L) { L.list.querySelectorAll('.xsel-o').forEach(o => o.classList.toggle('hi', +o.dataset.i === L.hi)); },
  pick(box, i) {
    const sel = box._sel;
    if (sel.selectedIndex !== i) { sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    box._show(); this.close();
    box.classList.remove('picked'); void box.offsetWidth; box.classList.add('picked'); // "pulinho" ao escolher
  },
  close() {
    const L = this.open; if (!L) return;
    this.open = null; L.box.classList.remove('open');
    L.list.classList.add('closing'); setTimeout(() => L.list.remove(), 160);
  },

  // ---------- onda (ripple) ----------
  ripple(e) {
    const b = e.target.closest('.btn, .set-tabs button, .sh-tabs button, .sh-views button, .adm-tabs button, .ct-tabs button, .chips button, .filters button, .cgp-tabs button, .lb-item, .lb-icon, .wr-tab, .xsel, .xnum-b, .sh-codebtn, .sh-daily, .g-btn, .pf-tabs button');
    if (!b || b.closest('#touch-ui') || b.disabled) return;
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
    const z = b.offsetWidth ? r.width / b.offsetWidth : 1; // celular: os menus estão com zoom
    const s = document.createElement('span'); s.className = 'rip';
    s.style.width = s.style.height = d / z + 'px';
    s.style.left = (e.clientX - r.left - d / 2) / z + 'px'; s.style.top = (e.clientY - r.top - d / 2) / z + 'px';
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    let h = b.querySelector(':scope > .rip-h'); // camada que recorta a onda (não corta os selos "NOVO" do botão)
    if (!h) { h = document.createElement('span'); h.className = 'rip-h'; b.appendChild(h); }
    h.appendChild(s);
    setTimeout(() => s.remove(), 650);
  },
};
