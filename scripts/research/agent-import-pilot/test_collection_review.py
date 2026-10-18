import unittest
from collection_review import validate_picks,validate_checks,prepare
class ReviewBoundaryTests(unittest.TestCase):
    def test_foreign_entry_rejected_even_with_valid_candidate(self):
        case={'candidateId':'c1','entries':[{'ref':'R1'}]}
        with self.assertRaisesRegex(ValueError,'entry_outside_shortlist'):
            validate_picks({'decisions':[{'candidateId':'c1','outcome':'selected','entryRefs':['R2']}]},[case])
    def test_duplicate_missing_and_empty_selection_fail(self):
        cases=[{'candidateId':'c1','entries':[{'ref':'R1'}]},{'candidateId':'c2','entries':[]}]
        with self.assertRaisesRegex(ValueError,'candidate_coverage_mismatch'):
            validate_picks({'decisions':[{'candidateId':'c1','outcome':'unresolved','entryRefs':[]}]*2},cases)
        with self.assertRaisesRegex(ValueError,'outcome_entries_mismatch'):
            validate_picks({'decisions':[{'candidateId':'c1','outcome':'selected','entryRefs':[]}]},cases[:1])
    def test_verifier_must_cover_every_proposed_pair_once(self):
        with self.assertRaisesRegex(ValueError,'review_coverage_mismatch'):
            validate_checks({'decisions':[{'itemId':'c1:R1'},{'itemId':'c1:R1'}]},[{'itemId':'c1:R1'},{'itemId':'c2:R2'}])
if __name__=='__main__':unittest.main()
