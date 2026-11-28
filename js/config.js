// LAST SURVIVOR - configuração global, dados de armas/itens e utilitários
'use strict';
const LS = window.LS = {};
LS.VERSION = '116'; // muda a cada atualização (também no ?v= do index.html e no version.json)
// versão do ONLINE (crossplay navegador ↔ app). Suba +1 quando mudar algo que quebra a partida online
// (armas, mapa, protocolo de rede...) e suba junto o MIN_PROTO em server/src/worker.js, depois "npx wrangler deploy".
// Quem estiver com versão mais velha (ex.: APK antigo) recebe o aviso pra atualizar em vez de entrar com regras diferentes.
LS.NET_PROTO = 2; // 2: esquadrões de 4 e party
// rodando dentro do app Android (Capacitor)?
LS.IS_APP = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
// onde baixar o APK mais novo (o GitHub Actions publica sempre aqui)
LS.APP_DOWNLOAD_URL = 'https://github.com/Duckix03/LastSurvivor/releases/latest/download/LastSurvivor.apk';
// a página inicial pode ficar guardada no navegador por ~10 min (GitHub Pages): confere a versão no servidor
// e, se esta estiver velha, recarrega num endereço novo (?v=...) que o navegador ainda não guardou
(function () {
  try {
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.json()).then(j => {
      if (!j || !j.v || j.v === LS.VERSION) return;
      const k = 'ls_reload_' + j.v; if (sessionStorage.getItem(k)) return; // no máximo 1 tentativa por versão
      sessionStorage.setItem(k, '1');
      const u = new URL(location.href); u.searchParams.set('v', j.v); location.replace(u.toString());
    }).catch(() => {});
  } catch (e) { /* sem rede / file:// */ }
})();

// APP (APK): o jogo vai dentro do app, então ele não se atualiza sozinho. Confere a versão publicada no site;
// se o app estiver velho, mostra a tela "Seu jogo está desatualizado" com o botão Atualizar (abre a página oficial fora do app).
LS.checkAppVersion = function () {
  if (!LS.IS_APP) return;
  const urls = [LS.WEB_URL + 'version.json', 'https://raw.githubusercontent.com/Duckix03/LastSurvivor/main/version.json'];
  const tryUrl = i => {
    if (i >= urls.length) return;
    fetch(urls[i] + '?t=' + Date.now(), { cache: 'no-store' }).then(r => r.json()).then(j => {
      if (j && j.v && +j.v > +LS.VERSION) LS.showOutdated(j.v);
    }).catch(() => tryUrl(i + 1)); // sem rede ou bloqueado: tenta o outro endereço; sem nenhum, deixa jogar
  };
  tryUrl(0);
};
LS.showOutdated = function (v) {
  if (document.getElementById('outdated')) return;
  const d = document.createElement('div'); d.id = 'outdated';
  d.innerHTML = '<div class="od-box"><div class="od-icon">!</div><h1>Ei! Seu jogo está desatualizado.</h1>' +
    '<p class="od-p">Toque em atualizar: a versão nova baixa e instala sozinha, sem perder nada!</p>' +
    '<div class="od-prog hidden"><div class="od-bar"><i></i></div><span class="od-pt"></span></div>' +
    '<div class="od-btns"><button class="btn btn-primary od-btn">Atualizar</button></div><small>versão do app: ' + LS.VERSION + (v && v !== '?' ? ' · nova: ' + v : '') + '</small></div>';
  document.body.appendChild(d);
  d.querySelector('.od-btn').addEventListener('click', () => LS.AppUpdate.start(v));
};
// ATUALIZAR no app: confere se o APK novo já saiu e abre o link no navegador do celular, que baixa sozinho.
// (O app NÃO instala nada sozinho: a permissão de instalar apps + baixar APK fazia o Google Play Protect
//  marcar o jogo como "app nocivo". Quem instala é o navegador/gerenciador de arquivos, como antes.)
LS.AppUpdate = {
  ui(text, pct, btns) {
    const d = document.getElementById('outdated'); if (!d) return;
    d.querySelector('.od-p').textContent = text;
    const pr = d.querySelector('.od-prog'); pr.classList.toggle('hidden', pct === undefined || pct === null);
    if (pct !== undefined && pct !== null) { pr.querySelector('i').style.width = (pct < 0 ? 100 : pct) + '%'; pr.classList.toggle('busy', pct < 0); pr.querySelector('.od-pt').textContent = pct < 0 ? '' : pct + '%'; }
    const b = d.querySelector('.od-btns'); b.innerHTML = '';
    (btns || []).forEach(([label, fn, main]) => { const e = document.createElement('button'); e.className = 'btn od-btn' + (main ? ' btn-primary' : ''); e.textContent = label; e.addEventListener('click', fn); b.appendChild(e); });
  },
  browser() { location.href = LS.APP_DOWNLOAD_URL; }, // o Capacitor abre endereço de fora no navegador do celular
  async start(v) {
    if (this.busy) return; this.busy = true;
    this.ui('Conferindo a versão nova…', -1);
    try { // o APK novo já foi publicado? (o GitHub leva uns 3 min pra montar depois de cada atualização)
      const r = await fetch('https://api.github.com/repos/Duckix03/LastSurvivor/releases/tags/app-latest', { cache: 'no-store' }), j = await r.json();
      const m = /jogo v(\d+)/.exec((j && j.name) || ''), need = +v || +LS.VERSION + 1;
      if (m && +m[1] < need) { this.busy = false; return this.ui('O app novo ainda está sendo preparado (leva uns 3 minutos depois de cada atualização). Tente de novo já já!', null, [['Tentar de novo', () => this.start(v), true]]); }
    } catch (e) { /* sem acesso à API: baixa mesmo assim */ }
    this.busy = false;
    this.ui('Baixando pelo navegador… Quando terminar, toque no arquivo LastSurvivor.apk e em ATUALIZAR. Seu progresso não se perde!', null, [['Baixar de novo', () => this.browser(), true]]);
    this.browser();
  }
};

