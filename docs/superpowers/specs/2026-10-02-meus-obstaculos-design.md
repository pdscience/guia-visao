# Guia Visão — "Meus Obstáculos" (base de obstáculos personalizável)
Data: 2026-10-02 | Status: aprovado pelo usuário (3/3 seções)

## 1. Objetivo / sucesso
O usuário cadastra obstáculos da própria rotina (portão, escada, porta, muro, janela) com fotos + nome em português, e o app passa a reconhecê-los e anunciá-los por voz/vibração como os demais objetos. Tudo no aparelho, offline.
Critério: treino com 8 fotos de portão + teste com 4 fotos diferentes acerta; no celular, apontar ao portão cadastrado anuncia "Portão à frente".

## 2. Por que não uma lista de nomes (premissa explícita)
O detector atual (COCO-SSD) tem vocabulário fixo de 80 classes; uma lista estática não o faz enxergar nada novo. Spike 2026-10-02 descartou MobileNet-classification (errou tudo: "prison", "seat belt", sem caixa de direção) e OWL-ViT (~400MB, inviável offline no celular). Caminho viável: aprendizado por exemplos (few-shot kNN sobre embeddings MobileNet) + Nuvem opcional só como fase futura.

## 3. Arquitetura (fusão com pipeline existente)
- COCO-SSD segue no tempo real (caixas + direção + distância).
- Em paralelo (~2x/s, frames alternados p/ economizar CPU): MobileNet embedding (`mobilenet@2.1.0`, `infer(frame,'conv_preds')`) → `knn-classifier.predictClass` → se confiança ≥0.60, injeta detecção sintética `{nome, dir:'à frente', risk:1, sem metros}` no `process()` existente — voz, histerese, repetição, vibração e sonificação reaproveitados, zero duplicação.
- Direção sempre "à frente" (usuário aponta a câmera); distância não informada para classes pessoais.
- Fase futura (gancho, sem implementar): Nuvem sob demanda no comando "descrever" (conta/chave do usuário, foto sai do aparelho só com pedido explícito).

## 4. Cadastro — Seção 1 (aprovada)
- Tela "Meus obstáculos" em Ajustes: lista (nome + nº fotos + Ouvir teste + Apagar) + botão Novo.
- Modo ajudante (visual): digita o nome, segura o celular, app captura 10 fotos sozinho (1/s com bipes).
- Modo cego (guiado por voz): escolhe nome por voz em lista pronta (portão, escada, porta, muro, janela + personalizado ditado pelo ajudante depois); app instrui ("aponte para o obstáculo, vou fotografar, mexa um pouco o celular") com contagem falada e bipes.
- Mínimo 10 fotos por obstáculo; máximo 8 obstáculos (limite IDB/CPU declarado).
- Tudo falado; nenhum passo só-visual.

## 5. Reconhecimento e dados — Seção 2 (aprovada)
- Banco em IndexedDB (`guia-visao-obstaculos`): `{id, nome, embeddings: Float32Array[], criadasEm}` via `classifier.getClassifierDataset()` serializado; carrega sozinho ao abrir.
- Confiança mínima 0.60; classes com cadastro incompleto (menos de 10 fotos) não anunciam; abaixo da confiança, silêncio (sem chute).
- Dataset corrompido → descarta a classe e fala "precisa fotografar de novo" em vez de quebrar.
- Nenhuma foto sai do aparelho nesta fase; sem conta, sem chave, sem internet obrigatória.
- Novos vendors pinados: `@tensorflow-models/mobilenet@2.1.0`, `@tensorflow-models/knn-classifier@1.2.2` (+ ~13MB no primeiro carregamento, cacheados pelo SW).

## 6. Testes e fases — Seção 3 (aprovada)
- Lab: treina 8 fotos de portão real, testa 4 diferentes (acerto exigido); regressão pessoa continua 70%+; `scripts/check-pwa.py` verde; `node --check`.
- Celular: teste cego com portão de casa + comando "diagnóstico" estendido (nº de classes pessoais carregadas).
- Fase 1 (este spec): cadastro + reconhecimento + banco local. Fase futura: Nuvem opcional no "descrever".

## 7. Fora de escopo
Portas/muros genéricos sem cadastro, distância em metros p/ classes pessoais, direção lateral p/ classes pessoais, export/import da base, multi-idioma, Nuvem nesta fase.

## 8. Riscos
Celular fraco: inferência extra ~200ms — mitigado com frames alternados e toggle "Meus obstáculos on/off" em Ajustes. Fotos ruins (todas iguais/escuras) geram falso negativo — mitigado com instrução por voz p/ variar ângulo e mínimo de 10 fotos.
