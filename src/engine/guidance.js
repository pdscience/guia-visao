/* src/engine/guidance.js — corredor livre e orientação de desvio (puro). */

function overlapsThird(box, x0, x1){
  const left = box[0], right = box[0] + box[2];
  return right > x0 && left < x1;
}

// Considera só obstáculos com risco >= 1. Divide a imagem em três faixas e
// informa se a frente (centro) está livre e para que lado desviar.
export function corridor(dets, sw){
  const w = Number(sw) || 0;
  const third = w / 3;
  let leftBlocked = false, centerBlocked = false, rightBlocked = false;
  for(const d of (dets || [])){
    if(!d || (d.risk || 0) < 1) continue;
    const b = d.bbox;
    if(!Array.isArray(b) || b.length < 3) continue;
    if(overlapsThird(b, 0, third)) leftBlocked = true;
    if(overlapsThird(b, third, 2 * third)) centerBlocked = true;
    if(overlapsThird(b, 2 * third, w)) rightBlocked = true;
  }
  const front = !centerBlocked, left = !leftBlocked, right = !rightBlocked;
  const suggestion = front ? 'front' : left ? 'left' : right ? 'right' : 'stop';
  return { front, left, right, suggestion };
}

export function guidanceSpeech(dets, sw){
  const risky = (dets || []).some(d => d && (d.risk || 0) >= 1);
  if(!risky) return '';
  const c = corridor(dets, sw);
  if(c.suggestion === 'left') return 'Desvie para a esquerda.';
  if(c.suggestion === 'right') return 'Desvie para a direita.';
  if(c.suggestion === 'stop') return 'Pare. Sem passagem à frente.';
  return '';
}

// Até `max` obstáculos de risco, sem repetir classe+direção.
export function alertsFor(dets, max = 2){
  const seen = new Set();
  const out = [];
  const sorted = (dets || [])
    .filter(d => d && (d.risk || 0) >= 1)
    .slice()
    .sort((a, b) => (b.risk - a.risk) || ((b.score || 0) - (a.score || 0)));
  for(const d of sorted){
    const key = d.cls + '|' + d.dir;
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(d);
    if(out.length >= max) break;
  }
  return out;
}