// trocar de nome no perfil custa moedas (o recado é grátis). Escolher o 1º nome (saindo de "Jogador") é grátis.
LS.RENAME_COST = 10000;

LS.MAP_SIZE = 800;          // tamanho do terreno (metros)
LS.MAP_SEED = 20261120;     // semente da ilha: todo mundo gera o MESMO mapa (necessário pro online)
// endereço do servidor online (Cloudflare). Vazio = só partidas contra bots. Ex.: 'https://last-survivor-server.SEU-USUARIO.workers.dev'
LS.NET_URL = 'https://lastsurvivor.lastsurvivorbr.workers.dev';
// endereço do jogo no navegador (o app abre ele pra fazer o login com Google)
LS.WEB_URL = 'https://lastsurvivor.pages.dev/';
// login com Google: ID do cliente OAuth "Aplicativo da Web" do Google Cloud (é público, pode ficar aqui).
// Vazio = botão do Google desligado. O mesmo ID vai no servidor (GOOGLE_CLIENT_ID no server/wrangler.toml). Veja server/LEIAME.md
LS.GOOGLE_CLIENT_ID = '';
LS.ISLAND_RADIUS = 340;     // raio útil da ilha
LS.WATER_LEVEL = 0;
LS.GEL = { name: 'Bola de Gelo', max: 4 }; // vira a parede de gel (js/gelwall.js)
LS.BOT_COUNT = 31; // + você = 32 (32 solos, 16 duplas ou 8 esquadrões)
LS.SQUAD = 4; // tamanho máximo de time no battle royale (o do modo escolhido: LS.Modes.brSize); os bots completam as vagas do seu time
// bots sempre no NORMAL, de propósito (não tem mais escolha de dificuldade): dano dos tiros deles × dmg, mira entre skill[0] e skill[1]
LS.BOT_LEVEL = { dmg: 0.55, skill: [0.35, 1] };
LS.GRAVITY = 24;

