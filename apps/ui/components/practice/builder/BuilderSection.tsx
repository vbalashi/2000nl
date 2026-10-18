"use client";
import React, { useId } from "react";
import { ChevronDown } from "lucide-react";
import s from "./builderSection.module.css";

export function BuilderSection({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id?: string;
  title: string;
  summary: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const generated = useId();
  const bodyId = `${id ?? generated}-body`;
  return (
    <section className={s.section}>
      <button
        type="button"
        className={s.heading}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <span className={s.title}>{title}</span>
        <span
          className={s.summary}
          data-testid={id ? `${id}-summary` : undefined}
        >
          {summary}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={open ? s.rotated : s.chevron}
        />
      </button>
      <div
        id={bodyId}
        className={`${s.reveal} ${open ? s.open : ""}`}
        ref={(node) => {
          if (node) node.toggleAttribute("inert", !open);
        }}
        aria-hidden={!open}
      >
        <div>
          <div className={s.body}>{children}</div>
        </div>
      </div>
    </section>
  );
}
