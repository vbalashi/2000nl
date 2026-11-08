'use client';
import React from 'react';
import {parseRecentLibraryScopes,rememberLibraryScope,type RecentLibraryScope} from './recentLibraryScopes';
/** Private, device-local history; account changes never expose the previous account's entries. */
export function useRecentLibraryScopes(userId:string){
 const [state,setState]=React.useState<{owner:string;items:RecentLibraryScope[]}|null>(null);
 React.useEffect(()=>{let items:RecentLibraryScope[]=[];try{items=parseRecentLibraryScopes(localStorage.getItem(`2000nl:library-recent:${userId}`));}catch{}setState({owner:userId,items});},[userId]);
 React.useEffect(()=>{if(state?.owner!==userId)return;try{localStorage.setItem(`2000nl:library-recent:${userId}`,JSON.stringify(state.items));}catch{}},[state,userId]);
 const remember=React.useCallback((scope:RecentLibraryScope)=>setState(previous=>{
  if(previous?.owner!==userId)return previous;
  const next=rememberLibraryScope(previous.items,scope);
  return JSON.stringify(next)===JSON.stringify(previous.items)?previous:{owner:userId,items:next};
 }),[userId]);
 return {items:state?.owner===userId?state.items:[],ready:state?.owner===userId,remember};
}
