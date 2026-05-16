import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TrainingCard } from "@/components/training/TrainingCard";

const word = {
  id: "word-1",
  headword: "huis",
  raw: {
    meanings: [
      {
        definition: "Een gebouw waar mensen wonen.",
        examples: [],
        links: [],
      },
    ],
  },
};

function jsonResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Server Error",
    json: async () => data,
    text: async () => (typeof data === "string" ? data : JSON.stringify(data)),
  } as Response;
}

function renderCard(
  props: Partial<React.ComponentProps<typeof TrainingCard>> = {},
) {
  const onOpenChange = vi.fn();

  function Harness() {
    const [open, setOpen] = React.useState(
      props.translationTooltipOpen ?? false,
    );

    return (
      <TrainingCard
        word={(props.word ?? word) as any}
        mode={props.mode ?? "word-to-definition"}
        revealed={props.revealed ?? true}
        hintRevealed={props.hintRevealed ?? false}
        onWordClick={props.onWordClick ?? vi.fn()}
        userId="test-user"
        translationLang={
          props.translationLang === undefined ? "en" : props.translationLang
        }
        translationTooltipOpen={open}
        onTranslationTooltipOpenChange={(next) => {
          onOpenChange(next);
          setOpen(next);
        }}
        {...props}
      />
    );
  }

  return {
    ...render(<Harness />),
    onOpenChange,
  };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("TrainingCard translation behavior", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          status: "ready",
          overlay: {
            headword: "house",
            meanings: [{ definition: "A building where people live." }],
          },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("preloads translation when the card is revealed", async () => {
    renderCard();

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      "/api/translation?word_id=word-1&lang=en",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      }),
    );
  });

  test("polls while the translation tooltip is open and pending", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ status: "pending" }))
      .mockResolvedValueOnce(jsonResponse({ status: "pending" }));

    renderCard({ translationTooltipOpen: true });

    await flushEffects();
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("shows failed translation status text", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse("nope", false, 500));

    renderCard({ translationTooltipOpen: true });

    await waitFor(() =>
      expect(document.body).toHaveTextContent(/Translation API 500: nope/i),
    );
  });

  test("long-press force refreshes and suppresses the following click toggle", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ status: "ready", overlay: {} }))
      .mockResolvedValueOnce(jsonResponse({ status: "ready", overlay: {} }));
    const { onOpenChange } = renderCard();

    await flushEffects();
    expect(fetch).toHaveBeenCalledTimes(1);
    const button = screen.getByRole("button", { name: /translate \(t\)/i });

    fireEvent.pointerDown(button);
    await act(async () => {
      vi.advanceTimersByTime(650);
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("&force=1");
    expect(onOpenChange).toHaveBeenCalledWith(true);

    fireEvent.click(button);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  test("clears pending poll timer on unmount", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: "pending" }));

    const { unmount } = renderCard({ translationTooltipOpen: true });

    await flushEffects();
    expect(fetch).toHaveBeenCalledTimes(1);
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
