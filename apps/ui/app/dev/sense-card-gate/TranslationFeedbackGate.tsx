"use client";
import React from "react";
import { LibrarySenseCardGroup } from "@/components/training/library-v2/LibrarySenseCardGroup";
import { buildLibrarySenseCardGroupModel, librarySenseCardIdentity } from "@/components/training/library-v2/librarySenseCardModel";
import { gateSingleSenseGroup } from "@/lib/platform/fixtures/senseCardV1GateFixture";
import type { TranslationPreparationState } from "@/components/practice/article/TranslationFeedback";
import theme from "@/components/practice/ui/practiceTheme.module.css";

/** Visual-only gate: real production renderer; controlled job status, no provider calls.
 * The server publishes the whole aggregate, so retry resolves all missing fields. */
export function TranslationFeedbackGate() {
  const [status,setStatus]=React.useState<TranslationPreparationState>("pending");
  const [dark,setDark]=React.useState(true);
  React.useEffect(()=>{
    const previouslyDark=document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark",dark);
    return ()=>{ document.documentElement.classList.toggle("dark",previouslyDark); };
  },[dark]);
  const [empty,setEmpty]=React.useState(false);
  const timer=React.useRef<ReturnType<typeof setTimeout>>();
  React.useEffect(()=>()=>clearTimeout(timer.current),[]);
  const model=React.useMemo(()=>{
    const value=buildLibrarySenseCardGroupModel(gateSingleSenseGroup,"ru");
    const meaning=value.meanings[0];
    if(status!==null){
      if(empty){meaning.entryTranslation=null;meaning.entryTranslationAlternatives=[];}
      if(meaning.definition)meaning.definition={...meaning.definition,translation:undefined};
      const missing=(node: typeof meaning.details[number]): typeof node=>({...node,translation:undefined,children:node.children.map(missing)});
      meaning.details=meaning.details.map(missing);
    }
    meaning.translationNeedsPreparation=status!==null;
    return value;
  },[empty,status]);
  const meaning=model.meanings[0];
  const states=status?{[librarySenseCardIdentity(meaning.entryId,meaning.cardTypeId)]:status}:{};
  return <main data-account-palette="indigo" data-colour-mode="app" className={`${dark?"dark":""} ${theme.theme}`}>
    <div data-colour-mode="app" className={theme.theme} style={{padding:16,background:"var(--practice-canvas)",color:"var(--practice-text)",minHeight:"100dvh"}}>
      <nav className="mx-auto mb-4 flex max-w-[640px] flex-wrap items-center gap-4 text-sm">
        <label>Состояние <select aria-label="Состояние" value={status??"ready"} onChange={event=>{clearTimeout(timer.current);setStatus(event.target.value==="ready"?null:event.target.value as TranslationPreparationState);}} className="rounded border bg-transparent p-2"><option value="pending">Долгое ожидание</option><option value="failed">Подтверждённая ошибка</option><option value="ready">Готово</option></select></label>
        <label><input type="checkbox" checked={dark} onChange={event=>setDark(event.target.checked)}/> Тёмная тема</label>
        <label><input type="checkbox" checked={empty} onChange={event=>setEmpty(event.target.checked)}/> Нет готовых переводов</label>
      </nav>
      <p className="mx-auto mb-4 max-w-[640px] text-sm">Тестовые данные, настоящий компонент. Повтор завершает задание целиком через 3 секунды.</p>
      <div style={{height:720,maxWidth:640,margin:"auto"}}><LibrarySenseCardGroup model={model} interfaceLanguage="ru" contentLanguage="nl" translationLanguage="ru" translationEnabled translationStates={states} onAction={()=>{}} onRequestTranslation={()=>{if(status!=="failed")return;setStatus("pending");timer.current=setTimeout(()=>setStatus(null),3000);}}/></div>
    </div>
  </main>;
}
