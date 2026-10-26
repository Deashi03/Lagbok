/* Lagboken 0.6 – fritextsökning i ett färdigbyggt index (scripts/build_indexes.js).
   Bara de indexdelar som behövs för sökorden hämtas; lagtexten laddas först när träffar visas.
   Varje sökord måste finnas i paragrafen. Ordet matchas också som början av längre ord,
   så att "husrannsak" hittar både husrannsakan och husrannsakningar. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokIndex=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const fold=s=>String(s||'').toLocaleLowerCase('sv').normalize('NFD').replace(/[̀-ͯ]/g,'');
  const words=s=>Array.from(new Set(fold(s).match(/[a-z0-9]{2,}/g)||[]));
  // Vardagliga ord och förkortningar som annars inte finns i lagtexten.
  const SYNONYMS={
    lob:['berusad'],fylla:['berusad'],fyllo:['berusad'],
    rattfylla:['rattfylleri'],rattfyllerist:['rattfylleri'],rattonykter:['rattfylleri'],
    snatteri:['ringa','stold'],fortkorning:['hastighet'],olovlig:['olovlig'],
    visitation:['kroppsvisitation'],visitera:['kroppsvisitera'],
    gripa:['gripas'],anhalla:['anhallas'],hakta:['haktas'],
    kniv:['kniv'],vapen:['vapen'],misshandla:['misshandel'],
    nodvarn:['nodvarn'],tvang:['tvang'],
    sekretess:['sekretess'],hemfrid:['hemfrid'],
    lvu:['vard','unga'],lvm:['missbrukare'],lpt:['psykiatrisk','tvangsvard']
  };
  function expand(tokens){
    const out=[];
    for(const t of tokens){const s=SYNONYMS[t];if(s&&!(s.length===1&&s[0]===t))out.push(...s);else out.push(t);}
    return Array.from(new Set(out));
  }
  function decode(list){let n=0;return list.map(d=>(n+=d));}
  function create(fetchJson){
    let base=null;const shards=new Map();
    function paras(){if(!base)base=fetchJson('data/index/paras.json').catch(e=>{base=null;throw e;});return base;}
    function shard(name){
      if(!shards.has(name))shards.set(name,Promise.resolve().then(()=>fetchJson('data/index/terms/'+name+'.json')).catch(()=>({})));
      return shards.get(name);
    }
    async function query(q,options){
      const limit=(options&&options.limit)||60;
      const tokens=expand(words(q));
      if(!tokens.length)return {total:0,hits:[],tokens};
      const idx=await paras();
      const matches=[];
      for(const t of tokens){
        const data=await shard(t.slice(0,2));
        const exact=new Set(data[t]?decode(data[t]):[]),all=new Set(exact);
        for(const term in data)if(term!==t&&term.startsWith(t))for(const n of decode(data[term]))all.add(n);
        matches.push({token:t,exact,all});
      }
      matches.sort((a,b)=>a.all.size-b.all.size);
      let candidates=[...matches[0].all];
      for(const m of matches.slice(1))candidates=candidates.filter(n=>m.all.has(n));
      const lawCount=idx.laws.length;
      const scored=candidates.map(n=>{
        const p=idx.p[n],title=fold(p[3]);
        let score=0;
        for(const m of matches){
          score+=m.exact.has(n)?2:1;
          if(title&&title.includes(m.token))score+=5;
        }
        score+=(lawCount-p[0])/lawCount; // tidigare i katalogen = mer central författning
        return {n,score};
      }).sort((a,b)=>b.score-a.score||a.n-b.n);
      return {total:scored.length,tokens,hits:scored.slice(0,limit).map(({n,score})=>{
        const p=idx.p[n];return {sfs:idx.laws[p[0]],chapter:p[1],number:p[2],title:p[3],score};
      })};
    }
    function warm(){paras().catch(()=>{});['ha','br','po','gr','an','fo'].forEach(n=>shard(n));}
    return {query,warm};
  }
  // Kort utdrag kring första träffen, med sökorden markerade.
  function snippet(text,tokens,escape,size){
    size=size||180;
    const plain=String(text||'').replace(/\s+/g,' ');
    const folded=fold(plain);
    let at=-1;
    for(const t of tokens){const i=folded.search(new RegExp('(?:^|[^a-z0-9])'+t));if(i>=0&&(at<0||i<at))at=i;}
    const start=Math.max(0,at-50),slice=plain.slice(start,start+size);
    // Folding ändrar inte längden för svenska tecken, så positioner kan återanvändas.
    const f=fold(slice),parts=[];
    for(const t of tokens){
      const re=new RegExp('(^|[^a-z0-9])('+t+'[a-z0-9]*)','g');let m;
      while((m=re.exec(f))){const s=m.index+m[1].length;parts.push([s,s+m[2].length]);}
    }
    parts.sort((a,b)=>a[0]-b[0]);
    let out='',pos=0;
    for(const [s,e] of parts){if(s<pos)continue;out+=escape(slice.slice(pos,s))+'<mark>'+escape(slice.slice(s,e))+'</mark>';pos=e;}
    out+=escape(slice.slice(pos));
    return (start>0?'…':'')+out+(start+size<plain.length?'…':'');
  }
  return {create,words,fold,snippet,expand};
});
