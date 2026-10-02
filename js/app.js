/* =========================================================
   GUIA VISÃO — motor assistivo
   Visão computacional (COCO-SSD) → classificação de risco →
   voz (TTS) + vibração + sonificação + comandos de voz (SR)
========================================================= */
const $ = s => document.querySelector(s);

const S = {
  mode:'idle',            // idle | live | sim
  running:false,
  model:null, modelReady:false,
  stream:null, track:null, torchOn:false,
  risk:0, closeness:0,
  dets:[], lastFree:true, freeSince:0,
  lastKey:'', lastSpoke:0, lastVib:0, lastPulse:0,
  tts:true, rate:1, vib:true, son:true, sens:1,
  listening:false, recog:null, autoVoice:true,
  stableKey:'', stableCount:0, lastPan:0, sosTimer:null, lastTap:0,
  frames:0, detCount:0, voiceCount:0, vibCount:0, sessionT:0, timer:null,
  simItems:[], simLast:0,
  wake:null, inferBusy:false,
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
  chair:'Cadeira', couch:'Sofá', 'potted plant':'Planta', bed:'Cama', 'dining table':'Mesa', toilet:'Vaso sanitário', tv:'Televisão',
  laptop:'Notebook', mouse:'Mouse', remote:'Controle remoto', keyboard:'Teclado', 'cell phone':'Celular', microwave:'Micro-ondas', oven:'Forno', toaster:'Torradeira', sink:'Pia',
  refrigerator:'Geladeira', book:'Livro', clock:'Relógio', vase:'Vaso de flor', scissors:'Tesoura', 'teddy bear':'Ursinho de pelúcia', 'hair drier':'Secador de cabelo', toothbrush:'Escova de dentes'
};
const TALL = new Set(['person','dog','cat','horse','refrigerator','fire hydrant']);
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
    li.innerHTML = `<span class="text-white/30">${t}</span> <span style="color:${tone}">${kind}</span> <span class="text-white/60">${msg}</span>`;
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
let voice = null;
function pickVoice(){
  const vs = speechSynthesis.getVoices();
  voice = vs.find(v=>/pt[-_]BR/i.test(v.lang)) || vs.find(v=>v.lang && v.lang.toLowerCase().startsWith('pt')) || null;
}
if('speechSynthesis' in window){ pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text, interrupt=false){
  $('#liveAlert').textContent = text;
  if(!S.tts || !('speechSynthesis' in window)) return;
  if(interrupt) speechSynthesis.cancel();
  if(speechSynthesis.speaking && !interrupt) return;
  const u = new SpeechSynthesisUtterance(text);
  if(voice) u.voice = voice;
  u.lang = 'pt-BR'; u.rate = S.rate; u.pitch = 1; u.volume = 1;
  speechSynthesis.speak(u);
  S.voiceCount++; $('#statVoice').textContent = S.voiceCount;
  logEvent('VOZ', text, '#9DF53C');
}

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
  let score = area*2.4*S.sens;
  if(TALL.has(p.class)) score = Math.max(score, hr*1.05*S.sens);
  const risk = score>=0.5 ? 2 : score>=0.18 ? 1 : 0;
  const dir = cx/sw < .4 ? 'à esquerda' : cx/sw > .6 ? 'à direita' : 'à frente';
  const base = TALL.has(p.class) ? hr : Math.sqrt(area);
  let dist = Math.max(0.4, Math.min(9, 1.05/(base+0.03)));
  dist = dist<2 ? Math.round(dist*10)/10 : Math.round(dist);
  return { cls:p.class, nome:LABELS[p.class]||'Obstáculo', acc:Math.round(p.score*100), bbox:p.bbox, risk, score, dir, dist };
}
function phrase(d){ return `${d.nome} ${d.dir}, ${d.risk===2?'muito perto':d.risk===1?'perto':'à distância'}.`; }

