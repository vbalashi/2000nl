"use client";

import React from "react";
import type {PlatformEntryNoteMaterialV2} from "../../../../../packages/shared/types/platformV2";
import {useAdditionalCardTranslation,additionalTranslationText} from "./AdditionalCardTranslation";
import {List,Quote} from "lucide-react";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import type {PlatformV2SenseContentNode} from "@/lib/platform/projections/platformV2SenseContent";
import {getUiMessages} from "@/lib/uiMessages";
import {SenseCardReveal} from "@/components/training/SenseCardChrome";
import s from "./articleContent.module.css";
import {TranslationPlaceholder, TranslationFailure} from "./TranslationFeedback";

// Presentation consumes the normalized content tree, never provider raw or fixtures.
export type ArticleContentClasses=Readonly<Record<string,string>>;
type Presentation={
 interfaceLanguage:OnboardingLanguage;
 contentLanguage?:string;
 translationLanguage?:string;
 translationVisible?:boolean;
 translationPending?:boolean;
 translationFailed?:boolean;
 onRetryTranslation?:()=>void;
 classes?:ArticleContentClasses;
};

type ArticleTranslationProps = {
 text?: string | null;
 literalText?: string | null;
 visible: boolean;
 pending?: boolean;
 failed?: boolean;
 onRetry?: () => void;
 interfaceLanguage?: OnboardingLanguage;
 emphasis?: boolean;
 multiline?: boolean;
 language?: string;
 classes?: ArticleContentClasses;
 translationKey?: string;
 sourceTextFingerprint?: string;
 testId?: string;
 markContentTranslation?: boolean;
};

export function ArticleTranslation({text,literalText,visible,pending=false,failed=false,onRetry,interfaceLanguage="en",emphasis=false,multiline=false,language,classes=s,translationKey,sourceTextFingerprint,testId,markContentTranslation=true}:ArticleTranslationProps){
 const additional=useAdditionalCardTranslation();
 const secondary=additionalTranslationText(additional,translationKey,sourceTextFingerprint);
 // Idioms pass null when the primary literal is absent: the secondary language
 // can still have its own literal, paired with its own natural translation.
 const secondaryLiteral=literalText !== undefined ? additionalTranslationText(additional,translationKey,sourceTextFingerprint,true) : undefined;
 const row=(value:string|null|undefined,literal:string|null|undefined,code:string|undefined,loading:boolean,error:boolean,retry:(()=>void)|undefined,label:boolean)=>{
  if(!value&&!loading&&!error)return null;
  const literalLanguage=code?.split("-")[0] ?? interfaceLanguage;
  const literalLabel=literalLanguage === "ru" || literalLanguage === "nl" || literalLanguage === "en"
   ? getUiMessages(literalLanguage).article.literally : getUiMessages(interfaceLanguage).article.literally;
  return <SenseCardReveal open={visible}>
   {value ? <p
    lang={code}
    data-testid={code === language ? testId : undefined}
    data-content-translation={markContentTranslation ? "true" : undefined}
    data-translation-language={code}
    className={emphasis?classes.translationEmphasis:classes.translation}
   >
    {label&&<span className={s.languageLabel}>{code?.toUpperCase()}</span>}
    {value}
    {literal&&<> <span data-literal-translation="true" className={s.literalTranslation}>({literalLabel}: {literal})</span></>}
   </p> : <div data-translation-language={code}>
    {label&&<span className={s.languageLabel}>{code?.toUpperCase()}</span>}
    {error&&retry ? <TranslationFailure language={interfaceLanguage} onRetry={retry}/> : loading ? <TranslationPlaceholder emphasis={emphasis} multiline={multiline}/> : null}
   </div>}
  </SenseCardReveal>;
 };
 return <>
  {row(text,literalText,language,pending,failed,onRetry,Boolean(additional?.labelPrimary))}
  {additional&&translationKey&&row(secondary,secondaryLiteral,additional.language,additional.status==="pending",additional.status==="failed",additional.retry,true)}
 </>;
}

