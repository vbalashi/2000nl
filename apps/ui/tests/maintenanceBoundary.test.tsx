import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MaintenanceBoundary } from "@/components/maintenance/MaintenanceBoundary";
import { MaintenanceOrReleaseBanner } from "@/components/maintenance/MaintenanceNotice";
import { maintenanceEndedEvent } from "@/lib/maintenance/status";

let state: Record<string, unknown>;
let status: number;

beforeEach(() => {
  state = { phase: "available" };
  status = 200;
  const fetchStatus = vi.fn(async () => new Response(JSON.stringify(state), {
    status,
    headers: { date: new Date().toUTCString() },
  }));
  vi.stubGlobal("fetch", fetchStatus);
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function refresh(next: Record<string, unknown>, httpStatus = 200) {
  state = next;
  status = httpStatus;
  await act(async () => { window.dispatchEvent(new Event("focus")); });
}

test("dismissed revisions stay hidden, and maintenance covers and restores the mounted screen", async () => {
  const scheduled = {
    phase: "scheduled",
    id: "release",
    revision: 1,
    startsAt: new Date(Date.now() + 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
  };
  state = scheduled;
  const ended = vi.fn();
  window.addEventListener(maintenanceEndedEvent, ended);
  try {
    render(
      <MaintenanceBoundary>
        <input aria-label="Current exercise" defaultValue="bank" />
        <MaintenanceOrReleaseBanner language="en" />
      </MaintenanceBoundary>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Got it" }));
    expect(screen.queryByText("Scheduled update")).toBeNull();
    await refresh(scheduled);
    expect(screen.queryByText("Scheduled update")).toBeNull();
    await refresh({ ...scheduled, revision: 2 });
    expect(screen.getByText("Scheduled update")).toBeTruthy();
    await refresh({ ...scheduled, expiresAt: "2000-01-01T00:00:00Z" });
    expect(screen.queryByText("Scheduled update")).toBeNull();

    const exercise = screen.getByLabelText("Current exercise");
    await refresh({}, 503);
    expect(screen.queryByRole("dialog")).toBeNull();
    await refresh({ phase: "active" });
    await waitFor(() => expect(screen.getByRole("dialog").hasAttribute("open")).toBe(true));
    await refresh({}, 503);
    expect(screen.getByRole("dialog")).toBeTruthy();
    await refresh({ phase: "available" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Current exercise")).toBe(exercise);
    expect(ended).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener(maintenanceEndedEvent, ended);
  }
});
