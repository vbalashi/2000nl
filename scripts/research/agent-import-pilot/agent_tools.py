"""Four bounded local read tools over a frozen pilot snapshot. No DB/network/write tools."""
import hashlib,json,re,time
from pathlib import Path
from typing import Literal
from pydantic import BaseModel,ConfigDict
import jsonschema

class Decision(BaseModel):
    model_config=ConfigDict(extra='forbid')
    candidateId:str
    outcome:Literal['resolved','not_found','needs_user','deferred_budget']
    selectedEntryIds:list[str]
    evidenceRefs:list[str]
    reason:str
class DecisionBatch(BaseModel):
    model_config=ConfigDict(extra='forbid')
    decisions:list[Decision]

def norm(s):return re.sub(r'\s+',' ',s.lower().strip())
def compact(entry):
    return {'entryId':entry['id'],'headword':entry['headword'],'partOfSpeech':entry.get('part_of_speech'),
            'meaningOrdinal':entry.get('meaning_id'),'dictionarySlug':entry.get('dictionary_slug'),
            'headwordGroupId':entry.get('platform_v2_identity',{}).get('headwordGroupId'),
            'meanings':entry.get('meanings',[]),
            'contentBindings':entry.get('platform_v2_identity',{}).get('contentNodeBindings',[])}

def specs():
    def tool(name,description,props):return {'type':'function','name':name,'description':description,'strict':True,'parameters':{'type':'object','properties':props,'required':list(props),'additionalProperties':False}}
    cid={'type':'string','description':'Candidate ID from the current task.'}
    return [tool('context_read','Read the source sentence or one neighbouring sentence on either side. Use if initial context is insufficient.',{'candidateId':cid,'window':{'type':'string','enum':['sentence','neighbours']}}),
        tool('dictionary_search','Search frozen authorized dictionary snapshot for a surface, lemma, expression, or example evidence. Snapshot coverage is finite; unavailable query is not proof of dictionary absence.',{'candidateId':cid,'query':{'type':'string'},'mode':{'type':'string','enum':['surface','lemma','expression','evidence']}}),
        tool('entry_read','Read full definitions/examples and exact identity for entries already returned to this candidate. Up to ten entries.',{'candidateId':cid,'entryIds':{'type':'array','items':{'type':'string'}}}),
        tool('morphology_suggest','Get fallible Dutch lemma/POS suggestions for a surface or phrase. Proposals do not prove identity; use dictionary and context to verify.',{'candidateId':cid,'surface':{'type':'string'}})]

