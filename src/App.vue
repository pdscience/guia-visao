<template>
<!-- screen-reader live regions -->
<div id="liveAlert" class="sr-only" aria-live="assertive" role="alert">{{ state.liveAlert }}</div>
<div id="liveStatus" class="sr-only" aria-live="polite">{{ state.liveStatus }}</div>

<div id="stage" class="min-h-dvh w-full flex items-center justify-center gap-10 md:py-8 relative">

  <!-- ================= LEFT PANEL (desktop showcase) ================= -->
  <aside class="hidden xl:flex flex-col w-[360px] flex-none select-none" aria-hidden="true">
    <p class="font-mono text-[11px] tracking-[.35em] text-[#00FF41] mb-5">PROJETO ASSISTIVO · TCC 2026</p>
    <h1 class="text-[56px] leading-[.95] font-black tracking-tight">Enxergue<br>com o <span class="text-[#00FF41]">som.</span></h1>
    <p class="mt-6 text-[15px] leading-relaxed text-white/55">
      O <strong class="text-white/90">Guia Visão</strong> usa a câmera do smartphone para detectar obstáculos
      em tempo real — pessoas, veículos, móveis e objetos — e avisa por
      <strong class="text-white/90">voz</strong> e <strong class="text-white/90">vibração</strong>,
      promovendo mobilidade, autonomia e prevenção de acidentes.
    </p>
    <ul class="mt-8 space-y-4 text-[14px] text-white/70">
      <li class="flex items-center gap-3"><span class="w-9 h-9 rounded-xl grid place-items-center bg-[#00FF41]/10 border border-[#00FF41]/25 text-[#00FF41]"><i data-lucide="scan-line" class="w-4.5 h-4.5"></i></span>Visão computacional em tempo real</li>
      <li class="flex items-center gap-3"><span class="w-9 h-9 rounded-xl grid place-items-center bg-[#00FF41]/10 border border-[#00FF41]/25 text-[#00FF41]"><i data-lucide="volume-2" class="w-4.5 h-4.5"></i></span>Alertas falados curtos e objetivos</li>
      <li class="flex items-center gap-3"><span class="w-9 h-9 rounded-xl grid place-items-center bg-[#00FF41]/10 border border-[#00FF41]/25 text-[#00FF41]"><i data-lucide="vibrate" class="w-4.5 h-4.5"></i></span>Vibração inteligente para risco próximo</li>
      <li class="flex items-center gap-3"><span class="w-9 h-9 rounded-xl grid place-items-center bg-[#00FF41]/10 border border-[#00FF41]/25 text-[#00FF41]"><i data-lucide="mic" class="w-4.5 h-4.5"></i></span>Comandos de voz sem toque</li>
    </ul>
    <div class="mt-9 flex flex-wrap gap-2 font-mono text-[10px] tracking-widest text-white/40">
      <span class="px-3 py-1.5 rounded-full border border-white/10">getUserMedia</span>
      <span class="px-3 py-1.5 rounded-full border border-white/10">TF Lite · COCO-SSD</span>
      <span class="px-3 py-1.5 rounded-full border border-white/10">Web Speech</span>
      <span class="px-3 py-1.5 rounded-full border border-white/10">Haptics</span>
    </div>
    <p class="mt-10 font-mono text-[10px] tracking-[.25em] text-white/25">GUIA VISÃO — PARA QUEM TRANSFORMA BARREIRA EM CAMINHO</p>
  </aside>

  <!-- ================= DEVICE ================= -->
  <div id="device" class="relative w-full h-dvh md:h-[min(880px,94dvh)] md:w-auto md:aspect-[9/19.2] md:p-[11px] md:rounded-[3.4rem] md:bg-gradient-to-b md:from-[#181b22] md:via-[#0b0d12] md:to-[#14161c] md:ring-1 md:ring-white/12 md:shadow-[0_60px_140px_-30px_rgba(0,0,0,.95),0_0_90px_-30px_rgba(0,255,65,.12)]">
    <div id="app" ref="appRef" class="relative h-full w-full overflow-hidden bg-black md:rounded-[2.8rem]" :class="{ running: state.runningClass, 'danger-pulse': state.dangerPulse }" :style="{ '--risk': state.riskColor }" role="main" aria-label="Aplicativo Guia Visão">

      <!-- notch (desktop frame) -->
      <div class="hidden md:block absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-[26px] bg-black rounded-full z-50 ring-1 ring-white/8 pointer-events-none"></div>

      <!-- camera + sim + overlay -->
<video ref="camRef" id="cam" class="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-700" autoplay playsinline muted aria-label="Imagem da câmera traseira"></video>
<canvas ref="sceneRef" id="scene" class="absolute inset-0 w-full h-full opacity-0 transition-opacity duration-700" aria-hidden="true"></canvas>
<canvas ref="overlayRef" id="overlay" class="absolute inset-0 w-full h-full z-10 pointer-events-none" aria-hidden="true"></canvas>

      <!-- HUD dressing -->
      <div class="hud-corners"><span></span><span></span><span></span><span></span></div>
      <div class="scanbeam"></div>
      <div class="riskglow"></div>
      <div class="scanlines"></div>
      <div class="absolute top-0 inset-x-0 h-32 fade-top z-20 pointer-events-none"></div>
      <div class="absolute bottom-0 inset-x-0 h-72 fade-bottom z-20 pointer-events-none"></div>

      <!-- ================= HEADER ================= -->
      <header class="absolute top-0 inset-x-0 z-30 px-5 pt-[max(1.15rem,env(safe-area-inset-top))] md:pt-11 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
