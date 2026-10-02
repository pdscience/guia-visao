# Task 5 — Meus Obstáculos: round 2/5 (persistência do fundo)

## Problema
Exemplos `fundo` ficavam só em memória; após restart o classificador voltava a ter
1 classe e anunciava tudo com conf 1.00.

## Fix (mínimo)
- `js/obst.js` — `startTraining`: persiste também o record
  `{id:'fundo', nome:'Fundo', dataset:<só labels fundo>, count:5, ...}` via
  `ObstDB.save` (put com mesma key sobrescreve a cada treino).
  `labelsAntes`/`mine` continuam ignorando `fundo` para o record do obstáculo.
- `js/obst.js` — `renderMyObst` continua filtrando `id!=='fundo'` (inalterado, linha 99).
- `js/obst.js` — `MeuKNn.init()` restaura fundo junto sem distinção (inalterado);
  `predictTop` já trata `fundo` como nunca-anunciável (retorna null).
- `js/app.js` — `diagnose()`: `fundo` não conta como obstáculo pessoal:
  `Object.keys(S.knnCount||{}).filter(k=>k!=='fundo').length`.

## Validação
- `node --check js/obst.js js/app.js` → OK
- `python3 scripts/check-pwa.py` → BAD_CDN none, MISSING none, MANIFEST OK,
  MODEL-CACHE OK, FALLBACK OK
- Funcional headless (vendors locais `tf.min.js` + `knn-classifier.min.js` +
  `mobilenet.min.js` reais; `mobilenet.load` mockado com embeddings
  determinísticos rua×portão; `startTraining` real, 5 fundo + 10 obstáculo):
  - IndexedDB após treino: `fundo{count:5,labels:[fundo]}` +
    `mmurazau2{count:10,labels:[mmurazau2]}` (record obstáculo sem `fundo`)
  - Após reload (`clf` recriado + `MeuKNn.init()`): `counts={fundo:5, mmurazau2:10}`,
    classesTotal=2, classesSemFundo=1
  - `predictTop(rua)` → `null`; `predictTop(portao)` → `{id:mmurazau2, conf:1}`
  - `pass:true`

Resultado bruto:
`{"records":[{"id":"fundo","nome":"Fundo","count":5,"labels":["fundo"]},{"id":"mmurazau2","nome":"Portao","count":10,"labels":["mmurazau2"]}],"counts":{"fundo":5,"mmurazau2":10},"classesTotal":2,"classesSemFundo":1,"pRua":null,"pPortao":{"id":"mmurazau2","conf":1},"pass":true}`
