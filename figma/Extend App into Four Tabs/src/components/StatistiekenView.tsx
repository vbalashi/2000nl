import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { Pill } from './Pill';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const summaryStats = [
  {
    title: 'Vandaag',
    value: '15 van 20 woorden geoefend',
    progress: 75,
  },
  {
    title: 'Deze week',
    value: '4 dagen op rij actief',
    progress: null,
  },
  {
    title: 'Totaal',
    value: '3642 woorden in je account',
    progress: null,
  },
  {
    title: 'Sterkste lijst',
    value: 'Werkwoorden A1',
    progress: null,
  },
];

const languageStats = [
  { language: 'Nederlands', tag: 'NT2', learned: 620, total: 2000, toReview: 35 },
  { language: 'Engels', tag: 'C1', learned: 1840, total: 3000, toReview: 12 },
];

const listStats = [
  { name: 'NT2 2k', learned: 480, toReview: 60, notStarted: 1460 },
  { name: 'Werkwoorden A1', learned: 140, toReview: 5, notStarted: 5 },
  { name: 'Reizen & vakantie', learned: 45, toReview: 15, notStarted: 25 },
];

const tagStats = [
  { tag: 'Werkwoorden', count: 342, successRate: 78 },
  { tag: 'Zelfstandige naamwoorden', count: 856, successRate: 82 },
  { tag: 'Bijvoeglijke naamwoorden', count: 234, successRate: 71 },
  { tag: 'Voorzetsels', count: 45, successRate: 65 },
  { tag: 'Bijwoorden', count: 123, successRate: 74 },
];

const colors = {
  learned: '#10b981',
  toReview: '#f59e0b',
  notStarted: '#6b7280',
};

export function StatistiekenView() {
  return (
    <div className="flex-1 px-8 py-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {summaryStats.map((stat, idx) => (
            <div
              key={idx}
              className="bg-card border border-border rounded-2xl p-5 shadow-sm"
            >
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                {stat.title}
              </p>
              <p className="font-medium mb-2">{stat.value}</p>
              {stat.progress !== null && (
                <Progress value={stat.progress} className="h-1.5" />
              )}
            </div>
          ))}
        </div>

        {/* Main stats card */}
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <Tabs defaultValue="language" className="w-full">
            <div className="border-b border-border px-6 pt-6">
              <TabsList className="w-full justify-start bg-transparent border-b-0 p-0 h-auto">
                <TabsTrigger 
                  value="language"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3"
                >
                  Per taal
                </TabsTrigger>
                <TabsTrigger 
                  value="list"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3"
                >
                  Per lijst
                </TabsTrigger>
                <TabsTrigger 
                  value="tag"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3"
                >
                  Per tag
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6">
              <TabsContent value="language" className="mt-0 space-y-6">
                {languageStats.map((lang, idx) => (
                  <div key={idx} className="p-5 bg-muted/30 border border-border/50 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <h3>{lang.language}</h3>
                        <Pill variant="frequency">{lang.tag}</Pill>
                      </div>
                      <span className="text-[13px] text-muted-foreground">
                        {lang.learned}/{lang.total} woorden geoefend
                      </span>
                    </div>
                    <Progress value={(lang.learned / lang.total) * 100} className="h-2 mb-3" />
                    <p className="text-[13px] text-muted-foreground">
                      Volgende review: <span className="text-foreground font-medium">{lang.toReview} woorden vandaag</span>
                    </p>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="list" className="mt-0 space-y-4">
                {listStats.map((list, idx) => (
                  <div key={idx} className="p-5 bg-muted/30 border border-border/50 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3>{list.name}</h3>
                      <Button size="sm">Start training</Button>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-muted-foreground">Geleerd:</span>
                        <span className="font-medium text-green-600 dark:text-green-400">{list.learned}</span>
                      </div>
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-muted-foreground">Te herhalen:</span>
                        <span className="font-medium text-orange-600 dark:text-orange-400">{list.toReview}</span>
                      </div>
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-muted-foreground">Niet begonnen:</span>
                        <span className="font-medium">{list.notStarted}</span>
                      </div>
                    </div>

                    {/* Visual breakdown */}
                    <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden flex">
                      <div 
                        className="bg-green-500"
                        style={{ width: `${(list.learned / (list.learned + list.toReview + list.notStarted)) * 100}%` }}
                      />
                      <div 
                        className="bg-orange-500"
                        style={{ width: `${(list.toReview / (list.learned + list.toReview + list.notStarted)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="tag" className="mt-0">
                <div className="mb-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={tagStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="tag" 
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="successRate" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-3">
                  {tagStats.map((stat, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between p-4 bg-muted/30 border border-border/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Pill>{stat.tag}</Pill>
                        <span className="text-[13px] text-muted-foreground">
                          {stat.count} woorden
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={stat.successRate} className="h-2 w-32" />
                        <span className="text-[13px] font-medium w-12 text-right">
                          {stat.successRate}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </div>
          </Tabs>

          {/* Recommendation */}
          <div className="border-t border-border p-6 bg-muted/20">
            <p className="text-[13px] text-muted-foreground">
              💡 <span className="font-medium text-foreground">Tip:</span> vandaag vooral 'Werkwoorden A1' (5 woorden te herhalen)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
