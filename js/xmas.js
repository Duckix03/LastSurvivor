// EVENTO DE NATAL: SnowTickets (+5 por abate na cabeça, +3 no corpo), missões (50 a 300 tickets) e o Spin de Natal
// (fica na loja, ao lado do Gold Royale). Liga sozinho de 1 a 31 de dezembro; o admin pode forçar ligado/desligado.
// Tudo fica em LS.stats (snow = tickets; x* = progresso do evento), que já é salvo na conta pelo /api/stats.
'use strict';
LS.Xmas = {
  TICKET_HEAD: 5, TICKET_BODY: 3,
  // [texto, chave do progresso, meta, tickets]. A ordem não pode mudar (o "já resgatou" é um bit por missão)
  MISSIONS: [
    ['Jogue 3 partidas', 'xg', 3, 50],
    ['Faça 3 kills em partidas', 'xk', 3, 50],
    ['Faça 2 headshots', 'xh', 2, 75],
    ['Jogue 10 partidas', 'xg', 10, 100],
    ['Faça 10 kills em partidas', 'xk', 10, 150],
    ['Faça 3 kills em uma partida', 'xmk', 3, 150],
    ['Cause 3.000 de dano', 'xd', 3000, 150],
    ['Faça 25 headshots', 'xh', 25, 200],
    ['Vença 1 partida', 'xw', 1, 200],
    ['Faça 5 headshots em uma partida', 'xmh', 5, 300],
    ['Faça 50 kills em partidas', 'xk', 50, 300]
  ],
  KEYS: ['xg', 'xk', 'xh', 'xw', 'xd', 'xmk', 'xmh', 'xc'],
  server: (() => { try { return localStorage.getItem('ls_xmas') || 'auto'; } catch (e) { return 'auto'; } })(),
  m: { k: 0, h: 0 }, // abates desta partida

  init() { this.season(); this.ui(); },
  // ligado: forçado pelo admin, ou dezembro no automático
  active() { return this.server === 'on' || (this.server === 'auto' && new Date().getMonth() === 11); },
  setServer(v) {
    if (!['auto', 'on', 'off'].includes(v) || v === this.server) return;
    this.server = v; try { localStorage.setItem('ls_xmas', v); } catch (e) { /* ignora */ }
    this.season(); this.ui();
  },
  // cada Natal começa do zero (as missões voltam; os tickets que sobraram continuam)
  season() {
    if (!this.active()) return;
    const d = new Date(), y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1, S = LS.stats;
    if (S.xy === y) return;
    S.xy = y; this.KEYS.forEach(k => { S[k] = 0; }); LS.saveStats();
  },
  // mostra/esconde o botão do lobby e a aba da loja
  ui() {
    const on = this.active();
    document.querySelectorAll('[data-action="xmas"]').forEach(b => b.classList.toggle('hidden', !on));
    const n = document.getElementById('lb-xmas-n'); if (n) { const k = this.claimable(); n.textContent = k; n.classList.toggle('hidden', !on || !k); }
    document.body.classList.toggle('xmas-on', on);
    if (!on && LS.Shop.view === 'xmas') LS.Shop.view = 'shop';
  },
  counts() { return LS.Game && LS.Game.mode !== 'custom'; }, // sala com amigos não conta (dava pra combinar abates)
  newMatch() { this.m = { k: 0, h: 0 }; },
  // abate seu: devolve quantos tickets ganhou (0 = evento desligado / não conta)
  onKill(head) {
    if (!this.active() || !this.counts()) return 0;
    this.season();
    const S = LS.stats, got = head ? this.TICKET_HEAD : this.TICKET_BODY;
    S.snow = (S.snow || 0) + got; S.xk = (S.xk || 0) + 1; this.m.k++;
    if (head) { S.xh = (S.xh || 0) + 1; this.m.h++; }
    S.xmk = Math.max(S.xmk || 0, this.m.k); S.xmh = Math.max(S.xmh || 0, this.m.h);
    LS.saveStats(); this.ui();
    return got;
  },
  endMatch(win, P) {
    if (!this.active() || !this.counts()) return;
    this.season();
    const S = LS.stats;
    S.xg = (S.xg || 0) + 1; if (win) S.xw = (S.xw || 0) + 1;
    S.xd = (S.xd || 0) + Math.round(P.damageDealt || 0);
    LS.saveStats(); this.ui();
    const k = this.claimable(); if (k) setTimeout(() => LS.HUD.toast(k + (k > 1 ? ' missões de Natal prontas' : ' missão de Natal pronta') + ' pra resgatar!'), 1500);
  },
  prog(i) { const M = this.MISSIONS[i]; return Math.min(M[2], LS.stats[M[1]] || 0); },
  claimed(i) { return ((LS.stats.xc || 0) >> i & 1) === 1; },
  ready(i) { return !this.claimed(i) && this.prog(i) >= this.MISSIONS[i][2]; },
  claimable() { return this.MISSIONS.reduce((n, _, i) => n + (this.ready(i) ? 1 : 0), 0); },
  claim(i) {
    if (!this.active() || !this.ready(i)) return 0;
    const S = LS.stats, r = this.MISSIONS[i][3];
    S.xc = (S.xc || 0) | (1 << i); S.snow = (S.snow || 0) + r; LS.saveStats(); this.ui();
    return r;
  },
  // lista de missões (fica embaixo do Spin de Natal, na loja)
  missionsHtml() {
    return '<div class="xm-missions"><h4>' + LS.icon('snow') + ' MISSÕES DE NATAL</h4>' + this.MISSIONS.map((M, i) => {
      const p = this.prog(i), done = this.claimed(i), ok = this.ready(i);
      return '<div class="xm-m' + (done ? ' done' : ok ? ' ok' : '') + '"><div class="xm-mt"><b>' + M[0] + '</b><div class="xm-bar"><i style="width:' + Math.round(p / M[2] * 100) + '%"></i></div><small>' + p.toLocaleString('pt-BR') + ' / ' + M[2].toLocaleString('pt-BR') + '</small></div>' +
        (done ? '<span class="xm-got">RESGATADO</span>' : '<button class="xm-claim" data-sh="xclaim" data-v="' + i + '"' + (ok ? '' : ' disabled') + '>' + LS.icon('snow', 'snow-i') + M[3] + '</button>') + '</div>';
    }).join('') + '<p class="xm-hint">Cada abate dá ' + LS.icon('snow', 'snow-i') + this.TICKET_HEAD + ' na cabeça e ' + LS.icon('snow', 'snow-i') + this.TICKET_BODY + ' no corpo (battle royale e duelo).</p></div>';
  }
};
