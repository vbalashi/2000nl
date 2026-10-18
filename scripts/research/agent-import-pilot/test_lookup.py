import hashlib,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from lookup import lookup,literal

class CheckpointTests(unittest.TestCase):
    def test_checkpoint_reuses_same_principal_and_queries_without_request(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);ref=root/'reference';email='fixture@example.invalid'
            scope=hashlib.sha256(('pilot-all-accessible-nl-v1:'+email+':'+str(ref.resolve())).encode()).hexdigest()
            (root/'batch-0000.json').write_text(json.dumps({'scopeFingerprint':scope,'rows':[{'query':'brug','result':{}}]}))
            with patch('lookup.subprocess.run',side_effect=AssertionError('unexpected request')):
                self.assertEqual(lookup(['brug'],email,ref,root)['rows'][0]['query'],'brug')
                for changed_queries,changed_email in [(['geld'],email),(['brug'],'other@example.invalid')]:
                    with self.assertRaises(ValueError):lookup(changed_queries,changed_email,ref,root)

    def test_request_bound_before_database(self):
        with tempfile.TemporaryDirectory() as d:
            with patch('lookup.subprocess.run',side_effect=AssertionError('unexpected request')):
                with self.assertRaises(ValueError):lookup(['x']*501,'fixture@example.invalid',Path(d),Path(d))

if __name__=='__main__':unittest.main()
