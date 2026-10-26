"use client";
import React, { useLayoutEffect, useRef, useState } from "react";
import s from "./trainingScreenTransition.module.css";
export function TrainingScreenTransition({
  screen,
  children,
}: {
  screen: "today" | "setup";
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null),
    snapshot = useRef(children),
    scroll = useRef<number[]>([]),
    trigger = useRef(-1);
  const [displayed, setDisplayed] = useState(screen),
    [phase, setPhase] = useState("");
  const backwards = screen === "today";
  const restore = () => {
    const node = root.current;
    if (!node) return;
    [...node.querySelectorAll<HTMLElement>("*")].forEach((x, i) => {
      x.scrollTop = scroll.current[i] ?? 0;
    });
    node
      .querySelectorAll<HTMLButtonElement>("button")
      [trigger.current]?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (displayed === screen) snapshot.current = children;
  }, [children, displayed, screen]);
  useLayoutEffect(() => {
    if (displayed === screen) return;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) {
      setDisplayed(screen);
      setPhase("");
      return;
    }
    setPhase("leave");
    const leave = window.setTimeout(() => {
      setDisplayed(screen);
      setPhase("enter");
    }, 100);
    const end = window.setTimeout(() => setPhase(""), 280);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(end);
    }; // displayed deliberately stays out: switching it must not cancel the entry timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);
  useLayoutEffect(() => {
    if (displayed === screen && backwards) restore(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayed, screen]);
  return (
    <div
      ref={root}
      onClickCapture={(event) => {
        if (screen !== "today" || displayed !== screen) return;
        const button = (event.target as HTMLElement).closest("button");
        if (!button) return;
        trigger.current = [...root.current!.querySelectorAll("button")].indexOf(
          button,
        );
        scroll.current = [
          ...root.current!.querySelectorAll<HTMLElement>("*"),
        ].map((x) => x.scrollTop);
      }}
      className={`${s.screen} ${phase === "leave" ? s.leave : phase === "enter" ? s.enter : ""} ${backwards ? s.backward : ""}`}
    >
      {displayed === screen ? children : snapshot.current}
    </div>
  );
}
