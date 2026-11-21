// Shared by the Chromium test (e2e.mjs) and the Firefox/Zen test (firefox.mjs): the fake
// backend with its hostile pages, the rules under test, ghostfetch-mcp started as an agent starts
// it (agent.mjs too), and a tiny check/expect harness, which the release and UI kit checks
// (release.mjs, kit.mjs) use too.
import fs from 'node:fs';
import http from 'node:http';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRule } from '../src/shared/api/index.ts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The built extension under test; `npm test` and `npm run test:firefox` build it first.
export const CHROME_BUILD = path.join(ROOT, '.output', 'chrome-mv3');
export const FIREFOX_BUILD = path.join(ROOT, '.output', 'firefox-mv3');
export function requireBuild(dir) {
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
    throw new Error(
      `No build in ${path.relative(ROOT, dir)}. Run the tests through npm (npm test, npm run test:firefox, npm run test:kit), which builds first.`,
    );
  }
  return dir;
}

// The editor's own sources, for the /editor page: /src/... from src/ (TypeScript with its types
// stripped, as Node runs it) and /fonts/... from public/fonts/. Returns false for any other path.
// (URL parsing has already resolved any "..".)
const SOURCE_TYPES = {
  '.ts': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
};
export function sendSource(pathname, res) {
  const [dir, rest] = pathname.startsWith('/src/')
    ? [path.join(ROOT, 'src'), pathname.slice(5)]
    : pathname.startsWith('/fonts/')
      ? [path.join(ROOT, 'public', 'fonts'), pathname.slice(7)]
      : [];
  const file = dir && path.join(dir, rest);
  const type = file && SOURCE_TYPES[path.extname(file)];
  if (
    !type ||
    !file.startsWith(dir + path.sep) ||
    !fs.statSync(file, { throwIfNoEntry: false })?.isFile()
  )
    return false;
  const body = fs.readFileSync(file);
  res.writeHead(200, { 'content-type': type });
  res.end(file.endsWith('.ts') ? stripTypeScriptTypes(body.toString('utf8')) : body);
  return true;
}
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ------------------------------------------------------------ fake backend

// Just over 1 MB of JSON, of which the traffic log keeps the first 1 MB: /heavy's responses.
const HEAVY = `[${Array(16_000)
  .fill('{"id":1,"name":"Item","email":"user@example.com","status":"active"}')
  .join(',')}]`;
// About 70 KB of NDJSON, which /api/stream sends 50 times a second.
const TICKS = `${JSON.stringify({ event: 'tick', data: 'x'.repeat(200) })}\n`.repeat(300);
// Every byte value, eight times over: /api/bytes. Not UTF-8, so it only comes out the same if
// it's passed on as bytes.
const BYTES = Buffer.from(Array.from({ length: 2048 }, (_, index) => index % 256));
// "Привет" in windows-1251: /api/cp1251, which names that charset.
const CP1251 = Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);

