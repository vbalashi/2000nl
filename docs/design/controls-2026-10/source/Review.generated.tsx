import React,{useState,useEffect,useLayoutEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Play,Library,ChartNoAxesColumn} from 'lucide-react';
import {ApprovedTrainingBuilder} from './Builder.generated';
import {mixStepSelection} from '@/components/training/pilot/TrainingMixPicker';
import {getUiMessages} from '@/lib/uiMessages';
import type {TrainingMode,TrainingExerciseFamily,TrainingSessionSize} from '@/lib/types';
import type {TrainingSetupOption} from '@/lib/training/setups/availability';
import type {TrainingSetupDraft} from '@/lib/training/setups/types';
import s from '@/components/training/pilot/approvedTrainingBuilder.module.css';
import section from '@/components/practice/builder/builderSection.module.css';
import controls from '@/components/practice/builder/builderControls.module.css';
import theme from '@/components/practice/ui/practiceTheme.module.css';
const DEFAULT_SESSION_SIZE=10;
const defaultModesForScenario = (scenario: TrainingSetupOption) => {
  const modes = scenario.modes ?? [];
  if (scenario.value === "idiom" && modes.includes("word-to-definition")) {
    return ["word-to-definition"] satisfies TrainingMode[];
  }
  if (
    scenario.value === "understanding" &&
    modes.includes("word-to-definition")
  ) {
    return ["word-to-definition"] satisfies TrainingMode[];
  }
  return modes;
};


