# Ghostfetch

A small, local Requestly-style browser extension for frontend work, for Chrome and
Firefox-based browsers such as Zen: mock or patch the API responses your app gets (replace a
body, or keep the server's and change its status, headers or delay), from a side-panel editor.
TypeScript and Manifest V3, with a popup and
editor in React, built with [WXT](https://wxt.dev) into plain, unminified JavaScript; it makes no
network requests of its own. Rules live in the browser's extension storage on your
machine. (In Irish folklore a *fetch* is the ghostly double of a living person; here it's the
double of your API.)

Ghostfetch always runs on **`localhost`** (any port, plus `*.localhost`), **`127.0.0.1`** and any
host starting with **`local.`**, such as `local.myapp.com`. You can turn it on for other sites
too: switch on **Active on …** in the popup on that tab, or click **Turn on for …** in the
Traffic view. A site you add covers its subdomains, so `example.com` includes
`api.example.com`. Everywhere else Ghostfetch doesn't run at all.

## Install

Build it first. You need [Node.js](https://nodejs.org) 24 or later:

```sh
npm install
npm run build      # .output/chrome-mv3 for Chrome, .output/firefox-mv3 for Zen and Firefox
```

### Chrome (121 or later)

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and pick the `.output/chrome-mv3` folder.
3. Pin Ghostfetch from the puzzle-piece menu so its icon stays in the toolbar.
4. Reload any tabs that were already open. The content scripts only reach pages loaded
   after installing.

After changing the code, run `npm run build` again, click the reload arrow on Ghostfetch's
card in `chrome://extensions`, then reload the page you're testing. Or run `npm run dev` and
load `.output/chrome-mv3-dev` instead: it rebuilds and reloads the extension on every save.

**Coming from 0.5.0 or earlier, loaded from this folder?** Chrome keeps an unpacked
extension's rules with the folder it was loaded from, and the build lives in a new one, so
`.output/chrome-mv3` starts empty. Before switching, open the old Ghostfetch's editor and
choose **Export all rules** in its `⋯` menu; then load `.output/chrome-mv3`, **Import** the file
and switch the rules back on (imported rules arrive switched off), and remove the old card.
In Zen and Firefox nothing changes: the add-on ID stays `@ghostfetch`, and so do your rules.

### Zen, Firefox and other Firefox-based browsers (140 or later)

Firefox-based browsers can't load a folder the way Chrome does, and they only keep add-ons
that are signed. `npm run zip` packs the add-on into `web-ext-artifacts/`: a
`ghostfetch-<version>-firefox.zip` for uploading, an identical `.xpi` for installing, and the
`ghostfetch-<version>-sources.zip` Mozilla asks for. Then pick one:

- **Signed and permanent (recommended).** Sign in at
  [addons.mozilla.org/developers](https://addons.mozilla.org/developers/), choose **Submit a
  New Add-on**, then **On your own**: it gets signed but is never listed publicly. Upload the
  `-firefox.zip`. The code in it is built from TypeScript (bundled, not minified), so answer
  **Yes** to the source code question and upload the `-sources.zip`; its README (this file)
  says how to build it (see [Build from source](#build-from-source)). Run
  `node scripts/check-sources.mjs` first: it rebuilds the sources zip in a clean folder and
  checks the result matches byte for byte. When the review finishes, download the signed
  `.xpi` and open it in Zen (or drop it onto the window). The add-on ID, `@ghostfetch` in
  `wxt.config.ts`, is tied to your account from the first upload. Bump `version` in
  `package.json` for every later upload.
- **Quick try, until the browser restarts.** Open `about:debugging#/runtime/this-firefox`,
  click **Load Temporary Add-on…** and pick `.output/firefox-mv3/manifest.json`. After
  changing the code, run `npm run build` and use **Reload** there.
- **Unsigned and permanent.** Zen, Firefox Developer Edition and Nightly let you turn the
  signing requirement off: set `xpinstall.signatures.required` to `false` in `about:config`,
  then use **Install Add-on From File…** in the gear menu of `about:addons` and pick the
  `.xpi`. This turns signature checks off for every add-on in that profile.

**Coming from Mocktail (0.4 and earlier)?** Ghostfetch has a new add-on ID, so Firefox-based
browsers install it next to Mocktail instead of replacing it, with empty storage. Before you
remove Mocktail, open its editor and choose **Export all rules** in its `⋯` menu. Then
install Ghostfetch, **Import** the file and switch the rules back on (imported
rules arrive switched off), and remove Mocktail. In Chrome the same export and import moves
your rules to the new build folder (see the note above).

What's different in Firefox-based browsers:

- The editor opens in the browser's **sidebar** instead of Chrome's side panel.
- Site access can be granted or revoked per site from the Extensions menu. If rules stop
  applying, check that Ghostfetch is allowed on that site.

## Using it

- **Toolbar popup**: master on/off, whether Ghostfetch is active on the current site (with a
  switch for sites that aren't built in), the sites it runs on (click × to remove one you
  added), record on/off, quick per-rule switches. Click a rule's name to open it in the
  editor.
- **Side panel (Chrome), sidebar (Firefox, Zen) or tab**: the full editor. Open it from the
  popup, or from the `⋯` menu.
  - **Rules**: create and edit rules. Changes save as you type and apply to open tabs
    immediately, without reloading. Rules apply in the list's order and the first match wins;
    drag them to reorder. Import and export sit at the bottom of the list. A rule's switch
    is a green dot: it pulses while the rule is on, holds still while Ghostfetch is off, and
    is grey while the rule is off. Click it to turn the rule on or off.
    **New rule** asks "What should Ghostfetch answer?" (beside the list it's also what shows
    with no rule open). Paste a path, a full URL (it keeps the path and query, so the rule
    works on any host) or a cURL command, as the browsers' Copy as cURL writes one: its
    method, Accept type and GraphQL operation are read too, all inside the extension, with
    nothing sent anywhere. Pickers under the input set the method, how the URL is compared,
    the status and the delay, and the starters (**Empty list**, **Fail with 500**, **Not
    found**, **Slow by 2 s**, **Logged out (401)**) set the answer in one click. **Enter**
    makes the rule and opens it with the cursor in its body. Under the starters are the
    requests the page just made that no rule answered, each with **Mock**.
    An open rule says what it does in one sentence under its name ("Answers GET requests
    whose URL contains /api/user with the JSON below, without calling the server."), and,
    while recording, how often it fired on the page the editor watches. Under that are its
    settings, a row each with its value: **When a request matches** (the URL and how it's
    compared, the method, a GraphQL operation) and **Respond with** (the status, with its
    name and the common ones by class; the delay; headers to set or remove). Click a row to
    edit it in place. **Try a URL** says whether the rule would answer a URL you paste. Then
    the body: **Replace body** sends yours without calling the server; **Keep server's
    body** makes the real request and keeps its body, so only the status, headers and delay
    change.
    In a wide window the settings and the body sit side by side, and the body editor takes
    the window's height; in a side panel the body comes after the settings, as tall as the
    body but never taller than the panel, and a longer body scrolls inside it. It colours
    what's on screen, so a body of a megabyte stays fast.
    A JSON body is checked as you type: once you pause, a mistake is marked where it is (a
    squiggle, the line in the gutter, a few words at the end of the line and the whole
    message on hover), and the line under the editor says what it is (click it to go there).
    In a body editor, **⌘F / Ctrl+F** searches the body itself instead of the page: **Enter**
    and **Shift+Enter** step through the matches, **Esc** closes the search and leaves the
    current match selected. **⌘= / ⌘−** (Ctrl on Windows and Linux) make its text larger or
    smaller and **⌘0** puts it back, instead of zooming the page. **Vim keys** under it turns
    on [vim keys](#vim-keys). The text size and the Vim switch are remembered for every body
    editor. Format on a body of more than 300
    lines can't be undone with ⌘Z: the browser would take minutes to make it undoable.
  - **Traffic**: live `fetch`/XHR log of a tab, newest first, grouped by when ("Just now", "A
    few minutes ago", "About 10 minutes ago"). What a rule did is in green ("Mocked by Feature
    flags"). The bar along the top picks the page to watch and has **Recording**, **Keep on
    reload** (keep the log when the page reloads) and **Clear**; under it, **All**, **Matched**
    and **Errors** (a status of 400 or more, a failed request or a rule's error), each with its
    count, and a search by URL, status or rule.
    Click a request to open it in a drawer beside the log: its status, time and Content-Type,
    the rule that acted on it, its bodies, **Copy URL**, **Copy as cURL** and **Copy body**,
    and **Mock this response**, which turns it into a rule pre-filled with the method, path,
    status and the real body, ready to edit.

The look is dark-only and calm, after [T3 Code](https://github.com/pingdotgg/t3code), Revolut
and ChatGPT: a near-black canvas with cards a step lighter, soft corners, Geist for words and
Commit Mono for what is code (URLs, methods, status codes, headers, bodies), in sentence case.
There is one colour, green, which means "on" or "a rule fired"; a rule's switch is a green dot
that pulses while the rule is on. Errors and failed requests are inverted white instead of red.

### Vim keys

**Vim keys** under a body editor, next to **Format**, turns on vim keys. It's one
setting for every body editor, remembered in this browser
and off by default. The editor then starts in Normal mode with a block cursor, and a status
line along its bottom shows the mode, the keys typed so far and the cursor position: a hollow
mark in Normal mode, a green one in Insert mode, inverted white in Visual mode.

| | Keys |
| --- | --- |
| Modes | `i a I A o O` to type, `v V` to select, `Esc` or `Ctrl+[` back to Normal |
| Motions, with a count | `h j k l` and the arrows, `w b e ge W B E`, `0 ^ $`, `gg G`, `{ }`, `%`, `f F t T ; ,`, `+ - Enter`, `Ctrl+D Ctrl+U`, `zz zt zb` |
| Operators | `d c y > <` with a motion or a text object, doubled for whole lines (`dd`, `>>`) |
| Text objects | `iw aw iW aW`, `i" a" i' a'`, `i( a( i[ a[ i{ a{`, `ip ap` |
| Edits | `x X s S r ~ D C Y J p P`, `u` and `Ctrl+R`, `.` to repeat the last change |
| Search | `/` and `?` in the body's find bar, `n N`, `* #`; operators take them too (`d/foo`) |
| `:` | `:42` goes to line 42; `:w` and the like only say that changes save automatically |

Motions and text objects behave like vim's own (`cw`, `dw` at the end of a line, `ci"` and
`di{` in formatted JSON, `dap`). Where it differs:

- There's one register, shared by every body editor on the page. ⌘C and ⌘V (Ctrl+C and
  Ctrl+V) keep using the system clipboard in every mode.
- Searches ignore case, as with vim's `ignorecase`.
- `o`, `O`, `cc` and `S` keep the line's indentation. `o` below a line that opens a bracket,
  and `O` above one that closes it, go one level deeper, like Enter in the editor.
- `u` and `Ctrl+R` undo and redo a whole change, with what was typed in its Insert mode, as
  in vim. ⌘Z still steps through the browser's own history, which Chrome splits a letter at a
  time in this editor. Chrome keeps that history for the whole panel; when the last change
  there was in another field, `u` leaves it alone and says "Already at oldest change".
- In Normal mode **Tab** leaves the editor. In Insert mode it indents, and **Esc** then
  **Tab** leaves.
- Not included: other `:` commands, macros, marks, named registers, Visual Block (`Ctrl+V`
  stays paste on Windows and Linux), Replace mode (`R`), `gu`, `gU` and `g~`, `Ctrl+A` and
  `Ctrl+X`, and custom mappings such as `jk` for Esc.

### What a rule does

A rule answers the `fetch()` and `XMLHttpRequest` calls it matches: with your body, without
calling the server (**Replace**), or with the server's response (**Server's body**), and either
way with the status, headers and delay you set. Ghostfetch wraps `fetch` and `XMLHttpRequest`
in the page to do it.

URL matching: *contains*, *equals* (a bare path such as `/api/users?page=1` works too),
*wildcard* (`*`) or *regex*. A rule can also match a **GraphQL operation name**, read from the
request body or the `operationName` query param.

### Limits worth knowing

- Rules only see `fetch()` and `XMLHttpRequest` calls made by page scripts, not
  `<script>`/`<img>` loads, WebSockets, or requests from service workers.
- A **Server's body** rule still makes the real request. If that fails, the page gets the
  network error, as it would without Ghostfetch, and the Traffic view shows a "Rule error".
- **Merge JSON** and **Script** bodies went in 0.8.0. A rule saved with either keeps the
  server's body now; its JSON or script isn't used, and goes the next time the rules are
  saved.
- **Redirect**, **Headers** and **Block** rules went in 0.9.0. One saved before then does
  nothing and isn't listed; it goes from storage the next time the rules are saved, and
  importing a file skips it.
- The Traffic log keeps the last 300 requests per tab and captures response bodies up to
  1 MB. Iframes from other sites (auth widgets, wallets) aren't captured unless Ghostfetch runs
  on their site too.

## Security model

- **No network calls of its own, and few libraries, only in its own pages.** Ghostfetch's code is
  all in `src/`. The popup and the editor are React components on Base UI (see [UI kit](#ui-kit));
  those two, what they're built on (React DOM and its scheduler, Base UI's utils, Floating UI,
  use-sync-external-store) and the kit's three helpers (clsx, tailwind-merge,
  class-variance-authority) are pinned in `package-lock.json`, and the build puts them,
  unminified, in `chunks/libraries-*.js`. The background and the two scripts that run in
  web pages use none of them. The build (WXT and Vite) turns everything into plain, unminified
  JavaScript, and the only code it adds to those three scripts is WXT's few lines that start each
  one: a pass-through and a `try`/`catch`. The page-world script is built so it adds no globals
  to the page and runs entirely in strict mode, so a built-in the page patches can't reach its
  functions or their arguments through `.caller`. The extension pages run under a strict CSP
  (`connect-src 'none'`, no remote scripts, images or styles, no inline code, no `<style>` tags);
  `npm run test:release` checks all three in the built packages.
- **Only runs where it should.** The built-in hosts' content scripts are declared in the
  manifest; the sites you add get theirs registered at runtime, for those sites only. Any
  other website can't see
  Ghostfetch, your rules or your traffic. The `local.*` pattern is matched against the start of
  the page URL, so both content scripts also refuse to run on a URL with credentials, such as
  `http://local.x@other.site/`, which would otherwise pass it.
- **The page can't steer the extension.** The page-world script gets rules over a private
  channel. The handoff listener is registered first, in the capture phase, ignores events
  the page dispatched itself (`isTrusted`), reads the port by index rather than iterating,
  and only calls copies of the browser functions taken before any page script ran. So a page
  that forges an offer, or patches `MessageEvent`, `EventTarget`, `MessagePort` or array
  iteration, still can't take the port. Everything the page reports back is rebuilt from
  known fields, and the editor shows it as text, never as HTML.
- **Scripts on the sites Ghostfetch runs on are trusted.** Rules have to live in the page to
  work, so code running there (a compromised dependency, say) can see that Ghostfetch is
  present, can fetch a URL that a rule matches and get the mock body, and can try
  to read the rules by tampering with built-ins like `String` or `RegExp` methods after load.
  Every site Ghostfetch runs on gets the same rules. Any host starting with `local.` counts, so
  only open `local.*` sites you control while Ghostfetch is on, only add sites you trust, and
  don't keep real secrets in rule bodies.
- **Imported rules arrive switched off.** A rule changes what your app gets back from its
  server, so read a rules file from someone else before you switch its rules on.
- **Mind what you mock.** "Mock this response" copies a real response into a rule. Rules are
  stored unencrypted in your browser profile and included in exports, so strip tokens and
  personal data from bodies you keep or share.
- `host_permissions` stays `<all_urls>`: a site you add needs host access for its content
  scripts, and the browser only shows the extension a tab's address and title (the popup's
  current site, Traffic's list of tabs) with host access, since Ghostfetch has no `tabs`
  permission. Content scripts still only run on the sites Ghostfetch runs on. The `scripting`
  permission is only used to register the content scripts for the sites you add.

## Files

The code in `src/` is laid out in [Feature-Sliced Design](https://feature-sliced.design)'s
layers, the way FSD 2.1 starts a project, with pages first: from the top, `app` → `pages` →
`shared`, and a file only imports from its own layer's folder or the layers below it. A page
keeps what only it uses, and anything that more than one part of the extension needs is in
`shared`, so the pages can't tangle with each other. A page is used from outside only through
its `index.ts`.

`shared` has no slices, only segments, one for each kind of code: `api` for what Ghostfetch
keeps in `chrome.storage` and what its parts send each other, `lib` for small libraries of its
own, `react` for where those meet React, and `ui` for components. `api`, `lib` and `react` are
each used through their `index.ts`. `shared/ui` has a public file per component instead, as FSD
advises, so a screen that shows a button doesn't load the body editor with it. `api` and `lib`
are plain TypeScript, with no React and no npm package: `lib` imports nothing else and `api`
only `lib`, which is what keeps the background and the page scripts, which use both, free of
the screens' libraries. `npm run lint` checks all this with eslint-plugin-boundaries, whose
policies are in `oxlint.config.ts`.

Inside a page the files are grouped by what they're for: `ui/` holds its components, `model/` its
state and what changes it, and `lib/` plain functions. A page composes components of its own,
one per part of the screen, so each file is about one thing.

```
src/app/                         the extension's parts, one folder each, which WXT builds (wxt.config.ts)
  background/                    service worker (Chrome) or event page (Firefox): content scripts for added sites, badge
  interceptor/                   page world: wraps fetch/XHR, applies the rules
  bridge/                        isolated world: passes rules in, collects the traffic log
  popup/                         the toolbar popup's page
  sidepanel/                     the editor (Chrome's side panel, Firefox's sidebar, or a tab): its top bar, tabs and menus
  kit/                           the kit page; for npm run dev and the kit test, never in the extension
  styles/                        theme.css, the look's values (colours, the two fonts), and kit.css: those as Tailwind's theme (type sizes, corners)
src/pages/                       what the screens show
  rules/                         the Rules tab: the rule list, New rule (ui/new-rule/), and the rule editor (ui/rule-editor/, a component per part)
  traffic/                       the Traffic tab: a tab's live log grouped by time, a request's drawer (ui/request-detail/), Mock this response
  popup/                         the toolbar popup
  kit/                           the kit page: every kit component in its states
src/shared/                      what more than one part of the extension uses
  api/                           what's kept in chrome.storage and what the parts send each other (index.ts)
    rules/                       a rule: its fields and their names, making one, URL matching, and the screens' copy of the rules
    sites/                       the sites Ghostfetch runs on, the screens' copy of the ones you added, turning one on or off
    settings.ts                  the on/off and recording switches
    log-entry.ts                 a request in a tab's traffic log
    traffic-log.ts               the editor's live log of the tab it watches (Traffic, how often a rule fired, New rule's recent requests)
    preserve.ts                  Keep on reload: whether that log keeps what it has when the page reloads
    messages.ts                  the messages between the background, the bridge, the interceptor and the Traffic tab
    open-editor.ts               the editor in the side panel or a tab, and on a rule the popup picked
  lib/                           small libraries, a file each (index.ts): JSON, HTML, URLs, durations, status names, cURL
                                 commands, icons, file names, a download, the side panel, the stores' base, untrusted data
  react/                         useStore(), which redraws a screen when a store changes, and the traffic log's hooks (index.ts)
  ui/                            components, a public file each
    kit/                         the UI kit: React components on Base UI, styled with Tailwind (see UI kit)
    code-editor/                 the body editor (plain DOM code, its find bar and vim keys) and its React component (index.ts)
    list-detail.tsx              the editor's layout: a list, and what's picked in it
    master-switch.tsx            Ghostfetch on or off, in the popup and the editor's top bar
    rule-switch.tsx              a rule on or off (the pulsing green dot), in the list, the rule's top bar and the popup
    rules-file.tsx               rules files: export every rule or one, import one (its rules arrive switched off)
    cn.ts                        cn(), which joins the kit's class names
wxt.config.ts                    the manifest (permissions, content scripts, CSP, Firefox ID) and the build settings
components.json                  settings for shadcn's CLI, for adding a kit component
oxlint.config.ts                 the linter's settings (npm run lint), and the layers' rules for eslint-plugin-boundaries
.oxfmtrc.json                    the formatter's settings (npm run format): single quotes, 90 columns
public/fonts/                    Geist by Vercel and Commit Mono by Eigil Nikolajsen (SIL Open Font License, see Geist-OFL.txt and CommitMono-OFL.txt)
public/icons/                    the Thorn Glass mark, generated by scripts/make-icons.mjs
scripts/check-sources.mjs        rebuilds the sources zip in a clean folder and compares it with the build
scripts/oxlint-rules.mjs         two lint rules of its own (npm run lint): no export *, and the folders of src/app/ are the extension's parts
test/json.mjs                    the body editor's JSON check against JSON.parse, and the pieces it colours a long body in
test/matching.mjs                which URLs a rule's pattern matches, and that the rule editor's Try a URL says what the page does
test/curl.mjs                    cURL commands both ways: Copy as cURL (nothing the page sent breaks out of its quotes), New rule's reading of one
test/e2e.mjs                     end-to-end test in Chromium (Playwright)
test/firefox.mjs                 end-to-end test in Zen or Firefox (puppeteer-core)
test/kit.mjs                     the UI kit under the real CSP, in Chromium and Zen, driven with the keyboard and the mouse
test/release.mjs                 checks the built manifests, files and zips before an upload
test/fixtures.mjs                test server, hostile pages and rules shared by the tests
.output/                         what the build makes: chrome-mv3/, firefox-mv3/ (*-kit/: the kit test's builds)
web-ext-artifacts/               what npm run zip makes: the packages for each browser, the .xpi and the sources zip
```

## UI kit

`src/shared/ui/kit/` is the UI kit the popup and the editor are built from: React components on
[Base UI](https://base-ui.com), styled with Tailwind to the look (near-black cards, soft
corners, Geist and Commit Mono, the green dot). `src/app/styles/kit.css` switches off
Tailwind's own colours, fonts, type sizes, letter spacings, radii and shadows and gives it only
this look's values, so a component can't drift from it. Base UI does the keyboard and
screen-reader work: menus and selects open with Enter or the arrow keys, the arrows move, Esc
closes them and gives focus back, and tabs and option groups are one Tab stop each.

To see it, run `npm run dev`, load `.output/chrome-mv3-dev` once in `chrome://extensions`, and
open `chrome-extension://<its ID>/kit.html`: every component in its states, reloaded as you
edit. `npm run test:kit` checks it (see [Tests](#tests)).

Every page built on the kit wraps its root in Base UI's `<CSPProvider disableStyleElements>`.
Without it, Base UI adds `<style>` tags for its selects and scroll areas, which the CSP blocks;
`kit.css` has the two rules they would have added. Chrome reports a blocked tag as a console
error, which fails `npm test` on the popup and the editor and `npm run test:kit` on the kit page.

### Adding a UI component

From [shadcn/ui](https://ui.shadcn.com), whose CLI `components.json` is set up for (Base UI, style
base-lyra): `npx shadcn@4.22.1 add <name>` writes `src/shared/ui/kit/<name>.tsx`. Then:

- Change its `cn` import to `import { cn } from '../cn.ts'`, uninstall the
  `cn` package the CLI installs if it did, and read the `package.json` diff for anything else it
  added.
- Write its other imports as relative paths with extensions, like the other components.
- Swap its icons for the kit's `<Icon>` (`src/shared/ui/kit/icon.tsx`); if the CLI installed
  `lucide-react` for them, uninstall it.
- Restyle it with the kit's values, like the other components.
- Put it on the kit page (`src/pages/kit/`). `npm run test:kit` fails while a component file has
  nothing on the page.

A component from [21st.dev](https://21st.dev) or anywhere else also has to pass four checks:

1. A licence that allows using it; keep the author's credit and a link to its source in a comment.
2. No network access and no remote assets (fonts, images or scripts from a CDN).
3. No `<style>` tags added at runtime. Sonner, shadcn's usual toast, adds one, which is why the
   kit's toast is Base UI's. `npm run test:kit` catches them.
4. Restyled to the kit's values, with nothing left of its own palette, fonts or radii.

The kit's components started as shadcn/ui's (MIT licence: `src/shared/ui/kit/LICENSE-shadcn.md`).

## Build from source

This is what the sources zip on addons.mozilla.org is for. On macOS or Linux, with Node.js 24
(built with 24.9.0) and npm 11:

```sh
npm ci
npm run zip
```

The Firefox build is then in `.output/firefox-mv3`, packed as
`web-ext-artifacts/ghostfetch-<version>-firefox.zip`; `npm run zip` also builds Chrome's
(`.output/chrome-mv3`). The output isn't minified. Every file in it comes from `src/` and
`public/`, except `chunks/libraries-*.js`: the npm packages the popup and the editor use (React
and Base UI, see [Security model](#security-model)), at the versions in `package-lock.json`.
Tailwind writes the stylesheet from the class names in `src/`. Building
again from the same sources gives the same files, byte for byte; `node scripts/check-sources.mjs`
checks exactly that (add `--docker` to do it in a clean Linux container).

## Tests

`npm run check` type-checks everything with TypeScript. `npm run lint` checks the code with
[oxlint](https://oxc.rs) and fails on warnings too (`npm run lint:fix` fixes what it can),
including that every import keeps to the layers (see [Files](#files)).
`npm run format` checks that every file is formatted with oxfmt, and `npm run format:fix` formats
them.

`test/json.mjs` checks the JSON check behind the body editor's marks (`checkJson`) against
`JSON.parse`: the two must agree on what's valid, for mistakes picked by hand and for 30,000
valid bodies broken at random, and each mistake must have the message, place and marked
characters a person expects. It also checks the pieces the editor colours a long body in: on
20,000 random bodies they must make up the body and colour exactly as the whole body does. It
needs no browser, and `npm test` runs it first.

`test/matching.mjs` checks which URLs a rule's pattern matches in the page, for each way of
comparing a URL (contains, equals with a full URL or a path, wildcard, regex, a regex that doesn't
compile, and no pattern with or without a GraphQL operation), and that the rule editor's Try a URL
says the same for every case: both use one function, `urlTester`. It needs no browser either, and
`npm test` runs it next.

`test/curl.mjs` checks cURL commands both ways. Traffic's Copy as cURL: the command for a request,
and that whatever the page put in it (quotes, `$(…)`, backticks, `;`, in the URL, the body or the
method, a URL that starts with a dash) stays inside its quotes when a shell reads the command. New
rule: what it reads from a command (Chrome's Copy as cURL over several lines, `$'…'` bodies and
their `\u`, `\x` and octal escapes, `-X`, `-G`, `-I`, `--url`, options that take a value, known to
it or not), that every command Copy as cURL writes reads back as the same request, what it reads
from a URL (a bare origin keeps its host) or from "POST /path", which Accept values become the
Content-Type, and the rule it makes. `npm test` runs it after `test/matching.mjs`.

`test/e2e.mjs` loads the built extension into Chromium, runs a local API and checks the rules
against fetch and XHR (and that rules saved by older versions do what they should), the editor
(including New rule from a typed path and from a cURL command with a starter, its recent requests'
Mock, the rule's settings rows and its sentence, the body editor's marks for a JSON mistake,
its height beside the settings and under them, text size, Format and colours on a body of 370,000
characters, its own find and its vim keys), the traffic view (its filters, Keep on reload and
Clear) and popup, plus the security properties above
(channel theft, forged offers, patched built-ins, built-ins that try to reach the interceptor
through `.caller`, HTML injection, hostile rule files, sites that aren't turned on getting
nothing, `local.*` hosts and a lookalike URL, turning a site on from the Traffic view). Branded Google Chrome ignores `--load-extension`, so the test uses
Playwright's own Chromium:

```sh
npm install
npm run browsers     # once: downloads Chromium (~100 MB) into Playwright's cache
npm test             # builds, then tests; add SHOTS=/tmp/shots to save UI screenshots, HEADED=1 to watch
```

To use a different build (e.g. Chrome for Testing) set `CHROME=/path/to/binary`.

`test/firefox.mjs` runs the same backend and rules in Zen: fetch/XHR rules, rules saved by
older versions, the traffic log, the channel and `.caller` attacks,
`local.*` hosts, a site that isn't turned on, and adding and removing a site. Firefox's
automation can't open extension pages, so the editor and popup
are covered by the Chromium run (same code), and this test loads a temporary copy of the
build with two test-only hooks for setting rules; the build itself isn't changed. The
vim keys depend on the browser's editing, undo and scrolling, so this test also types them
into the body editor on a plain test page that loads the editor's TypeScript from `src/`
(Node strips the types). Both tests type the same vim session (`VIM_STEPS` in
`test/fixtures.mjs`), which gives the same bodies and cursor positions as vim 9.1 typing the
same keys.

`test/kit.mjs` opens the UI kit page under the extension pages' real CSP, in Chromium and in
Zen (served with the CSP as a response header there, since Firefox's automation can't open
extension pages). It fails on any CSP violation, uncaught error or console error, drives every
live component with the keyboard and the mouse, and checks that the kit's icons draw the same as
`src/shared/lib/icons.ts`. Two self-checks make sure it can fail: a `<style>` tag added on purpose has
to be caught, and so does Base UI's own when `CSPProvider`'s setting is off.

```sh
npm run test:firefox     # builds, then tests in Zen from /Applications; FIREFOX=/path/to/firefox for another build
npm run test:kit         # builds the kit page into .output/*-kit, then tests it in Chromium and Zen; SHOTS=dir for screenshots
npm run test:release     # zips both browsers, then checks the manifests, the release CSP, the built files and the zips
npm run lint:firefox     # Mozilla's validator: the checks addons.mozilla.org runs on upload
npm run start:zen        # a fresh Zen profile with the dev build loaded, reloaded on every save
npm run zip              # the packages and the sources zip in web-ext-artifacts/
```