// Listens on 127.0.0.1. EVIL_ORIGIN and LOCAL_ORIGIN are the same server under a non-localhost
// name and under a local.* name; each test maps both to 127.0.0.1 in its own browser.
export async function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const json = (status, data) => {
        res.writeHead(status, { 'content-type': 'application/json', 'x-real': 'yes' });
        res.end(JSON.stringify(data));
      };
      if (url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html' });
        // The host is in the title so the tab picker test can tell localhost and evil.test apart.
        res.end(
          `<!doctype html><title>Test app on ${req.headers.host}</title><h1>Test app</h1><script>window.early = fetch("/api/early").then((r) => r.json());</script>`,
        );
      } else if (url.pathname === '/steal') {
        // A hostile page whose first inline script tries to grab Ghostfetch's rule channel.
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<!doctype html><script>
          window.stolen = [];
          addEventListener('message', (e) => {
            if (e.data?.ghostfetch !== 'port' || !e.ports[0]) return;
            e.stopImmediatePropagation();
            stolen.push('port');
            e.ports[0].onmessage = ({ data }) => stolen.push(data.type + ': ' + (data.rules || []).length + ' rules');
          }, true);
        </script><title>steal</title>`);
      } else if (url.pathname === '/steal-patched') {
        // Like /steal, but the first inline script also replaces every built-in a naive handoff
        // would touch at event time, and notes each call that would hand it Ghostfetch's port:
        // the MessageEvent getters, propagation, listener removal, the port's onmessage setter
        // and postMessage, and array iteration (destructuring the ports array).
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<!doctype html><script>
          window.stolen = [];
          const note = (what) => stolen.push(what);
          const portsOf = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'ports').get;
          for (const key of ['data', 'ports', 'source']) {
            const real = Object.getOwnPropertyDescriptor(MessageEvent.prototype, key).get;
            Object.defineProperty(MessageEvent.prototype, key, { configurable: true, get() {
              if (portsOf.call(this).length) note(key + ' getter');
              return real.call(this);
            } });
          }
          const handler = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage');
          Object.defineProperty(MessagePort.prototype, 'onmessage', { configurable: true, get: handler.get, set(fn) { note('onmessage setter'); handler.set.call(this, fn); } });
          const post = MessagePort.prototype.postMessage;
          MessagePort.prototype.postMessage = function (...args) { note('port.postMessage'); return post.apply(this, args); };
          const stop = Event.prototype.stopImmediatePropagation;
          Event.prototype.stopImmediatePropagation = function () { if (this.type === 'message') note('stopImmediatePropagation'); return stop.call(this); };
          const remove = EventTarget.prototype.removeEventListener;
          EventTarget.prototype.removeEventListener = function (type, ...rest) { if (type === 'message') note('removeEventListener'); return remove.call(this, type, ...rest); };
          const iterate = Array.prototype[Symbol.iterator];
          Array.prototype[Symbol.iterator] = function () { if (Array.prototype.some.call(this, (item) => item instanceof MessagePort)) note('array iterator'); return iterate.call(this); };
          addEventListener('message', (e) => { if (e.ports.length) note('page listener got a port'); }, true);
        </script><title>steal-patched</title>`);
      } else if (url.pathname === '/steal-forged') {
        // No patching at all: the first inline script dispatches a MessageEvent it built itself,
        // shaped like the bridge's offer, before the real offer arrives. Then it waits for the
        // real one in case the interceptor took the bait and stopped listening.
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<!doctype html><script>
          window.stolen = [];
          const fake = new MessageChannel();
          fake.port1.onmessage = ({ data }) => stolen.push('fake port received ' + data.type);
          const forged = new MessageEvent('message', { data: { ghostfetch: 'port' }, source: window, ports: [fake.port2] });
          try { Object.defineProperty(forged, 'isTrusted', { get: () => true }); } catch {}
          dispatchEvent(forged);
          dispatchEvent(new Event('message'));
          addEventListener('message', (e) => {
            if (e.data?.ghostfetch !== 'port' || !e.ports[0]) return;
            stolen.push('real port');
            e.ports[0].onmessage = ({ data }) => stolen.push('real port received ' + data.type);
          });
        </script><title>steal-forged</title>`);
      } else if (url.pathname === '/steal-caller') {
        // Replaces built-ins the interceptor calls while it answers an XMLHttpRequest a rule
        // matched, and has each one ask who called it (fn.caller), as a page could to reach the
        // interceptor's functions and their arguments, such as the rule. attack() makes the
        // request and returns the mocked response and what the built-ins got. Its decoy, a
        // function of the page's own, shows that .caller does work in this browser.
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<!doctype html><script>
          const stolen = [];
          let watching = false;
          for (const [owner, key] of [
            [String.prototype, 'toUpperCase'], [String.prototype, 'includes'], [String.prototype, 'trim'],
            [Headers.prototype, 'set'], [Set.prototype, 'has'], [Object, 'defineProperty'],
            [Array.prototype, Symbol.iterator],
          ]) {
            const real = owner[key];
            owner[key] = function patched() {
              if (watching) {
                try {
                  const caller = patched.caller;
                  if (caller && caller !== attack) stolen.push(caller.name || String(caller).slice(0, 60));
                } catch {}
              }
              return real.apply(this, arguments);
            };
          }
          function decoy() { return 'decoy '.trim(); }
          function attack() {
            const xhr = new XMLHttpRequest();
            const loaded = new Promise((resolve) => (xhr.onload = () => resolve(JSON.parse(xhr.responseText))));
            watching = true;
            try {
              decoy();
              xhr.open('GET', '/api/user?case=replace');
              xhr.send();
            } finally {
              watching = false;
            }
            return loaded.then((response) => ({ response, stolen }));
          }
        </script><title>steal-caller</title>`);
      } else if (url.pathname === '/heavy') {
        // 70 responses of just over 1 MB: a log longer than Chrome passes in one message (64 MiB).
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<!doctype html><title>Heavy app on ${req.headers.host}</title><script>
          window.done = (async () => {
            for (let i = 0; i < 70; i += 7)
              await Promise.all(Array.from({ length: 7 }, (_, k) => fetch('/api/heavy/' + (i + k)).then((r) => r.text())));
          })();
        </script>`);
      } else if (url.pathname === '/stream') {
        // Reads a stream that doesn't end, as an app watching a log or a feed does, and counts it.
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<!doctype html><title>Stream on ${req.headers.host}</title><script>
          window.received = 0;
          fetch('/api/stream').then(async (response) => {
            const reader = response.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              window.received += value.length;
            }
          });
        </script>`);
      } else if (url.pathname === '/early-xhr') {
        // XMLHttpRequests in the page's first script, before Ghostfetch has its rules: one
        // aborted at once (to the server, and to a URL a rule answers), and one opened and sent
        // again. `seen` is what the page got of each.
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<!doctype html><title>Early XHR on ${req.headers.host}</title><script>
          window.seen = { aborted: [], mocked: [], reopened: null };
          for (const [name, target] of [['aborted', '/api/echo?early=aborted'], ['mocked', '/api/early?early=aborted']]) {
            const request = new XMLHttpRequest();
            for (const type of ['loadstart', 'load', 'abort', 'loadend'])
              request.addEventListener(type, () => seen[name].push(type));
            request.open('POST', target);
            request.send('never');
            request.abort();
          }
          const reopened = new XMLHttpRequest();
          reopened.addEventListener('load', () => { seen.reopened = JSON.parse(reopened.responseText).body; });
          reopened.open('POST', '/api/echo?early=first');
          reopened.send('first');
          reopened.open('POST', '/api/echo?early=second');
          reopened.send('second');
        </script>`);
      } else if (url.pathname === '/burst') {
        // 150 requests as the page starts. An image holds its load open for 400 ms, so a Traffic
        // view that connects again after a reload (200 ms later) finds them all in the log so far.
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<!doctype html><title>Burst on ${req.headers.host}</title><script>
          window.done = Promise.all(Array.from({ length: 150 }, (_, n) => fetch('/api/user?burst=' + n).then((r) => r.text())));
        </script><img src="/api/held">`);
      } else if (url.pathname === '/api/held') {
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'image/gif' });
          res.end();
        }, 400);
      } else if (url.pathname === '/__control') {
        // A blank page the Firefox test drives its storage hook from.
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<!doctype html><title>control</title>');
      } else if (url.pathname === '/editor') {
        // The body editor with the Vim switch on, on a plain page, for the Firefox test: Firefox's
        // automation can't open extension pages, but it can load the same code from /src/.
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<!doctype html><title>editor</title><link rel="stylesheet" href="/src/app/styles/theme.css"><link rel="stylesheet" href="/src/body-editor/code-editor.css"><div style="width:640px"></div>
          <script type="module">
            import { createCodeEditor } from '/src/body-editor/engine/code-editor.ts';
            import { checkJson, formatJson } from '/src/lib/json.ts';
            localStorage.setItem('ghostfetch.vim', '1');
            window.createCodeEditor = createCodeEditor;
            window.checkJson = checkJson;
            window.formatJson = formatJson;
            window.editor = createCodeEditor({ value: ${JSON.stringify(VIM_START)} });
            document.querySelector('div').append(window.editor.root);
            window.editor.textarea.focus();
          </script>`);
      } else if (sendSource(url.pathname, res)) {
        // served
      } else if (url.pathname === '/api/user')
        json(200, {
          id: 1,
          name: 'Real',
          role: 'user',
          profile: { city: 'Riga', age: 30 },
          tags: ['a', 'b'],
        });
      else if (url.pathname === '/api/early') json(200, { early: 'real' });
      else if (url.pathname === '/api/echo')
        json(200, { method: req.method, headers: req.headers, body });
      else if (url.pathname === '/api/new-home') json(200, { redirected: true });
      else if (url.pathname === '/graphql') json(200, { data: { real: true } });
      else if (url.pathname.startsWith('/api/heavy/')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(HEAVY);
      } else if (url.pathname === '/api/bytes') {
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        res.end(BYTES);
      } else if (url.pathname === '/api/cp1251') {
        res.writeHead(200, { 'content-type': 'text/plain; charset=windows-1251' });
        res.end(CP1251);
      } else if (url.pathname === '/api/slow') {
        // Its first line at once and its last 600 ms later (or ?ms= later): a response that
        // arrives over time.
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.write('first\n');
        setTimeout(() => res.end('last\n'), Number(url.searchParams.get('ms')) || 600);
      } else if (url.pathname === '/api/stream') {
        // No Content-Length, and no end: about 3.5 MB a second for as long as the page is open.
        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
        const timer = setInterval(() => res.write(TICKS), 20);
        res.on('close', () => clearInterval(timer));
      } else json(404, { error: 'not found' });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    server,
    ORIGIN: `http://127.0.0.1:${port}`,
    EVIL_ORIGIN: `http://evil.test:${port}`,
    LOCAL_ORIGIN: `http://local.ghostfetch.test:${port}`,
  };
}

