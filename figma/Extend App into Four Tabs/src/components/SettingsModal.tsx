import { useState } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { WoordenlijstView } from './WoordenlijstView';
import { StatistiekenView } from './StatistiekenView';
import { InstellingenView } from './InstellingenView';
import { WoorddetailsDrawer } from './WoorddetailsDrawer';

type SettingsView = 'woordenlijst' | 'statistieken' | 'instellingen';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  userEmail: string;
}

// Mock word details data for drawer
const mockWordDetails = {
  word: 'fel',
  pos: 'BN',
  frequency: '2K',
  level: 'A2',
  senses: [
    { id: 1, definition: 'iemand die fel is, praat hard en wil anderen overtuigen' },
    { id: 2, definition: '(bij kleuren) sterk, helder' },
  ],
  examples: [
    { id: 1, text: 'hij maakt vaak felle opmerkingen' },
    { id: 2, text: 'een felle kleur' },
  ],
  lists: ['NT2 2k', 'Werkwoorden A1', 'Favoriet'],
  notes: '',
  lastPracticed: 'vandaag',
  difficulty: 'vaak als "Moeilijk" gemarkeerd',
};

export function SettingsModal({ isOpen, onClose, theme, onThemeChange, userEmail }: SettingsModalProps) {
  const [currentView, setCurrentView] = useState<SettingsView>('instellingen');
  const [drawerWord, setDrawerWord] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  if (!isOpen) return null;

  const handleWordDetails = (word: any) => {
    setDrawerWord(mockWordDetails);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  const handleClose = () => {
    setCurrentView('instellingen');
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 dark:bg-black/80 z-40 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-4 md:inset-8 bg-background border border-border rounded-3xl z-50 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="border-b border-border/40 bg-background/95 backdrop-blur">
          <div className="flex items-center justify-between px-8 py-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-9 w-9"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h2>Instellingen & Beheer</h2>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-9 w-9"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation tabs */}
          <div className="px-8">
            <div className="flex gap-6">
              <button
                className={`px-4 py-3 border-b-2 transition-colors ${
                  currentView === 'woordenlijst'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setCurrentView('woordenlijst')}
              >
                Woordenlijst
              </button>
              <button
                className={`px-4 py-3 border-b-2 transition-colors ${
                  currentView === 'statistieken'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setCurrentView('statistieken')}
              >
                Statistieken
              </button>
              <button
                className={`px-4 py-3 border-b-2 transition-colors ${
                  currentView === 'instellingen'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setCurrentView('instellingen')}
              >
                Instellingen
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {currentView === 'woordenlijst' && <WoordenlijstView onWordDetails={handleWordDetails} />}
          {currentView === 'statistieken' && <StatistiekenView />}
          {currentView === 'instellingen' && (
            <InstellingenView
              theme={theme}
              onThemeChange={onThemeChange}
              userEmail={userEmail}
            />
          )}
        </div>

        {/* Word details drawer (inside modal) */}
        {isDrawerOpen && (
          <WoorddetailsDrawer
            word={drawerWord}
            onClose={handleCloseDrawer}
            isOpen={isDrawerOpen}
          />
        )}
      </div>
    </>
  );
}
