import { useState } from 'react';
import { X, Plus, Search, ChevronDown, Check, MoreVertical, Trash2, Edit2, Copy, FolderInput, Filter } from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Checkbox } from './components/ui/checkbox';
import { Badge } from './components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { ScrollArea } from './components/ui/scroll-area';
import { Separator } from './components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from './components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import { toast, Toaster } from 'sonner';

type Word = {
  id: string;
  word: string;
  type: string;
  inList: boolean;
  lists: string[]; // Track which lists this word belongs to
};

type WordList = {
  id: string;
  name: string;
  wordCount: number;
  selected: number;
  isActive?: boolean;
};

export default function App() {
  const [selectedLanguage, setSelectedLanguage] = useState('NEDERLANDS');
  const [activeList, setActiveList] = useState('vandale-2k');
  const [searchQuery, setSearchQuery] = useState('');
  const [wordFilter, setWordFilter] = useState('alle');
  const [listFilter, setListFilter] = useState<'all' | 'in-list' | 'not-in-list'>('all');
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [isAddingList, setIsAddingList] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [targetListId, setTargetListId] = useState('');
  const [attributeFilters, setAttributeFilters] = useState<string[]>([]);
  const [applyListFilter, setApplyListFilter] = useState(false);

  const [lists, setLists] = useState<WordList[]>([
    { id: 'vandale', name: 'VanDale', wordCount: 17564, selected: 0, isActive: true },
    { id: 'vandale-2k', name: 'VanDale 2k', wordCount: 3642, selected: 0, isActive: true },
    { id: 'bepaald', name: 'bepaald', wordCount: 4, selected: 0 },
    { id: 'nieuwe-lijst', name: 'Nieuwe lijst', wordCount: 5, selected: 0 },
  ]);

  const [words, setWords] = useState<Word[]>([
    { id: '1', word: 'opkijken tegen', type: 'ww', inList: true, lists: ['vandale-2k'] },
    { id: '2', word: 'tegen', type: 'vz', inList: true, lists: ['vandale-2k'] },
    { id: '3', word: 'tegen', type: 'vz', inList: true, lists: ['vandale-2k', 'bepaald'] },
    { id: '4', word: 'tegenhouden', type: 'ww', inList: true, lists: ['vandale-2k'] },
    { id: '5', word: 'tegenover', type: 'vz', inList: false, lists: [] },
    { id: '6', word: 'tegenstander', type: 'zn', inList: false, lists: [] },
    { id: '7', word: 'tegenstelling', type: 'zn', inList: true, lists: ['vandale-2k'] },
    { id: '8', word: 'tegenwoordig', type: 'bw', inList: false, lists: [] },
  ]);

  const filteredWords = words.filter(word => {
    const matchesSearch = word.word.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = wordFilter === 'alle' || word.type === wordFilter;
    const isInCurrentList = word.lists.includes(activeList);
    
    // Apply list filter only when toggle is active
    let matchesListFilter = true;
    if (applyListFilter) {
      matchesListFilter = isInCurrentList;
    }
    
    return matchesSearch && matchesFilter && matchesListFilter;
  });

  const selectedWordsInList = selectedWords.filter(id => {
    const word = words.find(w => w.id === id);
    return word?.lists.includes(activeList);
  });

  const selectedWordsNotInList = selectedWords.filter(id => {
    const word = words.find(w => w.id === id);
    return !word?.lists.includes(activeList);
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedWords(filteredWords.map(w => w.id));
    } else {
      setSelectedWords([]);
    }
  };

  const handleSelectWord = (wordId: string, checked: boolean) => {
    if (checked) {
      setSelectedWords([...selectedWords, wordId]);
    } else {
      setSelectedWords(selectedWords.filter(id => id !== wordId));
    }
  };

  const handleAddToCurrentList = () => {
    const wordsToAdd = selectedWords.filter(id => {
      const word = words.find(w => w.id === id);
      return word && !word.lists.includes(activeList);
    });

    setWords(words.map(word => {
      if (wordsToAdd.includes(word.id)) {
        return { ...word, lists: [...word.lists, activeList], inList: true };
      }
      return word;
    }));

    toast.success(`${wordsToAdd.length} ${wordsToAdd.length === 1 ? 'woord' : 'woorden'} toegevoegd aan ${activeListData?.name}`);
    setSelectedWords([]);
  };

  const handleRemoveFromCurrentList = () => {
    const wordsToRemove = selectedWords.filter(id => {
      const word = words.find(w => w.id === id);
      return word?.lists.includes(activeList);
    });

    setWords(words.map(word => {
      if (wordsToRemove.includes(word.id)) {
        const newLists = word.lists.filter(listId => listId !== activeList);
        return { ...word, lists: newLists, inList: newLists.length > 0 };
      }
      return word;
    }));

    toast.success(`${wordsToRemove.length} ${wordsToRemove.length === 1 ? 'woord' : 'woorden'} verwijderd van ${activeListData?.name}`);
    setSelectedWords([]);
  };

  const handleCopyToAnotherList = () => {
    if (!targetListId) return;

    const wordsToCopy = selectedWords.filter(id => {
      const word = words.find(w => w.id === id);
      return word && !word.lists.includes(targetListId);
    });

    setWords(words.map(word => {
      if (wordsToCopy.includes(word.id) && !word.lists.includes(targetListId)) {
        return { ...word, lists: [...word.lists, targetListId], inList: true };
      }
      return word;
    }));

    const targetList = lists.find(l => l.id === targetListId);
    toast.success(`${wordsToCopy.length} ${wordsToCopy.length === 1 ? 'woord' : 'woorden'} gekopieerd naar ${targetList?.name}`);
    setShowActionDialog(false);
    setTargetListId('');
    setSelectedWords([]);
  };

  const handleAddList = () => {
    if (newListName.trim()) {
      const newList: WordList = {
        id: newListName.toLowerCase().replace(/\s+/g, '-'),
        name: newListName,
        wordCount: 0,
        selected: 0,
      };
      setLists([...lists, newList]);
      setNewListName('');
      setNewListDescription('');
      setIsAddingList(false);
    }
  };

  const handleDeleteList = (listId: string) => {
    setLists(lists.filter(list => list.id !== listId));
    if (activeList === listId && lists.length > 1) {
      setActiveList(lists[0].id);
    }
  };

  const handleAttributeFilterToggle = (filter: string) => {
    setAttributeFilters(prev => 
      prev.includes(filter) 
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
  };

  const attributeFilterOptions = [
    { id: 'nt2-2k', label: 'NT2 2K' },
    { id: 'frozen', label: 'Frozen' },
    { id: 'dont-show', label: "Don't show" },
    { id: 'has-idioms', label: 'Has idioms' },
    { id: 'irregular', label: 'Irregular' },
  ];

  const activeListData = lists.find(list => list.id === activeList);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Instellingen & Beheer</p>
              <h1 className="text-xl">vbalashi@gmail.com</h1>
            </div>
            <Button variant="ghost" size="icon">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs defaultValue="woordenlijst" className="space-y-6">
          <TabsList>
            <TabsTrigger value="woordenlijst">Woordenlijst</TabsTrigger>
            <TabsTrigger value="statistieken">Statistieken</TabsTrigger>
            <TabsTrigger value="instellingen">Instellingen</TabsTrigger>
          </TabsList>

          <TabsContent value="woordenlijst" className="space-y-6">
            {/* Desktop Layout */}
            <div className="hidden lg:grid lg:grid-cols-[320px_1fr] gap-6">
              {/* Left Sidebar - Lists */}
              <div className="space-y-6">
                {/* Language Selector */}
                <div className="bg-white rounded-lg border p-4">
                  <Label className="text-xs uppercase tracking-wide text-gray-500 mb-3 block">Taal</Label>
                  <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NEDERLANDS">NEDERLANDS</SelectItem>
                      <SelectItem value="ENGLISH">ENGLISH</SelectItem>
                      <SelectItem value="FRANÇAIS">FRANÇAIS</SelectItem>
                      <SelectItem value="DEUTSCH">DEUTSCH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="bg-white rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3>Kant-en-klare lijsten</h3>
                  </div>
                  <div className="space-y-2">
                    {lists.filter(list => list.isActive).map(list => (
                      <button
                        key={list.id}
                        onClick={() => setActiveList(list.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-colors ${
                          activeList === list.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span>{list.name}</span>
                            {activeList === list.id && (
                              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                                ACTIEF
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{list.wordCount} woorden</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3>Je lijsten</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-600 hover:text-blue-700"
                      onClick={() => setIsAddingList(true)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Nieuwe lijst
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {lists.filter(list => !list.isActive).map(list => (
                      <div
                        key={list.id}
                        className={`flex items-center justify-between p-3 rounded-lg border-2 transition-colors cursor-pointer ${
                          activeList === list.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setActiveList(list.id)}
                      >
                        <div className="text-left">
                          <p>{list.name}</p>
                          <p className="text-xs text-gray-500">{list.wordCount} woorden</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Edit2 className="h-4 w-4 mr-2" />
                              Bewerken
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDeleteList(list.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Verwijderen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>

                  {isAddingList && (
                    <div className="mt-4 space-y-3 p-3 border rounded-lg bg-gray-50">
                      <div>
                        <Label htmlFor="list-name" className="text-xs">Lijstnaam</Label>
                        <Input
                          id="list-name"
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          placeholder="Nieuwe lijstnaam"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="list-description" className="text-xs">Beschrijving (optioneel)</Label>
                        <Input
                          id="list-description"
                          value={newListDescription}
                          onChange={(e) => setNewListDescription(e.target.value)}
                          placeholder="Beschrijving"
                          className="mt-1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleAddList} size="sm" className="flex-1">
                          Toevoegen
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setIsAddingList(false);
                            setNewListName('');
                            setNewListDescription('');
                          }}
                        >
                          Annuleren
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Content - Word List */}
              <div className="bg-white rounded-lg border">
                <div className="p-6 border-b">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-xl">TOON WOORDEN IN: {activeListData?.name.toUpperCase()}</h2>
                        <Button
                          size="sm"
                          variant={applyListFilter ? "default" : "outline"}
                          onClick={() => setApplyListFilter(!applyListFilter)}
                          className={applyListFilter ? "bg-blue-600 hover:bg-blue-700" : ""}
                        >
                          <Filter className="h-4 w-4 mr-2" />
                          {applyListFilter ? "Filter actief" : "Filter door lijst"}
                        </Button>
                      </div>
                      <p className="text-sm text-gray-500">
                        {applyListFilter 
                          ? `${filteredWords.length} woorden in lijst • ${selectedWords.length} geselecteerd`
                          : `${activeListData?.wordCount} woorden in lijst • ${filteredWords.length} totaal • ${selectedWords.length} geselecteerd`
                        }
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs mb-2 block">Nieuwe zoekopdracht</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Zoek op hoofdwoord..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-1">
                        <Label className="text-xs mb-2 block">Woordsoort</Label>
                        <Select value={wordFilter} onValueChange={setWordFilter}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="alle">Alle</SelectItem>
                            <SelectItem value="ww">ww (werkwoord)</SelectItem>
                            <SelectItem value="vz">vz (voorzetsel)</SelectItem>
                            <SelectItem value="zn">zn (zelfstandig naamwoord)</SelectItem>
                            <SelectItem value="bw">bw (bijwoord)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs mb-2 block">Filters</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="outline" 
                              className="w-full justify-between"
                            >
                              <span className="flex items-center gap-2">
                                <Filter className="h-4 w-4" />
                                {attributeFilters.length > 0 ? `${attributeFilters.length} geselecteerd` : 'Selecteer filters...'}
                              </span>
                              <ChevronDown className="h-4 w-4 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[240px] p-3" align="start">
                            <div className="space-y-2">
                              {attributeFilterOptions.map((option) => (
                                <div key={option.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`filter-${option.id}`}
                                    checked={attributeFilters.includes(option.id)}
                                    onCheckedChange={() => handleAttributeFilterToggle(option.id)}
                                  />
                                  <Label
                                    htmlFor={`filter-${option.id}`}
                                    className="text-sm cursor-pointer flex-1"
                                  >
                                    {option.label}
                                  </Label>
                                </div>
                              ))}
                              {attributeFilters.length > 0 && (
                                <>
                                  <Separator />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => setAttributeFilters([])}
                                  >
                                    Wis filters
                                  </Button>
                                </>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {/* Action Bar */}
                  {selectedWords.length > 0 && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm">
                          {selectedWords.length} {selectedWords.length === 1 ? 'woord' : 'woorden'} geselecteerd
                        </p>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setSelectedWords([])}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          Deselecteer
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedWordsNotInList.length > 0 && (
                          <Button 
                            size="sm" 
                            className="bg-green-600 hover:bg-green-700"
                            onClick={handleAddToCurrentList}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Voeg toe aan {activeListData?.name} ({selectedWordsNotInList.length})
                          </Button>
                        )}
                        {selectedWordsInList.length > 0 && (
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={handleRemoveFromCurrentList}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Verwijder van {activeListData?.name} ({selectedWordsInList.length})
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setShowActionDialog(true)}
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Kopieer naar andere lijst...
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="select-all"
                        checked={selectedWords.length === filteredWords.length && filteredWords.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                      <Label htmlFor="select-all" className="text-sm cursor-pointer">
                        Selecteer alles
                      </Label>
                    </div>
                  </div>

                  <ScrollArea className="h-[500px]">
                    <div className="space-y-1">
                      <div className="grid grid-cols-[40px_1fr_120px_120px] gap-4 px-3 py-2 text-xs uppercase tracking-wide text-gray-500 border-b">
                        <span>Kies</span>
                        <span>Hoofdwoord</span>
                        <span>Woordsoort</span>
                        <span>Vandale 2K</span>
                      </div>
                      {filteredWords.map((word) => (
                        <div
                          key={word.id}
                          className="grid grid-cols-[40px_1fr_120px_120px] gap-4 px-3 py-3 hover:bg-gray-50 border-b items-center"
                        >
                          <Checkbox
                            checked={selectedWords.includes(word.id)}
                            onCheckedChange={(checked) => handleSelectWord(word.id, checked as boolean)}
                          />
                          <span>{word.word}</span>
                          <span className="text-sm text-gray-600">{word.type}</span>
                          <span className="text-sm">{word.inList ? 'Ja' : 'Nee'}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                    <span>Toon 1-{filteredWords.length} van {filteredWords.length}</span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled>Vorige</Button>
                      <Button variant="outline" size="sm" disabled>Volgende</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Layout */}
            <div className="lg:hidden space-y-4">
              {/* Active List Card */}
              <div className="bg-white rounded-lg border p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Actieve lijst</p>
                    <h3>{activeListData?.name}</h3>
                    <p className="text-xs text-gray-500">{activeListData?.wordCount} woorden</p>
                  </div>
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm">
                        Wijzig lijst
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="h-[80vh]">
                      <SheetHeader>
                        <SheetTitle>Selecteer lijst</SheetTitle>
                        <SheetDescription>Selecteer een lijst om te activeren of te wijzigen.</SheetDescription>
                      </SheetHeader>
                      <div className="mt-6 space-y-6">
                        <div>
                          <Label className="text-xs uppercase tracking-wide text-gray-500 mb-2 block">Taal</Label>
                          <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NEDERLANDS">NEDERLANDS</SelectItem>
                              <SelectItem value="ENGLISH">ENGLISH</SelectItem>
                              <SelectItem value="FRANÇAIS">FRANÇAIS</SelectItem>
                              <SelectItem value="DEUTSCH">DEUTSCH</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <Separator />

                        <div>
                          <h4 className="text-sm mb-3">Kant-en-klare lijsten</h4>
                          <div className="space-y-2">
                            {lists.filter(list => list.isActive).map(list => (
                              <button
                                key={list.id}
                                onClick={() => setActiveList(list.id)}
                                className={`w-full flex items-center justify-between p-3 rounded-lg border-2 ${
                                  activeList === list.id
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200'
                                }`}
                              >
                                <div className="text-left">
                                  <p>{list.name}</p>
                                  <p className="text-xs text-gray-500">{list.wordCount} woorden</p>
                                </div>
                                {activeList === list.id && <Check className="h-5 w-5 text-blue-600" />}
                              </button>
                            ))}
                          </div>
                        </div>

                        <Separator />

                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm">Je lijsten</h4>
                            <Button variant="ghost" size="sm" className="text-blue-600">
                              <Plus className="h-4 w-4 mr-1" />
                              Nieuw
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {lists.filter(list => !list.isActive).map(list => (
                              <button
                                key={list.id}
                                onClick={() => setActiveList(list.id)}
                                className={`w-full flex items-center justify-between p-3 rounded-lg border-2 ${
                                  activeList === list.id
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200'
                                }`}
                              >
                                <div className="text-left">
                                  <p>{list.name}</p>
                                  <p className="text-xs text-gray-500">{list.wordCount} woorden</p>
                                </div>
                                {activeList === list.id && <Check className="h-5 w-5 text-blue-600" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
              </div>

              {/* Search and Filters */}
              <div className="bg-white rounded-lg border p-4 space-y-4">
                <div>
                  <Label className="text-xs mb-2 block">Zoek woorden</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Zoek op hoofdwoord..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-2 block">Woordsoort</Label>
                    <Select value={wordFilter} onValueChange={setWordFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alle">Alle</SelectItem>
                        <SelectItem value="ww">ww</SelectItem>
                        <SelectItem value="vz">vz</SelectItem>
                        <SelectItem value="zn">zn</SelectItem>
                        <SelectItem value="bw">bw</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-2 block">Filters</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="outline" 
                          className="w-full justify-between"
                        >
                          <span className="flex items-center gap-2">
                            <Filter className="h-4 w-4" />
                            {attributeFilters.length > 0 ? attributeFilters.length : 'Filter'}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[240px] p-3" align="start">
                        <div className="space-y-2">
                          {attributeFilterOptions.map((option) => (
                            <div key={option.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`mobile-filter-${option.id}`}
                                checked={attributeFilters.includes(option.id)}
                                onCheckedChange={() => handleAttributeFilterToggle(option.id)}
                              />
                              <Label
                                htmlFor={`mobile-filter-${option.id}`}
                                className="text-sm cursor-pointer flex-1"
                              >
                                {option.label}
                              </Label>
                            </div>
                          ))}
                          {attributeFilters.length > 0 && (
                            <>
                              <Separator />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full"
                                onClick={() => setAttributeFilters([])}
                              >
                                Wis filters
                              </Button>
                            </>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* Word List */}
              <div className="bg-white rounded-lg border">
                <div className="p-4 border-b">
                  <div className="flex items-center justify-between">
                    <p className="text-sm">
                      {filteredWords.length} woorden {selectedWords.length > 0 && `• ${selectedWords.length} geselecteerd`}
                    </p>
                  </div>
                </div>

                {/* Mobile Action Bar */}
                {selectedWords.length > 0 && (
                  <div className="p-4 bg-blue-50 border-b border-blue-200">
                    <p className="text-sm mb-3">
                      {selectedWords.length} {selectedWords.length === 1 ? 'woord' : 'woorden'} geselecteerd
                    </p>
                    <div className="space-y-2">
                      {selectedWordsNotInList.length > 0 && (
                        <Button 
                          size="sm" 
                          className="w-full bg-green-600 hover:bg-green-700"
                          onClick={handleAddToCurrentList}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Toevoegen ({selectedWordsNotInList.length})
                        </Button>
                      )}
                      {selectedWordsInList.length > 0 && (
                        <Button 
                          size="sm" 
                          variant="destructive"
                          className="w-full"
                          onClick={handleRemoveFromCurrentList}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Verwijderen ({selectedWordsInList.length})
                        </Button>
                      )}
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="w-full"
                        onClick={() => setShowActionDialog(true)}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Kopieer naar...
                      </Button>
                    </div>
                  </div>
                )}

                <ScrollArea className="h-[400px]">
                  <div className="divide-y">
                    {filteredWords.map((word) => (
                      <div key={word.id} className="p-4 flex items-center gap-3">
                        <Checkbox
                          checked={selectedWords.includes(word.id)}
                          onCheckedChange={(checked) => handleSelectWord(word.id, checked as boolean)}
                        />
                        <div className="flex-1">
                          <p>{word.word}</p>
                          <p className="text-xs text-gray-500">
                            {word.type} • {word.inList ? 'In VanDale 2k' : 'Niet in lijst'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="statistieken">
            <div className="bg-white rounded-lg border p-8 text-center">
              <p className="text-gray-500">Statistieken content komt hier...</p>
            </div>
          </TabsContent>

          <TabsContent value="instellingen">
            <div className="bg-white rounded-lg border p-8 text-center">
              <p className="text-gray-500">Instellingen content komt hier...</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <Toaster />

      {/* Copy to List Dialog */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kopieer woorden naar lijst</DialogTitle>
            <DialogDescription>
              Selecteer de lijst waar je {selectedWords.length} {selectedWords.length === 1 ? 'woord' : 'woorden'} naartoe wilt kopiëren.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-xs mb-2 block">Doellijst</Label>
            <Select value={targetListId} onValueChange={setTargetListId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecteer een lijst..." />
              </SelectTrigger>
              <SelectContent>
                {lists.filter(list => list.id !== activeList).map(list => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name} ({list.wordCount} woorden)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowActionDialog(false);
              setTargetListId('');
            }}>
              Annuleren
            </Button>
            <Button 
              onClick={handleCopyToAnotherList}
              disabled={!targetListId}
            >
              <Copy className="h-4 w-4 mr-2" />
              Kopieer naar lijst
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}