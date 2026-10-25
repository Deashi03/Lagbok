#!/usr/bin/env python3
"""SFS-import: hämta kompletta författningar från Riksdagens öppna data."""
import datetime as dt
import html
import json
from pathlib import Path
import re
import sys
import time
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/"data/catalog.json"
OUT=ROOT/"data/laws"
MIN={"1942:740":250,"1962:700":150,"1984:387":30,"1947:948":15,"1998:1276":90,"1951:649":4,"2009:400":180,"2017:900":30,"1964:167":15,"1976:511":7,"1993:1617":20,"1968:64":8,"1996:67":20,"1974:152":80}
CAP=re.compile(r'<a\s+name="K(\d+)"[^>]*>\s*\d+\s*kap\.\s*(.*?)</a>',re.I|re.S)
PAR=re.compile(r'<a\s+class="paragraf"\s+name="(?:K(\d+))?P(\d+[a-z]?)"[^>]*>\s*<b>\s*(\d+\s*[a-z]?)\s*§\s*</b>\s*</a>',re.I|re.S)
HEAD=re.compile(r'<h4\b[^>]*>(.*?)</h4>',re.I|re.S)
def clear(s):
    s=re.sub(r"<br\s*/?>","\n",s,flags=re.I)
    s=re.sub(r"</?(?:p|div|li|ol|ul)\b[^>]*>","\n",s,flags=re.I)
    s=html.unescape(re.sub(r"<[^>]*>","",s)).replace("\xa0"," ")
    s=re.sub(r"[ \t]+"," ",s)
    return re.sub(r"\n{3,}","\n\n",re.sub(r" *\n *","\n",s)).strip()
def num(s):
    m=re.fullmatch(r"(\d+)\s*([a-z]?)",s.strip().lower())
    if not m:raise ValueError("bad section "+s)
    return m[1]+(" "+m[2] if m[2] else "")
def finish(caps):
    caps=[c for c in caps if any(p["type"]=="para" for p in c["items"])]
    for c in caps:
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
    if prev:
        prev["hasVariants"]=True
        prev["text"]+="\n\nALTERNATIV LYDELSE – KONTROLLERA IKRAFTTRÄDANDE:\n"+text
    else:c["items"].append({"type":"para","number":n,"text":text})
def parse_html(source):
    match=re.search(r"<hr\b[^>]*>",source,re.I)
    if match:source=source[match.end():]
    source=re.sub(r'<div\s+class="sfstoc"[^>]*>.*?</div>',"",source,flags=re.S|re.I)
    markers=[]
    for m in CAP.finditer(source):markers.append((m.start(),m.end(),"cap",m[1],clear(m[2])))
    for m in PAR.finditer(source):markers.append((m.start(),m.end(),"para",m[1] or "0",num(m[3])))
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
            if p:p["text"]+="\n"
            continue
        m=re.match(r"^(\d+)\s*kap\.\s*(.*)",line)
        if m:
            cur={"number":m[1],"title":m[2],"items":[]};chapters.append(cur);p=None;continue
        m=re.match(r"^(\d+\s*[a-z]?)\s*§\s*(.*)",line,re.I)
        if m:
            n=num(m[1]);add(cur,n,m[2]);p=next(x for x in reversed(cur["items"]) if x["type"]=="para" and x["number"]==n)
        elif p:p["text"]+="\n"+line
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
            if key in seen or len(p["text"])<4:raise ValueError("duplicate or empty section "+str(key))
            seen.add(key)
def editorial(chs,sfs):
    if sfs!="1942:740":return
    c=next((x for x in chs if x["number"]=="28"),None)
    if c is None:return
    idx=next((i for i,x in enumerate(c["items"]) if x["type"]=="para" and x["number"]=="1"),None)
    if idx is None:return
    if idx and c["items"][idx-1]["type"]=="heading" and "husrannsakan" in c["items"][idx-1]["text"].lower():return
    c["items"].insert(idx,{"type":"heading","text":"Husrannsakan","editorial":True,"nextPara":"1"})
def fetch(sfs):
    url="https://data.riksdagen.se/dokument/sfs-"+sfs.replace(":","-")+".json"
    req=Request(url,headers={"User-Agent":"LagbokenImporter/0.1","Accept":"application/json"})
    for attempt in range(3):
        try:
            with urlopen(req,timeout=50) as f:return json.load(f)
        except Exception:
            if attempt==2:raise
            time.sleep(attempt+1)
def run():
    catalog=json.loads(CATALOG.read_text(encoding="utf-8"));changed=False;fail=[]
    for meta in catalog["laws"]:
        id=meta["sfs"]
        try:
            doc=fetch(id).get("dokumentstatus",{}).get("dokument",{})
            chs=parse_html(doc.get("html") or "")
            method="HTML"
            if count(chs)<MIN.get(id,5):
                chs=parse_text(doc.get("text") or "");method="TEXT"
            validate(chs,id)
            editorial(chs,id)
            output={"sfs":id,"title":meta["name"],"sourceUrl":"https://data.riksdagen.se/dokument/sfs-"+id.replace(":","-")+".html","parser":method,"fetchedAt":dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),"chapters":chs}
            file=OUT/(id.replace(":","-")+".json")
            if file.exists():
                previous=json.loads(file.read_text(encoding="utf-8"))
                if {k:v for k,v in output.items() if k!="fetchedAt"}=={k:v for k,v in previous.items() if k!="fetchedAt"}:
                    print(id,"unchanged");continue
            OUT.mkdir(parents=True,exist_ok=True)
            file.write_text(json.dumps(output,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
            print(id,"imported",count(chs),"paragraphs",method)
            changed=True
        except Exception as ex:
            print(id,"FAILED",ex,file=sys.stderr);fail.append(id)
    if changed:
        catalog["generated"]=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        CATALOG.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    if fail:sys.exit("Manual review needed: "+", ".join(fail))
if __name__=="__main__":run()
