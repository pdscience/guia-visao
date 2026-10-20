/* =========================================================
   GUIA VISÃO — motor assistivo
   Visão computacional (COCO-SSD) → classificação de risco →
   voz (TTS) + vibração + sonificação + comandos de voz (SR)
========================================================= */
const $ = s => document.querySelector(s);

const S = {
  mode:'idle',            // idle | live | sim
  running:false,
  model:null, modelReady:false, acc:false, modelBase:null,
  stream:null, track:null, torchOn:false,
  risk:0, closeness:0,
  dets:[], lastFree:true, freeSince:0,
  lastKey:'', lastSpoke:0, lastVib:0, lastPulse:0,
  tts:true, rate:1, vib:true, son:true, sens:1,
  listening:false, recog:null, autoVoice:true,
  stableKey:'', stableCount:0, lastPan:0, sosTimer:null, sosFired:false, lastTap:0,
  frames:0, detCount:0, voiceCount:0, vibCount:0, sessionT:0, timer:null,
  simItems:[], simLast:0,
  wake:null, inferBusy:false,
  knnOn:true, knnReady:false, knnCount:{},
  // diagnostico: ultimo erro de fala (TTS) e de inferencia (IA)
  ttsErr:null, ttsNoVoiceLogged:false, inferErr:null, inferErrLogged:false,
  // última detecção pessoal: {id, conf, ts}. A memória cobre a alternância de
  // frames do kNN (fix 2) e a fusão é refeita em TODO frame, não só no frame do kNN.
  personalHit:null,
};

const RISK_C = ['#9DF53C','#FFC53D','#FF4E3E'];
const RISK_T = ['LIVRE','ATENÇÃO','PERIGO'];

const LABELS = {
  person:'Pessoa', bicycle:'Bicicleta', car:'Carro', motorcycle:'Moto', airplane:'Avião', bus:'Ônibus', train:'Trem', truck:'Caminhão', boat:'Barco',
  'traffic light':'Semáforo', 'fire hydrant':'Hidrante', 'stop sign':'Placa de pare', 'parking meter':'Parquímetro', bench:'Banco',
  bird:'Pássaro', cat:'Gato', dog:'Cachorro', horse:'Cavalo', sheep:'Ovelha', cow:'Vaca', elephant:'Elefante', bear:'Urso', zebra:'Zebra', giraffe:'Girafa',
  backpack:'Mochila', umbrella:'Guarda-chuva', handbag:'Bolsa', tie:'Gravata', suitcase:'Mala', frisbee:'Frisbee', skis:'Esquis', snowboard:'Snowboard',
  'sports ball':'Bola', kite:'Pipa', 'baseball bat':'Taco de beisebol', 'baseball glove':'Luva de beisebol', skateboard:'Skate', surfboard:'Prancha', 'tennis racket':'Raquete de tênis',
  bottle:'Garrafa', 'wine glass':'Taça', cup:'Copo', fork:'Garfo', knife:'Faca', spoon:'Colher', bowl:'Tigela',
  banana:'Banana', apple:'Maçã', sandwich:'Sanduíche', orange:'Laranja', broccoli:'Brócolis', carrot:'Cenoura', 'hot dog':'Cachorro-quente', pizza:'Pizza', donut:'Rosquinha', cake:'Bolo',
  chair:'Cadeira', couch:'Sofá', 'potted plant':'Jardineira', bed:'Cama', 'dining table':'Mesa', toilet:'Vaso sanitário', tv:'Televisão',
  laptop:'Notebook', mouse:'Mouse', remote:'Controle remoto', keyboard:'Teclado', 'cell phone':'Celular', microwave:'Micro-ondas', oven:'Forno', toaster:'Torradeira', sink:'Pia',
  refrigerator:'Geladeira', book:'Livro', clock:'Relógio', vase:'Vaso de flor', scissors:'Tesoura', 'teddy bear':'Ursinho de pelúcia', 'hair drier':'Secador de cabelo', toothbrush:'Escova de dentes'
};
Vigia.init(LABELS);
const TALL = new Set(['person','dog','cat','horse','refrigerator','fire hydrant','traffic light','stop sign','parking meter']);
// viés de risco por tipo (pesquisa RNIB 2025 + survey Manduchi): veículos e
// pessoas se movem e causam dano maior; obstáculos de solo (mochila, mala,
// bola) são a principal causa de queda — 71% relatam calçada irregular
const RISK_BIAS = {
  person:1.2, bicycle:1.15, car:1.2, motorcycle:1.2, bus:1.2, truck:1.2, train:1.2,
  dog:1.1, horse:1.1,
  backpack:1.05, suitcase:1.05, 'sports ball':1.05,
};
const TYPES_SIM = ['person','car','chair','dog','backpack','box'];

/* ---------- boot ---------- */
const app = $('#app'), cam = $('#cam'), overlay = $('#overlay'), scene = $('#scene');
const octx = overlay.getContext('2d'), sctx = scene.getContext('2d');
let DPR = 1, VW = 0, VH = 0;

function resize(){
  DPR = Math.min(2, window.devicePixelRatio || 1);
  VW = app.clientWidth; VH = app.clientHeight;
  for(const c of [overlay, scene]){ c.width = VW*DPR; c.height = VH*DPR; }
  octx.setTransform(DPR,0,0,DPR,0,0); sctx.setTransform(DPR,0,0,DPR,0,0);
}
new ResizeObserver(resize).observe(app); resize();
lucide.createIcons();

/* ---------- telemetry + log ---------- */
const tbox = $('#telemetry');
function logEvent(kind, msg, tone='#9DF53C'){
  const t = new Date().toLocaleTimeString('pt-BR',{hour12:false});
  if(tbox){
    const li = document.createElement('li');
    const sT = document.createElement('span'); sT.className = 'text-white/30'; sT.textContent = t;
    const sK = document.createElement('span'); sK.style.color = tone; sK.textContent = kind;
    const sM = document.createElement('span'); sM.className = 'text-white/60'; sM.textContent = msg;
    li.append(sT, ' ', sK, ' ', sM);
    tbox.prepend(li);
    while(tbox.children.length>40) tbox.lastChild.remove();
  }
}
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2600); }

