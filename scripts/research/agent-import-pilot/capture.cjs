// Reuses AudioFilms' existing manual-caption provider; never invokes paid fallback/ASR.
const path = require('node:path');
const fs = require('node:fs');
const [appDirectory, videoId, output] = process.argv.slice(2);
if (!appDirectory || !/^[A-Za-z0-9_-]{11}$/.test(videoId || '') || !output) {
  throw new Error('Usage: node capture.cjs <audiofilms/app> <video-id> <output.json>');
}
const { createJiti } = require(path.join(appDirectory, 'node_modules/jiti'));
const jiti = createJiti(__filename, { alias: { '@': path.join(appDirectory, 'src') } });
(async () => {
  const { YtDlpProvider } = await jiti.import(path.join(appDirectory, 'src/lib/providers/YtDlpProvider.ts'));
  const start = performance.now();
  const result = await new YtDlpProvider(process.env.YT_DLP_PATH || '/opt/homebrew/bin/yt-dlp')
    .fetchSubtitles(videoId, { language: 'nl', sourceKind: 'manual' });
  if (result.sourceKind !== 'manual' || !['nl', 'nl-NL'].includes(result.language)) throw new Error('Unexpected subtitle source');
  fs.writeFileSync(output, JSON.stringify({ captureMs: performance.now() - start, ...result, providerLanguage: result.language, language: 'nl' }, null, 2));
  console.log(JSON.stringify({ cues: result.phrases.length, language: result.language, sourceKind: result.sourceKind }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
