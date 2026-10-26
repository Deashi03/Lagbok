#!/usr/bin/env python3
"""SFS-import: hämta kompletta författningar från Riksdagens öppna data."""
import datetime as dt
import html
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/"data/catalog.json"
OUT=ROOT/"data/laws"
MIN={"1942:740":250,"1962:700":150,"1984:387":30,"1947:948":15,"1998:1276":90,"1951:649":4,"2009:400":180,"2017:900":30,"1964:167":15,"1976:511":7,"1993:1617":20,"1968:64":8,"1996:67":20,"1974:152":80}
# Kapitel kan ha bokstav, t.ex. "1 a kap." med ankaret K1a.
CAP=re.compile(r'<a\s+name="K(\d+[a-z]?)"[^>]*>\s*\d+\s*[a-z]?\s*kap\.\s*(.*?)</a>',re.I|re.S)
PAR=re.compile(r'<a\s+class="paragraf"\s+name="(?:K(\d+[a-z]?))?P(\d+[a-z]?)"[^>]*>\s*<b>\s*(\d+\s*[a-z]?)\s*§\s*</b>\s*</a>',re.I|re.S)
HEAD=re.compile(r'<h4\b[^>]*>(.*?)</h4>',re.I|re.S)
# Riksdagen markerar lydelser med t.ex. "/Träder i kraft I:2027-01-01/" först i paragrafen.
MARK=re.compile(r'^/\s*(Träder i kraft I|Upphör att gälla U)\s*:\s*([^/\n]*?)\s*/\s*',re.I)
# Markeringar för rubriker och kapitel hamnar i föregående paragrafs text och tas bort därifrån.
NOTE=re.compile(r'\s*/\s*(?:Rubriken|Kapitlet)\s+(?:träder i kraft|upphör att gälla)[^/\n]*/\s*',re.I)
AMEND=re.compile(r'(?:(?<=[.\n])|^)\s*((?:Lag|Förordning) ?\((\d{4}:\d+)\)\.?)\s*$')
REPEALED=re.compile(r'^(?:Har upphävts|Har upphört att gälla|Upphävd)\b',re.I)
LEGACY_SPLIT="\n\nALTERNATIV LYDELSE – KONTROLLERA IKRAFTTRÄDANDE:\n"
DATE=re.compile(r'\d{4}-\d{2}-\d{2}')
# Övergångsbestämmelser hamnar i Riksdagens text efter sista paragrafen och flyttas till en egen del.
TRANSITIONS=re.compile(r'\n\s*(?:Ikraftträdande- och )?[ÖO]vergångsbestämmelser\s*\n')
TRANSITION_SFS=re.compile(r'^(\d{4}:\d+(?: \d)?)\s*$',re.M)
def slug(sfs):return sfs.replace(":","-").replace(" ","-")
def clear(s):
    s=re.sub(r"<br\s*/?>","\n",s,flags=re.I)
    s=re.sub(r"</?(?:p|div|li|ol|ul)\b[^>]*>","\n",s,flags=re.I)
    s=html.unescape(re.sub(r"<[^>]*>","",s)).replace("\xa0"," ")
    s=re.sub(r"[ \t]+"," ",s)
    return re.sub(r"\n{3,}","\n\n",re.sub(r" *\n *","\n",s)).strip()
def tidy(s):
    s=str(s or "").replace("\r","").replace("\xa0"," ")
    s="\n".join(re.sub(r"[ \t]+"," ",line).strip() for line in s.split("\n"))
    return re.sub(r"\n{3,}","\n\n",s).strip()
def when(label):
    label=re.sub(r"\s+genom\s+(?:lag|förordning)\s*\(\d{4}:\d+\)\.?$","",label.strip(),flags=re.I).rstrip(".")
    m=DATE.search(label)
    return {"date":m[0] if m else None,"label":label}
def version(raw):
    """En lydelse: ren text, ändringsförfattning och eventuellt ikraftträdande/upphörande."""
    text=tidy(raw);out={}
    cut=TRANSITIONS.search("\n"+text)
    if cut:
        out["_transitions"]=text[cut.end()-1:].strip();text=text[:max(0,cut.start()-1)].rstrip()
    while True:
        m=MARK.match(text)
        if not m:break
        out["inForce" if m[1].lower().startswith("träder") else "expires"]=when(m[2])
        text=text[m.end():]
    text=tidy(NOTE.sub("\n\n",text))
    m=AMEND.search(text)
    if m and m.start(1)>0:
        out["amendedBy"]=m[2];text=text[:m.start()].rstrip()
    out["text"]=text
    return out
