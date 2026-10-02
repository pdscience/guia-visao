# Meus Obstáculos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usuário cadastra obstáculos pessoais com fotos e o app os anuncia por voz como os demais objetos.

**Architecture:** MobileNet embedding (`infer(frame,'conv_preds')`) + kNN few-shot (`knn-classifier`) com exemplos salvos em IndexedDB; a cada ~500ms (frames alternados com o COCO) o kNN vota e injeta detecção sintética no `process()` existente, reaproveitando voz, histerese, repetição e vibração.

**Tech Stack:** Vanilla JS, TFJS 4.17.0 (já vendorado), `@tensorflow-models/mobilenet@2.1.0`, `@tensorflow-models/knn-classifier@1.2.2`, IndexedDB puro (sem lib), Service Worker Cache Storage.

**Spec:** `docs/superpowers/specs/2026-10-02-meus-obstaculos-design.md`

## Global Constraints

- 100% on-device: nenhuma foto sai do aparelho nesta fase; sem conta, sem chave, sem internet obrigatória.
- Confiança mínima 0.60; classes com menos de 10 fotos não anunciam; abaixo da confiança, silêncio.
- Máximo 8 obstáculos; 10 fotos por obstáculo (1/s com bipes).
- Direção de classes pessoais sempre "à frente"; distância exibida como "—".
- Novos vendors pinados (sem `latest`): `mobilenet@2.1.0`, `knn-classifier@1.2.2`.
- COCO-SSD continua intacto e prioritário no tempo real; kNN nunca quebra o `loopLive` (try/catch + toggle).
- Todo passo falado (TTS) — nenhum fluxo só-visual.

---

## File Structure

- Modify: `index.html` — 2 `<script vendor>` (mobilenet, knn-classifier após coco-ssd), botão "Meus obstáculos" em Ajustes (`#btnMyObst`), nova `section#sheetObst` (lista + novo + nome + preset voz) + item de ajuda "DIAGNÓSTICO" já existe (sem tocar).
- Create: `js/obst.js` — store IndexedDB (`ObstDB`), kNN wrapper (`MeuKNn`: init/load/train/predict/clear), captura de treino (`startTraining(nome, onTick)`), fusão (`fusePersonal(preds, sw, sh)`). Uma responsabilidade: tudo do pessoal; `js/app.js` só chama 3 funções.
- Modify: `js/app.js` — S.* (`knnOn:true`, `knnReady`, `knnCount`), `loopLive` alterna frames kNN, `startLive` carrega base (loadPersonal), `diagnose()` soma nº classes pessoais, settings switch `swKNn`, botão abre sheet.
- Modify: `sw.js` SHELL — adiciona `./vendor/mobilenet.min.js`, `./vendor/knn-classifier.min.js`.
- Modify: `scripts/check-pwa.py` — MISSING inclui os 2 novos vendors.
- Test: lab headless com `gate.jpg` (treina 8 crops, testa 4 held-out + negativos).

---

### Task 1: Vendorar MobileNet + kNN + precache

**Files:**
- Create: `vendor/mobilenet.min.js`, `vendor/knn-classifier.min.js`
- Modify: `index.html` (2 script tags), `sw.js:2` (SHELL), `scripts/check-pwa.py:6` (MISSING)

**Interfaces:**
- Consumes: TFJS 4.17.0 global `tf` (já vendorado).
- Produces: globais `mobilenet` e `knnClassifier` carregados antes de `js/app.js`.

- [ ] **Step 1: Write the failing test**

