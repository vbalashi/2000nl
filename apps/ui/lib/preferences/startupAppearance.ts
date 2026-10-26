import { isPracticePalette, type PracticePalette } from "@/components/practice/ui/appearance";

export const STARTUP_COOKIE = "2000nl_startup";
export type StartupThemeMode = "light" | "dark" | "system";
export type StartupAppearance = { palette: PracticePalette; mode: StartupThemeMode };
const isMode = (value: unknown): value is StartupThemeMode => value === "light" || value === "dark" || value === "system";

/** A cosmetic device hint only; never an account or training preference source. */
export function readStartupAppearance(cookie: string): StartupAppearance | null {
  const raw = cookie.split(";").map(value => value.trim()).find(value => value.startsWith(`${STARTUP_COOKIE}=`))?.slice(STARTUP_COOKIE.length + 1);
  const [version, palette, mode, extra] = (raw ?? "").split(":");
  return version === "v1" && isPracticePalette(palette) && isMode(mode) && extra === undefined ? { palette, mode } : null;
}
export function cacheStartupAppearance(palette: PracticePalette, mode?: StartupThemeMode) {
  if (!isPracticePalette(palette)) return;
  try {
    const root = document.documentElement;
    const accountMode = root.dataset.accountThemeMode;
    const resolvedMode = mode ?? (isMode(accountMode) ? accountMode : readStartupAppearance(document.cookie)?.mode ?? "system");
    document.cookie = `${STARTUP_COOKIE}=v1:${palette}:${resolvedMode}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    // Keep this launch visually stable. The next document reads the hint before paint.
  } catch { /* Storage restrictions must not block startup or a profile save. */ }
}

/** Runs in the head before the first paint, without waiting for React/profile IO. */
export const startupAppearanceBootstrap = `try{var r=document.documentElement,v=document.cookie.split(';').map(function(x){return x.trim()}).find(function(x){return x.indexOf('${STARTUP_COOKIE}=')===0});if(v){var a=v.slice(${STARTUP_COOKIE.length + 1}).split(':');if(a.length===3&&a[0]==='v1'&&['lavender','blue','indigo','graphite'].indexOf(a[1])!==-1&&['light','dark','system'].indexOf(a[2])!==-1){r.dataset.startupPalette=a[1];r.dataset.startupThemeMode=a[2];r.dataset.startupMode=a[2]==='dark'||a[2]==='system'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}}}catch(e){}`;
