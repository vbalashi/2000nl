"use client";
import {useCallback, useLayoutEffect, useRef, useState, type RefObject} from "react";
import {useTrainingInteractions} from "./TrainingInteractionPreferences";
type Snapshot = {clone: HTMLElement; rect: DOMRect};
function snapshot(node: HTMLElement): Snapshot {
 const clone = node.cloneNode(true) as HTMLElement;
 const sourceNodes = [node,...node.querySelectorAll<HTMLElement>("*")];
 const cloneNodes = [clone,...clone.querySelectorAll<HTMLElement>("*")];
 sourceNodes.forEach((source,index) => {
  const style = getComputedStyle(source);
  cloneNodes[index].style.cssText = Array.from(style).map(key => `${key}:${style.getPropertyValue(key)};`).join("");
  cloneNodes[index].removeAttribute("id");
  cloneNodes[index].removeAttribute("data-testid");
  cloneNodes[index].removeAttribute("tabindex");
 });
 clone.setAttribute("aria-hidden","true"); clone.inert = true;
 clone.dataset.trainingRevealOverlay = "true";
 return {clone,rect:node.getBoundingClientRect()};
}
/** Swaps the entire card with a short shift. No text/font interpolation or learning state. */
export function useTrainingPromptReveal({root,revealed,enabled,identity}: {
 root: RefObject<HTMLElement>; revealed:boolean; enabled:boolean; identity:string;
}) {
 const {preferences,loadStatus} = useTrainingInteractions();
 const active = enabled && loadStatus === "ready" && preferences.animation;
 const pending = useRef<Snapshot|null>(null);
 const [moving,setMoving] = useState(false);
 const capture = useCallback(() => {
  pending.current = null;
  if (!active || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const node = root.current?.querySelector<HTMLElement>('[data-testid="training-sense-card-shell"]');
  if (node?.animate) pending.current = snapshot(node);
 },[active,root]);
 useLayoutEffect(() => {
  const from = pending.current; pending.current = null;
  const node = revealed && active ? root.current?.querySelector<HTMLElement>('[data-testid="training-sense-card-shell"]') : null;
  if (!from || !node?.animate || !from.rect.width) {setMoving(false); return;}
  const overlay = from.clone;
  Object.assign(overlay.style,{position:"fixed",left:`${from.rect.left}px`,top:`${from.rect.top}px`,width:`${from.rect.width}px`,height:`${from.rect.height}px`,margin:"0",minWidth:"0",maxWidth:"none",pointerEvents:"none",zIndex:"50",transform:"none"});
  const opacity = node.style.opacity;
  node.style.opacity = "0"; document.body.append(overlay); setMoving(true);
  let animation:Animation|undefined;
  let disposed = false;
  const restore = () => {overlay.remove(); node.style.opacity = opacity;};
  const finish = () => {if (!disposed) {restore();setMoving(false);}};
  try {
   animation = overlay.animate([{opacity:1,transform:"translateY(0)"},{opacity:0,transform:"translateY(-8px)"}],{duration:90,easing:"ease-in",fill:"forwards"});
   animation.oncancel = finish;
   animation.onfinish = () => {
    if (disposed) return;
    overlay.remove(); node.style.opacity = opacity;
    try {
     animation = node.animate([{opacity:0,transform:"translateY(8px)"},{opacity:1,transform:"translateY(0)"}],{duration:130,easing:"ease-out"});
     animation.onfinish = finish; animation.oncancel = finish;
    } catch {finish();}
   };
  } catch {finish();}
  const cancel = () => {animation?.cancel();finish();};
  window.addEventListener("resize",cancel);
  return () => {disposed=true;window.removeEventListener("resize",cancel);if(animation){animation.onfinish=null;animation.oncancel=null;animation.cancel();}restore();};
 },[revealed,active,identity,root]);
 return {capture,moving};
}
