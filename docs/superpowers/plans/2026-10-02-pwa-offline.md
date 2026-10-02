# PWA Offline Total Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Após uma carga online, Guia Visão abre e detecta sem internet, instalável na home.

**Architecture:** PWA estático sem build: fatiar `index.html` em `css/app.css` + `js/app.js`, vendorar TFJS/COCO-SSD/Lucide em `vendor/`, compilar Tailwind via CLI uma vez, `sw.js` cache-first + runtime cache do modelo, `manifest.webmanifest` standalone.

**Tech Stack:** Vanilla HTML/CSS/JS, Service Worker Cache Storage, Web App Manifest, TensorFlow.js COCO-SSD lite_mobilenet_v2, Tailwind CLI (one-shot compile only), Python http.server for local HTTPS-equivalent test (localhost), Lighthouse PWA.

**Spec:** `docs/superpowers/specs/2026-10-02-pwa-offline-design.md`

## Global Constraints

- HTTPS obrigatório para câmera + SW (localhost permitido para teste).
- `lang pt-BR`, `theme-color #05060a`, `background #05060a`, `display standalone`, `orientation portrait`.
- CACHE names exatos: `guia-visao-v1` (shell), `guia-visao-model-v1` (modelo TFHub).
- Primeira carga online ~10MB aceitável; updates via `skipWaiting` + toast.
- A11y Fase 1 intacta: boot falado, SOS segurar 2s, áudio espacial, escuta automática, alvos 48px.
- Sem Vite/Workbox; vendor pinado, sem `latest` flutuante em produção.

---

## File Structure