// ------------------------------------------------------------ rules under test

function rule(match, patch = {}) {
  const base = createRule();
  Object.assign(base.match, match);
  for (const [key, value] of Object.entries(patch)) Object.assign(base[key], value);
  return base;
}

// A redirect, header or block rule as 0.8 stored it, before 0.9.0 took those types out.
function oldRule(type, match, fields = {}) {
  return {
    ...rule(match),
    type,
    redirect: { to: '' },
    headers: { request: [], response: [] },
    ...fields,
  };
}

// `origin` is the test server, which the old redirect rule points at.
export function testRules(origin) {
  return [
    rule({ url: '/api/early' }, { response: { body: '{"early":"mocked"}' } }),
    rule(
      { url: '/api/user?case=replace', mode: 'equals' },
      {
        response: {
          body: '{"name":"Mocked"}',
          status: '404',
          headers: [{ op: 'set', name: 'X-Mock', value: 'yes' }],
        },
      },
    ),
    // A Merge and a Script rule as 0.7 stored them, before 0.8.0 took both out: they keep the
    // server's body now, and their JSON or script does nothing.
    rule(
      { url: 'case=merge' },
      {
        response: {
          bodyMode: 'merge',
          merge: '{"role":"admin","profile":{"city":"Berlin"},"tags":["z"]}',
        },
      },
    ),
    rule(
      { url: 'case=script' },
      {
        response: {
          bodyMode: 'script',
          script:
            'response.name = response.name.toUpperCase();\nresponse.sawUrl = request.url.includes("case=script");\nreturn response;',
        },
      },
    ),
    // Keeps the server's body of a request that can't reach any server (port 1 is closed, and
    // browsers refuse it anyway): the page gets the network error, and Traffic a "Rule error".
    rule({ url: '127.0.0.1:1/' }, { response: { bodyMode: 'original' } }),
    rule(
      { url: 'case=delay' },
      { response: { bodyMode: 'original', delay: 600, status: '503' } },
    ),
    rule(
      { url: '/graphql', graphqlOperation: 'GetUser' },
      { response: { body: '{"data":{"user":"mocked"}}' } },
    ),
    rule(
      { url: 'case=method', method: 'POST' },
      { response: { body: '{"post":"mocked"}' } },
    ),
    rule(
      { url: '*/api/user?case=wild*', mode: 'wildcard' },
      { response: { body: '{"wild":true}' } },
    ),
    rule(
      { url: 'case=regex\\d+$', mode: 'regex' },
      { response: { body: '{"regex":true}' } },
    ),
    // Keeps the server's body and sets nothing: the page gets the server's own response.
    rule({ url: 'case=keep' }, { response: { bodyMode: 'original' } }),
    // Keeps the server's body under a header of its own: a new response around that body.
    rule(
      { url: 'case=kept-header' },
      {
        response: {
          bodyMode: 'original',
          headers: [{ op: 'set', name: 'X-Kept', value: 'yes' }],
        },
      },
    ),
    // Sets four headers, of which the browser lets one through: a value that isn't Latin-1, a
    // name with a colon in it (pasted as "Name: value"), and Set-Cookie, which no page sees.
    rule(
      { url: 'case=bad-headers' },
      {
        response: {
          body: '{"ok":true}',
          headers: [
            { op: 'set', name: 'X-Ok', value: 'yes' },
            { op: 'set', name: 'X-Greeting', value: 'Привет' },
            { op: 'set', name: 'Content-Type:', value: 'text/plain' },
            { op: 'set', name: 'Set-Cookie', value: 'session=abc' },
          ],
        },
      },
    ),
    {
      ...rule({ url: 'case=disabled' }, { response: { body: '{"disabled":"mocked"}' } }),
      enabled: false,
    },
    // A redirect, a header and a block rule as 0.8 stored them: they do nothing now, and the
    // editor leaves them out.
    oldRule(
      'redirect',
      { url: '/api/old-home' },
      { redirect: { to: `${origin}/api/new-home` } },
    ),
    oldRule(
      'headers',
      { url: '/api/echo' },
      {
        headers: {
          request: [{ op: 'set', name: 'X-Debug', value: '1' }],
          response: [{ op: 'set', name: 'X-Resp', value: 'ok' }],
        },
      },
    ),
    oldRule('block', { url: '/api/blocked' }),
  ];
}

