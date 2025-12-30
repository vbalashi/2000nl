import { useState } from 'react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Pill } from './Pill';
import { RecentWords } from './RecentWords';
import { WoorddetailsDrawer } from './WoorddetailsDrawer';
import { DropUp } from './DropUp';
import { HelpCircle } from 'lucide-react';

// Mock data
const currentWord = {
  word: 'fel',
  pos: 'BN',
  frequency: '2K',
  definition: 'iemand die fel is, praat hard en wil anderen overtuigen',
  example: 'hij maakt vaak felle opmerkingen',
  source: 'new',
  queuePosition: 0,
};

const recentWords = [
  {
    id: '1',
    word: 'praten',
    pos: '2K',
    frequency: 'WW',
    translation: 'woorden zeggen',
    shortDef: 'iemand [praat]',
    clicks: 0,
    lastSeen: 'today',
  },
  {
    id: '2',
    word: 'element',
    pos: '2K',
    frequency: 'ZN',
    translation: 'water, lucht, aarde of vuur',
    shortDef: 'water, lucht, aarde of vuur',
    clicks: 0,
    lastSeen: 'today',
  },
  {
    id: '3',
    word: 'tegen',
    pos: '2K',
    frequency: 'VZ',
    translation: 'hoe iemand of iets eruitziet; de buitenkant van iemand of iets',
    shortDef: 'hoe iemand of iets eruitziet',
    clicks: 0,
    lastSeen: 'today',
  },
  {
    id: '4',
    word: 'uiterlijk',
    pos: 'ZN',
    frequency: 'ZN',
    translation: 'hoe iemand of iets eruitziet; de buitenkant van iemand of iets',
    shortDef: 'hoe iemand of iets eruitziet; de buitenkant van iemand of iets',
    clicks: 0,
    lastSeen: 'today',
  },
  {
    id: '5',
    word: 'cd',
    pos: '2K',
    frequency: 'afk',
    translation: 'afkorting van: compact disc, een klein rond plaatje waarop muziek staat',
    shortDef: 'afkorting van: compact disc, een klein rond plaatje waarop muziek staat',
    clicks: 0,
    lastSeen: 'today',
  },
  {
    id: '6',
    word: 'oplossen',
    pos: '2K',
    frequency: 'WW',
    translation: '( heeft opgelost ) het antwoord vinden',
    shortDef: 'iemand lost een probleem op',
    clicks: 0,
    lastSeen: 'today',
  },
];

interface TrainViewProps {
  onWordDetails: (word: any) => void;
}

export function TrainView({ onWordDetails }: TrainViewProps) {
  const [progress, setProgress] = useState(15);
  const [showHotkeys, setShowHotkeys] = useState(false);
  
  // Filter/navigation state
  const [language, setLanguage] = useState('nl');
  const [wordList, setWordList] = useState('nt2-2k');
  const [scenario, setScenario] = useState('word-to-definition');

  const handleAnswer = (difficulty: 'again' | 'hard' | 'good' | 'easy') => {
    console.log('Answer:', difficulty);
    // Simulate progress
    if (progress < 100) {
      setProgress(prev => Math.min(prev + 5, 100));
    }
  };

  return (
    <div className="flex-1 flex gap-6 px-8 py-8 overflow-hidden">
      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Main word card */}
        <div className="flex-1 bg-card border border-border rounded-2xl shadow-lg p-12 flex flex-col items-center justify-center mb-6">
          <div className="max-w-2xl w-full text-center">
            <div className="flex items-center justify-center gap-3 mb-8">
              <h1 className="text-6xl">{currentWord.word}</h1>
              <Pill variant="pos">{currentWord.pos}</Pill>
            </div>
            
            <p className="text-xl text-muted-foreground mb-6 leading-relaxed">
              {currentWord.definition}
            </p>
            
            <div className="bg-muted/40 border-l-2 border-muted rounded-r px-6 py-4 mb-8">
              <p className="text-muted-foreground italic">{currentWord.example}</p>
            </div>
            
            <div className="flex items-center justify-center gap-8 text-[11px] text-muted-foreground uppercase tracking-wider">
              <span>src: {currentWord.source}</span>
              <span>queue: {currentWord.queuePosition}</span>
            </div>
          </div>
        </div>

        {/* Answer buttons */}
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-14 bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-600 dark:text-red-400"
            onClick={() => handleAnswer('again')}
          >
            OPNIEUW (H)
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-14 bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30 text-orange-600 dark:text-orange-400"
            onClick={() => handleAnswer('hard')}
          >
            MOEILIJK (J)
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-14 bg-green-500/10 hover:bg-green-500/20 border-green-500/30 text-green-600 dark:text-green-400"
            onClick={() => handleAnswer('good')}
          >
            GOED (K)
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-14 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
            onClick={() => handleAnswer('easy')}
          >
            MAKKELIJK (L)
          </Button>
        </div>

        {/* Progress bar */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-6 text-[13px]">
            {/* Vandaag progress */}
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground uppercase text-[11px]">Vandaag</span>
              <span className="font-medium">{progress} / 10</span>
              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${(progress / 10) * 100}%` }}
                />
              </div>
            </div>

            {/* Separator */}
            <div className="h-4 w-px bg-border" />

            {/* Totaal progress */}
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground uppercase text-[11px]">Totaal</span>
              <span className="font-medium">15 / 3642</span>
              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${(15 / 3642) * 100}%` }}
                />
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <DropUp
                label="Taal"
                value={language}
                options={[
                  { value: 'nl', label: 'Nederlands' },
                  { value: 'en', label: 'English' },
                  { value: 'de', label: 'Deutsch' },
                  { value: 'fr', label: 'Français' },
                  { value: 'es', label: 'Español' },
                ]}
                onChange={setLanguage}
              />
              <DropUp
                label="Lijst"
                value={wordList}
                options={[
                  { value: 'nt2-2k', label: 'NT2 2K' },
                  { value: 'nt2-5k', label: 'NT2 5K' },
                  { value: 'werkwoorden-a1', label: 'Werkwoorden A1' },
                  { value: 'werkwoorden-a2', label: 'Werkwoorden A2' },
                  { value: 'favoriet', label: 'Favoriet' },
                  { value: 'moeilijk', label: 'Moeilijk' },
                ]}
                onChange={setWordList}
              />
              <DropUp
                label="Type"
                value={scenario}
                options={[
                  { value: 'word-to-definition', label: 'Woord → Definitie' },
                  { value: 'definition-to-word', label: 'Definitie → Woord' },
                  { value: 'word-to-example', label: 'Woord → Voorbeeld' },
                  { value: 'example-to-word', label: 'Voorbeeld → Woord' },
                  { value: 'mixed', label: 'Gemengd' },
                ]}
                onChange={setScenario}
              />
            </div>
            <button
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              onClick={() => setShowHotkeys(!showHotkeys)}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span className="uppercase">Hotkeys (?)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recent words sidebar */}
      <div className="w-[340px] flex-shrink-0">
        <RecentWords words={recentWords} onWordClick={onWordDetails} />
      </div>
    </div>
  );
}