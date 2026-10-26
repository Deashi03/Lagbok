// Lagboken 1.1. Appen startar direkt från sparade kopior (stale-while-revalidate): allt som redan finns
// i cachen visas utan att vänta på nätet, och en ny kopia hämtas samtidigt i bakgrunden. Ändras appens
// filer meddelas sidan, som visar raden "Ny version". Ändras katalogen läses den in på nytt utan omstart.
// Lagtexten ligger i en separat cache som behålls mellan versioner så att nedladdade lagar finns kvar offline.
const VERSION='lagboken-shell-v11';
const DATA='lagboken-data';
const CORE=['./','./index.html','./assets/app.css','./assets/app.js','./assets/search-core.js','./assets/legal-links.js','./assets/editorial.js','./assets/law-model.js','./assets/search-index.js','./assets/highlights.js','./assets/toc-model.js','./icon.svg','./icon-180.png','./icon-192.png','./manifest.webmanifest'];
// Filer vars ändring ska meddelas sidan.
const WATCHED=/(?:\/|index\.html|\.js|\.css|data\/(?:index\/)?catalog\.json)$/;
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(c=>c.addAll(CORE.filter(u=>u!=='./').map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION&&k!==DATA).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
async function notify(type,path){
  for(const client of await self.clients.matchAll({type:'window'}))client.postMessage({type,path});
}
// Hämtar en ny kopia, sparar den och meddelar sidan om innehållet skiljer sig från den sparade.
async function refresh(request,cacheName,key,previous){
  const response=await fetch(request,{cache:'no-cache'});
  if(!response.ok)return response;
  const cache=await caches.open(cacheName);
  if(previous&&WATCHED.test(key)){
    const [before,after]=await Promise.all([previous.clone().text(),response.clone().text()]);
    if(before!==after)notify(key.endsWith('catalog.json')?'catalog-updated':'shell-updated',key);
  }
  await cache.put(key,response.clone());
  return response;
}
function withTimeout(promise,ms){
  return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('timeout')),ms);promise.then(r=>{clearTimeout(t);resolve(r);},e=>{clearTimeout(t);reject(e);});});
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==location.origin)return;
  const isData=url.pathname.includes('/data/');
  const cacheName=isData?DATA:VERSION;
  // Data sparas under sin sökväg ("data/laws/…"), appens filer under sin adress utan frågedel.
  const key=isData?url.pathname.replace(/^.*\/data\//,'data/'):request.mode==='navigate'||url.pathname.endsWith('/')?new URL('./index.html',location).href:url.origin+url.pathname;
  event.respondWith((async()=>{
    const hit=await (await caches.open(cacheName)).match(key)||(!isData&&await caches.match(request,{ignoreSearch:true}));
    const fresh=refresh(request,cacheName,key,hit||null);
    if(hit){event.waitUntil(fresh.catch(()=>{}));return hit;}
    try{return await withTimeout(fresh,isData?15000:8000);}
    catch(_){return (!isData&&await caches.match(new URL('./index.html',location).href))||Response.error();}
  })());
});