/* ---------- status / risk UI ---------- */
function setChip(status, fps){ $('#chipStatus').textContent = status; if(fps!==undefined) $('#chipFps').textContent = fps+' FPS'; }
function setRisk(level){
  S.risk = level;
  app.style.setProperty('--risk', RISK_C[level]);
  app.classList.toggle('danger-pulse', level===2);
  $('#riskTag').textContent = RISK_T[level];
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
  if(!S.listening || micPaused) return Promise.resolve();
  micPaused = true;
  if(!S.recog) return Promise.resolve();
  let finish;
  const p = new Promise(res=>{
    let done = false;
    finish = ()=>{ if(done) return; done = true; setTimeout(res, 150); };  // buffer após o end
  });
  micStop = { p, finish };
  p.then(()=>{ if(micStop && micStop.p === p) micStop = null; });
  // timeout: Android às vezes não emite 'end' — falar tarde do que calar
  setTimeout(finish, 700);
  try{ S.recog.stop(); }catch(e){ finish(); }
  return p;
}
function resumeMic(){
  if(!S.listening || !micPaused) return;
  micPaused = false;
  // respiro: o Android exige um intervalo entre stop() e start()
  setTimeout(()=>{ if(S.listening && !micPaused && S.recog){ try{ S.recog.start(); }catch(e){} } }, 350);
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
  u.lang = 'pt-BR'; u.rate = S.rate; u.pitch = 1; u.volume = 1;
  S.speakStart = performance.now();
  ttsBusy = true;
  // so o onend/onerror da fala ATUAL destrava: um cancel atrasado nao derruba a proxima
  u.onend = ()=>{ if(my===speakSeq){ S.speakStart=0; S.ttsErr=null; logEvent('VOZ','fim da fala ok','#4a5568'); finishSpeak(); } };
  u.onerror = (e)=>{
    if(my!==speakSeq) return;
    const err = (e && e.error) || 'erro desconhecido';
    S.ttsErr = err;
    const ms = S.speakStart ? Math.round(performance.now()-S.speakStart) : -1;
    const detalhe = ' · mic '+(S.listening?(micPaused?'pausado':'ativo'):'off')+' · '+ms+'ms · fala='+(speechSynthesis.speaking?'sim':'nao')+' · voz='+(voice?voice.name:'padrão');
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
    if(!getVoicesSafe().length && !S.ttsNoVoiceLogged){
      S.ttsNoVoiceLogged = true;
      logEvent('VOZ','nenhuma voz de síntese no navegador — instale espeak-ng/speech-dispatcher','#FF4E3E');
    }
    finishSpeak();
  };
  try{ speechSynthesis.speak(u); }
  catch(e){
    // se o speak() lançar, não deixa ttsBusy preso até o watchdog de 8s
    S.ttsErr = (e && (e.message || e.name)) || 'speak falhou';
    logEvent('VOZ','ERRO TTS: '+S.ttsErr+' (exceção ao falar)','#FF4E3E');
    ttsBusy = false; S.speakStart = 0;
    finishSpeak();
    return;
  }
  S.voiceCount++; $('#statVoice').textContent = S.voiceCount;
  logEvent('VOZ', text, '#9DF53C');
}
function finishSpeak(){
  S.speakStart = 0; ttsBusy = false;
  if(ttsQueue != null){
    const t = ttsQueue; ttsQueue = null;
    // o mic segue pausado até a última fala da fila terminar
    setTimeout(()=>{ pauseMic(); speakNow(t); }, 60);
    return;
  }
  resumeMic();
}
function speak(text, interrupt=false){
  $('#liveAlert').textContent = text;
  if(!S.tts || !('speechSynthesis' in window)) return;
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
  if(ttsBusy && S.speakStart && performance.now()-S.speakStart > 8000){
    const my = speakSeq;
    try{ speechSynthesis.cancel(); }catch(e){}
    // só força se a fala travada ainda for a atual (se o onend veio e uma
    // nova fala já começou, speakSeq mudou e este passo vira no-op)
    setTimeout(()=>{ if(ttsBusy && speakSeq === my){ speakSeq++; finishSpeak(); } }, 200);
    logEvent('VOZ','TTS destravado (watchdog)','#FFC53D');
  }
},1000);

/* ---------- vibração ---------- */
function vibrate(p){
  if(!S.vib || !navigator.vibrate) return;
  navigator.vibrate(p);
  S.vibCount++; $('#statVib').textContent = S.vibCount;
  logEvent('HAPTIC', 'padrão '+JSON.stringify(p), '#FFC53D');
}

/* ---------- sonificação (sensor de ré) ---------- */
let actx=null;
function beep(freq, dur=0.09, vol=0.14, pan=0){
  try{
    actx = actx || new (window.AudioContext||window.webkitAudioContext)();
    if(actx.state==='suspended') actx.resume();
    const o=actx.createOscillator(), g=actx.createGain(), t=actx.currentTime;
    o.type='sine'; o.frequency.value=freq;
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    if(actx.createStereoPanner){
      const p=actx.createStereoPanner(); p.pan.value=Math.max(-0.8,Math.min(0.8,pan));
      o.connect(g).connect(p).connect(actx.destination);
    } else {
      o.connect(g).connect(actx.destination);
    }
    o.start(t); o.stop(t+dur+0.02);
  }catch(e){}
}
setInterval(()=>{
  if(!S.running || !S.son || S.risk===0) return;
  const interval = 1250 - S.closeness*1000;          // 1250ms → 250ms
  if(performance.now()-S.lastPulse < interval) return;
  S.lastPulse = performance.now();
  beep(560 + S.closeness*520, 0.08, S.risk===2?0.18:0.1, S.lastPan||0);
},80);

/* ---------- motor de risco ---------- */
function enrich(p, sw, sh){
  const [x,y,w,h] = p.bbox;
  const cx = x + w/2;
  const area = (w*h)/(sw*sh), hr = h/sh;
  let score = area*2.4*S.sens*(RISK_BIAS[p.class]||1);
  if(TALL.has(p.class)) score = Math.max(score, hr*1.05*S.sens*(RISK_BIAS[p.class]||1));
  const risk = score>=0.5 ? 2 : score>=0.18 ? 1 : 0;
  const dir = cx/sw < .4 ? 'à esquerda' : cx/sw > .6 ? 'à direita' : 'à frente';
  const base = TALL.has(p.class) ? hr : Math.sqrt(area);
  let dist = Math.max(0.4, Math.min(9, 1.05/(base+0.03)));
  dist = dist<2 ? Math.round(dist*10)/10 : Math.round(dist);
  return { cls:p.class, nome:LABELS[p.class]||'Obstáculo', acc:Math.round(p.score*100), bbox:p.bbox, risk, score, dir, dist };
}
// fala com distância: o cego precisa dos metros para decidir o desvio
function phrase(d){
  const dist = (d.dist && d.dist!=='—') ? `${String(d.dist).replace('.',',')} metros, ` : '';
  const prio = Vigia.has(d.cls) ? 'Prioridade: ' : '';
  return `${prio}${d.nome} ${d.dir}, ${dist}${d.risk===2?'muito perto':d.risk===1?'perto':'à distância'}.`;
}

