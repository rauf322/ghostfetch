// Runs in the page's own JavaScript world (manifest "world": "MAIN") so it can wrap
// window.fetch and XMLHttpRequest. It has no extension APIs: the bridge (src/app/bridge/) sends
// it the response rules over a MessageChannel and receives the traffic log back the same way.
// Built as interceptor.js: WXT's wrapper runs this function at once, before any page script,
// and adds no globals of its own. All of it is strict mode (see wxt.config.ts).
//
// The files beside this one only declare things, and take copies of the browser's own functions
// as the script starts. This function decides whether the interceptor runs on this page, then
// opens the channel to the bridge (page-channel.ts) and wraps fetch (fetch.ts) and
// XMLHttpRequest (xhr.ts). Which rule a request gets is matching.ts, what it gets apply-rule.ts.
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { wrapFetch } from './fetch.ts';
import { openChannel } from './page-channel.ts';
import { wrapXhr } from './xhr.ts';

export default defineUnlistedScript(() => {
  // The manifest's local.* entry matches the start of the URL, which a URL with credentials
  // such as http://local.x@other.site/ passes too. Ghostfetch never runs on such URLs, and leaves
  // no trace there. The check reads document.URL because that's what the pattern is matched
  // against: Chrome strips the credentials from location.href but keeps them there.
  const address = new URL(document.URL);
  if (address.username || address.password) return;
  // Run once per page even when two registrations match it: a site you added (myapp.com) can
  // overlap a built-in host (local.myapp.com). The bridge has the same two guards.
  const FLAG = Symbol.for('ghostfetch.interceptor');
  if ((window as unknown as Record<symbol, boolean>)[FLAG]) return;
  Object.defineProperty(window, FLAG, { value: true });

  openChannel();
  wrapFetch();
  wrapXhr();
});
