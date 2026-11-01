const { test } = require('node:test');
const assert = require('node:assert');

async function load(){ return import('../src/engine/risk.js'); }

test('detectThreshold: veículos são mais sensíveis', async () => {
  const { detectThreshold } = await load();
  for(const c of ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train', 'boat']){
    assert.strictEqual(detectThreshold(c), 0.30, c);
  }
});

test('detectThreshold: pessoa exige mais confiança', async () => {
  const { detectThreshold } = await load();
  assert.strictEqual(detectThreshold('person'), 0.40);
});

test('detectThreshold: demais classes usam 0.35', async () => {
  const { detectThreshold } = await load();
  assert.strictEqual(detectThreshold('dog'), 0.35);
  assert.strictEqual(detectThreshold('chair'), 0.35);
  assert.strictEqual(detectThreshold(undefined), 0.35);
});
