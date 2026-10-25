/* Lagboken: snabb offlinevänlig juridisk läsapp utan externa JavaScript-beroenden. */
(function () {
  'use strict';
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const view = $('#view');
  const sheet = $('#sheet');
  const scrim = $('#scrim');
  const defaults = {favourites:[], recents:[], notes:{}, theme:'light', fontSize:1, lineHeight:1.55, readingMode:'standard'};
  let pref;
  try { pref = Object.assign({}, defaults, JSON.parse(localStorage.getItem('lagboken-settings') || '{}')); }
  catch (_) { pref = Object.assign({}, defaults); }
  if(pref.theme==='system' && !pref.themeChosen){pref.theme='light';try{localStorage.setItem('lagboken-settings',JSON.stringify(pref))}catch(_){}}
  const searchCore=window.LagbokSearch;
  const legalLinks=window.LagbokReferences;
  const state = {catalog:[],fap:[],laws:new Map(),loading:new Map(),query:'',searchEpoch:0,positions:{},current:null,previous:[],savedOnHome:false,focus:false};
  const source = 'https://data.riksdagen.se/dokument/sfs-';
  const html = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const attr = html;
  const norm = (v) => String(v || '').toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s.-]+/g,' ').trim();
  const sfsFile = (id) => String(id).replace(':','-');
  const sourceUrl = (id) => source + sfsFile(id) + '.html';
  const lawById = (id) => state.catalog.find(d => d.sfs === id);
  function savePrefs() { try {localStorage.setItem('lagboken-settings',JSON.stringify(pref));} catch (_) {} }
  function applyPrefs() {
    const dark = pref.theme === 'dark' || (pref.theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const themeMeta=document.querySelector('meta[name="theme-color"]');if(themeMeta)themeMeta.content=dark?'#17251D':'#F7F6F0';
    document.documentElement.style.setProperty('--fontscale',String(pref.fontSize));
    document.documentElement.style.setProperty('--lineheight',String(pref.lineHeight));
    document.documentElement.dataset.readmode=pref.readingMode||'standard';
  }
  applyPrefs();
  function route() {
    const hash = (location.hash || '#/home').replace(/^#\/?/,'');
    const p = hash.split('/').map(decodeURIComponent);
    return {page:p[0] || 'home',sfs:p[1] || '',chapter:p[2],paragraph:p[3]};
  }
  function urlFor(sfs,cap,para) {
    return '#/law/' + encodeURIComponent(sfs) + (cap == null ? '' : '/' + encodeURIComponent(String(cap))) + (para == null ? '' : '/' + encodeURIComponent(String(para)));
  }
  function navigate(hash,replace) {
    state.positions[location.hash || '#/home'] = view.scrollTop;
    closeSheet();
    const dest = hash || '#/home';
    if ((location.hash || '#/home') === dest && !replace) { render(); return; }
    if (replace) history.replaceState(null,'',dest);
    else history.pushState(null,'',dest);
    render(true);
  }
  function back() {
    closeSheet();
    if (history.state || state.previous.length) history.back();
    else navigate('#/catalog');
  }
  function toast(message) {
    const el = $('#toast');
    el.textContent = message; el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.hidden=true,2300);
  }
  function closeSheet() {
    sheet.hidden = true; scrim.hidden = true; $('#menu-button').setAttribute('aria-expanded','false'); sheet.innerHTML = '';
  }
  function showSheet(markup) {
    sheet.innerHTML = markup;
    sheet.hidden = false; scrim.hidden = false; $('#menu-button').setAttribute('aria-expanded','true');
    setTimeout(() => { const focus = $('input',sheet); if(focus) focus.focus({preventScroll:true}); },40);
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
    pref.recents = [target].concat(pref.recents.filter(t=>t!==target)).slice(0,15);
    savePrefs();
  }
  function favToggle(target) {
    if(pref.favourites.includes(target)) pref.favourites=pref.favourites.filter(f=>f!==target);
    else pref.favourites.unshift(target);
    savePrefs(); render();
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
  function catalogPage(){
    const laws=state.catalog.filter(x=>x.type!=='förordning'),regs=state.catalog.filter(x=>x.type==='förordning');
    return '<div class="page"><div class="catalog-hero"><h1 class="page-title">Hitta lagrum</h1>'+
      '<p class="intro">Sök på författning, juridiskt begrepp eller skriv exempelvis BrB 24:1.</p></div>'+
      searchBox('Sök i lagboken')+
      '<div id="search-results"></div><div id="catalog-directory">'+
      '<div class="section-title">Lagar ('+laws.length+')</div><div class="card-list">'+laws.map(lawRow).join('')+'</div>'+
      '<div class="section-title">Förordningar ('+regs.length+')</div><div class="card-list">'+regs.map(lawRow).join('')+'</div>'+
      '<div class="section-title">Polisens föreskrifter</div><div class="card-list">'+
      listRow('Polisens FAP','Separat sidoregister, öppnas i appen','#/fap')+'</div>'+
      '<p class="catalog-meta">Version 0.3 · Visa källa och rättslig status i respektive författning.</p>'+
      footer()+'</div></div>';
  }
  function savedPage(){
    const favs = pref.favourites.filter(x=>lawById(x.split('|')[0]));
    return '<div class="page"><h1 class="page-title">Sparat</h1><p class="intro">Dina favoriter och egna anteckningar sparas på den här enheten.</p>' +
      '<div class="section-title">Favoriter ('+favs.length+')</div><div class="card-list">' +
      (favs.length?favs.map(id=>listRow(favTitle(id),'',favRoute(id),'★')).join(''):'<div class="empty">Inga sparade lagrum ännu.</div>') +
      '</div><div class="section-title">Anteckningar ('+Object.keys(pref.notes).filter(x=>pref.notes[x]).length+')</div><div class="card-list">' +
      (Object.keys(pref.notes).filter(x=>pref.notes[x]).map(k=>listRow(favTitle(k),pref.notes[k].slice(0,90),favRoute(k))).join('') ||
        '<div class="empty">Ingen anteckning ännu. Lägg till en anteckning från paragrafens meny.</div>') +
      '</div></div>';
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
      state.laws.set(id,data); return data;
    }).finally(()=>state.loading.delete(id));
    state.loading.set(id,promise); return promise;
  }
  function hasRealChapters(data){return data.chapters.length>1||data.chapters[0].number!=='0';}
  function docIntro(meta,data){
    const n=data.chapters.reduce((total,ch)=>total+(ch.items||[]).filter(i=>i.type==='para').length,0);
    return '<div class="law-head"><span class="source-label">'+html(meta.type==='förordning'?'Förordning':'Lag')+' · SFS '+html(meta.sfs)+'</span>'+
      '<h1>'+html(data.title||meta.name)+'</h1><p>'+data.chapters.length+' kapitel/avsnitt · '+n+' importerade paragrafer · Hämtad '+html((data.fetchedAt||'okänt datum').substring(0,10))+'</p>'+
      '<div class="actions"><button type="button" class="button" data-action="fav" data-key="'+attr(meta.sfs)+'">'+badgeMark(meta.sfs)+' Spara</button>'+
      '<a class="button" href="'+attr(sourceUrl(meta.sfs))+'" target="_blank" rel="noopener noreferrer">Officiell källa ↗</a></div>'+
      '<p class="small muted">Täckning anger importerad text, inte verifierad gällande lydelse. Kontrollera ikraftträdande och ändringar hos Riksdagen.</p></div>';
  }
  function chapterList(meta,data){
    return docIntro(meta,data)+
      '<div class="chapter-list"><div class="section-title">Välj kapitel</div><div class="card-list chapters-grid">'+
      data.chapters.map(ch=>{
        const paras=(ch.items||[]).filter(i=>i.type==='para');
        return listRow((ch.number==='0'?'Bestämmelser':ch.number+' kap.')+(ch.title?' · '+ch.title:''),paras.length+' paragrafer',urlFor(meta.sfs,ch.number));
      }).join('')+'</div></div>';
  }
  function refExists(id,chapter,paragraph){
    const doc=state.laws.get(id);
    if(!doc)return true; // Ett ännu inte inläst annat lagrum kontrolleras före öppning.
    const ch=doc.chapters.find(c=>String(c.number)===String(chapter));
    return !!ch&&(ch.items||[]).some(p=>p.type==='para'&&searchCore.paraKey(p.number)===searchCore.paraKey(paragraph));
  }
  function linkify(input,sfs,chapter){
    return legalLinks.linkify(input,{
      sfs,chapter,
      exists:refExists,
      href:urlFor
    });
  }
  function editorialTitle(meta,ch,item){
    if(item.type==='heading')return '<h2 class="reader-subhead'+(item.editorial?' editorial':'')+'">'+html(item.text)+'</h2>';
    return '';
  }
  function paraHtml(meta,ch,item,next){
    const key=meta.sfs+'|'+ch.number+'|'+item.number;
    const paragraphs=String(item.text||'').replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').split(/\n\s*\n+/).map(s=>s.trim()).filter(Boolean);
    const content=paragraphs.map(p=>{
      const ordered=/^(\d{1,2})[.)]\s+([\s\S]*)$/.exec(p);
      if(ordered)return '<div class="legal-item"><span class="legal-item-number">'+html(ordered[1])+'.</span>'+
        '<div class="legal-item-body">'+linkify(ordered[2],meta.sfs,ch.number).replace(/\n/g,'<br>')+'</div></div>';
      return '<p>'+linkify(p,meta.sfs,ch.number).replace(/\n/g,'<br>')+'</p>';
    }).join('');
    return '<article class="paragraph reader-block" id="p-'+attr(searchCore.paraKey(item.number))+'">'+
      '<header class="paragraph-header"><span class="paragraph-num">'+html(item.number)+' §</span>'+
      '<div class="paragraph-actions"><button title="Spara paragraf" aria-label="Spara paragraf" class="'+(pref.favourites.includes(key)?'is-saved':'')+'" data-action="fav" data-key="'+attr(key)+'">'+badgeMark(key)+'</button>'+
      '<button title="Fler åtgärder" aria-label="Kopiera eller anteckna vid '+attr(item.number)+' §" data-action="para-menu" data-key="'+attr(key)+'">•••</button></div></header>'+
      '<div class="paragraph-content">'+content+'</div>'+
      (item.hasVariants?'<div class="notice" role="note">Flera eller framtida lydelser förekommer i källmaterialet. Kontrollera gällande lydelse.</div>':'')+
      (pref.notes[key]?'<div class="paragraph-note">Egen anteckning finns</div>':'')+
      (next?'<div class="paragraph-foot"><a data-link="1" class="paragraph-next" href="'+attr(urlFor(meta.sfs,ch.number,next.number))+'">Nästa: '+html(next.number)+' § →</a></div>':'')+'</article>';
  }
  function chapterReader(meta,data,capid){
    const ch=data.chapters.find(c=>String(c.number)===String(capid));
    if(!ch)return '<div class="page"><div class="empty">Kapitlet hittades inte.</div></div>';
    const paras=(ch.items||[]).filter(i=>i.type==='para');
    const idx=data.chapters.indexOf(ch),previous=data.chapters[idx-1],next=data.chapters[idx+1];
    const short=ch.number==='0'?'Paragraferna':ch.number+' kap.';
    const chapterStep=(c,dir)=>c?
      '<a class="chapter-step '+dir+'" data-link="1" href="'+attr(urlFor(meta.sfs,c.number))+'" aria-label="'+
      attr((dir==='previous'?'Föregående':'Nästa')+' kapitel '+c.number)+'">'+(dir==='previous'?'← ':'')+html(c.number==='0'?'Bestämmelser':c.number+' kap.')+(dir==='next'?' →':'')+'</a>':
      '<span class="chapter-step '+dir+' disabled">—</span>';
    const current=meta.name+(ch.number==='0'?'':' · '+ch.number+' kap.');
    const modes='<div class="read-modes" role="group" aria-label="Texttäthet"><button type="button" data-action="read-mode" data-mode="standard" class="'+(pref.readingMode==='standard'?'active':'')+'" aria-pressed="'+(pref.readingMode==='standard')+'">Standard</button>'+
      '<button type="button" data-action="read-mode" data-mode="compact" class="'+(pref.readingMode==='compact'?'active':'')+'" aria-pressed="'+(pref.readingMode==='compact')+'">Kompakt</button></div>';
    let i=0;
    const contents=(ch.items||[]).map(item=>{
      if(item.type==='heading')return editorialTitle(meta,ch,item);
      if(item.type!=='para')return '';
      const nextPara=paras[i+1]||null;i++;
      return paraHtml(meta,ch,item,nextPara);
    }).join('');
    return '<div class="reader-context"><div class="reader-crumbs"><a href="'+attr(urlFor(meta.sfs))+'" data-link="1">'+html(meta.name)+'</a>'+
      '<span class="reader-current">'+html(short)+'</span></div>'+
      '<button type="button" data-action="toc" aria-label="Öppna kapitelöversikt">Innehåll ☷</button>'+
      '<button class="focus-return" data-action="toggle-focus" aria-label="Avsluta läsläge">Avsluta läsläge</button></div>'+
      '<div class="law-reader reading-mode-'+html(pref.readingMode)+'"><header class="reader-heading">'+
      '<span class="source-label">'+html(meta.name)+' · SFS '+html(meta.sfs)+'</span>'+
      '<h1><span class="chapter-number">'+html(short)+'</span>'+html(ch.title||(ch.number==='0'?'Bestämmelser':''))+'</h1>'+
      '<nav class="chapter-navigation" aria-label="Byt kapitel">'+chapterStep(previous,'previous')+
      '<button type="button" class="chapter-menu" data-action="toc">Kapitel & §§ ▾</button>'+chapterStep(next,'next')+'</nav>'+
      '<div class="reader-options">'+modes+
      '<button type="button" class="reader-minor" data-action="toggle-focus">Läsläge</button>'+
      '<button type="button" class="reader-minor '+(pref.favourites.includes(meta.sfs+'|'+ch.number)?'saved':'')+'" data-action="fav" data-key="'+attr(meta.sfs+'|'+ch.number)+'">'+badgeMark(meta.sfs+'|'+ch.number)+' Spara</button></div>'+
      '<details class="source-disclosure"><summary>Källa och versionsinformation</summary><p>Importerad från Sveriges riksdag '+html((data.fetchedAt||'').slice(0,10))+
      '. Importen garanterar inte gällande lydelse. Redaktionella rubriker är markerade.</p>'+
      '<a target="_blank" rel="noopener noreferrer" href="'+attr(sourceUrl(meta.sfs))+'">Läs officiell författning hos Riksdagen ↗</a></details></header>'+
      '<div class="statute-body">'+contents+'</div>'+
      '<footer class="reader-end">'+(next?'<a class="paragraph-next" href="'+attr(urlFor(meta.sfs,next.number))+'" data-link="1">Nästa kapitel: '+html(next.number)+' →</a>':'')+
      '<div class="footer-meta">Lagbok 0.3. Kontrollera gällande lydelse mot <a href="'+attr(sourceUrl(meta.sfs))+'" target="_blank" rel="noopener noreferrer">Sveriges riksdag ↗</a>.</div></footer></div>';
  }
  function tocHtml(meta,data){
    const here=route();
    return '<div class="sheet-title">Innehållsförteckning <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<div class="searchbox">'+iconSearch()+'<input id="toc-query" type="search" placeholder="Sök kapitel eller paragraf"></div>' +
      '<div id="toc-results">'+tocEntries(meta,data,here)+'</div>';
  }
  function tocEntries(meta,data,here,needle){
    const q=norm(needle||'');
    return data.chapters.map(ch=>{
      const entries=(ch.items||[]).filter(i=>i.type==='heading'||i.type==='para');
      if(q){
        const matches=entries.filter(i=>norm((i.text||'')+' '+(i.number||'')).includes(q)||norm(ch.title).includes(q));
        if(!matches.length&&!norm(ch.number+' kap').includes(q))return '';
        return '<div class="section-title">'+html(ch.number==='0'?'Bestämmelser':ch.number+' kap. '+ch.title)+'</div>'+
          matches.slice(0,60).map(i=>listRow(i.type==='heading'?i.text:i.number+' §',i.type==='heading'?'Avsnitt':String(i.text||'').slice(0,78),urlFor(meta.sfs,ch.number,i.type==='heading'?i.nextPara:i.number))).join('');
      }
      const headings=entries.filter(i=>i.type==='heading'),paras=entries.filter(i=>i.type==='para');
      const shown=ch.number===here.chapter||data.chapters.length===1;
      return '<details '+(shown?'open':'')+' class="toc-group"><summary class="list-row"><span class="grow">'+
        html(ch.number==='0'?'Bestämmelser':ch.number+' kap. '+(ch.title||''))+
        '<span class="chapter-subtitle">'+paras.length+' paragrafer</span></span><span class="chevron">⌄</span></summary>'+
        '<div class="toc-indent">'+
        headings.map(i=>listRow(i.text,'Avsnitt',urlFor(meta.sfs,ch.number,i.nextPara))).join('')+
        '<div class="para-grid">'+paras.map(i=>'<a href="'+attr(urlFor(meta.sfs,ch.number,i.number))+'" data-link="1">'+html(i.number)+' §</a>').join('')+'</div></div></details>';
    }).join('');
  }
  function menu() {
    showSheet('<div class="sheet-title">Mer <button class="icon-button" data-action="close">×</button></div>' +
      '<div class="card-list">'+
      listRow('Polisens FAP','Föreskrifter och allmänna råd','#/fap')+
      listRow('Inställningar','Tema, textstorlek och läsning','#/settings')+
      listRow('Om lagboken','Källor, uppdateringar och ansvarsbegränsning','#/about')+
      '</div>');
  }
  function settingsPage(){
    return '<div class="page"><h1 class="page-title">Inställningar</h1>'+
      '<div class="field"><label for="theme">Färgtema</label><select data-setting="theme" id="theme">'+
      [['light','Mjukvitt med elegant grön (standard)'],['dark','Mörkt'],['system','Följ iPhone']].map(x=>'<option value="'+x[0]+'"'+(pref.theme===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="reading-mode">Lästäthet</label><select data-setting="readingMode" id="reading-mode">'+
      [['standard','Standard – bekväm läsning'],['compact','Kompakt – fler paragrafer samtidigt']].map(x=>'<option value="'+x[0]+'"'+(pref.readingMode===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="size">Textstorlek</label><select data-setting="fontSize" id="size">'+
      [[0.94,'Liten'],[1,'Normal'],[1.12,'Stor'],[1.25,'Extra stor']].map(x=>'<option value="'+x[0]+'"'+(Number(pref.fontSize)===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="height">Radavstånd</label><select data-setting="lineHeight" id="height">'+
      [[1.43,'Kompakt'],[1.55,'Normal'],[1.75,'Luftigt']].map(x=>'<option value="'+x[0]+'"'+(Number(pref.lineHeight)===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>'+
      '<div class="notice">Inställningar, favoriter och anteckningar sparas lokalt på din enhet.</div></div>';
  }
  function aboutPage(){
    return '<div class="page"><h1 class="page-title">Om lagboken</h1><p>En fristående, mobilanpassad samling av prioriterade svenska lagar och förordningar.</p>' +
      '<div class="section-title">Rättskällor</div><p class="small muted">Författningstexterna hämtas från Sveriges riksdags öppna data. Polisens FAP länkas till Polismyndighetens författningssamling.</p>' +
      '<div class="section-title">Uppdateringsstatus</div><p class="small">Senast genomförd datainhämtning: '+html(window.LAGBOK_GENERATED||'Se respektive författning')+'.</p>' +
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
    return state.catalog.filter(l=>norm([l.name,l.sfs,(l.aliases||[]).join(' ')].join(' ')).includes(n));
  }
  function searchPage(){return catalogPage();}
  function resultsHtml(query){
    const direct=findDirect(query),laws=searchLawMatches(query);
    const faps=state.fap.filter(f=>norm([f.name,f.id,f.code,(f.tags||[]).join(' ')].join(' ')).includes(norm(query)));
    const intro=direct?'<div class="section-title">Direkt till</div><div class="card-list"><a class="list-row" href="'+attr(quickUrl(direct))+'" data-quick="'+attr(query)+'"><div class="grow"><div class="row-title">'+html(quickLabel(direct))+'</div><div class="row-sub">Tryck här eller använd Enter för snabbkod</div></div><span class="chevron">›</span></a></div>':'';
    const lhtml=laws.length?'<div class="section-title">Författningar</div><div class="card-list">'+laws.map(lawRow).join('')+'</div>':'';
    const fhtml=faps.length?'<div class="section-title">Polisens FAP</div><div class="card-list">'+fapResults(faps.slice(0,5))+'</div>':'';
    return intro+lhtml+fhtml+'<div class="section-title">Träffar i lagtext</div><div id="text-results" class="search-results"><div class="loading">Söker i importerad lagtext…</div></div>';
  }
  function suggestionsHtml(query){
    const q=norm(query);if(!q)return '';
    const list=[],seen=new Set();
    function add(label,sub,url,icon,quick){
      if(seen.has(url)||list.length>=6)return;
      seen.add(url);list.push('<a class="suggestion" role="option" href="'+attr(url)+'" '+(quick?'data-quick="'+attr(quick)+'"':'data-link="1"')+'><span class="suggestion-icon">'+icon+'</span><span><span class="suggestion-title">'+html(label)+'</span><span class="suggestion-sub">'+html(sub)+'</span></span></a>');
    }
    const direct=findDirect(query);
    if(direct)add(quickLabel(direct),'Öppna direkt med Enter',quickUrl(direct),'↗',query);
    const topics=[['husrannsakan','RB 28:1'],['häktning','RB 24:1'],['stöld','BrB 8:1'],['offentlig försvarare','RB 21:3a']];
    topics.filter(x=>norm(x[0]).includes(q)).forEach(x=>{
      const d=findDirect(x[1]);if(d)add(x[0]+' · '+x[1],'Föreslaget lagrum',quickUrl(d),'§',x[1]);
    });
    searchLawMatches(query).slice(0,4).forEach(l=>add(l.name,'SFS '+l.sfs,urlFor(l.sfs),'▤'));
    state.fap.filter(f=>norm([f.id,f.name,f.code,(f.tags||[]).join(' ')].join(' ')).includes(q)).slice(0,3).forEach(f=>add(f.id+' · '+f.name,f.code||'Föreskrift','#/fap/'+encodeURIComponent(f.id),'▤'));
    pref.recents.filter(x=>norm(favTitle(x)).includes(q)).slice(0,2).forEach(x=>add(favTitle(x),'Senast öppnad',favRoute(x),'◷'));
    return list.join('');
  }
  function updateSuggestions(){
    const el=$('#search-suggest'),input=$('#query');if(!el||!input)return;
    const markup=suggestionsHtml(state.query);el.innerHTML=markup;el.hidden=!markup;input.setAttribute('aria-expanded',String(!!markup));
  }
  async function populateTextResults(q,epoch) {
    const needle=norm(q);
    if(needle.length<3) {
      if(epoch===state.searchEpoch) $('#text-results') && ($('#text-results').innerHTML='<p class="muted small">Skriv minst tre tecken för fritextsökning.</p>');
      return;
    }
    const docs=await Promise.allSettled(state.catalog.map(x=>loadLaw(x.sfs)));
    if(epoch!==state.searchEpoch)return;
    const found=[];let missing=0;
    docs.forEach((result,i)=>{
      if(result.status!=='fulfilled'){missing++;return;}
      const law=state.catalog[i],doc=result.value;
      for(const ch of doc.chapters) {
        for(const it of ch.items||[]) {
          if(it.type!=='para'||!it.text)continue;
          const index=norm(it.text).indexOf(needle);
          if(index===-1)continue;
          const start=Math.max(0,index-55);const snippet=it.text.slice(start,start+175);
          found.push({law,ch,num:it.number,snippet});
          if(found.length>=80)break;
        }
        if(found.length>=80)break;
      }
    });
    const box=$('#text-results');
    if(!box || epoch!==state.searchEpoch)return;
    box.innerHTML=found.length?'<div class="card-list">'+found.slice(0,35).map(r=>
      '<a class="list-row" href="'+attr(urlFor(r.law.sfs,r.ch.number,r.num))+'" data-link="1"><div class="grow"><div class="row-title">'+html(r.law.name)+' · '+
      (r.ch.number==='0'?'':html(r.ch.number)+' kap. ')+html(r.num)+' §</div><div class="search-excerpt">'+html(r.snippet)+'</div></div><span class="chevron">›</span></a>').join('')+
      '</div>'+ (found.length>35?'<p class="muted small">Visar de första 35 träffarna.</p>':''):
      '<div class="empty">Inga matchande paragrafer i importerad lagtext.</div>';
    if(missing) box.insertAdjacentHTML('beforeend','<div class="notice">'+missing+' författningar saknar ännu importerad lagtext och ingår inte i denna fritextsökning.</div>');
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
    setTimeout(()=>{if(state.searchEpoch===epoch)populateTextResults(val,epoch);},280);
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
  async function render(reset){
    const r=route();state.current=r;
    const tab = ['catalog','saved'].includes(r.page)?r.page:null;
    $$('.bottom-nav button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');});
    $('#back').hidden=['home','catalog','search','saved'].includes(r.page);
    $('#toc-button').hidden=r.page!=='law';
    $('#in-law-search').hidden=r.page!=='law';
    const meta=lawById(r.sfs);
    $('#top-title').textContent = r.page==='law'?(meta?meta.name:'Lagbok'):({home:'Lagbok',catalog:'Lagbok',search:'Lagbok',saved:'Sparat',fap:r.sfs?'FAP':'Polisens FAP',settings:'Inställningar',about:'Om'}[r.page]||'Lagbok');
    let markup;
    switch(r.page) {
      case 'home': markup=catalogPage();break;
      case 'catalog': markup=catalogPage();break;
      case 'search': markup=searchPage();break;
      case 'saved': markup=savedPage();break;
      case 'fap': markup=r.sfs?fapReader(r.sfs):fapPage();break;
      case 'settings': markup=settingsPage();break;
      case 'about': markup=aboutPage();break;
      case 'law':
        view.innerHTML='<div class="loading">Hämtar författning …</div>';
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
    view.innerHTML=markup;
    if(r.page==='law'&&meta)addRecent(meta.sfs+(r.chapter==null?'':'|'+r.chapter)+(r.paragraph?'|'+r.paragraph:''));
    if(r.page==='law'&&r.paragraph) {
      const remembered=!reset&&Object.prototype.hasOwnProperty.call(state.positions,location.hash)?state.positions[location.hash]:null;
      requestAnimationFrame(()=>{if(remembered!==null)view.scrollTop=remembered;else{const el=$('#p-'+CSS.escape(r.paragraph));if(el)el.scrollIntoView({block:'start',behavior:'instant'});}});
    } else if(reset){view.scrollTop=0;}
    else {view.scrollTop=state.positions[location.hash]||0;}
    if((r.page==='catalog'||r.page==='search'||r.page==='home'||r.page==='fap')&&state.query) onSearch(state.query);
  }
  function lawSearchResults(doc,meta,q) {
    const query=norm(q);
    if(query.length<2)return '<div class="empty">Skriv ett sökord eller en paragraf.</div>';
    const hits=[];
    for(const ch of doc.chapters) {
      for(const item of ch.items||[]) {
        if(item.type!=='para')continue;
        const text=String(item.text||'');
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
    loadLaw(r.sfs).then(data=>showSheet(tocHtml(meta,data))).catch(()=>toast('Innehållsförteckning saknas tills texten importerats.'));
  }
  function note(key) {
    showSheet('<div class="sheet-title">Egen anteckning <button class="icon-button" data-action="close">×</button></div>'+
      '<div class="small muted">'+html(favTitle(key))+'</div>'+
      '<div class="field"><label for="note-text">Anteckning</label><textarea id="note-text" placeholder="Skriv en privat anteckning…">'+html(pref.notes[key]||'')+'</textarea></div>'+
      '<button class="button primary" data-action="save-note" data-key="'+attr(key)+'">Spara anteckning</button>');
  }
  async function copyParagraph(key) {
    const [id,cap,num]=key.split('|');
    try {
      const doc=await loadLaw(id);
      const ch=doc.chapters.find(x=>x.number===cap);
      const p=ch && ch.items.find(x=>x.type==='para'&&x.number===num);
      if(!p)throw Error('Saknas');
      const text=(cap==='0'?'':cap+' kap. ')+num+' § '+lawById(id).name+' (SFS '+id+')\n\n'+p.text;
      if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {const input=document.createElement('textarea');input.value=text;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();}
      toast('Lagrum kopierat');
    }catch(_){toast('Det gick inte att kopiera paragrafen');}
  }
  view.addEventListener('input',e=>{
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
  sheet.addEventListener('input',e=>{
    if(e.target.id==='local-query'){
      const r=route(),meta=lawById(r.sfs),doc=state.laws.get(r.sfs);
      if(meta&&doc)$('#local-results').innerHTML=lawSearchResults(doc,meta,e.target.value);
    }
    if(e.target.id==='toc-query'){
      const r=route(),meta=lawById(r.sfs),doc=state.laws.get(r.sfs);
      if(doc&&meta)$('#toc-results').innerHTML=tocEntries(meta,doc,r,e.target.value);
    }
  });
  document.addEventListener('change',e=>{
    if(e.target.dataset.setting){
      const key=e.target.dataset.setting;
      pref[key]=key==='theme'?e.target.value:Number(e.target.value);
      if(key==='theme')pref.themeChosen=true;
      savePrefs();applyPrefs();toast('Inställning sparad');
    }
  });
  document.addEventListener('click',e=>{
    const close=e.target.closest('[data-action="close"]'); if(close){closeSheet();return;}
    const quickAnchor=e.target.closest('[data-quick]');if(quickAnchor){e.preventDefault();goQuick(quickAnchor.dataset.quick);return;}
    const anchor=e.target.closest('a[data-link]');
    if(anchor){e.preventDefault();const dest=anchor.getAttribute('href');if(dest==='#/fap')state.query='';navigate(dest);return;}
    const btn=e.target.closest('[data-action]');
    if(!btn)return;
    const a=btn.dataset.action,k=btn.dataset.key;
    if(a==='clear-search'){const field=$('#query');if(field){field.value='';onSearch('');field.focus();}return;}
    if(a==='fav')favToggle(k);
    if(a==='copy')copyParagraph(k);
    if(a==='note')note(k);
    if(a==='save-note'){
      const field=$('#note-text');
      if(field){const t=field.value.trim();if(t)pref.notes[k]=t;else delete pref.notes[k];savePrefs();closeSheet();render();toast('Anteckning sparad');}
    }
    if(a==='toc')toc();
    if(a==='find-local')findWithinLaw();
  });
  view.addEventListener('change',e=>{
    if(e.target.id==='jump-para'){
      const r=route();if(e.target.value)navigate(urlFor(r.sfs,r.chapter,searchCore.paraKey(e.target.value)));
    }
  });
  $$('.bottom-nav button').forEach(b=>b.addEventListener('click',()=>{state.query='';navigate('#/'+b.dataset.tab);}));
  $('#back').addEventListener('click',()=>{if(history.length>1)history.back();else navigate('#/catalog');});
  $('#menu-button').addEventListener('click',()=>sheet.hidden?menu():closeSheet());
  $('#toc-button').addEventListener('click',toc);
  $('#in-law-search').addEventListener('click',findWithinLaw);
  scrim.addEventListener('click',closeSheet);
  window.addEventListener('popstate',()=>{closeSheet();render(false);});
  window.addEventListener('hashchange',()=>{closeSheet();render(false);});
  window.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();});
  if(window.matchMedia){window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyPrefs);}
  async function boot(){
    try {
      const resp=await fetch('data/catalog.json',{cache:'no-store'});
      if(!resp.ok)throw Error('Katalog saknas');
      const data=await resp.json();
      state.catalog=data.laws||[];state.fap=data.fap||[];window.LAGBOK_GENERATED=data.generated;
    } catch(_) {
      view.innerHTML='<div class="page"><div class="empty">Författningskatalogen kunde inte laddas. Försök igen med internetanslutning.</div></div>';
      return;
    }
    if(!location.hash||location.hash==='#/home'||location.hash==='#/search')history.replaceState(null,'','#/catalog');
    render(true);
    if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
  }
  boot();
})();
