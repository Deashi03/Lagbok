const assert=require('node:assert/strict');
const {parseQuick,resolvedQuick}=require('../assets/search-core.js');
const laws=[
 {sfs:'1962:700',name:'Brottsbalken',aliases:['BrB'],chaptered:true},
 {sfs:'1942:740',name:'Rättegångsbalken',aliases:['RB'],chaptered:true},
 {sfs:'1947:948',name:'Förundersökningskungörelsen',aliases:['FuK'],chaptered:false},
 {sfs:'1984:387',name:'Polislagen',aliases:['PL'],chaptered:false}
];
const faps=[{id:'FAP 104-04',name:'OC-spray'}];
const doc={chapters:[{number:'1',items:[{type:'para',number:'1'}]},{number:'24',items:[{type:'para',number:'1'},{type:'para',number:'2 a'}]}]};
const q=s=>parseQuick(s,laws,faps);
assert.deepEqual([q('BrB 1').chapter,q('BrB 1').para],['1',null]);
assert.deepEqual([q('BrB 24:1').chapter,q('BrB 24:1').para],['24','1']);
assert.deepEqual([q('brb24:1').chapter,q('brb24:1').para],['24','1']);
assert.deepEqual([q('BrB 24 kap. 1 §').chapter,q('BrB 24 kap. 1 §').para],['24','1']);
assert.deepEqual([q('RB 28:1').chapter,q('RB 28:1').para],['28','1']);
assert.deepEqual([q('FuK 12').chapter,q('FuK 12').para],['0','12']);
assert.deepEqual([q('PL 10').chapter,q('PL 10').para],['0','10']);
assert.equal(q('FAP 104-4').fap.id,'FAP 104-04');
assert.equal(q('husrannsakan'),null);
assert.equal(q('BrB 24:'),null);
assert.equal(q('BrB 1a'),null);
assert.equal(q('FuK 12:1'),null);
assert.equal(resolvedQuick(q('BrB 24:1'),doc).para,'1');
assert.equal(resolvedQuick(q('BrB 24:2a'),doc).para,'2a');
assert.equal(resolvedQuick(q('BrB 24:7'),doc),null);
assert.equal(resolvedQuick(q('BrB 30'),doc),null);
console.log('Snabbkoder: 16 kontroller godkända');
