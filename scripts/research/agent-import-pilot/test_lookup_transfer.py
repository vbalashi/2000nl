import unittest
from lookup_transfer import query_plan
class QueryCoverageTests(unittest.TestCase):
    def test_overflow_stays_explicit_and_lemmas_prioritized(self):
        data={'candidates':[{'lemma':'brug','forms':['Brug','bruggen']},{'lemma':'weg','forms':['weg']}],'expressionProposals':[{'kind':'verb_preposition_candidate','query':'gaan in'}]}
        plan=query_plan(data,2)
        self.assertEqual(plan['queries'],['brug','weg'])
        self.assertIn('bruggen',plan['deferredQueries']);self.assertIn('gaan in',plan['deferredQueries'])
if __name__=='__main__':unittest.main()
