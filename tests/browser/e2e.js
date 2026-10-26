// Webbläsartest i iPhone-storlek av de viktigaste flödena. Kräver en lokal server:
//   python3 -m http.server 8765  &&  node tests/browser/e2e.js
const assert=require('node:assert/strict');
const {chromium,devices}=require('playwright');
const B=process.env.LAGBOK_URL||'http://localhost:8765/';
(async()=>{
 const browser=await chromium.launch();
 const page=await (await browser.newContext({...devices['iPhone 13']})).newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const wait=ms=>page.waitForTimeout(ms);
 // Katalog i lagbokens ordning, balkarna med anslutande författningar synliga
 // Introduktion vid första starten: bläddra igenom, bekräfta, och den ska inte komma tillbaka
 await page.goto(B+'#/catalog');await page.waitForSelector('#tutorial');
 for(let i=0;i<20&&await page.locator('[data-tut="next"]').count();i++){await page.click('[data-tut="next"]');}
 assert.match(await page.textContent('.tut-sign'),/Jonathan/);
 await page.click('[data-tut="done"]');await wait(400);
 assert.equal(await page.locator('#tutorial').count(),0);
 await page.reload();await page.waitForSelector('.law-tree');await wait(400);
 assert.equal(await page.locator('#tutorial').count(),0,'introduktionen visas bara en gång');
 await page.goto(B+'#/settings');await wait(500);await page.click('[data-action="tutorial"]');await page.waitForSelector('#tutorial');
 await page.click('[data-tut="skip"]');await page.click('[data-tut="done"]');await wait(300);
 await page.goto(B+'#/catalog');await page.waitForSelector('.law-tree');
 assert.equal(await page.locator('.cat-section .cat-name').first().textContent(),'Grundlagar');
 assert.equal(await page.locator('.cat-section[open]').count(),2,'grundlagar och balkar är öppna från början');
 assert.ok(await page.locator('.law-tree .tree-row').first().isVisible());
 // Kopplingar lag ↔ förordning
 await page.goto(B+'#/law/1942%3A740/23/1');await wait(900);
 assert.match((await page.locator('#p-1 .link-chip').allTextContents()).join(' '),/Kompletteras av FuK 1 §/);
 // Menyn glider upp utan att hoppa i sidled
 await page.locator('#p-1 .link-chip').first().click();
 const lefts=new Set();for(let i=0;i<6;i++){lefts.add(await page.evaluate(()=>Math.round(document.querySelector('#sheet').getBoundingClientRect().left)));await wait(50);}
 assert.equal(lefts.size,1,'menyn får inte flytta sig i sidled under animationen');
 await page.keyboard.press('Escape');
 // Sök i författningen, även över kapitelgränser
 await page.goto(B+'#/law/1942%3A740/24/1');await wait(900);
 await page.click('[data-action="find-open"]');await page.fill('#find-input','gripa');await wait(400);
 assert.match(await page.textContent('#find-count'),/träffar/);
 await page.press('#find-input','Enter');await wait(700);
 assert.ok(await page.locator('mark.find-hit').count()>0);
 assert.equal(await page.locator('#find-button.on').count(),1,'⌕ i rubrikraden visar att sökningen är öppen');
 const at1=await page.textContent('#find-count');await page.click('[data-action="find-next"]');await wait(600);
 assert.notEqual(await page.textContent('#find-count'),at1,'↓ hoppar till nästa träff');
 await page.click('[data-action="find-all"]');await wait(900);
 assert.equal(await page.evaluate(()=>location.hash),'#/catalog');
 assert.equal(await page.inputValue('#query'),'gripa','sökordet följer med till hela lagboken');
 await page.goBack();await wait(900);
 assert.equal(await page.locator('.reader-context').count(),0,'ingen extra rad när sökningen är stängd');
 // Penna, markering och ångra
 await page.goto(B+'#/law/1942%3A740/24/7');await wait(900);
 await page.click('#pen-button');await wait(300);
 const box=await page.locator('#p-7 > .paragraph-content p').first().boundingBox();
 await page.mouse.click(box.x+15,box.y+12);await wait(200);await page.mouse.click(box.x+200,box.y+12);await wait(600);
 assert.equal(await page.locator('#p-7 mark.hl').count(),1);
 await page.click('[data-action="toast-undo"]');await wait(500);
 assert.equal(await page.locator('#p-7 mark.hl').count(),0);
 // Snabbhopp
 // Dra med pennan över några ord i samma stycke
 const dbox=await page.locator('#p-7 > .paragraph-content p').first().boundingBox();
 const before=await page.locator('#p-7 mark.hl').count();
 await page.mouse.move(dbox.x+8,dbox.y+12);await page.mouse.down();
 for(let i=1;i<=6;i++)await page.mouse.move(dbox.x+8+i*30,dbox.y+12);
 await page.mouse.up();await wait(400);
 assert.equal(await page.locator('#p-7 mark.hl').count(),before+1,'ett drag med pennan ger en markering');
 assert.ok((await page.locator('#p-7 mark.hl').last().textContent()).trim().split(/\s+/).length>=2,'draget markerar flera ord');
 await page.click('[data-action="pen-done"]');if(!await page.locator('#find-input').count())await page.click('#find-button');await wait(300);await page.fill('#find-input','rb 23 8b');await page.press('#find-input','Enter');await wait(800);
 assert.equal(await page.evaluate(()=>location.hash),'#/law/1942%3A740/23/8b');
 // Sparat: egna markeringar och anteckningar först
 await page.goto(B+'#/saved');await wait(600);
 assert.match(await page.locator('#view .section-title').first().textContent(),/Markeringar och anteckningar/);
 // Favoriter: lag och kapitel blir genvägar överst i katalogen
 await page.goto(B+'#/law/1962%3A700');await wait(900);
 await page.click('.law-head [data-action="fav"]');await wait(300);
 await page.goto(B+'#/law/1942%3A740/24');await wait(900);
 await page.click('.reader-heading .fav-star');await wait(300);
 await page.goto(B+'#/catalog');await wait(700);
 const chips=await page.locator('.fav-row .fav-chip').allTextContents();
 assert.ok(chips.includes('BrB')&&chips.includes('RB 24 kap.'),'favoriterna ska synas som genvägar: '+chips.join(', '));
 const top=await page.locator('.section-index .chip').allTextContents();
 assert.ok(top.length>=1&&top.length<=2&&top[0].includes('Register A–Ö'),'överst finns bara A–Ö och Nytt i lagen: '+top.join(', '));
 // Anslutande förordningar samlas på en rad som öppnar en lista
 await page.goto(B+'#/law/1984%3A387');await wait(900);
 assert.match(await page.textContent('.relation-row'),/anslutande förordning/);
 await page.click('.relation-row');await wait(400);
 assert.match(await page.textContent('.sheet'),/Polisförordning/i);
 await page.keyboard.press('Escape');await wait(200);
 // Om Lagboken
 await page.goto(B+'#/about');await wait(600);
 assert.match(await page.textContent('#view'),/Svensk författningssamling/);
 // Lydelse vid datum
 await page.goto(B+'#/law/1949%3A381/2/10');await wait(900);
 await page.evaluate(()=>{const b=document.querySelector('#p-10 [data-action="para-menu"]');b&&b.click();});await wait(400);
 await page.click('[data-action="history"]');await wait(300);
 await page.fill('#at-date','2027-06-01');await page.click('#date-form button[type=submit]');await wait(800);
 assert.ok(await page.locator('.date-banner').count()===1,'datumraden visas');
 await page.click('.date-banner [data-action="date-clear"]');await wait(500);
 // Nytt i lagen
 await page.goto(B+'#/nytt');await wait(800);
 assert.match(await page.textContent('#view h1'),/Nytt i lagen/);
 assert.deepEqual(errors,[]);
 console.log('Webbläsartest: katalog, kopplingar, meny, sök, penna, ångra, snabbhopp, Sparat, introduktion, favoriter, anslutande förordningar, Om Lagboken, lydelse vid datum och Nytt i lagen godkända');
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
