"use client";

import React from "react";

import styles from "./training-card.module.css";

type Variant = "A" | "B" | "C";
type Density = "sparse" | "dense";
type IconName = "translate" | "audio" | "more";

const variants: Array<{ key: Variant; label: string }> = [
  { key: "A", label: "Desktop centered stack" },
  { key: "B", label: "Mobile fill stage" },
  { key: "C", label: "Overflow stress lab" },
];

const expressions = [
  ["iets loopt uit de hand", "iets kan niet meer gecontroleerd worden"],
  ["iets achter de hand houden", "iets bewaren omdat je het misschien nog nodig hebt"],
  ["met de hand", "zonder machine of hulpmiddel"],
  ["de handen uit de mouwen steken", "hard aan het werk gaan"],
  ["iemand de hand boven het hoofd houden", "iemand blijven beschermen"],
] as const;

function ActionIcon({ name }: { name: IconName }) {
  if (name === "translate") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 5h8M8 3v2M5 9c2-1.4 3.7-3.4 4.5-5M5 7c1.2 1.7 2.8 3 5 4M13 20l4-11 4 11M14.5 16h5" />
      </svg>
    );
  }
  if (name === "audio") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M11 5 6.5 9H3v6h3.5l4.5 4V5Z" />
        <path d="M15 9.5a4 4 0 0 1 0 5M17.8 7a7 7 0 0 1 0 10" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />
    </svg>
  );
}

function readParam<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const value = new URLSearchParams(window.location.search).get(key) as T | null;
  return value && allowed.includes(value) ? value : fallback;
}

function updateUrl(values: Record<string, string>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  window.history.replaceState({}, "", url);
}

function TranslationRow({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div className={`${styles.translationReveal} ${visible ? styles.translationVisible : ""}`} aria-hidden={!visible}>
      <div>{children}</div>
    </div>
  );
}

