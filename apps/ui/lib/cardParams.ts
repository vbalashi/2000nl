"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { TrainingMode } from "@/lib/types";

export type CardParams = {
  wordId?: string;
  layout?: TrainingMode;
  devMode: boolean;
};

const truthyFlags = new Set(["1", "true", "yes", "on"]);

const parseLayout = (value: string | null): TrainingMode | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "w2d") {
    return "word-to-definition";
  }

  if (normalized === "d2w") {
    return "definition-to-word";
  }

  return undefined;
};

const parseDevMode = (value: string | null): boolean => {
  if (value === null) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "") {
    return true;
  }

  if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") {
    return false;
  }

  return truthyFlags.has(normalized);
};

export const parseCardParams = (params: URLSearchParams): CardParams => {
  const rawWordId = params.get("wordId");
  const wordId = rawWordId?.trim() || undefined;

  return {
    wordId,
    layout: parseLayout(params.get("layout")),
    devMode: parseDevMode(params.get("devMode"))
  };
};

export const useCardParams = (): CardParams => {
  const searchParams = useSearchParams();

  return useMemo(
    () => parseCardParams(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );
};
