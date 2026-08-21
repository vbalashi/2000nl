"use client";

import React from "react";

export type TrainingSessionLayoutPhase = "loading" | "ready" | "failure";

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
  children,
}: {
  phase: TrainingSessionLayoutPhase;
  chrome: React.ReactNode;
  footer: React.ReactNode;
  notice?: React.ReactNode;
  children: React.ReactNode;
}) {
  const showSessionDetail = phase !== "failure";
  return (
    <>
      {showSessionDetail ? chrome : null}
      <main
        data-training-session-main
        data-training-session-phase={phase}
        className="flex grow flex-col items-center overflow-hidden bg-background-light dark:bg-[#11141A]"
      >
        <div
          className={`flex h-full w-full max-w-[780px] flex-row justify-center px-[10px] max-[480px]:px-0 ${
            phase === "failure"
              ? "pb-0 pt-[10px]"
              : "pb-[8px] pt-[10px] max-[480px]:pt-[6px]"
          }`}
        >
          <section className="flex h-full w-full max-w-[760px] flex-1 flex-col overflow-visible bg-transparent">
            <div
              data-testid="training-card-scroll-region"
              className="flex min-h-0 flex-1 flex-col overflow-clip px-0"
            >
              <div className="flex h-full min-h-0 flex-col justify-start py-0 md:justify-center">
                {notice}
                <div
                  data-testid="training-card-frame"
                  className="mx-auto min-h-0 w-full flex-1 overflow-hidden transition-[height] duration-200"
                >
                  <div
                    data-testid="training-card-swipe-wrapper"
                    className="relative h-full min-h-0 overflow-hidden"
                  >
                    {children}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
      {showSessionDetail ? footer : null}
    </>
  );
}
