// Lagboken 0.8. Allt hämtas från nätet först så att nya versioner och ny lagtext syns direkt;
// sparade kopior används bara utan internet. Lagtexten ligger i en separat cache som
// behålls mellan versioner så att nedladdade lagar finns kvar offline.
const VERSION='lagboken-shell-v08c';
const DATA='lagboken-data';
const CORE=['./','./index.html','./assets/app.css','./assets/app.js','./assets/search-core.js','./assets/legal-links.js','./assets/editorial.js','./assets/law-model.js','./assets/search-index.js','./assets/highlights.js','./assets/toc-model.js','./icon.svg','./icon-180.png','./icon-192.png','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION&&k!==DATA).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
// Nätet först, men vänta inte för länge på dålig uppkoppling.
function fromNetwork(request,timeout){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('timeout')),timeout);
    fetch(request).then(r=>{clearTimeout(timer);resolve(r);},e=>{clearTimeout(timer);reject(e);});
  });
}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==location.origin)return;
 if(url.pathname.includes('/data/')){
   const key=url.pathname.replace(/^.*\/data\//,'data/');
   event.respondWith(fromNetwork(request,6000).then(r=>{if(r.ok){const clone=r.clone();caches.open(DATA).then(c=>c.put(key,clone));}return r;})
     .catch(()=>caches.open(DATA).then(c=>c.match(key)).then(hit=>hit||caches.match(request)).then(hit=>hit||Response.error())));
   return;
 }
 event.respondWith(fromNetwork(request,3500).then(r=>{if(r.ok){const clone=r.clone();caches.open(VERSION).then(c=>c.put(request,clone));}return r;})
   .catch(()=>caches.match(request,{ignoreSearch:true}).then(hit=>hit||caches.match('./index.html')).then(hit=>hit||Response.error())));
});
