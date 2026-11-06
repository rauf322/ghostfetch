// The linter (oxlint, `npm run lint`). The imports between the layers of src/
// (docs/development.md, "Files") are checked by eslint-plugin-boundaries, which oxlint loads
// as a JS plugin, and the two checks that are about WXT and the public APIs' shape by the
// rules in scripts/oxlint-rules.mjs.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'oxlint';

const rootPath = fileURLToPath(new URL('.', import.meta.url));

// The layers, from the top: app, pages, shared (Feature-Sliced Design's "pages first").
// A page is used through its index.ts. shared has segments instead of slices: api, lib,
// react and ui. api, lib and react are each used through their index.ts; shared/ui has a
// public file per component, so a screen bundles only what it shows, and the body editor
// (code-editor/) is used through its index.ts. The editor's engine/ and vim/ are plain
// TypeScript the Zen test serves straight from src/: they import only .ts files by
// relative path, and no npm package. The first descriptor a file matches is its type.
const elements = [
  {
    type: 'editor-engine',
    pattern: ['src/shared/ui/code-editor/engine', 'src/shared/ui/code-editor/vim'],
    partialMatch: false,
  },
  { type: 'code-editor', pattern: 'src/shared/ui/code-editor', partialMatch: false },
  { type: 'shared', pattern: 'src/shared/*', capture: ['segment'], partialMatch: false },
  { type: 'pages', pattern: 'src/pages/*', capture: ['slice'], partialMatch: false },
  { type: 'app', pattern: 'src/app/*', capture: ['part'], partialMatch: false },
];

const type = (...types: string[]) => ({ element: { type: types } });
const segment = (...segments: string[]) => ({
  element: { type: 'shared', captured: { segment: segments } },
});
const samePage = {
  element: { type: 'pages', captured: { slice: '{{ from.element.captured.slice }}' } },
};
const packages = { module: { origin: ['external', 'core'] } };
// What runs outside the extension's pages: no React, no UI, no npm package but WXT's helpers.
const notUi = {
  element: { type: 'app', captured: { part: ['background', 'interceptor', 'bridge'] } },
};

// Processed in order; the last policy matching an import decides.
const policies = [
  // The layers: app imports anything; a page its own folder and shared, never another page;
  // shared only shared.
  { from: type('app'), allow: { to: [type('*'), packages] } },
  {
    from: type('pages'),
    allow: { to: [samePage, type('shared', 'code-editor'), packages] },
  },
  {
    from: type('shared', 'code-editor'),
    allow: { to: [type('shared', 'code-editor'), packages] },
  },
  // shared/lib imports nothing else, and shared/api only shared/lib: no React, no UI and no npm
  // package, so what the background and the page scripts reach through them is free of all three.
  {
    from: segment('api', 'lib'),
    disallow: { to: [type('*'), packages] },
    message:
      'shared/api and shared/lib are plain TypeScript: shared/api imports shared/lib only.',
  },
  { from: segment('api'), allow: { to: segment('lib') } },
  // The background and the page scripts: shared/api, shared/lib and WXT's helpers.
  { from: notUi, disallow: { to: [type('*'), packages] } },
  {
    from: notUi,
    allow: {
      to: [segment('api', 'lib'), { module: { origin: 'external', source: 'wxt' } }],
    },
  },
  // The public APIs. (A pattern like `!(index.ts|index.tsx)` would miss the files in a page's
  // folders, as an extglob doesn't match across a slash; `!index.{ts,tsx}` negates the whole.)
  {
    to: { element: { type: 'pages', fileInternalPath: '!index.{ts,tsx}' } },
    disallow: { from: type('*') },
    message: 'A page is used through its index.ts.',
  },
  {
    to: {
      element: {
        type: 'shared',
        captured: { segment: ['api', 'lib', 'react'] },
        fileInternalPath: '!index.ts',
      },
    },
    disallow: { from: type('*') },
    message: 'shared/api, shared/lib and shared/react are used through their index.ts.',
  },
  {
    to: { element: { type: 'code-editor', fileInternalPath: '!index.ts' } },
    disallow: { from: type('*') },
    message: 'The body editor is used through shared/ui/code-editor/index.ts.',
  },
  // The body editor's engine: only the editor reaches it, and it imports its own .ts files and
  // shared/lib.
  { to: type('editor-engine'), disallow: { from: type('*') } },
  { from: type('code-editor', 'editor-engine'), allow: { to: type('editor-engine') } },
  { from: type('editor-engine'), allow: { to: segment('lib') } },
  {
    from: type('editor-engine'),
    disallow: { to: { module: { origin: 'local' }, file: { path: '!**/*.ts' } } },
    message: "The body editor's engine imports only .ts files.",
  },
];

export default defineConfig({
  plugins: ['typescript', 'unicorn', 'oxc', 'react', 'jsx-a11y', 'import'],
  jsPlugins: [
    { name: 'boundaries', specifier: 'eslint-plugin-boundaries' },
    './scripts/oxlint-rules.mjs',
  ],
  categories: {
    correctness: 'error',
    suspicious: 'warn',
  },
  env: {
    builtin: true,
    browser: true,
  },
  settings: {
    react: {
      version: '19.0.0',
    },
    // The kit's form controls, as the elements they render, so the accessibility rules can see
    // that a <label> around one labels it. A Switch is a <span role="switch"> next to a hidden
    // checkbox, which is what a label around it clicks.
    'jsx-a11y': {
      components: {
        Input: 'input',
        Switch: 'input',
      },
    },
    // Every import in src/ names its file with its extension, so Node's resolver finds them.
    'import/resolver': { node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] } },
    'boundaries/root-path': rootPath,
    'boundaries/include': ['src/**/*'],
    'boundaries/legacy-templates': false,
    'boundaries/elements': elements,
  },
  rules: {
    'import/no-unassigned-import': 'off',
    'react/react-in-jsx-scope': 'off',
    // Superseded by react/exhaustive-effect-dependencies (React Compiler-powered), which
    // does reactive-value analysis this legacy syntactic port doesn't - keeping both enabled
    // produces contradictory diagnostics on the same line.
    'react/exhaustive-deps': 'off',
    // Off: a Vim search an operator waits on ("d/foo") carries the operator's command as
    // `then` (vim/vim.ts, openSearch; engine/find-bar.ts).
    'unicorn/no-thenable': 'off',
    'unicorn/consistent-function-scoping': 'off',
    'boundaries/dependencies': [
      'error',
      { checkAllOrigins: true, checkUnknownLocals: true, default: 'disallow', policies },
    ],
    // A file of src/ outside the layers; an import of a file that isn't there.
    'boundaries/no-unknown-files': 'error',
    'boundaries/no-unknown-dependencies': 'error',
    'ghostfetch/no-export-all': 'error',
    'ghostfetch/app-part': 'error',
  },
  ignorePatterns: ['.output/**', '.wxt/**', 'web-ext-artifacts/**'],
});
