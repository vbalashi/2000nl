"""Bind a non-blind agent assessment to frozen synthetic inputs and exact responses."""
import json, hashlib, statistics, html, math
from pathlib import Path
root = Path(__file__).resolve().parents[4] / 'Research/translation-eval/literal-v1'
# Explicit findings after reading each response; unlisted rows meet the focused rubric.
findings = {
 'baseline-v5': {'cat-en':('serious','sense-mismatch','Headword cat replaced by superclass pet.'),'bank-seat-en':('minor','unnecessary-alternative','Bench and sofa/couch introduce competing sub-senses for an underspecified furniture definition.')},
 'candidate-v6': {'angry-en':('minor','unnecessary-alternative','Upset also includes sadness, broader than anger.'),'basket-ru':('minor','content-translation-error','Natural idiom drops the not-as-good-as-claimed qualification.'),'lamp-en':('minor','content-translation-error','Get caught drops doing something wrong.'),'cat-en':('minor','literal-grammar','Watch the cat out of the tree is broken English.'),'ice-ru':('minor','unnecessary-literal','Natural translation already retains the ice image.')},
 'candidate-v7': {'cat-en':('serious','sense-mismatch','Headword cat replaced by pet.'),'luck-ru':('serious','sense-mismatch','Headword luck replaced by a definition paraphrase.')},
 'candidate-v8': {'cat-ru':('serious','literal-image-error','Literal changes out of the tree into on the tree.'),'nose-en':('minor','literal-image-error','Literal omits the falling action.')},
 'validation-v7': {'monkey-ru':('serious','sense-mismatch','Headword monkey replaced by animal.'),'water-en':('serious','sense-mismatch','Headword water replaced by liquid.'),'water-ru':('serious','sense-mismatch','Headword water replaced by liquid.'),'apple-en':('minor','content-translation-error','Talk things out does not explicitly retain a conflict.')},
 'validation-v8': {'hello-en':('minor','unnecessary-alternative','24-hour period is a definition-style gloss, not an ordinary synonym.'),'hello-ru':('serious','sense-mismatch','Daytime word день does not preserve the exact 24-hour unit as сутки would.'),'monkey-en':('serious','content-translation-error','Cat out of the bag generalizes a hidden intention to any revealed secret.')},
 'candidate-v9': {'ice-ru':('minor','unnecessary-literal','Second ice line adds no distinct source image.'),'nose-ru':('minor','literal-image-error','Literal weakens falling to finding oneself with a nose in butter.')},
 'validation-v9': {'arm-poor-en':('minor','unnecessary-alternative','Impoverished intensifies the broad little-money sense.')},
 'fresh-v5': {'horse-ru':('minor','unnatural-language','Запрягать телегу is not the normal Russian idiom ставить телегу.'),'idiom-only-ru':('minor','content-translation-error','Натворил adds wrongdoing absent from the synthetic source constraint.')},
 'fresh-v9': {'welcome-en':('minor','unnatural-language','Warmly welcome is an incomplete/unnatural standalone greeting.'),'horse-ru':('minor','unnecessary-literal','Same horse/cart image already present in the natural translation.')},
 'fresh-v9-medium': {'garden-en':('serious','unnatural-language','Explanation Someone deliberately mislead is ungrammatical.'),'welcome-en':('minor','unnatural-language','Very welcome is not a complete greeting.'),'horse-en':('minor','unnecessary-literal','Same horse/cart image already present.')},
 'fresh-v9-high': {'horse-en':('minor','unnecessary-literal','Same horse/cart image already present.'),'horse-ru':('minor','unnatural-language','Запрягать телегу is not the normal Russian idiom; literal also repeats its image.'),'idiom-only-ru':('minor','content-translation-error','Ordinary tell weakens the revealing/disclosing action.')},
 'fresh-v8-low': {'idiom-only-en':('minor','content-translation-error','Expose someone implies wrongdoing beyond revealing actions.'),'idiom-only-ru':('minor','content-translation-error','Разоблачить adds negative exposure.'),'welcome-en':('minor','unnatural-language','Heartily welcome is not a complete standalone greeting.'),'welcome-ru':('minor','content-translation-error','Definition invents a guest; greeting is unnatural.')},
 'fresh-v8-medium': {'welcome-en':('minor','unnatural-language','Very welcome is not a complete greeting.'),'welcome-ru':('minor','unnatural-language','Сердечно добро пожаловать is awkward Russian.'),'idiom-only-ru':('minor','content-translation-error','Натворил adds wrongdoing absent from the constraint.')},
 'fresh-v8-high': {},
 'development-v8-high': {'cat-ru':('serious','literal-image-error','Sitting on the tree changes the source out-of-tree image.')},
 'regression-v8-high': {},
 'stress-final': {},
 'stress-complete': {},
 'stress-v8-high': {'long-en':('serious','input-budget-fragment','Earlier request builder lost the idiom explanation and truncated an owned example to T; input assembly defect, not provider output truncation.'),'long-ru':('serious','input-budget-fragment','Earlier request builder lost the idiom explanation and truncated an owned example to T; input assembly defect, not provider output truncation.')},
}
for case in ['hand-en','hand-ru','luck-en','luck-ru','thanks-en','thanks-ru']:
 findings['candidate-v6'][case]=('minor','unnecessary-literal','Transparent social/help formula gains an unhelpful literal line.')
