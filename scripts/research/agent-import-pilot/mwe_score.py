"""Score frozen lexical cores, optional references neutral; no model judge as gold."""
import argparse,json
from pathlib import Path

def max_match(pred,gold,relaxed=False):
    def compatible(p,g):
        a=set(p['tokenIds']);b=set(g['tokenIds'])
        return a==b if not relaxed else bool(a|b) and len(a&b)/len(a|b)>=.5
    edges={i:[j for j,g in enumerate(gold) if compatible(p,g)] for i,p in enumerate(pred)}
    matched={}
    def augment(i,seen):
        for j in edges[i]:
            if j in seen:continue
            seen.add(j)
            if j not in matched or augment(matched[j],seen):matched[j]=i;return True
        return False
    for i in edges:augment(i,set())
    return set(matched.values()),len(matched)
def metric(pred,gold,fp):
    p=pred/(pred+fp) if pred+fp else 0;r=pred/gold if gold else 0
    return {'tp':pred,'fp':fp,'fn':gold-pred,'precision':p,'recall':r,'f1':2*p*r/(p+r) if p+r else 0}
def score(reference,result,split=None):
    cases=[c for c in reference['cases'] if split is None or c['split']==split];pids={c['caseId'] for c in cases};units=result['units'];exact_tp=relaxed_tp=exact_fp=relaxed_fp=neutral=required=0;details=[]
    for c in cases:
        pred=[u for u in units if u['caseId']==c['caseId']];gold=c['required'];optional=c['optional'];required+=len(gold)
        exact_used,etp=max_match(pred,gold);relaxed_used,rtp=max_match(pred,gold,True)
        # Optional exact reference matches are not errors, but do not add required recall.
        en=sum(1 for i,u in enumerate(pred) if i not in exact_used and any(set(u['tokenIds'])==set(g['tokenIds']) for g in optional))
        rn=sum(1 for i,u in enumerate(pred) if i not in relaxed_used and any(set(u['tokenIds'])==set(g['tokenIds']) for g in optional))
        exact_tp+=etp;relaxed_tp+=rtp;exact_fp+=len(pred)-etp-en;relaxed_fp+=len(pred)-rtp-rn;neutral+=en
        details.append({'caseId':c['caseId'],'required':len(gold),'predictions':len(pred),'exactTp':etp,'relaxedTp':rtp,'exactFp':len(pred)-etp-en,'missedCanonical':[g['canonical'] for j,g in enumerate(gold) if not any(set(g['tokenIds'])==set(u['tokenIds']) for u in pred)]})
    invalid=[u for u in result.get('invalid',[]) if split is None or u['caseId'] in pids];bad=sum(u['reason'] not in ['missing_or_duplicate_case'] for u in invalid)
    canonical_hits=sum(any(u.get('canonical','').casefold().strip()==g['canonical'].casefold().strip() for u in units if u['caseId']==c['caseId']) for c in cases for g in c['required'])
    return {'canonicalExactRecall':canonical_hits/required if required else 0,'canonicalExactHits':canonical_hits,'exactCore':metric(exact_tp,required,exact_fp+bad),'relaxedIoU50':metric(relaxed_tp,required,relaxed_fp+bad),'optionalNeutralMatches':neutral,'invalid':len(invalid),'required':required,'caseDetails':details}
def main(args):
    ref=json.loads((args.study/'reference.json').read_text());out={}
    for name in ['spacy-nl_core_news_sm','spacy-nl_core_news_md','stanza-alpino','luna-generic-validated','luna-taxonomy-validated','luna-high-validated','sol-taxonomy-validated','luna-context-validated','luna-hints-validated','luna-taxonomy-repeat-validated','specialist-grammar-validated','specialist-lexical-validated','specialists-union-validated','union-validated','union-veto-validated','reconcile-validated']:
        p=args.study/(name+'.json')
        if not p.exists():continue
        value=json.loads(p.read_text());out[name]={'all':score(ref,value),'challenge':score(ref,value,'challenge'),'extra':score(ref,value,'extra')}
    (args.study/'scores.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:{'exact':v['all']['exactCore'],'relaxed':v['all']['relaxedIoU50'],'neutral':v['all']['optionalNeutralMatches']} for k,v in out.items()},ensure_ascii=False,indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('study',type=Path);main(p.parse_args())
