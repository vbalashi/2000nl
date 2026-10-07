import type { Page } from "@playwright/test";

/** Fail geometry tests when Next's local Google Font fixtures did not load. */
export async function assertTestFontsReady(page: Page): Promise<void> {
  const readiness = await page.evaluate(async () => {
    const requestedFaces = [
      {
        descriptor: '400 16px "Inter"',
        family: "Inter",
        style: "normal",
        sample: "A",
      },
      {
        descriptor: '400 16px "Inter"',
        family: "Inter",
        style: "normal",
        sample: "Ж",
      },
      {
        descriptor: '400 32px "Newsreader"',
        family: "Newsreader",
        style: "normal",
        sample: "A",
      },
      {
        descriptor: 'italic 400 32px "Newsreader"',
        family: "Newsreader",
        style: "italic",
        sample: "A",
      },
    ];

    const loadedFaceSets = await Promise.all(
      requestedFaces.map(({ descriptor, sample }) =>
        document.fonts.load(descriptor, sample),
      ),
    );
    await document.fonts.ready;

    return requestedFaces.map(({ family, style, sample }, index) => {
      const matchingFaces = loadedFaceSets[index].filter(
        (candidate) =>
          candidate.family.replaceAll('"', "") === family &&
          candidate.style === style,
      );
      return {
        family,
        style,
        sample,
        loaded: matchingFaces.some((face) => face.status === "loaded"),
        status:
          matchingFaces.map((face) => face.status).join(", ") || "missing",
      };
    });
  });

  const failedFaces = readiness.filter((face) => !face.loaded);
  if (failedFaces.length > 0) {
    throw new Error(
      `Playwright font fixtures did not load: ${failedFaces
        .map(({ family, style, sample, status }) => `${family} ${style} for ${sample} (${status})`)
        .join(", ")}`,
    );
  }
}
