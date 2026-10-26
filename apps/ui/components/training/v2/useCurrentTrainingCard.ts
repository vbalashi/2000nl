"use client";
import { useLayoutEffect, useRef, useState } from "react";
import {
  acknowledgeCurrentTrainingCard,
  type CurrentTrainingCardTarget,
  type CurrentTrainingCardPermit,
  type CurrentTrainingCardContext,
} from "@/lib/platform/trainingCurrentCardClient";

type State = {
  key: string;
  status: "loading" | "ready" | "failed";
  permit?: CurrentTrainingCardPermit;
};

/** Only the mounted, ready current presentation acknowledges display. Prefetch never calls this hook. */
export function useCurrentTrainingCard(input: {
  userId: string;
  target: CurrentTrainingCardTarget | null;
  active: boolean;
}) {
  const enabled =
    process.env.NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED === "true";
  const key = JSON.stringify([input.userId, input.target]);
  const [state, setState] = useState<State>({ key: "", status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(state);
  latest.current = state;
  const controller = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    controller.current?.abort();
  }, [key, input.active, attempt]);
  useLayoutEffect(() => {
    if (!enabled || !input.active || !input.target) return;
    const request = new AbortController();
    controller.current = request;
    let expiration: ReturnType<typeof setTimeout> | undefined;
    const target: CurrentTrainingCardTarget = JSON.parse(
      JSON.stringify(input.target),
    );
    const userId = input.userId;
    const retained = latest.current;
    if (
      retained.key === key &&
      retained.status === "ready" &&
      retained.permit &&
      Date.parse(retained.permit.expiresAt) > Date.now()
    ) {
      expiration = setTimeout(
        () => {
          if (!request.signal.aborted) setState({ key, status: "failed" });
        },
        Date.parse(retained.permit.expiresAt) - Date.now(),
      );
      return () => {
        request.abort();
        clearTimeout(expiration);
      };
    }
    const acknowledge = () => {
      if (request.signal.aborted || document.visibilityState === "hidden")
        return;
      document.removeEventListener("visibilitychange", acknowledge);
      // A new target already derives loading from its different key. Avoid an
      // extra synchronous render before starting its network acknowledgement.
      if (retained.key === key && retained.status !== "loading") {
        setState({ key, status: "loading" });
      }
      if (
        !Number.isSafeInteger(target.sourceVersion) ||
        target.sourceVersion < 1
      ) {
        setState({ key, status: "failed" });
        return;
      }
      void acknowledgeCurrentTrainingCard(userId, target, request.signal)
        .then((permit) => {
          if (request.signal.aborted) return;
          setState({ key, status: "ready", permit });
          expiration = setTimeout(
            () => {
              if (!request.signal.aborted) setState({ key, status: "failed" });
            },
            Math.max(0, Date.parse(permit.expiresAt) - Date.now()),
          );
        })
        .catch(() => {
          if (!request.signal.aborted) setState({ key, status: "failed" });
        });
    };
    document.addEventListener("visibilitychange", acknowledge);
    acknowledge();
    return () => {
      request.abort();
      clearTimeout(expiration);
      document.removeEventListener("visibilitychange", acknowledge);
    };
    // key contains the complete canonical target and account identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, input.active, attempt]);
  const current = state.key === key ? state : null;
  const ready =
    !enabled ||
    Boolean(
      input.active &&
        input.target &&
        current?.status === "ready" &&
        current.permit &&
        Date.parse(current.permit.expiresAt) > Date.now(),
    );
  const context: CurrentTrainingCardContext | undefined =
    enabled && ready && current?.permit && input.target
      ? { sessionId: input.target.sessionId, permitId: current.permit.permitId }
      : undefined;
  return {
    enabled,
    ready,
    failed:
      enabled &&
      (current?.status === "failed" ||
        Boolean(
          current?.permit && Date.parse(current.permit.expiresAt) <= Date.now(),
        )),
    context,
    retry: () => setAttempt((value) => value + 1),
  };
}

export type PresentedTrainingCard = {
  userId: string;
  group: import("../../../../../packages/shared/types/platformV2").PlatformHeadwordGroupV2;
  entry: { entryId: string };
  currentCard: CurrentTrainingCardContext;
};

/** A local bridge for the existing More keyboard shortcut; never a source of authority. */
export function usePresentedTrainingCard(
  value: PresentedTrainingCard | null,
  onChange?: (value: PresentedTrainingCard | null) => void,
) {
  const key = JSON.stringify(value);
  useLayoutEffect(() => {
    onChange?.(value);
    return () => onChange?.(null);
    // Value identity is intentionally its content; render-created wrappers are not presentations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, onChange]);
}
