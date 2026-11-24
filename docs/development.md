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

The code in `src/` is cut by bounded context
([ADR 0002](adr/0002-the-code-is-cut-by-bounded-context.md)). `bounded-contexts` holds the
contexts, a folder each: Rules (`rules`) and Interception (`interception`), the core; Traffic
(`traffic`), Sites (`sites`) and Agent access (`agent-access`), which support them; and the Body
editor (`body-editor`), which is generic. Their words are in [`docs/glossary/`](glossary/), and
how they relate in the [Glossary Map](../GLOSSARY-MAP.md). `shared-kernel` is the shared kernel:
the part of the model that Rules and Interception share, and change only together, so that the
editor can't say what the page wouldn't do. `app` is the composition root, a folder for each part
of the extension that WXT builds, which puts the rest together; the popup's own screens are in it
too, as the popup has no model of its own. And three folders know no
domain, nothing of rules, sites or requests: `lib` (small libraries of Ghostfetch's own),
`platform` (what differs between the browsers, and opening the editor) and `ui` (the UI kit, the
themes and the editor's layout).

A context has the layers it needs, Domain-Driven Design's: `domain` says what its model is, in
plain TypeScript (no `chrome`, no `window`, no timers, no React); `infrastructure` talks to the
browser (storage, messages, ports, tabs); `application` joins the two for a use, and has the
stores the screens read; and `ui` has its React components and hooks, and the words its screens
show. A file that does more than one of these is in the layer of its main job. Rules, Traffic and Agent access have
layers; Sites and Interception are flat; and the Body editor has its plain DOM engine (`engine`,
`vim`) beside its React components. Inside a context, a file may import any of its context's
files, inward: `ui` the rest of the context, the rest its `domain`, and `domain` only itself.

From outside, a folder is entered only through its doors. Rules and Traffic have two:
`index.ts`, with no React, which the background and the page scripts may import too, and
`ui/index.ts`, their screens. Sites, Interception and the Body editor have `index.ts`, and Agent
access `ui/index.ts`. A context's `contract.ts` has the types of what crosses to another part of
the extension as a message, and its `index.ts` offers them. Rules' `ui` also has a public file for
each widget other screens show (`rule-switch.tsx`, `group-switch.tsx`, `group-folds.ts`,
`group-picker.tsx`, `new-rule-group.ts`, `rules-file.tsx`), so the popup, which shows a rule's and
a group's switch, doesn't load the Rules view with them. Rules' own screens take New rule's draft
and the few other things only they use by path: `bounded-contexts/rules/index.ts` doesn't offer
them, as offering the draft would bring it into the popup (its opening comment says why). `lib`,
`platform` and the shared kernel have one door, `index.ts`; `ui` has a public file per component or
hook, so a screen that shows a button doesn't load the rest of the kit with it.

Who may import what is one table, in `oxlint.config.ts`, which `npm run lint` checks with
eslint-plugin-boundaries. By what is imported, with "every part" for every folder of `app` but
`styles`, and "the pages" for `popup`, `sidepanel` and `kit`:

| Folder | Its doors | Who may import it |
| --- | --- | --- |
| `lib` | `index.ts` | every folder (the body editor's engine, any of its `.ts` files) |
| `platform` | `index.ts` | `ui`, Sites, Rules and Traffic but for their `domain`, and the pages |
| `ui` | every file | the `ui` of Rules, Traffic and Agent access, the body editor, and the pages |
| `bounded-contexts/body-editor` | `index.ts` | the `ui` of Rules and Traffic, and the pages |
| `shared-kernel` | `index.ts` | Rules, Interception, Agent access but for its `domain`, and every part |
| `bounded-contexts/sites` | `index.ts` | Traffic and Agent access but for their `domain`, and every part |
| `bounded-contexts/interception` | `index.ts` | the interceptor (`app/interceptor`) alone |
| `bounded-contexts/traffic` | `index.ts` | Rules and Agent access but for their `domain`, every part, and Interception its types |
| | `ui/index.ts` | Rules' `ui`, and the pages |
| `bounded-contexts/rules` | `index.ts` | Traffic's `ui`, Agent access but for its `domain`, every part, and Interception its types |
| | `ui/index.ts` and the widgets' files | Traffic's `ui`, and the pages |
| `bounded-contexts/agent-access` | `ui/index.ts` | the editor (`app/sidepanel`) alone |
| `app/<part>` | none | none: a part imports no other part's files |
| `app/styles` | every file | the pages, whose stylesheets it holds |

The table keeps a few rules. The contexts import each other only along the Glossary Map's
arrows: Rules and Traffic import each other, though only Traffic's `ui` imports Rules (an entry
keeps a rule's name, not the rule); Traffic imports Sites; Interception only the shared kernel
and Rules' and Traffic's types; Agent access Rules, Traffic and Sites; and Sites and the Body
editor no context. A `domain` imports only its own files, the shared kernel and `lib` (Traffic's
and Agent access's only `lib`). React, `ui` and npm packages are only for a `ui` layer (`ui`
itself, or a context's `ui`), the body editor, whose door offers React components, and the pages;
the rest is plain TypeScript. The background and the page scripts import only Rules, Traffic,
Sites, the shared kernel and `lib`, by their doors, and WXT's helpers, and the interceptor
Interception too, which keeps them free of the screens' libraries. The body editor's engine,
which the Zen test serves straight from `src/`, imports only `.ts` files: its own and `lib`'s.

The Glossary Map names each relationship between the contexts by its context-map pattern. Where
each one's translation is in the code, under `src/` but for the agent's server:

| Relationship | Pattern | Where it's done |
| --- | --- | --- |
| Rules → Interception | a shared kernel, and Interception conformist | `shared-kernel`, which both call; `bounded-contexts/rules/application/page-state.ts`, which gives the page each rule rebuilt |
| Interception → Traffic | Traffic's anticorruption layer | `clean()` in `bounded-contexts/traffic/infrastructure/tab-log.ts` |
| Traffic → Rules | customer and supplier | `rule-from-entry.ts`, `server-responses.ts` and `recent-requests.ts`, in `bounded-contexts/rules/application` |
| Rules → Traffic | reference by identity | an entry's `ruleId`, `ruleName` and `groupName` (`bounded-contexts/traffic/domain/log-entry.ts`) |
| Sites → Traffic | Traffic conformist | Sites' door, `bounded-contexts/sites/index.ts`, which Traffic's screens use |
| What's stored, rules files and hand edits → Rules | Rules' anticorruption layer | `normalizeRule` and `normalizeRules` (`bounded-contexts/rules/domain/rule.ts`) and `normalizeGroups` (`group.ts`), wherever rules are read: `order-storage.ts`, `rules-file.ts`, `page-state.ts`, the agent's tools and `app/background/stored-state.ts` |
| What's stored → Sites | Sites' anticorruption layer | `normalizeSites` (`bounded-contexts/sites/site.ts`), wherever the sites you added are read: Sites' `store.ts` and `app/background/stored-state.ts` |
| Agent access → a coding agent | an open host service, the tools its published language | `mcp/ghostfetch-mcp.mjs`, and `bounded-contexts/agent-access/application/agent-tools.ts` and `rule-report.ts` |
| Agent access → Rules, Traffic, Sites | conformist | their doors |
| Rules and Traffic → Body editor | generic, used as a library | its door, `bounded-contexts/body-editor/index.ts`; the JSON check and Format they use with it are `lib`'s (`checkJson`, `formatJson`) |
| Between the extension's parts | each context's published language | each context's `contract.ts` |
| Older versions' settings → the editor | an anticorruption layer of the editor's own | `app/sidepanel/legacy-settings.ts` |
| The browsers → the rest | an adapter, not a context | `platform` |

In the popup's folder, `app/popup`, the files are grouped by what they're for: `ui/` holds its
components, `model/` its state and what changes it, and `lib/` plain functions. The popup
composes components of its own, one per part of the screen, so each file is about one thing.
Beside `index.html`, `main.tsx` draws `ui/popup-page.tsx`: a part has one index file, the one WXT
builds (beside an `index.html` it leaves an `index.ts` out), and `npm run lint` says so.

```
src/app/                         the composition root: the extension's parts, one folder each, which WXT builds (wxt.config.ts)
  background/                    service worker (Chrome) or event page (Firefox): content scripts for added sites, badge
  interceptor/                   page world: the entry WXT builds, which decides whether to run on the page and starts Interception (src/bounded-contexts/interception/)
  bridge/                        isolated world: reads storage and passes in what Rules makes of it (src/bounded-contexts/rules/application/page-state.ts), and starts the tab's traffic log (src/bounded-contexts/traffic/infrastructure/tab-log.ts), which it gives what the page reports
  popup/                         the toolbar popup: its header, the tab's site, and its tabs, This page, All rules and Sites (ui/); what each rule did on the tab's page, asked every 2 s (model/); what it says a rule matches (lib/)
  sidepanel/                     the editor (Chrome's side panel, Firefox's sidebar, or a tab): its sidebar, the top bar of a narrow panel, and its menus
  kit/                           the kit page, every kit component in its states (ui/); for npm run dev and the kit test, never in the extension
  styles/                        theme.css, the look's values (colours, the two fonts), and the grey levels and lines made from each theme's bases, lifted by Appearance's Contrast; themes.css, the other themes' colours; and kit.css: those as Tailwind's theme (type sizes, corners), with Appearance's Font and Text size
src/bounded-contexts/            the six bounded contexts of GLOSSARY-MAP.md, a folder each
  rules/                         Rules, what Ghostfetch should answer and which rule wins (index.ts, with no React, and ui/index.ts); its words are in glossary/rules.md
    domain/                      a rule: its fields (built from the shared kernel's parts, types.ts) and the words the screens show for them (catalog.ts), making one (rule.ts), whether it's answering (answering.ts), what's wrong with it (problems.ts); groups (group.ts); the order and every operation on it, which keeps two groups from sharing a name (order.ts), and what a search shows of it (filter-rules.ts)
    application/                 the screens' copy of the order, which saves and redraws after each operation (store.ts), and of whether Ghostfetch is paused, which only the popup changes (paused.ts); a copy of a group or a rule (duplicate-group.ts, duplicate-rule.ts); a rule made from a request in the log (rule-from-entry.ts), the requests New rule offers to mock (recent-requests.ts), and New rule's draft, what's typed there read and the rule made from it (rule-draft.ts); rules files, writing one and reading one into the order, its rules and groups turned off (rules-file.ts); apart from the rules, the server's responses their bodies' Diff compares with (server-responses.ts); and what the page is given of what's stored, which the bridge posts (page-state.ts)
    infrastructure/              how the order is kept, as the rules, each naming its group, and the groups, each with its place (order-storage.ts); the toolbar badge, which the background keeps in sync (badge.ts); and the clipboard a rule's body editor's vim keys paste from, with the permission that takes (clipboard.ts)
    contract.ts                  what the bridge sends the interceptor: the rules that answer, with the two switches
    ui/                          the Rules view (index.ts, for the editor): the sidebar's rule list, New rule (new-rule/) and the rule editor (rule-editor/, a component per part); and the widgets other screens show, a public file each
      rule-switch.tsx            a rule's switch, the green dot (the kit's SignalSwitch), in the editor's rule list and the popup; group-switch.tsx, a group's
      group-folds.ts             which groups are folded, in the editor's list and the popup alike
      group-picker.tsx           the group a new rule goes into, where New rule and Mock this response make one; new-rule-group.ts, the one it starts on
      rules-file.tsx             rules files on screen: Export (every rule, a group or one rule), the file picker behind Import rules…, and the toasts that say how an import went
  sites/                         Sites, where Ghostfetch runs (index.ts); its words are in glossary/sites.md
    site.ts                      the sites Ghostfetch runs on: the built-in hosts and the ones you added, which hosts a site covers, and whether Ghostfetch runs on a URL
    store.ts                     the screens' copy of the sites you added, and turning Ghostfetch on or off for one
    content-scripts.ts           registering the content scripts for the sites you added, which the background calls
    contract.ts                  the message that asks the background to register them again
  traffic/                       Traffic, what the page asked for and what each rule did (index.ts, with no React, and ui/index.ts); its words are in glossary/traffic.md
    domain/                      a request in a tab's traffic log (log-entry.ts); which of them the Traffic view lists (filter-entries.ts), in groups by how long ago they were made (time-groups.ts)
    application/                 the editor's live log of the tab it watches (traffic-log.ts: Traffic, how often a rule fired, New rule's recent requests); Keep on reload, whether that log keeps what it has when the page reloads (preserve.ts); the screens' copy of Recording, whether requests are added to the logs at all, which only the popup changes (recording.ts); what each rule did on a tab's page, as the page counts it for the popup's This page, and in words, as the popup and the editor's rule list say it (page-counts.ts)
    infrastructure/              the tab's own log, which the bridge starts in each page (tab-log.ts): it rebuilds what the page reports and keeps it, an iframe's by way of the top frame, counts it for the popup, and gives it to the Traffic view over a port
    contract.ts                  the messages Traffic's parts send each other: the interceptor's report of a request, an iframe's entry, the popup's question and the counts that answer it, and what goes over the log's port
    ui/                          the Traffic view: a tab's live log grouped by time, a request's drawer (request-detail/), Mock this response; and the hooks that run the editor's live log and read it (use-traffic-log.ts)
  interception/                  Interception, what runs in the page's own world (index.ts, for the interceptor alone); its words are in glossary/interception.md
    page-channel.ts              the private channel to the bridge, which offers its port once, before any page script runs: the rules arrive over it, and the page's requests go back over it
    fetch.ts                     window.fetch, wrapped; xhr.ts, XMLHttpRequest, wrapped; simulate-xhr.ts, an XMLHttpRequest a rule answers, its state and events played back in the order a real one fires them
    matching.ts                  which rule a request gets, the first that matches it; apply-rule.ts, what it gets: the rule's own body, or the server's under the rule's status, headers and delay
    log-entries.ts               the page's requests as entries for the tab's traffic log; request.ts, a request as the page made it, read for the rules and the log; types.ts, what the parts pass each other
  agent-access/                  Agent access, a coding agent working with the rules through the editor (ui/index.ts, for the editor alone); its words are in glossary/agent-access.md, how it works in agent-access.md
    domain/                      the pairing code ghostfetch-mcp gives (pairing-code.ts); a dev host, whose pages' requests the agent may see (dev-host.ts)
    application/                 what each of the agent's tools does, with the editor's own code (agent-tools.ts), and what they say of a rule (rule-report.ts)
    infrastructure/              the connection to ghostfetch-mcp: pairing, Firefox's consent, trying again while it isn't there, one setting for every editor (agent-connection.ts)
    ui/                          the Agent button and its panel, and the hook that runs Agent access while the editor is open, giving the tools the kit's toast (use-agent-access.ts)
  body-editor/                   the Body editor, editing, checking and comparing a body of text (index.ts); its words are in glossary/body-editor.md
    code-editor.tsx              the body editor as a React component, and CodeView, the same colours for a body that's only read; code-diff.tsx, the body's Diff against the server's response (CodeDiff)
    engine/                      the editor itself, plain DOM code: a textarea over the coloured text (code-editor.ts, highlight.ts), its find bar (find-bar.ts), and where Format leaves the cursor (keep-offset.ts)
    vim/                         its vim keys (vim.ts): the keys read as commands, motions, words and text objects
src/shared-kernel/               the shared kernel: the part of the model that Rules and Interception share, and change only together, so that the editor can't say what the page wouldn't do (index.ts)
  rule-parts.ts                  what a rule's match and its answer are made of: the methods, the ways of comparing a URL, the body modes, a header row, and the two halves themselves
  url-match.ts                   how a rule's URL pattern matches, which Try a URL asks too; request-match.ts, which requests a rule matches, which the Diff keeps the server's responses by and the agent's try_url tries
  header-check.ts                whether the page gets a rule's header row, as the browser decides it, which the rule editor marks its rows by
src/platform/                    what differs between the browsers, and opening the editor (index.ts)
  side-panel.ts                  Chrome's side panel or Firefox's sidebar, whichever the browser has; firefox.d.ts, what @types/chrome doesn't describe of Firefox
  open-editor.ts                 the editor in the side panel or a tab, and on a rule the popup picked
src/ui/                          the components that know nothing of rules, sites or requests, a public file each
  kit/                           the UI kit: React components on Base UI, styled with Tailwind (see UI kit)
    tooltip.tsx                  the tooltip a control explains itself with, rather than a title: its words, its key, or why it's off; and the provider each page has one of
    kbd.tsx                      a key's badge, and the one place that writes a key for this platform (⌘B on a Mac, Ctrl+B elsewhere), says it in words for a screen reader, and reads it from a key event
  list-detail.tsx                the editor's layout: the sidebar, as wide as its edge was dragged, and what's open beside it, in a row (a flexbox: Firefox lays a grid's items out again from scratch)
  sidebar.tsx                    the sidebar's width and whether it's hidden, the edge that resizes it (and what keeps its width meanwhile), and the button (and ⌘B) that hides it
  theme.ts                       the themes and Appearance's three settings (contrast, font, text size), and the ones in use; theme-menu.tsx, the ⋯ menus' Theme and Appearance rows
  use-store.ts                   useStore(), which redraws a screen when a store changes
  cn.ts                          cn(), which joins the kit's class names
src/lib/                         small libraries, a file each (index.ts): JSON, HTML, URLs, durations, status names, cURL
                                 commands, icons, file names, a download, the stores' base, untrusted data, a line diff,
                                 the shape of the clipboard the body editor's vim keys read, and a random id that a page
                                 which isn't a secure context can make too (random-id.ts)
wxt.config.ts                    the manifest (permissions, content scripts, CSP, Firefox ID) and the build settings
components.json                  settings for shadcn's CLI, for adding a kit component
oxlint.config.ts                 the linter's settings (npm run lint), and the table of which folders of src/ may import which, for eslint-plugin-boundaries
.oxfmtrc.json                    the formatter's settings (npm run format): single quotes, 90 columns
public/fonts/                    Geist by Vercel and Commit Mono by Eigil Nikolajsen (SIL Open Font License, see Geist-OFL.txt and CommitMono-OFL.txt)
public/icons/                    the Thorn Glass mark, generated by scripts/make-icons.mjs
public/theme.js                  puts the theme and the Appearance you picked on each page before it first draws, and follows a change made in another page
scripts/check-sources.mjs        rebuilds the sources zip in a clean folder and compares it with the build
scripts/oxlint-rules.mjs         two lint rules of its own (npm run lint): no export *, and the folders of src/app/ are the extension's parts, with one index file each
mcp/                             ghostfetch-mcp, the MCP server a coding agent runs for Agent access, with packages of its own (npm install --prefix mcp)
test/json.mjs                    the body editor's JSON check against JSON.parse, the pieces it colours a long body in, after edits too, Format, and where it puts the cursor
test/diff.mjs                    the body's Diff without a browser: the lines kept, removed and added (the fewest), and the parts of a changed line
test/matching.mjs                which URLs a rule's pattern matches, that the rule editor's Try a URL says what the page does, and that Diff keeps responses from the same requests
test/order.mjs                   the order without a browser: every operation on it (rules and groups put, moved, deleted and put back, a group renamed), and that no two groups come to share a name
test/curl.mjs                    cURL commands both ways: Copy as cURL (nothing the page sent breaks out of its quotes), New rule's reading of one
test/e2e.mjs                     end-to-end test in Chromium (Playwright)
test/firefox.mjs                 end-to-end test in Zen or Firefox (puppeteer-core)
test/agent.mjs                   Agent access end to end in Chromium: which hosts are dev hosts, then ghostfetch-mcp started as an agent starts it, and the editor paired with it
test/kit.mjs                     the UI kit under the real CSP, in Chromium and Zen, driven with the keyboard and the mouse
test/release.mjs                 checks the built manifests, files and zips before an upload
test/fixtures.mjs                test server, hostile pages and rules shared by the tests
README.md                        what Ghostfetch does, installing it, and building it from source (it goes in the sources zip)
GLOSSARY-MAP.md                  the bounded contexts Ghostfetch's words belong to, and how they relate
docs/                            guide.md, using it in full; security-model.md; agent-access.md; this file
  glossary/                      the words of each context, and the ones it doesn't use: rules.md (rule, group, order, on, answering, paused), interception.md, traffic.md, sites.md, agent-access.md, body-editor.md
  adr/                           decisions worth knowing the reasons for, one file each (0001: the order decides which rule answers; 0002: the code is cut by bounded context, not by layer; 0003: the switches keep the name enabled where they're stored and published)
  media/                         the README's screenshots and recordings, and the Thorn Glass at 512 px
.output/                         what the build makes: chrome-mv3/, firefox-mv3/ (*-kit/: the kit test's builds)
web-ext-artifacts/               what npm run zip makes: the packages for each browser, the .xpi and the sources zip
```

## UI kit

`src/ui/kit/` is the UI kit the popup and the editor are built from: React components on
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

A control says what it does with the kit's `<Tooltip>` (`tooltip.tsx`), not a `title`: it
follows the theme, opens once the pointer rests on the control (350 ms; the next one at once) or
as soon as Tab brings focus to it, never on a click, closes on a click or a scroll, and stays
inside the window, the popup's 330 px too. Give it the key that does the same (`keys`, written
with `modKey()` from `kbd.tsx`, so ⌘B on a Mac and Ctrl+B elsewhere), or why a control is off
(`reason`, which puts the tooltip on a wrapper around it, as a control that's off takes no
pointer). A screen reader hears its words as the control's description, as it heard a `title`:
the tooltip keeps a hidden copy of them in the page, the key in words ("Command B"), and adds it
to the control's `aria-describedby`, after any description the control has of its own; not where
its words are the control's name already. A description isn't a name, so a control that's only
an icon keeps its `aria-label`. A control that opens a menu of its own (`aria-haspopup`) shows
no tooltip while the menu is open, nor as it closes and gives the control focus back, until the
pointer or focus leaves the control and comes back. The popup, the editor and the kit page each
wrap their root in one `<TooltipProvider>`. A `title` is left only where it shows the whole of a
text cut short (a long rule name, a request's URL), and on the body editor's find bar, which is
plain DOM.

### Adding a UI component

From [shadcn/ui](https://ui.shadcn.com), whose CLI `components.json` is set up for (Base UI, style
base-lyra): `npx shadcn@4.22.1 add <name>` writes `src/ui/kit/<name>.tsx`. Then:

- Change its `cn` import to `import { cn } from '../cn.ts'`, uninstall the
  `cn` package the CLI installs if it did, and read the `package.json` diff for anything else it
  added.
- Write its other imports as relative paths with extensions, like the other components.
- Swap its icons for the kit's `<Icon>` (`src/ui/kit/icon.tsx`); if the CLI installed
  `lucide-react` for them, uninstall it.
- Restyle it with the kit's values, like the other components.
- Give its controls a `<Tooltip>` rather than a `title`, and an icon-only one an `aria-label`
  (see above).
- Put it on the kit page (`src/app/kit/ui/`). `npm run test:kit` fails while a component file has
  nothing on the page.

A component from [21st.dev](https://21st.dev) or anywhere else also has to pass four checks:

1. A licence that allows using it; keep the author's credit and a link to its source in a comment.
2. No network access and no remote assets (fonts, images or scripts from a CDN).
3. No `<style>` tags added at runtime. Sonner, shadcn's usual toast, adds one, which is why the
   kit's toast is Base UI's. `npm run test:kit` catches them.
4. Restyled to the kit's values, with nothing left of its own palette, fonts or radii.

The kit's components started as shadcn/ui's (MIT licence: `src/ui/kit/LICENSE-shadcn.md`).

## Tests

`npm run check` type-checks everything with TypeScript. `npm run lint` checks the code with
[oxlint](https://oxc.rs) and fails on warnings too (`npm run lint:fix` fixes what it can),
including that every import keeps to the table of which folders may import which (see
[Files](#files)), and that each folder of `src/app/` is one of the extension's parts, with one
index file.
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
GraphQL operation, one whose `operationName` isn't text among them: both ask one function here
too, `requestTester`. Then the order: of two rules that match, the first answers; the order the
editor and the page rebuild from what's stored (`layOut`), each group in its place with its rules
in theirs, the ungrouped rules filling the rest, a rule whose group isn't there ungrouped; stored
groups rebuilt (`normalizeGroups`: an id and a name no other has, on unless they say they're off);
and the names a new group, a copy and an import get. Then when a rule is answering
(`isAnswering`: it's on, its group is on and Ghostfetch isn't paused; `wouldAnswer` needs only
the first two), and what's wrong with one (`regexError`, and `bodyProblem`, which looks only at a
JSON body of the rule's own). Last, what the page is given of what's stored (`pageState`, which
the bridge posts): the rules that are on, in no group or a group that's on, in the order, each
rebuilt as the editor reads it (`normalizeRule`, keeping its id) and in a group with the group's
name, none of a type 0.9.0 took out and nothing that isn't a rule, and the two switches as they
were stored. So that the editor's next save, which writes the rules rebuilt, never changes what
the page does: for every odd shape an older version or a hand can leave a rule in (each field
missing in turn or of the wrong type, a method in small letters, a body mode that isn't one, a
status written `" 404"` or out of range, a delay past the longest a rule keeps, header rows that
aren't, an id that isn't one, a type from before 0.9.0, an entry that isn't a rule), the page
answers a set of requests, through `pageState` and the interceptor's own functions, as it does
once the editor has rewritten the rule: the same rule or none, the same status, headers, body and
delay, and the same name in the log. And a rule whose name isn't text, or whose headers aren't a
list or name a row by a number, answers instead of failing the request. And without
`crypto.randomUUID`, as in a content script on a page served over plain http from a host that
isn't localhost, the page still gets its rules rebuilt and in their groups, a valid id kept and
one that isn't given a version 4 UUID (`randomId`). It needs no browser either, and `npm test`
runs it after `test/diff.mjs`.

`test/order.mjs` checks the order's own operations (`src/bounded-contexts/rules/domain/order.ts`),
each on an order of ungrouped rules and groups: what's kept of an order (its rules from the top,
each naming its group, and its groups, each with its place) and the order laid out from that again;
where a rule is, and the place for one to be tried nth, never inside a group it isn't going into;
rules put, taken out and moved, down their own list, into a group, out of one and between two, to a
place as a drag gives it (before what's there now) and as the agent does (to be tried nth); groups
added, deleted and put back, moved both ways, turned off, which leaves their rules' own switches as
they were, and taken away; and the order's own rule, that no two groups share a name: a rename to a
name another group has, in any case, or to one with nothing in it is refused and says which
(`renameGroup`), and a group that comes in under a taken name, added, put back or imported, gets the
next free one in brackets. Last, that a rule and a group stay the objects they were through all of
it, which is what the screens tell them by. It needs no browser, and `npm test` runs it after
`test/matching.mjs`.

`test/curl.mjs` checks cURL commands both ways. Traffic's Copy as cURL: the command for a request,
and that whatever the page put in it (quotes, `$(…)`, backticks, `;`, in the URL, the body or the
method, a URL that starts with a dash) stays inside its quotes when a shell reads the command. New
rule: what it reads from a command (Chrome's Copy as cURL over several lines, `$'…'` bodies and
their `\u`, `\x` and octal escapes, one past U+10FFFF as U+FFFD, `-X`, `-G`, `-I`, `--url`,
options that take a value, known to it or not), that every command Copy as cURL writes reads back as the same request, what it reads
from a URL (a bare origin keeps its host) or from "POST /path", which Accept values become the
Content-Type, and the rule it makes. `npm test` runs it after `test/order.mjs`.

`test/e2e.mjs` loads the built extension into Chromium, runs a local API and checks the rules
against fetch and XHR (that rules saved by older versions do what they should; that a rule stored
by hand whose name is a number, and one whose headers are an object, answer fetch and XHR as the
editor shows them, each answer counted under the rule; and that a rule keeping the server's body
passes it on as it is: bytes that aren't text, a response as it arrives, a no-cors request's
opaque response, and over XHR the charset the response names; that
an answer a rule holds back past the page's `xhr.timeout` times out; and that a fetch the page
aborts before a rule answers it is rejected, and listed as aborted under the rule's name, its row
saying so, rather than as the rule's error or one of the times it fired; that `open()` with a
third argument that isn't true stays synchronous, and so left alone; that an XMLHttpRequest
aborted, or opened again, before the rules have arrived ends as it does without Ghostfetch; and
that a rule answers HEAD with no body), the editor
(including New rule from a typed path and from a cURL command with a starter, its recent requests'
Mock, the rule's settings rows (a delay no longer than a rule keeps, and the header rows the page
won't get marked as skipped, which are the ones Chrome refuses, on 182 names and values) and its
sentence, the body editor's marks for a JSON mistake,
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
it pastes back from the clipboard, and whose `p` pastes the clipboard once the browser allows it
(the browser's answer stood in for), puts the yank when it doesn't, or when the browser gives it
nothing (but for the once right after the dialog, when it says to press `p` again), and asks
again with `:set clipboard=unnamedplus`; Wrap (the textarea, the colours and the line numbers
wrapping alike at two widths and a bigger text size, with prose, a token, emoji, CJK and tabs,
nothing to scroll sideways, a mistake's mark and vim's block on their characters, an edit
changing only its own line's row, a row of many tokens that only just fits breaking where the
textarea breaks it, at a width made a tenth of a pixel past a whole number of characters, and
off again); and Diff:
Mock this response keeping the server's response
apart from the rule and out of an exported file, side by side, inline and inline in a narrow
panel with the counts and rows the diff makes, a key that would type saying it can't, a click on
a line, a removed line and Enter going to edit there, a rule that's off getting the server's
response from the page, a copy keeping it, no Diff switch with Keep server's body or before a
rule has a response, a body
of 390,000 characters drawn only where it shows, the last lines once scrolled there, a body with
Windows line ends compared and clicked as the editor has it, a click on Edit here going to the
character under it, the same lines on screen after a change of layout, and none kept from Mock
this response on a request a rule answered), the
traffic view (its filters, Keep on reload, which stops at 500 requests however a page that asks
for a lot as it starts reloads, Clear, a request's Sent time, when it was sent and not when its
response ended, an iframe's requests, which the background passes on to its tab's log (one a
rule answers and one no rule does, made in an iframe on another host Ghostfetch runs on, both
listed for the tab, and the one answered in the popup's counts for the tab), and the page it
watches: the one used last
once its own closes or leaves the web, and, opened as the side panel has it, its tab's page from
the moment that opens one, with a page picked by hand kept), the sidebar beside a rule and beside
Traffic (hidden with the button and the key, its edge dragged to its narrowest, its widest, shut
and open again, its keys, its one width after a reload, none in a narrow panel, its rules in
their order with one turned off kept in its place and counted, "/" to its search field,
Duplicate, a rule picked in it from Traffic, and what keeps
a drag beside a long body smooth: the body's text area holding its width until the edge is let
go, a width only the list itself has, and coloured text laid out the same at any width; and what
keeps typing in one quick: only the piece typed into redrawn, a new line only adding its number,
the editor's sizes its own, the boxes around it changing only in size between its two layouts,
and vim's cursor on a layer of one line), a rule's dot in the list (it turns the rule off and on,
saved, without opening it; one that's off is greyed and its chip says Off; Traffic only says
whether it's recording), a row's tooltip only for a name or URL it cuts short, a theme picked
in the `⋯` menu (the editor and the open popup
recoloured, and set before a page draws), the `⋯` menu's Appearance (its contrast, font and text
size on the editor and the open popup at once, on a page opened afterwards before any of its
modules runs, and nothing left on `<html>` or stored once the defaults are picked again), every
theme's selection colour see-through (the body
editor's selection lies over its text), the toolbar badge (green with the count, grey with
"off"), and the popup (each rule's dot, pulsing while it's on, which turns it off and on, saved
at once, a long name cut short after it, This page keeping a rule where it is when its dot
turns it off, so the same spot turns it back on, a rule picked in it opening in the editor,
the sites you added with Remove, its Pause, Resume and Recording clicked as a user does (paused:
Resume offered, the badge's grey "off", the editor's bar saying Ghostfetch is off, an answering
rule's chip saying it's paused and its dots still, the page getting the server's response, and
`enabled` stored false; resumed: all of that as it was, and the rule answering again; not
recording: the popup and Traffic saying so, a request made meanwhile not listed, though its rule
answers it, the rule's row saying nothing of what it did, and `record` stored false; recording
again: the next request listed; and a popup and an editor opened while Ghostfetch is paused, or
while it isn't recording, showing it in the first thing they draw, as a popup opened while it's on
and recording shows that, then following that popup's Resume and Recording), and
what each rule did on a page, which the page counts by rule and by what the rule did, telling
the popup nothing of the requests themselves), groups (a group's rules answering only while it's
on, the higher of two groups' rules answering, the page following the order the editor shows,
the badge counting only the rules that answer; the sidebar's block, its rules set in and
faded with their dots still while it's off, the open rule's chip and path saying so, a fold
kept, a search finding a group by its rules or its name; New group with its name ready to type
and a name that's taken turned down, Move to group, a group's + and New rule's picker on its
group after; Duplicate, Delete and its Undo, Ungroup; a rule dragged into a group and out of
one, and a group dragged, with nothing of the drag left once it's dropped; while a rule is
dragged, a mark only where it would land, a line in a group set in under its rules' dots and one
out of any as wide as the list, none over the list's label or out of it, and under the list's
last entry its end; the popup's All rules with a group's dot and fold, This page naming a
rule's group; and Export group with its import, off and at the top, renamed where its name is
taken), plus the properties of the
[security model](security-model.md) (channel theft, forged offers, patched built-ins, built-ins
that try to reach the interceptor through `.caller`, HTML injection, hostile rule files, sites
that aren't turned on getting nothing, `local.*` hosts and a lookalike URL, turning a site on
from the Traffic view, one with an underscore in its name too, and the sites an IPv6 address or
such a name can be). Branded Google Chrome ignores `--load-extension`, so the test uses
Playwright's own Chromium:

```sh
npm install
npm run browsers     # once: downloads Chromium (~100 MB) into Playwright's cache
npm test             # builds, then tests; add SHOTS=/tmp/shots to save UI screenshots, HEADED=1 to watch
```

To use a different build (e.g. Chrome for Testing) set `CHROME=/path/to/binary`.

`test/firefox.mjs` runs the same backend and rules in Zen: fetch/XHR rules, rules saved by
older versions, a kept server's body passed on as it is, the traffic log, the channel and
`.caller` attacks,
`local.*` hosts, a site that isn't turned on, and adding and removing a site (one with an
underscore in its name beside an IPv6 address too, both of which Firefox registers). Firefox's
automation can't open extension pages, so the editor and popup
are covered by the Chromium run (same code), and this test loads a temporary copy of the
build with two test-only hooks for setting rules; the build itself isn't changed. The
vim keys depend on the browser's editing, undo and scrolling, so this test also types them
into the body editor on a plain test page that loads the editor's TypeScript from `src/`
(Node strips the types). Both tests type the same vim session (`VIM_STEPS` in
`test/fixtures.mjs`), which gives the same bodies and cursor positions as vim 9.1 typing the
same keys, except where Ghostfetch differs on purpose: only a yank fills the register, Space s
formats and saves, and `:w` saves. There it also sizes the text with Ctrl+= and Ctrl+−, and checks that vim's cursor
stays where it is in the view, as Firefox scrolls a text area its own way, as it does through
Format, that a new editor goes back to another's place, that `u` and Ctrl+R right after Format
go back to the cursor before it and after it, that Visual mode carries on through Format, that
`u` after a Format too long to undo undoes the changes made since (a character yanked and `x`,
then `P`, which puts the body back as it was) and stops at the formatted body, that a yank reaches the
clipboard, which Firefox only lets a page write during a key press or a click, and that with
Wrap on Firefox's text area wraps as the colours and the line numbers do, at two widths and at
one a tenth of a pixel past a whole number of characters, where the text wraps half a character
clear of that.
Both tests paste from the clipboard of the headless browser, which is its own, so running them
leaves yours alone (with `HEADED=1` they use the real one). With ghostfetch-mcp's packages
installed, the Zen test also has its background hook open the editor in a tab with Agent access
on, and checks that Firefox is one that asks for data consent and that it's given (the test copy
declares it required, given at install, as a prompt can't be answered by automation), that the
editor connects, that a rule the agent saves answers on the page at once, and that the agent
sees the request.

`test/agent.mjs` is [Agent access](agent-access.md) end to end in Chromium. Before it starts
anything it checks which hosts are dev hosts, whose pages' requests the agent may see
(`isDevHost`): `localhost`, a name under `.localhost`, `127.0.0.1` and a `local.` name, but no
lookalike (`localhost.example.com`, `local-app.test`), other site or IPv6 address. And that every
dev host is a host Ghostfetch runs on, as an agent told a page is on a dev host waits for its
requests: of hundreds of hosts (names under `.localhost`, `local.` names with every printable
character after the dot, lookalikes, addresses, upper case, a trailing dot), each one `isDevHost`
says yes to, Sites' `isBuiltInHost` says yes to. Then it starts
ghostfetch-mcp as an agent starts it, with the MCP SDK's own client, pairs the editor through its
panel (a wrong code turned down first), and drives every tool against the test server's pages:
a rule saved answers at once and shows in the editor's list and in the panel's list of what the
agent did, the page's requests and what each rule did, Mock this response, a rule changed only in
the fields given, turned off and moved, which rule would answer a URL, what's wrong with a broken
rule, a delete undone in the editor, no requests from a page that isn't on a dev host, the page's
own WebSocket to ghostfetch-mcp turned away, every open editor following one turned off, the editor
waiting while ghostfetch-mcp is gone and connecting again when it's back, a second
ghostfetch-mcp working through the first and taking the port when the first ends, and a rule the
agent points at another app's host and port, then this one's, then matches by equals, regex,
wildcard and method, and answers with a status, a header, a content type and a delay, or with the
server's own body under another status, a header of the server's removed. And groups: a rule
saved into a group no group has yet, which that makes, named in list_rules, recent_requests and
Traffic; the group turned off, which the page, try_url and the rule's report then pass by; a
copy made where it's told, a rename, and delete_group, undone in the editor; and a group made
under a name that's taken, which gets the next number and is named so in the panel's list of
what the agent did. It also checks
that the footer's Agent button fits beside ⋯, Import and Export from the sidebar's narrowest width
up, named only where there's room.

`test/kit.mjs` opens the UI kit page under the extension pages' real CSP, in Chromium and in
Zen (served with the CSP as a response header there, since Firefox's automation can't open
extension pages). It fails on any CSP violation, uncaught error or console error, drives every
live component with the keyboard and the mouse (the menu's Theme and Appearance rows too, which
restyle the kit page: open it to see every component in every theme, contrast, font and text
size), checks every theme's grey text against its floor at each step of Contrast (on the page and
on a card, `--t40` and `--t30` at 4.5:1 and 3:1 or more at Standard, 5.5:1 and 4:1 at More,
6.5:1 and 5.5:1 at Most, and each level above the one below, by 1.15 times its contrast at
Standard; `src/app/styles/theme.css` says what each level is for), and checks that the kit's
icons draw the same as `src/lib/icons.ts`. And the tooltips: one opens once the pointer rests on
its control, with its key, the next one at once, and one as soon as Tab brings focus to it; a
control that's off says why; a click alone opens none, not even a field's; a click or a scroll
closes one, unless the keyboard put it there; while the page scrolls, a control passing under the
pointer opens none; in a window as wide as the popup, the pause button's at its top right corner
stays inside, under it; with every tooltip shut, a screen reader gets each one's words as its
control's description (Chromium's own accessibility tree; in Zen, from `aria-describedby`), a key
in words, after a description the control has of its own, and none where the words are the
control's name; and the ⋯ menu, shut with Esc after the keyboard or a click opened it, gives its
button focus back with no tooltip, which shows again once focus or the pointer leaves and comes
back. Two self-checks make sure it can fail: a `<style>` tag added on purpose has to be caught,
and so does Base UI's own when `CSPProvider`'s setting is off.

```sh
npm run test:firefox     # builds, then tests in Zen from /Applications; FIREFOX=/path/to/firefox for another build
npm run test:kit         # builds the kit page into .output/*-kit, then tests it in Chromium and Zen; SHOTS=dir for screenshots
npm run test:release     # zips both browsers, then checks the manifests, the release CSP, the built files and the zips
npm run test:agent       # builds, then tests Agent access in Chromium (npm install --prefix mcp first, once)
npm run lint:firefox     # Mozilla's validator: the checks addons.mozilla.org runs on upload
npm run start:zen        # a fresh Zen profile with the dev build loaded, reloaded on every save
npm run zip              # the packages and the sources zip in web-ext-artifacts/
```
