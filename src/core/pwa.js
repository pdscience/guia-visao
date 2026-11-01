export function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(r => {
      r.onupdatefound = () => {
        const n = r.installing;
        n.onstatechange = () => {
          if(n.state === 'installed' && navigator.serviceWorker.controller){
            window.__SW_UPDATE__ = true;
            window.dispatchEvent(new CustomEvent('guia:sw-update'));
          }
        };
      };
    }).catch(() => {});
  });
}

export function setOfflineUI(state, off){
  if(state && state.chip) state.chip.offline = !!off;
  if(state) state.offline = !!off;
}
