// Small Node server for the profile page. No dependencies, needs Node 21.7+.
//  - Serves the static site (index.html, CSS, JS, images).
//  - POST /api/contact validates the contact form again, saves it to a file,
//    and emails it too if email settings are present in .env.
// Run: npm start   (then open http://localhost:3000)

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

// Load secrets and settings from .env (it is git-ignored). Missing file is fine.
try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const MESSAGES_FILE = path.resolve(ROOT, process.env.MESSAGES_FILE || 'data/messages.jsonl');
const MAX_BODY_BYTES = 10 * 1024;

const LIMITS = { name: 100, email: 254, phone: 30, message: 500 };
const SUBJECTS = ['general', 'project-inquiry', 'other'];
const NAME_PATTERN = /^[A-Za-z ]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Only these file types are served, and never dotfiles, data/, or server files.
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};
const BLOCKED_FILES = new Set(['server.js']);

// ---------- Validation ----------

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Returns { errors: [...], data: {...} }. Same rules as the HTML form, enforced again here.
function validateContact(body) {
  const data = {
    name: clean(body.name),
    email: clean(body.email),
    phone: clean(body.phone),
    subject: clean(body.subject) || 'general',
    message: clean(body.message),
    subscribe: body.subscribe === true || body.subscribe === 'yes' || body.subscribe === 'on'
  };
  const errors = [];

  if (!data.name) errors.push('Name is required.');
  else if (!NAME_PATTERN.test(data.name)) errors.push('Name can only contain letters and spaces.');
  else if (data.name.length > LIMITS.name) errors.push('Name is too long.');

  if (!data.email) errors.push('Email is required.');
  else if (data.email.length > LIMITS.email || !EMAIL_PATTERN.test(data.email)) errors.push('Email address is not valid.');

  if (data.phone.length > LIMITS.phone) errors.push('Phone number is too long.');

  if (!SUBJECTS.includes(data.subject)) errors.push('Subject is not valid.');

  if (!data.message) errors.push('Message is required.');
  else if (data.message.length > LIMITS.message) errors.push('Message must be ' + LIMITS.message + ' characters or fewer.');

  return { errors, data };
}

// ---------- Saving and emailing ----------

async function saveMessage(entry) {
  await fsp.mkdir(path.dirname(MESSAGES_FILE), { recursive: true });
  await fsp.appendFile(MESSAGES_FILE, JSON.stringify(entry) + '\n', 'utf8');
}

// Optional: email via Resend (https://resend.com) when RESEND_API_KEY and CONTACT_TO_EMAIL are set.
async function emailMessage(entry) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  if (!apiKey || !to) return false;

  const response = await fetch(process.env.RESEND_API_URL || 'https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM_EMAIL || 'Profile Site <onboarding@resend.dev>',
      to: [to],
      reply_to: entry.email,
      subject: 'Website message (' + entry.subject + ') from ' + entry.name,
      text: [
        'Name: ' + entry.name,
        'Email: ' + entry.email,
        'Phone: ' + (entry.phone || '-'),
        'Subject: ' + entry.subject,
        'Subscribe: ' + (entry.subscribe ? 'yes' : 'no'),
        '',
        entry.message
      ].join('\n')
    })
  });
  if (!response.ok) throw new Error('Email API responded ' + response.status);
  return true;
}

// ---------- Simple per-IP rate limit (5 messages per 10 minutes) ----------

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const recentByIp = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const times = (recentByIp.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_MAX) {
    recentByIp.set(ip, times);
    return true;
  }
  times.push(now);
  recentByIp.set(ip, times);
  return false;
}

// ---------- HTTP helpers ----------

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (tooLarge) return; // keep draining so the 413 response still reaches the browser
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(Object.assign(new Error('Too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function parseBody(raw, contentType) {
  if (contentType.startsWith('application/json')) {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Bad JSON');
    return parsed;
  }
  if (contentType.startsWith('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return null;
}

// ---------- Routes ----------

async function handleContact(req, res) {
  const contentType = req.headers['content-type'] || '';
  const fromPlainForm = contentType.startsWith('application/x-www-form-urlencoded'); // no-JS fallback

  function reply(status, body) {
    if (!fromPlainForm) return sendJson(res, status, body);
    const text = body.ok ? 'Thanks! Your message was sent.' : body.error;
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><meta charset="utf-8"><title>Contact</title><p>' +
      text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) +
      '</p><p><a href="/#contact">Back to the site</a></p>');
  }

  let body;
  try {
    body = parseBody(await readBody(req), contentType);
  } catch (e) {
    return reply(e.status || 400, { ok: false, error: e.status === 413 ? 'Message is too large.' : 'Could not read the form data.' });
  }
  if (!body) return reply(415, { ok: false, error: 'Unsupported content type.' });

  // Honeypot filled in: almost certainly a bot. Pretend it worked, but drop it.
  if (clean(body.website)) return reply(200, { ok: true });

  const { errors, data } = validateContact(body);
  if (errors.length) return reply(400, { ok: false, error: errors.join(' '), errors });

  if (rateLimited(req.socket.remoteAddress)) {
    return reply(429, { ok: false, error: 'Too many messages. Please try again later.' });
  }

  const entry = { receivedAt: new Date().toISOString(), ...data };
  try {
    await saveMessage(entry);
  } catch (e) {
    console.error('Could not save message:', e);
    return reply(500, { ok: false, error: 'Sorry, your message could not be saved. Please try again later.' });
  }

  // The message is already saved, so an email failure is logged but not shown as an error.
  emailMessage(entry).catch((e) => console.error('Could not email message:', e.message));

  return reply(200, { ok: true });
}

async function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = path.join(ROOT, pathname);
  const relative = path.relative(ROOT, filePath);
  const parts = relative.split(path.sep);
  const type = STATIC_TYPES[path.extname(filePath).toLowerCase()];

  const blocked =
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    parts.some((p) => p.startsWith('.')) ||
    parts[0] === 'data' ||
    parts[0] === 'node_modules' ||
    BLOCKED_FILES.has(relative) ||
    relative.endsWith('.test.js') ||
    !type;

  if (blocked) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }

  fs.createReadStream(filePath)
    .on('open', () => res.writeHead(200, { 'Content-Type': type }))
    .on('error', () => {
      if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    })
    .pipe(res);
}

function createServer() {
  return http.createServer((req, res) => {
    const pathname = req.url.split('?')[0];
    if (pathname === '/api/contact') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
      }
      return handleContact(req, res).catch((e) => {
        console.error(e);
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Server error.' });
      });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    }
    return serveStatic(req, res);
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log('Profile site running at http://localhost:' + PORT);
  });
}

module.exports = { createServer, validateContact };
