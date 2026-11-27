// Modos de jogo: lista, escolha (fica salva) e o painel de banners no estilo dos jogos de celular
'use strict';
LS.MODES = {
  br: {
    name: 'BATTLE ROYALE', tag: 'ESQUADRÕES', place: 'Ilha · Esquadrões de 4',
    desc: 'Salte do avião, junte loot e seja o último em pé.'
  },
  duel: {
    name: 'DUELO', tag: 'NOVO', place: 'Galpão · 5 mapas',
    desc: 'Contêineres, loja de armas a cada 2 rounds e gás fechando. Quem fizer 5 rounds vence.'
  }
};

LS.Modes = {
  KEY: 'lastsurvivor_mode', SIZE_KEY: 'lastsurvivor_duel_size',
  id: 'br', duelSize: 1, // duelo: 1 = 1v1, 2 = 2v2 (equipes)
  init() {
    try {
      const m = localStorage.getItem(this.KEY); if (LS.MODES[m]) this.id = m;
      this.duelSize = localStorage.getItem(this.SIZE_KEY) === '2' ? 2 : 1;
    } catch (e) { /* sem localStorage */ }
    document.getElementById('modes-grid').addEventListener('click', e => {
      const sz = e.target.closest('[data-size]');
      if (sz) { LS.Audio.init(); LS.Audio.click(); this.setSize(+sz.dataset.size); this.set('duel'); this.renderGrid(); return; } // troca 1v1/2v2 e fica no painel
      if (e.target.closest('[data-custom]')) { LS.Audio.init(); LS.Audio.click(); LS.Custom.open(); return; } // salas: abre o painel delas
      const c = e.target.closest('[data-mode]'); if (!c) return;
      LS.Audio.init(); LS.Audio.click();
      this.set(c.dataset.mode); LS.UI.back();
    });
    this.render();
  },
  // dados do modo com o que muda conforme o tamanho do time
  info(id) {
    const m = Object.assign({}, LS.MODES[id || this.id]);
    if ((id || this.id) === 'br') { m.players = 32; m.sub = 'Ilha · Esquadrões de 4 · 32 jogadores'; }
    else { const t = this.duelSize; m.players = t * 2; m.vs = t + 'v' + t; m.sub = 'Galpão · ' + m.vs + (t > 1 ? ' equipes' : '') + ' · Primeiro a 5'; }
    return m;
  },
  cur() { return this.info(this.id); },
  set(id) {
    if (!LS.MODES[id]) return;
    if (LS.Party && !LS.Party.allowMode(id)) return; // party: só o líder troca (duelo com 3+: escolhe quem fica)
    this.id = id;
    try { localStorage.setItem(this.KEY, id); } catch (e) { /* ignora */ }
    if (id === 'duel' && LS.Party && LS.Party.inParty()) this.duelSize = 2; // duelo em party: sempre 2v2
    this.render();
    if (LS.Party) { LS.Party.modeChanged(id); LS.Party.render(); }
  },
  setSize(n) {
    if (LS.Party && LS.Party.inParty() && n !== 2) { LS.Party.toast('Em party o duelo é 2v2 (você + seu amigo).'); n = 2; }
    this.duelSize = n === 2 ? 2 : 1;
    try { localStorage.setItem(this.SIZE_KEY, String(this.duelSize)); } catch (e) { /* ignora */ }
    this.render();
  },
  maxPlayers() { return this.cur().players; },
  // textos do lobby que mostram o modo atual
  render() {
    const m = this.cur(), $ = id => document.getElementById(id);
    const name = m.name + (m.vs ? ' ' + m.vs : '');
    if ($('lb-mode-name')) $('lb-mode-name').textContent = name;
    if ($('lb-mode-sub')) $('lb-mode-sub').textContent = m.sub;
    if ($('lobby-mode-txt')) $('lobby-mode-txt').innerHTML = 'MODO: <b>' + name + '</b> · ' + m.sub.toUpperCase();
  },
  open() { this.renderGrid(); LS.UI.openPanel('panel-modes'); },

  // ---- banners ----
  renderGrid() {
    const cards = Object.keys(LS.MODES).map(id => {
      const m = this.info(id), sel = id === this.id;
      const sizes = id === 'duel' ? '<div class="mode-sizes">' + [1, 2].map(n => '<span data-size="' + n + '" class="' + (this.duelSize === n ? 'sel' : '') + '">' +
        n + ' V ' + n + '<small>' + (n > 1 ? 'EQUIPES' : 'SOLO') + '</small></span>').join('') + '</div>' : '';
      return '<button class="mode-card' + (sel ? ' sel' : '') + '" data-mode="' + id + '">' +
        '<div class="mode-art" data-art="' + this.artId(id) + '">' + this.artHtml(this.artId(id)) + '</div><div class="mode-shine"></div>' +
        '<span class="mode-tag">' + m.tag + '</span>' + (sel ? '<span class="mode-check">✓ SELECIONADO</span>' : '') +
        '<div class="mode-title"><b>' + m.name + (m.vs ? ' <em>' + m.vs + '</em>' : '') + '</b><span>' + m.place + ' · ' + m.players + ' jogadores</span></div>' +
        '<div class="mode-info"><p>' + m.desc + '</p>' + sizes + '</div></button>';
    });
    cards.push('<button class="mode-card custom-card" data-custom="1"><div class="mode-art"><img class="banner3d" src="' + LS.Custom.mapThumb() + '" alt=""></div><div class="mode-shine"></div>' +
      '<span class="mode-tag">SÓ AMIGOS</span><div class="mode-title"><b>SALA PERSONALIZADA</b><span>Ilha plana · X1 até 10v10</span></div>' +
      '<div class="mode-info"><p>Crie uma sala com ID e senha, chame os amigos e escolha times e rounds. Sem kill, moedas ou XP.</p></div></button>');
    document.getElementById('modes-grid').innerHTML = cards.join('');
    // banners 3D com os modelos do jogo: enquanto não ficam prontos, mostra o desenho
    if (LS.Banners && LS.Game.renderer) LS.Banners.generate(Object.keys(LS.MODES).map(id => this.artId(id)), (art, url) => {
      const el = document.querySelector('#modes-grid [data-art="' + art + '"]');
      if (el) el.innerHTML = '<img class="banner3d fresh" src="' + url + '" alt="">';
    });
  },
  artId(id) { return id === 'duel' ? 'duel' + this.duelSize : id; },
  artHtml(art) { const u = LS.Banners && LS.Banners.cached(art); return u ? '<img class="banner3d" src="' + u + '" alt="">' : this.art(art); },

  // boneco de blocos (estilo do jogo) segurando uma arma. x,y = pés; s = escala; dir = 1 olha pra direita, -1 pra esquerda
  fig(x, y, s, c, dir) {
    const r = (px, py, w, h, fill, extra) => '<rect x="' + px + '" y="' + py + '" width="' + w + '" height="' + h + '" fill="' + fill + '"' + (extra || '') + '/>';
    const rim = c.rim ? ' stroke="' + c.rim + '" stroke-width="1.6"' : '';
    let g = '<g transform="translate(' + x + ' ' + y + ') scale(' + (s * dir) + ' ' + s + ')">';
    g += '<ellipse cx="0" cy="0" rx="16" ry="3.5" fill="#000" opacity=".35"/>';
    g += r(-9, -26, 8, 26, c.pants, rim) + r(1, -26, 8, 26, c.pants, rim) + r(-10, -3, 9, 4, '#1b1b1f') + r(1, -3, 9, 4, '#1b1b1f'); // pernas e botas
    g += r(-11, -52, 22, 27, c.shirt, rim) + r(-11, -32, 22, 4, '#2a2a2a'); // tronco e cinto
    if (c.vest) g += r(-11, -50, 22, 16, c.vest, ' opacity=".9"');
    g += r(-17, -51, 7, 18, c.shirt, rim); // braço de trás
    g += r(-10, -72, 20, 20, c.skin, rim) + r(-11, -76, 22, 7, c.hair) + r(-11, -72, 4, 8, c.hair); // cabeça e cabelo
    if (c.cap) g += r(-12, -79, 24, 6, c.cap) + r(6, -75, 10, 3, c.cap);
    g += r(3, -66, 4, 4, '#111') + (c.mask ? r(-2, -60, 12, 6, c.mask) : '');
    // arma apontada pra frente com as duas mãos
    g += r(-4, -48, 30, 6, c.gun || '#2b2b2b') + r(22, -47, 16, 3, c.gun || '#2b2b2b') + r(4, -43, 5, 8, c.gun || '#2b2b2b') + r(-8, -48, 6, 9, '#5a3a1f');
    g += r(2, -48, 7, 7, c.skin) + r(14, -48, 6, 6, c.skin); // mãos
    g += r(6, -51, 10, 6, c.shirt, rim); // braço da frente
    return g + '</g>';
  },
  // ilustrações dos banners (SVG feito à mão, sem imagem externa)
  art(id) {
    const S = (body, defs) => '<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice"><defs>' + (defs || '') + '</defs>' + body + '</svg>';
    if (id === 'br') return S(
      '<rect width="320" height="200" fill="url(#brSky)"/>' +
      '<g opacity=".18" fill="#fff"><path d="M236 92 L120 0 H150z"/><path d="M236 92 L190 0 H214z"/><path d="M236 92 L262 0 H290z"/><path d="M236 92 L320 30 V58z"/></g>' +
      '<circle cx="236" cy="92" r="46" fill="url(#brSun)"/><circle cx="236" cy="92" r="20" fill="#fff5c8"/>' +
      '<g stroke="#fff" stroke-width="2" opacity=".55" stroke-linecap="round"><path d="M-10 52 L96 34"/><path d="M-10 58 L96 40"/></g>' +
      '<g transform="translate(96 32) rotate(-9)" fill="#2b2f3a"><rect x="0" y="0" width="54" height="9" rx="4.5"/><path d="M20 2 L36 -16 L42 -16 L32 3z"/><path d="M22 7 L38 24 L44 24 L33 7z"/><path d="M1 3 L-6 -7 L-1 -7 L7 2z"/></g>' +
      [[64, 70, 1], [150, 54, 0.8], [182, 82, 0.7]].map(([x, y, k]) => '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')"><path d="M-12 0 Q0 -14 12 0z" fill="#ff8a1f"/><path d="M-12 0 Q0 -14 12 0" fill="none" stroke="#fff" stroke-width="1" opacity=".6"/><g stroke="#1a1a1a" stroke-width=".8"><line x1="-11" y1="0" x2="0" y2="13"/><line x1="11" y1="0" x2="0" y2="13"/></g><rect x="-2.5" y="12" width="5" height="8" fill="#1b2a3a"/></g>').join('') +
      '<path d="M0 132 Q50 110 92 118 L140 70 L168 100 L196 84 L240 118 Q290 108 320 124 V160 H0z" fill="#3b5d3a"/>' +
      '<path d="M140 70 L152 84 L146 82 L140 90 L134 82 L128 84z" fill="#f4f6fa"/>' +
      '<path d="M0 140 Q80 122 160 134 T320 132 V170 H0z" fill="#4f8a34"/>' +
      '<g fill="#2b4a24"><path d="M40 128 l6 -22 l6 22z"/><path d="M54 130 l5 -18 l5 18z"/><path d="M262 126 l6 -20 l6 20z"/></g>' +
      '<rect y="150" width="320" height="50" fill="url(#brSea)"/><g stroke="#fff" opacity=".45" stroke-width="1.5"><path d="M20 162 h18"/><path d="M90 172 h26"/><path d="M200 166 h20"/><path d="M150 184 h30"/></g>' +
      '<path d="M200 200 L214 158 L262 148 L320 160 V200z" fill="#5d5650"/><path d="M214 158 L262 148 L270 154 L222 164z" fill="#7a726a"/>' +
      this.fig(262, 154, 0.95, { shirt: '#3d6b3a', pants: '#3a3f4a', skin: '#e8b98e', hair: '#3a2416', vest: '#556a3a', cap: '#2e3b2a', gun: '#2b2b2b', rim: '#ffb46b' }, -1) +
      '<rect width="320" height="200" fill="url(#vig)"/>',
      '<linearGradient id="brSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3b8f"/><stop offset=".45" stop-color="#d9637a"/><stop offset=".8" stop-color="#ffb46b"/></linearGradient>' +
      '<radialGradient id="brSun"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#ffc06a" stop-opacity=".7"/><stop offset="1" stop-color="#ff8a5a" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="brSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a7fb8"/><stop offset="1" stop-color="#174b78"/></linearGradient>' +
      '<radialGradient id="vig" cx=".5" cy=".45" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>');
    if (id === 'duel1' || id === 'duel2') {
      const two = id === 'duel2';
      const cont = (pts, col) => '<polygon points="' + pts + '" fill="' + col + '"/><polygon points="' + pts + '" fill="url(#rib)"/>';
      const blue = { shirt: '#2e6bb0', pants: '#2a2f3a', skin: '#e8b98e', hair: '#1a1a1a', vest: '#24456b', gun: '#222', rim: '#2fd6ff' };
      const blue2 = { shirt: '#3a8a8a', pants: '#2a2f3a', skin: '#c98e62', hair: '#5a3416', cap: '#1f3a5a', gun: '#222', rim: '#2fd6ff' };
      const red = { shirt: '#b03a2e', pants: '#2a2a2a', skin: '#d9a07a', hair: '#2a1a10', vest: '#6b2a24', mask: '#1a1a1a', gun: '#222', rim: '#ff4d6d' };
      const red2 = { shirt: '#c98a1e', pants: '#3a2a2a', skin: '#f0c9a0', hair: '#e8c070', cap: '#5a1f1f', gun: '#222', rim: '#ff4d6d' };
      return S(
        '<rect width="320" height="200" fill="url(#dBg)"/>' +
        '<polygon points="0,0 320,0 230,62 90,62" fill="#161b26"/>' + // teto
        [0.18, 0.4, 0.62, 0.84].map(k => '<line x1="' + (k * 320) + '" y1="0" x2="' + (90 + k * 140) + '" y2="62" stroke="#2a3140" stroke-width="3"/>').join('') +
        [[60, 18, 40], [130, 40, 26], [168, 52, 16], [260, 18, 40], [190, 40, 26], [152, 52, 16]].map(([x, y, w]) => '<rect x="' + (x - w / 2) + '" y="' + y + '" width="' + w + '" height="' + (w / 10) + '" rx="1" fill="#fff6d8"/><rect x="' + (x - w) + '" y="' + (y - 4) + '" width="' + (w * 2) + '" height="' + (w / 2.5) + '" fill="url(#lampGlow)"/>').join('') +
        '<polygon points="90,62 230,62 230,128 90,128" fill="#2c3444"/><rect x="128" y="88" width="64" height="40" fill="#3d4656"/><g stroke="#2a313d" stroke-width="2">' + [94, 100, 106, 112, 118, 124].map(y => '<line x1="128" y1="' + y + '" x2="192" y2="' + y + '"/>').join('') + '</g>' +
        '<polygon points="0,200 320,200 230,128 90,128" fill="url(#dFloor)"/>' +
        '<g stroke="#e8c400" stroke-width="3" opacity=".9"><line x1="20" y1="200" x2="98" y2="128"/><line x1="300" y1="200" x2="222" y2="128"/></g><line x1="160" y1="200" x2="160" y2="128" stroke="#fff" stroke-width="2" stroke-dasharray="8 7" opacity=".5"/>' +
        cont('0,30 70,52 70,128 0,150', '#2e6bb0') + cont('0,150 70,128 70,150 0,184', '#b03a2e') + cont('70,52 90,62 90,128 70,128', '#22508a') +
        cont('320,40 250,58 250,128 320,148', '#3a8a3a') + cont('320,148 250,128 250,146 320,176', '#c98a1e') + cont('250,58 230,64 230,128 250,128', '#2a6a2a') +
        '<rect x="104" y="112" width="18" height="18" fill="#a8783e"/><path d="M104 112 l18 18 M122 112 l-18 18" stroke="#6b4a2a" stroke-width="2.5"/>' +
        '<rect x="0" y="0" width="22" height="200" fill="url(#gasL)"/><rect x="298" y="0" width="22" height="200" fill="url(#gasR)"/>' +
        (two ? this.fig(52, 176, 0.62, blue2, 1) + this.fig(268, 176, 0.62, red2, -1) : '') +
        this.fig(two ? 92 : 84, 192, 0.86, blue, 1) + this.fig(two ? 228 : 236, 192, 0.86, red, -1) +
        '<g transform="translate(160 112)"><polygon points="0,-34 9,-12 32,-16 14,0 30,18 7,12 0,34 -7,12 -30,18 -14,0 -32,-16 -9,-12" fill="#ffc531"/><polygon points="0,-24 6,-8 22,-11 10,0 21,12 5,8 0,24 -5,8 -21,12 -10,0 -22,-11 -6,-8" fill="#ff8a1f"/>' +
        '<text y="9" text-anchor="middle" font-family="Lilita One, sans-serif" font-size="26" fill="#fff" stroke="#2a1400" stroke-width="3" paint-order="stroke">VS</text></g>' +
        '<rect width="320" height="200" fill="url(#vig2)"/>',
        '<linearGradient id="dBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2230"/><stop offset="1" stop-color="#2c3444"/></linearGradient>' +
        '<linearGradient id="dFloor" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#6a6b6e"/><stop offset="1" stop-color="#3e4248"/></linearGradient>' +
        '<pattern id="rib" width="6" height="8" patternUnits="userSpaceOnUse"><rect width="2.4" height="8" fill="#000" opacity=".22"/></pattern>' +
        '<radialGradient id="lampGlow"><stop offset="0" stop-color="#fff2c0" stop-opacity=".45"/><stop offset="1" stop-color="#fff2c0" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="gasL" x1="0" x2="1"><stop offset="0" stop-color="#8a4dff" stop-opacity=".7"/><stop offset="1" stop-color="#8a4dff" stop-opacity="0"/></linearGradient>' +
        '<linearGradient id="gasR" x1="1" x2="0"><stop offset="0" stop-color="#8a4dff" stop-opacity=".7"/><stop offset="1" stop-color="#8a4dff" stop-opacity="0"/></linearGradient>' +
        '<radialGradient id="vig2" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient>');
    }
    return S(
      '<rect width="320" height="200" fill="url(#sBg)"/><rect width="320" height="200" fill="url(#sStripe)"/>' +
      '<circle cx="160" cy="92" r="58" fill="url(#sGlow)"/>' +
      '<text x="160" y="122" text-anchor="middle" font-family="Lilita One, sans-serif" font-size="96" fill="#2a3246" stroke="#4a5672" stroke-width="3">?</text>' +
      '<g transform="translate(196 118)"><rect x="-13" y="-4" width="26" height="20" rx="4" fill="#5a6478"/><path d="M-8 -4 V-10 a8 8 0 0 1 16 0 V-4" fill="none" stroke="#5a6478" stroke-width="4"/><circle cx="0" cy="6" r="3" fill="#1a1e28"/></g>',
      '<linearGradient id="sBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#151925"/><stop offset="1" stop-color="#232a3a"/></linearGradient>' +
      '<pattern id="sStripe" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="9" height="18" fill="#fff" opacity=".025"/></pattern>' +
      '<radialGradient id="sGlow"><stop offset="0" stop-color="#5a6aff" stop-opacity=".25"/><stop offset="1" stop-color="#5a6aff" stop-opacity="0"/></radialGradient>');
  }
};
