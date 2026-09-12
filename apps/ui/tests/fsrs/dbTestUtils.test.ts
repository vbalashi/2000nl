import { afterEach, describe, expect, test, vi } from "vitest";
import { getDbUrl } from "./dbTestUtils";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getDbUrl", () => {
  test("ignores application database aliases when the explicit FSRS URL is absent", () => {
    vi.stubEnv("FSRS_TEST_DB_URL", "");
    vi.stubEnv(
      "SUPABASE_DB_URL",
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    );
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://postgres:postgres@db.example/production",
    );

    expect(getDbUrl()).toBeUndefined();
  });

  test.each([
    "postgresql://postgres:postgres@db.example/fsrs_test",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  ])("rejects an unsafe explicit FSRS target before a Pool can connect: %s", (url) => {
    vi.stubEnv("FSRS_TEST_DB_URL", url);

    expect(() => getDbUrl()).toThrow("unsafe_fsrs_test_database_url");
  });

  test.each([
    "postgresql://postgres:postgres@localhost:5432/fsrs_test",
    "postgresql://postgres:postgres@127.0.0.1:54322/2000nl_fsrs_12345",
  ])("accepts a scoped loopback FSRS test database: %s", (url) => {
    vi.stubEnv("FSRS_TEST_DB_URL", url);

    expect(getDbUrl()).toBe(url);
  });
});