<span class="w-9 h-9 rounded-xl grid place-items-center overflow-hidden"><img src="/assets/logoguiavisao.png" alt="Guia Visão" class="w-full h-full object-contain"></span>
          <div class="leading-none">
            <p class="font-black tracking-tight text-[15px]">GUIA VISÃO</p>
            <p class="font-mono text-[8.5px] tracking-[.3em] text-white/45 mt-1">MOBILIDADE ASSISTIVA</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btnTorch" class="icon-btn" aria-label="Ativar lanterna" aria-pressed="false"><i data-lucide="zap" class="w-5 h-5"></i></button>
          <button id="btnSOS" class="icon-btn" aria-label="Acionar alarme de emergência. Não faz chamadas."><i data-lucide="triangle-alert" class="w-5 h-5"></i></button>
          <button id="btnHelp" class="icon-btn" aria-label="Abrir ajuda e comandos de voz"><i data-lucide="info" class="w-5 h-5"></i></button>
        </div>
      </header>

      <!-- status chip -->
      <div class="absolute top-[max(4.6rem,calc(env(safe-area-inset-top)+3.4rem))] md:top-28 inset-x-0 z-30 flex flex-col items-center gap-2 pointer-events-none">
        <div class="chip font-mono text-white/75">
          <span class="dot"></span>
          <span id="chipStatus">{{ state.chip.status }}</span>
          <span class="text-white/25">|</span>
          <span id="chipFps" class="text-white/40">{{ state.chip.fps }}</span>
        </div>
        <span id="chipOffline" class="chip font-mono !text-[10px] !text-[#FFC53D] !border-[#FFC53D]/40" :class="{ hidden: !state.chip.offline }">MODO OFFLINE</span>
      </div>

      <!-- idle empty state -->
      <div id="idleState" class="absolute inset-0 z-20 grid place-items-center pointer-events-none" :style="{ display: state.idleVisible ? 'grid' : 'none' }">
        <div class="text-center px-8">
          <div class="mx-auto w-20 h-20 rounded-3xl border border-white/12 bg-white/4 grid place-items-center text-white/40 mb-5">
            <i data-lucide="scan-line" class="w-9 h-9"></i>
          </div>
          <p class="font-extrabold text-xl tracking-tight text-white/85">Detecção pausada</p>
          <p class="font-mono text-[10.5px] tracking-[.2em] text-white/40 mt-2">TOQUE EM INICIAR OU DIGA “INICIAR”</p>
        </div>
      </div>

      <!-- ================= BOTTOM: alert + controls ================= -->
      <div class="absolute bottom-0 inset-x-0 z-30 px-5 pb-[max(1.4rem,env(safe-area-inset-bottom))]">
        <button id="alertCard" class="mb-5" :class="{ 'opacity-70': state.alert.dim }" :aria-label="state.alert.aria" :style="{ outline: state.alert.outline }">
          <span class="riskdot w-12 h-12 rounded-2xl grid place-items-center flex-none text-[#0b0e05]">
<span id="alertIconOk" :class="{ hidden: state.alert.icon !== 'ok' }"><i data-lucide="circle-check" class="w-6 h-6"></i></span>
<span id="alertIconWarn" :class="{ hidden: state.alert.icon !== 'warn' }"><i data-lucide="circle-alert" class="w-6 h-6"></i></span>
<span id="alertIconDanger" :class="{ hidden: state.alert.icon !== 'danger' }"><i data-lucide="triangle-alert" class="w-6 h-6"></i></span>
          </span>
          <span class="flex-1 min-w-0">
<span id="alertTitle" class="block font-extrabold text-lg leading-tight tracking-tight text-white">{{ state.alert.title }}</span>
<span id="alertSub" class="block font-mono text-[10px] tracking-[.18em] text-white/50 mt-1">{{ state.alert.sub }}</span>
          </span>
          <span id="riskTag" class="font-mono text-[10px] tracking-[.15em] rounded-full px-3 py-1.5 flex-none">{{ state.alert.tag }}</span>
        </button>

        <div class="flex items-end justify-center gap-7" role="group" aria-label="Controles principais">
          <div class="flex flex-col items-center gap-2">
            <button id="btnVoice" class="ctl-secondary" aria-label="Ativar comandos de voz" aria-pressed="false">
              <i data-lucide="mic" class="w-6 h-6"></i>
            </button>
            <span class="font-mono text-[8.5px] tracking-[.25em] text-white/40">VOZ</span>
          </div>
          <div class="flex flex-col items-center gap-2">
