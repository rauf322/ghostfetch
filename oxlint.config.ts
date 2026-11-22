// The linter (oxlint, `npm run lint`). The imports between the layers of src/
// (docs/development.md, "Files") are checked by eslint-plugin-boundaries, which oxlint loads
// as a JS plugin, and the two checks that are about WXT and the public APIs' shape by the
// rules in scripts/oxlint-rules.mjs.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'oxlint';

const rootPath = fileURLToPath(new URL('.', import.meta.url));

// The layers, from the top: app, pages, shared (Feature-Sliced Design's "pages first"), and
// under them what has left the layers for the layout by bounded context (docs/adr/0002): the
// folders that know no domain (lib, platform, ui and body-editor), the kernel (kernel: what Rules
// and Interception must agree on), and the contexts with a folder of their own, Interception
// (interception), Rules (rules, whose domain/ is a type of its own, rules-domain: it imports only
// lib and the kernel; and so is its ui/, rules-ui: its React is all there), Sites (sites) and
// Traffic (traffic, whose ui/ is a type of its own, traffic-ui, for the same reason). A page is
// used through its index.ts. shared has segments instead of slices, and one is left: api. api is
// used through its index.ts, as lib, platform, the kernel, interception, sites and the body
// editor (body-editor/) are; Traffic through its two, traffic/index.ts and traffic/ui/index.ts;
// and Rules through rules/index.ts and rules/ui/index.ts, and the widgets other screens show, a
// public file each in rules/ui/. ui has a public file per component or hook, so a screen bundles
// only what it shows. The editor's engine/ and vim/ are plain TypeScript the Zen test serves
// straight from src/: they import only .ts files by relative path, and no npm package. The first
// descriptor a file matches is its type.
const elements = [
  {
    type: 'editor-engine',
    pattern: ['src/body-editor/engine', 'src/body-editor/vim'],
    partialMatch: false,
  },
  { type: 'body-editor', pattern: 'src/body-editor', partialMatch: false },
  { type: 'lib', pattern: 'src/lib', partialMatch: false },
  { type: 'platform', pattern: 'src/platform', partialMatch: false },
  { type: 'ui', pattern: 'src/ui', partialMatch: false },
  { type: 'kernel', pattern: 'src/kernel', partialMatch: false },
  { type: 'interception', pattern: 'src/interception', partialMatch: false },
  { type: 'sites', pattern: 'src/sites', partialMatch: false },
  { type: 'traffic-ui', pattern: 'src/traffic/ui', partialMatch: false },
  { type: 'traffic', pattern: 'src/traffic', partialMatch: false },
  { type: 'rules-ui', pattern: 'src/rules/ui', partialMatch: false },
  { type: 'rules-domain', pattern: 'src/rules/domain', partialMatch: false },
  { type: 'rules', pattern: 'src/rules', partialMatch: false },
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
// The folders that know no domain.
const noDomain = ['lib', 'platform', 'ui', 'body-editor'];
// What runs outside the extension's pages: no React, no UI, no npm package but WXT's helpers.
const notUi = {
  element: { type: 'app', captured: { part: ['background', 'interceptor', 'bridge'] } },
};
// The part WXT builds of Interception: interceptor.js.
const interceptor = { element: { type: 'app', captured: { part: ['interceptor'] } } };
// The widgets of the rules' ui/ that other screens show, a public file each: a rule's and a
// group's switch and the folds (the popup's too), the group picker (Traffic's Mock this response
// too), the group a new rule starts in, and rules files.
const rulesWidgets = [
  'rule-switch.tsx',
  'group-switch.tsx',
  'group-folds.ts',
  'group-picker.tsx',
  'new-rule-group.ts',
  'rules-file.tsx',
];

// Processed in order; the last policy matching an import decides.
const policies = [
  // The layers: app imports anything; a page its own folder, shared, the kernel, the rules and
  // traffic by either of their doors (and the rules' widgets), sites and the folders that know no
  // domain, never another page; shared only shared, the kernel and those folders.
  { from: type('app'), allow: { to: [type('*'), packages] } },
  {
    from: type('pages'),
    allow: {
      to: [
        samePage,
        type(
          'shared',
          'kernel',
          'rules',
          'rules-ui',
          'sites',
          'traffic',
          'traffic-ui',
          ...noDomain,
        ),
        packages,
      ],
    },
  },
  {
    from: type('shared'),
    allow: { to: [type('shared', 'kernel', ...noDomain), packages] },
  },
  // The folders that know no domain import nothing of the layers: ui only lib and platform, and
  // the body editor only lib and ui, each with npm packages.
  { from: type('ui'), allow: { to: [type('lib', 'platform'), packages] } },
  { from: type('body-editor'), allow: { to: [type('lib', 'ui'), packages] } },
  // Traffic's ui/, where its React is: the rules and their widgets, sites, shared/api (the two
  // switches), the folders that know no domain and npm packages (and the rest of traffic, further
  // down).
  {
    from: type('traffic-ui'),
    allow: {
      to: [type('rules', 'rules-ui', 'sites', ...noDomain), segment('api'), packages],
    },
  },
  // The rules' ui/, where their React is: the kernel, sites, traffic by either of its doors,
  // shared/api (the two switches), the folders that know no domain and npm packages (and the rest
  // of the rules, further down).
  {
    from: type('rules-ui'),
    allow: {
      to: [
        type('rules', 'kernel', 'sites', 'traffic', 'traffic-ui', ...noDomain),
        segment('api'),
        packages,
      ],
    },
  },
  // lib imports nothing else; platform and the kernel only lib; sites only lib and platform;
  // traffic outside its ui/ only those two and sites; shared/api only lib; the rules outside their
  // domain/ and ui/ only lib, platform, the kernel and traffic (a rule is made from an entry), and
  // their domain/ only lib and the kernel; and interception only the kernel, lib, traffic and the
  // rules' types: no React, no UI and no npm package, so what the background and the page scripts
  // reach through any of them is free of all three.
  {
    from: [
      type(
        'lib',
        'platform',
        'kernel',
        'interception',
        'sites',
        'traffic',
        'rules',
        'rules-domain',
      ),
      segment('api'),
    ],
    disallow: { to: [type('*'), packages] },
    message:
      'lib, platform, the kernel, interception, sites, shared/api, and the rules and traffic outside their ui/ are plain TypeScript: no npm package, and no folder of src/ but the ones each may import (oxlint.config.ts).',
  },
  {
    from: [
      type(
        'platform',
        'kernel',
        'interception',
        'sites',
        'traffic',
        'rules',
        'rules-domain',
      ),
      segment('api'),
    ],
    allow: { to: type('lib') },
  },
  { from: type('sites', 'traffic', 'rules'), allow: { to: type('platform') } },
  { from: type('traffic'), allow: { to: type('sites') } },
  { from: type('rules', 'rules-domain'), allow: { to: type('kernel') } },
  { from: type('rules'), allow: { to: type('traffic') } },
  { from: type('interception'), allow: { to: type('kernel', 'traffic') } },
  {
    from: type('interception'),
    allow: { to: type('rules'), dependency: { kind: 'type' } },
  },
  // The background and the page scripts: the rules and traffic but for their ui/, the kernel,
  // sites, lib and WXT's helpers; and the interceptor Interception, which nothing else imports.
  { from: notUi, disallow: { to: [type('*'), packages] } },
  {
    from: notUi,
    allow: {
      to: [
        type('rules', 'kernel', 'lib', 'sites', 'traffic'),
        { module: { origin: 'external', source: 'wxt' } },
      ],
    },
  },
  {
    to: type('interception'),
    disallow: { from: type('*') },
    message:
      'Interception is imported by the interceptor alone (src/app/interceptor/index.ts).',
  },
  { from: interceptor, allow: { to: type('interception') } },
  // The public APIs. (A pattern like `!(index.ts|index.tsx)` would miss the files in a page's
  // folders, as an extglob doesn't match across a slash; `!index.{ts,tsx}` negates the whole.)
  {
    to: { element: { type: 'pages', fileInternalPath: '!index.{ts,tsx}' } },
    disallow: { from: type('*') },
    message: 'A page is used through its index.ts.',
  },
  {
    to: [
      {
        element: {
          type: 'shared',
          captured: { segment: ['api'] },
          fileInternalPath: '!index.ts',
        },
      },
      {
        element: {
          type: [
            'lib',
            'platform',
            'kernel',
            'interception',
            'rules',
            'sites',
            'traffic',
            'traffic-ui',
          ],
          fileInternalPath: '!index.ts',
        },
      },
      type('rules-domain'),
    ],
    disallow: { from: type('*') },
    message:
      'shared/api, lib, platform, the kernel, interception, the rules, sites, traffic and traffic/ui are used through their index.ts.',
  },
  // The rules' screens: the Rules view through rules/ui/index.ts, and each widget other screens
  // show through its own file, so the popup doesn't load the Rules view with its switches.
  {
    to: {
      element: {
        type: 'rules-ui',
        fileInternalPath: `!{index.ts,${rulesWidgets.join(',')}}`,
      },
    },
    disallow: { from: type('*') },
    message: `The rules' screens are used through rules/ui/index.ts, and the widgets other screens show through their own files: ${rulesWidgets.join(', ')}.`,
  },
  // The rules' own files outside their domain/, their door among them, reach into it; and their
  // ui/ reaches past rules/index.ts too, for what only the screens use (New rule's draft, the
  // search, a copy of a rule, the requests New rule offers, the clipboard, rules files), which
  // that door doesn't offer.
  { from: type('rules'), allow: { to: type('rules-domain') } },
  { from: type('rules-ui'), allow: { to: type('rules', 'rules-domain') } },
  // Traffic's own ui/ may reach past traffic/index.ts, for what is the Traffic view's alone (its
  // filters and time groups), which that door doesn't offer.
  { from: type('traffic-ui'), allow: { to: type('traffic') } },
  {
    to: { element: { type: 'body-editor', fileInternalPath: '!index.ts' } },
    disallow: { from: type('*') },
    message: 'The body editor is used through body-editor/index.ts.',
  },
  // The body editor's engine: only the editor reaches it, and it imports its own .ts files and
  // lib.
  { to: type('editor-engine'), disallow: { from: type('*') } },
  { from: type('body-editor', 'editor-engine'), allow: { to: type('editor-engine') } },
  { from: type('editor-engine'), allow: { to: type('lib') } },
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
    // that a <label> around one labels it.
    'jsx-a11y': {
      components: {
        Input: 'input',
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
