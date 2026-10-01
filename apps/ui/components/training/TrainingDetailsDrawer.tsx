"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { WordDetailsHeader } from "./WordDetailsHeader";
import { sharedArticlePresentationV1Enabled } from "@/lib/platform/platformV2Rollout";
import sheet from "@/components/practice/article/wordDetailsSheet.module.css";
import { PracticePanel } from "@/components/practice/ui/PracticePanel";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode | ((entered: boolean) => React.ReactNode);
  interfaceLanguage: OnboardingLanguage;
};

export function TrainingDetailsDrawer({
  open,
  onClose,
  children,
  interfaceLanguage,
}: Props) {
  const approved = sharedArticlePresentationV1Enabled();
  const [entered, setEntered] = React.useState(false);
  const dismissRef = React.useRef(onClose);
  React.useEffect(() => {
    if (!open) setEntered(false);
  }, [open]);
  // The shared panel owns animated dismissal; the legacy drawer closes immediately.
  if (!approved) dismissRef.current = onClose;
  const [swipeOffset, setSwipeOffset] = React.useState(0);
  const [swipeEngaged, setSwipeEngaged] = React.useState(false);
  const swipeOffsetRef = React.useRef(0);
  const swipeActiveRef = React.useRef(false);
  const swipeStartRef = React.useRef({ x: 0, y: 0 });

  const updateSwipeOffset = React.useCallback((value: number) => {
    swipeOffsetRef.current = value;
    setSwipeOffset(value);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !approved) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, approved]);

  React.useEffect(() => {
    if (!open) return;
    const edgeSize = 28;
    const closeThreshold = 90;
    const maxOffset = 220;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (touch.clientX > edgeSize) return;
      swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
      swipeActiveRef.current = true;
      setSwipeEngaged(false);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!swipeActiveRef.current) return;
      const touch = event.touches[0];
      const dx = touch.clientX - swipeStartRef.current.x;
      const dy = touch.clientY - swipeStartRef.current.y;
      if (dx <= 0 || Math.abs(dx) < Math.abs(dy)) return;
      event.preventDefault();
      setSwipeEngaged(true);
      updateSwipeOffset(Math.min(dx, maxOffset));
    };

    const finishSwipe = () => {
      if (!swipeActiveRef.current) return;
      const shouldClose = swipeOffsetRef.current > closeThreshold;
      swipeActiveRef.current = false;
      setSwipeEngaged(false);
      updateSwipeOffset(0);
      if (shouldClose) dismissRef.current();
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", finishSwipe);
    window.addEventListener("touchcancel", finishSwipe);

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", finishSwipe);
      window.removeEventListener("touchcancel", finishSwipe);
    };
  }, [open, onClose, updateSwipeOffset]);

  if (!open) return null;

  if (approved) return (
    <PracticePanel
      title={platformV2Message(interfaceLanguage, "senseCard.wordDetails.open")}
      closeLabel={platformV2Message(interfaceLanguage, "common.close")}
      language={interfaceLanguage}
      headless
      onClose={onClose}
      onEntered={() => setEntered(true)}
    >
      {dismiss => {
        dismissRef.current = dismiss;
        return <>
          <WordDetailsHeader onClose={dismiss} interfaceLanguage={interfaceLanguage} />
          <div className="min-h-0 flex-1">
            {typeof children === "function" ? children(entered) : children}
          </div>
        </>;
      }}
    </PracticePanel>
  );
  const overlayOpacity = Math.max(0.1, 0.3 - swipeOffset / 700);

  return (
    <div className="fixed inset-0 z-40">
      <div
        className={`absolute inset-0 ${approved ? sheet.backdrop : "bg-black/30"}`}
        style={{ opacity: approved ? overlayOpacity / 0.3 : overlayOpacity }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="absolute inset-y-0 right-0 w-full max-w-full sm:w-[460px]">
        <div
          className={`relative flex h-full flex-col ${approved ? sheet.panel : "bg-white shadow-2xl dark:bg-slate-900"}`}
          style={{
            transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
            transition: swipeEngaged ? "none" : "transform 200ms ease-out",
          }}
        >
          <WordDetailsHeader onClose={onClose} interfaceLanguage={interfaceLanguage} />
          <div className="min-h-0 flex-1 p-3">{typeof children === "function" ? children(true) : children}</div>
        </div>
      </div>
    </div>
  );
}
