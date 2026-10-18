"""Freeze twelve supervised pilot cases without exposing expected answers to model."""
import argparse,json,hashlib
from pathlib import Path
from agent_tools import compact,norm

def build(root):
    p=json.loads((root/'prepared-v2.json').read_text());review=json.loads((root/'review.json').read_text());manifest=json.loads((root/'collection-manifest.json').read_text())
    rows=json.loads((root/'lookup.json').read_text())['rows']+json.loads((root/'extra-lookup.json').read_text())['rows'];entries={};queries={}
    for row in rows:
        items=[i for i in row['result'].get('items',[]) if i.get('dictionary_slug')=='nl-vandale']
        entries.update({i['id']:compact(i) for i in items});queries[norm(row['query'])]={'entryIds':[i['id'] for i in items], 'complete':not row['result'].get('page',{}).get('nextGroupCursor')}
    definitions=[('c192','tanks','word','tanks'),('c204','Denk','word','denk'),('c127','stalen','word','stalen'),('c12','bruggen','word','bruggen'),('c40','pakken','word','pakken'),('c98','legt','word','legt'),('c178','uitbreekt','word','uitbreekt'),('c285','in de gaten houden','expression','houden'),('c266','in het holst van de nacht','expression','holst'),('c206','inbreken','word','inbreken'),('c187','band','word','band'),('c293','reparatie','word','reparatie')]
    selected={x['candidateId']:x.get('entry',{}).get('id') for x in review if x['status']=='selected'}
    def find(head,ordinal,idiom=None):
        return next(v['entry']['id'] for v in manifest['members'] if v['entry']['headword']==head and v['entry']['meaning_id']==ordinal and (not idiom or v.get('idiom')))
    expected={**{cid:[selected[cid]] for cid in ['c192','c204','c12','c40','c178','c187']},'c98':[find('uitleggen',1)],'c285':[find('gat',5,True)],'c266':[find('holst',1,True)],'c127':[],'c206':[],'c293':[]}
    cases=[]
    for cid,surface,kind,query in definitions:
        c=next(c for c in p['candidates'] if c['candidateId']==cid);occ=c['occurrences'][0]
        sentence=next(s for s in p['sentences'] if s['sentenceId']==occ['sentenceId'])
        cases.append({'candidateId':cid,'surface':surface,'kind':kind,'context':sentence['text'],'sentenceIds':[sentence['sentenceId']], 'initialQuery':query,'initialEntryIds':queries.get(query,{}).get('entryIds',[]), 'initialSearchComplete':queries.get(query,{}).get('complete',False),'expectedEntryIds':expected[cid]})
    return {'fixtureVersion':'agent-pilot-v1','sourceRevision':p['sourceHash'],'sentences':p['sentences'],'entries':entries,'queries':queries,'cases':cases,'expectedProvenance':'same-video supervised agent decisions; not independent linguistic gold'}
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('evidence',type=Path);a.add_argument('output',type=Path);args=a.parse_args();data=build(args.evidence);args.output.write_text(json.dumps(data,ensure_ascii=False,indent=2));print('Frozen12cases',hashlib.sha256(args.output.read_bytes()).hexdigest())
