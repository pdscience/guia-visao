const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

async function setupEnv(opts = {}) {
  globalThis.window = globalThis;
  globalThis.console = globalThis.console || { log(){}, warn(){}, error(){}, info(){}, debug(){} };

  const elements = new Map();
  function makeEl(id){ if(!elements.has(id)) elements.set(id, {id, textContent:'', classList:{add(){},remove(){},toggle(){},contains(){return false;}}, style:{setProperty(){},removeProperty(){}}, setAttribute(){}, getAttribute(){return null;}, removeAttribute(){}, addEventListener(){}, dispatch(){}, click(){}, focus(){}, blur(){}, getContext(){return {clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(){},arcTo(){},closePath(){},measureText(){return {width:10};},fillText(){},fillRect(){},save(){},restore(){},translate(){},setTransform(){},createLinearGradient(){return {addColorStop(){}};},createRadialGradient(){return {addColorStop(){}};}};}, play:async()=>{}, pause(){}, readyState:2, videoWidth:640, videoHeight:480, currentTime:1, clientWidth:400, clientHeight:800, width:0, height:0, value:'', checked:false, disabled:false, children:[] }); return elements.get(id); }
  globalThis.document = { body: makeEl('body'), activeElement: null, visibilityState: 'visible', addEventListener(){}, dispatch(){}, querySelector(sel){ if(sel.startsWith('#')) return makeEl(sel.slice(1)); return null; }, querySelectorAll(){return [];}, getElementById(id){ return makeEl(id); }, createElement(tag){ return makeEl(null); } };

  globalThis.navigator = { mediaDevices: { getUserMedia: async () => { const track = {kind:'video',readyState:'live',muted:false,stop(){track.readyState='ended';},addEventListener(){},getCapabilities(){return {};},getSettings(){return {facingMode:'environment'};},applyConstraints:async()=>{}}; return {getTracks:()=>[track],getVideoTracks:()=>[track]}; } }, wakeLock: { request: async () => ({ release(){} }) }, vibrate: () => true, onLine: true };

  const m = new Map();
  globalThis.localStorage = { getItem(k){return m.has(k)?m.get(k):null;}, setItem(k,v){m.set(k,String(v));}, removeItem(k){m.delete(k);} };
  globalThis.localStorage.setItem('guia-visao-prefs', JSON.stringify({ autoVoice: false, ...(opts.prefs||{}) }));

  globalThis.speechSynthesis = { speaking: false, getVoices(){ return [{name:'Voz PT',lang:'pt-BR'}]; }, addEventListener(){}, cancel(){}, speak(u){ if(u&&u.onend) u.onend(); } };
  globalThis.SpeechSynthesisUtterance = class { constructor(t){ this.text=t; this.volume=1; } };
  globalThis.AudioContext = class { constructor(){this.state='running';this.currentTime=0;this.destination={};} resume(){this.state='running';return Promise.resolve();} createOscillator(){return {type:'sine',frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(n){return n;},start(){},stop(){},onended:null};} createGain(){return {gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(n){return n;}};} };
  globalThis.webkitAudioContext = globalThis.AudioContext;
  globalThis.ResizeObserver = class { observe(){} disconnect(){} };
  globalThis.performance = { now: () => Date.now() };
  globalThis.setInterval = () => 0;
  globalThis.clearInterval = () => {};
  globalThis.lucide = { createIcons(){} };
  globalThis.devicePixelRatio = 1;

  const { Safety } = await import('../src/engine/safety.js');
  const { Vigia } = await import('../src/engine/vigia.js');
  const { LABELS } = await import('../src/engine/labels.js');
  const { createSpeech } = await import('../src/core/speech.js');
  const { createVision } = await import('../src/core/vision.js');
  const { createController } = await import('../src/core/controller.js');
  globalThis.Safety = Safety; globalThis.Vigia = Vigia; globalThis.LABELS = LABELS;
  Vigia.init(LABELS);
  return { Safety, Vigia, LABELS, createSpeech, createVision, createController };
}