export function ArticleContentNode({node,interfaceLanguage,contentLanguage,translationLanguage,translationVisible=false,translationPending=false,translationFailed=false,onRetryTranslation,classes=s,lead=false}:Presentation&{node:PlatformV2SenseContentNode;lead?:boolean}){
 const copy=getUiMessages(interfaceLanguage).article;
 const literary=node.kind==="example"||node.kind==="idiom";
 return <div className={classes.contentNode} data-kind={node.kind} data-content-kind={node.kind} data-content-node-id={node.contentNodeId} data-parent-content-node-id={node.parentContentNodeId??undefined}>
  <div className={classes.contentPair}>
   {!lead&&<span className={classes.nodeRole} data-role={node.kind==="example"?"example":"explanation"}>{node.kind==="example"?copy.example:node.kind==="idiom-explanation"||node.kind==="definition"?copy.explanation:copy.note}</span>}
   <p lang={contentLanguage} className={lead?classes.definitionText:literary?classes.literary:node.kind==="usage-pattern"?classes.usagePattern:classes.explanation}>{node.text}</p>
   <ArticleTranslation translationKey={node.contentNodeId} sourceTextFingerprint={node.sourceTextFingerprint} text={node.translation} literalText={node.kind === "idiom" ? node.literalTranslation ?? null : undefined} pending={translationPending} failed={translationFailed} onRetry={onRetryTranslation} interfaceLanguage={interfaceLanguage} multiline={node.kind === "definition"} visible={translationVisible} language={translationLanguage} classes={classes}/>
  </div>
  {node.children.length>0&&<div className={classes.children}>{node.children.map(child=><ArticleContentNode key={child.contentNodeId} node={child} interfaceLanguage={interfaceLanguage} contentLanguage={contentLanguage} translationLanguage={translationLanguage} translationVisible={translationVisible} translationPending={translationPending} translationFailed={translationFailed} onRetryTranslation={onRetryTranslation} classes={classes}/>)}</div>}
 </div>;
}

export function ArticleMeaningDetails({definition,details,noteMaterial,...presentation}:Presentation&{definition:PlatformV2SenseContentNode|null;details:PlatformV2SenseContentNode[];noteMaterial?:PlatformEntryNoteMaterialV2[]}){
 const classes=presentation.classes??s;const copy=getUiMessages(presentation.interfaceLanguage).article;
 const groups=[
  {id:"examples",label:copy.examples,nodes:details.filter(n=>n.kind==="example")},
  {id:"usage",label:copy.usage,nodes:details.filter(n=>n.kind==="usage-pattern")},
  {id:"expressions",label:copy.expressions,nodes:details.filter(n=>n.kind==="idiom"||n.kind==="idiom-explanation")},
  {id:"notes",label:copy.note,nodes:details.filter(n=>!["example","usage-pattern","idiom","idiom-explanation"].includes(n.kind))},
 ];
 return <>{definition?.children.map(node=><ArticleContentNode key={node.contentNodeId} node={node} {...presentation}/>)}{groups.filter(g=>g.nodes.length).map(group=><section className={classes.contentSection} key={group.id} data-section={group.id}><h3>{group.id==="examples"?<List size={12} aria-hidden="true"/>:<Quote size={12} aria-hidden="true"/>}<span>{group.label}</span></h3>{group.nodes.map(node=><ArticleContentNode key={node.contentNodeId} node={node} {...presentation}/>)}</section>)}<ArticleNoteMaterial notes={noteMaterial} interfaceLanguage={presentation.interfaceLanguage} classes={classes}/></>;
}

/** Authorized overlays remain read-only text, separate from reportable study nodes. */
export function ArticleNoteMaterial({notes,interfaceLanguage,classes=s}:{notes?:PlatformEntryNoteMaterialV2[];interfaceLanguage:OnboardingLanguage;classes?:ArticleContentClasses}){
 const copy=getUiMessages(interfaceLanguage).article;
 return <>{[...(notes??[])].sort((a,b)=>Number(a.isOwn)-Number(b.isOwn)).map(note=><section key={note.noteId} className={classes.contentSection} data-note-id={note.noteId} data-note-origin={note.isOwn?"own":"shared"}>
  <h3><Quote size={12} aria-hidden="true"/><span>{note.isOwn?copy.myNote:copy.authorNote}</span></h3>
  <p lang="" className={`${classes.explanation} ${s.noteMaterialText}`}>{note.text}</p>
 </section>)}</>;
}

/** Fixed approved reading recipe; comparison choices stay in the prototype. */
export function ArticleReadingFrame({children,className=""}:{children:React.ReactNode;className?:string}){
 return <div className={`${s.detail} ${className}`} data-nesting="hybrid" data-nested-reading="literary" data-role-labels="border" data-nested-text-inset="inset" data-example-line="none" data-translation-ink="warm">{children}</div>;
}
