/* js/safety.js — regras puras de segurança e fala do Guia Visão.
   Sem DOM: testado em tests/safety.test.js e usado por js/app.js. */
const Safety = (() => {
  const STALE_MS = 3000;
  const STALL_MS = 2500;
  const CONFIRM_MAX_MS = 15000;

  function norm(t){
    return String(t == null ? '' : t).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function has(t, ...terms){
    const n = ' ' + norm(t) + ' ';
    return terms.some(x => n.includes(' ' + norm(x) + ' '));
  }

  function startSpeech(){
    return 'Ativando câmera e detecção. Aguarde a câmera e o modelo.';
  }
  function readySpeech(){
    return 'Detecção ativa. Boa caminhada.';
  }
  function cameraError(err){
    const name = err && err.name;
    if(name === 'NotAllowedError') return 'Permissão de câmera negada. A detecção não iniciou. Para simular, diga demonstração.';
    if(name === 'NotFoundError') return 'Nenhuma câmera encontrada. A detecção não iniciou. Para simular, diga demonstração.';
    if(name === 'NotReadableError') return 'A câmera está ocupada por outro aplicativo. A detecção não iniciou. Feche o outro app e tente de novo.';
    return 'Não foi possível acessar a câmera. A detecção não iniciou. Para simular, diga demonstração.';
  }
  function cameraLostSpeech(){
    return 'A câmera foi interrompida. A detecção parou. Diga Guia Visão, iniciar para retomar.';
  }
  function sosSpeech(){
    return 'Alarme de emergência acionado. Nenhuma chamada foi feita. Peça ajuda em voz alta e aproxime-se de pessoas.';
  }
  function cancelledSpeech(){
    return 'Comando cancelado.';
  }

  function canDescribe(s, now){
    if(!s || !s.running) return 'paused';
    if(s.mode === 'live'){
      if(!s.modelReady) return 'model';
      if(!s.lastFrameTs || !Number.isFinite(now) || now - s.lastFrameTs > STALE_MS) return 'stale';
    }
    return 'ok';
  }
  function describeBlocked(reason){
    if(reason === 'paused') return 'Detecção pausada. Não posso avaliar o caminho. Diga Guia Visão, iniciar para ativar.';
    if(reason === 'model') return 'A detecção ainda está carregando. Aguarde alguns segundos e tente de novo.';
    return 'Não tenho uma imagem atual da câmera. Não posso avaliar o caminho. Verifique a câmera e tente de novo.';
  }
  function freeSpeech(){
    return 'Nenhum obstáculo reconhecido agora. Isso não garante caminho livre; siga com cautela.';
  }

  function cameraHealth(i){
    const stallMs = Number.isFinite(i.stallMs) ? i.stallMs : STALL_MS;
    if(!(i.readyState >= 2) || !i.videoWidth) return 'no-frame';
    if(i.currentTime !== i.lastTime) return 'ok';
    return i.now - i.lastAt > stallMs ? 'stalled' : 'ok';
  }

  function kindOf(t){
    if(has(t, 'parar de vigiar', 'deixar de vigiar', 'nao vigiar')) return null;
    if(has(t, 'socorro', 'sos', 'emergencia', 'ajuda urgente')) return 'sos';
    if(has(t, 'parar', 'pare', 'pausar', 'desligar', 'stop')) return 'stop';
    if(has(t, 'iniciar', 'inicia', 'iniciando', 'comecar', 'comeca', 'comece', 'ligar')) return 'start';
    return null;
  }
  function confirmPrompt(kind){
    const label = kind === 'sos' ? 'socorro' : kind === 'start' ? 'iniciar' : 'parar';
    return `Ouvi ${label}. Para confirmar, diga: confirmar ${label}. Para cancelar, diga cancelar.`;
  }
  function voiceDecision(text, opts = {}){
    const t = norm(text);
    const wake = has(t, 'guia visao');
    const clean = t.replace(/\bguia visao\b/g, ' ').replace(/\s+/g, ' ').trim();
    const pending = opts.pending || null;
    const maxAge = Number.isFinite(opts.maxAge) ? opts.maxAge : CONFIRM_MAX_MS;
    const pendingAge = Number.isFinite(opts.pendingAge) ? opts.pendingAge : 0;
    const pendingValid = !!(pending && pendingAge <= maxAge);

    if(pendingValid){
      if(has(clean, 'cancelar', 'cancela', 'nao')) return { action: 'cancel' };
      if(has(clean, 'confirmar', 'confirmo', 'sim')) return { action: 'confirm', pending };
    }

    const kind = kindOf(clean);
    if(kind && !wake){
      return { action: 'confirm-required', kind, text: clean, prompt: confirmPrompt(kind) };
    }
    return { action: 'execute', kind, text: clean };
  }

  return {
    STALE_MS, STALL_MS, CONFIRM_MAX_MS,
    norm, has,
    startSpeech, readySpeech, cameraError, cameraLostSpeech, sosSpeech, cancelledSpeech,
    canDescribe, describeBlocked, freeSpeech, cameraHealth,
    confirmPrompt, voiceDecision,
  };
})();
