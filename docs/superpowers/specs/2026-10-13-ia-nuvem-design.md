# Spec — IA na nuvem (Gemini) sob demanda

**Data:** 2026-10-13 · **Status:** aprovada pelo usuário

## Objetivo

Camada opcional de descrição inteligente de cena via API Gemini, acionada
somente sob pedido do usuário ("O que tem à frente?"), com fallback
automático para o describe local (COCO-SSD). O alerta de risco em tempo
real permanece 100% local.

## Decisões aprovadas

- **Provedor:** Google Gemini (`gemini-2.5-flash`, free tier); chave própria
  do usuário colada em Ajustes, salva no `localStorage` do aparelho.
- **Gatilho:** sob demanda apenas (comando de voz "o que tem à frente?").
  Sem modo automático periódico (YAGNI).
- **Fallback:** offline, toggle desligado, chave ausente ou erro de API →
  fala o describe local de sempre, com aviso falado do motivo da nuvem.
- **Privacidade:** toggle **padrão desligado**; UI declara que, com a nuvem
  desligada, nada sai do aparelho; ligada, só a foto pedida pelo usuário.
  Texto da intro atualizado para "VÍDEO PROCESSADO NO APARELHO · NUVEM SÓ
  SOB PEDIDO".
- **Card de alerta:** permanece "repetir último alerta" (gesto de emergência
  do toque cego); a nuvem entra pelo comando de voz.
- **Contexto híbrido:** o prompt à nuvem recebe as detecções locais
  (nome/lado/distância/risco) como dica para ancorar a descrição.
- **Debounce:** 5s entre chamadas; timeout 15s (AbortController).
- **Erros falados em pt-BR:** chave inválida, cota atingida, sem conexão,
  demorou, resposta vazia.
- **Offline do shell:** `js/cloud.js` entra no precache do SW; a chamada à
  API `generativelanguage.googleapis.com` não é cacheada (vai direto na
  rede; sem rede, `fetch` falha e o fallback local assume).

## Arquitetura

- `js/cloud.js` (novo): `CloudVision` — `getKey/setKey/isEnabled/setEnabled/
  available/describe(src, dets)` → `{ok:true,text}` | `{ok:false,err}`.
- `js/app.js`: `describe()` assíncrono prefere `CloudVision.available()`;
  wiring dos controles `#swCloud`/`#cloudKey`; restauração no boot.
- `index.html`: bloco "IA na nuvem (Gemini)" nos Ajustes + `<script>` do
  cloud.js + texto de privacidade.
- `sw.js`: SHELL += `./js/cloud.js`; cache v6. `scripts/check-pwa.py`:
  REQUIRED += `js/cloud.js`.
