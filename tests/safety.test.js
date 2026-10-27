const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSafety() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'safety.js'), 'utf8');
  return vm.runInThisContext('(function(){' + src + '; return Safety;})()');
}

test('início não promete caminhada antes da prontidão', () => {
  const S = loadSafety();
  assert.doesNotMatch(S.startSpeech(), /Boa caminhada/i);
  assert.match(S.startSpeech(), /Aguarde a câmera e o modelo/i);
  assert.match(S.readySpeech(), /Detecção ativa/i);
});

test('erro de câmera negada explica que a detecção não iniciou', () => {
  const S = loadSafety();
  const msg = S.cameraError({ name: 'NotAllowedError' });
  assert.match(msg, /negada/i);
  assert.match(msg, /não iniciou/i);
  assert.match(msg, /demonstração/i);
});

test('canDescribe bloqueia parado, modelo carregando e frame velho', () => {
  const S = loadSafety();
  assert.strictEqual(S.canDescribe({ running: false }, 1000), 'paused');
  assert.strictEqual(S.canDescribe({ running: true, mode: 'live', modelReady: false, lastFrameTs: 900 }, 1000), 'model');
  assert.strictEqual(S.canDescribe({ running: true, mode: 'live', modelReady: true, lastFrameTs: 0 }, 1000), 'stale');
  assert.strictEqual(S.canDescribe({ running: true, mode: 'live', modelReady: true, lastFrameTs: 1000 - 3001 }, 1000), 'stale');
  assert.strictEqual(S.canDescribe({ running: true, mode: 'live', modelReady: true, lastFrameTs: 900 }, 1000), 'ok');
  assert.strictEqual(S.canDescribe({ running: true, mode: 'sim', modelReady: false, lastFrameTs: 0 }, 1000), 'ok');
});

test('resposta sem detecções não afirma caminho livre', () => {
  const S = loadSafety();
  assert.match(S.describeBlocked('paused'), /pausada/i);
  assert.match(S.freeSpeech(), /não garante caminho livre/i);
});

test('cameraHealth identifica sem frame, congelado e saudável', () => {
  const S = loadSafety();
  assert.strictEqual(S.cameraHealth({ readyState: 0, videoWidth: 0, currentTime: 0, lastTime: 0, lastAt: 1000, now: 1000 }), 'no-frame');
  assert.strictEqual(S.cameraHealth({ readyState: 2, videoWidth: 640, currentTime: 5, lastTime: 4, lastAt: 1000, now: 1001 }), 'ok');
  assert.strictEqual(S.cameraHealth({ readyState: 2, videoWidth: 640, currentTime: 4, lastTime: 4, lastAt: 1000, now: 2000 }), 'ok');
  assert.strictEqual(S.cameraHealth({ readyState: 2, videoWidth: 640, currentTime: 4, lastTime: 4, lastAt: 1000, now: 4000 }), 'stalled');
});

test('comando crítico sem ativação pede confirmação', () => {
  const S = loadSafety();
  const d = S.voiceDecision('parar', {});
  assert.strictEqual(d.action, 'confirm-required');
  assert.strictEqual(d.kind, 'stop');
  assert.match(d.prompt, /confirmar/i);
});

test('comando crítico com ativação executa direto', () => {
  const S = loadSafety();
  const d = S.voiceDecision('guia visão parar', {});
  assert.strictEqual(d.action, 'execute');
  assert.strictEqual(d.kind, 'stop');
  assert.strictEqual(d.text, 'parar');
});

test('confirmação executa o comando pendente', () => {
  const S = loadSafety();
  const pending = { text: 'parar', kind: 'stop' };
  const d = S.voiceDecision('confirmar parar', { pending, pendingAge: 1000 });
  assert.strictEqual(d.action, 'confirm');
  assert.strictEqual(d.pending.text, 'parar');
});

test('confirmação continua válida depois da fala longa do prompt', () => {
  const S = loadSafety();
  const d = S.voiceDecision('confirmar parar', { pending: { text: 'parar', kind: 'stop' }, pendingAge: 12000 });
  assert.strictEqual(d.action, 'confirm');
});

test('cancelamento descarta o comando pendente', () => {
  const S = loadSafety();
  const pending = { text: 'socorro', kind: 'sos' };
  const d = S.voiceDecision('cancelar', { pending, pendingAge: 1000 });
  assert.strictEqual(d.action, 'cancel');
});

test('parar de vigiar não é tratado como parar detecção', () => {
  const S = loadSafety();
  const d = S.voiceDecision('parar de vigiar cachorro', {});
  assert.strictEqual(d.action, 'execute');
  assert.strictEqual(d.kind, null);
});

test('demonstração não é crítica e executa sem confirmação', () => {
  const S = loadSafety();
  const d = S.voiceDecision('demonstração', {});
  assert.strictEqual(d.action, 'execute');
  assert.strictEqual(d.kind, null);
});

test('SOS só executa após confirmação e informa que não faz chamadas', () => {
  const S = loadSafety();
  const d = S.voiceDecision('socorro', {});
  assert.strictEqual(d.action, 'confirm-required');
  assert.strictEqual(d.kind, 'sos');
  const confirm = S.voiceDecision('confirmar socorro', { pending: { text: 'socorro', kind: 'sos' }, pendingAge: 1000 });
  assert.strictEqual(confirm.action, 'confirm');
  assert.match(S.sosSpeech(), /Nenhuma chamada foi feita/i);
});
