const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeStore(){
  const m = new Map();
  return {
    getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
}

function loadVigia(store){
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'vigia.js'), 'utf8');
  globalThis.localStorage = store;
  // fun wrapper: escopo de função evita redeclarar `const Vigia` entre loads
  // e mantém o array no mesmo realm do teste (deepStrictEqual exige prototype igual)
  return vm.runInThisContext('(function(){' + src + '; return Vigia;})()');
}

const LABELS = {
  dog: 'Cachorro',
  car: 'Carro',
  bus: 'Ônibus',
  person: 'Pessoa',
  'hot dog': 'Cachorro-quente',
  'stop sign': 'Placa de pare',
};

function fresh(store){
  const V = loadVigia(store || makeStore());
  V.init(LABELS);
  return V;
}

test('adiciona um objeto e has() passa a reconhecer', () => {
  const V = fresh();
  assert.strictEqual(V.has('dog'), false);
  assert.strictEqual(V.add('dog'), true);
  assert.strictEqual(V.has('dog'), true);
  assert.deepStrictEqual(V.all(), ['dog']);
});

test('add duplicado retorna false e não duplica a lista', () => {
  const V = fresh();
  V.add('dog');
  assert.strictEqual(V.add('dog'), false);
  assert.deepStrictEqual(V.all(), ['dog']);
});

test('add sem classe (vazia) retorna false', () => {
  const V = fresh();
  assert.strictEqual(V.add(''), false);
  assert.strictEqual(V.add(undefined), false);
  assert.deepStrictEqual(V.all(), []);
});

test('remove limpa a lista; remover ausente retorna false', () => {
  const V = fresh();
  V.add('dog');
  V.add('car');
  assert.strictEqual(V.remove('dog'), true);
  assert.strictEqual(V.has('dog'), false);
  assert.strictEqual(V.remove('dog'), false);
  assert.deepStrictEqual(V.all(), ['car']);
});

test('persiste entre recargas do módulo com o mesmo storage', () => {
  const store = makeStore();
  const V1 = loadVigia(store);
  V1.init(LABELS);
  V1.add('bus');
  const V2 = loadVigia(store);
  V2.init(LABELS);
  assert.deepStrictEqual(V2.all(), ['bus']);
  assert.strictEqual(V2.has('bus'), true);
});

test('storage corrompido não derruba: all() vira [] e add continua funcionando', () => {
  const store = makeStore();
  store.setItem('guia-visao-vigia', '{não é json');
  const V = fresh(store);
  assert.deepStrictEqual(V.all(), []);
  assert.strictEqual(V.add('dog'), true);
  assert.deepStrictEqual(V.all(), ['dog']);
});

test('localStorage que lança exceção não derruba add', () => {
  const boom = {
    getItem: () => { throw new Error('quota'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('quota'); },
  };
  const V = fresh(boom);
  assert.strictEqual(V.add('dog'), true);
  assert.deepStrictEqual(V.all(), []);
});

test('findByName: exato sem acento — "ônibus" → bus', () => {
  const V = fresh();
  assert.strictEqual(V.findByName('ônibus'), 'bus');
  assert.strictEqual(V.findByName('onibus'), 'bus');
});

test('findByName: caixa alta — "CACHORRO" → dog', () => {
  const V = fresh();
  assert.strictEqual(V.findByName('CACHORRO'), 'dog');
});

test('findByName: por conteúdo — "o cachorro" → dog', () => {
  const V = fresh();
  assert.strictEqual(V.findByName('o cachorro'), 'dog');
});

test('findByName: exato vence conteúdo — "cachorro" → dog, não hot dog', () => {
  const V = fresh();
  assert.strictEqual(V.findByName('cachorro'), 'dog');
});

test('findByName: hífen/espaço equivalentes — "cachorro quente" → hot dog', () => {
  const V = fresh();
  assert.strictEqual(V.findByName('cachorro quente'), 'hot dog');
});

test('findByName: nome desconhecido → null', () => {
  const V = fresh();
  assert.strictEqual(V.findByName('hipopótamo'), null);
});

test('findByName: entrada vazia → null', () => {
  const V = fresh();
  assert.strictEqual(V.findByName(''), null);
  assert.strictEqual(V.findByName('   '), null);
});

test('findByName: entrada curta (1-2 letras) não casa por acidente', () => {
  const V = fresh();
  assert.strictEqual(V.findByName('a'), null);
  assert.strictEqual(V.findByName('ca'), null);
});

test('findByName antes do init() → null (sem labels carregados)', () => {
  const V = loadVigia(makeStore());
  assert.strictEqual(V.findByName('cachorro'), null);
});
