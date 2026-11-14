#!/usr/bin/env node
// Test the Oddboro phone desk. Plain Node, no dependencies of its own.
//
//   node phone.mjs start [--port 4510]   start a test office and wait for it and its door
//   node phone.mjs seed  [--port 4510]   give a fresh test office sample Odds, chats, goals and an ask
//   node phone.mjs stop  [--port 4510]   stop it, and every process it started
//   node phone.mjs status                list the test offices this tool started
//   node phone.mjs door  [--port 4510]   send the door requests shaped like the phone's
//   node phone.mjs tailscale [--port 4510] [--apply | --off]
//                                        check Tailscale, print the phone's link and a QR code
//   node phone.mjs tests                 run only the phone's test files
//
// Run it from anywhere inside an Oddboro checkout or worktree, or pass --repo <path>.
// A test office keeps its own home in ~/.oddboro-phone-test, never ~/.oddboro.

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, realpathSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { connect } from 'node:net';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIN = platform() === 'win32';
const args = process.argv.slice(2);
const cmd = args[0] ?? 'help';
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const PORT = Number(opt('port', 4510));
const DOOR = PORT + 2;
const DB = 54329 + (PORT - 4500);
const STATE = join(homedir(), '.oddboro-phone-test');
const HOME = join(STATE, `home-${PORT}`);
const LOG = join(STATE, `office-${PORT}.log`);
const PIDFILE = join(STATE, `office-${PORT}.json`);
/** The name the door checks use. Listed in the test office's ODDBORO_EXTRA_HOSTS. */
const TEST_NAME = 'phone.test';
/** The https port `tailscale serve` gives a test office, so the owner's own office keeps 443. */
const TEST_HTTPS = 8443;
const TAILSCALE = WIN ? 'C:\\Program Files\\Tailscale\\tailscale.exe' : 'tailscale';

