"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LabelsRequestError, requestLabels } from "@/lib/collections/labels/client";
import type { CollectionLabelOperation, CollectionLabelsSnapshot } from "@/lib/collections/labels/model";
import {useLabelOrganizationPlan} from '../sharing/useLabelOrganizationPlan';

/** Mounted under the account-keyed Library; old account responses never commit. */
export function usePersonalLabels(active: boolean, userId: string) {
  const [snapshot, setSnapshot] = useState<CollectionLabelsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const applyPlan=useCallback((next:CollectionLabelsSnapshot)=>{setSnapshot(next);setError(null);},[]);
  const audience=useLabelOrganizationPlan(userId,applyPlan);
  const controller = useRef<AbortController>();
  const writeLock = useRef(false);
  const mounted = useRef(true);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const refresh = useCallback(async () => {
    if (writeLock.current) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    try {
      const next = await requestLabels(request.signal, undefined, userId);
      if (!request.signal.aborted && mounted.current) { setSnapshot(next); setError(null); }
    } catch (failure) {
      if (!request.signal.aborted && mounted.current) setError(failure instanceof LabelsRequestError ? failure.code : "unavailable");
    } finally {
      if (!request.signal.aborted && mounted.current) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => { if (active) void refresh(); }, [active, refresh]);
  useEffect(() => {
    if (!active) return;
    const focused = () => { void refresh(); };
    window.addEventListener("focus", focused);
    return () => window.removeEventListener("focus", focused);
  }, [active, refresh]);
  const mutate = async (operation: CollectionLabelOperation) => {
    if (!latest.current || writeLock.current) return false;
    writeLock.current = true;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setBusy(true); setLoading(false); setError(null);
    try {
      // A create retry after an uncertain response must keep its original UUID.
      if (operation.type === "create" && latest.current.labels.some(label => label.id === operation.id)) {
        setError("conflict"); return false;
      }
      if(process.env.NEXT_PUBLIC_LABEL_SHARING_ENABLED==='true')return await audience.save(latest.current.revision,operation);
      const next = await requestLabels(request.signal, {expectedRevision: latest.current.revision, operation}, userId);
      if (mounted.current && !request.signal.aborted) { setSnapshot(next); return true; }
      return false;
    } catch (failure) {
      if (mounted.current && !request.signal.aborted) {
        setError(failure instanceof LabelsRequestError ? failure.code : "uncertain");
        // Reconcile once, but never automatically replay a write over a new revision.
        try {
          const next = await requestLabels(request.signal, undefined, userId);
          if (mounted.current && !request.signal.aborted) setSnapshot(next);
        } catch { /* Keep the prior snapshot and the actionable error. */ }
      }
      return false;
    } finally {
      writeLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  useEffect(()=>{if(audience.state.status==='failed'&&['label_audience_changed','label_catalog_conflict'].includes(audience.state.error??''))void refresh();},[audience.state.status,audience.state.error,refresh]);
  const planError=audience.state.error&&(audience.state.status==='failed'||audience.state.error==='storage')?['label_audience_changed','label_catalog_conflict'].includes(audience.state.error)?'conflict':audience.state.error==='storage'?'failed':'unavailable':null;
  return {snapshot, adoptSnapshot:applyPlan, error:error??planError, loading, busy:busy||['preparing','confirming'].includes(audience.state.status), refresh, mutate, audience};
}
