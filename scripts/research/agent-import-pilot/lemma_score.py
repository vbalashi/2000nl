"""Dictionary-oriented hard lemma/POS scoring; not corpus-wide UD accuracy."""
import argparse,json
from pathlib import Path
from mwe_benchmark_data import VIDEOS

def main(args):
    ref=json.loads((args.study/'lemma-reference.json').read_text());cases=ref['cases'];variants={}
    if args.sources:
        sources={k:json.loads((args.sources/v/'prepared.json').read_text()) for k,v in VIDEOS.items()};original=[]
        for c in cases:
            source=sources[c['video']];s=next(s for s in source['sentences'] if s['sentenceId']==c['sentenceId']);target=c['tokens'][c['targetTokenId']];absolute=s['start']+target['start'];matches=[p for p in source['candidates'] if any(o['start']==absolute and o['surface']==target['text'] for o in p['occurrences'])]
            if len(matches)!=1:raise ValueError('original_token_alignment')
            p=matches[0];original.append({'caseId':c['caseId'],'lemma':p['lemma'],'pos':p['pos']})
        variants['spacy-sm-original-full-source']=original
    for name in ['spacy-nl_core_news_sm','spacy-nl_core_news_md','stanza-alpino']:
        p=args.study/('lemma-'+name+'.json')
        if not p.exists():continue
        d=json.loads(p.read_text());rows=[]
        for c in cases:
            target=c['tokens'][c['targetTokenId']];words=d['hints'][c['caseId']]['tokens'];matches=[w for w in words if w['start']==target['start'] and w['end']==target['end']]
            if len(matches)!=1:raise ValueError('lemma_parser_alignment')
            rows.append({'caseId':c['caseId'],'lemma':matches[0]['lemma'],'pos':matches[0]['pos']})
        variants[name]=rows
    for name in ['lemma-luna-low','lemma-luna-high','lemma-sol-low']:
        p=args.study/(name+'.json')
        if p.exists():variants[name]=json.loads(p.read_text())['result']['cases']
    scores={}
    for name,rows in variants.items():
        byid={r['caseId']:r for r in rows};details=[]
        for c in cases:
            r=byid[c['caseId']];details.append({'caseId':c['caseId'],'surface':c['tokens'][c['targetTokenId']]['text'],'expectedLemma':c['expectedLemma'],'predictedLemma':r['lemma'],'allowedPos':c['allowedPos'],'predictedPos':r['pos'],'lemmaCorrect':r['lemma'].casefold().strip()==c['expectedLemma'].casefold(),'posAcceptable':r['pos'] in c['allowedPos']})
        scores[name]={'cases':len(cases),'lemmaCorrect':sum(d['lemmaCorrect'] for d in details),'posAcceptable':sum(d['posAcceptable'] for d in details),'both':sum(d['lemmaCorrect'] and d['posAcceptable'] for d in details),'details':details}
    (args.study/'lemma-scores.json').write_text(json.dumps(scores,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:{x:v[x] for x in ['cases','lemmaCorrect','posAcceptable','both']} for k,v in scores.items()},indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('study',type=Path);p.add_argument('--sources',type=Path);main(p.parse_args())