let lastDetTs = 0;
function process(list, sw, sh){
  drawOverlay(list, sw, sh);
  S.detCount += list.length;
  const top = list[0] || null;
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
    $('#alertCard').setAttribute('aria-label','Repetir último alerta: '+$('#alertTitle').textContent+'. '+$('#alertSub').textContent);
    $('#alertCard').classList.remove('opacity-70');
    $('#alertIconOk').classList.toggle('hidden', risk!==0);
    $('#alertIconWarn').classList.toggle('hidden', risk!==1);
    $('#alertIconDanger').classList.toggle('hidden', risk!==2);

    const key = top.cls+top.dir+(top.risk>=1?top.risk:0);
    // histerese: exige 2 frames estáveis com a mesma chave antes de trocar o anúncio
    if(key===S.stableKey){ S.stableCount++; } else { S.stableKey=key; S.stableCount=1; }
    const stable = S.stableCount>=2;
    if(!stable && key!==S.lastKey) return;
    if(top.risk===2){
      if(now - S.lastSpoke > 2400 && (key!==S.lastKey || now-S.lastSpoke>5000)){
        S.lastSpoke = now; S.lastKey = key;
        speak(phrase(top), true); vibrate([170,90,170]);
      } else if(now - S.lastVib > 1300){ S.lastVib = now; vibrate([150,80,150]); }
    } else if(top.risk===1){
      if((key!==S.lastKey && now-S.lastSpoke>3000) || now-S.lastSpoke>6000){
        S.lastSpoke = now; S.lastKey = key;
        speak(phrase(top));
        if(navigator.vibrate && S.vib) navigator.vibrate(70);
      }
    } else {
      // risco 0 (distante): repete o nome a cada 8s enquanto estiver visível
      if((key!==S.lastKey && now-S.lastSpoke>4000) || now-S.lastSpoke>8000){
        S.lastSpoke = now; S.lastKey = key;
        speak(phrase(top));
      }
    }
  } else {
    if(!S.lastFree && now - lastDetTs > 4000){
      S.lastFree = true; S.lastKey=''; S.stableKey=''; S.stableCount=0;
      $('#alertTitle').textContent = 'Caminho livre';
      $('#alertSub').textContent = 'NENHUM OBSTÁCULO À FRENTE';
      $('#alertCard').setAttribute('aria-label','Repetir último alerta: '+$('#alertTitle').textContent+'. '+$('#alertSub').textContent);
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
    let [x,y,w,h] = d.bbox;
    if(S.mode!=='sim'){ x=x*t.s+t.x; y=y*t.s+t.y; w*=t.s; h*=t.s; }
    x=Math.max(4,x); y=Math.max(4,y); w=Math.min(VW-8,w); h=Math.min(VH-8,h);
    const c = RISK_C[d.risk];
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
async function startLive(){
  try{
    S.stream = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720} }, audio:false });
    if(!S.running){ S.stream.getTracks().forEach(t=>t.stop()); S.stream=null; return; }

    S.track = S.stream.getVideoTracks()[0];
    cam.srcObject = S.stream;
    await cam.play().catch(()=>{});
    cam.classList.remove('opacity-0');
    S.mode='live';
    setChip('CÂMERA ATIVA');
    logEvent('CÂM','stream da câmera traseira iniciado');

    if(!S.modelReady){
      setChip('CARREGANDO MODELO');
      try{
        if(!window.cocoSsd) throw new Error('tf');
        S.model = await cocoSsd.load({base:'lite_mobilenet_v2'});
        S.modelReady = true;
        logEvent('IA','modelo COCO-SSD carregado');
        toast('Visão computacional pronta');
      }catch(loadErr){
        console.warn(loadErr);
        if(!navigator.onLine){
          setChip('SEM MODELO');
          speak('Modelo ainda não baixado. Conecte uma vez à internet. Iniciando demonstração.', true);
          logEvent('IA','modelo sem cache, fallback simulação','#FF4E3E');
          if(S.running){ startSim(); return; }
        }
        throw loadErr;
      }
    }
    if(!S.running) return;
    setChip('DETECTANDO');
    requestAnimationFrame(loopLive);
  }catch(err){
    console.warn(err);
    stopAll();
    toast('Câmera indisponível — use o modo demonstração');
    $('#liveStatus').textContent='Não foi possível acessar a câmera.';
    $('#intro').classList.remove('away');
    logEvent('ERRO','acesso à câmera negado ou indisponível','#FF4E3E');
  }
}
let lastInfer=0, framesWin=0, fpsT=performance.now();
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
  if(cam.readyState>=2 && S.modelReady && !S.inferBusy && now-lastInfer>170){
    S.inferBusy = true; lastInfer = now;
    try{
      const preds = await S.model.detect(cam, 10, 0.40);
      let bt = null;
      for(const p of preds){ if(!bt || p.score>bt.score) bt = p; }
      S.lastRaw = { n:preds.length, top: bt ? (LABELS[bt.class]||bt.class)+' '+Math.round(bt.score*100)+'%' : 'nada' };
      const rel = preds.filter(p=>LABELS[p.class]).map(p=>enrich(p, cam.videoWidth, cam.videoHeight))
                       .sort((a,b)=>b.score-a.score);
      process(rel, cam.videoWidth, cam.videoHeight);
    }catch(e){}
    S.inferBusy=false;
  }
  framesWin++;
  if(now-fpsT>1000){ setChip('DETECTANDO', framesWin); framesWin=0; fpsT=now; }
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
  const rel = preds.map(p=>enrich(p,VW,VH)).sort((a,b)=>b.score-a.score);
  process(rel, VW, VH);
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
  try{ S.wake = await navigator.wakeLock?.request('screen'); }catch(e){}
  speak(mode==='live' ? 'Guia Visão ativado. Boa caminhada.' : 'Modo demonstração ativado.', true);
  if(S.autoVoice && !S.listening){ setListening(true, true); }
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
  S.lastDets=[]; S.stableKey=''; S.stableCount=0; S.lastPan=0; S.closeness=0; S.noFrameSince=0; S.noFrameWarned=false;
  logEvent('STOP','detecção pausada','#FFC53D');
}

