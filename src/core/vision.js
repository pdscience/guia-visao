export function createVision(state, refs, speech){
  function logEvent(kind, msg, tone){
    try{
      if(!state.telemetry) state.telemetry = [];
      state.telemetry.unshift({ kind, msg, tone, t: new Date().toLocaleTimeString('pt-BR',{hour12:false}) });
      if(state.telemetry.length > 40) state.telemetry.length = 40;
    }catch(e){}
  }
  const api = {
    startLive(){}, loopLive(){}, onCameraLost(){}, ensureModel(){ return Promise.resolve(); },
    startSim(){}, simTick(){}, spawnSim(){}, simScene(){}, simPict(){},
    drawOverlay(){}, coverTransform(){ return { sx:0, sy:0, sw:0, sh:0 }; },
    roundRect(){}, processFrame(){}, logEvent,
  };
  return api;
}
