import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
const { read, write } = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/training/setups/client", () => ({ fetchAccountTrainingSetups: read, saveAccountTrainingSetups: write }));
import { useAccountTrainingSetups } from "@/lib/training/setups/useAccountTrainingSetups";
import { emptyTrainingSetups, type SavedTraining } from "@/lib/training/setups/model";
const training: SavedTraining = { id: "one", name: "Words", languageCode: "nl", draft: {
  scenarioId: "understanding", modes: ["word-to-definition"], cardFilter: "both", listValue: "curated:nt2", sourceValue: "all", newReviewRatio: 2, dateWindow: "all", sessionSize: 10,
} };
const saved = { revision: 1, document: { schemaVersion: 1, trainings: [training], mainTrainingId: "one" } };
beforeEach(() => {
  vi.clearAllMocks(); read.mockResolvedValue(emptyTrainingSetups());
  write.mockImplementation(async (_user, revision, document) => ({ kind: "saved", snapshot: { revision: revision + 1, document } }));
});
test("signed-out users are not fetched and browser presets are never restored", async () => {
  localStorage.setItem("2000nl.training.presets.v1.a.nl", JSON.stringify([training]));
  const { result, rerender } = renderHook(({ user }: { user?: string }) => useAccountTrainingSetups(user), { initialProps: { user: undefined as string | undefined } });
  expect(read).not.toHaveBeenCalled(); rerender({ user: "a" });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.snapshot.document.trainings).toEqual([]); localStorage.clear();
});
test("save, main selection and deletion use accepted revisions and preserve other languages", async () => {
  const { result } = renderHook(() => useAccountTrainingSetups("a"));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  await act(async () => { await result.current.save(training, true); });
  expect(write).toHaveBeenLastCalledWith("a", 0, saved.document);
  await act(async () => { await result.current.save({ ...training, id: "two", languageCode: "en" }, true); });
  await act(async () => { await result.current.makeMain("two"); });
  expect(result.current.snapshot.document.mainTrainingId).toBe("two");
  await act(async () => { await result.current.remove("two"); });
  expect(result.current.snapshot.document).toEqual(saved.document);
  await act(async () => { await result.current.remove("one"); });
  expect(result.current.snapshot.document).toEqual(emptyTrainingSetups().document);
  expect(result.current.snapshot.revision).toBe(5);
});
test("conflicts adopt the server snapshot without automatic retry or resurrection", async () => {
  read.mockResolvedValue(saved);
  const { result } = renderHook(() => useAccountTrainingSetups("a"));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  write.mockResolvedValue({ kind: "conflict", snapshot: { ...emptyTrainingSetups(), revision: 2 } });
  await act(async () => { expect(await result.current.save(training, false)).toBe("conflict"); });
  expect(result.current.snapshot.document.trainings).toEqual([]);
  await act(async () => { expect(await result.current.save(training, false)).toBe("conflict"); });
  expect(write).toHaveBeenCalledTimes(1);
});
test("a pending mutation blocks duplicate clicks/focus reads; a late account response is ignored", async () => {
  const { result, rerender } = renderHook(({ user }) => useAccountTrainingSetups(user), { initialProps: { user: "a" } });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  let finish!: (value: unknown) => void;
  write.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<string>; act(() => { pending = result.current.save(training, true); });
  expect(result.current.pending).toBe(true);
  await act(async () => { expect(await result.current.save(training, true)).toBe("unavailable"); window.dispatchEvent(new Event("focus")); });
  expect(write).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(1);
  rerender({ user: "b" }); await waitFor(() => expect(result.current.status).toBe("ready"));
  await act(async () => { finish({ kind: "saved", snapshot: saved }); expect(await pending).toBe("unavailable"); });
  expect(result.current.snapshot).toEqual(emptyTrainingSetups()); expect(result.current.pending).toBe(false);
});
test("read/save failures remain visible and do not discard accepted account data", async () => {
  read.mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => useAccountTrainingSetups("a"));
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(await result.current.save(training, true)).toBe("unavailable");
  read.mockResolvedValue(saved); await act(async () => { await result.current.reload(); });
  write.mockResolvedValue({ kind: "error" });
  await act(async () => { expect(await result.current.save(training, false)).toBe("error"); });
  expect(result.current.snapshot).toEqual(saved);
});


test("focus refresh retains the ready overview until the accepted replacement arrives", async () => {
  read.mockResolvedValue(saved);
  const {result} = renderHook(() => useAccountTrainingSetups("a"));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  let finish!: (value: typeof saved) => void;
  read.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  act(() => window.dispatchEvent(new Event("focus")));
  expect(result.current.status).toBe("ready");
  expect(result.current.snapshot).toEqual(saved);
  await act(async () => finish({...saved, revision: 2}));
  expect(result.current.snapshot.revision).toBe(2);
});
