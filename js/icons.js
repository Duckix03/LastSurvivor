// Ícones SVG do jogo (no lugar dos emojis: ficam iguais em qualquer sistema e combinam com o tema).
// Uso no HTML: <i data-icon="nome"></i>  ·  no JS: LS.icon('nome')
'use strict';
window.LS = window.LS || {};
LS.ICONS = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  gun: '<path d="M3 9h15l2-2h1v4h-3l-1 2h-4l-1 4H8l1-4H5L3 11z"/><path d="M12 13v2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  news: '<rect x="3" y="4" width="15" height="16" rx="2"/><path d="M18 8h3v10a2 2 0 0 1-2 2M7 8h7M7 12h7M7 16h4"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  gear: '<path d="M10.3 3h3.4l.5 2.4 1.9.8 2-1.4 2.4 2.4-1.4 2 .8 1.9 2.4.5v3.4l-2.4.5-.8 1.9 1.4 2-2.4 2.4-2-1.4-1.9.8-.5 2.4h-3.4l-.5-2.4-1.9-.8-2 1.4-2.4-2.4 1.4-2-.8-1.9L3 13.7v-3.4l2.4-.5.8-1.9-1.4-2 2.4-2.4 2 1.4 1.9-.8z"/><circle cx="12" cy="12" r="3"/>',
  medal: '<path d="M8 2h8l-2 7h-4z"/><circle cx="12" cy="15" r="6"/><path d="M12 12.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z"/>',
  keys: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  gem: '<path d="M6 4h12l4 5-10 11L2 9z" fill="currentColor" fill-opacity=".25"/><path d="M2 9h20M9 4l-1.5 5L12 20M15 4l1.5 5L12 20"/>',
  coin: '<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".25"/><circle cx="12" cy="12" r="6"/><path d="M12 8.5v7M10 10.5h3a1.5 1.5 0 0 1 0 3h-2"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="currentColor" fill-opacity=".25"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6"/>',
  alive: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c3 0 5 2 5 5"/>',
  skull: '<path d="M12 3a8 8 0 0 0-5 14.2V20h10v-2.8A8 8 0 0 0 12 3z"/><circle cx="9" cy="11" r="1.6" fill="currentColor"/><circle cx="15" cy="11" r="1.6" fill="currentColor"/><path d="M10 20v-2M14 20v-2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  crown: '<path d="M3 18h18l-2-10-5 4-2-7-2 7-5-4z" fill="currentColor" fill-opacity=".25"/>',
  shirt: '<path d="M8 4l-5 3 2 4 3-1v10h8V10l3 1 2-4-5-3c-1 2-2 3-4 3S9 6 8 4z"/>',
  friends: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.8 2.9-6.5 6.5-6.5s6.5 2.7 6.5 6.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14c2 .9 3 3 3 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  door: '<path d="M4 21h16M7 21V4h10v17"/><circle cx="14" cy="13" r="1" fill="currentColor"/>',
  modes: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><path d="M17 13v8M13 17h8"/>'
};
LS.icon = (n, cls) => '<svg class="svgi' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (LS.ICONS[n] || '') + '</svg>';
LS.fillIcons = root => (root || document).querySelectorAll('i[data-icon]').forEach(el => { el.outerHTML = LS.icon(el.dataset.icon, el.className); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => LS.fillIcons()); else LS.fillIcons();
