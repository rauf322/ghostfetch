// Two lint rules of Ghostfetch's own, which oxlint loads as a JS plugin (oxlint.config.ts) beside
// eslint-plugin-boundaries, which checks which folders of src/ may import which:
//
// - no-export-all: no index re-exports everything with `export *`: it names what it offers.
// - app-part: every folder of src/app/ with an index file is one of the extension's parts, as WXT
//   builds every app/<name>/index.* and app/<name>.* into the extension (wxt.config.ts), and a
//   part has one index file, as WXT builds one a part: beside an index.html it leaves an index.ts
//   out, and two scripts' index files stop the build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const APP = path.join(ROOT, 'src', 'app');
// The extension's parts, as WXT builds them from src/app/.
const PARTS = new Set([
  'background',
  'interceptor',
  'bridge',
  'popup',
  'sidepanel',
  'kit',
]);

const noExportAll = {
  meta: { type: 'problem' },
  create(context) {
    return {
      ExportAllDeclaration(node) {
        context.report({
          node,
          message:
            'Re-exports everything with `export *`: name what the public API offers.',
        });
      },
    };
  },
};

const appPart = {
  meta: { type: 'problem' },
  create(context) {
    return {
      Program(node) {
        const file = path.relative(APP, context.filename);
        if (file.startsWith('..')) return;
        const [part, ...rest] = file.split(path.sep);
        if (rest.length === 0) {
          context.report({
            node,
            message:
              'A file directly in src/app/, which WXT would build as a script or page: put it in a folder.',
          });
          return;
        }
        const isIndex = rest.length === 1 && rest[0].startsWith('index.');
        if (isIndex && !PARTS.has(part))
          context.report({
            node,
            message: `An index file, which WXT would build into the extension: src/app/${part}/ isn't one of its parts (${[...PARTS].join(', ')}).`,
          });
        const indexes = fs
          .readdirSync(path.join(APP, part))
          .filter((name) => name.startsWith('index.'));
        if (PARTS.has(part) && indexes.length === 0)
          context.report({
            node,
            message: `src/app/${part}/ has no index file, so WXT would leave this part out of the extension.`,
          });
        if (PARTS.has(part) && indexes.length > 1)
          context.report({
            node,
            message: `src/app/${part}/ has ${indexes.length} index files (${indexes.join(', ')}), and WXT builds one a part: beside an index.html it leaves an index.ts out, and two scripts' stop the build. Keep one.`,
          });
      },
    };
  },
};

export default {
  meta: { name: 'ghostfetch' },
  rules: { 'no-export-all': noExportAll, 'app-part': appPart },
};
