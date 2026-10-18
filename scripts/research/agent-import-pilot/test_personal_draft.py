import unittest
from personal_draft import PhraseBatch,PersonalDraft,validate_phrases,validate_draft
class DraftTests(unittest.TestCase):
    def test_unanchored_expression_rejected(self):
        b=PhraseBatch.model_validate({'proposals':[{'surface':'never said','canonicalForm':'zeggen','sentenceId':'s1','kind':'idiom'}]})
        with self.assertRaises(ValueError):validate_phrases(b,[{'sentenceId':'s1','text':'Hallo.'}])
    def test_forged_link_rejected(self):
        d=PersonalDraft(candidateId='c1',status='draft',headword='opkomen voor',definition='iemand verdedigen',example='Zij komt voor hem op.',grammar='scheidbaar',relatedEntryRefs=['R9999'],reason='x')
        with self.assertRaises(ValueError):validate_draft(d,'c1',['R0001'])
    def test_draft_is_unreviewed_and_not_saved(self):
        d=PersonalDraft(candidateId='c1',status='draft',headword='opkomen voor',definition='iemand verdedigen',example='Zij komt voor hem op.',grammar='',relatedEntryRefs=[],reason='x')
        r=validate_draft(d,'c1',[]);self.assertFalse(r['saved']);self.assertEqual(r['reviewStatus'],'unreviewed')
if __name__=='__main__':unittest.main()
