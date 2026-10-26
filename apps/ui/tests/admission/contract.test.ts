import { expect, test } from "vitest";
import { parseAdmissionMutation } from "@/lib/admission/contract";
test("batch is explicit, normalized, unique, bounded and does not accept target user IDs", () => {
  expect(parseAdmissionMutation({ action: "approve", emails: [" Person@Example.com ", "person@example.com"] })).toEqual({ action: "approve", emails: ["person@example.com"], mode: null });
  for (const body of [{ action: "approve", all: true }, { action: "approve", emails: [] }, { action: "approve", emails: ["bad"] }, { action: "approve", emails: Array(101).fill("a@example.com") }, { action: "mode", mode: "anything" }]) expect(parseAdmissionMutation(body)).toBeNull();
});
