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
  headerActions,
  headerChoices,
}: {
  id?: string;
  title: string;
  summary: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** Independent controls beside the disclosure; never nested inside its button. */
  headerActions?: React.ReactNode;
  headerChoices?: React.ReactNode;
}) {
  const generated = useId();
  const bodyId = `${id ?? generated}-body`;
  return (
    <section className={s.section}>
      {headerActions || headerChoices ? (
        <div className={`${s.heading} ${s.controlledHeader}`}>
          <div className={s.titleActions}>
            <button
              type="button"
              data-builder-section={id?.replace(/^.*-/, "")}
              className={s.titleDisclosure}
              onClick={onToggle}
              aria-labelledby={`${bodyId}-title ${bodyId}-summary`}
              aria-expanded={open}
              aria-controls={bodyId}
            >
              <span id={`${bodyId}-title`} className={s.title}>
                {title}
              </span>
            </button>
            <div className={s.headerActions}>{headerActions}</div>
          </div>
          <span
            id={`${bodyId}-summary`}
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
        </div>
      ) : (
        <button
          type="button"
          data-builder-section={id?.replace(/^.*-/, "")} className={s.heading}
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
      )}
      <div
        data-builder-body={id?.replace(/^.*-/, "")} id={bodyId}
        className={`${s.reveal} ${open ? s.open : ""}`}
        ref={(node) => {
          if (node) node.toggleAttribute("inert", !open);
        }}
        aria-hidden={!open}
      >
        <div>
          <div className={s.body}>
            {headerChoices && <div className={s.headerChoices}>{headerChoices}</div>}
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