let lastDetTs = 0, lastSecSpoke = 0;
function processFrame(list, sw, sh){
  S.lastDets = list;
  drawOverlay(list, sw, sh);
  S.detCount += list.length;
  const top = list[0] || null;
  const isPri = top && Vigia.has(top.cls);
  const risk = top ? top.risk : 0;
  setRisk(risk);
  S.closeness = top ? Math.min(1, top.score/0.5) : 0;
  // pan espacial: esquerda -0.8 / centro 0 / direita +0.8
  S.lastPan = !top ? 0 : top.dir==='à esquerda' ? -0.8 : top.dir==='à direita' ? 0.8 : 0;

  const now = performance.now();

  if(top){
    lastDetTs = now; S.lastFree = false;
    $('#alertTitle').textContent = `${top.nome} ${top.dir}`;
    $('#alertSub').textContent = `${top.risk===2?'MUITO PERTO':top.risk===1?'PERTO':'À DISTÂNCIA'} · ≈ ${String(top.dist).replace('.',',')} m · ${top.acc}%`;
    $('#alertCard').setAttribute('aria-label','Repetir último alerta: '+(isPri?'Prioridade: ':'')+$('#alertTitle').textContent+'. '+$('#alertSub').textContent);
    $('#alertCard').style.outline = isPri ? '2px solid #FFC53D' : '';
    $('#alertCard').classList.remove('opacity-70');
    $('#alertIconOk').classList.toggle('hidden', risk!==0);
    $('#alertIconWarn').classList.toggle('hidden', risk!==1);
    $('#alertIconDanger').classList.toggle('hidden', risk!==2);

    const key = top.cls+top.dir+(top.risk>=1?top.risk:0);
    // histerese: exige 2 frames estáveis com a mesma chave antes de trocar o anúncio
    if(key===S.stableKey){ S.stableCount++; } else { S.stableKey=key; S.stableCount=1; }
    const stable = isPri ? S.stableCount>=1 : S.stableCount>=2;
    if(!stable && key!==S.lastKey) return;
    const isNew = key!==S.lastKey;
    if(top.risk===2){
      if((isNew && now-S.lastSpoke>800) || now-S.lastSpoke>5000){
        S.lastSpoke = now; S.lastKey = key;
        speak(phrase(top), true); vibrate([170,90,170]);
      } else if(isNew){ vibrate([170,90,170]); }
      else if(now - S.lastVib > 1300){ S.lastVib = now; vibrate([150,80,150]); }
    } else if(top.risk===1){
      if((isNew && now-S.lastSpoke>1200) || now-S.lastSpoke>6000){
        S.lastSpoke = now; S.lastKey = key;
        speak(phrase(top), isNew); vibrate(isPri?[90,60,90]:70);
      } else if(isNew){ vibrate(isPri?[90,60,90]:70); }
    } else {
      // risco 0 (distante): repete o nome a cada 8s (4s se prioridade)
      if((isNew && now-S.lastSpoke>2000) || now-S.lastSpoke>(isPri?4000:8000)){
        S.lastSpoke = now; S.lastKey = key;
        speak(phrase(top));
        if(isPri) vibrate(70);
      } else if(isPri && isNew){ vibrate(70); }
    }
    // segundo obstáculo: anuncia de tempos em tempos sem roubar o alerta principal
    const second = list.slice(1).find(d=>Vigia.has(d.cls)) || list[1];
    if(second && now-lastSecSpoke>7000 && now-S.lastSpoke>2500){
      lastSecSpoke = now;
      speak(Vigia.has(second.cls) ? phrase(second) : `Atenção: ${phrase(second)}`);
    }
  } else {
    // "caminho livre" só após 7s seguidos sem NADA (nem no bruto): evita
    // falso livre em celular lento, onde 2 frames perdidos já davam 4-8s de gap
    const rawEmpty = (S.lastRaw||{n:0}).n===0;
    if(!S.lastFree && rawEmpty && now - lastDetTs > 7000){
      S.lastFree = true; S.lastKey=''; S.stableKey=''; S.stableCount=0;
      $('#alertTitle').textContent = 'Caminho livre';
      $('#alertSub').textContent = 'NENHUM OBSTÁCULO À FRENTE';
      $('#alertCard').setAttribute('aria-label','Repetir último alerta: '+$('#alertTitle').textContent+'. '+$('#alertSub').textContent);
      $('#alertCard').style.outline = '';
      $('#alertCard').classList.add('opacity-70');
      $('#alertIconOk').classList.remove('hidden');
      $('#alertIconWarn').classList.add('hidden');
      $('#alertIconDanger').classList.add('hidden');
      speak('Caminho livre.');
      logEvent('LIVRE','nenhum obstáculo detectado');
    }
  }
}

/* ---------- desenho do HUD ---------- */
function coverTransform(sw, sh){
  const scale = Math.max(VW/sw, VH/sh);
  const dw = sw*scale, dh = sh*scale;
  return { x:(VW-dw)/2, y:(VH-dh)/2, s:scale };
}
function drawOverlay(list, sw, sh){
  octx.clearRect(0,0,VW,VH);
  if(!S.running) return;
  const t = S.mode==='sim' ? {x:0,y:0,s:1} : coverTransform(sw, sh);

  // terços (regra de composição, bem sutil)
  octx.strokeStyle='rgba(255,255,255,.05)'; octx.lineWidth=1;
  octx.beginPath();
  octx.moveTo(VW/3,20);octx.lineTo(VW/3,VH-20);octx.moveTo(2*VW/3,20);octx.lineTo(2*VW/3,VH-20);
  octx.stroke();

  const T = performance.now();
  for(const d of list.slice(0,5)){
    const c = RISK_C[d.risk];
    if(d.personal){
      // personal: só etiqueta central "NOME · %", sem cantos (bbox é tela cheia)
      const label = `${d.nome.toUpperCase()} · ${d.acc}%`;
      octx.font='700 12px "JetBrains Mono"';
      const tw = octx.measureText(label).width + 20;
      octx.fillStyle = c;
      roundRect(octx, VW/2-tw/2, 64, tw, 22, 8); octx.fill();
      octx.fillStyle = '#0a0d05';
      octx.fillText(label, VW/2-tw/2+10, 64+15);
      continue;
    }
    let [x,y,w,h] = d.bbox;
    if(S.mode!=='sim'){ x=x*t.s+t.x; y=y*t.s+t.y; w*=t.s; h*=t.s; }
    x=Math.max(4,x); y=Math.max(4,y); w=Math.min(VW-8,w); h=Math.min(VH-8,h);
    const k = Math.min(18, w/4, h/4);
    octx.lineWidth = d.risk===2 ? 3.5 + Math.sin(T/130)*1.2 : 3;
    octx.strokeStyle = c; octx.lineCap='round';
    octx.beginPath();
    octx.moveTo(x,y+k);octx.lineTo(x,y);octx.lineTo(x+k,y);
    octx.moveTo(x+w-k,y);octx.lineTo(x+w,y);octx.lineTo(x+w,y+k);
    octx.moveTo(x+w,y+h-k);octx.lineTo(x+w,y+h);octx.lineTo(x+w-k,y+h);
    octx.moveTo(x+k,y+h);octx.lineTo(x,y+h);octx.lineTo(x,y+h-k);
    octx.stroke();
    // etiqueta
    const label = `${d.nome.toUpperCase()} · ${d.acc}%`;
    octx.font='700 10px "JetBrains Mono"';
    const tw = octx.measureText(label).width + 16;
    const ly = y-24 < 8 ? y+8 : y-24;
    octx.fillStyle = c;
    roundRect(octx, x, ly, tw, 18, 6); octx.fill();
    octx.fillStyle = '#0a0d05';
    octx.fillText(label, x+8, ly+13);
  }
  // alvo central
  octx.strokeStyle='rgba(255,255,255,.14)'; octx.lineWidth=1.5;
  const cx=VW/2, cy=VH/2-40;
  octx.beginPath();octx.moveTo(cx-12,cy);octx.lineTo(cx+12,cy);octx.moveTo(cx,cy-12);octx.lineTo(cx,cy+12);octx.stroke();
}
function roundRect(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }

