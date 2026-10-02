/* js/obst.js — parte 1: store + kNN (sem UI) */
const ObstDB = {
  _db:null,
  open(){ return new Promise((res, rej)=>{
    if(this._db) return res(this._db);
    const r = indexedDB.open('guia-visao-obstaculos', 1);
    r.onupgradeneeded = ()=>{ r.result.createObjectStore('obstaculos', {keyPath:'id'}); };
    r.onsuccess = ()=>{ this._db = r.result; res(this._db); };
    r.onerror = ()=>rej(r.error);
  });},
  async save(rec){ const db = await this.open(); return new Promise((res, rej)=>{ const t = db.transaction('obstaculos','readwrite'); t.objectStore('obstaculos').put(rec); t.oncomplete = res; t.onerror = ()=>rej(t.error); }); },
  async loadAll(){ const db = await this.open(); return new Promise((res, rej)=>{ const q = db.transaction('obstaculos').objectStore('obstaculos').getAll(); q.onsuccess = ()=>res(q.result||[]); q.onerror = ()=>rej(q.error); }); },
  async remove(id){ const db = await this.open(); return new Promise((res, rej)=>{ const t = db.transaction('obstaculos','readwrite'); t.objectStore('obstaculos').delete(id); t.oncomplete = res; t.onerror = ()=>rej(t.error); }); },
};

const MeuKNn = {
  clf:null, mob:null, nomes:{}, MIN_FOTOS:10, MIN_CONF:0.60,
  async init(){
    this.mob = await mobilenet.load({version:2, alpha:1.0});
    this.clf = knnClassifier.create();
    const all = await ObstDB.loadAll().catch(()=>[]);
    const merged = {};
    for(const rec of all){
      try{
        this.nomes[rec.id] = rec.nome;
        for(const [label, e] of Object.entries(rec.dataset)){
          const t = tf.tensor2d(e.data, e.shape);
          if(merged[label]){ const old = merged[label]; merged[label] = old.concat(t, 0); old.dispose(); t.dispose(); }
          else merged[label] = t;
        }
      }catch(err){ console.warn('classe corrompida, ignorada:', rec.id); }
    }
    if(Object.keys(merged).length) this.clf.setClassifierDataset(merged);
    return this.count();
  },
  count(){ try{ return this.clf.getNumberOfExamplesByClass() || {}; }catch(e){ return {}; } },
  addExampleFromVideo(videoEl, classId){
    const logits = this.mob.infer(videoEl, 'conv_preds');
    this.clf.addExample(logits, classId);
    logits.dispose();
  },
  async snapshotDataset(){
    const ds = this.clf.getClassifierDataset();
    const out = {};
    for(const [label, t] of Object.entries(ds)){ out[label] = { data:Array.from(t.dataSync()), shape:t.shape }; }
    return out;
  },
  async predictTop(videoEl){
    const n = this.clf.getNumberOfExamplesByClass() || {};
    const ids = Object.keys(n).filter(k => (n[k]||0) >= this.MIN_FOTOS);
    if(!ids.length) return null;
    const logits = this.mob.infer(videoEl, 'conv_preds');
    let r;
    try{ r = await this.clf.predictClass(logits, 3); }
    finally{ logits.dispose(); }
    const conf = r.confidences[r.label] || 0;
    if(conf < this.MIN_CONF) return null;
    return { id:r.label, conf };
  },
};
