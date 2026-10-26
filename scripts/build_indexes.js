#!/usr/bin/env node
/* Bygger sökindex och register över hänvisningar ur data/laws.
   data/index/paras.json          – alla paragrafer: [lag, kapitel, paragraf, rubrik]
   data/index/terms/<xx>.json     – ord -> paragrafnummer (deltakodade), uppdelat på ordets två första tecken
   data/index/backlinks/<sfs>.json – "kapitel|paragraf" -> kopplingar [lag, kapitel, paragraf, typ] där typ är
                                    "ref" (hänvisar hit), "föreskrift" (förordning som kompletterar) eller
                                    "kompletterar" (lagparagraf som förordningsparagrafen kompletterar)
   data/index/relations.json      – förordningar och de lagar de ansluter till
   data/index/status.json         – per lag: senaste ändring och kontrollsumma (för ändringsbevakning)
   data/index/upcoming.json       – alla kommande lydelser med datum
   Körs av importen och kontrolleras i CI, så att indexet alltid matchar lagtexten. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const links=require(path.join(root,'assets/legal-links.js'));
const toc=require(path.join(root,'assets/toc-model.js'));
const search=require(path.join(root,'assets/search-core.js'));
const lawModel=require(path.join(root,'assets/law-model.js'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8'));
links.configure(catalog.laws);
const out=path.join(root,'data/index');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(path.join(out,'terms'),{recursive:true});
fs.mkdirSync(path.join(out,'backlinks'),{recursive:true});
const file=sfs=>path.join(root,'data/laws',sfs.replace(/[: ]/g,'-')+'.json');
const laws=catalog.laws.filter(l=>fs.existsSync(file(l.sfs)));
const docs=new Map(laws.map(l=>[l.sfs,JSON.parse(fs.readFileSync(file(l.sfs),'utf8'))]));
const key=search.paraKey;
const known=new Map();
for(const [sfs,doc] of docs)for(const ch of doc.chapters)known.set(sfs+'|'+ch.number,new Set(ch.items.filter(i=>i.type==='para').map(i=>key(i.number))));
const exists=(sfs,chapter,para)=>{const s=known.get(sfs+'|'+chapter);return !!s&&(para==null||s.has(key(para)));};
const fold=s=>String(s||'').toLocaleLowerCase('sv').normalize('NFD').replace(/[̀-ͯ]/g,'');
const words=s=>fold(s).match(/[a-z0-9]{2,}/g)||[];
const paras=[],postings=new Map(),backlinks=new Map(),lawRefs=new Map();
const typeOf=new Map(laws.map(l=>[l.sfs,l.type]));
function addLink(sfs,chapter,para,entry){
  const k=sfs+'#'+chapter+'|'+key(para);
  if(!backlinks.has(k))backlinks.set(k,new Map());
  backlinks.get(k).set(entry.join('|'),entry);
}
// Paragrafnummer som det skrivs i lagtexten ("3 a"), inte som nyckel ("3a").
function displayNumber(sfs,chapter,num){
  const doc=docs.get(sfs),ch=doc&&doc.chapters.find(c=>c.number===chapter);
  const item=ch&&ch.items.find(i=>i.type==='para'&&key(i.number)===key(num));
  return item?String(item.number):String(num);
}
laws.forEach((law,li)=>{
  const doc=docs.get(law.sfs);
  for(const ch of doc.chapters){
    const groups=toc.chapterGroups(law.sfs,ch);
    const groupOf=new Map();
    for(const g of groups)for(const p of g.paragraphs)groupOf.set(p.number,g);
    for(const item of ch.items){
      if(item.type!=='para'||item.repealed)continue;
      const ordinal=paras.length;
      const title=toc.curatedTitle(law.sfs,ch.number,item.number)||'';
      const group=groupOf.get(String(item.number));
      const heading=group&&group.origin!=='kapitel'?group.title:'';
      paras.push([li,ch.number,String(item.number),title||heading]);
      const texts=(item.versions||[item]).map(v=>v.text);
      const terms=new Set(words([...texts,title,heading,ch.title].join(' ')));
      for(const t of terms){if(!postings.has(t))postings.set(t,[]);postings.get(t).push(ordinal);}
      for(const text of texts){
        for(const ref of links.parseRefs(text,{sfs:law.sfs,chapter:ch.number,exists})){
          if(ref.id===law.sfs&&ref.chapter===ch.number&&ref.numbers.includes(key(item.number)))continue;
          const target=typeOf.get(ref.id);
          const complements=law.type==='förordning'&&target==='lag'&&ref.id!==law.sfs;
          for(const n of ref.numbers){
            addLink(ref.id,ref.chapter,n,[law.sfs,ch.number,String(item.number),complements?'föreskrift':'ref']);
            if(complements){
              addLink(law.sfs,ch.number,item.number,[ref.id,ref.chapter,displayNumber(ref.id,ref.chapter,n),'kompletterar']);
              lawRefs.set(law.sfs+'>'+ref.id,(lawRefs.get(law.sfs+'>'+ref.id)||0)+1);
            }
          }
        }
      }
    }
  }
});
// Redigerade kopplingar (data/relations.json) för förordningar som inte själva hänvisar till lagparagrafen.
const curated=JSON.parse(fs.readFileSync(path.join(root,'data/relations.json'),'utf8'));
for(const rel of curated.kompletterar){
  const [fs_,fc,fp]=rel.fran.split('|');
  if(!docs.has(fs_))continue;
  for(const to of rel.till){
    const [ts,tc,tp]=to.split('|');
    if(!docs.has(ts))continue;
    addLink(ts,tc,tp,[fs_,fc,fp,'föreskrift']);
    addLink(fs_,fc,fp,[ts,tc,tp,'kompletterar']);
    lawRefs.set(fs_+'>'+ts,(lawRefs.get(fs_+'>'+ts)||0)+3);
  }
}
// En förordning ansluter till en lag när den hänvisar dit ofta: minst fem gånger och minst 30 % av
// hänvisningarna till den mest hänvisade lagen. Enstaka hänvisningar ger ingen koppling på lagnivå.
// Nämner förordningen en lag i sina första paragrafer ("… med stöd av lagen (1998:620) …") är det den
// lag förordningen ansluter till, oavsett hur ofta andra lagar nämns längre ned.
const anchors=new Map();
for(const law of laws){
  if(law.type!=='förordning')continue;
  const first=docs.get(law.sfs).chapters.flatMap(c=>c.items.filter(i=>i.type==='para')).slice(0,2).map(i=>i.text).join(' ');
  const named=[...new Set([...first.matchAll(/\((\d{4}:\d+)\)/g)].map(m=>m[1]))].filter(s=>s!==law.sfs&&typeOf.get(s)==='lag');
  // Flera lagar nämns: välj den vars namn liknar förordningens (t.ex. "kontroll av narkotika").
  const words=n=>new Set(String(n).toLowerCase().match(/[a-zåäö]{5,}/g)||[]);
  const own=words(law.name),nameOf=s=>(laws.find(l=>l.sfs===s)||{}).name||'';
  const overlap=s=>[...words(nameOf(s))].filter(w=>own.has(w)||[...own].some(o=>o.slice(0,6)===w.slice(0,6))).length;
  const hit=named.slice().sort((a,b)=>overlap(b)-overlap(a))[0];
  if(hit)anchors.set(law.sfs,hit);
}
const relations={},top=new Map();
for(const [pair,count] of lawRefs){const f=pair.split('>')[0];top.set(f,Math.max(top.get(f)||0,count));}
for(const [f,l] of anchors)if(!lawRefs.has(f+'>'+l))lawRefs.set(f+'>'+l,5);
for(const [pair,count] of [...lawRefs].sort()){
  const [f0,l0]=pair.split('>');
  if(anchors.has(f0)){if(anchors.get(f0)!==l0)continue;}
  else if(count<5||count<0.3*top.get(f0))continue;
  const [f,l]=pair.split('>');
  (relations[f]=relations[f]||{kompletterar:[],kompletteras:[]}).kompletterar.push(l);
  (relations[l]=relations[l]||{kompletterar:[],kompletteras:[]}).kompletteras.push(f);
}
fs.writeFileSync(path.join(out,'relations.json'),JSON.stringify(relations));
fs.writeFileSync(path.join(out,'paras.json'),JSON.stringify({laws:laws.map(l=>l.sfs),p:paras}));
const shards=new Map();
for(const [term,list] of [...postings].sort((a,b)=>a[0]<b[0]?-1:1)){
  const shard=term.slice(0,2);
  if(!shards.has(shard))shards.set(shard,{});
  let prev=0;shards.get(shard)[term]=list.map(n=>{const d=n-prev;prev=n;return d;});
}
for(const [name,data] of shards)fs.writeFileSync(path.join(out,'terms',name+'.json'),JSON.stringify(data));
fs.writeFileSync(path.join(out,'shards.json'),JSON.stringify([...shards.keys()]));
const bySfs=new Map();
for(const [k,sources] of backlinks){
  const [sfs,target]=k.split('#');
  if(!bySfs.has(sfs))bySfs.set(sfs,{});
  // Kompletterande föreskrifter först, sedan hänvisningar.
  const order={'föreskrift':0,'kompletterar':1,'ref':2};
  bySfs.get(sfs)[target]=[...sources.values()].sort((a,b)=>order[a[3]]-order[b[3]]);
}
for(const [sfs,data] of bySfs)fs.writeFileSync(path.join(out,'backlinks',sfs.replace(/[: ]/g,'-')+'.json'),JSON.stringify(data));
// Kontrollsumma per paragraf och lag: ändras när lydelserna ändras, inte när hämtningsdatum ändras.
const status={},upcoming=[];
for(const law of laws){
  const doc=docs.get(law.sfs);
  for(const ch of doc.chapters)for(const item of ch.items){
    if(item.type!=='para')continue;
    for(const v of item.versions||[]){
      if(!v.inForce)continue;
      upcoming.push([v.inForce.date||'',law.sfs,ch.number,String(item.number)]);
    }
  }
  status[law.sfs]={amended:doc.latestAmendment||null,hash:lawModel.snapshot(doc).hash};
}
upcoming.sort((a,b)=>(a[0]||'9999').localeCompare(b[0]||'9999')||a[1].localeCompare(b[1]));
fs.writeFileSync(path.join(out,'status.json'),JSON.stringify(status));
fs.writeFileSync(path.join(out,'upcoming.json'),JSON.stringify(upcoming));
let refs=0;for(const v of backlinks.values())refs+=v.size;
console.log('Index: '+paras.length+' paragrafer, '+postings.size+' ord i '+shards.size+' delar, '+refs+' hänvisningar till '+backlinks.size+' paragrafer');
