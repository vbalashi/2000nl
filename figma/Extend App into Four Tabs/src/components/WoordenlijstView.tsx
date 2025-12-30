import { useState } from 'react';
import { Search, ChevronRight, Info, Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Pill } from './Pill';
import { Checkbox } from './ui/checkbox';
import { cn } from './ui/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface WordListItem {
  id: string;
  word: string;
  pos: string;
  frequency: string;
  definition: string;
  listsCount: number;
}

interface WordList {
  id: string;
  name: string;
  wordCount: number;
  learnedCount: number;
  category: 'system' | 'user';
}

const lists: WordList[] = [
  { id: '1', name: 'NT2 2k', wordCount: 2000, learnedCount: 480, category: 'system' },
  { id: '2', name: 'Werkwoorden A1', wordCount: 150, learnedCount: 120, category: 'user' },
  { id: '3', name: 'Reizen & vakantie', wordCount: 85, learnedCount: 45, category: 'user' },
];

const words: WordListItem[] = [
  { id: '1', word: 'fel', pos: 'BN', frequency: '2K', definition: 'iemand die fel is, praat hard en wil anderen overtuigen', listsCount: 2 },
  { id: '2', word: 'praten', pos: 'WW', frequency: '2K', definition: 'woorden zeggen', listsCount: 3 },
  { id: '3', word: 'element', pos: 'ZN', frequency: '2K', definition: 'water, lucht, aarde of vuur', listsCount: 1 },
  { id: '4', word: 'voorkomen', pos: 'WW', frequency: '2N', definition: 'de manier waarop iemand eruitziet = het uiterlijk', listsCount: 2 },
  { id: '5', word: 'oplossen', pos: 'WW', frequency: '2K', definition: '( heeft opgelost ) het antwoord vinden', listsCount: 1 },
];

interface WoordenlijstViewProps {
  onWordDetails: (word: any) => void;
}

export function WoordenlijstView({ onWordDetails }: WoordenlijstViewProps) {
  const [selectedList, setSelectedList] = useState<string>('1');
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('alle');

  const toggleWordSelection = (wordId: string) => {
    const newSelection = new Set(selectedWords);
    if (newSelection.has(wordId)) {
      newSelection.delete(wordId);
    } else {
      newSelection.add(wordId);
    }
    setSelectedWords(newSelection);
  };

  return (
    <div className="flex-1 flex gap-6 px-8 py-8 overflow-hidden">
      {/* Lists sidebar */}
      <div className="w-[280px] flex-shrink-0">
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm h-full flex flex-col">
          <h3 className="mb-4">Lijsten</h3>
          
          <div className="flex-1 overflow-y-auto space-y-6">
            {/* System lists */}
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 px-2">
                Systeempakketten
              </p>
              <div className="space-y-2">
                {lists.filter(l => l.category === 'system').map((list) => (
                  <div
                    key={list.id}
                    className={cn(
                      "p-3 rounded-lg cursor-pointer transition-colors border",
                      selectedList === list.id
                        ? "bg-primary/10 border-primary/30"
                        : "bg-muted/30 border-transparent hover:bg-muted/50"
                    )}
                    onClick={() => setSelectedList(list.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-[14px]">{list.name}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {list.wordCount} woorden · {list.learnedCount} geleerd
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* User lists */}
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 px-2">
                Mijn lijsten
              </p>
              <div className="space-y-2">
                {lists.filter(l => l.category === 'user').map((list) => (
                  <div
                    key={list.id}
                    className={cn(
                      "p-3 rounded-lg cursor-pointer transition-colors border",
                      selectedList === list.id
                        ? "bg-primary/10 border-primary/30"
                        : "bg-muted/30 border-transparent hover:bg-muted/50"
                    )}
                    onClick={() => setSelectedList(list.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-[14px]">{list.name}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {list.wordCount} woorden · {list.learnedCount} geleerd
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Button variant="outline" size="sm" className="mt-4 w-full">
            <Plus className="h-4 w-4 mr-2" />
            Nieuwe lijst
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-card border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden h-full">
          {/* Filters header */}
          <div className="p-5 border-b border-border">
            {/* Filter chips */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {['alle', 'werkwoorden', 'zelfstandige naamwoorden', 'bijvoeglijke naamwoorden', 'favorieten', 'nog niet geleerd'].map((filter) => (
                <Button
                  key={filter}
                  variant={activeFilter === filter ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveFilter(filter)}
                  className="rounded-full capitalize"
                >
                  {filter}
                </Button>
              ))}
            </div>

            {/* Search and sort */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Zoek in woorden…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select defaultValue="frequency">
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Sorteren op" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="frequency">Frequentie</SelectItem>
                  <SelectItem value="alphabetical">Alfabetisch</SelectItem>
                  <SelectItem value="lastPracticed">Laatst geoefend</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Word list */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="space-y-2">
              {words.map((word) => (
                <div
                  key={word.id}
                  className="flex items-center gap-4 p-4 bg-muted/30 border border-border/50 rounded-xl hover:bg-muted/50 transition-colors group"
                >
                  <Checkbox
                    checked={selectedWords.has(word.id)}
                    onCheckedChange={() => toggleWordSelection(word.id)}
                  />
                  
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <span className="font-medium">{word.word}</span>
                    <Pill variant="pos">{word.pos}</Pill>
                    <Pill variant="frequency">{word.frequency}</Pill>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-muted-foreground text-[14px] truncate">
                      {word.definition}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                      In {word.listsCount} lijsten
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onWordDetails(word)}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bulk actions bar */}
          {selectedWords.size > 0 && (
            <div className="border-t border-border p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-[14px]">{selectedWords.size} woorden geselecteerd</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    + Voeg toe aan lijst…
                  </Button>
                  <Button variant="outline" size="sm">
                    + Nieuwe lijst…
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
