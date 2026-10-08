import { notFound } from "next/navigation";
import { StartupStatus } from "@/components/training/pilot/StartupStatus";
export default function PwaLaunchPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StartupStatus language="en" />;
}
