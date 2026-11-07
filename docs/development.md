# Working on Ghostfetch

How to build Ghostfetch from this repository and load it, how the code is laid out, the UI kit,
and the tests. To build the packages exactly as released, see
[Build from source](../README.md#build-from-source) in the README.

## Build and load it

You need [Node.js](https://nodejs.org) 24 or later:

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

### Zen, Firefox and other Firefox-based browsers (140 or later)

Firefox-based browsers can't load a folder the way Chrome does, and they only keep add-ons
that are signed. `npm run zip` packs the add-on into `web-ext-artifacts/`: a
`ghostfetch-<version>-firefox.zip` for uploading, an identical `.xpi` for installing, and the
`ghostfetch-<version>-sources.zip` Mozilla asks for. Then pick one:

- **Signed and permanent (recommended).** Sign in at
  [addons.mozilla.org/developers](https://addons.mozilla.org/developers/), choose **Submit a
  New Add-on**, then **On your own**: it gets signed but is never listed publicly. Upload the
  `-firefox.zip`. The code in it is built from TypeScript (bundled, not minified), so answer
  **Yes** to the source code question and upload the `-sources.zip`; its README says how to
  build it (see [Build from source](../README.md#build-from-source)). Run
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

`npm run start:zen` opens a fresh Zen profile with the dev build loaded, reloaded on every save.

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
  sidepanel/                     the editor (Chrome's side panel, Firefox's sidebar, or a tab): its sidebar, the top bar of a narrow panel, and its menus
  kit/                           the kit page; for npm run dev and the kit test, never in the extension
  styles/                        theme.css, the look's values (colours, the two fonts); themes.css, the other themes' colours; and kit.css: those as Tailwind's theme (type sizes, corners)
src/pages/                       what the screens show
  rules/                         the Rules view: the sidebar's rule list, New rule (ui/new-rule/), and the rule editor (ui/rule-editor/, a component per part)
  traffic/                       the Traffic view: a tab's live log grouped by time, a request's drawer (ui/request-detail/), Mock this response
  popup/                         the toolbar popup
  kit/                           the kit page: every kit component in its states
src/shared/                      what more than one part of the extension uses
  api/                           what's kept in chrome.storage and what the parts send each other (index.ts)
    rules/                       a rule: its fields and their names, making one, URL matching, and the screens' copy of the rules; apart from them, the server's responses their bodies' Diff compares with
    sites/                       the sites Ghostfetch runs on, the screens' copy of the ones you added, turning one on or off
    settings.ts                  the on/off and recording switches
    log-entry.ts                 a request in a tab's traffic log
    traffic-log.ts               the editor's live log of the tab it watches (Traffic, how often a rule fired, New rule's recent requests)
    preserve.ts                  Keep on reload: whether that log keeps what it has when the page reloads
    messages.ts                  the messages between the background, the bridge, the interceptor and the Traffic tab
    open-editor.ts               the editor in the side panel or a tab, and on a rule the popup picked
  lib/                           small libraries, a file each (index.ts): JSON, HTML, URLs, durations, status names, cURL
                                 commands, icons, file names, a download, the side panel, the stores' base, untrusted data, a line diff
  react/                         useStore(), which redraws a screen when a store changes, and the traffic log's hooks (index.ts)
  ui/                            components, a public file each
    kit/                         the UI kit: React components on Base UI, styled with Tailwind (see UI kit)
    code-editor/                 the body editor (plain DOM code, its find bar and vim keys) and its React component, and the body's Diff (CodeDiff) (index.ts)
    list-detail.tsx              the editor's layout: the sidebar, as wide as its edge was dragged, and what's open beside it, in a row (a flexbox: Firefox lays a grid's items out again from scratch)
    sidebar.tsx                  the sidebar's width and whether it's hidden, the edge that resizes it (and what keeps its width meanwhile), and the button (and ⌘B) that hides it
    theme.ts                     the themes, and the one in use; theme-menu.tsx, the ⋯ menus' Theme row
    master-switch.tsx            Ghostfetch on or off as a whole, in the popup
    rule-switch.tsx              a rule on or off (the pulsing green dot), in the list and the popup
    rules-file.tsx               rules files: export every rule or one, import one (its rules arrive switched off)
    cn.ts                        cn(), which joins the kit's class names
wxt.config.ts                    the manifest (permissions, content scripts, CSP, Firefox ID) and the build settings
components.json                  settings for shadcn's CLI, for adding a kit component
oxlint.config.ts                 the linter's settings (npm run lint), and the layers' rules for eslint-plugin-boundaries
.oxfmtrc.json                    the formatter's settings (npm run format): single quotes, 90 columns
public/fonts/                    Geist by Vercel and Commit Mono by Eigil Nikolajsen (SIL Open Font License, see Geist-OFL.txt and CommitMono-OFL.txt)
public/icons/                    the Thorn Glass mark, generated by scripts/make-icons.mjs
public/theme.js                  puts the theme you picked on each page before it first draws
scripts/check-sources.mjs        rebuilds the sources zip in a clean folder and compares it with the build
scripts/oxlint-rules.mjs         two lint rules of its own (npm run lint): no export *, and the folders of src/app/ are the extension's parts
test/json.mjs                    the body editor's JSON check against JSON.parse, the pieces it colours a long body in, after edits too, Format, and where it puts the cursor
test/diff.mjs                    the body's Diff without a browser: the lines kept, removed and added (the fewest), and the parts of a changed line
test/matching.mjs                which URLs a rule's pattern matches, that the rule editor's Try a URL says what the page does, and that Diff keeps responses from the same requests
test/curl.mjs                    cURL commands both ways: Copy as cURL (nothing the page sent breaks out of its quotes), New rule's reading of one
test/e2e.mjs                     end-to-end test in Chromium (Playwright)
test/firefox.mjs                 end-to-end test in Zen or Firefox (puppeteer-core)
test/kit.mjs                     the UI kit under the real CSP, in Chromium and Zen, driven with the keyboard and the mouse
test/release.mjs                 checks the built manifests, files and zips before an upload
test/fixtures.mjs                test server, hostile pages and rules shared by the tests
README.md                        what Ghostfetch does, installing it, and building it from source (it goes in the sources zip)
docs/                            guide.md, using it in full; security-model.md; this file
  media/                         the README's screenshots and recordings, and the Thorn Glass at 512 px
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
20,000 random bodies they must make up the body and colour exactly as the whole body does, and
so must the pieces after random edits to 10,000 more, cut again only where the text changed
(and most of them kept). Format (`formatJson`): it lays out 30,000 random bodies, written with
any indent, as `JSON.stringify(value, null, 2)` does; it keeps tokens picked by hand as they're
written (escapes, `1.0`, a number too long for a double, a key given twice, keys like `"10"`),
and it rejects invalid ones; and on 5,000 bodies written by hand, tokens like those and blanks
of their own, it changes nothing but the blanks, stays valid and formats again to itself. And
where Format puts the cursor (`keepOffset`): for places picked by hand (in a word, an indent,
past escapes and a `1.0`, between two characters Format parts), and on every place in 2,000
bodies written by hand, as a selection's start and as its end, it keeps the text before it and
stays ahead of the character it was ahead of on its line (an end right after a character stays
after that one), or else right after the one it was after. It needs no browser, and `npm test`
runs it first.

`test/diff.mjs` checks the line diff behind the body's Diff (`diffLines`): on 5,000 random pairs
of bodies its lines make up both texts again, in order, and the lines it keeps are alike; on 2,000
more it keeps as many as the two have in common (the longest common run of lines, worked out the
slow way), so it removes and adds no more than it has to; a change's removed lines come before its
added ones; the body the design shows comes out +6 −5; bodies too far apart to search come out
removed and added whole, and still make up both texts; and long bodies take under 300 ms. And the
parts it marks in a changed line (`diffWords`): the value changed, a comma added, nothing in lines
that share only blanks, and on 5,000 random pairs of lines, what it leaves unmarked in each is the
same text. `npm test` runs it after `test/json.mjs`.

`test/matching.mjs` checks which URLs a rule's pattern matches in the page, for each way of
comparing a URL (contains, equals with a full URL or a path, wildcard, regex, a regex that doesn't
compile, and no pattern with or without a GraphQL operation), and that the rule editor's Try a URL
says the same for every case: both use one function, `urlTester`. And that the requests the
editor keeps a rule's server's response from, for its Diff (`entryTester`), are the ones the page
would answer with the rule, for every case crossed with methods and the ways a request names a
GraphQL operation. It needs no browser either, and `npm test` runs it after `test/diff.mjs`.

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
its height beside the settings and under them, text size and that it keeps the cursor's line in
place, Format on a body written as PHP writes JSON (its escaped slashes and `.0` prices kept,
the cursor on its character and its line in place, a selection kept, with the cursor out of
view the middle of the view kept; with vim keys, the cursor and a Visual selection too), undo
and redo right after Format (back to the cursor and scroll before it and after it, with ⌘Z
and with vim's `u` and Ctrl+R) and after a Format too long to undo (⌘Z and vim's `u`, in the
body and from the rule's name, undoing the changes made since, even ones that put the body back
as it was, and stopping at the formatted body, which is what's saved), the
cursor marked while the body isn't focused, a rule's body where it was when you come back to it
(beside the settings, in a side panel with its pane, and after a change made in another view),
Format and colours on a body of 370,000 characters, its own find and its vim keys, whose yanks
it pastes back from the clipboard; and Diff: Mock this response keeping the server's response
apart from the rule and out of an exported file, side by side, inline and inline in a narrow
panel with the counts and rows the diff makes, a key that would type saying it can't, a click on
a line, a removed line and Enter going to edit there, a rule that's off getting the server's
response from the page, a copy keeping it, one pasted in, none with Keep server's body, and a body
of 390,000 characters drawn only where it shows, the last lines once scrolled there), the
traffic view (its filters, Keep on reload and Clear), the sidebar beside a rule and beside
Traffic (hidden with the button and the key, its edge dragged to its narrowest, its widest, shut
and open again, its keys, its one width after a reload, none in a narrow panel, its rules in
their order with one turned off kept in its place and counted, "/" to its search field,
Duplicate, a rule picked in it from Traffic, and what keeps
a drag beside a long body smooth: the body's text area holding its width until the edge is let
go, a width only the list itself has, and coloured text laid out the same at any width; and what
keeps typing in one quick: only the piece typed into redrawn, a new line only adding its number,
the editor's sizes its own, the boxes around it changing only in size between its two layouts,
and vim's cursor on a layer of one line), a theme picked
in the `⋯` menu (the editor and the open popup
recoloured, and set before a page draws), every theme's selection colour see-through (the body
editor's selection lies over its text), and popup, plus the properties of the
[security model](security-model.md) (channel theft, forged offers, patched built-ins, built-ins
that try to reach the interceptor through `.caller`, HTML injection, hostile rule files, sites
that aren't turned on getting nothing, `local.*` hosts and a lookalike URL, turning a site on
from the Traffic view). Branded Google Chrome ignores `--load-extension`, so the test uses
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
same keys. There it also sizes the text with Ctrl+= and Ctrl+−, and checks that vim's cursor
stays where it is in the view, as Firefox scrolls a text area its own way, as it does through
Format, that a new editor goes back to another's place, that `u` and Ctrl+R right after Format
go back to the cursor before it and after it, that Visual mode carries on through Format, that
`u` after a Format too long to undo undoes the changes made since (`x`, then `P`, which puts
the body back as it was) and stops at the formatted body, and that a yank reaches the
clipboard, which Firefox only lets a page write during a key press or a click.
Both tests paste from the clipboard of the headless browser, which is its own, so running them
leaves yours alone (with `HEADED=1` they use the real one).

`test/kit.mjs` opens the UI kit page under the extension pages' real CSP, in Chromium and in
Zen (served with the CSP as a response header there, since Firefox's automation can't open
extension pages). It fails on any CSP violation, uncaught error or console error, drives every
live component with the keyboard and the mouse (the menu's Theme row too, which recolours the
kit page: open it to see every component in every theme), and checks that the kit's icons draw the same as
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
