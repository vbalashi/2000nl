"use client";

import React, { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import s from "./library.module.css";

export function LibraryMeaningViewport({ children, scrollRef, preview, label="Meanings" }: {
  children: ReactNode;
  scrollRef: RefObject<HTMLDivElement>;
  preview: boolean;
  label?:string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    const node = scrollRef.current;
    const content = contentRef.current;
    if (!node || !content || preview) return;
    const update = () => {
      const top = node.scrollTop > 2;
      const bottom = node.scrollHeight - node.clientHeight - node.scrollTop > 2;
      setEdges(current => current.top === top && current.bottom === bottom ? current : { top, bottom });
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    observer.observe(content);
    node.addEventListener("scroll", update, { passive: true });
    update();
    return () => { observer.disconnect(); node.removeEventListener("scroll", update); };
  }, [preview, scrollRef]);

  return <div className={s.meaningViewport}>
    <div ref={scrollRef} className={s.meaningScroll} tabIndex={0} aria-label={label}>
      <div ref={contentRef} className={s.meaningContents}>{children}</div>
    </div>
    {!preview && edges.top && <div className={s.scrollFade} data-edge="top" aria-hidden="true"><ChevronUp size={18}/></div>}
    {!preview && edges.bottom && <div className={s.scrollFade} data-edge="bottom" aria-hidden="true"><ChevronDown size={18}/></div>}
  </div>;
}