summary=[]; rendered=[]
for run in sorted(p for p in root.iterdir() if p.is_dir() and (p/'manifest.json').exists()):
 assert run.name in findings, ('Run needs explicit assessment', run.name)
 manifest=json.loads((run/'manifest.json').read_text()); jobs={j['id']:j for j in manifest['jobs']}
 rows=[json.loads(p.read_text()) for p in sorted(run.glob('*.json')) if p.name not in ['manifest.json','assessment.json']]
 assert len(rows)==len(jobs), (run.name,len(rows),len(jobs))
 assessed=[]
 for row in rows:
  issue=findings.get(run.name,{}).get(row['id'])
  if row['outcome']!='ready': issue=('serious','provider-failure','Provider did not return a complete valid contract.')
  assessed.append({'id':row['id'],'responseHash':row['responseHash'],'decision':'needs-work' if issue else 'accept','severity':issue[0] if issue else None,'failureCodes':[issue[1]] if issue else [],'rationale':issue[2] if issue else 'Meets the focused exact-sense, usefulness, grammaticality and optional-image rubric; omission alone is not an error.'})
  source=jobs[row['id']]['request'];result=row['result']
  rendered.append(f'<article data-run="{run.name}"><h3>{run.name} · {row["id"]}</h3><p>{html.escape(assessed[-1]["decision"]+": "+assessed[-1]["rationale"])}</p><div class="pair"><pre>{html.escape(json.dumps(source,ensure_ascii=False,indent=2))}</pre><pre>{html.escape(json.dumps(result,ensure_ascii=False,indent=2))}</pre></div></article>')
 assessment={'method':'agent','blind':False,'humanApproved':False,'manifestHash':hashlib.sha256((run/'manifest.json').read_bytes()).hexdigest(),'scope':'Focused synthetic ru/en cases, not population quality or a human review. Serious literal errors counted separately from primary meaning errors. No penalty for optional omission.','items':assessed}
 (run/'assessment.json').write_text(json.dumps(assessment,ensure_ascii=False,indent=2)+'\n')
 metric={'run':run.name,'count':len(rows),'accepted':sum(x['decision']=='accept' for x in assessed),'serious':sum(x['severity']=='serious'for x in assessed),'critical':0,'inputTokens':sum((x['usage']or{}).get('prompt_tokens',0)for x in rows),'outputTokens':sum((x['usage']or{}).get('completion_tokens',0)for x in rows),'reasoningTokens':sum((x['usage']or{}).get('completion_tokens_details',{}).get('reasoning_tokens',0)for x in rows),'medianMs':round(statistics.median(x['elapsedMs']for x in rows)),'p95Ms':sorted(x['elapsedMs']for x in rows)[max(0,math.ceil(len(rows)*.95)-1)],'failed':sum(x['outcome']!='ready'for x in rows),'attempts':sum(len(x['attempts'])for x in rows),'nonemptyAlternatives':sum(bool((x['result']or{}).get('entryTranslation',{}) and x['result']['entryTranslation']['alternativeTexts'])for x in rows),'nonemptyLiterals':sum(bool(f.get('literalText'))for x in rows for f in (x['result']or{}).get('contentTranslations',[]))}
 summary.append(metric)
(root/'summary.json').write_text(json.dumps({'humanApproved':False,'method':'non-blind-agent','runs':summary},ensure_ascii=False,indent=2)+'\n')
head='''<!doctype html><meta charset="utf-8"><title>Переводы: промпты и reasoning</title><style>body{font:16px system-ui;margin:24px;background:#f7f7fc;color:#24243a}article{background:white;padding:16px;margin:16px 0;border-radius:12px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}pre{white-space:pre-wrap;font-size:13px;overflow-wrap:anywhere}table{border-collapse:collapse}td,th{padding:7px;border:1px solid #ccc}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>Промпты и уровень рассуждения</h1><p>Синтетические примеры; оценки агента, без слепого сравнения. Человеческая проверка не выполнена. Все исходные запросы, ответы, настройки и ошибки сохранены рядом.</p>'''
head+='<table><tr><th>Прогон</th><th>Принято</th><th>Серьёзных</th><th>Вход</th><th>Выход</th><th>Reasoning</th><th>Медиана, мс</th></tr>'+''.join('<tr>'+''.join(f'<td>{html.escape(str(v))}</td>'for v in [x['run'],f"{x['accepted']}/{x['count']}",x['serious'],x['inputTokens'],x['outputTokens'],x['reasoningTokens'],x['medianMs']])+'</tr>'for x in summary)+'</table>'
head+='<p><label>Прогон <select id="run"><option value="">Все</option>'+''.join(f'<option>{x["run"]}</option>'for x in summary)+'</select></label></p>'
(root/'index.html').write_text(head+''.join(rendered)+'''<script>document.querySelector('#run').onchange=e=>document.querySelectorAll('article').forEach(a=>a.hidden=!!e.target.value&&a.dataset.run!==e.target.value)</script>''')
print(json.dumps(summary,ensure_ascii=False,indent=2))
