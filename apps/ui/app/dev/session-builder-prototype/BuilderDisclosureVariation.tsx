"use client";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Action, Choice, Modal } from "./VariantControls";
import s from "./prototype.module.css";
import dock from "./libraryStudy.module.css";

export function BuilderDisclosureVariation({ value, onChange }: { value: "flat" | "frame"; onChange: (value: "flat" | "frame") => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <aside className={dock.studyDock} aria-label="Builder design comparison"><span>{value === "frame" ? "Expanding frame" : "Flat sections"}</span><button onClick={() => setOpen(true)}><SlidersHorizontal size={14}/> Variations</button></aside>
    {open && <Modal title="Builder variations" onClose={() => setOpen(false)}>
      <div className={s.sourceTools}><h3>Section expansion</h3><div className={s.choices}>
        <Choice active={value === "flat"} onClick={() => onChange("flat")}>Flat sections</Choice>
        <Choice active={value === "frame"} onClick={() => onChange("frame")}>Expanding frame</Choice>
      </div><p className={s.muted}>Compare the same settings with a moving lower edge or an open page background.</p></div>
      <div className={s.modalActions}><Action primary onClick={() => setOpen(false)}>View variation</Action></div>
    </Modal>}
  </>;
}
