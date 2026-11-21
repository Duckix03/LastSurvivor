// LOJA (comprar itens com moedas) e GOLD ROYALE (sorteio: gasta moedas e ganha um item; repetido devolve parte).
'use strict';
LS.Shop = {
  TABS: [
    { id: 'feat', label: 'DESTAQUES', test: i => i.slot === 'costume' },
    { id: 'hat', label: 'CHAPÉUS', test: i => i.slot === 'hat' },
    { id: 'face', label: 'ROSTO', test: i => ['glasses', 'mask', 'hairStyle', 'beard'].includes(i.slot) },
    { id: 'body', label: 'ROUPAS', test: i => i.slot === 'top' || i.slot === 'pattern' },
    { id: 'legs', label: 'CALÇAS', test: i => i.slot === 'legs' },
    { id: 'code', label: 'EXCLUSIVOS', test: i => i.code } // só de codiguin: aparecem pra mostrar, não dá pra comprar
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
      else if (a === 'code') this.openRedeem();
      else if (a === 'redeem') this.redeem();
      else if (a === 'daily') this.daily();
    });
  },
  open(view) { this.view = view || 'shop'; this.render(); LS.UI.openPanel('panel-shop'); },
  coins() { return LS.Cosmetics.coins().toLocaleString('pt-BR'); },
  gems() { return LS.Cosmetics.diamonds().toLocaleString('pt-BR'); },
  // preço do item: moedas, diamantes (fantasias) ou "só codiguin"
  priceTag(it) { return it.code ? 'SÓ CODIGUIN' : it.piece ? 'NA FANTASIA' : it.royale ? 'GOLD ROYALE' : it.dprice ? LS.icon('gem', 'gem-i') + it.dprice.toLocaleString('pt-BR') : LS.icon('coin', 'coin-i') + it.price.toLocaleString('pt-BR'); },
  dailyReady() { const me = LS.Account.logged() && LS.Account.me; return !!me && Date.now() - (me.dailyAt || 0) >= 20 * 3600e3; },
  card(it, extra) {
    const C = LS.Cosmetics, R = C.RARITY[it.rarity], own = C.owns(it.id);
    return '<button class="sh-card' + (own ? ' own' : '') + (extra || '') + '" data-sh="item" data-v="' + it.id + '" style="--rc:' + R.color + '">' +
      '<div class="sh-img"><img alt="" data-tid="' + it.id + '"></div><span class="sh-rar">' + R.name + '</span>' +
      '<b>' + it.name + '</b><span class="sh-price' + (it.code && !own ? ' code' : it.royale && !own ? ' royale' : '') + '">' + (own ? 'ADQUIRIDO ✓' : this.priceTag(it)) + '</span></button>';
  },
  fillThumbs(root) { root.querySelectorAll('img[data-tid]').forEach(img => LS.Thumbs.into(img, LS.Cosmetics.byId[img.dataset.tid])); },
  render() {
    const C = LS.Cosmetics, shop = this.view === 'shop';
    let h = '<div class="sh-head"><div class="sh-views"><button class="' + (shop ? 'on' : '') + '" data-sh="view" data-v="shop">LOJA</button><button class="royale' + (shop ? '' : ' on') + '" data-sh="view" data-v="royale">GOLD ROYALE</button></div>' +
      '<div class="sh-wallet">' + (this.dailyReady() ? '<button class="sh-daily" data-sh="daily">' + LS.icon('gem', 'gem-i') + '+10 DIÁRIO</button>' : '') +
      '<button class="sh-codebtn" data-sh="code">CODIGUIN</button>' +
      '<div class="sh-coins gem" title="Diamantes">' + LS.icon('gem', 'gem-i') + '<b>' + this.gems() + '</b></div><div class="sh-coins">' + LS.icon('coin', 'coin-i') + '<b>' + this.coins() + '</b></div></div></div>';
    if (shop) {
      const tab = this.TABS.find(t => t.id === this.tab) || this.TABS[0];
      const items = C.items.filter(i => !i.free && !i.piece && (tab.id === 'code' || !i.code) && tab.test(i)).sort((a, b) => b.rarity - a.rarity || (b.dprice || b.price) - (a.dprice || a.price));
      h += '<div class="sh-tabs">' + this.TABS.map(t => '<button class="' + (t.id === tab.id ? 'on' : '') + '" data-sh="tab" data-v="' + t.id + '">' + t.label + '</button>').join('') + '</div>' +
        '<div class="sh-grid' + (tab.id === 'feat' ? ' big' : '') + '">' + items.map(i => this.card(i)).join('') + '</div>' +
        '<p class="sh-tip">' + (tab.id === 'code' ? 'Itens <b style="color:#2ee6ff">EXCLUSIVOS</b>: só saem em codiguin. Fique de olho nos códigos do jogo!' :
          tab.id === 'feat' ? 'Fantasias completas são compradas com <b>diamantes</b> (codiguins e recompensa diária).' :
          'Esses itens só saem no <b style="color:#ffd34d">GOLD ROYALE</b>. Ganhe moedas jogando (abates, vitórias e rounds do duelo) e gire!') + '</p>';
    } else {
      const pool = C.royalePool().sort((a, b) => b.rarity - a.rarity || b.price - a.price), W = C.ROYALE_WEIGHT, tot = W.reduce((s, x) => s + x, 0);
      const star = pool[0];
      h += '<div class="gr"><div class="gr-pool"><div class="gr-grid">' + pool.map(i => this.card(i, ' gr-cell')).join('') + '</div>' +
        '<p class="gr-odds">Chances por giro: ' + C.RARITY.slice(0, 4).map((r, k) => '<span style="color:' + r.color + '">' + r.name + ' ' + Math.round(W[k] / tot * 100) + '%</span>').join(' · ') + ' · Repetido devolve 25% do preço em moedas.</p></div>' +
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
      (own ? '<button class="btn btn-primary" data-sh="equip" data-v="' + id + '">EQUIPAR</button>' :
        it.code ? '<button class="btn btn-primary" data-sh="code">RESGATAR CODIGUIN</button>' :
        it.royale ? '<button class="btn btn-primary" data-sh="view" data-v="royale">GIRAR NO GOLD ROYALE</button>' :
        '<button class="btn btn-primary" data-sh="buy" data-v="' + id + '">COMPRAR ' + this.priceTag(it) + '</button>') + '</div>');
    if (!own && it.code) document.querySelector('.sh-modal-box .sh-sub').insertAdjacentHTML('afterend', '<p class="sh-sub" style="color:#2ee6ff">Item exclusivo: só sai em codiguin.</p>');
    if (!own && it.royale) document.querySelector('.sh-modal-box .sh-sub').insertAdjacentHTML('afterend', '<p class="sh-sub" style="color:#ffd34d">Esse item só sai no <b>Gold Royale</b>. Gire pra tentar a sorte!</p>');
  },
  async doBuy(id) {
    const it = LS.Cosmetics.byId[id];
    const btn = document.querySelector('.sh-modal-box [data-sh="buy"]'); if (btn) btn.disabled = true;
    const err = it && it.dprice ? await LS.Cosmetics.buyDiamond(id) : LS.Cosmetics.buy(id);
    if (btn) btn.disabled = false;
    if (err) { const e = document.getElementById('sh-err'); e.textContent = err; e.classList.remove('hidden'); return; }
    LS.Audio.kill(); LS.Menu.render(); this.render(); this.confirm(id);
    const box = document.querySelector('.sh-modal-box'); if (box) box.insertAdjacentHTML('afterbegin', '<div class="sh-new">COMPRADO!</div>');
  },
  // ---------- codiguin e recompensa diária ----------
  openRedeem() {
    if (!LS.Account.logged()) { this.modal('<h3 class="sh-h">CODIGUIN</h3><p class="sh-sub">Pra resgatar codiguins você precisa de uma conta (assim cada código vale 1 vez por pessoa).</p><div class="pf-modal-btns"><button class="btn" data-sh="close">FECHAR</button><button class="btn btn-primary" data-sh="toconta">CRIAR / ENTRAR</button></div>');
      document.querySelector('[data-sh="toconta"]').onclick = () => { this.closeModal(); LS.UI.openPanel('panel-settings'); LS.UI.setTab('conta'); }; return; }
    this.modal('<h3 class="sh-h">RESGATAR CODIGUIN</h3><p class="sh-sub">Digite o código pra ganhar itens exclusivos, moedas e diamantes.</p>' +
      '<input id="sh-code" class="sh-codein" maxlength="20" spellcheck="false" autocomplete="off" placeholder="EX: LSABC123XYZ"><p id="sh-err" class="pf-err hidden"></p>' +
      '<div class="pf-modal-btns"><button class="btn" data-sh="close">FECHAR</button><button class="btn btn-primary" data-sh="redeem">RESGATAR</button></div>');
    const inp = document.getElementById('sh-code'); inp.focus(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') this.redeem(); });
  },
  async redeem() {
    const inp = document.getElementById('sh-code'), err = document.getElementById('sh-err'); if (!inp) return;
    const btn = document.querySelector('[data-sh="redeem"]'); btn.disabled = true; btn.textContent = '...';
    try {
      const R = await LS.Account.redeemCode(inp.value.trim());
      LS.Audio.victory(); LS.Menu.render(); this.render();
      const it = R.item && LS.Cosmetics.byId[R.item];
      this.modal('<div class="sh-new">CODIGUIN RESGATADO!</div>' + (it ? this.big(it) + (R.had ? '<p class="sh-sub">Você já tinha esse item.</p>' : '') : '') +
        '<div class="sh-rewards">' + (R.coins ? '<span>' + LS.icon('coin', 'coin-i') + '+' + R.coins.toLocaleString('pt-BR') + '</span>' : '') + (R.diamonds ? '<span class="gem">' + LS.icon('gem', 'gem-i') + '+' + R.diamonds.toLocaleString('pt-BR') + '</span>' : '') + '</div>' +
        '<div class="pf-modal-btns"><button class="btn" data-sh="close">OK</button>' + (it && !R.had ? '<button class="btn btn-primary" data-sh="equip" data-v="' + it.id + '">EQUIPAR</button>' : '') + '</div>');
    } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); btn.disabled = false; btn.textContent = 'RESGATAR'; }
  },
  async daily() {
    try { const d = await LS.Account.daily(); LS.Audio.victory(); LS.Menu.render(); this.render();
      this.modal('<div class="sh-new">RECOMPENSA DIÁRIA</div><div class="sh-rewards big"><span class="gem">' + LS.icon('gem', 'gem-i') + '+' + d.got + '</span></div><p class="sh-sub">Volte amanhã pra pegar mais!</p><div class="pf-modal-btns"><button class="btn btn-primary" data-sh="close">OK</button></div>');
    } catch (e) { this.modal('<h3 class="sh-h">RECOMPENSA DIÁRIA</h3><p class="sh-sub">' + e.message + '</p><div class="pf-modal-btns"><button class="btn btn-primary" data-sh="close">OK</button></div>'); }
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
