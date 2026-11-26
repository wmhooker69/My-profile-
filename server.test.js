// Tests for server.js. Run: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contact-test-'));
process.env.MESSAGES_FILE = path.join(tmpDir, 'messages.jsonl');
process.env.RESEND_API_KEY = '';
process.env.CONTACT_TO_EMAIL = '';

const { createServer, validateContact } = require('./server.js');

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  base = 'http://localhost:' + server.address().port;
});

after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const valid = { name: 'Jane Doe', email: 'jane@example.com', phone: '', subject: 'general', message: 'Hello there', website: '' };

function post(body, type = 'application/json') {
  return fetch(base + '/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': type },
    body: type === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body).toString()
  });
}

function savedLines() {
  if (!fs.existsSync(process.env.MESSAGES_FILE)) return [];
  return fs.readFileSync(process.env.MESSAGES_FILE, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

test('validateContact rejects missing and bad fields', () => {
  assert.ok(validateContact({}).errors.length >= 3);
  assert.match(validateContact({ ...valid, name: 'R2D2' }).errors[0], /letters/);
  assert.match(validateContact({ ...valid, email: 'nope' }).errors[0], /Email/);
  assert.match(validateContact({ ...valid, subject: 'hack' }).errors[0], /Subject/);
  assert.match(validateContact({ ...valid, message: 'x'.repeat(501) }).errors[0], /500/);
  assert.deepStrictEqual(validateContact({ ...valid, message: 'x'.repeat(500) }).errors, []);
  assert.deepStrictEqual(validateContact({ ...valid, message: '   ' }).errors, ['Message is required.']);
});

test('validateContact accepts real-world names', () => {
  for (const name of ["O'Brien", 'O’Brien', 'Mary-Jane Smith', 'José García', 'Zoë', 'J. R. Hooker', '李华']) {
    assert.deepStrictEqual(validateContact({ ...valid, name }).errors, [], name);
  }
});

test('validateContact still rejects names without letters or with symbols', () => {
  for (const name of ['R2D2', "'--.", 'Eric <b>', 'Eric\nBcc: x@y.z', 'Eric@home']) {
    assert.match(validateContact({ ...valid, name }).errors[0], /letters/, JSON.stringify(name));
  }
});

test('valid JSON submission is saved', async () => {
  const res = await post({ ...valid, subscribe: true });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { ok: true });
  const last = savedLines().at(-1);
  assert.strictEqual(last.name, 'Jane Doe');
  assert.strictEqual(last.subscribe, true);
  assert.ok(last.receivedAt);
  assert.strictEqual(last.website, undefined, 'honeypot field is not stored');
});

test('invalid submission returns 400 with errors and is not saved', async () => {
  const before = savedLines().length;
  const res = await post({ ...valid, email: '', message: '' });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /Email is required/);
  assert.match(body.error, /Message is required/);
  assert.strictEqual(savedLines().length, before);
});

test('honeypot submission looks successful but is dropped', async () => {
  const before = savedLines().length;
  const res = await post({ ...valid, website: 'http://spam.example' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(savedLines().length, before);
});

test('bad JSON, wrong content type, oversized body, and GET are rejected', async () => {
  const bad = await fetch(base + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.strictEqual(bad.status, 400);
  const wrongType = await fetch(base + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hi' });
  assert.strictEqual(wrongType.status, 415);
  const big = await post({ ...valid, message: 'x'.repeat(20000) });
  assert.strictEqual(big.status, 413);
  const get = await fetch(base + '/api/contact');
  assert.strictEqual(get.status, 405);
});

test('plain form post (no JavaScript) works and returns an HTML page', async () => {
  const res = await post({ ...valid, subscribe: 'yes' }, 'application/x-www-form-urlencoded');
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /Thanks/);
  assert.strictEqual(savedLines().at(-1).subscribe, true);
});

test('emails the message when Resend settings are present', async () => {
  let received;
  const mock = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      received = { auth: req.headers.authorization, body: JSON.parse(raw) };
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"id":"1"}');
    });
  });
  await new Promise((r) => mock.listen(0, r));
  process.env.RESEND_API_KEY = 'test-key';
  process.env.CONTACT_TO_EMAIL = 'owner@example.com';
  process.env.RESEND_API_URL = 'http://localhost:' + mock.address().port;
  try {
    const res = await post(valid);
    assert.strictEqual(res.status, 200);
    for (let i = 0; i < 50 && !received; i++) await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(received.auth, 'Bearer test-key');
    assert.deepStrictEqual(received.body.to, ['owner@example.com']);
    assert.strictEqual(received.body.reply_to, 'jane@example.com');
    assert.match(received.body.text, /Hello there/);
  } finally {
    process.env.RESEND_API_KEY = '';
    process.env.CONTACT_TO_EMAIL = '';
    mock.close();
  }
});

test('static files are served, but secrets and server files are not', async () => {
  const home = await fetch(base + '/');
  assert.strictEqual(home.status, 200);
  assert.match(await home.text(), /id="message-count"/);
  assert.strictEqual((await fetch(base + '/char-counter.js')).status, 200);
  assert.strictEqual((await fetch(base + '/projects.html')).status, 200);
  assert.strictEqual((await fetch(base + '/projects-store.js')).status, 200);
  assert.strictEqual((await fetch(base + '/images/profile.jpeg')).status, 200);
  for (const p of ['/.env', '/.git/config', '/server.js', '/server.test.js', '/projects.test.js', '/package.json', '/data/messages.jsonl', '/%2e%2e/etc/passwd', '/..%2fserver.js']) {
    assert.strictEqual((await fetch(base + p)).status, 404, p);
  }
});

test('rate limit kicks in after 5 messages', async () => {
  let res;
  for (let i = 0; i < 6; i++) res = await post(valid);
  assert.strictEqual(res.status, 429);
});