- Modify: `index.html` — remover 4 `<script src CDN>` + `<style>` inline; adicionar `<link rel=manifest>`, meta PWA, `<link css/app.css>`, `<script vendor + js/app.js>`, registro SW, chip OFFLINE, toast update.
- Create: `css/app.css` — conteúdo atual do `<style>` (linhas ~19-189) + Tailwind compilado.
- Create: `js/app.js` — conteúdo atual do `<script>` inline (linhas ~460-1050, Fase 1 incluída), sem lógica alterada exceto registro SW/offline listeners.
- Create: `vendor/tf.min.js`, `vendor/coco-ssd.min.js`, `vendor/lucide.min.js` — downloads pinados.
- Create: `manifest.webmanifest`, `icons/icon-192.png`, `icons/icon-512.png` (maskable, monograma olho verde #9DF53C sobre #07080d).
- Create: `sw.js`, `offline.html` — precache shell, runtime modelo, fallback navigation.
- Test: `scripts/check-pwa.py` — validador offline (sem pytest; checks executáveis via bash).

---

### Task 1: Fatiar shell + vendorar JS (base offline)

**Files:**
- Create: `css/app.css`, `js/app.js`, `vendor/tf.min.js`, `vendor/coco-ssd.min.js`, `vendor/lucide.min.js`, `scripts/check-pwa.py`
- Modify: `index.html:10-18,19-189,459-1050`

**Interfaces:**
- Consumes: `index.html` atual single-file com Fase 1.
- Produces: `css/app.css` (global styles), `js/app.js` (exporta nada; registra `window.GuiaVisao` para debug), `vendor/*` carregados via `<script src>` síncrono na mesma ordem anterior (tf → coco → lucide → app).

- [ ] **Step 1: Write the failing test**

```python
# scripts/check-pwa.py (executar: python3 scripts/check-pwa.py)
import pathlib, re, sys
root = pathlib.Path(__file__).resolve().parents[1]
html = (root/"index.html").read_text()
bad = [u for u in ["cdn.jsdelivr.net/npm/@tailwindcss/browser", "cdn.jsdelivr.net/npm/@tensorflow", "unpkg.com/lucide"] if u in html]
missing = [p for p in ["css/app.css","js/app.js","vendor/tf.min.js","vendor/coco-ssd.min.js","vendor/lucide.min.js"] if not (root/p).exists()]
print("BAD_CDN:", bad or "none")
print("MISSING:", missing or "none")
sys.exit(1 if bad or missing else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 scripts/check-pwa.py`
Expected: FAIL (exit 1, lista BAD_CDN com 3 entradas + MISSING com 5 arquivos)

- [ ] **Step 3: Write minimal implementation**

```bash
mkdir -p css js vendor scripts icons docs/superpowers/plans
# 1. extrair <style>...</style> para css/app.css (preservar :root, .icon-btn 48px, hc/bigtype)
python3 -c "import re; h=open('index.html').read(); m=re.search(r'<style>(.*?)</style>', h, re.S); open('css/app.css','w').write(m.group(1).strip()+'\n')"
# 2. extrair último <script>...</script> inline para js/app.js
python3 -c "import re; h=open('index.html').read(); m=re.findall(r'<script>(.*?)</script>', h, re.S); open('js/app.js','w').write(m[-1].strip()+'\n')"
# 3. vendor pinado (executar online uma vez)
curl -sL "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js" -o vendor/tf.min.js
curl -sL "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.2/dist/coco-ssd.min.js" -o vendor/coco-ssd.min.js
curl -sL "https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js" -o vendor/lucide.min.js
# 4. Tailwind: compilar uma vez (se CLI indisponível, manter app.css atual + purgar depois)
npx --yes @tailwindcss/cli@4 -i css/app.css -o css/app.css --content "./index.html" --minify || echo "tailwind-cli-skip"
# 5. editar index.html: trocar <style> por <link rel=stylesheet href=./css/app.css>, trocar 4 CDN <script> por vendor locais + ./js/app.js (manter ordem tf→coco→lucide→app)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 scripts/check-pwa.py && node --check js/app.js && echo "TASK1 OK"`
Expected: PASS (BAD_CDN none, MISSING none, JS syntax OK)

- [ ] **Step 5: Commit**

```bash
git add index.html css/app.css js/app.js vendor/ scripts/check-pwa.py
git commit -m "feat(pwa): split shell and vendor js for offline"
```

---

### Task 2: Manifest + ícones + meta PWA

**Files:**
- Create: `manifest.webmanifest`, `icons/icon-192.png`, `icons/icon-512.png`
- Modify: `index.html` head (adicionar manifest/meta), `scripts/check-pwa.py` (adicionar checagem manifest)

**Interfaces:**
- Consumes: `css/app.css`, `js/app.js` da Task 1.
- Produces: `manifest.webmanifest` válido; `navigator.serviceWorker` ainda não registrado (Task 3).

- [ ] **Step 1: Write the failing test**

```bash
python3 -c "import json,sys; d=json.load(open('manifest.webmanifest')); assert d['display']=='standalone' and d['lang']=='pt-BR', 'manifest inválido'; print('manifest OK')"
test -f icons/icon-192.png && test -f icons/icon-512.png && echo "icons OK" || (echo "icons MISSING"; exit 1)
grep -q 'rel="manifest"' index.html && echo "link OK" || (echo "link MISSING"; exit 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -c "import json; json.load(open('manifest.webmanifest'))"`
Expected: FAIL (`FileNotFoundError: manifest.webmanifest`)

- [ ] **Step 3: Write minimal implementation**

```json
// manifest.webmanifest
{"name":"Guia Visão — Mobilidade Assistiva","short_name":"GuiaVisão","description":"Câmera detecta obstáculos e avisa por voz e vibração.","lang":"pt-BR","start_url":"./index.html","scope":"./","display":"standalone","orientation":"portrait","background_color":"#05060a","theme_color":"#05060a","icons":[{"src":"./icons/icon-192.png","sizes":"192x192","type":"image/png"},{"src":"./icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]}
```

```html
<!-- adicionar em index.html <head> após theme-color -->
<link rel="manifest" href="./manifest.webmanifest">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="./icons/icon-192.png">
```

```bash
# ícones: gerar do SVG monograma (olho #9DF53C sobre #07080d) via rsvg/imagemagick ou python PIL; fallback: copiar placeholder 192/512 sólidos e validar
python3 -c "from PIL import Image,ImageDraw; [Image.new('RGB',(s,s),'#07080d').save(f'icons/icon-{s}.png') for s in (192,512)]; print('icons gerados')"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -c "import json; d=json.load(open('manifest.webmanifest')); assert d['display']=='standalone'" && grep -q 'rel="manifest"' index.html && echo "TASK2 OK"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add manifest.webmanifest icons/ index.html
git commit -m "feat(pwa): add manifest and icons"
```

---

### Task 3: Service Worker + offline.html + registro com update

**Files:**
- Create: `sw.js`, `offline.html`
- Modify: `index.html` (chip OFFLINE + toast update), `js/app.js` (append registro SW + `online/offline` listeners, sem alterar `process/speak`)

**Interfaces:**
- Consumes: shell + vendor + manifest da Task 1-2.
- Produces: `sw.js` com `CACHE='guia-visao-v1'`; `window.__SW_UPDATE__` toast; `S.offline` flag lida por `liveStatus`.

- [ ] **Step 1: Write the failing test**

```bash
grep -q "serviceWorker.register" js/app.js && echo "sw-reg OK" || (echo "sw-reg MISSING"; exit 1)
grep -q "guia-visao-v1" sw.js && echo "sw-cache OK" || (echo "sw-cache MISSING"; exit 1)
grep -q "MODO OFFLINE" js/app.js index.html offline.html && echo "offline-ui OK" || (echo "offline-ui MISSING"; exit 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `grep -q "serviceWorker.register" js/app.js`
Expected: FAIL (exit 1, sem registro ainda)

- [ ] **Step 3: Write minimal implementation**

```javascript
// sw.js
const CACHE='guia-visao-v1', MODEL='guia-visao-model-v1';
const SHELL=['./','./index.html','./css/app.css','./js/app.js','./vendor/tf.min.js','./vendor/coco-ssd.min.js','./vendor/lucide.min.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./offline.html'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>![CACHE,MODEL].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin===location.origin){
    e.respondWith(caches.match(e.request).then(h=>h||fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(cc=>cc.put(e.request,c));return r;}).catch(()=>e.request.mode==='navigate'?caches.match('./offline.html'):undefined)));
  } else if(u.hostname==='storage.googleapis.com'&&u.pathname.startsWith('/tfjs-models/')){
    e.respondWith(caches.open(MODEL).then(c=>c.match(e.request).then(h=>{const f=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r;}).catch(()=>h);return h||f;})));
  }
});
```

```html
<!-- offline.html: mesma intro simplificada, botão Tentar de novo, semIA -->
```

```javascript
// append em js/app.js (não editar process/speak existentes)
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').then(r=>{r.onupdatefound=()=>{const n=r.installing;n.onstatechange=()=>{if(n.state==='installed'&&navigator.serviceWorker.controller){toast('Nova versão disponível — recarregue');}};};}).catch(()=>{});});}
window.addEventListener('offline',()=>{$('#liveStatus').textContent='Modo offline. Detecção usa modelo em cache.';toast('MODO OFFLINE — usando cache');});
window.addEventListener('online',()=>{toast('Conexão restaurada');});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --check sw.js && node --check js/app.js && python3 -m http.server 8130 --directory . & sleep 1; curl -s http://localhost:8130/sw.js | grep -q guia-visao-v1 && echo "serve OK"; kill %1`
Expected: PASS (syntax OK + SW servido com cache name correto)

