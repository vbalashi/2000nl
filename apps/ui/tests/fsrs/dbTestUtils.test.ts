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
    "postgresql://postgres:postgres@localhost:5432/fsrs_test?host=db.example.com",
    "postgresql://postgres:postgres@localhost:5432/fsrs_test?hostaddr=203.0.113.10",
    "postgresql://postgres:postgres@localhost:5432/fsrs_test?service=production",
    "postgresql://postgres:postgres@localhost:5432/fsrs_test?port=6432",
    "postgresql://postgres:postgres@localhost:5432/fsrs_test?dbname=production",
  ])("rejects an unsafe explicit FSRS target before a Pool can connect: %s", (url) => {
    vi.stubEnv("FSRS_TEST_DB_URL", url);

    expect(() => getDbUrl()).toThrow("unsafe_fsrs_test_database_url");
  });

  test.each([
    "postgresql://postgres:postgres@localhost:5432/fsrs_test",
    "postgresql://postgres:postgres@127.0.0.1:54322/2000nl_fsrs_12345",
    "postgresql://postgres:postgres@localhost:5432/fsrs_test?sslmode=disable",
  ])("accepts a scoped loopback FSRS test database: %s", (url) => {
    vi.stubEnv("FSRS_TEST_DB_URL", url);

    expect(getDbUrl()).toBe(url);
  });
});
