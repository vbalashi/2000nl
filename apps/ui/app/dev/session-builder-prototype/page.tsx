import {PaletteLab} from "./PaletteLab";
import {notFound} from "next/navigation";
import {BuilderPrototype} from "./BuilderPrototype";
import {ComparisonLab} from "./ComparisonLab";
import {isVariant} from "./variants";

export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  if(process.env.NODE_ENV==="production")notFound();
  const params=await searchParams;
  if(params.view==="library")return <div data-palette="soft"><BuilderPrototype variant="emil" initialScreen="library"/></div>;
  if(params.view==="palette")return <PaletteLab initialPalette={typeof params.palette==="string"?params.palette:"soft"}/>;
  if(params.view==="compare")return <ComparisonLab initialMobile={params.device==="mobile"}/>;
  const variant=isVariant(params.variant)?params.variant:"current";
  const embedded=params.embed==="1";
  return <BuilderPrototype variant={variant} embedded={embedded} showSwitcher={!embedded && isVariant(params.variant)}/>;
}
