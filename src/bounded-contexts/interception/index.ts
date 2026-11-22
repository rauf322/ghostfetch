// Interception: gives the page the answer, inside the page (its words are in
// docs/glossary/interception.md). What runs in the page's own world, where the page can patch any
// built-in: the private channel to the bridge, which the rules arrive over and the page's requests
// go back by (page-channel.ts), and fetch and XMLHttpRequest wrapped (fetch.ts, xhr.ts), each
// request given the rule that matches it (matching.ts) and what that rule answers (apply-rule.ts;
// for an XMLHttpRequest, simulate-xhr.ts). Its files only declare things and take copies of the
// browser's own functions at their top level, before any page script runs
// (docs/security-model.md), and wrap nothing until the interceptor calls what this offers. The
// only way into this folder, and only the interceptor (src/app/interceptor/index.ts, the part WXT
// builds) comes in by it. Plain TypeScript with no npm package and no React; of Ghostfetch's own
// code it may import only the shared kernel, lib, and the types of
// bounded-contexts/rules/index.ts and bounded-contexts/traffic/index.ts.
export { wrapFetch } from './fetch.ts';
export { openChannel } from './page-channel.ts';
export { wrapXhr } from './xhr.ts';
