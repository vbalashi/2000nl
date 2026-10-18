import json,unittest
from agent_tools import ToolBox,DecisionBatch

class AgentToolsTests(unittest.TestCase):
    def setUp(self):
        self.fixture={'sourceRevision':'rev1','cases':[{'candidateId':'c1','surface':'brug','kind':'word','context':'Een brug.','initialQuery':'brug','initialEntryIds':['e1'],'initialSearchComplete':True,'sentenceIds':['s1'],'expectedEntryIds':['secret-reference']}], 'sentences':[{'sentenceId':'s1','text':'Een brug.'}], 'entries':{'e1':{'entryId':'e1','headword':'brug','meanings':[{'definition':'bouwwerk','idioms':[]}]}},'queries':{'brug':{'entryIds':['e1'],'complete':True}}}
        self.box=ToolBox(self.fixture,['c1'])
    def test_reference_not_model_input(self):
        self.assertNotIn('secret-reference',json.dumps(self.box.input()))
    def test_other_task_and_forged_entry_rejected(self):
        self.assertEqual(self.box.invoke('context_read',{'candidateId':'other','window':'sentence'})['error'],'candidate_outside_task')
        self.assertEqual(self.box.invoke('entry_read',{'candidateId':'c1','entryIds':['forged']})['error'],'entry_outside_candidate_search_ledger')
    def test_missing_snapshot_not_dictionary_absence(self):
        result=self.box.invoke('dictionary_search',{'candidateId':'c1','query':'unseen','mode':'lemma'})
        self.assertFalse(result['snapshotQueryAvailable']);self.assertIsNotNone(result['coverageWarning'])
        self.assertIn('error',self.box.invoke('dictionary_search',{'candidateId':'c1','query':'unseen','mode':'lemma'}))
    def test_initial_evidence_and_unresolved_contract(self):
        output=DecisionBatch.model_validate({'decisions':[{'candidateId':'c1','outcome':'resolved','selectedEntryIds':['e1'],'evidenceRefs':['e1'],'reason':'x'}]})
        self.box.validate(output)
        output.decisions[0].outcome='not_found'
        with self.assertRaises(ValueError):self.box.validate(output)
    def test_invented_output_id_rejected(self):
        output=DecisionBatch.model_validate({'decisions':[{'candidateId':'c1','outcome':'resolved','selectedEntryIds':['forged'],'evidenceRefs':[],'reason':'x'}]})
        with self.assertRaises(ValueError):self.box.validate(output)

if __name__=='__main__':unittest.main()
