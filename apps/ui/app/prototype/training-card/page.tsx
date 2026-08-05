import { notFound } from "next/navigation";

import { TrainingCardTracer } from "./TrainingCardTracer";

export default function TrainingCardPrototypePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <TrainingCardTracer />;
}
