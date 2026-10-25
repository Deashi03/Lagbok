#!/usr/bin/env node
/* Bygger sökindex och register över hänvisningar ur data/laws.
   data/index/paras.json          – alla paragrafer: [lag, kapitel, paragraf, rubrik]
   data/index/terms/<xx>.json     – ord -> paragrafnummer (deltakodade), uppdelat på ordets två första tecken
   data/index/backlinks/<sfs>.json – "kapitel|paragraf" -> paragrafer som hänvisar hit
   Körs av importen och kontrolleras i CI, så att indexet alltid matchar lagtexten. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const links=require(path.join(root,'assets/legal-links.js'));
const toc=require(path.join(root,'assets/toc-model.js'));
const search=require(path.join(root,'assets/search-core.js'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8'));
links.configure(catalog.laws);
const out=path.join(root,'data/index');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(path.join(out,'terms'),{recursive:true});
fs.mkdirSync(path.join(out,'backlinks'),{recursive:true});
const file=sfs=>path.join(root,'data/laws',sfs.replace(':','-')+'.json');
const laws=catalog.laws.filter(l=>fs.existsSync(file(l.sfs)));
const docs=new Map(laws.map(l=>[l.sfs,JSON.parse(fs.readFileSync(file(l.sfs),'utf8'))]));
const key=search.paraKey;
const known=new Map();
for(const [sfs,doc] of docs)for(const ch of doc.chapters)known.set(sfs+'|'+ch.number,new Set(ch.items.filter(i=>i.type==='para').map(i=>key(i.number))));
const exists=(sfs,chapter,para)=>{const s=known.get(sfs+'|'+chapter);return !!s&&(para==null||s.has(key(para)));};
const fold=s=>String(s||'').toLocaleLowerCase('sv').normalize('NFD').replace(/[̀-ͯ]/g,'');
const words=s=>fold(s).match(/[a-z0-9]{2,}/g)||[];
const paras=[],postings=new Map(),backlinks=new Map();
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
          for(const n of ref.numbers){
            const k=ref.id+'#'+ref.chapter+'|'+n;
            if(!backlinks.has(k))backlinks.set(k,new Map());
            backlinks.get(k).set(law.sfs+'|'+ch.number+'|'+item.number,[law.sfs,ch.number,String(item.number)]);
          }
        }
      }
    }
  }
});
fs.writeFileSync(path.join(out,'paras.json'),JSON.stringify({laws:laws.map(l=>l.sfs),p:paras}));
const shards=new Map();
for(const [term,list] of [...postings].sort((a,b)=>a[0]<b[0]?-1:1)){
  const shard=term.slice(0,2);
  if(!shards.has(shard))shards.set(shard,{});
  let prev=0;shards.get(shard)[term]=list.map(n=>{const d=n-prev;prev=n;return d;});
}
for(const [name,data] of shards)fs.writeFileSync(path.join(out,'terms',name+'.json'),JSON.stringify(data));
const bySfs=new Map();
for(const [k,sources] of backlinks){
  const [sfs,target]=k.split('#');
  if(!bySfs.has(sfs))bySfs.set(sfs,{});
  bySfs.get(sfs)[target]=[...sources.values()];
}
for(const [sfs,data] of bySfs)fs.writeFileSync(path.join(out,'backlinks',sfs.replace(':','-')+'.json'),JSON.stringify(data));
let refs=0;for(const v of backlinks.values())refs+=v.size;
console.log('Index: '+paras.length+' paragrafer, '+postings.size+' ord i '+shards.size+' delar, '+refs+' hänvisningar till '+backlinks.size+' paragrafer');
