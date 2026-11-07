import {describe,it,expect} from 'vitest';
import {createLabelShareIntent} from '@/lib/collections/sharing/labelSharingClient';
import {readLabelSharingJournal,retainLabelSharingJournal,clearLabelSharingJournal} from '@/lib/collections/sharing/labelSharingJournal';

const first=createLabelShareIntent('owner',{operationId:'11111111-1111-4111-8111-111111111111',action:'open',labelId:'22222222-2222-4222-8222-222222222222',expectedRevision:0});
const second=createLabelShareIntent('owner',{...first.command,operationId:'33333333-3333-4333-8333-333333333333'});
const memory=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};};

describe('pending label sharing identity',()=>{
 it('restores only the same account and surface; a different operation cannot overwrite or clear an uncertain one',()=>{
  const store=memory();
  expect(retainLabelSharingJournal(store,'label',first)).toBe(true);
  expect(readLabelSharingJournal(store,'owner','label')).toEqual(first);
  expect(readLabelSharingJournal(store,'viewer','label')).toBeNull();
  expect(readLabelSharingJournal(store,'owner','other-label')).toBeNull();
  expect(retainLabelSharingJournal(store,'label',second)).toBe(false);
  clearLabelSharingJournal(store,'label',second);
  expect(readLabelSharingJournal(store,'owner','label')).toEqual(first);
  expect(retainLabelSharingJournal(store,'label',first)).toBe(true);
  clearLabelSharingJournal(store,'label',first);
  expect(readLabelSharingJournal(store,'owner','label')).toBeNull();
 });
 it('refuses to authorize sending when storage cannot persist the command',()=>{
  const store={...memory(),setItem:()=>{throw new Error('blocked');}};
  expect(retainLabelSharingJournal(store,'label',first)).toBe(false);
  expect(readLabelSharingJournal(store,'owner','label')).toBeNull();
 });
 it('does not overwrite corrupt pending data with a new mutation',()=>{
  const store={...memory(),getItem:()=>'{invalid'};
  expect(readLabelSharingJournal(store,'owner','label')).toBeNull();
  expect(retainLabelSharingJournal(store,'label',first)).toBe(false);
 });
});
