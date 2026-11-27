// Morte e modo espectador (battle royale).
//  1) MORTE: câmera lenta curtinha, a tela perde a cor, faixas de cinema e a câmera sobe do corpo e vira pra
//     quem te eliminou (killcam com zoom). Aparece o cartão: quem foi, arma, distância, vida que sobrou,
//     sua colocação e seus números. ASSISTIR (sozinho depois de uns segundos) ou VER RESULTADO.
//  2) ESPECTADOR: câmera no ombro de quem está vivo (começa no seu assassino). Trocar com A/D, ←/→ ou as setas
//     da tela; arrastar gira a câmera em volta (volta sozinha pra trás dele); roda do mouse aproxima.
//     Se quem você assiste morre, mostra quem eliminou e passa pra ele. Sobrou um só: faixa do vencedor e resultado.
//  3) DUELO: mesma killcam e cartão (compacto, sem botões: o round segue sozinho). No 2v2 passa a assistir o parceiro;
//     no round seguinte (você renasce) tudo some.
'use strict';
LS.Spectate = {
  active: false, phase: null,
  AUTO: 7, // segundos até começar a assistir sozinho

  // ---------- começo ----------
  start(killer, weapon, head) {
    const G = LS.Game, P = G.player;
    this.build();
    this.active = true; this.phase = 'death'; this.t = 0; this.shown = false; this.uiT = 0; this.autoT = this.AUTO;
    this.killer = killer && killer !== P ? killer : null;
    this.duel = G.mode === 'duel' || G.mode === 'custom'; this.watchOnly = false; // sala personalizada: igual ao duelo (só o seu time)
    this.el.root.classList.toggle('duel', this.duel); this.el.death.classList.toggle('duel', this.duel); this.el.spec.classList.toggle('duel', this.duel);
    this.target = null; this.tDead = 0; this.killedBy = null; this.overT = 0; this.oYaw = 0; this.oPitch = 0; this.zoom = 3.7; this.dragT = 0;
    this.cy = P.camYaw; this.camPos = G.camera.position.clone(); this.lookAt = P.eyePos(new THREE.Vector3());
    const dist = this.killer ? Math.hypot(this.killer.pos.x - P.pos.x, this.killer.pos.y - P.pos.y, this.killer.pos.z - P.pos.z) : 0;
    this.info = { weapon: weapon || '', head: !!head, dist, place: P.placement || G.aliveCount() + 1, total: G.fighters.length, kills: P.kills, dmg: P.damageDealt, time: G.time };
    // direção da killcam: a câmera fica atrás do corpo, olhando pra quem atirou
    const k = this.killer;
    this.dAng = k ? Math.atan2(P.pos.x - k.pos.x, P.pos.z - k.pos.z) : P.camYaw + Math.PI;
    if (G.inventoryOpen) { G.inventoryOpen = false; document.getElementById('inventory').classList.add('hidden'); }
    LS.Input.enabled = false; LS.Input.unlock();
    document.getElementById('bigmap').classList.add('hidden');
    document.body.classList.add('ls-dead'); document.body.classList.remove('ls-spec');
    const cv = G.renderer.domElement; cv.style.transition = 'filter 0.9s ease';
    G.fxFilter = ' grayscale(0.92) contrast(1.12) brightness(0.86)'; G.applyColors();
    this.el.death.classList.add('hidden'); this.el.spec.classList.add('hidden');
    this.el.fx.className = 'sp-fx on';
    LS.Audio.death && LS.Audio.death();
  },
  stop() {
    if (!this.el) return;
    this.active = false; this.phase = null; this.target = null;
    document.body.classList.remove('ls-dead', 'ls-spec'); this.watchOnly = false; this.el.spec.classList.remove('watch');
    ['death', 'spec'].forEach(k => this.el[k].classList.add('hidden'));
    this.el.fx.className = 'sp-fx';
    const G = LS.Game; G.fxFilter = ''; if (G.renderer) { G.applyColors(); setTimeout(() => { if (!this.active) G.renderer.domElement.style.transition = ''; }, 1000); }
  },
  // câmera lenta só no instante da morte (offline: online o tempo é de todo mundo)
  timeScale() {
    if (!this.active || this.phase !== 'death' || LS.Net.online || this.t > 1.1) return 1;
    const k = this.t / 1.1; return 0.28 + 0.72 * k * k;
  },
  focus() { return this.active && this.phase !== 'death' && this.target ? this.target : null; },
  others() {
    const P = LS.Game.player, alive = LS.Game.fighters.filter(f => f !== P && f.alive && f.state !== 'plane');
    if (this.watchOnly) return alive; // espectador da sala: todo mundo
    if (this.duel) return alive.filter(f => LS.sameTeam(P, f)); // duelo/sala: só o seu time
    const mates = alive.filter(f => LS.sameTeam(P, f)); return mates.length ? mates : alive; // esquadrão: aliados primeiro, depois quem sobrou
  }, // duelo/sala: só o seu time · espectador da sala: todo mundo
  // espectador da sala personalizada (não joga): assiste qualquer um, a partida inteira
  watchAll() {
    this.build();
    this.active = true; this.duel = true; this.watchOnly = true; this.phase = 'spec'; this.t = 0; this.shown = true; this.killer = null;
    this.target = null; this.tDead = 0; this.killedBy = null; this.oYaw = 0; this.oPitch = 0; this.zoom = 3.7; this.dragT = 0;
    this.camPos = LS.Game.camera.position.clone(); this.lookAt = new THREE.Vector3(); this.cy = 0;
    LS.Input.enabled = false; LS.Input.unlock();
    document.body.classList.add('ls-dead', 'ls-spec');
    this.el.root.classList.add('duel'); this.el.death.classList.add('hidden'); this.el.spec.classList.remove('duel'); this.el.spec.classList.add('watch'); this.el.fx.className = 'sp-fx';
    this.el.spec.classList.remove('hidden'); this.retarget();
  },
  retarget() { if (!this.active) return; const l = this.others(); this.setTarget(l.find(f => f.isPlayer === false) || l[0], true); this.el.spec.classList.toggle('solo', l.length < 2); },

  // ---------- eventos do jogo ----------
  onKill(victim, killer) {
    if (!this.active) return;
    if (victim === this.target) { this.killedBy = killer && killer !== victim ? killer : null; }
    else if (killer && killer === this.target && this.phase === 'spec') {
      this.flash(killer.name + ' <i>ELIMINOU</i> ' + victim.name, 'kill');
      this.el.card.classList.remove('pop'); void this.el.card.offsetWidth; this.el.card.classList.add('pop');
    }
  },
  watch() {
    if (!this.active) return;
    LS.Audio.click();
    this.phase = 'spec'; this.el.death.classList.add('hidden');
    document.body.classList.add('ls-spec'); this.el.fx.className = 'sp-fx';
    LS.Game.fxFilter = ''; LS.Game.applyColors();
    const k = this.killer, list = this.others();
    this.setTarget(k && list.includes(k) && !k.netHidden ? k : this.nearest(list), true);
    this.el.spec.classList.toggle('solo', this.others().length < 2);
    this.el.spec.classList.remove('hidden');
    this.checkOver();
  },
  leave() { if (!this.active) return; LS.Audio.click(); this.stop(); LS.Game.endMatch(false); },
  nearest(list, from) {
    const p = (from || LS.Game.player).pos; let best = null, bd = 1e9;
    for (const f of list) { if (f.netHidden) continue; const d = (f.pos.x - p.x) ** 2 + (f.pos.z - p.z) ** 2; if (d < bd) { bd = d; best = f; } }
    return best || list[0] || null;
  },
  cycle(dir) {
    const list = this.others(); if (!list.length) return;
    let i = list.indexOf(this.target); i = ((i < 0 ? 0 : i + dir) % list.length + list.length) % list.length;
    if (list[i] === this.target) return;
    LS.Audio.click(); this.setTarget(list[i]);
  },
  setTarget(f, cut) {
    if (!f) return;
    const far = !this.target || Math.hypot(f.pos.x - this.camPos.x, f.pos.z - this.camPos.z) > 45;
    this.target = f; this.tDead = 0; this.killedBy = null; this.hidT = 0;
    this.cy = f.yaw; this.oYaw = 0; this.oPitch = 0;
    if (cut || far) { this.cut = true; this.el.wipe.classList.remove('go'); void this.el.wipe.offsetWidth; this.el.wipe.classList.add('go'); }
    LS.Thumbs.face(f.model.look, this.el.sface);
    this.el.sname.textContent = f.name;
    this.el.card.classList.remove('pop'); void this.el.card.offsetWidth; this.el.card.classList.add('pop');
    this.el.card.classList.remove('dead');
    this.uiT = 0;
  },
  checkOver() {
    if (this.phase === 'over' || this.duel) return; // no duelo quem cuida do fim é o round
    const G = LS.Game, P = G.player, ts = LS.teamsAlive(G.fighters);
    if (ts.size > 1) return;
    if (P.team != null && ts.has(P.team)) return; // sobrou o seu esquadrão: o jogo mostra a vitória
    const list = this.others();
    this.phase = 'over'; this.overT = 5;
    const w = list[0];
    if (w) { if (w !== this.target) this.setTarget(w); const n = list.length;
      this.el.over.innerHTML = '<small>FIM DE JOGO</small><b>' + (n > 1 ? 'ESQUADRÃO DE ' + w.name : w.name) + '</b><span>' + (n > 1 ? 'SÃO OS LAST SURVIVORS!' : 'É O LAST SURVIVOR!') + '</span>'; }
    else this.el.over.innerHTML = '<small>FIM DE JOGO</small><b>NINGUÉM</b><span>SOBREVIVEU</span>';
    this.el.over.classList.add('show'); this.el.spec.classList.remove('hidden'); this.el.death.classList.add('hidden');
    document.body.classList.add('ls-spec'); this.el.fx.className = 'sp-fx';
    LS.Game.fxFilter = ''; LS.Game.applyColors();
  },
  flash(html, cls) {
    const m = document.createElement('div'); m.className = 'sp-flash ' + (cls || ''); m.innerHTML = html;
    this.el.msgs.appendChild(m); m.addEventListener('animationend', () => m.remove());
    while (this.el.msgs.children.length > 3) this.el.msgs.firstChild.remove();
  },

  // ---------- a cada quadro (chamado pelo Player quando morto) ----------
  frame(cam) {
    const G = LS.Game, rd = Math.min(0.05, G.lastDt || 0.016), P = G.player;
    if (!this.active) return;
    // o corpo cai (o Player não anima mais depois de morto)
    if (!this.watchOnly) { P.model.root.position.copy(P.pos); P.model.animate({ dt: rd * this.timeScale(), dead: true }); }
    this.t += rd;
    if (this.phase === 'death') {
      if (this.t > 0.8 && this.el.death.classList.contains('hidden') && !this.shown) { this.shown = true; this.showDeath(); }
      if (this.shown && this.duel) { if (this.t > 2.2 && this.others().length) this.watch(); } // duelo: sem botões, passa pro parceiro
      else if (this.shown) {
        this.autoT -= rd;
        const left = Math.max(0, this.autoT);
        this.el.ring.style.setProperty('--p', (1 - left / this.AUTO).toFixed(3));
        this.el.autoN.textContent = Math.ceil(left);
        if (this.autoT <= 0) { if (this.others().length) this.watch(); else this.leave(); return; }
      }
      this.deathCam(rd, cam);
      return;
    }
    // espectador / fim
    let T = this.target;
    if (T && T.alive && T.netHidden) { this.hidT += rd; if (this.hidT > 1.2) { this.setTarget(this.nearest(this.others(), T)); T = this.target; } } else this.hidT = 0;
    if (T && !T.alive && this.phase === 'spec') {
      if (!this.tDead) {
        this.tDead = 1.9; this.el.card.classList.add('dead');
        const kb = this.killedBy;
        this.flash('<b>' + T.name + '</b> foi eliminado' + (kb ? ' por <b>' + kb.name + '</b>' : ''), 'dead');
      }
      this.tDead -= rd;
      if (this.tDead <= 0) {
        const kb = this.killedBy, list = this.others();
        if (list.length > (this.duel ? 0 : 1)) this.setTarget(kb && list.includes(kb) && !kb.netHidden ? kb : this.nearest(list, T));
        T = this.target;
      }
    }
    if (!T || (!T.alive && this.tDead <= 0)) { const list = this.others(); if (list.length) this.setTarget(this.nearest(list)); T = this.target; }
    this.checkOver();
    if (this.phase === 'over') { this.overT -= rd; if (this.overT <= 0) { this.leave(); return; } }
    if (T) this.specCam(rd, cam, T);
    this.uiT -= rd; if (this.uiT <= 0) { this.uiT = 0.12; this.updateSpecUI(); }
  },
  // killcam: sobe do corpo girando e depois olha pra quem te eliminou, com zoom
  deathCam(rd, cam) {
    const G = LS.Game, P = G.player, W = LS.World, t = this.t, ss = x => x * x * (3 - 2 * x);
    const c = this._c || (this._c = new THREE.Vector3()), look = this._l || (this._l = new THREE.Vector3()), o = this._o || (this._o = new THREE.Vector3()), d = this._d || (this._d = new THREE.Vector3());
    const e = ss(Math.min(1, t / 1.2)), K = this.killer;
    const ang = this.dAng + (1 - e) * 1.1 + (K ? 0 : t * 0.12), r = 2.2 + e * 1.4, h = 1.3 + e * 1.4;
    o.set(P.pos.x, P.pos.y + 1.0, P.pos.z);
    d.set(Math.sin(ang) * r, h - 1.0, Math.cos(ang) * r); const len = d.length(); d.divideScalar(len);
    const free = Math.max(0.6, W.raycast(o, d, len + 0.3) - 0.3);
    c.copy(o).addScaledVector(d, Math.min(len, free));
    look.set(P.pos.x, P.pos.y + 0.4, P.pos.z);
    let fov = 62;
    if (K && t > 0.7) { // vira pra quem atirou e aproxima
      const k = ss(Math.min(1, (t - 0.7) / 0.9));
      const kx = K.pos.x, ky = K.pos.y + 1.1, kz = K.pos.z;
      look.set(look.x + (kx - look.x) * k, look.y + (ky - look.y) * k, look.z + (kz - look.z) * k);
      const dk = Math.hypot(kx - c.x, ky - c.y, kz - c.z);
      fov = 62 + (LS.util.clamp(2 * Math.atan(2.4 / Math.max(1, dk)) * 180 / Math.PI, 14, 62) - 62) * k;
      look.y -= Math.tan(fov * Math.PI / 180 * 0.17) * dk * k; // mira um pouco abaixo: quem atirou fica no alto da tela, acima do cartão
    }
    const a = 1 - Math.exp(-rd * 7);
    this.camPos.lerp(c, a); this.lookAt.lerp(look, a);
    cam.position.copy(this.camPos); cam.lookAt(this.lookAt);
    cam.fov = LS.util.lerp(cam.fov, fov, Math.min(1, rd * 5)); cam.updateProjectionMatrix();
  },
  // ombro de quem você assiste (segue pra onde ele olha; arrastar gira em volta)
  specCam(rd, cam, T) {
    const W = LS.World, U = LS.util;
    const I = LS.Input; if (I.locked) { this.oYaw -= I.mouse.dx * 0.004; this.oPitch -= I.mouse.dy * 0.003; if (I.mouse.dx || I.mouse.dy) this.dragT = 2; }
    this.dragT -= rd;
    if (this.dragT <= 0) { const k = Math.exp(-rd * 1.6); this.oYaw *= k; this.oPitch *= k; } // volta pra trás dele
    this.oPitch = U.clamp(this.oPitch, -0.9, 0.9);
    const ground = T.state === 'ground' || !T.alive;
    this.cy += U.angleDiff(this.cy, T.yaw + this.oYaw) * (1 - Math.exp(-rd * (this.dragT > 0 ? 18 : 5)));
    const pitch = U.clamp((ground ? -0.2 : -0.5) + (T.alive ? (T.pitch || 0) * 0.35 : -0.3) + this.oPitch, -1.2, 0.85);
    const head = this._h || (this._h = new THREE.Vector3()); T.eyePos(head); head.y += ground ? 0.2 : 1.5;
    if (!T.alive) head.y = T.pos.y + 0.6;
    const cp = Math.cos(pitch), fwd = this._f || (this._f = new THREE.Vector3());
    fwd.set(Math.sin(this.cy) * cp, Math.sin(pitch), Math.cos(this.cy) * cp).normalize();
    const sd = this._sd || (this._sd = new THREE.Vector3()); sd.set(-Math.cos(this.cy), 0, Math.sin(this.cy));
    let side = ground ? 0.6 : 0; if (side) side = Math.max(0, Math.min(side, W.raycast(head, sd, side + 0.4) - 0.4));
    head.addScaledVector(sd, side);
    const back = this._b || (this._b = new THREE.Vector3()); back.copy(fwd).negate();
    const want = ground ? this.zoom : 9;
    let d = Math.max(0.3, Math.min(want, W.raycast(head, back, want + 0.45) - 0.45));
    const c = this._c2 || (this._c2 = new THREE.Vector3()); c.copy(head).addScaledVector(back, d);
    while (d > 0.05 && W.sphereHits(c.x, c.y, c.z, 0.3)) { d = Math.max(0.05, d - 0.15); c.copy(head).addScaledVector(back, d); }
    if (this.cut) { this.camPos.copy(c); this.cut = false; } else this.camPos.lerp(c, 1 - Math.exp(-rd * 16));
    cam.position.copy(this.camPos);
    cam.lookAt(this.lookAt.copy(this.camPos).add(fwd));
    cam.fov = U.lerp(cam.fov, 68, Math.min(1, rd * 4)); cam.updateProjectionMatrix();
  },

  // ---------- interface ----------
  build() {
    if (this.el) return;
    const d = document.createElement('div'); d.id = 'spec-root';
    const chev = p => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="' + p + '"/></svg>';
    d.innerHTML =
      '<div class="sp-fx"><i class="sp-bar t"></i><i class="sp-bar b"></i><i class="sp-vig"></i></div>' +
      '<div class="sp-wipe"></div>' +
      '<div id="death-ui" class="hidden">' +
        '<div class="du-head"><div class="du-title" data-t="ELIMINADO">ELIMINADO</div><div class="du-place"><b></b><span></span></div></div>' +
        '<div class="du-bottom"><div class="du-rib"></div>' +
          '<div class="du-card"><div class="du-face"><img alt=""></div><div class="du-who"><small></small><b></b><div class="du-hp"><i></i></div><span class="du-gear"></span></div>' +
            '<div class="du-weap"><img alt=""><b></b><span></span></div></div>' +
          '<div class="du-stats"><div><b data-s="kills">0</b><span>ABATES</span></div><div><b data-s="dmg">0</b><span>DANO</span></div><div><b data-s="time">00:00</b><span>SOBREVIVEU</span></div></div>' +
          '<div class="du-btns"><button class="btn btn-primary du-watch" data-du="watch"><span class="du-ring"><i></i><em>7</em></span>ASSISTIR<kbd>ESPAÇO</kbd></button>' +
            '<button class="btn du-leave" data-du="leave">VER RESULTADO<kbd>ENTER</kbd></button></div>' +
        '</div>' +
      '</div>' +
      '<div id="spec-ui" class="hidden">' +
        '<div class="sp-top"><span class="sp-live"><i></i>ASSISTINDO</span></div>' +
        '<div class="sp-msgs"></div>' +
        '<div class="sp-over"></div>' +
        '<div class="sp-dock">' +
          '<button class="sp-nav" data-sp="prev" aria-label="anterior">' + chev('M15 5l-7 7 7 7') + '</button>' +
          '<div class="sp-card"><div class="sp-face"><img alt=""></div><div class="sp-info"><b class="sp-name"></b>' +
            '<div class="sp-hp"><i></i><em></em></div><div class="sp-meta"><span class="sp-gun"></span><span class="sp-gear"></span><span class="sp-k"></span></div></div></div>' +
          '<button class="sp-nav" data-sp="next" aria-label="próximo">' + chev('M9 5l7 7-7 7') + '</button>' +
        '</div>' +
        '<div class="sp-hint"><kbd>A</kbd><kbd>D</kbd> trocar · arraste pra girar · <kbd>ENTER</kbd> sair</div>' +
        '<button class="btn sp-leave" data-sp="leave">SAIR</button>' +
      '</div>';
    document.body.appendChild(d);
    const q = s => d.querySelector(s);
    this.el = { root: d, fx: q('.sp-fx'), wipe: q('.sp-wipe'), death: q('#death-ui'), spec: q('#spec-ui'), ring: q('.du-ring'), autoN: q('.du-ring em'),
      card: q('.sp-card'), sface: q('.sp-face img'), sname: q('.sp-name'), shp: q('.sp-hp i'), shpN: q('.sp-hp em'), sgun: q('.sp-gun'), sk: q('.sp-k'), gear: q('.sp-gear'),
      msgs: q('.sp-msgs'), over: q('.sp-over') };
    d.addEventListener('click', e => {
      const b = e.target.closest('[data-du],[data-sp]'); if (!b || !this.active) return;
      const a = b.dataset.du || b.dataset.sp;
      if (a === 'watch') this.watch(); else if (a === 'leave') { if (this.watchOnly) LS.Custom.quit(); else this.leave(); } else if (a === 'prev') this.cycle(-1); else if (a === 'next') this.cycle(1);
    });
    window.addEventListener('keydown', e => {
      if (!this.active || LS.Game.state !== 'playing' || e.repeat || (LS.Console && LS.Console.open)) return;
      const c = e.code;
      if (c === 'Escape') { LS.Game.pause(); return; }
      if (this.watchOnly) { if (c === 'KeyA' || c === 'ArrowLeft') this.cycle(-1); else if (c === 'KeyD' || c === 'ArrowRight') this.cycle(1); else if (c === 'Enter') LS.Custom.quit(); return; }
      if (this.duel) { if (this.phase === 'spec' && (c === 'KeyA' || c === 'KeyD' || c === 'ArrowLeft' || c === 'ArrowRight')) this.cycle(1); return; }
      if (c === 'Enter' || c === 'NumpadEnter') { this.leave(); return; }
      if (this.phase === 'death') { if (c === 'Space' && this.shown) { e.preventDefault(); if (this.others().length) this.watch(); else this.leave(); } return; }
      if (this.phase !== 'spec') return;
      if (c === 'KeyA' || c === 'ArrowLeft') this.cycle(-1);
      else if (c === 'KeyD' || c === 'ArrowRight' || c === 'Space') { e.preventDefault(); this.cycle(1); }
    });
    // arrastar (mouse ou dedo) gira a câmera em volta; roda aproxima
    const cv = LS.Game.renderer.domElement; let drag = null;
    window.addEventListener('pointerdown', e => { if (this.active && this.phase !== 'death' && (e.target === cv || e.target === document.body)) drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId || !this.active) return;
      const k = LS.Touch.active ? 0.009 : 0.006;
      this.oYaw -= (e.clientX - drag.x) * k; this.oPitch -= (e.clientY - drag.y) * k * 0.8; drag.x = e.clientX; drag.y = e.clientY; this.dragT = 2;
    });
    const up = e => { if (drag && drag.id === e.pointerId) drag = null; };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    window.addEventListener('wheel', e => { if (this.active && this.phase !== 'death') this.zoom = LS.util.clamp(this.zoom + Math.sign(e.deltaY) * 0.5, 2.2, 7); }, { passive: true });
  },
  // cartão da morte
  showDeath() {
    const G = LS.Game, P = G.player, I = this.info, K = this.killer, el = this.el.death, q = s => el.querySelector(s);
    q('.du-place b').textContent = '#' + I.place; q('.du-place span').textContent = 'DE ' + I.total;
    if (this.duel) { const D = LS.Game.mode === 'custom' ? LS.Custom.cardInfo() : LS.Duel, ally = this.others().length; q('.du-rib').innerHTML = '<b>ELIMINADO</b><span>ROUND ' + D.round + ' · ' + D.score[0] + ' x ' + D.score[1] + (ally ? ' · seu parceiro ainda está vivo' : '') + '</span>'; }
    const card = q('.du-card'), face = q('.du-face img'), weap = q('.du-weap');
    card.classList.toggle('nokiller', !K);
    if (K) {
      LS.Thumbs.face(K.model.look, face);
      q('.du-who small').textContent = 'ELIMINADO POR';
      q('.du-who b').textContent = K.name;
      const hp = Math.max(0, Math.ceil(K.hp)); q('.du-hp i').style.width = Math.min(100, hp) + '%'; q('.du-hp').dataset.hp = K.alive ? hp + ' HP' : 'ELIMINADO';
      q('.du-hp').classList.toggle('low', hp < 35);
      const g = []; if (K.vest && K.vest.level) g.push('COLETE NV' + K.vest.level); if (K.helmet && K.helmet.level) g.push('CAPACETE NV' + K.helmet.level);
      q('.du-gear').textContent = g.join(' · ') || 'SEM PROTEÇÃO';
      const wid = Object.keys(LS.WEAPONS).find(id => LS.WEAPONS[id].name === I.weapon), wi = q('.du-weap img');
      const ic = wid ? LS.Icons.get('weapon', wid) : ''; wi.style.display = ic ? '' : 'none'; if (ic) wi.src = ic;
      q('.du-weap b').textContent = I.weapon || '?';
      q('.du-weap span').innerHTML = Math.round(I.dist) + ' m' + (I.head ? ' · <em>NA CABEÇA</em>' : '');
      weap.style.display = '';
    } else {
      face.removeAttribute('src'); face.classList.remove('ok');
      const cause = { Zona: ['A ZONA TE PEGOU', 'Fique dentro da área segura'], Queda: ['QUEDA FATAL', 'Cuidado com as alturas'], Console: ['ELIMINADO', 'Pelo console'] }[I.weapon] || ['ELIMINADO', I.weapon || ''];
      q('.du-who small').textContent = 'CAUSA'; q('.du-who b').textContent = cause[0]; q('.du-gear').textContent = cause[1];
      q('.du-hp').dataset.hp = ''; q('.du-hp i').style.width = '0';
      weap.style.display = 'none';
    }
    this.countUp(q('[data-s=kills]'), I.kills); this.countUp(q('[data-s=dmg]'), Math.round(I.dmg));
    q('[data-s=time]').textContent = LS.util.fmtTime(I.time);
    const watch = q('.du-watch'), any = this.others().length > 0;
    watch.style.display = any ? '' : 'none';
    if (!any) this.autoT = 5;
    el.classList.remove('hidden'); void el.offsetWidth;
  },
  countUp(node, to) {
    const t0 = performance.now(), dur = 900;
    const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); node.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    node.textContent = '0'; requestAnimationFrame(step);
  },
  updateSpecUI() {
    const T = this.target, E = this.el;
    if (!T) return;
    const hp = T.alive ? Math.max(0, Math.ceil(T.hp)) : 0;
    E.shp.style.width = Math.min(100, hp) + '%'; E.shpN.textContent = T.alive ? hp : 'X';
    E.shp.parentNode.classList.toggle('low', hp < 35);
    const w = T.wdef ? T.wdef() : null, v = T.vest && T.vest.level, h = T.helmet && T.helmet.level;
    E.sgun.textContent = w ? w.name : 'DESARMADO';
    const gk = (v || 0) + ':' + (h || 0);
    if (E.gear.dataset.k !== gk) { E.gear.dataset.k = gk; E.gear.innerHTML = (v ? '<img src="' + LS.Icons.get('vest', null, v) + '" alt=""><b>' + v + '</b>' : '') + (h ? '<img src="' + LS.Icons.get('helmet', null, h) + '" alt=""><b>' + h + '</b>' : ''); }
    E.sk.innerHTML = LS.icon('skull', 'sp-sk') + T.kills;
  }
};
