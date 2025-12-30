type Props = {
  visible: boolean;
  selectedCount: number;
  canSelectVisible: boolean;
  onSelectVisible: () => void;
  canClear: boolean;
  onClear: () => void;
  canDelete: boolean;
  onDelete: () => void;
};

export function BulkActionBar({
  visible,
  selectedCount,
  canSelectVisible,
  onSelectVisible,
  canClear,
  onClear,
  canDelete,
  onDelete,
}: Props) {
  if (!visible) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {selectedCount} geselecteerd
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canSelectVisible}
            onClick={onSelectVisible}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Selecteer zichtbare
          </button>
          <button
            type="button"
            disabled={!canClear}
            onClick={onClear}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Wis selectie
          </button>
          <button
            type="button"
            disabled={!canDelete}
            onClick={onDelete}
            className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            Verwijder geselecteerde
          </button>
        </div>
      </div>
    </div>
  );
}