// ---------- Configurações persistentes ----------
// tela cheia: o iPhone (Safari) não tem; o iPad só com prefixo webkit. Sem suporte, o botão some (antes dava erro)
LS.Full = {
  el() { return document.fullscreenElement || document.webkitFullscreenElement || null; },
  can() { const d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); },
  enter() { try { const d = document.documentElement, f = d.requestFullscreen || d.webkitRequestFullscreen; const p = f ? f.call(d) : null; return p && p.then ? p : Promise.resolve(); } catch (e) { return Promise.reject(e); } },
  exit() { try { const f = document.exitFullscreen || document.webkitExitFullscreen; if (f && this.el()) f.call(document); } catch (e) { /* ignora */ } },
};
LS.defaultSettings = { sensitivity: 1, quality: 'medium', volume: 0.6, musicVol: 0.5, renderDistance: 400, fullscreen: false, showFps: false, resScale: 1, perfMode: false, vivid: 0.6, postfx: true, aimAssist: true,
  // celular: tamanho dos botões de toque, transparência deles e tamanho dos menus/HUD (1 = padrão)
  btnSize: 1, btnAlpha: 0.85, uiSize: 1,
  // sensibilidade estilo Free Fire (0 a 100; 50 = padrão): geral (sem mirar), red dot (mirando sem luneta) e lunetas 4x/6x/8x
  sensGeneral: 50, sensRedDot: 50, sens4x: 50, sens6x: 50, sens8x: 50,
  // filtro de cor da imagem 3D (a intensidade é o "vivid")
  filter: 'classico' };
LS.settings = Object.assign({}, LS.defaultSettings);
// celular: o gráfico é escolhido pelo automático (js/perf.js), pela placa de vídeo e pelo FPS de verdade (antes todo celular começava no mínimo)
try {
  const saved = JSON.parse(localStorage.getItem('lastsurvivor_settings') || '{}');
  Object.assign(LS.settings, saved);
  // configurações antigas: a "sensibilidade do mouse" (0,1 a 3) vira a sensibilidade geral (0 a 100)
  if (saved.sensitivity !== undefined && saved.sensGeneral === undefined) LS.settings.sensGeneral = Math.round(Math.max(1, Math.min(100, 50 * Math.pow(saved.sensitivity, 1 / 1.585))));
} catch (e) { /* ignora configurações corrompidas */ }
// 0..100 (50 = 1x) → multiplicador; 100 = 3x, 12 ≈ 0,1x (cobre a faixa da sensibilidade antiga)
LS.sensMult = v => Math.pow(Math.max(1, +v || 50) / 50, 1.585);
// qual sensibilidade vale agora: sem mirar = geral; mirando sem luneta = red dot; luneta = 4x/6x/8x pelo zoom atual
LS.sensKey = (aiming, scoped, zoom) => !aiming ? 'sensGeneral' : !scoped ? 'sensRedDot' : zoom < 5 ? 'sens4x' : zoom < 7 ? 'sens6x' : 'sens8x';
// distância de renderização efetiva (limitada no modo desempenho)
LS.effDist = () => LS.settings.perfMode ? Math.min(LS.settings.renderDistance, 250) : LS.settings.renderDistance;
// salva no navegador e (com conta) manda pra nuvem uns segundos depois. _t = quando mudou (a mais nova vence entre aparelhos)
LS.saveSettings = function (fromCloud) {
  if (!fromCloud) LS.settings._t = Date.now();
  try { localStorage.setItem('lastsurvivor_settings', JSON.stringify(LS.settings)); } catch (e) { /* sem espaço */ }
  if (!fromCloud && LS.Account && LS.Account.queueSettings) LS.Account.queueSettings();
};

LS.stats = { games: 0, wins: 0, kills: 0 };
try { Object.assign(LS.stats, JSON.parse(localStorage.getItem('lastsurvivor_stats') || '{}')); } catch (e) { /* ignora */ }
LS.saveStats = function () { localStorage.setItem('lastsurvivor_stats', JSON.stringify(LS.stats)); };

