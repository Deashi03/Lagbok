/* Lagboken: snabb offlinevänlig juridisk läsapp utan externa JavaScript-beroenden. */
(function () {
  'use strict';
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const view = $('#view');
  const sheet = $('#sheet');
  const scrim = $('#scrim');
  const defaults = {favourites:[], recents:[], notes:{}, theme:'system', fontSize:1, lineHeight:1.65};
  let pref;
  try { pref = Object.assign({}, defaults, JSON.parse(localStorage.getItem('lagboken-settings') || '{}')); }
  catch (_) { pref = Object.assign({}, defaults); }
  const state = {catalog:[],fap:[],laws:new Map(),loading:new Map(),query:'',searchEpoch:0,positions:{},current:null,previous:[],savedOnHome:false};
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
    document.documentElement.style.setProperty('--fontscale',String(pref.fontSize));
    document.documentElement.style.setProperty('--lineheight',String(pref.lineHeight));
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
    else navigate('#/home');
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
    return '<div class="searchbox">' + iconSearch() + '<input id="query" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="' + html(placeholder || 'Sök lag, ämne eller lagrum') + '" value="' + attr(state.query) + '"></div>';
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
    const laws = state.catalog.filter(x=>x.type!=='förordning'), regs=state.catalog.filter(x=>x.type==='förordning');
    return '<div class="page"><h1 class="page-title">Lagbok</h1><p class="intro">Lagar och förordningar. FAP finns separat under Mer.</p>' +
      '<div class="section-title">Lagar ('+laws.length+')</div><div class="card-list">'+laws.map(lawRow).join('')+'</div>' +
      '<div class="section-title">Förordningar ('+regs.length+')</div><div class="card-list">'+regs.map(lawRow).join('')+'</div>'+footer()+'</div>';
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
    const query = norm(state.query), items = state.fap.filter(f=>!query||norm([f.id,f.name,f.code,(f.tags||[]).join(' ')].join(' ')).includes(query));
    return '<div class="page"><span class="source-label">Sidoregister</span><h1 class="page-title">Polisens FAP</h1>' +
      '<p class="intro">Föreskrifter och allmänna råd ligger utanför lagboken. Öppna originaldokument på Polismyndighetens webbplats.</p>' +
      searchBox('Sök t.ex. OC, pepparspray, FAP 104-4') + '<div id="fap-results">' + fapResults(items) + '</div>' + footer() + '</div>';
  }
  function fapResults(items){
    return items.length ? items.map(f=>'<article class="fap-item"><span class="source-label">' + html(f.id) + (f.code?' · '+html(f.code):'') + '</span>' +
      '<h3>'+html(f.name)+'</h3><div class="tags">'+(f.tags||[]).map(t=>'<span class="tag">'+html(t)+'</span>').join('')+'</div>'+
      (f.modified?'<p>Senaste registrerade ändringsföreskrift: '+html(f.modified)+'</p>':'') +
      '<p>Kontrollera gällande version och eventuella nya ändringar hos Polismyndigheten.</p>' +
      '<a class="button" href="'+attr(f.url)+'" target="_blank" rel="noopener noreferrer">Öppna hos Polisen ↗</a></article>').join('') :
      '<div class="empty">Ingen föreskrift matchade sökningen.</div>';
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
    return '<div class="law-head"><span class="source-label">'+html(meta.type==='förordning'?'Förordning':'Lag')+' · SFS '+html(meta.sfs)+'</span>' +
      '<h1>'+html(data.title||meta.name)+'</h1><p>Hämtad från Sveriges riksdags öppna data' +(data.fetchedAt?' · '+html(data.fetchedAt.substring(0,10)):'')+'</p>' +
      '<div class="actions"><button type="button" class="button" data-action="fav" data-key="'+attr(meta.sfs)+'">'+badgeMark(meta.sfs)+' Spara</button>' +
      '<a class="button" href="'+attr(sourceUrl(meta.sfs))+'" target="_blank" rel="noopener noreferrer">Originalkälla ↗</a></div></div>';
  }
  function chapterList(meta,data){
    return docIntro(meta,data) +
      '<div class="chapter-list"><div class="section-title">Välj kapitel</div><div class="card-list">' +
      data.chapters.map(ch=>listRow((ch.number==='0'?'Bestämmelser':ch.number+' kap.')+(ch.title?' · '+ch.title:''), (ch.items||[]).filter(i=>i.type==='para').length+' paragrafer',urlFor(meta.sfs,ch.number))).join('') +
      '</div></div>';
  }
  function refInfo(target,current) {
    const names={rättegångsbalken:'1942:740',brottsbalken:'1962:700',polislagen:'1984:387',förundersökningskungörelsen:'1947:948',trafikförordningen:'1998:1276'};
    return names[norm(target).replace(/ /g,'')] || names[norm(target)] || current;
  }
  function linkify(input,sfs,cap) {
    const escaped=html(input);
    const re=/(\b(\d{1,2})\s+kap\.\s*(\d+\s*[a-z]?)\s*§\s*(rättegångsbalken|brottsbalken|polislagen|förundersökningskungörelsen)?|\b(\d+\s*[a-z]?)\s*§\s*(rättegångsbalken|brottsbalken|polislagen|förundersökningskungörelsen))/gi;
    return escaped.replace(re, (whole,full,chapter,sec,lawName,simpleSec,simpleLaw)=>{
      const tid=refInfo(lawName||simpleLaw,sfs), c=chapter||(!simpleLaw?cap:'0'), p=(sec||simpleSec||'').replace(/\s/g,'');
      if(!lawById(tid))return whole;
      return '<a href="'+attr(urlFor(tid,c,p))+'" data-link="1">'+whole+'</a>';
    });
  }
  function editorialTitle(meta,ch,item){
    if(item.type==='heading') return '<h2 class="reader-subhead'+(item.editorial?' editorial':'')+'">'+html(item.text)+'</h2>';
    return '';
  }
  function paraHtml(meta,ch,item){
    const key=meta.sfs+'|'+ch.number+'|'+item.number;
    return '<article class="paragraph reader-block" id="p-'+attr(item.number.replace(/\s/g,''))+'">' +
      '<div class="paragraph-header"><span class="paragraph-num">'+html(item.number)+' §</span>' +
      '<div class="paragraph-actions"><button title="Kopiera paragraf" aria-label="Kopiera paragraf" data-action="copy" data-key="'+attr(key)+'">⧉</button>' +
      '<button title="Anteckning" aria-label="Anteckning" data-action="note" data-key="'+attr(key)+'">✎</button>' +
      '<button title="Spara paragraf" aria-label="Spara paragraf" class="'+(pref.favourites.includes(key)?'is-saved':'')+'" data-action="fav" data-key="'+attr(key)+'">'+badgeMark(key)+'</button></div></div>' +
      '<div class="paragraph-content">'+linkify(item.text,meta.sfs,ch.number)+'</div>' +
      (item.hasVariants?'<div class="notice" role="note">Observera: bestämmelsen innehåller flera lydelser eller framtida ikraftträdanden i källmaterialet. Kontrollera vilken lydelse som är gällande.</div>':'')+
      (pref.notes[key]?'<div class="paragraph-note">✎ Egen anteckning sparad</div>':'')+'</article>';
  }
  function chapterReader(meta,data,capid){
    const ch=data.chapters.find(c=>String(c.number)===String(capid));
    if(!ch) return '<div class="page"><div class="empty">Kapitlet hittades inte.</div></div>';
    const items=ch.items||[];
    return '<div class="law-reader"><div class="reader-heading"><span class="source-label">'+html(meta.name)+' · SFS '+html(meta.sfs)+'</span>' +
      '<h1>'+(ch.number==='0'?html(meta.name):ch.number+' kap. '+html(ch.title||''))+'</h1>' +
      '<div class="tool-row"><button class="button" data-action="toc">☷ Innehåll</button>' +
      '<button class="button" data-action="fav" data-key="'+attr(meta.sfs+'|'+ch.number)+'">'+badgeMark(meta.sfs+'|'+ch.number)+' Spara kapitel</button></div></div>' +
      '<div class="notice">Källa: Sveriges riksdag. Kontrollera ikraftträdande och gällande lydelse i originalkällan. Redaktionella navigeringsrubriker anges särskilt.</div>' +
      items.map(item=>item.type==='heading'?editorialTitle(meta,ch,item):item.type==='para'?paraHtml(meta,ch,item):'').join('<div class="read-divider"></div>') +
      '<div class="footer-meta">Författningens original: <a target="_blank" rel="noopener noreferrer" href="'+attr(sourceUrl(meta.sfs))+'">Sveriges riksdag ↗</a>. Textbaserade rättskällor kan innehålla framtida ikraftträdanden – kontrollera detta innan rättslig användning.</div></div>';
  }
  function tocHtml(meta,data){
    const here=route();
    return '<div class="sheet-title">Innehållsförteckning <button class="icon-button" data-action="close" aria-label="Stäng">×</button></div>'+
      '<div class="searchbox">'+iconSearch()+'<input id="toc-query" type="search" placeholder="Sök kapitel eller paragraf"></div>' +
      '<div id="toc-results">'+tocEntries(meta,data,here)+'</div>';
  }
  function tocEntries(meta,data,here,needle) {
    const q=norm(needle||'');
    return data.chapters.map(ch=>{
      const entries=(ch.items||[]).filter(i=>i.type==='heading'||i.type==='para');
      if(q) {
        const matches=entries.filter(i=>norm(i.text||i.number).includes(q) || norm(ch.title).includes(q));
        if(!matches.length&&!norm(ch.number+' kap').includes(q))return '';
        return '<div class="section-title">'+html(ch.number==='0'?'Bestämmelser':ch.number+' kap. '+ch.title)+'</div>'+
          matches.slice(0,100).map(i=>listRow(i.type==='heading'?i.text:i.number+' §',i.editorial?'Redaktionell rubrik':'',urlFor(meta.sfs,ch.number,i.type==='heading'?i.nextPara:i.number))).join('');
      }
      const shown=ch.number===here.chapter||data.chapters.length===1;
      return '<details '+(shown?'open':'')+' class="toc-group"><summary class="list-row" style="list-style:none;font-weight:700"><span class="grow">'+html(ch.number==='0'?'Bestämmelser':ch.number+' kap. '+ch.title)+'</span><span class="chevron">⌄</span></summary>' +
        '<div class="toc-indent">'+ (entries.length?entries.map(i=>i.type==='heading' ?
          '<a href="'+attr(urlFor(meta.sfs,ch.number,i.nextPara))+'" class="list-row" data-link="1"><div class="grow"><div class="row-title">'+html(i.text)+'</div><div class="row-sub">'+(i.editorial?'Redaktionell navigeringsrubrik':'Avsnitt')+'</div></div><span class="chevron">›</span></a>':
          '<a href="'+attr(urlFor(meta.sfs,ch.number,i.number))+'" class="list-row" data-link="1" style="min-height:41px"><span class="small muted">'+html(i.number)+' §</span><span class="chevron" style="margin-left:auto">›</span></a>').join(''):'<p class="muted small">Inga avsnitt</p>')+'</div></details>';
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
    return '<div class="page"><h1 class="page-title">Inställningar</h1>' +
      '<div class="field"><label for="theme">Utseende</label><select data-setting="theme" id="theme">'+
      [['system','Följ iPhone'],['light','Ljust'],['dark','Mörkt']].map(x=>'<option value="'+x[0]+'"'+(pref.theme===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>' +
      '<div class="field"><label for="size">Textstorlek</label><select data-setting="fontSize" id="size">'+
      [[0.9,'Liten'],[1,'Normal'],[1.12,'Stor'],[1.25,'Extra stor']].map(x=>'<option value="'+x[0]+'"'+(Number(pref.fontSize)===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>' +
      '<div class="field"><label for="height">Radavstånd</label><select data-setting="lineHeight" id="height">'+
      [[1.45,'Kompakt'],[1.65,'Normal'],[1.9,'Luftigt']].map(x=>'<option value="'+x[0]+'"'+(Number(pref.lineHeight)===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div>' +
      '<div class="notice">Favoriter och anteckningar sparas bara lokalt i denna webbläsare. Rensning av webbplatsdata tar bort dem.</div></div>';
  }
  function aboutPage(){
    return '<div class="page"><h1 class="page-title">Om lagboken</h1><p>En fristående, mobilanpassad samling av prioriterade svenska lagar och förordningar.</p>' +
      '<div class="section-title">Rättskällor</div><p class="small muted">Författningstexterna hämtas från Sveriges riksdags öppna data. Polisens FAP länkas till Polismyndighetens författningssamling.</p>' +
      '<div class="section-title">Uppdateringsstatus</div><p class="small">Senast genomförd datainhämtning: '+html(window.LAGBOK_GENERATED||'Se respektive författning')+'.</p>' +
      '<div class="notice">Det här är inte en officiell lagtexttjänst. En importerad lydelse kan innehålla övergångsbestämmelser och framtida ikraftträdanden. Kontrollera den tillämpliga versionen i originalkällan.</div>' +
      '<p><a href="https://github.com/Deashi03/Lagbok" target="_blank" rel="noopener noreferrer">Öppna projektet på GitHub ↗</a></p></div>';
  }
  function findDirect(q) {
    const txt=q.trim();
    const spec=/^(.+?)\s+(\d{1,2})\s*[:.]\s*(\d+\s*[a-z]?)\s*§?$/i.exec(txt);
    const simple=/^(.+?)\s+(\d+\s*[a-z]?)\s*§?$/i.exec(txt);
    let m=spec||simple;
    if(!m)return null;
    const key=norm(m[1]);
    const meta=state.catalog.find(l=>norm(l.name)===key||norm(l.sfs)===key||(l.aliases||[]).some(a=>norm(a)===key));
    if(!meta)return null;
    return {meta,chapter:spec?spec[2]:'0',para:(spec?spec[3]:simple[2]).replace(/\s/g,'')};
  }
  function searchLawMatches(query){
    const n=norm(query);
    return state.catalog.filter(l=>norm([l.name,l.sfs,(l.aliases||[]).join(' ')].join(' ')).includes(n));
  }
  function searchPage(){
    return '<div class="page"><h1 class="page-title">Sök</h1><p class="intro">Sök i lagar och förordningar eller skriv ett lagrum, t.ex. RB 28:1.</p>' +
      searchBox('RB 24:7, OC, husrannsakan…') +
      '<div id="search-results"></div>' +footer()+'</div>';
  }
  function resultsHtml(query){
    const direct=findDirect(query);
    const laws=searchLawMatches(query);
    const faps=state.fap.filter(f=>norm([f.name,f.id,f.code,(f.tags||[]).join(' ')].join(' ')).includes(norm(query)));
    const intro=direct?'<div class="section-title">Gå direkt till</div><div class="card-list">'+listRow(direct.meta.name+' · '+(direct.chapter==='0'?'':direct.chapter+' kap. ')+direct.para+' §','Direkt till lagrum',urlFor(direct.meta.sfs,direct.chapter,direct.para))+'</div>':'';
    const lhtml=laws.length?'<div class="section-title">Författningar</div><div class="card-list">'+laws.map(lawRow).join('')+'</div>':'';
    const fhtml=faps.length?'<div class="section-title">FAP</div>'+fapResults(faps.slice(0,5)):'';
    return intro+lhtml+fhtml+'<div class="section-title">Träffar i lagtext</div><div id="text-results" class="search-results"><div class="loading">Söker i tillgänglig lagtext…</div></div>';
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
    if(r.page==='fap'){const box=$('#fap-results');if(box)box.innerHTML=fapResults(state.fap.filter(f=>norm([f.name,f.id,f.code,(f.tags||[]).join(' ')].join(' ')).includes(norm(val))));return;}
    let target=$('#search-results')||$('#home-results');
    if(!target)return;
    if(!val.trim()){target.innerHTML='';state.searchEpoch++;return;}
    target.innerHTML=resultsHtml(val);
    const epoch=++state.searchEpoch;
    setTimeout(()=>{if(state.searchEpoch===epoch)populateTextResults(val,epoch)},220);
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
    const tab = ['catalog','search','saved'].includes(r.page)?r.page:null;
    $$('.bottom-nav button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');});
    $('#back').hidden=['home','catalog','search','saved'].includes(r.page);
    $('#toc-button').hidden=r.page!=='law';
    const meta=lawById(r.sfs);
    $('#top-title').textContent = r.page==='law'?(meta?meta.name:'Lagbok'):({home:'Lagboken',catalog:'Lagbok',search:'Sök',saved:'Sparat',fap:'Polisens FAP',settings:'Inställningar',about:'Om'}[r.page]||'Lagboken');
    let markup;
    switch(r.page) {
      case 'home': markup=home();break;
      case 'catalog': markup=catalogPage();break;
      case 'search': markup=searchPage();break;
      case 'saved': markup=savedPage();break;
      case 'fap': markup=fapPage();break;
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
    if((r.page==='search'||r.page==='home')&&state.query) onSearch(state.query);
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
  view.addEventListener('input',e=>{if(e.target.id==='query')onSearch(e.target.value);});
  sheet.addEventListener('input',e=>{
    if(e.target.id==='toc-query'){
      const r=route(),meta=lawById(r.sfs),doc=state.laws.get(r.sfs);
      if(doc&&meta)$('#toc-results').innerHTML=tocEntries(meta,doc,r,e.target.value);
    }
  });
  document.addEventListener('change',e=>{
    if(e.target.dataset.setting){
      const key=e.target.dataset.setting;
      pref[key]=key==='theme'?e.target.value:Number(e.target.value);
      savePrefs();applyPrefs();toast('Inställning sparad');
    }
  });
  document.addEventListener('click',e=>{
    const close=e.target.closest('[data-action="close"]'); if(close){closeSheet();return;}
    const anchor=e.target.closest('a[data-link]');
    if(anchor){e.preventDefault();const dest=anchor.getAttribute('href');if(dest==='#/fap')state.query='';navigate(dest);return;}
    const btn=e.target.closest('[data-action]');
    if(!btn)return;
    const a=btn.dataset.action,k=btn.dataset.key;
    if(a==='fav')favToggle(k);
    if(a==='copy')copyParagraph(k);
    if(a==='note')note(k);
    if(a==='save-note'){
      const field=$('#note-text');
      if(field){const t=field.value.trim();if(t)pref.notes[k]=t;else delete pref.notes[k];savePrefs();closeSheet();render();toast('Anteckning sparad');}
    }
    if(a==='toc')toc();
  });
  $$('.bottom-nav button').forEach(b=>b.addEventListener('click',()=>{state.query='';navigate('#/'+b.dataset.tab);}));
  $('#back').addEventListener('click',()=>{if(history.length>1)history.back();else navigate('#/home');});
  $('#menu-button').addEventListener('click',()=>sheet.hidden?menu():closeSheet());
  $('#toc-button').addEventListener('click',toc);
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
    if(!location.hash)history.replaceState(null,'','#/home');
    render(true);
    if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
  }
  boot();
})();
