import { notFound } from "next/navigation";
import { OnboardingPreview } from "./preview";

export const dynamic = "force-dynamic";

export default function Page() {
  if (process.env.NODE_ENV === "production" || process.env.ONBOARDING_PREVIEW_9 !== "true") notFound();
  return <OnboardingPreview />;
}
