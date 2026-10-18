import unittest
from asr_capture import normalize
class AsrCaptureTests(unittest.TestCase):
    def test_asr_provenance_is_not_manual(self):
        job={'body':{'jobId':'j1','request':{'textSource':'asr'}}}
        result={'status':200,'body':{'language':'nl','phrases':[{'id':0,'startSec':0,'endSec':1,'text':'Hallo.'}],'meta':{'sourceKind':'provider','retrievalPath':'asr-job:model:asr'}}}
        out=normalize(result,job);self.assertEqual(out['sourceKind'],'provider');self.assertEqual(out['asrJobId'],'j1')
        result['body']['meta']['sourceKind']='manual'
        with self.assertRaises(ValueError):normalize(result,job)
if __name__=='__main__':unittest.main()
