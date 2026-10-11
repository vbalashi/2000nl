"""Offline paired token/cost/readiness report; exact local bodies remain private."""
import collections,hashlib,html,json,math,pathlib,statistics
P=pathlib.Path('/Users/khrustal/adhoc/2000nl-research-archives/655-fullcard-budget-v1');B=P.parent/'655-fullcard-volume-v1'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v):
 with p.open('x')as f:json.dump(v,f,ensure_ascii=False,indent=2);f.write('\n')
def stat(a):
 s=sorted(a);return {'min':s[0],'mean':statistics.mean(s),'median':statistics.median(s),'p95':s[math.ceil(.95*len(s))-1],'max':s[-1]}
def cost(u):
 i=u.get('prompt_tokens',0);o=u.get('completion_tokens',0);d=u.get('prompt_tokens_details',{});c=d.get('cached_tokens',0);w=d.get('cache_write_tokens',0);assert c+w<=i
 return {'uncachedReferenceUSD':(i*.1+o*.5)/1e6,'cacheAwareReferenceUSD':((i-c-w)*.1+c*.01+w*.125+o*.5)/1e6}
m=read(P/'manifest.json');assert sha(P/'manifest.json')==read(P/'protocol-freeze.json')['manifestHash'];reviews=read(P/'reviews.json');rv={r['id']:r for r in reviews};assert len(rv)==25
rows=[];tokens=collections.Counter();baselineTokens=collections.Counter();newCost=collections.Counter();baseCost=collections.Counter();diags=[];unknown=0;baseUnknown=0
for j in m['jobs']:
 id=j['id'];c=read(P/'cards'/f'{id}.json');r=read(P/'responses'/f'{id}.json');old=read(B/'responses'/f'{id}.json');v=rv[id]
 assert sha(P/'cards'/f'{id}.json')==j['snapshotHash'];assert v['cardFileHash']==j['snapshotHash'];assert v['responseFileHash']==sha(P/'responses'/f'{id}.json')
 cardCost=collections.Counter()
 for a in range(1,r['attempts']+1):
  req=read(P/'attempts'/f'{id}-{a}-request.json');raw=read(P/'attempts'/f'{id}-{a}-response.json');d=read(P/'attempts'/f'{id}-{a}-diagnostic.json');diags.append(d);assert req['body']==c['expectedBody'];same={**req['body'],'max_completion_tokens':2200};assert same==c['baselineBody'];assert req['body']['max_completion_tokens']==32768
  data=raw.get('data')or{};u=data.get('usage')
  if u:
   for k in ['prompt_tokens','completion_tokens','total_tokens']:tokens[k]+=u.get(k,0)
   tokens['reasoning_tokens']+=u.get('completion_tokens_details',{}).get('reasoning_tokens',0);tokens['cached_tokens']+=u.get('prompt_tokens_details',{}).get('cached_tokens',0);tokens['cache_write_tokens']+=u.get('prompt_tokens_details',{}).get('cache_write_tokens',0)
   co=cost(u);newCost.update(co);cardCost.update(co)
  else:unknown+=1
 for a in range(1,old['attempts']+1):
  u=(read(B/'attempts'/f'{id}-{a}-response.json').get('data')or{}).get('usage')
  if not u:baseUnknown+=1;continue
  for k in ['prompt_tokens','completion_tokens','total_tokens']:baselineTokens[k]+=u.get(k,0)
  baselineTokens['reasoning_tokens']+=u.get('completion_tokens_details',{}).get('reasoning_tokens',0);baseCost.update(cost(u))
 data=read(P/'attempts'/f"{id}-{r['attempts']}-response.json").get('data')or{};u=data.get('usage',{});choice=data.get('choices',[{}])[0];rawtext=choice.get('message',{}).get('content','');details=u.get('completion_tokens_details',{});reasoning=details.get('reasoning_tokens',0)
 fields=c['request']['content'];requested=[f['fieldId'] for f in fields]
 if r['outcome']=='ready':
  assert choice.get('finish_reason')=='stop';assert [f['fieldId'] for f in r['result']['contentTranslations']]==requested;assert json.loads(rawtext)==r['result'];assert v['fieldsReviewed']==requested
 row={**j,'outcome':r['outcome'],'baselineOutcome':old['outcome'],'attempts':r['attempts'],'elapsedMs':r['elapsedMs'],'usage':u,'visibleOutputTokens':u.get('completion_tokens',0)-reasoning,'finishReason':choice.get('finish_reason'),'servedModel':data.get('model'),'cost':dict(cardCost),'findings':v['findings'],'reviewNote':v['note'],'wholeCardAccepted':r['outcome']=='ready' and not v['findings']};rows.append(row)
