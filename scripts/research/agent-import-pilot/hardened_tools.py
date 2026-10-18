"""V4 wire aliases, per-candidate acceptance and bounded repair feedback.

The original harness remains reproducible. Aliases are transport references only;
accepted output is decoded to canonical IDs before evaluation or persistence.
"""
import json,re
from agent_tools import ToolBox,DecisionBatch,norm

class RepairRequired(ValueError):pass

class HardenedToolBox(ToolBox):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs)
        uuids=sorted(set(re.findall(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',json.dumps(self.fixture))))
        self.encode={v:f'R{i+1:04}' for i,v in enumerate(uuids)}
        self.decode={v:k for k,v in self.encode.items()}
        self.accepted={};self.rejections=[]
    def translate(self,value,mapping):
        if isinstance(value,str):return mapping.get(value,value)
        if isinstance(value,list):return [self.translate(v,mapping) for v in value]
        if isinstance(value,dict):return {k:self.translate(v,mapping) for k,v in value.items()}
        return value
    def input(self):return self.translate(super().input(),self.encode)
    def invoke(self,name,args):return self.translate(super().invoke(name,self.translate(args,self.decode)),self.encode)
    def validate(self,batch):
        decoded=DecisionBatch.model_validate(self.translate(batch.model_dump(),self.decode))
        counts={cid:sum(d.candidateId==cid for d in decoded.decisions) for cid in self.cases}
        errors=[]
        if any(d.candidateId not in self.cases for d in decoded.decisions):raise RepairRequired('candidate_outside_task')
        # Validate each item against the original server gate in its candidate scope.
        for cid in self.cases:
            if cid in self.accepted:continue
            if counts[cid]!=1:errors.append({'candidateId':cid,'error':'candidate_coverage_mismatch'});continue
            d=next(d for d in decoded.decisions if d.candidateId==cid)
            saved=self.cases
            try:
                if d.outcome=='not_found' and saved[cid]['initialEntryIds'] and not any(r['tool']=='dictionary_search' and r['arguments']['candidateId']==cid and norm(r['arguments']['query'])!=norm(saved[cid]['initialQuery']) and not r['result'].get('error') for r in self.calls):
                    raise ValueError('additional_dictionary_search_required_before_not_found')
                self.cases={cid:saved[cid]}
                super().validate(DecisionBatch(decisions=[d]))
                self.accepted[cid]=d.model_dump()
            except ValueError as e:errors.append({'candidateId':cid,'error':str(e)})
            finally:self.cases=saved
        if errors:
            self.rejections.append(errors)
            raise RepairRequired(json.dumps({'repairOnly':errors,'acceptedCandidateIds':list(self.accepted),'instruction':'Retain accepted decisions. Resolve rejected candidates with tools as needed; return the full candidate batch. Use only provided reference aliases or exact tool evidenceRef values.'}))
        return {'decisions':[self.accepted[cid] for cid in self.cases]}
