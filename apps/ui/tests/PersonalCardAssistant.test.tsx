import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PersonalCardAssistant } from "@/components/training/wordlist/PersonalCardAssistant";

vi.mock("@/lib/platform/platformV2Http", () => ({
  authenticatedJsonHeaders: async () => ({}),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

it("retries the failed turn with its original intent and keeps the next draft", async () => {
  const request = vi.fn()
    .mockResolvedValueOnce(Response.json({}, { status: 502 }))
    .mockResolvedValueOnce(Response.json({
      mode: "provider", message: "Here is a definition.", suggestions: [],
    }));
  vi.stubGlobal("fetch", request);
  render(<PersonalCardAssistant
    word="uitstellen" definition="" languageCode="nl" interfaceLanguage="en"
    senseKey="draft" ordinal={1} onClose={() => {}} onApply={() => {}}
  />);

  fireEvent.click(screen.getByRole("button", { name: "Prompts" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Suggest a definition" }));
  await screen.findByRole("alert");
  const composer = screen.getByRole("textbox", { name: "Ask about this meaning…" });
  fireEvent.change(composer, { target: { value: "My next question" } });
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  await screen.findByText("Here is a definition.");
  expect(request).toHaveBeenCalledTimes(2);
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual(JSON.parse(request.mock.calls[0][1].body));
  expect(screen.getAllByText("Suggest a definition")).toHaveLength(1);
  expect(composer).toHaveValue("My next question");
  expect(screen.queryByRole("alert")).toBeNull();
});
