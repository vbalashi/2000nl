import unittest
from fresh_hint_test import additions
class FreshHintTests(unittest.TestCase):
    def test_same_core_is_not_extra(self):
        cases=[{'caseId':'f0'}];baseline={'units':[{'caseId':'f0','tokenIds':[1,2,3]}]};dictionary={'strictOutput':{'units':[{'caseId':'f0','tokenIds':[1,2],'canonical':'variant','lexiconId':'one'}]}}
        self.assertEqual(additions(cases,baseline,dictionary),{'f0':[]})
    def test_disjoint_proposal_preserves_anchor_and_id(self):
        cases=[{'caseId':'f0'}];baseline={'units':[{'caseId':'f0','tokenIds':[1,2]}]};dictionary={'strictOutput':{'units':[{'caseId':'f0','tokenIds':[4,6],'canonical':'new','lexiconId':'two'}]}}
        result=additions(cases,baseline,dictionary)['f0'];self.assertEqual(len(result),1);self.assertEqual(result[0]['tokenIds'],[4,6]);self.assertEqual(result[0]['queryType'],'strict')
    def test_cross_sentence_match_does_not_suppress_hint(self):
        baseline={'units':[{'caseId':'f1','tokenIds':[1]}]};dictionary={'strictOutput':{'units':[{'caseId':'f0','tokenIds':[1],'canonical':'new','lexiconId':'one'}]}}
        self.assertEqual(len(additions([{'caseId':'f0'}],baseline,dictionary)['f0']),1)
if __name__=='__main__':unittest.main()
