import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const registry = JSON.parse(read("../locales/registry.json"));
const messages = Object.fromEntries(Object.entries(registry).map(([locale, { direction }]) => {
  const { activeTitle, activeWait, activeReturn } = JSON.parse(read(`../locales/${locale}.json`)).ui.maintenance;
  return [locale, { direction, activeTitle, activeWait, activeReturn }];
}));
const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const { activeTitle, activeWait, activeReturn } = messages.en;

process.stdout.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(activeTitle)} · 2000nl</title>
  <style>${read("../styles/maintenance-screen.css")}</style>
  <script>
    const mode = document.cookie.match(/(?:^|; *)2000nl_startup=v1:[a-z]+:(light|dark|system)(?:;|$)/)?.[1];
    if (mode === "dark" || (mode !== "light" && matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.classList.add("dark");
    }
  </script>
</head>
<body>
  <main class="maintenance-screen" aria-labelledby="maintenance-title">
    <p class="maintenance-brand">2000<span class="maintenance-accent">nl</span></p>
    <div class="maintenance-wait" role="status">
      <div class="maintenance-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 7v5h-5M4 17v-5h5M6 8a7 7 0 0 1 12-2l2 6M4 12l2 6a7 7 0 0 0 12-2"/>
        </svg>
      </div>
      <h1 id="maintenance-title">${escapeHtml(activeTitle)}</h1>
      <p id="maintenance-wait">${escapeHtml(activeWait)}</p>
      <p id="maintenance-return">${escapeHtml(activeReturn)}</p>
    </div>
  </main>
  <script>
    (() => {
      const messages = ${JSON.stringify(messages).replaceAll("<", "\\u003c")};
      let saved;
      try { saved = localStorage.getItem("onboarding_language"); } catch {}
      const languages = [saved, ...navigator.languages, navigator.language];
      const locale = languages.map(value => value?.toLowerCase().split("-")[0])
        .find(value => Object.hasOwn(messages, value)) ?? "en";
      const copy = messages[locale];
      document.documentElement.lang = locale;
      document.documentElement.dir = copy.direction;
      document.title = copy.activeTitle + " · 2000nl";
      document.getElementById("maintenance-title").textContent = copy.activeTitle;
      document.getElementById("maintenance-wait").textContent = copy.activeWait;
      document.getElementById("maintenance-return").textContent = copy.activeReturn;

      let checking = false;
      async function check() {
        if (checking || document.hidden) return;
        checking = true;
        const request = new AbortController();
        const timeout = setTimeout(() => request.abort(), 8000);
        try {
          const response = await fetch("/api/app-maintenance", { cache: "no-store", signal: request.signal });
          if (response.ok && (await response.json()).phase === "available") location.reload();
        } catch {
          // Keep waiting when the connection disappears.
        } finally {
          clearTimeout(timeout);
          checking = false;
        }
      }
      setInterval(check, 15000);
      document.addEventListener("visibilitychange", check);
      addEventListener("focus", check);
      addEventListener("online", check);
      void check();
    })();
  </script>
</body>
</html>
`);
