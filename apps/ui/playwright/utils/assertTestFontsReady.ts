import type { Page } from "@playwright/test";

/** Fail geometry tests when Next's local Google Font fixtures did not load. */
export async function assertTestFontsReady(page: Page): Promise<void> {
  const readiness = await page.evaluate(async () => {
    const requestedFaces = [
      { descriptor: '400 16px "Inter"', family: "Inter", style: "normal" },
      {
        descriptor: '400 32px "Newsreader"',
        family: "Newsreader",
        style: "normal",
      },
      {
        descriptor: 'italic 400 32px "Newsreader"',
        family: "Newsreader",
        style: "italic",
      },
    ];

    await Promise.all(
      requestedFaces.map(({ descriptor }) =>
        document.fonts.load(descriptor, "2000nl font check"),
      ),
    );
    await document.fonts.ready;

    const faces = [...document.fonts];
    return requestedFaces.map(({ family, style }) => {
      const face = faces.find(
        (candidate) =>
          candidate.family.replaceAll('"', "") === family &&
          candidate.style === style,
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
