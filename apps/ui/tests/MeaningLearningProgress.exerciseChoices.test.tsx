import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { MeaningLearningProgress } from "@/components/practice/MeaningLearningProgress";
import { previewMeaningProgress } from "@/app/dev/onboarding-preview/progressFixture";

const { fetchProgress, fetchChoices, resume } = vi.hoisted(() => ({
  fetchProgress: vi.fn(), fetchChoices: vi.fn(), resume: vi.fn(),
}));
vi.mock("@/lib/platform/meaningProgressClient", () => ({ fetchMeaningProgress: fetchProgress, resumeMeaningProgress: vi.fn() }));
vi.mock("@/lib/platform/exerciseKnownChoicesClient", () => ({ fetchExerciseKnownChoices: fetchChoices, resumeExerciseKnownChoice: resume }));
vi.mock("@/components/practice/ui/DialogSurface", () => ({ DialogSurface: React.forwardRef(function Dialog({children}:{children:React.ReactNode}, _ref){ return <div>{children}</div>; }) }));
const choice = { exclusionId:"pair-1", targetId:"target-1", family:"idiom", text:"de draad oppakken", directions:["direct", "reverse"] };
beforeEach(() => { fetchProgress.mockReset(); fetchChoices.mockReset(); resume.mockReset(); fetchProgress.mockResolvedValue(previewMeaningProgress("entry-1", true)); fetchChoices.mockResolvedValue([choice]); resume.mockResolvedValue(undefined); });
afterEach(cleanup);
test("a live progress panel loads and restores known exercise choices", async () => {
  render(<MeaningLearningProgress entryId="entry-1" language="ru" onClose={() => {}} />);
  await screen.findByText("de draad oppakken");
  expect(fetchChoices).toHaveBeenCalledWith("entry-1");
  const buttons = screen.getAllByRole("button", { name:"Вернуть в обучение" });
  fireEvent.click(buttons.at(-1)!);
  await waitFor(() => expect(resume).toHaveBeenCalledWith("entry-1", choice, expect.any(String)));
});
