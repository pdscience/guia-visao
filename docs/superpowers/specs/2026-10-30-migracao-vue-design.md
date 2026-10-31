# Migração para Vue 3 — Guia Visão

**Data:** 2026-10-30
**Status:** aguardando aprovação
**Contexto:** o repositório tem o layout e a lógica prontos; o pedido é migrar para **Vue 3 puro** aproveitando ao máximo o layout já existente.

---

## 1. Intenção e porquê

O Guia Visão é um PWA assistivo (TCC 2026) que detecta obstáculos com a câmera do celular e avisa por voz, vibração e sonificação. Hoje ele é um SPA **estático, sem build**: `index.html` (Tailwind v4 compilado) + `js/app.js` (1250 linhas) + módulos auxiliares, com 58 testes em `node:test`.

A migração para Vue 3 tem dois objetivos:

1. **Ganhar uma base de código manutenível** — estado reativo, componentes com escopo claro, sem `document.querySelector` espalhado por 60 pontos do arquivo principal.
2. **Preservar tudo que já funciona** — layout, pixels, falas, workarounds de Android (TTS × microfone), PWA/offline, pesos de modelo em cache e os 58 testes.

O layout atual **não é redesenhado**. O markup do `index.html` é transplantado 1:1 para os SFCs, com as mesmas classes Tailwind. A migração é de *como* o app é escrito, não do que ele parece ou fala.

---

## 2. Estado atual (levantado)

| Área | Onde está | Observação |
|---|---|---|
| Layout | `index.html` (337 linhas) | Tailwind v4 + classes custom em `css/input.css` (171 linhas) → compilado em `css/app.css` (1969 linhas, versionado) |
| Motor | `js/app.js` (1250 linhas) | Monólito: estado global `S`, efeitos de navegador e pintura de DOM juntos |
| Lógica pura | `js/safety.js`, `js/vigia.js` | Sem DOM — já testáveis |
| IA/Obstáculos | `js/obst.js` (IDB + kNN), `js/cloud.js` (Gemini) | Globais, usam `speak()`/`beep()` do app |
| Vendor | `vendor/*.js` (1,8 MB) | TF.js, COCO-SSD, MobileNet, KNN, Lucide — carregados como `<script>` global |
| PWA | `sw.js`, `manifest.webmanifest`, `offline.html` | Precache do shell + cache dos pesos do modelo (tfhub/kaggle) |
| Testes | `tests/*.test.js` (58, todos passando) | `app.test.js` roda `js/app.js` num `vm` com DOM falso; `markup.test.js` faz asserções sobre o `index.html` |
| Dev | `testar.sh` | `python3 -m http.server 8130` + instruções de túnel cloudflared (câmera exige HTTPS) |

### O problema central

`js/app.js` mistura três camadas:

1. **Regra/segurança** — decisão de risco, fala, confirmação de comandos.
2. **Efeitos do navegador** — `getUserMedia`, `speechSynthesis`, `SpeechRecognition`, `navigator.vibrate`, `AudioContext`, IndexedDB, wake lock, service worker.
3. **Pintura de DOM** — ~60 escritas como `$('#alertTitle').textContent = ...`, `classList.toggle`, `style.outline`.

Em Vue, a camada 3 vira template. Se as três continuarem misturadas, o Vue e o app antigo passam a disputar o mesmo DOM, e os 58 testes (que dependem do app.js rodar sozinho) morrem. **A separação em camadas é requisito da migração, não preferência estética.**

---

## 3. Objetivos

- App em **Vue 3 (Composition API, `<script setup>`)** com Vite, sem frameworks extras (sem Nuxt, Quasar, Ionic, Vuetify, Pinia).
- Layout atual **preservado 1:1**: mesmas classes Tailwind, mesma hierarquia, mesmo comportamento de sheets, intro, HUD e painéis de desktop.
- **Zero regressão funcional**: falas, vibrações, confirmações, SOS, lanterna, kNN, nuvem, offline — idênticos.
- **Os 58 testes continuam passando** (mesmos cenários), e testes de SFC novos cobrem a camada Vue.
- Tailwind v4 continua como está, agora compilado pelo Vite.
- PWA continua instalável e funcional **offline** (app + pesos de modelo em cache).

## 4. Não-objetivos (anti-objetivos)

