// What a dev host is (docs/glossary/agent-access.md): a host whose pages' requests an agent may
// see. A page on any other host keeps them in the browser, its address and title too
// (application/agent-tools.ts). These are the hosts Ghostfetch always runs on today, Sites'
// built-in hosts (src/sites/site.ts), but the list is Agent access's own: Ghostfetch can come to
// run on more hosts without an agent seeing more.

// Hosts like local.myapp.com, the usual name for a dev build of a real domain.
const LOCAL_PREFIX = /^local\.[a-z0-9]/;

// localhost, any name under .localhost, 127.0.0.1, and any name that starts with "local.".
export function isDevHost(host: string) {
  return (
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    LOCAL_PREFIX.test(host)
  );
}
