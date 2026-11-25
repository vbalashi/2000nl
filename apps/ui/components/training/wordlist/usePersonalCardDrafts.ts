"use client";

import {useEffect, useState} from "react";
import type {InitialPersonalSense, PersonalHeader} from "./PersonalDictionaryEntryDraft";

export type PersonalCardDraft = {
  sessionKey: string;
  word: string;
  definition: string;
  partOfSpeech: string | null;
  anchorEntryId?: string;
  article?: PersonalHeader["article"];
  kind?: PersonalHeader["kind"];
  initialSenses?: InitialPersonalSense[];
  dirty?: boolean;
  headerDirty?: boolean;
};

export function hasDraftChanges(draft: PersonalCardDraft) {
  return !draft.anchorEntryId || !!draft.headerDirty || !!draft.initialSenses?.some(sense => !sense.entryId || sense.dirty);
}

function keepDraft(draft: PersonalCardDraft) {
  return hasDraftChanges(draft) && !!(draft.word.trim() || draft.definition.trim() || draft.dirty || draft.partOfSpeech);
}

type Shelf = {scope:string; drafts:PersonalCardDraft[]; selected:string|null};

export function usePersonalCardDrafts(userId:string, language:string) {
  const scope = JSON.stringify([userId, language]);
  const storageKey = "2000nl.personal-card-drafts.v1." + scope;
  const [shelf, setShelf] = useState<Shelf>({scope:"", drafts:[], selected:null});
  useEffect(() => {
    let drafts:PersonalCardDraft[] = [];
    try {
      const stored:unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(stored)) drafts = stored.filter(d => d && typeof d.sessionKey==="string" && typeof d.word==="string" && typeof d.definition==="string" && !d.anchorEntryId);
    } catch { /* Browser storage may be unavailable. */ }
    setShelf({scope, drafts, selected:null});
  }, [scope,storageKey]);
  useEffect(() => {
    if (shelf.scope!==scope) return;
    // Edits to existing entries can contain material requiring a fresh authorized read.
    const local = shelf.drafts.filter(d => !d.anchorEntryId && keepDraft(d));
    try {
      if (local.length) sessionStorage.setItem(storageKey, JSON.stringify(local));
      else sessionStorage.removeItem(storageKey);
    } catch { /* Drafts remain available in the open library. */ }
  }, [shelf,scope,storageKey]);

  const drafts = shelf.scope===scope ? shelf.drafts : [];
  const active = drafts.find(d=>d.sessionKey===shelf.selected) ?? null;
  function open(draft:PersonalCardDraft) {
    setShelf(current=>{
      if(current.scope!==scope) return current;
      const retained = current.drafts.filter(d=>d.sessionKey===draft.sessionKey || keepDraft(d));
      const existing = retained.some(d=>d.sessionKey===draft.sessionKey);
      return {...current,drafts:existing ? retained : [draft,...retained],selected:draft.sessionKey};
    });
  }
  function update(key:string, patch:Partial<PersonalCardDraft>) {
    setShelf(current=>current.scope!==scope ? current : {...current,drafts:current.drafts.map(d=>d.sessionKey===key ? {...d,...patch} : d)});
  }
  function remove(key:string) {
    setShelf(current=>current.scope!==scope ? current : {...current,drafts:current.drafts.filter(d=>d.sessionKey!==key),selected:current.selected===key ? null : current.selected});
  }
  return {drafts, active, open, update, remove};
}