function ProgressStat({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  return (
    <div className={styles.progressStat}>
      <span className={styles.progressLabel} style={{ color: tone }}>{label}</span>
      <div className={styles.progressLine}>
        <span style={{ width: `${Math.min(100, (value / total) * 100)}%`, background: tone }} />
      </div>
      <span className={styles.progressValue}>{value} / {total}</span>
    </div>
  );
}

export function TrainingCardTracer() {
  const [variant, setVariant] = React.useState<Variant>("A");
  const [density, setDensity] = React.useState<Density>("dense");
  const [translation, setTranslation] = React.useState(true);
  const [revealed, setRevealed] = React.useState(true);
  const [hint, setHint] = React.useState(false);
  const [known, setKnown] = React.useState(false);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [lastAction, setLastAction] = React.useState("Ready");
  const [scrollState, setScrollState] = React.useState({ canScroll: false, atTop: true, atBottom: true });
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setVariant(readParam("variant", ["A", "B", "C"] as const, "A"));
    setDensity(readParam("density", ["sparse", "dense"] as const, "dense"));
    setTranslation(readParam("translation", ["on", "off"] as const, "on") === "on");
    setRevealed(readParam("side", ["face", "answer"] as const, "answer") === "answer");
  }, []);

  const syncScroll = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const max = Math.max(0, node.scrollHeight - node.clientHeight);
    setScrollState({
      canScroll: max > 1,
      atTop: node.scrollTop <= 1,
      atBottom: node.scrollTop >= max - 1,
    });
  }, []);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(syncScroll);
    const observer = new ResizeObserver(syncScroll);
    if (scrollRef.current) observer.observe(scrollRef.current);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [density, revealed, syncScroll, translation, variant]);

  const selectVariant = React.useCallback((next: Variant) => {
    setVariant(next);
    updateUrl({ variant: next });
  }, []);

  const cycleVariant = React.useCallback((direction: -1 | 1) => {
    const current = variants.findIndex((item) => item.key === variant);
    selectVariant(variants[(current + direction + variants.length) % variants.length].key);
  }, [selectVariant, variant]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") cycleVariant(-1);
      if (event.key === "ArrowRight") cycleVariant(1);
      if (event.key.toLowerCase() === "t") {
        setTranslation((current) => {
          updateUrl({ translation: current ? "off" : "on" });
          return !current;
        });
      }
      if (event.key.toLowerCase() === "h") setHint((current) => !current);
      if (event.key === " " && !revealed) {
        event.preventDefault();
        setRevealed(true);
        updateUrl({ side: "answer" });
      }
      if (event.key === "Escape") {
        setRevealed(false);
        setReportOpen(false);
        updateUrl({ side: "face" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycleVariant, revealed]);

  const visibleExpressions = density === "sparse" ? expressions.slice(0, 1) : expressions;
  const currentVariant = variants.find((item) => item.key === variant) ?? variants[0];

  return (
    <main className={styles.prototype} data-variant={variant}>
      <header className={styles.appHeader}>
        <div className={styles.brand}>2000<span>nl</span></div>
        <nav aria-label="Hoofdnavigatie">
          <span className={styles.navActive}>Training</span>
          <span>Bibliotheek</span>
          <span>Statistieken</span>
        </nav>
        <div className={styles.headerActions}><button type="button">Instellingen</button><button type="button">Profiel</button></div>
      </header>

      <section className={styles.sessionBar} aria-label="Trainingssessie">
        <span>RECHTSTREEKS · WOORD → BETEKENIS</span>
        <div><strong>5 / 25</strong><button type="button" onClick={() => { setRevealed(false); updateUrl({ side: "face" }); }}>Sluiten</button></div>
      </section>

      <aside className={styles.tracerControls} aria-label="Prototype controls">
        <strong>TRACER</strong>
        <button className={revealed ? styles.controlActive : ""} type="button" onClick={() => { setRevealed(!revealed); updateUrl({ side: revealed ? "face" : "answer" }); }}>{revealed ? "Answer" : "Face"}</button>
        <button className={translation ? styles.controlActive : ""} type="button" onClick={() => { setTranslation(!translation); updateUrl({ translation: translation ? "off" : "on" }); }}>Translation {translation ? "on" : "off"}</button>
        <button className={density === "dense" ? styles.controlActive : ""} type="button" onClick={() => { const next = density === "dense" ? "sparse" : "dense"; setDensity(next); updateUrl({ density: next }); }}>{density}</button>
        <span>{scrollState.canScroll ? scrollState.atTop ? "scroll: top" : scrollState.atBottom ? "scroll: bottom" : "scroll: middle" : "no scroll"}</span>
      </aside>

      <section className={styles.trainingStage}>
        <div className={`${styles.cardViewport} ${known ? styles.cardKnown : ""}`}>
          {!revealed ? (
            <div className={styles.face}>
              <div className={styles.faceLockup}>
                <div className={styles.faceWord}><span>de</span><strong>hand</strong></div>
                <button className={styles.faceAudio} type="button" aria-label="Uitspraak afspelen" title="Uitspraak afspelen" onClick={() => setLastAction("Audio requested from Face")}><ActionIcon name="audio" /></button>
              </div>
              {hint ? <div className={styles.hint}><span>HINT · VOORBEELD</span><em>Ze hield de brief stevig in haar hand.</em></div> : null}
            </div>
          ) : (
            <>
              <header className={styles.entityHeader}>
                <div className={styles.meta}><span className={styles.posDot} /> zelfstandig naamwoord <b>2K</b></div>
                <div className={styles.headwordRow}>
                  <div><span>de</span><strong>hand</strong></div>
                  <div className={styles.wordActions}>
                    <button type="button" aria-label="Vertaling tonen of verbergen" title="Vertaling" onClick={() => setTranslation((value) => {
                      updateUrl({ translation: value ? "off" : "on" });
                      return !value;
                    })}><ActionIcon name="translate" /></button>
                    <button type="button" aria-label="Uitspraak afspelen" title="Uitspraak afspelen" onClick={() => setLastAction("Audio requested from Answer")}><ActionIcon name="audio" /></button>
                    <button type="button" aria-label="Meer acties" title="Meer acties"><ActionIcon name="more" /></button>
                  </div>
                </div>
                <TranslationRow visible={translation}><div className={styles.wordTranslation}>hand</div></TranslationRow>
              </header>

              <div className={styles.lexicalViewport}>
                {!scrollState.atTop && scrollState.canScroll ? <div className={styles.topFade} /> : null}
                <div ref={scrollRef} onScroll={syncScroll} className={styles.lexicalScroll} tabIndex={0}>
                  <div className={styles.sectionHeader}><span>BETEKENIS</span><i /></div>
                  <p className={styles.definition}>het einde van je arm, waar je vingers aan zitten</p>
                  <TranslationRow visible={translation}><p className={styles.translation}>the end of your arm, where your fingers are attached</p></TranslationRow>

                  <div className={styles.sectionHeader}><span>UITDRUKKINGEN</span><i /><b>{visibleExpressions.length}</b></div>
                  <div className={styles.expressionList}>
                    {visibleExpressions.map(([source, translated]) => (
                      <article className={styles.expression} key={source}>
                        <em>{source}</em>
                        <TranslationRow visible={translation}><p className={styles.translation}>{translated}</p></TranslationRow>
                      </article>
                    ))}
                  </div>
                  {variant === "C" ? (
                    <>
                      <div className={styles.sectionHeader}><span>AANVULLENDE VOORBEELDEN</span><i /><b>3</b></div>
                      <div className={styles.expressionList}>
                        {expressions.slice(0, 3).map(([source, translated], index) => (
                          <article className={styles.expression} key={`${source}-${index}`}>
                            <em>{source} — extra lange stresstestregel die natuurlijk mag afbreken</em>
                            <TranslationRow visible={translation}><p className={styles.translation}>{translated}</p></TranslationRow>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
                {!scrollState.atBottom && scrollState.canScroll ? <div className={styles.bottomFade} /> : null}
              </div>
            </>
          )}
        </div>

        <div className={styles.actionDock}>
          {!revealed ? (
            <div className={styles.faceActions}>
              <button type="button" className={styles.hintButton} onClick={() => setHint(!hint)}>Hint {hint ? "uit" : "aan"}</button>
              <button type="button" className={styles.answerButton} onClick={() => { setRevealed(true); updateUrl({ side: "answer" }); }}>Toon antwoord <kbd>Space</kbd></button>
            </div>
          ) : known ? (
            <div className={styles.knownState}><span>Gemarkeerd als bekend</span><button type="button" onClick={() => { setKnown(false); setLastAction("Known mark undone"); }}>Ongedaan maken</button></div>
          ) : (
            <>
              <div className={styles.reviewGrid}>
                {[["Opnieuw", "#ff8a93"], ["Lastig", "#e9c46a"], ["Goed", "#37d99b"], ["Makkelijk", "#8debd0"]].map(([label, color]) => (
                  <button type="button" style={{ "--review": color } as React.CSSProperties} key={label} onClick={() => setLastAction(`Review: ${label}`)}>{label}</button>
                ))}
              </div>
              <div className={styles.secondaryActions}>
                <div className={styles.reportWrap}>
                  <button type="button" onClick={() => setReportOpen(!reportOpen)}>Melden</button>
                  {reportOpen ? <div className={styles.reportMenu}><button type="button" onClick={() => { setLastAction("Report: translation"); setReportOpen(false); }}>Vertaling klopt niet</button><button type="button" onClick={() => { setLastAction("Report: audio"); setReportOpen(false); }}>Audio werkt niet</button><button type="button" onClick={() => { setLastAction("Report: content"); setReportOpen(false); }}>Andere inhoud</button></div> : null}
                </div>
                <button type="button" onClick={() => { setKnown(true); setLastAction("Marked known"); }}>Markeer als bekend</button>
              </div>
            </>
          )}
        </div>
      </section>

      <footer className={styles.sessionFooter}>
        <div className={styles.footerGrid}>
          <div className={styles.progressStats}>
            <ProgressStat label="NIEUW" value={0} total={10} tone="#9d94ff" />
            <ProgressStat label="HERHALING" value={6} total={18} tone="#e9c46a" />
            <ProgressStat label="TOTAAL" value={6} total={25} tone="#37d99b" />
          </div>
          <div className={styles.activePlan}>Nederlands · VanDale 2k · Begrip <button type="button">Wijzigen</button></div>
        </div>
      </footer>

      <div className={styles.stateReadout} aria-live="polite">{lastAction} · {revealed ? "answer" : "face"} · {density} · translation {translation ? "on" : "off"}</div>

      <nav className={styles.prototypeSwitcher} aria-label="Prototype variants">
        <button type="button" aria-label="Previous variant" onClick={() => cycleVariant(-1)}>←</button>
        <span><b>{currentVariant.key}</b><i> — {currentVariant.label}</i></span>
        <button type="button" aria-label="Next variant" onClick={() => cycleVariant(1)}>→</button>
      </nav>
    </main>
  );
}
