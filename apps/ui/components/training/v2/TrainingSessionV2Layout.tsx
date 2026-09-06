"use client";

import React from "react";
import styles from "./TrainingSessionLayout.module.css";

export type TrainingSessionLayoutPhase = "loading" | "ready" | "failure";

export type TrainingSessionReadySurface = {
  ref?: React.Ref<HTMLDivElement>;
  className?: string;
  style?: React.CSSProperties;
  onTouchStart?: React.TouchEventHandler<HTMLDivElement>;
  onTouchMove?: React.TouchEventHandler<HTMLDivElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
  onTouchCancel?: React.TouchEventHandler<HTMLDivElement>;
  feedback?: React.ReactNode;
};

export function resolveTrainingSessionLayoutPhase(
  rendererState: string,
): TrainingSessionLayoutPhase {
  if (rendererState === "loading" || rendererState === "ready") {
    return rendererState;
  }
  return "failure";
}

export function TrainingSessionV2Layout({
  phase,
  chrome,
  footer,
  notice,
  readySurface,
  children,
}: {
  phase: TrainingSessionLayoutPhase;
  chrome: React.ReactNode;
  footer: React.ReactNode;
  notice?: React.ReactNode;
  readySurface?: TrainingSessionReadySurface;
  children: React.ReactNode;
}) {
  const showSessionDetail = phase !== "failure";
  const interaction = phase === "ready" ? readySurface : undefined;
  return (
    <>
      <main
        data-training-session-main
        data-training-session-phase={phase}
        className={styles.main}
      >
        <section className={styles.stack}>
          {showSessionDetail ? chrome : null}
          <div
            data-testid="training-card-scroll-region"
            className="flex min-h-0 flex-1 flex-col overflow-clip px-0"
          >
            {notice}
            <div
              data-testid="training-card-frame"
              className="mx-auto min-h-0 w-full flex-1 overflow-hidden transition-[height] duration-200"
            >
              <div
                ref={interaction?.ref}
                data-testid="training-card-swipe-wrapper"
                className={`relative h-full min-h-0 overflow-hidden ${interaction?.className ?? ""}`}
                style={interaction?.style}
                onTouchStart={interaction?.onTouchStart}
                onTouchMove={interaction?.onTouchMove}
                onTouchEnd={interaction?.onTouchEnd}
                onTouchCancel={interaction?.onTouchCancel}
              >
                {interaction?.feedback}
                {children}
              </div>
            </div>
          </div>
        </section>
      </main>
      {showSessionDetail ? footer : null}
    </>
  );
}