// ------------------------------------------------------------ vim mode

// One editing session with the Vim switch on, shared by the Chromium and the Zen test so both
// engines run the same edits: their editing commands, undo and selections differ. Each step is
// the keys typed, the body after it (null: unchanged), the cursor (line:column) and the status
// line's message. The same keys typed into vim 9.1 give the same bodies and cursors, but where
// Ghostfetch differs on purpose: only a yank fills the register (x, d, c and putting over a
// selection leave it), Space is the leader (Space s formats and saves), and :w saves.
const lines = (...rows) => rows.join('\n');
export const VIM_START = lines(
  '{',
  '  "name": "Ada",',
  '  "role": "admin",',
  '  "tags": [1, 2, 3]',
  '}',
);
const renamed = lines(
  '{',
  '  "full_name": "Ada",',
  '  "role": "owner",',
  '  "tags": [1, 2, 3]',
  '}',
);
const shifted = lines(
  '{',
  '  "full_name": "Ada",',
  '    "role": "owner",',
  '      "tags": [1, 2, 3]',
  '}',
);
// `shifted` after Space s, which formats it.
const formatted = lines(
  '{',
  '  "full_name": "Ada",',
  '  "role": "owner",',
  '  "tags": [',
  '    1,',
  '    2,',
  '    3',
  '  ]',
  '}',
);
export const VIM_STEPS = [
  ['gg', null, '1:1'],
  ['jw', null, '2:3'],
  [
    'ci"full_name<Esc>',
    lines('{', '  "full_name": "Ada",', '  "role": "admin",', '  "tags": [1, 2, 3]', '}'),
    '2:12',
  ],
  ['j0fa', null, '3:12'],
  ['ci"owner<Esc>', renamed, '3:16'],
  // A change and its Insert mode are one undo step, though Chrome makes one per letter typed.
  [
    'u',
    lines('{', '  "full_name": "Ada",', '  "role": "admin",', '  "tags": [1, 2, 3]', '}'),
    '3:12',
  ],
  ['<C-r>', renamed, '3:12'],
  ['j$', null, '4:19'],
  [
    'di[',
    lines('{', '  "full_name": "Ada",', '  "role": "owner",', '  "tags": []', '}'),
    '4:12',
  ],
  ['u', renamed, '4:12'],
  [
    '<C-r>',
    lines('{', '  "full_name": "Ada",', '  "role": "owner",', '  "tags": []', '}'),
    '4:12',
  ],
  ['u', renamed, '4:12'],
  ['ggyyGp', `${renamed}\n{`, '6:1'],
  ['dd', renamed, '5:1'],
  [
    'kVk>',
    lines(
      '{',
      '  "full_name": "Ada",',
      '    "role": "owner",',
      '    "tags": [1, 2, 3]',
      '}',
    ),
    '3:5',
  ],
  [
    '.',
    lines(
      '{',
      '  "full_name": "Ada",',
      '      "role": "owner",',
      '      "tags": [1, 2, 3]',
      '}',
    ),
    '3:7',
  ],
  ['<<', shifted, '3:5'],
  ['/own<CR>', null, '3:14'],
  ['n', null, '3:14', 'Search hit the bottom, continuing at the top'],
  [':2<CR>', null, '2:3'],
  ['x', shifted.replace('"full_name"', 'full_name"'), '2:3'],
  // x left the register as it was, so p puts the line yanked before (vim would put the ").
  [
    'p',
    lines(
      '{',
      '  full_name": "Ada",',
      '{',
      '    "role": "owner",',
      '      "tags": [1, 2, 3]',
      '}',
    ),
    '3:1',
  ],
  ['u', shifted.replace('"full_name"', 'full_name"'), '2:3'],
  ['u', shifted, '2:3'],
  ['gg%', null, '5:1'],
  ['di{', lines('{', '}'), '2:1'],
  ['u', shifted, '2:1'],
  [':w<CR>', null, '2:1', 'Saved'],
  // Space s formats the body and saves it; Space and another key is Space's move and that key.
  [' s', formatted, '2:1', 'Formatted and saved'],
  [' l', null, '2:3'],
  // "owner" yanked goes over "full_name", and then over "Ada" too.
  [':3<CR>2f"lyiw', null, '3:12'],
  ['kviwp', formatted.replace('"full_name"', '"owner"'), '2:8'],
  ['fAviwp', formatted.replace('"full_name": "Ada"', '"owner": "owner"'), '2:17'],
];

