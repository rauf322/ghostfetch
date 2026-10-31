// Builds Ghostfetch for Chrome (.output/chrome-mv3) and Firefox/Zen (.output/firefox-mv3) from
// src/, and `npm run zip` packs them into web-ext-artifacts/. This file is the manifest: WXT adds
// the background, popup and side panel (Firefox's sidebar) from src/app/, and everything else is
// spelled out below.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// Unminified bundles name each module in a comment, and WXT's own wrapper modules by their
// absolute path. This keeps the path of this folder (your home folder, and a different one on
// every machine) out of the build, so a rebuild anywhere comes out byte for byte the same.
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const relativePaths = {
  name: 'ghostfetch:relative-paths',
  renderChunk: (code: string) => code.replaceAll(ROOT, ''),
};

// Where `npm run zip` puts the packages, apart from the builds in .output/: web-ext-artifacts/,
// the folder web-ext's own `build` uses. WXT puts a zip wherever its file name template points
// (an absolute path here) but only creates .output/ itself.
const ARTIFACTS = fileURLToPath(new URL('web-ext-artifacts/', import.meta.url));

// The extension pages' Content-Security-Policy, the same string Ghostfetch has always shipped.
// test/release.mjs checks both built manifests against it.
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";

// `npm run dev` only: Vite's hot reload adds <style> tags, talks to its server over a WebSocket
// and serves the pages' stylesheet (and so the font) from that server, all of which the CSP
// forbids. Builds and packages never use this.
const DEV_PORT = 3417;
const DEV_SERVER = `http://localhost:${DEV_PORT}`;
const DEV_CSP = CSP.replace(
  "style-src 'self'",
  `style-src 'self' 'unsafe-inline' ${DEV_SERVER}`,
).replace(
  "connect-src 'none'",
  `connect-src ws://localhost:${DEV_PORT} ${DEV_SERVER}; font-src 'self' ${DEV_SERVER}`,
);

const ICONS = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png',
};

// Ghostfetch always runs on localhost, *.localhost, 127.0.0.1 and hosts starting with "local."
// (see src/shared/api/sites/); these are their content scripts. The sites you add get the same two
// scripts registered at runtime by the background. Both are WXT "unlisted scripts" rather than
// content script entrypoints, whose isolated-world wrapper announces itself to the page with a
// postMessage and a DOM event.
const LOCALHOST = {
  matches: ['*://localhost/*', '*://*.localhost/*', '*://127.0.0.1/*'],
};
const LOCAL_PREFIX = {
  matches: ['*://*/*'],
  include_globs: ['http://local.*', 'https://local.*'],
  exclude_matches: ['*://*.localhost/*'],
};
const INTERCEPTOR = {
  js: ['interceptor.js'],
  run_at: 'document_start' as const,
  all_frames: true,
  world: 'MAIN' as const,
};
const BRIDGE = { js: ['bridge.js'], run_at: 'document_start' as const, all_frames: true };

