// Shared by the Chromium test (e2e.mjs) and the Firefox/Zen test (firefox.mjs): the fake
// backend with its hostile pages, the rules under test, and a tiny check/expect harness, which
// the release and UI kit checks (release.mjs, kit.mjs) use too.
import fs from 'node:fs';
import http from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
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
      } else if (url.pathname === '/__control') {
        // A blank page the Firefox test drives its storage hook from.
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<!doctype html><title>control</title>');
      } else if (url.pathname === '/editor') {
        // The body editor with the Vim switch on, on a plain page, for the Firefox test: Firefox's
        // automation can't open extension pages, but it can load the same code from /src/.
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<!doctype html><title>editor</title><link rel="stylesheet" href="/src/app/styles/theme.css"><link rel="stylesheet" href="/src/shared/ui/code-editor/code-editor.css"><div style="width:640px"></div>
          <script type="module">
            import { createCodeEditor } from '/src/shared/ui/code-editor/engine/code-editor.ts';
            localStorage.setItem('ghostfetch.vim', '1');
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
      else json(404, { error: 'not found' });
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
// line's message. The same keys typed into vim 9.1 give the same bodies and cursors.
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
  ['p', shifted.replace('"full_name"', 'f"ull_name"'), '2:4'],
  ['u', shifted.replace('"full_name"', 'full_name"'), '2:3'],
  ['u', shifted, '2:3'],
  ['gg%', null, '5:1'],
  ['di{', lines('{', '}'), '2:1'],
  ['u', shifted, '2:1'],
  [':w<CR>', null, '2:1', 'Changes save automatically'],
];

// Splits a step such as 'ci"x<Esc>' into keys: single characters, or <Esc>, <CR>, <C-r>...
export const vimKeys = (keys) => keys.match(/<(?:Esc|CR|BS|Del|C-[a-z])>|[\s\S]/g);

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
