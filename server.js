// OrderLine Restaurant POS — server
// Zero-dependency Node.js server: serves the app, stores data in a JSON file,
// and pushes live updates to every tablet with Server-Sent Events.
//
//   node server.js            -> http://localhost:3000
//   PORT=8080 node server.js  -> custom port

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SEED_FILE = path.join(ROOT, 'seed', 'starter-menu.json');
const MAX_BODY = 2 * 1024 * 1024; // 2 MB (menu photos are resized in the browser)

/* ---------------- Storage ---------------- */
function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    const db = { config: seed.config, menu: seed.menu, orders: [] };
    saveDb(db);
    console.log('Created', DB_FILE, 'with the starter menu.');
    return db;
  }
}
function saveDb(d) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic replace
}
let db = loadDb();

/* ---------------- Live updates (SSE) ---------------- */
const clients = new Set();
function snapshot() {
  return { config: db.config, menu: db.menu, orders: db.orders.slice(-400) };
}
function broadcast() {
  const msg = `event: state\ndata: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of clients) res.write(msg);
}
function commit() { saveDb(db); broadcast(); }
// keep connections alive through proxies
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

/* ---------------- Helpers ---------------- */
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_\-.:]{1,80}$/.test(id);
const round2 = n => Math.round(Number(n) * 100) / 100;
function sameDay(a, b) { return new Date(a).toDateString() === new Date(b).toDateString(); }

/* ---------------- Static files ---------------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function serveStatic(req, res, pathname) {
  if (pathname === '/' || pathname === '/order') pathname = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------------- API ---------------- */
async function api(req, res, pathname) {
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]
  const [, resource, id] = parts;
  const m = req.method;

  // Full state
  if (resource === 'state' && m === 'GET') return send(res, 200, snapshot());

  // Live updates stream
  if (resource === 'events' && m === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // Restaurant settings
  if (resource === 'config' && m === 'PUT') {
    const b = await readBody(req);
    if (!isObj(b) || !Array.isArray(b.categories)) return send(res, 400, { error: 'Config needs a categories list.' });
    db.config = {
      name: String(b.name || 'Restaurant').slice(0, 80),
      tagline: String(b.tagline || '').slice(0, 140),
      phone: String(b.phone || '').slice(0, 40),
      taxRate: Number(b.taxRate) || 0,
      currency: String(b.currency || '$').slice(0, 4),
      deliveryFee: round2(b.deliveryFee || 0),
      categories: b.categories.filter(c => isObj(c) && validId(c.id)).map(c => ({ id: c.id, name: String(c.name || '').slice(0, 60), icon: String(c.icon || '') }))
    };
    commit(); return send(res, 200, db.config);
  }

  // Menu items and toppings
  if (resource === 'menu' && id) {
    if (!validId(id)) return send(res, 400, { error: 'Bad id' });
    if (m === 'PUT') {
      const b = await readBody(req);
      if (!isObj(b) || !b.name) return send(res, 400, { error: 'Item needs a name.' });
      const item = { id, kind: b.kind === 'topping' ? 'topping' : 'item', cat: String(b.cat || ''), name: String(b.name).slice(0, 80),
        price: round2(b.price || 0), icon: String(b.icon || ''), img: typeof b.img === 'string' && b.img.startsWith('data:image/') ? b.img : '', sort: Number(b.sort) || 0 };
      const i = db.menu.findIndex(x => x.id === id);
      if (i >= 0) db.menu[i] = item; else db.menu.push(item);
      commit(); return send(res, 200, item);
    }
    if (m === 'DELETE') { db.menu = db.menu.filter(x => x.id !== id); commit(); return send(res, 204); }
  }

  // Orders
  if (resource === 'orders' && !id && m === 'POST') {
    const b = await readBody(req);
    if (!isObj(b) || !Array.isArray(b.lines) || !b.lines.length) return send(res, 400, { error: 'An order needs at least one item.' });
    if (!['dine', 'takeout', 'delivery'].includes(b.type)) return send(res, 400, { error: 'Unknown order type.' });
    const now = Date.now();
    // The server hands out order numbers so two tablets never use the same one. Numbers restart each day.
    const num = db.orders.filter(o => sameDay(o.createdAt, now)).reduce((mx, o) => Math.max(mx, o.num || 0), 0) + 1;
    const order = { ...b, id: validId(b.id) ? b.id : 'o_' + crypto.randomUUID(), num, createdAt: now, status: 'new' };
    db.orders.push(order);
    if (db.orders.length > 5000) db.orders = db.orders.slice(-5000);
    commit(); return send(res, 201, order);
  }
  if (resource === 'orders' && id && m === 'PATCH') {
    const b = await readBody(req);
    const o = db.orders.find(x => x.id === id);
    if (!o) return send(res, 404, { error: 'Order not found' });
    const allowed = ['status', 'paid', 'payMethod', 'tendered', 'change', 'paidAt', 'cookingAt', 'readyAt', 'doneAt'];
    for (const k of allowed) if (k in b) o[k] = b[k];
    commit(); return send(res, 200, o);
  }

  return send(res, 404, { error: 'Unknown API route' });
}

/* ---------------- Server ---------------- */
http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
    serveStatic(req, res, decodeURIComponent(pathname));
  } catch (e) {
    console.error(e);
    send(res, e.status || 500, { error: e.message || 'Server error' });
  }
}).listen(PORT, () => {
  console.log(`OrderLine POS running on http://localhost:${PORT}`);
  console.log(`  Counter:  http://localhost:${PORT}/#counter`);
  console.log(`  Kitchen:  http://localhost:${PORT}/#kitchen`);
  console.log(`  Online:   http://localhost:${PORT}/order#online`);
});