/* ---------- descrever cena ---------- */
function diagnose(){
  const r = S.lastRaw || {n:0, top:'nada ainda'};
  const v = (cam.videoWidth||0)+' por '+(cam.videoHeight||0);
  speak(`Diagnóstico. Modelo ${S.modelReady?'carregado':'não carregado'}. Vídeo ${v}. Última análise: ${r.n} detecções, melhor: ${r.top}.`, true);
  logEvent('DIAG', `modelo=${S.modelReady} video=${v} raw=${r.n} top=${r.top}`);
}
function describe(){
  const list = S.lastDets || [];
  if(!list.length){ speak('Nenhum obstáculo detectado à frente. Caminho livre.', true); logEvent('DESC','cena vazia'); return; }
  const parts = list.slice(0,3).map(d=>`${d.nome} ${d.dir}${d.dist?`, aproximadamente ${String(d.dist).replace('.',',')} metros`:''}`);
  speak(`À sua frente: ${parts.join('. ')}.`, true);
  logEvent('DESC', parts.join(' · '));
}
// guardar últimas detecções live
const _process = process;
process = function(list, sw, sh){ S.lastDets = list; _process(list, sw, sh); };

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
  r.onend = ()=>{ if(S.listening){ setTimeout(()=>{ if(S.listening){ try{ r.start(); }catch(e){} } }, 280); } };
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
    try{ S.recog.start(); }catch(e){}
    if(!quiet){ speak('Escutando. Diga um comando.'); toast('Escutando comandos de voz…'); }
    else { toast('Escutando comandos de voz…'); }
    logEvent('MIC','reconhecimento de voz ativado');
  } else {
    if(S.recog){ try{ S.recog.stop(); }catch(e){} }
    if(!quiet) speak('Comandos de voz desativados.');
  }
}
function handleCommand(t){
  const has = (...ws)=>ws.some(w=>t.includes(w));
  if(has('socorro','sos','emergência','emergencia','ajuda urgente')){ triggerSOS(); }
  else if(has('parar','pausar','desligar','stop')){ if(S.running){ stopAll(); speak('Detecção pausada.'); } else speak('A detecção já está pausada.'); }
  else if(has('iniciar','começar','ligar','inicia')){ if(!S.running) start('live'); else speak('A detecção já está ativa.'); }
  else if(has('demonstra','demo','simula')){ if(!S.running) start('sim'); else speak('Já estou em funcionamento.'); }
  else if(has('frente','descrev','o que tem','o que há','cena')){ describe(); }
  else if(has('repetir','repete')){ speak($('#liveAlert').textContent || 'Nenhum alerta recente.', true); }
  else if(has('lanterna','luz','flash')){ setTorch(!S.torchOn); }
  else if(has('rápido','rapido')){ setRate(Math.min(1.5,S.rate+0.15)); speak('Fala mais rápida.'); }
  else if(has('devagar','lento','lenta')){ setRate(Math.max(0.6,S.rate-0.15)); speak('Fala mais devagar.'); }
  else if(has('diagnóstico','diagnostico','status do sistema')){ diagnose(); }
  else if(has('ajuda','comandos')){ speak('Você pode dizer: iniciar, parar, o que tem à frente, repetir, lanterna, diagnóstico, mais rápido, mais devagar.', true); openSheet('sheetHelp'); }
  else { speak('Comando não reconhecido. Diga ajuda para ouvir as opções.', true); }
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
$('#btnMain').addEventListener('click', ()=>{ unlockAudio(); if(S.running){ stopAll(); speak('Detecção pausada.'); } else { start(S.prefMode||'live'); } });
// segurar 2s no botão principal = SOS (sem interferir no clique simples)
$('#btnMain').addEventListener('pointerdown', ()=>{
  clearTimeout(S.sosTimer);
  S.sosTimer = setTimeout(()=>{ triggerSOS(); S.sosTimer=null; }, 2000);
});
['pointerup','pointerleave','pointercancel'].forEach(ev=>$('#btnMain').addEventListener(ev, ()=>clearTimeout(S.sosTimer)));
$('#btnVoice').addEventListener('click', ()=>{ unlockAudio(); setListening(!S.listening); });
$('#btnSettings').addEventListener('click', ()=>openSheet('sheetSettings'));
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
$('#btnStartDemo').addEventListener('click', (e)=>{ e.stopPropagation(); unlockAudio(); start('sim'); });
// tocar em qualquer lugar da intro ativa a câmera (menos nos botões demo/fechar)
$('#intro').addEventListener('click', (e)=>{
  if(e.target.closest('#btnStartDemo')) return;
  if(!$('#intro').classList.contains('away')){ unlockAudio(); start('live'); }
});

function unlockAudio(){
  try{ actx = actx || new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==='suspended') actx.resume(); }catch(e){}
  if('speechSynthesis' in window){ const u=new SpeechSynthesisUtterance(' '); u.volume=0; speechSynthesis.speak(u); }
}

