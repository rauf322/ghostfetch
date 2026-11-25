# Using Ghostfetch

The full reference: what the popup and the editor do, the body editor's keys, vim keys, how a
rule matches, and the limits. For what Ghostfetch is and how to install it, see the
[README](../README.md).

## Where it runs

Ghostfetch always runs on **`localhost`** (any port, plus `*.localhost`), **`127.0.0.1`** and any
host starting with **`local.`**, such as `local.myapp.com`. You can turn it on for other sites
too: click **Turn on for …** in the popup on that tab (under **This page**) or in the Traffic
view, and off again with the popup's **Turn off here**, or **Remove** under its **Sites**. A
site you add covers its subdomains, so `example.com` includes
`api.example.com`, and an IP address (such as `10.0.0.5` or `[::1]`) only itself. Everywhere
else Ghostfetch doesn't run at all.

What's different in Firefox-based browsers:

- The editor opens in the browser's **sidebar** instead of Chrome's side panel.
- Site access can be granted or revoked per site from the Extensions menu. If rules stop
  applying, check that Ghostfetch is allowed on that site.

## The popup and the editor

- **Toolbar popup**: what's on, and the place that turns recording or Ghostfetch itself on or
  off; a rule's dot turns the rule on or off, here and in the editor's list. The header has
  **Recording** (click it to stop recording, and **Not recording** to start again) and
  **Pause**, which turns Ghostfetch off as a whole until you click **Resume**. Under it, the
  tab's site and whether Ghostfetch is on there, with **Turn off here** for a site you added
  (the built-in hosts are **Always on**). At the bottom, **Open editor** opens the side panel
  (the sidebar in Firefox), and the button beside it opens the editor in a tab. In between are
  three tabs; in the first two, a rule's dot is its switch, green and pulsing while it's on
  (still while its group or Ghostfetch is off) and grey while it's off: click it to turn the
  rule on or off, which saves at once. What a rule did on the tab's page shows at the right of
  its name, with how long ago it last did ("2 mocked · 4m"); under the pointer the same place
  has **Edit this rule**. Click a rule (or its **Edit this rule**) to open it in the editor. A
  right-click on a rule (or the menu key, or Shift+F10) has **Edit this rule** and **Turn off**
  (or **Turn on**). From the keyboard the list is one Tab stop: ↑ and ↓ move between rows, →
  and ← open and shut **Not answering here** or a group, Space turns the rule (or the group) on
  or off, Enter opens the rule in the editor, and Tab goes on to its **Edit this rule**:
  - **This page**: what each rule did on the tab's page, such as **2 mocked** or **1 modified ·
    1 failed**, counted while recording since the page loaded (Traffic's **Clear** starts the
    count over; a page opened before Ghostfetch was installed or updated needs a reload
    first). The rules that answered come first, under **Answering here**, and the rest fold
    into **Not answering here**, which opens. A rule in a [group](#groups) has the group's
    name beside what it matches. A rule you turn off stays where it is, greyed, with what it
    did, so the same dot turns it on again; it joins the others when the page loads again. On
    a site Ghostfetch isn't on, **Turn on for …** instead, which reloads the page.
  - **All rules**: every rule in your order, with what it did on the page (in grey once the
    rule is off), and the [groups](#groups) in their place: each with its own dot, which turns
    the group on or off, its name, and how many of its rules are on, its rules set in under it;
    click a group to fold it or unfold it, as in the editor. A rule that's on but hasn't
    answered on the page steps back, its name in a quieter grey, as in the editor. Switching
    from one PR's mocks to another's is two clicks here.
  - **Sites**: where Ghostfetch runs: the built-in hosts, then the sites you added, each with
    **Remove**.
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
  Ghostfetch is off (the popup's **Pause**), a bar along the top says so; the popup's
  **Resume** turns it back on.
  - **Rules**: create and edit rules. Changes save as you type and apply to open tabs
    immediately, without reloading. Rules apply in the list's order and the first match wins;
    drag them to reorder. A rule's dot turns it on or off without opening it, as in the popup:
    green and pulsing while it's on, grey while it's off. A rule that's off is dimmed and keeps
    its place in the list, and its chip, open, says **Off**. One that answered on the page the
    editor watches says what it did there at the right of its name, and how long ago it last
    did ("2 mocked · 4m"); one that's on but hasn't answered there steps back, its name in a
    quieter grey. Under the pointer, the same place has the rule's **Turn off** (or **Turn on**)
    and its **⋯** menu, the one an open rule has in its header. A right-click on a rule or a
    group's header (or the menu key, or Shift+F10) opens the same menu as its **⋯**. From the
    keyboard the list is one Tab stop: ↑ and ↓ move between rules and groups, → and ← unfold and
    fold a group, Enter opens a rule, F2 renames it, and Tab goes on to the rule's **Turn off**
    and **⋯**. **Duplicate**, in an open rule's header, copies it.

    <a id="groups"></a>**Groups** keep the rules for one piece of work together, a PR's, say,
    to turn on and off as one. **New group** (beside **+**) makes one at the top of the list,
    its name ready to type (double-click a group's name to rename it; no two groups share a
    name). A group stands in the list as a block, its rules set in under its header, which has
    a dot of its own: turned off, none of its rules answer, and each keeps its own switch, so
    turning the group on again brings back just the rules that were on. A rule in a group
    that's off fades, its dot green but still, as under Pause, and its chip says **Paused
    while PR-1 is off**. Groups and the rules outside them are tried in one order, top to
    bottom: of the rules that match a request, the highest one that's on, in a group that's
    on, answers. Where two groups' rules match the same request, then, the higher group wins,
    and a new group, like a new rule, goes on top; drag one above the other to change that.
    Drag a rule into a group (onto its header, below its middle), out of one or between them,
    and a group's header to move the group with its rules; let go under the list's last entry
    to put either at the end of the list, out of any group. Where it would land shows as you
    drag: a line set in under a group's rules lands in that group, a line as wide as the list
    lands out of any group, and a group's header outlined means the top of that group; where
    nothing shows, letting go leaves it where it was. **Move to group** in a rule's `⋯`
    menu moves it too, or into a **New group…**. A group's name folds it or unfolds it
    (remembered, and the popup's **All rules** shares it), its **+** makes a rule at its top,
    and its `⋯` menu has **Rename**, **Duplicate** (a copy with the same rules, on, at the top
    of the list, to start another PR from), **Export group**, **Ungroup** (the group goes, its
    rules stay where they were) and **Delete** (with its rules, and **Undo** in the toast).
    Once there's a group, **New rule** and **Mock this response** say which group the rule
    goes into: the one the last rule made there went into, or the group whose **+** you
    clicked, and you can pick another, or none. **Export group** saves the group and its rules
    to hand to someone else: importing the file brings the group in at the top of the list,
    turned off, its rules' own switches as they were, so its dot then turns on just what the
    sender had on.

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
    name and the common ones by class; the delay, up to 10 minutes; headers to set or remove).
    Click a row to edit it in place. A header the page wouldn't get (Set-Cookie, which no page
    sees, a name with a space or a colon, a value that isn't Latin-1 text) says it's skipped,
    and why. **Try a URL** says whether the rule would answer a URL you paste. Then the body: **Replace body** sends yours without calling the server; **Keep
    server's body** makes the real request and keeps its body, so only the status, headers and
    delay change.

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
    view, around the middle of the view). **Wrap** under it shows a long line on as many rows
    as it takes, as Neovim's `wrap` does, breaking between words where it can and anywhere in a
    word too long for a row (a token, say); the line's number stands by its first row, and
    nothing scrolls sideways. The body itself doesn't change. **Vim keys** turns on
    [vim keys](#vim-keys), whose `j` and `k` still move by lines, not rows. The text size and
    the Wrap and Vim switches are remembered for every body editor. **Format** lays the body
    out two spaces an indent and changes nothing but the
    spaces and line breaks: every value stays as you wrote it (`\/` and `\u00e9`, `1.0`, an
    ID too long for JavaScript's numbers, a key given twice, the order of keys), as it does
    for a response in Traffic and a rule made from one. It keeps the cursor on the character
    it was on, and that line where it was in the view; a selection, and vim's Visual mode,
    stay on what they held. ⌘Z (or vim's `u`) right after it puts the body back with the
    cursor and the scroll where they were before, and redo where they were after. Format on a
    body of more than 300 lines can't be undone (the browser would take minutes to make it
    undoable): ⌘Z then undoes what you've changed since, back to the formatted body, and
    stops there. Back at a rule you left (another rule
    picked, the back button in a side panel), its body is where you left it: the cursor or
    the selection (with vim keys, the cursor, in Normal mode), and the scroll. In a side
    panel, so is the pane. While the body editor isn't focused, the cursor stays marked,
    outlined in grey, as vim's block is, so you can see where you'll carry on.

    **Diff**, beside Vim keys, shows in the editor's place what your body changes in the
    server's response: the lines you removed dimmed, with a −, the ones you added tinted
    green, with a +, and in a line you changed, the part that changed. Side by side, or
    inline, one column as git shows a diff, from the switch beside it; in a body narrower than
    480 px, as in a side panel you haven't widened, it's inline. The response it compares with
    is the server's the rule was made from (**Mock this response** on a request no rule
    answered), or else one the server gives a request the rule matches while no rule answers
    it: the newest Traffic has, or the next one (turn the rule off with its dot and reload the
    page once).
    Until a rule has one, it has no Diff switch. The response is kept apart from the rule: it
    never goes to a page, and an exported rules file doesn't have it. Diff can't be typed in:
    click a line, or press **Enter** for the one at the top, and Diff goes off with the cursor
    there. **Format** and a click on a mistake turn it off too, as they work in the editor, and
    a rule New rule makes opens without it, for typing. With **Keep server's body** there's no
    body of yours to compare, so no Diff. Like Vim keys, it's remembered for every body editor.
  - **Traffic**: live `fetch`/XHR log of a tab, newest first, grouped by when ("Just now", "A
    few minutes ago", "About 10 minutes ago"). What a rule did is in green ("Mocked by Feature
    flags", and "Mocked by Users list · PR-1" for a rule in a group), and a request that
    failed says why ("Aborted · Feature flags", "Timed out after 800 ms (xhr.timeout)"). The
    bar along the top picks the page to watch, says whether requests are **Recording** (the
    popup starts and stops that), and has **Keep on reload** (keep the log when the page
    reloads) and **Clear**;
    under it, **All**, **Matched** and **Errors** (a status of 400 or more, a failed request or
    a rule's error), each with its count, and a search by URL, status, rule or group. In the side
    panel Traffic watches the tab you're on, from the moment it opens a web page; a page you
    pick instead stays until you switch tabs. In a tab of its own it keeps the page you
    picked. Either way, when that page closes or goes somewhere that isn't a web page, it
    moves to the page you used last.
    A request's row says how long ago it was sent ("· 4m") once it's older than a minute, and
    its status and duration at the right; under the pointer the same place has **Mock this
    response**, **Copy URL** and **Copy as cURL** (a copy shows a check for a second). A
    right-click on a request (or the menu key, or Shift+F10) has the same, and **Open the rule**
    when a rule answered it. From the keyboard the log is one Tab stop: ↑ and ↓ move between
    requests, Enter opens one, Esc closes it, and Tab goes on to the request's actions.
    Click a request to open it in a drawer beside the log: its status, time and Content-Type,
    the rule that acted on it, its bodies, **Copy URL**, **Copy as cURL** and **Copy body**,
    and **Mock this response**, which turns it into a rule pre-filled with the method, path,
    status and the real body, ready to edit, and keeps the response for the body's **Diff** if
    the server gave it (not a rule).

## Themes

The look is calm, after [T3 Code](https://github.com/pingdotgg/t3code), Revolut and ChatGPT: a
near-black canvas with cards a step lighter, soft corners, Geist for words and Commit Mono for
what is code (URLs, methods, status codes, headers, bodies), in sentence case. There is one
colour, green, which means "on" or "a rule fired"; a rule that's on has a green dot that
pulses. Errors and failed requests are inverted white instead of red.

The editor's `⋯` menu has **Theme**: Ghostfetch's own (above, the default), **Rosé Pine**,
**Rosé Pine Moon**, **Rosé Pine Dawn** (light), **Catppuccin Macchiato** and **Vague**. Each
takes its colours from its theme's palette as its Neovim plugin has them: the page, the
cards and the steps on them, quieter text (made strong enough to read on the page and on
cards), and the body editor's JSON colours. The green is the
theme's colour for what's added or fine (Catppuccin's green, Vague's; foam in Rosé Pine and
pine in Dawn, as its own "ok", leaf, is too faint to tell a rule that's on from one that's off),
and errors stay inverted, in the theme's text colour. A theme recolours every page of
Ghostfetch's at once, the popup too, and is remembered in this browser. Each page puts it on
before it first draws (`public/theme.js`), so none flashes Ghostfetch's own colours first.

Under Theme, **Appearance** has three settings for every theme, each a few steps; the row says
which steps you picked that aren't the defaults:

- **Contrast**: Standard, **More** or **Most**. More and Most bring quieter text (labels, hints,
  placeholders) and the lines between things nearer the text colour, so they're easier to read.
  The steps of grey stay apart, so what's quieter still looks quieter.
- **Font**: Geist or **Commit Mono**, the font of code, for words too.
- **Text size**: Default, **Large** or **Larger**, an eighth and a quarter larger. Only the text
  grows: spacing and icons stay as they are, and the body editor keeps its own text size (⌘= and
  ⌘−). Where a row's words no longer fit side by side, they go on to another line rather than
  being cut.

Like the theme, each changes every open page of Ghostfetch's at once, is remembered in this
browser, and is on each page before it first draws.

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
| Leader | Space: `Space s` formats the body, as **Format** does, and saves it at once |
| `:` | `:42` goes to line 42; `:w` saves at once; `:set clipboard=unnamedplus` and `:set clipboard=` (below) |

Motions and text objects behave like vim's own (`cw`, `dw` at the end of a line, `ci"` and
`di{` in formatted JSON, `dap`). Where it differs:

- There's one register, shared by every body editor on the page, and it follows the system
  clipboard, as vim's `clipboard=unnamedplus` has it. A yank (`y` in Visual mode, `yy`, `Y`,
  `y` with a motion) also copies to the clipboard, so you can paste it in another app; if the
  browser doesn't allow it, the status line says "Couldn't copy to the clipboard". `p` and `P`
  paste what's on the clipboard, copied in the editor or anywhere else, and text that ends with
  a line break goes in as whole lines.
- Reading the clipboard takes a permission Ghostfetch asks for only then: the first `p` opens
  the browser's dialog ("Read data you copy and paste"). Turned down, `p` puts your last yank
  and doesn't ask again; `:set clipboard=unnamedplus` asks again, and `:set clipboard=` stops
  reading the clipboard. In Firefox the permission is also under the add-on's **Permissions**
  in `about:addons`. Right after you allow it, Chrome may not hand the clipboard over yet (its
  dialog has the focus): the status line says "Clipboard allowed: press p again", once. Where
  the browser doesn't give the clipboard at all (Chrome 121 doesn't let extensions read with the
  permission), `p` puts the yank and says "Couldn't read the clipboard".
- Deletes and changes (`d`, `x`, `c`), and pasting over a selection, leave the register and the
  clipboard as they are: only a yank, or a copy anywhere, changes what `p` pastes. So the same
  text can go over one selection after another. Unlike vim, `ddp` doesn't swap lines: yank
  first (`yy`, `dd`, `p`).
- Space is the leader: `Space s` formats the body and saves it at once, saying so on the status
  line, though every change saves as you type anyway. Space and any other key moves one to the
  right, as Space does in vim, and then runs that key.
- ⌘C and ⌘V (Ctrl+C and Ctrl+V) keep using the system clipboard in every mode.
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

## Agent access

A coding agent (OpenCode, Claude Code, any MCP client) can make and change your rules, and see
what your dev app asked for, through `ghostfetch-mcp`, which it runs. Turn it on with **Agent**
(`>_`) at the bottom of the editor's sidebar and the pairing code the agent gives you (Firefox
then asks for your consent to what the agent gets), keep the editor open while the agent works,
and check the result in your app. Its panel lists what the agent changed; a rule it deletes
comes back with **Undo**. Setting it up, the tools, and what the agent can and can't see:
[Agent access](agent-access.md).

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
  1 MB. A streamed response (one without a Content-Length) shows up when it ends or once it has
  sent 1 MB, whichever comes first. Iframes from other sites (auth widgets, wallets) aren't
  captured unless Ghostfetch runs on their site too.

## Upgrading from old builds

**Chrome, coming from 0.5.0 or earlier, loaded from a folder you built?** Chrome keeps an
unpacked extension's rules with the folder it was loaded from, and the build lives in a new one,
so `.output/chrome-mv3` starts empty. Before switching, open the old Ghostfetch's editor and
choose **Export all rules** in its `⋯` menu; then load `.output/chrome-mv3`, **Import** the file
and turn the rules back on in the popup (imported rules arrive turned off), and remove the old
card.
In Zen and Firefox nothing changes: the add-on ID stays `@ghostfetch`, and so do your rules.

**Coming from Mocktail (0.4 and earlier)?** Ghostfetch has a new add-on ID, so Firefox-based
browsers install it next to Mocktail instead of replacing it, with empty storage. Before you
remove Mocktail, open its editor and choose **Export all rules** in its `⋯` menu. Then
install Ghostfetch, **Import** the file and turn the rules back on in the popup (imported
rules arrive turned off), and remove Mocktail. In Chrome the same export and import moves
your rules to the new build folder (see the note above).