/* ---------- modo LIVE ---------- */
// carrega/recarrega o COCO-SSD no base escolhido no toggle "Precisão alta":
// lite_mobilenet_v2 = rapido (padrao) · mobilenet_v2 = mais preciso, ~2x mais lento
async function ensureModel(){
  const base = S.acc ? 'mobilenet_v2' : 'lite_mobilenet_v2';
  if(S.modelReady && S.modelBase === base) return;
  if(!window.cocoSsd) throw new Error('tf');
  const m = await cocoSsd.load({base});
  S.model = m; S.modelBase = base; S.modelReady = true;
  logEvent('IA','modelo COCO-SSD carregado ('+base+')');
}
async function startLive(){
  try{
    S.stream = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720} }, audio:false });
    if(!S.running){ S.stream.getTracks().forEach(t=>t.stop()); S.stream=null; return; }

    S.track = S.stream.getVideoTracks()[0];
    cam.srcObject = S.stream;
    await cam.play().catch(()=>{});
    // canvas reduzido p/ inferência: modelo interno é 300x300, 640px corta
    // a latência no celular sem mudar o mapeamento do overlay
    try{
      const sc = Math.min(1, 640/(cam.videoWidth||1280));
      S.sw = Math.round(cam.videoWidth*sc); S.sh = Math.round(cam.videoHeight*sc);
      S.small = document.createElement('canvas'); S.small.width = S.sw; S.small.height = S.sh;
      S.sctx = S.small.getContext('2d', { willReadFrequently:true });
    }catch(e){ S.small = null; }
    cam.classList.remove('opacity-0');
    S.mode='live';
    setChip('CÂMERA ATIVA');
    logEvent('CÂM','stream da câmera traseira iniciado');

    if(!S.modelReady){
      setChip('CARREGANDO MODELO');
      try{
        await ensureModel();
        toast('Visão computacional pronta');
      }catch(loadErr){
        console.warn(loadErr);
        if(!S.running) return;             // usuário parou durante o download
        if(!navigator.onLine){
          setChip('SEM MODELO');
          speak('Modelo ainda não baixado. Conecte uma vez à internet. Iniciando demonstração.', true);
          logEvent('IA','modelo sem cache, fallback simulação','#FF4E3E');
          startSim(); return;
        }
        // falha do modelo NÃO é falha de câmera: mensagem/estado próprios
        stopAll();
        setChip('SEM MODELO');
        speak('Não foi possível carregar o modelo de visão. Verifique a internet e tente de novo, ou diga demonstração.', true);
        toast('Falha ao carregar o modelo de visão — tente de novo ou diga demonstração');
        $('#liveStatus').textContent='Não foi possível carregar o modelo de visão. Tente novamente com internet ou diga demonstração.';
        $('#intro').classList.remove('away');
        logEvent('ERRO','falha ao carregar modelo COCO-SSD: '+((loadErr && loadErr.message) || loadErr),'#FF4E3E');
        return;
      }
    }
    if(!S.running) return;
    setChip('DETECTANDO');
    requestAnimationFrame(loopLive);
    // kNN pessoal carrega EM SEGUNDO PLANO: os pesos do MobileNet vêm da rede e
    // nunca podem segurar o rAF do COCO (fica tudo congelado até o load terminar).
    void (async ()=>{
      try{
        await MeuKNn.init();
        if(!S.running) return;
        S.knnReady = true; S.knnCount = MeuKNn.count();
        logEvent('IA','kNN pessoal pronto ('+Object.keys(S.knnCount).filter(k=>k!=='fundo').length+' obstáculos)');
      }catch(e){
        S.knnReady = false;
        console.warn('kNN pessoal indisponível:', e);
        logEvent('IA','kNN pessoal indisponível ('+(e && e.message || e)+') — detecção COCO segue normal','#FFC53D');
      }
    })();
  }catch(err){
    console.warn(err);
    if(!S.running) return;               // usuário parou enquanto a câmera abria
    stopAll();
    const negado = err && err.name === 'NotAllowedError';
    toast(negado ? 'Permissão de câmera negada — diga demonstração' : 'Câmera indisponível — diga demonstração');
    $('#liveStatus').textContent = negado ? 'Permita o acesso à câmera no navegador ou diga demonstração.' : 'Não foi possível acessar a câmera.';
    $('#intro').classList.remove('away');
    logEvent('ERRO', negado ? 'permissão de câmera negada' : 'acesso à câmera indisponível','#FF4E3E');
  }
}
let lastInfer=0, framesWin=0, fpsT=performance.now();
// ---------- kNN pessoal: inferência em 2º plano ----------
// O MobileNet leva ~200-400ms. Rodando dentro de S.inferBusy ele atrasava o
// alerta de COCO do MESMO frame (o processFrame() só era chamado depois dele).
// Aqui a inferência é AGENDADA antes do bloco de inferência do COCO, mas só
// EXECUTA num setTimeout(0) — ou seja, depois que o processFrame() do frame já falou.
let knnBusy=false, knnLast=0;
const KNN_GAP=340;        // ~1 inferência a cada 340ms (mesma cadência do "1 em 2 frames")
const PERSONAL_TTL=2000; // o hit pessoal continua válido 2s -> segura a histerese
function scheduleKnn(){
  if(knnBusy || !S.running || S.mode!=='live' || !S.knnOn || !S.knnReady) return;
  const now = performance.now();
  if(now - knnLast < KNN_GAP) return;
  knnBusy = true; knnLast = now;
  setTimeout(async ()=>{
    try{
      if(S.running && S.mode==='live' && S.knnOn && S.knnReady){
        const src = (S.small && S.small.width) ? S.small : cam;
        const p = await MeuKNn.predictTop(src);
        if(p) S.personalHit = { id:p.id, conf:p.conf, ts:performance.now() };
      }
    }catch(e){}
    finally{ knnBusy = false; }
  },0);
}
function currentPersonal(now){
  const h = S.personalHit;
  if(!h) return null;
  if(now - h.ts > PERSONAL_TTL){ S.personalHit = null; return null; }
  return h;
}
async function loopLive(){
  if(S.mode!=='live' || !S.running) return;
  const now = performance.now();
  // diagnóstico: câmera sem frames (permissão negada, track mutado ou tela preta)
  if(cam.readyState<2 || !cam.videoWidth){
    if(!S.noFrameSince) S.noFrameSince = now;
    if(now - S.noFrameSince > 5000 && !S.noFrameWarned){
      S.noFrameWarned = true;
      setChip('SEM IMAGEM');
      speak('Câmera sem imagem. Verifique a permissão da câmera no navegador.', true);
      logEvent('ERRO','câmera sem frames (readyState/videoWidth zerado)','#FF4E3E');
    }
  } else { S.noFrameSince = 0; if(S.noFrameWarned){ S.noFrameWarned = false; setChip('DETECTANDO'); } }
  // agenda a inferência do kNN ANTES do S.inferBusy: ela roda em background e
  // o alerta de COCO deste frame nunca espera pelo MobileNet
  scheduleKnn();
  if(cam.readyState>=2 && S.modelReady && !S.inferBusy && now-lastInfer>170){
    S.inferBusy = true; lastInfer = now;
    try{
      let src = cam, sw = cam.videoWidth, sh = cam.videoHeight;
      if(S.small && S.sctx && S.sw){ S.sctx.drawImage(cam, 0, 0, S.sw, S.sh); src = S.small; sw = S.sw; sh = S.sh; }
      const preds = await S.model.detect(src, 10, 0.35);
      let bt = null;
      for(const p of preds){ if(!bt || p.score>bt.score) bt = p; }
      S.lastRaw = { n:preds.length, top: bt ? (LABELS[bt.class]||bt.class)+' '+Math.round(bt.score*100)+'%' : 'nada' };
      let rel = preds.filter(p=>LABELS[p.class]).map(p=>enrich(p, sw, sh)).sort((a,b)=>b.score-a.score);
      // fusão em TODO frame (não só no frame do kNN): a memória S.personalHit
      // segura o hit entre inferências, então a histerese de 2 frames volta a ver
      // a MESMA key em frames consecutivos — senão o obstáculo pessoal nunca falava
      if(S.knnOn && S.knnReady){
        try{ rel = fusePersonal(rel, sw, sh, currentPersonal(performance.now())); }catch(e){}
      }
      processFrame(rel, sw, sh);
    }catch(e){
      // registra UMA vez o erro de inferencia (antes era engolido e o app
      // parecia "sem reconhecimento" sem nenhuma pista)
      S.inferErr = (e && (e.message || e.name)) || String(e);
      if(!S.inferErrLogged){ S.inferErrLogged = true; logEvent('ERRO','inferência falhou: '+S.inferErr,'#FF4E3E'); }
    }
    S.inferBusy=false;
  }
  framesWin++;
  if(now-fpsT>1000){
    setChip('DETECTANDO', framesWin);
    // chip tambem mostra quantos objetos a IA esta vendo AGORA (visivel no celular)
    $('#chipFps').textContent = framesWin+' FPS · '+(S.lastRaw?S.lastRaw.n:0)+' OBJ';
    framesWin=0; fpsT=now;
  }
  requestAnimationFrame(loopLive);
}

