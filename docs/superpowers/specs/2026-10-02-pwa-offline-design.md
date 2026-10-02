# Guia Visão — PWA Offline Total (Abordagem A: vendor local)
Data: 2026-10-02 | Status: aprovado pelo usuário (3/3 seções)

## 1. Objetivo / sucesso
Após UMA carga online, o app abre, detecta (COCO-SSD), fala (TTS SO), vibra e sonifica SEM internet. Instalável (Add to Home Screen), fullscreen standalone, em português.
Critério: reload em modo avião → UI + demo + detecção com modelo cacheado funcionam; Lighthouse PWA ≥90, A11y 100 mantido.

## 2. Contexto atual
- Single-file `index.html` (~1050 linhas) com Fase 1 acessibilidade já aplicada.
- CDNs bloqueantes: `tailwind browser@4`, `tfjs`, `coco-ssd`, `lucide`, Google Fonts (Archivo + JetBrains Mono).
- Sem manifest, sem SW, sem ícones. Modelo `lite_mobilenet_v2` baixa toda vez de `storage.googleapis.com`.
- Requer HTTPS (ou localhost) para câmera + SW.

## 3. Arquitetura (Seção 1 — aprovada)
```
/
├─ index.html (shell: <link> manifest/css, <script src> vendor/app, registro SW)
├─ css/app.css (extração do <style> atual + tailwind compilado via CLI, sem CDN browser)
├─ js/app.js (extração do <script> atual Fase 1, sem mudança lógica nesta fase)
├─ vendor/tf.min.js, coco-ssd.min.js, lucide.min.js (baixados 1x, versionados)
├─ manifest.webmanifest + icons/icon-192.png, icon-512.png (maskable, do monograma olho)
├─ sw.js + offline.html
```
- `index.html`: adiciona `manifest`, `theme-color #05060a`, `apple-touch-icon`, `mobile-web-app-capable`, registro SW com toast de update.
- YAGNI: sem Vite/Workbox, sem troca de modelo nesta fase.

## 4. Cache / fluxo / erros (Seção 2 — aprovada)
- `CACHE='guia-visao-v1'`, `MODEL-CACHE='guia-visao-model-v1'`.
- `install`: precache same-origin [/, index.html, css, js, vendor, icons, offline.html]. `activate`: limpa velhos + `clients.claim()`.
- `fetch`:
  - navigation same-origin: cache-first → fallback offline.html
  - `storage.googleapis.com/tfjs-models/*`: stale-while-revalidate (popula online, serve offline)
  - resto cross-origin (fonts): network-first 3s → cache
- Falha de modelo offline sem cache: chip `SEM MODELO`, fala "Modelo ainda não baixado. Conecte uma vez à internet", fallback auto `start('sim')` + botão Tentar de novo.
- Update: novo SW → toast "Nova versão disponível" + `skipWaiting` + `controllerchange` reload.
- Anuncia `MODO OFFLINE` via `liveStatus` quando `navigator.onLine=false`.

## 5. Instalação / a11y / testes (Seção 3 — aprovada)
- Manifest: name `Guia Visão`, short `GuiaVisão`, display `standalone`, orientation `portrait`, lang `pt-BR`, bg/theme `#05060a`.
- A11y Fase 1 intacta offline (TTS do SO, vibração, SOS, áudio espacial, boot falado).
- Testes: (1) 1ª carga online checa caches em DevTools; (2) avião + reload → demo fala/vibra; (3) avião + câmera instalada → detecção real; (4) Lighthouse PWA≥90; (5) TalkBack olhos vendados.

## 6. Fora de escopo
Troca de modelo (YOLO/MiDaS/depth), GPS/SOS com localização, push, multi-idioma, build Vite. Próxima fase.

## 7. Riscos
Primeira carga ~10MB; Tailwind browser deve ser compilado (senão quebra offline); iOS limita SW/modelo — documentar; versão de vendor pinada para evitar drift.
