import { describe, expect, it } from "vitest";
import { parseCardParams } from "@/lib/cardParams";

const makeParams = (query: string) => new URLSearchParams(query);

describe("parseCardParams", () => {
  it("parses wordId, layout, and devMode", () => {
    const params = makeParams("wordId=fiets&layout=w2d&devMode=true");
    const result = parseCardParams(params);

    expect(result).toEqual({
      wordId: "fiets",
      layout: "word-to-definition",
      devMode: true
    });
  });

  it("trims wordId and ignores empty values", () => {
    const withWhitespace = parseCardParams(makeParams("wordId=%20fiets%20"));
    expect(withWhitespace.wordId).toBe("fiets");

    const empty = parseCardParams(makeParams("wordId=\t\n"));
    expect(empty.wordId).toBeUndefined();
  });

  it("maps layout shorthands", () => {
    expect(parseCardParams(makeParams("layout=d2w")).layout).toBe(
      "definition-to-word"
    );
    expect(parseCardParams(makeParams("layout=w2d")).layout).toBe(
      "word-to-definition"
    );
    expect(parseCardParams(makeParams("layout=unknown")).layout).toBeUndefined();
  });

  it("interprets devMode flags", () => {
    expect(parseCardParams(makeParams("devMode")).devMode).toBe(true);
    expect(parseCardParams(makeParams("devMode=1")).devMode).toBe(true);
    expect(parseCardParams(makeParams("devMode=yes")).devMode).toBe(true);
    expect(parseCardParams(makeParams("devMode=false")).devMode).toBe(false);
    expect(parseCardParams(makeParams("")).devMode).toBe(false);
  });
});
