"""Freeze dictionary-lemma/POS challenge before lemma-model requests. Not general UD gold."""
import argparse,json,hashlib,re
from pathlib import Path
from mwe_benchmark_data import VIDEOS,tokenize
TARGETS=[('lubach','geluiden','geluid',['NOUN']),('lubach','fragmenten','fragment',['NOUN']),('lubach','biografieën','biografie',['NOUN']),('lubach','vakken','vak',['NOUN']),('lubach','geheugen','geheugen',['NOUN']),('easy','opleidingen','opleiding',['NOUN']),('easy','geleden','geleden',['ADV','ADJ']),('easy','terloops','terloops',['ADV','ADJ']),('easy','vreemden','vreemde',['NOUN']),('nos','uitgebreid','uitgebreid',['ADJ','ADV']),('nos','slechtziende','slechtziend',['ADJ']),('nos','hindernissen','hindernis',['NOUN'])]
def build(root):
    data={k:json.loads((root/v/'prepared.json').read_text()) for k,v in VIDEOS.items()};cases=[]
    for i,(video,surface,lemma,pos) in enumerate(TARGETS):
        source=data[video];s=next(s for s in source['sentences'] if re.search(r'\b'+re.escape(surface)+r'\b',s['text'],re.I));tokens=tokenize(s['text']);tid=next(t['id'] for t in tokens if t['text'].casefold()==surface.casefold())
        cases.append({'caseId':f'l{i:02}','video':video,'sourceRevision':source['sourceHash'],'sentenceId':s['sentenceId'],'text':s['text'],'tokens':tokens,'targetTokenId':tid,'expectedLemma':lemma,'allowedPos':pos})
    d={'referenceStatus':'operator-selected hard dictionary lemma/POS cases, not independent linguistic or random gold','cases':cases};d['referenceSha256']=hashlib.sha256(json.dumps(d,sort_keys=True,ensure_ascii=False).encode()).hexdigest();return d
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('sources',type=Path);p.add_argument('output',type=Path);a=p.parse_args();d=build(a.sources)
    if a.output.exists() and json.loads(a.output.read_text())!=d:raise RuntimeError('lemma_reference_changed')
    a.output.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'cases':len(d['cases']),'sha256':d['referenceSha256']}))
