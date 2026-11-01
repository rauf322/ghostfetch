// cURL commands both ways: a request as one, for Traffic's Copy as cURL (curlCommand), and one
// read back into a request, for New rule (parseCurl). Nothing here runs a command.

// A request as a cURL command. The page made the request, so what's in it can't be trusted: the
// URL and the body are always in single quotes, and so is a method that isn't plain letters, so
// pasting the command into a shell runs curl and nothing else.
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

export interface ParsedCurl {
  url: string;
  // As curl would send it: -X, or HEAD for -I, POST when there's a body (unless -G), else GET.
  method: string;
  // Each -H, its name in lower case.
  headers: [name: string, value: string][];
  // The -d, --data-raw, --json… values, joined with & as curl joins them.
  body: string;
}

// The options that take a value, besides the ones parseCurl reads, so the value isn't taken for
// the URL.
const TAKES_VALUE = new Set([
  '-A',
  '--user-agent',
  '-b',
  '--cookie',
  '-c',
  '--cookie-jar',
  '-e',
  '--referer',
  '-u',
  '--user',
  '-o',
  '--output',
  '-x',
  '--proxy',
  '-m',
  '--max-time',
  '--connect-timeout',
  '-F',
  '--form',
  '-w',
  '--write-out',
  '-r',
  '--range',
  '-T',
  '--upload-file',
  '-E',
  '--cert',
  '--key',
  '--cacert',
  '--resolve',
  '-K',
  '--config',
]);
const DATA = new Set([
  '-d',
  '--data',
  '--data-raw',
  '--data-binary',
  '--data-ascii',
  '--data-urlencode',
  '--json',
]);

// A cURL command as the browsers' "Copy as cURL" (bash) writes it, or as people type one: its URL,
// method, headers and body. null when it isn't a curl command or has no URL.
export function parseCurl(command: string): ParsedCurl | null {
  const words = shellWords(command);
  if (words[0]?.toLowerCase() !== 'curl') return null;
  let url = '';
  let method = '';
  let get = false;
  let head = false;
  const headers: [string, string][] = [];
  const data: string[] = [];
  for (let at = 1; at < words.length; at++) {
    const word = words[at]!;
    const value = () => words[++at] ?? '';
    if (word === '-X' || word === '--request') method = value();
    else if (/^-X./.test(word)) method = word.slice(2);
    else if (word === '-H' || word === '--header') {
      const header = value();
      const colon = header.indexOf(':');
      if (colon > 0)
        headers.push([
          header.slice(0, colon).trim().toLowerCase(),
          header.slice(colon + 1).trim(),
        ]);
    } else if (DATA.has(word)) {
      data.push(value());
      if (word === '--json') headers.push(['content-type', 'application/json']);
    } else if (word === '--url') url = value();
    else if (word === '-G' || word === '--get') get = true;
    else if (word === '-I' || word === '--head') head = true;
    else if (TAKES_VALUE.has(word)) value();
    else if (!word.startsWith('-') && !url) url = word;
  }
  if (!url) return null;
  let verb = method;
  if (!verb) verb = head ? 'HEAD' : data.length && !get ? 'POST' : 'GET';
  return { url, method: verb.toUpperCase(), headers, body: data.join('&') };
}

// A command line's words as a POSIX shell splits them: '…' as it is, "…" with \" \\ \$ \`
// unescaped, $'…' with \n \t \' and the like, a \ before any other character, and a \ at the end
// of a line joining it to the next. Nothing is expanded.
export function shellWords(text: string): string[] {
  const words: string[] = [];
  let word = '';
  let started = false;
  let at = 0;
  const end = () => {
    if (started) words.push(word);
    word = '';
    started = false;
  };
  while (at < text.length) {
    const char = text[at]!;
    if (char === '\\' && /^\r?\n/.test(text.slice(at + 1, at + 3))) {
      at += text[at + 1] === '\r' ? 3 : 2;
    } else if (/\s/.test(char)) {
      end();
      at += 1;
    } else if (char === "'") {
      const close = text.indexOf("'", at + 1);
      const stop = close < 0 ? text.length : close;
      word += text.slice(at + 1, stop);
      started = true;
      at = stop + 1;
    } else if (char === '$' && text[at + 1] === "'") {
      at += 2;
      while (at < text.length && text[at] !== "'") {
        if (text[at] === '\\' && at + 1 < text.length) {
          const escaped = text[at + 1]!;
          word += ANSI_ESCAPES[escaped] ?? escaped;
          at += 2;
        } else word += text[at++];
      }
      started = true;
      at += 1;
    } else if (char === '"') {
      at += 1;
      while (at < text.length && text[at] !== '"') {
        if (text[at] === '\\' && '"\\$`\n'.includes(text[at + 1] ?? '.')) {
          if (text[at + 1] !== '\n') word += text[at + 1];
          at += 2;
        } else word += text[at++];
      }
      started = true;
      at += 1;
    } else if (char === '\\') {
      word += text[at + 1] ?? '';
      started = true;
      at += 2;
    } else {
      word += char;
      started = true;
      at += 1;
    }
  }
  end();
  return words;
}

const ANSI_ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '\\': '\\',
  "'": "'",
  '"': '"',
};
