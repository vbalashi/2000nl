import { Pill } from './Pill';
import { cn } from './ui/utils';

interface RecentWord {
  id: string;
  word: string;
  pos: string;
  frequency: string;
  translation: string;
  shortDef: string;
  clicks: number;
  lastSeen: string;
}

interface RecentWordsProps {
  words: RecentWord[];
  onWordClick?: (word: RecentWord) => void;
}

export function RecentWords({ words, onWordClick }: RecentWordsProps) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 h-full overflow-hidden flex flex-col shadow-sm">
      <h3 className="mb-4">Recent Opgezocht</h3>
      
      <div className="flex-1 overflow-y-auto space-y-3 -mr-2 pr-2">
        {words.map((word) => (
          <div
            key={word.id}
            className={cn(
              "bg-muted/40 border border-border/50 rounded-xl p-4 hover:bg-muted/60 transition-colors",
              onWordClick && "cursor-pointer"
            )}
            onClick={() => onWordClick?.(word)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{word.word}</span>
                <Pill variant="pos">{word.pos}</Pill>
              </div>
              <Pill variant="frequency">{word.frequency}</Pill>
            </div>
            
            <p className="text-muted-foreground text-[13px] mb-2">{word.translation}</p>
            <p className="text-muted-foreground text-[12px] mb-3 line-clamp-2">{word.shortDef}</p>
            
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>clicked: {word.clicks}</span>
              <span>last: {word.lastSeen}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
