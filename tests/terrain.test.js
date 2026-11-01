const { test } = require('node:test');
const assert = require('node:assert');

async function load(){ return import('../src/engine/terrain.js'); }

test('groundEdgeScore: imagem uniforme = 0', async () => {
  const { groundEdgeScore } = await load();
  const data = new Uint8ClampedArray(4*6*6);
  data.fill(200);
  const res = groundEdgeScore({ data, width:6, height:6 });
  assert.strictEqual(res, 0);
});

test('groundEdgeScore: linhas horizontais geram transições', async () => {
  const { groundEdgeScore } = await load();
  const w=8, h=6; const data = new Uint8ClampedArray(4*w*h);
  // stripes horizontais alternadas no terço inferior
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const idx=(y*w+x)*4; const v = (x%2===0)?0:255;
      data[idx]=v; data[idx+1]=v; data[idx+2]=v; data[idx+3]=255;
    }
  }
  const res = groundEdgeScore({ data, width:w, height:h });
  assert.ok(res > 0.3, String(res));
});

test('isGroundHazard: respeita threshold', async () => {
  const { isGroundHazard } = await load();
  const w=8, h=6; const data = new Uint8ClampedArray(4*w*h);
  data.fill(128);
  assert.strictEqual(isGroundHazard({ data, width:w, height:h }), false);
});