/* ---------- modo SIMULAÇÃO ---------- */
function startSim(){
  S.mode='sim';
  scene.classList.remove('opacity-0');
  if(!S.simItems.length){
    for(let i=0;i<3;i++) spawnSim(Math.random()*0.6+0.1);
  }
  setChip('SIMULAÇÃO');
  logEvent('DEMO','cenário virtual em movimento');
  requestAnimationFrame(simTick);
}
function spawnSim(z=0.05){
  const cls = TYPES_SIM[Math.floor(Math.random()*TYPES_SIM.length)];
  S.simItems.push({ cls, lane:(Math.random()*2-1)*0.8, z, vz:0.0011+Math.random()*0.0016,
    wob:Math.random()*Math.PI*2, id:Math.random().toString(36).slice(2) });
}
function simScene(dt){
  // fundo: rua noturna estilizada
  const g = sctx.createLinearGradient(0,0,0,VH);
  g.addColorStop(0,'#0a0d14'); g.addColorStop(.45,'#0d1018'); g.addColorStop(1,'#05060a');
  sctx.fillStyle=g; sctx.fillRect(0,0,VW,VH);
  const hz = VH*0.42;
  // céu: brilho urbano
  const glow = sctx.createRadialGradient(VW/2,hz,10,VW/2,hz,VW*0.8);
  glow.addColorStop(0,'rgba(157,245,60,.07)'); glow.addColorStop(1,'transparent');
  sctx.fillStyle=glow; sctx.fillRect(0,0,VW,VH);
  // prédios
  sctx.fillStyle='#10131b';
  for(let i=0;i<6;i++){ const bw=VW/6; sctx.fillRect(i*bw+3, hz-60-((i*37)%70), bw-6, 60+((i*37)%70)); }
  // rua
  sctx.beginPath();
  sctx.moveTo(VW/2-26,hz); sctx.lineTo(VW/2+26,hz); sctx.lineTo(VW*0.94,VH); sctx.lineTo(VW*0.06,VH);
  sctx.closePath(); sctx.fillStyle='#14171d'; sctx.fill();
  sctx.strokeStyle='rgba(157,245,60,.28)'; sctx.lineWidth=2;
  sctx.beginPath(); sctx.moveTo(VW/2-24,hz); sctx.lineTo(VW*0.07,VH); sctx.moveTo(VW/2+24,hz); sctx.lineTo(VW*0.93,VH); sctx.stroke();
  // faixas em movimento
  S.roadOff = ((S.roadOff||0) + dt*0.00055)%1;
  sctx.fillStyle='rgba(255,255,255,.35)';
  for(let i=0;i<6;i++){
    const t=((i/6)+S.roadOff)%1, e=t*t;
    const y=hz+(VH-hz)*e, w=2+e*8, h=4+e*30;
    sctx.fillRect(VW/2-w/2, y, w, h);
  }
}
function simPict(item){
  const hz=VH*0.42, e=item.z*item.z;
  const roadHalf = 24 + (VW*0.45-24)*e;
  const x = VW/2 + item.lane*roadHalf;
  const y = hz + (VH*0.92-hz)*e;
  const s = (0.10+e*1.5)*(VH*0.30);
  sctx.save(); sctx.translate(x,y);
  sctx.fillStyle='rgba(226,232,240,.92)';
  if(item.cls==='person'){
    sctx.beginPath(); sctx.arc(0,-s*0.42,s*0.13,0,7); sctx.fill();
    roundRect(sctx,-s*0.16,-s*0.3,s*0.32,s*0.6,s*0.14); sctx.fill();
  } else if(item.cls==='car'){
    roundRect(sctx,-s*0.62,-s*0.36,s*1.24,s*0.66,s*0.16); sctx.fill();
    sctx.fillStyle='rgba(20,24,32,.9)';
    roundRect(sctx,-s*0.4,-s*0.52,s*0.8,s*0.3,s*0.12); sctx.fill();
    sctx.fillStyle='rgba(226,232,240,.92)';
    roundRect(sctx,-s*0.62,-s*0.36,s*1.24,s*0.66,s*0.16); sctx.globalAlpha=.92; sctx.fill(); sctx.globalAlpha=1;
    sctx.fillStyle='rgba(20,24,32,.9)'; roundRect(sctx,-s*0.4,-s*0.52,s*0.8,s*0.3,s*0.12); sctx.fill();
  } else if(item.cls==='dog'){
    roundRect(sctx,-s*0.34,-s*0.18,s*0.68,s*0.34,s*0.16); sctx.fill();
    sctx.beginPath(); sctx.arc(s*0.38,-s*0.24,s*0.13,0,7); sctx.fill();
  } else if(item.cls==='chair'){
    sctx.fillRect(-s*0.3,-s*0.55,s*0.6,s*0.08); sctx.fillRect(-s*0.3,-s*0.5,s*0.07,s*0.8); sctx.fillRect(s*0.23,-s*0.5,s*0.07,s*0.8); sctx.fillRect(-s*0.32,-s*0.12,s*0.64,s*0.07);
  } else { // mochila / caixa
    roundRect(sctx,-s*0.28,-s*0.4,s*0.56,s*0.7,s*0.1); sctx.fill();
  }
  sctx.restore();
  // bbox em "pixels de fonte" para o pipeline
  const bw = item.cls==='car'? s*1.3 : item.cls==='dog'? s*0.85 : s*0.62;
  const bh = item.cls==='car'? s*0.9 : item.cls==='dog'? s*0.55 : s*1.06;
  return { x:x-bw/2, y:y-bh+(item.cls==='chair'?s*0.1:0), w:bw, h:bh };
}
function simTick(ts){
  if(S.mode!=='sim' || !S.running) return;
  const dt = Math.min(50, ts-(S.simLast||ts)); S.simLast = ts;
  simScene(dt);
  const preds=[];
  for(const it of S.simItems){
    it.z += it.vz*dt*16*0.06 + dt*0.00016;
    it.wob += dt*0.001; it.lane += Math.sin(it.wob)*0.0008;
    if(it.z>0.98){ Object.assign(it, {z:0.05, lane:(Math.random()*2-1)*0.8, cls:TYPES_SIM[Math.floor(Math.random()*TYPES_SIM.length)]}); }
    if(it.z>0.16){
      const b = simPict(it);
      preds.push({ class: it.cls==='box'?'suitcase':it.cls, score:.75+Math.random()*.2, bbox:[b.x,b.y,Math.max(8,b.w),Math.max(8,b.h)] });
    }
  }
  if(S.simItems.length<3 && Math.random()<0.01) spawnSim();
  S.lastRaw = { n:preds.length, top:preds[0] ? preds[0].class : 'nada' };
  const rel = preds.map(p=>enrich(p,VW,VH)).sort((a,b)=>b.score-a.score);
  processFrame(rel, VW, VH);
  requestAnimationFrame(simTick);
}

