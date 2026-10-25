/* Lagboken 0.2 – ren, testbar tolkning av snabbkoder. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokSearch=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const norm=v=>String(v||'').toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s.-]+/g,' ').trim();
  const paraKey=v=>String(v||'').toLocaleLowerCase('sv').replace(/\s+/g,'');
  function parseQuick(input,laws,faps){
    const q=String(input||'').trim();
    if(!q)return null;
    const fap=/^fap\s*(\d{2,4})\s*[-–]?\s*(\d{1,2})$/i.exec(q);
    if(fap){
      const id='FAP '+fap[1]+'-'+fap[2].padStart(2,'0');
      const doc=(faps||[]).find(f=>f.id===id);
      return doc?{type:'fap',fap:doc}:null;
    }
    const candidates=[];
    (laws||[]).forEach(l=>{
      [l.name,l.sfs,...(l.aliases||[])].forEach(alias=>{
        const prefix=String(alias||'').trim();
        if(!prefix||norm(prefix).length<2)return;
        if(q.toLocaleLowerCase('sv').startsWith(prefix.toLocaleLowerCase('sv'))){
          const rest=q.slice(prefix.length).trim();
          if(rest&&/^\d/.test(rest)) candidates.push({meta:l,rest,length:prefix.length});
        }
      });
    });
    candidates.sort((a,b)=>b.length-a.length);
    for(const item of candidates){
      const chapPara=/^(\d{1,3})\s*(?::|\.|\s+kap(?:itel)?\.?\s*)\s*(\d+\s*[a-z]?)\s*§?$/i.exec(item.rest);
      if(chapPara&&item.meta.chaptered){
        return {type:'law',meta:item.meta,chapter:chapPara[1],para:paraKey(chapPara[2])};
      }
      const one=/^(\d+\s*[a-z]?)\s*(?:§|kap\.?)?$/i.exec(item.rest);
      if(one){
        if(item.meta.chaptered){
          if(/[a-z]/i.test(one[1]))return null;
          return {type:'law',meta:item.meta,chapter:one[1].trim(),para:null};
        }
        return {type:'law',meta:item.meta,chapter:'0',para:paraKey(one[1])};
      }
    }
    return null;
  }
  function resolvedQuick(direct,doc){
    if(!direct)return null;
    if(direct.type==='fap')return direct;
    if(!doc||!Array.isArray(doc.chapters))return null;
    const ch=doc.chapters.find(c=>String(c.number)===String(direct.chapter));
    if(!ch)return null;
    if(!direct.para)return direct;
    const para=(ch.items||[]).find(p=>p.type==='para'&&paraKey(p.number)===paraKey(direct.para));
    return para?{...direct,para:paraKey(para.number)}:null;
  }
  return {norm,paraKey,parseQuick,resolvedQuick};
});
