// The linter (oxlint, `npm run lint`). Which folders of src/ may import which (docs/development.md,
// "Files") is the table below, which eslint-plugin-boundaries checks, loaded by oxlint as a JS
// plugin; the two checks about WXT's parts and what a door offers are the rules in
// scripts/oxlint-rules.mjs.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'oxlint';

const rootPath = fileURLToPath(new URL('.', import.meta.url));

// The kinds of file, a folder each (the body editor's engine two), the first a file is in being
// its kind: what knows no domain (lib, platform, ui, the body editor and its engine), the shared
// kernel (what Rules and Interception must agree on) and the contexts (GLOSSARY-MAP.md). Sites and
// Interception are flat; Traffic, Rules and Agent access have a kind for their domain/, one for
// their ui/, and one for the rest of them (application/, infrastructure/, contract.ts and the
// door, index.ts). The folders of src/app/ come after the table.
const KINDS: Record<string, string[]> = {
  'editor-engine': [
    'src/bounded-contexts/body-editor/engine',
    'src/bounded-contexts/body-editor/vim',
  ],
  'body-editor': ['src/bounded-contexts/body-editor'],
  lib: ['src/lib'],
  platform: ['src/platform'],
  ui: ['src/ui'],
  'shared-kernel': ['src/shared-kernel'],
  sites: ['src/bounded-contexts/sites'],
  interception: ['src/bounded-contexts/interception'],
  'traffic-domain': ['src/bounded-contexts/traffic/domain'],
  'traffic-ui': ['src/bounded-contexts/traffic/ui'],
  traffic: ['src/bounded-contexts/traffic'],
  'rules-domain': ['src/bounded-contexts/rules/domain'],
  'rules-ui': ['src/bounded-contexts/rules/ui'],
  rules: ['src/bounded-contexts/rules'],
  'agent-access-domain': ['src/bounded-contexts/agent-access/domain'],
  'agent-access-ui': ['src/bounded-contexts/agent-access/ui'],
  'agent-access': ['src/bounded-contexts/agent-access'],
};
// The kinds that are one context with another kind: inside a context, a file reaches any file.
const CONTEXT: Record<string, string> = {
  'editor-engine': 'body-editor',
  'traffic-domain': 'traffic',
  'traffic-ui': 'traffic',
  'rules-domain': 'rules',
  'rules-ui': 'rules',
  'agent-access-domain': 'agent-access',
  'agent-access-ui': 'agent-access',
};

// The widgets of Rules' ui/ that other screens show, a public file each: a rule's and a group's
// switch and the folds (the popup's too), the group picker (Traffic's Mock this response too), the
// group a new rule starts in, and rules files.
const RULES_WIDGETS = [
  'rule-switch.tsx',
  'group-switch.tsx',
  'group-folds.ts',
  'group-picker.tsx',
  'new-rule-group.ts',
  'rules-file.tsx',
];
// The doors: a kind's files that the rest of src/ may import, its own context any of them. ui has a
// public file per component or hook, so a screen bundles only what it shows; Rules' ui/ has the
// Rules view's door and the widgets' files, so the popup doesn't load the Rules view with its
// switches. A kind with no door (a context's domain/, the rest of Agent access, the body editor's
// engine) is reached only from inside its context.
const DOORS: Record<string, string[] | 'every file'> = {
  lib: ['index.ts'],
  platform: ['index.ts'],
  ui: 'every file',
  'body-editor': ['index.ts'],
  'shared-kernel': ['index.ts'],
  sites: ['index.ts'],
  interception: ['index.ts'],
  traffic: ['index.ts'],
  'traffic-ui': ['index.ts'],
  rules: ['index.ts'],
  'rules-ui': ['index.ts', ...RULES_WIDGETS],
  'agent-access-ui': ['index.ts'],
};

// What a row may import that isn't a kind, named for the linter's messages.
const LABEL = new Map<object, string>();
const named = <T extends object>(label: string, selector: T) => {
  LABEL.set(selector, label);
  return selector;
};
// npm packages (and Node's own modules): any; any but React's (React, React DOM, Base UI); and
// wxt's helpers alone.
const NPM = named('npm packages', { module: { origin: ['external', 'core'] } });
const NOT_REACT = named("npm packages but React's", {
  module: { origin: ['external', 'core'], source: '!{react,react-dom,@base-ui/react}' },
});
const WXT = named("wxt's helpers", { module: { origin: 'external', source: 'wxt' } });
// A kind's types alone; and any .ts file of a kind, past its doors.
const types = (kind: string) => `types of ${kind}`;
const anyTsFile = (kind: string) =>
  named(`${folder(kind)}'s .ts files`, {
    element: { type: kind },
    file: { path: '**/*.ts' },
  });

