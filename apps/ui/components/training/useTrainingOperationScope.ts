"use client";
import { useLayoutEffect, useRef } from "react";
import { createTrainingOperationScope } from "@/lib/training/trainingOperationScope";

/** Each mounted runtime uses one scope; callbacks/defaults are not its identity. */
export function useTrainingOperationScope(identity: string) {
  const scope = useRef<ReturnType<typeof createTrainingOperationScope>>();
  if (!scope.current) scope.current = createTrainingOperationScope();
  useLayoutEffect(() => {
    const owner = scope.current!;
    owner.reset();
    return () => owner.reset();
  }, [identity]);
  return scope.current;
}
