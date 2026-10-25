/* Lagboken 0.4 – rubriker och vertikal innehållsförteckning.
   Redaktionella navigeringsrubriker påverkar aldrig lagtexten. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LagbokTOC=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  // Grupper av bestämmelser. Lämna hellre en beskrivning tom än att gissa.
  const groups={
    '1962:700':{
      '8':{'1':'Stöldbrott','5':'Rån','7':'Andra tillgreppsbrott','12':'Förstadier och åtalsbestämmelser'},
      '9':{'1':'Bedrägeribrott','4':'Utpressning och ocker','6':'Häleribrott','8':'Andra oredlighetsbrott','11':'Förstadier och åtalsbestämmelser'}
    },
    '1942:740':{
      '23':{'1':'Förundersökningens inledning och ledning','5':'Försvarare och förhör','16':'Tvångsmedel och utredningsmaterial','18':'Underrättelse och avslut','21':'Dokumentation och särskilda regler'},
      '24':{'1':'Häktning','6':'Anhållande och gripande','8':'Underrättelse och rättigheter','12':'Häktningsframställning och förhandling','18':'Tidsfrister och hävning','22':'Förvar'},
      '28':{'1':'Husrannsakan – reell och personell','3 a':'Proportionalitet, beslut och verkställighet'}
    }
  };
  const titles={
    '1962:700':{
      '8':{
        '1':'Stöld','2':'Ringa stöld','3':'Upphävd paragraf','4':'Grov stöld','4 a':'Inbrottsstöld',
        '5':'Rån','6':'Grovt rån','7':'Tillgrepp av fortskaffningsmedel','8':'Egenmäktigt förfarande',
        '9':'Självtäkt','10':'Olovlig energiavledning','10 a':'Upphävd paragraf',
        '11':'Tillgrepp i skog eller mark','12':'Försök och förberedelse','13':'Begränsningar i åtalsrätten'
      },
      '9':{'1':'Bedrägeri','2':'Ringa bedrägeri','3':'Grovt bedrägeri','3 a':'Grovt fordringsbedrägeri','3 b':'Upphävd paragraf',
        '4':'Utpressning','5':'Ocker','6':'Häleri','6 a':'Häleri – särskild bestämmelse','7':'Häleriförseelse',
        '7 a':'Upphävd paragraf','8':'Oredligt förfarande','9':'Svindleri','10':'Ockerpantning',
        '11':'Förstadier','12':'Begränsningar i åtalsrätten'}
    },
    '1942:740':{
      '28':{
        '1':'Reell husrannsakan','2':'Personell husrannsakan','2 a':'Personell husrannsakan i transportmedel',
        '3':'Husrannsakan i vissa lokaler','3 a':'Proportionalitet','4':'Beslut om husrannsakan',
        '5':'Fara i dröjsmål','6':'Genomförande av husrannsakan','7':'Närvaro vid husrannsakan',
        '8':'Enskilda handlingar','9':'Protokoll och bevis','10':'Undersökning på annat ställe',
        '10 a':'Definition av genomsökning på distans','10 b':'Genomsökning på distans',
        '10 c':'Undantagna uppgifter','10 d':'Beslut och fara i dröjsmål',
        '10 e':'Närvaro vid genomsökning','10 f':'Försvårande av utredning',
        '10 g':'Underrättelse','10 h':'Protokoll','10 i':'Tillämpliga bestämmelser',
        '11':'Kroppsvisitation','12':'Kroppsbesiktning','12 a':'DNA-prov på misstänkt',
        '12 b':'DNA-prov på annan än misstänkt','12 c':'Provtagningsform','13':'Gemensamma bestämmelser',
        '13 a':'Kvarhållande för visitation','14':'Fingeravtryck och andra underlag',
        '14 a':'Underlag från annan än misstänkt','14 b':'Gemensamma bestämmelser','15':'Avvikande bestämmelser'
      },
      '24':{
        '1':'Häktning och särskilda häktningsskäl','2':'Häktning utan hänsyn till brottets svårhet',
        '3':'Utredningshäktning','4':'Begränsningar med hänsyn till personliga förhållanden',
        '4 a':'Tidsgräns för häktning','5':'Beslut om häktning','6':'Anhållande','7':'Gripande',
        '8':'Förhör efter anhållande','9':'Underrättelse till frihetsberövad','9 a':'Insyn i skälen',
        '10':'Hävning av anhållande','11':'Åklagarens prövning','12':'Häktningsframställning',
        '13':'Häktningsförhandling','13 a':'Särskilda regler för häktningsförhandling',
        '14':'Förhandlingens genomförande','15':'Förhandlingens fortsättning','16':'Häktningsbeslut',
        '17':'Häktning utan föregående anhållande','18':'Åtalstid','18 a':'Förlängning av häktningstid',
        '19':'Omprövning av utredningshäktning','20':'Hävning av häktning',
        '21':'Häktning efter dom','21 a':'Frihetsberövandets längd','22':'Förvar av gripna och anhållna','23':'Lagstöd för förvar','24':'Behandling av frihetsberövade'
      }
    }
  };
  const n=v=>String(v||'').toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const clean=s=>String(s||'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
  const key=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
  function snippet(text){
    let s=clean(text).replace(/^\/(?:Upphör|Träder)[^/]*\/\s*/i,'');
    if(/(?:har|är)\s+upphäv(?:ts|d)/i.test(s.slice(0,90)))return 'Upphävd paragraf';
    const punctuation=s.search(/[.;:!?]/);
    if(punctuation>=18&&punctuation<100)s=s.slice(0,punctuation+1);
    if(s.length>88){s=s.slice(0,85).replace(/\s+\S*$/,'')+'…';}
    return s||'Text saknas';
  }
  function description(sfs,chapter,p){
    const curated=titles[sfs]?.[String(chapter)]?.[key(p.number)];
    return curated?{text:curated,kind:'redaktionell'}:{text:snippet(p.text),kind:'textutdrag'};
  }
  function chapterGroups(sfs,ch){
    const groupStarts=groups[sfs]?.[String(ch.number)]||{};
    const out=[],paras=(ch.items||[]).filter(x=>x.type==='para');
    let active=null, pendingHeading=null, groupId=0;
    function newGroup(title,origin){
      active={id:'g'+groupId++,title,origin,paragraphs:[]};
      out.push(active);
    }
    for(const item of ch.items||[]){
      if(item.type==='heading'){pendingHeading={title:item.text,origin:item.editorial?'redaktionell':'källa'};continue;}
      if(item.type!=='para')continue;
      const start=groupStarts[key(item.number)];
      if(start)newGroup(start,'redaktionell');
      else if(pendingHeading&&(!active||pendingHeading.title!==active.title))newGroup(pendingHeading.title,pendingHeading.origin);
      if(!active)newGroup(ch.title||'Bestämmelser','redaktionell');
      const d=description(sfs,ch.number,item);
      active.paragraphs.push({number:String(item.number),title:d.text,kind:d.kind,excerpt:clean(item.text).slice(0,120)});
      pendingHeading=null;
    }
    return out.filter(g=>g.paragraphs.length);
  }
  function chapterMatches(ch,chapterGroups,query){
    const q=n(query);if(!q)return true;
    return n([ch.title,ch.number+' kap.',...chapterGroups.flatMap(g=>[g.title,...g.paragraphs.flatMap(p=>[p.number+' §',p.title,p.excerpt])])].join(' ')).includes(q);
  }
  return {chapterGroups,chapterMatches,description,snippet};
});