const ok = (s) => console.log(`  OK    ${s}`);
const bad = (s) => console.log(`  FAIL  ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findRepo() {
  let dir = resolve(opt('repo', process.cwd()));
  for (;;) {
    if (existsSync(join(dir, 'apps', 'office', 'package.json')) && existsSync(join(dir, 'packages', 'ledger')))
      return dir;
    const up = dirname(dir);
    if (up === dir) {
      console.error('Not inside an Oddboro checkout. Run this from the repo, or pass --repo <path>.');
      process.exit(2);
    }
    dir = up;
  }
}

/** The request the phone would send, sent with any Host we like. Resolves with status, headers and up to 2kB of body. */
function ask(port, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((done) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let text = '';
      const stream = (res.headers['content-type'] ?? '').includes('event-stream');
      res.on('data', (c) => {
        text += c;
        if (stream || text.length > 2048) res.destroy();
      });
      const end = () => done({ status: res.statusCode, headers: res.headers, text });
      res.on('end', end);
      res.on('close', end);
      if (stream) end();
    });
    req.on('error', (e) => done({ status: 0, text: e.message }));
    req.setTimeout(15000, () => req.destroy(new Error('no answer in 15s')));
    if (body) req.write(body);
    req.end();
  });
}

const listening = (port) =>
  new Promise((done) => {
    const s = connect(port, '127.0.0.1', () => (s.destroy(), done(true)));
    s.on('error', () => done(false));
  });

function tailscale(...a) {
  try {
    return execFileSync(TAILSCALE, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return e.code === 'ENOENT' ? null : (e.stdout ?? '');
  }
}

function tailnetName() {
  const raw = tailscale('status', '--json');
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s.BackendState === 'Running' ? (s.Self?.DNSName ?? '').replace(/\.$/, '') || null : null;
  } catch {
    return null;
  }
}

/** Where a package is, found as Node finds it: up the folders, through workspace links. */
function pkgDir(from, name) {
  for (let dir = from; ; dir = dirname(dir)) {
    const p = join(dir, 'node_modules', name);
    if (existsSync(join(p, 'package.json'))) return realpathSync(p);
    if (dirname(dir) === dir) throw new Error(`Cannot find ${name}. Run npm install in the main checkout.`);
  }
}

// ---- start ----------------------------------------------------------------

async function start() {
  const repo = findRepo();
  const office = join(repo, 'apps', 'office');
  if (await listening(PORT)) {
    console.log(`Port ${PORT} is taken already. If it is a test office from before, run: stop --port ${PORT}`);
    process.exit(1);
  }
  const vite = join(pkgDir(office, 'vite'), 'bin', 'vite.js');
  const sprites = pkgDir(office, '@oddboro/sprites');
  if (!existsSync(join(sprites, 'dist', 'atlas.json'))) {
    console.log('The sprites are not built. Building them once (npm run sprites)...');
    spawnSync('npm', ['run', 'sprites'], { cwd: repo, stdio: 'inherit', shell: WIN });
  }
  // In a worktree with no node_modules of its own, the packages come from the main checkout.
  const ledger = resolve(pkgDir(office, '@oddboro/ledger'), '..', '..');
  if (resolve(ledger).toLowerCase() !== resolve(repo).toLowerCase())
    console.log(`Note: packages/ come from ${ledger}, not this worktree. Changes to packages/ here do not show.`);

  const name = tailnetName();
  const hosts = [TEST_NAME, name].filter(Boolean).join(',');
  mkdirSync(HOME, { recursive: true });
  const out = openSync(LOG, 'w');
  const child = spawn(process.execPath, [vite, 'dev'], {
    cwd: office,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, out],
    env: {
      ...process.env,
      ODDBORO_HOME: HOME,
      ODDBORO_PORT: String(PORT),
      ODDBORO_PHONE_PORT: String(DOOR),
      ODDBORO_DB_PORT: String(DB),
      ODDBORO_EXTRA_HOSTS: hosts
    }
  });
  child.unref();
  writeFileSync(PIDFILE, JSON.stringify({ pid: child.pid, port: PORT, door: DOOR, db: DB, home: HOME, repo, hosts }));
  console.log(`Starting a test office from ${office}`);
  console.log(`  office http://127.0.0.1:${PORT}  door ${DOOR}  database ${DB}`);
  console.log(`  home ${HOME}`);
  console.log(`  names the door lets in: ${hosts}`);
  console.log(`  log ${LOG}`);

  // A one-off wait while it starts, not a loop that stays.
  const until = Date.now() + 240_000;
  while (Date.now() < until) {
    const r = await ask(PORT, '/', { headers: { host: `127.0.0.1:${PORT}` } });
    if (r.status && r.status < 500 && (await listening(DOOR))) {
      console.log(`Ready: the office answered ${r.status} and the door is open.`);
      console.log(`  floor  http://127.0.0.1:${PORT}/`);
      console.log(`  desk   http://127.0.0.1:${PORT}/desk`);
      return;
    }
    if (child.exitCode !== null) break;
    await sleep(1500);
  }
  console.log('The office did not come up. Last lines of its log:');
  console.log(readFileSync(LOG, 'utf8').split('\n').slice(-25).join('\n'));
  process.exit(1);
}

// ---- stop -----------------------------------------------------------------

function stop() {
  if (!existsSync(PIDFILE)) return console.log(`No test office on port ${PORT}.`);
  const { pid, home } = JSON.parse(readFileSync(PIDFILE, 'utf8'));
  if (WIN) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    // The office's own Postgres, and anything else left, is found by its home folder on its command line.
    const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${home.replace(/'/g, "''")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }`;
    const left = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).stdout.trim();
    if (left) console.log(`Also stopped: ${left.split(/\s+/).join(', ')}`);
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {}
    spawnSync('pkill', ['-f', home]);
  }
  rmSync(PIDFILE);
  console.log(`Stopped the test office on port ${PORT}. Its home stays at ${home} for next time.`);
}

function status() {
  if (!existsSync(STATE)) return console.log('No test offices.');
  const files = readdirSync(STATE).filter((f) => /^office-\d+\.json$/.test(f));
  if (!files.length) return console.log('No test offices running.');
  for (const f of files) {
    const s = JSON.parse(readFileSync(join(STATE, f), 'utf8'));
    console.log(`port ${s.port}, door ${s.door}, pid ${s.pid}, from ${s.repo}, names ${s.hosts}`);
  }
}

// ---- seed -----------------------------------------------------------------

