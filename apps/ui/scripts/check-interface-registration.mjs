import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Compile with a fourth (virtual) locale to catch hidden fixed-language maps.
// All overrides exist in memory; no catalog, registry, or build output is written.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
parsed.options.incremental = false;
const registryPath = path.join(root, "locales/registry.json");
const generatedPath = path.join(root, "lib/i18n/catalogs.generated.ts");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const probe = ["qaa", "qab", "qac"].find(code => !Object.hasOwn(registry, code));
if (!probe) throw new Error("No unused private-use locale for the registration probe.");
registry[probe] = {name: "Registration probe", direction: "rtl"};
const generated = fs.readFileSync(generatedPath, "utf8")
  .replace('import en from', `import ${probe} from "@/locales/${probe}.json";\nimport en from`)
  .replace(/export const interfaceCatalogs = \{[^}]+\}/, `export const interfaceCatalogs = { ${Object.keys(registry).join(", ")} }`);
const overrides = new Map([
  [registryPath, JSON.stringify(registry)],
  [generatedPath, generated],
  [path.join(root, `locales/${probe}.json`), fs.readFileSync(path.join(root, "locales/en.json"), "utf8")],
]);
const host = ts.createCompilerHost(parsed.options);
const readFile = host.readFile.bind(host), fileExists = host.fileExists.bind(host);
host.readFile = filename => overrides.get(path.resolve(filename)) ?? readFile(filename);
host.fileExists = filename => overrides.has(path.resolve(filename)) || fileExists(filename);
host.getSourceFile = (filename, languageVersion) => {
  const text = host.readFile(filename);
  return text === undefined ? undefined : ts.createSourceFile(filename, text, languageVersion, true);
};
const program = ts.createProgram(parsed.fileNames, parsed.options, host);
const diagnostics = [...(config.error ? [config.error] : []), ...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  console.error("Registering another interface language still requires source changes:");
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: filename => filename,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  }));
  process.exitCode = 1;
} else console.log("Adding a registered locale requires no edits to interface consumers. No workspace files changed.");