def build_para(number,raws):
    versions=[version(r) for r in raws if r and r.strip()]
    transitions=[v.pop("_transitions") for v in versions if "_transitions" in v]
    first=versions[0]
    item={"type":"para","number":number,"text":first["text"]}
    if len(versions)>1 or "inForce" in first or "expires" in first:
        item["versions"]=versions
    elif "amendedBy" in first:
        item["amendedBy"]=first["amendedBy"]
    if all(REPEALED.match(v["text"]) for v in versions):item["repealed"]=True
    if transitions:item["_transitions"]=transitions[0]
    return item
def split_transitions(block):
    """Delar övergångsbestämmelser per ändringsförfattning: [{"sfs":"2023:372","text":"…"}]."""
    parts=[];marks=list(TRANSITION_SFS.finditer(block))
    if not marks or marks[0].start()>0:
        head=block[:marks[0].start()] if marks else block
        if head.strip():parts.append({"sfs":None,"text":head.strip()})
    for i,m in enumerate(marks):
        end=marks[i+1].start() if i+1<len(marks) else len(block)
        text=block[m.end():end].strip()
        if text:parts.append({"sfs":m[1],"text":text})
    return parts
def take_transitions(chs):
    found=[]
    for c in chs:
        for p in c["items"]:
            if "_transitions" in p:found.append(p.pop("_transitions"))
    return split_transitions("\n".join(found)) if found else []
def amendment_key(sfs):
    y,n=sfs.split(":");return (int(y),int(n.split()[0]))
def latest_amendment(chs):
    found=[v.get("amendedBy") for c in chs for p in c["items"] if p["type"]=="para" for v in (p.get("versions") or [p])]
    found=[f for f in found if f]
    return max(found,key=amendment_key) if found else None
def num(s):
    m=re.fullmatch(r"(\d+)\s*([a-z]?)",s.strip().lower())
    if not m:raise ValueError("bad section "+s)
    return m[1]+(" "+m[2] if m[2] else "")
def finish(caps):
    # Riksdagen may repeat a whole chapter for alternative or future versions.
    # Merge duplicate chapter identifiers WITHOUT discarding any paragraph text.
    by_id={};merged=[]
    for ch in caps:
        if ch["number"] not in by_id:
            by_id[ch["number"]]=ch;merged.append(ch)
        else:
            target=by_id[ch["number"]]
            for item in ch["items"]:
                if item["type"]=="para":
                    for raw in item["raw"]:add(target,item["number"],raw)
                else:target["items"].append(item)
    caps=merged
    caps=[c for c in caps if any(p["type"]=="para" for p in c["items"])]
    for c in caps:
        c["items"]=[build_para(x["number"],x["raw"]) if x["type"]=="para" else x for x in c["items"]]
        waiting=[]
        for p in c["items"]:
            if p["type"]=="heading":waiting.append(p)
            else:
                for h in waiting:h["nextPara"]=p["number"]
                waiting=[]
        c["items"]=[x for x in c["items"] if x["type"]!="heading" or x.get("nextPara")]
    return caps
def add(c,n,text):
    if not text:return
    prev=next((i for i in reversed(c["items"]) if i["type"]=="para" and i["number"]==n),None)
    if prev:prev["raw"].append(text)
    else:c["items"].append({"type":"para","number":n,"raw":[text]})
def parse_html(source):
    match=re.search(r"<hr\b[^>]*>",source,re.I)
    if match:source=source[match.end():]
    source=re.sub(r'<div\s+class="sfstoc"[^>]*>.*?</div>',"",source,flags=re.S|re.I)
    markers=[]
    for m in CAP.finditer(source):markers.append((m.start(),m.end(),"cap",num(m[1]),clear(m[2])))
    for m in PAR.finditer(source):markers.append((m.start(),m.end(),"para",num(m[1]) if m[1] else "0",num(m[3])))
    for m in HEAD.finditer(source):
        h=clear(m[1])
        if h and len(h)<150:markers.append((m.start(),m.end(),"heading","",h))
    markers.sort(key=lambda x:x[0])
    chapters=[];cur=None
    for i,(_,end,typ,key,value) in enumerate(markers):
        nxt=markers[i+1][0] if i+1<len(markers) else len(source)
        if typ=="cap":
            cur={"number":key,"title":value,"items":[]};chapters.append(cur)
        elif typ=="heading":
            if cur is None:
                cur={"number":"0","title":"","items":[]};chapters.append(cur)
            cur["items"].append({"type":"heading","text":value,"editorial":False})
        else:
            if cur is None or cur["number"]!=key:
                cur=next((c for c in chapters if c["number"]==key),None)
                if cur is None:
                    cur={"number":key,"title":"","items":[]};chapters.append(cur)
            add(cur,value,clear(source[end:nxt]))
    return finish(chapters)
