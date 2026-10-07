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

    return requestedFaces.map(({ family, style }, index) => {
      const face = loadedFaceSets[index].find(
        (candidate) => candidate.family.replaceAll('"', "") === family,
      );
      return {
        family,
        style,
        loaded: Boolean(face && face.status === "loaded"),
        status: face?.status ?? "missing",
      };
    });
  });

  const failedFaces = readiness.filter((face) => !face.loaded);
  if (failedFaces.length > 0) {
    throw new Error(
      `Playwright font fixtures did not load: ${failedFaces
        .map(({ family, style, status }) => `${family} ${style} (${status})`)
        .join(", ")}`,
    );
  }
}
