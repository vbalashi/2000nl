import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { expect, test, vi } from "vitest";
const { fetchSources } = vi.hoisted(() => ({ fetchSources: vi.fn() }));
vi.mock("@/lib/training/listService", () => ({
  fetchAvailableDictionarySourcesStrict: fetchSources,
}));
import { useMaterialDictionaryCatalog } from "@/components/practice/material/useMaterialDictionaryCatalog";
test("first-copy destination survives reload while the old ready inventory lacks its dictionary", async () => {
  let finish: (value: unknown) => void = () => {};
  fetchSources.mockResolvedValueOnce([{ id: "public" }]).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  function Consumer() {
    const catalog = useMaterialDictionaryCatalog("owner", ["nl"]);
    const [selected, setSelected] = React.useState<string | null>(null);
    React.useEffect(() => {
      if (
        catalog.status === "ready" &&
        selected &&
        !catalog.sources.some((item) => item.id === selected)
      )
        setSelected(null);
    }, [catalog.status, catalog.sources, selected]);
    return (
      <>
        <span data-testid="selection">{selected ?? "none"}</span>
        <span>{catalog.status}</span>
        <button
          onClick={() => {
            catalog.reload();
            setSelected("new-personal");
          }}
        >
          Open first copy
        </button>
      </>
    );
  }
  render(<Consumer />);
  await screen.findByText("ready");
  fireEvent.click(screen.getByRole("button", { name: "Open first copy" }));
  await waitFor(() => expect(fetchSources).toHaveBeenCalledTimes(2));
  expect(screen.getByTestId("selection")).toHaveTextContent("new-personal");
  await act(async () => finish([{ id: "public" }, { id: "new-personal" }]));
  await screen.findByText("ready");
  expect(screen.getByTestId("selection")).toHaveTextContent("new-personal");
});
