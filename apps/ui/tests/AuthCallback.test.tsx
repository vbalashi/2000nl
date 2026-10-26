import React from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const auth = vi.hoisted(() => ({ initialize: vi.fn(), getSession: vi.fn(), exchangeCodeForSession: vi.fn() }));
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth } }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
import AuthCallbackPage from "@/app/auth/callback/page";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  window.history.replaceState({}, "", "/auth/callback?code=synthetic-used-code");
  auth.initialize.mockResolvedValue({ error: null });
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: "synthetic-user" } } }, error: null });
  // detectSessionInUrl already consumed the verifier and saved the session.
  auth.exchangeCodeForSession.mockResolvedValue({ error: new Error("both auth code and code verifier should be non-empty") });
});

afterEach(() => { vi.unstubAllGlobals(); });

test("SDK-completed PKCE login reaches the app without a false auth_failed URL", async () => {
  render(<AuthCallbackPage />);
  await waitFor(() => expect([...navigation.push.mock.calls, ...navigation.replace.mock.calls].map(([url]) => url)).toEqual(["/"]));
  expect(navigation.replace).toHaveBeenCalledWith("/");
  expect(navigation.push).not.toHaveBeenCalled();
  expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
});

test("missing session does not claim successful authentication", async () => {
  window.history.replaceState({}, "", "/auth/callback");
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  render(<AuthCallbackPage />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/?error=auth_failed"));
});

test("provider callback failure is not hidden by an older saved session", async () => {
  window.history.replaceState({}, "", "/auth/callback?error=access_denied");
  render(<AuthCallbackPage />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/?error=auth_failed"));
  expect(auth.getSession).not.toHaveBeenCalled();
});

test("failed SDK initialization does not reuse an older session", async () => {
  auth.initialize.mockResolvedValue({ error: new Error("invalid code") });
  render(<AuthCallbackPage />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/?error=auth_failed"));
  expect(auth.getSession).not.toHaveBeenCalled();
});

test("unexpected session failure reaches the generic failure page", async () => {
  auth.getSession.mockRejectedValue(new Error("synthetic unavailable"));
  render(<AuthCallbackPage />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/?error=auth_failed"));
});

test("StrictMode callback replay still navigates only once", async () => {
  render(<React.StrictMode><AuthCallbackPage /></React.StrictMode>);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/"));
  expect(navigation.replace).toHaveBeenCalledTimes(1);
  expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
});
