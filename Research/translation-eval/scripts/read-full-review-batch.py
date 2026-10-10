"""Inspect local licensed source/output batches without publishing them in Git."""
from pathlib import Path
import argparse,json
p=argparse.ArgumentParser();p.add_argument('--split',choices=['development','validation'],required=True);p.add_argument('--offset',type=int,default=0);p.add_argument('--limit',type=int,default=3);a=p.parse_args();r=Path(__file__).resolve().parents[1]
suite=json.loads((r/'cases'/f'full-{a.split}-v1.json').read_text())
for c in suite['cases'][a.offset:a.offset+a.limit]:
 q=c['request'];print('\n',c['id'],q['headword']['text'],q['headword']['partOfSpeechCode'],q['targetLanguageCode']);print('NL',json.dumps([x['text'] for x in q['content']],ensure_ascii=False))
 for model in ['gpt41','luna56','luna6']:
  versions=[3,4] if a.split=='development' else ['selected']
  for v in versions:
   name=f'full-dev-{model}-v{v}' if a.split=='development' else f'full-validation-{model}-v1'
   f=r/'runs'/name/'responses'/(c['id']+'-1.json')
   if not f.exists() and a.split=='validation' and model=='luna56':
    f=r/'runs/full-validation-luna56-continuation-v1/responses'/(c['id']+'-1.json')
   if not f.exists():print(model,v,'pending');continue
   o=json.loads(f.read_text());res=o.get('result')
   if not res:print(model,v,o['outcome']);continue
   e=res['entryTranslation'];print(model,v,json.dumps({'entry':None if e is None else [e['primaryText'],e['alternativeTexts'],e['baseText'],e['note']],'content':[x['text'] for x in res['contentTranslations']]},ensure_ascii=False))
