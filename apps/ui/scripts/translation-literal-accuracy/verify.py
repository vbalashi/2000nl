"""Verify frozen source parity, split separation and saved response identity offline."""
import hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[4]/'Research/translation-eval/literal-accuracy-v1'
def digest(value):return hashlib.sha256(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
for split in ('development','heldout2'):
 manifests=[json.loads((root/(split+'-'+v)/'manifest.json').read_text()) for v in ('baseline','structure','conservative')]
 baseline=manifests[0]
 for m in manifests:
  assert m['inputHash']==digest(m['jobs'])
  assert m['settingsHash']==digest(m['profile'])
  assert m['profile']==baseline['profile']
  assert [j['request'] for j in m['jobs']]==[j['request'] for j in baseline['jobs']]
  assert [j['messages'][1] for j in m['jobs']]==[j['messages'][1] for j in baseline['jobs']]
  for job in m['jobs']:
   p=root/m['runId']/(job['id']+'.json')
   if not p.exists():continue
   d=json.loads(p.read_text());assert d['inputHash']==digest(job) and d['responseHash']==digest(d['raw'])
   if d['outcome']=='ready':
    assert [x['fieldId'] for x in d['result']['contentTranslations']]==[x['fieldId'] for x in job['request']['content']]
    assert all('literalText' not in translated or source['role']=='idiom' for source,translated in zip(job['request']['content'],d['result']['contentTranslations']))
dev=json.loads((root/'development-baseline/manifest.json').read_text());hold=json.loads((root/'heldout2-baseline/manifest.json').read_text())
assert not set(j['id'] for j in dev['jobs'])&set(j['id'] for j in hold['jobs'])
print('Frozen request parity, settings, split separation, response hashes and field identity verified.')