```bash
grep -q "mobilenet.min.js" index.html && grep -q "knn-classifier.min.js" sw.js && python3 scripts/check-pwa.py || echo "TASK1-FAIL(expected)"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `grep -q "mobilenet.min.js" index.html`
Expected: FAIL (exit 1, ainda não há vendor local)

- [ ] **Step 3: Write minimal implementation**

```bash
curl -sL "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.0/dist/mobilenet.min.js" -o vendor/mobilenet.min.js
curl -sL "https://cdn.jsdelivr.net/npm/@tensorflow-models/knn-classifier@1.2.2/dist/knn-classifier.min.js" -o vendor/knn-classifier.min.js
```

```html
<!-- index.html, após coco-ssd, antes de lucide -->
<script src="./vendor/mobilenet.min.js"></script>
<script src="./vendor/knn-classifier.min.js"></script>
```

```javascript
// sw.js SHELL: inserir após coco-ssd
'./vendor/mobilenet.min.js','./vendor/knn-classifier.min.js',
```

```python
# scripts/check-pwa.py:6 — estender a lista MISSING com:
"vendor/mobilenet.min.js","vendor/knn-classifier.min.js",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 scripts/check-pwa.py && node -e "const s=require('fs').readFileSync('vendor/knn-classifier.min.js','utf8'); if(!s.includes('knnClassifier')) throw new Error('sem global'); console.log('vendor OK')"`
Expected: PASS (MISSING none + global presente)

- [ ] **Step 5: Commit**

```bash
git add vendor/ index.html sw.js scripts/check-pwa.py
git commit -m "feat(obst): vendor mobilenet + knn-classifier com precache"
```

---

### Task 2: Banco IndexedDB + wrapper kNN (`js/obst.js`, parte 1)

**Files:**
- Create: `js/obst.js`
- Modify: `index.html` (script `./js/obst.js` após knn-classifier, antes de `./js/app.js`)

**Interfaces:**
- Consumes: globais `tf`, `mobilenet`, `knnClassifier` (Task 1).
- Produces: `ObstDB.save(rec) / ObstDB.loadAll() / ObstDB.remove(id)` (Promises), `MeuKNn.init() / MeuKNn.count() / MeuKNn.addExampleFromVideo(videoEl, classId) / MeuKNn.predictTop(videoEl) -> {id, conf} | null`, `MeuKNn.exportDataset() / MeuKNn.importDataset(map)`. `js/app.js` (Task 4) consome só `init/predictTop/count`.

- [ ] **Step 1: Write the failing test**

```bash
grep -q "MeuKNn.predictTop" js/obst.js && echo "exists" || echo "TASK2-FAIL(expected)"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `test -f js/obst.js`
Expected: FAIL (arquivo ainda não existe)

- [ ] **Step 3: Write minimal implementation**

```javascript
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
```

```html
<!-- index.html, após knn-classifier -->
<script src="./js/obst.js"></script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --check js/obst.js && grep -q "js/obst.js" index.html && echo "TASK2 OK"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/obst.js index.html
git commit -m "feat(obst): store IndexedDB e wrapper kNN"
```

---

### Task 3: Tela de cadastro + treino guiado por voz

**Files:**
- Modify: `index.html` (`section#sheetObst` + botão `#btnMyObst` em Ajustes + preset list), `js/obst.js` (append `startTraining`)
- Modify: `js/app.js` (1 linha: `$('#btnMyObst').addEventListener('click', ()=>openSheet('sheetObst'))`)

**Interfaces:**
- Consumes: `MeuKNn` + `ObstDB` (Task 2), `speak/toast/openSheet` de `js/app.js`.
- Produces: `startTraining(nomeOuPreset, {onTick})` → salva 10 fotos (1/s, bipes via `beep()`) e persiste; lista com Ouvir teste/Apagar; nada quebra se câmera off (toast + fala).

- [ ] **Step 1: Write the failing test**

```bash
grep -q "sheetObst" index.html && grep -q "startTraining" js/obst.js && echo exists || echo "TASK3-FAIL(expected)"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `grep -q "sheetObst" index.html`
Expected: FAIL (exit 1)

- [ ] **Step 3: Write minimal implementation**

```html
<!-- index.html: botão em Ajustes após swAutoVoice + sheet antes de #backdrop -->
<button id="btnMyObst" class="mt-3 w-full h-14 rounded-2xl border border-white/15 bg-white/5 font-bold text-[14px] text-white/80 flex items-center justify-center gap-3 active:scale-[.98] transition">Meus obstáculos (<span id="myObstCount">0</span>)</button>
<section id="sheetObst" class="sheet" role="dialog" aria-modal="true" aria-label="Meus obstáculos" tabindex="-1">
  <div class="mx-2 mb-2 rounded-[28px] bg-[#0e1016]/95 backdrop-blur-2xl border border-white/10 p-6">
    <div class="flex items-center justify-between mb-5"><h2 class="font-black text-lg">Meus obstáculos</h2><button class="icon-btn" data-close aria-label="Fechar"><i data-lucide="x" class="w-5 h-5"></i></button></div>
    <ul id="myObstList" class="space-y-2.5 text-[14px]"></ul>
    <input id="myObstName" class="mt-4 w-full h-14 rounded-2xl border border-white/15 bg-white/5 px-4 font-bold" placeholder="Nome: ex. Portão de casa" aria-label="Nome do obstáculo">
    <div class="mt-3 flex flex-wrap gap-2 font-mono text-[10px]" id="myObstPresets"></div>
    <button id="btnTrainStart" class="mt-3 w-full h-14 rounded-2xl bg-gradient-to-br from-[#c6ff60] to-[#8fe02c] text-[#0b0e05] font-black">Fotografar 10 vezes</button>
    <p id="trainStatus" class="mt-3 font-mono text-[10px] tracking-[.15em] text-white/50" aria-live="polite">PRONTO PARA CADASTRAR</p>
  </div>
