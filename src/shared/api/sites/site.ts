// The sites Ghostfetch runs on: the built-in hosts, and the sites you add.

// Hosts like local.myapp.com, the usual name for a dev build of a real domain.
const LOCAL_PREFIX = /^local\.[a-z0-9]/;

export function siteOf(url: string | undefined): string {
  try {
    const parsed = new URL(url!);
    return /^https?:$/.test(parsed.protocol) ? parsed.hostname : '';
  } catch {
    return '';
  }
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

// Always on: localhost (any port or *.localhost subdomain), 127.0.0.1 and local.* hosts, which
// the manifest's content_scripts declare (wxt.config.ts). On top of them Ghostfetch runs on the
// sites you add, whose content scripts the background registers at runtime, so any other site
// never sees it.
export function isBuiltInHost(host: string) {
  return (
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    LOCAL_PREFIX.test(host)
  );
}

// Turns "https://staging.example.com:8080/app", "*.example.com" or "Example.com" into a bare
// hostname. Returns '' for anything that isn't a plain hostname or IPv4 address.
export function normalizeSite(input: unknown): string {
  const raw = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\*\./, '');
  if (!raw) return '';
  let host;
  try {
    host = new URL(raw.includes('://') ? raw : `http://${raw}`).hostname;
  } catch {
    return '';
  }
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host) ? host : '';
}

// The sites you added, cleaned up: plain hostnames, no duplicates, no built-in hosts
// (they're always on anyway).
export function normalizeSites(list: unknown): string[] {
  return [...new Set((Array.isArray(list) ? list : []).map(normalizeSite))].filter(
    (site) => site && !isBuiltInHost(site),
  );
}

// A site you added covers the host itself and its subdomains (IP addresses only themselves).
export function siteCovers(site: string, host: string) {
  return host === site || (!IPV4.test(site) && host.endsWith(`.${site}`));
}

// Whether Ghostfetch runs on this URL: a built-in host, or one covered by a site you added.
export function isSiteEnabled(sites: string[], url: string | undefined) {
  const host = siteOf(url);
  return (
    Boolean(host) && (isBuiltInHost(host) || sites.some((site) => siteCovers(site, host)))
  );
}

// Content-script match patterns for the sites you added.
export function siteMatchPatterns(sites: string[]) {
  return sites.map((site) => (IPV4.test(site) ? `*://${site}/*` : `*://*.${site}/*`));
}