// Splits a step such as 'ci"x<Esc>' into keys: single characters, or <Esc>, <CR>, <C-r>...
export const vimKeys = (keys) => keys.match(/<(?:Esc|CR|BS|Del|C-[a-z])>|[\s\S]/g);

// A body of `count` items, each on a line of its own and compact inside, which Format spreads
// over six lines each, written as PHP writes JSON: slashes escaped, and prices with a .0, which
// Format keeps as they are. Format puts 80 items in directly (more than 300 lines once formatted,
// which the browser can't undo), and 40 as an edit the browser can.
export const itemsBody = (count) =>
  `{"items": [\n${Array.from(
    { length: count },
    (_, id) =>
      `  {"id": ${id}, "name": "item ${id}", "url": "https:\\/\\/api.example.com\\/items\\/${id}", "price": ${id}.0}`,
  ).join(',\n')}\n]}`;

// A body for Wrap, which both the Chromium and the Zen test wrap: prose, a token with no spaces,
// emoji, CJK, lines that start with a tab, over and over so the body is taller than the editor,
// and a comma missing after a line that wraps.
const WRAP_VALUES = [
  '"A long line of prose that goes on and on, well past the width of the editor, so it has to wrap between its words."',
  `"${'eyJhbGciOiJIUzI1NiJ9'.repeat(8)}"`,
  '"🙂 smile 🚀 rocket 👩‍💻 dev 🇩🇪 flag, and again 🙂🚀👩‍💻🇩🇪 four of them in a row, and more words to wrap"',
  '"日本語のテキストはとても長くて、エディターの幅を超えて折り返す必要があります。中文也一样需要换行显示。"',
];
export const WRAP_BODY = lines(
  '{',
  ...Array.from(
    { length: 16 },
    (_, index) =>
      `${index % 2 ? '\t' : '  '}"k${index}": ${WRAP_VALUES[index % WRAP_VALUES.length]},`,
  ),
  '  "missing": "a value well past the editor\'s width, with spaces so it wraps between its words, then no comma"',
  '  "end": 1',
  '}',
);