<button id="btnMain" :class="{ stop: state.main.stop }" :aria-pressed="state.main.pressed" :aria-label="state.main.stop ? 'Parar detecção. Segure por 2 segundos para acionar o alarme de emergência. O alarme não faz chamadas.' : 'Iniciar detecção de obstáculos'">
<span id="icPlay" :class="{ hidden: state.main.stop }"><i data-lucide="play" class="w-10 h-10 ml-1"></i></span>
<span id="icStop" :class="{ hidden: !state.main.stop }"><i data-lucide="square" class="w-8 h-8"></i></span>
            </button>
            <span id="mainLabel" class="font-mono text-[8.5px] tracking-[.25em] text-white/55">{{ state.main.label }}</span>
          </div>
          <div class="flex flex-col items-center gap-2">
            <button id="btnSettings" class="ctl-secondary" aria-label="Abrir configurações">
              <i data-lucide="sliders-horizontal" class="w-6 h-6"></i>
            </button>
            <span class="font-mono text-[8.5px] tracking-[.25em] text-white/40">AJUSTES</span>
          </div>
        </div>
        <p class="text-center font-mono text-[9px] tracking-[.3em] text-white/30 mt-4">DIGA: “O QUE TEM À FRENTE?”</p>
      </div>

      <!-- ================= SETTINGS SHEET ================= -->
      <section id="sheetSettings" class="sheet" :class="{ open: state.sheet === 'sheetSettings' }" role="dialog" aria-modal="true" aria-label="Configurações" tabindex="-1">
        <div class="mx-2 mb-2 rounded-[28px] bg-[#0e1016]/95 backdrop-blur-2xl border border-white/10 p-6 pb-[max(1.6rem,env(safe-area-inset-bottom))]">
          <div class="flex items-center justify-between mb-6">
            <h2 class="font-black text-lg tracking-tight flex items-center gap-2.5"><i data-lucide="sliders-horizontal" class="w-5 h-5 text-[#00FF41]"></i>Ajustes de acessibilidade</h2>
            <button class="icon-btn" data-close aria-label="Fechar configurações"><i data-lucide="x" class="w-5 h-5"></i></button>
          </div>
          <div class="space-y-5 text-[15px]">
            <label class="flex items-center justify-between gap-4">
              <span class="flex items-center gap-3"><i data-lucide="volume-2" class="w-5 h-5 text-white/50"></i><span>Alertas por voz<span class="block font-mono text-[9px] tracking-[.15em] text-white/35 mt-0.5">LEITURA DOS OBSTÁCULOS (TTS)</span></span></span>
              <span class="switch"><input id="swVoice" type="checkbox" :checked="state.tts" @change="onVoiceChange" aria-label="Ativar alertas por voz"><span class="tr"></span><span class="th"></span></span>
            </label>
            <label class="flex items-center justify-between gap-4">
              <span class="flex items-center gap-3"><i data-lucide="mic" class="w-5 h-5 text-white/50"></i><span>Escuta automática<span class="block font-mono text-[9px] tracking-[.15em] text-white/35 mt-0.5">MIC LIGA JUNTO COM DETECÇÃO</span></span></span>
              <span class="switch"><input id="swAutoVoice" type="checkbox" :checked="state.autoVoice" @change="onAutoVoiceChange" aria-label="Ativar escuta automática de comandos de voz"><span class="tr"></span><span class="th"></span></span>
            </label>
            <button id="btnMyObst" class="mt-3 w-full h-14 rounded-2xl border border-white/15 bg-white/5 font-bold text-[14px] text-white/80 flex items-center justify-center gap-3 active:scale-[.98] transition">Meus obstáculos (<span id="myObstCount">{{ state.myObstacles.length }}</span>)</button>
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <span class="flex items-center gap-3"><i data-lucide="gauge" class="w-5 h-5 text-white/50"></i>Velocidade da fala</span>
                <span id="rateVal" class="font-mono text-[11px] text-[#00FF41]">{{ state.rateVal }}</span>
              </div>
              <input id="rgRate" type="range" min="0.6" max="1.5" step="0.1" :value="state.rate" @input="onRateInput" aria-label="Velocidade da fala">
            </div>
            <label class="flex items-center justify-between gap-4">
              <span class="flex items-center gap-3"><i data-lucide="vibrate" class="w-5 h-5 text-white/50"></i><span>Vibração inteligente<span class="block font-mono text-[9px] tracking-[.15em] text-white/35 mt-0.5">REFORÇO EM RISCO PRÓXIMO</span></span></span>
              <span class="switch"><input id="swVib" type="checkbox" :checked="state.vib" @change="onVibChange" aria-label="Ativar vibração"><span class="tr"></span><span class="th"></span></span>
            </label>
            <label class="flex items-center justify-between gap-4">
              <span class="flex items-center gap-3"><i data-lucide="audio-lines" class="w-5 h-5 text-white/50"></i><span>Som de proximidade<span class="block font-mono text-[9px] tracking-[.15em] text-white/35 mt-0.5">BIPES COMO SENSOR DE RÉ</span></span></span>
              <span class="switch"><input id="swSon" type="checkbox" :checked="state.son" @change="onSonChange" aria-label="Ativar som de proximidade"><span class="tr"></span><span class="th"></span></span>
            </label>
            <label class="flex items-center justify-between gap-4">
              <span class="flex items-center gap-3"><i data-lucide="scan-line" class="w-5 h-5 text-white/50"></i><span>Meus obstáculos<span class="block font-mono text-[9px] tracking-[.15em] text-white/35 mt-0.5">DETECÇÃO PERSONALIZADA (KNN)</span></span></span>
              <span class="switch"><input id="swKNn" type="checkbox" :checked="state.knnOn" @change="onKnnChange" aria-label="Ativar meus obstáculos"><span class="tr"></span><span class="th"></span></span>
            </label>
            <label class="flex items-center justify-between gap-4">
              <span class="flex items-center gap-3"><i data-lucide="flashlight" class="w-5 h-5 text-white/50"></i><span>Lanterna automática<span class="block font-mono text-[9px] tracking-[.15em] text-white/35 mt-0.5">SUGERE LIGAR EM AMBIENTE ESCURO</span></span></span>
              <span class="switch"><input type="checkbox" :checked="state.torchAuto" @change="e=>{state.torchAuto=e.target.checked;save();}" aria-label="Ativar sugestão de lanterna automática"><span class="tr"></span><span class="th"></span></span>
            </label>
            <label class="flex items-center justify-between gap-4">
              <span class="flex items-center gap-3"><i data-lucide="crosshair" class="w-5 h-5 text-white/50"></i><span>Precisão alta<span class="block font-mono text-[9px] tracking-[.15em] text-white/35 mt-0.5">MODELO MAIS PRECISO (MAIS LENTO)</span></span></span>
              <span class="switch"><input id="swAcc" type="checkbox" :checked="state.acc" @change="onAccChange" aria-label="Ativar modelo de precisão alta"><span class="tr"></span><span class="th"></span></span>
            </label>
