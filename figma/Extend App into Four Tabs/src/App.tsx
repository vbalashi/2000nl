import { useState, useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { TrainView } from './components/TrainView';
import { SettingsModal } from './components/SettingsModal';
import { WoorddetailsDrawer } from './components/WoorddetailsDrawer';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner@2.0.3';

// Mock word details data
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

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [drawerWord, setDrawerWord] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Apply theme to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // ESC to close modals
      if (e.key === 'Escape') {
        if (isSettingsModalOpen) {
          setIsSettingsModalOpen(false);
        } else if (isDrawerOpen) {
          setIsDrawerOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isSettingsModalOpen, isDrawerOpen]);

  const handleThemeToggle = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const handleSettingsClick = () => {
    setIsSettingsModalOpen(true);
  };

  const handleLogout = () => {
    toast.success('Uitgelogd');
  };

  const handleWordDetails = (word: any) => {
    setDrawerWord(mockWordDetails);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <TopBar
        theme={theme}
        onThemeToggle={handleThemeToggle}
        onSettingsClick={handleSettingsClick}
        userEmail="kvlaschi@gmail.com"
        onLogout={handleLogout}
      />

      {/* Navigation tabs - hidden, only Train view is shown */}
      
      {/* Main content - always Train view */}
      <TrainView onWordDetails={handleWordDetails} />

      {/* Word details drawer */}
      <WoorddetailsDrawer
        word={drawerWord}
        onClose={handleCloseDrawer}
        isOpen={isDrawerOpen}
      />

      {/* Settings modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        userEmail="kvlaschi@gmail.com"
      />

      <Toaster />
    </div>
  );
}