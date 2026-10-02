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
/* js/obst.js — append treino (presets PT + captura 1/s + voz) */
const PRESETS = ['Portão', 'Escada', 'Porta', 'Muro', 'Janela'];
async function startTraining(nome, camEl, onTick){
  const id = 'm' + Date.now().toString(36);
  const labelsAntes = new Set(Object.keys(MeuKNn.clf.getClassifierDataset()));
  speak(`Fotografando ${nome}. Mexa um pouco o celular.`, true);
  for(let i = 1; i <= 10; i++){
    MeuKNn.addExampleFromVideo(camEl, id);
    onTick?.(i, 10);
    try{ beep(880, 0.07, 0.12, 0); }catch(e){}
    await new Promise(r => setTimeout(r, 1000));
  }
  const dataset = await MeuKNn.snapshotDataset();
  const mine = {};
  for(const [label, e] of Object.entries(dataset)){ if(!labelsAntes.has(label)) mine[label] = e; }
  await ObstDB.save({ id, nome, dataset:mine, count:10, criadasEm:Date.now() });
  MeuKNn.nomes[id] = nome;
  speak(`${nome} cadastrado com 10 fotos.`, true);
  return id;
}
/* js/obst.js — lista + presets + fiação (mesma Task 3) */
async function renderMyObst(){
  const list = $('#myObstList'); list.innerHTML = '';
  const all = await ObstDB.loadAll().catch(()=>[]);
  $('#myObstCount').textContent = all.length;
  const box = $('#myObstPresets'); box.innerHTML = '';
  for(const p of PRESETS){ const b = document.createElement('button'); b.className = 'px-3 py-1.5 rounded-full border border-white/10'; b.textContent = p; b.addEventListener('click', ()=>{ $('#myObstName').value = p; }); box.appendChild(b); }
  for(const rec of all){
    const li = document.createElement('li');
    li.className = 'flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3';
    const nameWrap = document.createElement('span');
    const spanNome = document.createElement('span');
    spanNome.textContent = rec.nome;
    nameWrap.appendChild(spanNome);
    nameWrap.appendChild(document.createTextNode(' '));
    const spanCount = document.createElement('span');
    spanCount.className = 'font-mono text-[10px] text-white/40';
    spanCount.textContent = `· ${rec.count} fotos`;
    nameWrap.appendChild(spanCount);
    li.appendChild(nameWrap);
    const wrap = document.createElement('span'); wrap.className = 'flex gap-2';
    const t = document.createElement('button'); t.className = 'icon-btn'; t.setAttribute('aria-label', 'Ouvir nome ' + rec.nome);
    t.innerHTML = '<i data-lucide="volume-2" class="w-5 h-5"></i>';
    t.addEventListener('click', ()=>speak(rec.nome, true));
    const d = document.createElement('button'); d.className = 'icon-btn'; d.setAttribute('aria-label', 'Apagar ' + rec.nome);
    d.innerHTML = '<i data-lucide="trash-2" class="w-5 h-5"></i>';
    d.addEventListener('click', async ()=>{ await ObstDB.remove(rec.id); delete MeuKNn.nomes[rec.id]; await MeuKNn.init(); renderMyObst(); speak(rec.nome + ' apagado.', true); });
    wrap.append(t, d); li.append(wrap); list.append(li);
  }
  lucide.createIcons();
  $('#btnTrainStart').onclick = async ()=>{
    const nome = ($('#myObstName').value || '').trim();
    if(!nome){ speak('Diga ou digite o nome do obstáculo primeiro.', true); return; }
    if(!S.running || S.mode !== 'live'){ speak('Ative a câmera primeiro para fotografar.', true); return; }
    if(all.length >= 8){ speak('Limite de 8 obstáculos. Apague um para cadastrar outro.', true); return; }
    $('#btnTrainStart').disabled = true;
    try{ await startTraining(nome, cam, (i, n)=>{ $('#trainStatus').textContent = `FOTO ${i}/${n}`; }); }
    catch(e){ speak('Falha ao fotografar. Tente de novo.', true); }
    $('#btnTrainStart').disabled = false;
    renderMyObst();
  };
}
