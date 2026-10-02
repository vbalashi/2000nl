import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TrainingUsableCandidatesExhausted } from "@/components/training/v2/TrainingUsableCandidatesExhausted";

afterEach(() => { vi.unstubAllEnvs(); });

test.each([
  ["en", "No usable training cards remain in this session.", "Back to Today"],
  ["nl", "Er zijn geen bruikbare trainingskaarten meer in deze sessie.", "Terug naar Vandaag"],
  ["ru", "В этой сессии не осталось доступных для показа карточек.", "Вернуться на Сегодня"],
] as const)(
  "renders an honest exhausted-candidates state in %s",
  (interfaceLanguage, message, exitLabel) => {
    const onExit = vi.fn();
    render(
      <TrainingUsableCandidatesExhausted
        interfaceLanguage={interfaceLanguage}
        onExit={onExit}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(message);
    fireEvent.click(screen.getByRole("button", { name: exitLabel }));
    expect(onExit).toHaveBeenCalledTimes(1);
  },
);

import { TrainingUnsupportedMode } from "@/components/training/v2/TrainingUnsupportedMode";
import { getUiMessages } from "@/lib/uiMessages";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
for (const interfaceLanguage of ["en", "nl", "ru"] as const) {
  for (const [Component, key, role] of [
    [TrainingUsableCandidatesExhausted, "exhausted", "status"],
    [TrainingUnsupportedMode, "unsupportedMode", "alert"],
  ] as const) test(`${interfaceLanguage} approved ${key} preserves exit ownership`, () => {
    vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
    const onExit = vi.fn();
    render(<Component interfaceLanguage={interfaceLanguage} onExit={onExit} />);
    expect(screen.getByRole(role)).toHaveTextContent(platformV2Message(interfaceLanguage, `senseCard.training.${key}`));
    fireEvent.click(screen.getByRole("button",{name:getUiMessages(interfaceLanguage).trainingSession.back}));
    expect(onExit).toHaveBeenCalledOnce();
  });
}


test.each(["en", "nl", "ru"] as const)("completed session offers three owned actions in %s", (interfaceLanguage) => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
  const onExit = vi.fn(), onRestart = vi.fn(), onEdit = vi.fn();
  const titles = {en: "Session complete", nl: "Sessie voltooid", ru: "Сессия завершена"};
  render(<TrainingUsableCandidatesExhausted interfaceLanguage={interfaceLanguage} completedCount={10} plannedTotal={10} onExit={onExit} onRestart={onRestart} onEdit={onEdit} />);
  expect(screen.getByRole("status")).toHaveTextContent(titles[interfaceLanguage]);
  const buttons = screen.getAllByRole("button");
  expect(buttons).toHaveLength(3);
  buttons.forEach(button => fireEvent.click(button));
  expect(onRestart).toHaveBeenCalledOnce(); expect(onEdit).toHaveBeenCalledOnce(); expect(onExit).toHaveBeenCalledOnce();
});
test("early exhaustion does not promise another batch", () => {
  vi.stubEnv("NEXT_PUBLIC_TRAINING_PRESENTATION_V1", "true");
  render(<TrainingUsableCandidatesExhausted interfaceLanguage="en" completedCount={2} plannedTotal={10} onExit={vi.fn()} onRestart={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("No usable training cards");
  expect(screen.queryByRole("button", {name: "Start next session"})).toBeNull();
  expect(screen.getByRole("button", {name: "Edit training"})).toBeVisible();
});