class ToolBox:
    def __init__(self,fixture,case_ids,trace=None):
        self.fixture=fixture;self.cases={c['candidateId']:c for c in fixture['cases'] if c['candidateId'] in case_ids}
        self.entries=fixture['entries'];self.allowed={cid:set(c['initialEntryIds']) for cid,c in self.cases.items()}
        self.trace=trace;self.calls=[];self.seen=set();self.nlp=None;self.attempts=0
    def invoke(self,name,args):
        self.attempts+=1
        if self.attempts>12:return {'error':'tool_budget_exhausted'}
        spec=next((s for s in specs() if s['name']==name),None)
        if spec is None:return {'error':'unknown_tool'}
        jsonschema.validate(args,spec['parameters'])
        cid=args['candidateId']
        if cid not in self.cases:return {'error':'candidate_outside_task'}
        key=json.dumps([name,args],sort_keys=True)
        if len(self.calls)>=12:return {'error':'tool_budget_exhausted'}
        if key in self.seen:return {'error':'repeated_query_without_new_evidence'}
        self.seen.add(key);t=time.perf_counter();case=self.cases[cid]
        if name=='context_read':
            contexts=[];n=1 if args['window']=='neighbours' else 0
            for sid in case['sentenceIds'][:3]:
                idx=next(i for i,s in enumerate(self.fixture['sentences']) if s['sentenceId']==sid)
                contexts.extend(self.fixture['sentences'][max(0,idx-n):idx+n+1])
            result={'sourceRevision':self.fixture['sourceRevision'],'contexts':list({s['sentenceId']:s for s in contexts}.values())}
        elif name=='dictionary_search':
            query=norm(args['query'])
            if not query or len(query)>160:result={'error':'invalid_query'}
            else:
                row=self.fixture['queries'].get(query);ids=list(row['entryIds']) if row else []
                expression=[];evidence=[]
                for eid,e in self.entries.items():
                    for m in e['meanings']:
                        for idiom in m.get('idioms',[]):
                            phrase=norm(idiom.get('expression',''))
                            if phrase and (query in phrase or phrase in query):
                                value={'entryId':eid,'expression':idiom.get('expression'),'explanation':idiom.get('explanation')}
                                if not m.get('definition') and len(m.get('idioms',[]))==1:expression.append(value);ids.append(eid)
                                else:evidence.append(value)
                        if args['mode']=='evidence':
                            for example in m.get('examples',[]):
                                txt=example if isinstance(example,str) else str(example)
                                if query in norm(txt):evidence.append({'entryId':eid,'example':txt,'matchKind':'example_only'})
                ids=list(dict.fromkeys(ids));self.allowed[cid].update(ids[:10])
                result={'query':query,'snapshotQueryAvailable':row is not None,'complete':len(ids)<=10 and row is not None and row.get('complete',False),
                        'entries':[self.entries[eid] for eid in ids[:10]],'expressionTargets':expression[:10],'evidence':evidence[:10],
                        'coverageWarning':None if row else 'Uncached query: searched only records already in this frozen pilot snapshot, not the entire live dictionary.'}
        elif name=='entry_read':
            ids=args['entryIds']
            if len(ids)>10 or any(e not in self.allowed[cid] for e in ids):result={'error':'entry_outside_candidate_search_ledger'}
            else:result={'entries':[self.entries[e] for e in ids]}
        else:
            surface=args['surface']
            if len(surface)>160:result={'error':'surface_too_long'}
            else:
                if self.nlp is None:
                    import spacy
                    self.nlp=spacy.load('nl_core_news_sm')
                doc=self.nlp(surface);result={'method':'spacy-nl_core_news_sm-3.8.0','fallible':True,'tokens':[{'surface':t.text,'lemma':t.lemma_,'pos':t.pos_,'dep':t.dep_} for t in doc]}
        ref='ev_'+hashlib.sha256(key.encode()).hexdigest()[:16];result={'evidenceRef':ref,**result}
        receipt={'tool':name,'arguments':args,'result':result,'wallSeconds':time.perf_counter()-t};self.calls.append(receipt)
        if self.trace:
            with self.trace.open('a') as f:f.write(json.dumps(receipt,ensure_ascii=False)+'\n')
        return result
    def input(self):
        tasks=[]
        for cid,c in self.cases.items():
            tasks.append({k:c[k] for k in ['candidateId','surface','kind','context','initialQuery'] } | {'initialEntries':[self.entries[e] for e in c['initialEntryIds']], 'initialSearchComplete':c['initialSearchComplete']})
        return {'targetLanguage':'nl','sourceRevision':self.fixture['sourceRevision'],'objective':'Choose exact existing meaning/idiom matching each original video occurrence. Missing is acceptable; never substitute a wrong meaning.','candidates':tasks}
    def validate(self,batch):
        if len(batch.decisions)!=len(self.cases) or {d.candidateId for d in batch.decisions}!=set(self.cases):raise ValueError('candidate_coverage_mismatch')
        # Initial dictionary content is already legitimate evidence, not only tool results.
        def entry_refs(ids):
            out=set(ids)
            for eid in ids:
                out.update(b['contentNodeId'] for b in self.entries[eid].get('contentBindings',[]) if b.get('contentNodeId'))
            return out
        for d in batch.decisions:
            if not set(d.selectedEntryIds)<=self.allowed[d.candidateId]:raise ValueError('invented_or_unread_entry')
            if (d.outcome=='resolved')!=bool(d.selectedEntryIds):raise ValueError('outcome_target_mismatch')
            refs=entry_refs(self.allowed[d.candidateId])|set(self.cases[d.candidateId]['sentenceIds'])
            refs.update(r['result']['evidenceRef'] for r in self.calls if r['arguments']['candidateId']==d.candidateId)
            if not set(d.evidenceRefs)<=refs:raise ValueError('invented_evidence_reference')
        return batch.model_dump()
