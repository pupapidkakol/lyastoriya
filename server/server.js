const path = require('path'), fs = require('fs'), crypto = require('crypto');
const express = require('express'), helmet = require('helmet'), rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite'); // вбудована в Node база, нічого компілювати не треба

const PROD = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;
const SESSION_TTL = 7 * 24 * 3600 * 1000;
const GAMES = ['fake-or-fact', 'chronology', 'timeline', 'quiz', 'matching-task'];
// ---- База даних (SQLite, лише параметризовані запити) ----
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
const db = new DatabaseSync(path.join(__dirname, 'data', 'app.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS results(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, created_at INTEGER NOT NULL);`);
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()), 3600 * 1000).unref();

// ---- Хелпери ----
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12); // вирівнює час відповіді, коли email не існує
const str = v => (typeof v === 'string' ? v.trim() : '');
const getCookie = (req, n) => ((req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(n + '=')) || '').slice(n.length + 1);

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');        // у БД лише хеш токена
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(sha(token), userId, Date.now() + SESSION_TTL);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'strict', secure: PROD, maxAge: SESSION_TTL, path: '/' });
}

// ---- Застосунок ----
const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'"],
      'style-src': ["'self'", 'https://fonts.googleapis.com'],
      'font-src': ['https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:'],
      'upgrade-insecure-requests': PROD ? [] : null
    }
  }
}));
app.use(express.json({ limit: '10kb' }));

// Захист від CSRF: той самий Origin + лише JSON (+ SameSite=Strict на cookie)
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') {
    try { const o = req.get('origin'); if (o && new URL(o).host !== req.get('host')) throw 0; } catch (e) { return res.status(403).json({ error: 'Заборонено' }); }
    if (!req.is('application/json')) return res.status(415).json({ error: 'Невірний формат запиту' });
  }
  next();
});

app.use('/api', (req, res, next) => {
  const t = getCookie(req, 'sid');
  if (t) {
    req.user = db.prepare('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').get(sha(t), Date.now());
  }
  next();
});
const needUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Потрібен вхід' }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Забагато спроб. Спробуй за 15 хвилин.' } });

app.post('/api/register', authLimiter, async (req, res) => {
  const username = str(req.body.username), email = str(req.body.email).toLowerCase(), password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!/^[\p{L}\d_]{3,20}$/u.test(username)) return res.status(400).json({ error: 'Ім’я: 3–20 символів — літери, цифри, підкреслення.' });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Некоректний email.' });
  if (password.length < 10 || Buffer.byteLength(password) > 72) return res.status(400).json({ error: 'Пароль: від 10 символів (до 72 байт).' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const id = db.prepare('INSERT INTO users(username,email,password_hash,created_at) VALUES (?,?,?,?)').run(username, email, hash, Date.now()).lastInsertRowid;
    startSession(res, id);
    res.status(201).json({ user: { username } });
  } catch (e) {
    if (/constraint failed/i.test(String(e.message))) return res.status(409).json({ error: 'Таке ім’я або email уже зайняті.' });
    console.error(e.message); res.status(500).json({ error: 'Помилка сервера' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  const email = str(req.body.email).toLowerCase(), password = typeof req.body.password === 'string' ? req.body.password : '';
  const u = db.prepare('SELECT id, username, password_hash FROM users WHERE email = ?').get(email);
  const ok = await bcrypt.compare(password.slice(0, 72), u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) return res.status(401).json({ error: 'Невірний email або пароль.' }); // однакова відповідь в обох випадках
  startSession(res, u.id);
  res.json({ user: { username: u.username } });
});

app.post('/api/logout', (req, res) => {
  const t = getCookie(req, 'sid');
  if (t) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(t));
  res.clearCookie('sid', { path: '/' }).json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const s = db.prepare('SELECT COUNT(*) AS games, COUNT(DISTINCT game) AS kinds, COALESCE(SUM(score),0) AS score, COALESCE(SUM(total),0) AS total FROM results WHERE user_id = ?').get(req.user.id);
  res.json({ user: { username: req.user.username }, stats: { games: s.games, kinds: s.kinds, correctPct: s.total ? Math.round(100 * s.score / s.total) : 0 } });
});

app.post('/api/results', needUser, (req, res) => {
  const { game, score, total } = req.body;
  if (!GAMES.includes(game) || !Number.isInteger(score) || !Number.isInteger(total) || total < 1 || total > 100 || score < 0 || score > total)
    return res.status(400).json({ error: 'Некоректний результат.' });
  db.prepare('INSERT INTO results(user_id,game,score,total,created_at) VALUES (?,?,?,?,?)').run(req.user.id, game, score, total, Date.now());
  res.status(201).json({ ok: true });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Не знайдено' }));
app.use(express.static(path.join(__dirname, '..', 'public'))); // віддаємо ЛИШЕ папку public
app.use((err, req, res, next) => res.status(400).json({ error: 'Некоректний запит' }));

app.listen(PORT, () => console.log('ЛяСторія: http://localhost:' + PORT));