- **Não** redesenhar a interface, mudar cores, tipografia, espaçamentos ou a hierarquia do HUD.
- **Não** mudar nenhuma regra de segurança, texto falado ou comportamento do SOS — a migração é de arquitetura, não de produto.
- **Não** trocar os vendors globais por pacotes npm reempacotados (reempacotar TF.js quebra o cache offline dos pesos e aumenta o risco).
- **Não** introduzir Pinia, Vue Router, Vuex ou um runner de teste novo.
- **Não** mexer no `sw.js` na parte dos pesos do modelo (regras de cache de `tfhub.dev`/`kaggle.com`/`storage.googleapis.com`).
- **Não** mexer na paleta/ordem da lista `PRESETS` nem no catálogo `LABELS`.

---

## 5. Abordagens consideradas

| # | Abordagem | Prós | Contras | Veredito |
|---|---|---|---|---|
| 1 | **Vue 3 + Vite, motor fora do Vue** (`src/engine` puro + `src/core` controller + SFCs) | Layout reutilizado 1:1; 58 testes preservados; código manutenível; PWA mantido | Introduz build step (`npm run build`); `sw.js` precisa de manifesto de precache gerado | **Escolhida** |
| 2 | Vue 3 sem build (global build + templates em string JS) | `testar.sh`, `sw.js` e repo estático intactos | Markup vira string JS; perda de legibilidade; sem hot reload;、首 estilo "demo" | Descartada |
| 3 | Um único SFC monolítico | Migração mais rápida | Template gigante, sem componentização, acoplamento total Vue↔DOM | Descartada |

**Por que a 1:** é a única que entrega "Vue de verdade" sem jogar fora o que já está pronto — o layout vira componente, a lógica vira código testável fora do framework, e o app continua sendo um PWA offline. O custo é o build step, que é padrão para Vue e absorvido por `npm run dev/build/preview`.

---

## 6. Arquitetura alvo

### 6.1 Camadas

```
┌─────────────────────────────────────────────────────────┐
│ src/components/**.vue        PRESENTACAO                │
│ Lê state (reactive), chama ações do controller.         │
│ Não toca no DOM fora do próprio template.               │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│ src/state/store.js           PONTE REATIVA              │
│ reactive(state) + ações que delegam ao controller.      │
│ Controller recebe o PRÓPRIO proxy → writes disparam UI. │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│ src/core/controller.js       ORQUESTRACAO + EFEITOS      │
│ Câmera, TTS, mic, vibração, áudio, canvas, IDB, SW.     │
│ Sem DOM de render (só video/canvas/focus). Sem Vue.      │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│ src/engine/**.js             LOGICA PURA                │
│ Sem DOM, sem Vue, sem browser. Testável em node:test.   │
└─────────────────────────────────────────────────────────┘
```

**Regra de ouro:** a camada Vue é a **única** dona do DOM renderizado. Tudo que hoje é `$('#x').textContent = ...` vira `state.alert.title = ...`. As únicas exceções imperativas são: `<video>`, os dois `<canvas>`, `focus()` e as classes de corpo (`hc`, `bigtype`), que passam a ser estado + `:class` no Vue.

### 6.2 Estrutura de arquivos

