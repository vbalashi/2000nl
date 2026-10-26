"use client";
import { createContext, useContext } from "react";
import type { AppReleaseState } from "./useAppRelease";
export const AppReleaseContext = createContext<AppReleaseState | null>(null);
export const useReleaseUpdates = () => useContext(AppReleaseContext);
