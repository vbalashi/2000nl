import unittest
from prepare import prepare,validate_source

class PreparationTests(unittest.TestCase):
    def test_asr_requires_explicit_policy_and_receipt(self):
        capture={'language':'nl','sourceKind':'provider','asrJobId':'job1','retrievalPath':'asr-job:faster-whisper:model:asr'}
        with self.assertRaises(ValueError):validate_source(capture)
        validate_source(capture,True)
        capture.pop('asrJobId')
        with self.assertRaises(ValueError):validate_source(capture,True)

    def test_offsets_context_and_title(self):
        text='Dit is het NOS Journaal in Makkelijke Taal. Ik vertrouw op je.'
        out=prepare({'language':'nl','sourceKind':'manual','phrases':[{'id':0,'startSec':0,'endSec':4,'text':text}]})
        self.assertEqual(out['sentences'][0]['text'],'Dit is het NOS Journaal in Makkelijke Taal.')
        for c in out['candidates']:
            for o in c['occurrences']:
                self.assertEqual(out['text'][o['start']:o['end']],o['surface'])
                self.assertEqual(o['cueIds'],[0])
        # This checks preservation, not the parser's fallible lemma prediction.
        self.assertTrue(any('op' == out['text'][a:b] for e in out['expressionProposals'] for a,b in e['spans']))

    def test_particle_prefix_not_doubled(self):
        out=prepare({'language':'nl','sourceKind':'manual','phrases':[{'id':0,'startSec':0,'endSec':3,'text':'We moeten het probleem aan pakken.'}]})
        self.assertFalse(any(e['query']=='aanaanpakken' for e in out['expressionProposals']))

    def test_repeated_lemma_preserves_occurrences(self):
        out=prepare({'language':'nl','sourceKind':'manual','phrases':[{'id':0,'startSec':0,'endSec':3,'text':'De brug is oud. De brug is dicht.'}]})
        bridge=next(c for c in out['candidates'] if c['lemma']=='brug')
        self.assertEqual(len(bridge['occurrences']),2)
        self.assertNotEqual(bridge['occurrences'][0]['sentenceId'],bridge['occurrences'][1]['sentenceId'])

if __name__=='__main__':unittest.main()
