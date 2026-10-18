"""Freeze targeted prior disagreements; labels not independent semantic gold."""
import argparse,json,hashlib
from pathlib import Path

def build(root):
    cases=[]
    nos=root/'video--lf71hdWm5E/collection-review';inp=json.loads((nos/'input.json').read_text());byid={c['candidateId']:c for c in inp['cases']};easy=root/'video-IoTEYzkKF0M/collection-review';ei=json.loads((easy/'input.json').read_text());ec={c['candidateId']:c for c in ei['cases']}
    specs=[('nos','c16','R0340','reject','Adverbial performance is not suitability.'),('nos','c166','R0625','reject','Literal skin entry is not dedicated idiom target under current import policy.'),('nos','c184','R0116','uncertain','Generic person versus adult male is a debatable degree of specificity.'),('nos','c20','R0034','accept','Known/well-known team.'),('nos','c23','R0488','accept','Existential er zijn matches bestaan and supplied example.'),('nos','c74','R0590','accept','Desire/intention in willen oversteken.'),('nos','c42','R0353','reject','Causation dat komt door is not arriving.'),('easy','c117','R0262','reject','Specific meevallen available, not broad unspecified vallen3.')]
    for video,cid,ref,expected,why in specs:
        c=byid[cid] if video=='nos' else ec[cid];entry=next(e for e in c['entries'] if e['ref']==ref)
        cases.append({'caseId':f't{len(cases):02}','source':video+'/'+cid,'contexts':c['contexts'],'target':entry,'alternatives':[e for e in c['entries'] if e['ref']!=ref],'expected':expected,'operatorNote':why})
    for video,query,ordinal,expected in [('video-IoTEYzkKF0M','meevallen',1,'accept'),('video-IoTEYzkKF0M','afhangen van',1,'accept'),('video-9ZQaqL7K-rE','houden van',1,'accept'),('video-9ZQaqL7K-rE','houden van',2,'reject')]:
        p=root/video/'collection-review';row=next(r for r in json.loads((p/'gap-lookup.json').read_text())['rows'] if r['query']==query);entries=[{'ref':f'G{i}','headword':e['headword'],'pos':e.get('part_of_speech'),'ordinal':e.get('meaning_id'),'meanings':e['meanings']} for i,e in enumerate(row['result']['items'])];target=next(e for e in entries if e['ordinal']==ordinal);g=next(g for g in json.loads((p/'gap-audit-validated.json').read_text())['proposals'] if g['canonicalForm']==query);d=json.loads((root/video/'prepared.json').read_text());context=next(s['text'] for s in d['sentences'] if s['sentenceId']==g['sentenceId'])
        cases.append({'caseId':f't{len(cases):02}','source':video+'/'+query,'contexts':[context],'target':target,'alternatives':[e for e in entries if e['ref']!=target['ref']],'expected':expected,'operatorNote':'Exact source and full definition compared; houden van2 taste/food is not history preference.'})
    d={'referenceStatus':'targeted prior disagreements, 11 certain operator labels + one uncertain; not independent gold','cases':cases};d['referenceSha256']=hashlib.sha256(json.dumps(d,sort_keys=True,ensure_ascii=False).encode()).hexdigest();return d
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('sources',type=Path);p.add_argument('output',type=Path);a=p.parse_args();d=build(a.sources)
    if a.output.exists() and json.loads(a.output.read_text())!=d:raise RuntimeError('sense_reference_changed')
    a.output.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'cases':len(d['cases']),'sha256':d['referenceSha256']}))
