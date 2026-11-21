// cURL commands both ways: a request as one, for Traffic's Copy as cURL (curlCommand), and one
// read back into a request, for New rule (parseCurl). Nothing here runs a command.

// A request as a cURL command. The page made the request, so what's in it can't be trusted: the
// URL and the body are always in single quotes, and so is a method that isn't plain letters, so
// pasting the command into a shell runs curl and nothing else. A URL that starts with a dash is
// named with --url, so curl can't take it for an option either.
export function curlCommand({
  method,
  url,
  body = '',
}: {
  method: string;
  url: string;
  body?: string;
}) {
  const parts = ['curl'];
  if (url.startsWith('-')) parts.push('--url');
  parts.push(shellQuote(url));
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
function shellQuote(text: string) {
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
// the URL. curl has many more; a value this list misses is still passed over for the URL when
// another word has a scheme.
const TAKES_VALUE = new Set([
  '-A',
  '--user-agent',
  '-b',
  '--cookie',
  '-c',
  '--cookie-jar',
  '-C',
  '--continue-at',
  '-D',
  '--dump-header',
  '-e',
  '--referer',
  '-E',
  '--cert',
  '-F',
  '--form',
  '--form-string',
  '-K',
  '--config',
  '-m',
  '--max-time',
  '-o',
  '--output',
  '--output-dir',
  '-P',
  '--ftp-port',
  '-Q',
  '--quote',
  '-r',
  '--range',
  '-t',
  '--telnet-option',
  '-T',
  '--upload-file',
  '-u',
  '--user',
  '-U',
  '--proxy-user',
  '-w',
  '--write-out',
  '-x',
  '--proxy',
  '-y',
  '--speed-time',
  '-Y',
  '--speed-limit',
  '-z',
  '--time-cond',
  '--abstract-unix-socket',
  '--alt-svc',
  '--aws-sigv4',
  '--cacert',
  '--capath',
  '--ciphers',
  '--connect-timeout',
  '--connect-to',
  '--crlfile',
  '--delegation',
  '--dns-interface',
  '--dns-ipv4-addr',
  '--dns-ipv6-addr',
  '--dns-servers',
  '--doh-url',
  '--egd-file',
  '--engine',
  '--etag-compare',
  '--etag-save',
  '--expect100-timeout',
  '--happy-eyeballs-timeout-ms',
  '--hostpubmd5',
  '--hostpubsha256',
  '--hsts',
  '--interface',
  '--keepalive-time',
  '--key',
  '--key-type',
  '--krb',
  '--libcurl',
  '--limit-rate',
  '--local-port',
  '--login-options',
  '--mail-auth',
  '--mail-from',
  '--mail-rcpt',
  '--max-filesize',
  '--max-redirs',
  '--netrc-file',
  '--noproxy',
  '--oauth2-bearer',
  '--pass',
  '--pinnedpubkey',
  '--preproxy',
  '--proto',
  '--proto-default',
  '--proto-redir',
  '--proxy-cacert',
  '--proxy-capath',
  '--proxy-cert',
  '--proxy-cert-type',
  '--proxy-ciphers',
  '--proxy-crlfile',
  '--proxy-header',
  '--proxy-key',
  '--proxy-key-type',
  '--proxy-pass',
  '--proxy-pinnedpubkey',
  '--proxy-service-name',
  '--proxy-tls13-ciphers',
  '--proxy-tlsauthtype',
  '--proxy-tlspassword',
  '--proxy-tlsuser',
  '--proxy1.0',
  '--pubkey',
  '--random-file',
  '--rate',
  '--resolve',
  '--retry',
  '--retry-delay',
  '--retry-max-time',
  '--sasl-authzid',
  '--service-name',
  '--socks4',
  '--socks4a',
  '--socks5',
  '--socks5-gssapi-service',
  '--socks5-hostname',
  '--stderr',
  '--tls-max',
  '--tls13-ciphers',
  '--tlsauthtype',
  '--tlspassword',
  '--tlsuser',
  '--trace',
  '--trace-ascii',
  '--trace-config',
  '--unix-socket',
  '--url-query',
  '--variable',
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
// method, headers and body. null when it isn't a curl command or has no URL. The URL is --url's
// value, else the first bare word with a scheme (http://…), else the first bare word.
export function parseCurl(command: string): ParsedCurl | null {
  const words = shellWords(command);
  if (words[0]?.toLowerCase() !== 'curl') return null;
  let url = '';
  let method = '';
  let get = false;
  let head = false;
  const headers: [string, string][] = [];
  const data: string[] = [];
  const bare: string[] = [];
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
    else if (!word.startsWith('-')) bare.push(word);
  }
  url ||= bare.find((word) => /^[a-z][a-z0-9+.-]*:\/\//i.test(word)) ?? bare[0] ?? '';
  if (!url) return null;
  let verb = method;
  if (!verb) verb = head ? 'HEAD' : data.length && !get ? 'POST' : 'GET';
  return { url, method: verb.toUpperCase(), headers, body: data.join('&') };
}

// A command line's words as a POSIX shell splits them: '…' as it is, "…" with \" \\ \$ \`
// unescaped, $'…' with its escapes (\n, \t, \xHH, \uHHHH and the like, which Chrome's Copy as
// cURL writes), a \ before any other character, and a \ at the end of a line joining it to the
// next. Nothing is expanded.
function shellWords(text: string): string[] {
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
          const [piece, length] = ansiEscape(text, at + 1);
          word += piece;
          at += 1 + length;
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
  a: '\x07',
  b: '\b',
  e: '\x1b',
  E: '\x1b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '\\': '\\',
  "'": "'",
  '"': '"',
  '?': '?',
};

// The escape at `at`, just after a \ in $'…': what it stands for and how many characters it took.
// \xHH, \uHHHH and \UHHHHHHHH are hex, \NNN is octal; a character with no meaning stands for
// itself. One past U+10FFFF, where there are no characters, is the replacement character, U+FFFD.
function ansiEscape(text: string, at: number): [piece: string, length: number] {
  const char = text[at]!;
  const hex = { x: 2, u: 4, U: 8 }[char];
  if (hex) {
    const digits = /^[0-9a-f]{1,8}/i.exec(text.slice(at + 1, at + 1 + hex))?.[0];
    if (digits) {
      const code = parseInt(digits, 16);
      return [code > 0x10ffff ? '�' : String.fromCodePoint(code), 1 + digits.length];
    }
  }
  const octal = /^[0-7]{1,3}/.exec(text.slice(at, at + 3))?.[0];
  if (octal) return [String.fromCharCode(parseInt(octal, 8)), octal.length];
  return [ANSI_ESCAPES[char] ?? char, 1];
}
