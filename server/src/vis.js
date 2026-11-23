// Linha de visão no servidor (anti-wallhack): o servidor só manda pra cada jogador a posição de quem
// ele poderia ver. Usa o relevo e as paredes/telhados/pedras do mapa fixo (occluders.js).
// A regra é generosa de propósito: na dúvida, conta como visível. Assim ninguém fica invisível
// por erro de cálculo; só quem está bem escondido atrás de parede/morro some do pacote.
import OCC from './occluders.js';

const S = OCC.seg, W = S + 1, CELLM = OCC.size / S, HALF = OCC.size / 2, GRID = 16;

// relevo: Int16 em decímetros
const H = (() => {
  const bin = atob(OCC.h), n = bin.length >> 1, out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v & 0x8000) v -= 0x10000; out[i] = v / 10; }
  return out;
})();

export function heightAt(x, z) {
  const gx = (x + HALF) / CELLM, gz = (z + HALF) / CELLM;
  if (gx < 0 || gz < 0 || gx >= S || gz >= S) return -8;
  const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
  const h00 = H[ix + iz * W], h10 = H[ix + 1 + iz * W], h01 = H[ix + (iz + 1) * W], h11 = H[ix + 1 + (iz + 1) * W];
  if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
  return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

// caixas + grade espacial
const BOX = OCC.boxes;
const grid = new Map();
for (let i = 0; i < BOX.length; i++) {
  const b = BOX[i];
  for (let cx = Math.floor(b[0] / GRID); cx <= Math.floor(b[3] / GRID); cx++)
    for (let cz = Math.floor(b[2] / GRID); cz <= Math.floor(b[5] / GRID); cz++) {
      const k = cx * 4096 + cz; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i);
    }
}

function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = 0, tmax = maxT;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    const lo = b[a], hi = b[a + 3];
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo || o[a] > hi) return -1; continue; }
    let t1 = (lo - o[a]) / d[a], t2 = (hi - o[a]) / d[a];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}
const roofY = (b, x, z) => b[9] - Math.abs(b[6] ? z - b[8] : x - b[7]) * b[10];

let stamp = 0; const seen = new Uint32Array(BOX.length);

// true se alguma coisa (parede, telhado, pedra, morro) fica entre a e b
export function blocked(ax, ay, az, bx, by, bz) {
  let dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz); if (len < 0.5) return false;
  dx /= len; dy /= len; dz /= len;
  const maxT = len - 0.35;
  // relevo (com folga de 25 cm pra não esconder quem está deitado no topo do morro)
  for (let t = 2; t < maxT; t += Math.max(2, t * 0.02)) { // passo cresce com a distância (menos CPU; na dúvida, fica visível)
    if (ay + dy * t < heightAt(ax + dx * t, az + dz * t) - 0.25) return true;
  }
  // caixas: percorre as células da grade ao longo do raio
  stamp = (stamp + 1) >>> 0; if (stamp === 0) { seen.fill(0); stamp = 1; }
  const hl = Math.hypot(dx, dz) || 1e-6, horiz = maxT * hl, step = GRID * 0.5;
  const minX = Math.min(ax, ax + dx * maxT), maxX = Math.max(ax, ax + dx * maxT), minZ = Math.min(az, az + dz * maxT), maxZ = Math.max(az, az + dz * maxT);
  for (let s = 0; ; s += step) {
    const t = Math.min(s, horiz) / hl, x = ax + dx * t, z = az + dz * t;
    for (let cx = Math.floor((x - step) / GRID); cx <= Math.floor((x + step) / GRID); cx++)
      for (let cz = Math.floor((z - step) / GRID); cz <= Math.floor((z + step) / GRID); cz++) {
        const l = grid.get(cx * 4096 + cz); if (!l) continue;
        for (const i of l) {
          if (seen[i] === stamp) continue; seen[i] = stamp;
          const b = BOX[i];
          if (b[3] < minX || b[0] > maxX || b[5] < minZ || b[2] > maxZ) continue;
          const tb = rayBox(ax, ay, az, dx, dy, dz, b, maxT);
          if (tb < 0) continue;
          if (b.length <= 6) return true;
          // telhado inclinado: só bloqueia abaixo das telhas
          for (let tt = tb; tt < Math.min(maxT, tb + 30); tt += 0.25) {
            const px = ax + dx * tt, py = ay + dy * tt, pz = az + dz * tt;
            if (px < b[0] || px > b[3] || pz < b[2] || pz > b[5] || py < b[1] - 0.01) break;
            if (py <= roofY(b, px, pz)) return true;
          }
        }
      }
    if (s >= horiz) break;
  }
  return false;
}

// pontos de onde o jogador pode estar olhando: olho + onde a câmera em 3ª pessoa pode ficar
// (acima e em volta da cabeça). Cada ponto só vale se o olho alcança ele sem atravessar parede,
// igual à câmera do jogo, que encosta na parede em vez de passar.
const RING = [0, 1, 2, 3, 4, 5].map(i => [Math.cos(i * Math.PI / 3), Math.sin(i * Math.PI / 3)]);
export function viewPoints(p) {
  const ex = p[0], ey = p[1] + 1.55, ez = p[2], out = [[ex, ey, ez]];
  const top = [ex, p[1] + 2.9, ez];
  if (!blocked(ex, ey, ez, top[0], top[1] + 0.3, top[2])) out.push(top);
  for (const [rx, rz] of RING) {
    const q = [ex + rx * 3.2, p[1] + 2.5, ez + rz * 3.2];
    if (!blocked(ex, ey, ez, q[0] + rx * 0.4, q[1], q[2] + rz * 0.4)) out.push(q);
  }
  return out;
}

// pontos do corpo do alvo (pés, peito, cabeça) + um pouco à frente na direção em que anda
export function bodyPoints(p, v) {
  const x = p[0], y = p[1], z = p[2], out = [[x, y + 1.65, z], [x, y + 1.05, z], [x, y + 0.35, z]];
  if (v) { const k = 0.3; out.push([x + v[0] * k, y + 1.2, z + v[2] * k]); }
  return out;
}

export function canSee(views, target) {
  for (const t of target) for (const s of views) if (!blocked(s[0], s[1], s[2], t[0], t[1], t[2])) return true;
  return false;
}