/* ---------- start / stop ---------- */
function triggerSOS(){
  unlockAudio();
  vibrate([300,150,300,150,500]);
  beep(880, 0.15, 0.18, 0); setTimeout(()=>beep(880,0.15,0.18,0),250);
  speak('Pedindo ajuda. Atenção ao redor. Se possível, peça apoio a alguém próximo.', true);
  $('#liveStatus').textContent = 'SOS acionado pelo usuário.';
  logEvent('SOS','pedido de ajuda acionado','#FF4E3E');
  toast('SOS acionado — som e vibração de alerta');
}
async function start(mode){
  if(S.running) return;
  S.running = true;
  S.prefMode = mode;
  S.stableKey=''; S.stableCount=0;
  S.lastFree = true; lastDetTs = performance.now();
  app.classList.add('running');
  $('#idleState').style.display='none';
  $('#intro').classList.add('away');
  $('#btnMain').classList.add('stop');
  $('#btnMain').setAttribute('aria-pressed','true');
  $('#btnMain').setAttribute('aria-label','Parar detecção. Segure por 2 segundos para pedir ajuda.');
  $('#icPlay').classList.add('hidden'); $('#icStop').classList.remove('hidden');
  $('#mainLabel').textContent='PARAR';
  S.sessionT = 0;
  clearInterval(S.timer);
  S.timer = setInterval(()=>{ S.sessionT++;
    const m=String(Math.floor(S.sessionT/60)).padStart(2,'0'), s=String(S.sessionT%60).padStart(2,'0');
    const el=$('#statTime'); if(el) el.textContent=`${m}:${s}`;
  },1000);
  // wakeLock pode demorar/pendurar em alguns navegadores: nunca bloqueia o start
  try{
    const wl = navigator.wakeLock?.request('screen');
    if(wl && typeof wl.then === 'function'){
      wl.then(w=>{ if(S.running) S.wake = w; else { try{ w.release(); }catch(e){} } }).catch(()=>{});
    }
  }catch(e){}
  // mic primeiro, fala depois: speak() pausa a escuta durante a fala (bug Android TTS×mic)
  if(S.autoVoice && !S.listening){ setListening(true, true); }
  speak(mode==='live' ? 'Guia Visão ativado. Boa caminhada.' : 'Modo demonstração ativado.', true);
  if(mode==='live') startLive(); else startSim();
  logEvent('START', mode==='live'?'detecção via câmera':'modo demonstração');
}
function stopAll(){
  S.running=false; S.mode='idle';
  app.classList.remove('running'); app.classList.remove('danger-pulse');
  S.inferBusy=false;
  if(S.stream){ S.stream.getTracks().forEach(t=>t.stop()); S.stream=null; S.track=null; }
  cam.classList.add('opacity-0'); scene.classList.add('opacity-0');
  octx.clearRect(0,0,VW,VH);
  setTorch(false,true);
  setRisk(0); setChip('PRONTO','--');
  $('#idleState').style.display='grid';
  $('#btnMain').classList.remove('stop');
  $('#btnMain').setAttribute('aria-pressed','false');
  $('#btnMain').setAttribute('aria-label','Iniciar detecção de obstáculos');
  $('#icPlay').classList.remove('hidden'); $('#icStop').classList.add('hidden');
  $('#mainLabel').textContent='INICIAR';
  $('#alertTitle').textContent='Caminho livre';
  $('#alertSub').textContent='NENHUM OBSTÁCULO À FRENTE';
  $('#alertCard').setAttribute('aria-label','Repetir último alerta: '+$('#alertTitle').textContent+'. '+$('#alertSub').textContent);
  $('#alertCard').classList.add('opacity-70');
  $('#alertIconOk').classList.remove('hidden');
  $('#alertIconWarn').classList.add('hidden');
  $('#alertIconDanger').classList.add('hidden');
  clearInterval(S.timer);
  if(S.wake){ try{S.wake.release();}catch(e){} S.wake=null; }
  S.lastDets=[]; S.stableKey=''; S.stableCount=0; S.lastPan=0; S.closeness=0; S.noFrameSince=0; S.noFrameWarned=false; S.lastFree=true; S.lastRaw={n:0,top:'nada'}; S.small=null; S.personalHit=null;
  logEvent('STOP','detecção pausada','#FFC53D');
}

/* ---------- descrever cena ---------- */
function diagnose(){
  const r = S.lastRaw || {n:0, top:'nada ainda'};
  const v = (cam.videoWidth||0)+' por '+(cam.videoHeight||0);
  const kp = Object.keys(S.knnCount||{}).filter(k=>k!=='fundo').length;
  const voz = voice ? voice.name : 'padrão do sistema';
  const tts = !('speechSynthesis' in window) ? 'indisponível' : (ttsBusy ? 'ocupado' : 'livre');
  const linha = `modelo=${S.modelReady?(S.modelBase||'?'):'não carregado'} video=${v} raw=${r.n} top=${r.top} knn=${kp} tts=${tts} errVoz=${S.ttsErr||'-'} errIA=${S.inferErr||'-'} voz=${voz} mic=${S.listening?'on':'off'}${micPaused?'(pausado)':''}`;
  speak(`Diagnóstico. Modelo ${S.modelReady?(S.modelBase||'desconhecido'):'não carregado'}. Vídeo ${v}. Análise bruta: ${r.n} detecções, melhor: ${r.top}. ${kp} obstáculos pessoais. Voz: ${voz}. TTS: ${tts}. Último erro de voz: ${S.ttsErr||'nenhum'}. Último erro de visão: ${S.inferErr||'nenhum'}.`, true);
  logEvent('DIAG', linha);
  toast(linha); // no celular a telemetria nao aparece: o toast leva tudo junto
}
async function describe(){
  const list = S.lastDets || [];
  const local = !list.length
    ? 'Nenhum obstáculo detectado à frente. Caminho livre.'
    : `À sua frente: ${list.slice(0,3).map(d=>`${d.nome} ${d.dir}${d.dist?`, aproximadamente ${String(d.dist).replace('.',',')} metros`:''}`).join('. ')}.`;
  if(!CloudVision.available()){ speak(local, true); logEvent('DESC','local (nuvem indisponível): ' + local); return; }
  const src = (S.mode==='live') ? ((S.small && S.small.width) ? S.small : cam) : scene;
  toast('Perguntando à nuvem…');
  const r = await CloudVision.describe(src, list);
  if(r.ok){ speak(r.text, true); logEvent('DESC','nuvem: '+r.text); }
  else { speak(local+' Nuvem: '+r.err+'.', true); logEvent('DESC','nuvem falhou ('+r.err+'), usando local','#FFC53D'); }
}
/* ---------- lanterna ---------- */
async function setTorch(on, silent=false){
  S.torchOn = on;
  const btn = $('#btnTorch');
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on?'Desativar lanterna':'Ativar lanterna');
  if(S.track && S.track.getCapabilities && S.track.getCapabilities().torch){
    try{ await S.track.applyConstraints({advanced:[{torch:on}]}); }catch(e){}
  } else if(!silent){ toast('Lanterna disponível apenas com a câmera ativa'); }
  if(!silent){ logEvent('LUZ', on?'lanterna ligada':'lanterna desligada'); speak(on?'Lanterna ligada.':'Lanterna desligada.'); }
}

