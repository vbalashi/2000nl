'use client';
import React,{useRef,useState} from 'react';
import {SharedLabelGroups} from '@/components/library/sharing/SharedLabelGroups';
import {ReceivedCollections} from '@/components/library/sharing/ReceivedCollections';
import {SearchField} from '@/components/practice/ui/SearchField';
import theme from '@/components/practice/ui/practiceTheme.module.css';
import organization from '@/components/library/organization/organization.module.css';
import filters from '@/components/practice/library/libraryFilters.module.css';
import overlays from '@/components/practice/library/libraryOverlays.module.css';
import bulk from '@/components/training/wordlist/wordsBulk.module.css';
import language from '@/components/practice/settings/languagePicker.module.css';
import source from '@/components/training/pilot/trainingSourcePicker.module.css';
/** Actual field styles, including enclosing specificity, without database/auth fixtures. */
export function SearchBoundaryPreview(){const searchInputRef=useRef<HTMLInputElement>(null);const [mode,setMode]=useState("light");return <main className={theme.theme} data-colour-mode={mode} data-testid="search-boundary-preview" style={{padding:24}}>
 <h1>Search boundary regression fixtures</h1><button onClick={()=>setMode("light")}>Use light theme</button><button onClick={()=>setMode("dark")}>Use dark theme</button>
 <div className={organization.sharedWorkspace} data-testid="received-row-preview">
 <SharedLabelGroups userId="fixture" locale="en" groups={[{labelId:'group',name:'333',collectionCount:0}]} view="received" onChanged={()=>{}} onOpenCollection={()=>{}}/>
 <ReceivedCollections userId="fixture" locale="en" active={false} embedded onOpen={()=>{}} onAdd={()=>{}} selection={{query:'',sort:'recent',searchInputRef}} catalogOverride={{status:'ready',revision:1,nextCursor:null,loadingMore:false,refresh:async()=>{},loadMore:async()=>{},collections:[{id:'collection',name:'firstXXX',createdAt:'2026-01-01',addedAt:'2026-01-01',ownerUserId:'author',role:'viewer',itemCount:7,labelIds:[],directSubscription:true,groups:[]}]}}/>
 </div>
 {['Words','Collections','Shared','Label assignment'].map(name=><section key={name} className={name==='Label assignment'?organization.editor:organization.organizer}><h2>{name}</h2><div className={organization.assignmentToolbar}><SearchField><input aria-label={name}/></SearchField></div></section>)}
 <section><h2>Other search surfaces</h2>
 <label className={organization.search}><input aria-label="Label tree"/></label>
 <label className={filters.search}><input aria-label="Library filter"/></label>
 <div className={overlays.sheet}><label className={overlays.search}><input aria-label="Collection membership"/></label></div>
 <label className={bulk.search}><input aria-label="Bulk collections"/></label>
 <div className={language.picker}><input aria-label="Languages"/></div>
 <div className={`${source.searchReveal} ${source.searchOpen}`}><input aria-label="Training sources"/></div>
 </section>
 </main>;}
