import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { AdmissionPanel } from "@/components/admin/AdmissionPanel";
Object.assign(globalThis, { React });
afterEach(() => { vi.unstubAllGlobals(); });
test("bulk approval contains only explicitly selected emails and displays exact outcome", async () => {
 const items = ["a@example.test", "b@example.test"].map(email => ({ email, status: "pending", user_id: null, created_at: "2026-10-26", updated_at: "2026-10-26" }));
 const fetcher = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === "POST" ? { results: [{ outcome: "changed" }] } : { items, enabled: true, mode: "approval-required", page: 1 }), { status: 200 }));
 vi.stubGlobal("fetch", fetcher); render(<AdmissionPanel />);
 await screen.findByRole("checkbox", { name: "Выбрать a@example.test" });
 await userEvent.click(screen.getByRole("checkbox", { name: "Выбрать a@example.test" }));
 await userEvent.click(screen.getByRole("button", { name: "Одобрить выбранных (1)" }));
 await waitFor(() => expect(fetcher.mock.calls.some(([,init]) => init?.method === "POST")).toBe(true));
 const call = fetcher.mock.calls.find(([,init]) => init?.method === "POST")!;
 expect(JSON.parse(call[1]?.body as string)).toMatchObject({ action: "approve", emails: ["a@example.test"] });
 await screen.findByText(/Изменено: 1/);
});


test("origin rejection explains the configuration error", async () => {
 vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === "POST" ? { error: "forbidden_origin" } : { items: [], enabled: true, mode: "approval-required", page: 1 }), { status: init?.method === "POST" ? 403 : 200 })));
 render(<AdmissionPanel />);
 await waitFor(() => expect(screen.getByRole("combobox", { name: "Режим входа" })).toBeEnabled());
 await userEvent.selectOptions(screen.getByRole("combobox", { name: "Режим входа" }), "open");
 await userEvent.click(screen.getByRole("button", { name: "Сохранить режим" }));
 expect(await screen.findByRole("alert")).toHaveTextContent("адрес админки не совпадает");
});

test("a failed refresh preserves the confirmed save outcome", async () => {
 let saved = false;
 vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
   if (init?.method === "POST") { saved = true; return new Response(JSON.stringify({ mode: "open" })); }
   if (saved) return new Response("{}", { status: 503 });
   return new Response(JSON.stringify({ items: [], enabled: true, mode: "approval-required", page: 1 }));
 }));
 render(<AdmissionPanel />);
 await waitFor(() => expect(screen.getByRole("combobox", { name: "Режим входа" })).toBeEnabled());
 await userEvent.selectOptions(screen.getByRole("combobox", { name: "Режим входа" }), "open");
 await userEvent.click(screen.getByRole("button", { name: "Сохранить режим" }));
 expect(await screen.findByRole("alert")).toHaveTextContent("Решение сохранено, но список не обновился");
 expect(screen.getByRole("status")).toHaveTextContent("Режим сохранён");
});
