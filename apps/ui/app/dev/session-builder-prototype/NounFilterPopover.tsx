"use client";

import { useEffect, useRef } from "react";
import {DialogSurface} from "@/components/practice/ui/DialogSurface";
import { X } from "lucide-react";
import { Choice } from "./VariantControls";
import s from "./prototype.module.css";
import f from "./libraryFilters.module.css";

export function NounFilterPopover({ anchor, article, onChange, onClose }: {
  anchor: HTMLButtonElement; article: "de" | "het" | null;
  onChange: (article: "de" | "het" | null) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const place = () => {
      const bounds = anchor.getBoundingClientRect();
      const width = dialog.offsetWidth;
      const height = dialog.offsetHeight;
      dialog.style.left = `${Math.max(12, Math.min(bounds.left - 12, window.innerWidth - width - 12))}px`;
      dialog.style.top = `${Math.max(12, Math.min(bounds.bottom + 10, window.innerHeight - height - 12))}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("resize", place);  };
  }, [anchor]);
  return <DialogSurface onDismiss={onClose} ref={ref} className={f.popover} aria-label="Noun article" onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}>
    <div className={f.popoverHeader}><h3>Noun article</h3><button className={f.icon} aria-label="Close noun subfilters" onClick={onClose}><X size={17}/></button></div>
    <div className={s.choices}>{(["de", "het"] as const).map(value => <Choice key={value} active={!article || article === value} onClick={() => onChange(article ? null : value)}>{value}</Choice>)}</div>
    <p className={f.help}>Both selected means no article restriction.</p>
  </DialogSurface>;
}
