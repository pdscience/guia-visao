const { test } = require('node:test');
const assert = require('node:assert');

async function loadSafety() {
  const mod = await import('../src/engine/safety.js');
  return mod.Safety;
}

test('início não promete caminhada antes da prontidão', async () => {
  const S = await loadSafety();
  assert.doesNotMatch(S.startSpeech(), /Boa caminhada/i);
  assert.match(S.startSpeech(), /Aguarde a câmera e o modelo/i);
  assert.match(S.readySpeech(), /Detecção ativa/i);
});

test('erro de câmera negada explica que a detecção não iniciou', async () => {
  const S = await loadSafety();
  const msg = S.cameraError({ name: 'NotAllowedError' });
  assert.match(msg, /negada/i);
  assert.match(msg, /não iniciou/i);
  assert.match(msg, /demonstração/i);
});

test('canDescribe bloqueia parado, modelo carregando e frame velho', async () => {
  const S = await loadSafety();
  assert.strictEqual(S.canDescribe({ running: false }, 1000), 'paused');
  assert.strictEqual(S.canDescribe({ running: true, mode: 'live', modelReady: false, lastFrameTs: 900 }, 1000), 'model');
  assert.strictEqual(S.canDescribe({ running: true, mode: 'live', modelReady: true, lastFrameTs: 0 }, 1000), 'stale');
  assert.strictEqual(S.canDescribe({ running: true, mode: 'live', modelReady: true, lastFrameTs: 1000 - 3001 }, 1000), 'stale');
  assert.strictEqual(S.canDescribe({ running: true, mode: 'live', modelReady: true, lastFrameTs: 900 }, 1000), 'ok');
  assert.strictEqual(S.canDescribe({ running: true, mode: 'sim', modelReady: false, lastFrameTs: 0 }, 1000), 'ok');
});

test('resposta sem detecções não afirma caminho livre', async () => {
  const S = await loadSafety();
  assert.match(S.describeBlocked('paused'), /pausada/i);
  assert.match(S.freeSpeech(), /não garante caminho livre/i);
});

test('cameraHealth identifica sem frame, congelado e saudável', async () => {
  const S = await loadSafety();
  assert.strictEqual(S.cameraHealth({ readyState: 0, videoWidth: 0, currentTime: 0, lastTime: 0, lastAt: 1000, now: 1000 }), 'no-frame');
  assert.strictEqual(S.cameraHealth({ readyState: 2, videoWidth: 640, currentTime: 5, lastTime: 4, lastAt: 1000, now: 1001 }), 'ok');
  assert.strictEqual(S.cameraHealth({ readyState: 2, videoWidth: 640, currentTime: 4, lastTime: 4, lastAt: 1000, now: 2000 }), 'ok');
  assert.strictEqual(S.cameraHealth({ readyState: 2, videoWidth: 640, currentTime: 4, lastTime: 4, lastAt: 1000, now: 4000 }), 'stalled');
});

test('comando crítico sem ativação pede confirmação', async () => {
  const S = await loadSafety();
  const d = S.voiceDecision('parar', {});
  assert.strictEqual(d.action, 'confirm-required');
  assert.strictEqual(d.kind, 'stop');
  assert.match(d.prompt, /confirmar/i);
});

test('comando crítico com ativação executa direto', async () => {
  const S = await loadSafety();
  const d = S.voiceDecision('guia visão parar', {});
  assert.strictEqual(d.action, 'execute');
  assert.strictEqual(d.kind, 'stop');
  assert.strictEqual(d.text, 'parar');
});

test('confirmação executa o comando pendente', async () => {
  const S = await loadSafety();
  const pending = { text: 'parar', kind: 'stop' };
  const d = S.voiceDecision('confirmar parar', { pending, pendingAge: 1000 });
  assert.strictEqual(d.action, 'confirm');
  assert.strictEqual(d.pending.text, 'parar');
});

test('confirmação continua válida depois da fala longa do prompt', async () => {
  const S = await loadSafety();
  const d = S.voiceDecision('confirmar parar', { pending: { text: 'parar', kind: 'stop' }, pendingAge: 12000 });
  assert.strictEqual(d.action, 'confirm');
});

test('cancelamento descarta o comando pendente', async () => {
  const S = await loadSafety();
  const pending = { text: 'socorro', kind: 'sos' };
  const d = S.voiceDecision('cancelar', { pending, pendingAge: 1000 });
  assert.strictEqual(d.action, 'cancel');
});

test('parar de vigiar não é tratado como parar detecção', async () => {
  const S = await loadSafety();
  const d = S.voiceDecision('parar de vigiar cachorro', {});
  assert.strictEqual(d.action, 'execute');
  assert.strictEqual(d.kind, null);
});

test('demonstração não é crítica e executa sem confirmação', async () => {
  const S = await loadSafety();
  const d = S.voiceDecision('demonstração', {});
  assert.strictEqual(d.action, 'execute');
  assert.strictEqual(d.kind, null);
});

test('SOS só executa após confirmação e informa que não faz chamadas', async () => {
  const S = await loadSafety();
  const d = S.voiceDecision('socorro', {});
  assert.strictEqual(d.action, 'confirm-required');
  assert.strictEqual(d.kind, 'sos');
  const confirm = S.voiceDecision('confirmar socorro', { pending: { text: 'socorro', kind: 'sos' }, pendingAge: 1000 });
  assert.strictEqual(confirm.action, 'confirm');
  assert.match(S.sosSpeech(), /Nenhuma chamada foi feita/i);
});
