import unittest,json,subprocess,sys,tempfile
from pathlib import Path
from summarize_cost import estimate
class CostTests(unittest.TestCase):
    def test_cache_partition_and_reasoning_not_double_counted(self):
        r=estimate([{'event':'response','usage':{'input_tokens':100,'input_tokens_details':{'cached_tokens':20,'cache_write_tokens':70},'output_tokens':10,'output_tokens_details':{'reasoning_tokens':5}}}])
        self.assertAlmostEqual(r['estimatedPublishedUsd'],(10*.1+20*.01+70*.125+10*.5)/1e6)
    def test_explicit_other_model_rates_do_not_use_luna_prices(self):
        r=estimate([{'event':'response','usage':{'input_tokens':100,'output_tokens':10}}],{'ordinaryInput':2,'cacheRead':.1,'cacheWrite':2.5,'output':10})
        self.assertAlmostEqual(r['estimatedPublishedUsd'],.0003)
    def test_unknown_is_not_free_usage(self):
        self.assertEqual(estimate([{'event':'response','usage':None}])['unknownUsageResponses'],1)
    def test_overlapping_cache_partition_rejected(self):
        with self.assertRaises(ValueError):estimate([{'event':'response','usage':{'input_tokens':2,'input_tokens_details':{'cached_tokens':2,'cache_write_tokens':2},'output_tokens':1}}])
    def test_same_phase_folder_names_do_not_overwrite_per_source_costs(self):
        with tempfile.TemporaryDirectory() as t:
            paths=[]
            for video in ['one','two']:
                p=Path(t)/video/'model-phase'/'wire.jsonl';p.parent.mkdir(parents=True)
                p.write_text(json.dumps({'event':'response','label':'select-01','usage':{'input_tokens':10,'output_tokens':1}})+'\n');paths.append(str(p))
            out=Path(t)/'cost.json'
            subprocess.run([sys.executable,str(Path(__file__).with_name('summarize_cost.py')),*paths,'--output',str(out)],check=True,capture_output=True)
            r=json.loads(out.read_text());self.assertEqual(len(r['groups']),2);self.assertEqual(sum(g['responses'] for g in r['groups'].values()),r['total']['responses'])
if __name__=='__main__':unittest.main()
