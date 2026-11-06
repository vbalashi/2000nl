'use client';
import React, {useEffect,useState,type ReactNode} from 'react';
import {initializeInterfaceSnapshot} from '@/lib/i18n/clientSnapshot';
/** Do not mount preference readers until runtime locales have been validated. */
export function InterfaceCatalogBoundary({children,fallback=null}:{children:ReactNode;fallback?:ReactNode}) {
  const [ready,setReady]=useState(false);
  useEffect(()=>{let active=true;void initializeInterfaceSnapshot().then(()=>{if(active)setReady(true);});return()=>{active=false;};},[]);
  return <>{ready?children:fallback}</>;
}
