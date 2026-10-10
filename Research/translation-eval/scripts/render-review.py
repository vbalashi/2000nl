"""Render a local, anonymous manual review; no network or model calls."""
import argparse, hashlib, json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--runs',required=True);p.add_argument('--output-dir',type=Path,required=True);p.add_argument('--allow-failures',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parents[1]
cases={};key={};missing=set();available=set()
for run_id in a.runs.split(','):
    if not run_id or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in run_id):raise SystemExit('invalid run id')
    run=root/'runs'/run_id;manifest_bytes=(run/'manifest.json').read_bytes();manifest=json.loads(manifest_bytes)
    manifest_hash=hashlib.sha256(manifest_bytes).hexdigest()
    if manifest_hash!=(run/'manifest.sha256').read_text().strip():raise SystemExit('manifest changed')
    for job in manifest['jobs']:
        job_name=f"jobs/{job['jobId']}.json";job_bytes=(run/job_name).read_bytes()
        if hashlib.sha256(job_bytes).hexdigest()!=manifest['snapshotHashes'][job_name]:raise SystemExit('job changed')
        item=json.loads(job_bytes)['item'];response_path=run/'responses'/f"{job['jobId']}.json"
        binding=(manifest['modelProfile']['id'],item['id'])
        if not response_path.exists():
            missing.add(binding);continue
        available.add(binding)
        response_bytes=response_path.read_bytes();response_hash=hashlib.sha256(response_bytes).hexdigest()
        if response_hash!=response_path.with_suffix('.json.sha256').read_text().strip():raise SystemExit('response changed')
        response=json.loads(response_bytes)
        if response['outcome']!='ready' and not a.allow_failures:raise SystemExit('incomplete run; pass --allow-failures to display explicit failures')
        case=cases.setdefault(item['id'],{'caseId':item['id'],'headword':item['request']['headword'],'language':item['request']['targetLanguageCode'],'source':item['request']['content'],'outputs':[]})
        if case['source']!=item['request']['content']:raise SystemExit('incompatible cases')
        case['outputs'].append({'responseHash':response_hash,'result':response.get('result'),'outcome':response['outcome']})
        key[response_hash]={'runId':run_id,'jobId':job['jobId'],'manifestHash':manifest_hash,'model':manifest['modelProfile']['model'],'promptId':manifest['promptId']}
if missing-available:raise SystemExit("unresolved missing outputs")
for case in cases.values():
    case['outputs'].sort(key=lambda o:hashlib.sha256((case['caseId']+o['responseHash']).encode()).hexdigest())
    for i,o in enumerate(case['outputs']):o['label']=chr(65+i)
