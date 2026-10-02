'use client';
import React from 'react';
import {useSearchParams} from 'next/navigation';
import {ProductionArticleReading} from '@/components/practice/article/ProductionArticleReading';
import {ArticleContentNode,ArticleMeaningDetails} from '@/components/practice/article/ArticleContent';
import {ArticleSenseRelations} from '@/components/practice/article/ArticleWordDetails';
import {lexicalRelationDetail} from '@/components/practice/article/wordDetailsPresentation';
import {accountTextSizeStyles} from '@/lib/reading/textScale';
import {richGroup,usageGroup} from './fixtures';
import {LibrarySenseCardGroup} from '@/components/training/library-v2/LibrarySenseCardGroup';
import {TrainingSenseCardStage} from '@/components/training/v2/TrainingSenseCardStage';
import theme from '@/components/practice/ui/practiceTheme.module.css';
import sheet from '@/components/practice/article/wordDetailsSheet.module.css';
import {ArticleWordForms} from '@/components/practice/article/ArticleWordDetails';
import {wordFormDetail} from '@/components/practice/article/wordDetailsPresentation';
import type {PlatformV2SenseContentNode} from '@/lib/platform/projections/platformV2SenseContent';
import './study.css';
export function Audit(){
 const q=useSearchParams();const variant=q.get('variant')||'baseline';const translation=q.get('translation')||'off';
 const size=q.get('size') as 'normal'|'large'|'largest'|'extra'||'normal';
 const group=q.get('fixture')==='usage'?usageGroup:richGroup;
 const [formsOpen,setFormsOpen]=React.useState(false);
 React.useEffect(()=>{document.documentElement.classList.toggle('dark',q.get('dark')==='1');return()=>document.documentElement.classList.remove('dark')},[q]);
 const trim=(n:PlatformV2SenseContentNode):PlatformV2SenseContentNode=>({...n,translation:translation==='partial'&&n.kind==='example'?undefined:n.translation,children:n.children.map(trim)});
 const model={...group,meanings:group.meanings.map(m=>({...m,definition:m.definition?trim(m.definition):null,details:m.details.map(trim)}))};
 const first=model.meanings[0];
 const surface=q.get('surface')||'article';
 return <main data-audit={variant} data-account-palette={q.get('palette')||'graphite'} data-colour-mode='app' data-practice-palette={q.get('palette')||'graphite'} className={theme.theme} style={{...accountTextSizeStyles(size),padding:16,background:'var(--practice-canvas)'}}>
 <h1>{group.headword} — {variant} · {size} · {translation}</h1>
 {surface==='library'?<div className={theme.theme} data-colour-mode='app' style={{height:'calc(100dvh - 80px)',maxWidth:760,margin:'auto'}}><section className={sheet.librarySheet} data-expanded='true' style={{position:'relative',inset:0,height:'100%',maxHeight:'100%'}}><LibrarySenseCardGroup model={model} interfaceLanguage='en' contentLanguage='nl' translationLanguage='en' translationEnabled={true} onRequestTranslation={()=>{}} onAction={()=>{}}/></section></div>:surface==='training'?<div className={theme.theme} data-colour-mode='app' style={{height:'calc(100dvh - 80px)',maxWidth:760,margin:'auto',display:'flex',flexDirection:'column'}}><TrainingSenseCardStage model={{entryId:first.entryId,headword:group.headword,partOfSpeech:group.partOfSpeech??undefined,wordDetails:first.wordDetails,entryTranslation:first.entryTranslation??undefined,definitions:first.definition?[first.definition]:[],examples:first.details,repeatCount:1,isKnown:false,reviewCapabilities:[],reportCapabilities:[]}} mode='word-to-definition' interfaceLanguage='en' contentLanguage='nl' translationLanguage='en' side='answer' onSideChange={()=>{}} onAction={()=>{}}/></div>:<><ProductionArticleReading><h2>{group.headword}</h2><ArticleWordForms detail={wordFormDetail(first.wordDetails,group.partOfSpeech||'')} headword={group.headword} interfaceLanguage='en' contentLanguage='nl' part='summary' open={formsOpen} onToggle={()=>setFormsOpen(v=>!v)} id='audit-forms'/></ProductionArticleReading>{group.meanings.slice(0,3).map(m=><article key={m.entryId} data-meaning={m.entryId} style={{maxWidth:760,margin:'0 auto 20px',padding:20,border:'1px solid #aaa',borderRadius:16}}><ProductionArticleReading>
 {m.definition&&<ArticleContentNode node={trim(m.definition)} lead interfaceLanguage="en" contentLanguage="nl" translationLanguage="en" translationVisible={translation!=='off'}/>}
 <ArticleSenseRelations relation={lexicalRelationDetail(m.wordDetails)} interfaceLanguage="en" contentLanguage="nl"/>
 <ArticleMeaningDetails definition={m.definition?trim(m.definition):null} details={m.details.map(trim)} interfaceLanguage="en" contentLanguage="nl" translationLanguage="en" translationVisible={translation!=='off'}/>
 </ProductionArticleReading></article>)}</>}
 </main>;
}
