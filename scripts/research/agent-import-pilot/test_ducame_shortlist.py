import unittest
from lxml import etree
from ducame_shortlist import candidates,align
class ShortlistTests(unittest.TestCase):
    def test_repeated_lemma_requires_two_occurrences(self):
        args=({'hand':[1]}, {'1':['hand','hand']}, {'1':'DCM1'}, {'DCM1':'test'})
        self.assertEqual(candidates(['hand'],*args),[])
        self.assertEqual(candidates(['hand','hand'],*args),[1])
    def test_alternative_and_missing_lexicon_id(self):
        args=({'staan':[1,2]}, {'1':['staan','voet|been'],'2':['staan']},{'1':'one','2':'missing'},{'one':'test'})
        self.assertEqual(candidates(['staan','been'],*args),[1])
    def test_alignment_rejects_skipped_source_words(self):
        tree=etree.fromstring('<alpino_ds><node word="houdt" begin="0" end="1"/></alpino_ds>')
        with self.assertRaises(ValueError):align('Hij houdt',[],tree)
    def test_alignment_keeps_noncontiguous_token_ids(self):
        tree=etree.fromstring('<alpino_ds><node word="Hij" begin="0" end="1"/><node word="houdt" begin="1" end="2"/></alpino_ds>')
        tokens=[{'id':0,'text':'Hij','start':0,'end':3},{'id':3,'text':'houdt','start':4,'end':9}]
        self.assertEqual(align('Hij houdt',tokens,tree),{1:[0],2:[3]})
if __name__=='__main__':unittest.main()
