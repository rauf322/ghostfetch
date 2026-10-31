// Rebuilds Ghostfetch from its sources zip the way a Mozilla reviewer would, in a clean folder,
// and checks the result is byte for byte the Firefox build in .output/firefox-mv3. Run it after
// `npm run zip`, before uploading:
//
//   node scripts/check-sources.mjs            rebuild with this machine's Node
//   node scripts/check-sources.mjs --docker   rebuild in a clean Linux container (node:24)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const SOURCES = path.join(ROOT, 'web-ext-artifacts', `ghostfetch-${version}-sources.zip`);
const BUILD = path.join(ROOT, '.output', 'firefox-mv3');
const docker = process.argv.includes('--docker');

if (!fs.existsSync(SOURCES) || !fs.existsSync(BUILD)) {
  console.error(
    `Missing ${path.relative(ROOT, SOURCES)} or ${path.relative(ROOT, BUILD)}: run npm run zip first.`,
  );
  process.exit(1);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostfetch-sources-'));
const run = (command, args, cwd = dir) =>
  execFileSync(command, args, { cwd, stdio: ['ignore', 'ignore', 'inherit'] });
try {
  run('unzip', ['-q', SOURCES]);
  console.log(
    `Rebuilding ${path.basename(SOURCES)} in ${dir}${docker ? ' (Docker, node:24)' : ` (Node ${process.version})`}…`,
  );
  if (docker)
    run('docker', [
      'run',
      '--rm',
      '-v',
      `${dir}:/src`,
      '-w',
      '/src',
      'node:24',
      'sh',
      '-c',
      'npm ci --no-audit --no-fund && npx wxt build -b firefox',
    ]);
  else {
    run('npm', ['ci', '--no-audit', '--no-fund']);
    run('npx', ['wxt', 'build', '-b', 'firefox']);
  }

  const list = (base) =>
    fs
      .readdirSync(base, { recursive: true })
      .filter((file) => fs.statSync(path.join(base, file)).isFile())
      .toSorted();
  const rebuilt = path.join(dir, '.output', 'firefox-mv3');
  const ours = list(BUILD);
  const theirs = list(rebuilt);
  const problems = [
    ...ours
      .filter((file) => !theirs.includes(file))
      .map((file) => `missing from the rebuild: ${file}`),
    ...theirs
      .filter((file) => !ours.includes(file))
      .map((file) => `only in the rebuild: ${file}`),
    ...ours
      .filter(
        (file) =>
          theirs.includes(file) &&
          !fs
            .readFileSync(path.join(BUILD, file))
            .equals(fs.readFileSync(path.join(rebuilt, file))),
      )
      .map((file) => `differs: ${file}`),
  ];
  if (problems.length) {
    console.log(
      `The rebuild doesn't match .output/firefox-mv3:\n  ${problems.join('\n  ')}`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Identical: all ${ours.length} files of .output/firefox-mv3, byte for byte.`,
    );
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
