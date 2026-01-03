"use client";

import { useEffect } from "react";

export function SystemThemeEffect() {
  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      root.classList.toggle("dark", mediaQuery.matches);
    };

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/a5e2db1f-40e6-4b7f-aa6f-678a92a187d8", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "baseline",
        hypothesisId: "H1",
        location: "components/theme/SystemThemeEffect.tsx:13",
        message: "SystemThemeEffect mounted",
        data: {
          pathname: window.location.pathname,
          mediaMatches: mediaQuery.matches,
          hadDarkClass: root.classList.contains("dark"),
          styleSheets: document.styleSheets?.length ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

    apply();

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/a5e2db1f-40e6-4b7f-aa6f-678a92a187d8", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "baseline",
        hypothesisId: "H2",
        location: "components/theme/SystemThemeEffect.tsx:35",
        message: "Theme applied from system preference",
        data: {
          pathname: window.location.pathname,
          mediaMatches: mediaQuery.matches,
          hasDarkClass: root.classList.contains("dark"),
          bodyBg: window.getComputedStyle(document.body).backgroundColor,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

    const onResourceError = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const src =
        target && "src" in target ? String((target as any).src ?? "") : "";
      const href =
        target && "href" in target ? String((target as any).href ?? "") : "";

      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/a5e2db1f-40e6-4b7f-aa6f-678a92a187d8", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "baseline",
          hypothesisId: "H3",
          location: "components/theme/SystemThemeEffect.tsx:67",
          message: "Resource load error",
          data: { pathname: window.location.pathname, tag, src, href },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion agent log
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/a5e2db1f-40e6-4b7f-aa6f-678a92a187d8", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "baseline",
          hypothesisId: "H4",
          location: "components/theme/SystemThemeEffect.tsx:87",
          message: "Unhandled promise rejection",
          data: {
            pathname: window.location.pathname,
            reason: String((event as any).reason ?? ""),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion agent log
    };

    window.addEventListener("error", onResourceError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    mediaQuery.addEventListener("change", apply);
    return () => {
      window.removeEventListener("error", onResourceError, true);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      mediaQuery.removeEventListener("change", apply);
    };
  }, []);

  return null;
}