// Run in the page (it uses nothing else): everything that has to wrap alike with Wrap on,
// measured in the first body editor. Rows of the textarea's text, of the gutter's rows and of the
// coloured layer (less the row its trailing line breaks add); whether each line's row starts
// where the line does in the coloured layer; what's left to scroll sideways; and whether vim's
// block and the mistake's mark in WRAP_BODY are on their characters.
export function wrapLayout() {
  const root = document.querySelector('.code');
  const textarea = root.querySelector('textarea');
  const style = getComputedStyle(textarea);
  const lh = parseFloat(style.lineHeight);
  const layer = root.querySelector('.code-highlight .code-text');
  const rows = [...root.querySelectorAll('.code-row')];
  const top = (element) => element.getBoundingClientRect().top;
  // A character's box in the coloured layer, whatever tokens it's in (none for an offset that
  // isn't in the text: a body without WRAP_BODY's mistake).
  const box = (offset) => {
    if (offset < 0) return null;
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    let at = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (offset < at + node.data.length) {
        const range = document.createRange();
        range.setStart(node, offset - at);
        range.setEnd(node, offset - at + 1);
        return range.getBoundingClientRect();
      }
      at += node.data.length;
    }
    return null;
  };
  const on = (got, want) =>
    Boolean(got && want) &&
    Math.abs(got.left - want.left) < 0.5 &&
    Math.abs(got.top - want.top) < 0.5;
  const text = textarea.value;
  const starts = [0];
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1))
    starts.push(at + 1);
  const rowOf = (rect) => Math.floor((rect.top + rect.height / 2 - top(layer)) / lh);
  const mark = root.querySelector('.code-error');
  const block = root.querySelector('.code-cursor .cursor');
  return {
    wrapped: root.hasAttribute('data-wrap'),
    stored: localStorage.getItem('ghostfetch.wrap'),
    sideways: textarea.scrollWidth - textarea.clientWidth,
    rows: [
      Math.round(
        (textarea.scrollHeight -
          parseFloat(style.paddingTop) -
          parseFloat(style.paddingBottom)) /
          lh,
      ),
      rows.length
        ? Math.round((rows.at(-1).getBoundingClientRect().bottom - top(rows[0])) / lh)
        : null,
      Math.round(layer.getBoundingClientRect().height / lh) - 1,
    ],
    starts:
      rows.length === starts.length &&
      starts.every(
        (start, index) =>
          rowOf(box(start)) === Math.round((top(rows[index]) - top(rows[0])) / lh),
      ),
    block: on(block?.getBoundingClientRect(), box(textarea.selectionStart)),
    mark: on(mark?.getClientRects()[0], box(text.indexOf('"a value well past'))),
  };
}

