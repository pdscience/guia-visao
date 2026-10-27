const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

function loadSW() {
  const handlers = {};
  const puts = [];
  const cache = {
    match: async () => undefined,
    put: async req => { puts.push(req.url); },
    add: async () => {},
  };
  globalThis.self = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting() {},
    clients: { claim() {} },
  };
  globalThis.location = { origin: 'https://app.test' };
  globalThis.caches = {
    match: async () => undefined,
    open: async () => cache,
    keys: async () => [],
  };
  vm.runInThisContext('(function(){' + SW + '})()');
  return { handlers, puts };
}

function makeEvent(method) {
  return {
    request: { url: 'https://app.test/recurso', method, mode: 'no-cors' },
    respondWith(p) { this.response = p; },
  };
}

test('não intercepta requisição POST da mesma origem', () => {
  const { handlers } = loadSW();
  globalThis.fetch = async () => ({ ok: true, clone: () => ({}) });
  const ev = makeEvent('POST');
  handlers.fetch(ev);
  assert.strictEqual(ev.response, undefined);
});

test('não cacheia resposta não-ok (404)', async () => {
  const { handlers, puts } = loadSW();
  globalThis.fetch = async () => ({ ok: false, status: 404, clone: () => ({}) });
  const ev = makeEvent('GET');
  handlers.fetch(ev);
  await ev.response;
  await new Promise(r => setTimeout(r, 0));
  assert.deepStrictEqual(puts, []);
});

test('cacheia resposta ok', async () => {
  const { handlers, puts } = loadSW();
  globalThis.fetch = async () => ({ ok: true, clone: () => ({}) });
  const ev = makeEvent('GET');
  handlers.fetch(ev);
  const res = await ev.response;
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(puts, ['https://app.test/recurso']);
});

test('shell offline inclui as regras de segurança', () => {
  assert.match(SW, /['"]\.\/js\/safety\.js['"]/, 'safety.js precisa estar no cache do shell');
});
