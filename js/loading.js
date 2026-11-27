// TELAS DE CARREGAMENTO (estilo splash de jogo de tiro): arte em tela cheia renderizada no Blender + barra pixel embaixo.
// As artes ficam em assets/splash/. No evento de Natal entra a arte do Frost Reaper.
'use strict';
LS.Loading = {
  ARTS: {
    squad: { src: 'assets/splash/squad.webp', pos: '50% 30%', tag: 'BATTLE ROYALE' },
    sky: { src: 'assets/splash/sky.webp', pos: '50% 45%', tag: 'SALTE NA ILHA' },
    xmas: { src: 'assets/splash/xmas.webp', pos: '50% 30%', tag: 'EVENTO DE NATAL · FROST REAPER' }
  },
  TIPS: ['Dica: fique dentro da zona segura!', 'Dica: tiro na cabeça faz PANELA (e vale mais tickets no Natal)!', 'Dica: agachar diminui o recuo da arma.', 'Dica: a bolinha de neve vira uma parede de gelo.',
    'Dica: pegue colete e capacete logo no começo.', 'Dica: segure W na queda livre pra mergulhar mais rápido.', 'Dica: no duelo, vença 5 rounds pra ganhar.', 'Dica: chame seus amigos pra party e caiam juntos!'],
  XMAS_TIPS: ['Evento de Natal: abate na cabeça dá +5 SnowTickets, no corpo +3.', 'Evento de Natal: complete as missões e gire o Spin de Natal!', 'Frost Reaper e Biscoito de Gengibre são os prêmios máximos do Spin de Natal.'],
  last: null,
  // escolhe a arte (sem repetir a da vez anterior); no Natal a do Frost Reaper aparece metade das vezes
  pick(mode) {
    const xm = LS.Xmas && LS.Xmas.active();
    let pool = mode === 'duel' || mode === 'custom' ? ['squad'] : ['sky', 'squad'];
    if (xm) pool = pool.concat(['xmas', 'xmas']);
    const opts = pool.filter(k => k !== this.last);
    return (this.last = (opts.length ? opts : pool)[Math.floor(Math.random() * (opts.length ? opts : pool).length)]);
  },
  show(mode, title) {
    if (LS.Tex) LS.Tex.snowU.value = LS.Xmas && LS.Xmas.active() && mode !== 'duel' ? 1 : 0; // Natal: ilha coberta de neve
    const A = this.ARTS[this.pick(mode)], img = document.getElementById('ld-art');
    if (img) { img.classList.remove('in'); img.onload = () => img.classList.add('in'); img.style.objectPosition = A.pos; img.src = A.src; if (img.complete) img.classList.add('in'); }
    const tag = document.getElementById('ld-tag'); if (tag) tag.textContent = A.tag;
    const M = LS.Modes, md = document.getElementById('ld-mode');
    if (md) md.textContent = mode === 'duel' ? 'DUELO ' + (M && M.duelSize > 1 ? '2V2' : '1V1') : mode === 'custom' ? 'SALA PERSONALIZADA' : 'BATTLE ROYALE · ' + (M ? M.BR_NAMES[M.brSize] || 'SQUAD' : 'SQUAD');
    const h = document.querySelector('#loading .loading-box h2'); if (h) h.textContent = title || (mode === 'duel' ? 'PREPARANDO O GALPÃO…' : 'GERANDO ILHA…');
    const tips = (LS.Xmas && LS.Xmas.active() ? this.XMAS_TIPS.concat(this.TIPS) : this.TIPS), tip = document.getElementById('loading-tip');
    if (tip) tip.textContent = tips[Math.floor(Math.random() * tips.length)];
    document.getElementById('loading').classList.toggle('xmas', !!(LS.Xmas && LS.Xmas.active()));
  }
};
