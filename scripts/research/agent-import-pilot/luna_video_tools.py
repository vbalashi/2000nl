"""Four read-only research tools. Principal is operator-bound, never model supplied."""
import hashlib,json,time
from pathlib import Path
from agent_tools import norm,compact
from collection_review import short_entry
from lookup import lookup
from mwe_benchmark_data import tokenize

def specs():
    def tool(name,description,fields):
        fields={'caseId':{'type':'string'},**fields}
        return {'name':name,'description':description,'params_json_schema':{'type':'object','properties':fields,'required':list(fields),'additionalProperties':False}}
    return [tool('context_read','Read the central sentence and up to two adjacent source sentences. Neighbours are context only.',{'radius':{'type':'integer','minimum':0,'maximum':2}}),
      tool('source_search','Find up to five source sentences containing literal text. Does not search outside this video.',{'query':{'type':'string','minLength':2,'maxLength':80}}),
      tool('dictionary_search','Read-only authorized Dutch dictionary lookup for a lemma or expression. A zero or truncated result is not global dictionary absence.',{'query':{'type':'string','minLength':1,'maxLength':160}}),
      tool('entry_read','Read up to three dictionary entries already returned for this case. No arbitrary IDs.',{'refs':{'type':'array','items':{'type':'string'},'minItems':1,'maxItems':3}})]

class VideoTools:
    def __init__(self,root,cases,allcases,email,reference,label):
        self.root=root;self.cases={c['caseId']:c for c in cases};self.allcases=allcases;self.email=email;self.reference=reference;self.label=label
        self.allowed={cid:set() for cid in self.cases};self.entries={};self.calls=[];self.seen=set();self.limit=32;self.cache=root/'dictionary-cache';self.cache.mkdir(exist_ok=True)
        self.scope=hashlib.sha256(('luna-video-owner-v1:'+email.lower()+':'+str(reference.resolve())).encode()).hexdigest()
    def invoke(self,name,args):
        if len(self.calls)>=self.limit:return self.record(name,args,{'error':'tool_call_cap'},0)
        cid=args.get('caseId');key=json.dumps([name,args],sort_keys=True)
        if cid not in self.cases:return self.record(name,args,{'error':'case_outside_current_batch'},0)
        if key in self.seen:return self.record(name,args,{'error':'repeated_tool_call'},0)
        self.seen.add(key);t=time.monotonic()
        try:
            if name=='context_read':
                radius=args['radius']
                if type(radius) is not int or not 0<=radius<=2:raise ValueError('invalid_radius')
                index=next(i for i,c in enumerate(self.allcases) if c['caseId']==cid)
                result={'sourceRevision':self.cases[cid]['sourceRevision'],'sentences':[{'caseId':c['caseId'],'text':c['text'],'tokens':c['tokens']} for c in self.allcases[max(0,index-radius):index+radius+1]]}
            elif name=='source_search':
                query=norm(args['query'])
                if not 2<=len(query)<=80:raise ValueError('invalid_query')
                hits=[c for c in self.allcases if query in norm(c['text'])]
                result={'sentences':[{'caseId':c['caseId'],'text':c['text']} for c in hits[:5]],'truncated':len(hits)>5}
            elif name=='dictionary_search':
                query=norm(args['query'])
                if not 1<=len(query)<=160:raise ValueError('invalid_query')
                keyhash=hashlib.sha256(query.encode()).hexdigest();path=self.cache/(keyhash+'.json')
                if path.exists():
                    saved=json.loads(path.read_text())
                    if saved['scope']!=self.scope or saved['query']!=query:raise ValueError('dictionary_scope_mismatch')
                    row=saved['row']
                else:
                    if len(list(self.cache.glob('*.json')))>=80:raise ValueError('per_video_dictionary_query_cap')
                    row=lookup([query],self.email,self.reference,self.root/'dictionary-batches'/keyhash)['rows'][0]
                    path.write_text(json.dumps({'scope':self.scope,'query':query,'row':row},ensure_ascii=False))
                entries=[]
                for item in row['result'].get('items',[])[:6]:
                    ref='E'+hashlib.sha256(item['id'].encode()).hexdigest()[:12];self.entries[ref]=compact(item);self.allowed[cid].add(ref);entries.append(short_entry(self.entries[ref],ref))
                result={'query':query,'entries':entries,'complete':not bool(row['result'].get('page',{}).get('nextGroupCursor')) and len(row['result'].get('items',[]))<=6,'scope':'authorized Dutch lookup, bounded results; no global absence claim'}
            elif name=='entry_read':
                refs=args['refs']
                if not 1<=len(refs)<=3 or not set(refs)<=self.allowed[cid]:raise ValueError('entry_not_returned_to_case')
                details=[]
                for ref in refs:
                    entry=self.entries[ref]
                    details.append({'ref':ref,'headword':entry['headword'],'pos':entry['partOfSpeech'],'ordinal':entry['meaningOrdinal'],'meanings':[{'definition':m.get('definition','')[:1200],'examples':m.get('examples',[])[:4],'idioms':m.get('idioms',[])[:10]} for m in entry['meanings'][:6]],'projectionTruncated':len(entry['meanings'])>6 or any(len(m.get('definition',''))>1200 or len(m.get('examples',[]))>4 or len(m.get('idioms',[]))>10 for m in entry['meanings'])})
                result={'entries':details}
            else:raise ValueError('unknown_tool')
        except Exception as e:result={'error':type(e).__name__,'detail':str(e)[:160]}
        return self.record(name,args,result,time.monotonic()-t)
    def record(self,name,args,result,seconds):
        record={'name':name,'args':args,'result':result,'seconds':seconds};self.calls.append(record)
        with (self.root/(self.label+'-tools.jsonl')).open('a') as f:f.write(json.dumps(record,ensure_ascii=False)+'\n')
        return result
