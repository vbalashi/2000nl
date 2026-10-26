"use client";
import React, { useRef } from "react";
import { useSelectionMarker } from "./useSelectionMarker";
import s from "./segmentedControl.module.css";
export function SegmentedControl({
  label,
  children,
  navigation = false,
  standard = false,
}: {
  label: string;
  children: React.ReactNode;
  navigation?: boolean;
  standard?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useSelectionMarker(ref, s.marker, standard);
  return (
    <div
      ref={ref}
      className={`${s.control} ${standard ? s.standard : ""} ${navigation ? s.navigation : ""}`}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}
