import { SenseCardGateHarness } from "./SenseCardGateHarness";
import { ReadingSizePrototype, ReadingSettingsGate } from "./ReadingSizePrototype";
import { UnifiedDetailsGate } from "./UnifiedDetailsGate";

export const dynamic = "force-dynamic";

export default function SenseCardGatePage({
  searchParams,
}: {
  searchParams?: { prototype?: string };
}) {
  if (process.env.NODE_ENV === "production") {
    return <main className="p-8">Not available in production.</main>;
  }
  if (searchParams?.prototype === "reading") {
    return <ReadingSizePrototype />;
  }
  if (searchParams?.prototype === "details") {
    return <UnifiedDetailsGate />;
  }
  if (searchParams?.prototype === "reading-settings") {
    return <ReadingSettingsGate />;
  }
  return <SenseCardGateHarness />;
}