export default defineConfig({
  srcDir: 'src',
  // The code is laid out in Feature-Sliced Design's layers (README, "Files"), the app layer on top:
  // a folder for each part of the extension (the background, the two page scripts, the popup, the
  // side panel, the kit page), which is what WXT builds. WXT takes every app/<name>/index.* as an
  // entrypoint, so the folder for anything else in app/ (styles/) has no index file.
  entrypointsDir: 'app',
  // React for the .tsx files: the UI kit (src/shared/ui/kit/) and the pages built from it.
  modules: ['@wxt-dev/module-react'],
  // Every import is written out, so a reader can see where each name comes from.
  imports: false,
  // WXT builds Firefox as Manifest V2 unless told otherwise; Ghostfetch is MV3 in both browsers.
  manifestVersion: 3,
  // Readable output: Mozilla's reviewers read the built files and rebuild them from the sources.
  // Tailwind only touches stylesheets that import it (src/app/styles/kit.css). No modulepreload
  // polyfill: every browser Ghostfetch supports preloads modules itself.
  vite: () => ({
    build: { minify: false, modulePreload: { polyfill: false } },
    plugins: [relativePaths, tailwindcss()],
  }),
  dev: { server: { port: DEV_PORT } },
  // `npm run start:zen` opens Zen with the dev build and reloads it on every save. `npm run dev`
  // opens no browser: load .output/chrome-mv3-dev in chrome://extensions once instead (branded
  // Chrome ignores the --load-extension flag WXT would start it with).
  webExt: { disabled: !process.env.ZEN, binaries: { firefox: process.env.ZEN ?? '' } },
  manifest: ({ command }) => ({
    name: 'Ghostfetch',
    description:
      'Mock and modify API responses, redirect requests and change headers. Runs locally, makes no network calls of its own.',
    minimum_chrome_version: '121',
    browser_specific_settings: {
      gecko: {
        id: '@ghostfetch',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
      gecko_android: { strict_min_version: '142.0' },
    },
    permissions: [
      'storage',
      'unlimitedStorage',
      'declarativeNetRequest',
      'declarativeNetRequestFeedback',
      'sidePanel',
      'scripting',
    ],
    host_permissions: ['<all_urls>'],
    content_security_policy: { extension_pages: command === 'serve' ? DEV_CSP : CSP },
    action: { default_title: 'Ghostfetch', default_icon: ICONS },
    // The full editor, in a tab. The same page is the side panel (Firefox: sidebar).
    options_page: 'sidepanel.html',
    icons: ICONS,
  }),
  hooks: {
    // The kit page (src/app/kit/, drawing src/pages/kit/) shows every UI kit component. It's built
    // for `npm run dev` and for test/kit.mjs (`wxt build --mode kit`, into .output/*-kit), never
    // into the extension you install. `npm run test:kit` sets NODE_ENV=production for that build:
    // left unset, WXT makes it the mode's name, and React then builds its development version.
    'entrypoints:resolved': (wxt, entrypoints) => {
      if (wxt.config.command === 'serve' || wxt.config.mode === 'kit') return;
      const kit = entrypoints.findIndex((entrypoint) => entrypoint.name === 'kit');
      if (kit !== -1) entrypoints.splice(kit, 1);
    },
    'vite:build:extendConfig': (entrypoints, config) => {
      const output = config.build?.rollupOptions?.output;
      if (!output || Array.isArray(output)) return;
      // Every script stays in strict mode, like the ES modules it's built from: the background as
      // a whole file, the two page scripts inside their wrapper function (`intro`). WXT drops the
      // page scripts' IIFE name with a regex that a leading "use strict" defeats, which would leave
      // a global variable in the page. Strict mode matters most in the interceptor: the page can
      // patch the built-ins it calls, and in sloppy mode a patched one could climb to the caller
      // through `.caller` and read its arguments, such as the rules.
      if (entrypoints.length === 1 && entrypoints[0]!.type === 'background')
        output.strict = true;
      if (entrypoints.length === 1 && entrypoints[0]!.type === 'unlisted-script')
        output.intro = '"use strict";';
      // The pages (the popup and the editor) share code. Its chunks are named for what's in them:
      // chunks/libraries-*.js holds React, Base UI and the other npm packages, chunks/shared-*.js
      // the Ghostfetch code both pages use.
      if (entrypoints.some((entrypoint) => entrypoint.inputPath.endsWith('.html'))) {
        output.codeSplitting = {
          groups: [
            { name: 'libraries', test: /[\\/]node_modules[\\/]/ },
            // With WXT's virtual modules (empty in a build), or the bundler's runtime would be
            // named after them.
            { name: 'shared', test: /[\\/]src[\\/]|^\0virtual:wxt-/, minShareCount: 2 },
          ],
        };
      }
    },
    'build:manifestGenerated': (_wxt, manifest) => {
      manifest.content_scripts = [
        { ...LOCALHOST, ...INTERCEPTOR },
        { ...LOCALHOST, ...BRIDGE },
        { ...LOCAL_PREFIX, ...INTERCEPTOR },
        { ...LOCAL_PREFIX, ...BRIDGE },
      ];
    },
    'zip:start': () => {
      mkdirSync(ARTIFACTS, { recursive: true });
    },
    // The Firefox package doubles as the .xpi for installing it by hand.
    'zip:extension:done': (wxt, zipPath) => {
      if (wxt.config.browser === 'firefox')
        copyFileSync(zipPath, zipPath.replace(/\.zip$/, '.xpi'));
    },
  },
  zip: {
    // WXT's own names (ghostfetch-<version>-firefox.zip, ghostfetch-<version>-sources.zip), in
    // web-ext-artifacts/.
    artifactTemplate: `${ARTIFACTS}{{name}}-{{packageVersion}}-{{browser}}{{modeSuffix}}.zip`,
    sourcesTemplate: `${ARTIFACTS}{{name}}-{{packageVersion}}-sources{{modeSuffix}}.zip`,
    // Only what it takes to rebuild the extension, so nothing else in this folder can end up in
    // the sources zip that goes to Mozilla.
    includeSources: [
      'src/**',
      'public/**',
      'scripts/**',
      'wxt.config.ts',
      'tsconfig.json',
      'package.json',
      'package-lock.json',
      'README.md',
    ],
  },
});
