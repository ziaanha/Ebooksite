const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_KEY = process.env.UPLOAD_KEY;
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.join(__dirname, 'storage'));
const UPLOAD_DIR = path.join(STORAGE_DIR, 'uploads');
const DATA_DIR = path.join(STORAGE_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'books.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');

app.disable('x-powered-by');
app.use(helmet({
  // EPUB.js and PDF.js are loaded from public CDNs in the browser.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:"],
      frameSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOAD_DIR, { dotfiles: 'deny', index: false, maxAge: '1h' }));

const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
const allowedExtensions = new Set(['.pdf', '.epub', '.txt']);
const mimeByExtension = { '.pdf': 'application/pdf', '.epub': 'application/epub+zip', '.txt': 'text/plain' };

function readBooks() {
  try {
    const value = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error('Could not read book database:', error.message);
    return [];
  }
}
function writeBooks(books) {
  const temp = `${DB_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(books, null, 2), 'utf8');
  fs.renameSync(temp, DB_FILE);
}
function cleanText(value, maxLength) {
  return String(value || '').replace(/[<>\u0000-\u001F]/g, '').trim().slice(0, maxLength);
}
function requireUploadKey(req, res, next) {
  if (!UPLOAD_KEY || UPLOAD_KEY === 'replace-this-with-a-long-random-secret') {
    return res.status(503).json({ error: 'Uploads are disabled until the site owner sets a private UPLOAD_KEY on the server.' });
  }
  const supplied = req.get('x-upload-key') || '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(UPLOAD_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Incorrect upload key.' });
  }
  next();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(ext)) return cb(new Error('Only PDF, EPUB, and TXT files are accepted.'));
    cb(null, true);
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/books', (_req, res) => {
  const books = readBooks().map(({ id, title, author, genre, description, year, format, originalName, size, createdAt, url }) => ({
    id, title, author, genre, description, year, format, originalName, size, createdAt, url
  }));
  res.set('Cache-Control', 'no-store');
  res.json(books);
});

app.post('/api/books', uploadLimiter, requireUploadKey, (req, res, next) => {
  upload.single('bookFile')(req, res, error => {
    if (error) {
      const status = error instanceof multer.MulterError ? 400 : 400;
      return res.status(status).json({ error: error.message || 'Upload failed.' });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'Choose a PDF, EPUB, or TXT file.' });
      const ext = path.extname(req.file.originalname).toLowerCase();
      const title = cleanText(req.body.title, 120) || path.basename(req.file.originalname, ext).slice(0, 120);
      const book = {
        id: crypto.randomUUID(),
        title,
        author: cleanText(req.body.author, 100) || 'Unknown author',
        genre: cleanText(req.body.genre, 40) || 'Other',
        description: cleanText(req.body.description, 500),
        year: cleanText(req.body.year, 4),
        format: ext.slice(1).toUpperCase(),
        originalName: path.basename(req.file.originalname).slice(0, 180),
        size: req.file.size,
        createdAt: new Date().toISOString(),
        url: `/uploads/${req.file.filename}`
      };
      const books = readBooks();
      books.unshift(book);
      writeBooks(books);
      res.status(201).json(book);
    } catch (err) {
      if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
      next(err);
    }
  });
});

app.delete('/api/books/:id', requireUploadKey, (req, res) => {
  const books = readBooks();
  const book = books.find(item => item.id === req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found.' });
  const filename = path.basename(book.url || '');
  if (filename) fs.promises.unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
  writeBooks(books.filter(item => item.id !== req.params.id));
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`BookNest is running on http://localhost:${PORT}`);
  if (!UPLOAD_KEY || UPLOAD_KEY === 'replace-this-with-a-long-random-secret') {
    console.warn('Uploads are disabled: set a private UPLOAD_KEY environment variable.');
  }
});
