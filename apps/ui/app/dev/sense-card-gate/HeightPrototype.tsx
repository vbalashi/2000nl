"use client";

// #249 throwaway sizing comparison, not a production layout or a new card renderer.
// Only full/near-full height differs; the owner explicitly asked for these two options.
import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Flag, History, Moon, Settings, Sun, X } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { TrainingSenseCardStage } from "@/components/training/v2/TrainingSenseCardStage";
import { buildTrainingSenseCardModel } from "@/components/training/v2/trainingSenseCardModel";
import { gateFurnitureEntry, gateSingleSenseGroup } from "@/lib/platform/fixtures/senseCardV1GateFixture";
import styles from "./HeightPrototype.module.css";

const devices = {
  phone: { label: "Телефон", width: 390, height: 844 },
  tablet: { label: "Планшет", width: 834, height: 1112 },
  desktop: { label: "Десктоп", width: 1440, height: 960 },
};
const baseModel = buildTrainingSenseCardModel({ group: gateSingleSenseGroup, entry: gateFurnitureEntry, interfaceLanguage: "nl" });
const extraExamples = [
  "Ze schoof de bank wat dichter naar het raam.",
  "Na de wandeling vielen de kinderen op de bank in slaap.",
  "Er is nog genoeg plaats op de bank voor twee personen.",
  "De nieuwe bank past precies tussen de kast en de deur.",
  "Hij legde een zacht kussen op de bank en ging zitten.",
  "We zaten de hele avond op de bank te praten.",
  "Naast de bank staat een kleine tafel met een leeslamp.",
  "Ze maakte het zich gemakkelijk op de bank met een boek.",
];

