export function createSpeech(state){
  function logEvent(kind, msg, tone){
    try{
      if(!state.telemetry) state.telemetry = [];
      state.telemetry.unshift({ kind, msg, tone, t: new Date().toLocaleTimeString('pt-BR',{hour12:false}) });
      if(state.telemetry.length > 40) state.telemetry.length = 40;
    }catch(e){}
  }
/* ---------- voz (TTS) ---------- */
// Estado próprio de fala: o Android Chrome mente sobre speechSynthesis.speaking
// (fica preso em true), então NÃO confiamos na API — confiamos em ttsBusy.
// Android/Chrome também emite o TTS mudo enquanto o SpeechRecognition está ativo,
// então o microfone é pausado durante a fala e só volta em finishSpeak.
let voice = null;
let ttsBusy = false, ttsQueue = null, micPaused = false, speakSeq = 0, micStop = null;
function getVoicesSafe(){
  try{ return speechSynthesis.getVoices() || []; }catch(e){ return []; }
}
function escolherVoz(vs){
  return vs.find(v=>/pt[-_]BR/i.test(v.lang)) || vs.find(v=>v.lang && v.lang.toLowerCase().startsWith('pt')) || null;
}
function pickVoice(){
  const vs = getVoicesSafe();
  voice = escolherVoz(vs);
  logEvent('VOZ','vozes do sistema: '+vs.length+' · escolhida: '+(voice?voice.name:'padrão'),'#8ab4ff');
}
// no Linux o catálogo pode chegar depois do load: espera as vozes antes do retry
function esperarVozes(cb, max=1200){
  if(getVoicesSafe().length) return cb();
  let done=false;
  const fim=()=>{ if(done) return; done=true; cb(); };
  const t=setTimeout(fim, max);
  try{
    speechSynthesis.addEventListener('voiceschanged', ()=>{
      if(getVoicesSafe().length){ clearTimeout(t); fim(); }
    }, {once:true});
  }catch(e){}
}
if('speechSynthesis' in window){ pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function pauseMic(){
  // promessa: resolve só quando o reconhecimento TERMINAR de liberar o áudio.
  // speak() espera por ela — falar antes disso dá synthesis-failed no Android.
  if(micStop) return micStop.p;
  if(!state.listening || micPaused) return Promise.resolve();
  micPaused = true;
  if(!state.recog) return Promise.resolve();
  let finish;
  const p = new Promise(res=>{
    let done = false;
    finish = ()=>{ if(done) return; done = true; setTimeout(res, 150); };  // buffer após o end
  });
  micStop = { p, finish };
  p.then(()=>{ if(micStop && micStop.p === p) micStop = null; });
  // timeout: Android às vezes não emite 'end' — falar tarde do que calar
  setTimeout(finish, 700);
  try{ state.recog.stop(); }catch(e){ finish(); }
  return p;
}
function resumeMic(){
  if(!state.listening || !micPaused) return;
  micPaused = false;
  // respiro: o Android exige um intervalo entre stop() e start()
  setTimeout(()=>{ if(state.listening && !micPaused && state.recog){ try{ state.recog.start(); }catch(e){} } }, 350);
}
function speakNow(text, retry=false){
  const my = ++speakSeq;
  const u = new SpeechSynthesisUtterance(text);
  // a voz é escolhida no momento da fala: no Linux o catálogo chega atrasado
  const vs = getVoicesSafe();
  if(vs.length) voice = escolherVoz(vs);
  if(voice){
    // voz inválida (catálogo trocou) não pode derrubar a fala: deixa o engine escolher
    try{ u.voice = voice; }catch(e){ voice = null; }
  }
  u.lang = 'pt-BR'; u.rate = state.rate; u.pitch = 1; u.volume = 1;
  state.speakStart = performance.now();
  ttsBusy = true;
  // so o onend/onerror da fala ATUAL destrava: um cancel atrasado nao derruba a proxima
  u.onend = ()=>{ if(my===speakSeq){ state.speakStart=0; state.ttsErr=null; logEvent('VOZ','fim da fala ok','#4a5568'); finishSpeak(); } };
  u.onerror = (e)=>{
    if(my!==speakSeq) return;
    const err = (e && e.error) || 'erro desconhecido';
    state.ttsErr = err;
    const ms = state.speakStart ? Math.round(performance.now()-state.speakStart) : -1;
    const detalhe = ' · mic '+(state.listening?(micPaused?'pausado':'ativo'):'off')+' · '+ms+'ms · fala='+(speechSynthesis.speaking?'sim':'nao')+' · voz='+(voice?voice.name:'padrão');
    if(err==='synthesis-failed' && !retry){
      logEvent('VOZ','ERRO TTS: '+err+detalhe+' — tentando de novo','#FFC53D');
      // invalida callbacks desta tentativa e espera o catálogo de vozes carregar
      const seq = ++speakSeq;
      try{ speechSynthesis.cancel(); }catch(e){}
      esperarVozes(()=>{
        // respiro mínimo após o cancel: falar no mesmo tick volta a falhar
        setTimeout(()=>{
          if(seq !== speakSeq) return;   // outra fala assumiu
          speakNow(text, true);
        }, 250);
      });
      return;
    }
    logEvent('VOZ','ERRO TTS: '+err+detalhe,'#FF4E3E');
    if(!getVoicesSafe().length && !state.ttsNoVoiceLogged){
      state.ttsNoVoiceLogged = true;
      logEvent('VOZ','nenhuma voz de síntese no navegador — instale espeak-ng/speech-dispatcher','#FF4E3E');
    }
    finishSpeak();
  };
  try{ speechSynthesis.speak(u); }
  catch(e){
    // se o speak() lançar, não deixa ttsBusy preso até o watchdog de 8s
    state.ttsErr = (e && (e.message || e.name)) || 'speak falhou';
    logEvent('VOZ','ERRO TTS: '+state.ttsErr+' (exceção ao falar)','#FF4E3E');
    ttsBusy = false; state.speakStart = 0;
    finishSpeak();
    return;
  }
  state.voiceCount++; state.stats = state.stats || {}; state.stats.voice = state.voiceCount;
  logEvent('VOZ', text, '#9DF53C');
}
function finishSpeak(){
  state.speakStart = 0; ttsBusy = false;
  if(ttsQueue != null){
    const t = ttsQueue; ttsQueue = null;
    // o mic segue pausado até a última fala da fila terminar
    setTimeout(()=>{ pauseMic(); speakNow(t); }, 60);
    return;
  }
  resumeMic();
}
function speak(text, interrupt=false){
  state.liveAlert = text;
  if(!state.tts || !('speechSynthesis' in window)) return;
  const micReady = pauseMic();
  if(interrupt){
    ttsQueue = text;
    try{ speechSynthesis.cancel(); }catch(e){}
    logEvent('VOZ','(cancel)','#4a5568');
    // cancel()+speak() imediato silencia o Android; se o onend do cancel não
    // vier (outro bug Android), este fallback fala a fila após 120ms
    setTimeout(()=>{
      if(ttsQueue == null) return;
      // invalida o onend atrasado da fala cancelada antes de destravar na mao
      if(ttsBusy){ try{ speechSynthesis.cancel(); }catch(e){} speakSeq++; logEvent('VOZ','fala travada, destravada apos 120ms','#FFC53D'); finishSpeak(); }
      if(!ttsBusy && ttsQueue != null){
        const t = ttsQueue; ttsQueue = null;
        micReady.then(()=>{
          if(ttsBusy){ if(ttsQueue == null) ttsQueue = t; return; }
          pauseMic(); speakNow(t);
        });
      }
    },120);
    return;
  }
  if(ttsBusy){ ttsQueue = text; logEvent('VOZ','na fila (outra fala em curso)','#FFC53D'); return; }  // uma fala por vez: pendente substitui a anterior
  micReady.then(()=>{
    if(ttsBusy){ ttsQueue = text; logEvent('VOZ','na fila (outra fala em curso)','#FFC53D'); return; }
    pauseMic(); speakNow(text);
  });
}
// watchdog: destrava TTS travado "falando" para nunca calar o app
setInterval(()=>{
  if(!('speechSynthesis' in window)) return;
  if(ttsBusy && state.speakStart && performance.now()-state.speakStart > 8000){
    const my = speakSeq;
    try{ speechSynthesis.cancel(); }catch(e){}
    // só força se a fala travada ainda for a atual (se o onend veio e uma
    // nova fala já começou, speakSeq mudou e este passo vira no-op)
    setTimeout(()=>{ if(ttsBusy && speakSeq === my){ speakSeq++; finishSpeak(); } }, 200);
    logEvent('VOZ','TTS destravado (watchdog)','#FFC53D');
  }
},1000);

  return { speak, speakNow, pauseMic, resumeMic, pickVoice, getVoicesSafe };
}
