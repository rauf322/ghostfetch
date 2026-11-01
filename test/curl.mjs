// Traffic's Copy as cURL, without a browser: the command for a request, and that nothing the page
// put in the request can make a shell run anything but curl when the command is pasted.
//
//   node test/curl.mjs      (npm test runs it after test/matching.mjs)
import { execFileSync } from 'node:child_process';
import { curlCommand } from '../src/shared/lib/curl.ts';
import { check, expect, finish } from './fixtures.mjs';

const URL = 'https://api.example.test/api/users?page=2';

await check('a GET is the URL alone, in quotes', () => {
  expect(curlCommand({ method: 'GET', url: URL }), `curl '${URL}'`);
});

await check('a POST with a JSON body: the body and its Content-Type, no -X', () => {
  expect(
    curlCommand({ method: 'post', url: URL, body: '{"name":"Ada"}' }),
    `curl '${URL}' -H 'content-type: application/json' --data-raw '{"name":"Ada"}'`,
  );
});

await check('another method with a body, or without one, says so with -X', () => {
  expect(
    [
      curlCommand({ method: 'PUT', url: URL, body: 'name=Ada' }),
      curlCommand({ method: 'DELETE', url: URL }),
      curlCommand({ method: 'POST', url: URL }),
    ],
    [
      `curl '${URL}' -X PUT --data-raw 'name=Ada'`,
      `curl '${URL}' -X DELETE`,
      `curl '${URL}' -X POST`,
    ],
  );
});

// What a shell makes of the command: the words it hands curl. `printf` stands in for curl, so
// nothing goes over the network; a word the page slipped out of its quotes would show up as an
// extra word, or run.
const words = (command) =>
  execFileSync('/bin/sh', ['-c', `printf '%s\\n' ${command.replace(/^curl /, '')}`], {
    encoding: 'utf8',
  })
    .split('\n')
    .slice(0, -1);

await check(
  "a page's quotes, $(…), backticks and ; stay inside the words they're in",
  () => {
    const url = `${URL}&q=it's'$(touch /tmp/gf-pwned)\`id\`;rm -rf ~`;
    const body = `{"a":"'; echo pwned; '"}`;
    const method = 'GET; echo pwned';
    expect(words(curlCommand({ method, url, body })), [
      url,
      '-X',
      'GET; ECHO PWNED',
      '-H',
      'content-type: application/json',
      '--data-raw',
      body,
    ]);
  },
);

finish();
