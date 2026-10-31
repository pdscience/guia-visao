/* src/core/controller.js — orquestração + efeitos do navegador (sem Vue, sem DOM render). */
import { createSpeech } from './speech.js';
import { createVision } from './vision.js';
import { ObstDB, MeuKNn, startTraining, fusePersonal, PRESETS } from './obstacles.js';
import { CloudVision } from './cloud.js';
import { Safety } from '../engine/safety.js';
import { Vigia } from '../engine/vigia.js';
import { LABELS } from '../engine/labels.js';

export function createController({ state, refs }){
  const root = (refs && refs.root) || null;
  const video = (refs && refs.video) || null;
  const overlay = (refs && refs.overlay) || null;
  const scene = (refs && refs.scene) || null;

  const speech = createSpeech(state);
  const speak = speech.speak;
  const vision = createVision(state, { root, video, overlay, scene }, speech);

  // vibrate helper wired into state
  state.vibrate = (p) => {
    if(!state.vib || !navigator.vibrate) return;
    navigator.vibrate(p);
    state.vibCount = (state.vibCount||0)+1;
    state.stats = state.stats || {}; state.stats.vib = state.vibCount;
  };
  state.freeSpeech = Safety.freeSpeech();

  // wake lock etc. handled in start
  state.simItems = state.simItems || [];
  state.telemetry = state.telemetry || [];
  state.alert = state.alert || { title:'Detecção pausada', sub:'SEM ANÁLISE', tag:'PARADO', icon:'ok', aria:'Detecção pausada. Sem análise.', outline:'', dim:true };
  state.chip = state.chip || { status:'PRONTO', fps:'-- FPS', offline:false };
  state.main = state.main || { pressed:false, label:'INICIAR', stop:false };
  state.stats = state.stats || { det:0, voice:0, vib:0, time:'00:00' };

  function logEvent(kind, msg, tone){ vision.logEvent(kind, msg, tone); }

  function setTorch(on, silent=false){
    state.torchOn = on;
    if(state.track && state.track.getCapabilities && state.track.getCapabilities().torch){
      try{ state.track.applyConstraints({advanced:[{torch:on}]}); }catch(e){}
    } else if(!silent){ (state.toastFn||(()=>{}))('Lanterna disponível apenas com a câmera ativa'); }
    if(!silent){ logEvent('LUZ', on?'lanterna ligada':'lanterna desligada'); speak(on?'Lanterna ligada.':'Lanterna desligada.'); }
  }

  function setListening(on, quiet=false){
    state.listening = on;
    if(on){
      if(!state.recog){
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if(!SR){ (state.toastFn||(()=>{}))('Reconhecimento de voz não suportado neste navegador'); state.listening=false; return; }
        const r = new SR();
        r.lang='pt-BR'; r.continuous=true; r.interimResults=false; r.maxAlternatives=1;
        r.onresult = e=>{ const txt = e.results[e.results.length-1][0].transcript.toLowerCase().trim(); logEvent('OUVIU', '"'+txt+'"', '#8ab4ff'); handleCommand(txt); };
        r.onerror = e=>{ if(e.error==='not-allowed'){ (state.toastFn||(()=>{}))('Permita o microfone para usar comandos de voz'); setListening(false); } };
        r.onend = ()=>{ if(state.micStop) state.micStop.finish(); if(state.listening && !state.micPaused){ setTimeout(()=>{ if(state.listening && !state.micPaused){ try{ r.start(); }catch(e){} } }, 280); } };
        state.recog = r;
      }
      const kick = ()=>{ try{ state.recog.start(); }catch(e){} logEvent('MIC','reconhecimento de voz ativado'); };
      if(!quiet){ speak('Escutando. Diga um comando.'); setTimeout(kick, 1500); }
      else { kick(); }
      (state.toastFn||(()=>{}))('Escutando comandos de voz…');
    } else {
      state.micPaused = false;
      if(state.recog){ try{ state.recog.stop(); }catch(e){} }
      if(!quiet) speak('Comandos de voz desativados.');
    }
  }

  function handleCommand(t){
    const now = performance.now();
    const age = state.pendingCmd ? now - state.pendingAt : 0;
    const d = Safety.voiceDecision(t, { pending: state.pendingCmd, pendingAge: age });
    if(d.action === 'cancel'){
      state.pendingCmd = null; state.pendingAt = 0;
      speak(Safety.cancelledSpeech(), true);
      logEvent('VOZ','comando cancelado','#FFC53D');
      return;
    }
    if(d.action === 'confirm-required'){
      state.pendingCmd = { text: d.text, kind: d.kind };
      state.pendingAt = now;
      speak(d.prompt, true);
      logEvent('VOZ','confirmação necessária: '+d.kind,'#FFC53D');
      return;
    }
    if(d.action === 'confirm'){
      const p = d.pending || state.pendingCmd;
      state.pendingCmd = null; state.pendingAt = 0;
      if(p) executeCommand(p.text);
      return;
    }
    state.pendingCmd = null; state.pendingAt = 0;
    executeCommand(d.text);
  }

  function executeCommand(t){
    const has = (...ws) => {
      // falaTem from vigia module
      const n = (typeof vigiaNorm !== 'undefined') ? vigiaNorm(t) : t;
      return ws.some(w => (' '+n+' ').includes(' '+w+' '));
    };
    if(has('socorro','sos','emergência','emergencia','ajuda urgente')){ triggerSOS(); }
    else if(has('vigiar','lista de vigilância','lista de vigilancia','o que estou vigiando')){ handleVigia(t); }
    else if(has('parar','pare','pausar','desligar','stop')){ if(state.running){ stopAll(); speak('Detecção pausada.'); } else speak('A detecção já está pausada.'); }
    else if(has('iniciar','inicia','iniciando','começar','comeca','comece','ligar')){ if(!state.running) start('live'); else speak('A detecção já está ativa.'); }
    else if(has('demonstração','demonstracao','demonstra','demo','simulação','simulacao','simula','simular')){ if(!state.running) start('sim'); else speak('Já estou em funcionamento.'); }
    else if(has('frente','descreva','descreve','descrever','descrição','descricao','o que tem','o que há','o que ha','cena')){ describe(); }
    else if(has('repetir','repete')){ speak(state.liveAlert || (state.alert.title + '. ' + state.alert.sub), true); }
    else if(has('lanterna','luz','flash')){ setTorch(!state.torchOn); }
    else if(has('rápido','rapido')){ setRate(Math.min(1.5,state.rate+0.15)); speak('Fala mais rápida.'); }
    else if(has('devagar','lento','lenta')){ setRate(Math.max(0.6,state.rate-0.15)); speak('Fala mais devagar.'); }
    else if(has('diagnóstico','diagnostico','status do sistema')){ diagnose(); }
    else if(has('ajuda','comandos')){ speak('Você pode dizer: guia visão iniciar, guia visão parar, guia visão socorro, o que tem à frente, repetir, vigiar, lista de vigilância, lanterna, diagnóstico, mais rápido, mais devagar.', true); openSheet('sheetHelp'); }
    else { speak('Comando não reconhecido. Diga ajuda para ouvir as opções.', true); }
  }

  function handleVigia(t){
    const n = (typeof vigiaNorm !== 'undefined') ? vigiaNorm(t) : t;
    if(n.includes('lista de vigilancia') || n.includes('o que estou vigiando')){
      const l = Vigia.all().map(c=>LABELS[c]||c);
      speak(l.length ? 'Na lista de vigilância: '+l.join(', ')+'.' : 'A lista de vigilância está vazia.', true);
      logEvent('VIGIA','lista: '+(l.length ? l.join(', ') : 'vazia'));
      return;
    }
    const rm = n.match(/(?:^| )(?:parar de vigiar|deixar de vigiar|nao vigiar(?: mais)?)\s+(.+)$/);
    if(rm){
      const nome = rm[1].trim();
      const cls = Vigia.findByName(nome);
      if(!cls){ speak('Não conheço "'+nome+'". Diga lista de vigilância para ouvir o que está marcado.', true); return; }
      if(Vigia.remove(cls)){ speak(LABELS[cls]+' saiu da lista de vigilância.'); logEvent('VIGIA','- '+LABELS[cls]); }
      else speak(LABELS[cls]+' não estava na lista.');
      return;
    }
    const add = n.match(/(?:^| )vigiar\s+(.+)$/);
    if(add){
      const nome = add[1].trim();
      const cls = Vigia.findByName(nome);
      if(!cls){
        speak('Não conheço "'+nome+'". Vigiar funciona com objetos que a câmera já reconhece — por exemplo: pessoa, cachorro, bicicleta, carro, cavalo, cadeira.', true);
        return;
      }
      if(Vigia.add(cls)){ speak(LABELS[cls]+' entrou na lista de vigilância. Agora recebe prioridade nos alertas.'); logEvent('VIGIA','+ '+LABELS[cls]); }
      else speak(LABELS[cls]+' já está na lista de vigilância.');
      return;
    }
    speak('Para vigiar, diga: vigiar cachorro. Para parar: parar de vigiar cachorro. Para ouvir a lista: lista de vigilância.', true);
  }

  function setRate(v){
    state.rate = Math.round(v*100)/100;
    state.rateVal = state.rate.toFixed(1)+'×';
    if(state.rgRate) state.rgRate.value = state.rate;
  }

  function openSheet(id){
    closeSheets();
    state.sheet = id;
  }
  function closeSheets(){
    state.sheet = null;
  }

  function triggerSOS(){
    // unlock audio
    try{ state.actx = state.actx || new (window.AudioContext||window.webkitAudioContext)(); if(state.actx.state==='suspended') state.actx.resume(); }catch(e){}
    (state.vibrate||(()=>{}))([300,150,300,150,500]);
    try{ speech.beep?speech.beep(880,0.15,0.18,0):null; }catch(e){}
    setTimeout(()=>{ try{ speech.beep?speech.beep(880,0.15,0.18,0):null; }catch(e){} },250);
    speak(Safety.sosSpeech(), true);
    state.liveStatus = 'Alarme local de emergência acionado. Nenhuma chamada foi feita.';
    logEvent('SOS','alarme local acionado (sem chamada)','#FF4E3E');
    (state.toastFn||(()=>{}))('Alarme local — nenhuma chamada feita');
  }

  function hideIntro(){ state.introVisible = false; }
  function showIntro(){ state.introVisible = true; }

  function announceReady(){
    if(state.readyAnnounced) return;
    if(!state.running || state.mode !== 'live' || !state.modelReady || !state.lastFrameTs) return;
    state.readyAnnounced = true;
    speak(Safety.readySpeech(), true);
    (state.vibrate||(()=>{}))([80,60,80]);
    state.liveStatus = 'Detecção ativa.';
    state.alert = state.alert || {};
    state.alert.title='Detecção ativa';
    state.alert.sub='MONITORANDO';
    state.alert.tag='ATIVO';
    state.alert.aria='Detecção ativa. Monitorando.';
    state.alert.dim=false;
    state.alert.icon='ok';
    logEvent('START','detecção ativa (primeiro frame válido)','#9DF53C');
  }

  function onCameraLost(reason){
    if(!state.running || state.mode !== 'live') return;
    logEvent('ERRO','câmera perdida: '+reason,'#FF4E3E');
    (state.vibrate||(()=>{}))([250,120,250,120,450]);
    speak(Safety.cameraLostSpeech(), true);
    stopAll();
    setChip('SEM CÂMERA');
  }

  async function start(mode){
    if(state.running) return;
    state.running = true;
    state.startedOnce = true;
    state.prefMode = mode;
    state.readyAnnounced = false; state.lastFrameTs = 0;
    state.lastVideoTime = 0; state.lastVideoTimeAt = performance.now();
    state.resumeOnVisible = false;
    state.pendingCmd = null; state.pendingAt = 0;
    state.stableKey=''; state.stableCount=0;
    state.lastFree = true; state.lastDetTs = performance.now();
    state.runningClass = true;
    state.idleVisible = false;
    state.alert = state.alert || {};
    state.alert.title='Ativando detecção';
    state.alert.sub='AGUARDE A CÂMERA';
    state.alert.tag='PREPARANDO';
    state.alert.aria='Ativando detecção. Aguarde a câmera.';
    state.alert.dim=true;
    hideIntro();
    state.main.pressed = true;
    state.main.stop = true;
    state.main.label = 'PARAR';
    state.sessionT = 0;
    if(state.timer) clearInterval(state.timer);
    state.timer = setInterval(()=>{ state.sessionT++; const m=String(Math.floor(state.sessionT/60)).padStart(2,'0'), s=String(state.sessionT%60).padStart(2,'0'); state.stats = state.stats || {}; state.stats.time = `${m}:${s}`; },1000);
    // wake lock
    try{
      const wl = navigator.wakeLock?.request('screen');
      if(wl && typeof wl.then === 'function'){
        wl.then(w=>{ if(state.running) state.wake = w; else { try{ w.release(); }catch(e){} } }).catch(()=>{});
      }
    }catch(e){}
    if(state.autoVoice && !state.listening){ setListening(true, true); }
    speak(mode==='live' ? Safety.startSpeech() : 'Modo demonstração ativado.', true);
    if(mode==='live') vision.startLive(); else vision.startSim();
    logEvent('START', mode==='live'?'detecção via câmera':'modo demonstração');
  }

  function stopAll(){
    state.running=false; state.mode='idle';
    state.runningClass = false;
    state.dangerPulse = false;
    if(state.stream){ state.stream.getTracks().forEach(t=>t.stop()); state.stream=null; state.track=null; }
    if(video){ video.classList && video.classList.add('opacity-0'); }
    if(scene){ scene.classList && scene.classList.add('opacity-0'); }
    if(overlay){ const octx = overlay.getContext('2d'); octx && octx.clearRect(0,0, (overlay.width||0), (overlay.height||0)); }
    setTorch(false,true);
    setRisk(0); setChip('PRONTO','--');
    state.idleVisible = true;
    state.main.pressed = false;
    state.main.stop = false;
    state.main.label = 'INICIAR';
    state.alert = { title:'Detecção pausada', sub:'SEM ANÁLISE', tag:'PARADO', icon:'ok', aria:'Detecção pausada. Sem análise.', outline:'', dim:true };
    if(state.timer) clearInterval(state.timer);
    state.timer = null;
    if(state.wake){ try{state.wake.release();}catch(e){} state.wake=null; }
    state.lastDets=[]; state.stableKey=''; state.stableCount=0; state.lastPan=0; state.closeness=0; state.noFrameSince=0; state.noFrameWarned=false; state.lastFree=true; state.lastRaw={n:0,top:'nada'}; state.small=null; state.personalHit=null;
    state.readyAnnounced=false; state.lastFrameTs=0; state.lastVideoTime=0; state.lastVideoTimeAt=0;
    state.pendingCmd=null; state.pendingAt=0; state.resumeOnVisible=false;
    logEvent('STOP','detecção pausada','#FFC53D');
  }

  function describe(){
    const gate = Safety.canDescribe(state, performance.now());
    if(gate !== 'ok'){
      const msg = Safety.describeBlocked(gate);
      speak(msg, true);
      logEvent('DESC','descrição bloqueada ('+gate+')','#FFC53D');
      return;
    }
    const list = state.lastDets || [];
    const local = !list.length
      ? Safety.freeSpeech()
      : `À sua frente: ${list.slice(0,3).map(d=>`${d.nome} ${d.dir}${d.dist?`, aproximadamente ${String(d.dist).replace('.',',')} metros`:''}`).join('. ')}.`;
    if(!CloudVision.available()){ speak(local, true); logEvent('DESC','local (nuvem indisponível): ' + local); return; }
    const src = (state.mode==='live') ? ((state.small && state.small.width) ? state.small : video) : scene;
    (state.toastFn||(()=>{}))('Perguntando à nuvem…');
    CloudVision.describe(src, list).then(r=>{
      if(r.ok){ speak(r.text, true); logEvent('DESC','nuvem: '+r.text); }
      else { speak(local+' Nuvem: '+r.err+'.', true); logEvent('DESC','nuvem falhou ('+r.err+'), usando local','#FFC53D'); }
    });
  }

  function diagnose(){
    const r = state.lastRaw || {n:0, top:'nada ainda'};
    const v = (video && video.videoWidth||0)+' por '+(video && video.videoHeight||0);
    const kp = Object.keys(state.knnCount||{}).filter(k=>k!=='fundo').length;
    const voz = (state.voice) ? state.voice.name : 'padrão do sistema';
    const tts = !('speechSynthesis' in window) ? 'indisponível' : (state.ttsBusy ? 'ocupado' : 'livre');
    const linha = `modelo=${state.modelReady?(state.modelBase||'?'):'não carregado'} video=${v} raw=${r.n} top=${r.top} knn=${kp} tts=${tts} errVoz=${state.ttsErr||'-'} errIA=${state.inferErr||'-'} voz=${voz}`;
    speak(`Diagnóstico. Modelo ${state.modelReady?(state.modelBase||'desconhecido'):'não carregado'}. Vídeo ${v}. Análise bruta: ${r.n} detecções, melhor: ${r.top}. ${kp} obstáculos pessoais.`, true);
    logEvent('DIAG', linha);
    (state.toastFn||(()=>{}))(linha);
  }

  function repeatAlert(){
    speak(state.liveAlert || (state.alert.title + '. ' + state.alert.sub), true);
  }

  function unlockAudio(){
    try{ state.actx = state.actx || new (window.AudioContext||window.webkitAudioContext)(); if(state.actx.state==='suspended') state.actx.resume(); }catch(e){}
    if('speechSynthesis' in window && !state.ttsBusy){
      try{ const u=new SpeechSynthesisUtterance(' '); u.volume=0; speechSynthesis.speak(u); }catch(e){}
    }
  }

  // wire vision's internal callbacks
  state.onCameraLost = onCameraLost;
  // expose vision internals used by tests
  state.startLive = () => vision.startLive();
  state.stopAll = stopAll;

  // visibility handling
  if(typeof document !== 'undefined'){
    document.addEventListener('visibilitychange', async ()=>{
      if(document.visibilityState === 'hidden'){
        if(state.running){
          state.resumeMode = state.mode;
          if(state.listening) setListening(false, true);
          stopAll();
          state.resumeOnVisible = true;
        }
        return;
      }
      if(document.visibilityState !== 'visible') return;
      try{ if(state.actx && state.actx.state === 'suspended') await state.actx.resume(); }catch(e){}
      if(state.resumeOnVisible){
        const mode = state.resumeMode || 'live';
        state.resumeOnVisible = false;
        start(mode);
        return;
      }
    });
  }

  // boot
  state.knnCount = state.knnCount || {};
  state.lastDets = state.lastDets || [];
  state.personalHit = null;
  state.ttsNoVoiceLogged = false;
  state.inferErrLogged = false;
  state.lastRaw = state.lastRaw || {n:0, top:'nada'};

  const api = {
    S: state,
    start, stopAll, describe, handleCommand, triggerSOS, setListening,
    setTorch, setRate, openSheet, closeSheets, repeatAlert, unlockAudio,
    diagnose, handleVigia, announceReady, onCameraLost,
    startLive: vision.startLive, loopLive: vision.loopLive,
    startSim: vision.startSim, simTick: vision.simTick,
  };
  if(typeof window !== 'undefined'){ window.GuiaVisao = api; }
  return api;
}
