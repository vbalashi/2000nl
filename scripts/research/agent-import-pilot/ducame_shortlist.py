"""Bounded lemma shortlist + DUCAME structural research; no index imports or DB.
Uses lexicon_probe's locally patched alpha source and frozen cached source parses.
"""
import argparse,collections,hashlib,itertools,json,sys,time
from pathlib import Path
import requests
from lxml import etree
from mwe_score import score

def candidates(lemmas, reverse, requirements, idmap, lexicon):
    counts=collections.Counter(lemmas)
    ids={i for lemma in counts for i in reverse.get(lemma,[])}
    return sorted(i for i in ids if idmap[str(i)] in lexicon and any(not (collections.Counter(v)-counts) for v in itertools.product(*(l.split('|') for l in requirements[str(i)]))))

def align(text,tokens,tree):
    cursor=0;mapping={}
    for node in sorted(tree.xpath('.//node[@word]'),key=lambda n:int(n.get('begin'))):
        word=node.get('word');pos=text.find(word,cursor)
        if pos<0 or text[cursor:pos].strip():raise ValueError('parser token text mismatch')
        end=pos+len(word);cursor=end
        covered=[t for t in tokens if t['start']>=pos and t['end']<=end]
        if covered and text[pos:end]==''.join(t['text'] for t in covered):mapping[int(node.get('end'))]=[t['id'] for t in covered]
    return mapping

def main(a):
    a.out.mkdir(parents=True,exist_ok=True);cache=a.out/'canonical-cache';cache.mkdir(exist_ok=True)
    import mwe_query
    for name in list(sys.modules):
        if name.startswith('mwe_query.'):del sys.modules[name]
    mwe_query.__path__.insert(0,str(a.alpha.resolve()));mwe_query.__file__=str(a.alpha.resolve()/'__init__.py')
    from mwe_query.canonicalform import preprocess_MWE,generatequeries,expandfull,generatemwestructures
    from mwe_query.getmwecomponents import getmwecomponents
    from mwe_query.alternatives import expandalternatives
    from mwe_query.pronadvs import allpronadvlemmas,pronadv2vz
    _,idmap,reverse,requirements=json.loads((a.alpha/'indexes/mweindex.json').read_text())
    lexicon=dict(line.split('\t',1) for line in (a.alpha/'mwelexicon/DUCAME_4.05.txt').read_text().splitlines()[1:] if '\t' in line)
    reference=json.loads(a.reference.read_text()); trees={};shortlist={};mappings={};started=time.monotonic()
    source_requests=[]
    for c in reference['cases']:
        source_path=a.source_cache/(hashlib.sha256(c['text'].encode()).hexdigest()+'.xml')
        if a.retokenize:
            tokenized=' '.join(t['text'] for t in c['tokens']);source_path=a.out/'source-tokenized'/(hashlib.sha256(tokenized.encode()).hexdigest()+'.xml');source_path.parent.mkdir(exist_ok=True)
            if not source_path.exists():
                t=time.monotonic();r=requests.get('https://gretel.hum.uu.nl/parse/parse-sentence',params={'s':tokenized},timeout=(10,35));r.raise_for_status()
                if len(r.content)>2_000_000:raise ValueError('oversized source XML')
                etree.fromstring(r.content,etree.XMLParser(resolve_entities=False,no_network=True));source_path.write_text(r.text);source_requests.append({'caseId':c['caseId'],'seconds':time.monotonic()-t})
        tree=etree.parse(str(source_path),etree.XMLParser(resolve_entities=False,no_network=True)).getroot()
        mappings[c['caseId']]=align(c['text'],c['tokens'],tree)
        rawlemmas=tree.xpath('.//node[@lemma]/@lemma')
        adapted=[]
        for lemma in rawlemmas:
            parts=pronadv2vz(lemma) if lemma in allpronadvlemmas else None
            adapted.extend([p for p in parts if p] if parts else [lemma])
        compounds=[n.get('lemma').rsplit('_',1)[-1] if n.get('pt')=='n' else n.get('lemma') for n in tree.xpath('.//node[@lemma]')]
        shortlist[c['caseId']]=sorted({i for view in [rawlemmas,adapted,compounds] for i in candidates(view,reverse,requirements,idmap,lexicon)})
        trees[c['caseId']]=expandfull(tree)
    unique=sorted({i for ids in shortlist.values() for i in ids});assert len(unique)<=a.cap
    output={'units':[],'invalid':[]};receipts=[];errors=[];hits=[];seen=set()
    for i in unique:
        key=idmap[str(i)];raw=lexicon[key];clean=' '.join(w for w,_ in preprocess_MWE(raw));path=cache/(hashlib.sha256(clean.encode()).hexdigest()+'.xml')
        try:
            if not path.exists():
                t=time.monotonic();r=requests.get('https://gretel.hum.uu.nl/parse/parse-sentence',params={'s':clean},timeout=(10,35));r.raise_for_status()
                if len(r.content)>2_000_000:raise ValueError('oversized XML')
                etree.fromstring(r.content,etree.XMLParser(resolve_entities=False,no_network=True));path.write_text(r.text);receipts.append({'id':key,'seconds':time.monotonic()-t,'bytes':len(r.content)})
            canonical=etree.parse(str(path),etree.XMLParser(resolve_entities=False,no_network=True)).getroot()
            queries=generatequeries(raw,mwetree=canonical)
            structures=[variant for structure in generatemwestructures(raw,mwetree=canonical) for variant in expandalternatives(structure)]
            for cid,ids in shortlist.items():
                if i not in ids:continue
                matches=trees[cid].xpath('.'+queries[0]);nh=len(trees[cid].xpath('.'+queries[1]))
                if matches or nh:hits.append({'caseId':cid,'id':key,'canonical':raw,'strict':len(matches),'nearMiss':nh})
                for match in matches:
                    # Evaluate one match/structure at a time to avoid helper's outer-loop overwrite.
                    for structure in structures:
                        for components in getmwecomponents([match],[structure]):
                            positions=sorted({int(n.get('end')) for n in components if n.get('end')})
                            if not positions or any(p not in mappings[cid] for p in positions):
                                output['invalid'].append({'caseId':cid,'reason':'unaligned_components','id':key});continue
                            tokenids=sorted({t for p in positions for t in mappings[cid][p]})
                            identity=(cid,tuple(tokenids))
                            if identity in seen:continue
                            seen.add(identity);output['units'].append({'caseId':cid,'tokenIds':tokenids,'canonical':clean,'lexiconId':key})
        except Exception as e:errors.append({'id':key,'error':str(e),'type':type(e).__name__})
    result={'shortlist':shortlist,'uniqueCanonicalCount':len(unique),'sourceCases':len(reference['cases']),'strictOutput':output,'score':score(reference,output) if any(c['required'] or c['optional'] for c in reference['cases']) else None,'hits':hits,'errors':errors,'requests':receipts,'sourceRequests':source_requests,'retokenized':a.retokenize,'wallSeconds':time.monotonic()-started,'paidLlmCalls':0}
    (a.out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({k:result[k] for k in ['uniqueCanonicalCount','score','errors','wallSeconds']},ensure_ascii=False))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--alpha',type=Path,required=True);p.add_argument('--reference',type=Path,required=True);p.add_argument('--source-cache',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--cap',type=int,default=96);p.add_argument('--retokenize',action='store_true');main(p.parse_args())
