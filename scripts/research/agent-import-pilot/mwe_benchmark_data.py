"""Frozen operator reference definitions; reconstruct private source text from pilot captures.
Not independent human gold or random corpus sample. Tokenization is parser-neutral.
"""
import argparse,json,re,hashlib
from pathlib import Path
# Required lexical core tokens, with variable arguments/pronouns omitted. Optional
# units encode ambiguity rather than forcing every plausible collocation to be gold.
SPECS=[
 ('nos','s17','challenge',[('gebruikmaken van',['maken','gebruik','van'])],[]),
 ('nos','s50','challenge',[('lekker in zijn vel zitten',['lekker','in','vel','zat'])],[]),
 ('nos','s53','challenge',[('ja en amen zeggen',['ja','en','amen','zeggen'])],[]),
 ('nos','s55','challenge',[('opkomen voor',['opkomt','voor'])],[]),
 ('nos','s70','challenge',[('in de weg liggen',['in','de','weg','ligt'])],[]),
 ('easy','s16','challenge',[('iets op de rit krijgen',['op','de','rit','krijgen'])],[]),
 ('easy','s71','challenge',[('meevallen',['valt','mee'])],[]),
 ('easy','s128','challenge',[('afhangen van',['hangt','van','af'])],[]),
 ('easy','s154','challenge',[('trots als een pauw',['trots','als','een','pauw'])],[]),
 ('easy','s180','challenge',[('op eigen benen staan',['op','eigen','benen','staat'])],[('een compliment geven',['compliment','gegeven'])]),
 ('easy','s281','challenge',[('er iets achter zoeken',['achter','zoeken'])],[]),
 ('easy','s166','challenge',[('scheutig zijn met',['scheutig','mee'])],[]),
 ('lubach','s9','challenge',[('af en toe',['Af','en','toe']),('behoefte hebben aan',['behoefte','aan'])],[]),
 ('lubach','s75','challenge',[('op zijn bek gaan',['Op','bek','gaan'])],[]),
 ('lubach','s77','challenge',[('buiten zijn comfortzone zijn',['buiten','comfort','zone'])],[]),
 ('lubach','s224','challenge',[('in eerste instantie',['in','eerste','instantie'])],[]),
 ('nos','s19','extra',[],[]),
 ('nos','s38','extra',[],[('zijn mening geven',['mening','geven'])]),
 ('nos','s57','extra',[],[('werken voor',['werkt','voor'])]),
 ('nos','s76','extra',[],[]),
 ('easy','s51','extra',[('gek zijn op',['gek','op'])],[]),
 ('easy','s52','extra',[('te horen krijgen',['krijg','te','horen'])],[]),
 ('easy','s107','extra',[('de moeite waard',['de','moeite','waard'])],[]),
 ('easy','s141','extra',[('omgaan met',['mee','omgaan'])],[]),
 ('easy','s219','extra',[],[('iemand op de schouder kloppen',['schouder','klop'])]),
 ('easy','s347','extra',[],[('een duimpje omhoog geven',['duimpje','omhoog'])]),
 ('lubach','s1','extra',[],[('bij machte zijn',['bij','macht'])]),
 ('lubach','s65','extra',[],[('buiten zijn comfortzone zijn',['over','comfort','zone'])]),
 ('lubach','s158','extra',[],[]),
 ('lubach','s190','extra',[],[]),
 ('lubach','s199','extra',[('doorhebben',['had','door'])],[]),
 ('lubach','s247','extra',[('zich afvragen',['vraag','af'])],[]),
]
VIDEOS={'nos':'video--lf71hdWm5E','easy':'video-IoTEYzkKF0M','lubach':'video-9ZQaqL7K-rE'}
TOKEN_RE=re.compile(r"\w+(?:['’]\w+)*|[^\w\s]",re.UNICODE)
def tokenize(text):return [{'id':i,'text':m.group(),'start':m.start(),'end':m.end()} for i,m in enumerate(TOKEN_RE.finditer(text))]
def align_core(tokens,forms):
    ids=[];start=0
    for form in forms:
        found=next((t for t in tokens[start:] if t['text'].casefold()==form.casefold()),None)
        if found is None:raise ValueError('reference_surface_not_found:'+form)
        ids.append(found['id']);start=found['id']+1
    return ids

def build(root):
    sources={k:json.loads((root/v/'prepared.json').read_text()) for k,v in VIDEOS.items()};cases=[]
    for i,(video,sid,split,required,optional) in enumerate(SPECS):
        d=sources[video];sent=d['sentences'];idx=next(j for j,s in enumerate(sent) if s['sentenceId']==sid);s=sent[idx];tokens=tokenize(s['text'])
        cases.append({'caseId':f'x{i:02}','video':video,'sourceVideoId':VIDEOS[video][6:],'sourceRevision':d['sourceHash'],'sentenceId':sid,'split':split,'text':s['text'],'tokens':tokens,'neighbours':[x['text'] for x in sent[max(0,idx-1):idx+2]],'required':[{'canonical':c,'tokenIds':align_core(tokens,forms)} for c,forms in required],'optional':[{'canonical':c,'tokenIds':align_core(tokens,forms)} for c,forms in optional]})
    data={'schema':'mwe-study-v1','referenceStatus':'operator-labelled frozen challenge/extra, not independent human gold or random sample','policy':'lexical core; omit variable arguments/pronouns and ordinary single words; optional ambiguous collocations/ASR; original ASR spelling preserved','cases':cases};data['referenceSha256']=hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False).encode()).hexdigest();return data
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source_root',type=Path);p.add_argument('output',type=Path);a=p.parse_args();d=build(a.source_root)
    if a.output.exists() and json.loads(a.output.read_text())!=d:raise RuntimeError('frozen_reference_changed')
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'cases':len(d['cases']),'required':sum(len(c['required']) for c in d['cases']),'optional':sum(len(c['optional']) for c in d['cases']),'sha256':d['referenceSha256']}))
