"""Bounded external Alpino/MWE-Finder research probe; no app or DB writes.

Requires isolated mwe-query==0.1.0 environment and extracted 0.2.0a2 source.
Never imports alpha indexes or full annotator (they rebuild on import).
"""
import argparse, hashlib, json, re, sys, time
from pathlib import Path
import requests
from lxml import etree
from mwe_score import score

def parse(text, cache, receipts):
    key=hashlib.sha256(text.encode()).hexdigest(); path=cache/f'{key}.xml'
    if path.exists(): return path.read_text()
    if len(receipts)>=48: raise RuntimeError('48-request cap reached')
    started=time.monotonic()
    response=requests.get('https://gretel.hum.uu.nl/parse/parse-sentence',params={'s':text},timeout=(10,35))
    response.raise_for_status()
    if len(response.content)>2_000_000: raise ValueError('oversized XML')
    etree.fromstring(response.content,etree.XMLParser(resolve_entities=False,no_network=True))
    path.write_text(response.text)
    receipts.append({'sha256':key,'seconds':time.monotonic()-started,'bytes':len(response.content)})
    return response.text

def main(a):
    a.out.mkdir(parents=True,exist_ok=True);cache=a.out/'parse-cache';cache.mkdir(exist_ok=True)
    receipts=[]; reference=json.loads(a.reference.read_text())
    # Published alpha mixes absolute/relative intra-package imports. Research-only
    # mechanical compatibility patch; preserve changed-file receipt beside source.
    modules={p.stem for p in a.alpha.glob('*.py')};patched=[]
    for source in a.alpha.glob('*.py'):
        original=source.read_text()
        updated=re.sub(r'(?m)^from (\w+) import ',lambda m:'from .'+m[1]+' import ' if m[1] in modules else m[0],original)
        if updated!=original:
            source.write_text(updated);patched.append(source.name)
    if patched: (a.alpha.parent/'research-import-patch.json').write_text(json.dumps(patched))
    sys.path.insert(0,str(a.alpha.resolve()))
    import importlib, mwe_query
    for module in list(sys.modules):
        if module.startswith("mwe_query."): del sys.modules[module]
    mwe_query.__path__.insert(0,str(a.alpha.resolve()))
    mwe_query.__file__=str(a.alpha.resolve()/"__init__.py")
    from mwe_query.getalpinomwes import getalpinomwes
    from mwe_query import Mwe
    output={'units':[],'invalid':[]};native=[]
    started=time.monotonic()
    for c in reference['cases']:
        xml=parse(c['text'],cache,receipts);tree=etree.fromstring(xml.encode(),etree.XMLParser(resolve_entities=False,no_network=True))
        leaves=sorted(tree.xpath('.//node[@word]'),key=lambda n:int(n.get('begin')))
        # Exact sequential token alignment only; reject parser normalisation/splits.
        cursor=0;mapping={}
        for n in leaves:
            word=n.get('word');pos=c['text'].find(word,cursor)
            if pos<0: continue
            end=pos+len(word);cursor=end
            ids=[t['id'] for t in c['tokens'] if t['start']>=pos and t['end']<=end]
            if ids: mapping[int(n.get('begin'))+1]=ids
        items=getalpinomwes(tree,c['caseId'])
        seen=set()
        for item in items:
            raw=vars(item);native.append(raw)
            if any(p not in mapping for p in item.positions):
                output['invalid'].append({'caseId':c['caseId'],'reason':'unaligned_parser_positions'});continue
            ids=sorted({i for p in item.positions for i in mapping[p]})
            if not ids or tuple(ids) in seen:continue
            seen.add(tuple(ids));output['units'].append({'caseId':c['caseId'],'tokenIds':ids,'canonical':item.mwe,'classes':item.mweclasses})
    # Controlled smoke: no benchmark reference fed into query construction.
    canonical='iemand zal rekening met iets houden'
    m=Mwe(canonical);m.set_tree(parse(m.can_form,cache,receipts));queries=m.generate_queries()
    smoke=[]
    for sentence in ['Hij houdt rekening met de kosten.','Met de kosten heeft hij gisteren rekening gehouden.','Hij betaalt de rekening met zijn bankpas.']:
        tree=etree.fromstring(parse(sentence,cache,receipts).encode())
        smoke.append({'sentence':sentence,'queries':[{'rank':q.rank,'description':q.description,'hits':len(tree.xpath(q.xpath))} for q in queries]})
    from mwe_query.canonicalform import preprocess_MWE,generatequeries,expandfull
    lexicon=dict(line.rstrip("\n").split("\t",1) for line in (a.alpha/"mwelexicon/DUCAME_4.05.txt").read_text().splitlines()[1:] if "\t" in line)
    raw=lexicon["DCM04075"]
    clean=" ".join(word for word,_ in preprocess_MWE(raw))
    lexqueries=generatequeries(raw,mwetree=etree.fromstring(parse(clean,cache,receipts).encode()))
    ducame=[]
    for example in smoke:
        tree=expandfull(etree.fromstring(parse(example['sentence'],cache,receipts).encode()))
        ducame.append({'sentence':example['sentence'],'hits':[len(tree.xpath('.'+q)) if q else None for q in lexqueries]})
    result={'nativeScore':score(reference,output),'nativeUnits':output,'nativeRaw':native,'ducame':{'id':'DCM04075','raw':raw,'clean':clean,'smoke':ducame},'smoke':smoke,'canonical':canonical,'queries':[{'rank':q.rank,'xpath':q.xpath} for q in queries],'parserRequests':receipts,'wallSeconds':time.monotonic()-started,'paidLlmCalls':0,'cachedParseCount':len(list(cache.glob('*.xml')))}
    (a.out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps({k:result[k] for k in ['nativeScore','smoke','wallSeconds','paidLlmCalls']},ensure_ascii=False))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--alpha',type=Path,required=True);p.add_argument('--reference',type=Path,required=True);p.add_argument('--out',type=Path,required=True);main(p.parse_args())
