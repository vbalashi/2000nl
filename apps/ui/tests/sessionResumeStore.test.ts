import { afterEach, describe, expect, test } from "vitest";
import {
  clearTrainingSessionResume,
  createTrainingSessionOwnerCoordinator,
  readTrainingSessionResume,
  releaseTrainingSessionOwner,
  writeTrainingSessionResume,
  type TrainingSessionResumeRecord,
} from "@/lib/training/sessionResumeStore";

class MemorySessionStorage {
  private readonly values: Map<string, string>;

  constructor(entries: Iterable<readonly [string, string]> = []) {
    this.values = new Map(entries);
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  clone() {
    return new MemorySessionStorage(this.values.entries());
  }
}

class DeterministicOwnerLocks {
  private readonly held = new Set<string>();

  request = (
    name: string,
    hold: (claim: "acquired" | "occupied" | "unavailable") => Promise<void>,
  ): void => {
    if (this.held.has(name)) {
      void hold("occupied");
      return;
    }
    this.held.add(name);
    void hold("acquired").finally(() => this.held.delete(name));
  };
}

const record: TrainingSessionResumeRecord = {
  sessionId: "session-1",
  userId: "user-1",
  languageCode: "nl",
  listId: "list-1",
  listType: "curated",
  scenarioId: "understanding",
  modes: ["word-to-definition"],
  cardFilter: "both",
  newReviewRatio: 2,
  focusFilter: { dateWindow: "today", timezone: "Europe/Amsterdam" },
  sessionSize: 5,
};

afterEach(() => {
  releaseTrainingSessionOwner();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("training session resume store", () => {
  test("cloned tab ownership rotates while same-tab reload retains its owner", async () => {
    const locks = new DeterministicOwnerLocks();
    const firstPageStorage = new MemorySessionStorage();
    const firstPage = createTrainingSessionOwnerCoordinator({
      storage: firstPageStorage,
      requestLock: locks.request,
      createOwnerId: () => "owner-first-page",
    });

    expect(await firstPage.resolveOwnerId()).toBe("owner-first-page");

    const duplicatedPage = createTrainingSessionOwnerCoordinator({
      storage: firstPageStorage.clone(),
      requestLock: locks.request,
      createOwnerId: () => "owner-duplicated-page",
    });
    expect(await duplicatedPage.resolveOwnerId()).toBe(
      "owner-duplicated-page",
    );

    firstPage.dispose();
    await Promise.resolve();
    await Promise.resolve();
    const reloadedFirstPage = createTrainingSessionOwnerCoordinator({
      storage: firstPageStorage,
      requestLock: locks.request,
      createOwnerId: () => "owner-should-not-replace-reload",
    });
    expect(await reloadedFirstPage.resolveOwnerId()).toBe("owner-first-page");

    duplicatedPage.dispose();
    reloadedFirstPage.dispose();
  });

  test("round-trips the exact session context per user", async () => {
    await writeTrainingSessionResume(record);
    expect(await readTrainingSessionResume("user-1")).toEqual(record);
    expect(await readTrainingSessionResume("another-user")).toBeNull();
  });

  test("does not let another tab adopt a shared resume record", async () => {
    await writeTrainingSessionResume(record);
    const persisted = window.localStorage.getItem(
      "2000nl:training-session:user-1",
    );
    expect(persisted).not.toBeNull();

    // A new tab has the same localStorage but its own sessionStorage owner.
    releaseTrainingSessionOwner();
    window.sessionStorage.clear();

    expect(await readTrainingSessionResume("user-1")).toBeNull();
    await clearTrainingSessionResume("user-1");
    expect(window.localStorage.getItem("2000nl:training-session:user-1")).toBe(
      persisted,
    );
  });

  test("rejects malformed or stale records", async () => {
    window.localStorage.setItem(
      "2000nl:training-session:user-1",
      JSON.stringify({ ...record, userId: "another-user" }),
    );
    expect(await readTrainingSessionResume("user-1")).toBeNull();

    window.localStorage.setItem(
      "2000nl:training-session:user-1",
      JSON.stringify({ ...record, sessionSize: "5" }),
    );
    expect(await readTrainingSessionResume("user-1")).toBeNull();
  });

  test("clears a session record without affecting another user", async () => {
    await writeTrainingSessionResume(record);
    await writeTrainingSessionResume({ ...record, userId: "another-user" });
    await clearTrainingSessionResume("user-1");
    expect(await readTrainingSessionResume("user-1")).toBeNull();
    expect(await readTrainingSessionResume("another-user")).toEqual({
      ...record,
      userId: "another-user",
    });
  });
});