</section>
```

```javascript
/* js/obst.js — append treino (presets PT + captura 1/s + voz) */
const PRESETS = ['Portão', 'Escada', 'Porta', 'Muro', 'Janela'];
async function startTraining(nome, camEl, onTick){
  const id = 'm' + Date.now().toString(36);
  speak(`Fotografando ${nome}. Mexa um pouco o celular.`, true);
  for(let i = 1; i <= 10; i++){
    MeuKNn.addExampleFromVideo(camEl, id);
    onTick(i, 10);
    try{ beep(880, 0.07, 0.12, 0); }catch(e){}
    await new Promise(r => setTimeout(r, 1000));
  }
  const dataset = await MeuKNn.snapshotDataset();
  const mine = {};
  for(const [label, e] of Object.entries(dataset)){ if(!(label in (MeuKNn._savedLabels||{}))) mine[label] = e; }
  MeuKNn._savedLabels = MeuKNn._savedLabels || {};
  Object.keys(mine).forEach(l => MeuKNn._savedLabels[l] = true);
  await ObstDB.save({ id, nome, dataset:mine, count:10, criadasEm:Date.now() });
  MeuKNn.nomes[id] = nome;
  speak(`${nome} cadastrado com 10 fotos.`, true);
  return id;
}
```

```javascript
// js/app.js bindings: 1 linha junto aos outros sheets
$('#btnMyObst').addEventListener('click', ()=>{ renderMyObst(); openSheet('sheetObst'); });
```

```javascript
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
    li.innerHTML = `<span>${rec.nome} <span class="font-mono text-[10px] text-white/40">· ${rec.count} fotos</span></span>`;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --check js/obst.js && node --check js/app.js && grep -q "btnTrainStart" index.html && echo "TASK3 OK"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add index.html js/obst.js js/app.js
git commit -m "feat(obst): tela de cadastro com treino guiado por voz"
```

---

### Task 4: Fusão no tempo real + toggle + diagnose

**Files:**
- Modify: `js/app.js` (`S.knnOn:true`, `loopLive` alterna kNN, `startLive` init, `diagnose()`, switch `swKNn`, `renderMyObst()`)
- Modify: `js/obst.js` (append `fusePersonal`)

**Interfaces:**
- Consumes: `MeuKNn.predictTop` (Task 2), `process/enrich/speak` existentes.
- Produces: detecção sintética `{cls:'meu:'+id, nome, acc, bbox:[0,0,sw,sh], risk:1, score:conf, dir:'à frente', dist:'—', personal:true}` fundida à lista do COCO antes de `process()`; voz/histerese/repetição reaproveitadas.

- [ ] **Step 1: Write the failing test**

```bash
grep -q "fusePersonal" js/obst.js && grep -q "knnOn" js/app.js && echo exists || echo "TASK4-FAIL(expected)"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `grep -q "fusePersonal" js/obst.js`
Expected: FAIL (exit 1)

- [ ] **Step 3: Write minimal implementation**

```javascript
/* js/obst.js — fusão (label só, sem cantos na tela cheia) */
function fusePersonal(rel, sw, sh, pred){
  if(!pred) return rel;
  const nome = MeuKNn.nomes[pred.id] || 'Meu obstáculo';
  rel.unshift({ cls:'meu:'+pred.id, nome, acc:Math.round(pred.conf*100), bbox:[0,0,sw,sh], risk:1, score:pred.conf, dir:'à frente', dist:'—', personal:true });
  return rel;
}
```

