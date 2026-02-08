import { describe, expect, it } from "vitest";
import { createAudioProvider } from "@/lib/audio/audioProviderFactory";

describe("audioProviderFactory", () => {
  it("creates azure provider when premium + azure selected", () => {
    const provider = createAudioProvider({ quality: "premium", premiumProviderId: "azure" });
    expect(provider.id).toBe("azure");
    expect(provider.getQuality()).toBe("premium");
  });

  it("creates google provider when premium + google selected", () => {
    const provider = createAudioProvider({ quality: "premium", premiumProviderId: "google" });
    expect(provider.id).toBe("google");
    expect(provider.getQuality()).toBe("premium");
  });

  it("creates free provider by default", () => {
    const provider = createAudioProvider();
    expect(provider.id).toBe("free");
    expect(provider.getQuality()).toBe("free");
  });
});

