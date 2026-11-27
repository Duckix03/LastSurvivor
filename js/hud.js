// HUD: barras, munição, minimapa, killfeed, mensagens e inventário
'use strict';
LS.HUD = {
  $: id => document.getElementById(id),
  init() {
    this.el = {};
    ['hud', 'alive', 'kills', 'timer', 'fps', 'zone-info', 'zone-text', 'zone-dist', 'minimap', 'killfeed', 'crosshair', 'hitmarker', 'scope', 'damage-vignette',
      'zone-vignette', 'dmg-indicators', 'center-msg', 'prompt', 'heal-progress', 'heal-fill', 'heal-label', 'armor-fill', 'health-fill', 'hp-num', 'med-count', 'band-count', 'gel-count',
      'slot-0', 'slot-1', 'weapon-name', 'ammo-mag', 'ammo-res', 'reload-text', 'gear-vest', 'gear-helmet', 'gear-bag', 'bigmap', 'bigmap-canvas', 'inventory',
      'inv-weapons', 'inv-ammo', 'inv-gear', 'inv-meds', 'inv-cap'].forEach(id => this.el[id] = this.$(id));
    this.mm = this.el.minimap.getContext('2d');
    this.bm = this.el['bigmap-canvas'].getContext('2d');
    this.toasts = []; this.centerT = 0; this.dmgFlash = 0;
    // clique nos botões do inventário (e fora do painel = fecha)
    this.el.inventory.addEventListener('click', e => {
      if (e.target === this.el.inventory) { LS.Game.setInventory(false); return; } // tocou no fundo escuro
      const b = e.target.closest('button[data-inv]'); if (!b) return;
      const P = LS.Game.player, a = b.dataset.inv, v = b.dataset.v;
      if (a === 'close') { LS.Audio.click(); LS.Game.setInventory(false); return; }
      if (a === 'tab') { this.invTab = v; LS.Audio.click(); this.renderInventory(); return; }
      if (a === 'equip') P.switchWeapon(+v);
      else if (a === 'dropw') P.dropWeapon(+v);
      else if (a === 'reload') P.startReload();
      else if (a === 'heal') P.startHeal(v);
      else if (a === 'dropa') { const amt = Math.min(P.ammo[v], LS.AMMO_TYPES[v].pickup); if (amt > 0) { P.ammo[v] -= amt; LS.Loot.spawn('ammo', v, 0, amt, P.pos.x + Math.sin(P.yaw) * 1.5, P.pos.y + 0.1, P.pos.z + Math.cos(P.yaw) * 1.5); } }
      else if (a === 'dropm') { if (P.meds[v] > 0) { P.meds[v]--; LS.Loot.spawn('med', v, 0, 1, P.pos.x + Math.sin(P.yaw) * 1.5, P.pos.y + 0.1, P.pos.z + Math.cos(P.yaw) * 1.5); } }
      LS.Audio.click();
      this.renderInventory();
    });
  },
  setMapImage(cv) { this.mapImg = cv; },
  show(v) { this.el.hud.classList.toggle('hidden', !v); },

  toast(text) {
    const kf = this.el.killfeed, d = document.createElement('div');
    d.className = 'kf'; d.style.borderLeft = '3px solid #4be07a'; d.textContent = text;
    kf.appendChild(d); setTimeout(() => d.remove(), 2200);
    while (kf.children.length > 7) kf.firstChild.remove();
  },
  killFeed(killer, victim, weapon, head, mine) {
    const kf = this.el.killfeed, d = document.createElement('div');
    d.className = 'kf' + (mine ? ' me' : '');
    const k = killer ? '<span class="k">' + killer + '</span> ' : '';
    d.innerHTML = k + '<span style="color:#aaa">[' + weapon + (head ? ' 🎯' : '') + ']</span> <span class="v">' + victim + '</span>';
    kf.appendChild(d); setTimeout(() => d.remove(), 6000);
    while (kf.children.length > 7) kf.firstChild.remove();
  },
  centerMsg(title, sub, secs) {
    this.el['center-msg'].innerHTML = title + (sub ? '<small>' + sub + '</small>' : '');
    this.el['center-msg'].classList.add('show'); this.centerT = secs || 2.5;
  },
  // ---------- ÍCONE DE ABATE (estilo Minecraft): caveira vermelha em pixel; headshot = racha ao meio com o tiro ----------
  SKULL: [
    '....oooooooo....',
    '..ooHHHHHHHHoo..',
    '.oHHhhhhhhhhRRo.',
    '.oHhhhhhhhhhhRo.',
    'oHhhhhhhhhhhhhRo',
    'oHhhhhhhhhhhhhRo',
    'oheeeehhhheeeeRo',
    'oheeeehhhheeeeRo',
    'ohegeehhhhegeeRo',
    'oheeeehhhheeeeRo',
    '.ohhhhhnnhhhhRo.',
    '..ohhhhnnhhhRo..',
    '..oRhhhhhhhhRo..',
    '..otTtTtTtTtto..',
    '...oRRRRRRRRo...',
    '....oooooooo....'],
  skullImg() {
    if (this._skull) return this._skull;
    const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d');
    const col = { o: '#1a0408', H: '#ff8a96', h: '#e8324a', R: '#9c1328', e: '#2a0208', g: '#ff3b3b', n: '#5c0a16', t: '#f4e6d8', T: '#c9b7a6' };
    this.SKULL.forEach((row, y) => [...row].forEach((ch, x) => { if (col[ch]) { g.fillStyle = col[ch]; g.fillRect(x, y, 1, 1); } }));
    return (this._skull = c.toDataURL());
  },
  // abate do jogador: caveira no meio da tela (headshot: ela racha) + nome de quem caiu, pequeno
  killPop(name, head, n) {
    let el = this.el.killpop;
    if (!el) { el = this.el.killpop = document.createElement('div'); el.id = 'kill-pop'; this.el.hud.appendChild(el); }
    const img = '<img src="' + this.skullImg() + '" alt="">';
    el.innerHTML = '<div class="kp-skull' + (head ? ' head' : '') + '">' + (head ? '<i class="kp-l">' + img + '</i><i class="kp-r">' + img + '</i><b class="kp-shot"></b>' +
      '<u class="kp-bits">' + '<s></s>'.repeat(6) + '</u>' : img) + (n > 1 ? '<em>x' + n + '</em>' : '') + '</div>' +
      '<span>' + String(name || '').replace(/[<>&"]/g, '') + '</span>';
    el.className = ''; void el.offsetWidth; el.className = 'show' + (head ? ' head' : '');
    clearTimeout(this._kpT); this._kpT = setTimeout(() => { el.className = ''; }, 1900);
  },
  hit(head) {
    const h = this.el.hitmarker; h.classList.remove('show', 'head'); void h.offsetWidth;
    h.classList.add('show'); if (head) h.classList.add('head');
  },
  damaged(fromAngle) {
    this.dmgFlash = 1;
    if (fromAngle === null || fromAngle === undefined) return;
    const d = document.createElement('div'); d.className = 'dmg-ind';
    d.style.transform = 'rotate(' + fromAngle + 'rad)';
    this.el['dmg-indicators'].appendChild(d);
    setTimeout(() => d.remove(), 900);
  },
  setScope(on, zoom, breath, holding) {
    if (this.scopeOn !== on) { this.el.scope.classList.toggle('on', on); this.el.crosshair.style.display = on ? 'none' : ''; this.scopeOn = on; }
    if (on) {
      this.$('scope-zoom').textContent = (zoom || 1).toFixed(1) + 'x';
      const bf = this.$('breath-fill'); bf.style.width = Math.round((breath || 0) * 100) + '%'; bf.classList.toggle('hold', !!holding);
    }
  },

  // escreve no HTML só quando o valor muda (antes reescrevia dezenas de textos e estilos todo quadro: pesava no celular)
  _t(el, v) { v = String(v); if (el._tv !== v) { el._tv = v; el.textContent = v; } },
  _h(el, v) { if (el._hv !== v) { el._hv = v; el.innerHTML = v; } },
  _s(el, k, v) { v = String(v); const key = '_s' + k; if (el[key] !== v) { el[key] = v; el.style[k] = v; } },
  _c(el, v) { if (el._cv !== v) { el._cv = v; el.className = v; } },
  update(dt, G) {
    const P = G.player, E = this.el;
    this._t(E.alive, G.aliveCount());
    this.updateSquad(G);
    this._t(E.kills, G.mode === 'duel' ? LS.Duel.totalKills() : G.mode === 'custom' ? LS.Custom.kills : P.kills);
    this._t(E.timer, LS.util.fmtTime(G.time));
    // vida/colete
    this._s(E['health-fill'], 'width', P.hp + '%');
    E['health-fill'].parentElement.classList.toggle('low', P.hp < 30);
    this._t(E['hp-num'], Math.ceil(P.hp));
    const vd = P.vest.level ? LS.GEAR.vest.levels[P.vest.level].dur : 1;
    this._s(E['armor-fill'], 'width', (P.vest.level ? P.vest.dur / vd * 100 : 0) + '%');
    // ícones gerados por código: só troca a imagem quando o item muda
    const setImg = (img, src) => { if (img.dataset.k !== src) { img.dataset.k = src; img.src = src || ''; } };
    const gear = (el, kind, lv, dur, max) => {
      const pc = max ? Math.ceil(dur / max * 100) : 100;
      this._c(el, 'gear-item' + (lv ? ' l' + lv : ''));
      if (LS.Touch && LS.Touch.active) { // celular: só "Nv.2" + barrinha de durabilidade embaixo (--d)
        this._t(el.querySelector('span'), lv ? 'Nv.' + lv : '-');
        if (el._pc !== pc) { el._pc = pc; el.style.setProperty('--d', pc + '%'); }
      } else this._t(el.querySelector('span'), lv ? 'Nv.' + lv + (max ? ' ' + pc + '%' : '') : '-');
      setImg(el.querySelector('img'), LS.Icons.get(kind, null, lv || 1));
    };
    gear(E['gear-vest'], 'vest', P.vest.level, P.vest.dur, vd);
    gear(E['gear-helmet'], 'helmet', P.helmet.level, P.helmet.dur, P.helmet.level ? LS.GEAR.helmet.levels[P.helmet.level].dur : 1);
    gear(E['gear-bag'], 'bag', P.bag, 0, 0);
    if (!this.medIcons) { this.medIcons = true; setImg(this.$('ico-medkit'), LS.Icons.get('med', 'medkit')); setImg(this.$('ico-bandage'), LS.Icons.get('med', 'bandage')); setImg(this.$('ico-gel'), LS.Icons.get('gel', 'gel')); }
    this._t(E['med-count'], P.meds.medkit); this._t(E['band-count'], P.meds.bandage); this._t(E['gel-count'], P.gelInf ? '∞' : (P.gel | 0));
    // armas
    for (let i = 0; i < 2; i++) {
      const w = P.weapons[i], s = E['slot-' + i];
      s.classList.toggle('active', i === P.slot && !!w);
      this._t(s.querySelector('.name'), w ? LS.WEAPONS[w.id].name : 'VAZIO');
      const wi = s.querySelector('.wi'); wi.classList.toggle('on', !!w); if (w) setImg(wi, LS.Icons.get('weapon', w.id));
    }
    const w = P.weapon(), d = P.wdef();
    this._t(E['weapon-name'], d ? d.name + ' · ' + d.cat.toUpperCase() : 'DESARMADO');
    this._t(E['ammo-mag'], w ? w.mag : '-');
    E['ammo-mag'].classList.toggle('empty', !!w && w.mag === 0);
    this._t(E['ammo-res'], d ? P.ammo[d.ammo] : '-');
    const ai = this.$('ammo-ico'); ai.classList.toggle('on', !!d); if (d) setImg(ai, LS.Icons.get('ammo', d.ammo));
    E['reload-text'].classList.toggle('hidden', P.reloadT <= 0);
    // mira dinâmica
    // mira dinâmica: a abertura mostra a dispersão de verdade (onde as balas podem cair na tela)
    const cam = LS.Game.camera, sp = d ? P.currentSpread() : 0.01;
    const gapT = 2 + Math.tan(Math.min(sp, 0.35)) / Math.tan(cam.fov * Math.PI / 360) * (window.innerHeight / 2);
    this._gap = this._gap === undefined ? gapT : LS.util.lerp(this._gap, gapT, Math.min(1, LS.Game.lastDt * (gapT > this._gap ? 30 : 12) || 1));
    { const gv = Math.min(90, this._gap).toFixed(1) + 'px'; if (E.crosshair._gap !== gv) { E.crosshair._gap = gv; E.crosshair.style.setProperty('--gap', gv); } }
    this._s(E.crosshair, 'visibility', P.state === 'ground' && P.alive ? 'visible' : 'hidden');
    E.crosshair.classList.toggle('ads', !!(P.aiming && d && !d.scope)); // mira de ponto ao aproximar
    // cura
    if (P.healType) {
      E['heal-progress'].classList.remove('hidden');
      const m = LS.MEDS[P.healType];
      this._s(E['heal-fill'], 'width', ((1 - P.healT / m.time) * 100) + '%');
      this._t(E['heal-label'], 'Usando ' + m.name + '...');
    } else E['heal-progress'].classList.add('hidden');
    // prompt
    let pr = P.prompt;
    const kSp = LS.Touch.active ? '<b>⬆</b>' : '<b>ESPAÇO</b>'; // no celular é o botão de pular
    if (P.state === 'plane') pr = G.plane.canJump() ? kSp + ' Saltar do avião' : 'Aguarde o avião chegar à ilha...';
    else if (P.state === 'fall') pr = kSp + ' Abrir paraquedas';
    if (!P.alive && G.mode === 'duel') { const sp = LS.Duel.spectateTarget(); if (sp) pr = 'ASSISTINDO <b>' + sp.name + '</b>'; } // 2v2: morto, vendo o parceiro
    this._h(E.prompt, pr || '');
    // zona
    const Z = G.zone, out = Z.isOutside(P.pos), gas = LS.hall();
    E['zone-info'].classList.toggle('danger', out);
    if (Z.finished) this._t(E['zone-text'], gas ? 'Gás fechado' : 'Zona final');
    else if (gas) this._t(E['zone-text'], (Z.shrinking ? 'Gás fechando: ' : 'Gás fecha em: ') + LS.util.fmtTime(Z.timer));
    else this._t(E['zone-text'], (Z.shrinking ? 'Zona encolhendo: ' : 'Zona encolhe em: ') + LS.util.fmtTime(Z.timer));
    const dn = Math.hypot(P.pos.x - Z.next.x, P.pos.z - Z.next.y) - Z.nextR;
    if (gas) this._t(E['zone-dist'], out ? '⚠ NO GÁS! -' + Z.dps + ' HP/s' : 'Fique longe do gás');
    else this._t(E['zone-dist'], out ? '⚠ FORA DA ZONA! -' + Z.dps + ' HP/s' : (dn > 0 && !Z.finished ? 'Próxima zona a ' + Math.round(dn) + ' m' : 'Você está na área segura'));
    this._s(E['zone-vignette'], 'opacity', out ? 1 : 0);
    // mensagens
    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT <= 0) E['center-msg'].classList.remove('show'); }
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 2);
    this._s(E['damage-vignette'], 'opacity', Math.max(this.dmgFlash, P.hp < 30 ? 0.5 + Math.sin(G.time * 5) * 0.2 : 0));
    // fps
    E.fps.classList.toggle('hidden', !LS.settings.showFps);
    // minimapa: no máximo 30 vezes por segundo (15 no celular) — desenhar o canvas todo quadro pesava
    const now = performance.now(), mmGap = LS.Touch.active ? 66 : 33;
    if (G.mode === 'br' && now - (this._mmT || 0) >= mmGap) { this._mmT = now; this.drawMinimap(G); } // duelo: sem minimapa (o galpão é pequeno)
    this.updateShots(G);
    if (!E.bigmap.classList.contains('hidden')) this.drawBigMap(G);
  },

  // ---------- mapas ----------
  // listras animadas pra área fora da zona (gás)
  gasPattern(ctx) {
    if (!this._gasCv) {
      const c = this._gasCv = document.createElement('canvas'); c.width = c.height = 24;
      const g = c.getContext('2d'); g.fillStyle = 'rgba(88, 50, 190, 0.42)'; g.fillRect(0, 0, 24, 24);
      g.strokeStyle = 'rgba(170, 120, 255, 0.35)'; g.lineWidth = 5;
      for (let i = -24; i <= 48; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i - 24, 24); g.stroke(); }
    }
    const key = ctx === this.mm ? '_gasM' : '_gasB';
    if (!this[key]) this[key] = ctx.createPattern(this._gasCv, 'repeat');
    return this[key];
  },
  // desenha o mundo (terreno, cidades, zona, avião, tiros). (cx,cz) = centro, view = metros visíveis, rot = giro
  drawWorld(ctx, size, G, cx, cz, view, rot, t) {
    const P = G.player, half = LS.MAP_SIZE / 2, sc = size / view, Z = G.zone;
    ctx.save();
    ctx.fillStyle = '#1d4f78'; ctx.fillRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2); ctx.rotate(rot); ctx.scale(sc, sc); ctx.translate(-cx, -cz);
    if (this.mapImg) ctx.drawImage(this.mapImg, -half, -half, LS.MAP_SIZE, LS.MAP_SIZE);
    // nomes das cidades (sempre de pé)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const tw of LS.World.towns) {
      ctx.save(); ctx.translate(tw.x, tw.z); ctx.rotate(-rot); ctx.scale(1 / sc, 1 / sc);
      ctx.font = '400 ' + Math.round(size / 24) + 'px Tiny5, "Pixelify Sans", sans-serif'; ctx.lineWidth = size / 110; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.fillStyle = '#fff';
      ctx.strokeText(tw.name.toUpperCase(), 0, 0); ctx.fillText(tw.name.toUpperCase(), 0, 0); ctx.restore();
    }
    // fora da zona: gás roxo com listras que andam
    const zr = Math.max(Z.radius, 0.1), pat = this.gasPattern(ctx);
    if (pat.setTransform) pat.setTransform(new DOMMatrix().translate(cx + (t * 10) % 24, cz).scale(1 / sc));
    ctx.beginPath(); ctx.rect(-2000, -2000, 4000, 4000); ctx.arc(Z.center.x, Z.center.y, zr, 0, Math.PI * 2, true);
    ctx.fillStyle = pat; ctx.fill();
    // borda da zona com brilho pulsando
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.strokeStyle = 'rgba(120, 170, 255, ' + (0.25 + pulse * 0.25) + ')'; ctx.lineWidth = (6 + pulse * 4) / sc * (size / 440);
    ctx.beginPath(); ctx.arc(Z.center.x, Z.center.y, zr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#7fb0ff'; ctx.lineWidth = 2.6 / sc * (size / 440) * 1.4;
    ctx.beginPath(); ctx.arc(Z.center.x, Z.center.y, zr, 0, Math.PI * 2); ctx.stroke();
    // próxima zona: tracejado andando
    if (!Z.finished) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2 / sc * (size / 440) * 1.4; ctx.setLineDash([10 / sc, 7 / sc]); ctx.lineDashOffset = -t * 18 / sc;
      ctx.beginPath(); ctx.arc(Z.next.x, Z.next.y, Math.max(Z.nextR, 0.1), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    // fora da zona: caminho até ela
    if (Z.isOutside(P.pos) && P.state === 'ground') {
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3 / sc * (size / 440) * 1.4; ctx.setLineDash([8 / sc, 6 / sc]); ctx.lineDashOffset = -t * 30 / sc;
      ctx.beginPath(); ctx.moveTo(P.pos.x, P.pos.z); ctx.lineTo(Z.next.x, Z.next.y); ctx.stroke(); ctx.setLineDash([]);
    }
    // avião e a rota dele
    if (G.plane.active) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2 / sc * (size / 440) * 1.4; ctx.setLineDash([12 / sc, 8 / sc]); ctx.lineDashOffset = -t * 25 / sc;
      ctx.beginPath(); ctx.moveTo(G.plane.start.x, G.plane.start.z); ctx.lineTo(G.plane.end.x, G.plane.end.z); ctx.stroke(); ctx.setLineDash([]);
      const pp = G.plane.mesh.position, a = Math.atan2(G.plane.end.z - G.plane.start.z, G.plane.end.x - G.plane.start.x);
      ctx.save(); ctx.translate(pp.x, pp.z); ctx.rotate(a); ctx.scale(1 / sc, 1 / sc); const k = size / 440 * 1.4;
      ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(14 * k, 0); ctx.lineTo(-10 * k, -3 * k); ctx.lineTo(-6 * k, -14 * k); ctx.lineTo(-11 * k, -14 * k); ctx.lineTo(-16 * k, -3 * k); ctx.lineTo(-18 * k, -3 * k); ctx.lineTo(-18 * k, 3 * k); ctx.lineTo(-16 * k, 3 * k); ctx.lineTo(-11 * k, 14 * k); ctx.lineTo(-6 * k, 14 * k); ctx.lineTo(-10 * k, 3 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // aliados do esquadrão: bolinhas azuis
    if (P.team != null) for (const f of G.fighters) if (f !== P && f.alive && f.team === P.team && f.state !== 'plane') {
      ctx.save(); ctx.translate(f.pos.x, f.pos.z); ctx.scale(1 / sc, 1 / sc); const r = size / 440 * 9;
      ctx.fillStyle = '#2fd6ff'; ctx.strokeStyle = '#06263a'; ctx.lineWidth = r * 0.45; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    // tiros: ondas vermelhas onde alguém atirou
    const now = performance.now();
    for (const [f, s] of this.shots) {
      if (!f.alive) continue;
      const age = (now - s.t) / 1000; if (age > 1.6) continue;
      const k = size / 440 * 1.4, a = Math.max(0, 1 - age / 1.6);
      ctx.save(); ctx.translate(f.pos.x, f.pos.z); ctx.scale(1 / sc, 1 / sc);
      for (let i = 0; i < 2; i++) { const w = ((t * 1.6 + i * 0.5) % 1); ctx.strokeStyle = 'rgba(255, 70, 70, ' + (a * (1 - w)) + ')'; ctx.lineWidth = 2.5 * k; ctx.beginPath(); ctx.arc(0, 0, (4 + w * 14) * k, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255, 64, 64, ' + a + ')'; ctx.beginPath(); ctx.arc(0, 0, 4 * k, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },
  // seta do jogador (com o cone de visão)
  drawPlayer(ctx, x, y, k, ang, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, 70 * k);
    cone.addColorStop(0, 'rgba(255, 220, 140, 0.45)'); cone.addColorStop(1, 'rgba(255, 220, 140, 0)');
    ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 70 * k, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255, 138, 31, ' + (0.25 + 0.2 * Math.sin(t * 5)) + ')'; ctx.beginPath(); ctx.arc(0, 0, (13 + 2 * Math.sin(t * 5)) * k, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff8a1f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2 * k; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, -11 * k); ctx.lineTo(8 * k, 8 * k); ctx.lineTo(0, 4 * k); ctx.lineTo(-8 * k, 8 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  },
  // esquadrão: nome e vida dos aliados (só no battle royale em times)
  updateSquad(G) {
    const now = performance.now(); if (now - (this._sqT || 0) < 250) return; this._sqT = now;
    const el = this.$('squad'), P = G.player, on = G.mode === 'br' && P.team != null && (G.state === 'playing' || G.state === 'paused');
    el.classList.toggle('hidden', !on); if (!on) { this._sqK = ''; return; }
    const mates = G.fighters.filter(f => f !== P && f.team === P.team);
    const key = mates.map(f => f.name + ':' + (f.alive ? Math.ceil(f.hp) : 'x')).join('|');
    if (key === this._sqK) return; this._sqK = key;
    el.innerHTML = mates.map(f => '<div class="sq' + (f.alive ? '' : ' dead') + (f.isPlayer === false && !(f instanceof LS.Bot) ? ' human' : '') + '"><b>' + LS.Profile.esc(f.name) + '</b><i><em style="width:' + (f.alive ? Math.max(0, f.hp) : 0) + '%"></em></i></div>').join('');
  },
  // minimapa redondo que gira com a câmera, com bússola na borda
  drawMinimap(G) {
    const ctx = this.mm, S = ctx.canvas.width, R = S / 2, t = performance.now() / 1000, k = S / 440;
    const sp = LS.Spectate.focus(), P = sp || G.player; // espectador: o mapa segue quem você assiste
    const c = P.state === 'plane' ? G.plane.mesh.position : P.pos;
    const view = P.state === 'ground' ? 170 : P.state === 'plane' ? 520 : 300;
    const rot = Math.PI + (sp ? LS.Spectate.cy : P.camYaw), rIn = R - 30 * k;
    ctx.clearRect(0, 0, S, S);
    ctx.save(); ctx.beginPath(); ctx.arc(R, R, rIn, 0, Math.PI * 2); ctx.clip();
    this.drawWorld(ctx, S, G, c.x, c.z, view, rot, t);
    const sh = ctx.createRadialGradient(R, R, rIn * 0.6, R, R, rIn); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)'); // sombra na borda
    ctx.fillStyle = sh; ctx.fillRect(0, 0, S, S);
    ctx.restore();
    if (P.state !== 'plane') this.drawPlayer(ctx, R, R, k * 1.3, 0, t);
    // anel da bússola (vermelho piscando fora da zona)
    const out = G.zone.isOutside(P.pos) && P.state === 'ground';
    ctx.lineWidth = 30 * k; ctx.strokeStyle = out ? 'rgba(' + Math.round(150 + 80 * Math.sin(t * 8)) + ', 20, 40, 0.92)' : 'rgba(10, 14, 24, 0.88)';
    ctx.beginPath(); ctx.arc(R, R, R - 15 * k, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(255, 197, 49, 0.9)'; ctx.beginPath(); ctx.arc(R, R, rIn, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2 * k; ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'; ctx.beginPath(); ctx.arc(R, R, R - 2 * k, 0, Math.PI * 2); ctx.stroke();
    // marquinhas a cada 15° e as letras, girando com a câmera
    for (let i = 0; i < 24; i++) {
      const a = rot - Math.PI / 2 + i * Math.PI / 12, big = i % 6 === 0;
      if (big) continue;
      const r1 = R - (i % 2 ? 9 : 13) * k, r2 = R - 21 * k;
      ctx.strokeStyle = 'rgba(255,255,255,' + (i % 2 ? 0.3 : 0.55) + ')'; ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.moveTo(R + Math.cos(a) * r1, R + Math.sin(a) * r1); ctx.lineTo(R + Math.cos(a) * r2, R + Math.sin(a) * r2); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [['N', 0, '#ff8a1f'], ['L', 1, '#fff'], ['S', 2, '#fff'], ['O', 3, '#fff']].forEach(([l, i, col]) => {
      const a = rot - Math.PI / 2 + i * Math.PI / 2, x = R + Math.cos(a) * (R - 15 * k), y = R + Math.sin(a) * (R - 15 * k);
      ctx.font = '400 ' + Math.round((i ? 17 : 21) * k) + 'px Tiny5, "Pixelify Sans", sans-serif';
      ctx.fillStyle = col; ctx.fillText(l, x, y + 1 * k);
    });
    // marcador de "pra frente" no topo do anel
    ctx.fillStyle = '#ffc531'; ctx.beginPath(); ctx.moveTo(R, 31 * k); ctx.lineTo(R - 7 * k, 21 * k); ctx.lineTo(R + 7 * k, 21 * k); ctx.closePath(); ctx.fill();
  },
  drawBigMap(G) {
    const ctx = this.bm, S = ctx.canvas.width, t = performance.now() / 1000, P = G.player, sc = S / LS.MAP_SIZE;
    this.drawWorld(ctx, S, G, 0, 0, LS.MAP_SIZE, 0, t);
    if (P.state !== 'plane') this.drawPlayer(ctx, S / 2 + P.pos.x * sc, S / 2 + P.pos.z * sc, S / 600 * 1.1, Math.PI - P.camYaw, t);
    ctx.fillStyle = '#ff8a1f'; ctx.font = '400 22px Tiny5, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', S / 2, 22);
  },
  toggleBigMap() { this.el.bigmap.classList.toggle('hidden'); },

  // ---------- indicador de tiro na tela ----------
  // alguém atirou perto: um arco vermelho em volta da mira aponta a DIREÇÃO do tiro (como nos jogos de celular),
  // sem mostrar onde a pessoa está exatamente. Some ~1 s depois do último tiro.
  shots: new Map(),
  gunshot(f) {
    const G = LS.Game, P = G.player;
    if (!P || f === P || !f.alive || LS.sameTeam(f, P) || !P.alive) return;
    if (f.pos.distanceTo(P.pos) > 160) return;
    const s = this.shots.get(f) || {};
    s.t = performance.now(); this.shots.set(f, s);
  },
  clearShots() {
    for (const s of this.shots.values()) if (s.el) s.el.remove();
    this.shots.clear();
  },
  updateShots(G) {
    const box = document.getElementById('shot-ind'), P = G.player, now = performance.now();
    for (const [f, s] of this.shots) {
      const age = (now - s.t) / 1000;
      if (age > 1.1 || !f.alive || !P.alive) { if (s.el) s.el.remove(); this.shots.delete(f); continue; }
      if (!s.el) { s.el = document.createElement('div'); s.el.className = 'si'; s.el.innerHTML = '<b></b><i></i>'; box.appendChild(s.el); }
      const rel = LS.util.angleDiff(P.camYaw, Math.atan2(f.pos.x - P.pos.x, f.pos.z - P.pos.z));
      const d = f.pos.distanceTo(P.pos), near = 1 - Math.min(1, d / 160); // mais perto = arco mais grosso e forte
      s.el.style.transform = 'rotate(' + (-rel).toFixed(3) + 'rad)';
      s.el.style.setProperty('--w', (4 + near * 6).toFixed(1) + 'px');
      s.el.style.opacity = (age < 0.6 ? 1 : Math.max(0, 1 - (age - 0.6) / 0.5)) * (0.55 + near * 0.45);
      if (s.fresh !== s.t) { s.fresh = s.t; s.el.classList.remove('pop'); void s.el.offsetWidth; s.el.classList.add('pop'); } // pulsa a cada tiro
    }
  },
  // ---------- INVENTÁRIO ----------
  invTab: 'weapons',
  // layout compacto (celular, janela pequena): abas em vez de tudo de uma vez
  invCompact() { return document.body.classList.contains('mobile') || window.innerWidth <= 780 || window.innerHeight <= 560; },
  renderInventory() {
    const P = LS.Game.player, E = this.el, inv = E.inventory;
    const compact = this.invCompact();
    inv.classList.toggle('compact', compact);
    const body = document.getElementById('inv-body'); if (body) body.dataset.tab = this.invTab;
    document.querySelectorAll('#inv-tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === this.invTab));
    // só mexe no HTML quando algo mudou: refazer a lista a cada 0,25 s "engolia" o toque do celular e perdia a rolagem
    const set = (el, html) => { if (el._h !== html) { el._h = html; el.innerHTML = html; } };
    const pct = (v, m) => Math.max(0, Math.min(100, m > 0 ? v / m * 100 : 0)).toFixed(0);
    const bar = (v, m, txt, cls) => '<div class="ib ' + (cls || '') + '"><i style="width:' + pct(v, m) + '%"></i><span>' + txt + '</span></div>';
    const ico = (t, id, lv, off) => '<div class="ico-box' + (off ? ' off' : '') + '">' + LS.Icons.img(t, id, lv, 'ico') + '</div>';
    // --- vida e abates (cabeçalho) ---
    const hp = Math.ceil(P.hp), hpc = hp > 60 ? '' : hp > 30 ? 'mid' : 'low';
    set(E['inv-cap'], '<div class="hp ' + hpc + '"><i style="width:' + pct(P.hp, 100) + '%"></i><span>❤ ' + hp + ' / 100</span></div><div class="kills"><b>' + P.kills + '</b> abates</div>');
    // --- armas ---
    let h = '';
    P.weapons.forEach((w, i) => {
      if (!w) { h += '<div class="iw empty"><div class="iw-main"><b>Slot ' + (i + 1) + '</b><span class="sub">vazio · pegue uma arma no chão</span></div></div>'; return; }
      const d = LS.WEAPONS[w.id], eq = i === P.slot, res = P.ammo[d.ammo] | 0;
      h += '<div class="iw r' + d.rarity + (eq ? ' eq' : '') + '">' + ico('weapon', w.id) +
        '<div class="iw-main"><div class="iw-top"><b>' + d.name + '</b>' + (eq ? '<em class="tag">NA MÃO</em>' : '') + '<span class="rar">' + LS.Items.RARITY_NAMES[d.rarity] + '</span></div>' +
        '<div class="chips"><span>' + d.cat + '</span><span>Dano ' + d.dmg + (d.pellets > 1 ? 'x' + d.pellets : '') + '</span><span>' + d.rate + ' tiros/s</span></div>' +
        bar(w.mag, d.mag, 'Pente ' + w.mag + ' / ' + d.mag, 'mag') +
        '<span class="sub">Reserva ' + res + ' · ' + LS.AMMO_TYPES[d.ammo].name + '</span></div>' +
        '<div class="btns">' + (eq ? '<button data-inv="reload">RECARREGAR</button>' : '<button data-inv="equip" data-v="' + i + '">EQUIPAR</button>') +
        '<button class="sec" data-inv="dropw" data-v="' + i + '">LARGAR</button></div></div>';
    });
    set(E['inv-weapons'], h);
    // --- munição ---
    h = '';
    for (const t in P.ammo) {
      const mx = P.maxAmmo(t);
      h += '<div class="it' + (P.ammo[t] ? '' : ' none') + '">' + ico('ammo', t) + '<div class="it-main"><b>' + LS.AMMO_TYPES[t].name + '</b>' + bar(P.ammo[t], mx, P.ammo[t] + ' / ' + mx) + '</div>' +
        (P.ammo[t] > 0 ? '<div class="btns"><button class="sec" data-inv="dropa" data-v="' + t + '">LARGAR</button></div>' : '') + '</div>';
    }
    set(E['inv-ammo'], h);
    // --- cura ---
    h = '';
    for (const t in P.meds) {
      const m = LS.MEDS[t], n = P.meds[t];
      h += '<div class="it' + (n ? '' : ' none') + '">' + ico('med', t) + '<div class="it-main"><b>' + m.name + '</b>' + bar(n, P.maxMed(t), n + ' / ' + P.maxMed(t)) + '<span class="sub">+' + m.heal + ' HP · ' + m.time + 's</span></div>' +
        (n > 0 ? '<div class="btns"><button data-inv="heal" data-v="' + t + '">USAR</button><button class="sec" data-inv="dropm" data-v="' + t + '">LARGAR</button></div>' : '') + '</div>';
    }
    set(E['inv-meds'], h);
    // --- equipamento ---
    const piece = (k, name, g) => {
      const L = g.level, def = L ? LS.GEAR[k].levels[L] : null;
      return '<div class="it gear' + (L ? '' : ' none') + ' lv' + L + '">' + ico(k, null, L || 1, !L) + '<div class="it-main"><b>' + name + '</b><span class="sub">' + (L ? 'Nível ' + L + ' · -' + Math.round(def.red * 100) + '% dano' : 'nenhum') + '</span>' +
        (L ? bar(g.dur, def.dur, Math.ceil(g.dur) + ' / ' + def.dur, 'dur') : '') + '</div></div>';
    };
    set(E['inv-gear'], piece('vest', 'Colete', P.vest) + piece('helmet', 'Capacete', P.helmet) +
      '<div class="it gear' + (P.bag ? '' : ' none') + ' lv' + P.bag + '">' + ico('bag', null, P.bag || 1, !P.bag) + '<div class="it-main"><b>Mochila</b><span class="sub">' + (P.bag ? 'Nível ' + P.bag + ' · capacidade x' + P.bagMult() : 'nenhuma') + '</span></div></div>');
  }
};
