# Security model

What Ghostfetch protects against, and what it has to trust. For what it is and how to install it,
see the [README](../README.md).

- **No network calls of its own, and few libraries, only in its own pages.** Ghostfetch's code is
  all in `src/`. The popup and the editor are React components on Base UI (see
  [UI kit](development.md#ui-kit)); those two, what they're built on (React DOM and its
  scheduler, Base UI's utils, Floating UI, use-sync-external-store) and the kit's three helpers
  (clsx, tailwind-merge, class-variance-authority) are pinned in `package-lock.json`, and the
  build puts them, unminified, in `chunks/libraries-*.js`. The background and the two scripts
  that run in web pages use none of them. The build (WXT and Vite) turns everything into plain,
  unminified JavaScript, and the only code it adds to those three scripts is WXT's few lines
  that start each one: a pass-through and a `try`/`catch`. The page-world script is built so it
  adds no globals to the page and runs entirely in strict mode, so a built-in the page patches
  can't reach its functions or their arguments through `.caller`. The extension pages run under
  a strict CSP (`connect-src 'none'`, no remote scripts, images or styles, no inline code, no
  `<style>` tags); `npm run test:release` checks all three in the built packages.
- **Only runs where it should.** The built-in hosts' content scripts are declared in the
  manifest; the sites you add get theirs registered at runtime, for those sites only. Any
  other website can't see Ghostfetch, your rules or your traffic. The `local.*` pattern is
  matched against the start of the page URL, so both content scripts also refuse to run on a
  URL with credentials, such as `http://local.x@other.site/`, which would otherwise pass it.
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
