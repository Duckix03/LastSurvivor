// CORREIO: avisos e presentes que o dono do jogo manda (ADMIN → CORREIO), pra todo mundo ou pra contas específicas.
// Presente pode ter vários itens + moedas + diamantes; resgata uma vez só (precisa de conta).
// Convidado vê os avisos pra todos (lidas ficam guardadas neste aparelho).
'use strict';
LS.Mail = {
  list: [], sel: null, ready: false, lastT: 0,
  LOCAL: 'ls_mail_read',
  init() {
    if (!LS.NET_URL) return;
    this.ready = true;
    document.getElementById('mail-readall').addEventListener('click', () => { LS.Audio.click(); this.readAll(); });
    document.getElementById('mail-list').addEventListener('click', e => { const b = e.target.closest('[data-mail]'); if (b) { LS.Audio.click(); this.show(b.dataset.mail); } });
    document.getElementById('mail-view').addEventListener('click', e => {
      const b = e.target.closest('[data-mact]'); if (!b) return; LS.Audio.click();
      if (b.dataset.mact === 'claim') this.claim(b.dataset.id);
      else if (b.dataset.mact === 'del') this.del(b.dataset.id, b);
      else if (b.dataset.mact === 'login') { LS.UI.onAction('settings'); LS.UI.setTab('conta'); }
    });
    this.refresh();
    setInterval(() => { if (!document.hidden && LS.Account.logged()) this.refresh(); }, 180000); // pessoais: confere a cada 3 min
  },
  localRead() { try { return JSON.parse(localStorage.getItem(this.LOCAL) || '[]'); } catch (e) { return []; } },
  isRead(m) { return m.read || (!LS.Account.logged() && this.localRead().includes(m.id)); },
  unread() { return this.list.filter(m => !this.isRead(m) || (m.gifts && this.hasGift(m) && !m.got && LS.Account.logged())).length; },
  hasGift(m) { const g = m.gifts || {}; return !!((g.items && g.items.length) || g.coins || g.diamonds); },
  // o "X jogando" avisa quando chega mensagem nova pra todos
  seen(t) { if (t > this.lastT) { const first = !this.lastT; this.lastT = t; if (!first) this.refresh(); } },
  refresh() {
    if (!this.ready) return;
    clearTimeout(this._rt);
    this._rt = setTimeout(async () => {
      try { const d = await LS.Account.mail(); this.list = d.mail || []; } catch (e) { return; }
      this.badge(); if (LS.UI.current === 'panel-mail') this.render();
    }, 250);
  },
  badge() {
    const n = this.unread(), el = document.getElementById('lb-mail-n'); if (!el) return;
    el.textContent = n > 9 ? '9+' : n; el.classList.toggle('hidden', !n);
  },
  open() { LS.UI.openPanel('panel-mail'); this.sel = this.sel && this.list.find(m => m.id === this.sel) ? this.sel : (this.list[0] && this.list[0].id); this.render(); this.refresh(); },
  esc(t) { return LS.Profile.esc(t); },
  when(t) { const d = Math.floor((Date.now() - t) / 864e5); return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : 'há ' + d + ' dias'; },
  render() {
    const L = document.getElementById('mail-list');
    if (!this.list.length) { L.innerHTML = '<p class="mail-empty">' + LS.icon('mail') + 'Nenhuma mensagem por enquanto.</p>'; document.getElementById('mail-view').innerHTML = ''; return; }
    L.innerHTML = this.list.map(m => {
      const gift = this.hasGift(m), pend = gift && !m.got;
      return '<button class="mail-it' + (m.id === this.sel ? ' on' : '') + (this.isRead(m) ? '' : ' new') + '" data-mail="' + m.id + '">' +
        '<span class="mail-ic' + (pend ? ' gift' : '') + '">' + LS.icon(gift ? 'gift' : 'mail') + '</span><span class="mail-tt"><b>' + this.esc(m.title) + '</b><small>' +
        (m.personal ? 'Só pra você · ' : '') + this.when(m.created) + (pend ? ' · <em>presente!</em>' : '') + '</small></span>' + (this.isRead(m) ? '' : '<i class="mail-dot"></i>') + '</button>';
    }).join('');
    this.show(this.sel || this.list[0].id, true);
    this.badge();
  },
  giftHtml(m) {
    const g = m.gifts, C = LS.Cosmetics, out = [];
    (g.items || []).forEach(id => { const it = C.byId[id], R = it ? C.RARITY[it.rarity] : null;
      out.push('<div class="mg-it" style="--rc:' + (R ? R.color : '#888') + '"><img alt="" data-tid="' + this.esc(id) + '"><b>' + this.esc(it ? it.name : id) + '</b><small>' + (R ? R.name : '') + '</small></div>'); });
    if (g.coins) out.push('<div class="mg-it mg-cur" style="--rc:#ffc531">' + LS.icon('coin', 'coin-i') + '<b>' + g.coins.toLocaleString('pt-BR') + '</b><small>MOEDAS</small></div>');
    if (g.diamonds) out.push('<div class="mg-it mg-cur" style="--rc:#5ad1ff">' + LS.icon('gem', 'gem-i') + '<b>' + g.diamonds.toLocaleString('pt-BR') + '</b><small>DIAMANTES</small></div>');
    return '<div class="mg-grid">' + out.join('') + '</div>';
  },
  show(id, quiet) {
    const m = this.list.find(x => x.id === id); if (!m) return;
    this.sel = id;
    document.querySelectorAll('#mail-list .mail-it').forEach(b => b.classList.toggle('on', b.dataset.mail === id));
    const V = document.getElementById('mail-view'), gift = this.hasGift(m), logged = LS.Account.logged();
    const days = Math.max(0, Math.ceil((m.exp - Date.now()) / 864e5));
    V.innerHTML = '<div class="mv-head"><h3>' + this.esc(m.title) + '</h3><small>' + new Date(m.created).toLocaleDateString('pt-BR') + (m.personal ? ' · só pra você' : ' · pra todos') + ' · some em ' + days + ' dia' + (days === 1 ? '' : 's') + '</small></div>' +
      (m.text ? '<div class="mv-text">' + this.esc(m.text).replace(/\n/g, '<br>') + '</div>' : '') +
      (gift ? '<div class="mv-gift"><div class="mv-gh">' + LS.icon('gift') + 'PRESENTE</div>' + this.giftHtml(m) +
        (m.got ? '<div class="mv-got">RESGATADO ✓</div>' : logged ? '<button class="btn btn-primary mv-claim" data-mact="claim" data-id="' + m.id + '">RESGATAR TUDO</button>'
          : '<button class="btn btn-primary mv-claim" data-mact="login">ENTRE NA CONTA PRA RESGATAR</button>') + '</div>' : '') +
      (logged && (!gift || m.got) ? '<button class="btn small mv-del" data-mact="del" data-id="' + m.id + '">APAGAR</button>' : '');
    V.querySelectorAll('img[data-tid]').forEach(img => { const it = LS.Cosmetics.byId[img.dataset.tid]; if (it) LS.Thumbs.into(img, it); });
    if (!this.isRead(m)) this.markRead([m.id]);
    if (!quiet) V.scrollTop = 0;
  },
  async markRead(ids) {
    ids = ids.filter(Boolean); if (!ids.length) return;
    this.list.forEach(m => { if (ids.includes(m.id)) m.read = true; });
    if (LS.Account.logged()) { try { await LS.Account.mailMark('read', ids); } catch (e) { /* tenta de novo depois */ } }
    else { const r = this.localRead(); ids.forEach(i => { if (!r.includes(i)) r.push(i); }); try { localStorage.setItem(this.LOCAL, JSON.stringify(r.slice(-300))); } catch (e) { /* ignora */ } }
    document.querySelectorAll('#mail-list .mail-it').forEach(b => { if (ids.includes(b.dataset.mail)) { b.classList.remove('new'); const d = b.querySelector('.mail-dot'); if (d) d.remove(); } });
    this.badge();
  },
  readAll() { this.markRead(this.list.filter(m => !this.isRead(m)).map(m => m.id)); },
  async claim(id) {
    const b = document.querySelector('.mv-claim'); if (b) { b.disabled = true; b.textContent = 'RESGATANDO…'; }
    try {
      const d = await LS.Account.mailClaim(id); this.list = d.mail || this.list;
      const R = d.reward, parts = [];
      if (R.items.length) parts.push(R.items.length + (R.items.length === 1 ? ' item' : ' itens'));
      if (R.coins) parts.push(R.coins.toLocaleString('pt-BR') + ' moedas'); if (R.diamonds) parts.push(R.diamonds.toLocaleString('pt-BR') + ' diamantes');
      LS.HUD.toast('🎁 Presente resgatado: ' + parts.join(' + ')); LS.Audio.pickup && LS.Audio.pickup();
      if (LS.Menu) LS.Menu.render();
      this.render();
    } catch (e) { LS.HUD.toast(e.message); if (b) { b.disabled = false; b.textContent = 'RESGATAR TUDO'; } }
  },
  async del(id, btn) {
    if (btn && !btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = 'CERTEZA?'; return; }
    try { const d = await LS.Account.mailMark('del', [id]); this.list = d.mail || this.list.filter(m => m.id !== id); this.sel = this.list[0] && this.list[0].id; this.render(); } catch (e) { LS.HUD.toast(e.message); }
  }
};
