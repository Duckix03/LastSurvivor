// Guarda-roupa (estilo closet do Free Fire): seções com quantos itens você tem (ROSTO 5, CAMISA 6...), grade só com a foto
// 3D de cada item (sem nome nem subtítulo; o nome aparece embaixo ao escolher). Item bloqueado dá pra PROVAR (o boneco veste na hora) e comprar ali mesmo; ao sair, volta pro que você tem.
'use strict';
LS.Wardrobe = {
  TABS: [
    { id: 'costume', label: 'FANTASIAS', icon: 'star', slots: ['costume'] },
    { id: 'hat', label: 'CHAPÉU', icon: 'hat', slots: ['hat'] },
    { id: 'face', label: 'ROSTO', icon: 'face', slots: ['glasses', 'mask', 'beard'], colors: [['eyes', 'EYES', 'Olhos']] },
    { id: 'hair', label: 'CABELO', icon: 'hair', slots: ['hairStyle'], colors: [['hair', 'HAIRS', 'Cor do cabelo e barba']] },
    { id: 'top', label: 'ROUPA', icon: 'shirt', slots: ['top'], colors: [['accent', 'ACCENTS', 'Cor da roupa / acessórios']] },
    { id: 'pattern', label: 'CAMISA', icon: 'pattern', slots: ['pattern'], colors: [['shirt', 'SHIRTS', 'Cor da camisa']] },
    { id: 'legs', label: 'CALÇA', icon: 'pants', slots: ['legs'], colors: [['pants', 'PANTS', 'Cor da calça']] },
    { id: 'skin', label: 'PELE', icon: 'skin', slots: [], colors: [['skin', 'SKINS', 'Tom de pele']] }
  ],
  ICONS: {
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    hat: '<path d="M4 15h16M7 15V9a5 5 0 0 1 10 0v6"/><path d="M3 15c0 2 4 3 9 3s9-1 9-3"/>',
    face: '<circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M9 15c1.5 1.3 4.5 1.3 6 0"/>',
    hair: '<path d="M5 13c0-5 3-8 7-8s7 3 7 8M5 13c2-1 4-4 4-6M12 5c0 3 3 5 7 6"/><path d="M6 13v5M18 13v5"/>',
    shirt: '<path d="M8 4l-5 3 2 4 3-1v10h8V10l3 1 2-4-5-3c-1 2-2 3-4 3S9 6 8 4z"/>',
    pattern: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16M4 8h4M16 16h4"/>',
    pants: '<path d="M7 3h10l1 18h-4l-2-11-2 11H6z"/>',
    skin: '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5a1.5 1.5 0 0 1 3 0v8c0 4-2 7-6 7-3 0-5-2-6-5l-1-3a1.5 1.5 0 0 1 3-1l1 2"/>'
  },
  tab: 'costume', sel: null,

  icon(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + this.ICONS[n] + '</svg>'; },
  init() {
    const box = document.getElementById('lobby-options');
    box.addEventListener('click', e => {
      const t = e.target.closest('[data-wtab]'); if (t) { this.tab = t.dataset.wtab; this.sel = null; LS.Audio.click(); this.render(); return; }
      const c = e.target.closest('[data-wid]'); if (c) { this.pick(c.dataset.wid); return; }
      const sw = e.target.closest('[data-wcol]'); if (sw) { this.color(sw.dataset.wcol, sw.dataset.v); return; }
      const b = e.target.closest('[data-wbuy]'); if (b) { this.buy(); return; }
      const g = e.target.closest('[data-wroyale]'); if (g) { LS.Audio.click(); this.leave(); LS.Shop.open('royale'); }
      const cd = e.target.closest('[data-wcode]'); if (cd) { LS.Audio.click(); this.leave(); LS.Shop.open('shop'); LS.Shop.openRedeem(); }
    });
  },
  P() { return LS.playerProfile; },
  open() { this.sel = null; this.preview = null; this.render(); },
  // saiu do guarda-roupa: tira o que estava só provando
  leave() {
    this.sel = null; this.preview = null;
    const P = this.P(); P.look = LS.Cosmetics.sanitize(P.look);
    if (LS.Lobby.model) LS.Lobby.model.applyLook(P.look);
  },
  // aplica um item num visual
  apply(look, it) {
    const L = Object.assign({}, look);
    if (it.slot === 'costume') Object.assign(L, it.look); else L[it.slot] = it.val;
    return L;
  },
  pick(id) {
    const C = LS.Cosmetics, it = C.byId[id], P = this.P(); if (!it) return;
    LS.Audio.click();
    const look = this.apply(P.look, it);
    this.sel = id;
    if (C.owns(id)) { P.look = C.sanitize(look); this.preview = null; LS.Lobby.changed(); }
    else { this.preview = look; LS.Lobby.model.applyLook(look); } // só provando
    this.render();
  },
  color(key, v) { const P = this.P(); P.look[key] = v; if (this.preview) this.preview[key] = v; LS.Audio.click(); LS.Lobby.changed(); if (this.preview) LS.Lobby.model.applyLook(this.preview); this.render(); },
  async buy() {
    const C = LS.Cosmetics, it = C.byId[this.sel], err = it && it.dprice ? await C.buyDiamond(this.sel) : C.buy(this.sel);
    const bar = document.getElementById('wr-buybar');
    if (err) { LS.Audio.click(); bar.querySelector('.wr-err').textContent = err; bar.classList.add('shake'); setTimeout(() => bar.classList.remove('shake'), 400); return; }
    LS.Audio.kill();
    const P = this.P(); P.look = C.sanitize(this.preview || P.look); this.preview = null;
    LS.Lobby.changed(); LS.Menu.render(); this.render();
  },
  // mostra o item equipado na aba (o valor que o visual está usando)
  current(slot) { const L = this.preview || this.P().look; return L[slot]; },
  // ícones das peças (canto do item em ROSTO e o "nenhum")
  SLOT_ICONS: {
    glasses: '<path d="M2 11h20M5 11a3 3 0 1 0 6 0M13 11a3 3 0 1 0 6 0"/>',
    mask: '<path d="M4 7c3-2 13-2 16 0v5c0 4-4 7-8 7s-8-3-8-7z"/><path d="M8 11h2M14 11h2"/>',
    beard: '<path d="M5 8c0 7 3 12 7 12s7-5 7-12c-2 2-4 3-7 3S7 10 5 8z"/>',
    hat: '<path d="M4 15h16M7 15V9a5 5 0 0 1 10 0v6"/>', hairStyle: '<path d="M5 13c0-5 3-8 7-8s7 3 7 8M5 13c2-1 4-4 4-6M12 5c0 3 3 5 7 6"/>',
    top: '<path d="M8 4l-5 3 2 4 3-1v10h8V10l3 1 2-4-5-3c-1 2-2 3-4 3S9 6 8 4z"/>', pattern: '<rect x="4" y="4" width="16" height="16"/><path d="M4 12h16M12 4v16"/>', legs: '<path d="M7 3h10l1 18h-4l-2-11-2 11H6z"/>'
  },
  slotIcon(slot) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square">' + (this.SLOT_ICONS[slot] || '') + '</svg>'; },
  isNone(it) { return it.slot !== 'costume' && /^nenhum/.test(it.val || ''); },
  // itens de uma seção, tudo junto (sem subtítulos): os seus primeiro, depois os bloqueados por raridade
  tabItems(tab) {
    const C = LS.Cosmetics, items = C.items.filter(i => tab.slots.includes(i.slot));
    const rank = it => (this.isNone(it) ? 0 : 1);
    return items.sort((a, b) => rank(a) - rank(b) || (C.owns(b.id) - C.owns(a.id)) || (a.rarity - b.rarity) || (tab.slots.indexOf(a.slot) - tab.slots.indexOf(b.slot)));
  },
  // quantos itens você tem na seção (pele: quantos tons)
  tabCount(tab) {
    const C = LS.Cosmetics;
    if (!tab.slots.length) return (tab.colors || []).reduce((n, c) => n + LS.Skin[c[1]].length, 0);
    return this.tabItems(tab).filter(it => C.owns(it.id) && !this.isNone(it)).length;
  },
  render() {
    const C = LS.Cosmetics, P = this.P(), tab = this.TABS.find(t => t.id === this.tab) || this.TABS[0], R = C.RARITY;
    // coluna das seções (estilo closet): nome + quantos você tem
    let h = '<div class="wr"><div class="wr-tabs">' + this.TABS.map(t => '<button class="wr-tab' + (t.id === tab.id ? ' on' : '') + '" data-wtab="' + t.id + '">' + this.icon(t.icon) +
      '<span>' + t.label + '</span><em>' + this.tabCount(t) + '</em></button>').join('') + '</div><div class="wr-main">';
    const items = this.tabItems(tab), owned = items.filter(it => C.owns(it.id) && !this.isNone(it)).length, real = items.filter(it => !this.isNone(it)).length;
    h += '<div class="wr-top"><b>' + tab.label + '</b>' + (real ? '<span>TOTAL <i>' + owned + '</i>/' + real + '</span>' : '') + '</div>';
    if (items.length) {
      const multi = tab.slots.length > 1;
      h += '<div class="wr-grid">' + items.map(it => {
        const own = C.owns(it.id), on = it.slot !== 'costume' && this.current(it.slot) === it.val, sel = this.sel === it.id, none = this.isNone(it);
        return '<button class="wr-card' + (on ? ' on' : '') + (sel ? ' sel' : '') + (own ? '' : ' locked') + (none ? ' none' : '') + '" data-wid="' + it.id + '" style="--rc:' + R[it.rarity].color + '" title="' + it.name + '">' +
          (none ? '<div class="wr-img wr-x">' + this.slotIcon(it.slot) + '</div>' : '<div class="wr-img"><img alt="" data-tid="' + it.id + '"></div>') +
          (multi && !none ? '<i class="wr-kind">' + this.slotIcon(it.slot) + '</i>' : '') + (on ? '<i class="wr-on"></i>' : '') +
          (own ? '' : '<i class="wr-lock"><svg viewBox="0 0 8 8"><path d="M2 3V2h1V1h2v1h1v1h1v4H1V3zM3 3h2V2H3z" fill="currentColor" fill-rule="evenodd"/></svg></i>') + '</button>';
      }).join('') + '</div>';
    }
    // cores: uma faixa de quadradinhos por cor (sem subtítulo; o nome aparece ao passar o mouse)
    (tab.colors || []).forEach(([key, list, label]) => {
      const cur = (this.preview || P.look)[key];
      h += '<div class="wr-swatches" title="' + label + '"><i class="wr-pal">' + this.icon('pattern') + '</i>' + LS.Skin[list].map(c => '<button class="wr-sw' + (cur === c ? ' on' : '') + '" data-wcol="' + key + '" data-v="' + c + '" style="background:' + c + '" title="' + label + '"></button>').join('') + '</div>';
    });
    h += '</div></div>';
    // item escolhido: o nome aparece aqui embaixo (na grade não tem nome). Bloqueado: barra de compra
    const it = this.sel && C.byId[this.sel];
    if (it && !C.owns(it.id)) {
      const pieces = it.slot === 'costume' ? C.pieces(it).filter(p => !C.owns(p.id)).length : 0;
      h += '<div id="wr-buybar" style="--rc:' + R[it.rarity].color + '"><div><span class="wr-rar">' + R[it.rarity].name + '</span><b>' + it.name + '</b><small>Provando' + (pieces ? ' · ' + pieces + ' peças' : '') + (it.royale ? ' · só sai no Gold Royale' : ' · você tem ' + (it.dprice ? LS.icon('gem', 'gem-i') + ' ' + C.diamonds().toLocaleString('pt-BR') : LS.icon('coin', 'coin-i') + ' ' + C.coins().toLocaleString('pt-BR'))) + '</small><span class="wr-err"></span></div>' +
        (it.code ? '<button class="btn btn-primary" data-wcode="1">SÓ EM CODIGUIN</button>' : it.piece ? '<button class="btn btn-primary" disabled>VEM NA FANTASIA</button>' :
          it.royale ? '<button class="btn btn-primary" data-wroyale="1">GIRAR NO GOLD ROYALE</button>' : '<button class="btn btn-primary" data-wbuy="1">COMPRAR ' + LS.Shop.priceTag(it) + '</button>') + '</div>';
    } else if (it) {
      h += '<div id="wr-buybar" class="own" style="--rc:' + R[it.rarity].color + '"><div><span class="wr-rar">' + (it.free ? 'GRÁTIS' : R[it.rarity].name) + '</span><b>' + it.name + '</b></div><span class="wr-eq">EQUIPADO</span></div>';
    }
    const box = document.getElementById('lobby-options');
    const sc = box.querySelector('.wr-main'), top = sc && this._lastTab === tab.id ? sc.scrollTop : 0; this._lastTab = tab.id; // não pula pro topo ao escolher
    box.innerHTML = h;
    if (top) box.querySelector('.wr-main').scrollTop = top;
    document.getElementById('wr-coins').textContent = C.coins().toLocaleString('pt-BR');
    box.querySelectorAll('img[data-tid]').forEach(img => LS.Thumbs.into(img, C.byId[img.dataset.tid]));
  }
};
