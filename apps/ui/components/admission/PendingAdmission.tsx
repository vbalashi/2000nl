"use client";
import { localizedSection } from "@/lib/i18n/catalog";

import type { AdmissionState } from "@/lib/admission/contract";
const copy = localizedSection("admission");
export function PendingAdmission({ state, onRetry, onSignOut, language = "en" }: { state: AdmissionState; onRetry: () => void; onSignOut: () => void; language?: string }) {
 const text = copy[language as keyof typeof copy] ?? copy.en;
 const title = state.status === "approved" ? text.pending : text[state.status];
 return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 p-6"><h1 className="text-2xl font-semibold">{title}</h1><p className="text-slate-600">{text.body}</p><div className="flex gap-3"><button onClick={onRetry} className="rounded bg-primary px-4 py-3 text-white">{text.retry}</button><button onClick={onSignOut} className="rounded border px-4 py-3">{text.out}</button></div></main>;
}