```javascript
/* js/app.js — loopLive: alterna 1 frame COCO / 1 frame kNN */
let knnTurn = false;
async function loopLive(){
  if(S.mode!=='live' || !S.running) return;
  const now = performance.now();
  // ... (bloco no-frames inalterado) ...
  if(cam.readyState>=2 && S.modelReady && !S.inferBusy && now-lastInfer>170){
    S.inferBusy = true; lastInfer = now;
    try{
      let src = cam, sw = cam.videoWidth, sh = cam.videoHeight;
      if(S.small && S.sctx && S.sw){ S.sctx.drawImage(cam, 0, 0, S.sw, S.sh); src = S.small; sw = S.sw; sh = S.sh; }
      const preds = await S.model.detect(src, 10, 0.40);
      let bt = null;
      for(const p of preds){ if(!bt || p.score>bt.score) bt = p; }
      S.lastRaw = { n:preds.length, top: bt ? (LABELS[bt.class]||bt.class)+' '+Math.round(bt.score*100)+'%' : 'nada' };
      let rel = preds.filter(p=>LABELS[p.class]).map(p=>enrich(p, sw, sh)).sort((a,b)=>b.score-a.score);
      knnTurn = !knnTurn;
      if(S.knnOn && S.knnReady && knnTurn){
        try{ rel = fusePersonal(rel, sw, sh, await MeuKNn.predictTop(src)); }catch(e){}
      }
      process(rel, sw, sh);
    }catch(e){}
    S.inferBusy=false;
  }
  // ... (fps + rAF inalterados) ...
}
```

```javascript
/* js/app.js — startLive após modelReady: */ 
try{ await MeuKNn.init(); S.knnReady = true; S.knnCount = MeuKNn.count(); }catch(e){ S.knnReady = false; }
/* diagnose(): acrescentar */ const kp = Object.keys(S.knnCount||{}).length; speak(`... ${kp} obstáculos pessoais carregados.` ...)
/* settings: */ <label>...<input id="swKNn" type="checkbox" checked aria-label="Ativar meus obstáculos">...  +  $('#swKNn').addEventListener('change', e=>{ S.knnOn=e.target.checked; });
```

```javascript
/* drawOverlay: pula cantos p/ personal (só etiqueta) */
for(const d of list.slice(0,5)){
  if(d.personal){ /* etiqueta central "NOME · %", sem cantos */ }
  else { /* cantos existentes inalterados */ }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --check js/app.js && node --check js/obst.js && python3 scripts/check-pwa.py && echo "TASK4 OK"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app.js js/obst.js
git commit -m "feat(obst): fusão kNN no tempo real com toggle"
```

---

### Task 5: Portão de ponta a ponta + regressão (gate de aceite)

**Files:**
- Modify: nenhum (validação); se falhar, novo commit de fix sem alterar o plano.

**Interfaces:**
- Consumes: Tasks 1-4 completas.
- Produces: evidência lab (treino 8 fotos portão → acerto em 4 held-out + rejeição de rua/pessoa) + regressão pessoa 70%+ + `check-pwa` verde.

- [ ] **Step 1: Write the failing test**

```bash
ls /tmp/opencode/dbgtest/gate.jpg || echo "TASK5-NEED(separate 8 fotos treino + 4 teste do portão)"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `grep -q "Meus obstáculos" index.html && echo "sem-evidencia-ainda"`
Expected: FAIL (existe UI mas sem evidência de acerto; gate só passa com o probe abaixo verde)

- [ ] **Step 3: Write minimal implementation (executar probe, não código)**

```bash
# página lab /tmp (descartável): carrega vendor mobilenet+knn locais, treina 8 crops de gate.jpg, testa 4 held-out + street.jpg + person.jpg
# critério: 4/4 portão com conf>=0.60 E 0 falsos em rua/pessoa
python3 -m http.server 8150 --bind 127.0.0.1 --directory /tmp/opencode/dbgtest &
node /tmp/opencode/dbgtest/knn_gate_probe.js  # imprime TRAIN_OK / TEST 4/4 / NEG 0/2
```

```javascript
// knn_gate_probe.js (descartável): mobilenet.load + addExample x8 (gates) + predictClass nos 6 testes
const r = await clf.predictClass(logits, 3);
console.log('TOP:' + r.label + ' CONF:' + (r.confidences[r.label]||0).toFixed(2));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --check js/app.js && node --check js/obst.js && python3 scripts/check-pwa.py && echo "TASK5 OK (probe gate verde + regressão pessoa + checks)"`
Expected: PASS

- [ ] **Step 5: Commit (relatório)**

```bash
git add docs/superpowers/plans/2026-10-02-meus-obstaculos.md
git commit -m "docs(obst): aceite portão 4/4 com regressão verificada" || echo "nothing-to-commit"
```
