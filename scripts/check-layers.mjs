// Checks that src/ keeps to its Feature-Sliced Design layout (README, "Files"); `npm run lint`
// runs it after oxlint. The same rules bst-admin checks with eslint-plugin-boundaries, which would
// bring ESLint and some 94 more packages along, plus a few of Ghostfetch's own:
//
// - Layers, from the top: app, pages, features, entities, shared. A file imports only from its
//   own layer's folder or the layers below. app and shared have folders (segments) instead of
//   slices, and those import each other freely.
// - A slice (a folder in pages, features or entities) imports another only through its index.ts,
//   and never one on its own layer, except an entity through the other's @x/<itself>.ts.
// - shared/ui/kit/ has a public file per component; every other folder of shared/ui and shared/lib
//   is used through its index.ts. No index re-exports everything with `export *`.
// - The background and the two page scripts reach nothing but the entities and the non-UI parts of
//   shared/lib, and import no npm package but WXT's: they ship none of the screens' libraries.
// - The entities import no npm package and no .tsx: the background, the page scripts and the tests
//   (under Node) load them too. The body editor's engine and its vim keys import only .ts files
//   by relative path, as the Zen test hands them to the browser straight from src/.
// - Every folder of src/app/ with an index file is one of the extension's parts: WXT builds every
//   app/<name>/index.* into the extension.
//
//   node scripts/check-layers.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const RANK = { shared: 1, entities: 2, features: 3, pages: 4, app: 5 };
const SLICED = new Set(['pages', 'features', 'entities']);
// The extension's parts, as WXT builds them from src/app/.
const ENTRYPOINTS = new Set([
  'background',
  'interceptor',
  'bridge',
  'popup',
  'sidepanel',
  'kit',
]);
// What runs outside the extension's pages, and so may not reach React or the UI kit.
const NOT_UI = ['app/background/', 'app/interceptor/', 'app/bridge/', 'app/messaging/'];
const UI_LIBS = ['shared/lib/react/', 'shared/lib/class-names/'];
const RAW_EDITOR = ['shared/ui/code-editor/engine/', 'shared/ui/code-editor/vim/'];

const problems = [];
const report = (file, line, message) => problems.push(`src/${file}:${line}  ${message}`);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
const files = walk(SRC)
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .map((file) => path.relative(SRC, file).split(path.sep).join('/'));

// Where a file sits: its layer, and the unit it belongs to (a slice, an app or shared segment, or a
// group of shared/ui or shared/lib), plus the files of that unit others may import.
function locate(file) {
  const [layer, first, second] = file.split('/');
  if (!RANK[layer]) return null;
  if (SLICED.has(layer)) {
    const unit = `${layer}/${first}`;
    return {
      layer,
      unit,
      isPublic: (target) => /^index\.tsx?$/.test(target.slice(unit.length + 1)),
    };
  }
  if (layer === 'app') return { layer, unit: `app/${first}`, isPublic: () => true };
  // shared: the kit's components are each public; any other group through its index.ts.
  if (first === 'ui' && second === 'kit')
    return {
      layer,
      unit: 'shared/ui/kit',
      isPublic: (target) => !target.slice(14).includes('/'),
    };
  const unit = `shared/${first}/${second}`;
  return { layer, unit, isPublic: (target) => target === `${unit}/index.ts` };
}

// Whether `file` may import the npm package `spec`: the background and the page scripts only WXT's
// own helpers; the entities, the body editor's engine and shared/lib none at all, except the two
// libraries that are about React and the kit's class names.
function mayImportPackage(file, spec, { notUi, rawEditor }) {
  if (notUi) return spec.startsWith('wxt/');
  if (file.startsWith('entities/') || rawEditor) return false;
  if (file.startsWith('shared/lib/')) return UI_LIBS.some((dir) => file.startsWith(dir));
  return true;
}

