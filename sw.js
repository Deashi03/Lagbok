// Appens skal versionshanteras per release; lagtexten ligger i en separat cache som
// behålls mellan versioner så att nedladdade lagar finns kvar offline.
const VERSION='lagboken-shell-v07';
const DATA='lagboken-data';
const CORE=['./','./index.html','./assets/app.css','./assets/app.js','./assets/search-core.js','./assets/legal-links.js','./assets/editorial.js','./assets/law-model.js','./assets/search-index.js','./assets/highlights.js','./assets/toc-model.js','./icon.svg','./icon-180.png','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION&&k!==DATA).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==location.origin)return;
 if(url.pathname.includes('/data/')){
   // Nätverk först så att uppdaterad lagtext alltid används när det finns internet.
   event.respondWith(fetch(request).then(r=>{if(r.ok){const clone=r.clone();caches.open(DATA).then(c=>c.put(url.pathname.replace(/^.*\/data\//,'data/'),clone));}return r;})
     .catch(()=>caches.open(DATA).then(c=>c.match(url.pathname.replace(/^.*\/data\//,'data/'))).then(hit=>hit||caches.match(request))));
   return;
 }
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(r=>{if(r.ok){const clone=r.clone();caches.open(VERSION).then(c=>c.put(request,clone));}return r;})));
});
