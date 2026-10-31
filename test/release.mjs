// Checks the release packages before they're uploaded: the manifests (with the CSP Ghostfetch has
// always shipped), the built files, and what each zip contains. No browser needed.
//
//   npm run test:release      builds and zips both browsers, then runs this
import fs from 'node:fs';
import path from 'node:path';
import {
  CHROME_BUILD,
  FIREFOX_BUILD,
  ROOT,
  check,
  expect,
  finish,
  requireBuild,
} from './fixtures.mjs';

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
const ICONS = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png',
};
const LOCALHOST = ['*://localhost/*', '*://*.localhost/*', '*://127.0.0.1/*'];
const LOCAL_PREFIX = {
  matches: ['*://*/*'],
  include_globs: ['http://local.*', 'https://local.*'],
  exclude_matches: ['*://*.localhost/*'],
};
const CONTENT_SCRIPTS = [
  {
    matches: LOCALHOST,
    js: ['interceptor.js'],
    run_at: 'document_start',
    all_frames: true,
    world: 'MAIN',
  },
  { matches: LOCALHOST, js: ['bridge.js'], run_at: 'document_start', all_frames: true },
  {
    ...LOCAL_PREFIX,
    js: ['interceptor.js'],
    run_at: 'document_start',
    all_frames: true,
    world: 'MAIN',
  },
  { ...LOCAL_PREFIX, js: ['bridge.js'], run_at: 'document_start', all_frames: true },
];
// What the sources zip may contain: exactly what it takes to rebuild (see zip.includeSources in
// wxt.config.ts), so nothing else in the project folder can reach Mozilla.
const SOURCES =
  /^(src\/|public\/|scripts\/|(wxt\.config\.ts|tsconfig\.json|package\.json|package-lock\.json|README\.md)$)/;

const builds = {
  chrome: requireBuild(CHROME_BUILD),
  firefox: requireBuild(FIREFOX_BUILD),
};
const manifests = Object.fromEntries(
  Object.entries(builds).map(([browser, dir]) => [
    browser,
    JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')),
  ]),
);
const files = (dir) =>
  fs
    .readdirSync(dir, { recursive: true })
    .filter((file) => fs.statSync(path.join(dir, file)).isFile())
    .toSorted();
const read = (browser, file) => fs.readFileSync(path.join(builds[browser], file), 'utf8');

