// Kvalitetskontroll av all importerad lagtext: tecken på tolkningsfel ska upptäckas före publicering.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const catalog=require('../data/catalog.json');
const file=sfs=>path.join(__dirname,'..','data','laws',sfs.replace(/[: ]/g,'-')+'.json');
const sfsSet=new Set();let laws=0,paras=0;
for(const law of catalog.laws){
 assert.ok(!sfsSet.has(law.sfs),'dubblett i katalogen: '+law.sfs);sfsSet.add(law.sfs);
 assert.ok(catalog.sections.some(s=>s.id===law.section),law.sfs+' saknar giltig sektion');
 if(law.parent)assert.ok(catalog.laws.some(l=>l.sfs===law.parent&&!l.parent),law.sfs+': okänd överordnad balk '+law.parent);
 if(!fs.existsSync(file(law.sfs)))continue;
 const doc=JSON.parse(fs.readFileSync(file(law.sfs),'utf8'));laws++;
 const keys=new Set();
 for(const ch of doc.chapters)for(const p of ch.items){
  if(p.type!=='para')continue;paras++;
  const k=ch.number+'|'+p.number;assert.ok(!keys.has(k),law.sfs+' dubblerad paragraf '+k);keys.add(k);
  for(const v of p.versions||[p]){
   assert.ok(!/\n\s*(?:Ikraftträdande- och )?Övergångsbestämmelser\s*\n/.test(v.text),law.sfs+' '+k+': övergångsbestämmelser i paragraftext');
   assert.ok(v.text.length<15000,law.sfs+' '+k+': ovanligt lång paragraf ('+v.text.length+' tecken)');
   assert.ok(!/\r/.test(v.text),law.sfs+' '+k+': vagnretur i text');
  }
 }
 assert.ok(keys.size>0,law.sfs+' saknar paragrafer');
}
console.log('Datakvalitet: '+laws+' författningar och '+paras+' paragrafer kontrollerade');
