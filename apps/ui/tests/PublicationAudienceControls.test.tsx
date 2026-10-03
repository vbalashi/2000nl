import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PublicationAudienceControls } from "@/components/admin/PublicationAudienceControls";

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async (url: string) => { if (url.includes("audience-options")) return url.includes("page=2") ? Response.json({ groups: [{ key: "trusted", name: "Trusted" }, { key: "testers", name: "Testers" }], users: [{ id: "user-3", email: "three@test.local" }], hasMoreUsers: false }) : Response.json({ groups: [{ key: "trusted", name: "Trusted" }, { key: "testers", name: "Testers" }], users: [{ id: "user-1", email: "one@test.local" }, { id: "user-2", email: "two@test.local" }], hasMoreUsers: true }); return Response.json({ groupKeys: ["trusted"], userIds: ["user-1", "user-3"] }); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("saves normalized restricted audience keys and user ids", async () => {
  const onSaved = vi.fn();
  render(<PublicationAudienceControls dictionaryId="dictionary-1" groupKeys={["trusted"]} userIds={["user-1"]} onSaved={onSaved} />);
  await waitFor(() => expect(screen.getByLabelText("Testers")).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText("Testers"));
  fireEvent.click(screen.getByRole("button", { name: "Дальше" }));
  await waitFor(() => expect(screen.getByLabelText("three@test.local")).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText("three@test.local"));
  fireEvent.click(screen.getByRole("button", { name: "Сохранить аудиторию" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(["trusted", "testers"], ["user-1", "user-3"]));
  expect(fetch).toHaveBeenCalledWith("/api/admin/dictionaries/dictionary-1", expect.objectContaining({ method: "PATCH" }));
});
