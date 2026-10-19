import tempfile,unittest,json
from pathlib import Path
from luna_video_run import review_plan,recovery_history,tool_choice_after_read
from luna_video_tools import VideoTools
class LunaVideoTests(unittest.TestCase):
    def test_twenty_turn_experiment_never_forces_early_final(self):
        for reads in [1,2,4,10,19]:self.assertIsNone(tool_choice_after_read(20,reads))

    def test_plan_balances_empty_and_nonempty_without_gold(self):
        cases=[{'caseId':f's{i}','tokens':list(range(15))} for i in range(40)]
        baseline={'units':[{'caseId':f's{i}','note':''} for i in range(20)]}
        p=review_plan(cases,baseline)
        self.assertEqual(len(p['caseIds']),24);self.assertEqual(p['caseIds'][-8],'s20');self.assertEqual(p['caseIds'][-1],'s39')
    def test_context_is_bounded_and_foreign_case_rejected(self):
        cases=[{'caseId':f's{i}','text':'Een zin.','tokens':[],'sourceRevision':'hash'} for i in range(8)]
        with tempfile.TemporaryDirectory() as d:
            b=VideoTools(Path(d),cases[3:4],cases,'owner',Path('/tmp'),'test')
            self.assertIn('error',b.invoke('context_read',{'caseId':'s7','radius':1}))
            self.assertEqual(len(b.invoke('context_read',{'caseId':'s3','radius':2})['sentences']),5)
            self.assertIn('error',b.invoke('context_read',{'caseId':'s3','radius':3}))
    def test_arbitrary_entry_read_cannot_fetch(self):
        case={'caseId':'s0','text':'zin','tokens':[],'sourceRevision':'hash'}
        with tempfile.TemporaryDirectory() as d:
            b=VideoTools(Path(d),[case],[case],'owner',Path('/tmp'),'test');r=b.invoke('entry_read',{'caseId':'s0','refs':['invented']});self.assertEqual(r['detail'],'entry_not_returned_to_case')
    def test_repeated_source_search_is_not_reexecuted(self):
        case={'caseId':'s0','text':'een zin','tokens':[],'sourceRevision':'hash'}
        with tempfile.TemporaryDirectory() as d:
            b=VideoTools(Path(d),[case],[case],'owner',Path('/tmp'),'test');args={'caseId':'s0','query':'zin'}
            self.assertEqual(len(b.invoke('source_search',args)['sentences']),1);self.assertEqual(b.invoke('source_search',args)['error'],'repeated_tool_call')
    def test_recovery_refuses_missing_tool_evidence(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'request-001.json').write_text(json.dumps({'input':[{'role':'user','content':'source'}]}));(p/'response-01.json').write_text(json.dumps({'status':'completed','output':[{'type':'function_call','name':'context_read','arguments':'{}','call_id':'c1'}]}))
            with self.assertRaisesRegex(RuntimeError,'pending_tool_output_not_recorded'):recovery_history(p,[{'event':'request','label':'task','index':1}],'task',p/'tools.jsonl')
    def test_recovery_preserves_completed_read_without_reexecution(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'request-001.json').write_text(json.dumps({'input':[{'role':'user','content':'source'}]}));(p/'response-01.json').write_text(json.dumps({'status':'completed','output':[{'type':'function_call','name':'context_read','arguments':'{}','call_id':'c1'}]}));(p/'tools.jsonl').write_text(json.dumps({'name':'context_read','args':{},'result':{'evidence':'saved'}})+'\n')
            history=recovery_history(p,[{'event':'request','label':'task','index':1}],'task',p/'tools.jsonl');self.assertEqual(history[-2]['call_id'],'c1');self.assertEqual(json.loads(history[-2]['output']),{'evidence':'saved'})
if __name__=='__main__':unittest.main()