test('controller: câmera negada fala o erro', async () => {
  const env = await setupEnv();
  const state = { mode:'idle', running:false, autoVoice:false, tts:true, rate:1, vib:true, son:true, sens:1, knnOn:true, knnReady:false, knnCount:{}, telemetry:[], alert:{title:'Detecção pausada',sub:'SEM ANÁLISE',tag:'PARADO',icon:'ok',aria:'Detecção pausada. Sem análise.',outline:'',dim:true}, chip:{status:'PRONTO',fps:'-- FPS',offline:false}, main:{pressed:false,label:'INICIAR',stop:false}, stats:{det:0,voice:0,vib:0,time:'00:00'}, prefs:{}, liveAlert:'', idleVisible:true, introVisible:true, sheet:null, toast:{text:'',show:false}, lastDets:[], lastRaw:{n:0,top:'nada'}, personalHit:null, ttsErr:null, ttsNoVoiceLogged:false, inferErr:null, inferErrLogged:false, simItems:[], lastSpoke:0, lastVib:0, lastKey:'', stableKey:'', stableCount:0, lastPan:0, closeness:0, risk:0, noFrameSince:0, noFrameWarned:false, lastFree:true, lastFrameTs:0, lastVideoTime:0, lastVideoTimeAt:Date.now(), readyAnnounced:false, pendingCmd:null, pendingAt:0, sessionT:0, timer:null, wake:null, inferBusy:false, modelReady:false, modelBase:null, stream:null, track:null, torchOn:false, listening:false, recog:null, small:null, sctx:null, sw:0, sh:0, actx:null, voiceCount:0, vibCount:0, detCount:0, frames:0, roadOff:0, simLast:0, vibrate:(p)=>{}, toastFn:(m)=>{}, speakStart:0, micPaused:false, ttsBusy:false, ttsQueue:null, speakSeq:0, micStop:null, voice:null, autoVoice:false, knnNames:{}, freeSpeech:'Nenhum obstáculo reconhecido agora. Isso não garante caminho livre; siga com cautela.' };
  globalThis.navigator = globalThis.navigator || {};
  globalThis.navigator.mediaDevices = globalThis.navigator.mediaDevices || {};
  globalThis.navigator.mediaDevices.getUserMedia = async () => { const e=new Error('denied'); e.name='NotAllowedError'; throw e; };
  const speeches=[];
  globalThis.speechSynthesis.speak = (u) => { if(u&&u.text&&u.text.trim()) speeches.push(u.text); if(u&&u.onend) u.onend(); };
  const cam = globalThis.document.querySelector('#cam') || globalThis.document.body;
  cam.readyState=2; cam.videoWidth=640; cam.videoHeight=480; cam.currentTime=1;
  const refs = { root: globalThis.document.body, video: cam, overlay: globalThis.document.body, scene: globalThis.document.body };
  const ctrl = env.createController({ state, refs });
  state.toastFn = (m) => {};
  await ctrl.start('live');
  for(let i=0;i<5;i++){ await new Promise(r=>setTimeout(r,50)); }
  assert.ok(speeches.some(s=>/Permissão de câmera negada/i.test(s)), speeches.join(' | '));
  assert.strictEqual(state.running, false);
});

test('controller smoke: handleCommand confirm-required', async () => {
  const env = await setupEnv();
  const state = { mode:'live', running:true, pendingCmd:null, pendingAt:0, tts:true, rate:1, telemetry:[], alert:{title:'x',sub:'y',tag:'z',icon:'ok',aria:'a',outline:'',dim:false}, chip:{status:'PRONTO',fps:'-- FPS',offline:false}, main:{pressed:true,label:'PARAR',stop:true}, stats:{det:0,voice:0,vib:0,time:'00:00'}, liveAlert:'hi', vib:true, son:true, sens:1, knnOn:true, knnReady:false, knnCount:{}, lastDets:[], lastRaw:{n:0,top:'nada'}, personalHit:null, ttsErr:null, ttsNoVoiceLogged:false, inferErr:null, inferErrLogged:false, simItems:[], lastSpoke:0, lastVib:0, lastKey:'', stableKey:'', stableCount:0, lastPan:0, closeness:0, risk:0, noFrameSince:0, noFrameWarned:false, lastFree:true, lastFrameTs:0, lastVideoTime:0, lastVideoTimeAt:Date.now(), readyAnnounced:false, sessionT:0, timer:null, wake:null, inferBusy:false, modelReady:false, modelBase:null, stream:null, track:null, torchOn:false, listening:false, recog:null, small:null, sctx:null, sw:0, sh:0, actx:null, voiceCount:0, vibCount:0, detCount:0, frames:0, roadOff:0, simLast:0, vibrate:(p)=>{}, toastFn:(m)=>{}, speakStart:0, micPaused:false, ttsBusy:false, ttsQueue:null, speakSeq:0, micStop:null, voice:null, autoVoice:false, knnNames:{}, freeSpeech:'Nenhum obstáculo reconhecido agora.', prefs:{}, idleVisible:false, introVisible:false, sheet:null, toast:{text:'',show:false} };
  const speeches=[];
  globalThis.speechSynthesis.speak = (u) => { if(u&&u.text&&u.text.trim()) speeches.push(u.text); if(u&&u.onend) u.onend(); };
  const refs = { root: globalThis.document.body, video: globalThis.document.body, overlay: globalThis.document.body, scene: globalThis.document.body };
  const ctrl = env.createController({ state, refs });
  state.toastFn = (m) => {};
  ctrl.handleCommand('parar');
  for(let i=0;i<3;i++){ await new Promise(r=>setTimeout(r,50)); }
  assert.ok(speeches.some(s=>/confirmar/i.test(s)), speeches.join(' | '));
  assert.strictEqual(state.running, true);
});
