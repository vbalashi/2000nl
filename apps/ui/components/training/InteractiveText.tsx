import React, { MouseEvent } from "react";
import { buildSegments } from "@/lib/wordUtils";

type Props = {
  segments: ReturnType<typeof buildSegments>;
  highlightedWord?: string;
  onWordClick: (word: string, options?: { forceAudio?: boolean }) => void;
  excludeWord?: string; // Word to ignore clicks for (e.g. current answer)
  className?: string;
  cursorStyle?: React.CSSProperties;
};

export function InteractiveText({
  segments,
  highlightedWord,
  onWordClick,
  excludeWord,
  className = "",
  cursorStyle,
}: Props) {
  const handleWordClick = (
    event: MouseEvent<HTMLButtonElement | HTMLSpanElement>,
    text: string,
    isLink: boolean = false
  ) => {
    console.log("🖱️ InteractiveText click:", text, "isLink:", isLink);
    event.preventDefault();
    event.stopPropagation();

    const cleanBox = text.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim();

    // Prevent highlighting the word itself if excluded
    if (excludeWord && cleanBox.toLowerCase() === excludeWord.toLowerCase()) {
      console.log("⏭️ Skipping excluded word:", cleanBox);
      return;
    }

    // Ignore if same word is already highlighted (optional, but good for perf)
    if (highlightedWord === cleanBox && !isLink) {
      // return;
      // Actually, standard behavior allows clicking again?
      // In TrainingCard we ignored it. Let's keep consistent if needed,
      // but for sidebar, clicking again might not do much unless we want to "re-select".
      // Let's stick to ignoring if strictly equal to avoid re-fetches.
      console.log("⏭️ Skipping already highlighted word:", cleanBox);
      return;
    }

    console.log("✅ Calling onWordClick with:", cleanBox);
    onWordClick(cleanBox);
  };

  return (
    <span className={className}>
      {segments.map((segment, index) => {
        if (segment.link) {
          return (
            <button
              key={`${segment.text}-${index}`}
              className={`rounded-md px-0.5 mx-0.5 transition-colors ${
                highlightedWord === segment.link.headword ||
                highlightedWord === segment.text
                  ? "bg-secondary/30 text-secondary-dark font-semibold"
                  : "text-primary underline decoration-dotted underline-offset-4 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
              style={cursorStyle}
              onClick={(e) =>
                handleWordClick(e, segment.link?.headword ?? segment.text, true)
              }
            >
              {segment.text}
            </button>
          );
        }

        // Split plain text into words
        const words = segment.text.split(/(\s+)/);
        return (
          <span key={`${segment.text}-${index}`}>
            {words.map((part, wIndex) => {
              if (part.trim() === "") return <span key={wIndex}>{part}</span>;

              if (!/[a-zA-Z\u00C0-\u00FF]/.test(part)) {
                return <span key={wIndex}>{part}</span>;
              }

              const cleanPart = part.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
              const isHighlighted =
                highlightedWord?.toLowerCase() === cleanPart.toLowerCase();

              return (
                <button
                  key={wIndex}
                  className={`rounded-md px-0.5 transition-colors ${
                    isHighlighted
                      ? "bg-secondary/30 text-secondary-dark font-semibold"
                      : "hover:bg-slate-200/50 dark:hover:bg-slate-800"
                  }`}
                  style={cursorStyle}
                  onClick={(e) => handleWordClick(e, cleanPart)}
                >
                  {part}
                </button>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}
