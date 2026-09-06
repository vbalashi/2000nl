import { SenseCardGateHarness } from "./SenseCardGateHarness";
import { HeightPrototype } from "./HeightPrototype";

export const dynamic = "force-dynamic";

export default function SenseCardGatePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (process.env.NODE_ENV === "production") {
    return <main className="p-8">Not available in production.</main>;
  }
  if (searchParams.prototype === "height") return <HeightPrototype />;
  return <SenseCardGateHarness />;
}
