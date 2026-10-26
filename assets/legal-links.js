/* Lagboken 0.6: juridiska hänvisningar, bevarad lagtext.
   Känner igen t.ex. "24 kap. 1 §", "3 a eller 3 b §", "1, 2, 5 eller 6 §§", "1–4 §§",
   "6 kap. brottsbalken", "10 § polislagen (1984:387)" och "8 § första stycket 2".
   Varje paragrafnummer länkas för sig; nummer som saknas i lagtexten lämnas olänkade. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokReferences=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key=n=>String(n).toLowerCase().replace(/\s+/g,'');
  // Grundlista; utökas med katalogens namn via configure().
  let titles=[
    ['rättegångsbalken','1942:740'],['brottsbalken','1962:700'],
    ['polislagen','1984:387'],['förundersökningskungörelsen','1947:948'],
    ['trafikförordningen','1998:1276'],['ordningslagen','1993:1617'],
    ['regeringsformen','1974:152'],['offentlighets- och sekretesslagen','2009:400'],
    ['förvaltningslagen','2017:900'],['vapenlagen','1996:67'],
    ['narkotikastrafflagen','1968:64'],['trafikbrottslagen','1951:649'],
    ['lagen om straff för vissa trafikbrott','1951:649'],
    ['lagen med särskilda bestämmelser om unga lagöverträdare','1964:167'],
    ['lagen om omhändertagande av berusade personer','1976:511']
  ];
  let known=new Set();
  function sortTitles(){titles.sort((a,b)=>b[0].length-a[0].length);known=new Set(titles.map(t=>t[1]));}
  sortTitles();
  // Lägger till namn från katalogen: [{sfs,name,refNames}]
  function configure(laws){
    const seen=new Set(titles.map(t=>t[0]+'|'+t[1]));
    for(const law of laws||[]){
      for(const name of [law.name,...(law.refNames||[])]){
        const n=String(name||'').toLowerCase().trim();
        if(n.length>3&&!seen.has(n+'|'+law.sfs)){titles.push([n,law.sfs]);seen.add(n+'|'+law.sfs);}
      }
      known.add(law.sfs);
    }
    // Namn som pekar på författningar som inte längre finns i katalogen (t.ex. upphävda) tas bort.
    const inCatalog=new Set((laws||[]).map(l=>l.sfs));
    if(inCatalog.size)titles=titles.filter(([,sfs])=>inCatalog.has(sfs));
    sortTitles();known=new Set(titles.map(t=>t[1]));for(const law of laws||[])known.add(law.sfs);
  }
  const NUM='\\d+(?:\\s?[a-z](?![\\p{L}]))?';
  const SEP='\\s*(?:,|och|eller|samt|-{1,2}|–)\\s*';
  const pattern=new RegExp('(?<![\\p{L}\\p{N}\\-–:])(?:(\\d{1,3})\\s*kap(?:itel)?\\.?\\s*)?('+NUM+'(?:'+SEP+NUM+')*)\\s*(§{1,2})(?![\\p{L}\\p{N}])','giu');
  const chapterOnly=/(?<![\p{L}\p{N}\-–:§])(\d{1,3})\s*kap\.(?!\s*\d)/giu;
  const numberIn=new RegExp(NUM,'giu');
  // Stycke, punkt och mening efter paragrafen påverkar inte vilken paragraf som avses.
  const ORD='(?:första|andra|tredje|fjärde|femte|sjätte|sjunde|åttonde|nionde|tionde|sista)';
  const PUNKT='(?:\\d+|[a-z]\\)?)(?![\\p{L}\\p{N}]|\\s*[a-z]?\\s*§)';
  const qualifier=new RegExp('^\\s*(?:'+ORD+'(?:\\s*(?:,|och)\\s*'+ORD+')*\\s+(?:stycket|styckena|meningen|meningarna|punkten|punkterna)(?:\\s+'+PUNKT+'(?:\\s*(?:,|och|eller)\\s*'+PUNKT+')*)?(?:\\s*,?\\s*'+ORD+'\\s+meningen)?\\s*)*','iu');
  // Följande hänvisningar i samma uppräkning, t.ex. "2 kap. 4 § eller 6 kap. 2 § kustbevakningslagen".
  const chained=new RegExp('^(?:'+SEP+'(?:\\d{1,3}\\s*kap\\.?\\s*)?'+NUM+'(?:'+SEP+NUM+')*\\s*§{1,2}'+qualifier.source.slice(1)+')*','iu');
  const bySfs=/^\s*(?:i\s+|av\s+|enligt\s+)?[\p{L}-]*(?:lagen|förordningen|kungörelsen|balken|ordningen|grundlagen)\s*\((\d{4}:\d+)\)/iu;
  // Returnerar {id,explicit} eller null när hänvisningen avser en författning som inte finns i appen.
  function targetLaw(after,context,last){
    let rest=after.replace(qualifier,'');
    rest=rest.replace(chained,'');
    const numbered=bySfs.exec(rest);
    if(numbered)return known.has(numbered[1])?{id:numbered[1],explicit:true}:null;
    const lower=rest.replace(/^\s*(?:i\s+|av\s+|enligt\s+)?/iu,'').toLowerCase();
    if(/^denna\s+(?:lag|balk|förordning|kungörelse)/.test(lower))return {id:context.sfs,explicit:true};
    // "samma balk", "den lagen": senast namngivna författning i samma text.
    if(/^(?:samma|den)\s+(?:lag|balk|förordning|kungörelse)(?:en)?\b/.test(lower))return last?{id:last,explicit:true}:null;
    // "balken", "nya balken" i en lag som ansluter till en balk (t.ex. promulgationslagen) avser den balken.
    if(/^(?:nya\s+)?balken\b/.test(lower))return context.anchor?{id:context.anchor,explicit:true}:null;
    const found=titles.find(([name])=>lower.startsWith(name)&&!/[\p{L}]/u.test(lower.charAt(name.length)));
    if(found){
      // "lagen (2025:1062) om …" med okänt nummer ska inte länkas via ett kortare namn.
      if(/^\s*\(\d{4}:\d+\)/.test(lower.slice(found[0].length))){
        const sfs=/^\s*\((\d{4}:\d+)\)/.exec(lower.slice(found[0].length))[1];
        if(sfs!==found[1])return known.has(sfs)?{id:sfs,explicit:true}:null;
      }
      return {id:found[1],explicit:true};
    }
    if(/^(?:lagen|förordningen|kungörelsen)\b/.test(lower))return null; // okänd annan författning
    if(/^[\p{L}-]+(?:lagen|balken|förordningen|kungörelsen|ordningen|grundlagen)\b/u.test(lower))return null;
    return {id:context.sfs,explicit:false};
  }
  function exists(context,id,chapter,para){
    return typeof context.exists!=='function'||context.exists(id,chapter,para);
  }
  function parseRefs(text,context){
    const s=String(text||''),refs=[];
    let last=null,prev=null;
    for(const m of s.matchAll(pattern)){
      const body=m[0],start=m.index,after=s.slice(start+body.length,start+body.length+260);
      let target=targetLaw(after,context,last);
      // Uppräkningar som avslutas med "…, allt jordabalken" avser den namngivna lagen.
      if(target&&!target.explicit){
        const tail=s.slice(start+body.length,start+body.length+4000);
        const all=/^[^;]*?,\s*allt\s+(?=\S)/.exec(tail);
        if(all&&!/\n\s*\d+\s*[a-z]?\.\s/.test(all[0])){const t=targetLaw(tail.slice(all[0].length),context,last);if(t&&t.explicit)target=t;}
        // Lång uppräkning där paragrafen inte finns i den egna lagen ("… 5 kap. 1 §, 7 kap. 1 § … lagen (2018:1200)"):
        // den första författning som namnges längre fram i samma uppräkning avses.
        const firstNum=(m[2].match(numberIn)||[''])[0];
        if(!target.explicit&&!exists(context,context.sfs,m[1]||(context.chapter||'0'),key(firstNum))){
          const stop=tail.search(/;|\n\s*\d+\s*[a-z]?\.\s|\.\s+[A-ZÅÄÖ]/);
          const span=stop<0?tail:tail.slice(0,stop);
          const nm=/(?<![\p{L}])(?:[\p{L}-]*(?:lagen|balken|förordningen|kungörelsen|ordningen)|lagen|förordningen)(?![\p{L}])/u.exec(span);
          if(nm){const t=targetLaw(span.slice(nm.index)+tail.slice(span.length,span.length+40),context,last);if(t&&t.explicit)target=t;}
          // Annars: en förordning som hänvisar till "2 kap. 1 §" utan lagnamn avser lagen den kompletterar.
          else if(context.anchor&&exists(context,context.anchor,m[1]||'0',key(firstNum)))target={id:context.anchor,explicit:true};
        }
      }
      // Följer hänvisningen direkt på en annan i en uppräkning ärver den dess kapitel.
      const between=prev?s.slice(prev.end,start):null;
      const inChain=between!=null&&new RegExp('^(?:'+qualifier.source.slice(1)+')?'+SEP+'$','iu').test(between);
      prev={end:start+body.length,chapter:m[1]||(inChain?prev.chapter:null)};
      if(!target)continue;
      const id=target.id;
      if(target.explicit&&id!==context.sfs)last=id;
      const chapter=prev.chapter||(id===context.sfs?(context.chapter||'0'):'0');
      const listStart=body.indexOf(m[2]);
      const numbers=[];
      for(const n of m[2].matchAll(numberIn)){
        const num=key(n[0]);
        if(exists(context,id,chapter,num))numbers.push({num,start:start+listStart+n.index,end:start+listStart+n.index+n[0].length});
      }
      if(!numbers.length)continue;
      // En ensam paragraf länkas i sin helhet ("24 kap. 1 §"), uppräkningar nummer för nummer.
      const single=numbers.length===1&&(m[2].match(numberIn)||[]).length===1;
      const parts=single?[{num:numbers[0].num,start,end:start+body.length}]:numbers;
      refs.push({start,end:start+body.length,body,id,chapter,numbers:numbers.map(n=>n.num),parts});
    }
    for(const m of s.matchAll(chapterOnly)){
      const start=m.index,end=start+m[0].length;
      if(refs.some(r=>start<r.end&&end>r.start))continue;
      const target=targetLaw(s.slice(end,end+200),context,null);
      if(!target)continue;
      // Kapitel utan lagnamn avser aktuell lag endast när den har kapitel.
      if(!target.explicit&&(!context.chapter||context.chapter==='0'))continue;
      if(!exists(context,target.id,m[1],null))continue;
      refs.push({start,end,body:m[0],id:target.id,chapter:m[1],numbers:[],parts:[{num:null,start,end}]});
    }
    return refs.sort((a,b)=>a.start-b.start);
  }
  function linkify(text,context){
    const s=String(text||''),refs=parseRefs(s,context);let out='',at=0;
    for(const ref of refs){
      if(ref.start<at)continue;
      for(const part of ref.parts){
        out+=escape(s.slice(at,part.start));
        const label=s.slice(part.start,part.end),para=part.num;
        const href=context.href(ref.id,ref.chapter,para);
        out+='<a href="'+escape(href)+'" class="law-ref" data-ref="1" data-ref-sfs="'+escape(ref.id)+
          '" data-ref-chapter="'+escape(ref.chapter)+'"'+(para?' data-ref-para="'+escape(para)+'"':'')+
          ' aria-label="Visa '+escape(ref.id+' '+ref.chapter+(para?':'+para:' kap.'))+'">'+escape(label)+'</a>';
        at=part.end;
      }
      // Paragraftecknet följer med sista numret visuellt men länkas inte separat.
      out+=escape(s.slice(at,ref.end));at=ref.end;
    }
    return out+escape(s.slice(at));
  }
  return {parseRefs,linkify,configure,targetLaw};
});
