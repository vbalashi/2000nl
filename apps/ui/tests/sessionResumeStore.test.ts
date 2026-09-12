import { afterEach, describe, expect, test } from "vitest";
import {
  clearTrainingSessionResume,
  readTrainingSessionResume,
  writeTrainingSessionResume,
  type TrainingSessionResumeRecord,
} from "@/lib/training/sessionResumeStore";

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
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("training session resume store", () => {
  test("round-trips the exact session context per user", () => {
    writeTrainingSessionResume(record);
    expect(readTrainingSessionResume("user-1")).toEqual(record);
    expect(readTrainingSessionResume("another-user")).toBeNull();
  });

  test("does not let another tab adopt a shared resume record", () => {
    writeTrainingSessionResume(record);
    const persisted = window.localStorage.getItem(
      "2000nl:training-session:user-1",
    );
    expect(persisted).not.toBeNull();

    // A new tab has the same localStorage but its own sessionStorage owner.
    window.sessionStorage.clear();

    expect(readTrainingSessionResume("user-1")).toBeNull();
    clearTrainingSessionResume("user-1");
    expect(window.localStorage.getItem("2000nl:training-session:user-1")).toBe(
      persisted,
    );
  });

  test("rejects malformed or stale records", () => {
    window.localStorage.setItem(
      "2000nl:training-session:user-1",
      JSON.stringify({ ...record, userId: "another-user" }),
    );
    expect(readTrainingSessionResume("user-1")).toBeNull();

    window.localStorage.setItem(
      "2000nl:training-session:user-1",
      JSON.stringify({ ...record, sessionSize: "5" }),
    );
    expect(readTrainingSessionResume("user-1")).toBeNull();
  });

  test("clears a session record without affecting another user", () => {
    writeTrainingSessionResume(record);
    writeTrainingSessionResume({ ...record, userId: "another-user" });
    clearTrainingSessionResume("user-1");
    expect(readTrainingSessionResume("user-1")).toBeNull();
    expect(readTrainingSessionResume("another-user")).toEqual({
      ...record,
      userId: "another-user",
    });
  });
});
