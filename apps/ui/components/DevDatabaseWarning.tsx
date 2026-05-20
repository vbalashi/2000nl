"use client";

import React from "react";

type HealthPayload = {
  status?: "ok" | "warning";
  database?: {
    target?: string;
  };
  checks?: Record<
    string,
    {
      status?: "ok" | "warning";
      message?: string;
    }
  >;
};

export function DevDatabaseWarning() {
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch("/api/health?deep=1", { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as HealthPayload | null;
        if (cancelled || !payload || payload.status !== "warning") return;

        const warning = Object.values(payload.checks ?? {}).find(
          (check) => check.status === "warning",
        );
        setMessage(
          warning?.message ??
            "Development database contract check returned a warning.",
        );
      } catch (error) {
        if (cancelled) return;
        setMessage(
          `Development database contract check failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!message) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mx-auto max-w-6xl">
        <strong className="font-semibold">Dev database warning:</strong>{" "}
        <span>{message}</span>
      </div>
    </div>
  );
}
