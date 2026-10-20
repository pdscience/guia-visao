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
  clf:null, mob:null, nomes:{}, MIN_FOTOS:10, MIN_CONF:0.60, LOAD_TIMEOUT:8000,
  initPromise:null, rawLoad:null,
  // pesos do MobileNet: carga única, memoizada e com timeout.
  // on-line: baixa uma vez (~14MB) e reusa em todas as sessões;
  // off-line/sem rede: falha em até LOAD_TIMEOUT e o app segue só com COCO.
  ensureModel(){
    if(this.mob) return Promise.resolve(this.mob);      // já carregado: reuso, sem rede
    if(this.initPromise) return this.initPromise;        // carga em andamento: não duplica
    this.initPromise = this._loadModel();
    return this.initPromise;
  },
  async _loadModel(){
    try{
      if(!window.mobilenet) throw new Error('mobilenet.min.js ausente');
      // o load bruto é compartilhado: um retry após o timeout não abre uma 2ª descarga
      if(!this.rawLoad){
        this.rawLoad = mobilenet.load({version:2, alpha:1.0});
        this.rawLoad.catch(()=>{ this.rawLoad = null; });
      }
      this.mob = await Promise.race([
        this.rawLoad,
        new Promise((_, rej)=>setTimeout(()=>rej(new Error('timeout de '+this.LOAD_TIMEOUT+'ms ao baixar o MobileNet')), this.LOAD_TIMEOUT))
      ]);
      return this.mob;
    }catch(e){
      this.initPromise = null;   // libera nova tentativa em uma próxima sessão
      throw e;
    }
  },
  async init(){
    await this.ensureModel();     // só a rede é cara; aqui é reuso
    await this.loadDataset();     // IDB local: barato, pode repetir (ex.: após apagar)
    return this.count();
  },
  async loadDataset(){
    if(!this.clf) this.clf = knnClassifier.create();
    const all = await ObstDB.loadAll().catch(()=>null);
    if(all === null) return;      // IndexedDB indisponível: preserva o que já está em memória
    this.nomes = {};
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
    // limpa antes de repor: sem isso, obstáculos apagados continuam na memória
    // do classificador e voltam a ser previstos como "Meu obstáculo" (fantasma)
    this.clf.clearAllClasses();
    if(Object.keys(merged).length) this.clf.setClassifierDataset(merged);
    return this.count();
  },
  count(){ try{ return this.clf.getClassExampleCount() || {}; }catch(e){ return {}; } },
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
    const n = this.clf.getClassExampleCount() || {};
    const ids = Object.keys(n).filter(k => k !== 'fundo' && (n[k]||0) >= this.MIN_FOTOS);
    if(!ids.length) return null;
    const logits = this.mob.infer(videoEl, 'conv_preds');
    let r;
    try{ r = await this.clf.predictClass(logits, 3); }
    finally{ logits.dispose(); }
    if(r.label === 'fundo') return null;
    const conf = r.confidences[r.label] || 0;
    if(conf < this.MIN_CONF) return null;
    return { id:r.label, conf };
  },
};
/* js/obst.js — append treino (presets PT + captura 1/s + voz) */
// catálogo curado — pesquisa RNIB "In My Way" 2025 (~1200 cegos/pouco visuais)
// e survey Manduchi (300+ cegos, colisões em altura de cabeça/tronco + quedas).
// ordem = prioridade real: chão/queda primeiro, depois mobiliário urbano,
// obstáculos móveis/obras e o residencial brasileiro. Para reconhecer na
// câmera sem treino, use os itens que o COCO-SSD já detecta (pessoa, carro,
// bicicleta, cachorro, banco, mala, mochila, cadeira, jardineira, vaso).
const PRESETS = [
  // chão / mudança de nível — 71% relatam calçada irregular como barreira
  'Buraco','Degrau','Calçada quebrada','Rampa irregular',
  // mobiliário urbano — colisão, muitas vezes em altura de cabeça/tronco
  'Poste','Lixeira','Grade','Jardineira','Banco de praça',
  // obstáculos móveis e obras — 56% relatam sacos, quadros e tapumes
  'Tapume de obra','Saco de lixo','Cone','Scooter',
  // residenciais / muito comuns no Brasil
  'Portão','Muro','Escada','Porta',
];
async function startTraining(nome, camEl, onTick){
  // aborta se a detecção parar no meio: sem isso, o treino seguiria com frames congelados
  const ativo = ()=> S.running && S.mode==='live' && camEl && camEl.videoWidth;
  const interrompido = ()=>{ if(!ativo()) throw new Error('Treino interrompido: detecção parada.'); };
  interrompido();
  // o carregamento do MobileNet é assíncrono em segundo plano: garante os pesos antes de fotografar
  try{ await MeuKNn.ensureModel(); }catch(e){ throw new Error('Sem o modelo MobileNet (rode o app com internet uma vez).'); }
  interrompido();
  const id = 'm' + Date.now().toString(36);
  const labelsAntes = new Set(Object.keys(MeuKNn.clf.getClassifierDataset()).filter(l => l !== 'fundo'));
  speak('Primeiro aponte para outro lugar, sem o obstáculo. Vou fotografar o fundo.', true);
  for(let i = 1; i <= 5; i++){
    interrompido();
    MeuKNn.addExampleFromVideo(camEl, 'fundo');
    onTick?.(i, 15);
    try{ beep(660, 0.07, 0.12, 0); }catch(e){}
    await new Promise(r => setTimeout(r, 1000));
  }
  speak(`Fotografando ${nome}. Mexa um pouco o celular.`, true);
  for(let i = 1; i <= 10; i++){
    interrompido();
    MeuKNn.addExampleFromVideo(camEl, id);
    onTick?.(5 + i, 15);
    try{ beep(880, 0.07, 0.12, 0); }catch(e){}
    await new Promise(r => setTimeout(r, 1000));
  }
  interrompido();
  const dataset = await MeuKNn.snapshotDataset();
  const mine = {};
  for(const [label, e] of Object.entries(dataset)){ if(label !== 'fundo' && !labelsAntes.has(label)) mine[label] = e; }
  const fundoDs = {};
  if(dataset['fundo']) fundoDs['fundo'] = dataset['fundo'];
  await ObstDB.save({ id:'fundo', nome:'Fundo', dataset:fundoDs, count:5, criadasEm:Date.now() });
  await ObstDB.save({ id, nome, dataset:mine, count:10, criadasEm:Date.now() });
  MeuKNn.nomes[id] = nome;
  speak(`${nome} cadastrado com 10 fotos.`, true);
  return id;
}
/* js/obst.js — fusão (label só, sem cantos na tela cheia) */
function fusePersonal(rel, sw, sh, pred){
  if(!pred) return rel;
  // Regra de ouro: um item pessoal NUNCA rebaixa um item COCO com risk maior.
  // O kNN classifica a tela inteira e não tem bbox real, então o conf (0.6..1.0)
  // não é comparável ao score geométrico do COCO: só entra quando o frame não
  // tem NADA de risk>=1. Com isso "Pessoa muito perto" (risk 2) nunca é
  // rebaixado para risk 1, e o sonar/alerta continuam refletindo a ameaça real.
  if(rel.some(d => d.risk >= 1)) return rel;
  const nome = MeuKNn.nomes[pred.id] || 'Meu obstáculo';
  rel.push({ cls:'meu:'+pred.id, nome, acc:Math.round(pred.conf*100), bbox:[0,0,sw,sh], risk:1, score:pred.conf, dir:'à frente', dist:'—', personal:true });
  // ordena por risk/score no fim: list[0] é o top do process(), então o mais
  // grave precisa ser o primeiro (personal risk 1 fica acima dos risk 0 do COCO)
  rel.sort((a,b)=> b.risk - a.risk || b.score - a.score);
  return rel;
}
/* js/obst.js — lista + presets + fiação (mesma Task 3) */
async function renderMyObst(){
  const list = $('#myObstList'); list.innerHTML = '';
  const all = (await ObstDB.loadAll().catch(()=>[])).filter(r => r.id !== 'fundo');
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
    if(all.length >= 12){ speak('Limite de 12 obstáculos. Apague um para cadastrar outro.', true); return; }
    $('#btnTrainStart').disabled = true;
    try{ await startTraining(nome, cam, (i, n)=>{ $('#trainStatus').textContent = `FOTO ${i}/${n}`; }); }
    catch(e){
      const cancelado = /(interromp|cancel)/i.test((e && e.message) || '');
      if(cancelado){
        $('#trainStatus').textContent = 'TREINO CANCELADO';
        // descarta as fotos parciais: senão o id abortado continua prevendo
        // "Meu obstáculo" fantasma até o próximo reload
        try{ await MeuKNn.loadDataset(); if(S.knnCount) S.knnCount = MeuKNn.count(); }catch(err){}
      }
      speak(cancelado ? 'Treinamento cancelado.' : 'Falha ao fotografar. Tente de novo.', true);
    }
    $('#btnTrainStart').disabled = false;
    renderMyObst();
  };
}
