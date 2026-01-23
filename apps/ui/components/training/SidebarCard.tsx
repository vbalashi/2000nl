import React from "react";
import { SidebarHistoryItem } from "@/lib/types";
import { Tooltip } from "@/components/Tooltip";
import { InteractiveText } from "./InteractiveText";
import { buildSegments, getPrimaryMeaning } from "@/lib/wordUtils";

type Props = {
  entry: SidebarHistoryItem;
  highlightedWord?: string;
  onWordClick: (word: string) => void;
  onSelect: () => void; // Called when clicking the card itself (optional, maybe to scroll or focus)
  onShowDetails?: () => void; // Called when clicking the info icon
};

export function SidebarCard({
  entry,
  highlightedWord,
  onWordClick,
  onSelect,
  onShowDetails,
}: Props) {
  // Check if this is a "not found" entry (word clicked but not in dictionary)
  const isNotFound = entry.id.startsWith("not-found-");

  const meaning = getPrimaryMeaning(entry.raw);
  const segments = isNotFound
    ? [{ text: "", link: null }]
    : buildSegments(meaning.definition, meaning.links);

  // Background styles based on review result to mirror button tones
  const toneStyles: Record<
    NonNullable<SidebarHistoryItem["result"]> | "neutral",
    string
  > = {
    fail: "bg-red-50/80 border-red-200 dark:bg-red-900/20 dark:border-red-800",
    hard: "bg-amber-50/80 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
    success:
      "bg-emerald-50/80 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800",
    easy: "bg-green-100/70 border-green-200 dark:bg-green-900/25 dark:border-green-800",
    neutral:
      "bg-white dark:bg-slate-900/70 border-slate-200 dark:border-slate-700",
  };
  const bgStyles = toneStyles[entry.result ?? "neutral"] ?? toneStyles.neutral;

  // Header Logic: Clicked vs Found
  const showClickedWord =
    entry.clickedWord &&
    entry.clickedWord.toLowerCase() !== entry.headword.toLowerCase();

  return (
    <div
      onClick={onSelect}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition hover:border-primary ${bgStyles}`}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {showClickedWord && (
              <>
                <span className="rounded bg-pink-100 px-1.5 py-0.5 text-base font-semibold text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                  {entry.clickedWord}
                </span>
                <span className="text-slate-500">→</span>
              </>
            )}
            <span
              className={`text-base font-semibold ${
                showClickedWord
                  ? "text-green-700 dark:text-green-400"
                  : "text-slate-900 dark:text-white"
              }`}
            >
              {entry.headword}
            </span>
            {entry.is_nt2_2000 && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-bold uppercase text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                2k
              </span>
            )}
            {entry.debugStats?.mode && (
              <Tooltip
                content={
                  entry.debugStats.mode === "word-to-definition"
                    ? "Woord → Definitie"
                    : "Definitie → Woord"
                }
                side="top"
              >
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  {entry.debugStats.mode === "word-to-definition"
                    ? "W→D"
                    : "D→W"}
                </span>
              </Tooltip>
            )}
            {/* Show definition number if there are multiple meanings */}
            {(() => {
              const meaningId = entry.raw?.meaning_id;
              const meaningsCount = entry.meanings_count ?? 1;
              // Database meaning_id is 1-indexed. Show badge if:
              // - meanings_count > 1 (we know there are multiple), or
              // - meaning_id > 1 (implies there's at least meaning #1 and this one)
              const hasMultipleMeanings = meaningsCount > 1 || (typeof meaningId === "number" && meaningId > 1);
              if (hasMultipleMeanings && typeof meaningId === "number") {
                const tooltipText =
                  meaningsCount > 1
                    ? `Definitie ${meaningId} van ${meaningsCount}`
                    : `Definitie ${meaningId}`;
                return (
                  <Tooltip content={tooltipText} side="top">
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      #{meaningId}
                    </span>
                  </Tooltip>
                );
              }
              return null;
            })()}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {entry.part_of_speech ?? "—"}
            </span>
            {onShowDetails && (
              <Tooltip content="Bekijk details (i)" side="top">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowDetails();
                  }}
                  className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  aria-label="Bekijk details"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="10" strokeWidth="2" />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 16v-4m0-4h.01"
                    />
                  </svg>
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {isNotFound ? (
            <span className="italic text-slate-500 dark:text-slate-400">
              geen definitie gevonden
            </span>
          ) : (
            <>
              <InteractiveText
                segments={segments}
                highlightedWord={highlightedWord}
                onWordClick={onWordClick}
                excludeWord={entry.headword}
              />
              {meaning.context && (
                <span className="block mt-0.5 text-xs text-slate-500 font-normal">
                  [{meaning.context}]
                </span>
              )}
            </>
          )}
        </div>

        {/* Stats Row */}
        {(entry.stats || entry.debugStats) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-slate-100 pt-2 text-[10px] font-medium text-slate-500 dark:border-slate-800">
            {entry.debugStats?.source && (
              <span>
                src:{" "}
                <span className="text-slate-600 dark:text-slate-300">
                  {entry.debugStats.source}
                </span>
              </span>
            )}
            {typeof entry.debugStats?.interval === "number" && (
              <span>
                int:{" "}
                <span className="text-blue-500 dark:text-blue-400">
                  {typeof entry.debugStats.previousInterval === "number"
                    ? `${entry.debugStats.previousInterval.toFixed(2)}→${entry.debugStats.interval.toFixed(2)}d`
                    : `${entry.debugStats.interval.toFixed(2)}d`}
                </span>
              </span>
            )}
            {typeof entry.debugStats?.reps === "number" && (
              <span>
                reps:{" "}
                <span className="text-green-500 dark:text-green-400">
                  {entry.debugStats.reps}
                </span>
              </span>
            )}
            {typeof entry.debugStats?.ef === "number" && (
              <span>
                S:{" "}
                <span className="text-yellow-500 dark:text-yellow-400">
                  {typeof entry.debugStats.previousStability === "number"
                    ? `${entry.debugStats.previousStability.toFixed(1)}→${entry.debugStats.ef.toFixed(1)}`
                    : entry.debugStats.ef.toFixed(1)}
                </span>
              </span>
            )}
            {typeof entry.debugStats?.clicks === "number" && entry.debugStats.clicks > 0 && (
              <span>
                clicks:{" "}
                <span className="text-pink-500 dark:text-pink-400">
                  {entry.debugStats.clicks}
                </span>
              </span>
            )}
            {entry.stats?.last_seen_at && (
              <span>
                last:{" "}
                <span className="text-slate-600 dark:text-slate-300">
                  {getTimeAgo(entry.stats.last_seen_at)}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.max(0, now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}
