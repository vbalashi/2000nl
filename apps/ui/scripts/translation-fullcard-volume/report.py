"""Offline, source/response-bound review and size association report; no provider calls."""
import collections, hashlib, html, json, math, pathlib, statistics
P=pathlib.Path('/Users/khrustal/adhoc/2000nl-research-archives/655-fullcard-volume-v1')
def read(p): return json.loads(p.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):
 with p.open('x') as f: json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def ranks(a):
 s=sorted(range(len(a)),key=lambda i:a[i]);r=[0.]*len(a);j=0
 while j<len(s):
  k=j+1
  while k<len(s) and a[s[k]]==a[s[j]]:k+=1
  for i in s[j:k]:r[i]=(j+k-1)/2
  j=k
 return r
def corr(a,b):
 aa=ranks(a);bb=ranks(b);am=statistics.mean(aa);bm=statistics.mean(bb)
 den=math.sqrt(sum((x-am)**2 for x in aa)*sum((x-bm)**2 for x in bb))
 return sum((x-am)*(y-bm) for x,y in zip(aa,bb))/den if den else None
def wilson(k,n):
 if not n:return None
 z=1.96;c=(k/n+z*z/(2*n))/(1+z*z/n);h=z*math.sqrt(k/n*(1-k/n)/n+z*z/(4*n*n))/(1+z*z/n)
 return [max(0,c-h),min(1,c+h)]
m=read(P/'manifest.json');frozen=read(P/'protocol-freeze.json');assert sha(P/'manifest.json')==frozen['manifestHash'];reviews={}
for f in sorted((P/'reviews').glob('batch*.json')):
 for r in read(f):
  assert r['id'] not in reviews;reviews[r['id']]=r
assert len(reviews)==100
rows=[];usage=collections.Counter();attempts=[]
for j in m['jobs']:
 c=read(P/'cards'/f"{j['id']}.json");r=read(P/'responses'/f"{j['id']}.json");v=reviews[j['id']]
 assert sha(P/'cards'/f"{j['id']}.json")==j['snapshotHash'];assert v['responseFileHash']==sha(P/'responses'/f"{j['id']}.json");assert v['cardFileHash']==j['snapshotHash']
 requested={x['fieldId'] for x in c['request']['content']};find=v['findings'];assert all(x['field'] in requested or x['field'].startswith('entryTranslation.') or x['field']=='response' for x in find)
 # Verify each actual application request body against its frozen body, each raw completion's parsed representation.
 for a in range(1,r['attempts']+1):
  req=read(P/'attempts'/f"{j['id']}-{a}-request.json");resp=read(P/'attempts'/f"{j['id']}-{a}-response.json");diag=read(P/'attempts'/f"{j['id']}-{a}-diagnostic.json");assert req['body']==c['expectedBody'];attempts.append(diag)
  data=resp.get('data') or {}
  for k in ['prompt_tokens','completion_tokens','total_tokens']:usage[k]+=data.get('usage',{}).get(k,0)
  usage['reasoning_tokens']+=data.get('usage',{}).get('completion_tokens_details',{}).get('reasoning_tokens',0)
  usage['cached_tokens']+=data.get('usage',{}).get('prompt_tokens_details',{}).get('cached_tokens',0)
 if r['outcome']=='ready':
  final=read(P/'attempts'/f"{j['id']}-{r['attempts']}-response.json")['data'];assert final['choices'][0]['finish_reason']=='stop';raw=json.loads(final['choices'][0]['message']['content']);assert raw==r['result'];assert [x['fieldId'] for x in r['result']['contentTranslations']]==[x['fieldId'] for x in c['request']['content']]
  lastusage=final.get('usage',{})
 else:lastusage={}
 rows.append({**j,'outcome':r['outcome'],'attempts':r['attempts'],'elapsedMs':r['elapsedMs'],'usage':lastusage,'findings':find,'sourceNotes':v.get('sourceNotes',[]),'reviewNote':v['note'],'major':any(x['severity']=='major' for x in find),'minor':any(x['severity']=='minor' for x in find),'semanticFieldsWithFindings':len({x['field'] for x in find if x['field'] in requested}),'contentFields':len(requested),'wholeCardAccepted':r['outcome']=='ready' and not find})
