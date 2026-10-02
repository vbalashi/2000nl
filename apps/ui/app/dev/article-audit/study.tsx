'use client';
import React from 'react';
import {useSearchParams} from 'next/navigation';
import {ProductionArticleReading} from '@/components/practice/article/ProductionArticleReading';
import {ArticleContentNode,ArticleMeaningDetails} from '@/components/practice/article/ArticleContent';
import {ArticleSenseRelations} from '@/components/practice/article/ArticleWordDetails';
import {lexicalRelationDetail} from '@/components/practice/article/wordDetailsPresentation';
import {accountTextSizeStyles} from '@/lib/reading/textScale';
import {goedGroups} from '../session-builder-prototype/GoedLibraryPreview';
import type {PlatformV2SenseContentNode} from '@/lib/platform/projections/platformV2SenseContent';
import './study.css';
export function Audit(){
 const q=useSearchParams();const variant=q.get('variant')||'baseline';const translation=q.get('translation')||'off';
 const size=q.get('size') as 'normal'|'large'|'largest'|'extra'||'normal';
 const group=goedGroups.find(g=>g.partOfSpeech==='adjective')||goedGroups[1];
 const trim=(n:PlatformV2SenseContentNode):PlatformV2SenseContentNode=>({...n,translation:translation==='partial'&&n.kind==='example'?undefined:n.translation,children:n.children.map(trim)});
 return <main data-audit={variant} data-account-palette={q.get('palette')||'graphite'} className={q.get('dark')==='1'?'dark':''} style={{...accountTextSizeStyles(size),padding:16}}>
 <h1>goed — {variant} · {size} · {translation}</h1>
 {group.meanings.slice(0,3).map(m=><article key={m.entryId} data-meaning={m.entryId} style={{maxWidth:760,margin:'0 auto 20px',padding:20,border:'1px solid #aaa',borderRadius:16}}><ProductionArticleReading>
 {m.definition&&<ArticleContentNode node={trim(m.definition)} lead interfaceLanguage="en" contentLanguage="nl" translationLanguage="en" translationVisible={translation!=='off'}/>}
 <ArticleSenseRelations relation={lexicalRelationDetail(m.wordDetails)} interfaceLanguage="en" contentLanguage="nl"/>
 <ArticleMeaningDetails definition={m.definition?trim(m.definition):null} details={m.details.map(trim)} interfaceLanguage="en" contentLanguage="nl" translationLanguage="en" translationVisible={translation!=='off'}/>
 </ProductionArticleReading></article>)}
 </main>;
}