const scenarios:TrainingSetupOption[]=[{value:'understanding',label:'Understanding',modes:['word-to-definition','definition-to-word']},{value:'idiom',label:'Idioms',modes:['word-to-definition','definition-to-word']}];
const initialDraft:TrainingSetupDraft&{sessionSize:TrainingSessionSize}={family:'word-in-context',scenarioId:'understanding',modes:['definition-to-word'],cardFilter:'review',newReviewRatio:2,sessionSize:5,listValue:'all',materialMode:'selected-dictionaries',dictionaryIds:['vandale-2k'],partOfSpeech:[],nounArticles:[],dateWindow:'all',sourceValue:'all'};
function Review(){const [draft,setDraft]=useState(initialDraft),[name,setName]=useState('Translation'),[language,setLanguage]=useState('nl'),[dark,setDark]=useState(false),[interfaceLanguage,setInterfaceLanguage]=useState<'en'|'ru'|'nl'>('en'),[translation,setTranslation]=useState<string|null>('ru'),[layout,setLayout]=useState('frame'),[width,setWidth]=useState('desktop'),[message,setMessage]=useState('');const root=useRef<HTMLDivElement>(null);
const activeFamily=draft.family??'meaning',selectedScenario=scenarios.find(s=>s.value===draft.scenarioId),understandingScenario=scenarios[0],idiomScenario=scenarios[1];
  const selectFamily = (family: TrainingExerciseFamily) => {
  const scenario = family === "idiom" ? idiomScenario : family === "sentence" ? scenarios.find((option) => option.value === "sentences") : understandingScenario;
    if (!scenario) return;
    setDraft((current) => ({
      ...current,
      family,
      scenarioId: scenario.value,
      modes: family === "word-in-context" ? ["definition-to-word"] : defaultModesForScenario(scenario),
      ...(family !== "meaning" && current.sessionSize === "all-due-today"
        ? { sessionSize: DEFAULT_SESSION_SIZE }
        : {}),
    }));
  };
  const toggleMode = (mode: TrainingMode) => {
    if (!selectedScenario?.modes?.includes(mode)) return;
    setDraft((current) => {
      const active = current.modes.includes(mode);
      if (activeFamily === "word-in-context") return current;
      if (activeFamily !== "meaning" && activeFamily !== "idiom") {
        return {
          ...current,
          scenarioId: selectedScenario.value,
          modes: [mode],
        };
      }
      if (active && current.modes.length === 1) return current;
      return {
        ...current,
        scenarioId: selectedScenario.value,
        modes: active
          ? current.modes.filter((candidate) => candidate !== mode)
          : [...current.modes, mode],
      };
    });
  };
  const changeMix = (index: number) =>
    setDraft((current) => {
      const selection = mixStepSelection(index, current.newReviewRatio);
      return {
        ...current,
        ...selection,
        sessionSize:
          selection.cardFilter !== "review" && current.sessionSize === "all-due-today"
            ? DEFAULT_SESSION_SIZE
            : current.sessionSize,
      };
    });


useLayoutEffect(()=>{const node=root.current;if(!node)return;const single=[...node.querySelectorAll<HTMLElement>(`.${s.choices}`)].filter(g=>g.querySelectorAll('button').length>1&&!g.closest(`.${s.nounDialog}`)&&!g.querySelector(`.${s.nounChoice}`));const holders=[...single,...node.querySelectorAll<HTMLElement>(`.${s.options}`)];const cleanups:(()=>void)[]=[];holders.forEach(g=>{const buttons=[...g.querySelectorAll<HTMLButtonElement>('button')];if(buttons.length<2||g.querySelectorAll('[aria-pressed=true]').length>1)return;const marker=document.createElement('span');marker.className='review-selection';g.append(marker);g.classList.add('review-single');let previous=0;const update=(animate=false)=>{const selected=g.querySelector<HTMLButtonElement>('[aria-pressed=true]');marker.hidden=!selected;if(!selected)return;const a=selected.getBoundingClientRect(),p=g.getBoundingClientRect();if(!animate)marker.style.transition='none';marker.style.width=a.width+'px';marker.style.height=a.height+'px';marker.style.transform=`translate(${a.left-p.left}px,${a.top-p.top}px)`;if(!animate)requestAnimationFrame(()=>marker.style.removeProperty('transition'));};const mo=new MutationObserver(()=>update(true));mo.observe(g,{attributes:true,subtree:true,attributeFilter:['aria-pressed']});const ro=new ResizeObserver(()=>{const width=g.clientWidth;if(width!==previous){previous=width;update(false);}});ro.observe(g);update(false);cleanups.push(()=>{mo.disconnect();ro.disconnect();marker.remove();g.classList.remove('review-single');});});return()=>cleanups.forEach(f=>f());},[draft.materialMode,language,interfaceLanguage]);
useLayoutEffect(()=>{const node=root.current;if(!node)return;const measure=()=>{const save=node.querySelector<HTMLButtonElement>(`.${s.updateGroup}>button`),start=node.querySelector<HTMLButtonElement>(`.${s.footer}>div>.${s.primary}`);if(!save||!start)return;const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;ctx.font=getComputedStyle(save).font;const width=Math.ceil(Math.max(168,ctx.measureText(save.textContent??'').width+52,ctx.measureText(start.textContent??'').width+24));node.style.setProperty('--review-action-width',width+'px');};measure();document.fonts.ready.then(measure);},[interfaceLanguage]);
const b=getUiMessages(interfaceLanguage).builder;return <><style>{reviewCss}</style><div className="review-toolbar"><label>Группировка <select value={layout} onChange={e=>setLayout(e.target.value)}><option value="frame">Общая рамка</option><option value="gaps">Узкие промежутки</option></select></label><label>Размер <select value={width} onChange={e=>setWidth(e.target.value)}><option value="desktop">Десктоп</option><option value="mobile">Мобильный</option></select></label><label>Тема <select value={dark?'dark':'light'} onChange={e=>setDark(e.target.value==='dark')}><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label><label>Интерфейс <select value={interfaceLanguage} onChange={e=>setInterfaceLanguage(e.target.value as any)}><option value="en">English</option><option value="ru">Русский</option><option value="nl">Nederlands</option></select></label><label>Перевод <select value={translation??'off'} onChange={e=>setTranslation(e.target.value==='off'?null:e.target.value)}><option value="ru">Russian</option><option value="en">English</option><option value="off">Off</option></select></label></div><div ref={root} className={`review-surface ${theme.theme} ${dark?'dark':''}`} data-colour-mode={dark?'dark':'light'} data-layout={layout} data-preview-width={width} data-account-palette="indigo" data-practice-palette="indigo"><nav className="review-nav" aria-label="Main navigation"><button type="button" aria-current="page"><Play size={15}/>Training</button><button type="button"><Library size={15}/>Library</button><button type="button"><ChartNoAxesColumn size={15}/>Statistics</button></nav><ApprovedTrainingBuilder interfaceLanguage={interfaceLanguage} draft={draft} languageCode={language} languageOptions={[{value:'nl',label:'Dutch'},{value:'en',label:'English'}]} lists={[{value:'all',label:'VanDale 2k'}]} dictionaries={[{value:'vandale-2k',label:'VanDale 2k'}]} sources={[]} scenarios={scenarios} languagePending={false} dictionariesLoading={false} translationLanguage={translation} name={name} onNameChange={setName} onLanguageChange={value=>{setLanguage(value);setDraft(initialDraft)}} onDraftChange={setDraft} onSelectFamily={selectFamily} onToggleMode={toggleMode} onMixChange={changeMix} onBack={()=>setMessage('Preview: Back to Training')} onSave={async()=>{setMessage('Preview: saved changes');return true}} onSaveAs={async newName=>{setMessage('Preview: saved as '+newName);return true}} onDelete={async()=>{setMessage('Preview: deleted saved training');return true}} deletionChangesMain={false} onBeginSave={()=>setMessage('')} onStart={()=>setMessage('Preview: start with the current draft')} saveDisabled={(draft.family==='word-in-context'&&translation===null)||(draft.materialMode==='selected-dictionaries'&&!draft.dictionaryIds?.length)} startDisabled={(draft.family==='word-in-context'&&translation===null)||(draft.materialMode==='selected-dictionaries'&&!draft.dictionaryIds?.length)} saveLabel={interfaceLanguage==='ru'?'Сохранить изменения':interfaceLanguage==='nl'?'Wijzigingen opslaan':'Save changes'} startLabel={b.start} canSave editing saveAsLabel={interfaceLanguage==='ru'?'Сохранить как…':interfaceLanguage==='nl'?'Opslaan als…':'Save as…'}/><output className="review-feedback" aria-live="polite">{message}</output></div></>}
const reviewCss=`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap');
#nl-builder-real-review{font-family:Inter,system-ui,sans-serif}.review-toolbar{display:flex;flex-wrap:wrap;gap:12px;padding:0 90px 16px 0;color:var(--foreground)}.review-toolbar label{display:flex;gap:6px;align-items:center;font-size:13px}.review-toolbar select{font:inherit;color:inherit;background:var(--background);border:1px solid var(--border);border-radius:8px;padding:4px}
#nl-builder-real-review .review-surface{--font-sense-sans:Inter;--font-sense-serif:Newsreader;padding:24px 48px 30px;background:var(--practice-canvas)}
.review-nav{display:flex;gap:3px;padding:3px;height:34px;box-sizing:border-box;width:fit-content;margin:0 auto 36px;border-radius:13.6px;background:var(--practice-surface-subtle)}.review-nav button{display:flex;align-items:center;gap:5px;padding:0 10px;border:0;border-radius:10px;background:transparent;font:inherit;font-size:13px;color:var(--practice-text-muted)}.review-nav button[aria-current=page]{background:var(--practice-surface);color:var(--practice-text)}
#nl-builder-real-review .${s.viewport}{padding:0;overflow:visible}#nl-builder-real-review .${s.main},#nl-builder-real-review .${s.footer}>div{max-width:720px}
#nl-builder-real-review .${s.header}{position:relative;margin-bottom:20px;gap:0}#nl-builder-real-review .${s.header} h1{font-size:20px;line-height:28px}#nl-builder-real-review .${s.header}>button{position:absolute;right:calc(100% + 12px)}
.review-name{display:flex;align-items:center;gap:10px;min-height:44px;margin-bottom:24px}.review-name h2{font-family:var(--practice-font-reading);font-size:var(--review-name-size,36px);line-height:1.1;font-weight:500;letter-spacing:-1px;margin:0;overflow-wrap:anywhere}.review-name button{border:0;background:transparent;color:var(--practice-text-muted);width:28px;height:28px}.review-name input{font-family:var(--practice-font-reading);font-size:var(--review-name-size,36px);line-height:1.1;font-weight:500;letter-spacing:-1px;max-width:100%;width:100%;box-sizing:border-box;border:0;border-bottom:1px solid var(--practice-border);background:transparent;color:var(--practice-text)}
#nl-builder-real-review .${s.option}{height:28px;box-sizing:border-box;min-height:28px;padding:0 10px;border:0;border-radius:11.2px;display:inline-flex;width:fit-content;font-size:13px;line-height:18px;justify-content:center}#nl-builder-real-review .${s.option} span:last-child{display:none}#nl-builder-real-review .${s.options}{display:flex;flex-direction:row;flex-wrap:wrap;gap:7px;position:relative}
#nl-builder-real-review .${controls.choice}{box-sizing:border-box;height:28px;min-height:28px;padding:0 10px;font-size:13px;line-height:18px;border:0;border-radius:11.2px;background:transparent}#nl-builder-real-review .${controls.choice}[aria-pressed=true],#nl-builder-real-review .${s.option}[aria-pressed=true]{background:var(--practice-surface-hover);color:var(--practice-text)}#nl-builder-real-review .${controls.choice}:hover{background:transparent}#nl-builder-real-review .${controls.choice}[aria-pressed=true]:hover{background:var(--practice-surface-hover)}
#nl-builder-real-review .review-single{position:relative;isolation:isolate}#nl-builder-real-review .review-single>button[aria-pressed=true]{background:transparent}#nl-builder-real-review .review-selection{position:absolute;left:0;top:0;border-radius:11.2px;background:var(--practice-surface-hover);z-index:-1;pointer-events:none;transition:transform 230ms cubic-bezier(.22,1,.36,1),width 230ms cubic-bezier(.22,1,.36,1),height 230ms cubic-bezier(.22,1,.36,1)}
#nl-builder-real-review .${s.nounChoice}{border:0;background:transparent;overflow:visible}#nl-builder-real-review .${s.nounChoice}>button:first-child{border-radius:11.2px}#nl-builder-real-review .${s.nounChoice}>button:last-child{height:28px;padding:0 6px}
/* Owner review: transparent section frames and settings typography. */
#nl-builder-real-review .${section.section}{background:transparent;border:1px solid color-mix(in srgb,var(--practice-text) 18%,transparent);padding:0;box-sizing:border-box}
#nl-builder-real-review .${section.reveal}>div{background:transparent}
#nl-builder-real-review .${controls.choice},#nl-builder-real-review .${s.option}{font-family:var(--practice-font-ui);font-size:var(--practice-text-label);font-weight:400;color:var(--practice-text-secondary)}
#nl-builder-real-review .${controls.choice}[aria-pressed=true],#nl-builder-real-review .${s.option}[aria-pressed=true]{color:var(--practice-text-secondary)}
#nl-builder-real-review .${controls.label},#nl-builder-real-review .${s.field} h2{font-family:var(--practice-font-ui);font-size:var(--practice-text-caption);font-weight:400;line-height:1.5;color:var(--practice-text-muted)}
#nl-builder-real-review .${controls.help}{font-family:var(--practice-font-ui);font-size:var(--practice-text-label);font-weight:400;line-height:1.5;color:color-mix(in srgb,var(--practice-text) 58%,var(--practice-canvas))}
#nl-builder-real-review .${s.choices}:has(>.${s.nounChoice}){padding-left:8px}
#nl-builder-real-review .${s.nounChoice}{border-radius:11.2px;overflow:hidden;gap:0}
#nl-builder-real-review .${s.nounChoice}:has(>button[aria-pressed=true]){background:var(--practice-surface-hover)}
#nl-builder-real-review .${s.nounChoice}>button:first-child,#nl-builder-real-review .${s.nounChoice}>button:first-child:hover{border-radius:0;background:transparent;padding-right:4px}
#nl-builder-real-review .${s.nounChoice}>button:last-child{background:transparent;padding-left:3px;padding-right:7px}
#nl-builder-real-review .${s.footer}{padding:20px 0 0}#nl-builder-real-review .${s.footer}>div{align-items:center;gap:12px}#nl-builder-real-review .${s.saveActions}{display:contents}#nl-builder-real-review .${s.delete}{display:flex;align-items:center;gap:7px;width:auto;height:34px;margin-right:auto;padding:0;background:transparent;color:var(--practice-danger);font:inherit;font-size:14px}
#nl-builder-real-review .${s.updateGroup}{flex:none;width:var(--review-action-width,168px);height:44px;border-radius:13.2px;background:var(--practice-surface-hover)}#nl-builder-real-review .${s.updateGroup}>.${s.secondary}{min-width:0;height:44px;min-height:44px;padding:0 10px;border:0;background:transparent;border-radius:13.2px 0 0 13.2px;white-space:nowrap}#nl-builder-real-review .${s.saveMenu} summary{height:44px;min-height:44px;width:32px;padding:0;border:0;border-radius:0 13.2px 13.2px 0;background:transparent}#nl-builder-real-review .${s.footer}>div>.${s.primary}{box-sizing:border-box;height:44px;width:var(--review-action-width,168px);padding:0 12px;border:0;border-radius:13.2px;background:var(--practice-accent);color:var(--practice-on-accent)}
#nl-builder-real-review .${s.saveMenuPanel}{border-color:color-mix(in srgb,var(--practice-text) 12%,var(--practice-surface))}#nl-builder-real-review .${s.saveMenu}{background:transparent}#nl-builder-real-review .${s.saveMenu} summary svg{width:16px;height:16px}
.review-feedback{display:block;max-width:720px;margin:14px auto 0;min-height:20px;font-size:13px;color:var(--practice-text-muted)}
@media(max-width:650px){#nl-builder-real-review .review-surface{padding:20px 20px 24px}#nl-builder-real-review .${s.header}>button{position:static;margin-right:8px}#nl-builder-real-review .${s.footer}>div:has(.${s.saveMenu}){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 10px}#nl-builder-real-review .${s.delete}{grid-column:1/-1;justify-self:start}#nl-builder-real-review .${s.updateGroup},#nl-builder-real-review .${s.footer}>div>.${s.primary}{width:100%;min-width:0}#nl-builder-real-review .${s.updateGroup}>.${s.secondary}{font-size:12px;padding:0 5px}#nl-builder-real-review .${s.saveMenu} summary{width:28px}.review-nav button{font-size:12px;padding:0 7px}}
@media(max-width:430px){#nl-builder-real-review .${s.footer}>div:has(.${s.saveMenu}){grid-template-columns:1fr}#nl-builder-real-review .${s.delete}{grid-column:1}#nl-builder-real-review .${s.updateGroup}>.${s.secondary}{font-size:13px;padding:0 12px}}
#nl-builder-real-review .review-section-group{border:1px solid color-mix(in srgb,var(--practice-text) 18%,transparent);border-radius:12px;overflow:hidden}
#nl-builder-real-review .review-section-group>.${section.section}{border:0;border-radius:0;margin:0;position:relative}
#nl-builder-real-review .review-section-group>section+section:before{content:"";position:absolute;left:16px;right:16px;top:0;border-top:1px solid color-mix(in srgb,var(--practice-text) 12%,transparent)}
#nl-builder-real-review .${section.body}{padding-top:8px;padding-bottom:18px}
#nl-builder-real-review .${section.chevron},#nl-builder-real-review .${section.rotated}{color:color-mix(in srgb,var(--practice-text) 18%,transparent)}
.review-inline-language{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:12px 18px;position:relative;min-height:28px}.review-inline-language h2{width:140px;margin:0;font:500 14px var(--practice-font-ui)}
#nl-builder-real-review [data-layout=gaps] .review-section-group{border:0;background:var(--practice-surface-subtle)}
#nl-builder-real-review [data-layout=gaps] .review-section-group>section+section{border-top:4px solid var(--practice-canvas)}
#nl-builder-real-review [data-layout=gaps] .review-section-group>section:before{display:none}
#nl-builder-real-review [data-preview-width=mobile]{max-width:390px;margin:auto;padding:20px;box-sizing:border-box}
#nl-builder-real-review [data-preview-width=mobile] .${s.sessionFields}{grid-template-columns:1fr}
#nl-builder-real-review [data-preview-width=mobile] .${section.heading}{grid-template-columns:90px minmax(0,1fr) 17px;gap:12px;padding:12px}
#nl-builder-real-review [data-preview-width=mobile] .review-inline-language h2{width:90px}
#nl-builder-real-review [data-preview-width=mobile] .${s.header}>button{position:static;margin-right:8px}
#nl-builder-real-review [data-preview-width=mobile] .${s.footer}>div{display:flex;flex-wrap:wrap}#nl-builder-real-review [data-preview-width=mobile] .${s.delete}{width:100%}#nl-builder-real-review [data-preview-width=mobile] .${s.updateGroup},#nl-builder-real-review [data-preview-width=mobile] .${s.footer}>div>.${s.primary}{width:100%}
.review-session-note{grid-column:1/-1;display:flex;align-items:flex-start;gap:7px;margin:0;font:400 11px/1.5 var(--practice-font-ui);color:color-mix(in srgb,var(--practice-text) 58%,var(--practice-canvas))}.review-session-note svg{flex:none;margin-top:2px}
#nl-builder-real-review .${controls.help}:empty{display:none}
.review-source-toolbar{display:flex;gap:8px;flex-wrap:wrap}.review-source-toolbar button{border:0;background:transparent;color:var(--practice-text-muted)}.review-source-toolbar input,.review-source-toolbar select{font:400 12px var(--practice-font-ui);background:var(--practice-surface);color:var(--practice-text);border:1px solid var(--practice-border);border-radius:8px;padding:6px;min-width:0;max-width:100%}
.review-source-list{max-height:260px;overflow-y:auto}.review-source-list button{display:flex;align-items:center;gap:9px;width:100%;border:0;border-radius:8px;background:transparent;color:var(--practice-text-secondary);font:400 12px var(--practice-font-ui);text-align:left;padding:9px}.review-source-list button[aria-pressed=true]{background:var(--practice-surface-hover)}.review-source-list small{margin-left:auto;color:var(--practice-text-muted);font-size:11px}.review-source-list svg{flex:none}
@media(max-width:700px){.review-inline-language{padding:12px;gap:12px}.review-inline-language h2{width:90px}}
/* Compact footer: icon and Save share a row; Start remains full width. */
#nl-builder-real-review [data-preview-width=mobile] .${s.footer}>div:has(.${s.saveMenu}){display:grid;grid-template-columns:34px minmax(0,1fr);gap:12px}
#nl-builder-real-review [data-preview-width=mobile] .${s.delete}{grid-column:1;grid-row:1;width:34px;height:44px;margin:0;justify-content:center}
#nl-builder-real-review [data-preview-width=mobile] .${s.delete}>span{display:none}
#nl-builder-real-review [data-preview-width=mobile] .${s.updateGroup}{grid-column:2;grid-row:1;width:100%}
#nl-builder-real-review [data-preview-width=mobile] .${s.footer}>div>.${s.primary}{grid-column:1/-1;grid-row:2;width:100%}
@media(max-width:650px){
#nl-builder-real-review .${s.footer}>div:has(.${s.saveMenu}){display:grid;grid-template-columns:34px minmax(0,1fr);gap:12px}
#nl-builder-real-review .${s.delete}{grid-column:1;grid-row:1;width:34px;height:44px;margin:0;justify-content:center}
#nl-builder-real-review .${s.delete}>span{display:none}
#nl-builder-real-review .${s.updateGroup}{grid-column:2;grid-row:1;width:100%}
#nl-builder-real-review .${s.footer}>div>.${s.primary}{grid-column:1/-1;grid-row:2;width:100%}
}
#nl-builder-real-review [data-preview-width=mobile]{--review-name-size:29px}
@media(max-width:650px){#nl-builder-real-review .review-surface{--review-name-size:29px}}
@media(max-height:650px){#nl-builder-real-review .review-surface{--review-name-size:26px}}
/* Hover never changes section geometry or adds a per-section frame. */
#nl-builder-real-review .review-section-group>.${section.section}:has(>.${section.heading}:hover){border:0;border-radius:0;background:transparent}
#nl-builder-real-review [data-layout=gaps] .review-section-group>section+section:has(>.${section.heading}:hover){border-top:4px solid var(--practice-canvas)}
#nl-builder-real-review .${section.heading}:hover,#nl-builder-real-review .${section.heading}:active{background:transparent;border:0;box-shadow:none;transform:none;outline:none}
#nl-builder-real-review .${section.heading}{transition:none}
@media(prefers-reduced-motion:reduce){.review-selection{transition:none!important}}
`;
createRoot(document.getElementById('nl-builder-real-review')!).render(<Review/>);
