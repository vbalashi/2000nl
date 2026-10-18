import asyncio,tempfile,unittest
from pathlib import Path
from transfer_run import PhaseLedger,BASE,MODEL
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
if __name__=='__main__':unittest.main()
