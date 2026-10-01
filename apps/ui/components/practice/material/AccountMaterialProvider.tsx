"use client";
import React from "react";
import {
  fetchAccountMaterialPreferences,
  saveAccountMaterialPreferences,
} from "@/lib/training/material/client";
import {
  parseMaterialPreferences,
  type MaterialPreferences,
  type MaterialPreferencesSnapshot,
} from "@/lib/training/material/model";
import { fetchAvailableLearningLanguages } from "@/lib/training/listService";
import { withPreferenceDeadline } from "@/lib/preferences/requestDeadline";
import type { AvailableLearningLanguage } from "@/lib/types";
type Status = "loading" | "ready" | "error";
type SaveStatus = "idle" | "saving" | "saved" | "conflict" | "error";
export type MaterialRepository = {
  load: typeof fetchAccountMaterialPreferences;
  save: typeof saveAccountMaterialPreferences;
  languages: (userId: string) => Promise<AvailableLearningLanguage[]>;
};
const defaultRepository: MaterialRepository = {
  load: fetchAccountMaterialPreferences,
  save: saveAccountMaterialPreferences,
  languages: (userId) =>
    withPreferenceDeadline((signal) =>
      fetchAvailableLearningLanguages(userId, signal),
    ),
};
type AccountMaterial = {
  userId: string;
  status: Status;
  saveStatus: SaveStatus;
  snapshot: MaterialPreferencesSnapshot | null;
  catalog: AvailableLearningLanguage[];
  reload: () => void;
  change: (
    update: (document: MaterialPreferences) => MaterialPreferences | null,
  ) => Promise<"saved" | "conflict" | "error" | "unavailable">;
};
const Context = React.createContext<AccountMaterial | null>(null);
export const useAccountMaterial = () => React.useContext(Context);
/** Single account-owned snapshot shared by Settings and material selectors. */
export function AccountMaterialProvider(props: {
  userId: string;
  children: React.ReactNode;
  repository?: MaterialRepository;
}) {
  if (process.env.NEXT_PUBLIC_TRAINING_PRESENTATION_V1 !== "true")
    return <>{props.children}</>;
  return <AccountMaterialSession key={props.userId} {...props} />;
}
function AccountMaterialSession({
  userId,
  children,
  repository = defaultRepository,
}: {
  userId: string;
  children: React.ReactNode;
  repository?: MaterialRepository;
}) {
  const [status, setStatus] = React.useState<Status>("loading");
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [snapshot, setSnapshot] =
    React.useState<MaterialPreferencesSnapshot | null>(null);
  const [catalog, setCatalog] = React.useState<AvailableLearningLanguage[]>([]);
  const current = React.useRef<MaterialPreferencesSnapshot | null>(null);
  const generation = React.useRef(0),
    alive = React.useRef(false),
    pending = React.useRef(false);
  const invalidateReads = React.useCallback(() => ++generation.current, []);
  const load = React.useCallback(async () => {
    if (pending.current) return;
    const attempt = invalidateReads();
    setStatus("loading");
    try {
      const [document, languages] = await Promise.all([
        repository.load(userId),
        repository.languages(userId),
      ]);
      if (!alive.current || generation.current !== attempt) return;
      current.current = document;
      setSnapshot(document);
      setCatalog(languages);
      setSaveStatus("idle");
      setStatus("ready");
    } catch {
      if (alive.current && generation.current === attempt) setStatus("error");
    }
  }, [repository, userId, invalidateReads]);
  React.useEffect(() => {
    alive.current = true;
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive.current = false;
      invalidateReads();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, invalidateReads]);
  const change: AccountMaterial["change"] = async (update) => {
    const stored = current.current;
    if (status !== "ready" || !stored || pending.current) return "unavailable";
    // Clone before handing the document to an updater; a failed save cannot mutate it.
    const next = update(structuredClone(stored.document));
    if (!next || !parseMaterialPreferences(next)) return "unavailable";
    pending.current = true;
    setSaveStatus("saving");
    const attempt = invalidateReads();
    try {
      const result = await repository.save(userId, stored.revision, next);
      if (!alive.current || generation.current !== attempt)
        return "unavailable";
      current.current = result.snapshot;
      setSnapshot(result.snapshot);
      setSaveStatus(result.kind);
      return result.kind;
    } catch {
      if (alive.current && generation.current === attempt)
        setSaveStatus("error");
      return "error";
    } finally {
      pending.current = false;
    }
  };
  return (
    <Context.Provider
      value={{
        userId,
        status,
        saveStatus,
        snapshot,
        catalog,
        reload: () => {
          setSaveStatus("idle");
          void load();
        },
        change,
      }}
    >
      {children}
    </Context.Provider>
  );
}
