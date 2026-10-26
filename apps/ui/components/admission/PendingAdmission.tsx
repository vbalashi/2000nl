"use client";
import type { AdmissionState } from "@/lib/admission/contract";
const copy = {
 en: { pending: "Your access request is awaiting approval", unconfirmed: "Confirm your email", revoked: "Access has been revoked", rejected: "Access request declined", body: "You are signed in. Access to 2000NL requires approval for your confirmed email address.", retry: "Check access", out: "Sign out" },
 ru: { pending: "Заявка ожидает одобрения", unconfirmed: "Подтвердите email", revoked: "Доступ отозван", rejected: "Заявка отклонена", body: "Вы вошли в аккаунт. Для доступа к 2000NL требуется одобрение вашего подтверждённого email.", retry: "Проверить доступ", out: "Выйти" },
 nl: { pending: "Je aanvraag wacht op goedkeuring", unconfirmed: "Bevestig je e-mailadres", revoked: "De toegang is ingetrokken", rejected: "Je aanvraag is afgewezen", body: "Je bent ingelogd. Toegang tot 2000NL vereist goedkeuring voor je bevestigde e-mailadres.", retry: "Toegang controleren", out: "Uitloggen" },
};
export function PendingAdmission({ state, onRetry, onSignOut, language = "en" }: { state: AdmissionState; onRetry: () => void; onSignOut: () => void; language?: string }) {
 const text = copy[language as keyof typeof copy] ?? copy.en;
 const title = state.status === "approved" ? text.pending : text[state.status];
 return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 p-6"><h1 className="text-2xl font-semibold">{title}</h1><p className="text-slate-600">{text.body}</p><div className="flex gap-3"><button onClick={onRetry} className="rounded bg-primary px-4 py-3 text-white">{text.retry}</button><button onClick={onSignOut} className="rounded border px-4 py-3">{text.out}</button></div></main>;
}