```
Guia_visao/
├── index.html                  entry do Vite (meta, manifest, fonts, vendor <script>, #app)
├── vite.config.js              plugins vue + @tailwindcss/vite; plugin de precache do SW
├── package.json                scripts: dev / build / preview / test / check:pwa
├── css/input.css               (mantém o nome) fonte do Tailwind v4 → movido p/ src/styles/main.css
├── public/
│   ├── vendor/*.js             TF.js, COCO-SSD, MobileNet, KNN, Lucide (globals, via <script>)
│   ├── icons/, manifest.webmanifest, offline.html, sw.js
├── src/
│   ├── main.js                 createApp(App).mount('#app')
│   ├── App.vue                 stage + painel esquerdo + device + painel direito
│   ├── styles/main.css         conteúdo atual de css/input.css
│   ├── engine/                 PURE (sem DOM)
│   │   ├── labels.js           LABELS, RISK_BIAS, TALL, TYPES_SIM
│   │   ├── risk.js             enrich(), phrase()
│   │   ├── safety.js           (vem de js/safety.js, sem alteração de comportamento)
│   │   ├── vigia.js            (vem de js/vigia.js)
│   │   └── commands.js         matching de comandos de voz (falaTem, kindOf)
│   ├── core/                   EFEITOS (framework-free)
│   │   ├── controller.js       orquestra start/stop, loop de detecção, sheets, eventos
│   │   ├── speech.js           TTS + pausa/retomada do mic + watchdog (extraído do app.js)
│   │   ├── vision.js           câmera, modelo COCO, loop rAF, overlay canvas, simulação
│   │   ├── obstacles.js        IndexedDB + kNN + treino (vem de js/obst.js)
│   │   ├── cloud.js            (vem de js/cloud.js)
│   │   ├── prefs.js            leitura/escrita de preferências
│   │   └── pwa.js              registro do service worker + estado offline
│   ├── state/
│   │   └── store.js            reactive(state) + createController(state, refs)
│   └── components/
│       ├── ShowcasePanel.vue     painel esquerdo "Enxergue com o som"
│       ├── TelemetryPanel.vue    painel direito (telemetria ao vivo)
│       ├── DeviceFrame.vue       moldura do aparelho + header + slots do app
│       ├── CameraLayer.vue       video + canvas overlay + canvas de cena
│       ├── HudLayer.vue          cantos, scanbeam, riskglow, scanlines, fades
│       ├── StatusChips.vue       chip de status + chip offline
│       ├── AlertCard.vue         cartão de risco
│       ├── ControlBar.vue        botão principal (2s = SOS), voz, ajustes
│       ├── IntroOverlay.vue      tela de boas-vindas
│       ├── SettingsSheet.vue     ajustes de acessibilidade
│       ├── HelpSheet.vue         comandos de voz
│       ├── ObstaclesSheet.vue    meus obstáculos (kNN)
│       └── LiveRegions.vue       #liveAlert / #liveStatus (sr-only)
├── tests/                     continua node:test, sem runner novo
│   ├── safety.test.js  vigia.test.js  fala.test.js  obst.test.js
│   ├── controller.test.js   ← substitui app.test.js (mesmos 14 cenários)
│   ├── markup.test.js       ← passa a ler os .vue
│   ├── sfc.test.js          ← compila cada .vue (checa sintaxe de template)
│   └── sw.test.js           ← novo shell/precache
└── testar.sh              passa a usar `npm run dev` (vite) no lugar do http.server
```

**Removidos no fim:** `js/` (todo), `css/app.css` (gerado), `css/input.css` (movido), `offline.html`/`manifest`/`icons`/`vendor` da raiz (movidos para `public/`).

### 6.3 Contrato de estado

O `state` espelha 1:1 os ids do HTML atual, para que a migração do template seja mecânica:

```js
state = {
  mode: 'idle',            // idle | live | sim
  running: false,
  risk: 0,                 // 0..2
  chip: { status: 'PRONTO', fps: '-- FPS', offline: false },
  alert: { title: 'Detecção pausada', sub: 'SEM ANÁLISE', tag: 'PARADO',
           icon: 'ok',        // ok | warn | danger
           aria: 'Detecção pausada. Sem análise.', outline: '', dim: true },
  main: { pressed: false, label: 'INICIAR', stop: false },
  torchOn: false, listening: false,
  idleVisible: true,
  introVisible: true,
  sheet: null,             // null | 'settings' | 'help' | 'obst'
  toast: { text: '', show: false },
  stats: { det: 0, voice: 0, vib: 0, time: '00:00' },
  telemetry: [],           // [{ at, kind, msg, tone }]
  prefs: { tts, autoVoice, vib, son, knnOn, acc, sens, rate, hc, big, cloud, cloudKey },
  myObstacles: { list: [], count: 0, presets: [...], name: '', status: 'PRONTO PARA CADASTRAR', training: false },
}
```

`state` é `reactive()` no app e um objeto simples nos testes — o controller não sabe a diferença.

### 6.4 Injeção de dependências

O controller é criado assim:

```js
createController({ state, refs })   // refs = { video, overlay, scene, root }
```

- `state`: proxy reativo (Vue) ou objeto simples (teste).
- `refs`: elementos de canvas/video e a raiz do app — os únicos usos imperativos de DOM.

Os testes montam o controller com `refs` falsos e leem `state` + as falas/vibrações capturadas, exatamente como hoje, sem browser real.

