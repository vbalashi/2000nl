import unittest
from luna_video_report import compare
class VideoReportTests(unittest.TestCase):
    def test_renaming_same_core_is_not_new_discovery(self):
        r=compare([{'caseId':'s0','tokenIds':[1,3],'canonical':'old'}],[{'caseId':'s0','tokenIds':[1,3],'canonical':'new'}]);self.assertEqual(r['addedCores'],0);self.assertEqual(r['unchangedCore'],1);self.assertEqual(len(r['sameCoreCanonicalChanges']),1)
    def test_boundary_change_separate_from_disjoint_new_unit(self):
        r=compare([{'caseId':'s0','tokenIds':[1,2],'canonical':'old'}],[{'caseId':'s0','tokenIds':[0,1,2],'canonical':'fixed'},{'caseId':'s0','tokenIds':[7,8],'canonical':'other'}]);self.assertEqual(r['addedCores'],2);self.assertEqual(len(r['overlapChanges']),1);self.assertEqual(r['overlapChanges'][0]['newCanonical'],'fixed')
if __name__=='__main__':unittest.main()
