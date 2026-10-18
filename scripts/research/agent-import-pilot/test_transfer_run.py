import asyncio,tempfile,unittest
from pathlib import Path
from transfer_run import PhaseLedger,BASE,MODEL,lean_projection
class LedgerLabelsTests(unittest.IsolatedAsyncioTestCase):
    async def test_nested_parallel_agents_keep_attribution_separate(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger=PhaseLedger(Path(directory),BASE,MODEL);ledger.label='resolver'
            async def nested(name):
                ledger.label=name
                await asyncio.sleep(0)
                return ledger.label
            self.assertEqual(await asyncio.gather(nested('draft1'),nested('draft2')),['draft1','draft2'])
            self.assertEqual(ledger.label,'resolver')

class WireProjectionTests(unittest.TestCase):
    def test_only_internal_bindings_are_omitted(self):
        entry={'entryId':'R01','headword':'brug','meanings':[{'definition':'bouwwerk','examples':['Een brug.']}],'contentBindings':['internal'],'headwordGroupId':'internal'}
        projected=lean_projection({'entries':[entry]})['entries'][0]
        self.assertEqual(projected['meanings'],entry['meanings']);self.assertEqual(projected['entryId'],'R01')
        self.assertNotIn('contentBindings',projected);self.assertIn('contentBindings',entry)

if __name__=='__main__':unittest.main()
