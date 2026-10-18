"""Local parser ablation using identical two dependency proposal rules. No network/API."""
import argparse,json,time,resource,importlib.metadata
from pathlib import Path

def ids_for_spans(case,spans):
    return sorted({t['id'] for t in case['tokens'] for a,b in spans if t['start']<b and t['end']>a})
def proposals(case,rows):
    result=[];byid={r['i']:r for r in rows}
    for t in rows:
        head=byid.get(t['head']);h2=byid.get(head['head']) if head else None
        if t['dep']=='compound:prt' and head:
            lemma=head['lemma'];particle=t['lemma'];canonical=lemma if lemma.startswith(particle) else particle+lemma
            result.append({'caseId':case['caseId'],'tokenIds':ids_for_spans(case,[(t['start'],t['end']),(head['start'],head['end'])]),'canonical':canonical,'category':'particle_verb','rule':'compound:prt'})
        if t['pos']=='ADP' and h2 and h2['pos']=='VERB':
            result.append({'caseId':case['caseId'],'tokenIds':ids_for_spans(case,[(t['start'],t['end']),(h2['start'],h2['end'])]),'canonical':h2['lemma']+' '+t['lemma'],'category':'verb_preposition','rule':'adp_head_head_verb'})
    return list({tuple(r['tokenIds']):r for r in result}.values())
def main(args):
    data=json.loads((args.study/args.reference_file).read_text());start=time.perf_counter()
    if args.engine=='spacy':
        import spacy
        nlp=spacy.load(args.model);loaded=time.perf_counter();docs=list(nlp.pipe([c['text'] for c in data['cases']]));rows=[]
        for doc in docs:rows.append([{'i':t.i,'text':t.text,'lemma':t.lemma_,'pos':t.pos_,'dep':t.dep_,'head':t.head.i,'start':t.idx,'end':t.idx+len(t)} for t in doc])
        versions={'spacy':spacy.__version__,'model':args.model,'modelVersion':nlp.meta.get('version')}
    else:
        import stanza,torch
        torch.set_num_threads(4)
        nlp=stanza.Pipeline('nl',dir=args.model_dir,package='alpino',processors='tokenize,pos,lemma,depparse',use_gpu=False,verbose=False,download_method=None);loaded=time.perf_counter();docs=nlp.bulk_process([c['text'] for c in data['cases']]);rows=[]
        for doc in docs:
            dr=[];offset=0
            for sent in doc.sentences:
                for w in sent.words:
                    if w.start_char is None or w.end_char is None:raise ValueError('parser_missing_offsets')
                    dr.append({'i':offset+w.id,'text':w.text,'lemma':w.lemma,'pos':w.upos,'dep':w.deprel,'head':offset+w.head if w.head else -1,'start':w.start_char,'end':w.end_char})
                offset+=len(sent.words)
            rows.append(dr)
        versions={'stanza':stanza.__version__,'torch':torch.__version__,'package':'alpino','device':'cpu','threads':4}
    parsed=time.perf_counter();units=[];hints={}
    for case,tokens in zip(data['cases'],rows):
        for t in tokens:
            if case['text'][t['start']:t['end']]!=t['text']:raise ValueError('parser_source_alignment')
        p=proposals(case,tokens);units+=p;hints[case['caseId']]={'tokens':tokens,'syntacticProposals':p}
    value={'referenceSha256':data['referenceSha256'],'versions':versions,'units':units,'invalid':[],'hints':hints,'metrics':{'loadSeconds':loaded-start,'parseSeconds':parsed-loaded,'totalSeconds':time.perf_counter()-start,'peakRssBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'sourceCases':len(data['cases']),'proposals':len(units)}}
    (args.study/(args.output_prefix+args.engine+'-'+args.model+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'versions':versions,'metrics':value['metrics']}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('study',type=Path);p.add_argument('--engine',choices=['spacy','stanza'],required=True);p.add_argument('--model',required=True);p.add_argument('--reference-file',default='reference.json');p.add_argument('--output-prefix',default='');p.add_argument('--model-dir',default='/tmp/2000nl-742-stanza-models');main(p.parse_args())