export function HeightPrototype() {
  const params = useSearchParams();
  const router = useRouter();
  const variant = params.get("variant") === "inset" ? "inset" : "full";
  const dark = params.get("theme") !== "light";
  const canvas = params.get("canvas") === "1";
  const content = params.get("content") === "long" ? "long" : "short";
  const face = params.get("side") === "face";
  const deviceKey = params.get("device") === "tablet" ? "tablet" : params.get("device") === "desktop" ? "desktop" : "phone";
  const device = devices[deviceKey];
  const [side, setSide] = useState<"face" | "answer">(face ? "face" : "answer");
  const [notice, setNotice] = useState("");
  const [scale, setScale] = useState(1);
  const previewRef = useRef<HTMLDivElement>(null);
  const [measurements, setMeasurements] = useState<Record<string, number>>({});

  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(values)) next.set(key, value);
    router.replace(`/dev/sense-card-gate?${next}`, { scroll: false });
  }

  useEffect(() => {
    if (canvas) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const next = new URLSearchParams(params.toString());
      next.set("variant", variant === "full" ? "inset" : "full");
      router.replace(`/dev/sense-card-gate?${next}`, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canvas, params, router, variant]);

  useEffect(() => { setSide(face ? "face" : "answer"); }, [face]);
  useEffect(() => {
    const previousDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    return () => { document.documentElement.classList.toggle("dark", previousDark); };
  }, [dark]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const node = previewRef.current;
    if (!node || canvas) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, node.clientWidth / device.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [canvas, device.width]);
  useEffect(() => {
    if (canvas) return;
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== previewRef.current?.querySelector("iframe")?.contentWindow) return;
      if (event.data?.kind === "height-prototype-measurements") setMeasurements(event.data.values);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [canvas]);
  useEffect(() => {
    if (!canvas) return;
    const root = document.querySelector(`.${styles.viewport}`);
    if (!root) return;
    const observer = new ResizeObserver(() => {
      const box = (selector: string) => root.querySelector(selector)?.getBoundingClientRect();
      const card = box('[data-testid="training-sense-card-shell"]');
      const workspace = box(`.${styles.workspace}`);
      const stack = box(`.${styles.stack}`);
      window.parent.postMessage({ kind: "height-prototype-measurements", values: {
        cardWidth: Math.round(card?.width ?? 0), cardHeight: Math.round(card?.height ?? 0),
        stackHeight: Math.round(stack?.height ?? 0),
        outerTop: Math.round((stack?.top ?? 0) - (workspace?.top ?? 0)),
        outerBottom: Math.round((workspace?.bottom ?? 0) - (stack?.bottom ?? 0)),
      } }, window.location.origin);
    });
    observer.observe(root);
    const card = root.querySelector('[data-testid="training-sense-card-shell"]');
    if (card) observer.observe(card);
    return () => observer.disconnect();
  }, [canvas, variant, side, content]);

  const model = content === "short" ? baseModel : {
    ...baseModel,
    examples: [...baseModel.examples, ...Array.from({ length: 24 }, (_, index) => ({
      ...baseModel.examples.find((item) => item.kind === "example")!,
      contentNodeId: `height-prototype-example-${index}`, text: extraExamples[index % extraExamples.length], translation: undefined,
    }))],
  };
  const stub = () => setNotice("Только просмотр: данные и прогресс не изменяются.");

  if (canvas) return (
    <main className={styles.viewport} data-height-variant={variant} data-prototype="height">
      <header className={styles.appHeader}>
        <BrandLogo className="text-[26px] font-normal leading-none tracking-tight text-slate-800 dark:text-[#F3F5F9]" accentClassName="text-indigo-600 dark:text-[#AAB0FF]" />
        <div className={styles.utilities}>
          <button aria-label="Тема" onClick={() => change({ theme: dark ? "light" : "dark" })}>{dark ? <Moon /> : <Sun />}</button>
          <button aria-label="Настройки — прототип" onClick={stub}><Settings /></button>
        </div>
      </header>
      <div className={styles.workspace}>
        <div className={styles.stack}>
          <section className={styles.session} aria-label="Тренировочная сессия — пример данных">
            <span className={styles.sessionName}>Nieuw + herhaling</span><span className={styles.position}>2 / 10</span>
            <div className={styles.utilities}>
              <button aria-label="История — прототип" onClick={stub}><History /></button>
              <button aria-label="Закрыть — прототип" onClick={stub}><X /></button>
            </div>
            <div className={styles.sessionProgress}><span /></div>
          </section>
          <TrainingSenseCardStage model={model} mode="word-to-definition" interfaceLanguage="nl" side={side} onSideChange={setSide}
            onPlayAudio={stub} onOpenDetails={stub} onAction={stub}
            reportAction={<button className={styles.report} onClick={stub}><Flag aria-hidden="true" />Melden</button>} />
        </div>
      </div>
      <footer className={styles.stats} aria-label="Статистика — пример данных">
        {[{ label: "Nieuw", value: "2/5", color: "#60a5fa", fraction: "40%" }, { label: "Herhaling", value: "0/5", color: "#fbbf24", fraction: "0%" }, { label: "Totaal", value: "18/100", color: "#34d399", fraction: "18%" }].map((stat) => (
          <div key={stat.label}><span>{stat.label}</span><i><b style={{ width: stat.fraction, background: stat.color }} /></i><span>{stat.value}</span></div>
        ))}
      </footer>
      {notice ? <div className={styles.notice} role="status">{notice}<button onClick={() => setNotice("")} aria-label="Закрыть уведомление"><X size={16} /></button></div> : null}
    </main>
  );

  const frameParams = new URLSearchParams(params.toString());
  frameParams.set("canvas", "1");
  return (
    <main className={styles.gallery}>
      <header className={styles.galleryHeader}>
        <p>2000NL · исследование высоты · НЕ РЕЛИЗ</p>
        <h1>Карточка в целом экране</h1>
        <p>Меняем только внешние поля по высоте. Карточка — настоящий компонент из PR #258. Цифры сессии и окружающие панели — демонстрационные.</p>
      </header>
      <div className={styles.controls}>
        <label>Экран<select value={deviceKey} onChange={(e) => change({ device: e.target.value })}>{Object.entries(devices).map(([key, item]) => <option value={key} key={key}>{item.label} · {item.width}×{item.height}</option>)}</select></label>
        <label>Карточка<select value={face ? "face" : "answer"} onChange={(e) => change({ side: e.target.value })}><option value="answer">Answer</option><option value="face">Face</option></select></label>
        <label>Текст<select value={content} onChange={(e) => change({ content: e.target.value })}><option value="short">Обычный</option><option value="long">Длинный · стресс-тест</option></select></label>
        <label>Тема<select value={dark ? "dark" : "light"} onChange={(e) => change({ theme: e.target.value })}><option value="dark">Тёмная</option><option value="light">Светлая</option></select></label>
      </div>
      <div className={styles.previewWrap} ref={previewRef}>
        <div style={{ height: device.height * scale }}>
          <iframe title="Полный экран 2000NL" src={`/dev/sense-card-gate?${frameParams}`} style={{ width: device.width, height: device.height, transform: `scale(${scale})` }} />
        </div>
      </div>
      <section className={styles.measurements}>
        <h2>{variant === "full" ? "A · Всё доступное пространство" : "B · Небольшие поля"}</h2>
        <p>{deviceKey === "phone" ? "На телефоне A и B совпадают: карточка занимает всю доступную высоту." : "Ширина одна и та же. В B весь блок сессия → карточка → кнопки получает чуть больше воздуха сверху и снизу."}</p>
        <table><tbody>
          <tr><th>Полный экран</th><td>{device.width} × {device.height} px</td></tr>
          <tr><th>Область карточки</th><td>{measurements.cardWidth ?? "…"} × {measurements.cardHeight ?? "…"} px</td></tr>
          <tr><th>Сессия + карточка + кнопки</th><td>{measurements.stackHeight ?? "…"} px по высоте</td></tr>
          <tr><th>Внешние поля сверху / снизу</th><td>{measurements.outerTop ?? "…"} / {measurements.outerBottom ?? "…"} px</td></tr>
        </tbody></table>
        <p>Внешние панели, ширина, поля и порог 768 px — кандидаты для сравнения, не утверждённые токены. Кнопки обучения ничего не сохраняют. Перевод, Face/Answer и прокрутка работают локально.</p>
      </section>
      <nav className={styles.switcher} aria-label="Варианты высоты">
        <button aria-label="Предыдущий вариант" onClick={() => change({ variant: variant === "full" ? "inset" : "full" })}><ArrowLeft size={18} /></button>
        <button onClick={() => change({ variant: "full" })} aria-pressed={variant === "full"}>A · Вся высота</button>
        <button onClick={() => change({ variant: "inset" })} aria-pressed={variant === "inset"}>B · С полями</button>
        <button aria-label="Следующий вариант" onClick={() => change({ variant: variant === "full" ? "inset" : "full" })}><ArrowRight size={18} /></button>
      </nav>
    </main>
  );
}