bands=[]
for band in ['small','medium','large','long-tail']:
 a=[r for r in rows if r['band']==band];ready=[r for r in a if r['outcome']=='ready'];badfields=sum(r['semanticFieldsWithFindings'] for r in ready);fields=sum(r['contentFields'] for r in ready)
 bands.append({'band':band,'n':len(a),'sentCharacters':[min(r['metrics']['sentCharacters'] for r in a),max(r['metrics']['sentCharacters'] for r in a)],'ready':len(ready),'accepted':sum(r['wholeCardAccepted'] for r in a),'majorCards':sum(r['major'] for r in a),'minorCards':sum(r['minor'] for r in a),'deliveryFailures':len(a)-len(ready),'firstAttemptReady':sum(r['outcome']=='ready' and r['attempts']==1 for r in a),'contentFieldsReviewed':fields,'contentFieldsWithFindings':badfields,'fieldFindingRate':badfields/fields if fields else None,'allIssueRateWilson95':wilson(sum(not r['wholeCardAccepted'] for r in a),len(a)),'sourceOmittedFields':sum(len(r['metrics']['omittedFields']) for r in a),'sourceTruncatedFields':sum(len(r['metrics']['truncatedFields']) for r in a),'promptTokensRange':[min((r['usage'].get('prompt_tokens',0) for r in ready),default=0),max((r['usage'].get('prompt_tokens',0) for r in ready),default=0)]})
