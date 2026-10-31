const { test } = require('node:test');
const assert = require('node:assert');

function makeStore(){
  const m = new Map();
  return {
    getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
}

async function loadVigia(store){
  if (store) globalThis.localStorage = store;
  const mod = await import('../src/engine/vigia.js?bust=' + Date.now() + Math.random());
  return mod.Vigia;
}

const LABELS = {
  dog: 'Cachorro',
  car: 'Carro',
  bus: 'Ônibus',
  person: 'Pessoa',
  'hot dog': 'Cachorro-quente',
  'stop sign': 'Placa de pare',
};

async function fresh(store){
  const V = await loadVigia(store || makeStore());
  V.init(LABELS);
  return V;
}

test('adiciona um objeto e has() passa a reconhecer', async () => {
  const V = await fresh();
  assert.strictEqual(V.has('dog'), false);
  assert.strictEqual(V.add('dog'), true);
  assert.strictEqual(V.has('dog'), true);
  assert.deepStrictEqual(V.all(), ['dog']);
});

test('add duplicado retorna false e não duplica a lista', async () => {
  const V = await fresh();
  V.add('dog');
  assert.strictEqual(V.add('dog'), false);
  assert.deepStrictEqual(V.all(), ['dog']);
});

test('add sem classe (vazia) retorna false', async () => {
  const V = await fresh();
  assert.strictEqual(V.add(''), false);
  assert.strictEqual(V.add(undefined), false);
  assert.deepStrictEqual(V.all(), []);
});

test('remove limpa a lista; remover ausente retorna false', async () => {
  const V = await fresh();
  V.add('dog');
  V.add('car');
  assert.strictEqual(V.remove('dog'), true);
  assert.strictEqual(V.has('dog'), false);
  assert.strictEqual(V.remove('dog'), false);
  assert.deepStrictEqual(V.all(), ['car']);
});

test('persiste entre recargas do módulo com o mesmo storage', async () => {
  const store = makeStore();
  const V1 = await loadVigia(store);
  V1.init(LABELS);
  V1.add('bus');
  const V2 = await loadVigia(store);
  V2.init(LABELS);
  assert.deepStrictEqual(V2.all(), ['bus']);
  assert.strictEqual(V2.has('bus'), true);
});

test('storage corrompido não derruba: all() vira [] e add continua funcionando', async () => {
  const store = makeStore();
  store.setItem('guia-visao-vigia', '{não é json');
  const V = await fresh(store);
  assert.deepStrictEqual(V.all(), []);
  assert.strictEqual(V.add('dog'), true);
  assert.deepStrictEqual(V.all(), ['dog']);
});

test('localStorage que lança exceção não derruba add', async () => {
  const boom = {
    getItem: () => { throw new Error('quota'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('quota'); },
  };
  const V = await fresh(boom);
  assert.strictEqual(V.add('dog'), true);
  assert.deepStrictEqual(V.all(), []);
});

test('findByName: exato sem acento — "ônibus" → bus', async () => {
  const V = await fresh();
  assert.strictEqual(V.findByName('ônibus'), 'bus');
  assert.strictEqual(V.findByName('onibus'), 'bus');
});

test('findByName: caixa alta — "CACHORRO" → dog', async () => {
  const V = await fresh();
  assert.strictEqual(V.findByName('CACHORRO'), 'dog');
});

test('findByName: por conteúdo — "o cachorro" → dog', async () => {
  const V = await fresh();
  assert.strictEqual(V.findByName('o cachorro'), 'dog');
});

test('findByName: exato vence conteúdo — "cachorro" → dog, não hot dog', async () => {
  const V = await fresh();
  assert.strictEqual(V.findByName('cachorro'), 'dog');
});

test('findByName: hífen/espaço equivalentes — "cachorro quente" → hot dog', async () => {
  const V = await fresh();
  assert.strictEqual(V.findByName('cachorro quente'), 'hot dog');
});

test('findByName: nome desconhecido → null', async () => {
  const V = await fresh();
  assert.strictEqual(V.findByName('hipopótamo'), null);
});

test('findByName: entrada vazia → null', async () => {
  const V = await fresh();
  assert.strictEqual(V.findByName(''), null);
  assert.strictEqual(V.findByName('   '), null);
});

test('findByName: entrada curta (1-2 letras) não casa por acidente', async () => {
  const V = await fresh();
  assert.strictEqual(V.findByName('a'), null);
  assert.strictEqual(V.findByName('ca'), null);
});

test('findByName antes do init() → null (sem labels carregados)', async () => {
  const V = await loadVigia(makeStore());
  assert.strictEqual(V.findByName('cachorro'), null);
});
