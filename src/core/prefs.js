const PREFS_KEY = 'guia-visao-prefs';

export function readPrefs(state){
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); if(!p || typeof p !== 'object') p = {}; } catch(e){ p = {}; }
  if(state){ state.prefs = p; }
  try{
    const hc = p.hc === true, big = p.big === true;
    document.body.classList.toggle('hc', hc);
    document.body.classList.toggle('bigtype', big);
  }catch(e){}
  return p;
}

export function savePrefs(state){
  try{
    const s = state || {};
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      tts: s.tts, autoVoice: s.autoVoice, vib: s.vib, son: s.son, knnOn: s.knnOn,
      acc: s.acc, sens: s.sens, rate: s.rate,
      hc: document.body.classList.contains('hc'),
      big: document.body.classList.contains('bigtype'),
    }));
  }catch(e){}
  if(state){ state.prefs = readPrefs(); }
}
