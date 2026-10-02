const CACHE='guia-visao-v1', MODEL='guia-visao-model-v1';
const SHELL=['./','./index.html','./css/app.css','./js/app.js','./vendor/tf.min.js','./vendor/coco-ssd.min.js','./vendor/lucide.min.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./offline.html'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>![CACHE,MODEL].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin===location.origin){
    e.respondWith(caches.match(e.request).then(h=>h||fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(cc=>cc.put(e.request,c));return r;}).catch(()=>e.request.mode==='navigate'?caches.match('./offline.html'):undefined)));
  } else if(u.hostname==='storage.googleapis.com'&&u.pathname.startsWith('/tfjs-models/')){
    e.respondWith(caches.open(MODEL).then(c=>c.match(e.request).then(h=>{const f=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r;}).catch(()=>h);return h||f;})));
  } else if((u.hostname==='fonts.googleapis.com'||u.hostname==='fonts.gstatic.com')&&e.request.method==='GET'){e.respondWith(Promise.race([fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(cc=>cc.put(e.request,c));}return r;}),new Promise((_,rej)=>setTimeout(()=>rej(new Error('fonts-timeout')),3000))]).catch(()=>caches.match(e.request)));}
});
