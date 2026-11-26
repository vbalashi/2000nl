import { useResizableSheet } from "@/components/practice/ui/useResizableSheet";

export { sheetBounds, clampSheetHeight } from "@/components/practice/ui/useResizableSheet";

export function useLibrarySheetResize(resetKey: string | null, onDismiss?: () => void) {
  return useResizableSheet(resetKey, onDismiss, { snapOnDrag: false });
}