def parse_text(raw):
    chapters=[];cur={"number":"0","title":"","items":[]};chapters.append(cur);p=None
    for line in raw.splitlines():
        line=line.strip()
        if not line:
            if p:p["raw"][-1]+="\n"
            continue
        m=re.match(r"^(\d+\s*[a-z]?)\s*kap\.\s*(.*)",line)
        if m:
            cur={"number":num(m[1]),"title":m[2],"items":[]};chapters.append(cur);p=None;continue
        m=re.match(r"^(\d+\s*[a-z]?)\s*§\s*(.*)",line,re.I)
        if m:
            n=num(m[1]);add(cur,n,m[2] or " ");p=next(x for x in reversed(cur["items"]) if x["type"]=="para" and x["number"]==n)
        elif p:p["raw"][-1]+="\n"+line
        elif len(line)<110 and not re.match(r"^\d+\s",line):
            cur["items"].append({"type":"heading","text":line,"editorial":False})
    return finish(chapters)
def count(chs):return sum(x["type"]=="para" for c in chs for x in c["items"])
def validate(chs,id):
    if count(chs)<MIN.get(id,5):raise ValueError("insufficient sections "+str(count(chs)))
    seen=set()
    for c in chs:
        for p in c["items"]:
            if p["type"]!="para":continue
            key=(c["number"],p["number"])
            if key in seen or any(len(v["text"])<4 for v in p.get("versions") or [p]):raise ValueError("duplicate or empty section "+str(key))
            seen.add(key)
def editorial(chs,sfs):
    if sfs!="1942:740":return
    c=next((x for x in chs if x["number"]=="28"),None)
    if c is None:return
    idx=next((i for i,x in enumerate(c["items"]) if x["type"]=="para" and x["number"]=="1"),None)
    if idx is None:return
    if idx and c["items"][idx-1]["type"]=="heading" and "husrannsakan" in c["items"][idx-1]["text"].lower():return
    c["items"].insert(idx,{"type":"heading","text":"Husrannsakan","editorial":True,"nextPara":"1"})
REPEALED_HEADER=re.compile(r'Upph(?:ä|&auml;)vd\s*(?:</?\w+[^>]*>\s*)*:?\s*(?:</?\w+[^>]*>\s*)*(\d{4}-\d{2}-\d{2})',re.I)
def check_in_force(doc):
    """Upphävda författningar finns kvar i Riksdagens databas men ska inte in i lagboken."""
    head=(doc.get("html") or "")
    hr=re.search(r"<hr\b",head,re.I)
    head=head[:hr.start()] if hr else head[:3000]
    m=REPEALED_HEADER.search(head) or REPEALED_HEADER.search((doc.get("text") or "")[:1500])
    if m:raise ValueError("upphävd författning ("+m[1]+")")
def check_title(meta,official):
    """Skydd mot fel SFS-nummer i katalogen: Riksdagens titel måste innehålla kontrollordet."""
    expected=meta.get("check")
    flat=lambda t:re.sub(r"\s+"," ",re.sub(r"[^\wåäö\- ]"," ",re.sub(r"\(\d{4}:\d+(?: \d)?\)","",str(t or "")).lower())).strip()
    if expected and flat(expected) not in flat(official):
        raise ValueError("titelkontroll: väntade '"+expected+"' i '"+str(official)+"'")
def document(id,name,method,chs,official=None):
    transitions=take_transitions(chs)
    out={"sfs":id,"title":name,"officialTitle":official,"sourceUrl":"https://data.riksdagen.se/dokument/sfs-"+slug(id)+".html","parser":method,
            "fetchedAt":dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),"latestAmendment":latest_amendment(chs),"chapters":chs}
    if transitions:out["transitions"]=transitions
    return out
LONG_PARAGRAPH=15000
def quality_warnings(old,new):
    """Tecken på tolkningsfel: kraftigt minskat antal paragrafer, tappade kapitel eller sammanklistrad text."""
    warn=[];a,b=paragraphs(old),paragraphs(new)
    if old and len(b)<0.9*len(a):warn.append("antalet paragrafer minskade från "+str(len(a))+" till "+str(len(b)))
    if old:
        lost=sorted({c["number"] for c in old["chapters"]}-{c["number"] for c in new["chapters"]})
        if lost:warn.append("kapitel saknas: "+", ".join(lost))
    long=[label(k) for k,p in b.items() if max(len(v["text"]) for v in p.get("versions") or [p])>LONG_PARAGRAPH]
    if long:warn.append("ovanligt långa paragrafer: "+", ".join(long[:10]))
    return warn
def paragraphs(doc):
    return {(c["number"],p["number"]):p for c in (doc or {}).get("chapters",[]) for p in c["items"] if p["type"]=="para"}
