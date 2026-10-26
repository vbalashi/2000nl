"use client";
import { useUserEventHints } from "@/lib/events/userEventHints";
import React from "react";
import {
  cardSpacingRepository,
  type CardSpacingRepository,
} from "@/lib/preferences/cardSpacingRepository";
import { cardSpacingStyles, type CardSpacing } from "./cardSpacing";
import theme from "./practiceTheme.module.css";
type Status = "idle" | "saving" | "saved" | "error";
type AccountSpacing = {
  spacing: CardSpacing;
  loadStatus: "loading" | "ready" | "error";
  saveStatus: Status;
  save: (spacing: CardSpacing) => Promise<void>;
  reload: () => void;
};
const Context = React.createContext<AccountSpacing | null>(null);
export const useAccountCardSpacing = () => React.useContext(Context);

/** Card spacing alone belongs here; palette and text-size preferences retain their owners. */
export function AccountCardSpacingProvider(props: {
  userId: string;
  repository?: CardSpacingRepository;
  children: React.ReactNode;
}) {
  return <AccountSpacingSession key={props.userId} {...props} />;
}
function AccountSpacingSession({
  userId,
  repository = cardSpacingRepository,
  children,
}: {
  userId: string;
  repository?: CardSpacingRepository;
  children: React.ReactNode;
}) {
  const [spacing, setSpacing] = React.useState<CardSpacing>("balanced");
  const [loadStatus, setLoadStatus] =
    React.useState<AccountSpacing["loadStatus"]>("loading");
  const [saveStatus, setSaveStatus] = React.useState<Status>("idle");
  const [attempt, setAttempt] = React.useState(0);
  const alive = React.useRef(false),
    pending = React.useRef(false);
  const refreshRevision = React.useRef(0);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  React.useEffect(() => {
    let cancelled = false;
    const version = ++refreshRevision.current;
    setLoadStatus("loading");
    void repository
      .load(userId)
      .then((value) => {
        if (!cancelled && version === refreshRevision.current) {
          setSpacing(value);
          setLoadStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled && version === refreshRevision.current) setLoadStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [repository, userId, attempt]);
  const flushHints = useUserEventHints(userId, ["account.changed"], async () => {
    const version = ++refreshRevision.current;
    const value = await repository.load(userId);
    if (!alive.current || version !== refreshRevision.current || pending.current) return;
    setSpacing(value);

    setLoadStatus("ready");
  }, () => pending.current);

  const save = async (value: CardSpacing) => {
    if (loadStatus !== "ready" || pending.current) return;
    refreshRevision.current++;
    pending.current = true;
    setSpacing(value);
    setSaveStatus("saving");
    try {
      await repository.save(userId, value);
      if (alive.current) setSaveStatus("saved");
    } catch {
      if (alive.current) setSaveStatus("error");
    } finally {
      pending.current = false;
      flushHints();
    }
  };
  return (
    <Context.Provider
      value={{
        spacing,
        loadStatus,
        saveStatus,
        save,
        reload: () => setAttempt((current) => current + 1),
      }}
    >
      <div
        className={`${theme.theme} contents`}
        data-colour-mode="app"
        data-card-spacing={spacing}
        style={cardSpacingStyles(spacing)}
      >
        {children}
      </div>
    </Context.Provider>
  );
}
