"use client";

import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { InterfaceCatalogBoundary } from "@/components/system/InterfaceCatalogBoundary";
import { useInterfaceLanguage } from "@/lib/i18n/useInterfaceLanguage";
import { getUiMessages } from "@/lib/uiMessages";
import {
  maintenanceCheckInterval,
  maintenanceEndedEvent,
  maintenanceHintEvent,
  maintenanceStatusPath,
  parseMaintenanceStatus,
  type MaintenanceStatus,
} from "@/lib/maintenance/status";

type ScheduledNotice = Extract<MaintenanceStatus, { phase: "scheduled" }>;
const NoticeContext = createContext<ScheduledNotice | null>(null);

export function useMaintenanceNotice() {
  return useContext(NoticeContext);
}

function MaintenanceScreen() {
  const dialog = useRef<HTMLDialogElement>(null);
  const language = useInterfaceLanguage();
  const copy = getUiMessages(language).maintenance;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="maintenance-screen"
      aria-labelledby="maintenance-title"
      aria-describedby="maintenance-wait maintenance-return"
      onCancel={event => event.preventDefault()}
      onKeyDown={event => event.stopPropagation()}
      onKeyUp={event => event.stopPropagation()}
    >
      <BrandLogo className="maintenance-brand" accentClassName="maintenance-accent" />
      <div className="maintenance-wait">
        <div className="maintenance-icon"><RefreshCw size={22} aria-hidden="true" /></div>
        <h1 id="maintenance-title">{copy.activeTitle}</h1>
        <p id="maintenance-wait">{copy.activeWait}</p>
        <p id="maintenance-return">{copy.activeReturn}</p>
      </div>
    </dialog>
  );
}

export function MaintenanceBoundary({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<MaintenanceStatus>({ phase: "available" });

  useEffect(() => {
    const lifetime = new AbortController();
    let checking = false;
    let active = false;
    let expiryTimer: number | undefined;

    async function check() {
      if (checking || document.hidden) return;
      checking = true;
      const request = new AbortController();
      const abort = () => request.abort();
      lifetime.signal.addEventListener("abort", abort);
      const timeout = window.setTimeout(abort, 8_000);
      try {
        const response = await fetch(maintenanceStatusPath, {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) return;
        const next = parseMaintenanceStatus(await response.json());
        if (lifetime.signal.aborted || !next) return;

        const recovered = active && next.phase !== "active";
        active = next.phase === "active";
        if (recovered) window.dispatchEvent(new Event(maintenanceEndedEvent));
        window.clearTimeout(expiryTimer);
        if (next.phase !== "scheduled") {
          setStatus(next);
          return;
        }

        const serverTime = Date.parse(response.headers.get("date") ?? "");
        const remaining = next.expiresAt - (Number.isFinite(serverTime) ? serverTime : Date.now());
        if (remaining <= 0) {
          setStatus({ phase: "available" });
          return;
        }

        setStatus(next);
        if (remaining <= 2_147_483_647) {
          expiryTimer = window.setTimeout(() => {
            setStatus({ phase: "available" });
          }, remaining);
        }
      } catch {
        // A failed check cannot switch maintenance on or off.
      } finally {
        window.clearTimeout(timeout);
        lifetime.signal.removeEventListener("abort", abort);
        checking = false;
      }
    }

    void check();
    const interval = window.setInterval(check, maintenanceCheckInterval);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    window.addEventListener(maintenanceHintEvent, check);
    return () => {
      lifetime.abort();
      window.clearInterval(interval);
      window.clearTimeout(expiryTimer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      window.removeEventListener(maintenanceHintEvent, check);
    };
  }, []);

  return (
    <NoticeContext.Provider value={status.phase === "scheduled" ? status : null}>
      {children}
      {status.phase === "active" && (
        <InterfaceCatalogBoundary>
          <MaintenanceScreen />
        </InterfaceCatalogBoundary>
      )}
    </NoticeContext.Provider>
  );
}