def label(key):return (key[0]+" kap. " if key[0]!="0" else "")+key[1]+" §"
def describe_changes(name,id,old,new):
    """Kort markdownsammanfattning av vad som ändrats, för granskning i pull request."""
    lines=["### "+name+" (SFS "+id+")"]
    if old is None:return "\n".join(lines+["Ny författning i lagboken."]+["- ⚠️ Kontrollera: "+w for w in quality_warnings(None,new)])
    a,b=paragraphs(old),paragraphs(new)
    added=[k for k in b if k not in a];removed=[k for k in a if k not in b]
    changed=[k for k in b if k in a and a[k]!=b[k]]
    upcoming=[k for k in changed+added if any("inForce" in v for v in b[k].get("versions",[]))]
    if new.get("latestAmendment")!=old.get("latestAmendment"):lines.append("- Senaste ändring: SFS "+str(new.get("latestAmendment")))
    for title,keys in (("Nya paragrafer",added),("Ändrade paragrafer",changed),("Borttagna paragrafer",removed),("Med kommande lydelse",upcoming)):
        if keys:lines.append("- "+title+" ("+str(len(keys))+"): "+", ".join(label(k) for k in keys[:40])+(" …" if len(keys)>40 else ""))
    for w in quality_warnings(old,new):lines.append("- ⚠️ Kontrollera: "+w)
    if len(lines)==1:lines.append("- Endast struktur eller metadata ändrad.")
    return "\n".join(lines)
def write_report(report,fail):
    target=os.environ.get("CHANGE_REPORT")
    text="## Ändringar från Riksdagens öppna data\n\n"+("\n\n".join(report) if report else "Inga ändringar i lagtexten.")
    if fail:text+="\n\n**Kunde inte importeras:**\n"+"\n".join("- "+f for f in fail)
    text+="\n\nKontrollera lagtext, ikraftträdande och övergångsbestämmelser innan sammanslagning. Redaktionella rubriker kontrolleras av testerna."
    print(text)
    if target:Path(target).write_text(text+"\n",encoding="utf-8")
def fetch(sfs):
    url="https://data.riksdagen.se/dokument/sfs-"+slug(sfs)+".json"
    req=Request(url,headers={"User-Agent":"LagbokenImporter/0.1","Accept":"application/json"})
    for attempt in range(3):
        try:
            with urlopen(req,timeout=50) as f:return json.load(f)
        except Exception:
            if attempt==2:raise
            time.sleep(attempt+1)
def run():
    catalog=json.loads(CATALOG.read_text(encoding="utf-8"));changed=False;fail=[];report=[]
    for meta in catalog["laws"]:
        id=meta["sfs"]
        try:
            doc=fetch(id).get("dokumentstatus",{}).get("dokument",{})
            official=doc.get("titel")
            check_title(meta,official)
            check_in_force(doc)
            chs=parse_html(doc.get("html") or "")
            method="HTML"
            if count(chs)<MIN.get(id,5):
                chs=parse_text(doc.get("text") or "");method="TEXT"
            validate(chs,id)
            editorial(chs,id)
            output=document(id,meta["name"],method,chs,official)
            chaptered=any(c["number"]!="0" for c in chs)
            if meta.get("chaptered")!=chaptered:meta["chaptered"]=chaptered;changed=True
            file=OUT/(slug(id)+".json")
            previous=None
            if file.exists():
                previous=json.loads(file.read_text(encoding="utf-8"))
                if {k:v for k,v in output.items() if k!="fetchedAt"}=={k:v for k,v in previous.items() if k!="fetchedAt"}:
                    print(id,"unchanged");continue
            report.append(describe_changes(meta["name"],id,previous,output))
            OUT.mkdir(parents=True,exist_ok=True)
            file.write_text(json.dumps(output,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
            print(id,"imported",count(chs),"paragraphs",method)
            changed=True
        except Exception as ex:
            print(id,"FAILED",ex,file=sys.stderr);fail.append(id+" ("+meta["name"]+"): "+str(ex)[:200])
            # En författning som aldrig har kunnat importeras döljs i appen tills importen lyckas.
            if not (OUT/(slug(id)+".json")).exists() and meta.get("available") is not False:
                meta["available"]=False;changed=True
            continue
        if meta.get("available") is False:
            meta.pop("available");changed=True
    if changed:
        catalog["generated"]=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        CATALOG.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    if changed and not report:report.append("Katalogen uppdaterad (kapitelindelning).")
    write_report(report,fail)
    # Misslyckade författningar stoppar inte övriga; arbetsflödet markeras som misslyckat efter granskningsförslaget.
    if fail and not os.environ.get("CHANGE_REPORT"):sys.exit("Manual review needed: "+", ".join(fail))
if __name__=="__main__":run()
