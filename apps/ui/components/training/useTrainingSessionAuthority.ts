"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTrainingOperationScope } from "./useTrainingOperationScope";
import type { TrainingOperation } from "@/lib/training/trainingOperationScope";
import { subscribeTrainingSessionInvalidation, subscribeTrainingSessionOwnerInvalidation } from "@/lib/training/sessionResumeStore";

export type TrainingAuthorityRead =
  | { kind: "active"; commit?:()=>void }
  | { kind: "superseded" }
  | { kind: "replan"; revision: number; reconcile: () => Promise<boolean>; commit: () => void };

type Owner = { sessionId: string | null; userId: string; operation:TrainingOperation };

/** Owns read-only authority and its recovery operation, independently of content.
 * A server ID is bound explicitly; rendering new defaults never replaces it. */
export function useTrainingSessionAuthority(input: {
  userId: string;
  read: (sessionId: string) => Promise<TrainingAuthorityRead>;
  onSuperseded: () => void;
}) {
  const operations=useTrainingOperationScope(input.userId);
  const adapter = useRef(input);
  useLayoutEffect(() => { adapter.current = input; });
  const owner = useRef<Owner>({sessionId:null,userId:input.userId,operation:operations.capture("owner")});
  const [ownerToken,setOwnerToken] = useState(owner.current);
  const blocked = useRef(false);
  const pendingReplan = useRef<{owner:Owner; revision:number; promise:Promise<boolean>} | null>(null);
  const [checking, setChecking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const owns = useCallback((expected: Owner) => expected.operation.isCurrent() && owner.current === expected && expected.userId === adapter.current.userId, []);
  const reset = useCallback((sessionId: string | null) => {
    operations.reset();
    owner.current = {sessionId,userId:adapter.current.userId,operation:operations.capture("owner")};
    setOwnerToken(owner.current);
    pendingReplan.current = null;
    blocked.current = false;
    setChecking(false); setRefreshing(false);
  }, [operations]);
  const invalidate = useCallback((expected: Owner) => {
    if (!owns(expected)) return;
    operations.cancel("validation");
    blocked.current=true; setRefreshing(false); setChecking(true);
  }, [owns,operations]);
  const supersede = useCallback((expected: Owner) => {
    if (!owns(expected) || !expected.sessionId) return;
    // Retire before notifying; a re-entrant callback cannot revive this owner.
    reset(null);
    adapter.current.onSuperseded();
  }, [owns, reset]);
  const validate = useCallback(async () => {
    const expected = owner.current;
    if (!expected.sessionId) return true;
    if (!owns(expected)) return false;
    const operation=operations.begin("validation");
    const current = () => owns(expected) && operation.isCurrent();
    setChecking(true); setRefreshing(!blocked.current);
    try {
      const result = await adapter.current.read(expected.sessionId);
      if (!current()) return false;
      setRefreshing(false);
      if (result.kind === "superseded") { supersede(expected); return false; }
      if (result.kind === "replan") {
        let pending = pendingReplan.current;
        if (!pending || pending.owner !== expected || pending.revision !== result.revision) {
          pending = {owner:expected,revision:result.revision,promise:result.reconcile()};
          pendingReplan.current = pending;
        }
        let loaded: boolean;
        try { loaded = await pending.promise; }
        finally { if (pendingReplan.current === pending) pendingReplan.current=null; }
        if (!current()) return false;
        if (!loaded) { blocked.current=true; return false; }
        result.commit();
      }
      if(result.kind==="active")result.commit?.();
      blocked.current=false; setChecking(false);
      return true;
    } catch {
      if (current()) { blocked.current=true; setRefreshing(false); setChecking(true); }
      return false;
    }
  }, [owns, supersede,operations]);
  return {checking, refreshing, ownerToken, reset, validate, owns, invalidate, supersede};
}

type Authority = ReturnType<typeof useTrainingSessionAuthority>;

/** The same event policy can be installed for any family adapter. */
export function useTrainingSessionAuthorityEvents(authority: Authority, input: {
  userId: string;
  sessionId: string | null;
  visible: boolean;
  returned: boolean;
}) {
  const {ownerToken, owns, validate, invalidate, supersede} = authority;
  useEffect(() => {
    if (!input.sessionId) return;
    const expected = ownerToken;
    const onReturn = () => { if (owns(expected)) void validate(); };
    const onVisibility = () => { if (!document.hidden) onReturn(); };
    const onOffline = () => invalidate(expected);
    window.addEventListener("focus",onReturn); window.addEventListener("online",onReturn);
    window.addEventListener("pageshow",onReturn); window.addEventListener("offline",onOffline);
    document.addEventListener("visibilitychange",onVisibility);
    const unsubscribe = subscribeTrainingSessionInvalidation(input.userId,onReturn);
    const unsubscribeOwner = subscribeTrainingSessionOwnerInvalidation(() => supersede(expected));
    return () => {
      window.removeEventListener("focus",onReturn); window.removeEventListener("online",onReturn);
      window.removeEventListener("pageshow",onReturn); window.removeEventListener("offline",onOffline);
      document.removeEventListener("visibilitychange",onVisibility);
      unsubscribe(); unsubscribeOwner();
    };
  }, [input.userId,input.sessionId,ownerToken,owns,validate,invalidate,supersede]);
  useEffect(() => {
    if (!input.sessionId || !input.visible) return;
    const expected = ownerToken;
    const timer = window.setInterval(() => { if (!document.hidden && owns(expected)) void validate(); },20_000);
    return () => window.clearInterval(timer);
  }, [input.sessionId,input.visible,ownerToken,owns,validate]);
  useEffect(() => {
    if (input.sessionId && input.returned) void validate();
  }, [input.sessionId,input.returned,validate]);
}
