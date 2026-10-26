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
 // Penna, markering och ångra
 await page.goto(B+'#/law/1942%3A740/24/7');await wait(900);
 await page.click('.pen-toggle');await wait(300);
 const box=await page.locator('#p-7 > .paragraph-content p').first().boundingBox();
 await page.mouse.click(box.x+15,box.y+12);await wait(200);await page.mouse.click(box.x+200,box.y+12);await wait(600);
 assert.equal(await page.locator('#p-7 mark.hl').count(),1);
 await page.click('[data-action="toast-undo"]');await wait(500);
 assert.equal(await page.locator('#p-7 mark.hl').count(),0);
 // Snabbhopp
 await page.click('[data-action="pen-done"]');await page.click('#in-law-search');await page.fill('#jump-query','rb 23 8b');await page.press('#jump-query','Enter');await wait(800);
 assert.equal(await page.evaluate(()=>location.hash),'#/law/1942%3A740/23/8b');
 // Sparat: egna markeringar och anteckningar först
 await page.goto(B+'#/saved');await wait(600);
 assert.match(await page.locator('#view .section-title').first().textContent(),/Markeringar och anteckningar/);
 assert.deepEqual(errors,[]);
 console.log('Webbläsartest: katalog, kopplingar, meny, sök, penna, ångra, snabbhopp och Sparat godkända');
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
