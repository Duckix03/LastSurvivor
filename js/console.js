// Console de desenvolvedor: abre/fecha com a tecla ' (a que fica à esquerda do 1) ou F2.
// Fica escondido pros jogadores: só abre no "modo dev". Pra ligar: no PAINEL ADMIN do perfil (só o owner vê),
// ou abrindo o jogo uma vez com ?dev no fim do link — fica salvo nesse navegador. Pra desligar: painel ou ?dev=0.
// (No localhost ele sempre abre.) Não é proteção de verdade: o online é protegido pelo servidor.
// Mostra os logs do jogo (console.log/warn/error e erros não tratados) e aceita comandos (digite "help").
'use strict';
LS.Console = {
  open: false, lines: [], max: 400, history: [], hIdx: -1, god: false, speedMul: 1, timeScale: 1, fly: false, silent: null,

  // modo dev: ?dev liga (e salva), ?dev=0 desliga; no localhost está sempre ligado
  devMode() {
    try {
      const q = new URLSearchParams(location.search);
      if (q.has('dev')) {
        localStorage.setItem('ls_dev', q.get('dev') === '0' ? '0' : '1');
        q.delete('dev'); const rest = q.toString(); // tira o ?dev do link (não fica aparecendo nem vai junto se copiar)
        history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
      }
      return localStorage.getItem('ls_dev') === '1' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    } catch (e) { return false; }
  },

  // liga/desliga o modo dev neste navegador (usado pelo painel admin)
  setDev(on) {
    try { localStorage.setItem('ls_dev', on ? '1' : '0'); } catch (e) { /* ignora */ }
    this.dev = !!on;
    if (!on && this.open) this.toggle(false);
  },

  init() {
    this.dev = this.devMode();
    const el = document.createElement('div');
    el.id = 'devconsole'; el.className = 'hidden';
    el.innerHTML = `
      <div class="dc-head">
        <span class="dc-title"><b>&gt;_</b> CONSOLE <small>v${LS.VERSION}</small></span>
        <span class="dc-stats" id="dc-stats"></span>
        <span class="dc-filters">
          <button data-f="all" class="on">Tudo</button><button data-f="warn">Avisos</button><button data-f="error">Erros</button>
        </span>
        <button class="dc-x" title="Fechar (' ou F2)">✕</button>
      </div>
      <div class="dc-log" id="dc-log"></div>
      <div class="dc-hint" id="dc-hint"></div>
      <div class="dc-input"><span>&gt;</span><input id="dc-in" spellcheck="false" autocomplete="off" placeholder="digite um comando… (help, Tab completa, ↑↓ histórico)"></div>`;
    document.body.appendChild(el);
    this.el = el; this.log = el.querySelector('#dc-log'); this.input = el.querySelector('#dc-in'); this.hint = el.querySelector('#dc-hint'); this.statsEl = el.querySelector('#dc-stats');
    this.filter = 'all';
    el.querySelector('.dc-x').onclick = () => this.toggle(false);
    el.querySelectorAll('.dc-filters button').forEach(b => b.onclick = () => {
      this.filter = b.dataset.f; el.querySelectorAll('.dc-filters button').forEach(x => x.classList.toggle('on', x === b)); this.redraw();
    });
    el.addEventListener('mousedown', e => e.stopPropagation()); // clicar no console não prende o mouse no jogo

    // captura de logs
    for (const lvl of ['log', 'info', 'warn', 'error']) {
      const orig = console[lvl].bind(console);
      console[lvl] = (...a) => { orig(...a); this.print(a.map(x => this.fmt(x)).join(' '), lvl === 'info' ? 'log' : lvl); };
    }
    window.addEventListener('error', e => this.print((e.message || 'Erro') + (e.filename ? '  (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : ''), 'error'));
    window.addEventListener('unhandledrejection', e => this.print('Promise rejeitada: ' + this.fmt(e.reason), 'error'));

    // tecla ' (à esquerda do 1, no teclado ABNT2 e no americano) ou F2 abre/fecha em qualquer tela (capture: chega antes do jogo)
    window.addEventListener('keydown', e => {
      const typing = e.target && (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target !== this.input)); // escrevendo nome/recado
      if (this.dev && !typing && (e.code === 'Backquote' || e.code === 'F2' || e.code === 'Insert')) { e.preventDefault(); e.stopPropagation(); this.toggle(); return; }
      if (!this.open) return;
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.toggle(false); }
    }, true);
    this.input.addEventListener('keydown', e => this.onInputKey(e));
    this.input.addEventListener('input', () => this.updateHint());

    this.print('Console pronto (versão ' + LS.VERSION + '). Digite <b>help</b> para ver os comandos.', 'sys');
    LS.Perf.init();
    setInterval(() => { if (this.open) this.updateStats(); }, 500);
  },

  fmt(x) {
    if (x instanceof Error) return x.message;
    if (typeof x === 'object' && x !== null) { try { return JSON.stringify(x).slice(0, 300); } catch (e) { return String(x); } }
    return String(x);
  },
  esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); },

  // type: log | warn | error | sys | cmd | ok  (sys/ok aceitam HTML; o resto é escapado)
  print(text, type = 'log') {
    const d = new Date(), t = d.toTimeString().slice(0, 8);
    const html = (type === 'sys' || type === 'ok') ? text : this.esc(text);
    const last = this.lines[this.lines.length - 1];
    if (last && last.html === html && last.type === type) { last.n++; if (this.open) this.redraw(); return; } // repetidos viram "×N"
    this.lines.push({ t, html, type, n: 1 });
    if (this.lines.length > this.max) this.lines.shift();
    if (this.open) this.appendLine(this.lines[this.lines.length - 1]);
  },
  lineEl(l) {
    const div = document.createElement('div');
    div.className = 'dc-line dc-' + l.type;
    div.innerHTML = '<i>' + l.t + '</i><span>' + l.html + '</span>' + (l.n > 1 ? '<em>×' + l.n + '</em>' : '');
    return div;
  },
  visible(l) { return this.filter === 'all' || l.type === this.filter || (this.filter === 'warn' && l.type === 'error'); },
  appendLine(l) {
    if (!this.visible(l)) return;
    const stick = this.log.scrollTop + this.log.clientHeight >= this.log.scrollHeight - 30;
    this.log.appendChild(this.lineEl(l));
    while (this.log.childNodes.length > this.max) this.log.removeChild(this.log.firstChild);
    if (stick) this.log.scrollTop = this.log.scrollHeight;
  },
  redraw() {
    this.log.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const l of this.lines) if (this.visible(l)) frag.appendChild(this.lineEl(l));
    this.log.appendChild(frag); this.log.scrollTop = this.log.scrollHeight;
  },

  toggle(force) {
    const open = force === undefined ? !this.open : force;
    if (open === this.open || (open && !this.dev)) return;
    this.open = open;
    const G = LS.Game;
    if (open) {
      LS.Input.keys = {}; LS.Input.mouse.left = LS.Input.mouse.right = false; // não fica andando/atirando sozinho
      this.el.classList.remove('hidden', 'closing'); this.redraw(); this.updateStats();
      LS.Input.unlock();
      this.input.focus(); setTimeout(() => this.input.focus(), 30);
    } else {
      this.el.classList.add('closing');
      setTimeout(() => { if (!this.open) this.el.classList.add('hidden'); }, 180);
      this.input.blur();
      if (G && G.state === 'playing' && !G.inventoryOpen) LS.Input.lock();
    }
  },

  updateStats() {
    const G = LS.Game; if (!G || !G.renderer) return;
    const i = G.renderer.info, fps = document.getElementById('fps').textContent;
    this.statsEl.textContent = fps + '  ·  ' + Math.round(i.render.triangles / 1000) + 'k tri  ·  ' + i.render.calls + ' draws';
  },

  // ---------- entrada ----------
  onInputKey(e) {
    e.stopPropagation();
    if (e.code === 'Enter') {
      const v = this.input.value.trim(); this.input.value = ''; this.hint.textContent = '';
      if (!v) return;
      if (this.history[0] !== v) this.history.unshift(v); this.history.length = Math.min(this.history.length, 50); this.hIdx = -1;
      this.print(v, 'cmd'); this.run(v);
    } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      this.hIdx = LS.util.clamp(this.hIdx + (e.code === 'ArrowUp' ? 1 : -1), -1, this.history.length - 1);
      this.input.value = this.hIdx < 0 ? '' : this.history[this.hIdx];
      setTimeout(() => this.input.setSelectionRange(this.input.value.length, this.input.value.length));
    } else if (e.code === 'Tab') {
      e.preventDefault();
      const opts = this.complete(this.input.value);
      if (opts.length === 1) this.input.value = opts[0] + ' ';
      else if (opts.length > 1) {
        let p = opts[0]; for (const o of opts) while (!o.startsWith(p)) p = p.slice(0, -1);
        if (p.length > this.input.value.length) this.input.value = p;
        this.print(opts.join('   '), 'sys');
      }
      this.updateHint();
    }
  },
  complete(v) {
    const parts = v.split(/\s+/);
    if (parts.length <= 1) return Object.keys(this.cmds).filter(c => c.startsWith(parts[0].toLowerCase()));
    const c = this.cmds[parts[0].toLowerCase()]; if (!c || !c.args) return [];
    const last = parts[parts.length - 1].toLowerCase(), head = parts.slice(0, -1).join(' ');
    return c.args().filter(a => a.toLowerCase().startsWith(last)).map(a => head + ' ' + a);
  },
  updateHint() {
    const name = this.input.value.trim().split(/\s+/)[0].toLowerCase(), c = this.cmds[name];
    this.hint.innerHTML = c ? '<b>' + name + '</b> ' + this.esc(c.use || '') + ' — ' + c.desc : '';
  },

  run(line) {
    const [name, ...args] = line.split(/\s+/), c = this.cmds[name.toLowerCase()];
    if (!c) { this.print('Comando desconhecido: "' + name + '". Digite help.', 'error'); return; }
    // na partida online os comandos que dão vantagem ficam desligados (e o servidor recusa mesmo se forçar)
    if (LS.Net && LS.Net.online && ['give', 'god', 'tp', 'heal', 'speed', 'fly', 'silent', 'esp', 'kill', 'clear'].includes(name.toLowerCase()) && !(name.toLowerCase() === 'clear' && (args[0] || '') !== 'inv')) { this.print('Desativado na partida online.', 'error'); return; }
    try { const r = c.fn.call(this, args); if (r) this.print(r, 'ok'); }
    catch (e) { this.print(e.message, 'error'); }
  },

  // ---------- ajudantes ----------
  P() {
    const G = LS.Game;
    if (!G || !G.player || G.state === 'menu' || G.state === 'lobby' || !G.built) throw new Error('Entre numa partida primeiro.');
    return G.player;
  },
  land(P) { // tira do avião/queda e põe no chão
    if (P.state !== 'ground') { if (P.state === 'plane') LS.Game.jumpFromPlane(P); P.state = 'ground'; P.vel.set(0, 0, 0); LS.Audio.stopLoop('wind'); LS.Audio.stopLoop('plane'); }
  },
  give(P, type, id, level, amount) {
    const it = LS.Loot.spawn(type, id, level, amount, P.pos.x, P.pos.y + 0.1, P.pos.z);
    const r = P.pickup(it, true);
    return r ? r : LS.Loot.label(it) + ' (no chão, sem espaço)';
  },
  // silent aim: troca a direção do tiro pela do inimigo visível mais perto da mira (dentro do cone e do alcance)
  silentDir(P, origin) {
    const S = this.silent; if (!S) return null;
    const d = P.wdef(); if (!d) return null;
    let best = null, bestA = S.fov * Math.PI / 180;
    const to = new THREE.Vector3(), aim = P.aimDir;
    for (const f of LS.Game.fighters) {
      if (f === P || !f.alive || f.state === 'plane') continue;
      const hy = S.head ? f.headY() : (f.crouch ? 0.6 : 0.9);
      to.set(f.pos.x - origin.x, f.pos.y + hy - origin.y, f.pos.z - origin.z);
      const dist = to.length(); if (dist > d.range * 1.5) continue;
      const a = aim.angleTo(to); if (a > bestA) continue;
      if (!LS.World.hasLOS(origin, new THREE.Vector3(f.pos.x, f.pos.y + hy, f.pos.z))) continue;
      bestA = a; best = to.clone().divideScalar(dist);
    }
    return best;
  },
  itemArgs() { return [...LS.WEAPON_IDS, ...Object.keys(LS.AMMO_TYPES), ...Object.keys(LS.MEDS), 'vest', 'helmet', 'bag', 'kit']; },

  cmds: {
    help: { desc: 'lista os comandos', fn() {
      const rows = Object.entries(this.cmds).map(([k, c]) => '<b>' + k + '</b> <u>' + this.esc(c.use || '') + '</u> — ' + c.desc);
      this.print('<div class="dc-help">' + rows.join('<br>') + '</div>', 'sys');
    } },
    anim: { use: '<list | load url [nome] | play nome [once] [full|upper|lower] | stop | save [nomes] | bones>', desc: 'animações externas (.glb/.fbx) no seu personagem', args: () => ['list', 'load', 'play', 'stop', 'save', 'bones', ...Object.keys(LS.Anim.clips)], fn(a) {
      const A = LS.Anim, sub = (a[0] || 'list').toLowerCase(), m = A.target();
      if (!m) throw new Error('Nenhum personagem na tela.');
      if (sub === 'list') {
        const names = [...new Set([...Object.keys(A.clips), ...A.LIBRARY.map(e => e.name)])];
        return names.length ? 'Animações: ' + names.map(n => '<b>' + this.esc(n) + '</b>' + (A.clips[n] ? ' (' + A.clips[n].duration.toFixed(1) + 's)' : '')).join(', ') : 'Nenhuma animação. Use <b>anim load url</b> ou arraste um .glb/.fbx para a janela.';
      }
      if (sub === 'load') {
        if (!a[1]) throw new Error('Use: anim load anims/arquivo.glb [nome]');
        this.print('Carregando ' + this.esc(a[1]) + '…', 'sys');
        A.load(a[1], a[2]).then(n => { A.player(m).play(A.clips[n[0]]); this.print('Carregado: <b>' + n.join(', ') + '</b> (tocando ' + this.esc(n[0]) + ')', 'ok'); }).catch(e => this.print(e.message, 'error'));
        return;
      }
      if (sub === 'play') {
        if (!a[1]) throw new Error('Use: anim play nome [once] [full|upper|lower]');
        const opts = {}; for (const x of a.slice(2)) { if (x === 'once') opts.loop = false; else if (x === 'loop') opts.loop = true; else if (A.MASKS[x]) opts.mask = x; }
        A.play(m, a[1], opts).then(() => this.print('Tocando <b>' + this.esc(a[1]) + '</b>', 'ok')).catch(e => this.print(e.message, 'error'));
        return;
      }
      if (sub === 'save') { A.download(a.slice(1)); return 'Baixando animacoes.json (só o movimento, sem o modelo 3D). Coloque em anims/.'; }
      if (sub === 'stop') { if (m.anim) m.anim.stop(); return 'Animação parada'; }
      if (sub === 'bones') return 'Esqueleto ' + (A.toggleBones(m) ? 'visível' : 'escondido');
      throw new Error('Use: anim list · anim load url [nome] · anim play nome · anim stop · anim bones');
    } },
    clear: { use: '[inv]', desc: 'limpa o console · clear inv: esvazia seu inventário', args: () => ['inv'], fn(a) {
      if ((a[0] || '').toLowerCase() !== 'inv') { this.lines = []; this.redraw(); return; }
      const P = this.P();
      P.weapons = [null, null]; P.slot = 0; P.reloadT = 0; P.healT = 0; P.healType = null;
      for (const k in P.ammo) P.ammo[k] = 0;
      for (const k in P.meds) P.meds[k] = 0;
      P.vest = { level: 0, dur: 0 }; P.helmet = { level: 0, dur: 0 }; P.bag = 0;
      P.model.setGun(null); P.model.pendingGun = undefined; P.model.setGear(0, 0, 0);
      if (LS.Game.inventoryOpen) LS.HUD.renderInventory();
      return 'Inventário limpo 🧹 (armas, munição, cura, colete, capacete e mochila)';
    } },
    fps: { desc: 'liga/desliga o contador de FPS', fn() { LS.settings.showFps = !LS.settings.showFps; LS.saveSettings(); return 'FPS ' + (LS.settings.showFps ? 'ligado' : 'desligado'); } },
    stats: { desc: 'desempenho e posição', fn() {
      const G = LS.Game, i = G.renderer.info;
      const pos = G.player ? G.player.pos : null;
      return 'FPS: <b>' + document.getElementById('fps').textContent + '</b> · triângulos: <b>' + i.render.triangles.toLocaleString() + '</b> · draws: <b>' + i.render.calls +
        '</b> · shaders: <b>' + i.programs.length + '</b> · geometrias: <b>' + i.memory.geometries + '</b> · texturas: <b>' + i.memory.textures + '</b>' +
        (pos && G.built ? '<br>posição: ' + pos.x.toFixed(1) + ', ' + pos.y.toFixed(1) + ', ' + pos.z.toFixed(1) + ' · estado: ' + G.player.state : '');
    } },
    pos: { desc: 'mostra sua posição', fn() { const P = this.P(); return 'x <b>' + P.pos.x.toFixed(1) + '</b>  y <b>' + P.pos.y.toFixed(1) + '</b>  z <b>' + P.pos.z.toFixed(1) + '</b>'; } },
    tp: { use: '<x z | vila | zona>', desc: 'teleporta', args: () => [...(LS.World.towns || []).map(t => t.name.split(' ').join('_')), 'zona'], fn(a) {
      const P = this.P(); let x, z;
      if (!a.length) throw new Error('Use: tp x z  ·  tp zona  ·  tp <nome da vila>');
      if (a[0].toLowerCase() === 'zona') { x = LS.Game.zone.center.x; z = LS.Game.zone.center.y; }
      else if (!isNaN(+a[0])) { x = +a[0]; z = +a[1]; if (isNaN(z)) throw new Error('Faltou o z.'); }
      else {
        const q = a.join(' ').replace(/_/g, ' ').toLowerCase(), t = LS.World.towns.find(t => t.name.toLowerCase().includes(q));
        if (!t) throw new Error('Vila não encontrada. Vilas: ' + LS.World.towns.map(t => t.name).join(', ')); x = t.x; z = t.z;
      }
      this.land(P); P.pos.set(x, LS.World.heightAt(x, z) + 0.2, z); P.vel.set(0, 0, 0);
      return 'Teleportado para ' + x.toFixed(0) + ', ' + z.toFixed(0);
    } },
    give: { use: '<item> [qtd|nível]', desc: 'dá um item (armas, munição, cura, vest/helmet/bag 1-3, kit)', args() { return LS.Console.itemArgs(); }, fn(a) {
      const P = this.P(), id = (a[0] || '').toLowerCase(), n = +a[1];
      if (!id) throw new Error('Itens: ' + this.itemArgs().join(', '));
      if (P.state !== 'ground') this.land(P);
      if (id === 'kit') {
        const out = [this.give(P, 'weapon', 'm4a1'), this.give(P, 'weapon', 'awm'), this.give(P, 'ammo', 'rifle', 0, 240), this.give(P, 'ammo', 'sniper', 0, 60),
          this.give(P, 'bag', 'bag', 3), this.give(P, 'vest', 'vest', 3), this.give(P, 'helmet', 'helmet', 3), this.give(P, 'med', 'medkit', 0, 5), this.give(P, 'med', 'bandage', 0, 10)];
        return 'Kit completo: ' + out.join(', ');
      }
      if (LS.WEAPONS[id]) return this.give(P, 'weapon', id);
      if (LS.AMMO_TYPES[id]) return this.give(P, 'ammo', id, 0, n || LS.AMMO_TYPES[id].pickup * 2);
      if (LS.MEDS[id]) return this.give(P, 'med', id, 0, n || 3);
      if (id === 'vest' || id === 'helmet' || id === 'bag') return this.give(P, id, id, LS.util.clamp(Math.round(n || 3), 1, 3));
      throw new Error('Item desconhecido. Itens: ' + this.itemArgs().join(', '));
    } },
    parede: { use: '[quebrar]', desc: 'cria uma parede de gel na sua frente (quebrar: estoura todas)', args: () => ['quebrar'], fn(a) {
      if ((a[0] || '') === 'quebrar') { const n = LS.GelWall.list.length; LS.GelWall.list.slice().forEach(w => w.shatter()); return n + ' parede(s) estourada(s)'; }
      const P = this.P(), y = P.camYaw, x = P.pos.x + Math.sin(y) * 3.2, z = P.pos.z + Math.cos(y) * 3.2;
      new LS.GelWall(LS.Game.scene, x, LS.World.groundAt(x, z, P.pos.y + 1, 0.3), z, y + Math.PI);
      return 'Parede de gel criada!';
    } },
    heal: { desc: 'vida cheia e colete/capacete restaurados', fn() {
      const P = this.P(); P.hp = 100;
      for (const k of ['vest', 'helmet']) if (P[k].level) P[k].dur = LS.GEAR[k].levels[P[k].level].dur;
      return 'Curado ❤';
    } },
    esp: { desc: 'caixa, linha, nome, arma, vida e distância de cada jogador (bots com a etiqueta BOT)', fn() {
      return 'ESP ' + (LS.ESP.toggle() ? 'ligado 👁' : 'desligado');
    } },
    god: { desc: 'modo invencível (liga/desliga)', fn() {
      const P = this.P(); this.god = !this.god;
      if (!P._td) { P._td = P.takeDamage; P.takeDamage = function (...x) { return LS.Console.god ? 0 : this._td(...x); }; }
      return 'Modo deus ' + (this.god ? '<b>ligado</b>' : 'desligado');
    } },
    speed: { use: '<multiplicador>', desc: 'velocidade de corrida (1 = normal)', fn(a) { const v = +a[0]; if (!(v > 0 && v <= 10)) throw new Error('Use um valor entre 0.1 e 10.'); this.speedMul = v; return 'Velocidade ×' + v; } },
    timescale: { use: '<valor>', desc: 'câmera lenta / acelerado (1 = normal)', fn(a) { const v = +a[0]; if (!(v > 0 && v <= 5)) throw new Error('Use um valor entre 0.05 e 5.'); this.timeScale = v; return 'Tempo ×' + v; } },
    fly: { desc: 'voo livre: ESPAÇO sobe, C desce, SHIFT acelera, atravessa tudo (liga/desliga)', fn() {
      const P = this.P(); this.fly = !this.fly;
      if (P.state === 'plane') LS.Game.jumpFromPlane(P);
      if (!this.fly) { P.vel.set(0, 0, 0); P.flyAnim = false; }
      LS.Audio.stopLoop('wind'); LS.Audio.stopLoop('chute'); LS.Audio.stopLoop('plane');
      return 'Voo ' + (this.fly ? '<b>ligado</b> — ESPAÇO sobe, C desce, SHIFT acelera' : 'desligado (sem dano de queda até pousar)');
    } },
    silentaim: { use: '[fov] [head]', desc: 'tiros vão sozinhos no inimigo visível mais perto da mira (fov em graus, padrão 25; "head" mira na cabeça)', args: () => ['head', 'off'], fn(a) {
      if (a[0] === 'off' || (this.silent && !a.length)) { this.silent = null; return 'Silent aim desligado'; }
      const fov = LS.util.clamp(+a.find(x => !isNaN(+x)) || 25, 2, 180), head = a.includes('head');
      this.silent = { fov, head };
      return 'Silent aim <b>ligado</b> · cone de ' + fov + '°' + (head ? ' · na cabeça' : ' · no peito');
    } },
    jump: { desc: 'salta do avião agora', fn() { const P = this.P(); if (P.state !== 'plane') throw new Error('Você não está no avião.'); LS.Game.jumpFromPlane(P); return 'Saltou!'; } },
    bots: { desc: 'quantos bots estão vivos e o mais perto', fn() {
      const P = this.P(), alive = LS.Game.bots.filter(b => b.alive);
      let best = null, bd = 1e9; for (const b of alive) { const d = b.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = b; } }
      return '<b>' + alive.length + '</b> bots vivos' + (best ? ' · mais perto: ' + this.esc(best.name) + ' a ' + bd.toFixed(0) + ' m' : '');
    } },
    kill: { use: '[n | all]', desc: 'elimina bots (o mais perto, n bots ou todos)', fn(a) {
      const P = this.P(), alive = LS.Game.bots.filter(b => b.alive).sort((x, y) => x.pos.distanceTo(P.pos) - y.pos.distanceTo(P.pos));
      const n = a[0] === 'all' ? alive.length : Math.max(1, +a[0] || 1), list = alive.slice(0, Math.min(n, alive.length));
      list.forEach(b => b.takeDamage(9999, null, false, 'Console', true));
      return list.length + ' bot(s) eliminado(s)';
    } },
    zone: { use: '<next | stop | go>', desc: 'controla a zona', args: () => ['next', 'stop', 'go'], fn(a) {
      const Z = this.P() && LS.Game.zone, c = (a[0] || '').toLowerCase();
      if (c === 'next') { Z.timer = 0.01; return 'Zona avança agora'; }
      if (c === 'stop') { Z._fin = Z.finished; Z.finished = true; return 'Zona parada'; }
      if (c === 'go') { Z.finished = !!Z._fin && Z.phase >= Z.phases.length - 1; return 'Zona andando de novo'; }
      return 'Fase ' + (Z.phase + 1) + ' · raio ' + Z.radius.toFixed(0) + ' m · ' + (Z.shrinking ? 'encolhendo' : 'esperando') + ' · ' + Math.max(0, Z.timer).toFixed(0) + ' s';
    } },
    render: { use: '<distância>', desc: 'distância de visão (100-800)', fn(a) { const v = +a[0]; if (!(v >= 100 && v <= 800)) throw new Error('Use entre 100 e 800.'); LS.settings.renderDistance = v; LS.saveSettings(); LS.Game.applySettings(); return 'Distância de visão: ' + v + ' m'; } },
    shadows: { desc: 'liga/desliga o cálculo de sombra', fn() { const r = LS.Game.renderer; r.shadowMap.autoUpdate = !r.shadowMap.autoUpdate; r.shadowMap.needsUpdate = true; return 'Sombras ' + (r.shadowMap.autoUpdate ? 'atualizando' : 'congeladas'); } },
    hud: { desc: 'esconde/mostra o HUD (para prints)', fn() { const h = document.getElementById('hud'); h.style.visibility = h.style.visibility === 'hidden' ? '' : 'hidden'; return 'HUD ' + (h.style.visibility ? 'escondido' : 'visível'); } },
    perf: { desc: 'onde o tempo de cada quadro está indo (últimos 3 s) e as travadas', fn() { return LS.Perf.report(); } },
    js: { use: '<código>', desc: 'roda JavaScript (avançado)', fn(a) { const r = (0, eval)(a.join(' ')); this.print(this.fmt(r), 'log'); } }
  }
};

