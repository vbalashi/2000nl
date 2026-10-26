import React from "react";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AccountPracticeAppearanceProvider } from "@/components/practice/ui/AccountPracticeAppearanceProvider";
import { AccountCardSpacingProvider } from "@/components/practice/ui/AccountCardSpacingProvider";
import { AccountPresentationReady } from "@/components/practice/ui/AccountPresentationReady";
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
test("mounts both preference reads concurrently behind one readiness gate", async () => {
  let palette!: (v: "indigo") => void, spacing!: (v: "airy") => void;
  const a = {
      load: vi.fn(
        () =>
          new Promise<"indigo">((r) => {
            palette = r;
          }),
      ),
      save: vi.fn(),
    },
    b = {
      load: vi.fn(
        () =>
          new Promise<"airy">((r) => {
            spacing = r;
          }),
      ),
      save: vi.fn(),
    };
  render(
    <AccountPracticeAppearanceProvider userId="a" repository={a}>
      <AccountCardSpacingProvider userId="a" repository={b}>
        <AccountPresentationReady>
          <p>Ready article</p>
        </AccountPresentationReady>
      </AccountCardSpacingProvider>
    </AccountPracticeAppearanceProvider>,
  );
  expect(a.load).toHaveBeenCalledOnce();
  expect(b.load).toHaveBeenCalledOnce();
  expect(screen.queryByText("Ready article")).toBeNull();
  await act(async () => palette("indigo"));
  expect(screen.queryByText("Ready article")).toBeNull();
  await act(async () => spacing("airy"));
  await waitFor(() => expect(screen.getByText("Ready article")).toBeVisible());
});
