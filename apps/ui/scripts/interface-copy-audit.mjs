import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const root = rootIndex < 0 ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") : path.resolve(args[rootIndex + 1]);
const readJson = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
const registeredLocales = new Set(Object.keys(readJson(path.join(root, "locales/registry.json"), {en: {}, ru: {}, nl: {}})));
const exceptions = readJson(path.join(root, "locales/copy-audit-exceptions.json"), []);
const usedExceptions = new Set();
const sourceCatalog = readJson(path.join(root, "locales/en.json"), null);
function hasMessage(key) {
  const value = key.split(".").reduce((node, segment) => node && typeof node === "object" ? node[segment] : undefined, sourceCatalog);
  return typeof value === "string";
}
const literalExceptions = new Set(["2000nl", "nl", "· ISO 639-3", "i", "x", "A", "A+", "A++", "A+++"]);
const textProperties = new Set(["title", "label", "description", "placeholder", "alt", "help", "hint", "caption", "summary", "tooltip", "heading", "header", "message", "emptyText", "loadingText", "errorMessage"]);
const textAttributes = new Set([...textProperties, "aria-label", "aria-description", "content", "contentLabel", "hintLabel", "emptyMessage", "closeLabel", "detail", "notice", "actionLabel", "buttonLabel", "headings", "headers", "columns"]);
const isTextProperty = name => textProperties.has(name) || /(?:Label|Title|Description|Tooltip|Hint|Caption|Heading|Placeholder)$/.test(name);
const isTextAttribute = name => textAttributes.has(name) || /(?:Label|Title|Description|Tooltip|Hint|Caption|Heading|Placeholder|Text)$/.test(name);
const issues = [];
const human = text => /\p{L}/u.test(text) && !literalExceptions.has(text);
const propertyName = node => node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : "";
const isScope = node => ts.isSourceFile(node) || ts.isBlock(node) || ts.isFunctionLike(node);
function scopeOf(node) { for (let at = node.parent; at; at = at.parent) if (isScope(at)) return at; }
function contains(scope, node) { for (let at = node; at; at = at.parent) if (at === scope) return true; return false; }
function inspect(filename) {
  const relative = path.relative(root, filename).split(path.sep).join("/");
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true);
  const bindings = new Map(), functions = new Map(), setters = new Map(), mappedCallbacks = [];
  function bind(name, expressions, scope) {
    if (!bindings.has(name)) bindings.set(name, []);
    bindings.get(name).push({expressions, scope});
  }
  function collect(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) bind(node.name.text, [node.initializer], scopeOf(node));
      else if (ts.isArrayBindingPattern(node.name) && ts.isCallExpression(node.initializer) && /(?:^|\.)useState$/.test(node.initializer.expression.getText(source))) {
        const [value, setter] = node.name.elements;
        if (value && ts.isBindingElement(value) && ts.isIdentifier(value.name)) {
          const expressions = node.initializer.arguments.length ? [node.initializer.arguments[0]] : [];
          bind(value.name.text, expressions, scopeOf(node));
          if (setter && ts.isBindingElement(setter) && ts.isIdentifier(setter.name)) {
            if (!setters.has(setter.name.text)) setters.set(setter.name.text, []);
            setters.get(setter.name.text).push({expressions, scope:scopeOf(node)});
          }
        }
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isCallExpression(node.parent)
      && ts.isPropertyAccessExpression(node.parent.expression) && ["map", "flatMap"].includes(node.parent.expression.name.text)) {
      mappedCallbacks.push({fn:node, receiver:node.parent.expression.expression});
    }
    ts.forEachChild(node, collect);
  }
  collect(source);
  function stateWrites(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && setters.has(node.expression.text) && node.arguments[0]) {
      const setter = setters.get(node.expression.text).filter(binding => contains(binding.scope, node))
        .sort((a,b) => (a.scope.end-a.scope.pos)-(b.scope.end-b.scope.pos))[0];
      setter?.expressions.push(node.arguments[0]);
    }
    ts.forEachChild(node, stateWrites);
  }
  stateWrites(source);
  function resolve(name, node) {
    const candidates = (bindings.get(name) ?? []).filter(binding => contains(binding.scope, node));
    return candidates.sort((a, b) => (a.scope.end - a.scope.pos) - (b.scope.end - b.scope.pos))[0]?.expressions ?? [];
  }
  function arrayElements(node, seen = new Set()) {
    if (!node || seen.has(node)) return [];
    seen = new Set(seen).add(node);
    if (ts.isArrayLiteralExpression(node)) return [...node.elements];
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return arrayElements(node.expression, seen);
    if (ts.isIdentifier(node)) return resolve(node.text, node).flatMap(value => arrayElements(value, seen));
    return [];
  }
  for (const {fn, receiver} of mappedCallbacks) {
    const parameter = fn.parameters[0]?.name;
    const elements = arrayElements(receiver);
    if (!parameter || !elements.length) continue;
    if (ts.isIdentifier(parameter)) bind(parameter.text, elements, fn);
    else if (ts.isArrayBindingPattern(parameter)) parameter.elements.forEach((part, index) => {
      if (ts.isBindingElement(part) && ts.isIdentifier(part.name)) bind(part.name.text, elements.flatMap(value => arrayElements(value)[index] ? [arrayElements(value)[index]] : []), fn);
    });
    else if (ts.isObjectBindingPattern(parameter)) for (const part of parameter.elements) {
      if (ts.isIdentifier(part.name)) bind(part.name.text, elements.flatMap(value => {
        if (!ts.isObjectLiteralExpression(value)) return [];
        const property = value.properties.find(prop => ts.isPropertyAssignment(prop) && propertyName(prop.name) === propertyName(part.propertyName ?? part.name));
        return property ? [property.initializer] : [];
      }), fn);
    }
  }
  function expressions(node, seen = new Set()) {
    if (!node || seen.has(node)) return [];
    seen = new Set(seen).add(node);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return human(node.text) ? [node.text] : [];
    if (ts.isTemplateExpression(node)) {
      const text = node.head.text + node.templateSpans.map(span => `{…}${span.literal.text}`).join("");
      return [...(human(text) ? [text] : []), ...node.templateSpans.flatMap(span => expressions(span.expression, seen))];
    }
    if (ts.isIdentifier(node)) return resolve(node.text, node).flatMap(value => expressions(value, seen));
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return expressions(node.expression, seen);
    if (ts.isConditionalExpression(node)) return [...expressions(node.whenTrue, seen), ...expressions(node.whenFalse, seen)];
    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return expressions(node.right, seen);
      if ([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.PlusToken].includes(node.operatorToken.kind)) return [...expressions(node.left, seen), ...expressions(node.right, seen)];
    }
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(value => expressions(value, seen));
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const key = ts.isPropertyAccessExpression(node) ? node.name.text : node.argumentExpression && (ts.isStringLiteral(node.argumentExpression) || ts.isNumericLiteral(node.argumentExpression)) ? node.argumentExpression.text : undefined;
      if (key === undefined) return [];
      const bases = ts.isIdentifier(node.expression) ? resolve(node.expression.text, node) : [node.expression];
      const values = bases.flatMap(base => {
        if (ts.isObjectLiteralExpression(base)) {
          const prop = base.properties.find(property => ts.isPropertyAssignment(property) && propertyName(property.name) === key);
          return prop ? expressions(prop.initializer, seen) : [];
        }
        if (ts.isArrayLiteralExpression(base) && /^\d+$/.test(key)) return expressions(base.elements[Number(key)], seen);
        return [];
      });
      if (!values.length && key === "message" && /^(?:cause|error|err)$/.test(node.expression.getText(source))) return ["Raw error.message is displayed; map it to a catalog message."];
      return values;
    }
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && ["formatMessage", "formatUiMessage"].includes(node.expression.text)) return expressions(node.arguments[0], seen);
      if (ts.isPropertyAccessExpression(node.expression) && ["trim", "toLowerCase", "toLocaleLowerCase", "toUpperCase", "toLocaleUpperCase"].includes(node.expression.name.text)) return expressions(node.expression.expression, seen);
      const fn = ts.isIdentifier(node.expression) ? functions.get(node.expression.text) ?? resolve(node.expression.text, node).find(value => ts.isArrowFunction(value) || ts.isFunctionExpression(value)) : undefined;
      if (fn?.body) {
        if (!ts.isBlock(fn.body)) return expressions(fn.body, seen);
        const returned = [];
        function findReturn(child) { if (ts.isReturnStatement(child)) returned.push(...expressions(child.expression, seen)); else if (!ts.isFunctionLike(child)) ts.forEachChild(child, findReturn); }
        ts.forEachChild(fn.body, findReturn);
        return returned;
      }
    }
    return [];
  }
  function report(node, rule, texts) {
    for (const text of new Set(texts)) {
      const index = exceptions.findIndex(item => item.file === relative && item.rule === rule && item.text === text && item.reason?.trim());
      if (index >= 0) {usedExceptions.add(index); continue;}
      issues.push({file: relative, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, rule, text});
    }
  }
  function visit(node) {
    if (ts.isJsxText(node) && human(node.text.trim())) report(node, "jsx", [node.text.trim()]);
    if (ts.isJsxAttribute(node) && isTextAttribute(node.name.getText(source)) && node.initializer) {
      // HTML metadata values (theme-color, viewport etc.) are not prose.
      const owner = node.parent.parent;
      if (!(node.name.getText(source) === "content" && owner.tagName?.getText(source) === "meta")) report(node, "attribute", expressions(ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer));
    }
    if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent)) report(node, "expression", expressions(node.expression));
    if (ts.isPropertyAssignment(node) && isTextProperty(propertyName(node.name))) {
      // Camel-case status/message identifiers are selected through catalogs at render time.
      const texts = expressions(node.initializer).filter(text => propertyName(node.name) !== "message" || /\s|^[A-Z]|[\u0400-\u04ff]/u.test(text));
      report(node, "property", texts);
    }
    if (ts.isCallExpression(node) && /^(?:set\w*(?:Message|Error|Notice)|alert|confirm)$/.test(node.expression.getText(source))) {
      for (const arg of node.arguments) report(node, "message", expressions(arg).filter(text => /\s|^[A-Z]|[\u0400-\u04ff]/u.test(text)));
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left) && ["textContent", "innerText", "innerHTML"].includes(node.left.name.text)) {
      report(node, "dom-text", expressions(node.right));
    }
    if (sourceCatalog && ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      let key;
      if (node.expression.text === "platformV2Message") key = node.arguments[1];
      else {
        const wrapper = resolve(node.expression.text, node).find(value => ts.isArrowFunction(value));
        if (wrapper && ts.isCallExpression(wrapper.body) && wrapper.body.expression.getText(source) === "platformV2Message") {
          const argument = wrapper.body.arguments[1];
          const index = wrapper.parameters.findIndex(parameter => parameter.name.getText(source) === argument?.getText(source));
          if (index >= 0) key = node.arguments[index];
        }
      }
      if (key && ts.isStringLiteral(key) && !hasMessage(key.text)) report(key, "missing-key", [`Unknown catalog message: ${key.text}`]);
    }
    if (ts.isObjectLiteralExpression(node)) {
      const names = node.properties.map(property => propertyName(property.name));
      if (names.length >= 2 && names.every(name => registeredLocales.has(name))) report(node, "catalog", ["Inline interface-language catalog; move copy to locales/."]);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
function inspectStyles(filename) {
  const content = fs.readFileSync(filename, "utf8").replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, " "));
  const literals = /\bcontent\s*:\s*(["'])((?:\\[\s\S]|(?!\1)[^\\])*?)\1/g;
  for (const match of content.matchAll(literals)) {
    const text = match[2].replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)))
      .replace(/\\(["'\\])/g, "$1");
    if (human(text)) issues.push({file:path.relative(root, filename).split(path.sep).join("/"), line:content.slice(0,match.index).split("\n").length, rule:"css-content", text});
  }
}
function scan(directory) {
  if (!fs.existsSync(directory)) return;
  for (const item of fs.readdirSync(directory, {withFileTypes: true})) {
    const filename = path.join(directory, item.name);
    const relative = path.relative(root, filename).split(path.sep).join("/");
    if (item.isDirectory()) {
      if (["admin", "api", "dev", "fixtures", "server", "deployment", "diagnostics", "translation", "audio", "runtime", "node_modules", ".next"].includes(item.name)) continue;
      scan(filename);
    } else if (filename.endsWith(".css")) inspectStyles(filename);
    else if (/\.tsx?$/.test(filename) && !["DevDatabaseWarning.tsx"].includes(item.name) && !relative.endsWith(".d.ts") && !["lib/i18n/catalogs.generated.ts", "lib/admission/health.ts"].includes(relative)) inspect(filename);
  }
}
for (const directory of ["components", "app", "lib", "styles"]) scan(path.join(root, directory));
for (let index = 0; index < exceptions.length; index++) if (!usedExceptions.has(index)) issues.push({file: exceptions[index].file, line: 1, rule: "exception", text: `Unused audit exception: ${exceptions[index].text}`});
if (args.includes("--json")) console.log(JSON.stringify({issues}, null, 2));
else if (issues.length) for (const issue of issues) console.error(`${issue.file}:${issue.line} [${issue.rule}] ${issue.text}`);
else console.log("No uncatalogued learner UI copy found in scanned JSX, local bindings, props, labels or message setters.");
if (issues.length) process.exitCode = 1;
