const VERSION='lagboken-shell-v02';
const CORE=['./','./index.html','./assets/app.css','./assets/app.js','./assets/search-core.js','./data/catalog.json','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==location.origin)return;
 if(url.pathname.includes('/data/laws/')||url.pathname.endsWith('/data/catalog.json')){
   event.respondWith(fetch(request).then(r=>{if(r.ok){const clone=r.clone();caches.open(VERSION).then(c=>c.put(request,clone));}return r;}).catch(()=>caches.match(request)));return;
 }
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(r=>{if(r.ok){const clone=r.clone();caches.open(VERSION).then(c=>c.put(request,clone));}return r;})));
});
