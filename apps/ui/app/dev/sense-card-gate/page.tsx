import {RelatedWordGate} from "./RelatedWordGate";
import { TrainingSessionStateGate } from "./TrainingSessionStateGate";
import { ExerciseCardGate } from "./ExerciseCardGate";
import { SenseCardGateHarness } from "./SenseCardGateHarness";
import {
  ReadingSizePrototype,
  ReadingSettingsGate,
} from "./ReadingSizePrototype";
import { UnifiedDetailsGate } from "./UnifiedDetailsGate";
import { normalizeReadingSize } from "@/lib/reading/readingSize";

export const dynamic = "force-dynamic";

export default async function SenseCardGatePage({
  searchParams: query,
}: {
  searchParams?: Promise<{
    prototype?: string;
    size?: string;
    wrapper?: string;
    fixture?: string;
    mode?: string;
    language?: string;
    family?: string;
    state?: string;
  }>;
}) {
  const searchParams = await query;
  if (process.env.NODE_ENV === "production") {
    return <main className="p-8">Not available in production.</main>;
  }
  if (searchParams?.prototype === "session-states") return <TrainingSessionStateGate
    language={searchParams.language === "ru" || searchParams.language === "nl" ? searchParams.language : "en"}
    family={searchParams.family === "sentence" ? "sentence" : "idiom"}
    state={searchParams.state === "context-pending" || searchParams.state === "empty" || searchParams.state === "loading" || searchParams.state === "error" || searchParams.state === "unsupported" || searchParams.state === "exhausted" || searchParams.state === "failure" ? searchParams.state : "complete"}
    dark={searchParams.mode === "dark"} />;
  if (searchParams?.prototype === "related-words") return <RelatedWordGate/>;
  if (searchParams?.prototype === "exercise") return <ExerciseCardGate cow={searchParams.fixture === "koe"} />;
  if (searchParams?.prototype === "reading") {
    return <ReadingSizePrototype />;
  }
  if (searchParams?.prototype === "details") {
    return (
      <UnifiedDetailsGate
        size={normalizeReadingSize(searchParams.size)}
        drawer={searchParams.wrapper === "drawer"}
        fixture={searchParams.fixture === "long" ? "long" : "bank"}
      />
    );
  }
  if (searchParams?.prototype === "reading-settings") {
    return <ReadingSettingsGate />;
  }
  return <SenseCardGateHarness />;
}
