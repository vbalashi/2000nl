import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

// Resolve Playwright from apps/ui; run.sh executes scripts with apps/ui as cwd.
const require = createRequire(path.resolve("package.json"));
const { chromium, devices } = require("@playwright/test");

export const URL = "https://2000.dilum.io/";
export const STORAGE_KEY = "sb-lliwdcpuuzjmxyzrjtoz-auth-token";
export const OUT = path.resolve(
  process.env.LATENCY_AUDIT_OUT ?? "../../tmp/latency-audit/out",
);
fs.mkdirSync(OUT, { recursive: true });

export async function openAuthed({ mobile = false } = {}) {
  const session = JSON.parse(fs.readFileSync(process.env.SESSION_JSON, "utf8")).session;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(
    mobile ? { ...devices["iPhone 13"] } : { viewport: { width: 1280, height: 900 } },
  );
  await context.addInitScript(() => {
    window.__lat = { timings: [] };
    window.addEventListener("2000nl:training-transition-timing", (e) => {
      window.__lat.timings.push(e.detail);
    });
  });
  const page = await context.newPage();
  if (mobile) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 100,
      downloadThroughput: (9 * 1024 * 1024) / 8,
      uploadThroughput: (1.5 * 1024 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  const net = [];
  page.on("requestfinished", async (req) => {
    try {
      const res = await req.response();
      const u = new globalThis.URL(req.url());
      if (!u.pathname.startsWith("/api/") && !u.hostname.endsWith("supabase.co")) return;
      const t = req.timing();
      const h = res ? await res.allHeaders() : {};
      const sizes = await req.sizes().catch(() => null);
      net.push({
        at: Date.now(),
        method: req.method(),
        host: u.hostname,
        path: u.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, ":id"),
        rpc: u.pathname.includes("/rest/v1/rpc/") ? u.pathname.split("/").pop() : undefined,
        status: res?.status(),
        startMs: t.startTime,
        ttfbMs: t.responseStart,
        totalMs: t.responseEnd,
        serverTiming: h["server-timing"],
        requestId: h["x-request-id"],
        reviewOutcome: h["x-platform-review-outcome"],
        cfCache: h["cf-cache-status"],
        respBytes: sizes?.responseBodySize,
      });
    } catch {}
  });
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([k, v]) => {
      for (const key of Object.keys(localStorage)) if (key.startsWith("sb-")) localStorage.removeItem(key);
      localStorage.setItem(k, v);
    },
    [STORAGE_KEY, JSON.stringify(session)],
  );
  return { browser, context, page, net };
}

export async function visibleButtons(page) {
  return page.$$eval("button, a[role=button], [role=tab]", (els) =>
    els
      .filter((e) => e.offsetParent !== null)
      .map((e) => `${e.tagName}:${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 60)}${e.disabled ? " [disabled]" : ""}`),
  );
}
