"use client";

import React from "react";
import { LibraryCollectionsPicker } from "@/components/training/library-v2/LibraryCollectionsPicker";
import { LibrarySenseCardGroup } from "@/components/training/library-v2/LibrarySenseCardGroup";
import { buildLibrarySenseCardGroupModel } from "@/components/training/library-v2/librarySenseCardModel";
import { TrainingSenseCardStage } from "@/components/training/v2/TrainingSenseCardStage";
import { buildTrainingSenseCardModel } from "@/components/training/v2/trainingSenseCardModel";
import {
  gateBankGroup,
  gateFurnitureEntry,
  gateLongHeadwordGroup,
  gateSingleSenseGroup,
} from "@/lib/platform/fixtures/senseCardV1GateFixture";

export function SenseCardGateHarness() {
  const [collectionsOpen, setCollectionsOpen] = React.useState(false);
  const [collectionIds, setCollectionIds] = React.useState(["daily-review"]);
  const trainingModel = buildTrainingSenseCardModel({
    group: gateSingleSenseGroup,
    entry: gateFurnitureEntry,
    interfaceLanguage: "nl",
  });

  return (
    <>
      <style jsx global>{`
        html {
          scrollbar-width: none;
        }
        html::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <main className="min-h-screen bg-[#0d1017] px-4 py-8 text-slate-100 sm:px-8">
        <div className="mx-auto grid max-w-[1440px] gap-8 xl:grid-cols-2">
          <Fixture title="SC-01/02 · Training · single sense · interactive">
            <div className="min-h-[680px] min-w-0">
              <TrainingSenseCardStage
                model={trainingModel}
                interfaceLanguage="nl"
                onPlayAudio={() => undefined}
                onAction={() => undefined}
              />
            </div>
          </Fixture>

          <Fixture title="SC-03 · Library · multi sense · full">
            <div className="relative h-[680px] min-w-0 rounded-3xl">
              <LibrarySenseCardGroup
                model={buildLibrarySenseCardGroupModel(gateBankGroup, "nl")}
                interfaceLanguage="nl"
                translationEnabled
                collectionCounts={{
                  "entry-bank-furniture": 2,
                  "entry-bank-finance": 1,
                }}
                onPlayAudio={() => undefined}
                onOpenCollections={() => setCollectionsOpen(true)}
                onTrainNext={() => undefined}
                onReport={() => undefined}
                onAction={() => undefined}
              />
              <LibraryCollectionsPicker
                open={collectionsOpen}
                headword="bank"
                definition="een meubelstuk waarop je met meer personen kunt zitten"
                interfaceLanguage="nl"
                userLists={[
                  {
                    id: "daily-review",
                    name: "Dagelijkse herhaling",
                    type: "user",
                    item_count: 24,
                  },
                  {
                    id: "youtube-week",
                    name: "YouTube · deze week",
                    type: "user",
                    item_count: 17,
                  },
                  {
                    id: "difficult-words",
                    name: "Moeilijke woorden",
                    type: "user",
                    item_count: 9,
                  },
                ]}
                memberships={collectionIds.map((listId) => ({
                  listId,
                  listType: "user",
                  name: listId,
                  editable: true,
                  isActiveTrainingList: false,
                }))}
                busyListId={null}
                status={null}
                onClose={() => setCollectionsOpen(false)}
                onToggleList={(list, included) => {
                  setCollectionIds((current) =>
                    included
                      ? current.filter((id) => id !== list.id)
                      : [...current, list.id],
                  );
                }}
                onCreateList={() => undefined}
              />
            </div>
          </Fixture>

          <Fixture title="SC-03 · Library · multi sense · narrow">
            <div className="h-[680px] min-w-0 max-w-[390px] rounded-3xl">
              <LibrarySenseCardGroup
                model={buildLibrarySenseCardGroupModel(gateBankGroup, "nl")}
                interfaceLanguage="nl"
                translationEnabled
                collectionCounts={{
                  "entry-bank-furniture": 2,
                  "entry-bank-finance": 1,
                }}
                onPlayAudio={() => undefined}
                onOpenCollections={() => undefined}
                onTrainNext={() => undefined}
                onReport={() => undefined}
                onAction={() => undefined}
              />
            </div>
          </Fixture>

          <Fixture title="SC-01/02 · Library · single sense · full">
            <div className="h-[680px] min-w-0 rounded-3xl">
              <LibrarySenseCardGroup
                model={buildLibrarySenseCardGroupModel(
                  gateSingleSenseGroup,
                  "nl",
                )}
                interfaceLanguage="nl"
                translationEnabled
                onPlayAudio={() => undefined}
                onOpenCollections={() => undefined}
                onTrainNext={() => undefined}
                onReport={() => undefined}
                onAction={() => undefined}
              />
            </div>
          </Fixture>

          <Fixture title="SC-01/02 · Library · single sense · narrow">
            <div className="h-[680px] min-w-0 max-w-[390px] rounded-3xl">
              <LibrarySenseCardGroup
                model={buildLibrarySenseCardGroupModel(
                  gateSingleSenseGroup,
                  "ru",
                )}
                interfaceLanguage="ru"
                translationEnabled
                onPlayAudio={() => undefined}
                onOpenCollections={() => undefined}
                onTrainNext={() => undefined}
                onReport={() => undefined}
                onAction={() => undefined}
              />
            </div>
          </Fixture>

          <Fixture title="SC-06 · Library · long headword · full">
            <div className="h-[680px] min-w-0 rounded-3xl">
              <LibrarySenseCardGroup
                model={buildLibrarySenseCardGroupModel(
                  gateLongHeadwordGroup,
                  "nl",
                )}
                interfaceLanguage="nl"
                translationEnabled
                onPlayAudio={() => undefined}
                onOpenCollections={() => undefined}
                onTrainNext={() => undefined}
                onReport={() => undefined}
                onAction={() => undefined}
              />
            </div>
          </Fixture>

          <Fixture title="SC-06 · Library · long headword · narrow">
            <div className="h-[680px] min-w-0 max-w-[390px] rounded-3xl">
              <LibrarySenseCardGroup
                model={buildLibrarySenseCardGroupModel(
                  gateLongHeadwordGroup,
                  "ru",
                )}
                interfaceLanguage="ru"
                translationEnabled
                onPlayAudio={() => undefined}
                onOpenCollections={() => undefined}
                onTrainNext={() => undefined}
                onReport={() => undefined}
                onAction={() => undefined}
              />
            </div>
          </Fixture>
        </div>
      </main>
    </>
  );
}

function Fixture({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0" data-gate-fixture={title.split(" · ")[0]}>
      <h1 className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-slate-400">
        {title}
      </h1>
      {children}
    </section>
  );
}
