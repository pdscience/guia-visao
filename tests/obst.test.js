const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeTensor(data, shape) {
  return {
    data,
    shape,
    dispose() {},
    concat(other) {
      return makeTensor(this.data.concat(other.data), [this.shape[0] + other.shape[0], ...this.shape.slice(1)]);
    },
  };
}

function loadObst(records) {
  const calls = [];
  const clf = {
    clearAllClasses() { calls.push('clearAllClasses'); },
    setClassifierDataset(ds) { calls.push('setClassifierDataset:' + Object.keys(ds).length); },
    getClassExampleCount() { return {}; },
  };
  globalThis.knnClassifier = { create: () => clf };
  globalThis.tf = { tensor2d: (data, shape) => makeTensor(data, shape) };

  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'obst.js'), 'utf8');
  const O = vm.runInThisContext('(function(){' + src + '; return {MeuKNn, ObstDB, startTraining};})()');
  O.ObstDB.loadAll = async () => records;
  return { O, calls };
}

test('startTraining aborta se a detecção parar antes de capturar', async () => {
  const { O } = loadObst([]);
  let capturas = 0;
  O.MeuKNn.ensureModel = async () => {};
  O.MeuKNn.clf = { getClassifierDataset: () => ({}) };
  O.MeuKNn.addExampleFromVideo = () => { capturas++; throw new Error('capturou sem detecção'); };
  O.ObstDB.save = async () => { throw new Error('não deveria salvar'); };
  globalThis.S = { running: false, mode: 'live' };
  globalThis.cam = { videoWidth: 640 };
  globalThis.speak = () => {};
  globalThis.beep = () => {};

  await assert.rejects(
    () => O.startTraining('Portão', globalThis.cam, () => {}),
    /(interromp|cancel)/i
  );
  assert.strictEqual(capturas, 0);
});

test('loadDataset limpa o classificador quando não há registros', async () => {
  const { O, calls } = loadObst([]);
  await O.MeuKNn.loadDataset();
  assert.deepStrictEqual(calls, ['clearAllClasses']);
});

test('loadDataset limpa o classificador antes de repor o dataset', async () => {
  const { O, calls } = loadObst([
    { id: 'm1', nome: 'Portão', dataset: { m1: { data: [0, 1], shape: [1, 2] } } },
  ]);
  await O.MeuKNn.loadDataset();
  assert.deepStrictEqual(calls, ['clearAllClasses', 'setClassifierDataset:1']);
});
