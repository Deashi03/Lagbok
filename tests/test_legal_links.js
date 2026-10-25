const assert=require('node:assert/strict');
const {parseRefs,linkify}=require('../assets/legal-links.js');
const href=(s,c,p)=>'#/law/'+encodeURIComponent(s)+'/'+c+'/'+p;
const exists=(s,c,p)=>!!({
 '1962:700':{'8':['1','2'],'24':['1','2']},
 '1942:740':{'23':['1','2'],'28':['1']},
 '1947:948':{'0':['12']},
 '1984:387':{'0':['10']}
}[s]?.[c]?.includes(p));
const local={sfs:'1962:700',chapter:'8',href,exists};
const a=linkify('Är brott som avses i 1 § med hänsyn till värdet ringa.',local);
assert.match(a,/class="law-ref"/);
assert.match(a,/#\/law\/1962%3A700\/8\/1/);
assert.match(linkify('24 kap. 1 § brottsbalken',local),/#\/law\/1962%3A700\/24\/1/);
assert.match(linkify('23 kap. 1 § rättegångsbalken',local),/#\/law\/1942%3A740\/23\/1/);
assert.match(linkify('10 § polislagen',local),/#\/law\/1984%3A387\/0\/10/);
assert.doesNotMatch(linkify('Fråga enligt 7 § lagen (2020:123)',local),/class="law-ref"/);
assert.doesNotMatch(linkify('Se 99 § i detta kapitel',local),/class="law-ref"/);
assert.doesNotMatch(linkify('Lag (2017:442).',local),/class="law-ref"/);
assert.deepEqual(parseRefs('23 kap. 1 § rättegångsbalken',local)[0].numbers,['1']);
console.log('Juridiska länkar: 9 kontroller godkända');

assert.match(linkify('Se 1 och 2 §§ i detta kapitel',local),/data-ref-para="1"/);
assert.match(linkify('Se 1 och 2 §§ i detta kapitel',local),/data-ref-para="2"/);
