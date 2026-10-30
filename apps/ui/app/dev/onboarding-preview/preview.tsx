"use client";

import React, { useState } from "react";
import { Joyride, type TooltipRenderProps } from "react-joyride";
import { X, RotateCcw } from "lucide-react";
import { AppFrame } from "@/components/navigation/AppFrame";
import { TrainingOverview } from "@/components/practice/TrainingOverview";
import { TrainingSenseCardStage } from "@/components/training/v2/TrainingSenseCardStage";
import { buildTrainingSenseCardModel } from "@/components/training/v2/trainingSenseCardModel";
import { gateFurnitureEntry, gateSingleSenseGroup } from "@/lib/platform/fixtures/senseCardV1GateFixture";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import styles from "./preview.module.css";

function TourMessage({ step, tooltipProps, controls }: TooltipRenderProps) {
  return <div {...tooltipProps} className={styles.tooltip}>
    <div className={styles.tooltipTop}><span>ЗНАКОМСТВО · {step.data === "start" ? "1" : "2"} ИЗ 2</span>
      <button onClick={() => controls.skip()} aria-label="Закрыть знакомство"><X size={18}/></button></div>
    <h2>{step.title}</h2><div className={styles.copy}>{step.content}</div>
    <p className={styles.instruction}>Нажмите подсвеченную кнопку.</p>
  </div>;
}

const training = {
  id: "preview-dilum", name: "Dilum NL", language: "Нидерландский",
  description: "Слова · Прямой · Новые + повторения · До 10 карточек",
  summary: "нидерландский · Слова · Прямой · Новые + повторения · До 10 карточек",
  completedToday: 0, meaningCount: 12, sessionSize: 10, cardFilter: "both" as const, canLaunch: true,
};
const initialModel = buildTrainingSenseCardModel({group: gateSingleSenseGroup, entry: gateFurnitureEntry, interfaceLanguage: "ru"});
// Public synthetic content only. The preview renders production components, but
// invokes no account repositories, training controller, or learning write API.
const model = {...initialModel, repeatCount: 0, reviewCapabilities: [],
  learnCapability: {actionId: "start-learning", elementId: "preview-learn", messageKey: "senseCard.learning.start",
    target: {kind: "sense-card", entryId: gateFurnitureEntry.entryId, cardTypeId:"word-to-definition", stateRevision:"preview-state"}} as NonNullable<typeof initialModel.learnCapability>};

export function OnboardingPreview() {
  const [screen, setScreen] = useState<"overview" | "card">("overview");
  const [revealed, setRevealed] = useState(false);
  const [running, setRunning] = useState(true);
  const [notice, setNotice] = useState("");
  const replay = () => {setRunning(false); setScreen("overview"); setRevealed(false); setNotice(""); requestAnimationFrame(() => setRunning(true));};
  const start = () => {setScreen("card"); setNotice("");};
  const step = screen === "overview" ? {
    target: '#preview-overview section[aria-label="Основная тренировка"] button:not([aria-label])',
    title: "Начнём с готовой тренировки", data: "start",
    content: <>В <strong>Dilum NL</strong> уже выбран материал словаря Dilum Nederlands. Настройки можно изменить позже. Нажмите «Начать тренировку».</>,
    placement: "bottom" as const,
  } : {
    target: '#preview-card button[aria-label="Показать ответ"]',
    title: "Вспомните значение", data: "reveal",
    content: <>Сначала подумайте, что значит слово. Затем откройте ответ — там будут значение и пример.</>,
    placement: "top-end" as const,
  };
  return <div className={`${theme.theme} ${styles.root}`} lang="ru">
    <div className={styles.previewBar}><span>Пример тура · 2 шага · демонстрационные данные</span>
      <button onClick={replay}><RotateCcw size={14}/>Показать сначала</button></div>
    <AppFrame activeDestination="training" interfaceLanguage="ru" themePreference="system" immersive={screen === "card"}
      onNavigate={() => {setNotice("В этом примере проверяем только первые два шага знакомства."); setRunning(false);}}
      onCycleTheme={() => {setNotice("Внешний вид настроек не входит в двухшаговый пример."); setRunning(false);}}
      onOpenSettings={replay}>
      {screen === "overview" ? <div id="preview-overview" className={styles.overview}>
        <TrainingOverview interfaceLanguage="ru" state={{status:"ready",trainings:[training],mainId:training.id,
          availability:{trainingId:training.id,status:"ready",dueToday:0,totalReviews:0,stillNew:12}}}
          onLaunch={start} onResume={start} onSelect={() => {}} onCreate={() => {setRunning(false);setNotice("Создание тренировки разберём в продолжении тура.");}}
          onEdit={() => {setRunning(false);setNotice("Редактор тренировки разберём в продолжении тура.");}} onRetry={replay}/>
      </div> : <div className={styles.session}>
        <div className={styles.sessionHeader}><span>Dilum NL</span><span>0 / 10</span><button aria-label="Закрыть сессию" onClick={() => {setRunning(false);setScreen("overview");}}><X size={18}/></button></div>
        <div id="preview-card" className={styles.card}>
          <TrainingSenseCardStage model={model} mode="word-to-definition" interfaceLanguage="ru" side={revealed ? "answer" : "face"}
            onSideChange={side => {setRunning(false);setRevealed(side === "answer");if(side === "answer")setNotice("Это конец двухшагового примера. Дальше тур объяснит отдельное значение и действие «Учить».");}}
            onAction={() => setNotice("Это демонстрация: учебный прогресс не записывается.")}/>
        </div>
      </div>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
    </AppFrame>
    <Joyride key={screen} run={running && !revealed} steps={[step]} tooltipComponent={TourMessage}
      onEvent={data => {if(data.status === "skipped" || data.status === "finished")setRunning(false);}}
      options={{skipBeacon:true,blockTargetInteraction:false,disableFocusTrap:true,overlayClickAction:false,
        dismissKeyAction:"close",closeButtonAction:"skip",overlayColor:"rgba(24, 19, 34, .52)",
        spotlightPadding:8,spotlightRadius:15,arrowColor:"#fff",arrowSize:8,arrowBase:16,
        width:340,zIndex:10000,scrollDuration:0,primaryColor:"#71608d"}}/>
  </div>;
}
