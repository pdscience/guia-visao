import { LABELS, RISK_BIAS, TALL } from './labels.js';
import { Vigia } from './vigia.js';

export function enrich(pred, sw, sh, sensArg){
  const sens = (typeof sensArg === 'number') ? sensArg : ((typeof globalThis !== 'undefined' && globalThis.S && typeof globalThis.S.sens === 'number') ? globalThis.S.sens : 1);
  const [x,y,w,h] = pred.bbox;
  const cx = x + w/2;
  const area = (w*h)/(sw*sh), hr = h/sh;
  let score = area*2.4*sens*(RISK_BIAS[pred.class]||1);
  if(TALL.has(pred.class)) score = Math.max(score, hr*1.05*sens*(RISK_BIAS[pred.class]||1));
  const risk = score>=0.35 ? 2 : score>=0.10 ? 1 : 0;
  const dir = cx/sw < .4 ? 'à esquerda' : cx/sw > .6 ? 'à direita' : 'à frente';
  const base = TALL.has(pred.class) ? hr : Math.sqrt(area);
  let dist = Math.max(0.4, Math.min(9, 1.05/(base+0.03)));
  dist = dist<2 ? Math.round(dist*10)/10 : Math.round(dist);
  return { cls:pred.class, nome:LABELS[pred.class]||'Obstáculo', acc:Math.round(pred.score*100), bbox:pred.bbox, risk, score, dir, dist };
}

export function phrase(d){
  const dist = (d.dist && d.dist!=='—') ? `${String(d.dist).replace('.',',')} metros, ` : '';
  const prio = Vigia.has(d.cls) ? 'Prioridade: ' : '';
  return `${prio}${d.nome} ${d.dir}, ${dist}${d.risk===2?'muito perto':d.risk===1?'perto':'à distância'}.`;
}

const VEHICLES = new Set(['car','truck','bus','motorcycle','bicycle','train','boat']);

// limiar de confiança por classe: veículos aparecem rápido e são perigosos,
// então aceitamos um pouco menos de confiança; pessoa exige mais para evitar
// disparos falsos em padrões parecidos.
export function detectThreshold(cls){
  if(VEHICLES.has(cls)) return 0.20;
  if(cls === 'person') return 0.20;
  return 0.20;
}