summary={'schemaVersion':'translation-fullcard-budget-result-v1','manifestHash':sha(P/'manifest.json'),'cases':25,'baseline':{'cap':2200,'timeoutMs':15000,'ready':sum(r['baselineOutcome']=='ready' for r in rows),'knownTokens':dict(baselineTokens),'usageUnavailableAttempts':baseUnknown,'knownCostReferenceUSD':dict(baseCost)},'expanded':{'cap':32768,'timeoutMs':180000,'ready':sum(r['outcome']=='ready' for r in rows),'firstAttemptReady':sum(r['outcome']=='ready' and r['attempts']==1 for r in rows),'withoutFindings':sum(r['wholeCardAccepted'] for r in rows),'majorCards':sum(any(f['severity']=='major' for f in r['findings']) for r in rows),'minorCards':sum(any(f['severity']=='minor' for f in r['findings']) for r in rows),'providerCalls':len(diags),'diagnostics':dict(collections.Counter(d.get('reason',d['outcome']) for d in diags)),'knownTokens':dict(tokens),'usageUnavailableAttempts':unknown,'costReferenceUSD':dict(newCost),'averagePerAttemptedCardUSD':{k:v/25 for k,v in newCost.items()},'extrapolated100SameMixUSD':{k:v*4 for k,v in newCost.items()},'stats':{k:stat([r['usage'].get(k,0) for r in rows]) for k in ['prompt_tokens','completion_tokens','total_tokens']},'reasoningStats':stat([r['usage'].get('completion_tokens_details',{}).get('reasoning_tokens',0) for r in rows]),'visibleOutputStats':stat([r['visibleOutputTokens'] for r in rows]),'elapsedMsStats':stat([r['elapsedMs'] for r in rows]),'peakCapUtilization':max(r['usage'].get('completion_tokens',0) for r in rows)/32768},'servedModels':dict(collections.Counter(r['servedModel'] for r in rows)),'reviewMethod':'Primary agent, nonblind; all completed fields reviewed; failures retained. Not human-approved.','pricing':read(P/'pricing-reference.json'),'caveats':['Public OpenAI reference prices, actual Azure invoice tariff unverified. Cache-aware calculation uses reported read/write token subsets.','Completion includes reasoning; never charge reasoning a second time.','100-card money number is extrapolation from25 long meanings, not100 new calls.','Budget and timeout both changed; stochastic generations also differ. One draw per card.','Same production-bounded sources: three examples of longest source already omitted by application limits; this experiment does not restore them.','Original baseline has11 timeout attempts without usage; its known token/cost totals are lower bounds.']}
save(P/'summary.json',summary);save(P/'assessments.json',rows)
esc=lambda s:html.escape(str(s))
pages=['<!doctype html><html lang="ru"><meta charset="utf-8"><title>Полные карточки: достаточный бюджет v8</title><style>body{font:16px system-ui;max-width:1150px;margin:35px auto;padding:0 18px;background:#fafaff;color:#25253b}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:9px;text-align:left;vertical-align:top}details{background:white;border:1px solid #ddd;padding:15px;margin:12px 0;border-radius:10px}summary{font-weight:650;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>v8/high:25 полных длинных карточек, бюджет32 768</h1><p>Те же источники и промпт. Таймаут180s. Это отдельный повторный эксперимент; предыдущие ответы сохранены. Runtime не менялся.</p><pre>'+esc(json.dumps(summary,ensure_ascii=False,indent=2))+'</pre><p><a href="summary.json">Сводка</a> · <a href="pricing-reference.json">Тарифы и оговорки</a> · <a href="assessments.json">Оценки</a> · <a href="../655-fullcard-volume-v1/index.html">Предыдущие100 карточек</a></p>']
for r in rows:
 c=read(P/'cards'/f"{r['id']}.json");response=read(P/'responses'/f"{r['id']}.json");result=response.get('result');raw=read(P/'attempts'/f"{r['id']}-{r['attempts']}-response.json").get('data')or{}
 if not result:
  try:result=json.loads(raw['choices'][0]['message']['content'])
  except:result={}
 tr={x['fieldId']:x for x in result.get('contentTranslations',[])}
 pages.append(f'<details><summary>{esc(r["id"])} · {esc(r["headword"])} · {esc(r["outcome"])} · output{r["usage"].get("completion_tokens")} · {r["elapsedMs"]/1000:.1f}s</summary><p>{esc(r["reviewNote"])}</p><p>Раньше: {esc(r["baselineOutcome"])}. Основной перевод: {esc(result.get("entryTranslation"))}. Стоимость: {esc(r["cost"])}</p><pre>'+esc(json.dumps(r['findings'],ensure_ascii=False,indent=2))+'</pre><table><tr><th>Поле</th><th>Нидерландский</th><th>Русский</th><th>Буквально</th></tr>')
 for f in c['request']['content']:
  v=tr.get(f['fieldId'],{});pages.append('<tr>'+''.join('<td>'+esc(x)+'</td>' for x in [f['fieldId'],f['text'],v.get('text','ПОЛЕ ПРОПУЩЕНО'),v.get('literalText') or '—'])+'</tr>')
 pages.append(f'</table><p><a href="cards/{r["id"]}.json">Источник и запрос</a> · <a href="responses/{r["id"]}.json">Ответ</a></p></details>')
pages.append('</html>');(P/'index.html').write_text('\n'.join(pages));print(json.dumps(summary,ensure_ascii=False,indent=2))
