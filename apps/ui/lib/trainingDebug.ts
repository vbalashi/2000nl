const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const isTruthy = (value: string | null | undefined): boolean =>
  TRUE_VALUES.has((value ?? "").trim().toLowerCase());

export function isTrainingDebugEnabled(): boolean {
  if (isTruthy(process.env.NEXT_PUBLIC_DEBUG_TRAINING)) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (isTruthy(new URLSearchParams(window.location.search).get("debugTraining"))) {
      return true;
    }

    return isTruthy(window.localStorage.getItem("debug:training"));
  } catch {
    return false;
  }
}

export const trainingDebug = {
  log: (...args: Parameters<typeof console.log>) => {
    if (isTrainingDebugEnabled()) {
      console.log(...args);
    }
  },
  groupCollapsed: (...args: Parameters<typeof console.groupCollapsed>) => {
    if (isTrainingDebugEnabled()) {
      console.groupCollapsed(...args);
    }
  },
  groupEnd: () => {
    if (isTrainingDebugEnabled()) {
      console.groupEnd();
    }
  },
};
