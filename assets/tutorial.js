/* Lagboken 1.3 – introduktion vid första starten. Visas en gång; kan visas igen från Inställningar. */
(function(root){
  'use strict';
  const SLIDES=[
    {art:'<div class="tut-mark">§</div>',title:'Välkommen till Lagboken',
     text:'Svensk lag i telefonen: alla gällande lagar och nästan alla förordningar, hämtade direkt från Riksdagen och kontrollerade varje månad. Här är en kort genomgång av vad appen kan.'},
    {art:'<div class="tut-phone"><span class="tut-share">⬆︎</span><span>Lägg till på hemskärmen</span></div>',title:'Lägg appen på hemskärmen',
     text:'Öppna sidan i Safari, tryck på Dela ⬆︎ och välj <b>Lägg till på hemskärmen</b>. Då startar Lagboken som en vanlig app, direkt och i helskärm.'},
    {art:'<div class="tut-search">⌕ <span>BrB 24:1</span></div><div class="tut-chips"><span>husrannsakan</span><span>RB 23</span><span>SkolL 7:2</span></div>',title:'Sök och snabbkoder',
     text:'Sök på lagens namn, ett juridiskt begrepp eller ord i lagtexten. Skriv en förkortning och ett lagrum, till exempel <b>BrB 24:1</b> eller <b>PL 10</b>, så hoppar du direkt dit. Knappen ⌕ uppe till höger fungerar överallt.'},
    {art:'<div class="tut-tree"><b>Rättegångsbalken</b><span>├ Förundersökningskungörelsen</span><span>├ Lagen om offentligt biträde</span><span>└ …</span></div>',title:'Ordnad som en lagbok',
     text:'Grundlagarna först, sedan balkarna med sina anslutande lagar och därefter rättsområdena. Förordningar hänger under den lag de kompletterar. Längst ned finns ett register A–Ö.'},
    {art:'<div class="tut-para"><b>24 kap. 1 §</b><span>… enligt <u>23 kap. 3 §</u> …</span><em>§ Kompletteras av FuK 1 §</em></div>',title:'Läs med länkar och kopplingar',
     text:'Hänvisningar i texten är länkar, och en knapp tar dig tillbaka. Under paragrafen ser du vilka förordningar som kompletterar den och vad som hänvisar hit. Kommande ändringar visas med datum och markering av vad som är nytt.'},
    {art:'<div class="tut-pen"><mark>stryk under</mark> ✎ anteckning</div>',title:'Markera och anteckna',
     text:'Tryck på <b>Penna</b> och dra över texten för att stryka under, eller markera text och välj färg. Via ⋯ vid en paragraf kan du skriva anteckningar, kopiera hänvisningen, dela och samla lagrum. Allt hittar du under <b>Sparat</b>.'},
    {art:'<div class="tut-chips fav"><span>BrB</span><span>RB 24 kap.</span><span>PL</span></div>',title:'Favoriter',
     text:'Tryck ☆ vid en lag eller ett kapitel så hamnar den överst i katalogen som genväg. Under <b>Ordna</b> kan du flytta och ta bort dem.'},
    {art:'<div class="tut-date">◷ Visar lydelsen 1 juni 2027</div>',title:'Lydelse vid datum och Nytt i lagen',
     text:'Välj <b>Visa lydelse vid ett datum</b> i paragrafmenyn för att se lagen som den löd eller kommer att lyda, till exempel vid en gärning. Under <b>Nytt i lagen</b> ser du vad som ändrats vid varje uppdatering, och dina favoriter och bevakningar kommer först.'},
    {art:'<div class="tut-mark small">⇣</div>',title:'Utan internet',
     text:'Lagar du har öppnat sparas automatiskt. Under <b>Inställningar</b> kan du ladda ner en avdelning eller hela lagboken, cirka 120 MB, så att allt fungerar utan nät.'},
    {art:'<div class="tut-mark small">🔒</div>',title:'Dina uppgifter stannar hos dig',
     text:'Favoriter, markeringar och anteckningar sparas bara på den här enheten. Appen har inga konton och ingen spårning. Gör gärna en säkerhetskopia under Inställningar.'},
    {art:'<div class="tut-mark">§</div>',title:'Viktigt att veta',final:true,
     text:'Lagboken är ett privat projekt och har ingen koppling till Riksdagen, Regeringskansliet eller någon myndighet. Texten hämtas från Riksdagens öppna data och kan innehålla fel eller sakna den senaste ändringen. Den ersätter inte Svensk författningssamling. <b>Kontrollera alltid mot den officiella källan</b> innan texten används rättsligt. Hittar du ett fel, välj <b>Rapportera fel i texten</b> i paragrafmenyn.'}
  ];
  function show(onDone){
    if(document.getElementById('tutorial'))return;
    let at=0;const box=document.createElement('div');
    box.id='tutorial';box.className='tutorial';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Introduktion till Lagboken');
    const draw=dir=>{
      const s=SLIDES[at],last=at===SLIDES.length-1;
      box.innerHTML='<div class="tut-card'+(dir?' tut-'+dir:'')+'">'+
        (last?'':'<button type="button" class="tut-skip" data-tut="skip">Hoppa över</button>')+
        '<div class="tut-art" aria-hidden="true">'+s.art+'</div><h2>'+s.title+'</h2><p>'+s.text+'</p>'+
        (s.final?'<p class="tut-sign">Lycka till med läsningen!<br><span>Jonathan</span></p>':'')+
        '<div class="tut-dots" aria-hidden="true">'+SLIDES.map((_,i)=>'<i'+(i===at?' class="on"':'')+'></i>').join('')+'</div>'+
        '<div class="tut-actions">'+(at?'<button type="button" class="button" data-tut="back">Tillbaka</button>':'<span></span>')+
        '<button type="button" class="button primary" data-tut="'+(last?'done':'next')+'">'+(last?'Jag förstår':'Nästa')+'</button></div></div>';
      const b=box.querySelector('.button.primary');if(b)b.focus();
    };
    const go=(n,dir)=>{at=Math.max(0,Math.min(SLIDES.length-1,n));draw(dir);};
    box.addEventListener('click',e=>{
      const t=e.target.closest('[data-tut]');if(!t)return;
      const a=t.dataset.tut;
      if(a==='next')go(at+1,'next');else if(a==='back')go(at-1,'back');else if(a==='skip')go(SLIDES.length-1,'next');
      else if(a==='done'){box.classList.add('tut-out');setTimeout(()=>box.remove(),220);if(onDone)onDone();}
    });
    // Svep åt sidorna för att bläddra.
    let x0=null;
    box.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;},{passive:true});
    box.addEventListener('touchend',e=>{if(x0==null)return;const dx=e.changedTouches[0].clientX-x0;x0=null;
      if(dx<-50&&at<SLIDES.length-1)go(at+1,'next');else if(dx>50&&at>0)go(at-1,'back');},{passive:true});
    document.addEventListener('keydown',function key(e){
      if(!document.body.contains(box)){document.removeEventListener('keydown',key);return;}
      if(e.key==='ArrowRight'&&at<SLIDES.length-1)go(at+1,'next');if(e.key==='ArrowLeft'&&at>0)go(at-1,'back');
    });
    document.body.appendChild(box);draw('');
  }
  root.LagbokTutorial={show,slides:SLIDES.length};
})(typeof window!=='undefined'?window:globalThis);
