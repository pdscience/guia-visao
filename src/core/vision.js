/* src/core/vision.js — visão computacional + simulação + overlay HUD.
   Portado de js/app.js (extração literal, escrita em `state` em vez de DOM). */
import { LABELS, RISK_BIAS, TALL, TYPES_SIM } from '../engine/labels.js';
import { Vigia } from '../engine/vigia.js';
import { enrich as enrichFn, phrase as phraseFn, detectThreshold } from '../engine/risk.js';
import { sameTarget, estimateTtc } from '../engine/tracking.js';
import { analyzeBrightness } from '../engine/lighting.js';
import { isGroundHazard } from '../engine/terrain.js';
import { guidanceSpeech, alertsFor } from '../engine/guidance.js';
import { fusePersonal as fusePersonalFn, MeuKNn, ObstDB } from './obstacles.js';
import { raw } from './raw.js';

export function createVision(state, refs, speech){
  const { video: cam, overlay, scene } = refs || {};
  const octx = overlay ? overlay.getContext('2d') : null;
  const sctx = scene ? scene.getContext('2d') : null;
  let DPR = 1, VW = 0, VH = 0;
  let lastInfer = 0, framesWin = 0, fpsT = performance.now();
  let lastDetTs = 0, lastSecSpoke = 0;
  let lastRaw = { n: 0, top: 'nada' };
  let knnBusy = false, knnLast = 0, lightLast = 0, lastInferTime = 170, groundLast = 0, frameNo = 0;
  const KNN_GAP = 340, PERSONAL_TTL = 2000;

  function resize(){
    if(!overlay || !scene) return;
    DPR = Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
    VW = (refs.root && refs.root.clientWidth) ? refs.root.clientWidth : (overlay.clientWidth || 400);
    VH = (refs.root && refs.root.clientHeight) ? refs.root.clientHeight : (overlay.clientHeight || 800);
    for(const c of [overlay, scene]){ c.width = VW*DPR; c.height = VH*DPR; }
    if(octx) octx.setTransform(DPR,0,0,DPR,0,0);
    if(sctx) sctx.setTransform(DPR,0,0,DPR,0,0);
    state.VW = VW; state.VH = VH;
  }

  function logEvent(kind, msg, tone){
    try{
      if(!state.telemetry) state.telemetry = [];
      state.telemetry.unshift({ kind, msg, tone, t: new Date().toLocaleTimeString('pt-BR',{hour12:false}) });
      if(state.telemetry.length > 40) state.telemetry.length = 40;
    }catch(e){}
  }

  function setRisk(level){
    state.risk = level;
    state.riskColor = (['#00FF41','#FFC53D','#FF4E3E'])[level] || '#00FF41';
    state.dangerPulse = (level === 2);
    state.alert = state.alert || {};
    state.alert.tag = (['LIVRE','ATENÇÃO','PERIGO'])[level] || 'LIVRE';
  }

  function setChip(status, fps){
    state.chip = state.chip || {};
    state.chip.status = status;
    if(fps !== undefined) state.chip.fps = fps + ' FPS';
  }

  function roundRect(c,x,y,w,h,r){
    if(!c) return;
    c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
  }

  function coverTransform(sw, sh){
    const scale = Math.max(VW/sw, VH/sh);
    const dw = sw*scale, dh = sh*scale;
    return { x:(VW-dw)/2, y:(VH-dh)/2, s:scale };
  }

  function drawOverlay(list, sw, sh){
    if(!octx) return;
    octx.clearRect(0,0,VW,VH);
    if(!state.running) return;
    const t = state.mode==='sim' ? {x:0,y:0,s:1} : coverTransform(sw, sh);
    octx.strokeStyle='rgba(255,255,255,.05)'; octx.lineWidth=1;
    octx.beginPath();
    octx.moveTo(VW/3,20);octx.lineTo(VW/3,VH-20);octx.moveTo(2*VW/3,20);octx.lineTo(2*VW/3,VH-20);
    octx.stroke();
    const T = performance.now();
    for(const d of (list||[]).slice(0,5)){
      const c = (['#00FF41','#FFC53D','#FF4E3E'])[d.risk] || '#00FF41';
      if(d.personal){
        const label = `${String(d.nome).toUpperCase()} · ${d.acc}%`;
        octx.font='700 12px "JetBrains Mono"';
        const tw = octx.measureText(label).width + 20;
        octx.fillStyle = c;
        roundRect(octx, VW/2-tw/2, 64, tw, 22, 8); octx.fill();
        octx.fillStyle = '#0a0d05';
        octx.fillText(label, VW/2-tw/2+10, 64+15);
        continue;
      }
      let [x,y,w,h] = d.bbox;
      if(state.mode!=='sim'){ x=x*t.s+t.x; y=y*t.s+t.y; w*=t.s; h*=t.s; }
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
      const label = `${String(d.nome).toUpperCase()} · ${d.acc}%`;
      octx.font='700 10px "JetBrains Mono"';
      const tw = octx.measureText(label).width + 16;
      const ly = y-24 < 8 ? y+8 : y-24;
      octx.fillStyle = c;
      roundRect(octx, x, ly, tw, 18, 6); octx.fill();
      octx.fillStyle = '#0a0d05';
      octx.fillText(label, x+8, ly+13);
    }
    octx.strokeStyle='rgba(255,255,255,.14)'; octx.lineWidth=1.5;
    const cx=VW/2, cy=VH/2-40;
    octx.beginPath();octx.moveTo(cx-12,cy);octx.lineTo(cx+12,cy);octx.moveTo(cx,cy-12);octx.lineTo(cx,cy+12);octx.stroke();
  }

  function enrich(p, sw, sh){
    return enrichFn(p, sw, sh, state.sens);
  }

  function phrase(d){ return phraseFn(d); }

  function processFrame(list, sw, sh){
    state.lastDets = list;
    state.lastFrameTs = performance.now();
    (state.announceReady||(()=>{}))();
    drawOverlay(list, sw, sh);
    state.detCount = (state.detCount||0) + (list||[]).length;
    const now = performance.now();
    const top = (list && list[0]) || null;
    const isPri = top && Vigia.has(top.cls);

    // TTC: objeto se aproximando rápido vira risco 2 mesmo com caixa pequena
    let ttc = Infinity;
    if(top){
      const dt = now - (state.lastTopTs || 0);
      if(state.lastTopCls === top.cls && state.lastTopDist != null && dt > 0 && dt <= 1500){
        ttc = estimateTtc(state.lastTopDist, top.dist, dt);
      }
    }
    const urgent = !!(top && Number.isFinite(ttc) && ttc <= 2 && top.dist <= 6);
    const risk = urgent ? 2 : (top ? top.risk : 0);
    setRisk(risk);
    state.closeness = top ? Math.min(1, top.score/0.5) : 0;
    state.lastPan = !top ? 0 : top.dir==='à esquerda' ? -0.8 : top.dir==='à direita' ? 0.8 : 0;
    // obstáculo baixo: só quando a frente já não está bloqueada por objeto conhecido
    frameNo++;
    if(state.groundAuto !== false && frameNo % 5 === 0 && !top && (performance.now() - groundLast) > 4000){
      groundLast = performance.now();
      try{
        if(state.sw && state.sh && state.sctx && state.small){
          const imgd = state.sctx.getImageData(0, 0, state.sw, state.sh);
          if(isGroundHazard(imgd, 0.22)){ speech.speak('Atenção: possível obstáculo baixo no caminho. Siga com cautela.', true); state.toastFn && state.toastFn('OBSTÁCULO BAIXO'); }
        }
      }catch(e){}
    }

    if(top){
      lastDetTs = now; state.lastFree = false;
      state.alert = state.alert || {};
      state.alert.title = `${top.nome} ${top.dir}`;
      state.alert.sub = `${risk===2?'MUITO PERTO':risk===1?'PERTO':'À DISTÂNCIA'} · ≈ ${String(top.dist).replace('.',',')} m · ${top.acc}%`;
      state.alert.aria = 'Repetir último alerta: '+(isPri?'Prioridade: ':'')+state.alert.title+'. '+state.alert.sub;
      state.alert.outline = isPri ? '2px solid #FFC53D' : '';
      state.alert.dim = false;
      state.alert.icon = (risk===0?'ok':risk===1?'warn':'danger');

      // confirma o MESMO objeto (IoU) antes de contar estabilidade
      const prevBox = state.lastTopBbox, prevCls = state.lastTopCls;
      const sameObj = !!(prevBox && prevCls === top.cls && sameTarget({ cls: prevCls, bbox: prevBox }, top));
      state.lastTopBbox = top.bbox; state.lastTopCls = top.cls;
      state.lastTopDist = top.dist; state.lastTopTs = now;

      const key = top.cls+top.dir+(risk>=1?risk:0);
      if(key===state.stableKey && (sameObj || risk>=1)){ state.stableCount = (state.stableCount||0)+1; } else { state.stableKey=key; state.stableCount=1; }
      const stable = isPri ? state.stableCount>=1 : state.stableCount>=2;
      if(!stable && key!==state.lastKey) return;
      const isNew = key!==state.lastKey;
      const guide = guidanceSpeech(list, sw);
      let msg = phrase(top);
      if(urgent) msg += ' Aproximando rápido.';
      else if(guide) msg += ' ' + guide;

      if(risk===2){
        if((isNew && now-state.lastSpoke>800) || now-state.lastSpoke>5000){
          state.lastSpoke = now; state.lastKey = key;
          speech.speak(msg, true); (state.vibrate||(()=>{}))([170,90,170]);
        } else if(isNew){ (state.vibrate||(()=>{}))([170,90,170]); }
        else if(now - state.lastVib > 1300){ state.lastVib = now; (state.vibrate||(()=>{}))([150,80,150]); }
      } else if(risk===1){
        if((isNew && now-state.lastSpoke>1200) || now-state.lastSpoke>6000){
          state.lastSpoke = now; state.lastKey = key;
          speech.speak(msg, isNew); (state.vibrate||(()=>{}))(isPri?[90,60,90]:70);
        } else if(isNew){ (state.vibrate||(()=>{}))(isPri?[90,60,90]:70); }
      } else {
        if((isNew && now-state.lastSpoke>2000) || now-state.lastSpoke>(isPri?4000:8000)){
          state.lastSpoke = now; state.lastKey = key;
          speech.speak(msg);
          if(isPri) (state.vibrate||(()=>{}))(70);
        } else if(isPri && isNew){ (state.vibrate||(()=>{}))(70); }
      }
      const others = alertsFor((list||[]).filter(d => d !== top), 1);
      const second = others[0] || (list||[]).slice(1).find(d=>Vigia.has(d.cls)) || (list||[])[1];
      if(second && now-lastSecSpoke>7000 && now-state.lastSpoke>2500){
        lastSecSpoke = now;
        speech.speak(Vigia.has(second.cls) ? phrase(second) : `Atenção: ${phrase(second)}`);
      }
    } else {
      state.lastTopBbox = null; state.lastTopCls = null; state.lastTopDist = null; state.lastTopTs = 0;
      const rawEmpty = (lastRaw||{n:0}).n===0;
      if(!state.lastFree && rawEmpty && now - lastDetTs > 7000){
        state.lastFree = true; state.lastKey=''; state.stableKey=''; state.stableCount=0;
        state.alert = state.alert || {};
        state.alert.title = 'Sem obstáculos reconhecidos';
        state.alert.sub = 'NENHUM OBSTÁCULO RECONHECIDO';
        state.alert.tag = 'SEM DETECÇÕES';
        state.alert.aria = 'Sem obstáculos reconhecidos. Isso não garante caminho livre.';
        state.alert.outline = '';
        state.alert.dim = true;
        state.alert.icon = 'ok';
        speech.speak((state.freeSpeech)||'Nenhum obstáculo reconhecido agora. Isso não garante caminho livre; siga com cautela.');
        logEvent('LIVRE','nenhum obstáculo reconhecido');
      }
    }
  }

  async function ensureModel(){
    const base = state.acc ? 'mobilenet_v2' : 'lite_mobilenet_v2';
    if(state.modelReady && state.modelBase === base) return;
    if(!window.cocoSsd) throw new Error('tf');
    if(window.tf && typeof window.tf.ready === 'function'){ try{ await window.tf.ready(); }catch(e){ console.warn('tf.ready err', e); } }
    if(window.tf && typeof window.tf.setBackend === 'function' && !window.tf.getBackend()){
      try{ await window.tf.setBackend('webgl'); await window.tf.ready(); }
      catch(e){ console.warn('tf webgl err', e); try{ await window.tf.setBackend('cpu'); await window.tf.ready(); }catch(e2){ console.warn('tf cpu err', e2); } }
    }
    const m = await window.cocoSsd.load({base});
    state.model = raw(m); state.modelBase = base; state.modelReady = true;
    logEvent('IA','modelo COCO-SSD carregado ('+base+')');
  }

  async function startLive(){
    try{
      state.stream = raw(await navigator.mediaDevices.getUserMedia({
        video:{ facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720} }, audio:false }));
      if(!state.running){ if(state.stream){ state.stream.getTracks().forEach(t=>t.stop()); } state.stream=null; return; }
      state.track = raw(state.stream.getVideoTracks()[0]);
      if(state.track){
        const perdeu = ()=>onCameraLost('track encerrado');
        if(typeof state.track.addEventListener === 'function') state.track.addEventListener('ended', perdeu);
        else state.track.onended = perdeu;
      }
      if(cam){ cam.srcObject = state.stream; try{ await cam.play(); }catch(e){} }
      if(cam && cam.classList) cam.classList.remove('opacity-0');
      state.lastVideoTime = cam ? (cam.currentTime || 0) : 0;
      state.lastVideoTimeAt = performance.now();
      state.noFrameSince = 0; state.noFrameWarned = false;
      try{
        const sc = Math.min(1, 640/(cam.videoWidth||1280));
        state.sw = Math.round(cam.videoWidth*sc); state.sh = Math.round(cam.videoHeight*sc);
        state.small = raw(document.createElement('canvas')); state.small.width = state.sw; state.small.height = state.sh;
        state.sctx = raw(state.small.getContext('2d', { willReadFrequently:true }));
      }catch(e){ state.small = null; }
      state.mode='live';
      setChip('CÂMERA ATIVA');
      logEvent('CÂM','stream da câmera traseira iniciado');
      if(!state.modelReady){
        setChip('CARREGANDO MODELO');
        try{ await ensureModel(); }
        catch(loadErr){
          console.warn(loadErr);
          if(!state.running) return;
          if(!navigator.onLine){
            setChip('SEM MODELO');
            speech.speak('Modelo ainda não baixado. Conecte uma vez à internet. Iniciando demonstração.', true);
            logEvent('IA','modelo sem cache, fallback simulação','#FF4E3E');
            startSim(); return;
          }
          state.running=false; state.mode='idle';
          setChip('SEM MODELO');
          speech.speak('Não foi possível carregar o modelo de visão. Verifique a internet e tente de novo, ou diga demonstração.', true);
          logEvent('ERRO','falha ao carregar modelo COCO-SSD: '+((loadErr && loadErr.message) || loadErr),'#FF4E3E');
          return;
        }
      }
      if(!state.running) return;
      setChip('DETECTANDO');
      requestAnimationFrame(loopLive);
      // kNN pessoal carrega EM SEGUNDO PLANO: os pesos do MobileNet vêm da rede
      // e nunca podem segurar o rAF do COCO (senão tudo congela até terminar)
      void (async ()=>{
        try{
          // sem obstáculos cadastrados não baixa o MobileNet (~14 MB) à toa
          const all = await ObstDB.loadAll().catch(()=>null);
          if(all !== null && !all.some(r => r.id !== 'fundo' && (r.count||0) > 0)){ state.knnReady = false; return; }
          await MeuKNn.init();
          if(!state.running) return;
          state.knnReady = true; state.knnCount = MeuKNn.count();
          logEvent('IA','kNN pessoal pronto ('+Object.keys(state.knnCount||{}).filter(k=>k!=='fundo').length+' obstáculos)');
        }catch(e){
          state.knnReady = false;
          console.warn('kNN pessoal indisponível:', e);
          logEvent('IA','kNN pessoal indisponível ('+((e && e.message) || e)+') — detecção COCO segue normal','#FFC53D');
        }
      })();
    }catch(err){
      console.warn(err);
      if(!state.running) return;
      state.running=false; state.mode='idle';
      const negado = err && err.name === 'NotAllowedError';
      speech.speak(negado ? 'Permissão de câmera negada. A detecção não iniciou. Para simular, diga demonstração.' : 'Não foi possível acessar a câmera. A detecção não iniciou. Para simular, diga demonstração.', true);
      logEvent('ERRO', negado ? 'permissão de câmera negada' : 'acesso à câmera indisponível','#FF4E3E');
    }
  }

  function scheduleKnn(){
    if(knnBusy || !state.running || state.mode!=='live' || !state.knnOn || !state.knnReady) return;
    const now = performance.now();
    if(now - knnLast < KNN_GAP) return;
    knnBusy = true; knnLast = now;
    setTimeout(async ()=>{
      try{
        if(state.running && state.mode==='live' && state.knnOn && state.knnReady){
          const src = (state.small && state.small.width) ? state.small : cam;
          const p = await MeuKNn.predictTop(src);
          if(p) state.personalHit = { id:p.id, conf:p.conf, ts:performance.now() };
        }
      }catch(e){}
      finally{ knnBusy = false; }
    },0);
  }

  function currentPersonal(now){
    const h = state.personalHit;
    if(!h) return null;
    if(now - h.ts > PERSONAL_TTL){ state.personalHit = null; return null; }
    return h;
  }

  async function loopLive(){
    if(state.mode!=='live' || !state.running) return;
    const now = performance.now();
    // camera health
    if(!(cam && cam.readyState >= 2) || !cam.videoWidth){
      if(!state.noFrameSince) state.noFrameSince = now;
      if(now - state.noFrameSince > 3000){
        if(!state.noFrameWarned){ state.noFrameWarned = true; onCameraLost('no-frame'); }
        return;
      }
      requestAnimationFrame(loopLive); return;
    }
    if(cam.currentTime !== state.lastVideoTime){ state.lastVideoTime = cam.currentTime; state.lastVideoTimeAt = now; }
    if(state.noFrameSince){ state.noFrameSince = 0; if(state.noFrameWarned){ state.noFrameWarned = false; setChip('DETECTANDO'); } }
    // luminosidade: sugere lanterna em ambiente escuro (não liga sozinho)
    if(state.torchAuto !== false && (now - lightLast) > 2500){
      lightLast = now;
      try{
        if(state.sw && state.sh && state.sctx && state.small){
          state.sctx.drawImage(cam, 0, 0, state.sw, state.sh);
          const imgd = state.sctx.getImageData(0, 0, state.sw, state.sh);
          const b = analyzeBrightness(imgd, 40);
          state.lowLight = !!b.isLowLight;
          if(b.isLowLight && !state.torchOn && !state.lowLightWarned){
            state.lowLightWarned = true;
            if(state.toastFn) state.toastFn('AMBIENTE ESCURO — ative a lanterna');
            speech.speak('Ambiente escuro. Ative a lanterna para melhorar a detecção.', false);
          } else if(!b.isLowLight){ state.lowLightWarned = false; }
        }
      }catch(e){}
    }
    // agenda o kNN pessoal ANTES da inferência COCO: roda em segundo plano e
    // nunca segura o alerta principal deste frame
    scheduleKnn();
    const inferGap = (lastInferTime > 220) ? 260 : 170;
    if(cam.readyState>=2 && state.modelReady && !state.inferBusy && now-lastInfer>inferGap){
      state.inferBusy = true; lastInfer = now;
      try{
        let src = cam, sw = cam.videoWidth, sh = cam.videoHeight;
        if(state.small && state.sctx && state.sw){ state.sctx.drawImage(cam, 0, 0, state.sw, state.sh); src = state.small; sw = state.sw; sh = state.sh; }
        const preds = (await state.model.detect(src, 10, 0.25)).filter(p => LABELS[p.class] && p.score >= detectThreshold(p.class));
        let bt = null;
        for(const p of preds){ if(!bt || p.score>bt.score) bt = p; }
        lastRaw = { n:preds.length, top: bt ? (LABELS[bt.class]||bt.class)+' '+Math.round(bt.score*100)+'%' : 'nada' };
        state.lastRaw = lastRaw;
        let rel = preds.map(p=>enrich(p, sw, sh)).sort((a,b)=>b.score-a.score);
        if(state.knnOn && state.knnReady){
          try{ rel = fusePersonalFn(rel, sw, sh, currentPersonal(performance.now())); }catch(e){}
        }
        processFrame(rel, sw, sh);
       lastInferTime = performance.now() - lastInfer;
      }catch(e){
        state.inferErr = (e && (e.message || e.name)) || String(e);
        if(!state.inferErrLogged){ state.inferErrLogged = true; logEvent('ERRO','inferência falhou: '+state.inferErr,'#FF4E3E'); }
      }
      state.inferBusy=false;
    }
    framesWin++;
    if(now-fpsT>1000){
      setChip('DETECTANDO', framesWin);
      if(state.chip) state.chip.fps = framesWin+' FPS · '+(lastRaw?lastRaw.n:0)+' OBJ';
      framesWin=0; fpsT=now;
    }
    requestAnimationFrame(loopLive);
  }

  function startSim(){
    state.mode='sim';
    if(scene) scene.classList && scene.classList.remove('opacity-0');
    state.alert = state.alert || {};
    state.alert.title='Modo demonstração';
    state.alert.sub='CENA VIRTUAL';
    state.alert.tag='DEMO';
    state.alert.aria='Modo demonstração. Cena virtual.';
    state.alert.dim=false;
    if(!state.simItems || !state.simItems.length){
      state.simItems = [];
      for(let i=0;i<3;i++) spawnSim(Math.random()*0.6+0.1);
    }
    setChip('SIMULAÇÃO');
    logEvent('DEMO','cenário virtual em movimento');
    requestAnimationFrame(simTick);
  }

  function spawnSim(z=0.05){
    const cls = TYPES_SIM[Math.floor(Math.random()*TYPES_SIM.length)];
    if(!state.simItems) state.simItems = [];
    state.simItems.push({ cls, lane:(Math.random()*2-1)*0.8, z, vz:0.0011+Math.random()*0.0016, wob:Math.random()*Math.PI*2, id:Math.random().toString(36).slice(2) });
  }

  function simScene(dt){
    if(!sctx) return;
    const g = sctx.createLinearGradient(0,0,0,VH);
    g.addColorStop(0,'#0a0d14'); g.addColorStop(.45,'#0d1018'); g.addColorStop(1,'#05060a');
    sctx.fillStyle=g; sctx.fillRect(0,0,VW,VH);
    const hz = VH*0.42;
    const glow = sctx.createRadialGradient(VW/2,hz,10,VW/2,hz,VW*0.8);
    glow.addColorStop(0,'rgba(0,255,65,.07)'); glow.addColorStop(1,'transparent');
    sctx.fillStyle=glow; sctx.fillRect(0,0,VW,VH);
    sctx.fillStyle='#10131b';
    for(let i=0;i<6;i++){ const bw=VW/6; sctx.fillRect(i*bw+3, hz-60-((i*37)%70), bw-6, 60+((i*37)%70)); }
    sctx.beginPath();
    sctx.moveTo(VW/2-26,hz); sctx.lineTo(VW/2+26,hz); sctx.lineTo(VW*0.94,VH); sctx.lineTo(VW*0.06,VH);
    sctx.closePath(); sctx.fillStyle='#14171d'; sctx.fill();
    sctx.strokeStyle='rgba(0,255,65,.28)'; sctx.lineWidth=2;
    sctx.beginPath(); sctx.moveTo(VW/2-24,hz); sctx.lineTo(VW*0.07,VH); sctx.moveTo(VW/2+24,hz); sctx.lineTo(VW*0.93,VH); sctx.stroke();
    state.roadOff = ((state.roadOff||0) + dt*0.00055)%1;
    sctx.fillStyle='rgba(255,255,255,.35)';
    for(let i=0;i<6;i++){
      const t=((i/6)+state.roadOff)%1, e=t*t;
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
    } else {
      roundRect(sctx,-s*0.28,-s*0.4,s*0.56,s*0.7,s*0.1); sctx.fill();
    }
    sctx.restore();
    const bw = item.cls==='car'? s*1.3 : item.cls==='dog'? s*0.85 : s*0.62;
    const bh = item.cls==='car'? s*0.9 : item.cls==='dog'? s*0.55 : s*1.06;
    return { x:x-bw/2, y:y-bh+(item.cls==='chair'?s*0.1:0), w:bw, h:bh };
  }

  function simTick(ts){
    if(state.mode!=='sim' || !state.running) return;
    const dt = Math.min(50, ts-(state.simLast||ts)); state.simLast = ts;
    simScene(dt);
    const preds=[];
    for(const it of (state.simItems||[])){
      it.z += it.vz*dt*16*0.06 + dt*0.00016;
      it.wob += dt*0.001; it.lane += Math.sin(it.wob)*0.0008;
      if(it.z>0.98){ Object.assign(it, {z:0.05, lane:(Math.random()*2-1)*0.8, cls:TYPES_SIM[Math.floor(Math.random()*TYPES_SIM.length)]}); }
      if(it.z>0.16){
        const b = simPict(it);
        preds.push({ class: it.cls==='box'?'suitcase':it.cls, score:.75+Math.random()*.2, bbox:[b.x,b.y,Math.max(8,b.w),Math.max(8,b.h)] });
      }
    }
    if((state.simItems||[]).length<3 && Math.random()<0.01) spawnSim();
    lastRaw = { n:preds.length, top:preds[0] ? preds[0].class : 'nada' };
    state.lastRaw = lastRaw;
    const rel = preds.map(p=>enrich(p,VW,VH)).sort((a,b)=>b.score-a.score);
    processFrame(rel, VW, VH);
    requestAnimationFrame(simTick);
  }

  function onCameraLost(reason){
    // o controller faz o teardown completo (timers, wake lock, stream, fala)
    if(typeof state.onCameraLost === 'function' && state.onCameraLost !== onCameraLost){
      state.onCameraLost(reason);
      return;
    }
    if(!state.running || state.mode !== 'live') return;
    logEvent('ERRO','câmera perdida: '+reason,'#FF4E3E');
    (state.vibrate||(()=>{}))([250,120,250,120,450]);
    speech.speak('A câmera foi interrompida. A detecção parou. Diga Guia Visão, iniciar para retomar.', true);
    state.running=false; state.mode='idle';
    setChip('SEM CÂMERA');
  }

  // expose a few helpers used by controller
  return {
    resize, logEvent, setRisk, setChip, roundRect, coverTransform, drawOverlay,
    enrich, phrase, processFrame, ensureModel, startLive, loopLive, onCameraLost,
    startSim, simTick, spawnSim, simScene, simPict, scheduleKnn,
    VW: ()=>VW, VH: ()=>VH,
  };
}
