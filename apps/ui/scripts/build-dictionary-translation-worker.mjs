import {build} from "esbuild";
import path from "node:path";
import {fileURLToPath} from "node:url";
const uiRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
await build({
  entryPoints:[path.join(uiRoot,"scripts/dictionary-translation-worker.ts")],
  outfile:path.join(uiRoot,".next/dictionary-translation-worker.cjs"),
  bundle:true,platform:"node",target:"node22",format:"cjs",logLevel:"info",
});
