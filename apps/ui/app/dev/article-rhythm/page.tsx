import { notFound } from "next/navigation";
import { RhythmStudy } from "./study";
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RhythmStudy />;
}
