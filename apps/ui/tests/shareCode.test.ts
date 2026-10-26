import { describe, expect, it } from "vitest";
import { isCanonicalShareCode, parseShareCode, shareInvitationUrl } from "@/lib/collections/sharing/shareCode";

const origin = "https://2000.dilum.io";
const code = "0123456789ABCDEFGHJKMNPQRS";

describe("share invitation identity", () => {
  it("uses exactly the same code in the URL and pasted form", () => {
    const url = shareInvitationUrl(code, origin);
    expect(url).toBe(`${origin}/share#${code}`);
    expect(parseShareCode(url, origin)).toBe(code);
    expect(parseShareCode(code.toLowerCase(), origin)).toBe(code);
    expect(parseShareCode("012345-6789AB-CDEFGH-JKMNPQ-RS", origin)).toBe(code);
  });

  it.each([
    `${origin}.evil.test/share#${code}`,
    `https://user:password@2000.dilum.io/share#${code}`,
    `${origin}/share?next=https://evil.test#${code}`,
    `${origin}/share#${code}#secret`,
    `${origin}/share#${code}/extra`,
    `${origin}/share/${code}`,
    `${origin}/share/#${code}`,
    `${origin}/other#${code}`,
    `${origin}/share#%41${code.slice(1)}`,
    `//2000.dilum.io/share#${code}`,
    `javascript:${code}`,
    "I".repeat(26), "A".repeat(25), "A".repeat(27), " ".repeat(1025), null,
  ])("rejects ambiguous, external or malformed input", input => {
    expect(parseShareCode(input, origin)).toBeNull();
  });

  it.each(["A".repeat(24) + "ß", "A".repeat(25) + "ſ", "A".repeat(24) + "ﬀ"])(
    "rejects Unicode case-fold aliases in codes and pasted URLs", input => {
      expect(parseShareCode(input, origin)).toBeNull();
      expect(parseShareCode(`${origin}/share#${encodeURIComponent(input)}`, origin)).toBeNull();
    },
  );

  it("allows the same-origin local QA URL", () => {
    expect(parseShareCode(`http://localhost:3100/share#${code}`, "http://localhost:3100")).toBe(code);
    expect(parseShareCode(`http://localhost:3101/share#${code}`, "http://localhost:3100")).toBeNull();
  });

});

it("validates server codes without normalizing malformed or noncanonical output",()=>{
 expect(isCanonicalShareCode(code)).toBe(true);
 for(const value of [code.toLowerCase()," "+code,"I".repeat(26),null])expect(isCanonicalShareCode(value)).toBe(false);
});
