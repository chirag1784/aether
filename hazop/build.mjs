// build.mjs — bundle the packages and the app into dist/index.html.
//
// The modules are ES modules so the test suite and a Node/Next deployment can
// import them directly. For the single-page deployment they are concatenated
// in dependency order into one script, with `export ` prefixes stripped and
// `import` statements removed. Everything then shares one scope.
//
// Three invariants make that safe, and the build asserts all three:
//   1. No two modules declare the same top-level identifier.
//   2. Every identifier a module imports is declared by some module in the
//      bundle, so nothing silently resolves to undefined.
//   3. The concatenated bundle compiles.
//
// Run: node hazop/build.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Script } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

// Dependency order. A module may only reference identifiers declared above it
// at call time (function bodies are fine either way, since they run later).
const MODULES = [
  'packages/domain/status.js',
  'packages/domain/causes.js',
  'packages/domain/guidewords.js',
  'packages/calculations/units.js',
  'packages/calculations/risk.js',
  'packages/calculations/dates.js',
  'packages/calculations/dedup.js',
  'packages/calculations/completeness.js',
  'packages/calculations/doability.js',
  'packages/chemical/properties.js',
  'packages/chemical/alerts.js',
  'packages/legal/library.js',
  'packages/legal/thresholds.js',
  'packages/legal/applicability.js',
  'packages/research/sources.js',
  'packages/research/resolve.js',
  'packages/diagrams/geometry.js',
  'packages/reports/quality-gate.js',
  'app/util.js',
  'app/store.js',
  'app/state.js',
  'app/ai.js',
  'app/ai-tools.js',
  'app/research.js',
  'app/reason.js',
  'app/diagrams.js',
  'app/exports.js',
  'app/seed.js',
  'app/views/dashboard.js',
  'app/views/projects.js',
  'app/views/documents.js',
  'app/views/process.js',
  'app/views/chemicals.js',
  'app/views/nodes.js',
  'app/views/hazop.js',
  'app/views/risk.js',
  'app/views/recommendations.js',
  'app/views/research.js',
  'app/views/team.js',
  'app/views/legal.js',
  'app/views/sources.js',
  'app/views/reports.js',
  'app/views/settings.js',
  'app/views/chat.js',
  'app/main.js',
];

const IMPORT_RE = /^[ \t]*import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm;
const BARE_IMPORT_RE = /^[ \t]*import\s+['"][^'"]+['"];?[ \t]*$/gm;

function stripModuleSyntax(src) {
  let out = src.replace(IMPORT_RE, '').replace(BARE_IMPORT_RE, '');
  // `export { a as b }` / `export { a }` re-export lists: drop them, since the
  // declarations they name are already in scope.
  out = out.replace(/^[ \t]*export\s*\{[^}]*\};?[ \t]*$/gm, '');
  // `export default` is not used anywhere; fail loudly rather than mangle it.
  if (/^\s*export\s+default/m.test(out)) throw new Error('export default is not supported by this bundler');
  // `export const|let|function|class|async function` -> the declaration itself
  out = out.replace(/^([ \t]*)export\s+(?=(const|let|var|function|class|async\s+function)\b)/gm, '$1');
  return out;
}

/** Top-level declarations a module contributes to the shared scope. */
function declaredIdentifiers(src) {
  const ids = new Set();
  const patterns = [
    /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
    /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm,
    /^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) ids.add(m[1]);
  }
  return ids;
}

/** Identifiers a module imports from the other modules. */
function importedIdentifiers(src) {
  const ids = new Set();
  const re = /^[ \t]*import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"]/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) ids.add(name);
    }
  }
  return ids;
}

const sources = MODULES.map((rel) => ({ rel, src: readFileSync(join(root, rel), 'utf8') }));

// Invariant 1: no duplicate top-level identifiers.
const owner = new Map();
const duplicates = [];
for (const { rel, src } of sources) {
  for (const id of declaredIdentifiers(src)) {
    if (owner.has(id)) duplicates.push(id + ': ' + owner.get(id) + ' and ' + rel);
    else owner.set(id, rel);
  }
}
if (duplicates.length) {
  console.error('Duplicate top-level identifiers across modules:\n  ' + duplicates.join('\n  '));
  process.exit(1);
}

// Invariant 2: every imported identifier is declared somewhere in the bundle.
const missing = [];
for (const { rel, src } of sources) {
  for (const id of importedIdentifiers(src)) {
    if (!owner.has(id)) missing.push(rel + ' imports ' + id + ', which no bundled module declares');
  }
}
if (missing.length) {
  console.error('Unresolved imports:\n  ' + missing.join('\n  '));
  process.exit(1);
}

const banner = [
  '/* HAZOP MASTER AI — bundled single-page deployment.',
  ' * Source of truth: hazop/packages/** (framework-free ES modules, covered by',
  ' * hazop/tests) and hazop/app/**. Built by hazop/build.mjs — do not edit',
  ' * dist/index.html by hand.',
  ' */',
  "'use strict';",
].join('\n');

const bundle = [banner]
  .concat(
    sources.map(({ rel, src }) => '\n/* ===== ' + rel + ' ===== */\n' + stripModuleSyntax(src))
  )
  .join('\n');

const app = '(function () {\n' + bundle + '\n})();';

// Invariant 3: the bundle compiles. `new Script` parses without executing, so
// a stray paren fails the build instead of reaching the published page.
try {
  new Script(app, { filename: 'hazop-bundle.js' });
} catch (e) {
  writeFileSync(join(root, 'dist/bundle.debug.js'), app);
  console.error('The bundle does not compile: ' + ((e && e.message) || e));
  console.error('Wrote dist/bundle.debug.js — run `node --check hazop/dist/bundle.debug.js` for the line.');
  process.exit(1);
}
const styles = readFileSync(join(root, 'app/styles.css'), 'utf8');
const shell = readFileSync(join(root, 'app/shell.html'), 'utf8');

const html = shell.replace('/* @@STYLES@@ */', () => styles).replace('/* @@APP@@ */', () => app);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('dist/index.html   ' + kb(Buffer.byteLength(html)));
console.log('  styles          ' + kb(Buffer.byteLength(styles)));
console.log('  script          ' + kb(Buffer.byteLength(app)));
console.log('  modules         ' + MODULES.length);
console.log('  identifiers     ' + owner.size);
