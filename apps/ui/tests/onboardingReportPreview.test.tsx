import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PreviewReport } from "@/app/dev/onboarding-preview/PreviewReport";

// Native dialog rendering belongs to browser checks; test the delivery boundary.
vi.mock("@/components/practice/ui/DialogSurface", () => ({
  DialogSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
afterEach(cleanup);

test("exploring report fields cannot submit a report or persist a comment", () => {
  const close = vi.fn();
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const storageSpy = vi.spyOn(Storage.prototype, "setItem");
  render(<PreviewReport language="ru" onClose={close}/>);
  fireEvent.click(screen.getAllByRole("radio")[0]);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Synthetic preview issue" } });
  const send = screen.getByRole("button", { name: "Отправить" });
  expect(send).toBeDisabled();
  fireEvent.click(send);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(storageSpy).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Назад" }));
  expect(close).toHaveBeenCalledOnce();
  fetchSpy.mockRestore();
  storageSpy.mockRestore();
});
