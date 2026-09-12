import React, { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import DevTestLoginPage from "@/app/dev/test-login/page";

function failedResponse(message: string) {
  return {
    ok: false,
    json: async () => ({ error: message }),
  } as Response;
}

describe("DevTestLoginPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  test("keeps the in-flight session request single-flight under Strict Mode", async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <StrictMode>
        <DevTestLoginPage />
      </StrictMode>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/dev/test-session", {
      method: "POST",
      cache: "no-store",
    });

    resolveRequest(failedResponse("Test request finished."));
    await screen.findByText("Test request finished.");
  });

  test("does not trust a stale session marker after a local database reset", async () => {
    window.sessionStorage.setItem("__dev_test_login_done_v1", "1");
    window.localStorage.setItem("sb-local-auth-token", "stale-session");
    const fetchMock = vi.fn(async () => failedResponse("Session is invalid."));
    vi.stubGlobal("fetch", fetchMock);

    render(<DevTestLoginPage />);

    await screen.findByText("Session is invalid.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/dev/test-session", {
      method: "POST",
      cache: "no-store",
    });
  });

  test("allows a fresh request after the previous request failed", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("First request failed."))
      .mockResolvedValueOnce(failedResponse("Retry reached the server."));
    vi.stubGlobal("fetch", fetchMock);

    const firstVisit = render(<DevTestLoginPage />);
    await screen.findByText("First request failed.");
    firstVisit.unmount();

    render(<DevTestLoginPage />);

    await screen.findByText("Retry reached the server.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("allows a fresh request after the server rejected the previous request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failedResponse("First response failed."))
      .mockResolvedValueOnce(failedResponse("Retry reached the server."));
    vi.stubGlobal("fetch", fetchMock);

    const firstVisit = render(<DevTestLoginPage />);
    await screen.findByText("First response failed.");
    firstVisit.unmount();

    render(<DevTestLoginPage />);

    await screen.findByText("Retry reached the server.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
