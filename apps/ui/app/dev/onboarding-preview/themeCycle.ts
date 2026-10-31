import type {ThemePreference} from "@/lib/training/useTrainingPreferences";
export function nextPreviewTheme(current:ThemePreference):ThemePreference {
 return current==="light"?"dark":current==="dark"?"system":"light";
}
