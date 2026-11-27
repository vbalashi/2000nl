import { notFound } from "next/navigation";
import { InterfaceCatalogBoundary } from "@/components/system/InterfaceCatalogBoundary";
import { getRequestInterfaceSnapshot } from "@/lib/i18n/serverSnapshot";
import { readSandboxCatalog } from "@/lib/billing/sandboxCatalog";
import { PremiumOffer } from "./PremiumOffer";

export const dynamic = "force-dynamic";

export default async function PremiumPage({ searchParams }: { searchParams: Promise<{ language?: string }> }) {
  if (!readSandboxCatalog(process.env)) notFound();
  const [{ language }, snapshot] = await Promise.all([searchParams, getRequestInterfaceSnapshot()]);
  const locale = typeof language === "string" && Object.hasOwn(snapshot.registry, language) ? language : "en";
  return <InterfaceCatalogBoundary><PremiumOffer language={locale} /></InterfaceCatalogBoundary>;
}
