const { test } = require('node:test');
const assert = require('node:assert');

async function load(){ return import('../src/engine/lighting.js'); }

test('analyzeBrightness: detecta ambiente escuro', async () => {
  const { analyzeBrightness } = await load();
  // ImageData simulado com pixel escuro (RGBA: 20, 20, 20, 255)
  const data = new Uint8ClampedArray(4 * 100);
  for(let i=0; i<data.length; i+=4){
    data[i] = 20; data[i+1] = 20; data[i+2] = 20; data[i+3] = 255;
  }
  const res = analyzeBrightness({ data, width: 10, height: 10 });
  assert.strictEqual(res.isLowLight, true);
  assert.ok(res.avg < 40);
});

test('analyzeBrightness: detecta ambiente claro', async () => {
  const { analyzeBrightness } = await load();
  const data = new Uint8ClampedArray(4 * 100);
  for(let i=0; i<data.length; i+=4){
    data[i] = 180; data[i+1] = 180; data[i+2] = 180; data[i+3] = 255;
  }
  const res = analyzeBrightness({ data, width: 10, height: 10 });
  assert.strictEqual(res.isLowLight, false);
  assert.ok(res.avg > 100);
});
