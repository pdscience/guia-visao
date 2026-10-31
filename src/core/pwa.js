export function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(r => {
      r.onupdatefound = () => {
        const n = r.installing;
        n.onstatechange = () => {
          if(n.state === 'installed' && navigator.serviceWorker.controller){
            window.__SW_UPDATE__ = true;
            try { window.toast && window.toast('Nova versão disponível — recarregue'); } catch(e){}
          }
        };
      };
    }).catch(() => {});
  });
}

export function setOfflineUI(state, off){
  if(state) state.offline = off;
  const c = document.querySelector('#chipOffline');
  if(c) c.classList.toggle('hidden', !off);
}
