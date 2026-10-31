const { test } = require('node:test');
const assert = require('node:assert');

async function loadFala() {
  const mod = await import('../src/engine/vigia.js');
  return { falaTem: mod.falaTem, vigiaNorm: mod.vigiaNorm };
}

test('falaTem casa palavra inteira, não substring', async () => {
  const { falaTem } = await loadFala();
  assert.strictEqual(falaTem('meu vizinho sossegado', 'sos'), false);
  assert.strictEqual(falaTem('acena para mim', 'cena'), false);
  assert.strictEqual(falaTem('quero iniciar', 'iniciar'), true);
});

test('falaTem normaliza acento, caixa e frase', async () => {
  const { falaTem } = await loadFala();
  assert.strictEqual(falaTem('emergência!', 'emergencia'), true);
  assert.strictEqual(falaTem('o que tem à frente?', 'o que tem'), true);
  assert.strictEqual(falaTem('mais RÁPIDO', 'rapido'), true);
});

test('falaTem não casa termo vazio', async () => {
  const { falaTem } = await loadFala();
  assert.strictEqual(falaTem('vigiar', ''), false);
  assert.strictEqual(falaTem('vigiar', '   '), false);
});
