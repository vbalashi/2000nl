'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import HomePage from '../HomePage';
import {captureShareInvitation,forgetShareInvitation} from '@/lib/collections/sharing/shareInvitationIntake';
export function ShareLanding(){
 const started=useRef(false);
 const [captured,setCaptured]=useState<{code:string|null|undefined}|null>(null);
 useLayoutEffect(()=>{
  if(started.current)return;started.current=true;
  // A denied storage getter must not prevent URL scrubbing or in-memory preview.
  const storage={getItem:(k:string)=>window.sessionStorage.getItem(k),setItem:(k:string,v:string)=>window.sessionStorage.setItem(k,v),removeItem:(k:string)=>window.sessionStorage.removeItem(k)};
  const url=new URL(window.location.href),resume=url.pathname==='/share'&&!url.hash&&!url.search;
  const code=captureShareInvitation(window.location.href,window.location.origin,storage,path=>window.history.replaceState(window.history.state,'',path));
  if(!code&&!resume){forgetShareInvitation(storage);window.history.replaceState(window.history.state,'','/');}
  setCaptured({code:code??(resume?undefined:null)});
 },[]);
 return captured?<HomePage invitationCode={captured.code}/>:null;
}
