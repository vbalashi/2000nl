'use client';
import React from 'react';
import s from './sharedPublicationRow.module.css';
/** One presentation for shared groups and collections, owned or received. */
export function SharedPublicationRow({name,icon,metadata,actions,menu,subscriberCount,onOpen,tableRow=false}:{name:string;icon:React.ReactNode;metadata:React.ReactNode;actions?:React.ReactNode;menu:React.ReactNode;subscriberCount?:React.ReactNode;onOpen:()=>void;tableRow?:boolean}) {
 const Root=tableRow?'div':'article';
 return <Root className={`${s.row} ${subscriberCount!==undefined?s.counted:''}`} role={tableRow?'row':undefined}>
  <div className={s.identity} role={tableRow?'cell':undefined}><span className={s.icon}>{icon}</span><div className={s.copy}><button type="button" onClick={onOpen}>{name}</button><div className={s.metadata}>{metadata}</div></div></div>
  {subscriberCount!==undefined&&<span className={s.count} role={tableRow?'cell':undefined}>{subscriberCount}</span>}
  <div className={s.actions} role={tableRow?'cell':undefined}>{actions&&<div className={s.secondaryActions}>{actions}</div>}<div className={s.menu}>{menu}</div></div>
 </Root>;
}

export function SharedPublicationHeader({name,subscribers,actions}:{name:string;subscribers:string;actions:string}) {
 return <div className={`${s.header} ${s.counted}`} role="row"><span role="columnheader">{name}</span><span role="columnheader">{subscribers}</span><span className={s.actionsHeading} role="columnheader">{actions}</span></div>;
}
