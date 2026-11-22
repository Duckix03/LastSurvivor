// Copia os arquivos do jogo pra pasta www/, que é o que vai dentro do APK.
// Uso: npm run www   (o "npm run sync" e o GitHub Actions já rodam isso sozinhos)
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
const ITEMS = ['index.html', 'version.json', 'favicon.png', 'css', 'js', 'fonts', 'anims', 'assets/music'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const it of ITEMS) {
  const src = path.join(root, it);
  if (!fs.existsSync(src)) { console.error('faltando: ' + it); process.exit(1); }
  fs.cpSync(src, path.join(out, it), { recursive: true });
}
// o app não pode depender de internet pra abrir: confere se nada essencial vem de CDN
const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const cdn = html.match(/<script[^>]+src="https?:\/\/[^"]+"/g);
if (cdn) { console.error('index.html ainda carrega script da internet:\n' + cdn.join('\n')); process.exit(1); }
console.log('www/ pronto (' + ITEMS.join(', ') + ')');
