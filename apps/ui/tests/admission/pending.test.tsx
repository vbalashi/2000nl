import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { PendingAdmission } from "@/components/admission/PendingAdmission";
Object.assign(globalThis, { React });
test("pending identity sees no product data and can retry or sign out", async () => {
 const retry = vi.fn(), out = vi.fn(); render(<PendingAdmission state={{ enabled: true, status: "pending", mode: "approval-required" }} onRetry={retry} onSignOut={out} />);
 expect(screen.getByRole('heading').textContent).toContain('awaiting approval');
 await userEvent.click(screen.getByRole('button',{name:'Check access'})); expect(retry).toHaveBeenCalledOnce();
 await userEvent.click(screen.getByRole('button',{name:'Sign out'})); expect(out).toHaveBeenCalledOnce();
});