// ---------- Tipos de munição ----------
LS.AMMO_TYPES = {
  light:  { name: 'Munição leve',   color: 0xf5d142, pickup: 30, baseMax: 120 },
  rifle:  { name: 'Munição de rifle', color: 0x6fd15a, pickup: 30, baseMax: 120 },
  sniper: { name: 'Munição de sniper', color: 0x4aa3ff, pickup: 10, baseMax: 30 },
  shell:  { name: 'Cartuchos',      color: 0xff5a4a, pickup: 10, baseMax: 40 }
};

// ---------- Armas ----------
// dmg por projétil, rate = tiros/segundo, recoil = graus de subida por tiro, spread = dispersão (rad)
LS.WEAPONS = {
  m1911:  { name: 'M1911',      cat: 'Pistola',  ammo: 'light',  dmg: 22, rate: 4,   mag: 12, reload: 1.3, recoil: 1.6, spread: 0.018, range: 120, pellets: 1, auto: false, zoom: 1.3, color: 0x333333, len: 0.35, snd: { freq: 900,  dur: 0.12, body: 180, vol: 0.55 }, rarity: 1 },
  deagle: { name: 'Desert Eagle', cat: 'Pistola', ammo: 'light', dmg: 48, hsDmg: 200, rate: 2,   mag: 7,  reload: 1.6, recoil: 4.5, spread: 0.02,  range: 150, pellets: 1, auto: false, zoom: 1.35,  color: 0x9a9a9a, len: 0.42, snd: { freq: 600,  dur: 0.22, body: 110, vol: 0.8 }, rarity: 2 },
  mp5:    { name: 'MP5',        cat: 'SMG',      ammo: 'light',  dmg: 17, rate: 13,  mag: 30, reload: 2.0, recoil: 0.9, spread: 0.035, range: 110, pellets: 1, auto: true,  zoom: 1.4,  color: 0x222222, len: 0.6, snd: { freq: 1300, dur: 0.08, body: 220, vol: 0.45 }, rarity: 1 },
  ump:    { name: 'UMP',        cat: 'SMG',      ammo: 'light',  dmg: 21, rate: 10,  mag: 25, reload: 2.2, recoil: 1.1, spread: 0.03,  range: 120, pellets: 1, auto: true,  zoom: 1.45, color: 0x3a3a2a, len: 0.62, snd: { freq: 1100, dur: 0.09, body: 190, vol: 0.5 }, rarity: 2 },
  ak47:   { name: 'AK-47',      cat: 'Rifle',    ammo: 'rifle',  dmg: 32, rate: 9,   mag: 30, reload: 2.5, recoil: 1.8, spread: 0.025, range: 250, pellets: 1, auto: true,  zoom: 1.7,  color: 0x6b4423, len: 0.85, snd: { freq: 700,  dur: 0.14, body: 130, vol: 0.7 }, rarity: 2 },
  m4a1:   { name: 'M4A1',       cat: 'Rifle',    ammo: 'rifle',  dmg: 27, rate: 11,  mag: 30, reload: 2.2, recoil: 1.2, spread: 0.02,  range: 250, pellets: 1, auto: true,  zoom: 1.8,  color: 0x2d2d2d, len: 0.8, snd: { freq: 850,  dur: 0.12, body: 150, vol: 0.62 }, rarity: 2 },
  awm:    { name: 'AWM',        cat: 'Sniper',   ammo: 'sniper', dmg: 105, rate: 0.75, mag: 5, reload: 3.4, recoil: 7,   spread: 0.002, range: 600, pellets: 1, auto: false, zoom: 8,  color: 0x3f5a2a, len: 1.15, scope: true, snd: { freq: 400, dur: 0.4, body: 70, vol: 1.0 }, rarity: 3 },
  kar98:  { name: 'Kar98k',     cat: 'Sniper',   ammo: 'sniper', dmg: 80,  rate: 1,   mag: 5,  reload: 3.0, recoil: 6,   spread: 0.003, range: 550, pellets: 1, auto: false, zoom: 4.5,    color: 0x5a3a1f, len: 1.1, scope: true, snd: { freq: 480, dur: 0.35, body: 85, vol: 0.9 }, rarity: 3 },
  m1887:  { name: 'M1887',      cat: 'Escopeta', ammo: 'shell',  dmg: 15, rate: 1.1, mag: 2,  reload: 2.0, recoil: 6,   spread: 0.09,  range: 40,  pellets: 9, auto: false, zoom: 1.2,  color: 0x4a2a14, len: 0.9, snd: { freq: 300,  dur: 0.3, body: 60, vol: 1.0 }, rarity: 2 },
  spas12: { name: 'SPAS-12',    cat: 'Escopeta', ammo: 'shell',  dmg: 12, rate: 1.6, mag: 6,  reload: 3.0, recoil: 4.5, spread: 0.1,   range: 35,  pellets: 8, auto: false, zoom: 1.2,  color: 0x1c1c1c, len: 0.95, snd: { freq: 340, dur: 0.26, body: 70, vol: 0.9 }, rarity: 2 }
};
LS.WEAPON_IDS = Object.keys(LS.WEAPONS);

