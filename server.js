const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'supersecretkey123';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Request Logging Middleware
app.use((req, res, next) => {
    console.log(`[SERVER] ${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
    next();
});

// Database setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error("[SERVER ERROR] Database connection error:", err.message);
    } else {
        console.log("[SERVER] Connected to SQLite database.");
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parcel_id TEXT,
            user_id INTEGER,
            type TEXT,
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS public_notes (
            parcel_id TEXT PRIMARY KEY,
            content TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            user_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`, () => {
            // Try to add column if it was created in a previous version
            db.run(`ALTER TABLE public_notes ADD COLUMN user_id INTEGER`, () => {});
        });

        // Seed an admin user (password: admin123)
        bcrypt.hash('admin123', 10, (err, hash) => {
            db.run(`INSERT OR IGNORE INTO users (id, username, password) VALUES (1, 'admin', ?)`, [hash]);
        });
    }
});

// Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    // We allow unauthenticated requests for public notes
    if (token) {
        jwt.verify(token, SECRET_KEY, (err, user) => {
            if (!err) req.user = user;
            next();
        });
    } else {
        next();
    }
}

function requireAuth(req, res, next) {
    if (!req.user) {
        console.log(`[SERVER] Unauthorized access attempt to ${req.originalUrl}`);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// Routes
// Admin: create user
app.post('/api/users', authenticateToken, (req, res) => {
    if (!req.user || req.user.username !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Admin only' });
    }
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Invalid input' });

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: 'Hashing error' });
        db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hash], function(err) {
            if (err) return res.status(400).json({ error: 'Username already exists' });
            console.log(`[SERVER] Admin created new user: ${username}`);
            res.status(201).json({ success: true, id: this.lastID, username });
        });
    });
});

app.post('/api/login', (req, res) => {
    console.log(`[SERVER] Login attempt for user: ${req.body.username}`);
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user) {
            console.log(`[SERVER] Login failed for user: ${username} (Not found)`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        bcrypt.compare(password, user.password, (err, match) => {
            if (match) {
                console.log(`[SERVER] Login successful for user: ${username}`);
                const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '7d' });
                res.json({ token, username: user.username });
            } else {
                res.status(401).json({ error: 'Invalid credentials' });
            }
        });
    });
});

// Get notes for a parcel
app.get('/api/notes/:parcelId', authenticateToken, (req, res) => {
    const parcelId = req.params.parcelId;
    db.all(`SELECT notes.*, users.username FROM notes LEFT JOIN users ON notes.user_id = users.id WHERE parcel_id = ? AND type = 'private' ORDER BY created_at DESC`, [parcelId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/public-note/:parcelId', (req, res) => {
    db.get(`SELECT public_notes.*, users.username FROM public_notes LEFT JOIN users ON public_notes.user_id = users.id WHERE parcel_id = ?`, [req.params.parcelId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row ? row : { content: '' });
    });
});

app.post('/api/public-note/:parcelId', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    db.run(`REPLACE INTO public_notes (parcel_id, content, updated_at, user_id) VALUES (?, ?, CURRENT_TIMESTAMP, ?)`,
        [req.params.parcelId, req.body.content, req.user.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
    });
});

app.put('/api/notes/:id', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    db.run(`UPDATE notes SET content = ? WHERE id = ? AND user_id = ?`, [req.body.content, req.params.id, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: this.changes > 0 });
    });
});

// Add a note
app.post('/api/notes/:parcelId', authenticateToken, (req, res) => {
    const { type, content } = req.body;
    const parcelId = req.params.parcelId;

    console.log(`[SERVER] Saving note for parcel ${parcelId} by user ${req.user ? req.user.username : 'Anonymous'}`);

    // Require auth to post any note
    if (!req.user) return res.status(401).json({ error: 'You must be logged in to create notes.' });

    if (!content || !type || !['public', 'private'].includes(type)) {
        return res.status(400).json({ error: 'Invalid input' });
    }

    db.run(`INSERT INTO notes (parcel_id, user_id, type, content) VALUES (?, ?, ?, ?)`,
        [parcelId, req.user.id, type, content],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: this.lastID, parcel_id: parcelId, type, content, username: req.user.username });
        }
    );
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