/* settings */
function setRate(v){ S.rate = Math.round(v*100)/100; $('#rateVal').textContent = S.rate.toFixed(1)+'×'; $('#rgRate').value=S.rate; paintRange($('#rgRate')); }
function paintRange(el){ const p=(el.value-el.min)/(el.max-el.min)*100; el.style.setProperty('--fill',p+'%'); }
$('#rgRate').addEventListener('input', e=>{ setRate(+e.target.value); });
$('#rgSens').addEventListener('input', e=>{
  S.sens=+e.target.value; paintRange(e.target);
  $('#sensVal').textContent = S.sens<0.9?'BAIXA':S.sens>1.3?'ALTA':'NORMAL';
});
$('#swVoice').addEventListener('change', e=>{ S.tts=e.target.checked; if(S.tts) speak('Voz ativada.'); logEvent('CFG', 'voz '+(S.tts?'on':'off')); });
$('#swAutoVoice').addEventListener('change', e=>{ S.autoVoice=e.target.checked; logEvent('CFG','escuta automática '+(S.autoVoice?'on':'off')); if(S.autoVoice && !S.listening && S.running) setListening(true,true); if(!S.autoVoice && S.listening) setListening(false,true); });
$('#swVib').addEventListener('change', e=>{ S.vib=e.target.checked; if(S.vib) vibrate(60); logEvent('CFG','vibração '+(S.vib?'on':'off')); });
$('#swSon').addEventListener('change', e=>{ S.son=e.target.checked; if(S.son) beep(880); logEvent('CFG','sonificação '+(S.son?'on':'off')); });
$('#swHC').addEventListener('change', e=>{ document.body.classList.toggle('hc', e.target.checked); speak(e.target.checked?'Alto contraste ativado.':'Alto contraste desativado.'); });
$('#swBig').addEventListener('change', e=>{ document.body.classList.toggle('bigtype', e.target.checked); speak(e.target.checked?'Texto ampliado.':'Texto normal.'); });
paintRange($('#rgRate')); paintRange($('#rgSens'));

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
if(!navigator.mediaDevices?.getUserMedia) { toast('Este navegador não suporta câmera — use o modo demonstração'); logEvent('SYS','getUserMedia indisponível','#FF4E3E'); }
if(!window.cocoSsd) logEvent('SYS','modelo de IA não carregou (verifique a rede)','#FF4E3E');
setTimeout(()=>{ if(!('speechSynthesis' in window)) logEvent('SYS','TTS indisponível','#FF4E3E'); },300);
// boot falado: foca a intro e anuncia instruções para quem não enxerga
setTimeout(()=>{
  const intro = $('#intro');
  if(!intro || intro.classList.contains('away')) return;
  try{ intro.focus({preventScroll:true}); }catch(e){}
  $('#liveStatus').textContent = 'Guia Visão pronto. Toque em qualquer lugar para ativar a câmera, ou diga iniciar.';
  if('speechSynthesis' in window){
    speak('Guia Visão pronto. Toque em qualquer lugar da tela para ativar a câmera. Para demonstração sem câmera, procure o botão demonstração na parte de baixo. Você também pode dizer: iniciar.', false);
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