// Recuo e dispersão no estilo jogo de celular (Free Fire): 1º tiro certeiro, a mira "abre" atirando sem parar
// e fecha rápido quando solta; a câmera sobe com o tiro e volta sozinha (só um pouco fica).
//  v = subida por tiro (graus) · h = balanço lateral (graus, segue um padrão fixo da arma, dá pra aprender)
//  hip/ads = multiplicador da dispersão base sem mirar / mirando · b = abertura por tiro (rad) · bm = abertura máxima (rad)
//  keep = parte do chute que fica na mira (o resto volta sozinho) · rec = rapidez com que a câmera volta · shake = tremida da tela (só visual) · seed = desenho do padrão lateral
LS.RECOIL = {
  m1911:  { v: 1.30, h: 0.30, hip: 0.85, ads: 0.35, b: 0.0070, bm: 0.030, keep: 0.2, rec: 10, shake: 0.25, seed: 0.3 },
  deagle: { v: 3.20, h: 0.60, hip: 1.00, ads: 0.30, b: 0.0180, bm: 0.050, keep: 0.2, rec: 8,  shake: 0.55, seed: 1.1 },
  mp5:    { v: 0.28, h: 0.26, hip: 0.70, ads: 0.50, b: 0.0030, bm: 0.032, keep: 0.28, rec: 12, shake: 0.12, seed: 2.0 },
  ump:    { v: 0.36, h: 0.22, hip: 0.75, ads: 0.45, b: 0.0035, bm: 0.034, keep: 0.28, rec: 11, shake: 0.15, seed: 2.7 },
  ak47:   { v: 0.80, h: 0.38, hip: 1.00, ads: 0.28, b: 0.0045, bm: 0.042, keep: 0.3, rec: 8,  shake: 0.24, seed: 3.6 },
  m4a1:   { v: 0.55, h: 0.20, hip: 0.95, ads: 0.25, b: 0.0032, bm: 0.032, keep: 0.28, rec: 9,  shake: 0.17, seed: 4.4 },
  awm:    { v: 4.80, h: 0.70, hip: 1.00, ads: 0.40, b: 0,      bm: 0,     keep: 0.06, rec: 6,  shake: 0.80, seed: 5.2 },
  kar98:  { v: 4.00, h: 0.60, hip: 1.00, ads: 0.40, b: 0,      bm: 0,     keep: 0.06, rec: 6,  shake: 0.70, seed: 5.9 },
  m1887:  { v: 3.80, h: 0.70, hip: 1.00, ads: 0.80, b: 0,      bm: 0,     keep: 0.1, rec: 7,  shake: 0.75, seed: 6.4 },
  spas12: { v: 2.80, h: 0.55, hip: 1.00, ads: 0.80, b: 0,      bm: 0,     keep: 0.12, rec: 8,  shake: 0.55, seed: 7.1 },
  _def:   { v: 0.80, h: 0.30, hip: 1.00, ads: 0.35, b: 0.0040, bm: 0.035, keep: 0.28, rec: 9,  shake: 0.20, seed: 0 }
};

