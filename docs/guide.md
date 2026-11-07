# Using Ghostfetch

The full reference: what the popup and the editor do, the body editor's keys, vim keys, how a
rule matches, and the limits. For what Ghostfetch is and how to install it, see the
[README](../README.md).

## Where it runs

Ghostfetch always runs on **`localhost`** (any port, plus `*.localhost`), **`127.0.0.1`** and any
host starting with **`local.`**, such as `local.myapp.com`. You can turn it on for other sites
too: switch on **Active on …** in the popup on that tab, or click **Turn on for …** in the
Traffic view. A site you add covers its subdomains, so `example.com` includes
`api.example.com`. Everywhere else Ghostfetch doesn't run at all.

What's different in Firefox-based browsers:

- The editor opens in the browser's **sidebar** instead of Chrome's side panel.
- Site access can be granted or revoked per site from the Extensions menu. If rules stop
  applying, check that Ghostfetch is allowed on that site.

## The popup and the editor

- **Toolbar popup**: Ghostfetch on or off as a whole (the only place for that), whether it's
  active on the current site (with a switch for sites that aren't built in), the sites it runs
  on (click × to remove one you added), record on/off, quick per-rule switches. Click a rule's
  name to open it in the editor.
- **Side panel (Chrome), sidebar (Firefox, Zen) or tab**: the full editor. Open it from the
  popup, or from the `⋯` menu. From 760 px wide a sidebar stands beside what's open: a search
  field (**/** puts the cursor in it), **Rules** and **Traffic** with their counts, the rules
  in your order under how many are on (click one to open it, from Traffic too; **+** for a
  new rule), and the `⋯` menu, **Import** and **Export** along the bottom. Drag its edge to
  make it wider or narrower (it's at least 260 px wide and leaves what's open at least
  320), on past half its narrowest to hide it, and back out from the window's left edge to
  show it again; double-click the edge for its usual width. The edge also takes focus (Tab):
  the arrow keys move it, and **Enter** hides or shows the sidebar. The button at the top
  left of a rule or of Traffic (or **⌘B / Ctrl+B**) hides it too, giving its room to what's
  open, and brings it back. Its width, and whether it's hidden, are remembered. In a
  narrower panel a top bar has the two views as tabs, and the rules, a rule or Traffic take
  the whole panel, one at a time. The `⋯` menu's **Theme** picks the [look](#themes). While
  Ghostfetch is off, a bar along the top says so; the switch for that is the popup's.
  - **Rules**: create and edit rules. Changes save as you type and apply to open tabs
    immediately, without reloading. Rules apply in the list's order and the first match wins;
    drag them to reorder. A rule's switch is a green dot: it pulses while the rule is on, holds
    still while Ghostfetch is off, and is grey while the rule is off. Click it to turn the rule
    on or off; a rule that's off keeps its place in the list. **Duplicate**, in an open rule's
    header, copies it.

    **New rule** (the **+**) asks "What should Ghostfetch answer?" (beside the sidebar it's
    also what shows with no rule open). Paste a path, a full URL (it keeps the path and query,
    so the rule works on any host) or a cURL command, as the browsers' Copy as cURL writes one:
    its method, Accept type and GraphQL operation are read too, all inside the extension, with
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
    what's on screen, and as you type it redraws only the piece you're typing in, so a body of
    a megabyte stays fast.

    A JSON body is checked as you type: once you pause, a mistake is marked where it is (a
    squiggle, the line in the gutter, a few words at the end of the line and the whole
    message on hover), and the line under the editor says what it is (click it to go there).
    In a body editor, **⌘F / Ctrl+F** searches the body itself instead of the page: **Enter**
    and **Shift+Enter** step through the matches, **Esc** closes the search and leaves the
    current match selected. **⌘= / ⌘−** (Ctrl on Windows and Linux) make its text larger or
    smaller and **⌘0** puts it back, instead of zooming the page. The text grows and shrinks
    around the cursor's line, which stays where it is in the view (or with the cursor out of
    view, around the middle of the view). **Vim keys** under it turns on
    [vim keys](#vim-keys). The text size and the Vim switch are remembered for every body
    editor. **Format** lays the body out two spaces an indent and changes nothing but the
    spaces and line breaks: every value stays as you wrote it (`\/` and `\u00e9`, `1.0`, an
    ID too long for JavaScript's numbers, a key given twice, the order of keys), as it does
    for a response in Traffic and a rule made from one. It keeps the cursor on the character
    it was on, and that line where it was in the view; a selection, and vim's Visual mode,
    stay on what they held. ⌘Z (or vim's `u`) right after it puts the body back with the
    cursor and the scroll where they were before, and redo where they were after. Format on a
    body of more than 300 lines can't be undone: the browser would take minutes to make it
    undoable, so ⌘Z then leaves the body as it is. Back at a rule you left (another rule
    picked, the back button in a side panel), its body is where you left it: the cursor or
    the selection (with vim keys, the cursor, in Normal mode), and the scroll. In a side
    panel, so is the pane. While the body editor isn't focused, the cursor stays marked,
    outlined in grey, as vim's block is, so you can see where you'll carry on.
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

## Themes

The look is calm, after [T3 Code](https://github.com/pingdotgg/t3code), Revolut and ChatGPT: a
near-black canvas with cards a step lighter, soft corners, Geist for words and Commit Mono for
what is code (URLs, methods, status codes, headers, bodies), in sentence case. There is one
colour, green, which means "on" or "a rule fired"; a rule's switch is a green dot that pulses
while the rule is on. Errors and failed requests are inverted white instead of red.

The editor's `⋯` menu has **Theme**: Ghostfetch's own (above, the default), **Rosé Pine**,
**Rosé Pine Moon**, **Rosé Pine Dawn** (light), **Catppuccin Macchiato** and **Vague**. Each
takes its colours from its theme's palette as its Neovim plugin has them: the page, the
cards and the steps on them, quieter text, and the body editor's JSON colours. The green is the
theme's colour for what's added or fine (Catppuccin's green, Vague's; foam in Rosé Pine and
pine in Dawn, as its own "ok", leaf, is too faint to tell a rule that's on from one that's off),
and errors stay inverted, in the theme's text colour. A theme recolours every page of
Ghostfetch's at once, the popup too, and is remembered in this browser. Each page puts it on
before it first draws (`public/theme.js`), so none flashes Ghostfetch's own colours first.

## Vim keys

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

- There's one register, shared by every body editor on the page. A yank (`y` in Visual mode,
  `yy`, `Y`, `y` with a motion) also copies to the system clipboard, as vim's
  `clipboard=unnamedplus` does, so you can paste it in another app; if the browser doesn't
  allow it, the status line says "Couldn't copy to the clipboard". Deletes and changes (`d`,
  `x`, `c`) only fill the register, so they don't overwrite what you copied, and `p` puts the
  register: reading the clipboard would take a permission Ghostfetch doesn't ask for. ⌘C and
  ⌘V (Ctrl+C and Ctrl+V) keep using the system clipboard in every mode.
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

## What a rule does

A rule answers the `fetch()` and `XMLHttpRequest` calls it matches: with your body, without
calling the server (**Replace**), or with the server's response (**Server's body**), and either
way with the status, headers and delay you set. Ghostfetch wraps `fetch` and `XMLHttpRequest`
in the page to do it.

URL matching: *contains*, *equals* (a bare path such as `/api/users?page=1` works too),
*wildcard* (`*`) or *regex*. A rule can also match a **GraphQL operation name**, read from the
request body or the `operationName` query param.

## Limits worth knowing

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

## Upgrading from old builds

**Chrome, coming from 0.5.0 or earlier, loaded from a folder you built?** Chrome keeps an
unpacked extension's rules with the folder it was loaded from, and the build lives in a new one,
so `.output/chrome-mv3` starts empty. Before switching, open the old Ghostfetch's editor and
choose **Export all rules** in its `⋯` menu; then load `.output/chrome-mv3`, **Import** the file
and switch the rules back on (imported rules arrive switched off), and remove the old card.
In Zen and Firefox nothing changes: the add-on ID stays `@ghostfetch`, and so do your rules.

**Coming from Mocktail (0.4 and earlier)?** Ghostfetch has a new add-on ID, so Firefox-based
browsers install it next to Mocktail instead of replacing it, with empty storage. Before you
remove Mocktail, open its editor and choose **Export all rules** in its `⋯` menu. Then
install Ghostfetch, **Import** the file and switch the rules back on (imported
rules arrive switched off), and remove Mocktail. In Chrome the same export and import moves
your rules to the new build folder (see the note above).
