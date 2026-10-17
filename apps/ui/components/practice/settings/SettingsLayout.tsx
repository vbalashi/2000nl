"use client";
import {SegmentedControl} from "../ui/SegmentedControl";
import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import { IconAction } from "@/components/practice/ui/IconAction";
import s from "./settings.module.css";
export type SettingsItem<Key extends string> = {
  id: Key;
  label: string;
  Icon: LucideIcon;
  badge?: React.ReactNode;
};
/** Shared navigation and spacing; preference data stays with the caller. */
export function SettingsLayout<Key extends string>({
  active,
  language,
  items,
  onExit,
  children,
  className = "",
}: {
  active: boolean;
  language: OnboardingLanguage;
  items: SettingsItem<Key>[];
  onExit: () => void;
  className?: string;
  children: (section: Key, visible: boolean) => React.ReactNode;
}) {
  const copy = getUiMessages(language).settings;
  const [section, setSection] = useState<Key>(items[0].id),
    [mobileDetail, setMobileDetail] = useState(false);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 700px)");
    if (!query) return;
    const changed = () => setPhone(query.matches);
    changed();
    query.addEventListener?.("change", changed);
    return () => query.removeEventListener?.("change", changed);
  }, []);
  const scroll = useRef<HTMLElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    mobileButtons = useRef(new Map<Key, HTMLButtonElement>());
  useEffect(() => {
    if (active) setMobileDetail(false);
  }, [active]);
  const navigate = (id: Key, mobile: boolean) => {
    setSection(id);
    setMobileDetail(mobile);
    scroll.current?.scrollTo?.({ top: 0 });
    if (mobile) requestAnimationFrame(() => heading.current?.focus());
  };
  const back = () => {
    if (!mobileDetail) {
      onExit();
      return;
    }
    setMobileDetail(false);
    requestAnimationFrame(() => mobileButtons.current.get(section)?.focus());
  };
  return (
    <section
      ref={scroll}
      hidden={!active}
      className={`${theme.theme} ${s.settings} ${className}`}
      data-colour-mode="app"
      data-mobile-detail={mobileDetail}
      aria-label={copy.title}
      lang={language}
    >
      <h1 className={s.srOnly}>{copy.title}</h1>
      <div className={s.container}>
        <header className={s.mobileHeader}>
          <IconAction
            label={mobileDetail ? copy.backSettings : copy.backApp}
            onClick={back}
          >
            <ArrowLeft size={22} />
          </IconAction>
          <h2 ref={heading} tabIndex={-1}>
            {mobileDetail
              ? items.find((item) => item.id === section)?.label
              : copy.title}
          </h2>
        </header>
        <nav className={s.mobileMenu} aria-label={copy.mobileSections}>
          {items.map(({ id, label, Icon, badge }) => (
            <button
              type="button"
              ref={(element) => {
                if (element) mobileButtons.current.set(id, element);
                else mobileButtons.current.delete(id);
              }}
              key={id}
              onClick={() => navigate(id, true)}
            >
              <Icon size={20} />
              <span>{label}</span>
              {badge}
              <ChevronRight size={17} />
            </button>
          ))}
        </nav>
        <div className={s.layout}>
          <nav className={s.sections} aria-label={copy.sections}>
            {items.map(({ id, label, Icon, badge }) => (
              <button
                type="button"
                key={id}
                aria-current={section === id ? "page" : undefined}
                onClick={() => navigate(id, false)}
              >
                <Icon size={16} />
                <span>{label}</span>
                {badge}
              </button>
            ))}
          </nav>
          <div className={s.content} key={section}>
            {children(section, active && (!phone || mobileDetail))}
          </div>
        </div>
      </div>
    </section>
  );
}
export function SettingsPanel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`${s.panel} ${className}`}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
export function SettingsRow({
  title,
  hint,
  children,
  className = "",
}: {
  className?: string;
  title: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${s.row} ${className}`}>
      <div>
        <h3>{title}</h3>
        {hint && <p>{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SettingsOptions<Key extends string>({label,items,value,onChange,disabled=false}:{disabled?:boolean;label:string;items:{id:Key;label:string}[];value:Key;onChange:(value:Key)=>void}){
 return <SegmentedControl standard label={label}>{items.map(item=><button disabled={disabled} key={item.id} type="button" aria-pressed={value===item.id} onClick={()=>onChange(item.id)}>{item.label}</button>)}</SegmentedControl>;
}