/* ---------- comandos de voz ---------- */
function setupRecognition(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR) return null;
  const r = new SR();
  r.lang='pt-BR'; r.continuous=true; r.interimResults=false; r.maxAlternatives=1;
  r.onresult = e=>{
    const txt = e.results[e.results.length-1][0].transcript.toLowerCase().trim();
    logEvent('OUVIU', '"'+txt+'"', '#8ab4ff');
    handleCommand(txt);
  };
  r.onerror = e=>{ if(e.error==='not-allowed'){ toast('Permita o microfone para usar comandos de voz'); setListening(false); } };
  r.onend = ()=>{ if(micStop) micStop.finish(); if(S.listening && !micPaused){ setTimeout(()=>{ if(S.listening && !micPaused){ try{ r.start(); }catch(e){} } }, 280); } };
  return r;
}
function setListening(on, quiet=false){
  S.listening = on;
  const b = $('#btnVoice');
  b.classList.toggle('listening', on);
  b.setAttribute('aria-pressed', String(on));
  if(on){
    if(!S.recog){ S.recog = setupRecognition(); }
    if(!S.recog){ toast('Reconhecimento de voz não suportado neste navegador'); S.listening=false; b.classList.remove('listening'); return; }
    const kick = ()=>{ try{ S.recog.start(); }catch(e){} logEvent('MIC','reconhecimento de voz ativado'); };
    if(!quiet){
      // fala ANTES de abrir o mic: se o recognition arrancar junto, o Android
      // engole a fala. 1500ms cobre o anúncio "Escutando…" antes do start().
      speak('Escutando. Diga um comando.');
      setTimeout(kick, 1500);
    } else { kick(); }
    toast('Escutando comandos de voz…');
  } else {
    micPaused = false;
    if(S.recog){ try{ S.recog.stop(); }catch(e){} }
    if(!quiet) speak('Comandos de voz desativados.');
  }
}
function handleCommand(t){
  // palavra/frase inteira: "sossegado" não dispara SOS e "acena" não é "cena"
  const has = (...ws)=>falaTem(t, ...ws);
  if(has('socorro','sos','emergência','emergencia','ajuda urgente')){ triggerSOS(); }
  else if(has('vigiar','lista de vigilância','lista de vigilancia','o que estou vigiando')){ handleVigia(t); }
  else if(has('parar','pare','pausar','desligar','stop')){ if(S.running){ stopAll(); speak('Detecção pausada.'); } else speak('A detecção já está pausada.'); }
  else if(has('iniciar','inicia','iniciando','começar','comeca','comece','ligar')){ if(!S.running) start('live'); else speak('A detecção já está ativa.'); }
  else if(has('demonstração','demonstracao','demonstra','demo','simulação','simulacao','simula','simular')){ if(!S.running) start('sim'); else speak('Já estou em funcionamento.'); }
  else if(has('frente','descreva','descreve','descrever','descrição','descricao','o que tem','o que há','o que ha','cena')){ describe(); }
  else if(has('repetir','repete')){ speak($('#liveAlert').textContent || 'Nenhum alerta recente.', true); }
  else if(has('lanterna','luz','flash')){ setTorch(!S.torchOn); }
  else if(has('rápido','rapido')){ setRate(Math.min(1.5,S.rate+0.15)); speak('Fala mais rápida.'); }
  else if(has('devagar','lento','lenta')){ setRate(Math.max(0.6,S.rate-0.15)); speak('Fala mais devagar.'); }
  else if(has('diagnóstico','diagnostico','status do sistema')){ diagnose(); }
  else if(has('ajuda','comandos')){ speak('Você pode dizer: iniciar, parar, o que tem à frente, repetir, vigiar, lista de vigilância, lanterna, diagnóstico, mais rápido, mais devagar.', true); openSheet('sheetHelp'); }
  else { speak('Comando não reconhecido. Diga ajuda para ouvir as opções.', true); }
}

/* ---------- lista de vigilância (prioridade nos alertas) ---------- */
function handleVigia(t){
  const n = vigiaNorm(t);
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

/* ---------- sheets ---------- */
const backdrop = $('#backdrop');
let openId = null;
function openSheet(id){
  closeSheets();
  openId = id;
  $('#'+id).classList.add('open');
  backdrop.classList.add('open');
  $('#'+id).focus({preventScroll:true});
}
function closeSheets(){
  document.querySelectorAll('.sheet').forEach(s=>s.classList.remove('open'));
  backdrop.classList.remove('open');
  openId = null;
}
backdrop.addEventListener('click', closeSheets);
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click', closeSheets));
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeSheets(); });

/* ---------- bindings ---------- */
function repeatAlert(){
  unlockAudio();
  speak($('#liveAlert').textContent || ($('#alertTitle').textContent + '. ' + $('#alertSub').textContent), true);
}
$('#btnMain').addEventListener('click', ()=>{
  unlockAudio();
  // o clique que vem depois de segurar 2s pertence ao SOS, não alterna a detecção
  if(S.sosFired){ S.sosFired = false; return; }
  if(S.running){ stopAll(); speak('Detecção pausada.'); } else { start(S.prefMode||'live'); }
});
// segurar 2s no botão principal = SOS (sem interferir no clique simples)
$('#btnMain').addEventListener('pointerdown', ()=>{
  S.sosFired = false;
  clearTimeout(S.sosTimer);
  S.sosTimer = setTimeout(()=>{ S.sosFired = true; triggerSOS(); S.sosTimer=null; }, 2000);
});
['pointerup','pointerleave','pointercancel'].forEach(ev=>$('#btnMain').addEventListener(ev, ()=>clearTimeout(S.sosTimer)));
$('#btnVoice').addEventListener('click', ()=>{ unlockAudio(); setListening(!S.listening); });
$('#btnSettings').addEventListener('click', ()=>openSheet('sheetSettings'));
$('#btnMyObst').addEventListener('click', ()=>{ renderMyObst(); openSheet('sheetObst'); });
$('#btnHelp').addEventListener('click', ()=>openSheet('sheetHelp'));
$('#btnTorch').addEventListener('click', ()=>{ unlockAudio(); setTorch(!S.torchOn); });
$('#alertCard').addEventListener('click', repeatAlert);
// duplo-toque em qualquer lugar repete o último alerta (toque cego)
app.addEventListener('pointerup', (e)=>{
  const now = Date.now();
  if(now - S.lastTap < 350){
    if(S.running || $('#liveAlert').textContent){ repeatAlert(); }
    S.lastTap = 0;
  } else { S.lastTap = now; }
});
$('#btnStartCam').addEventListener('click', (e)=>{ e.stopPropagation(); unlockAudio(); start('live'); });
// tocar em qualquer lugar da intro ativa a câmera
$('#intro').addEventListener('click', (e)=>{
  if(!$('#intro').classList.contains('away')){ unlockAudio(); start('live'); }
});

function unlockAudio(){
  try{ actx = actx || new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==='suspended') actx.resume(); }catch(e){}
  // utterance silenciosa só para destravar o TTS no gesto do usuário; não
  // atropela uma fala em curso (o estado ttsBusy é a fonte de verdade)
  if('speechSynthesis' in window && !ttsBusy){
    try{ const u=new SpeechSynthesisUtterance(' '); u.volume=0; speechSynthesis.speak(u); }catch(e){}
  }
}