// The rows wrapLayout() measured agree, and there are enough of them to have wrapped.
export const rowsAgree = ([textarea, gutter, layer]) =>
  textarea === gutter && gutter === layer && textarea > 20;

// A body for Wrap whose long lines are many short tokens, each coloured in a span of its own: a
// list of numbers on one line and a list of objects on another, as a body that isn't laid out has
// them, and lines after them so the body is taller than the editor.
export const WRAP_TOKENS = lines(
  '{',
  `  "values": [${Array.from({ length: 120 }, (_, at) => at * 7).join(', ')}],`,
  `  "users": ${JSON.stringify(
    Array.from({ length: 6 }, (_, id) => ({
      id,
      name: `User ${id}`,
      roles: ['admin', 'editor'],
      active: id % 2 === 0,
      tags: [1, 2, 3, 4, 5],
    })),
  )},`,
  ...Array.from({ length: 40 }, (_, at) => `  "f${at}": ${at},`),
  '  "end": 1',
  '}',
);

// Run in the page: with Wrap on, the room the first body editor's text has across (the textarea's
// width less its scrollbar and the padding the layers over it have), a character's width, and
// the width the editor has the text wrap at, which it keeps half a character clear of a whole
// number of characters (code-editor.ts, setWrapWidth()).
export function wrapRoom() {
  const root = document.querySelector('.code');
  const textarea = root.querySelector('textarea');
  const text = root.querySelector('.code-highlight .code-text');
  const padding = getComputedStyle(text.parentElement);
  const style = getComputedStyle(textarea);
  const ruler = document.createElement('canvas').getContext('2d');
  ruler.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return {
    room:
      textarea.getBoundingClientRect().width -
      (textarea.offsetWidth - textarea.clientWidth) -
      parseFloat(padding.paddingLeft) -
      parseFloat(padding.paddingRight),
    character: ruler.measureText('0'.repeat(20)).width / 20,
    wraps: parseFloat(text.style.width),
  };
}

