# Migração para Vue 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o Guia Visão de SPA estático (sem build) para Vue 3 + Vite, preservando layout, falas, workarounds e os 58 testes.

**Architecture:** Três camadas — `src/engine` (lógica pura, testável em node:test), `src/core` (orquestração + efeitos do navegador, sem Vue), `src/components` (SFCs que consomem um único `reactive(state)`). O controller recebe `state` (proxy ou objeto simples) + `refs` (video/canvas/raiz), escrevendo apenas em `state`; a pintura de DOM passa a ser template. Vendors continuam globais via `<script>` em `index.html`. `sw.js` hand-written, com precache gerado no build.

**Tech Stack:** Vue 3.5, Vite 8, @vitejs/plugin-vue, @tailwindcss/vite, Tailwind v4, node:test, @vue/compiler-sfc (verificação de SFCs).

**Spec:** `docs/superpowers/specs/2026-10-30-migracao-vue-design.md`

## Global Constraints

- Layout 1:1: mesmas classes Tailwind e hierarquia do `index.html` atual; nenhuma mudança de cor/typografia/espaçamento.
- Falas, vibrações, confirmações, SOS, lanterna, kNN e nuvem: idênticos (extração literal, não reescrita).
- Vendors globais (`vendor/*.js`) carregados via `<script>` em `index.html`; não reempacotar TF.js.
- Lucide global com `data-lucide`; `lucide.createIcons()` pós-mount e após listas dinâmicas.
- Runner de teste continua `node --test`; sem vitest/jest.
- `sw.js` hand-written; regras de cache de `tfhub.dev`/`kaggle.com`/`storage.googleapis.com` intocadas.
- Sem Pinia/Vue Router/Vuex; um único `reactive(state)` em `src/state/store.js`.
- CSS custom em `src/styles/main.css` (migrado de `css/input.css`); `css/app.css` gerado sai do repo.
- Deploy: custom domain/root (Vite `base: '/'`, SW scope raiz).
- Pesos do modelo: runtime fetch + cache (como hoje).
- Verificação visual: manual no navegador.
- `window.GuiaVisao` debug handle mantido em dev e prod.

## Review Focus

1. **TTS × microfone no Android**: a pausa/retomada do mic durante a fala não pode regredir — a ordem `pauseMic()` antes de `speak()` e o watchdog de 8s precisam sobreviver à extração.
2. **Offline/PWA**: o app + os pesos do modelo precisam continuar em cache após o build (assets hasheados + `SHELL` fixo + regras de modelo).
3. **Câmera sem frames / track encerrado**: `Safety.cameraHealth` + `onCameraLost` precisam parar a detecção em vez de continuar "detectando".
4. **Comandos críticos sem palavra de ativação**: parar/iniciar/socorro exigem confirmação (`voiceDecision`).
5. **"Detecção ativa" só após o primeiro frame válido**: não anunciar antes de `S.lastFrameTs`.

---

### Task 1: Fundação Vite + Vue (layout estático)

**Files:**
- Create: `package.json` (atualizar), `vite.config.js`, `index.html`, `src/main.js`, `src/App.vue`, `src/styles/main.css`, `public/` (mover vendor, icons, manifest, offline, sw)
- Remove: `css/input.css`, `css/app.css` (gerado)

**Interfaces:**
- Produces: build `npm run dev` / `npm run build` / `npm run preview` funcionando; `App.vue` renderiza o layout atual 1:1 sem lógica.

- [ ] **Step 1: Instalar dependências**

Run: `npm install vue@^3.5 vite@^8 @vitejs/plugin-vue@^6 @tailwindcss/vite@^4`
Expected: `package.json` atualizado e `node_modules` populado.

- [ ] **Step 2: Atualizar scripts do `package.json`**

`dev`: `vite`, `build`: `vite build`, `preview`: `vite preview`, `test`: `node --test`, `check:pwa`: `python3 scripts/check-pwa.py`.

- [ ] **Step 3: Criar `vite.config.js`**

Plugins: `vue()`, `tailwindcss()` (do `@tailwindcss/vite`). `base: '/'`. `publicDir: 'public'`. Plugin de precache do SW (injeta `self.__PRECACHE_MANIFEST` em `dist/sw.js` no build).

- [ ] **Step 4: Mover assets estáticos para `public/`**

Mover `vendor/`, `icons/`, `manifest.webmanifest`, `offline.html`, `sw.js` para `public/` (mesmos paths relativos). `sw.js` adaptado para ler `self.__PRECACHE_MANIFEST` quando disponível.

- [ ] **Step 5: Migrar CSS**

