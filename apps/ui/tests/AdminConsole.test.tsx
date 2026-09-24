import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminConsole from "@/components/admin/AdminConsole";
let fetchMock: ReturnType<typeof vi.fn<[string], Promise<Response>>>;
beforeEach(() => {
  window.history.replaceState({}, "", "/admin");
  fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/admin/session") return Response.json({ email: "operator@example.test", permissions: ["audit.read"] });
    if (url.startsWith("/api/admin/audit?")) return Response.json({ items: [], hasNext: false, page: 1, pageSize: 25, before: "2026-09-24T10:00:00.000Z" });
    if (url === "/api/admin/auth/sign-out") return Response.json({ error: "sign_out_incomplete" }, { status: 503 });
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("opens the journal for an audit-only operator without a forbidden dictionary read", async () => {
  render(<AdminConsole />);
  expect(await screen.findByRole("heading", { name: "Журнал" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Словари" })).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => url.startsWith("/api/admin/dictionaries"))).toBe(false);
  await waitFor(() => expect(new URLSearchParams(window.location.search).get("before")).toBe("2026-09-24T10:00:00.000Z"));
});
it("reports an incomplete logout instead of claiming success", async () => {
  render(<AdminConsole />);
  await screen.findByRole("heading", { name: "Журнал" });
  fireEvent.click(screen.getByRole("button", { name: "Выйти" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось подтвердить завершение сеанса");
  expect(screen.queryByText("Вы вышли из административной системы.")).not.toBeInTheDocument();
});
