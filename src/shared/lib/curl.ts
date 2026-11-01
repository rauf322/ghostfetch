// A request as a cURL command, for Traffic's Copy as cURL. The page made the request, so what's in
// it can't be trusted: the URL and the body are always in single quotes, and so is a method that
// isn't plain letters, so pasting the command into a shell runs curl and nothing else.
export function curlCommand({
  method,
  url,
  body = '',
}: {
  method: string;
  url: string;
  body?: string;
}) {
  const parts = ['curl', shellQuote(url)];
  const verb = method.toUpperCase();
  // curl sends GET, or POST when there's a body, without being told.
  if (verb !== (body ? 'POST' : 'GET'))
    parts.push('-X', /^[A-Z]+$/.test(verb) ? verb : shellQuote(verb));
  if (body) {
    if (isJson(body)) parts.push('-H', shellQuote('content-type: application/json'));
    parts.push('--data-raw', shellQuote(body));
  }
  return parts.join(' ');
}

// 'text', with each ' in it closed, escaped and opened again: '\''
export function shellQuote(text: string) {
  return `'${text.replaceAll("'", "'\\''")}'`;
}

function isJson(text: string) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