a.output_dir.mkdir(parents=True,exist_ok=False)
(a.output_dir/'blind-key.json').write_text(json.dumps(key,ensure_ascii=False,indent=2)+'\n')
data=json.dumps(list(cases.values()),ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
template='''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Оценка переводов</title>
<style>body{font:16px system-ui,sans-serif;background:#f5f4fa;color:#25243a;margin:0}main{max-width:1400px;margin:24px auto;padding:0 20px}h1{font-size:27px}button,select,input,textarea{font:inherit;padding:8px;border:1px solid #c9c4dc;border-radius:7px;background:white}button{cursor:pointer}nav{display:flex;gap:12px;flex-wrap:wrap;align-items:center;position:sticky;top:0;background:#f5f4fa;padding:12px 0;z-index:1}.source,.card{background:white;border:1px solid #dfdce9;border-radius:12px;padding:18px}.source{margin:12px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px}.row{border-top:1px solid #eceaf3;padding-top:10px;margin-top:10px}.muted,small{color:#6f6a83}.primary{font-size:23px;font-weight:600}.scores{display:grid;grid-template-columns:1fr 65px;gap:6px}textarea{width:calc(100% - 20px);min-height:75px;margin-top:10px}.notice{background:#ebe7ff;padding:12px;border-radius:8px}@media(max-width:950px){.grid{grid-template-columns:1fr}}footer{margin:25px 0}</style>
<main><h1>Оценка переводов</h1><p class="muted">Одни и те же входы, ответы без названий моделей. Метки ответов перемешаны для каждого примера. Оценки пусты до вашего решения.</p><div class="notice">Проверяйте смысл, каждый эквивалент, базовый перевод и переводы определений/примеров. Больше вариантов не означает лучше. Базовый перевод без контекста может отличаться от выбранного значения.</div>
<nav><button id="prev">←</button><select id="case"></select><button id="next">→</button><span id="progress"></span></nav><div id="source"></div><div id="outputs" class="grid"></div>
<footer><input id="reviewer" placeholder="Кто оценивает"><select id="method"><option value="">Метод оценки</option><option value="human">Человек</option><option value="agent">Агент</option><option value="model">Модель</option></select> <button id="export">Скачать оценки JSON</button><p class="muted">Результаты хранятся локально в этом браузере. Экспорт сохраняет привязку к точным ответам. Исходные ответы и приложение не меняются.</p></footer></main>
<script>const cases=__DATA__;const storageKey='translation-review-'+cases.flatMap(c=>c.outputs.map(o=>o.responseHash)).join('').slice(0,32);let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch{};let selected=0;
const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const dimensions={senseFidelity:'Точность значения',equivalentUsefulness:'Полезность вариантов',naturalness:'Естественность',contentFidelity:'Определения и примеры',baseCorrectness:'Базовый перевод'};
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(saved))}catch{};$('#progress').textContent='Оценено '+Object.values(saved).filter(v=>v.decision&&Object.values(v.scores||{}).filter(x=>x!==null&&x!=='').length===5).length+' / '+cases.reduce((n,c)=>n+c.outputs.filter(o=>o.result).length,0)}
cases.forEach((c,i)=>{const o=document.createElement('option');o.value=i;o.textContent=(i+1)+'. '+c.headword.text+' → '+c.language+' ('+c.caseId+')';$('#case').append(o)});
function render(){const c=cases[selected];$('#case').value=selected;$('#source').innerHTML='<div class="source"><h2>'+esc(c.headword.text)+' → '+esc(c.language)+'</h2>'+c.source.map(x=>'<div class="row"><small>'+esc(x.role)+'</small><div>'+esc(x.text)+'</div></div>').join('')+'</div>';
$('#outputs').innerHTML=c.outputs.map(o=>{const e=o.result?.entryTranslation,v=saved[o.responseHash]||{scores:{}};if(!o.result)return '<section class="card"><h2>Ответ '+o.label+'</h2><p>Ответ не получен: '+esc(o.outcome)+'</p><p>Первая попытка сохранена. Повторные запросы оцениваются отдельно.</p></section>';return '<section class="card" data-hash="'+o.responseHash+'"><h2>Ответ '+o.label+'</h2><div class="primary">'+esc(e?e.primaryText:'Нет самостоятельного перевода')+'</div><div>'+esc(e?.alternativeTexts.join(' · ')||'Дополнительных вариантов нет')+'</div><div class="row"><small>Базовый перевод без контекста</small><div>'+esc(e?.baseText??'—')+'</div></div>'+(e?.note?'<p class="muted">'+esc(e.note)+'</p>':'')+o.result.contentTranslations.map(x=>'<div class="row"><small>'+esc(x.fieldId)+'</small><div>'+esc(x.text)+'</div></div>').join('')+'<hr><p>0 — непригодно; 3 — нужна правка; 4 — небольшая оговорка; 5 — корректно и полезно.</p><div class="scores">'+Object.entries(dimensions).map(([k,label])=>'<label>'+label+'</label><select data-score="'+k+'"><option value="">—</option>'+[0,1,2,3,4,5].map(n=>'<option '+(v.scores?.[k]===n?'selected':'')+'>'+n+'</option>').join('')+'</select>').join('')+'</div><p><select data-decision><option value="">Решение</option>'+[['accept','Принимаю'],['needs-work','Нужна правка'],['reject','Отклоняю']].map(([k,l])=>'<option value="'+k+'" '+(v.decision===k?'selected':'')+'>'+l+'</option>').join('')+'</select></p><textarea data-rationale placeholder="Что хорошо или что нужно исправить">'+esc(v.rationale||'')+'</textarea></section>'}).join('');
$('#outputs').querySelectorAll('.card').forEach(card=>card.addEventListener('change',()=>{const v={scores:{},decision:card.querySelector('[data-decision]').value,rationale:card.querySelector('textarea').value};card.querySelectorAll('[data-score]').forEach(s=>v.scores[s.dataset.score]=s.value===''?null:Number(s.value));saved[card.dataset.hash]=v;persist()}));persist()}
$('#prev').onclick=()=>{selected=Math.max(0,selected-1);render()};$('#next').onclick=()=>{selected=Math.min(cases.length-1,selected+1);render()};$('#case').onchange=e=>{selected=Number(e.target.value);render()};$('#export').onclick=()=>{const result={schemaVersion:'translation-eval-blind-review-v1',status:'draft',reviewer:$('#reviewer').value,method:$('#method').value,reviewedAt:new Date().toISOString(),items:cases.flatMap(c=>c.outputs.filter(o=>o.result).map(o=>({caseId:c.caseId,label:o.label,responseHash:o.responseHash,...(saved[o.responseHash]||{scores:{},decision:'pending',rationale:''})})))};const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='translation-review.json';a.click();URL.revokeObjectURL(url)};render();</script></html>'''
(a.output_dir/'index.html').write_text(template.replace('__DATA__',data))
print(a.output_dir/'index.html')
