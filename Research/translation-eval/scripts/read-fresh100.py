"""Inspect licensed fresh100 source/output locally; never publish raw corpus."""
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--offset',type=int,default=0);p.add_argument('--limit',type=int,default=10);a=p.parse_args();r=Path(__file__).resolve().parents[1]
for c in json.loads((r/'cases/fresh100-v1.json').read_text())['cases'][a.offset:a.offset+a.limit]:
 q=c['request'];print('\n'+c['id'],q['headword']['text'],q['targetLanguageCode'],q['headword']['partOfSpeechCode']);print('NL',json.dumps([x['text'] for x in q['content']],ensure_ascii=False))
 for run in ['fresh100-gpt41-v4','fresh100-luna6-v5']:
  f=r/'runs'/run/'responses'/(c['id']+'-1.json')
  if not f.exists():print(run,'pending');continue
  o=json.loads(f.read_text());v=o.get('result');e=v.get('entryTranslation') if v else None
  print(run,json.dumps({'outcome':o['outcome'],'entry':None if e is None else [e['primaryText'],e['alternativeTexts'],e['baseText'],e['note']],'content':[x['text'] for x in v['contentTranslations']] if v else None},ensure_ascii=False))
