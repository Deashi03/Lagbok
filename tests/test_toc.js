const assert=require('node:assert/strict');
const toc=require('../assets/toc-model.js');
const data={
 number:'28',title:'Om husrannsakan',
 items:[
 {type:'heading',text:'Husrannsakan',editorial:true,nextPara:'1'},
 {type:'para',number:'1',text:'Om det finns anledning att anta att ett brott har begåtts.'},
 {type:'para',number:'2',text:'För att söka efter den som ska gripas.'},
 {type:'para',number:'3 a',text:'Husrannsakan får beslutas endast om skälen för åtgärden uppväger intrånget.'},
 {type:'heading',text:'Genomsökning på distans',editorial:false,nextPara:'10 a'},
 {type:'para',number:'10 a',text:'Genomsökning på distans innebär att söka efter handlingar.'}
 ]};
const groups=toc.chapterGroups('1942:740',data);
assert.equal(groups[0].title,'Husrannsakan – reell och personell');
assert.equal(groups[0].paragraphs[0].title,'Reell husrannsakan');
assert.equal(groups[0].paragraphs[1].title,'Personell husrannsakan');
assert.equal(groups[1].title,'Proportionalitet, beslut och verkställighet');
assert.equal(groups[2].title,'Genomsökning på distans');
assert.equal(groups[2].origin,'källa');
assert.equal(toc.chapterMatches(data,groups,'reell husrannsakan'),true);
assert.equal(toc.chapterMatches(data,groups,'10 a §'),true);
assert.equal(toc.chapterMatches(data,groups,'häktning'),false);
assert.equal(toc.description('1962:700','8',{number:'3',text:'Har upphävts.'}).text,'Upphävd paragraf');
const others=toc.chapterGroups('1998:1276',{number:'1',title:'Allmänt',items:[{type:'para',number:'1',text:'Denna förordning gäller trafik på väg.'}]});
assert.ok(others[0].paragraphs[0].title.includes('Denna förordning'));
console.log('Innehållsförteckning: rubriceringar och grupper godkända');

const fs=require('node:fs');
const path=require('node:path');
const catalog=require('../data/catalog.json');
let total=0;
for(const law of catalog.laws){
 const pathname=path.join(__dirname,'..','data','laws',law.sfs.replace(':','-')+'.json');
 const source=JSON.parse(fs.readFileSync(pathname,'utf8'));
 for(const chapter of source.chapters){
   const grouped=toc.chapterGroups(law.sfs,chapter);
   const input=chapter.items.filter(x=>x.type==='para').map(x=>String(x.number));
   const flattened=grouped.flatMap(g=>g.paragraphs.map(x=>x.number));
   assert.deepEqual(flattened,input,law.sfs+' kap. '+chapter.number);
   total+=input.length;
 }
}
assert.ok(total>2500,'Katalogen bör täcka alla importerade paragrafer');
console.log('Fullständighet: '+total+' paragrafer bevarade i innehållsförteckningen');