`css/input.css` → `src/styles/main.css` (conteúdo idêntico). Remover `css/` (o `app.css` gerado). `index.html` importa `src/styles/main.css` via `<link>`/import no `main.js`.

- [ ] **Step 6: Criar `index.html` entry do Vite**

Meta, manifest, fonts, `<script src="/vendor/...">` globals, `<div id="app">`, import de `src/main.js`. Markup do body **idêntico** ao atual (copiar).

- [ ] **Step 7: Criar `src/main.js` + `src/App.vue` com layout estático**

`App.vue` contém o markup do `index.html` atual (stage, painéis, device, sheets, intro, toast) sem bindings — strings literais nos textos dinâmicos por enquanto (placeholder `PRONTO`, `Detecção pausada`, etc.).

- [ ] **Step 8: Verificar build e visual**

Run: `npm run build && npm run preview`
Expected: build verde, layout idêntico ao original (conferência manual).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(vue): fundação Vite + Vue com layout estático"
```

---

### Task 2: Engine pura (`src/engine`)

**Files:**
- Create: `src/engine/labels.js`, `src/engine/safety.js`, `src/engine/vigia.js`, `src/engine/risk.js`, `src/engine/commands.js`
- Modify: `tests/safety.test.js`, `tests/vigia.test.js`, `tests/fala.test.js`, `tests/obst.test.js` (imports ESM)

**Interfaces:**
- Consumes: nada novo.
- Produces: `LABELS`, `RISK_BIAS`, `TALL`, `TYPES_SIM`, `enrich(pred, sw, sh)`, `phrase(d)`, `Safety`, `Vigia`, `vigiaNorm`, `falaTem`, `kindOf`, `voiceDecision`.

- [ ] **Step 1: Mover `js/safety.js` → `src/engine/safety.js` (ESM export)**

Adicionar `export` ao IIFE (`export const Safety = ...` ou `export default`). Comportamento idêntico.

- [ ] **Step 2: Mover `js/vigia.js` → `src/engine/vigia.js`**

Exportar `Vigia`, `vigiaNorm`, `falaTem`. `Vigia.init(labels)` mantido.

- [ ] **Step 3: Criar `src/engine/labels.js`**

Extrair `LABELS`, `RISK_BIAS`, `TALL`, `TYPES_SIM` de `js/app.js` (linhas 36-58) como exports.

- [ ] **Step 4: Criar `src/engine/risk.js`**

Exportar `enrich(pred, sw, sh)` e `phrase(d)` (linhas 297-315 do app.js), importando `LABELS`, `RISK_BIAS`, `TALL`, `Vigia`.

- [ ] **Step 5: Criar `src/engine/commands.js`**

Exportar `falaTem`, `kindOf`, `voiceDecision` (reusando Safety). `kindOf`/`voiceDecision` já estão em `safety.js`; `commands.js` re-exporta e adiciona `falaTem` (de vigia.js).

- [ ] **Step 6: Atualizar testes para ESM**

`tests/*.test.js`: substituir `vm.runInContext` por `import`. Rodar `node --test` → 58 passam.

- [ ] **Step 7: Commit**

```bash
git add src/engine tests && git commit -m "feat(vue): engine pura (safety, vigia, risk, commands)"
```

---

### Task 3: Core — speech, vision, obstacles, cloud, prefs, pwa

**Files:**
- Create: `src/core/speech.js`, `src/core/vision.js`, `src/core/obstacles.js`, `src/core/cloud.js`, `src/core/prefs.js`, `src/core/pwa.js`
- Move: `js/obst.js` → `src/core/obstacles.js`, `js/cloud.js` → `src/core/cloud.js`

**Interfaces:**
- Consumes: `src/engine/*`.
- Produces: `createSpeech(state)`, `createVision(state, refs)`, `ObstDB`, `MeuKNn`, `startTraining`, `fusePersonal`, `CloudVision`, `readPrefs`/`savePrefs`, `registerSW`.

- [ ] **Step 1: Extrair `src/core/speech.js`**

Mover as funções de TTS (`speak`, `speakNow`, `finishSpeak`, `pauseMic`, `resumeMic`, `pickVoice`, `getVoicesSafe`, `escolherVoz`, `esperarVozes`, watchdog) de `js/app.js` (linhas 99-260) para um factory `createSpeech(state)` que retorna `{ speak, speakNow, vibrate? no }`. **Extração literal** — preservar a ordem `pauseMic()` → `speak`, o watchdog de 8s e o retry em `synthesis-failed`. Estado TTS (`ttsBusy`, `ttsQueue`, `micPaused`, `speakSeq`, `micStop`, `voice`) fica encapsulado no factory, mas escreve `state.voiceCount`/`state.ttsErr` no state compartilhado.

- [ ] **Step 2: Extrair `src/core/vision.js`**

Mover câmera (`startLive`, `loopLive`, `onCameraLost`), modelo (`ensureModel`), simulação (`startSim`, `simTick`, `spawnSim`, `simScene`, `simPict`), overlay (`drawOverlay`, `coverTransform`, `roundRect`), e `processFrame` para `createVision(state, refs, speech)`.

`processFrame` escreve em `state` (alert, risk, chip, stats, telemetry via `logEvent`) em vez de `$('#...')`. O `logEvent` do app vira função em `vision.js` que faz `state.telemetry.unshift(...)` (limitando a 40).

- [ ] **Step 3: Mover `js/obst.js` → `src/core/obstacles.js` (ESM)**

Exportar `ObstDB`, `MeuKNn`, `startTraining`, `fusePersonal`, `PRESETS`, `renderMyObst` (UI da lista de obstáculos passa a ser feita em `ObstaclesSheet.vue`, mas a lógica de renderização de dados fica em `renderMyObst` adaptada para retornar dados). `startTraining` usa `speak` global — passar `speech.speak` como parâmetro.

- [ ] **Step 4: Mover `js/cloud.js` → `src/core/cloud.js` (ESM)**

Exportar `CloudVision`. Sem mudanças de comportamento.

- [ ] **Step 5: Criar `src/core/prefs.js`**

`readPrefs()`/`savePrefs()` (linhas 1102-1117), lendo/escrevendo `localStorage` e aplicando em `state.prefs` + `document.body` classes.

- [ ] **Step 6: Criar `src/core/pwa.js`**

Registro do service worker + `setOfflineUI`. Sem mudanças.

- [ ] **Step 7: Commit**

```bash
git add src/core && git commit -m "feat(vue): core (speech, vision, obstacles, cloud, prefs, pwa)"
```

---

### Task 4: Controller (`src/core/controller.js`)

**Files:**
- Create: `src/core/controller.js`, `src/state/store.js`

**Interfaces:**
- Consumes: `src/engine/*`, `src/core/*`.
- Produces: `createController({ state, refs })` retornando `{ start, stopAll, describe, handleCommand, triggerSOS, setListening, setTorch, setRate, openSheet, closeSheets, renderMyObst, ... }` + `window.GuiaVisao`.

- [ ] **Step 1: Criar `src/state/store.js`**

`export function createStore()` retorna `{ state: reactive({...}) }` (Vue) ou, em teste, `{ state: {...} }` (objeto simples). O controller não distingue.

- [ ] **Step 2: Criar `src/core/controller.js`**

Mover a orquestração restante de `js/app.js`: `start`, `stopAll`, `triggerSOS`, `hideIntro`/`showIntro`, `announceReady`, `onCameraLost`, `setTorch`, `setListening`, `handleCommand`, `executeCommand`, `handleVigia`, `describe`, `diagnose`, `repeatAlert`, `unlockAudio`, bindings de eventos (teclado, visibilitychange, SOS hold 2s). Toda escrita de DOM vira escrita em `state`; `refs` usados só para canvas/video/focus.

- [ ] **Step 3: Migrar `tests/app.test.js` → `tests/controller.test.js`**

Mesmos 14 cenários, mas montando `createController({ state, refs })` com `refs` falsos. Asserções passam de `el('alertTitle').textContent` para `state.alert.title`. Falas/vibrações continuam capturadas via mocks de `speechSynthesis`/`navigator.vibrate`. Rodar → 14 passam.

- [ ] **Step 4: Commit**

```bash
git add src/core/controller.js src/state tests/controller.test.js && git commit -m "feat(vue): controller + testes migrados"
```

---

### Task 5: Componentes SFC (`src/components`)

**Files:**
- Create: 13 SFCs listados na seção 6.2 do spec.

**Interfaces:**
- Consumes: `src/state/store.js`, `src/core/controller.js`.
- Produces: `App.vue` compõe todos; cada SFC lê `state` e chama ações do controller via `provide`/`inject` ou props.

- [ ] **Step 1: `LiveRegions.vue` + `StatusChips.vue` + `HudLayer.vue`**

Markup 1:1 dos elementos correspondentes. Bindings em `state.chip`, `state.risk`.

- [ ] **Step 2: `CameraLayer.vue`**

`<video ref="video">`, `<canvas ref="overlay">`, `<canvas ref="scene">`. Expõe refs para o controller via `defineExpose`.

- [ ] **Step 3: `AlertCard.vue` + `ControlBar.vue`**

AlertCard: `state.alert.*`. ControlBar: botão principal com hold 2s = SOS (lógica no controller via `@pointerdown`), `state.main`, `state.torchOn`, `state.listening`.

- [ ] **Step 4: `IntroOverlay.vue`**

`state.introVisible`, `state.idleVisible`.

- [ ] **Step 5: `SettingsSheet.vue` + `HelpSheet.vue` + `ObstaclesSheet.vue`**

Sheets abrem via `state.sheet === '...'`. Switches/sliders bound a `state.prefs`. `ObstaclesSheet` chama `renderMyObst()` e treino.

- [ ] **Step 6: `ShowcasePanel.vue` + `TelemetryPanel.vue` + `DeviceFrame.vue`**

Painéis laterais (desktop). `TelemetryPanel` renderiza `state.telemetry` com `v-for`, `state.stats`.

- [ ] **Step 7: Wiring em `App.vue`**

Compõe todos os componentes, passa `refs` para o controller no `onMounted`, chama `lucide.createIcons()`.

- [ ] **Step 8: `createIcons` pós-render**

`nextTick(() => lucide.createIcons())` após montagem e após mudanças em `state.myObstacles.list`.

- [ ] **Step 9: Commit**

```bash
git add src/components src/App.vue && git commit -m "feat(vue): componentes SFC com layout 1:1"
```

---

### Task 6: PWA + service worker

**Files:**
- Modify: `public/sw.js`, `scripts/check-pwa.py`, `tests/sw.test.js`, `testar.sh`

- [ ] **Step 1: Adaptar `public/sw.js`**

`SHELL` fixo (vendor, ícones, manifest, offline, index). Precache de assets hasheados via `self.__PRECACHE_MANIFEST` (injetado pelo plugin Vite). Reusar regras de modelo (`tfhub.dev`/`kaggle.com`/`storage.googleapis.com`) e fonts.

- [ ] **Step 2: Plugin Vite de precache**

No `vite.config.js`, após build, reescrever `dist/sw.js` substituindo `self.__PRECACHE_MANIFEST` pela lista real de arquivos em `dist/`.

- [ ] **Step 3: Atualizar `scripts/check-pwa.py`**

REQUIRED passa a incluir `public/...` paths; checagem de precache verifica `public/` + manifesto gerado.

- [ ] **Step 4: Atualizar `testar.sh`**

Usar `npm run dev` (Vite em 8130) no lugar de `http.server`; manter instruções do túnel cloudflared.

- [ ] **Step 5: Atualizar `tests/sw.test.js` e `tests/markup.test.js`**

Markup tests passam a ler os `.vue`. SW test verifica novo shell.

- [ ] **Step 6: Adicionar `tests/sfc.test.js`**

Compila cada `.vue` com `@vue/compiler-sfc` → pega erro de sintaxe de template.

- [ ] **Step 7: Commit**

```bash
git add public/sw.js scripts/check-pwa.py tests testar.sh vite.config.js && git commit -m "feat(vue): PWA + precache + testes atualizados"
```

---

### Task 7: Verificação final

- [ ] **Step 1: Rodar testes**

Run: `npm test`
Expected: todos passam (58+).

- [ ] **Step 2: Build + preview**

Run: `npm run build && npm run preview`
Expected: build verde, app funcional no navegador.

- [ ] **Step 3: check-pwa**

Run: `npm run check:pwa`
Expected: BAD_CDN none, MISSING none, MANIFEST OK, MODEL-CACHE OK, FALLBACK OK, PRECACHE OK, KNN-WEIGHTS-HOST OK.

- [ ] **Step 4: Smoke manual**

Intro → ativar câmera → detecção → alerta de voz → sheets (ajustes, ajuda, obstáculos) → offline (desligar rede, recarregar).

- [ ] **Step 5: Commit final**

```bash
git add -A && git commit -m "chore(vue): migração concluída"
```

---

## Self-Review

1. **Spec coverage:** todas as seções do spec (1-11) mapeadas para tasks 1-7. ✓
2. **Step scan:** cada step tem comando/expected ou assinatura exata. ✓
3. **Type consistency:** `state.*` paths consistentes entre tasks (seção 6.5 do spec). ✓
4. **Review Focus:** 5 itens cobertos — TTS/mic (Task 3), offline (Task 6), câmera (Task 4), comandos (Task 4), detecção ativa (Task 4). ✓
5. **Proportion:** plano ~250 linhas para spec ~200 — razoável. ✓
