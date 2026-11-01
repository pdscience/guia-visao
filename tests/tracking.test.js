const { test } = require('node:test');
const assert = require('node:assert');

async function load(){ return import('../src/engine/tracking.js'); }

test('iou: caixas idênticas = 1', async () => {
  const { iou } = await load();
  assert.strictEqual(iou([10, 10, 50, 50], [10, 10, 50, 50]), 1);
});

test('iou: caixas disjuntas = 0', async () => {
  const { iou } = await load();
  assert.strictEqual(iou([0, 0, 10, 10], [50, 50, 10, 10]), 0);
});

test('iou: sobreposição parcial', async () => {
  const { iou } = await load();
  const v = iou([0, 0, 10, 10], [5, 0, 10, 10]);
  assert.ok(Math.abs(v - 1/3) < 1e-9, String(v));
});

test('iou: caixa inválida = 0', async () => {
  const { iou } = await load();
  assert.strictEqual(iou(null, [0, 0, 10, 10]), 0);
  assert.strictEqual(iou([0, 0, 0, 10], [0, 0, 10, 10]), 0);
});

test('sameTarget: mesma classe e sobreposição alta', async () => {
  const { sameTarget } = await load();
  assert.strictEqual(sameTarget({ cls: 'person', bbox: [10, 10, 50, 50] }, { cls: 'person', bbox: [12, 12, 50, 50] }), true);
});

test('sameTarget: classe diferente não é o mesmo alvo', async () => {
  const { sameTarget } = await load();
  assert.strictEqual(sameTarget({ cls: 'person', bbox: [10, 10, 50, 50] }, { cls: 'car', bbox: [10, 10, 50, 50] }), false);
});

test('sameTarget: deslocamento grande não é o mesmo alvo', async () => {
  const { sameTarget } = await load();
  assert.strictEqual(sameTarget({ cls: 'person', bbox: [0, 0, 40, 40] }, { cls: 'person', bbox: [200, 200, 40, 40] }), false);
});

test('estimateTtc: aproximando 4m→3m em 1s = 3s', async () => {
  const { estimateTtc } = await load();
  const v = estimateTtc(4, 3, 1000);
  assert.ok(Math.abs(v - 3) < 1e-9, String(v));
});

test('estimateTtc: afastando = Infinity', async () => {
  const { estimateTtc } = await load();
  assert.strictEqual(estimateTtc(3, 4, 1000), Infinity);
});

test('estimateTtc: parado = Infinity', async () => {
  const { estimateTtc } = await load();
  assert.strictEqual(estimateTtc(3, 3, 1000), Infinity);
});

test('estimateTtc: dt inválido = Infinity', async () => {
  const { estimateTtc } = await load();
  assert.strictEqual(estimateTtc(4, 3, 0), Infinity);
  assert.strictEqual(estimateTtc(undefined, 3, 1000), Infinity);
});
