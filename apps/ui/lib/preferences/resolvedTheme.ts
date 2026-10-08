/** Resolves appearance without reading or writing a second preference store. */
export function applyResolvedTheme(root: HTMLElement, systemDark: boolean) {
  const mode = root.dataset.accountThemeMode ?? root.dataset.startupThemeMode;
  root.classList.toggle(
    "dark",
    mode === "dark" || (mode !== "light" && systemDark),
  );
}