// The file names in a zip, read from its central directory.
function zipEntries(file) {
  const zip = fs.readFileSync(file);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error(`${file} is not a zip`);
  const names = [];
  for (
    let at = zip.readUInt32LE(end + 16), left = zip.readUInt16LE(end + 10);
    left > 0;
    left--
  ) {
    if (zip.readUInt32LE(at) !== 0x02014b50)
      throw new Error(`${file}: bad central directory`);
    const nameLength = zip.readUInt16LE(at + 28);
    names.push(zip.toString('utf8', at + 46, at + 46 + nameLength));
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return names.filter((name) => !name.endsWith('/')).toSorted();
}
// The packages `npm run zip` made (zip in wxt.config.ts).
const artifact = (suffix) =>
  path.join(ROOT, 'web-ext-artifacts', `ghostfetch-${version}-${suffix}`);

console.log('manifests');
for (const browser of ['chrome', 'firefox']) {
  const manifest = manifests[browser];
  await check(
    `${browser}: the release CSP is exactly the one Ghostfetch has always shipped`,
    async () => {
      expect(manifest.content_security_policy, { extension_pages: CSP });
    },
  );
  await check(`${browser}: name, version, permissions and hosts`, async () => {
    expect(
      [
        manifest.manifest_version,
        manifest.name,
        manifest.version,
        manifest.minimum_chrome_version,
      ],
      [3, 'Ghostfetch', version, '121'],
    );
    expect(
      manifest.description,
      'Mock and modify API responses, redirect requests and change headers. Runs locally, makes no network calls of its own.',
    );
    expect(manifest.permissions, [
      'storage',
      'unlimitedStorage',
      'declarativeNetRequest',
      'declarativeNetRequestFeedback',
      'sidePanel',
      'scripting',
    ]);
    expect(manifest.host_permissions, ['<all_urls>']);
  });
  await check(
    `${browser}: content scripts only on the built-in hosts, page world for the interceptor`,
    async () => {
      expect(manifest.content_scripts, CONTENT_SCRIPTS);
    },
  );
  await check(
    `${browser}: popup, editor page, icons and the Firefox add-on settings`,
    async () => {
      expect(manifest.action, {
        default_title: 'Ghostfetch',
        default_icon: ICONS,
        default_popup: 'popup.html',
      });
      expect([manifest.options_page, manifest.icons], ['sidepanel.html', ICONS]);
      expect(manifest.browser_specific_settings, {
        gecko: {
          id: '@ghostfetch',
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
        gecko_android: { strict_min_version: '142.0' },
      });
    },
  );
  await check(`${browser}: every file the manifest names is in the build`, async () => {
    const named = [
      ...Object.values(manifest.icons),
      ...Object.values(manifest.action.default_icon),
      manifest.action.default_popup,
      manifest.options_page,
      ...manifest.content_scripts.flatMap((script) => script.js),
      ...(manifest.background.scripts ?? [manifest.background.service_worker]),
      manifest.side_panel?.default_path ?? manifest.sidebar_action.default_panel,
    ];
    expect(
      named.filter((file) => !fs.existsSync(path.join(builds[browser], file))),
      [],
    );
  });
}
await check('chrome: a service worker and a side panel', async () => {
  expect(
    [
      manifests.chrome.background,
      manifests.chrome.side_panel,
      manifests.chrome.sidebar_action,
    ],
    [{ service_worker: 'background.js' }, { default_path: 'sidepanel.html' }, undefined],
  );
});
await check('firefox: a background script and a sidebar', async () => {
  expect(
    [manifests.firefox.background, manifests.firefox.side_panel],
    [{ scripts: ['background.js'] }, undefined],
  );
  expect(manifests.firefox.sidebar_action, {
    default_panel: 'sidepanel.html',
    default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png' },
    default_title: 'Ghostfetch',
    open_at_install: false,
  });
});

console.log('built files');
for (const browser of ['chrome', 'firefox']) {
  await check(
    `${browser}: no inline code in the pages (the CSP would block it)`,
    async () => {
      const found = files(builds[browser])
        .filter((file) => file.endsWith('.html'))
        .flatMap((file) => {
          const html = read(browser, file);
          return [
            ...[...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/gi)].map(
              () => `${file}: inline <script>`,
            ),
            ...[...html.matchAll(/<style\b/gi)].map(() => `${file}: <style>`),
            ...[...html.matchAll(/\s(style|on[a-z]+)\s*=/gi)].map(
              (match) => `${file}: ${match[1]}= attribute`,
            ),
            ...[...html.matchAll(/\s(?:src|href)\s*=\s*["']?(?:https?:)?\/\//gi)].map(
              () => `${file}: remote URL`,
            ),
          ];
        });
      expect(found, []);
    },
  );
  await check(
    `${browser}: the page scripts add no globals to the page; every script is strict mode`,
    async () => {
      // The page scripts are one anonymous function each, called at once, whose first statement
      // is the directive, so it covers all their code; the background is strict as a whole file.
      const starts = ['interceptor.js', 'bridge.js', 'background.js'].map((file) =>
        read(browser, file).slice(0, 28),
      );
      expect(starts, [
        '(function() {\n\t"use strict";',
        '(function() {\n\t"use strict";',
        '"use strict";\nvar background',
      ]);
    },
  );
  await check(
    `${browser}: no source maps, no absolute paths, nothing from the test setup or the UI kit page`,
    async () => {
      const all = files(builds[browser]);
      expect(
        all.filter(
          (file) =>
            file.endsWith('.map') || /test/i.test(file) || /(^|\/)kit[.-]/.test(file),
        ),
        [],
      );
      expect(
        all.filter(
          (file) =>
            /\.(js|css|html|json)$/.test(file) &&
            (read(browser, file).includes(ROOT) ||
              /\/Users\/|\/home\/|[A-Z]:\\/.test(read(browser, file))),
        ),
        [],
      );
      // The kit's components are in the extension; the kit page (its entrypoint and the sheet it
      // draws) isn't. The bundles name each module they hold in a comment, so its code would show
      // up by its path.
      expect(
        all.filter(
          (file) =>
            file.endsWith('.js') && /src\/(app|pages)\/kit\//.test(read(browser, file)),
        ),
        [],
        'the kit page',
      );
    },
  );
}

console.log('packages');
await check('the Chrome zip holds exactly the Chrome build', async () => {
  expect(zipEntries(artifact('chrome.zip')), files(builds.chrome));
});
await check(
  'the Firefox zip holds exactly the Firefox build, and the .xpi is the same file',
  async () => {
    expect(zipEntries(artifact('firefox.zip')), files(builds.firefox));
    expect(
      fs
        .readFileSync(artifact('firefox.xpi'))
        .equals(fs.readFileSync(artifact('firefox.zip'))),
      true,
      '.xpi',
    );
  },
);
await check(
  'the sources zip holds only what it takes to rebuild, and all of it',
  async () => {
    const entries = zipEntries(artifact('sources.zip'));
    expect(
      entries.filter((name) => !SOURCES.test(name)),
      [],
      'outside the allowlist',
    );
    expect(
      [
        'package-lock.json',
        'package.json',
        'wxt.config.ts',
        'tsconfig.json',
        'src/app/background/index.ts',
        'src/app/interceptor/index.ts',
        'public/fonts/CommitMono-VF.woff2',
      ].filter((name) => !entries.includes(name)),
      [],
      'missing',
    );
    const expected = files(ROOT).filter(
      (name) => SOURCES.test(name) && !name.startsWith('node_modules/'),
    );
    expect(entries, expected, 'every file of src/, public/ and scripts/');
  },
);

finish();