// ---------- Medidor de travadas ----------
// Mede quanto cada parte do jogo gasta por quadro. Quadro acima de 70 ms vira um aviso no console
// dizendo o que pesou (ou "fora do JS" = placa de vídeo / navegador). Shader novo compilado no meio da partida também avisa.
LS.Perf = {
  acc: {}, hist: [], hitches: [], last: 0, progs: 0,
  init() {
    const tryWrap = () => {
      const G = LS.Game; if (!G || !G.renderer || !G.player || !G.zone || !LS.Bot) return setTimeout(tryWrap, 500);
      const W = (obj, name, label) => { const f = obj && obj[name]; if (!f || f._perf) return;
        const w = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const A = LS.Perf.acc; A[label] = (A[label] || 0) + performance.now() - t; } };
        w._perf = true; obj[name] = w; };
      W(G.renderer, 'render', 'render'); W(G.player, 'update', 'jogador'); W(LS.Bot.prototype, 'update', 'bots');
      W(G.zone, 'update', 'zona'); W(G.plane, 'update', 'avião'); W(LS.Loot, 'update', 'loot'); W(LS.Effects, 'update', 'efeitos');
      W(LS.World, 'updateSky', 'céu'); W(LS.HUD, 'update', 'HUD'); W(LS.HUD, 'renderInventory', 'inventário');
      if (LS.Lobby) W(LS.Lobby, 'update', 'lobby');
      requestAnimationFrame(t => this.tick(t));
    };
    tryWrap();
  },
  tick(now) {
    requestAnimationFrame(t => this.tick(t));
    const G = LS.Game, gap = this.last ? now - this.last : 16; this.last = now;
    const A = this.acc; this.acc = {};
    let js = 0; for (const k in A) js += A[k];
    const fr = { t: now, gap, js, parts: A, st: G.state, ps: G.player && G.player.state };
    this.hist.push(fr); while (this.hist.length && now - this.hist[0].t > 3000) this.hist.shift();
    const progs = G.renderer.info.programs ? G.renderer.info.programs.length : 0;
    if (G.state === 'playing' && G.time > 3 && this.progs && progs > this.progs) console.warn('Shader novo compilado no meio da partida (' + this.progs + ' → ' + progs + '). Isso trava um instante.');
    this.progs = progs;
    if (gap > 70 && G.state === 'playing' && G.time > 1.5 && !document.hidden) {
      const top = Object.entries(A).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ' ' + v.toFixed(0) + 'ms').join(', ');
      const out = Math.max(0, gap - js);
      const msg = 'Travada de ' + gap.toFixed(0) + ' ms [' + (fr.ps || fr.st) + '] · JS: ' + (top || '—') + ' · fora do JS (placa/navegador): ' + out.toFixed(0) + 'ms · ' + Math.round(G.renderer.info.render.triangles / 1000) + 'k tri, ' + G.renderer.info.render.calls + ' draws';
      this.hitches.push(msg); if (this.hitches.length > 30) this.hitches.shift();
      console.warn(msg);
    }
  },
  report() {
    const H = this.hist; if (!H.length) return 'Sem dados ainda.';
    const n = H.length, sum = {}; let gap = 0, js = 0, worst = H[0];
    for (const f of H) { gap += f.gap; js += f.js; if (f.gap > worst.gap) worst = f; for (const k in f.parts) sum[k] = (sum[k] || 0) + f.parts[k]; }
    const rows = Object.entries(sum).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' <b>' + (v / n).toFixed(1) + '</b>').join(' · ');
    const G = LS.Game, i = G.renderer.info;
    return 'Média por quadro: <b>' + (gap / n).toFixed(1) + ' ms</b> (' + Math.round(1000 / (gap / n)) + ' FPS) · JS <b>' + (js / n).toFixed(1) + ' ms</b> · fora do JS (placa/navegador) <b>' + Math.max(0, (gap - js) / n).toFixed(1) + ' ms</b><br>' +
      rows + '<br>pior quadro: <b>' + worst.gap.toFixed(0) + ' ms</b> · ' + i.render.triangles.toLocaleString() + ' tri · ' + i.render.calls + ' draws · resolução ' + G.renderer.domElement.width + '×' + G.renderer.domElement.height +
      ' · placa: ' + LS.Perf.gpu() + (this.hitches.length ? '<br>travadas registradas: <b>' + this.hitches.length + '</b> (veja no filtro Avisos)' : '');
  },
  gpu() {
    try { const gl = LS.Game.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; } catch (e) { return '?'; }
  }
};
if (document.body) LS.Console.init(); else window.addEventListener('DOMContentLoaded', () => LS.Console.init());
