// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, {recursive: true, force: true}); });
function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "interface-localization-"));
  directories.push(directory);
  const save = (name: string, value: unknown) => writeFileSync(path.join(directory, name), JSON.stringify(value));
  save("registry.json", {en: {name: "English", direction: "ltr"}, ru: {name: "Русский", direction: "ltr"}});
  save("en.json", {greeting: "Hello {name}", buttons: ["Start", "Stop"], optional: null});
  save("ru.json", {greeting: "Привет, {name}", buttons: ["Начать", "Остановить"], optional: null});
  const run = (...args: string[]) => spawnSync(process.execPath, [path.resolve("scripts/interface-localization.mjs"), ...args, "--catalog-dir", directory], {encoding: "utf8"});
  const report = (locale = "ru") => JSON.parse(run("report", "--locale", locale, "--json").stdout);
  return {directory, save, run, report};
}

test("an English edit makes an existing translation stale even when its key is unchanged", () => {
  const f = fixture();
  expect(f.run("review", "--locale", "ru", "--all").status).toBe(0);
  expect(f.run("check").status).toBe(0);
  f.save("en.json", {greeting: "Welcome {name}", buttons: ["Start", "Stop"], optional: null});
  expect(f.run("check").status).toBe(1);
  expect(f.report().locales[0].issues).toEqual([{key: "greeting", status: "outdated", previousSource: "Hello {name}", source: "Welcome {name}", translation: "Привет, {name}"}]);
  // Updating generated imports must never acknowledge old translations.
  expect(f.run("sync").status).toBe(0);
  expect(f.run("check").status).toBe(1);
  expect(f.run("review", "--locale", "ru", "--key", "greeting").status).toBe(0);
  expect(f.run("check").status).toBe(0);
});

test("translation edits require acknowledgement and reviewing one key leaves other changes pending", () => {
  const f = fixture();
  f.run("review", "--locale", "ru", "--all");
  f.save("ru.json", {greeting: "Здравствуйте, {name}", buttons: ["Запустить", "Остановить"], optional: null});
  expect(f.report().locales[0].issues.map((issue: {status: string}) => issue.status)).toEqual(["translation-changed", "translation-changed"]);
  f.run("review", "--locale", "ru", "--key", "greeting");
  expect(f.report().locales[0].issues.map((issue: {key: string}) => issue.key)).toEqual(["buttons.0"]);
});

test("missing keys, blank messages, broken variables, array shape and extra keys block checks", () => {
  const f = fixture();
  f.save("ru.json", {greeting: "Привет, {person}", buttons: ["", "Остановить", "Лишнее"], extra: "Лишнее", optional: "not null"});
  const issues = f.report().locales[0].issues;
  expect(issues).toEqual(expect.arrayContaining([
    {key: "greeting", status: "parameters"}, {key: "buttons.0", status: "blank"},
    {key: "buttons.2", status: "extra"}, {key: "extra", status: "extra"}, {key: "optional", status: "shape"},
  ]));
  expect(f.run("review", "--locale", "ru", "--all").status).toBe(1);
  f.save("ru.json", {buttons: ["Начать"], optional: null});
  expect(f.report().locales[0].issues).toEqual(expect.arrayContaining([{key: "greeting", status: "missing"}, {key: "buttons.1", status: "missing"}]));
});

test("a prepared language stays disabled and every copied English message needs review", () => {
  const f = fixture();
  expect(f.run("prepare", "--locale", "uk").status).toBe(0);
  expect(JSON.parse(readFileSync(path.join(f.directory, "registry.json"), "utf8"))).not.toHaveProperty("uk");
  expect(f.report("uk").locales[0].issues).toHaveLength(3);
  expect(f.run("check", "--locale", "uk").status).toBe(1);
  expect(f.run("prepare", "--locale", "uk").status).toBe(1);
});

test("unsafe locale paths and accidental bulk review are rejected", () => {
  const f = fixture();
  expect(f.run("prepare", "--locale", "../outside").status).toBe(1);
  expect(f.run("review", "--locale", "ru").status).toBe(1);
});

test("a new AI settings note is scaffolded into active and draft catalogs without approving translations", () => {
  const f = fixture();
  expect(f.run("review", "--locale", "ru", "--all").status).toBe(0);
  expect(f.run("prepare", "--locale", "uk").status).toBe(0);
  const key = "ui.settings.translationAttribution";
  const source = "Translations are provided by an AI service.";
  expect(f.run("add", "--key", key, "--text", source).status).toBe(0);
  for (const locale of ["en", "ru", "uk"]) {
    const catalog = JSON.parse(readFileSync(path.join(f.directory, `${locale}.json`), "utf8"));
    expect(catalog.ui.settings.translationAttribution).toBe(source);
  }
  expect(f.report().locales[0].issues).toEqual([{key, status:"unreviewed", source, translation:source}]);
  expect(f.run("check").status).toBe(1);
  expect(f.run("sync").status).toBe(0);
  expect(f.run("check").status).toBe(1);
  const russian = JSON.parse(readFileSync(path.join(f.directory, "ru.json"), "utf8"));
  russian.ui.settings.translationAttribution = "Переводы предоставляются с помощью ИИ.";
  f.save("ru.json", russian);
  expect(f.run("review", "--locale", "ru", "--key", key).status).toBe(0);
  expect(f.run("check").status).toBe(0);
  expect(f.run("check", "--locale", "uk").status).toBe(1);
  // Source edits still invalidate this new translation.
  const english = JSON.parse(readFileSync(path.join(f.directory, "en.json"), "utf8"));
  english.ui.settings.translationAttribution = "AI translations may contain errors.";
  f.save("en.json", english);
  expect(f.report().locales[0].issues[0].status).toBe("outdated");
});

test("adding a message refuses collisions and unsafe paths without changing other catalogs", () => {
  const f = fixture();
  const before = readFileSync(path.join(f.directory, "en.json"), "utf8");
  expect(f.run("add", "--key", "greeting", "--text", "Overwrite").status).toBe(1);
  expect(f.run("add", "--key", "ui.constructor.changed", "--text", "Unsafe").status).toBe(1);
  expect(f.run("add", "--key", "buttons.caption", "--text", "Wrong parent").status).toBe(1);
  expect(readFileSync(path.join(f.directory, "en.json"), "utf8")).toBe(before);
});
