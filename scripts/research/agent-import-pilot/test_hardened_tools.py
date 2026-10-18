import copy,unittest
import test_agent_tools
from agent_tools import DecisionBatch
from hardened_tools import HardenedToolBox,RepairRequired

class HardenedTests(unittest.TestCase):
    def setUp(self):
        base=test_agent_tools.AgentToolsTests();base.setUp();self.fixture=base.fixture
        eid='11111111-1111-1111-1111-111111111111'
        self.fixture['entries'][eid]=self.fixture['entries'].pop('e1')
        self.fixture['entries'][eid]['entryId']=eid
        self.fixture['cases'][0]['initialEntryIds']=[eid]
        self.fixture['queries']['brug']['entryIds']=[eid]
        c=copy.deepcopy(self.fixture['cases'][0]);c['candidateId']='c2';self.fixture['cases'].append(c)
        self.eid=eid;self.box=HardenedToolBox(self.fixture,['c1','c2'])
    def batch(self,second='R9999',outcome='resolved'):
        return DecisionBatch.model_validate({'decisions':[{'candidateId':cid,'outcome':outcome if cid=='c2' else 'resolved','selectedEntryIds':[self.box.encode[self.eid]] if cid=='c1' else ([] if outcome!='resolved' else [second]),'evidenceRefs':[],'reason':'x'} for cid in ['c1','c2']]})
    def test_alias_and_partial_repair(self):
        self.assertNotIn(self.eid,str(self.box.input()))
        with self.assertRaises(RepairRequired):self.box.validate(self.batch())
        self.assertEqual(list(self.box.accepted),['c1'])
        result=self.box.validate(self.batch(self.box.encode[self.eid]))
        self.assertEqual(result['decisions'][1]['selectedEntryIds'],[self.eid])
    def test_missing_requires_search(self):
        with self.assertRaisesRegex(RepairRequired,'additional_dictionary_search_required'):self.box.validate(self.batch(outcome='not_found'))
        self.box.invoke('dictionary_search',{'candidateId':'c2','query':'bruggen','mode':'lemma'})
        self.box.validate(self.batch(outcome='not_found'))
    def test_tool_alias_read_roundtrip(self):
        r=self.box.invoke('entry_read',{'candidateId':'c1','entryIds':[self.box.encode[self.eid]]})
        self.assertEqual(r['entries'][0]['entryId'],self.box.encode[self.eid])

if __name__=='__main__':unittest.main()
