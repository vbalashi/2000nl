import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PersonalCardAssistant } from "@/components/training/wordlist/PersonalCardAssistant";

import { PersonalDictionaryEntryDraft } from "@/components/training/wordlist/PersonalDictionaryEntryDraft";
import { savePersonalArticle } from "@/lib/training/personalArticleClient";

const transcript = "What is a Dutch verb for postponing a meeting?";

vi.mock("@/components/training/wordlist/DraftWordAudio", () => ({ DraftWordAudio: () => null }));

vi.mock("@/lib/audio/useAzureDictation", () => ({
  useAzureDictation: (onText: (text: string) => void) => ({
    status: "idle", supported: true, toggle: () => onText(transcript),
  }),
}));

vi.mock("@/lib/training/personalArticleClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/training/personalArticleClient")>()),
  savePersonalArticle: vi.fn(),
}));

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
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByRole("alert");
  const composer = screen.getByRole("textbox", { name: "Message to the assistant" });
  fireEvent.change(composer, { target: { value: "My next question" } });
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  await screen.findByText("Here is a definition.");
  expect(request).toHaveBeenCalledTimes(2);
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual(JSON.parse(request.mock.calls[0][1].body));
  expect(screen.getAllByText("Suggest a definition")).toHaveLength(1);
  expect(composer).toHaveValue("My next question");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("applies a headword to an empty card and saves it with the suggested definition", async () => {
  vi.mocked(savePersonalArticle).mockResolvedValue(["saved-id"]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    mode: "provider", message: "Here is a draft.",
    suggestions: [
      { kind: "headword", text: "uitstellen" },
      { kind: "headword", text: "opschuiven" },
      { kind: "definition", text: "iets op een later moment laten gebeuren" },
    ],
  })));

  function EmptyDraft() {
    const [draft, setDraft] = React.useState({ word: "", definition: "" });
    return <PersonalDictionaryEntryDraft
      {...draft} onChange={(patch) => setDraft((previous) => ({...previous, ...patch}))}
      languageCode="nl" interfaceLanguage="en" mobile={false} assistantAvailable
      onClose={() => {}} onRead={() => {}} onSaved={() => {}}
    />;
  }

  render(<EmptyDraft />);
  fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
  const composer = screen.getByRole("textbox", { name: "Message to the assistant" });
  fireEvent.click(screen.getByRole("button", { name: "Dictate" }));
  expect(composer).toHaveValue(transcript);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  const [applyWord, applyAlternative, applyDefinition] = await screen.findAllByRole("button", { name: "Use" });
  fireEvent.click(applyWord);
  expect(applyAlternative).toBeDisabled();
  fireEvent.click(applyDefinition);
  fireEvent.click(screen.getByRole("button", { name: "Save meaning" }));

  await waitFor(() => expect(savePersonalArticle).toHaveBeenCalledWith(expect.objectContaining({
    headword: "uitstellen",
    senses: [expect.objectContaining({ definition: "iets op een later moment laten gebeuren" })],
  })));
});

it("sends the visible starter directly", async () => {
  const request = vi.fn().mockResolvedValue(Response.json({
    mode: "provider", message: "Here is a definition.", suggestions: [],
  }));
  vi.stubGlobal("fetch", request);
  render(<PersonalCardAssistant
    word="uitstellen" definition="" languageCode="nl" interfaceLanguage="en"
    senseKey="draft" ordinal={1} onClose={() => {}} onApply={() => {}}
  />);
  fireEvent.click(screen.getByRole("button", { name: "Suggest a definition" }));
  await screen.findByText("Here is a definition.");
  expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
    question: "Suggest a definition", intent: "fill",
  });
});

it("quotes a proposal in the composer and leaves sending to the learner", async () => {
  const request = vi.fn().mockResolvedValue(Response.json({
    mode: "provider", message: "Here is a draft.", searched: true, sources: [],
    suggestions: [{ kind: "definition", text: "iets op een later moment laten gebeuren" }],
  }));
  vi.stubGlobal("fetch", request);
  render(<PersonalCardAssistant
    word="uitstellen" definition="" languageCode="nl" interfaceLanguage="en"
    senseKey="draft" ordinal={1} onClose={() => {}} onApply={() => {}}
  />);

  const composer = screen.getByRole("textbox", { name: "Message to the assistant" });
  expect(composer).toHaveAttribute("placeholder", "Choose a prompt with + or dictate your request.");
  fireEvent.click(screen.getByRole("button", { name: "Suggest a definition" }));
  await screen.findByRole("button", { name: "Quote" });
  expect(composer).toHaveAttribute("placeholder", "Add a detail or ask a follow-up…");
  expect(screen.queryByText("No matches in the accessible dictionaries for this learning language.")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Quote" }));
  expect(composer).toHaveValue("> iets op een later moment laten gebeuren\n\n");
  fireEvent.click(screen.getByRole("button", { name: "Dictate" }));
  expect(composer).toHaveValue("> iets op een later moment laten gebeuren\n\n" + transcript);
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(JSON.parse(request.mock.calls[1][1].body).question).toBe("> iets op een later moment laten gebeuren\n\n" + transcript);
});

it("emphasizes model-selected phrases and known words while rendering other text literally", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    mode: "provider",
    message: "Try uitstellen. **Put it off** until later. <script>ignored</script>",
    suggestions: [],
  })));
  render(<PersonalCardAssistant
    word="uitstellen" definition="" languageCode="nl" interfaceLanguage="en"
    senseKey="draft" ordinal={1} onClose={() => {}} onApply={() => {}}
  />);

  fireEvent.click(screen.getByRole("button", { name: "Suggest a definition" }));
  expect(await screen.findByText("Put it off", { selector: "strong" })).toBeInTheDocument();
  expect(screen.getByText("uitstellen", { selector: "strong" })).toBeInTheDocument();
  expect(screen.getByText(/<script>ignored<\/script>/)).toBeInTheDocument();
  expect(screen.getByRole("log").querySelector("script")).toBeNull();
});
