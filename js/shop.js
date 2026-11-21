// LOJA (comprar itens com moedas) e GOLD ROYALE (sorteio: gasta moedas e ganha um item; repetido devolve parte).
'use strict';
LS.Shop = {
  TABS: [
    { id: 'feat', label: 'DESTAQUES', test: i => i.slot === 'costume' },
    { id: 'hat', label: 'CHAPÉUS', test: i => i.slot === 'hat' },
    { id: 'face', label: 'ROSTO', test: i => ['glasses', 'mask', 'hairStyle', 'beard'].includes(i.slot) },
    { id: 'body', label: 'ROUPAS', test: i => i.slot === 'top' || i.slot === 'pattern' },
    { id: 'legs', label: 'CALÇAS', test: i => i.slot === 'legs' }
  ],
  tab: 'feat', view: 'shop',
  init() {
    const root = document.getElementById('panel-shop');
    root.addEventListener('click', e => {
      const el = e.target.closest('[data-sh]'); if (!el) return;
      const a = el.dataset.sh; LS.Audio.init();
      if (a !== 'spin1' && a !== 'spin10') LS.Audio.click();
      if (a === 'view') { this.view = el.dataset.v; this.render(); }
      else if (a === 'tab') { this.tab = el.dataset.v; this.render(); }
      else if (a === 'item') this.confirm(el.dataset.v);
      else if (a === 'buy') this.doBuy(el.dataset.v);
      else if (a === 'equip') this.equip(el.dataset.v);
      else if (a === 'close') this.closeModal();
      else if (a === 'spin1') this.spin(1);
      else if (a === 'spin10') this.spin(11);
      else if (a === 'back') { this.closeModal(); LS.UI.back(); }
    });
  },
  open(view) { this.view = view || 'shop'; this.render(); LS.UI.openPanel('panel-shop'); },
  coins() { return LS.Cosmetics.coins().toLocaleString('pt-BR'); },
  card(it, extra) {
    const C = LS.Cosmetics, R = C.RARITY[it.rarity], own = C.owns(it.id);
    return '<button class="sh-card' + (own ? ' own' : '') + (extra || '') + '" data-sh="item" data-v="' + it.id + '" style="--rc:' + R.color + '">' +
      '<div class="sh-img"><img alt="" data-tid="' + it.id + '"></div><span class="sh-rar">' + R.name + '</span>' +
      '<b>' + it.name + '</b><span class="sh-price">' + (own ? 'ADQUIRIDO ✓' : LS.icon('coin', 'coin-i') + it.price.toLocaleString('pt-BR')) + '</span></button>';
  },
  fillThumbs(root) { root.querySelectorAll('img[data-tid]').forEach(img => LS.Thumbs.into(img, LS.Cosmetics.byId[img.dataset.tid])); },
  render() {
    const C = LS.Cosmetics, shop = this.view === 'shop';
    let h = '<div class="sh-head"><div class="sh-views"><button class="' + (shop ? 'on' : '') + '" data-sh="view" data-v="shop">LOJA</button><button class="royale' + (shop ? '' : ' on') + '" data-sh="view" data-v="royale">GOLD ROYALE</button></div>' +
      '<div class="sh-coins">' + LS.icon('coin', 'coin-i') + '<b>' + this.coins() + '</b></div></div>';
    if (shop) {
      const tab = this.TABS.find(t => t.id === this.tab) || this.TABS[0];
      const items = C.items.filter(i => !i.free && tab.test(i)).sort((a, b) => b.rarity - a.rarity || b.price - a.price);
      h += '<div class="sh-tabs">' + this.TABS.map(t => '<button class="' + (t.id === tab.id ? 'on' : '') + '" data-sh="tab" data-v="' + t.id + '">' + t.label + '</button>').join('') + '</div>' +
        '<div class="sh-grid' + (tab.id === 'feat' ? ' big' : '') + '">' + items.map(i => this.card(i)).join('') + '</div>' +
        '<p class="sh-tip">Ganhe moedas jogando: abates, vitórias e rounds do duelo. As fantasias saem mais baratas que as peças separadas.</p>';
    } else {
      const pool = C.royalePool().sort((a, b) => b.rarity - a.rarity || b.price - a.price), W = C.ROYALE_WEIGHT, tot = W.reduce((s, x) => s + x, 0);
      const star = pool[0];
      h += '<div class="gr"><div class="gr-pool"><div class="gr-grid">' + pool.map(i => this.card(i, ' gr-cell')).join('') + '</div>' +
        '<p class="gr-odds">Chances por giro: ' + C.RARITY.map((r, k) => '<span style="color:' + r.color + '">' + r.name + ' ' + Math.round(W[k] / tot * 100) + '%</span>').join(' · ') + ' · Repetido devolve 25% do preço em moedas.</p></div>' +
        '<div class="gr-side"><div class="gr-star"><span>PRÊMIO MÁXIMO</span><div class="sh-img big"><img alt="" data-tid="' + star.id + '"></div><b>' + star.name + '</b></div>' +
        '<button class="gr-btn" data-sh="spin1"><b>1 GIRO</b><span>' + LS.icon('coin', 'coin-i') + ' ' + C.ROYALE_COST.toLocaleString('pt-BR') + '</span></button>' +
        '<button class="gr-btn ten" data-sh="spin10"><b>10 + 1 GIROS</b><span>' + LS.icon('coin', 'coin-i') + ' ' + C.ROYALE_10.toLocaleString('pt-BR') + '</span></button></div></div>';
    }
    h += '<div class="panel-buttons"><button class="btn btn-primary" data-sh="back">VOLTAR</button></div><div id="sh-modal" class="hidden"></div>';
    const body = document.getElementById('shop-body');
    body.innerHTML = h; this.fillThumbs(body);
  },
  modal(html) { const m = document.getElementById('sh-modal'); m.innerHTML = '<div class="sh-modal-box">' + html + '</div>'; m.classList.remove('hidden'); this.fillThumbs(m); },
  closeModal() { const m = document.getElementById('sh-modal'); if (m) m.classList.add('hidden'); },
  big(it) { const R = LS.Cosmetics.RARITY[it.rarity]; return '<div class="sh-big" style="--rc:' + R.color + '"><div class="sh-img big"><img alt="" data-tid="' + it.id + '"></div><span class="sh-rar">' + R.name + '</span><h3>' + it.name + '</h3></div>'; },
  confirm(id) {
    const C = LS.Cosmetics, it = C.byId[id]; if (!it) return;
    const own = C.owns(id), extra = it.slot === 'costume' ? '<p class="sh-sub">Inclui: ' + C.pieces(it).map(p => p.name).join(', ') + '</p>' : '<p class="sh-sub">' + (C.SLOTS[it.slot] ? C.SLOTS[it.slot].label : '') + '</p>';
    this.modal(this.big(it) + extra + '<p id="sh-err" class="pf-err hidden"></p><div class="pf-modal-btns"><button class="btn" data-sh="close">FECHAR</button>' +
      (own ? '<button class="btn btn-primary" data-sh="equip" data-v="' + id + '">EQUIPAR</button>' : '<button class="btn btn-primary" data-sh="buy" data-v="' + id + '">COMPRAR ' + LS.icon('coin', 'coin-i') + ' ' + it.price.toLocaleString('pt-BR') + '</button>') + '</div>');
  },
  doBuy(id) {
    const err = LS.Cosmetics.buy(id);
    if (err) { const e = document.getElementById('sh-err'); e.textContent = err; e.classList.remove('hidden'); return; }
    LS.Audio.kill(); LS.Menu.render(); this.render(); this.confirm(id);
    const box = document.querySelector('.sh-modal-box'); if (box) box.insertAdjacentHTML('afterbegin', '<div class="sh-new">COMPRADO!</div>');
  },
  // veste o item (fantasia = todas as peças)
  equip(id) {
    const it = LS.Cosmetics.byId[id], P = LS.playerProfile;
    P.look = LS.Cosmetics.sanitize(LS.Wardrobe.apply(P.look, it));
    LS.Lobby.changed(); this.closeModal();
  },

  // ---------- Gold Royale ----------
  spin(n) {
    if (this.spinning) return;
    const C = LS.Cosmetics;
    if (!C.pay(n)) { this.modal('<h3 class="sh-h">MOEDAS INSUFICIENTES</h3><p class="sh-sub">Você precisa de ' + LS.icon('coin', 'coin-i') + ' ' + (n > 1 ? C.ROYALE_10 : C.ROYALE_COST).toLocaleString('pt-BR') + ' e tem ' + LS.icon('coin', 'coin-i') + ' ' + this.coins() + '. Jogue partidas pra ganhar mais!</p><div class="pf-modal-btns"><button class="btn btn-primary" data-sh="close">OK</button></div>'); return; }
    const res = []; for (let i = 0; i < n; i++) res.push(C.spin());
    LS.Menu.render();
    document.querySelector('#panel-shop .sh-coins b').textContent = this.coins();
    // animação: a luz passeia pelos itens e para no prêmio (no 10+1, no melhor deles)
    const best = res.slice().sort((a, b) => b.item.rarity - a.item.rarity)[0];
    const cells = [...document.querySelectorAll('#panel-shop .gr-cell')], target = cells.findIndex(c => c.dataset.v === best.item.id);
    this.spinning = true;
    let i = Math.floor(Math.random() * cells.length), steps = cells.length * 2 + ((target - i + cells.length) % cells.length), k = 0;
    const tick = () => {
      cells.forEach(c => c.classList.remove('hl')); cells[i].classList.add('hl'); LS.Audio.click();
      if (k >= steps) { this.spinning = false; setTimeout(() => this.showResult(res), 450); return; }
      k++; i = (i + 1) % cells.length;
      const left = steps - k; setTimeout(tick, left < 8 ? 70 + (8 - left) * 45 : 45);
    };
    tick();
  },
  showResult(res) {
    const C = LS.Cosmetics;
    LS.Audio.victory();
    let html;
    if (res.length === 1) {
      const r = res[0];
      html = '<div class="sh-new">' + (r.dup ? 'REPETIDO' : 'NOVO!') + '</div>' + this.big(r.item) + '<p class="sh-sub">' + (r.dup ? 'Você já tinha: +' + LS.icon('coin', 'coin-i') + ' ' + r.refund.toLocaleString('pt-BR') + ' de volta.' : 'Já está no seu guarda-roupa.') + '</p>' +
        '<div class="pf-modal-btns"><button class="btn" data-sh="close">OK</button>' + (r.dup ? '' : '<button class="btn btn-primary" data-sh="equip" data-v="' + r.item.id + '">EQUIPAR</button>') + '</div>';
    } else {
      const refund = res.reduce((s, r) => s + r.refund, 0);
      html = '<h3 class="sh-h">10 + 1 GIROS</h3><div class="gr-results">' + res.map(r => '<div class="gr-res' + (r.dup ? ' dup' : '') + '" style="--rc:' + C.RARITY[r.item.rarity].color + '"><div class="sh-img"><img alt="" data-tid="' + r.item.id + '"></div><b>' + r.item.name + '</b><small>' + (r.dup ? '+' + LS.icon('coin', 'coin-i') + ' ' + r.refund : 'NOVO') + '</small></div>').join('') + '</div>' +
        (refund ? '<p class="sh-sub">Repetidos devolveram ' + LS.icon('coin', 'coin-i') + ' ' + refund.toLocaleString('pt-BR') + '.</p>' : '') + '<div class="pf-modal-btns"><button class="btn btn-primary" data-sh="close">OK</button></div>';
    }
    this.render(); this.modal(html); // redesenha a grade (itens novos ficam "ADQUIRIDO") e mostra o prêmio
  }
};
