import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Brand marks, a standard identifier, and existing icon glyphs are not translated.
const literalExceptions = new Set(["2000nl", "nl", "· ISO 639-3", "i", "x"]);
const attributes = new Set(["aria-label", "title", "placeholder", "alt", "label", "help", "content"]);
const registeredLocales = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root, "locales/registry.json"), "utf8"))));
const issues = [];
function scan(directory) {
  for (const item of fs.readdirSync(directory, {withFileTypes: true})) {
    const filename = path.join(directory, item.name);
    // Operator tools and development diagnostics have a separate audience.
    if (item.isDirectory()) { if (item.name !== "admin") scan(filename); continue; }
    if (!filename.endsWith(".tsx") || item.name === "DevDatabaseWarning.tsx") continue;
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
      let text;
      if (ts.isJsxText(node)) text = node.text.trim();
      else if (ts.isJsxAttribute(node) && attributes.has(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) text = node.initializer.text;
      else if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent) && node.expression && ts.isStringLiteral(node.expression)) text = node.expression.text.trim();
      if (text && /\p{L}/u.test(text) && !literalExceptions.has(text)) issues.push({file: path.relative(root, filename), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, text});
      if (ts.isObjectLiteralExpression(node)) {
        const names = node.properties.map(property => property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? property.name.text : "");
        if (names.length >= 2 && names.every(code => registeredLocales.has(code))) issues.push({file: path.relative(root, filename), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, text: "Inline interface-language catalog; move copy to locales/."});
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
scan(path.join(root, "components"));
if (issues.length) {
  for (const issue of issues) console.error(`${issue.file}:${issue.line}: ${issue.text}`);
  process.exitCode = 1;
} else console.log("No inline learner-interface JSX copy or language catalogs found.");
