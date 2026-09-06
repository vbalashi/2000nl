import { SenseCardGateHarness } from "./SenseCardGateHarness";
import { ReadingSizePrototype } from "./ReadingSizePrototype";

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
  return <SenseCardGateHarness />;
}