<div class="rounded-2xl border border-[#00FF41]/25 bg-[#00FF41]/5 p-4 space-y-3">
  <label class="flex items-center justify-between gap-4">
    <span class="flex items-center gap-3"><i data-lucide="cloud" class="w-5 h-5 text-white/50"></i><span>IA na nuvem (Gemini)<span class="block font-mono text-[9px] tracking-[.15em] text-white/35 mt-0.5">DESCRIÇÃO DA CENA SOB PEDIDO · EXIGE INTERNET</span></span></span>
    <span class="switch"><input id="swCloud" type="checkbox" :checked="state.cloudOn" @change="onCloudChange" aria-label="Ativar IA na nuvem"><span class="tr"></span><span class="th"></span></span>
  </label>
  <input id="cloudKey" type="password" class="w-full h-12 rounded-xl border border-white/15 bg-white/5 px-4 font-mono text-[12px]" placeholder="Chave do Google AI Studio (grátis)" :value="state.cloudKey" @change="onCloudKeyChange" aria-label="Chave da API do Gemini">
  <p class="font-mono text-[9px] leading-relaxed tracking-[.08em] text-white/35">PEGUE A CHAVE GRÁTIS EM AISTUDIO.GOOGLE.COM. DESLIGADA, NADA SAI DO APARELHO; LIGADA, SÓ A FOTO PEDIDA POR VOCÊ. DIGA "O QUE TEM À FRENTE?" PARA DESCREVER.</p>
