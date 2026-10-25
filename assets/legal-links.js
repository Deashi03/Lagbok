/* Lagboken 0.5: juridiska hänvisningar, bevarad lagtext. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokReferences=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key=n=>String(n).toLowerCase().replace(/\s+/g,'');
  const titles=[
    ['rättegångsbalken','1942:740'],['brottsbalken','1962:700'],
    ['polislagen','1984:387'],['förundersökningskungörelsen','1947:948'],
    ['trafikförordningen','1998:1276'],['ordningslagen','1993:1617'],
    ['regeringsformen','1974:152'],['offentlighets- och sekretesslagen','2009:400'],
    ['förvaltningslagen','2017:900'],['vapenlagen','1996:67'],
    ['narkotikastrafflagen','1968:64'],['trafikbrottslagen','1951:649'],
    ['lagen om straff för vissa trafikbrott','1951:649'],
    ['lagen med särskilda bestämmelser om unga lagöverträdare','1964:167'],
    ['lagen om omhändertagande av berusade personer','1976:511']
  ].sort((a,b)=>b[0].length-a[0].length);
  const known=new Set(titles.map(t=>t[1]));
  // "polislagen (1984:387)", "lagen (1976:511) om …" eller "förordningen (1998:1276)"
  const bySfs=/^\s*(?:(?:första|andra|tredje|fjärde|femte)\s+stycket(?:\s+\d+)?(?:\s+(?:första|andra|tredje)\s+meningen)?\s*)?(?:i\s+|av\s+|enligt\s+)?[\p{L}-]*(?:lagen|förordningen|kungörelsen|balken)\s*\((\d{4}:\d+)\)/iu;
  const pattern=/(?<![\p{L}\p{N}\-–])(?:(\d{1,3})\s*kap(?:itel)?\.?\s*)?(\d+\s*[a-z]?)(?:\s*(och|eller|,|-{1,2}|–)\s*(\d+\s*[a-z]?))?\s*§{1,2}(?!\w)/giu;
  function parseRefs(text,context){
    const s=String(text||''),refs=[];
    for(const m of s.matchAll(pattern)){
      const body=m[0], suffix=s.slice(m.index+body.length,m.index+body.length+110);
      let id=context.sfs, chapter=m[1]||context.chapter||'0', looksLikeOther=false;
      const numbered=bySfs.exec(suffix);
      if(numbered){
        // Referens till annan, icke importerad lag får inte felaktigt länkas till aktuell författning.
        if(known.has(numbered[1]))id=numbered[1];else looksLikeOther=true;
      }else{
        const rest=suffix.replace(/^\s*(?:(?:första|andra|tredje|fjärde|femte)\s+stycket(?:\s+\d+)?(?:\s+(?:första|andra|tredje)\s+meningen)?\s*)?(?:i\s+|av\s+|enligt\s+)?/iu,'').toLowerCase();
        const found=titles.find(([name])=>rest.startsWith(name)&&!/[\p{L}]/u.test(rest.charAt(name.length)));
        if(found)id=found[1];
      }
      if(id!==context.sfs&&!m[1])chapter='0';
      const numbers=[m[2],m[4]].filter(Boolean).map(key);
      const valid=!looksLikeOther&&numbers.every(num=>
        typeof context.exists!=='function'||context.exists(id,chapter,num));
      if(!valid)continue;
      refs.push({start:m.index,end:m.index+body.length,body,id,chapter,numbers});
    }
    return refs;
  }
  function linkify(text,context){
    const s=String(text||''),refs=parseRefs(s,context);let out='',at=0;
    for(const ref of refs){
      if(ref.start<at)continue;
      out+=escape(s.slice(at,ref.start));
      function anchor(label,para){
        const href=context.href(ref.id,ref.chapter,para);
        return '<a href="'+escape(href)+'" class="law-ref" data-ref="1" data-ref-sfs="'+escape(ref.id)+
          '" data-ref-chapter="'+escape(ref.chapter)+'" data-ref-para="'+escape(para)+
          '" aria-label="Visa '+escape(ref.id+' '+ref.chapter+':'+para)+'">'+escape(label)+'</a>';
      }
      if(ref.numbers.length===1)out+=anchor(ref.body,ref.numbers[0]);
      else{
        const multi=/^([\s\S]*?)(\d+\s*[a-z]?)(\s*(?:och|eller|,|-{1,2}|–)\s*)(\d+\s*[a-z]?)(\s*§{2})$/iu.exec(ref.body);
        if(!multi){out+=escape(ref.body);at=ref.end;continue;}
        out+=escape(multi[1])+anchor(multi[2],ref.numbers[0])+escape(multi[3])+
          anchor(multi[4],ref.numbers[1])+escape(multi[5]);
      }
      at=ref.end;
    }
    return out+escape(s.slice(at));
  }
  return {parseRefs,linkify};
});
