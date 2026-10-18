"""Offline subtitle candidate packets. No provider calls or database mutations."""
import argparse, hashlib, json, resource, time
from pathlib import Path
import spacy


def prepare(capture, model='nl_core_news_sm'):
    start=time.perf_counter(); nlp=spacy.load(model); loaded=time.perf_counter()
    cues=capture['phrases']; parts=[]; ranges=[]; offset=0
    for cue in cues:
        text=cue['text'].replace('...', ' ').strip()
        parts.append(text); ranges.append((offset,offset+len(text),cue)); offset+=len(text)+1
    text=' '.join(parts); doc=nlp(text); parsed=time.perf_counter()
    packets={}; sentences=[]; expressions=[]
    # Parser can split an unpunctuated title at capitals. Merge those proposals.
    spans=[]; begin=0
    for proposed in doc.sents:
        if proposed[-1].text in {'.','!','?'}:
            spans.append(doc[begin:proposed.end]); begin=proposed.end
    if begin<len(doc):spans.append(doc[begin:])
    for si,sent in enumerate(spans):
        locations=[c for a,b,c in ranges if a<sent.end_char and b>sent.start_char]
        context={'sentenceId':f's{si}','text':sent.text,'start':sent.start_char,'end':sent.end_char,
                 'cueIds':[c['id'] for c in locations], 'startMs':round(min(c['startSec'] for c in locations)*1000),
                 'endMs':round(max(c['endSec'] for c in locations)*1000)}
        sentences.append(context)
        for token in sent:
            if not token.is_alpha:continue
            # Preserve all source tokens; only standalone content candidates are filtered.
            if token.pos_ not in {'NOUN','VERB','ADJ','ADV','PROPN'}:continue
            lemma=token.lemma_.lower();key=(lemma,token.pos_)
            p=packets.setdefault(key,{'candidateId':f'c{len(packets)}','lemma':lemma,'pos':token.pos_, 'forms':[], 'occurrences':[]})
            if token.text not in p['forms']:p['forms'].append(token.text)
            p['occurrences'].append({**context,'surface':token.text,'start':token.idx,'end':token.idx+len(token)})
        for token in sent:
            if token.dep_=='compound:prt':
                expressions.append({'kind':'particle_verb_candidate','surface':f'{token.head.text} … {token.text}',
                                    'query':token.head.lemma_.lower() if token.head.lemma_.lower().startswith(token.text.lower()) else token.text.lower()+token.head.lemma_.lower(),'spans':[[t.idx,t.idx+len(t)] for t in [token.head,token]],'context':context})
            if token.pos_=='ADP' and token.head.head.pos_=='VERB':
                expressions.append({'kind':'verb_preposition_candidate','query':f'{token.head.head.lemma_.lower()} {token.lemma_.lower()}',
                                    'spans':[[t.idx,t.idx+len(t)] for t in [token.head.head,token]],'context':context})
    return {'schemaVersion':'offline-pilot-v1','language':capture['language'],'sourceKind':capture['sourceKind'],
            'sourceHash':hashlib.sha256(json.dumps(capture['phrases'],sort_keys=True).encode()).hexdigest(),
            'text':text,'sentences':sentences,'candidates':list(packets.values()),'expressionProposals':expressions,
            'metrics':{'model':model,'spacy':spacy.__version__,'loadSeconds':loaded-start,'parseSeconds':parsed-loaded,
                       'totalSeconds':time.perf_counter()-start,'tokens':len(doc),'alphaTokens':sum(t.is_alpha for t in doc),
                       'sentences':len(sentences),'candidates':len(packets),'expressionProposals':len(expressions),
                       'peakRssBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('capture',type=Path);ap.add_argument('output',type=Path);args=ap.parse_args()
    capture=json.loads(args.capture.read_text());assert capture['language']=='nl' and capture['sourceKind']=='manual'
    result=prepare(capture)
    for p in result['candidates']:
        for o in p['occurrences']:assert result['text'][o['start']:o['end']]==o['surface']
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result['metrics']))
