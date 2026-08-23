"use client";

import React from "react";
import type { TrainingSessionReadySurface } from "./TrainingSessionV2Layout";

type SwipeChoice<T> = {
  value: T;
  label: string;
  tintColor: string;
  indicatorClass: string;
};

export type TrainingCardSwipeCommitOutcome =
  | "accepted"
  | "stalled"
  | "rejected";

export function useTrainingCardSwipeSurface<T>({
  enabled,
  busy,
  identity,
  left,
  right,
  onCommit,
}: {
  enabled: boolean;
  busy: boolean;
  identity: string;
  left?: SwipeChoice<T>;
  right?: SwipeChoice<T>;
  onCommit: (value: T) => Promise<TrainingCardSwipeCommitOutcome>;
}): TrainingSessionReadySurface {
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const startRef = React.useRef<{ x: number; y: number } | null>(null);
  const trackingRef = React.useRef(false);
  const commitPendingRef = React.useRef(false);
  const identityRef = React.useRef(identity);
  identityRef.current = identity;
  const offsetRef = React.useRef(0);
  const [offset, setOffset] = React.useState(0);
  const [direction, setDirection] = React.useState<"left" | "right" | null>(
    null,
  );
  const [active, setActive] = React.useState(false);
  const [animating, setAnimating] = React.useState(false);

  const reset = React.useCallback(() => {
    startRef.current = null;
    trackingRef.current = false;
    commitPendingRef.current = false;
    offsetRef.current = 0;
    setOffset(0);
    setDirection(null);
    setActive(false);
    setAnimating(false);
  }, []);

  React.useEffect(() => reset(), [enabled, identity, reset]);

  const onTouchStart: React.TouchEventHandler<HTMLDivElement> = (event) => {
    const touch = event.touches[0];
    if (!touch || !enabled || busy || commitPendingRef.current) return;
    startRef.current = { x: touch.clientX, y: touch.clientY };
    trackingRef.current = false;
    setAnimating(false);
  };

  const onTouchMove: React.TouchEventHandler<HTMLDivElement> = (event) => {
    const start = startRef.current;
    const touch = event.touches[0];
    if (!start || !touch || !enabled || busy || commitPendingRef.current) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (!trackingRef.current) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      trackingRef.current = true;
      setActive(true);
    }
    event.preventDefault();
    const cardWidth = cardRef.current?.offsetWidth ?? 0;
    const clamped = Math.max(-cardWidth * 0.6, Math.min(cardWidth * 0.6, dx));
    offsetRef.current = clamped;
    setOffset(clamped);
    setDirection(clamped >= 0 ? "right" : "left");
  };

  const finish = React.useCallback(
    (cancelled: boolean) => {
      const cardWidth = cardRef.current?.offsetWidth ?? 0;
      const currentOffset = offsetRef.current;
      const choice = currentOffset >= 0 ? right : left;
      if (
        !cancelled &&
        !busy &&
        enabled &&
        trackingRef.current &&
        choice &&
        cardWidth > 0 &&
        Math.abs(currentOffset) >= cardWidth * 0.35
      ) {
        const committedDirection = currentOffset >= 0 ? "right" : "left";
        const committedOffset =
          (committedDirection === "right" ? 1 : -1) * cardWidth * 1.1;
        offsetRef.current = committedOffset;
        setOffset(committedOffset);
        setDirection(committedDirection);
        setActive(false);
        setAnimating(true);
        startRef.current = null;
        trackingRef.current = false;
        commitPendingRef.current = true;
        const committedIdentity = identity;
        void onCommit(choice.value)
          .catch(() => "rejected" as const)
          .then((outcome) => {
            if (
              outcome !== "accepted" &&
              identityRef.current === committedIdentity
            ) {
              reset();
            }
          });
        return;
      }
      startRef.current = null;
      trackingRef.current = false;
      offsetRef.current = 0;
      setOffset(0);
      setDirection(null);
      setActive(false);
      setAnimating(true);
    },
    [busy, enabled, identity, left, onCommit, reset, right],
  );

  const choice = direction === "left" ? left : direction === "right" ? right : null;
  const threshold = (cardRef.current?.offsetWidth ?? 0) * 0.35;
  const progress = threshold > 0 ? Math.min(1, Math.abs(offset) / threshold) : 0;
  const intensity = choice && (active || animating) ? progress : 0;

  return {
    ref: cardRef,
    className: animating
      ? "transition-transform duration-200 ease-out motion-reduce:transition-none"
      : "transition-none motion-reduce:transition-none",
    style: {
      transform: `translateX(${offset}px) rotate(${offset / 40}deg)`,
      touchAction: "pan-y",
    },
    onTouchStart,
    onTouchMove,
    onTouchEnd: () => finish(false),
    onTouchCancel: () => finish(true),
    feedback: choice ? (
      <>
        {intensity > 0 ? (
          <div
            data-testid="training-swipe-tint"
            className="pointer-events-none absolute inset-0 z-10 rounded-3xl"
            style={{ backgroundColor: choice.tintColor, opacity: intensity * 0.14 }}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div
            data-testid="training-swipe-indicator"
            className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] shadow-sm ${choice.indicatorClass}`}
            style={{ opacity: intensity }}
          >
            {choice.label}
          </div>
        </div>
      </>
    ) : null,
  };
}