// Pesos de spawn (armas de raridade maior aparecem menos)
LS.weaponSpawnTable = LS.WEAPON_IDS.map(id => ({ id, w: LS.WEAPONS[id].rarity === 1 ? 5 : LS.WEAPONS[id].rarity === 2 ? 3 : 1.2 }));

// ---------- Equipamentos ----------
LS.GEAR = {
  vest:   { name: 'Colete', levels: [null, { dur: 60, red: 0.3 }, { dur: 90, red: 0.4 }, { dur: 120, red: 0.5 }] },
  helmet: { name: 'Capacete', levels: [null, { dur: 40, red: 0.3 }, { dur: 70, red: 0.4 }, { dur: 100, red: 0.5 }] },
  bag:    { name: 'Mochila', levels: [1, 1.5, 2, 2.6] } // multiplicador de capacidade
};
LS.LEVEL_COLORS = [0xffffff, 0x9fd0ff, 0xc08cff, 0xffc531];

LS.MEDS = {
  medkit:  { name: 'Kit médico', heal: 75, time: 4.0, baseMax: 3, color: 0xff3355 },
  bandage: { name: 'Bandagem', heal: 20, time: 1.8, baseMax: 6, color: 0xf2f2f2 }
};

// ---------- Utilitários ----------
LS.util = {
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a, b) => a + Math.random() * (b - a),
  randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: arr => arr[Math.floor(Math.random() * arr.length)],
  // gerador de números com semente (mesma semente = mesma sequência em qualquer computador)
  seeded(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
  // roda fn com Math.random trocado por um gerador com semente (rng = número ou gerador já criado)
  withSeed(rng, fn) { const R = typeof rng === 'function' ? rng : LS.util.seeded(rng), old = Math.random; Math.random = R; try { return fn(); } finally { Math.random = old; } },
  weighted(table) {
    let total = 0; for (const t of table) total += t.w;
    let r = Math.random() * total;
    for (const t of table) { r -= t.w; if (r <= 0) return t.id; }
    return table[table.length - 1].id;
  },
  dist2D: (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz),
  angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; },
  fmtTime(s) { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); },
  // ruído determinístico (value noise) para o terreno
  hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); },
  noise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const h = LS.util.hash;
    const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
};

// mesmo time? (só existe time no duelo 2v2; no battle royale é cada um por si)
// dentro do galpão (duelo offline ou duelo da party online)
LS.hall = () => { const G = LS.Game; return !!G && (G.mode === 'duel' || (G.mode === 'custom' && !!LS.Custom && LS.Custom.arena === 'duel')); };
LS.sameTeam = (a, b) => !!a && !!b && a.team != null && a.team === b.team;
// times com alguém vivo (quem não tem time conta como um time sozinho)
LS.teamsAlive = list => { const s = new Set(); for (const f of list) if (f.alive) s.add(f.team != null ? f.team : f); return s; };
LS.BOT_NAMES = ['Viper', 'Shadow', 'Falcon', 'Ghost', 'Blaze', 'Raven', 'Storm', 'Titan', 'Nova', 'Hunter', 'Cobra', 'Wolf', 'Phantom', 'Reaper', 'Ace',
  'Tiger', 'Sniper_BR', 'Rex', 'Lince', 'Jaguar', 'Trovão', 'Fênix', 'Sombra', 'Zé_Bala', 'Kaiser', 'Onça', 'Dragão', 'Bravo', 'Raio', 'Furacão', 'Mamba', 'Orion'];
