"use client";
import { useEffect, useRef } from "react";
import { requestPlatformV2LibraryTranslation } from "@/lib/platform/platformV2LibraryClient";
import { fetchTrainingSessionSnapshot } from "@/lib/training/selectionService";
import { translationBufferDepth } from "@/lib/translation/translationPreparationTiming";

type Member = { ordinal: number; entryId: string; consumedAt: string | null; unavailableAt: string | null; cardTypeId?: string };
export function selectTranslationBufferMembers(members: readonly Member[], currentOrdinal: number, depth: number) {
  const seen = new Set<string>();
  return [...members].sort((a, b) => a.ordinal - b.ordinal).filter(member => {
    if (member.ordinal <= currentOrdinal || member.consumedAt || member.unavailableAt || seen.has(member.entryId)) return false;
    seen.add(member.entryId); return true;
  }).slice(0, Math.max(0, Math.min(3, depth)));
}

/** Read and prepare only frozen members; never selects, consumes or grades. */
export function useLatchedTranslationBuffer(input: {
  ownerId: string; sessionId: string | null; generation?: number | null;
  currentEntryId?: string; currentOrdinal?: number; currentCardTypeId?: string;
  targetLanguageCode: string | null; additionalTargetLanguageCode?: string | null; members?: readonly Member[];
}) {
  const state = useRef({ scope: "", current: "", changedAt: 0, paceMs: 30_000, attempted: new Set<string>() });
  const membersKey = JSON.stringify(input.members ?? null);
  useEffect(() => {
    const { ownerId, sessionId } = input;
    const activeLanguage = (language?: string | null) => language && language !== "off" ? language : null;
    const primary = activeLanguage(input.targetLanguageCode);
    const secondary = activeLanguage(input.additionalTargetLanguageCode);
    const additional = secondary !== primary ? secondary : null;
    if (!sessionId || !input.currentEntryId || (!primary && !additional)) return;
    const scope = JSON.stringify([ownerId, sessionId, input.generation ?? "legacy", primary, additional]);
    const now = Date.now();
    if (state.current.scope !== scope) state.current = { scope, current: "", changedAt: now, paceMs: 30_000, attempted: new Set() };
    const current = `${input.currentEntryId}:${input.currentCardTypeId ?? input.currentOrdinal ?? ""}`;
    if (state.current.current && state.current.current !== current) {
      state.current.paceMs = state.current.paceMs * 0.7 + Math.min(120_000, Math.max(5_000, now - state.current.changedAt)) * 0.3;
      state.current.changedAt = now;
    }
    state.current.current = current;
    const controller = new AbortController();
    void (async () => {
      const snapshot = input.members ? null : await fetchTrainingSessionSnapshot(ownerId, sessionId);
      if (controller.signal.aborted || (!input.members && (!snapshot || snapshot.sessionId !== sessionId || snapshot.runStatus === "superseded"))) return;
      const members = input.members ?? snapshot?.members ?? [];
      const ordinal = input.currentOrdinal ?? members.find(member => member.entryId === input.currentEntryId && (!input.currentCardTypeId || member.cardTypeId === input.currentCardTypeId))?.ordinal;
      if (ordinal === undefined) return;
      const prepareLanguage = async (targetLanguageCode: string, depth: number) => {
        const selected = selectTranslationBufferMembers(members, ordinal, depth);
        for (const member of selected) {
          if (controller.signal.aborted || state.current.scope !== scope) return;
          const key = JSON.stringify([targetLanguageCode, member.entryId]);
          if (state.current.attempted.has(key)) continue;
          state.current.attempted.add(key);
          if (state.current.attempted.size > 64) state.current.attempted.delete(state.current.attempted.values().next().value!);
          try {
            await requestPlatformV2LibraryTranslation({ entryId: member.entryId, targetLanguageCode, background: true, signal: controller.signal });
          } catch { /* Speculation never changes the visible card or learning state. */ }
        }
      };
      // Independent lanes: a slow primary must not postpone the next answer's
      // additional translation. Only the primary retains its adaptive buffer.
      await Promise.all([
        ...(primary ? [prepareLanguage(primary, translationBufferDepth(state.current.paceMs))] : []),
        ...(additional ? [prepareLanguage(additional, 1)] : []),
      ]);
    })().catch(() => undefined);
    return () => controller.abort();
    // Serialized membership avoids restarting on unrelated parent renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.ownerId, input.sessionId, input.generation, input.currentEntryId, input.currentOrdinal, input.currentCardTypeId, input.targetLanguageCode, input.additionalTargetLanguageCode, membersKey]);
}