summary={'schemaVersion':'translation-fullcard-volume-report-v1','manifestHash':sha(P/'manifest.json'),'reviewMethod':'primary agent; nonblind; all 86 completed responses reviewed field by field; 14 failures reviewed structurally; not human-approved; no external judge calls','bands':bands,'cards':len(rows),'providerCalls':len(attempts),'attemptDiagnostics':dict(collections.Counter((a.get('reason') or a['outcome']) for a in attempts)),'knownTokensFrom100ReceivedResponses':dict(usage),'usageUnavailableAttempts':sum(a.get('reason')=='timeout' for a in attempts),'servedModels':dict(collections.Counter((read(f).get('data') or {}).get('model','unavailable') for f in (P/'attempts').glob('*-response.json'))),'spearman':{'sentCharacters_vs_anyIssue':corr([r['metrics']['sentCharacters'] for r in rows],[int(not r['wholeCardAccepted']) for r in rows]),'sentCharacters_vs_semanticFieldFindingRate':corr([r['metrics']['sentCharacters'] for r in rows if r['outcome']=='ready'],[r['semanticFieldsWithFindings']/r['contentFields'] for r in rows if r['outcome']=='ready'])},'money':None,'moneyNote':'No verified Azure billed rates used; actual tokens saved. No audio, revision or semantic judge calls.','caveats':['Frozen ownerless dictionary snapshot, not fresh production traffic.','25 longest tail deliberately enriched; group sizes do not represent traffic.','Complexity, idioms and number of fields vary with size; association is not causation.','Source omissions at application limits are separate from model translation quality.','Single draw per real card and nonblind agent assessment; uncertainty remains.','Execution processed groups from small to long; time/load confounds timeout comparisons.','Usage for 11 aborted timeout attempts is unavailable; known token totals are not a complete billing total.']}
save(P/'summary.json',summary);save(P/'assessments.json',rows)
def esc(x):return html.escape(str(x))
page=['<!doctype html><html lang="ru"><meta charset="utf-8"><title>v8 — 100 полных карточек</title><style>body{font:16px system-ui;max-width:1150px;margin:35px auto;padding:0 18px;color:#24243b;background:#fafaff}table{border-collapse:collapse;width:100%}td,th{padding:9px;border:1px solid #ddd;text-align:left;vertical-align:top}details{background:white;border:1px solid #ddd;border-radius:10px;margin:12px 0;padding:15px}summary{cursor:pointer;font-weight:650}small{color:#666}pre{white-space:pre-wrap;overflow-wrap:anywhere}.bad{color:#a02a39}.ok{color:#28694d}a{color:#4545a1}</style><h1>Текущий v8/high: 100 полных карточек → русский</h1><p>Реальный production builder и OpenAITranslator. Промпт не менялся. 25 карточек на группу; последняя группа — самые длинные статьи доступного замороженного корпуса. Оценка агента, без слепого сравнения и человеческого подтверждения.</p><p>Объём — символы переводимого содержимого; служебный JSON и промпт учитываются отдельно в токенах. Исходные поля, пропущенные сборщиком приложения, не считаются ошибками модели.</p><table><tr><th>Группа / символы</th><th>Готово</th><th>Без замечаний</th><th>Смысловые ошибки</th><th>Небольшие огрехи</th><th>Сбой ответа</th><th>Поля с огрехами / проверено</th></tr>']
for b in bands:page.append('<tr>'+''.join('<td>'+esc(x)+'</td>' for x in [b['band']+' / '+str(b['sentCharacters']),b['ready'],b['accepted'],b['majorCards'],b['minorCards'],b['deliveryFailures'],str(b['contentFieldsWithFindings'])+'/'+str(b['contentFieldsReviewed'])])+'</tr>')
page.append('</table><p>Известные токены 100 полученных HTTP-ответов (ещё 11 timeout-попыток без usage): '+esc(dict(usage))+'. Запросов провайдеру: '+str(len(attempts))+'.</p><p><a href="summary.json">Сводка JSON</a> · <a href="manifest.json">Замороженный план</a> · <a href="assessments.json">Все оценки</a></p>')
for r in rows:
 c=read(P/'cards'/f"{r['id']}.json");response=read(P/'responses'/f"{r['id']}.json");result=response.get('result',{});translations={x['fieldId']:x for x in result.get('contentTranslations',[])}
 label='ОК' if r['wholeCardAccepted'] else 'Сбой ответа' if r['outcome']!='ready' else 'Есть смысловая ошибка' if r['major'] else 'Небольшие огрехи'
 page.append(f'<details><summary>{esc(r["id"])} · {esc(r["headword"])} · {r["metrics"]["sentCharacters"]} символов · {label}</summary><p>{esc(r["reviewNote"])}</p><p>Основной перевод: {esc(result.get("entryTranslation"))}</p>')
 if r['findings']:page.append('<pre class="bad">'+esc(json.dumps(r['findings'],ensure_ascii=False,indent=2))+'</pre>')
 if r['sourceNotes']:page.append('<p>Замечания к источнику: '+esc(r['sourceNotes'])+'</p>')
 page.append('<p>Поля источника, не отправленные приложением: '+esc(r['metrics']['omittedFields'])+'; сокращённые: '+esc(r['metrics']['truncatedFields'])+'</p><table><tr><th>Поле</th><th>Нидерландский</th><th>Русский</th><th>Буквально</th></tr>')
 for s in c['request']['content']:
  tr=translations.get(s['fieldId'],{});page.append('<tr>'+''.join('<td>'+esc(x)+'</td>' for x in [s['fieldId'],s['text'],tr.get('text','—'),tr.get('literalText') or '—'])+'</tr>')
 page.append(f'</table><p><a href="cards/{r["id"]}.json">Полный источник и запрос</a> · <a href="responses/{r["id"]}.json">Ответ</a></p></details>')
page.append('</html>');(P/'index.html').write_text('\n'.join(page))
print(json.dumps(summary,ensure_ascii=False,indent=2))
