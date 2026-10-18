import unittest
from summarize_cost import estimate
class CostTests(unittest.TestCase):
    def test_cache_partition_and_reasoning_not_double_counted(self):
        r=estimate([{'event':'response','usage':{'input_tokens':100,'input_tokens_details':{'cached_tokens':20,'cache_write_tokens':70},'output_tokens':10,'output_tokens_details':{'reasoning_tokens':5}}}])
        self.assertAlmostEqual(r['estimatedPublishedUsd'],(10*.1+20*.01+70*.125+10*.5)/1e6)
    def test_unknown_is_not_free_usage(self):
        self.assertEqual(estimate([{'event':'response','usage':None}])['unknownUsageResponses'],1)
    def test_overlapping_cache_partition_rejected(self):
        with self.assertRaises(ValueError):estimate([{'event':'response','usage':{'input_tokens':2,'input_tokens_details':{'cached_tokens':2,'cache_write_tokens':2},'output_tokens':1}}])
if __name__=='__main__':unittest.main()
