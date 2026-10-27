// A URL's host, its path with the query, and its path alone; a string that isn't a URL is all path.
export function splitUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      path: parsed.pathname + parsed.search,
      pathname: parsed.pathname,
    };
  } catch {
    return { host: '', path: url, pathname: url };
  }
}
