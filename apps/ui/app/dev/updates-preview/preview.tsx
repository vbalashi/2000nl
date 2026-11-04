'use client';
import React,{useState} from 'react';
import {AppReleaseContext} from '@/components/releases/AppReleaseContext';
import {ReleaseBanner,ReleaseUpdatesSection} from '@/components/releases/ReleaseUpdates';
import type {AppReleaseState} from '@/components/releases/useAppRelease';
import {SettingsOptions} from '@/components/practice/settings/SettingsLayout';
import theme from '@/components/practice/ui/practiceTheme.module.css';
const installed={version:'1.0',commit:'a'.repeat(40),commitShort:'aaaaaaaa',buildTimestamp:'2026-11-01T08:00:00Z',formattedBuildTimestamp:'',display:'v1.0'};
const noop=()=>{};
/** Synthetic release state, real production banner/Settings components. Never reloads or deploys. */
export function UpdatesPreview(){
 const [mode,setMode]=useState<'light'|'dark'>('light'),[banner,setBanner]=useState(true);
 const state:AppReleaseState={installed,release:{schemaVersion:1,build:{...installed,version:'1.1',commit:'b'.repeat(40)},announcement:{id:'interface-preview',publishedAt:'2026-11-04T08:00:00Z',locale:'en',title:'A calmer, more consistent interface',summary:'Clearer settings, matching collection controls and progress indicators that adapt to your training session.'}},status:'ready',updateAvailable:true,unread:true,attention:true,banner,unsafe:false,development:false,check:async()=>null,update:async()=>{},dismiss:()=>setBanner(false),markRead:noop};
 return <main className={theme.theme} data-colour-mode={mode} style={{minHeight:'100dvh',background:'var(--practice-canvas)',color:'var(--practice-text)',fontFamily:'var(--practice-font-ui)',padding:'24px 0'}}>
  <div style={{maxWidth:980,margin:'0 auto',padding:'0 24px 16px'}}><SettingsOptions label="Preview colour mode" value={mode} onChange={setMode} items={[{id:'light',label:'Light'},{id:'dark',label:'Dark'}]}/></div>
  <AppReleaseContext.Provider value={state}><ReleaseBanner language="en"/><div style={{maxWidth:620,margin:'32px auto',padding:'0 20px'}}><ReleaseUpdatesSection language="en"/></div></AppReleaseContext.Provider>
 </main>;
}