### 6.5 Ponteiros de DOM → estado (mapa de migração)

| Hoje | Vira |
|---|---|
| `$('#chipStatus').textContent` | `state.chip.status` |
| `$('#chipFps').textContent` | `state.chip.fps` |
| `$('#chipOffline').classList.toggle('hidden')` | `state.chip.offline` |
| `$('#alertTitle'/'#alertSub'/'#riskTag').textContent` | `state.alert.title/sub/tag` |
| `#alertIconOk/Warn/Danger` `.hidden` | `state.alert.icon` (`'ok' \| 'warn' \| 'danger'`) |
| `$('#alertCard').style.outline` / `.opacity-70` | `state.alert.outline` / `state.alert.dim` |
| `$('#mainLabel').textContent` + `#btnMain.stop` | `state.main.label` / `state.main.stop` |
| `#btnTorch.on`, `#btnVoice.listening` | `state.torchOn`, `state.listening` |
| `#idleState.style.display` | `state.idleVisible` |
| `#intro.away` | `state.introVisible` |
| `.sheet.open` + `#backdrop.open` | `state.sheet` (`null`/id) |
| `#toast` text + `.show` | `state.toast.text/show` |
| `#statDet/Voice/Vib/Time` | `state.stats.*` |
| `#telemetry` (prepend `<li>`) | `state.telemetry[]` (array, renderiza com `v-for`) |
| `app.classList.toggle('running'/'danger-pulse')` | `:class` em `DeviceFrame.vue` |
| `body.classList.toggle('hc'/'bigtype')` | `state.prefs.hc/big` + `:class` no `<body>` |
| `lucide.createIcons()` | `onMounted` + após listas dinâmicas (`ObstaclesSheet`) |

### 6.6 Lucide

Continua global (`vendor/lucide.min.js` + `lucide.createIcons()`), preservando o markup `<i data-lucide="...">` **exatamente como está** — é o que maximiza a reaproveitamento do layout. `createIcons()` roda no `onMounted` do `App.vue` e após cada render dinâmico da lista de obstáculos.

### 6.7 Tailwind v4

- `css/input.css` → `src/styles/main.css`, com `@import "tailwindcss"` + `@source` explícitos para `index.html` e `src/`.
- Plugin `@tailwindcss/vite` compila no build/dev.
- `css/app.css` (1969 linhas geradas) sai do repositório — passa a ser artefato de build.

### 6.8 PWA e service worker

O `sw.js` continua **hand-written** (não `vite-plugin-pwa`), porque as regras de cache dos pesos do modelo são específicas e valem mais que a conveniência do Workbox.

Mudanças:

1. `sw.js`, `manifest.webmanifest`, `offline.html`, `icons/`, `vendor/` vão para `public/` (copiados para `dist/` na raiz, paths `./vendor/...` continuam válidos).
2. **Precache gerado no build**: um plugin Vite pequeno injeta em `dist/sw.js` a lista real de assets hasheados (`self.__PRECACHE_MANIFEST = [...]`). O `SHELL` fixo continua incluindo os arquivos de `public/` (vendor, ícones, manifest, offline).
3. `scripts/check-pwa.py` é atualizado para a nova estrutura (REQUIRED passa a incluir `public/...`; a checagem de precache passa a verificar `public/` + manifesto gerado).
4. `tests/sw.test.js` atualizado para o novo shell.

---

## 7. Migração dos testes

O runner **continua `node --test`** (sem vitest/jest): menos dependências, menos risco, e os testes de lógica pura quase não mudam.

| Teste atual | Destino | Mudança |
|---|---|---|
| `safety.test.js` | `tests/safety.test.js` | Importa `src/engine/safety.js` (ESM) em vez do `vm` sobre `js/safety.js` |
| `vigia.test.js` | idem | idem |
| `fala.test.js` | idem | idem |
| `obst.test.js` | idem | idem |
| `app.test.js` (14 cenários) | `tests/controller.test.js` | Harness monta `createController({ state, refs })` com `refs` falsos; asserções passam de `el('alertTitle').textContent` para `state.alert.title`; falas/vibrações continuam capturadas |
| `markup.test.js` (6) | `tests/markup.test.js` | Lê `src/components/*.vue` em vez de `index.html` (ex.: `id="btnSOS"` em `DeviceFrame.vue`, aviso de privacidade em `HelpSheet.vue`) |
| `sw.test.js` | idem | Novo shell/precache |
| **novo** `tests/sfc.test.js` | — | Compila cada `.vue` com `@vue/compiler-sfc` → pega erro de sintaxe de template sem navegador |

