import { chromium } from "playwright";
import fs from "node:fs";
const out = "../../docs/design/565-article-rhythm";
const b = await chromium.launch(),
  p = await b.newPage();
const extra = process.env.RHYTHM_EXTRA === "1";
const insetReview = process.env.RHYTHM_INSET_REVIEW === "1";
const rows = extra
  ? JSON.parse(fs.readFileSync(`${out}/matrix.json`, "utf8")).map((r) => ({
      ...r,
      fixture: "gestalte",
    }))
  : [];
await p.route("**/*", (r) =>
  new URL(r.request().url()).origin === "http://localhost:3111" &&
  !new URL(r.request().url()).pathname.startsWith("/api/")
    ? r.continue()
    : r.abort(),
);
for (const fixture of ["gestalte", "goed"])
  for (const width of [390, 610, 695])
    for (const size of ["normal", "large", "largest", "extra"])
      for (const surface of ["article", "training"])
        for (const profile of ["balanced", "airy"])
          for (const treatment of ["current", "proposed"])
            for (const translation of ["off", "on", "partial"]) {
              if (insetReview && !(fixture === "gestalte" &&
                ((width === 695 && ["normal", "largest"].includes(size) && surface === "training") ||
                 (width === 390 && size === "large" && surface === "article")))) continue;
              if (
                (fixture === "goed" && surface === "training") ||
                (extra &&
                  fixture === "gestalte" &&
                  ["normal", "large"].includes(size))
              )
                continue;
              await p.setViewportSize({ width, height: 1000 });
              await p.goto(
                `http://localhost:3111/dev/article-rhythm?fixture=${fixture}&width=${width}&size=${size}&surface=${surface}&profile=${profile}&treatment=${treatment}&translation=${translation}`,
              );
              await p.locator("[data-content-node-id]").first().waitFor();
              await p.evaluate(() => document.fonts.ready);
              if (surface === "training" && translation !== "off") {
                const btn = p.getByRole("button", { name: /перев/i }).first();
                if (await btn.count()) await btn.click();
              }
              await p.addStyleTag({
                content: "nextjs-portal{display:none!important}",
              });
              await p.waitForTimeout(600);
              await p.evaluate(
                () =>
                  new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                  ),
              );
              const metrics = await p.evaluate(() => {
                const visible = (e) =>
                  e &&
                  !e.closest("[aria-hidden=true]") &&
                  e.getBoundingClientRect().height > 0;
                const lines = (e) => {
                  if (!e) return [];
                  const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT),
                    groups = [];
                  while (w.nextNode()) {
                    const n = w.currentNode;
                    for (let i = 0; i < n.textContent.length; i++) {
                      const range = document.createRange();
                      range.setStart(n, i);
                      range.setEnd(n, i + 1);
                      for (const r of range.getClientRects()) {
                        if (!r.width) continue;
                        let g = groups.find((g) => Math.abs(g.top - r.top) < 1);
                        if (!g) {
                          g = {
                            top: r.top,
                            bottom: r.bottom,
                            left: r.left,
                            right: r.right,
                            text: "",
                          };
                          groups.push(g);
                        }
                        g.left = Math.min(g.left, r.left);
                        g.right = Math.max(g.right, r.right);
                        g.bottom = Math.max(g.bottom, r.bottom);
                        g.text += n.textContent[i];
                      }
                    }
                  }
                  return groups.sort((a, b) => a.top - b.top);
                };
                const font = (e) => {
                  const s = getComputedStyle(e),
                    c = document.createElement("canvas").getContext("2d");
                  c.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
                  const m = c.measureText(e.textContent);
                  return {
                    size: s.fontSize,
                    leading: s.lineHeight,
                    inkHeightEstimate:
                      m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
                    position: s.position,
                  };
                };
                const nodes = [
                  ...document.querySelectorAll("[data-content-node-id]"),
                ]
                  .filter(visible)
                  .map((e) => {
                    const pair = e.firstElementChild,
                      o = pair.querySelector(
                        ":scope>p:not([data-content-translation])",
                      ),
                      t = pair.querySelector("[data-content-translation]"),
                      label = pair.querySelector("[data-role]");
                    const ol = lines(o),
                      tl = visible(t) ? lines(t) : [],
                      ll = visible(label) ? lines(label) : [];
                    const next =
                      e.nextElementSibling?.querySelector("[data-role]");
                    const end = tl.at(-1)?.bottom ?? ol.at(-1)?.bottom;
                    return {
                      id: e.dataset.contentNodeId,
                      kind: e.dataset.kind,
                      original: font(o),
                      translation: visible(t) ? font(t) : null,
                      label: visible(label) ? font(label) : null,
                      originalLines: ol,
                      translationLines: tl,
                      labelLines: ll,
                      wrappedLineGaps: ol
                        .slice(1)
                        .map((l, i) => l.top - ol[i].bottom),
                      pairRangeGap: tl.length
                        ? tl[0].top - ol.at(-1).bottom
                        : null,
                      labelOwnRangeGap: ll.length
                        ? ol[0].top - ll.at(-1).bottom
                        : null,
                      labelContentInset: ll.length ? ol[0].left - ll[0].left : null,
                      translationContentInset: ll.length && tl.length ? tl[0].left - ll[0].left : null,
                      previousGroupToNextLabelRangeGap:
                        visible(next) && end ? lines(next)[0].top - end : null,
                    };
                  });
                return {
                  overflow: document.documentElement.scrollWidth > innerWidth,
                  nodes,
                  clippedTranslations: [
                    ...document.querySelectorAll("[data-content-translation]"),
                  ]
                    .filter(visible)
                    .filter((e) => {
                      const r = e.getBoundingClientRect(),
                        parent = e.closest("[aria-hidden=false]");
                      return (
                        parent &&
                        parent.getBoundingClientRect().height < r.height - 1
                      );
                    })
                    .map((e) => e.textContent),
                };
              });
              if (
                treatment === "proposed" &&
                metrics.nodes.some(
                  (n) => n.label && n.label.position !== "static",
                )
              )
                throw new Error("Candidate label override lost");
              if (insetReview && treatment === "proposed" && metrics.nodes.some(
                n => n.label && (Math.abs(n.labelContentInset - 8) > 0.5 ||
                  (n.translationContentInset !== null && Math.abs(n.translationContentInset - 8) > 0.5))
              )) throw new Error("Nested heading/content hierarchy lost");
              if (insetReview && metrics.nodes.filter(n => n.label).length !== 2)
                throw new Error("Expected shared article renderer with both nested headings");
              rows.push({
                fixture,
                width,
                size,
                surface,
                profile,
                treatment,
                translation,
                ...metrics,
              });
              if (metrics.clippedTranslations.length)
                throw new Error(
                  "Reveal clipped " + JSON.stringify(rows.at(-1)),
                );
              if (metrics.overflow)
                throw new Error("Overflow " + JSON.stringify(rows.at(-1)));
              if (
                translation === "on" &&
                !metrics.nodes.some((n) => n.translationLines.length)
              )
                throw new Error(
                  "Missing visible translation " + JSON.stringify(rows.at(-1)),
                );
              if (
                fixture === "gestalte" &&
                ((width === 695 &&
                  ["normal", "largest"].includes(size) &&
                  surface === "training") ||
                  (width === 390 && size === "large" && surface === "article"))
              )
                await p.screenshot({
                  path: `${out}/${surface}-${width}-${size}-${profile}-${treatment}-${translation}.png`,
                  fullPage: true,
                });
            }
fs.writeFileSync(`${out}/${insetReview ? "inset-review" : "matrix"}.json`, JSON.stringify(rows, null, 2));
console.log(
  JSON.stringify({
    cases: rows.length,
    overflow: rows.filter((r) => r.overflow).length,
  }),
);
await b.close();
