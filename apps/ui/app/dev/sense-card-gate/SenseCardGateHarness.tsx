"use client";

import React from "react";
import { LibraryCollectionsPicker } from "@/components/training/library-v2/LibraryCollectionsPicker";
import { LibrarySenseCardGroup } from "@/components/training/library-v2/LibrarySenseCardGroup";
import { buildLibrarySenseCardGroupModel } from "@/components/training/library-v2/librarySenseCardModel";
import { TrainingSenseCardStage } from "@/components/training/v2/TrainingSenseCardStage";
import { SenseCardReportAction } from "@/components/feedback/SenseCardReportSheet";
import {
  buildSenseCardDiagnosticReport,
  freezeSenseCardDiagnosticSnapshot,
  queuePreparedSenseCardDiagnosticReport,
  type SenseCardDiagnosticSnapshot,
} from "@/lib/feedback/diagnosticReportClient";
import { buildTrainingSenseCardModel } from "@/components/training/v2/trainingSenseCardModel";
import {
  gateBankGroup,
  gateFinanceEntry,
  gateFurnitureEntry,
  gateLongHeadwordGroup,
  gateSingleSenseGroup,
} from "@/lib/platform/fixtures/senseCardV1GateFixture";

export function SenseCardGateHarness() {
  const [trainingSide, setTrainingSide] = React.useState<"face" | "answer">(
    "face",
  );
  const [collectionsOpen, setCollectionsOpen] = React.useState(false);
  const [collectionIds, setCollectionIds] = React.useState(["daily-review"]);
  const reportEntry = {
    ...gateFurnitureEntry,
    entryId: "11111111-1111-4111-8111-111111111111",
    reportContentRevision: "a".repeat(64),
    contentNodes: gateFurnitureEntry.contentNodes.map((node, index) => {
      const sourceTextFingerprint = `${index + 1}`.repeat(64);
      return {
        ...node,
        sourceTextFingerprint,
        translations: node.translations.map((translation) => ({
          ...translation,
          translationId: `${index + 5}`.repeat(64),
          sourceTextFingerprint,
        })),
      };
    }),
  };
  const reportGroup = {
    ...gateSingleSenseGroup,
    entries: [reportEntry],
  };
  const reportFinanceEntry = {
    ...gateFinanceEntry,
    entryId: "22222222-2222-4222-8222-222222222222",
    reportContentRevision: "b".repeat(64),
    contentNodes: gateFinanceEntry.contentNodes.map((node, index) => {
      const sourceTextFingerprint = `${index + 5}`.repeat(64);
      return {
        ...node,
        sourceTextFingerprint,
        translations: node.translations.map((translation) => ({
          ...translation,
          translationId: `${index + 1}`.repeat(64),
          sourceTextFingerprint,
        })),
      };
    }),
  };
  const denseReportGroup = {
    ...gateBankGroup,
    senseCount: 6,
    entries: [
      reportEntry,
      ...[
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
        "44444444-4444-4444-8444-444444444444",
        "55555555-5555-4555-8555-555555555555",
        "66666666-6666-4666-8666-666666666666",
      ].map((entryId) => ({ ...reportFinanceEntry, entryId })),
    ],
  };
  const trainingModel = buildTrainingSenseCardModel({
    group: reportGroup,
    entry: reportEntry,
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
        <DiagnosticReportOutboxGate
          snapshot={freezeSenseCardDiagnosticSnapshot({
            route: "library",
            group: reportGroup,
            entry: reportEntry,
          })}
        />
        <div className="mx-auto grid max-w-[1440px] gap-8 xl:grid-cols-2">
          <Fixture title="SC-01/02 · Training · single sense · interactive">
            <div className="min-h-[680px] min-w-0">
              <TrainingSenseCardStage
                model={trainingModel}
                mode="word-to-definition"
                interfaceLanguage="nl"
                side={trainingSide}
                onSideChange={setTrainingSide}
                onPlayAudio={() => undefined}
                onAction={() => undefined}
                reportAction={
                  <SenseCardReportAction
                    snapshot={freezeSenseCardDiagnosticSnapshot({
                      route: "training",
                      group: reportGroup,
                      entry: reportEntry,
                    })}
                    interfaceLanguage="nl"
                  />
                }
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
                onAction={() => undefined}
              />
            </div>
          </Fixture>

          <Fixture title="SC-01/02 · Library · single sense · full">
            <div className="relative h-[680px] min-w-0 rounded-3xl">
              <LibrarySenseCardGroup
                model={buildLibrarySenseCardGroupModel(
                  reportGroup,
                  "nl",
                )}
                interfaceLanguage="nl"
                translationEnabled
                onPlayAudio={() => undefined}
                onOpenCollections={() => undefined}
                onTrainNext={() => undefined}
                onAction={() => undefined}
                bottomOverlayReserve
              />
              <div className="absolute bottom-2 left-3 z-20 sm:left-5">
                <SenseCardReportAction
                  snapshot={freezeSenseCardDiagnosticSnapshot({
                    route: "library",
                    group: reportGroup,
                    entry: reportEntry,
                  })}
                  interfaceLanguage="nl"
                />
              </div>
            </div>
          </Fixture>

          <Fixture title="SC-03 · Library · dense report reserve">
            <div className="relative h-[680px] min-w-0 rounded-3xl">
              <LibrarySenseCardGroup
                model={buildLibrarySenseCardGroupModel(denseReportGroup, "nl")}
                interfaceLanguage="nl"
                translationEnabled
                onPlayAudio={() => undefined}
                onOpenCollections={() => undefined}
                onTrainNext={() => undefined}
                onAction={() => undefined}
                bottomOverlayReserve
              />
              <div className="absolute bottom-2 left-3 z-20 sm:left-5">
                <SenseCardReportAction
                  snapshot={freezeSenseCardDiagnosticSnapshot({
                    route: "library",
                    group: denseReportGroup,
                    entry: reportEntry,
                  })}
                  interfaceLanguage="nl"
                />
              </div>
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
                onAction={() => undefined}
              />
            </div>
          </Fixture>
        </div>
      </main>
    </>
  );
}

function DiagnosticReportOutboxGate({ snapshot }: { snapshot: SenseCardDiagnosticSnapshot }) {
  const prepared = React.useRef<ReturnType<typeof buildSenseCardDiagnosticReport> | null>(null);
  const [result, setResult] = React.useState("idle");
  const queueExact = async () => {
    try {
      prepared.current ??= buildSenseCardDiagnosticReport({
        snapshot,
        kind: "other",
        comment: "lease fixture",
        reportId: "77777777-7777-4777-8777-777777777777",
      });
      const queued = await queuePreparedSenseCardDiagnosticReport(await prepared.current);
      setResult(queued.state);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "failed");
    }
  };
  return (
    <button
      type="button"
      data-testid="queue-exact-report-fixture"
      data-result={result}
      className="sr-only"
      onClick={() => void queueExact()}
    >
      Queue exact report fixture
    </button>
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
    <section
      className="min-w-0"
      data-gate-fixture={title.split(" · ")[0]}
      data-gate-title={title}
    >
      <h1 className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-slate-400">
        {title}
      </h1>
      {children}
    </section>
  );
}
