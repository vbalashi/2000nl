import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { Label } from './ui/label';
import { cn } from './ui/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

type SettingsSection = 'algemeen' | 'talen' | 'leren' | 'account';

interface InstellingenViewProps {
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  userEmail: string;
}

export function InstellingenView({ theme, onThemeChange, userEmail }: InstellingenViewProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('algemeen');
  const [hotkeysEnabled, setHotkeysEnabled] = useState(true);
  const [dailyGoal, setDailyGoal] = useState([20]);

  const sections = [
    { id: 'algemeen' as const, label: 'Algemeen' },
    { id: 'talen' as const, label: 'Talen & woordenboeken' },
    { id: 'leren' as const, label: 'Leren & planning' },
    { id: 'account' as const, label: 'Account' },
  ];

  return (
    <div className="flex-1 flex gap-6 px-8 py-8 overflow-hidden">
      {/* Left menu */}
      <div className="w-[280px] flex-shrink-0">
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <h3 className="mb-4">Instellingen</h3>
          
          <div className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left",
                  activeSection === section.id
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                onClick={() => setActiveSection(section.id)}
              >
                <span>{section.label}</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right content */}
      <div className="flex-1">
        <div className="bg-card border border-border rounded-2xl shadow-sm p-8 max-w-3xl">
          {activeSection === 'algemeen' && (
            <div className="space-y-8">
              <div>
                <h2 className="mb-6">Algemeen</h2>
              </div>

              {/* Theme */}
              <div className="space-y-3">
                <Label>Thema</Label>
                <div className="flex gap-3">
                  <Button
                    variant={theme === 'light' ? 'default' : 'outline'}
                    onClick={() => onThemeChange('light')}
                    className="flex-1"
                  >
                    Licht
                  </Button>
                  <Button
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    onClick={() => onThemeChange('dark')}
                    className="flex-1"
                  >
                    Donker
                  </Button>
                </div>
              </div>

              {/* UI Language */}
              <div className="space-y-3">
                <Label htmlFor="ui-lang">UI-taal</Label>
                <Select defaultValue="nl">
                  <SelectTrigger id="ui-lang">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nl">Nederlands</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Hotkeys */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="hotkeys">Sneltoetsen</Label>
                    <p className="text-[13px] text-muted-foreground mt-1">
                      Gebruik toetsenbord shortcuts tijdens het trainen
                    </p>
                  </div>
                  <Switch
                    id="hotkeys"
                    checked={hotkeysEnabled}
                    onCheckedChange={setHotkeysEnabled}
                  />
                </div>
                <button className="text-[13px] text-primary hover:underline">
                  Bekijk hotkeys (?)
                </button>
              </div>
            </div>
          )}

          {activeSection === 'talen' && (
            <div className="space-y-8">
              <div>
                <h2 className="mb-6">Talen & woordenboeken</h2>
              </div>

              {/* Active dictionaries */}
              <div className="space-y-3">
                <Label>Actieve woordenboeken</Label>
                <div className="space-y-2">
                  <div className="p-4 bg-muted/30 border border-border/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">NT2 2k</p>
                        <p className="text-[13px] text-muted-foreground">2000 woorden · Systeem</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                  <div className="p-4 bg-muted/30 border border-border/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Engels C1</p>
                        <p className="text-[13px] text-muted-foreground">3000 woorden · Systeem</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </div>
              </div>

              {/* Add custom dictionary */}
              <div>
                <Button variant="outline" className="w-full">
                  + Eigen woordenboek koppelen
                </Button>
                <p className="text-[12px] text-muted-foreground mt-2">
                  Importeer je eigen woordenlijst of koppel een externe bron
                </p>
              </div>
            </div>
          )}

          {activeSection === 'leren' && (
            <div className="space-y-8">
              <div>
                <h2 className="mb-6">Leren & planning</h2>
              </div>

              {/* Daily goal */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Dagdoel</Label>
                  <span className="font-medium">{dailyGoal[0]} woorden</span>
                </div>
                <Slider
                  value={dailyGoal}
                  onValueChange={setDailyGoal}
                  min={5}
                  max={50}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>5</span>
                  <span>50</span>
                </div>
              </div>

              {/* Review strategy */}
              <div className="space-y-3">
                <Label htmlFor="review-strategy">Review strategie</Label>
                <Select defaultValue="spaced">
                  <SelectTrigger id="review-strategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spaced">Spaced Repetition</SelectItem>
                    <SelectItem value="daily">Dagelijks alle woorden</SelectItem>
                    <SelectItem value="custom">Aangepast</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[13px] text-muted-foreground">
                  Bepaalt wanneer woorden opnieuw worden aangeboden
                </p>
              </div>

              {/* New words per day */}
              <div className="space-y-3">
                <Label htmlFor="new-words">Nieuwe woorden per dag</Label>
                <Select defaultValue="10">
                  <SelectTrigger id="new-words">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 woorden</SelectItem>
                    <SelectItem value="10">10 woorden</SelectItem>
                    <SelectItem value="15">15 woorden</SelectItem>
                    <SelectItem value="20">20 woorden</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {activeSection === 'account' && (
            <div className="space-y-8">
              <div>
                <h2 className="mb-6">Account</h2>
              </div>

              {/* Account info */}
              <div className="space-y-4">
                <div className="p-4 bg-muted/30 border border-border/50 rounded-lg">
                  <div className="space-y-3">
                    <div>
                      <p className="text-[13px] text-muted-foreground">E-mailadres</p>
                      <p className="font-medium">{userEmail}</p>
                    </div>
                    <div>
                      <p className="text-[13px] text-muted-foreground">Plan</p>
                      <p className="font-medium">Gratis</p>
                    </div>
                    <div>
                      <p className="text-[13px] text-muted-foreground">Lid sinds</p>
                      <p className="font-medium">11 december 2025</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Account actions */}
              <div className="space-y-3">
                <Button variant="outline" className="w-full">
                  Beheer account…
                </Button>
                <Button variant="outline" className="w-full text-destructive hover:text-destructive">
                  Account verwijderen
                </Button>
              </div>

              {/* Logout */}
              <div className="pt-6 border-t border-border">
                <Button variant="default" className="w-full">
                  Afmelden
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
