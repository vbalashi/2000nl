import unittest
from personal_draft import PhraseBatch,PersonalDraft,validate_phrases,validate_draft
class DraftTests(unittest.TestCase):
    def test_source_casing_normalization_is_recorded(self):
        b=PhraseBatch.model_validate({'proposals':[{'surface':'op je bek gaan','canonicalForm':'op je bek gaan','sentenceId':'s1','kind':'idiom'}]})
        r=validate_phrases(b,[{'sentenceId':'s1','text':'Op je bek gaan.'}])
        self.assertEqual(r['proposals'][0]['surface'],'Op je bek gaan')
        self.assertEqual(r['anchorCorrections'][0]['modelSurface'],'op je bek gaan')
        self.assertEqual(b.proposals[0].surface,'op je bek gaan')

    def test_ambiguous_case_only_anchor_is_not_guessed(self):
        b=PhraseBatch.model_validate({'proposals':[{'surface':'op je bek gaan','canonicalForm':'op je bek gaan','sentenceId':'s1','kind':'idiom'}]})
        with self.assertRaises(ValueError):validate_phrases(b,[{'sentenceId':'s1','text':'Op je bek gaan. OP JE BEK GAAN.'}])

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
