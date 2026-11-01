/* src/engine/tracking.js — IoU, associação simples entre frames e TTC. */

function validBox(b){
  return Array.isArray(b) && b.length >= 4 && b[2] > 0 && b[3] > 0;
}

export function iou(a, b){
  if(!validBox(a) || !validBox(b)) return 0;
  const ax2 = a[0] + a[2], ay2 = a[1] + a[3];
  const bx2 = b[0] + b[2], by2 = b[1] + b[3];
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  if(inter <= 0) return 0;
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

export function sameTarget(prev, next, minIou = 0.35){
  if(!prev || !next || prev.cls !== next.cls) return false;
  return iou(prev.bbox, next.bbox) >= minIou;
}

// Tempo até a colisão, em segundos, a partir da variação de distância.
// Retorna Infinity quando o objeto não está se aproximando (ou dados inválidos).
export function estimateTtc(prevDist, nextDist, dtMs){
  const a = Number(prevDist), b = Number(nextDist), dt = Number(dtMs);
  if(!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(dt) || dt <= 0) return Infinity;
  if(b >= a - 0.01) return Infinity;
  const rate = (a - b) / (dt / 1000);
  if(rate <= 0) return Infinity;
  return b / rate;
}
