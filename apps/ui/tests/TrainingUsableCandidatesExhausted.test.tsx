import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TrainingUsableCandidatesExhausted } from "@/components/training/v2/TrainingUsableCandidatesExhausted";

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
