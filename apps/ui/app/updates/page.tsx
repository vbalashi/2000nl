import {getRequestInterfaceSnapshot} from "@/lib/i18n/serverSnapshot";
import {InterfaceCatalogBoundary} from "@/components/system/InterfaceCatalogBoundary";
import {formatUiMessage} from "@/lib/uiMessages";
import Link from "next/link";
import { appVersionInfo } from "@/lib/appVersion";
import {
  readReleaseCatalog,
} from "@/lib/releases/releaseCatalogServer";
import { releaseVersionPattern } from "@/lib/releases/appRelease";
import { ReleaseHistory } from "@/components/releases/ReleaseUpdates";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import s from "@/components/releases/ReleaseUpdates.module.css";
export const dynamic = "force-dynamic";
export async function generateMetadata() { const copy=(await getRequestInterfaceSnapshot()).catalogs.en.features.releases;return {title:formatUiMessage(copy.pageTitle,{title:copy.updates})};}
export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ language?: string; before?: string }>;
}) {
  const params = await searchParams,
    snapshot=await getRequestInterfaceSnapshot(),
    requested=params.language?.toLowerCase().replaceAll("_","-").split("-")[0],
    language=requested&&Object.hasOwn(snapshot.registry,requested)?requested:"en",
    c = snapshot.catalogs[language].features.releases;
  const before =
    params.before && releaseVersionPattern.test(params.before)
      ? params.before
      : null;
  const catalog = await readReleaseCatalog(
    appVersionInfo().version,
    language,
    20,
    before,
  ).catch(() => null);
  return (
    <main
      className={`${theme.theme} ${s.historyPage}`}
      data-colour-mode="app"
      lang={language}
    >
      <div className={s.historyContent}>
        <Link className={s.link} href="/">
          ← {c.back}
        </Link>
        <h1>{formatUiMessage(c.pageTitle,{title:c.allUpdates})}</h1>
        {!catalog ? (
          <p role="status">{c.historyUnavailable}</p>
        ) : !catalog.items.length ? (
          <p>{c.noHistory}</p>
        ) : (
          <InterfaceCatalogBoundary><ReleaseHistory items={catalog.items} language={language} full /></InterfaceCatalogBoundary>
        )}
        {catalog?.nextVersion && (
          <a
            className={s.link}
            href={`/updates?language=${language}&before=${catalog.nextVersion}`}
          >
            {c.olderUpdates} →
          </a>
        )}
      </div>
    </main>
  );
}
