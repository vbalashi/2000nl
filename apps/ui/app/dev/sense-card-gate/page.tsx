import { SenseCardGateHarness } from "./SenseCardGateHarness";
import { ReadingSizePrototype, ReadingSettingsGate } from "./ReadingSizePrototype";
import { UnifiedDetailsGate } from "./UnifiedDetailsGate";
import { AppFramePrototype } from "./AppFramePrototype";
import { normalizeReadingSize } from "@/lib/reading/readingSize";

export const dynamic = "force-dynamic";

export default function SenseCardGatePage({
  searchParams,
}: {
  searchParams?: {
    prototype?: string;
    size?: string;
    wrapper?: string;
    fixture?: string;
    variant?: string;
    mode?: string;
  };
}) {
  if (process.env.NODE_ENV === "production") {
    return <main className="p-8">Not available in production.</main>;
  }
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
  if (searchParams?.prototype === "app-frame") {
    return (
      <AppFramePrototype
        initialVariant={searchParams.variant}
        initialMode={searchParams.mode}
      />
    );
  }
  return <SenseCardGateHarness />;
}
