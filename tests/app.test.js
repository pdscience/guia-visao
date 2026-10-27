const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const SAFETY = fs.readFileSync(path.join(ROOT, 'js', 'safety.js'), 'utf8');
const VIGIA = fs.readFileSync(path.join(ROOT, 'js', 'vigia.js'), 'utf8');

function fake2d(){
  return new Proxy({}, {
    get(t, p){
      if(p === 'measureText') return () => ({ width: 10 });
      if(!(p in t)) t[p] = () => {};
      return t[p];
    },
    set(t, p, v){ t[p] = v; return true; },
  });
}

function makeElement(id, tag = 'div'){
  const classes = new Set();
  const attrs = new Map();
  const listeners = new Map();
  const children = [];
  const el = {
    id, tagName: String(tag).toUpperCase(),
    style: { setProperty(){}, removeProperty(){} },
    classList: {
      add(...cs){ cs.forEach(c => classes.add(c)); },
      remove(...cs){ cs.forEach(c => classes.delete(c)); },
      toggle(c, force){
        const on = force === undefined ? !classes.has(c) : !!force;
        if(on) classes.add(c); else classes.delete(c);
        return on;
      },
      contains(c){ return classes.has(c); },
    },
    className: '',
    setAttribute(k, v){ attrs.set(k, String(v)); },
    getAttribute(k){ return attrs.has(k) ? attrs.get(k) : null; },
    removeAttribute(k){ attrs.delete(k); },
    addEventListener(t, fn){ if(!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(fn); },
    removeEventListener(){},
    dispatch(t, extra = {}){
      const ev = { target: el, currentTarget: el, preventDefault(){}, stopPropagation(){}, ...extra };
      (listeners.get(t) || []).slice().forEach(fn => fn(ev));
      return ev;
    },
    click(){ el.dispatch('click', { target: el }); },
    focus(){ if(doc) doc.activeElement = el; },
    blur(){ if(doc && doc.activeElement === el) doc.activeElement = null; },
    append(...kids){ kids.forEach(k => { if(k && typeof k === 'object'){ k.parent = el; children.push(k); } }); },
    prepend(k){ if(k && typeof k === 'object'){ k.parent = el; children.unshift(k); } },
    remove(){
      if(el.parent){
        const i = el.parent.children.indexOf(el);
        if(i >= 0) el.parent.children.splice(i, 1);
      }
    },
    get children(){ return children; },
    get lastChild(){ return children[children.length - 1] || null; },
    get firstChild(){ return children[0] || null; },
    getContext(){ return fake2d(); },
    play: async () => {},
    pause(){},
    readyState: 2,
    videoWidth: 640,
    videoHeight: 480,
    currentTime: 1,
    clientWidth: 400,
    clientHeight: 800,
    width: 0,
    height: 0,
    value: '',
    checked: false,
    disabled: false,
    textContent: '',
    _classes: classes,
    _attrs: attrs,
    _listeners: listeners,
  };
  return el;
}

function makeTrack(){
  const listeners = new Map();
  const track = {
    kind: 'video',
    readyState: 'live',
    muted: false,
    stop(){ track.readyState = 'ended'; },
    addEventListener(t, fn){ if(!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(fn); },
    dispatch(t, extra = {}){
      const ev = { target: track, ...extra };
      (listeners.get(t) || []).slice().forEach(fn => fn(ev));
    },
    getCapabilities(){ return {}; },
    getSettings(){ return { facingMode: 'environment' }; },
    applyConstraints: async () => {},
    _listeners: listeners,
  };
  return track;
}

function loadApp(opts = {}){
  let now = 100000;
  let visibility = 'visible';
  let sosFired = false;
  const timers = new Map();
  let nextTimer = 1;
  const rafQueue = [];
  const speeches = [];
  const vibrations = [];
  const tracks = [];
  let gumCalls = 0;

  function advance(ms){
    now += ms;
    let guard = 0;
    while(guard++ < 50){
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= now)
        .sort((a, b) => a[1].at - b[1].at);
      if(!due.length) break;
      for(const [id, t] of due){
        if(!timers.has(id)) continue;
        timers.delete(id);
        t.fn(...t.args);
      }
    }
  }
  function fakeSetTimeout(fn, ms, ...args){
    const id = nextTimer++;
    timers.set(id, { fn, at: now + (ms || 0), args });
    return id;
  }
  function fakeClearTimeout(id){ timers.delete(id); }

  async function flushMicro(){
    for(let i = 0; i < 10; i++) await Promise.resolve();
  }
  async function settle(ms = 300){
    for(let i = 0; i < 4; i++){
      await flushMicro();
      advance(ms);
      await flushMicro();
    }
  }
  async function runRaf(times = 1){
    for(let i = 0; i < times; i++){
      const cbs = rafQueue.splice(0);
      if(!cbs.length) return;
      await Promise.all(cbs.map(cb => cb(now)));
      await flushMicro();
    }
  }

  const elements = new Map();
  const doc = {
    body: null,
    activeElement: null,
    _listeners: new Map(),
    addEventListener(t, fn){ if(!this._listeners.has(t)) this._listeners.set(t, []); this._listeners.get(t).push(fn); },
    dispatch(t, extra = {}){
      const ev = { target: doc, currentTarget: doc, preventDefault(){}, stopPropagation(){}, ...extra };
      (this._listeners.get(t) || []).slice().forEach(fn => fn(ev));
      return ev;
    },
    querySelector(sel){
      if(sel === 'body') return doc.body;
      if(sel.startsWith('#')) return getEl(sel.slice(1));
      return null;
    },
    querySelectorAll(sel){
      if(sel === '.sheet') return [getEl('sheetSettings'), getEl('sheetHelp'), getEl('sheetObst')];
      if(sel === '[data-close]') return [];
      return [];
    },
    createElement(tag){ return makeElement(null, tag); },
  };
  Object.defineProperty(doc, 'visibilityState', { get: () => visibility, configurable: true });
  doc.body = makeElement('body');
  function getEl(id){
    if(!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  }
  function setVisibility(v){
    visibility = v;
    doc.dispatch('visibilitychange', { target: doc });
  }

  const appEl = getEl('app');
  appEl.clientWidth = 400;
  appEl.clientHeight = 800;
  const cam = getEl('cam');
  cam.readyState = 2;
  cam.videoWidth = 640;
  cam.videoHeight = 480;
  cam.currentTime = 1;

  function makeStream(){
    const track = makeTrack();
    tracks.push(track);
    return { getTracks: () => [track], getVideoTracks: () => [track] };
  }
  const getUserMedia = async (...args) => {
    gumCalls++;
    if(opts.getUserMedia) return opts.getUserMedia(...args);
    return makeStream();
  };

  const store = {
    _m: new Map(),
    getItem(k){ return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v){ this._m.set(k, String(v)); },
    removeItem(k){ this._m.delete(k); },
  };
  store.setItem('guia-visao-prefs', JSON.stringify({ autoVoice: false, ...(opts.prefs || {}) }));

  const speechSynthesis = {
    speaking: false,
    getVoices(){ return [{ name: 'Voz PT', lang: 'pt-BR' }]; },
    addEventListener(){},
    cancel(){},
    speak(u){
      if(u && u.text && u.text.trim()) speeches.push(u.text);
      if(u && u.onend) u.onend();
    },
  };

  class FakeUtterance {
    constructor(text){ this.text = text; this.volume = 1; }
  }
  class FakeAudioContext {
    constructor(){ this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    resume(){ this.state = 'running'; return Promise.resolve(); }
    createOscillator(){
      return {
        type: 'sine',
        frequency: { value: 0, setValueAtTime(){}, exponentialRampToValueAtTime(){} },
        connect(node){ return node; },
        start(){}, stop(){}, onended: null,
      };
    }
    createGain(){
      return {
        gain: { value: 0, setValueAtTime(){}, exponentialRampToValueAtTime(){} },
        connect(node){ return node; },
      };
    }
  }

  const cloudCalls = { describe: 0, setEnabled: 0 };
  const cloud = opts.cloud || {
    available: () => false,
    describe: async () => { cloudCalls.describe++; return { ok: false, err: 'off' }; },
    isEnabled: () => false,
    getKey: () => '',
    setKey(){},
    setEnabled(){ cloudCalls.setEnabled++; },
  };

  const navigator = {
    mediaDevices: { getUserMedia },
    wakeLock: { request: async () => ({ release(){} }) },
    vibrate: (p) => { vibrations.push(p); return true; },
    onLine: true,
  };

  const winListeners = new Map();
  const sandbox = {
    console: { log(){}, warn(){}, error(){}, info(){}, debug(){} },
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    performance: { now: () => now },
    requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
    cancelAnimationFrame: () => {},
    ResizeObserver: class { observe(){} disconnect(){} },
    SpeechSynthesisUtterance: FakeUtterance,
    speechSynthesis,
    navigator,
    document: doc,
    localStorage: store,
    lucide: { createIcons(){} },
    MeuKNn: { init: async () => {}, count: () => ({}), predictTop: async () => null },
    CloudVision: cloud,
    cocoSsd: { load: opts.loadModel || (async () => ({ detect: async () => [] })) },
    tf: {},
    AudioContext: FakeAudioContext,
    location: { origin: 'https://app.test' },
    getUserMedia,
  };
  vm.createContext(sandbox);
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.devicePixelRatio = 1;
  sandbox.cocoSsd = sandbox.window.cocoSsd;
  sandbox.SpeechSynthesisUtterance = FakeUtterance;
  sandbox.speechSynthesis = speechSynthesis;
  sandbox.window.speechSynthesis = speechSynthesis;
  sandbox.window.AudioContext = FakeAudioContext;
  sandbox.window.webkitAudioContext = FakeAudioContext;
  sandbox.window.navigator = navigator;
  sandbox.window.document = doc;
  sandbox.window.localStorage = store;
  sandbox.window.performance = sandbox.performance;
  sandbox.window.cocoSsd = sandbox.cocoSsd;
  sandbox.addEventListener = (t, fn) => {
    if(!winListeners.has(t)) winListeners.set(t, []);
    winListeners.get(t).push(fn);
  };
  sandbox.window.addEventListener = sandbox.addEventListener;

  vm.runInContext(SAFETY, sandbox);
  vm.runInContext('globalThis.Safety = Safety;', sandbox);
  vm.runInContext(VIGIA, sandbox);
  vm.runInContext(APP, sandbox);
  getEl('intro').classList.add('away');

  const api = sandbox.GuiaVisao;
  return {
    sandbox, api, speeches, vibrations, tracks, doc, cam, el: getEl,
    now: () => now, advance, settle, runRaf, setVisibility,
    gumCalls: () => gumCalls, cloudCalls,
  };
}

test('câmera negada fala o erro e não promete caminhada', async () => {
  const env = loadApp({
    getUserMedia: async () => {
      const e = new Error('denied');
      e.name = 'NotAllowedError';
      throw e;
    },
  });
  env.el('btnMain').click();
  await env.settle(300);
  assert.ok(env.speeches.some(s => /Permissão de câmera negada/i.test(s)), env.speeches.join(' | '));
  assert.ok(env.speeches.some(s => /não iniciou/i.test(s)), env.speeches.join(' | '));
  assert.ok(!env.speeches.some(s => /Boa caminhada/i.test(s)), 'não pode prometer caminhada: ' + env.speeches.join(' | '));
  assert.strictEqual(env.api.S.running, false);
});

test('só anuncia detecção ativa depois do primeiro frame', async () => {
  const env = loadApp();
  env.el('btnMain').click();
  await env.settle(300);
  assert.ok(!env.speeches.some(s => /Boa caminhada|Detecção ativa/i.test(s)), 'anunciou antes do frame: ' + env.speeches.join(' | '));
  assert.doesNotMatch(env.el('alertTitle').textContent, /caminho livre/i);
  await env.runRaf();
  await env.settle(200);
  assert.ok(env.speeches.some(s => /Detecção ativa/i.test(s)), env.speeches.join(' | '));
  assert.match(env.el('alertTitle').textContent, /Detecção ativa/i);
  assert.strictEqual(env.api.S.running, true);
});

test('estado pausado não mostra caminho livre', () => {
  const env = loadApp();
  env.api.stopAll();
  assert.doesNotMatch(env.el('alertTitle').textContent, /caminho livre/i);
  assert.doesNotMatch(env.el('alertSub').textContent, /nenhum obstáculo/i);
  assert.match(env.el('alertSub').textContent, /sem análise/i);
});

test('describe parado não afirma caminho livre', async () => {
  const env = loadApp();
  assert.strictEqual(typeof env.api.describe, 'function', 'describe deve ser exposto para diagnóstico/teste');
  await env.api.describe();
  await env.settle(200);
  assert.ok(env.speeches.some(s => /Detecção pausada/i.test(s)), env.speeches.join(' | '));
  assert.ok(!env.speeches.some(s => /Caminho livre/i.test(s)), env.speeches.join(' | '));
});

test('describe com frame fresco não promete caminho livre sem detecções', async () => {
  const env = loadApp();
  env.api.S.running = true;
  env.api.S.mode = 'live';
  env.api.S.modelReady = true;
  env.api.S.lastFrameTs = env.now();
  await env.api.describe();
  await env.settle(200);
  assert.ok(env.speeches.some(s => /não garante caminho livre/i.test(s)), env.speeches.join(' | '));
});

test('comando parar sem ativação pede confirmação e não para', async () => {
  const env = loadApp();
  assert.strictEqual(typeof env.api.handleCommand, 'function', 'handleCommand deve ser exposto para diagnóstico/teste');
  env.api.S.running = true;
  env.api.S.mode = 'live';
  env.api.handleCommand('parar');
  await env.settle(200);
  assert.ok(env.speeches.some(s => /confirmar/i.test(s)), env.speeches.join(' | '));
  assert.strictEqual(env.api.S.running, true);
});

test('confirmar executa a parada', async () => {
  const env = loadApp();
  env.api.S.running = true;
  env.api.S.mode = 'live';
  env.api.handleCommand('parar');
  await env.settle(200);
  env.api.handleCommand('confirmar parar');
  await env.settle(200);
  assert.strictEqual(env.api.S.running, false);
  assert.ok(env.speeches.some(s => /Detecção pausada/i.test(s)), env.speeches.join(' | '));
});

test('ativação por voz executa comando crítico sem confirmação', async () => {
  const env = loadApp();
  env.api.S.running = true;
  env.api.S.mode = 'live';
  env.api.handleCommand('guia visão parar');
  await env.settle(200);
  assert.strictEqual(env.api.S.running, false);
  assert.ok(!env.speeches.some(s => /confirmar/i.test(s)), env.speeches.join(' | '));
});

test('socorro sem ativação não aciona alarme antes da confirmação', async () => {
  const env = loadApp();
  env.api.handleCommand('socorro');
  await env.settle(200);
  assert.ok(env.speeches.some(s => /confirmar/i.test(s)), env.speeches.join(' | '));
  assert.strictEqual(env.vibrations.length, 0);
});

test('botão SOS aciona alarme local e informa que não faz chamadas', async () => {
  const env = loadApp();
  env.el('btnSOS').click();
  await env.settle(200);
  assert.ok(env.speeches.some(s => /Nenhuma chamada foi feita/i.test(s)), env.speeches.join(' | '));
  assert.ok(env.vibrations.length > 0);
});

test('track encerrado para a detecção e avisa', async () => {
  const env = loadApp();
  env.el('btnMain').click();
  await env.settle(300);
  await env.runRaf();
  await env.settle(200);
  assert.strictEqual(env.api.S.running, true);
  env.tracks[env.tracks.length - 1].dispatch('ended');
  await env.settle(200);
  assert.strictEqual(env.api.S.running, false);
  assert.ok(env.speeches.some(s => /câmera foi interrompida/i.test(s)), env.speeches.join(' | '));
});

test('câmera sem frames para a detecção em vez de continuar', async () => {
  const env = loadApp();
  env.el('btnMain').click();
  await env.settle(300);
  await env.runRaf();
  await env.settle(200);
  env.cam.readyState = 0;
  env.advance(3000);
  await env.runRaf();
  env.advance(3500);
  await env.runRaf();
  await env.settle(200);
  assert.strictEqual(env.api.S.running, false);
  assert.ok(env.speeches.some(s => /câmera foi interrompida/i.test(s)), env.speeches.join(' | '));
});

test('ocultar o app pausa e voltar retoma a detecção', async () => {
  const env = loadApp();
  env.el('btnMain').click();
  await env.settle(300);
  await env.runRaf();
  await env.settle(200);
  assert.strictEqual(env.api.S.running, true);
  env.setVisibility('hidden');
  await env.settle(200);
  assert.strictEqual(env.api.S.running, false);
  const before = env.gumCalls();
  env.setVisibility('visible');
  await env.settle(300);
  assert.ok(env.gumCalls() > before, 'deve readquirir a câmera ao voltar');
  assert.strictEqual(env.api.S.running, true);
});
