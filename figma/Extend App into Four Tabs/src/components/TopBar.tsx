import { Sun, Moon, Settings, LogOut } from 'lucide-react';
import { Button } from './ui/button';

interface TopBarProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onSettingsClick: () => void;
  userEmail: string;
  onLogout: () => void;
}

export function TopBar({ theme, onThemeToggle, onSettingsClick, userEmail, onLogout }: TopBarProps) {
  return (
    <div className="w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-between px-8 py-4">
        <div>
          <h1 className="tracking-tight text-[28px] font-black" style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>NT2 Training</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onThemeToggle}
            className="h-9 w-9"
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={onSettingsClick}
            className="h-9 w-9"
          >
            <Settings className="h-4 w-4" />
          </Button>
          
          <span className="text-muted-foreground text-[14px]">{userEmail}</span>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="h-9"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Afmelden
          </Button>
        </div>
      </div>
    </div>
  );
}