/* settings */
const PREFS_KEY = 'guia-visao-prefs';
function readPrefs(){
  try{ const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); return (p && typeof p === 'object') ? p : {}; }
  catch(e){ return {}; }
}
function savePrefs(){
  try{
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      tts:S.tts, autoVoice:S.autoVoice, vib:S.vib, son:S.son, knnOn:S.knnOn,
      acc:S.acc, sens:S.sens, rate:S.rate,
      hc:document.body.classList.contains('hc'),
      big:document.body.classList.contains('bigtype'),
    }));
  }catch(e){}
}
function setRate(v){
  S.rate = Math.round(v*100)/100;
  $('#rateVal').textContent = S.rate.toFixed(1)+'×';
  $('#rgRate').value = S.rate;
  paintRange($('#rgRate'));
  savePrefs();
}
function paintRange(el){ const p=(el.value-el.min)/(el.max-el.min)*100; el.style.setProperty('--fill',p+'%'); }
function applyPrefs(){
  const p = readPrefs();
  for(const k of ['tts','autoVoice','vib','son','knnOn','acc']){
    if(typeof p[k] === 'boolean') S[k] = p[k];
  }
  if(typeof p.sens === 'number' && p.sens >= 0.6 && p.sens <= 1.7) S.sens = p.sens;
  if(typeof p.rate === 'number' && p.rate >= 0.6 && p.rate <= 1.5) S.rate = Math.round(p.rate*100)/100;
  const hc = p.hc === true, big = p.big === true;
  document.body.classList.toggle('hc', hc);
  document.body.classList.toggle('bigtype', big);
  $('#swVoice').checked = S.tts;
  $('#swAutoVoice').checked = S.autoVoice;
  $('#swVib').checked = S.vib;
  $('#swSon').checked = S.son;
  $('#swKNn').checked = S.knnOn;
  $('#swAcc').checked = S.acc;
  $('#swHC').checked = hc;
  $('#swBig').checked = big;
  $('#rgSens').value = S.sens;
  paintRange($('#rgSens'));
  $('#sensVal').textContent = S.sens<0.9?'BAIXA':S.sens>1.3?'ALTA':'NORMAL';
  setRate(S.rate);
}
applyPrefs();
$('#rgRate').addEventListener('input', e=>{ setRate(+e.target.value); });
$('#rgSens').addEventListener('input', e=>{
  S.sens=+e.target.value; paintRange(e.target);
  $('#sensVal').textContent = S.sens<0.9?'BAIXA':S.sens>1.3?'ALTA':'NORMAL';
  savePrefs();
});
$('#swVoice').addEventListener('change', e=>{ S.tts=e.target.checked; if(S.tts) speak('Voz ativada.'); logEvent('CFG', 'voz '+(S.tts?'on':'off')); savePrefs(); });
$('#swAutoVoice').addEventListener('change', e=>{ S.autoVoice=e.target.checked; logEvent('CFG','escuta automática '+(S.autoVoice?'on':'off')); if(S.autoVoice && !S.listening && S.running) setListening(true,true); if(!S.autoVoice && S.listening) setListening(false,true); savePrefs(); });
$('#swVib').addEventListener('change', e=>{ S.vib=e.target.checked; if(S.vib) vibrate(60); logEvent('CFG','vibração '+(S.vib?'on':'off')); savePrefs(); });
$('#swSon').addEventListener('change', e=>{ S.son=e.target.checked; if(S.son) beep(880); logEvent('CFG','sonificação '+(S.son?'on':'off')); savePrefs(); });
$('#swKNn').addEventListener('change', e=>{ S.knnOn=e.target.checked; if(!S.knnOn) S.personalHit=null; logEvent('CFG','meus obstáculos '+(S.knnOn?'on':'off')); savePrefs(); });
$('#swAcc').addEventListener('change', async e=>{
  S.acc = e.target.checked;
  savePrefs();
  logEvent('CFG','precisão alta '+(S.acc?'on':'off'));
  if(!window.cocoSsd){ toast('Modelo de IA indisponível'); return; }
  const b = S.acc?'mobilenet_v2':'lite_mobilenet_v2';
  toast('Trocando modelo para '+b+'…');
  setChip('TROCANDO MODELO');
  const antes = S.modelBase;              // base em uso antes da troca
  S.modelReady = false;                   // o loop pausa a inferência durante o load
  try{
    await ensureModel();
    toast('Modelo '+b+' ativo');
    if(S.running && S.mode==='live') setChip('DETECTANDO');
  }catch(err){
    // falhou: volta ao modelo anterior (S.model não foi sobrescrito)
    S.acc = (antes==='mobilenet_v2'); $('#swAcc').checked = S.acc;
    savePrefs();
    S.modelReady = !!S.model;
    toast('Falha ao trocar modelo — mantendo o anterior');
    logEvent('ERRO','troca de modelo falhou ('+((err&&err.message)||err)+')','#FF4E3E');
  }
});
$('#swCloud').addEventListener('change', e=>{
  CloudVision.setEnabled(e.target.checked);
  if(e.target.checked && !CloudVision.getKey()){ toast('Cole a chave da API no campo abaixo'); speak('Ativado, mas falta a chave. Cole a chave da API no campo abaixo.'); }
  else { speak(e.target.checked?'IA na nuvem ativada.':'IA na nuvem desativada.'); }
  logEvent('CFG','ia nuvem '+(e.target.checked?'on':'off'));
});
$('#cloudKey').addEventListener('change', e=>{
  CloudVision.setKey(e.target.value.trim());
  toast(CloudVision.getKey() ? 'Chave salva neste aparelho' : 'Chave removida');
});
$('#swHC').addEventListener('change', e=>{ document.body.classList.toggle('hc', e.target.checked); speak(e.target.checked?'Alto contraste ativado.':'Alto contraste desativado.'); savePrefs(); });
$('#swBig').addEventListener('change', e=>{ document.body.classList.toggle('bigtype', e.target.checked); speak(e.target.checked?'Texto ampliado.':'Texto normal.'); savePrefs(); });
$('#swCloud').checked = CloudVision.isEnabled(); $('#cloudKey').value = CloudVision.getKey();

/* stats */
setInterval(()=>{
  const el=$('#statDet'); if(el) el.textContent = Math.round(S.detCount);
  S.detCount = 0;
},60000);

/* wake lock re-acquire */
document.addEventListener('visibilitychange', async ()=>{
  if(document.visibilityState==='visible' && S.running){ try{ S.wake = await navigator.wakeLock?.request('screen'); }catch(e){} }
});

/* greeting + support notes */
logEvent('SYS','Guia Visão inicializado');
if(!navigator.mediaDevices?.getUserMedia) { toast('Este navegador não suporta câmera — diga demonstração'); logEvent('SYS','getUserMedia indisponível','#FF4E3E'); }
if(!window.cocoSsd) logEvent('SYS','modelo de IA não carregou (verifique a rede)','#FF4E3E');
setTimeout(()=>{ if(!('speechSynthesis' in window)) logEvent('SYS','TTS indisponível','#FF4E3E'); },300);
// boot falado: foca a intro e anuncia instruções para quem não enxerga
setTimeout(()=>{
  const intro = $('#intro');
  if(!intro || intro.classList.contains('away')) return;
  try{ intro.focus({preventScroll:true}); }catch(e){}
  $('#liveStatus').textContent = 'Guia Visão pronto. Toque em qualquer lugar para ativar a câmera, ou diga iniciar.';
  if('speechSynthesis' in window){
    speak('Guia Visão pronto. Toque em qualquer lugar da tela para ativar a câmera. Você também pode dizer: iniciar. Para simular sem câmera, diga demonstração.', false);
  }
}, 900);

// debug handle (offline shell; sem alterar lógica)
window.GuiaVisao = { S };

/* ---------- PWA: service worker + offline (Task 3, append-only) ---------- */
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').then(r=>{r.onupdatefound=()=>{const n=r.installing;n.onstatechange=()=>{if(n.state==='installed'&&navigator.serviceWorker.controller){window.__SW_UPDATE__=true;toast('Nova versão disponível — recarregue');}};};}).catch(()=>{});});}
function setOfflineUI(off){S.offline=off;const c=$('#chipOffline');if(c)c.classList.toggle('hidden',!off);}
setOfflineUI(!navigator.onLine);
window.addEventListener('offline',()=>{setOfflineUI(true);$('#liveStatus').textContent='Modo offline. Detecção usa modelo em cache.';toast('MODO OFFLINE — usando cache');});
window.addEventListener('online',()=>{setOfflineUI(false);toast('Conexão restaurada');});
