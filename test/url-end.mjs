// Where a URL cut short in its middle keeps its end (src/lib/url-end.ts, for MiddleTruncate): the
// last segment of its path with a letter or a digit in it, from its slash, with what follows it,
// if that's 16 characters or fewer; or else the last 10 characters, moved back to start after a
// break within the last 16; and never between the two halves of an emoji. Each case is the text,
// then the head and the end it's cut into.
//
//   node test/url-end.mjs      (npm test runs it after test/time.mjs)
import { tailStart } from '../src/lib/index.ts';
import { check, expect, finish } from './fixtures.mjs';

const cut = (text) => {
  const at = tailStart(text);
  return [text.slice(0, at), text.slice(at)];
};
const cuts = (texts) => texts.map((text) => [text, ...cut(text)]);

await check(
  'a trailing slash, or one before a wildcard, no longer makes the end: the last segment with a letter or a digit in it does, with what follows it ("/42/", "/invoices/*", not "/" or "/*")',
  () => {
    expect(
      cuts([
        '/api/invoices/42/',
        'https://api.example.com/v1/customers/cus_123/invoices/',
        '*/api/v1/customers/*/invoices/*',
        '^/api/team/(.*)',
      ]),
      [
        ['/api/invoices/42/', '/api/invoices', '/42/'],
        [
          'https://api.example.com/v1/customers/cus_123/invoices/',
          'https://api.example.com/v1/customers/cus_123',
          '/invoices/',
        ],
        ['*/api/v1/customers/*/invoices/*', '*/api/v1/customers/*', '/invoices/*'],
        ['^/api/team/(.*)', '^/api', '/team/(.*)'],
      ],
    );
  },
);

await check(
  'a slash in the query string never makes the end: "…&return_to=/" ends "return_to=/", not "/"',
  () => {
    expect(cuts(['/oauth/callback?state=xyz&return_to=/', '/api/v1/items?filter=a/b']), [
      [
        '/oauth/callback?state=xyz&return_to=/',
        '/oauth/callback?state=xyz&',
        'return_to=/',
      ],
      ['/api/v1/items?filter=a/b', '/api/v1/items?', 'filter=a/b'],
    ]);
  },
);

await check(
  'an emoji, two code units, is never split between the head and the end',
  () => {
    const text = '/x/aaaaaaaaaa😀abcdefghi';
    const [head, end] = cut(text);
    expect(
      [head, end, /[\uD800-\uDBFF]$/.test(head), /^[\uDC00-\uDFFF]/.test(end)],
      ['/x/aaaaaaaaaa', '😀abcdefghi', false, false],
    );
  },
);

await check(
  'otherwise as before: a short last segment, or the last 10 characters moved back to a break; a text no longer than its end is all end',
  () => {
    expect(
      cuts([
        '/api/user',
        '/api/billing/invoices',
        '/api/user?id=7',
        '/api/search?q=invoices&page=2',
        '/api/v2/organizations/acme/billing/invoices?status=overdue',
        '/api/v2/organizations/acme/projects/checkout/members?role=owner&page=2',
        'POST /graphql GetInvoices',
        'api.example.com',
        '/graphql',
      ]),
      [
        ['/api/user', '/api', '/user'],
        ['/api/billing/invoices', '/api/billing', '/invoices'],
        ['/api/user?id=7', '/api', '/user?id=7'],
        ['/api/search?q=invoices&page=2', '/api/search?q=', 'invoices&page=2'],
        [
          '/api/v2/organizations/acme/billing/invoices?status=overdue',
          '/api/v2/organizations/acme/billing/invoices?',
          'status=overdue',
        ],
        [
          '/api/v2/organizations/acme/projects/checkout/members?role=owner&page=2',
          '/api/v2/organizations/acme/projects/checkout/members?role=',
          'owner&page=2',
        ],
        ['POST /graphql GetInvoices', 'POST /graphql ', 'GetInvoices'],
        ['api.example.com', 'api.', 'example.com'],
        ['/graphql', '', '/graphql'],
      ],
    );
  },
);

finish();