// Every module specifier, with its line: import/export ... from '...', import '...', import('...').
const SPECIFIER =
  /(?:^|[\n;])\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?'([^']+)'|import\(\s*'([^']+)'\s*\)/g;
function specifiers(source) {
  return [...source.matchAll(SPECIFIER)].map((match) => ({
    spec: match[1] ?? match[2],
    line: source.slice(0, match.index + match[0].length).split('\n').length,
  }));
}

let imports = 0;
for (const file of files) {
  const source = fs.readFileSync(path.join(SRC, file), 'utf8');
  const from = locate(file);
  if (!from) {
    report(file, 1, `is outside the layers (${Object.keys(RANK).join(', ')})`);
    continue;
  }
  if (/^export \* from/m.test(source))
    report(
      file,
      1,
      're-exports everything with `export *`: name what the public API offers',
    );
  const notUi = NOT_UI.some((dir) => file.startsWith(dir));
  const rawEditor = RAW_EDITOR.some((dir) => file.startsWith(dir));
  for (const { spec, line } of specifiers(source)) {
    imports += 1;
    if (!spec.startsWith('.')) {
      if (!mayImportPackage(file, spec, { notUi, rawEditor }))
        report(file, line, `imports the npm package "${spec}"`);
      continue;
    }
    const absolute = path.resolve(path.dirname(path.join(SRC, file)), spec);
    const target = path.relative(SRC, absolute).split(path.sep).join('/');
    if (target.startsWith('..')) {
      report(file, line, `imports "${spec}", outside src/`);
      continue;
    }
    if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isFile()) {
      report(file, line, `imports "${spec}", which isn't a file`);
      continue;
    }
    if (rawEditor && !target.endsWith('.ts'))
      report(
        file,
        line,
        `imports "${spec}": the body editor's engine imports only .ts files`,
      );
    if (file.startsWith('entities/') && target.endsWith('.tsx'))
      report(file, line, `imports "${spec}": the entities have no UI (.tsx)`);
    const to = locate(target);
    if (!to) continue; // a stylesheet or the like in src/, outside the layers: reported above if code
    if (
      notUi &&
      !(
        NOT_UI.some((dir) => target.startsWith(dir)) ||
        target.startsWith('entities/') ||
        (target.startsWith('shared/lib/') &&
          !UI_LIBS.some((dir) => target.startsWith(dir)))
      )
    )
      report(
        file,
        line,
        `imports "${spec}": the background and the page scripts use no UI code`,
      );
    if (RANK[to.layer] > RANK[from.layer]) {
      report(
        file,
        line,
        `imports "${spec}" from ${to.layer}, a layer above ${from.layer}`,
      );
      continue;
    }
    if (to.unit === from.unit) continue;
    if (to.layer === from.layer && SLICED.has(from.layer)) {
      const slice = from.unit.split('/')[1];
      const crossImport =
        from.layer === 'entities' && target === `${to.unit}/@x/${slice}.ts`;
      if (!crossImport)
        report(
          file,
          line,
          `imports "${spec}" from ${to.unit}, another slice of ${from.layer}${from.layer === 'entities' ? ` (only through ${to.unit}/@x/${slice}.ts)` : ''}`,
        );
      continue;
    }
    if (to.layer === 'app' || (to.layer === from.layer && from.layer === 'app')) continue;
    if (!to.isPublic(target))
      report(file, line, `imports "${spec}", inside ${to.unit}: use its public API`);
  }
}

// The folders of src/app/: WXT makes an entrypoint of every app/<name>/index.* and app/<name>.*
for (const entry of fs.readdirSync(path.join(SRC, 'app'), { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    report(
      `app/${entry.name}`,
      1,
      'is a file directly in src/app/, which WXT would build as a script or page',
    );
    continue;
  }
  const index = fs
    .readdirSync(path.join(SRC, 'app', entry.name))
    .find((name) => name.startsWith('index.'));
  if (index && !ENTRYPOINTS.has(entry.name))
    report(
      `app/${entry.name}/${index}`,
      1,
      "is an index file, which WXT would build into the extension: this folder isn't one of its parts",
    );
  if (!index && ENTRYPOINTS.has(entry.name))
    report(
      `app/${entry.name}`,
      1,
      'has no index file, so WXT would leave this part out of the extension',
    );
}

if (problems.length) {
  console.error(
    `${problems.length} layer ${problems.length === 1 ? 'problem' : 'problems'}:\n  ${problems.join('\n  ')}`,
  );
  process.exit(1);
}
console.log(`Layers: ${files.length} files, ${imports} imports, all where they belong.`);
