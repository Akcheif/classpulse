// ClassPulse backend - zero dependencies (Node 18+). Data is stored in data/db.json
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

function hash(p, salt) { salt = salt || crypto.randomBytes(8).toString('hex'); return salt + ':' + crypto.scryptSync(p, salt, 32).toString('hex'); }
function check(p, h) { const a = Buffer.from(hash(p, h.split(':')[0])), b = Buffer.from(h); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function persist() { const t = DB_FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(db, null, 2)); fs.renameSync(t, DB_FILE); }

let db;
if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
else {
  // Pre-registered accounts (add more CRs here, delete data/db.json, restart)
  db = {
    users: [
      { reg: '1234', pw: hash('1111'), name: 'Abhi', dept: 'AI & Data Science', year: '2nd Year', sec: 'A' },
      { reg: '5678', pw: hash('2222'), name: 'Jega', dept: 'AI & Data Science', year: '2nd Year', sec: 'A' }
    ],
    principal: { pw: hash('3333') },
    complaints: []
  };
  persist();
}

const CATS = {
  Academic: ['exam', 'class', 'teacher', 'faculty', 'syllabus', 'marks', 'timetable', 'lecture', 'staff', 'internal', 'attendance'],
  Infrastructure: ['fan', 'light', 'bench', 'classroom', 'wifi', 'toilet', 'water', 'building', 'projector', 'ac', 'power', 'electric', 'wall', 'roof'],
  Transport: ['bus', 'transport', 'route', 'driver'],
  Hostel: ['hostel', 'mess', 'warden', 'room'],
  Library: ['library', 'book', 'librarian', 'journal'],
  Laboratory: ['lab', 'laboratory', 'system', 'computer', 'equipment', 'software']
};
function categorize(t) {
  t = ' ' + t.toLowerCase() + ' '; let best = 'Others', n = 0;
  for (const c in CATS) { const k = CATS[c].filter(w => new RegExp('\\b' + w).test(t)).length; if (k > n) { n = k; best = c; } }
  return best;
}

const sessions = new Map(), attempts = new Map();
const NEXT = { 'Pending': 'In Progress', 'In Progress': 'Resolved' };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
function body(req) {
  return new Promise((ok, no) => {
    let d = ''; req.on('data', c => { d += c; if (d.length > 20000) { no(); req.destroy(); } });
    req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (e) { ok({}); } });
  });
}
function auth(req) { const t = (req.headers.authorization || '').replace('Bearer ', ''); return sessions.get(t); }

async function api(req, res, url) {
  if (req.method === 'POST' && url === '/api/login') {
    const ip = req.socket.remoteAddress, a = attempts.get(ip) || { n: 0, t: Date.now() };
    if (Date.now() - a.t > 600000) { a.n = 0; a.t = Date.now(); }
    if (a.n >= 20) return send(res, 429, { error: 'Too many attempts. Try again in 10 minutes.' });
    const b = await body(req); let sess = null, user = null;
    if (b.role === 'principal' && typeof b.password === 'string' && check(b.password, db.principal.pw)) sess = { role: 'principal' };
    if (b.role === 'cr') {
      user = db.users.find(u => u.reg === String(b.reg || '').trim());
      if (user && typeof b.password === 'string' && check(b.password, user.pw)) sess = { role: 'cr', reg: user.reg };
    }
    if (!sess) { a.n++; attempts.set(ip, a); return send(res, 401, { error: b.role === 'cr' ? 'Invalid Register Number or Password' : 'Invalid password' }); }
    const token = crypto.randomBytes(24).toString('hex'); sessions.set(token, sess);
    const out = { token, role: sess.role };
    if (user) out.user = { name: user.name, dept: user.dept, year: user.year, sec: user.sec, reg: user.reg };
    return send(res, 200, out);
  }
  const s = auth(req);
  if (!s) return send(res, 401, { error: 'Not logged in' });
  if (req.method === 'POST' && url === '/api/logout') { sessions.delete((req.headers.authorization || '').replace('Bearer ', '')); return send(res, 200, {}); }

  if (req.method === 'GET' && url === '/api/complaints') {
    if (s.role === 'principal') return send(res, 200, { complaints: db.complaints });
    return send(res, 200, {
      complaints: db.complaints.filter(c => c.reg === s.reg).map(({ id, text, time, status, cat }) => ({ id, text, time, status, cat })),
      othersCount: db.complaints.filter(c => c.reg !== s.reg).length   // privacy: count only
    });
  }
  if (req.method === 'POST' && url === '/api/complaints') {
    if (s.role !== 'cr') return send(res, 403, { error: 'Only Class Representatives can submit' });
    const b = await body(req), text = String(b.text || '').trim().slice(0, 2000);
    if (!text) return send(res, 400, { error: 'Complaint text is required' });
    const u = db.users.find(x => x.reg === s.reg);
    const c = { id: crypto.randomUUID(), text, reg: u.reg, name: u.name, dept: u.dept, year: u.year, sec: u.sec, time: Date.now(), status: 'Pending', cat: categorize(text) };
    db.complaints.unshift(c); persist(); return send(res, 201, { ok: true });
  }
  const m = url.match(/^\/api\/complaints\/([\w-]+)\/status$/);
  if (req.method === 'PATCH' && m) {
    if (s.role !== 'principal') return send(res, 403, { error: 'Only the Principal can change status' });
    const c = db.complaints.find(x => x.id === m[1]);
    if (!c) return send(res, 404, { error: 'Not found' });
    if (NEXT[c.status]) { c.status = NEXT[c.status]; persist(); }
    return send(res, 200, { status: c.status });
  }
  if (req.method === 'POST' && url === '/api/complaints/clear-resolved') {
    if (s.role !== 'principal') return send(res, 403, { error: 'Only the Principal can delete' });
    const before = db.complaints.length;
    db.complaints = db.complaints.filter(c => c.status !== 'Resolved'); persist();
    return send(res, 200, { removed: before - db.complaints.length });
  }
  const d = url.match(/^\/api\/complaints\/([\w-]+)$/);
  if (req.method === 'DELETE' && d) {
    const n = db.complaints.length;
    // Principal can delete any complaint; a CR can delete only their own
    db.complaints = db.complaints.filter(x => !(x.id === d[1] && (s.role === 'principal' || x.reg === s.reg))); persist();
    if (n === db.complaints.length) return send(res, 403, { error: 'You can only delete your own complaints' });
    return send(res, 200, { removed: n - db.complaints.length });
  }
  send(res, 404, { error: 'Not found' });
}

http.createServer(async (req, res) => {
  try {
    const url = req.url.split('?')[0];
    if (url.startsWith('/api/')) return await api(req, res, url);
    const f = path.join(__dirname, 'public', url === '/' ? 'index.html' : url);
    if (!f.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  } catch (e) { send(res, 500, { error: 'Server error' }); }
}).listen(PORT, () => console.log('ClassPulse running on http://localhost:' + PORT));