// Who may import whom: each kind, and all it may import besides its own files. A kind of another
// context is imported through its doors, one of its own context by any file. The rows keep four
// rules: a context is entered only through its doors; a domain/ imports only its own, the shared
// kernel and lib; React and ui are only for a ui/ layer (ui itself, and a context's ui/), the body
// editor's two components and the pages of src/app/; and the contexts import each other only
// along GLOSSARY-MAP.md's arrows. The parts of src/app/, after it, keep a fifth: a part imports
// no other part's files.
const MAY_IMPORT: Record<string, (string | object)[]> = {
  // What knows no domain imports no context. lib imports nothing; platform, what differs between
  // the browsers, lib; ui, the kit, the themes and the editor's layout, lib, platform and npm
  // packages; the body editor, whose door offers React components (the editor, CodeView and the
  // Diff), its engine, lib, ui and npm packages; and its engine (engine/, vim/), plain TypeScript
  // the Zen test serves straight from src/, only .ts files: its own and lib's, any of them.
  lib: [],
  platform: ['lib'],
  ui: ['lib', 'platform', NPM],
  'body-editor': ['editor-engine', 'lib', 'ui', NPM],
  'editor-engine': [anyTsFile('editor-engine'), anyTsFile('lib')],
  // The shared kernel imports lib alone.
  'shared-kernel': ['lib'],
  // Sites and the Body editor import no context, and Interception, in the page, only the shared
  // kernel and Rules' and Traffic's types. Traffic imports Sites, and only its ui/ imports Rules,
  // which imports Traffic (a rule is made from an entry); the ui/ of both shows bodies with the
  // Body editor; Agent access imports Rules, Traffic and Sites. A context's domain/ imports lib
  // (Rules' the shared kernel too); outside its ui/, a context is plain TypeScript, with no npm
  // package and no React, so what the background and the page scripts bundle of it is free of the
  // screens' libraries.
  sites: ['lib', 'platform'],
  interception: ['shared-kernel', 'lib', types('rules'), types('traffic')],
  'traffic-domain': ['lib'],
  traffic: ['traffic-domain', 'sites', 'lib', 'platform'],
  'traffic-ui': [
    'traffic',
    'traffic-domain',
    'rules',
    'rules-ui',
    'sites',
    'body-editor',
    'lib',
    'platform',
    'ui',
    NPM,
  ],
  'rules-domain': ['shared-kernel', 'lib'],
  rules: ['rules-domain', 'traffic', 'shared-kernel', 'lib', 'platform'],
  'rules-ui': [
    'rules',
    'rules-domain',
    'traffic',
    'traffic-ui',
    'body-editor',
    'shared-kernel',
    'lib',
    'platform',
    'ui',
    NPM,
  ],
  'agent-access-domain': ['lib'],
  'agent-access': [
    'agent-access-domain',
    'rules',
    'traffic',
    'sites',
    'shared-kernel',
    'lib',
  ],
  'agent-access-ui': [
    'agent-access',
    'agent-access-domain',
    'rules',
    'traffic',
    'sites',
    'shared-kernel',
    'lib',
    'ui',
    NPM,
  ],
};

// The parts of src/app/, a folder each, which WXT builds (wxt.config.ts; scripts/oxlint-rules.mjs
// names them too). A part puts the rest together, and imports no other part's files. The
// background and the two page scripts run outside the extension's pages: no React, no ui and no
// npm package but wxt's helpers. Interception is the interceptor's alone, and Agent access the
// editor's (sidepanel). The pages take every other context by its doors, what knows no domain, npm
// packages, and the stylesheets in styles/.
const PARTS = ['background', 'bridge', 'interceptor', 'popup', 'sidepanel', 'kit'];
const part = (...names: string[]) => ({
  element: { type: 'app', captured: { part: names } },
});
// A folder of src/app/ that isn't a part, as styles/ (the pages' stylesheets).
const NOT_A_PART = named('app/ but its parts (styles/)', {
  element: { type: 'app', captured: { part: `!{${PARTS.join(',')}}` } },
});
const SCRIPT = ['rules', 'traffic', 'sites', 'shared-kernel', 'lib', WXT];
const PAGE = [
  'rules',
  'rules-ui',
  'traffic',
  'traffic-ui',
  'sites',
  'body-editor',
  'shared-kernel',
  'lib',
  'platform',
  'ui',
  NOT_A_PART,
  NPM,
];
const PART_MAY_IMPORT: Record<string, (string | object)[]> = {
  background: SCRIPT,
  bridge: SCRIPT,
  interceptor: ['interception', ...SCRIPT],
  popup: PAGE,
  sidepanel: ['agent-access-ui', ...PAGE],
  kit: PAGE,
};
// A folder of src/app/ that isn't a part has no code (styles/ has the stylesheets), and the parts'
// rule doesn't bind it: it may import what a page may and any folder of src/app/, but React and
// ui, which are for the pages.
const NOT_A_PART_MAY_IMPORT = [
  'rules',
  'rules-ui',
  'traffic',
  'traffic-ui',
  'sites',
  'body-editor',
  'shared-kernel',
  'lib',
  'platform',
  named('app/', { element: { type: 'app' } }),
  NOT_REACT,
];