function seed() {
  if (!existsSync(PIDFILE)) return console.log(`No test office on port ${PORT}. Run start first.`);
  const { repo } = JSON.parse(readFileSync(PIDFILE, 'utf8'));
  const office = join(repo, 'apps', 'office');
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./seed.ts', import.meta.url))], {
    cwd: office,
    stdio: 'inherit',
    env: {
      ...process.env,
      ODDBORO_HOME: HOME,
      ODDBORO_PORT: String(PORT),
      ODDBORO_DB_PORT: String(DB),
      ODDBORO_LEDGER: pkgDir(office, '@oddboro/ledger')
    }
  });
  process.exitCode = r.status ?? 1;
}

// ---- door -----------------------------------------------------------------

async function door() {
  console.log(`Door checks: office ${PORT}, door ${DOOR}, name ${TEST_NAME}`);
  const phone = { host: TEST_NAME, 'tailscale-user-login': 'owner@example.com' };
  let fails = 0;
  const check = (label, r, want, text) => {
    const pass = r.status === want && (!text || r.text.includes(text));
    pass ? ok(label) : (fails++, bad(`${label}: got ${r.status} ${r.text.slice(0, 120).replace(/\s+/g, ' ')}`));
  };
  check('phone opens /desk', await ask(DOOR, '/desk', { headers: phone }), 200);
  check('phone reads /api/phone/home', await ask(DOOR, '/api/phone/home', { headers: phone }), 200);
  check('phone hears /api/events', await ask(DOOR, '/api/events', { headers: phone }), 200);
  check(
    'no tailnet sign-in gets 403',
    await ask(DOOR, '/desk', { headers: { host: TEST_NAME } }),
    403,
    'only to the owner'
  );
  check(
    'an unlisted name gets 403',
    await ask(DOOR, '/desk', { headers: { ...phone, host: 'stranger.example' } }),
    403,
    'only to the owner'
  );
  check(
    'a cross-site action gets 403',
    await ask(DOOR, '/api/push', {
      method: 'POST',
      headers: { ...phone, 'content-type': 'application/json', 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
      body: '{}'
    }),
    403
  );
  // The phone's own action must get past the guard. A bad body gets 400 from the route and changes nothing.
  const action = { ...phone, 'content-type': 'application/json' };
  check(
    "the phone's own action passes the guard (Sec-Fetch-Site)",
    await ask(DOOR, '/api/push', { method: 'POST', headers: { ...action, 'sec-fetch-site': 'same-origin' }, body: '{}' }),
    400,
    'push address'
  );
  check(
    "the phone's own action passes the guard (Origin only)",
    await ask(DOOR, '/api/push', { method: 'POST', headers: { ...action, origin: `https://${TEST_NAME}` }, body: '{}' }),
    400,
    'push address'
  );
  check(
    'the office itself refuses another machine',
    await ask(PORT, '/desk', { headers: { host: `127.0.0.1:${PORT}`, 'x-forwarded-for': '100.64.0.7' } }),
    403,
    'answers only its own computer'
  );
  check('the floor at / still loads', await ask(PORT, '/', { headers: { host: `127.0.0.1:${PORT}` } }), 200);
  console.log(fails ? `${fails} check(s) failed.` : 'All door checks passed.');
  process.exitCode = fails ? 1 : 0;
}

// ---- tailscale ------------------------------------------------------------

function proxies(serve) {
  const out = [];
  for (const [hostPort, site] of Object.entries(serve?.Web ?? {}))
    for (const [path, h] of Object.entries(site.Handlers ?? {})) out.push({ hostPort, path, proxy: h.Proxy ?? '' });
  return out;
}

async function tailnet() {
  const raw = tailscale('status', '--json');
  if (raw === null) return console.log('Tailscale is not installed. Get it from tailscale.com/download.');
  let s;
  try {
    s = JSON.parse(raw);
  } catch {
    return console.log('Tailscale did not answer. Open the Tailscale app.');
  }
  if (s.BackendState !== 'Running') return console.log(`Tailscale is ${s.BackendState}. Open it and sign in.`);
  const name = (s.Self?.DNSName ?? '').replace(/\.$/, '');
  console.log(`This computer on the tailnet: ${name}`);
  const phones = Object.values(s.Peer ?? {}).filter((p) => /ios|android/i.test(p.OS ?? ''));
  for (const p of phones) console.log(`  phone ${p.HostName} (${p.OS}): ${p.Online ? 'online' : 'offline'}`);
  if (!phones.length) console.log('  No phone on the tailnet yet. Install Tailscale on the phone and sign in.');

  const testRunning = existsSync(PIDFILE);
  const want = testRunning ? `http://127.0.0.1:${DOOR}` : 'http://127.0.0.1:4502';
  const port = testRunning ? TEST_HTTPS : 443;
  const at = port === 443 ? name : `${name}:${port}`;
  const set = testRunning
    ? ['serve', '--bg', `--https=${TEST_HTTPS}`, want]
    : ['serve', '--bg', want];
  const show = (a) => `"${TAILSCALE}" ${a.join(' ')}`;

  if (flag('off')) {
    tailscale('serve', `--https=${TEST_HTTPS}`, 'off');
    console.log(`Turned off the test address ${name}:${TEST_HTTPS}. The main address is unchanged.`);
    return;
  }
  if (flag('apply')) {
    console.log(`Running: ${show(set)}`);
    console.log(tailscale(...set) ?? '');
  }

  let serve = {};
  try {
    serve = JSON.parse(tailscale('serve', 'status', '--json') || '{}');
  } catch {}
  const all = proxies(serve);
  console.log('tailscale serve sends:');
  if (!all.length) console.log('  nothing yet');
  for (const p of all) {
    const note = /:4500\/?$/.test(p.proxy)
      ? '  <- the office itself, which refuses the phone. Point it at the door, 4502.'
      : '';
    console.log(`  https://${p.hostPort}${p.path} -> ${p.proxy}${note}`);
  }
  const good = all.some((p) => p.hostPort === `${name}:${port}` && p.proxy.replace(/\/$/, '') === want);
  console.log(testRunning ? `Test office running on ${PORT}: its door is ${want}, at https://${at}.` : 'No test office running: checking the main office, door 4502.');
  if (!good) {
    console.log('Not set up for this yet. The command to run (or run this again with --apply):');
    console.log(`  ${show(set)}`);
    return;
  }
  const link = `https://${at}/desk`;
  console.log(`\nThe phone's link: ${link}`);
  const qr = writeQr(link);
  if (qr) console.log(`QR code: ${qr}`);
  console.log(`
On the phone, with Tailscale on:
  1. Open ${link}
  2. Home loads with Waiting on you, Happening now and Who's around.
  3. Tap Goals, then a goal. Its page opens. Go back.
  4. Tap Messages, then an Odd. Its chat opens. Go back.
  5. Tap Desk. Try All, Asks, Tasks and Reports.
  6. On Home, tap an Odd's call button. The call opens. Tap End.
  7. Turn Tailscale off. The link should not load. Turn it back on.${testRunning ? `\nWhen done: tailscale --off turns the test address off.` : ''}`);
}

function writeQr(text) {
  try {
    const need = createRequire(join(findRepo(), 'apps', 'office', 'package.json'));
    const qrcode = need('qrcode-generator');
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const file = join(STATE, 'phone-link.html');
    mkdirSync(STATE, { recursive: true });
    writeFileSync(
      file,
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Phone link</title>` +
        `<body style="background:#fff;color:#000;font:16px system-ui;text-align:center;padding:24px">` +
        `${q.createSvgTag({ cellSize: 8, margin: 4, scalable: true }).replace('<svg', '<svg style="width:320px;max-width:100%"')}` +
        `<p><a href="${text}">${text}</a></p></body>`
    );
    return file;
  } catch {
    return null;
  }
}

// ---- tests ----------------------------------------------------------------

function tests() {
  const office = join(findRepo(), 'apps', 'office');
  const pick = (dir, re) => readdirSync(join(office, dir)).filter((f) => re.test(f)).map((f) => `${dir}/${f}`);
  const files = [...pick('src/lib/ui/phone', /\.test\.ts$/), ...pick('src/lib/server', /^phone-.*\.test\.ts$/)];
  console.log(`Running ${files.length} phone test files in ${office}`);
  const r = spawnSync(
    process.execPath,
    ['--test', '--test-timeout=60000', '--experimental-test-module-mocks', ...files],
    { cwd: office, stdio: 'inherit' }
  );
  process.exitCode = r.status ?? 1;
}

const commands = { start, seed, stop, status, door, tailscale: tailnet, tests };
if (!commands[cmd]) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 13).join('\n').replace(/^\/\/ ?/gm, ''));
} else await commands[cmd]();
