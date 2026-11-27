import { useResizableSheet } from "@/components/practice/ui/useResizableSheet";

export { sheetBounds, clampSheetHeight } from "@/components/practice/ui/useResizableSheet";

export function useLibrarySheetResize(resetKey: string | null, onDismiss?: () => void, toggleFullHeight = false) {
  return useResizableSheet(resetKey, onDismiss, { snapOnDrag: false, toggleFullHeight });
}
