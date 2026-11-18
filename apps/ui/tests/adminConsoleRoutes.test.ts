import { describe, expect, it } from "vitest";
import { adminLegacyDestination, adminReturnPath, adminUserDestination } from "@/lib/admin/consoleRoutes";

const origin = "https://app.example.test";
const path = "/admin/reports/";

describe("legacy Admin bookmarks", () => {
  it("keeps sign-in and verified login returns with the backend", () => {
    expect(adminLegacyDestination({ view: "login", state: "expired" })).toBeNull();
    expect(adminLegacyDestination({ returnTo: `${path}?view=journal` })).toBeNull();
  });

  it("carries dictionary and Journal filters into the unified console", () => {
    expect(adminLegacyDestination({})).toBe(`${path}?view=dictionaries`);
    const journal = new URL(adminLegacyDestination({
      view: "journal", action: "auth.sign_in", page: "2", pageSize: "50",
      before: "2026-11-18T15:00:00Z", id: "unused", q: "unused",
    })!, origin);
    expect(Object.fromEntries(journal.searchParams)).toEqual({
      view: "journal", action: "auth.sign_in", page: "2", pageSize: "50", before: "2026-11-18T15:00:00Z",
    });
    const dictionary = new URL(adminLegacyDestination({ view: "detail", id: "dict&1", q: ["twee", "unused"] })!, origin);
    expect(Object.fromEntries(dictionary.searchParams)).toEqual({ view: "detail", id: "dict&1", q: "twee" });
    expect(adminUserDestination()).toBe(`${path}?view=users`);
    expect(new URL(adminUserDestination("u&1"), origin).searchParams.get("id")).toBe("u&1");
  });
});

describe("unified Admin login returns", () => {
  it.each([
    ["view=dictionaries", "dictionaries.read"],
    ["view=detail&id=dict", "dictionaries.read"],
    ["view=users&id=usr", "users.read"],
    ["view=journal&page=2", "audit.read"],
  ])("requires the permission for %s", (query, permission) => {
    const target = `${path}?${query}`;
    expect(adminReturnPath(target, origin, [permission], true)).toBe(target);
    expect(adminReturnPath(target, origin, ["feedback.read"], true)).toBeNull();
    expect(adminReturnPath(target, origin, [permission])).toBeNull();
  });

  it("rejects unknown views and external destinations", () => {
    const permissions = ["feedback.read", "audit.read"];
    for (const target of [`${path}?view=login`, `${path}?view=__proto__`, `//elsewhere.example${path}?view=journal`]) {
      expect(adminReturnPath(target, origin, permissions, true)).toBeNull();
    }
  });
});