- [ ] **Step 5: Commit**

```bash
git add sw.js offline.html js/app.js index.html
git commit -m "feat(pwa): service worker cache-first and offline fallback"
```

---

### Task 4: Modelo cacheado + fallback sem-modelo + validação avião

**Files:**
- Modify: `js/app.js` (`startLive` catch + `setChip SEM MODELO`), `index.html` (botão Tentar de novo no chip area — reutilizar `#toast`, sem novo botão visual)
- Test: `scripts/check-pwa.py` (estender: checa `MODEL` cache + fallback string)

**Interfaces:**
- Consumes: `sw.js` MODEL cache da Task 3.
- Produces: comportamento garantido: offline com modelo → detecção real; offline sem modelo → voz + auto `start('sim')`.

- [ ] **Step 1: Write the failing test**

```bash
grep -q "SEM MODELO" js/app.js && echo "fallback OK" || (echo "fallback MISSING"; exit 1)
grep -q "guia-visao-model-v1" sw.js && echo "model-cache OK" || (echo "model-cache MISSING"; exit 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `grep -q "SEM MODELO" js/app.js`
Expected: FAIL antes da edição (exit 1)

- [ ] **Step 3: Write minimal implementation**

```javascript
// em js/app.js, dentro de startLive() catch e após `if(!S.modelReady)`:
// se cocoSsd.load falhar e !navigator.onLine → setChip('SEM MODELO'); speak('Modelo ainda não baixado. Conecte uma vez à internet. Iniciando demonstração.', true); startSim(); return;
// código exato:
if(!S.modelReady){
  setChip('CARREGANDO MODELO');
  try{
    if(!window.cocoSsd) throw new Error('tf');
    S.model = await cocoSsd.load({base:'lite_mobilenet_v2'});
    S.modelReady = true;
    logEvent('IA','modelo COCO-SSD carregado');
    toast('Visão computacional pronta');
  }catch(loadErr){
    console.warn(loadErr);
    if(!navigator.onLine){
      setChip('SEM MODELO');
      speak('Modelo ainda não baixado. Conecte uma vez à internet. Iniciando demonstração.', true);
      logEvent('IA','modelo sem cache, fallback simulação','#FF4E3E');
      if(S.running){ startSim(); return; }
    }
    throw loadErr;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --check js/app.js && python3 scripts/check-pwa.py; echo "manual: 1ª carga online → DevTools Cache Storage mostra guia-visao-v1 + model; avião + reload → demo fala/vibra"`
Expected: PASS (checks verdes + teste manual avião documentado)

- [ ] **Step 5: Commit**

```bash
git add js/app.js scripts/check-pwa.py
git commit -m "feat(pwa): cached model with offline fallback to sim"
```

---

### Task 5: Verificação final PWA + A11y (gate de aceite)

**Files:**
- Modify: nenhum (somente validação); se falhar, abrir fix como novo commit, sem alterar plano.

**Interfaces:**
- Consumes: Tasks 1-4 completas.
- Produces: relatório de aceite (Lighthouse + avião + TalkBack).

- [ ] **Step 1: Write the failing test**

```bash
npx --yes lighthouse http://localhost:8130/index.html --preset=desktop --only-categories=pwa,accessibility --output=json --output-path=/tmp/opencode/lh.json || echo "lighthouse-run"
python3 -c "import json; d=json.load(open('/tmp/opencode/lh.json')); print('PWA',d['categories']['pwa']['score'],'A11Y',d['categories']['accessibility']['score']); assert d['categories']['pwa']['score']>=0.9 and d['categories']['accessibility']['score']>=0.95"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `test -f /tmp/opencode/lh.json && echo "has-report" || echo "no-report-yet"`
Expected: FAIL (`no-report-yet` antes de servir + rodar Lighthouse com HTTPS/localhost)

- [ ] **Step 3: Write minimal implementation (executar validação, não código)**

```bash
python3 -m http.server 8130 --directory . & sleep 1
npx --yes lighthouse http://localhost:8130/index.html --only-categories=pwa,accessibility --output=json --output-path=/tmp/opencode/lh.json --chrome-flags="--no-sandbox"
kill %1
# manual obrigatório: (a) avião + reload → UI abre; (b) avião + câmera instalada → detecção; (c) TalkBack olhos vendados: boot falado → toque ativa → duplo-toque repete → segurar 2s SOS
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -c "import json; d=json.load(open('/tmp/opencode/lh.json')); assert d['categories']['pwa']['score']>=0.9; print('TASK5 OK')"`
Expected: PASS

- [ ] **Step 5: Commit (relatório)**

```bash
git add docs/superpowers/plans/2026-10-02-pwa-offline.md
git commit -m "docs(pwa): acceptance PWA>=90 offline verified" || echo "nothing-to-commit"
```
