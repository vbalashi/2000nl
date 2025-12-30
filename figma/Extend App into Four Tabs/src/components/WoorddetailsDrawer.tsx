import { X, Star } from 'lucide-react';
import { Button } from './ui/button';
import { Pill } from './Pill';
import { Textarea } from './ui/textarea';
import { useState } from 'react';

interface WordSense {
  id: number;
  definition: string;
}

interface WordExample {
  id: number;
  text: string;
}

interface WordDetails {
  word: string;
  pos: string;
  frequency: string;
  level?: string;
  senses: WordSense[];
  examples: WordExample[];
  lists: string[];
  notes?: string;
  lastPracticed?: string;
  difficulty?: string;
}

interface WoorddetailsDrawerProps {
  word: WordDetails | null;
  onClose: () => void;
  isOpen: boolean;
}

export function WoorddetailsDrawer({ word, onClose, isOpen }: WoorddetailsDrawerProps) {
  const [notes, setNotes] = useState(word?.notes || '');
  const [isFavorite, setIsFavorite] = useState(false);

  if (!isOpen || !word) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-card border-l border-border z-50 overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-3xl">{word.word}</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsFavorite(!isFavorite)}
                >
                  <Star className={`h-4 w-4 ${isFavorite ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Pill variant="pos">{word.pos}</Pill>
                <Pill variant="frequency">{word.frequency}</Pill>
                {word.level && <Pill variant="level">{word.level}</Pill>}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Betekenissen */}
          <div className="mb-6">
            <h3 className="mb-3">Betekenissen</h3>
            <div className="space-y-3">
              {word.senses.map((sense) => (
                <div key={sense.id} className="flex gap-3">
                  <span className="text-muted-foreground flex-shrink-0">{sense.id}.</span>
                  <p className="text-muted-foreground">{sense.definition}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Voorbeelden */}
          <div className="mb-6">
            <h3 className="mb-3">Voorbeelden</h3>
            <div className="space-y-2">
              {word.examples.map((example) => (
                <div 
                  key={example.id}
                  className="pl-4 py-2 border-l-2 border-muted bg-muted/30 rounded-r"
                >
                  <p className="text-muted-foreground text-[14px] italic">{example.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Notities */}
          <div className="mb-6">
            <h3 className="mb-3">Notities</h3>
            <Textarea
              placeholder="Schrijf je eigen ezelsbruggetje…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[100px] resize-none"
            />
          </div>

          {/* Tags & lijsten */}
          <div className="mb-6">
            <h3 className="mb-3">Tags & lijsten</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {word.lists.map((list, idx) => (
                <Pill key={idx}>{list}</Pill>
              ))}
            </div>
            <Button variant="outline" size="sm" className="w-full">
              + Voeg toe aan lijst…
            </Button>
          </div>

          {/* Training info (if available) */}
          {(word.lastPracticed || word.difficulty) && (
            <div className="pt-6 border-t border-border">
              <div className="space-y-2 text-[13px]">
                {word.lastPracticed && (
                  <p className="text-muted-foreground">
                    Laatste keer geoefend: <span className="text-foreground">{word.lastPracticed}</span>
                  </p>
                )}
                {word.difficulty && (
                  <p className="text-muted-foreground">
                    Moeilijkheid: <span className="text-foreground">{word.difficulty}</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