**Critério de não-regressão:** os 14 cenários de `app.test.js` (câmera negada, "detecção ativa" só depois do 1º frame, estado pausado, describe parado, confirmação de comandos críticos, SOS, track encerrado, câmera sem frames, visibilitychange) migram 1:1, com os mesmos nomes e as mesmas asserções semânticas.

---

## 8. Fases (resumo — o plano detalhado vem do `writing-plans`)

1. **Fundação**: Vite + Vue + Tailwind plugin; `index.html` novo; `App.vue` com o layout atual estático (sem lógica); `npm run build` verde; layout idêntico.
2. **Engine**: mover `js/*.js` para `src/engine/` + `src/core/` como ESM, sem mudar comportamento; `state` como objeto simples; testes de lógica passa a importar os módulos.
3. **Controller**: extrair o `app.js` para `src/core/*`, trocando toda escrita de DOM por escrita em `state`; `tests/controller.test.js` verde.
4. **Componentes**: um SFC por região do layout, markup 1:1; ligar `state` ↔ template; `createIcons()` pós-mount.
5. **PWA**: `public/`, plugin de precache, `sw.js` novo, `check-pwa.py` e `sw.test.js` atualizados; `testar.sh` passa a `npm run dev`.
6. **Verificação**: `npm test` (58+ testes), `npm run build`, smoke manual no navegador (intro → câmera → detecção → sheets → offline).

---

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Regressão no interplay **TTS × microfone** (workarounds de Android) | O código de `speech.js` é extraído **literalmente**; os testes de `controller.test.js` reproduzem os cenários; comparação linha a linha durante a extração |
| Regressão no cache **offline**/pesos do modelo | `sw.js` hand-written preservado; regras de `tfhub.dev`/`kaggle.com` intocadas; `sw.test.js` + `check-pwa.py` |
| Ícones Lucide sumirem | `createIcons()` pós-mount e após listas dinâmicas; checagem visual no smoke |
| **Sheet/intro/foco** perderem comportamento (a11y) | `state.sheet`/`state.introVisible` + `tabindex`/`aria` preservados no markup; `focus()` continua no controller |
| Regressão silenciosa no pipeline de detecção | `enrich()`/`phrase()` vão para `src/engine/risk.js` **sem alteração de fórmula** |
| Escopo grande demais numa tacada só | Fases com build verde e testes verdes ao fim de cada uma |

---

## 10. Decisões do builder (minhas, para conference)

1. **Runner de teste continua `node --test`** — sem vitest; SFCs são verificados por compilação (`@vue/compiler-sfc`), não por montagem.
2. **Vendor continua global via `<script>`** em `index.html` — sem `vite-plugin`/reempacotamento de TF.js.
3. **Lucide continua global** com `data-lucide` — markup intocado.
4. **`sw.js` hand-written**, com precache gerado por plugin Vite próprio.
5. **Sem Pinia**: um único `reactive(state)` em `src/state/store.js`.
6. **CSS custom (`css/input.css`) migrado para `src/styles/main.css`**; `css/app.css` gerado sai do repo.
7. **`testar.sh` passa a `npm run dev`** (Vite em 8130) e mantém as instruções do túnel cloudflared; `npm run preview` para testar o PWA construído.

## 11. Pontos abertos (dependem do humano)

1. **Repositório remoto/deploy**: com Vite, o artefato passa a ser `dist/`. Onde o app é publicado hoje (GitHub Pages, itch, servidor próprio)? Isso define `base` no `vite.config.js` e o destino do `sw.js`.
2. **Downloads dos pesos do modelo**: hoje o TF.js busca os pesos de `storage.googleapis.com`/`tfhub.dev` em runtime. Segue igual (com cache), ou o app deve pré-baixar os pesos e servi-los localmente? (não muda nesta migração, mas define o `sw.js` final).
3. **Verificação visual**: posso comparar o antes/depois com screenshot automatizado (Puppeteer/Chromium, ~150 MB de download) ou a conferência é manual no navegador?
