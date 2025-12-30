export type FsrsGrade = 1 | 2 | 3 | 4;

export type FsrsHistoryEntry = {
  grade: FsrsGrade;
  elapsedDays: number; // Days since previous review (for first review this is ignored)
};

export type FsrsCorpusCase = {
  name: string;
  history: FsrsHistoryEntry[];
};

// Shared corpus covering the main FSRS-6 paths we care about.
export const fsrsCorpus: FsrsCorpusCase[] = [
  {
    name: "new-card-good",
    history: [{ grade: 3, elapsedDays: 0 }],
  },
  {
    name: "learning-good-good-easy",
    history: [
      { grade: 3, elapsedDays: 0 },
      { grade: 3, elapsedDays: 1 },
      { grade: 4, elapsedDays: 3 },
    ],
  },
  {
    name: "lapse-then-recover",
    history: [
      { grade: 3, elapsedDays: 0 },
      { grade: 1, elapsedDays: 4 }, // lapse
      { grade: 3, elapsedDays: 1 }, // recover
    ],
  },
  {
    name: "overdue-capped",
    history: [
      { grade: 3, elapsedDays: 0 },
      { grade: 3, elapsedDays: 5 },
      { grade: 3, elapsedDays: 30 }, // overdue to exercise cap logic
    ],
  },
];
