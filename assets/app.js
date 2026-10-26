/* Lagboken: snabb offlinevänlig juridisk läsapp utan externa JavaScript-beroenden. */
(function () {
  'use strict';
  const APP_VERSION='0.8';
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const view = $('#view');
  const sheet = $('#sheet');
  const scrim = $('#scrim');
  const defaults = {favourites:[], recents:[], notes:{}, highlights:{}, collections:[], watch:{}, readPos:{}, lastRead:null, lastColor:'yellow', usage:{}, fontFamily:'sans', lastBackup:null, theme:'light', fontSize:1, lineHeight:1.55, readingMode:'standard', focusReader:'off'};
  let pref;
  try { pref = Object.assign({}, defaults, JSON.parse(localStorage.getItem('lagboken-settings') || '{}')); }
  catch (_) { pref = Object.assign({}, defaults); }
  if(pref.theme==='system' && !pref.themeChosen){pref.theme='light';try{localStorage.setItem('lagboken-settings',JSON.stringify(pref))}catch(_){}}
  const searchCore=window.LagbokSearch;
  const legalLinks=window.LagbokReferences;
  const tocModel=window.LagbokTOC;
  const lawModel=window.LagbokLaw;
  const highlights=window.LagbokHighlights;
  const fetchJson=(url)=>fetch(url).then(r=>{if(!r.ok)throw Error(url);return r.json();});
  const searchIndex=window.LagbokIndex?window.LagbokIndex.create(fetchJson):null;
  const state = {navDir:'',newHighlight:null,version:'',sections:[],relations:{},pen:false,penAnchor:null,editingNote:null,searchFilter:'',marksFilter:'',marksQuery:'',status:{},upcoming:null,backlinks:new Map(),pendingHighlight:null,markTerms:null,returnStack:[],catalog:[],fap:[],laws:new Map(),loading:new Map(),query:'',searchEpoch:0,positions:{},current:null,previous:[],savedOnHome:false,focus:pref.focusReader==='on',visibleParagraph:null};
  const source = 'https://data.riksdagen.se/dokument/sfs-';
  const html = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const attr = html;
  const norm = (v) => String(v || '').toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s.-]+/g,' ').trim();
  const sfsFile = (id) => String(id).replace(/[: ]/g,'-');
  const sourceUrl = (id) => source + sfsFile(id) + '.html';
  const lawById = (id) => state.catalog.find(d => d.sfs === id);
  const searchText = (item) => item.versions ? item.versions.map(v=>v.text).join('\n\n') : String(item.text||'');
  function savePrefs() { try {localStorage.setItem('lagboken-settings',JSON.stringify(pref));} catch (_) {} }
  function applyPrefs() {
    const dark = pref.theme === 'dark' || (pref.theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const themeMeta=document.querySelector('meta[name="theme-color"]');if(themeMeta)themeMeta.content=dark?'#17251D':'#F7F6F0';
    document.documentElement.style.setProperty('--fontscale',String(pref.fontSize));
    document.documentElement.dataset.readerFont=pref.fontFamily==='serif'?'serif':'sans';
    document.documentElement.style.setProperty('--lineheight',String(pref.lineHeight));
    document.documentElement.dataset.readmode=pref.readingMode||'standard';
  }
  applyPrefs();
  function route() {
    const hash = (location.hash || '#/catalog').replace(/^#\/?/,'');
    const p = hash.split('/').map(decodeURIComponent);
    return {page:p[0] || 'catalog',sfs:p[1] || '',chapter:p[2],paragraph:p[3]};
  }
  function urlFor(sfs,cap,para) {
    return '#/law/' + encodeURIComponent(sfs) + (cap == null ? '' : '/' + encodeURIComponent(String(cap))) + (para == null ? '' : '/' + encodeURIComponent(String(para)));
  }
  function navigate(hash,replace) {
    state.positions[location.hash || '#/home'] = view.scrollTop;
    state.visibleParagraph=null;
    closeSheet();
    const dest = hash || '#/catalog';
    if(!dest.startsWith('#/law/'))state.focus=false;
    else state.focus=pref.focusReader==='on';
    if ((location.hash || '#/home') === dest && !replace) { render(); return; }
    if(!state.navDir)state.navDir='forward';
    if (replace) history.replaceState(null,'',dest);
    else history.pushState(null,'',dest);
    render(true);
  }
  function back() {
    closeSheet();
    if (history.state || state.previous.length) history.back();
    else navigate('#/catalog');
  }
  // Kort meddelande, valfritt med en ångra-knapp.
  function toast(message,undo) {
    const el = $('#toast');
    toast.undo=undo||null;
    if(undo){el.innerHTML='<span>'+html(message)+'</span><button type="button" class="toast-undo" data-action="toast-undo">Ångra</button>';}
    else el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {el.hidden=true;toast.undo=null;},undo?5000:2300);
  }
  function closeSheet() {
    sheet.style.transform='';
    sheet.hidden = true; scrim.hidden = true; sheet.dataset.kind=''; $('#menu-button').setAttribute('aria-expanded','false'); sheet.innerHTML = '';
  }
  function showSheet(markup,autoFocus=true) {
    sheet.innerHTML = markup;
    sheet.dataset.kind='normal';
    sheet.hidden = false; scrim.hidden = false; $('#menu-button').setAttribute('aria-expanded','true');
    if(autoFocus)setTimeout(() => { const focus = $('input',sheet); if(focus) focus.focus({preventScroll:true}); },40);
  }
  function iconSearch() {return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.2"/><path d="m16.2 16.2 5 5"/></svg>';}
  function searchBox(placeholder) {
    return '<form id="global-search" class="searchbar-wrap" role="search" autocomplete="off"><div class="searchbox">'+iconSearch()+
      '<input id="query" name="q" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="search-suggest" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="'+html(placeholder||'Sök författning, begrepp eller lagrum')+'" value="'+attr(state.query)+'">'+
      '<button type="button" class="search-clear" data-action="clear-search" aria-label="Rensa sökning">×</button></div>'+
      '<div id="search-suggest" class="suggestions" role="listbox" hidden></div></form>';
  }
  function listRow(title,subtitle,go,badge) {
    return '<a class="list-row" href="' + attr(go) + '" data-link="1">' +
      (badge ? '<span class="pill">' + html(badge) + '</span>' : '') +
      '<div class="grow"><div class="row-title">' + html(title) + '</div><div class="row-sub">' + html(subtitle || '') + '</div></div><span class="chevron">›</span></a>';
  }
  function lawRow(law) {
    return listRow(law.name, (law.type==='förordning'?'Förordning':'Lag') + ' · SFS ' + law.sfs, urlFor(law.sfs),law.sfs);
  }
  function footer() {
    return '<div class="footer-meta">Källa: Sveriges riksdag (Riksdagens öppna data). Lagboken är en fristående tjänst och ersätter inte kontroll av officiella författningar. Uppgifter om gällande lydelse och ikraftträdande måste alltid kontrolleras mot originalkällan.</div>';
  }
  function badgeMark(id) {return pref.favourites.includes(id) ? '★' : '☆';}
  function addRecent(target) {
    const sfs=target.split('|')[0];
    if(pref.recents[0]!==target)pref.usage[sfs]=(pref.usage[sfs]||0)+1;
    pref.recents = [target].concat(pref.recents.filter(t=>t!==target)).slice(0,15);
    savePrefs();
  }
  function favToggle(target) {
    if(pref.favourites.includes(target)) pref.favourites=pref.favourites.filter(f=>f!==target);
    else{
      pref.favourites.unshift(target);
      // Lagar med favoriter bevakas automatiskt.
      const sfs=target.split('|')[0];
      if(!pref.watch[sfs])loadLaw(sfs).then(doc=>{pref.watch[sfs]=Object.assign(lawModel.snapshot(doc),{at:lawModel.today()});savePrefs();}).catch(()=>{});
    }
    savePrefs();
    const position=view.scrollTop;
    Promise.resolve(render(false,true)).then(()=>{view.scrollTop=position;
      if(pref.favourites.includes(target))$$('[data-action="fav"]').filter(b=>b.dataset.key===target).forEach(b=>b.classList.add('pop'));});
    toast(pref.favourites.includes(target)?'Sparad i favoriter':'Borttagen från favoriter');
  }
  function favTitle(target) {
    const [id,cap,para] = target.split('|'); const meta=lawById(id);
    if (!meta) return target;
    return meta.name + (cap ? ' · ' + (cap==='0'?'':cap+' kap. ') + (para?para+' §':'') : '');
  }
  function favRoute(target) {
    const [id,cap,para] = target.split('|');
    return urlFor(id,cap,para);
  }
  function home() {
    const recent = pref.recents.filter(x=>lawById(x.split('|')[0])).slice(0,4);
    const favs = pref.favourites.filter(x=>lawById(x.split('|')[0])).slice(0,6);
    return '<div class="page"><h1 class="page-title">Lagboken</h1><p class="intro">Svensk lagstiftning, snabbt och enkelt.</p>' +
      searchBox('Sök lag, paragraf eller ämne') +
      '<div id="home-results"></div>' +
      '<div class="section-title">Senast öppnade</div><div class="card-list">' +
      (recent.length?recent.map(id=>listRow(favTitle(id),'Fortsätt läsa',favRoute(id))).join(''):
        '<div class="empty">De lagrum du läser kommer att visas här.</div>') +
      '</div><div class="section-title">Favoriter <a href="#/saved" data-link="1">Visa alla</a></div><div class="card-list">' +
      (favs.length?favs.map(id=>listRow(favTitle(id),'Sparat lagrum',favRoute(id))).join(''):
        '<div class="empty">Tryck på stjärnan vid ett lagrum för att spara det.</div>') +
      '</div><div class="section-title">Lagbok</div><div class="card-list">' +
      state.catalog.slice(0,5).map(lawRow).join('') +
      '</div><p class="small muted" style="margin-top:17px"><a href="#/catalog" data-link="1">Alla författningar</a> · <a href="#/fap" data-link="1">Polisens FAP</a></p>' + footer() + '</div>';
  }
  // Katalogen följer Sveriges Rikes Lag: grundlagar, balkarna med anslutande författningar, övriga områden.
  function childRow(law){
    return '<a class="list-row child-row" href="'+attr(urlFor(law.sfs))+'" data-link="1"><div class="grow"><div class="row-title">'+html(law.name)+'</div>'+
      '<div class="row-sub">'+(law.type==='förordning'?'Förordning':'Lag')+' · SFS '+html(law.sfs)+'</div></div><span class="chevron">›</span></a>';
  }
  function readTarget(sfs){
    const pos=pref.readPos[sfs];if(!pos)return null;
    return {url:urlFor(sfs,pos.chapter,pos.para?searchCore.paraKey(pos.para):null),label:(pos.chapter&&pos.chapter!=='0'?pos.chapter+' kap. ':'')+(pos.para?pos.para+' §':'')};
  }
  // Genvägar till de författningar man öppnar oftast.
  function shortcuts(){
    const used=Object.entries(pref.usage).filter(([s])=>lawById(s)).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([s])=>lawById(s));
    if(used.length<2)return '';
    const abbr=l=>(l.aliases||[]).find(a=>/^[A-ZÅÄÖ][A-Za-zÅÄÖåäö]{1,5}$/.test(a))||'';
    return '<div class="section-title">Mina genvägar</div><div class="shortcut-grid">'+used.map(l=>'<a class="shortcut" data-link="1" href="'+attr(urlFor(l.sfs))+'">'+
      (abbr(l)?'<b>'+html(abbr(l))+'</b>':'')+'<span>'+html(l.name)+'</span></a>').join('')+'</div>';
  }
  function continueRow(){
    const sfs=pref.lastRead,meta=sfs&&lawById(sfs),t=meta&&readTarget(sfs);
    if(!t)return '';
    return '<a class="continue-row" data-link="1" href="'+attr(t.url)+'"><span class="continue-icon" aria-hidden="true">↻</span><div class="grow"><div class="row-title">Fortsätt läsa</div>'+
      '<div class="row-sub">'+html(meta.name)+(t.label?' · '+html(t.label):'')+'</div></div><span class="chevron">›</span></a>';
  }
  function catalogSections(){
    const sections=state.sections.length?state.sections:[{id:'',name:'Författningar'}];
    return sections.map(sec=>{
      const laws=state.catalog.filter(l=>!sec.id||l.section===sec.id);
      const top=laws.filter(l=>!l.parent||!lawById(l.parent));
      if(!top.length)return '';
      return '<div class="section-title">'+html(sec.name)+'</div><div class="card-list">'+top.map(law=>{
        const kids=state.catalog.filter(k=>k.parent===law.sfs);
        return lawRow(law)+(kids.length?'<details class="children"><summary class="children-toggle">Anslutande författningar <span>'+kids.length+'</span></summary>'+
          '<div class="children-list">'+kids.map(childRow).join('')+'</div></details>':'');
      }).join('')+'</div>';
    }).join('');
  }
  function catalogPage(){
    return '<div class="page"><div class="catalog-hero"><h1 class="page-title">Hitta lagrum</h1>'+
      '<p class="intro">Sök på författning, juridiskt begrepp eller skriv exempelvis BrB 24:1.</p></div>'+
      searchBox('Sök i lagboken')+
      '<div id="search-results"></div><div id="catalog-directory">'+continueRow()+shortcuts()+catalogSections()+
      '<div class="section-title">Polisens föreskrifter</div><div class="card-list">'+
      listRow('Polisens FAP','Separat sidoregister, öppnas i appen','#/fap')+'</div>'+
      '<p class="catalog-meta">Version '+APP_VERSION+' · Visa källa och rättslig status i respektive författning.</p>'+
      footer()+'</div></div>';
  }
  function savedPage(){
    const favs = pref.favourites.filter(x=>lawById(x.split('|')[0]));
    const marks=Object.entries(pref.highlights).flatMap(([k,list])=>list.map(h=>({k,h}))).filter(x=>lawById(x.k.split('|')[0]));
    return '<div class="page"><h1 class="page-title">Sparat</h1><p class="intro">Dina favoriter, samlingar, markeringar och anteckningar sparas på den här enheten.</p>' +
      '<div class="section-title">Bevakning <a href="#/upcoming" data-link="1">Alla kommande ändringar</a></div><div id="watch-box">'+watchSummary()+'</div>'+
      '<div class="section-title">Samlingar ('+pref.collections.length+')</div><div class="card-list">'+
      (pref.collections.length?pref.collections.map(c=>listRow(c.name,c.items.length+' paragrafer','#/collection/'+encodeURIComponent(c.id),'▤')).join(''):
        '<div class="empty">Samla paragrafer, t.ex. ”LOB-ingripande”, via paragrafens meny ⋯.</div>')+'</div>'+
      '<div class="section-title">Markeringar och anteckningar ('+(marks.length+Object.keys(pref.notes).filter(x=>pref.notes[x]).length)+')</div>'+
      '<div class="marks-tools"><div class="searchbox small-search">'+iconSearch()+'<input id="marks-query" type="search" placeholder="Sök i markeringar och anteckningar" value="'+attr(state.marksQuery)+'"></div>'+
      '<div class="chips">'+[['','Alla'],['yellow','Gul'],['green','Grön'],['rose','Rosa'],['note','Anteckningar']].map(([id,label])=>
        '<button type="button" class="chip'+(state.marksFilter===id?' active':'')+'" data-action="marks-filter" data-id="'+id+'">'+(id&&id!=='note'?'<span class="hl-dot hl-'+id+'"></span>':'')+label+'</button>').join('')+'</div></div>'+
      '<div id="marks-list">'+marksHtml()+'</div>'+
      '<div class="section-title">Favoriter ('+favs.length+')</div><div class="card-list">' +
      (favs.length?favs.map(id=>listRow(favTitle(id),'',favRoute(id),'★')).join(''):'<div class="empty">Inga sparade lagrum ännu.</div>') +
      '</div><div>' +
      '</div></div>';
  }
  // Markeringar och anteckningar grupperade per författning, med filter på färg och fritext.
  function marksHtml(){
    const q=norm(state.marksQuery),f=state.marksFilter,items=[];
    for(const [k,list] of Object.entries(pref.highlights))for(const h of list)items.push({k,color:h.color,quote:h.quote,note:h.note||''});
    for(const [k,n] of Object.entries(pref.notes))if(n)items.push({k,color:'note',quote:'',note:n});
    const shown=items.filter(x=>lawById(x.k.split('|')[0])&&(!f||x.color===f||(f==='note'&&x.note))&&(!q||norm(x.quote+' '+x.note+' '+favTitle(x.k)).includes(q)));
    if(!shown.length)return '<div class="empty">'+(items.length?'Inget matchar filtret.':'Markera text i en paragraf eller skriv en anteckning så samlas de här.')+'</div>';
    const groups=new Map();
    for(const x of shown){const s=x.k.split('|')[0];if(!groups.has(s))groups.set(s,[]);groups.get(s).push(x);}
    const order=sfs=>state.catalog.findIndex(l=>l.sfs===sfs);
    return [...groups].sort((a,b)=>order(a[0])-order(b[0])).map(([sfs,list])=>'<div class="marks-group"><div class="marks-law">'+html(lawById(sfs).name)+'</div><div class="card-list">'+
      list.map(x=>'<a class="list-row" data-link="1" href="'+attr(favRoute(x.k))+'">'+(x.color==='note'?'<span class="note-dot">✎</span>':'<span class="hl-dot hl-'+attr(x.color)+'"></span>')+
        '<div class="grow"><div class="row-title">'+html(shortRef(...x.k.split('|')))+'</div>'+
        (x.quote?'<div class="row-sub">”'+html(x.quote.slice(0,140))+'”</div>':'')+(x.note?'<div class="row-sub note-text">'+html(x.note.slice(0,160))+'</div>':'')+
        '</div><span class="chevron">›</span></a>').join('')+'</div></div>').join('');
  }
  function fapPage(){
    const query=norm(state.query),items=state.fap.filter(f=>!query||norm([f.id,f.name,f.code,(f.tags||[]).join(' ')].join(' ')).includes(query));
    return '<div class="page"><span class="source-label">Polismyndigheten</span><h1 class="page-title">Polisens FAP</h1>'+
      '<p class="intro">Öppna en föreskrift i appens dokumentläsare. Originalet visas som PDF från Polismyndigheten och kräver internetanslutning.</p>'+
      '<div class="searchbox">'+iconSearch()+'<input id="fap-query" type="search" enterkeyhint="search" autocomplete="off" placeholder="Sök OC, batong, FAP 104-4…" value="'+attr(state.query)+'"></div>'+
      '<div id="fap-results" class="card-list">'+fapResults(items)+'</div>'+footer()+'</div>';
  }
  function fapResults(items){
    return items.length?items.map(f=>listRow(f.name, f.id+' · '+(f.code||'')+(f.pdfVersion?' · '+f.pdfVersion:''),'#/fap/'+encodeURIComponent(f.id),f.id)).join(''):
      '<div class="empty">Ingen föreskrift matchade sökningen.</div>';
  }
  function fapReader(id){
    const f=state.fap.find(x=>x.id===id);
    if(!f)return '<div class="page"><div class="empty">Föreskriften hittades inte.</div></div>';
    return '<div class="page"><span class="source-label">'+html(f.id)+' · '+html(f.code||'')+'</span><h1 class="page-title">'+html(f.name)+'</h1>'+
      '<p class="intro">'+html(f.pdfVersion||'Originalföreskrift')+'. PDF levereras från Polismyndigheten. Sammanställda versioner är endast avsedda som information; kontrollera alltid officiell gällande lydelse.</p>'+
      '<a class="button primary fap-open" href="'+attr(f.pdfUrl||f.url)+'" target="_blank" rel="noopener noreferrer">Öppna original-PDF separat ↗</a>'+
      (f.pdfUrl?'<div class="fap-viewer"><iframe class="fap-frame" title="'+attr(f.id+' — '+f.name)+'" loading="lazy" src="'+attr(f.pdfUrl)+'"></iframe></div>'+
      '<p class="small muted">Om dokumentet inte visas i din iPhone-webbläsare, använd knappen ovan. PDF-innehållet ingår inte i appens fritextindex.</p>':
      '<div class="notice">Ingen verifierad direktlänk till PDF finns för denna föreskrift.</div>')+
      '<div class="footer-meta">Källa: <a target="_blank" rel="noopener noreferrer" href="'+attr(f.url)+'">Polismyndighetens författningssamling ↗</a></div></div>';
  }
  async function loadLaw(id) {
    if(state.laws.has(id)) return state.laws.get(id);
    if(state.loading.has(id)) return state.loading.get(id);
    const promise=fetch('data/laws/'+sfsFile(id)+'.json',{cache:'no-store'}).then(async res=>{
      if(!res.ok) throw new Error('Författningstext ännu inte importerad');
      const data = await res.json();
      if(!Array.isArray(data.chapters)||!data.chapters.length) throw new Error('Ofullständigt dataformat');
      try{state.backlinks.set(id,await fetchJson('data/index/backlinks/'+sfsFile(id)+'.json'));}catch(_){state.backlinks.set(id,{});}
      state.laws.set(id,data); return data;
    }).finally(()=>state.loading.delete(id));
    state.loading.set(id,promise); return promise;
  }
  function hasRealChapters(data){return data.chapters.length>1||data.chapters[0].number!=='0';}
  function docIntro(meta,data){
    const n=data.chapters.reduce((total,ch)=>total+(ch.items||[]).filter(i=>i.type==='para').length,0);
    return '<div class="law-head"><span class="source-label">'+html(meta.type==='förordning'?'Förordning':'Lag')+' · SFS '+html(meta.sfs)+'</span>'+
      '<h1>'+html(data.title||meta.name)+'</h1><p>'+data.chapters.length+' kapitel/avsnitt · '+n+' paragrafer · Hämtad '+html((data.fetchedAt||'okänt datum').substring(0,10))+
      (data.latestAmendment?' · Senast ändrad genom SFS '+html(data.latestAmendment):'')+'</p>'+
      '<div class="actions"><button type="button" class="button" data-action="fav" data-key="'+attr(meta.sfs)+'">'+badgeMark(meta.sfs)+' Spara</button>'+
      '<button type="button" class="button'+(pref.watch[meta.sfs]?' active':'')+'" data-action="watch" data-key="'+attr(meta.sfs)+'">'+(pref.watch[meta.sfs]?'◉ Bevakas':'○ Bevaka ändringar')+'</button>'+
      '<a class="button" href="'+attr(sourceUrl(meta.sfs))+'" target="_blank" rel="noopener noreferrer">Officiell källa ↗</a></div>'+
      (readTarget(meta.sfs)&&readTarget(meta.sfs).label?'<a class="continue-row compact" data-link="1" href="'+attr(readTarget(meta.sfs).url)+'"><span class="continue-icon" aria-hidden="true">↻</span><div class="grow"><div class="row-title">Fortsätt där du var</div><div class="row-sub">'+html(readTarget(meta.sfs).label)+'</div></div><span class="chevron">›</span></a>':'')+
      lawRelations(meta)+
      '<p class="small muted">Appen visar den lydelse som gäller i dag enligt källans markeringar. Kommande lydelser visas under respektive paragraf. Kontrollera alltid mot Riksdagen vid rättslig användning.</p></div>';
  }
  // Förordningar som ansluter till lagen, eller lagen som förordningen ansluter till.
  function lawRelations(meta){
    const r=state.relations[meta.sfs]||{},parent=meta.parent&&lawById(meta.parent);
    const chips=(label,list)=>list.length?'<div class="relation-line"><span>'+label+'</span>'+list.map(s=>lawById(s)).filter(Boolean)
      .map(l=>'<a class="chip" data-link="1" href="'+attr(urlFor(l.sfs))+'">'+html(l.name)+'</a>').join('')+'</div>':'';
    return '<div class="relations">'+chips('Anslutande förordningar',r.kompletteras||[])+chips('Kompletterar',r.kompletterar||[])+
      (parent&&!(r.kompletterar||[]).includes(parent.sfs)?chips('Ansluter till',[parent.sfs]):'')+'</div>';
  }
  function transitionsHtml(meta,data){
    const list=data.transitions||[];if(!list.length)return '';
    const ch={number:'0'};
    return '<details class="transitions"><summary>Övergångsbestämmelser <span>'+list.length+(list.length===1?' författning':' ändringsförfattningar')+'</span></summary>'+
      '<p class="small muted">Ikraftträdande- och övergångsbestämmelser för lagen och dess ändringar, nyast först.</p>'+
      list.slice().reverse().map(t=>'<div class="transition"><div class="transition-sfs">'+(t.sfs?'SFS '+html(t.sfs):'Ursprunglig lydelse')+'</div>'+
        '<div class="paragraph-content">'+textHtml(t.text,meta,ch)+'</div></div>').join('')+'</details>';
  }
  function chapterList(meta,data){
    return docIntro(meta,data)+
      '<div class="chapter-list"><div class="section-title">Välj kapitel</div><div class="card-list chapters-grid">'+
      data.chapters.map(ch=>{
        const paras=(ch.items||[]).filter(i=>i.type==='para');
        const label=(ch.number==='0'?'Bestämmelser':ch.number+' kap.')+(ch.title?' · '+ch.title:'');
        const groups=tocModel.chapterGroups(meta.sfs,ch).filter(g=>g.origin!=='kapitel');
        if(groups.length<2)return listRow(label,paras.length+' paragrafer',urlFor(meta.sfs,ch.number));
        // Kapitel med rubriker: välj del av kapitlet innan läsningen börjar.
        return '<details class="chapter-item"><summary class="list-row"><div class="grow"><div class="row-title">'+html(label)+'</div>'+
          '<div class="row-sub">'+paras.length+' paragrafer · '+groups.length+' avsnitt</div></div><span class="chevron chapter-toggle" aria-hidden="true">⌄</span></summary>'+
          '<div class="chapter-sections"><a class="chapter-section all" data-link="1" href="'+attr(urlFor(meta.sfs,ch.number))+'">Hela kapitlet<span class="chevron">›</span></a>'+
          groups.map(g=>'<a class="chapter-section" data-link="1" href="'+attr(urlFor(meta.sfs,ch.number,searchCore.paraKey(g.first)))+'">'+
            '<span class="grow">'+(g.parent?'<span class="chapter-section-parent">'+html(g.parent)+'</span>':'')+'<span class="chapter-section-title">'+html(g.title)+'</span></span>'+
            '<span class="chapter-section-range">'+html(range(g))+'</span><span class="chevron">›</span></a>').join('')+
          '</div></details>';
      }).join('')+'</div>'+transitionsHtml(meta,data)+'</div>';
  }
  function range(g){
    const first=g.paragraphs[0].number,last=g.paragraphs[g.paragraphs.length-1].number;
    return first===last?first+' §':first+'–'+last+' §§';
  }
  function refExists(id,chapter,paragraph){
    const doc=state.laws.get(id);
    if(!doc)return true; // Ett ännu inte inläst annat lagrum kontrolleras före öppning.
    const ch=doc.chapters.find(c=>String(c.number)===String(chapter));
    if(paragraph==null)return !!ch;
    return !!ch&&(ch.items||[]).some(p=>p.type==='para'&&searchCore.paraKey(p.number)===searchCore.paraKey(paragraph));
  }
  function linkify(input,sfs,chapter){
    return legalLinks.linkify(input,{
      sfs,chapter,
      exists:refExists,
      href:urlFor
    });
  }
  function textHtml(text,meta,ch){
    const paragraphs=String(text||'').replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').split(/\n\s*\n+/).map(s=>s.trim()).filter(Boolean);
    return paragraphs.map(p=>{
      const ordered=/^(\d{1,2})[.)]\s+([\s\S]*)$/.exec(p);
      if(ordered)return '<div class="legal-item"><span class="legal-item-number">'+html(ordered[1])+'.</span>'+
        '<div class="legal-item-body">'+linkify(ordered[2],meta.sfs,ch.number).replace(/\n/g,'<br>')+'</div></div>';
      return '<p>'+linkify(p,meta.sfs,ch.number).replace(/\n/g,'<br>')+'</p>';
    }).join('');
  }
  function amended(v){return v&&v.amendedBy?'<p class="amended">Ändrad genom SFS '+html(v.amendedBy)+'</p>':'';}
  function paraHtml(meta,ch,item){
    const key=meta.sfs+'|'+ch.number+'|'+item.number;
    const anchor=' id="p-'+attr(searchCore.paraKey(item.number))+'" data-paragraph="'+attr(item.number)+'"';
    if(item.repealed)return '<article class="paragraph reader-block repealed"'+anchor+'><span class="paragraph-num">'+html(item.number)+' §</span>'+
      '<span class="repealed-text">'+html(item.text)+'</span></article>';
    const resolved=lawModel.resolve(item),current=resolved.current;
    const title=tocModel.curatedTitle(meta.sfs,ch.number,item.number);
    const status=resolved.pending?'<div class="lydelse-status upcoming">'+html(lawModel.describe(current))+'</div>':
      current.expires?'<div class="lydelse-status">'+html(lawModel.describe(current))+'</div>':'';
    const others=resolved.others.map(v=>'<details class="lydelse"><summary>'+html(lawModel.describe(v))+'</summary>'+
      (v.status==='upcoming'&&!resolved.pending?'<div class="diff-legend"><span class="diff-del">struket</span> tas bort · <span class="diff-ins">understruket</span> är nytt</div>'+
        '<div class="paragraph-content diff">'+diffHtml(current.text,v.text)+'</div>'+
        '<details class="plain-version"><summary>Visa ny lydelse utan markeringar</summary><div class="paragraph-content">'+textHtml(v.text,meta,ch)+'</div></details>':
        '<div class="paragraph-content">'+textHtml(v.text,meta,ch)+'</div>')+amended(v)+'</details>').join('');
    const back=(state.backlinks.get(meta.sfs)||{})[ch.number+'|'+searchCore.paraKey(item.number)]||[];
    return '<article class="paragraph reader-block" data-key="'+attr(key)+'"'+anchor+'>'+
      '<header class="paragraph-header">'+
      '<button type="button" class="paragraph-heading-button" data-action="para-menu" data-key="'+attr(key)+'" aria-label="'+attr(item.number)+' § – meny">'+
      '<span class="paragraph-num">'+html(item.number)+' §</span>'+(title?'<span class="paragraph-title">'+html(title)+'</span>':'')+'</button>'+
      '<button type="button" class="para-menu-button" data-action="para-menu" data-key="'+attr(key)+'" aria-label="Meny för '+attr(item.number)+' §: kopiera, dela, spara, samla eller anteckna">⋯</button>'+
      '</header>'+status+'<div class="paragraph-content">'+textHtml(current.text,meta,ch)+'</div>'+amended(current)+others+
      linksRow(key,back)+noteHtml(key)+'</article>';
  }
  // Kopplingar under paragrafen: kompletterande föreskrifter, vad den kompletterar och hänvisningar hit.
  function linkLabel(list){
    const names=list.slice(0,3).map(([s,c,n])=>shortRef(s,c,n));
    return names.join(', ')+(list.length>3?' +'+(list.length-3):'');
  }
  function linksRow(key,back){
    if(!back.length)return '';
    const reg=back.filter(e=>e[3]==='föreskrift'),comp=back.filter(e=>e[3]==='kompletterar'),refs=back.filter(e=>!e[3]||e[3]==='ref');
    return '<div class="links-row">'+
      (reg.length?'<button type="button" class="link-chip regulation" data-action="backlinks" data-key="'+attr(key)+'">§ Kompletteras av '+html(linkLabel(reg))+'</button>':'')+
      (comp.length?'<button type="button" class="link-chip complements" data-action="backlinks" data-key="'+attr(key)+'">↗ Kompletterar '+html(linkLabel(comp))+'</button>':'')+
      (refs.length?'<button type="button" class="link-chip" data-action="backlinks" data-key="'+attr(key)+'">↩ '+refs.length+(refs.length===1?' hänvisning':' hänvisningar')+' hit</button>':'')+
      '</div>';
  }
  function noteHtml(key){
    if(state.editingNote===key)return '<div class="note-inline"><textarea class="note-input" data-note-key="'+attr(key)+'" rows="3" placeholder="Skriv en anteckning till paragrafen …">'+html(pref.notes[key]||'')+'</textarea>'+
      '<div class="note-actions"><span class="small muted">Sparas automatiskt</span><button type="button" class="button primary" data-action="note-done" data-key="'+attr(key)+'">Klar</button></div></div>';
    return pref.notes[key]?'<button type="button" class="paragraph-note" data-action="note" data-key="'+attr(key)+'"><span class="note-label">Anteckning</span>'+html(pref.notes[key])+'</button>':'';
  }
  function diffHtml(a,b){
    return lawModel.diffWords(a,b).map(x=>{
      const t=html(x.text).replace(/\n\n+/g,'<br><br>').replace(/\n/g,'<br>');
      return x.type==='same'?t:x.type==='del'?'<del class="diff-del">'+t+'</del>':'<ins class="diff-ins">'+t+'</ins>';
    }).join('');
  }
  function chapterReader(meta,data,capid){
    const ch=data.chapters.find(c=>String(c.number)===String(capid));
    if(!ch)return '<div class="page"><div class="empty">Kapitlet hittades inte.</div></div>';
    const short=ch.number==='0'?'Bestämmelser':ch.number+' kap.';
    const byNumber=new Map((ch.items||[]).filter(i=>i.type==='para').map(i=>[String(i.number),i]));
    let parent=null;
    const content=tocModel.chapterGroups(meta.sfs,ch).map(g=>{
      let head='';
      if(g.parent&&g.parent!==parent)head+='<h2 class="reader-section">'+html(g.parent)+'</h2>';
      parent=g.parent||null;
      if(g.origin!=='kapitel')head+='<h2 class="reader-subhead" id="g-'+attr(searchCore.paraKey(g.first))+'">'+html(g.title)+'</h2>';
      return head+g.paragraphs.map(p=>paraHtml(meta,ch,byNumber.get(p.number))).join('');
    }).join('');
    const index=data.chapters.indexOf(ch),next=data.chapters[index+1];
    return '<div class="reader-context">'+
      '<div class="reader-crumbs"><strong>'+html(short)+'</strong><span class="reader-current">'+html(ch.title||meta.name)+'</span></div>'+
      '<button type="button" data-action="pen" class="pen-toggle'+(state.pen?' on':'')+'" aria-pressed="'+state.pen+'" aria-label="Penna för markeringar">✎ Penna</button>'+
      '<button type="button" data-action="toc" class="reader-toc-button" aria-label="Öppna innehållsförteckning">Innehåll <span aria-hidden="true">☷</span></button>'+
      (state.focus?'<button type="button" class="focus-return" data-action="toggle-focus">Avsluta läsläge</button>':'')+
      '</div>'+
      '<main class="law-reader reading-mode-'+html(pref.readingMode)+'">'+
      '<header class="reader-heading"><h1>'+html(ch.title||(ch.number==='0'?meta.name:'Kapitel '+ch.number))+'</h1></header>'+
      '<div class="statute-body">'+content+'</div>'+
      '<footer class="reader-end"><span class="small muted">Slut på '+html(short)+'.</span>'+
      (next?'<a class="reader-next" data-link="1" href="'+attr(urlFor(meta.sfs,next.number))+'"><span class="small muted">Nästa kapitel</span>'+
        '<span>'+html(next.number+' kap. '+(next.title||''))+' ›</span></a>':transitionsHtml(meta,data))+'</footer></main>';
  }
  function tocHtml(meta,data,needle){
    const here=route(),q=needle||'';
    return '<header class="toc-header"><div class="toc-header-title"><span class="source-label">'+html(meta.name)+'</span>'+
      '<h2>Innehåll</h2><p>Välj kapitel eller paragraf</p></div>'+
      '<button class="icon-button" data-action="close" aria-label="Stäng innehållsförteckning">×</button></header>'+
      '<div class="toc-search"><div class="searchbox">'+iconSearch()+
      '<input id="toc-query" type="search" enterkeyhint="search" autocomplete="off" placeholder="Sök rubrik, kapitel eller paragraf" value="'+attr(q)+'"></div></div>'+
      '<div class="toc-results" id="toc-results">'+tocEntries(meta,data,here,q)+'</div>'+
      '';
  }
  function tocEntries(meta,data,here,needle){
    const q=norm(needle||''),currentPara=state.visibleParagraph||here.paragraph||null;
    const all=[];
    for(const ch of data.chapters){
      const groups=tocModel.chapterGroups(meta.sfs,ch);
      const chapMatch=q&&(norm([ch.number+' kap.',ch.title].join(' ')).includes(q));
      const shownGroups=groups.map(g=>{
        const groupMatch=q&&norm(g.title).includes(q);
        return {...g,paragraphs:(!q||chapMatch||groupMatch)?g.paragraphs:
          g.paragraphs.filter(p=>norm([p.number+' §',p.title,p.excerpt].join(' ')).includes(q))};
      }).filter(g=>g.paragraphs.length);
      if(q&&!shownGroups.length)continue;
      const active=ch.number===here.chapter;
      const expanded=!!q||active||data.chapters.length===1;
      const chapterTitle=(ch.number==='0'?meta.name:ch.number+' kap. '+(ch.title||''));
      const rows=shownGroups.map(g=>'<section class="toc-subgroup">'+(g.parent?'<div class="toc-subgroup-parent">'+html(g.parent)+'</div>':'')+
        '<h3 class="toc-subgroup-title"><a data-link="1" href="'+attr(urlFor(meta.sfs,ch.number,searchCore.paraKey(g.first)))+'">'+html(g.title)+'</a></h3>'+
        '<div class="toc-paragraphs">'+g.paragraphs.map(p=>{
          const isCurrent=active&&currentPara&&searchCore.paraKey(currentPara)===searchCore.paraKey(p.number);
          return '<a data-link="1" class="toc-paragraph'+(isCurrent?' toc-current':'')+'"'+
            (isCurrent?' aria-current="location"':'')+
            ' href="'+attr(urlFor(meta.sfs,ch.number,p.number))+'"><span class="toc-paragraph-number">'+html(p.number)+' §</span>'+
            '<span class="toc-paragraph-title">'+html(p.title)+'</span></a>';
        }).join('')+'</div></section>').join('');
      all.push('<details class="toc-chapter" '+(expanded?'open':'')+'>'+
        '<summary class="toc-chapter-summary'+(active?' toc-current-chapter':'')+'"><span class="toc-chapter-heading">'+html(chapterTitle)+
        '</span><span class="toc-chapter-info">'+groups.reduce((n,g)=>n+g.paragraphs.length,0)+' paragrafer</span>'+
        '<span class="toc-chevron" aria-hidden="true">⌄</span></summary><div class="toc-chapter-body">'+rows+'</div></details>');
    }
    return all.length?all.join(''):'<div class="empty">Inga kapitel eller paragrafer matchar sökningen.</div>';
  }
  function menu() {
    const r=route(),law=r.page==='law'?lawById(r.sfs):null;
    const chapterKey=law&&r.chapter!=null?r.sfs+'|'+r.chapter:null;
    showSheet('<div class="sheet-title">Mer <button class="icon-button" data-action="close">×</button></div>'+
      '<div class="card-list">'+
      (chapterKey?'<button class="list-row sheet-menu-row" type="button" data-action="fav" data-key="'+attr(chapterKey)+'">'+
        '<span class="grow"><span class="row-title">'+(pref.favourites.includes(chapterKey)?'Ta bort sparat kapitel':'Spara kapitel')+'</span></span>☆</button>':'')+
      (law?'<button class="list-row sheet-menu-row" type="button" data-action="source-info">'+
        '<span class="grow"><span class="row-title">Källa och versionsinformation</span><span class="row-sub">'+html(law.name)+'</span></span>›</button>':'')+
      listRow('Inställningar','Läsning, offline och säkerhetskopia','#/settings')+
      listRow('Polisens FAP','Separat sidoregister','#/fap')+
      listRow('Om lagboken','Information om tjänsten','#/about')+'</div>');
  }
  function sourceInfo(){
    const r=route(),meta=lawById(r.sfs),data=state.laws.get(r.sfs);
    if(!meta||!data)return;
    const number=data.chapters.reduce((acc,c)=>acc+(c.items||[]).filter(x=>x.type==='para').length,0);
    showSheet('<div class="sheet-title">Källa och version <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<p>'+html(meta.name)+' (SFS '+html(meta.sfs)+')</p>'+
      '<p class="small muted">'+number+' importerade paragrafer. Hämtad: '+html((data.fetchedAt||'okänt').slice(0,10))+'.</p>'+
      '<div class="notice">Den importerade texten kan innehålla olika lydelser och övergångsregler. Kontrollera alltid tillämplig version mot den officiella källan.</div>'+
      '<a class="button primary" href="'+attr(sourceUrl(meta.sfs))+'" rel="noopener noreferrer" target="_blank">Öppna hos Riksdagen ↗</a>');
  }
  function settingsPage(){
    return '<div class="page"><h1 class="page-title">Inställningar</h1>'+
      '<div class="field"><label for="theme">Färgtema</label><select data-setting="theme" id="theme">'+
      [['light','Mjukvitt med elegant grön (standard)'],['dark','Mörkt'],['system','Följ iPhone']].map(x=>'<option value="'+x[0]+'"'+(pref.theme===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="reading-mode">Lästäthet</label><select data-setting="readingMode" id="reading-mode">'+
      [['standard','Standard – bekväm läsning'],['compact','Kompakt – fler paragrafer samtidigt']].map(x=>'<option value="'+x[0]+'"'+(pref.readingMode===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="reader-focus-setting">Läsläge</label><select data-setting="focusReader" id="reader-focus-setting">'+
      [['off','Visa vanliga verktygsfält'],['on','Dölj verktygsfält vid läsning']].map(x=>'<option value="'+x[0]+'"'+(pref.focusReader===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="size">Textstorlek <span class="range-value" id="size-value">'+Math.round(Number(pref.fontSize)*100)+' %</span></label>'+
      '<input type="range" data-setting="fontSize" id="size" min="0.85" max="1.5" step="0.05" value="'+attr(pref.fontSize)+'">'+
      '<p class="font-preview" id="font-preview">Den som på sannolika skäl är misstänkt för ett brott …</p></div>'+
      '<div class="field"><label for="font-family">Typsnitt i lagtexten</label><select data-setting="fontFamily" id="font-family">'+
      [['sans','Rakt (systemtypsnitt)'],['serif','Bok (serif)']].map(x=>'<option value="'+x[0]+'"'+(pref.fontFamily===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="height">Radavstånd</label><select data-setting="lineHeight" id="height">'+
      [[1.43,'Kompakt'],[1.55,'Normal'],[1.75,'Luftigt']].map(x=>'<option value="'+x[0]+'"'+(Number(pref.lineHeight)===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
      '<div class="section-title">Offline</div>'+
      '<p class="small muted">Spara alla författningar på telefonen så att de går att läsa utan internet.</p>'+
      '<div class="actions"><button type="button" class="button primary" data-action="offline">Ladda ner hela lagboken</button></div>'+
      '<div class="actions offline-areas">'+state.sections.map(a=>'<button type="button" class="button" data-action="offline" data-area="'+attr(a.id)+'">'+html(a.name)+'</button>').join('')+'</div>'+
      '<p class="small muted" id="offline-status">Kontrollerar sparade lagar …</p>'+
      '<div class="section-title">Säkerhetskopia</div>'+backupNotice()+
      '<p class="small muted">Favoriter, anteckningar och inställningar sparas bara på den här enheten. Spara en kopia som fil och läs in den igen vid behov.</p>'+
      '<div class="actions"><button type="button" class="button" data-action="export">Exportera</button>'+
      '<button type="button" class="button" data-action="import">Importera</button>'+
      '<input type="file" id="import-file" accept="application/json,.json" hidden></div>'+
      '<div class="section-title">Om appen</div><p class="small muted">Lagboken version '+APP_VERSION+' · Lagtext hämtad från Riksdagen '+html(String(window.LAGBOK_GENERATED||'').slice(0,10)||'okänt datum')+' · '+state.catalog.length+' författningar.</p>'+
      '<div class="actions"><button type="button" class="button" data-action="check-update">Leta efter ny version</button></div></div>';
  }
  // Påminnelse om säkerhetskopia när det finns egna markeringar eller anteckningar.
  function backupNotice(){
    const own=Object.keys(pref.highlights).length+Object.keys(pref.notes).length+pref.collections.length;
    if(!own)return '';
    const days=pref.lastBackup?Math.floor((Date.now()-Date.parse(pref.lastBackup))/864e5):null;
    if(days!==null&&days<30)return '<p class="small muted">Senaste säkerhetskopia: för '+(days===0?'mindre än en dag':days+(days===1?' dag':' dagar'))+' sedan.</p>';
    return '<div class="notice backup-notice">'+(days===null?'Du har inte gjort någon säkerhetskopia ännu.':'Det var '+days+' dagar sedan din senaste säkerhetskopia.')+' Exportera för att inte riskera dina markeringar och anteckningar.</div>';
  }
  const DATA_CACHE='lagboken-data';
  const lawUrl=(id)=>'data/laws/'+sfsFile(id)+'.json';
  async function offlineStatus(){
    const box=$('#offline-status');if(!box)return;
    if(!window.caches){box.textContent='Webbläsaren stöder inte offlinelagring.';return;}
    try{
      const cache=await caches.open(DATA_CACHE);
      let saved=0;
      for(const law of state.catalog)if(await cache.match(lawUrl(law.sfs)))saved++;
      box.textContent=saved+' av '+state.catalog.length+' författningar sparade för offline.';
    }catch(_){box.textContent='Status för offlinelagring kunde inte läsas.';}
  }
  async function downloadAll(area){
    if(!window.caches){toast('Offlinelagring stöds inte här.');return;}
    const box=$('#offline-status');let done=0,failed=0;
    const cache=await caches.open(DATA_CACHE);
    const laws=state.catalog.filter(l=>!area||l.section===area);
    // Lagtext, register över hänvisningar och sökindexet behövs för full funktion utan nät.
    const files=laws.flatMap(l=>[lawUrl(l.sfs),'data/index/backlinks/'+sfsFile(l.sfs)+'.json']);
    try{
      files.push('data/index/paras.json','data/index/status.json','data/index/upcoming.json','data/index/shards.json');
      const list=await fetchJson('data/index/shards.json').catch(()=>[]);
      for(const n of list)files.push('data/index/terms/'+n+'.json');
    }catch(_){}
    let n=0;
    for(const url of files){
      try{
        const res=await fetch(url,{cache:'no-store'});
        if(!res.ok)throw Error('saknas');
        await cache.put(url,res);if(url.includes('/laws/'))done++;
      }catch(_){if(url.includes('/laws/'))failed++;}
      if(box&&(++n%10===0||url.includes('/laws/')))box.textContent='Laddar ner … '+Math.round(n*100/files.length)+' %';
    }
    try{await cache.add('data/catalog.json');}catch(_){}
    toast(failed?failed+' författningar kunde inte hämtas':'Alla lagar finns nu offline');
    offlineStatus();
  }
  function exportData(){
    const payload={app:'Lagboken',version:state.version,exported:new Date().toISOString(),
      favourites:pref.favourites,notes:pref.notes,recents:pref.recents,highlights:pref.highlights,collections:pref.collections,watch:pref.watch,
      settings:{theme:pref.theme,fontSize:pref.fontSize,lineHeight:pref.lineHeight,readingMode:pref.readingMode,focusReader:pref.focusReader,fontFamily:pref.fontFamily}};
    pref.lastBackup=new Date().toISOString();savePrefs();
    const name='lagboken-'+new Date().toISOString().slice(0,10)+'.json';
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const file=window.File?new File([blob],name,{type:'application/json'}):null;
    if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
      navigator.share({files:[file],title:'Lagboken – säkerhetskopia'}).catch(()=>{});return;
    }
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  }
  async function importData(file){
    try{
      const data=JSON.parse(await file.text());
      if(data.app!=='Lagboken')throw Error('fel format');
      const favs=Array.isArray(data.favourites)?data.favourites.filter(x=>typeof x==='string'):[];
      pref.favourites=Array.from(new Set(pref.favourites.concat(favs)));
      if(data.notes&&typeof data.notes==='object')for(const [k,v] of Object.entries(data.notes))if(typeof v==='string'&&v.trim())pref.notes[k]=v;
      if(data.highlights&&typeof data.highlights==='object')for(const [k,list] of Object.entries(data.highlights)){
        if(!Array.isArray(list))continue;const mine=pref.highlights[k]=pref.highlights[k]||[];
        for(const h of list)if(h&&h.id&&typeof h.quote==='string'&&!mine.some(x=>x.id===h.id))mine.push(h);
      }
      if(Array.isArray(data.collections))for(const c of data.collections){
        if(!c||!c.id||!Array.isArray(c.items))continue;const mine=collectionById(c.id);
        if(mine)mine.items=Array.from(new Set(mine.items.concat(c.items)));else pref.collections.push({id:c.id,name:String(c.name||'Samling'),items:c.items.filter(x=>typeof x==='string')});
      }
      if(data.watch&&typeof data.watch==='object')for(const [k,v] of Object.entries(data.watch))if(!pref.watch[k]&&v&&v.paras)pref.watch[k]=v;
      if(Array.isArray(data.recents)&&!pref.recents.length)pref.recents=data.recents.filter(x=>typeof x==='string').slice(0,15);
      if(data.settings&&typeof data.settings==='object')for(const k of ['theme','fontSize','lineHeight','readingMode','focusReader','fontFamily'])if(k in data.settings)pref[k]=data.settings[k];
      savePrefs();applyPrefs();toast('Säkerhetskopian är inläst');render(false);
    }catch(_){toast('Filen kunde inte läsas som en säkerhetskopia från Lagboken.');}
  }
  function aboutPage(){
    return '<div class="page"><h1 class="page-title">Om lagboken</h1><p>En fristående, mobilanpassad lagbok med läsvy i mjukvitt, grönt och diskreta vinröda detaljer.</p>' +
      '<div class="section-title">Rättskällor</div><p class="small muted">Författningstexterna hämtas från Sveriges riksdags öppna data. Polisens FAP visas i en intern PDF-läsare med direktlänkar till Polismyndighetens författningssamling.</p>' +
      '<div class="section-title">Uppdateringsstatus</div><p class="small">Senast genomförd datainhämtning: '+html(window.LAGBOK_GENERATED||'Se respektive författning')+'. Lagtexten kontrolleras automatiskt den 1 varje månad mot Riksdagens öppna data och ändringar granskas innan de publiceras.</p>' +
      '<div class="section-title">Lydelser och rubriker</div><p class="small muted">När en paragraf har flera lydelser visar appen den som gäller i dag enligt Riksdagens markeringar om ikraftträdande. Kommande lydelser visas hopfällda under paragrafen med ändringarna markerade. Vissa kapitel- och paragrafrubriker samt kopplingar mellan lag och förordning är tillagda för navigering och är inte en del av lagtexten.</p>' +
      '<div class="notice">Det här är inte en officiell lagtexttjänst. En importerad lydelse kan innehålla övergångsbestämmelser och framtida ikraftträdanden. Kontrollera den tillämpliga versionen i originalkällan.</div>' +
      '<p><a href="https://github.com/Deashi03/Lagbok" target="_blank" rel="noopener noreferrer">Öppna projektet på GitHub ↗</a></p></div>';
  }
  function findDirect(q){return searchCore.parseQuick(q,state.catalog,state.fap);}
  function quickUrl(d){
    return d.type==='fap'?'#/fap/'+encodeURIComponent(d.fap.id):urlFor(d.meta.sfs,d.chapter,d.para);
  }
  function quickLabel(d){
    return d.type==='fap'?d.fap.id:d.meta.name+' · '+(d.chapter==='0'?'':d.chapter+' kap. ')+(d.para?d.para+' §':'');
  }
  async function goQuick(q){
    const direct=findDirect(q);if(!direct)return false;
    if(direct.type==='fap'){state.query='';navigate(quickUrl(direct));return true;}
    try{
      const doc=await loadLaw(direct.meta.sfs);
      const found=searchCore.resolvedQuick(direct,doc);
      if(!found){toast('Kapitlet eller paragrafen finns inte i den importerade författningen.');return true;}
      state.query='';navigate(quickUrl(found));return true;
    }catch(_){toast('Lagtexten kunde inte läsas just nu.');return true;}
  }
  function searchLawMatches(query){
    const n=norm(query);
    if(n.length<3)return searchCore.rankSuggestions(query,state.catalog,[],[],[]).filter(x=>x.type==='law').map(x=>x.law);
    return state.catalog.filter(l=>norm([l.name,l.sfs,(l.aliases||[]).join(' ')].join(' ')).includes(n)).sort((a,b)=>Number(norm(b.name).startsWith(n))-Number(norm(a.name).startsWith(n)));
  }
  function searchPage(){return catalogPage();}
  function resultsHtml(query){
    const direct=findDirect(query),laws=searchLawMatches(query);
    const faps=state.fap.filter(f=>norm([f.name,f.id,f.code,(f.tags||[]).join(' ')].join(' ')).includes(norm(query)));
    const intro=direct?'<div class="section-title">Direkt till</div><div class="card-list"><a class="list-row" href="'+attr(quickUrl(direct))+'" data-quick="'+attr(query)+'"><div class="grow"><div class="row-title">'+html(quickLabel(direct))+'</div><div class="row-sub">Tryck här eller använd Enter för snabbkod</div></div><span class="chevron">›</span></a></div>':'';
    const lhtml=laws.length?'<div class="section-title">Författningar</div><div class="card-list">'+laws.map(lawRow).join('')+'</div>':'';
    const fhtml=faps.length?'<div class="section-title">Polisens FAP</div><div class="card-list">'+fapResults(faps.slice(0,5))+'</div>':'';
    return intro+lhtml+fhtml+'<div class="section-title">Träffar i lagtext</div><div id="text-results" class="search-results"><div class="loading">Söker i lagtexten …</div></div>';
  }
  function suggestionsHtml(query){
    const topics=[
      {term:'Husrannsakan',code:'RB 28:1'},
      {term:'Häktning',code:'RB 24:1'},
      {term:'Stöld',code:'BrB 8:1'},
      {term:'Ringa stöld',code:'BrB 8:2'},
      {term:'Nödvärn',code:'BrB 24:1'},
      {term:'Offentlig försvarare',code:'RB 21:3a'},
      {term:'Kroppsvisitation',code:'RB 28:11'},
      {term:'Gripande',code:'RB 24:7'}
    ];
    const recent=pref.recents.filter(x=>lawById(x.split('|')[0])).slice(0,5).map(x=>({title:favTitle(x),url:favRoute(x)}));
    const matches=searchCore.rankSuggestions(query,state.catalog,state.fap,topics,recent);
    return matches.map(item=>{
      let target='', icon='§',extra='';
      if(item.type==='law'){target=urlFor(item.law.sfs);icon='▤';extra='data-link="1"';}
      if(item.type==='quick'){target=quickUrl(item.quick);icon='↗';extra='data-quick="'+attr(query)+'"';}
      if(item.type==='fap'){target='#/fap/'+encodeURIComponent(item.fap.id);icon='▤';extra='data-link="1"';}
      if(item.type==='topic'){const quick=findDirect(item.code);if(!quick)return '';target=quickUrl(quick);icon='§';extra='data-quick="'+attr(item.code)+'"';}
      if(item.type==='recent'){target=item.url;icon='◷';extra='data-link="1"';}
      return '<a class="suggestion" role="option" href="'+attr(target)+'" '+extra+'><span class="suggestion-icon">'+icon+'</span>'+
        '<span class="suggestion-info"><span class="suggestion-title">'+html(item.title)+'</span>'+
        '<span class="suggestion-sub">'+html(item.subtitle)+'</span></span></a>';
    }).join('');
  }
  function updateSuggestions(){
    const el=$('#search-suggest'),input=$('#query');if(!el||!input)return;
    const markup=suggestionsHtml(state.query);el.innerHTML=markup;el.hidden=!markup;input.setAttribute('aria-expanded',String(!!markup));
  }
  // Filter för fritextsökningen: lagbokens avdelningar, de stora balkarna och egna samlingar.
  function searchFilters(){
    const opts=[['','Alla'],['balk:1962:700','BrB m.fl.'],['balk:1942:740','RB m.fl.'],...state.sections.filter(s=>s.id!=='balkar').map(s=>[s.id,s.name.split(/,| och /)[0]])];
    if(pref.collections.length)opts.push(['samlingar','Mina samlingar']);
    return '<div class="chips search-filters">'+opts.map(([id,label])=>'<button type="button" class="chip'+(state.searchFilter===id?' active':'')+'" data-action="search-filter" data-id="'+attr(id)+'">'+html(label)+'</button>').join('')+'</div>';
  }
  function passesFilter(h){
    const f=state.searchFilter;if(!f)return true;
    const law=lawById(h.sfs);if(!law)return false;
    if(f.startsWith('balk:')){const b=f.slice(5);return law.sfs===b||law.parent===b;}
    if(f==='samlingar'){const k=searchCore.paraKey(h.number);return pref.collections.some(c=>c.items.some(x=>{const [s,ch,n]=x.split('|');return s===h.sfs&&ch===h.chapter&&searchCore.paraKey(n)===k;}));}
    return law.section===f;
  }
  async function populateTextResults(q,epoch) {
    const box=()=>epoch===state.searchEpoch?$('#text-results'):null;
    if(!searchIndex||!searchIndex){return;}
    let result;
    try{result=await searchIndex.query(q,{limit:400});}
    catch(_){if(box())box().innerHTML='<div class="empty">Sökindexet kunde inte läsas. Försök igen med internetanslutning.</div>';return;}
    if(!box())return;
    if(!result.tokens.length){box().innerHTML='<p class="muted small">Skriv minst två tecken för fritextsökning.</p>';return;}
    if(!result.total){box().innerHTML=searchFilters()+'<div class="empty">Inga paragrafer innehåller alla sökorden.</div>';return;}
    const all=result.hits.filter(passesFilter),hits=all.slice(0,30);
    if(!hits.length){box().innerHTML=searchFilters()+'<div class="empty">Inga träffar med det här filtret.</div>';return;}
    const rows=hits.map((h,i)=>{
      const meta=lawById(h.sfs);if(!meta)return '';
      return '<a class="list-row" href="'+attr(urlFor(h.sfs,h.chapter,searchCore.paraKey(h.number)))+'" data-link="1" data-terms="'+attr(result.tokens.join(' '))+'"><div class="grow"><div class="row-title">'+
        html(shortRef(h.sfs,h.chapter,h.number))+(h.title?' · '+html(h.title):'')+'</div><div class="row-sub">'+html(meta.name)+'</div>'+
        '<div class="search-excerpt" id="hit-'+i+'"></div></div><span class="chevron">›</span></a>';
    }).join('');
    box().innerHTML=searchFilters()+'<p class="small muted">'+all.length+' paragrafer'+(all.length>hits.length?' · visar de '+hits.length+' mest relevanta':'')+'</p><div class="card-list">'+rows+'</div>';
    // Utdrag fylls i när respektive lagtext har lästs in.
    hits.forEach((h,i)=>loadLaw(h.sfs).then(doc=>{
      const el=$('#hit-'+i);if(!el||epoch!==state.searchEpoch)return;
      const ch=doc.chapters.find(c=>c.number===h.chapter),item=ch&&ch.items.find(x=>x.type==='para'&&String(x.number)===h.number);
      if(item)el.innerHTML=window.LagbokIndex.snippet(lawModel.resolve(item).current.text,result.tokens,html);
    }).catch(()=>{}));
  }
  function onSearch(val){
    state.query=val;
    const r=route();
    if(r.page==='fap'){
      const box=$('#fap-results');if(box)box.innerHTML=fapResults(state.fap.filter(f=>norm([f.name,f.id,f.code,(f.tags||[]).join(' ')].join(' ')).includes(norm(val))));
      return;
    }
    const target=$('#search-results'),directory=$('#catalog-directory');if(!target)return;
    const active=!!val.trim();if(directory)directory.hidden=active;
    if(!active){target.innerHTML='';state.searchEpoch++;updateSuggestions();return;}
    target.innerHTML=resultsHtml(val);updateSuggestions();
    const epoch=++state.searchEpoch;
    if(findDirect(val)){const box=$('#text-results');if(box)box.innerHTML='<p class="small muted">Tryck Enter för att öppna lagrummet direkt.</p>';return;}
    setTimeout(()=>{if(state.searchEpoch===epoch)populateTextResults(val,epoch);},220);
  }
  async function lawPage(r){
    const meta=lawById(r.sfs);
    if(!meta) return '<div class="page"><h1>Okänd författning</h1><p>Författningen finns inte i katalogen.</p></div>';
    const data=await loadLaw(meta.sfs);
    if(r.chapter==null) {
      if(!hasRealChapters(data)) return chapterReader(meta,data,'0');
      return chapterList(meta,data);
    }
    return chapterReader(meta,data,r.chapter);
  }
  async function render(reset,keep){
    const r=route();state.current=r;
    if(r.page==='law'&&pref.focusReader==='on')state.focus=true;
    document.documentElement.dataset.focus=(state.focus&&r.page==='law')?'true':'false';
    const tab = ['catalog','saved'].includes(r.page)?r.page:null;
    $$('.bottom-nav button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');});
    $('#back').hidden=['home','catalog','search','saved'].includes(r.page);
    hideHighlightBar();
    $('#toc-button').hidden=true;
    $('#in-law-search').hidden=false;
    const meta=lawById(r.sfs);
    $('#top-title').textContent = r.page==='law'?(meta?meta.name:'Lagbok'):({home:'Lagbok',catalog:'Lagbok',search:'Lagbok',saved:'Sparat',fap:r.sfs?'FAP':'Polisens FAP',settings:'Inställningar',about:'Om',collection:'Samling',upcoming:'Kommande ändringar'}[r.page]||'Lagbok');
    if(r.page!=='law')state.returnStack=[];
    else while(state.returnStack.length&&state.returnStack[state.returnStack.length-1].hash===location.hash)state.returnStack.pop();
    let markup;
    switch(r.page) {
      case 'home': markup=catalogPage();break;
      case 'catalog': markup=catalogPage();break;
      case 'search': markup=searchPage();break;
      case 'saved': markup=savedPage();break;
      case 'fap': markup=r.sfs?fapReader(r.sfs):fapPage();break;
      case 'settings': markup=settingsPage();break;
      case 'about': markup=aboutPage();break;
      case 'collection': markup=await collectionPage(r.sfs);break;
      case 'upcoming': markup=await upcomingPage();break;
      case 'law':
        if(!state.laws.has(r.sfs))view.innerHTML=skeleton();
        try {markup=await lawPage(r);}
        catch(e) {
          markup='<div class="page"><h1 class="page-title">'+html(meta?meta.name:'Lagtext')+'</h1>'+
            '<div class="notice">Fullständig lagtext är ännu inte tillgänglig i appens datakatalog. Inga ofullständiga utdrag visas som om de vore kompletta.</div>'+
            '<a class="button primary" href="'+attr(sourceUrl(r.sfs))+'" target="_blank" rel="noopener noreferrer">Läs aktuell text hos Riksdagen ↗</a>'+
            '<p class="small muted">Importprocessen publicerar författningarna som separata versionshanterade filer.</p></div>';
        }
        break;
      default: markup=home();
    }
    if(state.current!==r)return;
    view.innerHTML=markup+(r.page==='law'?returnChip():'');
    animateView(keep?'':state.navDir);state.navDir='';
    applyHighlights();applySearchMarks();clearNewHighlight();
    if(r.page==='law'&&meta)addRecent(meta.sfs+(r.chapter==null?'':'|'+r.chapter)+(r.paragraph?'|'+r.paragraph:''));
    if(keep){/* Omritning på plats: renderKeep återställer scrollposition. */}
    else if(r.page==='law'&&r.paragraph) {
      const remembered=!reset&&Object.prototype.hasOwnProperty.call(state.positions,location.hash)?state.positions[location.hash]:null;
      requestAnimationFrame(()=>{
        if(remembered!==null){view.scrollTop=remembered;return;}
        const key=CSS.escape(searchCore.paraKey(r.paragraph)),target=$('#p-'+key);
        if(!target){toast('Lagrummet finns inte i den importerade texten.');return;}
        const heading=$('#g-'+key);
        (heading||target).scrollIntoView({block:'start',behavior:'instant'});
        // Diskret markering av paragrafnumret, bara när man kommer hit via länk, sökning eller innehåll.
        if(reset&&target.classList&&target.classList.add){target.classList.add('is-target');setTimeout(()=>target.classList.remove('is-target'),900);}
      });
    } else if(reset){view.scrollTop=0;}
    else {view.scrollTop=state.positions[location.hash]||0;}
    if((r.page==='catalog'||r.page==='search'||r.page==='home'||(r.page==='fap'&&!r.sfs))&&state.query) onSearch(state.query);
    if(r.page==='settings')offlineStatus();
    if(r.page==='saved')fillWatchUpdates();
    updateNavBadge();
  }
  function lawSearchResults(doc,meta,q) {
    const query=norm(q);
    if(query.length<2)return '<div class="empty">Skriv ett sökord eller en paragraf.</div>';
    const hits=[];
    for(const ch of doc.chapters) {
      for(const item of ch.items||[]) {
        if(item.type!=='para')continue;
        const text=searchText(item);
        const needle=norm(text);
        if(needle.includes(query)||norm(item.number+' §').includes(query)) {
          const start=Math.max(0,needle.indexOf(query)-60);
          hits.push({ch,item,preview:text.slice(start,start+185)});
          if(hits.length>=100)break;
        }
      }
      if(hits.length>=100)break;
    }
    if(!hits.length)return '<div class="empty">Inga sökträffar i denna författning.</div>';
    return '<p class="small muted">'+hits.length+(hits.length===100?'+':'')+' träffar</p><div class="card-list">'+
      hits.slice(0,45).map(x=>listRow((x.ch.number==='0'?'':x.ch.number+' kap. ')+x.item.number+' §',x.preview,urlFor(meta.sfs,x.ch.number,x.item.number))).join('')+
      '</div>'+(hits.length>45?'<p class="small muted">Visar de första 45 träffarna. Skriv fler ord för att avgränsa.</p>':'');
  }
  // Snabbhopp: skriv t.ex. "rb 23 8b" eller "fuk 13" från vilken vy som helst.
  function quickJump(){
    const r=route(),meta=r.page==='law'?lawById(r.sfs):null;
    showSheet('<div class="sheet-title">Gå till eller sök <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<form id="jump-form" class="searchbox">'+iconSearch()+'<input id="jump-query" type="search" enterkeyhint="go" autocomplete="off" spellcheck="false" placeholder="T.ex. rb 23 8b, fuk 13 eller ett ord'+(meta?' i '+html(meta.name):'')+'"></form>'+
      '<div id="jump-results"><p class="small muted">Skriv en förkortning och ett lagrum, så öppnas det direkt.'+(meta?' Ord söks i '+html(meta.name)+'.':'')+'</p></div>');
  }
  function jumpResults(q){
    const r=route(),meta=r.page==='law'?lawById(r.sfs):null,doc=meta&&state.laws.get(r.sfs);
    const direct=q.trim()?findDirect(q):null;
    let out=direct?'<div class="card-list"><a class="list-row" data-quick="'+attr(q)+'" href="'+attr(quickUrl(direct))+'"><div class="grow"><div class="row-title">'+html(quickLabel(direct))+'</div><div class="row-sub">Öppna direkt (Enter)</div></div><span class="chevron">›</span></a></div>':'';
    if(!direct&&doc&&norm(q).length>=2)out+=lawSearchResults(doc,meta,q);
    if(!direct&&norm(q).length>=2)out+='<div class="card-list"><a class="list-row" href="#/catalog" data-action="jump-all" data-q="'+attr(q)+'"><div class="grow"><div class="row-title">Sök ”'+html(q)+'” i hela lagboken</div></div><span class="chevron">›</span></a></div>';
    return out||'<p class="small muted">Skriv en förkortning och ett lagrum, så öppnas det direkt.</p>';
  }
  function findWithinLaw() {
    const r=route(),meta=lawById(r.sfs),doc=state.laws.get(r.sfs);
    if(!doc||!meta)return toast('Lagtexten är ännu inte inläst.');
    showSheet('<div class="sheet-title">Sök i '+html(meta.name)+' <button class="icon-button" data-action="close">×</button></div>'+
      '<div class="searchbox">'+iconSearch()+'<input id="local-query" type="search" placeholder="Sök i alla kapitel" autocomplete="off"></div>'+
      '<div id="local-results"><div class="empty">Sök bland samtliga paragrafer i författningen.</div></div>');
  }
  function toc() {
    const r=route(),meta=lawById(r.sfs);
    if(!meta)return;
    loadLaw(r.sfs).then(data=>{
      showSheet(tocHtml(meta,data),false);
      sheet.dataset.kind='toc';
      requestAnimationFrame(()=>{
        const selected=$('.toc-current',sheet)||$('.toc-current-chapter',sheet);
        if(selected&&selected.scrollIntoView)selected.scrollIntoView({block:'center',behavior:'instant'});
      });
    }).catch(()=>toast('Innehållsförteckningen kunde inte läsas.'));
  }
  function note(key) {
    closeSheet();
    const [sfs,cap,num]=key.split('|'),r=route();
    // Anteckningen skrivs direkt under paragrafen i läsvyn.
    state.editingNote=key;
    const here=r.page==='law'&&r.sfs===sfs&&String(r.chapter)===String(cap);
    const focus=()=>{const f=$('textarea.note-input');if(f){f.focus();const el=f.closest('.paragraph');if(el&&el.scrollIntoView)el.scrollIntoView({block:'nearest'});}};
    if(here)renderKeep().then(focus);
    else{navigate(urlFor(sfs,cap,searchCore.paraKey(num)));setTimeout(focus,350);}
  }
  function saveNote(key,value,quiet){
    const before=pref.notes[key]||'';
    const t=String(value||'').trim();
    if(t)pref.notes[key]=t;else delete pref.notes[key];
    savePrefs();
    if(!quiet&&before&&!t)toast('Anteckningen är borttagen',()=>{pref.notes[key]=before;savePrefs();renderKeep();});
  }
  function menuRow(action,key,label,icon,extra){
    return '<button type="button" class="list-row sheet-menu-row" data-action="'+action+'" data-key="'+attr(key)+'"'+(extra||'')+'><span class="grow"><span class="row-title">'+label+'</span></span><span class="chevron">'+icon+'</span></button>';
  }
  function paraMenu(key){
    const [id,cap,num]=key.split('|');
    showSheet('<div class="sheet-title">'+html(favTitle(key))+
      '<button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<div class="card-list">'+
      menuRow('copy-ref',key,'Kopiera hänvisning <span class="muted">('+html(shortRef(id,cap,num))+')</span>','⧉')+
      menuRow('copy',key,'Kopiera lagtext med hänvisning','⧉')+
      menuRow('share',key,'Dela länk till lagrummet','↗')+
      menuRow('fav',key,pref.favourites.includes(key)?'Ta bort från favoriter':'Spara som favorit','☆')+
      menuRow('collect',key,'Lägg till i samling','▤')+
      menuRow('note',key,pref.notes[key]?'Redigera anteckning':'Skriv anteckning','✎')+
      menuRow('backlinks',key,'Visa vad som hänvisar hit','↩')+'</div>'+
      '<p class="small muted sheet-hint">Tips: markera text i paragrafen för att stryka under den.</p>');
  }
  function shortRef(sfs,chapter,para){
    const meta=lawById(sfs),name=meta?((meta.aliases||[]).find(a=>/^[A-ZÅÄÖ][A-Za-zÅÄÖåäö]{1,5}$/.test(a))||meta.name):sfs;
    return name+' '+(chapter&&chapter!=='0'?chapter+(para?':'+para:' kap.'):(para?para+' §':''));
  }
  // Hänvisningar öppnas direkt. En knapp tar läsaren tillbaka till stället där länken fanns.
  function followRef(link){
    const r=route(),from=link.closest&&link.closest('.paragraph');
    const para=from&&from.dataset?from.dataset.paragraph:r.paragraph;
    state.returnStack.push({hash:location.hash,label:shortRef(r.sfs,r.chapter,para)});
    state.returnStack=state.returnStack.slice(-20);
    navigate(urlFor(link.dataset.refSfs,link.dataset.refChapter,link.dataset.refPara));
  }
  function returnChip(){
    const top=state.returnStack[state.returnStack.length-1];
    if(!top||top.hash===location.hash)return '';
    return '<button type="button" class="return-chip" data-action="return">‹ Tillbaka till '+html(top.label)+'</button>';
  }
  async function changeReaderMode(mode){
    if(!['standard','compact'].includes(mode))return;
    pref.readingMode=mode;savePrefs();applyPrefs();
    const position=view.scrollTop;
    await render(false);view.scrollTop=position;
  }
  async function toggleFocus(){
    const position=view.scrollTop;
    state.focus=!state.focus;
    pref.focusReader=state.focus?'on':'off';savePrefs();
    await render(false);view.scrollTop=position;
  }
  async function copyParagraph(key) {
    const [id,cap,num]=key.split('|');
    try {
      const doc=await loadLaw(id);
      const ch=doc.chapters.find(x=>x.number===cap);
      const p=ch && ch.items.find(x=>x.type==='para'&&x.number===num);
      if(!p)throw Error('Saknas');
      const text=(cap==='0'?'':cap+' kap. ')+num+' § '+lawById(id).name+' (SFS '+id+')\n\n'+lawModel.resolve(p).current.text;
      if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {const input=document.createElement('textarea');input.value=text;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();}
      toast('Lagrum kopierat');
    }catch(_){toast('Det gick inte att kopiera paragrafen');}
  }
  // ---------- 0.6: kopiera, dela och samlingar ----------
  async function copyText(text,message){
    try{
      if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);
      else{const input=document.createElement('textarea');input.value=text;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();}
      closeSheet();toast(message);
    }catch(_){toast('Det gick inte att kopiera');}
  }
  function shareRef(key){
    const [id,cap,num]=key.split('|'),url=location.href.split('#')[0]+urlFor(id,cap,num);
    const title=shortRef(id,cap,num)+' – '+((lawById(id)||{}).name||'');
    if(navigator.share){navigator.share({title,url}).catch(()=>{});closeSheet();}
    else copyText(url,'Länk kopierad');
  }
  function collectionById(id){return pref.collections.find(c=>c.id===id);}
  function collectSheet(key){
    showSheet('<div class="sheet-title">Lägg till i samling <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<p class="small muted">'+html(favTitle(key))+'</p><div class="card-list">'+
      pref.collections.map(c=>'<button type="button" class="list-row sheet-menu-row" data-action="collect-into" data-id="'+attr(c.id)+'" data-key="'+attr(key)+'">'+
        '<span class="grow"><span class="row-title">'+html(c.name)+'</span><span class="row-sub">'+c.items.length+' paragrafer'+(c.items.includes(key)?' · finns redan':'')+'</span></span><span class="chevron">+</span></button>').join('')+
      '</div><div class="field"><label for="collection-name">Ny samling</label><input id="collection-name" type="text" maxlength="60" placeholder="T.ex. LOB-ingripande"></div>'+
      '<button type="button" class="button primary" data-action="collect-new" data-key="'+attr(key)+'">Skapa och lägg till</button>',false);
  }
  function addToCollection(id,key){
    const c=collectionById(id);if(!c)return;
    if(!c.items.includes(key))c.items.push(key);
    savePrefs();closeSheet();toast('Tillagd i ”'+c.name+'”');
  }
  // Samlingen som ren text med hänvisningar, för att dela eller klistra in någon annanstans.
  async function collectionText(id){
    const c=collectionById(id);if(!c)return;
    const parts=[c.name,''];
    for(const key of c.items){
      const [sfs,cap,num]=key.split('|'),meta=lawById(sfs);
      try{const {item}=findPara(await loadLaw(sfs),cap,num);if(!item)continue;
        parts.push(shortRef(sfs,cap,num)+' '+(meta?meta.name:'')+' (SFS '+sfs+')',lawModel.resolve(item).current.text);
        if(pref.notes[key])parts.push('Anteckning: '+pref.notes[key]);parts.push('');}catch(_){}
    }
    const text=parts.join('\n')+'\nKälla: Sveriges riksdag. Kontrollera gällande lydelse.';
    if(navigator.share)navigator.share({title:c.name,text}).catch(()=>{});else copyText(text,'Samlingen är kopierad som text');
  }
  function removeFromCollection(id,key){
    const c=collectionById(id);if(!c)return;
    c.items=c.items.filter(x=>x!==key);savePrefs();renderKeep();
  }
  function renameCollection(id){
    const c=collectionById(id);if(!c)return;
    const name=window.prompt('Nytt namn på samlingen',c.name);
    if(name&&name.trim()){c.name=name.trim().slice(0,60);savePrefs();renderKeep();}
  }
  function deleteCollection(id){
    const c=collectionById(id);if(!c||!window.confirm('Ta bort samlingen ”'+c.name+'”? Paragraferna påverkas inte.'))return;
    pref.collections=pref.collections.filter(x=>x!==c);savePrefs();navigate('#/saved',true);
  }
  function findPara(doc,cap,num){
    const ch=doc.chapters.find(c=>String(c.number)===String(cap));
    return {ch,item:ch&&ch.items.find(x=>x.type==='para'&&searchCore.paraKey(x.number)===searchCore.paraKey(num))};
  }
  async function collectionPage(id){
    const c=collectionById(id);
    if(!c)return '<div class="page"><div class="empty">Samlingen finns inte längre.</div></div>';
    const parts=await Promise.all(c.items.map(async key=>{
      const [sfs,cap,num]=key.split('|'),meta=lawById(sfs);
      try{
        const {ch,item}=findPara(await loadLaw(sfs),cap,num);
        if(!meta||!item)throw Error('saknas');
        return '<section class="collection-item"><div class="collection-head"><a data-link="1" href="'+attr(favRoute(key))+'">'+html(shortRef(sfs,cap,num))+' · '+html(meta.name)+' ›</a>'+
          '<button type="button" class="link-button" data-action="collect-remove" data-id="'+attr(c.id)+'" data-key="'+attr(key)+'">Ta bort</button></div>'+paraHtml(meta,ch,item)+'</section>';
      }catch(_){
        return '<section class="collection-item"><div class="notice">'+html(favTitle(key))+' finns inte i den importerade texten. <button type="button" class="link-button" data-action="collect-remove" data-id="'+attr(c.id)+'" data-key="'+attr(key)+'">Ta bort</button></div></section>';
      }
    }));
    return '<div class="page collection-page"><span class="source-label">Samling</span><h1 class="page-title">'+html(c.name)+'</h1>'+
      '<div class="actions"><button type="button" class="button" data-action="collection-rename" data-id="'+attr(c.id)+'">Byt namn</button>'+
      '<button type="button" class="button" data-action="collection-text" data-id="'+attr(c.id)+'">Dela som text</button>'+
      '<button type="button" class="button" data-action="collection-print" data-id="'+attr(c.id)+'">Skriv ut / PDF</button>'+
      '<button type="button" class="button" data-action="collection-delete" data-id="'+attr(c.id)+'">Ta bort samling</button></div>'+
      (parts.length?'<div class="law-reader collection-reader">'+parts.join('')+'</div>':'<div class="empty" style="margin-top:18px">Samlingen är tom. Lägg till paragrafer via menyn ⋯ vid en paragraf.</div>')+'</div>';
  }
  // ---------- 0.6: hänvisat från ----------
  async function backlinksSheet(key){
    const [sfs,cap,num]=key.split('|');
    try{await loadLaw(sfs);}catch(_){}
    const list=(state.backlinks.get(sfs)||{})[cap+'|'+searchCore.paraKey(num)]||[];
    const rows=items=>'<div class="card-list">'+items.map(([s,c,n])=>listRow(shortRef(s,c,n)+((tocModel.curatedTitle(s,c,n))?' · '+tocModel.curatedTitle(s,c,n):''),(lawById(s)||{}).name||s,urlFor(s,c,searchCore.paraKey(n)))).join('')+'</div>';
    const reg=list.filter(e=>e[3]==='föreskrift'),comp=list.filter(e=>e[3]==='kompletterar'),refs=list.filter(e=>!e[3]||e[3]==='ref');
    showSheet('<div class="sheet-title">Kopplingar för '+html(shortRef(sfs,cap,num))+' <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      (reg.length?'<div class="section-title regulation-title">Kompletterande föreskrifter</div><p class="small muted">Förordningsparagrafer som fyller ut bestämmelsen.</p>'+rows(reg):'')+
      (comp.length?'<div class="section-title regulation-title">Kompletterar</div><p class="small muted">Lagparagrafer som den här föreskriften fyller ut.</p>'+rows(comp):'')+
      (refs.length?'<div class="section-title">Hänvisar hit</div>'+rows(refs):'')+
      (!list.length?'<div class="empty">Inga kopplingar till andra paragrafer.</div>':''),false);
  }
  // ---------- 0.6: ändringsbevakning ----------
  function watchedLaws(){return Object.keys(pref.watch).filter(lawById);}
  function changedLaws(){return watchedLaws().filter(sfs=>state.status[sfs]&&state.status[sfs].hash!==pref.watch[sfs].hash);}
  function updateNavBadge(){
    const n=changedLaws().length,b=$('.bottom-nav button[data-tab="saved"]');
    if(b&&b.classList)b.classList.toggle('has-updates',n>0);
  }
  async function toggleWatch(sfs){
    if(pref.watch[sfs]){delete pref.watch[sfs];savePrefs();toast('Bevakningen är avslutad');renderKeep();return;}
    try{const doc=await loadLaw(sfs);pref.watch[sfs]=Object.assign(lawModel.snapshot(doc),{at:lawModel.today()});savePrefs();
      toast('Du får se ändringar i '+((lawById(sfs)||{}).name||sfs)+' under Sparat');renderKeep();}
    catch(_){toast('Lagen kunde inte läsas just nu');}
  }
  async function acknowledge(sfs){
    try{const doc=await loadLaw(sfs);pref.watch[sfs]=Object.assign(lawModel.snapshot(doc),{at:lawModel.today()});savePrefs();renderKeep();}catch(_){}
  }
  function watchSummary(){
    const laws=watchedLaws();
    if(!laws.length)return '<div class="empty">Bevaka en lag via knappen ”Bevaka ändringar” på lagens startsida. Lagar där du sparat favoriter bevakas automatiskt.</div>';
    return '<div id="watch-updates"><p class="small muted">Kontrollerar '+laws.length+' bevakade författningar …</p></div><div id="watch-upcoming"></div>';
  }
  async function fillWatchUpdates(){
    const box=$('#watch-updates');if(!box)return;
    const laws=watchedLaws(),rows=[];
    for(const sfs of laws){
      const meta=lawById(sfs);
      if(state.status[sfs]&&state.status[sfs].hash===pref.watch[sfs].hash){rows.push({sfs,meta,clean:true});continue;}
      try{const d=lawModel.diff(pref.watch[sfs],await loadLaw(sfs));rows.push({sfs,meta,d,clean:!d.added.length&&!d.changed.length&&!d.removed.length});}
      catch(_){rows.push({sfs,meta,error:true});}
    }
    if(!$('#watch-updates'))return;
    const changed=rows.filter(r=>!r.clean&&!r.error);
    const link=(sfs,k)=>{const [c,n]=k.split('|');return '<a data-link="1" href="'+attr(urlFor(sfs,c,searchCore.paraKey(n)))+'">'+html(shortRef(sfs,c,n).replace(/^\S+\s/,''))+'</a>';};
    $('#watch-updates').innerHTML=(changed.length?'<div class="watch-news"><div class="watch-news-title">Nytt sedan sist</div>'+changed.map(r=>
      '<div class="watch-law"><div class="row-title">'+html(r.meta.name)+'</div>'+
      (r.d.changed.length?'<p class="small">Ändrade: '+r.d.changed.slice(0,12).map(k=>link(r.sfs,k)).join(', ')+(r.d.changed.length>12?' …':'')+'</p>':'')+
      (r.d.added.length?'<p class="small">Nya: '+r.d.added.slice(0,12).map(k=>link(r.sfs,k)).join(', ')+(r.d.added.length>12?' …':'')+'</p>':'')+
      (r.d.removed.length?'<p class="small">Borttagna: '+r.d.removed.slice(0,12).map(k=>html(k.replace('|',':'))).join(', ')+'</p>':'')+
      '<button type="button" class="link-button" data-action="watch-ack" data-key="'+attr(r.sfs)+'">Markera som läst</button></div>').join('')+'</div>':
      '<p class="small muted">Inga ändringar sedan du senast tittade i '+(rows.length===1?'den bevakade författningen':rows.length+' bevakade författningar')+'.</p>')+
      '<div class="chips">'+rows.map(r=>'<a class="chip" data-link="1" href="'+attr(urlFor(r.sfs))+'">'+html(shortRef(r.sfs,'0',null).trim())+'</a>').join('')+'</div>';
    const up=await upcomingFor(laws);
    const target=$('#watch-upcoming');
    if(target)target.innerHTML=up.length?'<div class="watch-news-title">Kommande ändringar i det du bevakar</div>'+timeline(up.slice(0,40))+(up.length>40?'<p class="small muted"><a href="#/upcoming" data-link="1">Visa alla '+up.length+'</a></p>':''):'';
    updateNavBadge();
  }
  async function upcomingFor(laws){
    if(!state.upcoming){try{state.upcoming=await fetchJson('data/index/upcoming.json');}catch(_){state.upcoming=[];}}
    const today=lawModel.today(),future=state.upcoming.filter(u=>!u[0]||u[0]>today);
    return laws?future.filter(u=>laws.includes(u[1])):future;
  }
  function timeline(list){
    const groups=new Map();
    for(const u of list){const k=u[0]||'';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(u);}
    return '<div class="timeline">'+[...groups].map(([date,items])=>'<div class="timeline-group"><div class="timeline-date">'+
      html(date?lawModel.formatDate(date):'Datum ej bestämt')+'<span>'+items.length+(items.length===1?' paragraf':' paragrafer')+'</span></div><div class="chips">'+
      items.map(([,s,c,n])=>'<a class="chip" data-link="1" href="'+attr(urlFor(s,c,searchCore.paraKey(n)))+'">'+html(shortRef(s,c,n))+'</a>').join('')+'</div></div>').join('')+'</div>';
  }
  async function upcomingPage(){
    const future=await upcomingFor(null);
    return '<div class="page"><h1 class="page-title">Kommande ändringar</h1><p class="intro">Paragrafer i lagboken med en ny lydelse som ännu inte har trätt i kraft, enligt Riksdagens markeringar.</p>'+
      (future.length?timeline(future):'<div class="empty">Inga kommande ändringar är kända.</div>')+footer()+'</div>';
  }
  // ---------- 0.6: överstrykningar ----------
  let hlBar=null;
  function highlightBar(){
    if(hlBar)return hlBar;
    hlBar=document.createElement('div');hlBar.className='hl-bar';hlBar.hidden=true;
    hlBar.innerHTML=highlights.COLORS.map(([c,label])=>'<button type="button" class="hl-swatch hl-'+c+'" data-action="hl-add" data-color="'+c+'" aria-label="Stryk under med '+label.toLowerCase()+'"></button>').join('')+
      '<button type="button" class="hl-note-button" data-action="hl-add-note">Anteckning</button>';
    // Behåll markeringen när knapparna trycks på iPhone.
    hlBar.addEventListener('pointerdown',e=>e.preventDefault());hlBar.addEventListener('mousedown',e=>e.preventDefault());
    document.body.appendChild(hlBar);return hlBar;
  }
  function hideHighlightBar(){if(hlBar)hlBar.hidden=true;state.pendingHighlight=null;}
  function onSelection(){
    const sel=window.getSelection&&window.getSelection();
    if(!sel||!sel.rangeCount||sel.isCollapsed){hideHighlightBar();return;}
    const range=sel.getRangeAt(0),node=range.commonAncestorContainer;
    const el=node.nodeType===1?node:node.parentElement;
    const content=el&&el.closest&&el.closest('.paragraph-content');
    const article=content&&content.parentElement;
    if(!content||!article||!article.classList.contains('paragraph')||!view.contains(article)){hideHighlightBar();return;}
    const pos=highlights.offsets(content,range);
    if(!pos){hideHighlightBar();return;}
    const quote=content.textContent.slice(pos.start,pos.end);
    if(!quote.trim()){hideHighlightBar();return;}
    state.pendingHighlight={key:article.dataset.key,start:pos.start,end:pos.end,quote};
    highlightBar().hidden=false;
  }
  function addHighlight(color,withNote){
    const p=state.pendingHighlight;if(!p)return;
    const h=createHighlight(p.key,p.start,p.end,p.quote,color);
    const sel=window.getSelection&&window.getSelection();if(sel)sel.removeAllRanges();
    hideHighlightBar();renderKeep().then(()=>{if(withNote)highlightSheet(p.key,h.id,true);});
  }
  function createHighlight(key,start,end,quote,color){
    const h={id:Date.now().toString(36),start,end,quote,color,note:'',created:lawModel.today()};
    (pref.highlights[key]=pref.highlights[key]||[]).push(h);pref.lastColor=color;savePrefs();state.newHighlight=h.id;
    toast('Markerat',()=>{pref.highlights[key]=(pref.highlights[key]||[]).filter(x=>x.id!==h.id);if(!pref.highlights[key].length)delete pref.highlights[key];savePrefs();renderKeep();});
    return h;
  }
  // Liten ruta vid markeringen: färg, anteckning och ta bort.
  function highlightSheet(key,id,openNote){
    const h=(pref.highlights[key]||[]).find(x=>x.id===id);if(!h)return;
    const mark=document.querySelector&&document.querySelector('mark.hl[data-hl="'+id+'"]');
    if(mark&&mark.getBoundingClientRect&&window.innerHeight){
      closePopover();
      const pop=document.createElement('div');pop.className='hl-pop';pop.setAttribute('role','dialog');
      pop.innerHTML='<div class="hl-pop-row">'+highlights.COLORS.map(([c,label])=>'<button type="button" class="hl-swatch hl-'+c+(h.color===c?' selected':'')+'" data-action="hl-pop-color" data-color="'+c+'" data-id="'+attr(id)+'" data-key="'+attr(key)+'" aria-label="'+label+'"></button>').join('')+
        '<button type="button" class="hl-pop-button" data-action="hl-pop-note">✎ Anteckning</button><button type="button" class="hl-pop-button danger" data-action="hl-pop-remove" data-id="'+attr(id)+'" data-key="'+attr(key)+'" aria-label="Ta bort markering">Ta bort</button></div>'+
        '<div class="hl-pop-note"'+(openNote||h.note?'':' hidden')+'><textarea rows="2" placeholder="Anteckning till markeringen …">'+html(h.note||'')+'</textarea>'+
        '<button type="button" class="button primary" data-action="hl-pop-save" data-id="'+attr(id)+'" data-key="'+attr(key)+'">Spara</button></div>';
      document.body.appendChild(pop);
      const r=mark.getBoundingClientRect(),w=Math.min(340,window.innerWidth-24);
      pop.style.width=w+'px';
      pop.style.left=Math.max(12,Math.min(window.innerWidth-w-12,r.left+r.width/2-w/2))+'px';
      const below=r.bottom+10,height=pop.offsetHeight||120;
      pop.style.top=(below+height>window.innerHeight-80?Math.max(60,r.top-height-10):below)+'px';
      if(openNote){const f=pop.querySelector('textarea');if(f)f.focus();}
      return;
    }
    showSheet('<div class="sheet-title">Markering <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<p class="small muted">'+html(favTitle(key))+'</p><blockquote class="hl-quote hl-'+attr(h.color)+'">'+html(h.quote)+'</blockquote>'+
      '<div class="hl-colors">'+highlights.COLORS.map(([c,label])=>'<button type="button" class="hl-swatch hl-'+c+(h.color===c?' selected':'')+'" data-action="hl-color" data-color="'+c+'" data-id="'+attr(id)+'" data-key="'+attr(key)+'" aria-label="'+label+'"></button>').join('')+'</div>'+
      '<div class="field"><label for="hl-note">Anteckning till markeringen</label><textarea id="hl-note" placeholder="Valfri anteckning …">'+html(h.note||'')+'</textarea></div>'+
      '<div class="actions"><button type="button" class="button primary" data-action="hl-save-note" data-id="'+attr(id)+'" data-key="'+attr(key)+'">Spara</button>'+
      '<button type="button" class="button" data-action="hl-remove" data-id="'+attr(id)+'" data-key="'+attr(key)+'">Ta bort markering</button></div>',false);
  }
  function closePopover(){$$('.hl-pop').forEach(x=>x.remove());}
  function updateHighlight(key,id,changes){
    const h=(pref.highlights[key]||[]).find(x=>x.id===id);if(!h)return;
    Object.assign(h,changes);savePrefs();closeSheet();closePopover();renderKeep();if('note' in changes)toast('Anteckningen är sparad');
  }
  function removeHighlight(key,id){
    const list=pref.highlights[key]||[],removed=list.find(x=>x.id===id);
    pref.highlights[key]=list.filter(x=>x.id!==id);
    if(!pref.highlights[key].length)delete pref.highlights[key];
    savePrefs();closeSheet();closePopover();renderKeep();
    if(removed)toast('Markeringen är borttagen',()=>{(pref.highlights[key]=pref.highlights[key]||[]).push(removed);savePrefs();renderKeep();});
  }
  // ---------- 0.7: penna – tryck på första och sista ordet för att markera ----------
  let penBar=null;
  function updatePenBar(){
    if(!penBar){
      penBar=document.createElement('div');penBar.className='hl-bar pen-bar';
      document.body.appendChild(penBar);
    }
    penBar.hidden=!state.pen;
    penBar.innerHTML='<span class="pen-hint">'+(state.penAnchor?'Tryck på sista ordet':'Tryck på första ordet')+'</span>'+
      highlights.COLORS.map(([c,label])=>'<button type="button" class="hl-swatch hl-'+c+(pref.lastColor===c?' selected':'')+'" data-action="pen-color" data-color="'+c+'" aria-label="'+label+'"></button>').join('')+
      '<button type="button" class="hl-note-button" data-action="pen-done">Klar</button>';
  }
  function togglePen(){
    state.pen=!state.pen;state.penAnchor=null;
    document.documentElement.dataset.pen=state.pen?'on':'off';
    hideHighlightBar();updatePenBar();renderKeep();
    if(state.pen)toast('Penna på: tryck på första och sista ordet');
  }
  function caretAt(x,y){
    if(document.caretRangeFromPoint)return document.caretRangeFromPoint(x,y);
    if(document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y);if(!p)return null;const r=document.createRange();r.setStart(p.offsetNode,p.offset);return r;}
    return null;
  }
  // Ordets gränser runt en tryckpunkt, som teckenpositioner i paragrafens text.
  function wordAt(content,e){
    const caret=caretAt(e.clientX,e.clientY);
    if(!caret||!content.contains(caret.startContainer))return null;
    const probe=document.createRange();probe.setStart(caret.startContainer,caret.startOffset);probe.setEnd(caret.startContainer,caret.startOffset);
    let pos=null,offset=0;
    for(const node of highlights.textNodes(content)){if(node===caret.startContainer){pos=offset+caret.startOffset;break;}offset+=node.data.length;}
    if(pos==null)return null;
    const text=content.textContent,isWord=c=>/[\p{L}\p{N}§-]/u.test(c||'');
    let start=pos,end=pos;
    if(!isWord(text[start])&&isWord(text[start-1]))start--;
    while(start>0&&isWord(text[start-1]))start--;
    while(end<text.length&&isWord(text[end]))end++;
    return end>start?{start,end}:null;
  }
  function penTap(e,content){
    const article=content.parentElement,key=article.dataset.key,w=wordAt(content,e);
    if(!w)return;
    const a=state.penAnchor;
    if(!a||a.key!==key){
      state.penAnchor={key,start:w.start,end:w.end};
      $$('mark.pen-anchor').forEach(m=>{const p=m.parentNode;while(m.firstChild)p.insertBefore(m.firstChild,m);m.remove();});
      highlights.wrap(content,w.start,w.end,()=>{const m=document.createElement('mark');m.className='pen-anchor';return m;});
      updatePenBar();return;
    }
    const start=Math.min(a.start,w.start),end=Math.max(a.end,w.end);
    state.penAnchor=null;
    $$('mark.pen-anchor').forEach(m=>{const p=m.parentNode;while(m.firstChild)p.insertBefore(m.firstChild,m);m.remove();});
    const text=content.textContent;
    createHighlight(key,start,end,text.slice(start,end),pref.lastColor||'yellow');
    renderKeep().then(updatePenBar);
  }
  function applyHighlights(){
    if(typeof view.querySelectorAll!=='function'||!highlights)return;
    for(const article of view.querySelectorAll('article.paragraph[data-key]')){
      const list=pref.highlights[article.dataset.key];if(!list||!list.length)continue;
      const content=article.querySelector(':scope > .paragraph-content');if(!content)continue;
      const text=content.textContent;
      for(const h of list){
        const at=highlights.locate(text,h);
        if(!at){article.classList.add('has-stale-highlight');continue;}
        highlights.wrap(content,at.start,at.end,()=>{const m=document.createElement('mark');m.className='hl hl-'+h.color+(h.note?' has-note':'')+(state.newHighlight===h.id?' hl-new':'');m.dataset.hl=h.id;m.dataset.key=article.dataset.key;return m;});
      }
    }
  }
  function clearNewHighlight(){setTimeout(()=>{state.newHighlight=null;},400);}
  // Markerar sökorden i paragrafen som öppnades från en sökträff.
  function applySearchMarks(){
    const m=state.markTerms;
    if(!m||m.hash!==location.hash||typeof view.querySelector!=='function'||!highlights)return;
    const r=route(),article=r.paragraph&&$('#p-'+CSS.escape(searchCore.paraKey(r.paragraph)));
    const content=article&&article.querySelector&&article.querySelector(':scope > .paragraph-content');
    if(!content)return;
    const folded=window.LagbokIndex.fold(content.textContent),ranges=[];
    for(const t of m.tokens){const re=new RegExp('(^|[^a-z0-9])('+t+'[a-z0-9]*)','g');let x;while((x=re.exec(folded))){const s=x.index+x[1].length;ranges.push([s,s+x[2].length]);}}
    ranges.sort((a,b)=>b[0]-a[0]).forEach(([s,e])=>highlights.wrap(content,s,e,()=>{const el=document.createElement('mark');el.className='search-hit';return el;}));
  }
  // Kort övergång när en ny vy visas: in från höger framåt, från vänster bakåt, övertoning mellan flikar.
  function animateView(dir){
    if(!dir||!view.classList||typeof view.classList.remove!=='function')return;
    const cls={forward:'anim-forward',back:'anim-back',fade:'anim-fade'}[dir];if(!cls)return;
    view.classList.remove('anim-forward','anim-back','anim-fade');void view.offsetWidth;view.classList.add(cls);
    clearTimeout(animateView.t);animateView.t=setTimeout(()=>view.classList.remove(cls),320);
  }
  function skeleton(){
    const line=w=>'<span class="sk-line" style="width:'+w+'%"></span>';
    return '<div class="skeleton" aria-label="Hämtar författning" role="status"><span class="sk-title"></span>'+
      [0,1,2].map(()=>'<div class="sk-para"><span class="sk-num"></span>'+line(96)+line(92)+line(98)+line(64)+'</div>').join('')+'</div>';
  }
  function renderKeep(){const position=view.scrollTop;return Promise.resolve(render(false,true)).then(()=>{view.scrollTop=position;});}
  // ---------- 0.6: svep mellan kapitel ----------
  let swipe=null;
  function chapterStep(dir){
    const r=route(),data=state.laws.get(r.sfs);if(r.page!=='law'||!data||r.chapter==null)return;
    const i=data.chapters.findIndex(c=>c.number===r.chapter),next=data.chapters[i+dir];
    if(next){navigate(urlFor(r.sfs,next.number));toast(next.number==='0'?'':next.number+' kap.'+(next.title?' '+next.title:''));}
  }
  // Kommer ihåg var i varje författning man läste senast.
  function rememberPosition(){
    clearTimeout(rememberPosition.t);
    rememberPosition.t=setTimeout(()=>{
      const r=route();if(r.page!=='law'||!lawById(r.sfs)||r.chapter==null)return;
      pref.readPos[r.sfs]={chapter:r.chapter,para:state.visibleParagraph||r.paragraph||null};
      pref.lastRead=r.sfs;savePrefs();
    },700);
  }
  let readerScrollPending=false;
  view.addEventListener('scroll',()=>{
    if(route().page!=='law'||readerScrollPending||typeof view.querySelectorAll!=='function')return;
    readerScrollPending=true;
    requestAnimationFrame(()=>{
      readerScrollPending=false;
      const paragraphs=view.querySelectorAll('.paragraph');
      if(!paragraphs||!paragraphs.length)return;
      const top=view.getBoundingClientRect().top+80;
      for(const el of paragraphs){
        if(el.getBoundingClientRect().bottom>top){
          state.visibleParagraph=el.dataset.paragraph;
          rememberPosition();
          break;
        }
      }
    });
  },{passive:true});
  document.addEventListener('selectionchange',()=>{clearTimeout(onSelection.t);onSelection.t=setTimeout(onSelection,120);});
  // Svep från vänsterkanten för att gå tillbaka, som i iPhones egna appar.
  let edge=null;
  document.addEventListener('touchstart',e=>{
    const t=e.touches[0];
    edge=(e.touches.length===1&&t.clientX<24&&!$('#back').hidden&&sheet.hidden)?{x:t.clientX,y:t.clientY,t:Date.now()}:null;
  },{passive:true});
  document.addEventListener('touchend',e=>{
    if(!edge||!e.changedTouches.length)return;
    const t=e.changedTouches[0],dx=t.clientX-edge.x,dy=Math.abs(t.clientY-edge.y),dt=Date.now()-edge.t;edge=null;
    if(dx>70&&dy<60&&dt<700)back();
  },{passive:true});
  // Dra ned menyer och innehållsförteckning för att stänga dem.
  let drag=null;
  sheet.addEventListener('touchstart',e=>{
    const handle=e.target.closest('.sheet-title,.toc-header,.sheet-grabber');
    drag=handle&&e.touches.length===1?{y:e.touches[0].clientY,dy:0}:null;
  },{passive:true});
  sheet.addEventListener('touchmove',e=>{
    if(!drag)return;drag.dy=Math.max(0,e.touches[0].clientY-drag.y);sheet.style.transform='translateY('+drag.dy+'px)';
  },{passive:true});
  sheet.addEventListener('touchend',()=>{
    if(!drag)return;const close=drag.dy>90;drag=null;
    if(close)closeSheet();else sheet.style.transform='';
  },{passive:true});
  view.addEventListener('touchstart',e=>{
    if(route().page!=='law'||e.touches.length!==1||e.touches[0].clientX<30)return;
    swipe={x:e.touches[0].clientX,y:e.touches[0].clientY,t:Date.now()};
  },{passive:true});
  view.addEventListener('touchend',e=>{
    if(!swipe||!e.changedTouches.length)return;
    const dx=e.changedTouches[0].clientX-swipe.x,dy=e.changedTouches[0].clientY-swipe.y,dt=Date.now()-swipe.t;swipe=null;
    const sel=window.getSelection&&window.getSelection();
    if(dt<600&&Math.abs(dx)>90&&Math.abs(dy)<45&&(!sel||sel.isCollapsed))chapterStep(dx<0?1:-1);
  },{passive:true});
  view.addEventListener('input',e=>{
    if(e.target.classList&&e.target.classList.contains('note-input')){
      const k=e.target.dataset.noteKey,v=e.target.value;clearTimeout(saveNote.t);saveNote.t=setTimeout(()=>saveNote(k,v,true),400);return;
    }
    if(e.target.id==='marks-query'){state.marksQuery=e.target.value;const box=$('#marks-list');if(box)box.innerHTML=marksHtml();return;}
    if(e.target.id==='query'||e.target.id==='fap-query')onSearch(e.target.value);
  });
  view.addEventListener('submit',async e=>{
    if(e.target.id!=='global-search')return;
    e.preventDefault();
    const field=$('#query');if(!field)return;
    const val=field.value.trim();if(!val)return;
    const done=await goQuick(val);
    if(!done){onSearch(val);const sug=$('#search-suggest');if(sug)sug.hidden=true;}
    field.blur();
  });
  view.addEventListener('keydown',e=>{
    if(e.target.id==='query'&&e.key==='ArrowDown'){
      const first=$('.suggestion');if(first){e.preventDefault();first.focus();}
    }else if(e.target.classList.contains('suggestion')&&['ArrowDown','ArrowUp'].includes(e.key)){
      e.preventDefault();const list=$('.suggestion'),index=list.indexOf(e.target);
      const next=list[index+(e.key==='ArrowDown'?1:-1)];if(next)next.focus();else $('#query')?.focus();
    }
  });
  sheet.addEventListener('submit',e=>{
    if(e.target.id!=='jump-form')return;e.preventDefault();
    const q=$('#jump-query').value.trim();if(!q)return;
    goQuick(q).then(done=>{if(!done){closeSheet();state.query=q;navigate('#/catalog');}});
  });
  sheet.addEventListener('input',e=>{
    if(e.target.id==='jump-query'){$('#jump-results').innerHTML=jumpResults(e.target.value);return;}
    if(e.target.id==='local-query'){
      const r=route(),meta=lawById(r.sfs),doc=state.laws.get(r.sfs);
      if(meta&&doc)$('#local-results').innerHTML=lawSearchResults(doc,meta,e.target.value);
    }
    if(e.target.id==='toc-query'){
      const r=route(),meta=lawById(r.sfs),doc=state.laws.get(r.sfs);
      if(doc&&meta){$('#toc-results').innerHTML=tocEntries(meta,doc,r,e.target.value);$('#toc-results').scrollTop=0;}
    }
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='size'){document.documentElement.style.setProperty('--fontscale',e.target.value);const v=$('#size-value');if(v)v.textContent=Math.round(e.target.value*100)+' %';}
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='import-file'){const f=e.target.files&&e.target.files[0];if(f)importData(f);e.target.value='';return;}
    if(e.target.dataset.setting){
      const key=e.target.dataset.setting;
      pref[key]=(key==='theme'||key==='readingMode'||key==='focusReader'||key==='fontFamily')?e.target.value:Number(e.target.value);
      if(key==='focusReader')state.focus=(e.target.value==='on');
      if(key==='theme')pref.themeChosen=true;
      savePrefs();applyPrefs();toast('Inställning sparad');
    }
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.hl-pop')&&!e.target.closest('mark.hl'))closePopover();
    const close=e.target.closest('[data-action="close"]'); if(close){closeSheet();return;}
    if(state.pen&&!e.target.closest('mark.hl')){
      const content=e.target.closest('.paragraph-content');
      if(content&&content.parentElement&&content.parentElement.classList.contains('paragraph')&&view.contains(content)){e.preventDefault();penTap(e,content);return;}
    }
    const reference=e.target.closest('[data-ref]');if(reference){e.preventDefault();followRef(reference);return;}
    const quickAnchor=e.target.closest('[data-quick]');if(quickAnchor){e.preventDefault();goQuick(quickAnchor.dataset.quick);return;}
    const mark=e.target.closest('mark.hl');if(mark&&!e.target.closest('a')){highlightSheet(mark.dataset.key,mark.dataset.hl);return;}
    const anchor=e.target.closest('a[data-link]');
    if(anchor){e.preventDefault();const dest=anchor.getAttribute('href');if(dest==='#/fap')state.query='';
      const terms=anchor.dataset&&anchor.dataset.terms;state.markTerms=terms?{hash:dest,tokens:terms.split(' ')}:null;navigate(dest);return;}
    const btn=e.target.closest('[data-action]');
    if(!btn)return;
    const a=btn.dataset.action,k=btn.dataset.key;
    if(a==='clear-search'){const field=$('#query');if(field){field.value='';onSearch('');field.focus();}return;}
    if(a==='para-menu'){paraMenu(k);return;}
    if(a==='source-info'){sourceInfo();return;}
    if(a==='read-mode'){changeReaderMode(btn.dataset.mode);return;}
    if(a==='toggle-focus'){toggleFocus();return;}
    if(a==='fav')favToggle(k);
    if(a==='copy')copyParagraph(k);
    if(a==='note')note(k);
    if(a==='save-note'){
      const field=$('#note-text');
      if(field){const t=field.value.trim();if(t)pref.notes[k]=t;else delete pref.notes[k];savePrefs();closeSheet();const position=view.scrollTop;Promise.resolve(render(false)).then(()=>{view.scrollTop=position;});toast('Anteckning sparad');}
    }
    if(a==='toc')toc();
    if(a==='check-update'){if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration)navigator.serviceWorker.getRegistration().then(r=>r&&r.update()).then(()=>toast('Du har den senaste versionen om inget meddelande visas')).catch(()=>{});else location.reload();return;}
    if(a==='toast-undo'){const fn=toast.undo;$('#toast').hidden=true;toast.undo=null;if(fn)fn();return;}
    if(a==='note-done'){const f=$('textarea.note-input');if(f)saveNote(k,f.value);state.editingNote=null;renderKeep();return;}
    if(a==='pen'){togglePen();return;}
    if(a==='pen-color'){pref.lastColor=btn.dataset.color;savePrefs();updatePenBar();return;}
    if(a==='pen-done'){if(state.pen)togglePen();return;}
    if(a==='hl-pop-color'){updateHighlight(k,btn.dataset.id,{color:btn.dataset.color});pref.lastColor=btn.dataset.color;savePrefs();return;}
    if(a==='hl-pop-note'){const box=$('.hl-pop-note');if(box){box.hidden=!box.hidden;const f=$('.hl-pop-note textarea');if(f&&!box.hidden)f.focus();}return;}
    if(a==='hl-pop-save'){const f=$('.hl-pop-note textarea');updateHighlight(k,btn.dataset.id,{note:f?f.value.trim():''});return;}
    if(a==='hl-pop-remove'){removeHighlight(k,btn.dataset.id);return;}
    if(a==='marks-filter'){state.marksFilter=state.marksFilter===btn.dataset.id?'':btn.dataset.id;renderKeep();return;}
    if(a==='search-filter'){state.searchFilter=btn.dataset.id;onSearch(state.query);return;}
    if(a==='jump'){quickJump();return;}
    if(a==='jump-all'){e.preventDefault();closeSheet();state.query=btn.dataset.q;navigate('#/catalog');return;}
    if(a==='collection-text'){collectionText(btn.dataset.id);return;}
    if(a==='collection-print'){window.print();return;}
    if(a==='return'){history.back();return;}
    if(a==='offline'){downloadAll(btn.dataset.area||null);return;}
    if(a==='copy-ref'){const [id,cap,num]=k.split('|');copyText(shortRef(id,cap,num),'Hänvisning kopierad');return;}
    if(a==='share'){shareRef(k);return;}
    if(a==='collect'){collectSheet(k);return;}
    if(a==='collect-into'){addToCollection(btn.dataset.id,k);return;}
    if(a==='collect-new'){const f=$('#collection-name');const name=f&&f.value.trim();if(!name){toast('Skriv ett namn på samlingen');return;}
      const c={id:Date.now().toString(36),name,items:[]};pref.collections.push(c);addToCollection(c.id,k);return;}
    if(a==='collect-remove'){removeFromCollection(btn.dataset.id,k);return;}
    if(a==='collection-rename'){renameCollection(btn.dataset.id);return;}
    if(a==='collection-delete'){deleteCollection(btn.dataset.id);return;}
    if(a==='backlinks'){backlinksSheet(k);return;}
    if(a==='watch'){toggleWatch(k);return;}
    if(a==='watch-ack'){acknowledge(k);return;}
    if(a==='hl-add'){addHighlight(btn.dataset.color,false);return;}
    if(a==='hl-add-note'){addHighlight('yellow',true);return;}
    if(a==='hl-color'){updateHighlight(k,btn.dataset.id,{color:btn.dataset.color});return;}
    if(a==='hl-save-note'){const f=$('#hl-note');updateHighlight(k,btn.dataset.id,{note:f?f.value.trim():''});return;}
    if(a==='hl-remove'){removeHighlight(k,btn.dataset.id);return;}
    if(a==='export'){exportData();return;}
    if(a==='import'){const input=$('#import-file');if(input)input.click();return;}
    if(a==='find-local')findWithinLaw();
  });
  view.addEventListener('change',e=>{
    if(e.target.id==='jump-para'){
      const r=route();if(e.target.value)navigate(urlFor(r.sfs,r.chapter,searchCore.paraKey(e.target.value)));
    }
  });
  $$('.bottom-nav button').forEach(b=>b.addEventListener('click',()=>{state.query='';state.navDir='fade';navigate('#/'+b.dataset.tab);}));
  $('#back').addEventListener('click',()=>{if(history.length>1)history.back();else navigate('#/catalog');});
  $('#menu-button').addEventListener('click',()=>sheet.hidden?menu():closeSheet());
  $('#toc-button').addEventListener('click',toc);
  $('#in-law-search').addEventListener('click',quickJump);
  scrim.addEventListener('click',closeSheet);
  window.addEventListener('popstate',()=>{closeSheet();state.navDir='back';render(false);});
  window.addEventListener('hashchange',()=>{closeSheet();render(false);});
  window.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();});
  if(window.matchMedia){window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyPrefs);}
  // Ny version: när en ny service worker tar över visas en rad som laddar om appen.
  function registerWorker(){
    if(!('serviceWorker' in navigator))return;
    const hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController)showUpdateBanner();});
    const go=()=>navigator.serviceWorker.register('sw.js').then(reg=>{
      // Leta efter uppdateringar när appen öppnas igen från hemskärmen.
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{});});
    }).catch(()=>{});
    if(document.readyState==='complete')go();else window.addEventListener('load',go);
  }
  function showUpdateBanner(){
    if($('#update-banner'))return;
    const b=document.createElement('button');b.id='update-banner';b.type='button';b.className='update-banner';
    b.innerHTML='<strong>Ny version av Lagboken</strong><span>Tryck för att uppdatera</span>';
    b.addEventListener('click',()=>location.reload());
    document.body.appendChild(b);
  }
  async function boot(){
    try {
      const resp=await fetch('data/catalog.json',{cache:'no-store'});
      if(!resp.ok)throw Error('Katalog saknas');
      const data=await resp.json();
      state.catalog=(data.laws||[]).filter(l=>l.available!==false);state.fap=data.fap||[];state.version=data.version||'';state.sections=data.sections||[];window.LAGBOK_GENERATED=data.generated;
      legalLinks.configure&&legalLinks.configure(state.catalog);
    } catch(_) {
      view.innerHTML='<div class="page"><div class="empty">Författningskatalogen kunde inte laddas. Försök igen med internetanslutning.</div></div>';
      return;
    }
    if(!location.hash||location.hash==='#/home'||location.hash==='#/search')history.replaceState(null,'','#/catalog');
    render(true);
    fetchJson('data/index/status.json').then(st=>{state.status=st;updateNavBadge();}).catch(()=>{});
    fetchJson('data/index/relations.json').then(r=>{state.relations=r;if(route().page==='law')renderKeep();}).catch(()=>{});
    registerWorker();
  }
  boot();
})();
