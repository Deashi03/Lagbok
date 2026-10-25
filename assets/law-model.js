/* Lagboken 0.5 – val av lydelse. Avgör vilken lydelse som gäller ett visst datum
   utifrån Riksdagens markeringar om ikraftträdande och upphörande. Gissar aldrig:
   ett obestämt datum ("den dag som regeringen bestämmer") räknas som ej inträffat. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokLaw=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function today(){
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function status(v,day){
    const started=!v.inForce||(!!v.inForce.date&&v.inForce.date<=day);
    const ended=!!(v.expires&&v.expires.date&&v.expires.date<=day);
    return !started?'upcoming':ended?'expired':'current';
  }
  function versions(item){
    return item.versions&&item.versions.length?item.versions:[{text:item.text,amendedBy:item.amendedBy}];
  }
  // {current, others, pending}: pending = paragrafen har ingen lydelse som gäller i dag.
  function resolve(item,day){
    day=day||today();
    const list=versions(item).map((v,i)=>Object.assign({},v,{index:i,status:status(v,day)}));
    const current=list.find(v=>v.status==='current')||list.find(v=>v.status==='upcoming')||list[0];
    const others=list.filter(v=>v!==current&&v.status!=='expired');
    return {current,others,pending:current.status!=='current'};
  }
  function formatDate(iso){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');
    if(!m)return iso||'';
    const months=['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
    return Number(m[3])+' '+months[Number(m[2])-1]+' '+m[1];
  }
  function when(mark){return mark.date?formatDate(mark.date):'den dag regeringen bestämmer';}
  function describe(v){
    if(v.status==='upcoming')return 'Kommande lydelse · träder i kraft '+when(v.inForce);
    if(v.status==='expired')return 'Upphörd lydelse';
    if(v.expires)return 'Gäller till '+(v.expires.date?formatDate(v.expires.date):'den dag regeringen bestämmer');
    return 'Annan lydelse i källan';
  }
  // Kontrollsummor för ändringsbevakning. Samma beräkning används i scripts/build_indexes.js.
  function hash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36);}
  function paraHash(item){return hash(JSON.stringify(item.versions||[item.text]));}
  function snapshot(doc){
    const paras={},parts=[];
    for(const ch of doc.chapters)for(const item of ch.items){
      if(item.type!=='para')continue;
      const h=paraHash(item);paras[ch.number+'|'+item.number]=h;parts.push(ch.number+'|'+item.number+'|'+h);
    }
    return {hash:hash(parts.join(';')),paras};
  }
  function diff(before,doc){
    const now=snapshot(doc),added=[],changed=[],removed=[];
    for(const k in now.paras){if(!(k in before.paras))added.push(k);else if(before.paras[k]!==now.paras[k])changed.push(k);}
    for(const k in before.paras)if(!(k in now.paras))removed.push(k);
    return {added,changed,removed,snapshot:now};
  }
  return {today,status,resolve,describe,formatDate,hash,paraHash,snapshot,diff};
});