// The table as eslint-plugin-boundaries reads it. Each row is two policies, and as the last policy
// that matches an import decides, a row's own decides for its files: one refusing everything, with
// the row's message, then one allowing what the row gives.
function folder(kind: string) {
  const paths = KINDS[kind].map((path) => path.replace(/^src\//, ''));
  if (paths.length === 1) return `${paths[0]}/`;
  // Two folders in one (the engine's): bounded-contexts/body-editor/{engine,vim}/.
  const parent = paths[0].slice(0, paths[0].lastIndexOf('/') + 1);
  return `${parent}{${paths.map((path) => path.slice(parent.length)).join(',')}}/`;
}
const contextOf = (kind: string) => CONTEXT[kind] ?? kind;
// What `item` names, for an import from a file of `from` (null: a folder of src/app/): the
// plugin's selector, and the words for it.
function target(from: string | null, item: string | object) {
  if (typeof item !== 'string')
    return { selector: { to: item }, label: LABEL.get(item)! };
  const typesOnly = item.startsWith('types of ');
  const kind = typesOnly ? item.slice('types of '.length) : item;
  if (!KINDS[kind]) throw new Error(`oxlint.config.ts: no kind ${kind}`);
  const doors =
    from !== null && contextOf(from) === contextOf(kind) ? 'every file' : DOORS[kind];
  if (!doors)
    throw new Error(`oxlint.config.ts: ${kind} has no door for ${from ?? 'app'}`);
  const element =
    doors === 'every file' ? { type: kind } : { type: kind, fileInternalPath: doors };
  let label = folder(kind);
  if (doors !== 'every file')
    label += doors.length === 1 ? doors[0] : `{${doors.join(',')}}`;
  return typesOnly
    ? {
        selector: { to: { element }, dependency: { kind: 'type' } },
        label: `the types of ${label}`,
      }
    : { selector: { to: { element } }, label };
}
function row(from: object, who: string, kind: string | null, items: (string | object)[]) {
  const targets = items.map((item) => target(kind, item));
  const labels = targets.map((each) => each.label);
  const listed =
    labels.length > 1
      ? `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
      : labels[0];
  const refuse = {
    from,
    disallow: { to: [{ element: { type: '*' } }, NPM] },
    message: listed
      ? `${who} may import only ${listed} (oxlint.config.ts).`
      : `${who} imports nothing: no other folder of src/ and no npm package (oxlint.config.ts).`,
  };
  if (!targets.length) return [refuse];
  return [refuse, { from, allow: targets.map((each) => each.selector) }];
}

const elements = [
  ...Object.entries(KINDS).map(([type, pattern]) => ({
    type,
    pattern,
    partialMatch: false,
  })),
  { type: 'app', pattern: 'src/app/*', capture: ['part'], partialMatch: false },
];
const policies = [
  ...Object.entries(MAY_IMPORT).flatMap(([kind, items]) =>
    row({ element: { type: kind } }, folder(kind), kind, items),
  ),
  ...row(NOT_A_PART, "A folder of app/ that isn't a part", null, NOT_A_PART_MAY_IMPORT),
  ...Object.entries(PART_MAY_IMPORT).flatMap(([name, items]) =>
    row(part(name), `app/${name}/`, null, items),
  ),
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
    // A file of src/ in no kind of the table; an import of a file that isn't there.
    'boundaries/no-unknown-files': 'error',
    'boundaries/no-unknown-dependencies': 'error',
    'ghostfetch/no-export-all': 'error',
    'ghostfetch/app-part': 'error',
  },
  ignorePatterns: ['.output/**', '.wxt/**', 'web-ext-artifacts/**'],
});
