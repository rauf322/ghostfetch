// The linter (oxlint, `npm run lint`), set up like bst-admin's. The imports between the layers
// of src/ (README, "Files") are checked by eslint-plugin-boundaries, which oxlint loads as a JS
// plugin, and the two checks that are about WXT and the public APIs' shape by the rules in
// scripts/oxlint-rules.mjs.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'oxlint';

const rootPath = fileURLToPath(new URL('.', import.meta.url));

// The layers, from the top: app, pages, features, entities, shared. A slice (a folder in pages,
// features or entities) is used through its index.ts; a group of shared/ui or shared/lib through
// its index.ts, except the kit, which has a public file per component. The body editor's engine/
// and vim/ are plain TypeScript the Zen test serves straight from src/: they import only .ts files
// by relative path and no npm package.
const elements = [
  { type: 'kit', pattern: 'src/shared/ui/kit', partialMatch: false },
  {
    type: 'editor-engine',
    pattern: ['src/shared/ui/code-editor/engine', 'src/shared/ui/code-editor/vim'],
    partialMatch: false,
  },
  {
    type: 'shared',
    pattern: 'src/shared/*/*',
    capture: ['segment', 'group'],
    partialMatch: false,
  },
  {
    type: 'entities',
    pattern: 'src/entities/*',
    capture: ['slice'],
    partialMatch: false,
  },
  {
    type: 'features',
    pattern: 'src/features/*',
    capture: ['slice'],
    partialMatch: false,
  },
  { type: 'pages', pattern: 'src/pages/*', capture: ['slice'], partialMatch: false },
  { type: 'app', pattern: 'src/app/*', capture: ['part'], partialMatch: false },
];

const type = (...types: string[]) => ({ element: { type: types } });
const sameSlice = (layer: string) => ({
  element: { type: layer, captured: { slice: '{{ from.element.captured.slice }}' } },
});
const packages = { module: { origin: ['external', 'core'] } };
// What runs outside the extension's pages: no React, no kit, no npm package but WXT's helpers.
const notUi = {
  element: {
    type: 'app',
    captured: { part: ['background', 'interceptor', 'bridge', 'messaging'] },
  },
};
const uiLibs = {
  element: {
    type: 'shared',
    captured: { segment: 'lib', group: ['react', 'class-names'] },
  },
};
const codeEditor = {
  element: { type: 'shared', captured: { segment: 'ui', group: 'code-editor' } },
};

// Processed in order; the last policy matching an import decides.
const policies = [
  // The layers: each imports from its own layer's folder or the layers below, and a slice from
  // another slice of its own layer never.
  { from: type('app'), allow: { to: [type('*'), packages] } },
  {
    from: type('pages'),
    allow: {
      to: [sameSlice('pages'), type('features', 'entities', 'shared', 'kit'), packages],
    },
  },
  {
    from: type('features'),
    allow: { to: [sameSlice('features'), type('entities', 'shared', 'kit'), packages] },
  },
  { from: type('entities'), allow: { to: [sameSlice('entities'), type('shared')] } },
  { from: type('shared'), allow: { to: type('shared', 'kit') } },
  { from: type('kit'), allow: { to: [type('kit', 'shared'), packages] } },
  { from: type('editor-engine'), allow: { to: type('editor-engine', 'shared') } },
  // npm packages in shared: shared/ui, and the two libraries about React and the kit's classes.
  {
    from: { element: { type: 'shared', captured: { segment: 'ui' } } },
    allow: { to: packages },
  },
  { from: uiLibs, allow: { to: packages } },
  // The background and the page scripts: the entities, the non-UI parts of shared/lib, and WXT.
  { from: notUi, disallow: { to: [type('*'), packages] } },
  {
    from: notUi,
    allow: {
      to: [
        notUi,
        type('entities'),
        {
          element: {
            type: 'shared',
            captured: { segment: 'lib', group: '!(react|class-names)' },
          },
        },
        { module: { origin: 'external', source: 'wxt' } },
      ],
    },
  },
  // The public APIs. (A pattern like `!(index.ts|index.tsx)` would miss the files in a slice's
  // folders, as an extglob doesn't match across a slash; `!index.{ts,tsx}` negates the whole.)
  {
    to: {
      element: {
        type: ['pages', 'features', 'entities'],
        fileInternalPath: '!index.{ts,tsx}',
      },
    },
    disallow: { from: type('*') },
    message: 'A slice is used through its index.ts.',
  },
  {
    from: type('entities'),
    allow: {
      to: {
        element: {
          type: 'entities',
          fileInternalPath: '@x/{{ from.element.captured.slice }}.ts',
        },
      },
    },
  },
  {
    to: { element: { type: 'shared', fileInternalPath: '!index.ts' } },
    disallow: { from: type('*') },
    message: 'A folder of shared/ui or shared/lib is used through its index.ts.',
  },
  { to: type('editor-engine'), disallow: { from: type('*') } },
  {
    from: [codeEditor, type('editor-engine')],
    allow: { to: type('editor-engine') },
  },
  // No UI in the entities; only .ts files in the body editor's engine.
  {
    from: type('entities'),
    disallow: { to: { file: { path: '**/*.tsx' } } },
    message: 'The entities have no UI (.tsx).',
  },
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
    // Off in bst-admin, whose Yup schemas need objects with a `then` key.
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