</div>
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <span class="flex items-center gap-3"><i data-lucide="activity" class="w-5 h-5 text-white/50"></i>Sensibilidade de distância</span>
                <span id="sensVal" class="font-mono text-[11px] text-[#00FF41]">{{ state.sensVal }}</span>
              </div>
              <input id="rgSens" type="range" min="0.6" max="1.7" step="0.1" :value="state.sens" @input="onSensInput" aria-label="Sensibilidade de distância">
            </div>
            <label class="flex items-center justify-between gap-4">
              <span class="flex items-center gap-3"><i data-lucide="accessibility" class="w-5 h-5 text-white/50"></i><span>Alto contraste<span class="block font-mono text-[9px] tracking-[.15em] text-white/35 mt-0.5">PARA BAIXA VISÃO</span></span></span>
              <span class="switch"><input id="swHC" type="checkbox" :checked="state.hc" @change="onHcChange" aria-label="Ativar alto contraste"><span class="tr"></span><span class="th"></span></span>
            </label>
            <label class="flex items-center justify-between gap-4">
              <span class="flex items-center gap-3"><i data-lucide="person-standing" class="w-5 h-5 text-white/50"></i><span>Texto ampliado<span class="block font-mono text-[9px] tracking-[.15em] text-white/35 mt-0.5">FONTE E ALVOS MAIORES</span></span></span>
              <span class="switch"><input id="swBig" type="checkbox" :checked="state.big" @change="onBigChange" aria-label="Ativar texto ampliado"><span class="tr"></span><span class="th"></span></span>
            </label>
          </div>
          <p class="mt-6 font-mono text-[9px] tracking-[.25em] text-white/30 text-center">GUIA VISÃO v1.0 · PROCESSAMENTO 100% LOCAL</p>
        </div>
      </section>

      <!-- ================= HELP SHEET ================= -->
      <section id="sheetHelp" class="sheet" :class="{ open: state.sheet === 'sheetHelp' }" role="dialog" aria-modal="true" aria-label="Ajuda e comandos de voz" tabindex="-1">
        <div class="mx-2 mb-2 rounded-[28px] bg-[#0e1016]/95 backdrop-blur-2xl border border-white/10 p-6 pb-[max(1.6rem,env(safe-area-inset-bottom))]">
          <div class="flex items-center justify-between mb-5">
            <h2 class="font-black text-lg tracking-tight flex items-center gap-2.5"><i data-lucide="mic" class="w-5 h-5 text-[#00FF41]"></i>Comandos de voz</h2>
            <button class="icon-btn" data-close aria-label="Fechar ajuda"><i data-lucide="x" class="w-5 h-5"></i></button>
          </div>
          <ul class="space-y-2.5 text-[14px]">
            <li class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3"><span>Iniciar a detecção</span><span class="font-mono text-[10px] tracking-[.12em] text-[#00FF41]">“GUIA VISÃO, INICIAR”</span></li>
            <li class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3"><span>Pausar a detecção</span><span class="font-mono text-[10px] tracking-[.12em] text-[#00FF41]">“GUIA VISÃO, PARAR”</span></li>
            <li class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3"><span>Descrever o ambiente</span><span class="font-mono text-[10px] tracking-[.12em] text-[#00FF41]">“O QUE TEM À FRENTE?”</span></li>
            <li class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3"><span>Repetir último alerta</span><span class="font-mono text-[10px] tracking-[.12em] text-[#00FF41]">“REPETIR”</span></li>
            <li class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3"><span>Vigiar um objeto (prioridade)</span><span class="font-mono text-[10px] tracking-[.12em] text-[#00FF41]">“VIGIAR CACHORRO”</span></li>
            <li class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3"><span>Parar de vigiar</span><span class="font-mono text-[10px] tracking-[.12em] text-[#00FF41]">“PARAR DE VIGIAR CACHORRO”</span></li>
            <li class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3"><span>Ler lista de vigilância</span><span class="font-mono text-[10px] tracking-[.12em] text-[#00FF41]">“LISTA DE VIGILÂNCIA”</span></li>
            <li class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3"><span>Ligar / desligar lanterna</span><span class="font-mono text-[10px] tracking-[.12em] text-[#00FF41]">“LANTERNA”</span></li>
            <li class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3"><span>Ajustar fala</span><span class="font-mono text-[10px] tracking-[.12em] text-[#00FF41]">“MAIS RÁPIDO / DEVAGAR”</span></li>
            <li class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3"><span>Diagnóstico do sistema</span><span class="font-mono text-[10px] tracking-[.12em] text-[#00FF41]">“DIAGNÓSTICO”</span></li>
            <li class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3"><span>Alarme de emergência (SOS)</span><span class="font-mono text-[10px] tracking-[.12em] text-[#00FF41]">BOTÃO SOS / SEGURAR PARAR 2s / “GUIA VISÃO, SOCORRO”</span></li>
          </ul>
          <p class="mt-5 text-[13px] leading-relaxed text-white/45">Comandos críticos, como iniciar, parar e socorro, pedem confirmação quando ditos sem a palavra de ativação. Diga “confirmar” depois, ou repita com “Guia Visão,” antes. O SOS é um alarme local: não faz chamadas nem envia mensagens. Ele toca, vibra e fala para chamar atenção de pessoas próximas. Para baixa iluminação, ative a lanterna no topo. O vídeo é analisado no seu aparelho. A imagem só sai do dispositivo se você ativar a IA na nuvem e pedir uma descrição — nesse caso, somente a foto desse pedido é enviada ao Google Gemini. “Vigiar” funciona só com objetos que a câmera já reconhece (pessoa, cachorro, bicicleta, carro, cavalo, cadeira…).</p>
        </div>
      </section>

<section id="sheetObst" class="sheet" :class="{ open: state.sheet === 'sheetObst' }" role="dialog" aria-modal="true" aria-label="Meus obstáculos" tabindex="-1">
  <div class="mx-2 mb-2 rounded-[28px] bg-[#0e1016]/95 backdrop-blur-2xl border border-white/10 p-6">
    <div class="flex items-center justify-between mb-5"><h2 class="font-black text-lg">Meus obstáculos</h2><button class="icon-btn" data-close aria-label="Fechar"><i data-lucide="x" class="w-5 h-5"></i></button></div>
    <ul id="myObstList" class="space-y-2.5 text-[14px]">
      <li v-for="o in state.myObstacles" :key="o.id" class="flex items-center justify-between rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
        <span>{{ o.nome }} <span class="font-mono text-[10px] text-white/40">· {{ o.count }} fotos</span></span>
        <span class="flex gap-2">
          <button class="icon-btn" :aria-label="'Ouvir nome ' + o.nome" @click="speakObstacle(o)"><i data-lucide="volume-2" class="w-5 h-5"></i></button>
          <button class="icon-btn" :aria-label="'Apagar ' + o.nome" @click="deleteObstacle(o)"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
        </span>
      </li>
      <li v-if="!state.myObstacles.length" class="text-white/40 text-[13px]">Nenhum obstáculo cadastrado ainda.</li>
    </ul>
    <input id="myObstName" v-model="state.myObstName" class="mt-4 w-full h-14 rounded-2xl border border-white/15 bg-white/5 px-4 font-bold" placeholder="Nome: ex. Portão de casa" aria-label="Nome do obstáculo">
    <div class="mt-3 flex flex-wrap gap-2 font-mono text-[10px]" id="myObstPresets">
      <button v-for="p in presets" :key="p" type="button" class="px-3 py-1.5 rounded-full border border-white/10" @click="state.myObstName = p">{{ p }}</button>
    </div>
    <button id="btnTrainStart" :disabled="state.training" class="mt-3 w-full h-14 rounded-2xl bg-gradient-to-br from-[#39FF7A] to-[#00C93A] text-[#0b0e05] font-black disabled:opacity-60" @click="trainObstacle">Fotografar 10 vezes</button>
    <p id="trainStatus" class="mt-3 font-mono text-[10px] tracking-[.15em] text-white/50" aria-live="polite">{{ state.trainStatus }}</p>
  </div>
</section>
      <div id="backdrop" :class="{ open: !!state.sheet }"></div>

      <!-- toast -->
      <div id="toast" class="chip font-mono !text-[10.5px] text-white/85 !bg-[#0e1016]/90" :class="{ show: state.toast.show }" role="status" aria-live="polite">{{ state.toast.text }}</div>

      <!-- ================= INTRO ================= -->
      <div id="intro" class="absolute inset-0 z-[90] bg-[#07080d] flex flex-col" :class="{ away: !state.introVisible }" tabindex="-1" role="dialog" aria-modal="true">
        <div class="grain"></div>
        <div class="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#00FF41]/10 blur-[90px]"></div>
        <div class="absolute -bottom-32 -left-24 w-80 h-80 rounded-full bg-[#FF4E3E]/8 blur-[100px]"></div>
        <div class="relative flex-1 flex flex-col justify-center px-7 pt-14">
<div class="monogram mb-8 rise d1 grid place-items-center overflow-hidden rounded-3xl">
<span class="absolute inset-0 grid place-items-center"><img src="/assets/logoguiavisao.png" alt="Guia Visão" class="w-16 h-16 object-contain"></span>
</div>
          <p class="font-mono text-[10px] tracking-[.4em] text-[#00FF41] mb-3 rise d2">GUIA VISÃO · ASSISTENTE DE MOBILIDADE</p>
          <h2 class="text-[42px] leading-[1] font-black tracking-tight rise d3">Enxergue<br>com o som.</h2>
          <p class="mt-5 text-[15.5px] leading-relaxed text-white/60 rise d4">
            A câmera detecta obstáculos em tempo real e o Guia Visão avisa você
            por <span class="text-white font-semibold">voz</span> e <span class="text-white font-semibold">vibração</span> —
            para caminhar com mais autonomia e segurança.
          </p>
          <ul class="mt-6 space-y-3 rise d5 text-[13.5px] text-white/55">
            <li class="flex items-center gap-3"><i data-lucide="scan-line" class="w-4.5 h-4.5 text-[#00FF41]"></i>Pessoas, veículos, móveis e objetos no caminho</li>
            <li class="flex items-center gap-3"><i data-lucide="vibrate" class="w-4.5 h-4.5 text-[#00FF41]"></i>Vibração intensa quando o risco está perto</li>
            <li class="flex items-center gap-3"><i data-lucide="mic" class="w-4.5 h-4.5 text-[#00FF41]"></i>Comandos de voz, sem usar as mãos</li>
          </ul>
        </div>
        <div class="relative px-7 pb-[max(2rem,env(safe-area-inset-bottom))] rise d6">
          <button id="btnStartCam" class="w-full h-16 rounded-2xl bg-gradient-to-br from-[#39FF7A] to-[#00C93A] text-[#0b0e05] font-black text-[16px] tracking-tight flex items-center justify-center gap-3 active:scale-[.98] transition shadow-[0_20px_50px_-14px_rgba(0,255,65,.5)]">
            <i data-lucide="camera" class="w-5.5 h-5.5"></i>Ativar câmera
          </button>
          <p class="mt-4 text-center font-mono text-[8.5px] tracking-[.25em] text-white/30">VÍDEO PROCESSADO NO APARELHO · NUVEM SÓ SOB PEDIDO</p>
        </div>
      </div>

    </div>
  </div>

  <!-- ================= RIGHT PANEL (telemetry) ================= -->
  <aside class="hidden xl:flex flex-col w-[330px] flex-none max-h-[880px]" aria-hidden="true">
    <div class="flex items-center gap-3 mb-5">
      <span class="led"></span>
      <p class="font-mono text-[11px] tracking-[.35em] text-white/70">TELEMETRIA AO VIVO</p>
    </div>
    <div class="grid grid-cols-2 gap-3 mb-6">
      <div class="rounded-2xl border border-white/10 bg-white/4 backdrop-blur p-4">
        <div class="flex items-center gap-2 text-white/40 mb-2"><i data-lucide="activity" class="w-3.5 h-3.5"></i><span class="font-mono text-[9px] tracking-[.2em]">DETECÇÕES/MIN</span></div>
        <p id="statDet" class="font-mono text-3xl font-bold text-[#00FF41]">{{ state.stats.det }}</p>
      </div>
      <div class="rounded-2xl border border-white/10 bg-white/4 backdrop-blur p-4">
        <div class="flex items-center gap-2 text-white/40 mb-2"><i data-lucide="volume-2" class="w-3.5 h-3.5"></i><span class="font-mono text-[9px] tracking-[.2em]">ALERTAS DE VOZ</span></div>
        <p id="statVoice" class="font-mono text-3xl font-bold text-white/85">{{ state.stats.voice }}</p>
      </div>
      <div class="rounded-2xl border border-white/10 bg-white/4 backdrop-blur p-4">
        <div class="flex items-center gap-2 text-white/40 mb-2"><i data-lucide="vibrate" class="w-3.5 h-3.5"></i><span class="font-mono text-[9px] tracking-[.2em]">VIBRAÇÕES</span></div>
        <p id="statVib" class="font-mono text-3xl font-bold text-[#FFC53D]">{{ state.stats.vib }}</p>
      </div>
      <div class="rounded-2xl border border-white/10 bg-white/4 backdrop-blur p-4">
        <div class="flex items-center gap-2 text-white/40 mb-2"><i data-lucide="timer" class="w-3.5 h-3.5"></i><span class="font-mono text-[9px] tracking-[.2em]">SESSÃO</span></div>
        <p id="statTime" class="font-mono text-3xl font-bold text-white/85">{{ state.stats.time }}</p>
      </div>
    </div>
    <div class="rounded-2xl border border-white/10 bg-white/4 backdrop-blur p-4 flex-1 min-h-[300px] overflow-hidden flex flex-col">
      <p class="font-mono text-[9px] tracking-[.25em] text-white/40 mb-3">REGISTRO DE EVENTOS</p>
      <ul id="telemetry" class="font-mono text-[10.5px] leading-relaxed space-y-1.5 overflow-y-auto pr-1 flex-1"><li v-for="(e,i) in state.telemetry" :key="e.t+i"><span class="text-white/30">{{ e.t }}</span> <span :style="{ color: e.tone || '#00FF41' }">{{ e.kind }}</span> <span class="text-white/60">{{ e.msg }}</span></li></ul>
    </div>
  </aside>
</div>
</template>

<script setup>
import { onMounted, ref, reactive, watch } from 'vue';
import { createController } from './core/controller.js';
import { readPrefs, savePrefs } from './core/prefs.js';
import { registerSW, setOfflineUI } from './core/pwa.js';
import { PRESETS } from './core/obstacles.js';

const appRef = ref(null);
const camRef = ref(null);
const overlayRef = ref(null);
const sceneRef = ref(null);
const presets = PRESETS;

const state = reactive({
  mode:'idle', running:false, autoVoice:true, tts:true, rate:1, vib:true, son:true, sens:1, acc:false, hc:false, big:false, torchAuto:true, lowLight:false, walkMode:'walk',
  cloudOn:false, cloudKey:'',
  knnOn:true, knnReady:false, knnCount:{}, telemetry:[], alert:{title:'Detecção pausada',sub:'SEM ANÁLISE',tag:'PARADO',icon:'ok',aria:'Detecção pausada. Sem análise.',outline:'',dim:true},
  chip:{status:'PRONTO',fps:'-- FPS',offline:false}, main:{pressed:false,label:'INICIAR',stop:false},
  stats:{det:0,voice:0,vib:0,time:'00:00'}, prefs:{}, liveAlert:'', liveStatus:'', idleVisible:true, introVisible:true,
  sheet:null, toast:{text:'',show:false}, runningClass:false, dangerPulse:false, lastDets:[], lastRaw:{n:0,top:'nada'},
  personalHit:null, ttsErr:null, ttsNoVoiceLogged:false, inferErr:null, inferErrLogged:false, simItems:[], lastSpoke:0, lastVib:0, lastKey:'', stableKey:'', stableCount:0, lastPan:0, closeness:0, risk:0, noFrameSince:0, noFrameWarned:false, lastFree:true, lastFrameTs:0, lastVideoTime:0, lastVideoTimeAt:Date.now(), readyAnnounced:false, pendingCmd:null, pendingAt:0, sessionT:0, timer:null, wake:null, inferBusy:false, modelReady:false, modelBase:null, stream:null, track:null, torchOn:false, listening:false, recog:null, small:null, sctx:null, sw:0, sh:0, actx:null, voiceCount:0, vibCount:0, detCount:0, frames:0, roadOff:0, simLast:0, vibrate:(p)=>{}, toastFn:(m)=>{}, speakStart:0, micPaused:false, ttsBusy:false, ttsQueue:null, speakSeq:0, micStop:null, voice:null, voiceName:null, knnNames:{}, freeSpeech:'Nenhum obstáculo reconhecido agora. Isso não garante caminho livre; siga com cautela.', lastDetTs:Date.now(), lastTopBbox:null, lastTopCls:null, lastTopDist:null, lastTopTs:0, rateVal:'1.0×', sensVal:'NORMAL', rgRate:null, rgSens:null, prefMode:'live', startedOnce:false, resumeOnVisible:false, resumeMode:'live', sosFired:false, lastTap:0, lastPulse:0, riskColor:'#00FF41',
  myObstacles:[], myObstName:'', trainStatus:'PRONTO PARA CADASTRAR', training:false,
});

let ctrl = null;
let toastTimer = null;

watch(() => state.rate, () => { const el = rangeEl('rgRate'); if(el){ el.value = state.rate; paintRange(el); } });
watch(() => state.sens, () => { const el = rangeEl('rgSens'); if(el){ el.value = state.sens; paintRange(el); } });

function rangeEl(id){ return document.getElementById(id); }
function paintRange(el){ if(!el) return; const p = (el.value - el.min) / (el.max - el.min) * 100; el.style.setProperty('--fill', p + '%'); }
function save(){ savePrefs(state); }

function onVoiceChange(e){ state.tts = e.target.checked; if(state.tts) ctrl?.speak('Voz ativada.'); save(); }
function onAutoVoiceChange(e){
  state.autoVoice = e.target.checked;
  if(state.autoVoice && !state.listening && state.running) ctrl?.setListening(true, true);
  if(!state.autoVoice && state.listening) ctrl?.setListening(false, true);
  save();
}
function onVibChange(e){ state.vib = e.target.checked; if(state.vib) state.vibrate?.(60); save(); }
function onSonChange(e){ state.son = e.target.checked; if(state.son) ctrl?.beep(880); save(); }
function onKnnChange(e){ state.knnOn = e.target.checked; if(!state.knnOn) state.personalHit = null; save(); }
async function onAccChange(e){ await ctrl?.setAcc(e.target.checked); save(); }
function onCloudChange(e){
  state.cloudOn = e.target.checked;
  ctrl?.setCloudEnabled(state.cloudOn);
  if(state.cloudOn && !state.cloudKey) ctrl?.speak('Ativado, mas falta a chave. Cole a chave da API no campo abaixo.');
  else ctrl?.speak(state.cloudOn ? 'IA na nuvem ativada.' : 'IA na nuvem desativada.');
}
function onCloudKeyChange(e){ state.cloudKey = e.target.value.trim(); ctrl?.setCloudKey(state.cloudKey); ctrl?.speak(state.cloudKey ? 'Chave salva neste aparelho' : 'Chave removida'); }
function onHcChange(e){ state.hc = e.target.checked; document.body.classList.toggle('hc', state.hc); ctrl?.speak(state.hc ? 'Alto contraste ativado.' : 'Alto contraste desativado.'); save(); }
function onBigChange(e){ state.big = e.target.checked; document.body.classList.toggle('bigtype', state.big); ctrl?.speak(state.big ? 'Texto ampliado.' : 'Texto normal.'); save(); }
function onRateInput(e){ ctrl?.setRate(+e.target.value); state.rateVal = state.rate.toFixed(1) + '×'; paintRange(e.target); save(); }
function onSensInput(e){
  state.sens = +e.target.value;
  state.sensVal = state.sens < 0.9 ? 'BAIXA' : state.sens > 1.3 ? 'ALTA' : 'NORMAL';
  paintRange(e.target); save();
}

async function refreshObstacles(){ try{ state.myObstacles = await ctrl.listObstacles(); }catch(e){ state.myObstacles = []; } }
function speakObstacle(o){ ctrl?.speak(o.nome, true); }
async function deleteObstacle(o){
  try{ await ctrl.deleteObstacle(o.id); await refreshObstacles(); ctrl?.speak(o.nome + ' apagado.', true); }catch(e){}
}
async function trainObstacle(){
  const nome = (state.myObstName || '').trim();
  if(!nome){ ctrl?.speak('Diga ou digite o nome do obstáculo primeiro.', true); return; }
  if(!state.running || state.mode !== 'live'){ ctrl?.speak('Ative a câmera primeiro para fotografar.', true); return; }
  if(state.myObstacles.length >= 12){ ctrl?.speak('Limite de 12 obstáculos. Apague um para cadastrar outro.', true); return; }
  state.training = true;
  try{
    await ctrl.trainObstacle(nome, (i, n) => { state.trainStatus = `FOTO ${i}/${n}`; });
    state.trainStatus = 'CADASTRO CONCLUÍDO';
    state.myObstName = '';
  }catch(e){
    const cancelado = /(interromp|cancel)/i.test((e && e.message) || '');
    state.trainStatus = cancelado ? 'TREINO CANCELADO' : 'FALHA AO FOTOGRAFAR';
    ctrl?.speak(cancelado ? 'Treinamento cancelado.' : 'Falha ao fotografar. Tente de novo.', true);
  }
  state.training = false;
  await refreshObstacles();
}

function applyPrefs(p){
  for(const k of ['tts','autoVoice','vib','son','knnOn','acc','torchAuto']){ if(typeof p[k] === 'boolean') state[k] = p[k]; }
  if(typeof p.sens === 'number' && p.sens >= 0.6 && p.sens <= 1.7) state.sens = p.sens;
  if(typeof p.torchAuto === 'boolean') state.torchAuto = p.torchAuto;
  if(typeof p.rate === 'number' && p.rate >= 0.6 && p.rate <= 1.5) state.rate = Math.round(p.rate * 100) / 100;
  state.hc = p.hc === true; state.big = p.big === true;
  document.body.classList.toggle('hc', state.hc);
  document.body.classList.toggle('bigtype', state.big);
  state.rateVal = state.rate.toFixed(1) + '×';
  state.sensVal = state.sens < 0.9 ? 'BAIXA' : state.sens > 1.3 ? 'ALTA' : 'NORMAL';
}

onMounted(() => {
  ctrl = createController({ state, refs: { root: appRef.value, video: camRef.value, overlay: overlayRef.value, scene: sceneRef.value } });
  window.GuiaVisao = ctrl;

  applyPrefs(readPrefs(state));
  const cs = ctrl.cloudState();
  state.cloudOn = cs.enabled; state.cloudKey = cs.key;
  paintRange(rangeEl('rgRate')); paintRange(rangeEl('rgSens'));

  state.toastFn = (m) => { state.toast.text = m; state.toast.show = true; clearTimeout(toastTimer); toastTimer = setTimeout(()=>{ state.toast.show=false; }, 2600); };
  state.vibrate = (p) => { if(!state.vib || !navigator.vibrate) return; navigator.vibrate(p); state.vibCount = (state.vibCount||0)+1; state.stats.vib = state.vibCount; };

  registerSW();
  window.addEventListener('guia:sw-update', () => state.toastFn('Nova versão disponível — recarregue'));
  setOfflineUI(state, !navigator.onLine);
  window.addEventListener('offline', ()=>{ setOfflineUI(state, true); state.liveStatus = 'Modo offline. Detecção usa modelo em cache.'; state.toastFn('MODO OFFLINE — usando cache'); });
  window.addEventListener('online', ()=>{ setOfflineUI(state, false); state.toastFn('Conexão restaurada'); });

  const ro = new ResizeObserver(()=>{ try{ ctrl.resize(); }catch(e){} });
  if(appRef.value) ro.observe(appRef.value);
  ctrl.resize();

  const btnMain = document.getElementById('btnMain');
  if (btnMain) {
    btnMain.addEventListener('click', () => {
      if (state.sosFired) { state.sosFired = false; return; }
      if (state.running) { ctrl.stopAll(); } else { ctrl.start(state.prefMode || 'live'); }
    });
    let sosTimer = null;
    btnMain.addEventListener('pointerdown', () => {
      state.sosFired = false;
      clearTimeout(sosTimer);
      sosTimer = setTimeout(() => { state.sosFired = true; ctrl.triggerSOS(); sosTimer = null; }, 2000);
    });
    ['pointerup','pointerleave','pointercancel'].forEach(ev => btnMain.addEventListener(ev, () => clearTimeout(sosTimer)));
  }
  const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  bind('btnSOS', () => ctrl.triggerSOS());
  bind('btnVoice', () => { ctrl.unlockAudio(); ctrl.setListening(!state.listening); });
  bind('btnSettings', () => ctrl.openSheet('sheetSettings'));
  bind('btnHelp', () => ctrl.openSheet('sheetHelp'));
  bind('btnTorch', () => { ctrl.unlockAudio(); ctrl.setTorch(!state.torchOn); });
  bind('btnMyObst', () => { refreshObstacles(); ctrl.openSheet('sheetObst'); });
  bind('btnStartCam', (e) => { e.stopPropagation(); ctrl.unlockAudio(); ctrl.start('live'); });
  const intro = document.getElementById('intro');
  if (intro) intro.addEventListener('click', () => { if (!intro.classList.contains('away')) { ctrl.unlockAudio(); ctrl.start('live'); } });
  const alertCard = document.getElementById('alertCard');
  if (alertCard) alertCard.addEventListener('click', () => ctrl.repeatAlert());
  const backdrop = document.getElementById('backdrop');
  if (backdrop) backdrop.addEventListener('click', () => ctrl.closeSheets());
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => ctrl.closeSheets()));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') ctrl.closeSheets(); });

  refreshObstacles();

  setTimeout(()=>{
    if(state.startedOnce || !state.introVisible) return;
    state.liveStatus = 'Guia Visão pronto. Toque em qualquer lugar para ativar a câmera, ou diga iniciar.';
    ctrl.speak('Guia Visão pronto. Toque em qualquer lugar da tela para ativar a câmera. Você também pode dizer: iniciar. Para simular sem câmera, diga demonstração.', false);
  }, 900);

  try { window.lucide?.createIcons(); } catch (e) {}
});
</script>
