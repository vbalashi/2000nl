import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  localAudioAssetExists,
  normalizeAudioLinks,
  normalizeDictionaryContent,
} from "@/lib/platform/projections/dictionaryContent";

describe("platform dictionary content audio links", () => {
  let publicRoot: string;

  beforeEach(() => {
    publicRoot = fs.mkdtempSync(path.join(os.tmpdir(), "2000nl-audio-public-"));
    process.env.PLATFORM_AUDIO_PUBLIC_ROOT = publicRoot;
  });

  afterEach(() => {
    delete process.env.PLATFORM_AUDIO_PUBLIC_ROOT;
    fs.rmSync(publicRoot, { recursive: true, force: true });
  });

  test("keeps local curated audio only when the file exists", () => {
    const audioPath = path.join(publicRoot, "audio", "nl", "s");
    fs.mkdirSync(audioPath, { recursive: true });
    fs.writeFileSync(path.join(audioPath, "snuffelen.mp3"), "mp3");

    expect(
      normalizeAudioLinks({
        nl: "/audio/nl/s/snuffelen.mp3",
        be: "/audio/be/s/missing.mp3",
        external: "https://cdn.example/audio.mp3",
      }),
    ).toEqual({
      nl: "/audio/nl/s/snuffelen.mp3",
      external: "https://cdn.example/audio.mp3",
    });
  });

  test("omits local curated audio when the file is missing", () => {
    const content = normalizeDictionaryContent({
      id: "entry-1",
      language_code: "nl",
      headword: "snuffelen",
      raw: {
        meanings: [{ definition: "zoeken" }],
        audio_links: {
          nl: "/audio/nl/s/missing.mp3",
        },
      },
    });

    expect(content.audioLinks).toBeUndefined();
  });

  test("rejects encoded traversal in local audio links", () => {
    expect(localAudioAssetExists("/audio/%2E%2E/secret.mp3")).toBe(false);
  });

  test("keeps local curated links when the default audio root is not inspectable", () => {
    delete process.env.PLATFORM_AUDIO_PUBLIC_ROOT;

    expect(
      normalizeAudioLinks({
        nl: "/audio/nl/f/bH0re-0SrLgbBageu45d-A.mp3",
      }),
    ).toEqual({
      nl: "/audio/nl/f/bH0re-0SrLgbBageu45d-A.mp3",
    });
  });
});