// Run in the page: makes the box the first body editor is in `by` px narrower than it would be (0
// for as wide as it would be).
export function narrowEditor(by) {
  const box = document.querySelector('.code').parentElement;
  box.style.maxWidth = '';
  if (by) box.style.maxWidth = `${box.getBoundingClientRect().width - by}px`;
}

// Run in the page: with Wrap on, where a new row starts inside a line, in the line numbers' rows
// (plain text, a node a line, as the textarea has its text) and in the coloured layer (a span a
// token): how many such places the plain rows have, and how many only one of the two has.
export function wrapBreaks() {
  const root = document.querySelector('.code');
  const lh = parseFloat(getComputedStyle(root.querySelector('textarea')).lineHeight);
  const range = document.createRange();
  // Among the characters of `nodes` (text nodes, in order, the first at `base`), the offsets of
  // those drawn lower than the one before in their line.
  const starts = (nodes, base) => {
    const found = [];
    let at = base;
    let last = null;
    for (const node of nodes) {
      for (let index = 0; index < node.data.length; index++, at++) {
        if (node.data[index] === '\n') {
          last = null;
          continue;
        }
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const box = range.getClientRects()[0];
        if (!box?.width) continue;
        if (last !== null && box.top > last + lh / 2) found.push(at);
        last = box.top;
      }
    }
    return found;
  };
  const plain = [];
  let offset = 0;
  for (const row of root.querySelectorAll('.code-row')) {
    const node = row.firstChild;
    if (node) plain.push(...starts([node], offset));
    offset += (node?.data.length ?? 0) + 1;
  }
  const walker = document.createTreeWalker(
    root.querySelector('.code-highlight .code-text'),
    NodeFilter.SHOW_TEXT,
  );
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
  const coloured = new Set(starts(nodes, 0));
  const shared = plain.filter((at) => coloured.has(at)).length;
  return { breaks: plain.length, astray: plain.length + coloured.size - 2 * shared };
}

// ------------------------------------------------------------ Agent access

// ghostfetch-mcp (mcp/), whose packages (the MCP client an agent would be, among them) are its own:
// `npm install --prefix mcp`.
const MCP_DIR = path.join(ROOT, 'mcp');
export const AGENT_READY = fs.existsSync(path.join(MCP_DIR, 'node_modules'));
// The pairing code in what ghostfetch-mcp says while no editor is connected.
export const PAIRING_CODE = /\b(\d+-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3})\b/;

// A port nothing listens on, for ghostfetch-mcp.
export function freePort() {
  return new Promise((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// ghostfetch-mcp, started as an agent starts it (over stdio, by a real MCP client), on `port`, with
// its token in `tokenFile`; and tool(name, args), which calls a tool and gives back what it
// returned (its JSON), or { error } with the error's words, or { text } for words that aren't JSON.
export async function startAgent({ port, tokenFile }) {
  const fromMcp = createRequire(path.join(MCP_DIR, 'package.json'));
  const { Client } = fromMcp('@modelcontextprotocol/client');
  const { StdioClientTransport } = fromMcp('@modelcontextprotocol/client/stdio');
  const client = new Client({ name: 'ghostfetch-test', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.join(MCP_DIR, 'ghostfetch-mcp.mjs')],
      env: {
        ...process.env,
        GHOSTFETCH_AGENT_PORT: String(port),
        GHOSTFETCH_AGENT_TOKEN_FILE: tokenFile,
      },
      stderr: 'pipe',
    }),
  );
  return {
    async tool(name, args = {}) {
      const result = await client.callTool({ name, arguments: args });
      const text = result.content.map((part) => part.text).join('\n');
      if (result.isError) return { error: text };
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    },
    close: () => client.close(),
  };
}

// ------------------------------------------------------------ harness

const results = [];

export async function check(name, fn) {
  try {
    await fn();
    results.push([true, name]);
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push([false, name]);
    console.log(
      `  ✗ ${name}\n      ${String(error.message || error)
        .split('\n')
        .join('\n      ')}`,
    );
  }
}

export function expect(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label ? `${label}: ` : ''}expected ${e}, got ${a}`);
}

// Prints the totals and exits non-zero if anything failed.
export function finish() {
  const failed = results.filter(([ok]) => !ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
