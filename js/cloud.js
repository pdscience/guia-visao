/* js/cloud.js — IA na nuvem (Gemini), sob demanda. Padrão DESLIGADO. */
const CloudVision = {
  KEY:'guia-visao-gemini', ENABLED:'guia-visao-nuvem',
  MODEL:'gemini-2.5-flash', GAP:5000, _last:0,
  getKey(){ try{ return localStorage.getItem(this.KEY)||''; }catch(e){ return ''; } },
  setKey(k){ try{ k ? localStorage.setItem(this.KEY,k) : localStorage.removeItem(this.KEY); }catch(e){} },
  isEnabled(){ try{ return localStorage.getItem(this.ENABLED)==='1'; }catch(e){ return false; } },
  setEnabled(on){ try{ localStorage.setItem(this.ENABLED, on?'1':'0'); }catch(e){} },
  available(){ return this.isEnabled() && !!this.getKey() && navigator.onLine; },
  async describe(src, dets){
    const now = performance.now();
    if(now - this._last < this.GAP) return {ok:false, err:'aguarde alguns segundos'};
    this._last = now;
    try{
      const canvas = document.createElement('canvas');
      const w = src.videoWidth || src.width || 640, h = src.videoHeight || src.height || 480;
      const sc = Math.min(1, 640/Math.max(w,h));
      canvas.width = Math.max(1,Math.round(w*sc)); canvas.height = Math.max(1,Math.round(h*sc));
      canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL('image/jpeg',0.7).split(',')[1];
      const ctx = (dets&&dets.length)
        ? dets.slice(0,5).map(d=>`${d.nome} ${d.dir} (~${d.dist}m, risco ${d.risk})`).join('; ')
        : 'nenhuma';
      const prompt = 'Você é um guia de mobilidade para pessoa cega em ambiente urbano brasileiro. O detector local da câmera viu: '+ctx+'. Descreva a cena em português do Brasil em 2 a 3 frases curtas (máximo 60 palavras): quais obstáculos existem, de que lado (esquerda, direita, à frente) e, quando possível, a distância. Não invente detalhes; se algo for incerto, diga "parece". Não use emojis.';
      const ctrl = new AbortController(); const to = setTimeout(()=>ctrl.abort(), 15000);
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+this.MODEL+':generateContent', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'x-goog-api-key': this.getKey() },
        signal: ctrl.signal,
        body: JSON.stringify({
          contents:[{ parts:[ {text:prompt}, {inline_data:{mime_type:'image/jpeg', data:b64}} ] }],
          generationConfig:{ temperature:0.4, maxOutputTokens:220 }
        })
      });
      clearTimeout(to);
      if(!res.ok){
        const err = ({400:'chave inválida',401:'chave inválida',403:'chave sem permissão',429:'cota da nuvem atingida'})[res.status] || ('erro '+res.status);
        return {ok:false, err};
      }
      const j = await res.json();
      const text = (j?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join(' ').trim();
      if(!text) return {ok:false, err:'resposta vazia da nuvem'};
      return {ok:true, text};
    }catch(e){
      return {ok:false, err:(e && e.name==='AbortError') ? 'nuvem demorou' : 'sem conexão com a nuvem'};
    }
  },
};
