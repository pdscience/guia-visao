const { test } = require('node:test');
const assert = require('node:assert');

async function load(){ return import('../src/engine/guidance.js'); }

const det = (cls, x, w, risk, extra = {}) => ({ cls, bbox: [x, 100, w, 100], risk, score: risk, dir: 'à frente', ...extra });

test('corridor: sem obstáculos de risco → frente livre', async () => {
  const { corridor } = await load();
  const c = corridor([], 600);
  assert.strictEqual(c.front, true);
  assert.strictEqual(c.suggestion, 'front');
});

test('corridor: obstáculo no centro bloqueia a frente', async () => {
  const { corridor } = await load();
  const c = corridor([det('person', 270, 60, 1)], 600);
  assert.strictEqual(c.front, false);
  assert.strictEqual(c.suggestion, 'left');
});

test('corridor: obstáculo à esquerda não bloqueia a frente', async () => {
  const { corridor } = await load();
  const c = corridor([det('person', 10, 60, 1)], 600);
  assert.strictEqual(c.front, true);
  assert.strictEqual(c.suggestion, 'front');
});

test('corridor: centro e esquerda bloqueados → direita', async () => {
  const { corridor } = await load();
  const c = corridor([det('person', 270, 60, 1), det('car', 20, 100, 1)], 600);
  assert.strictEqual(c.front, false);
  assert.strictEqual(c.left, false);
  assert.strictEqual(c.right, true);
  assert.strictEqual(c.suggestion, 'right');
});

test('corridor: tudo bloqueado → pare', async () => {
  const { corridor } = await load();
  const c = corridor([det('person', 270, 60, 1), det('car', 20, 100, 1), det('bus', 500, 100, 1)], 600);
  assert.strictEqual(c.suggestion, 'stop');
});

test('corridor: risco 0 não bloqueia', async () => {
  const { corridor } = await load();
  const c = corridor([det('person', 270, 60, 0)], 600);
  assert.strictEqual(c.front, true);
});

test('guidanceSpeech: centro bloqueado com esquerda livre', async () => {
  const { guidanceSpeech } = await load();
  assert.match(guidanceSpeech([det('person', 270, 60, 1)], 600), /esquerda/i);
});

test('guidanceSpeech: sem risco não fala nada', async () => {
  const { guidanceSpeech } = await load();
  assert.strictEqual(guidanceSpeech([det('person', 270, 60, 0)], 600), '');
});

test('guidanceSpeech: tudo bloqueado manda parar', async () => {
  const { guidanceSpeech } = await load();
  const msg = guidanceSpeech([det('person', 270, 60, 1), det('car', 20, 100, 1), det('bus', 500, 100, 1)], 600);
  assert.match(msg, /pare/i);
});

test('alertsFor: filtra risco 0, ordena e limita a 2', async () => {
  const { alertsFor } = await load();
  const list = [det('person', 270, 60, 1), det('car', 20, 100, 2), det('dog', 500, 50, 0)];
  const a = alertsFor(list, 2);
  assert.deepStrictEqual(a.map(x => x.cls), ['car', 'person']);
});

test('alertsFor: remove duplicados de classe+direção', async () => {
  const { alertsFor } = await load();
  const list = [det('person', 270, 60, 1), det('person', 280, 60, 1)];
  assert.strictEqual(alertsFor(list, 2).length, 1);
});
