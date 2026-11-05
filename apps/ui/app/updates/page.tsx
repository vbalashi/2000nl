import {formatUiMessage} from "@/lib/uiMessages";
import Link from "next/link";
import { appVersionInfo } from "@/lib/appVersion";
import {
  readReleaseCatalog,
  releaseLanguage,
} from "@/lib/releases/releaseCatalogServer";
import { releaseVersionPattern } from "@/lib/releases/appRelease";
import { releaseCopy } from "@/lib/releases/releaseCopy";
import { ReleaseHistory } from "@/components/releases/ReleaseUpdates";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import s from "@/components/releases/ReleaseUpdates.module.css";
export const dynamic = "force-dynamic";
export const metadata = { title: formatUiMessage(releaseCopy("en").pageTitle,{title:releaseCopy("en").updates}) };
export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ language?: string; before?: string }>;
}) {
  const params = await searchParams,
    language = releaseLanguage(params.language),
    c = releaseCopy(language);
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
          <ReleaseHistory items={catalog.items} language={language} full />
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
