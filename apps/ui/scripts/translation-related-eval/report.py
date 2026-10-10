"""Rebuild the offline report from saved responses and explicit agent assessments."""
import hashlib, html, json, math, statistics
from pathlib import Path
ROOT = Path(__file__).resolve().parents[4] / 'Research/translation-eval/related-v1'
FINDINGS = {
 'baseline-v8-high': {'cat-ru': ('serious','literal-image','Literal says the cat is sitting in the tree instead of preserving out of the tree.')},
 'candidate-v10-high': {'cat-en': ('serious','literal-image','Literal puts the observer in the tree: watch the cat from the tree.'), 'poor-en': ('minor','alternative','Impoverished intensifies the broad selected sense having little money.')},
 'regression-v8-high': {'horse-ru': ('minor','literal-usefulness','Natural equivalent already preserves the horse/cart image; extra literal adds little.'), 'welcome-en': ('minor','greeting','Very welcome is incomplete as a standalone greeting.'), 'welcome-ru': ('minor','greeting','Сердечно добро пожаловать is an unnatural greeting.')},
 'regression-v10-high': {'welcome-en': ('minor','greeting','A warm welcome is a noun phrase rather than the supplied greeting.'), 'idiom-only-ru': ('minor','source-addition','Натворил adds wrongdoing absent from the source explanation.'), 'garden-en': ('minor','literal-usefulness','The natural garden-path equivalent already conveys the source garden image.')},
}
def dump(path, data): path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
rows=[]; summaries=[]
for run,findings in FINDINGS.items():
 folder=ROOT/run; manifest=json.loads((folder/'manifest.json').read_text()); jobs={j['id']:j for j in manifest['jobs']}; outcomes=[]; assessments=[]
 for id,job in jobs.items():
  path=folder/(id+'.json'); d=json.loads(path.read_text()); assert d['id']==id
  assert hashlib.sha256(json.dumps(d['raw'],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()==d['responseHash']
  finding=findings.get(id); content=d['result']['contentTranslations'] if d['outcome']=='ready' else []
  related=[x for x in job['request']['content'] if x['role'] in ('synonym','antonym')]
  accepted=d['outcome']=='ready' and finding is None
  a={'id':id,'inputHash':d['inputHash'],'responseHash':d['responseHash'],'method':'agent-nonblind','humanApproved':False,'relatedFieldsAccepted':len(related) if d['outcome']=='ready' else 0,'relatedFieldsTotal':len(related),'wholeCardAccepted':accepted,'finding':None if not finding else dict(zip(('severity','category','explanation'),finding))}
  assessments.append(a); outcomes.append(d)
  body={'source':job['request'],'result':d['result'],'assessment':a}
  rows.append('<details><summary>'+html.escape(run+' / '+id+(' — accepted' if accepted else ' — review'))+'</summary><pre>'+html.escape(json.dumps(body,ensure_ascii=False,indent=2))+'</pre></details>')
 assert set(findings)<=set(jobs)
 dump(folder/'assessments.json',assessments)
 times=sorted(d['elapsedMs'] for d in outcomes)
 summaries.append({'run':run,'count':len(outcomes),'ready':sum(d['outcome']=='ready' for d in outcomes),'firstAttemptReady':sum(d['outcome']=='ready' and len(d['attempts'])==1 for d in outcomes),'wholeCardAccepted':sum(a['wholeCardAccepted'] for a in assessments),'serious':sum(bool(a['finding'] and a['finding']['severity']=='serious') for a in assessments),'relatedFieldsAccepted':sum(a['relatedFieldsAccepted'] for a in assessments),'relatedFieldsTotal':sum(a['relatedFieldsTotal'] for a in assessments),'inputTokens':sum(d['usage']['prompt_tokens'] for d in outcomes),'outputTokens':sum(d['usage']['completion_tokens'] for d in outcomes),'reasoningTokens':sum(d['usage']['completion_tokens_details'].get('reasoning_tokens',0) for d in outcomes),'medianMs':statistics.median(times),'p95Ms':times[math.ceil(len(times)*.95)-1]})
report={'method':'agent-nonblind; exploratory descriptive comparison, no human approval or statistical superiority claim','decision':'Keep default v8/high. Both prompts translate all related fields correctly in this set; v10 does not improve whole-card quality. Fix source/overlay/projection/UI; no extra model request.','regressionSet':'Reused previous synthetic regression examples; not an independent held-out set.','runs':summaries}
dump(ROOT/'summary.json',report)
(ROOT/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Related word translations</title><style>body{max-width:1100px;margin:30px auto;font:16px system-ui;padding:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:16px}summary{cursor:pointer;padding:10px}details{border-bottom:1px solid #ddd}</style><h1>Related word translation experiment</h1><p>112 saved calls. Agent review, nonblind, no human approval. All source data synthetic. Regression set reused, not fresh held-out.</p><pre>'+html.escape(json.dumps(report,ensure_ascii=False,indent=2))+'</pre>'+''.join(rows))
print(json.dumps(report,ensure_ascii=False,indent=2))
