import { SenseCardGateHarness } from "./SenseCardGateHarness";

export const dynamic = "force-dynamic";

export default function SenseCardGatePage() {
  if (process.env.NODE_ENV === "production") {
    return <main className="p-8">Not available in production.</main>;
  }
  return <SenseCardGateHarness />;
}
