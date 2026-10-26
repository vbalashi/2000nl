import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cacheStartupAppearance, readStartupAppearance, STARTUP_COOKIE, startupAppearanceBootstrap } from "@/lib/preferences/startupAppearance";
import { practicePalettes } from "@/components/practice/ui/appearance";
beforeEach(() => {
  document.cookie = `${STARTUP_COOKIE}=; Max-Age=0; Path=/`;
  for (const key of ["startupPalette", "startupMode", "startupThemeMode", "accountThemeMode"]) delete document.documentElement.dataset[key];
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
});
afterEach(() => { vi.unstubAllGlobals(); document.cookie = `${STARTUP_COOKIE}=; Max-Age=0; Path=/`; });
test.each(["", "2000nl_startup=v2:blue:dark", "2000nl_startup=v1:unknown:dark", "2000nl_startup=v1:blue:unknown", "2000nl_startup=v1:blue:dark:extra", "2000nl_startup=v1:<script>:dark"])("invalid hint stays neutral: %s", cookie => {
  expect(readStartupAppearance(cookie)).toBeNull();
});
test.each(practicePalettes)("confirmed $id palette bootstraps before React", ({id}) => {
  cacheStartupAppearance(id, "system");
  expect(readStartupAppearance(document.cookie)).toEqual({palette:id,mode:"system"});
  delete document.documentElement.dataset.startupPalette;
  new Function(startupAppearanceBootstrap)();
  expect(document.documentElement.dataset.startupPalette).toBe(id);
  expect(document.documentElement.dataset.startupMode).toBe("dark");
});
test("profile theme owner replaces cached mode", () => {
  cacheStartupAppearance("blue", "dark");
  document.documentElement.dataset.accountThemeMode = "light";
  cacheStartupAppearance("blue");
  expect(readStartupAppearance(document.cookie)).toEqual({palette:"blue",mode:"light"});
  new Function(startupAppearanceBootstrap)();
  expect(document.documentElement.dataset.startupMode).toBe("light");
});
test("unavailable cookie storage cannot break confirmed profile settings", () => {
  const spy = vi.spyOn(document, "cookie", "set").mockImplementation(() => { throw new Error("blocked"); });
  expect(() => cacheStartupAppearance("indigo")).not.toThrow();
  spy.mockRestore();
});

test("confirmed profile writes the next-launch hint without recoloring the current wait", () => {
  document.documentElement.dataset.startupPalette = "blue";
  document.documentElement.dataset.startupMode = "dark";
  cacheStartupAppearance("lavender", "light");
  expect(document.documentElement.dataset.startupPalette).toBe("blue");
  expect(document.documentElement.dataset.startupMode).toBe("dark");
  expect(readStartupAppearance(document.cookie)).toEqual({palette:"lavender",mode:"light"});
  new Function(startupAppearanceBootstrap)();
  expect(document.documentElement.dataset.startupPalette).toBe("lavender");
  expect(document.documentElement.dataset.startupMode).toBe("light");
});
