"use client";

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
  const trainingModel = buildTrainingSenseCardModel({
    group: gateSingleSenseGroup,
    entry: gateFurnitureEntry,
    interfaceLanguage: "nl",
  });

  return (
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
          <div className="min-h-[680px] min-w-0 rounded-3xl">
            <LibrarySenseCardGroup
              model={buildLibrarySenseCardGroupModel(gateBankGroup, "nl")}
              interfaceLanguage="nl"
              translationEnabled
              onPlayAudio={() => undefined}
              onAction={() => undefined}
            />
          </div>
        </Fixture>

        <Fixture title="SC-03 · Library · multi sense · narrow">
          <div className="min-h-[680px] min-w-0 max-w-[390px] rounded-3xl">
            <LibrarySenseCardGroup
              model={buildLibrarySenseCardGroupModel(gateBankGroup, "nl")}
              interfaceLanguage="nl"
              translationEnabled
              onPlayAudio={() => undefined}
              onAction={() => undefined}
            />
          </div>
        </Fixture>

        <Fixture title="SC-01/02 · Library · single sense · full">
          <div className="min-h-[680px] min-w-0 rounded-3xl">
            <LibrarySenseCardGroup
              model={buildLibrarySenseCardGroupModel(
                gateSingleSenseGroup,
                "nl",
              )}
              interfaceLanguage="nl"
              translationEnabled
              onPlayAudio={() => undefined}
              onAction={() => undefined}
            />
          </div>
        </Fixture>

        <Fixture title="SC-01/02 · Library · single sense · narrow">
          <div className="min-h-[680px] min-w-0 max-w-[390px] rounded-3xl">
            <LibrarySenseCardGroup
              model={buildLibrarySenseCardGroupModel(
                gateSingleSenseGroup,
                "ru",
              )}
              interfaceLanguage="ru"
              translationEnabled
              onPlayAudio={() => undefined}
              onAction={() => undefined}
            />
          </div>
        </Fixture>

        <Fixture title="SC-06 · Library · long headword · full">
          <div className="min-h-[680px] min-w-0 rounded-3xl">
            <LibrarySenseCardGroup
              model={buildLibrarySenseCardGroupModel(
                gateLongHeadwordGroup,
                "nl",
              )}
              interfaceLanguage="nl"
              translationEnabled
              onPlayAudio={() => undefined}
              onAction={() => undefined}
            />
          </div>
        </Fixture>

        <Fixture title="SC-06 · Library · long headword · narrow">
          <div className="min-h-[680px] min-w-0 max-w-[390px] rounded-3xl">
            <LibrarySenseCardGroup
              model={buildLibrarySenseCardGroupModel(
                gateLongHeadwordGroup,
                "ru",
              )}
              interfaceLanguage="ru"
              translationEnabled
              onPlayAudio={() => undefined}
              onAction={() => undefined}
            />
          </div>
        </Fixture>
      </div>
    </main>
  );
}

function Fixture({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0" data-gate-fixture={title.split(" · ")[0]}>
      <h1 className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-slate-400">
        {title}
      </h1>
      {children}
    </section>
  );
}
