import { Draft, initialDraft } from "./model";

export const variants = [
  {id:"current", name:"Current", caption:"Our baseline", detail:"Lavender accents · Inter + Newsreader · familiar accordion", reference:"", letter:"A"},
  {id:"linear", name:"Linear-inspired", caption:"Compact workspace", detail:"Quiet chrome · property rows · dense, precise controls", reference:"https://linear.app/now/behind-the-latest-design-refresh", letter:"B"},
  {id:"radix", name:"Radix Themes", caption:"Actual Radix components", detail:"Violet soft buttons · checkbox cards · sliders and dialogs", reference:"https://www.radix-ui.com/themes/docs/components/button", letter:"C"},
  {id:"emil", name:"Emil-inspired", caption:"Tactile interaction study", detail:"Soft panels · rounded controls · short press and reveal motion", reference:"https://emilkowal.ski/ui/you-dont-need-animations", letter:"D"},
] as const;
export type Variant = typeof variants[number]["id"];
export type BuilderSnapshot = {draft:Draft; open:string[]; nounOpen:boolean};
export const initialSnapshot:BuilderSnapshot = {draft:initialDraft,open:["exercises","filters"],nounOpen:false};
export const comparisonChannel = "2000nl-builder-design-lab";
export function isVariant(value:unknown):value is Variant {return variants.some(v=>v.id===value);}
