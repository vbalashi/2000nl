import { expect, test } from "vitest";
import { readBoundedJson } from "@/lib/http/readBoundedJson";
test("limits UTF-8 bytes regardless of a missing or misleading Content-Length", async () => {
  expect(
    await readBoundedJson(
      new Request("http://localhost", { method: "POST", body: '"éé"' }),
      6,
    ),
  ).toEqual({ body: "éé" });
  expect(
    await readBoundedJson(
      new Request("http://localhost", {
        method: "POST",
        body: '"éé"',
        headers: { "content-length": "1" },
      }),
      5,
    ),
  ).toEqual({ error: "too_large" });
});
test("malformed, absent and oversized declared requests stay distinguishable", async () => {
  expect(
    await readBoundedJson(
      new Request("http://localhost", { method: "POST", body: "{" }),
      10,
    ),
  ).toEqual({ error: "invalid" });
  expect(await readBoundedJson(new Request("http://localhost"), 10)).toEqual({
    error: "invalid",
  });
  expect(
    await readBoundedJson(
      new Request("http://localhost", {
        method: "POST",
        body: "{}",
        headers: { "content-length": "100" },
      }),
      10,
    ),
  ).toEqual({ error: "too_large" });
});
