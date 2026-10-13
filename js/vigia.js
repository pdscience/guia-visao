/* js/vigia.js — lista de vigilância: objetos que o usuário quer que recebam
   prioridade nos alertas. Sem foto: só funciona com as classes do COCO.
   Lógica pura (sem DOM) — testada em tests/vigia.test.js. */
const Vigia = {
  KEY: 'guia-visao-vigia',
  MIN_PES: 3,
  _labels: {},

  init(labels){ this._labels = labels || {}; },

  all(){
    try{
      const a = JSON.parse(localStorage.getItem(this.KEY) || '[]');
      return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x) : [];
    }catch(e){ return []; }
  },

  has(cls){ return this.all().includes(cls); },

  add(cls){
    if(!cls) return false;
    const a = this.all();
    if(a.includes(cls)) return false;
    a.push(cls);
    this._save(a);
    return true;
  },

  remove(cls){
    const a = this.all();
    if(!a.includes(cls)) return false;
    this._save(a.filter(x => x !== cls));
    return true;
  },

  findByName(fala){
    const q = vigiaNorm(fala);
    if(!q) return null;
    let parcial = null;
    for(const cls in this._labels){
      const n = vigiaNorm(this._labels[cls]);
      if(!n) continue;
      if(n === q) return cls;
      if(!parcial && q.length >= this.MIN_PES && (n.includes(q) || q.includes(n))) parcial = cls;
    }
    return parcial;
  },

  _save(a){
    try{ localStorage.setItem(this.KEY, JSON.stringify(a)); }catch(e){}
  },
};

function vigiaNorm(s){
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
