import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
const signInWithOAuth = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      signInWithOtp,
      verifyOtp,
      signInWithOAuth,
    },
  },
}));

vi.mock("@/lib/agentLog", () => ({
  sendAgentLog: vi.fn(),
}));

const { AuthScreen } = await import("@/components/auth/AuthScreen");

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();

  // Ensure predictable language (AuthScreen auto-detects lang).
  try {
    Object.defineProperty(navigator, "language", {
      configurable: true,
      value: "en-US",
    });
  } catch {
    // ignore
  }
});

test("OTP code entry is available as a fallback without requiring resend", async () => {
  verifyOtp.mockResolvedValue({ error: null });

  render(<AuthScreen />);

  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: "user@test.com" },
  });

  fireEvent.click(screen.getByRole("button", { name: /already have a code/i }));

  fireEvent.change(screen.getByLabelText(/enter your code/i), {
    target: { value: "12345678" },
  });

  fireEvent.click(screen.getAllByRole("button", { name: /verify code/i })[0]);

  await waitFor(() =>
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "user@test.com",
      token: "12345678",
      type: "email",
    })
  );
});

test("restores pending OTP email from localStorage so users can return from mail app", async () => {
  localStorage.setItem("auth:pendingOtpEmail", "restore@test.com");

  render(<AuthScreen />);

  // OTP view is shown and displays the email.
  expect(await screen.findByText("restore@test.com")).toBeInTheDocument();
  expect(screen.getByLabelText(/enter your code/i)).toBeInTheDocument();
});

test("sending an OTP stores pending email so refresh/reopen keeps the code-entry view", async () => {
  signInWithOtp.mockResolvedValue({ error: null });

  render(<AuthScreen />);

  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: "persist@test.com" },
  });

  fireEvent.click(screen.getByRole("button", { name: /send login code/i }));

  await waitFor(() =>
    expect(localStorage.getItem("auth:pendingOtpEmail")).toBe("persist@test.com")
  );
});

