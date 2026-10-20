const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadFala() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'vigia.js'), 'utf8');
  return vm.runInThisContext('(function(){' + src + '; return {falaTem, vigiaNorm};})()');
}

test('falaTem casa palavra inteira, não substring', () => {
  const { falaTem } = loadFala();
  assert.strictEqual(falaTem('meu vizinho sossegado', 'sos'), false);
  assert.strictEqual(falaTem('acena para mim', 'cena'), false);
  assert.strictEqual(falaTem('quero iniciar', 'iniciar'), true);
});

test('falaTem normaliza acento, caixa e frase', () => {
  const { falaTem } = loadFala();
  assert.strictEqual(falaTem('emergência!', 'emergencia'), true);
  assert.strictEqual(falaTem('o que tem à frente?', 'o que tem'), true);
  assert.strictEqual(falaTem('mais RÁPIDO', 'rapido'), true);
});

test('falaTem não casa termo vazio', () => {
  const { falaTem } = loadFala();
  assert.strictEqual(falaTem('vigiar', ''), false);
  assert.strictEqual(falaTem('vigiar', '   '), false);
});
