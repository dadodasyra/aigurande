require('dotenv').config();
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
    console.log(`${new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' })} - ${req.method} ${req.originalUrl}`);
    next();
});

// Database setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error("[SERVER ERROR] Database connection error:", err.message);
    } else {
        db.serialize(() => {
            console.log("Connected to SQLite database, initializing tables...");

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

            db.run(`CREATE TABLE IF NOT EXISTS lines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                color TEXT,
                type TEXT,
                coordinates TEXT,
                distance REAL,
                user_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS lieux_dits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                description TEXT,
                icon TEXT DEFAULT '📌',
                lat REAL,
                lng REAL,
                user_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`, () => {
                db.run(`ALTER TABLE lieux_dits ADD COLUMN icon TEXT DEFAULT '📌'`, () => {});
            });

            // Seed an admin user
            db.get("SELECT id FROM users WHERE username='admin'", (err, row) => {
                if (!row) {
                    bcrypt.hash(process.env.DEFAULT_ADMIN_PASSWORD || "admin123", 10, (err, hash) => {
                        db.run(`INSERT OR IGNORE INTO users (id, username, password) VALUES (1, 'admin', ?)`, [hash]);
                    });
                }
            });
        });
    }
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
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
            if (err) return res.status(500).json({ error: 'Username already exists' });
            console.log(`Admin created new user: ${username}`);
            res.status(201).json({ message: 'User created successfully', id: this.lastID, username });
        });
    });
});

app.post('/api/login', (req, res) => {
    console.log(`Login attempt for user: ${req.body.username}`);
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user) {
            console.log(`Login failed for user: ${username} (Not found)`);
            return res.status(401).json({ error: 'User not found' });
        }

        bcrypt.compare(password, user.password, (err, match) => {
            if (match) {
                console.log(`Login successful for user: ${username}`);
                const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1y' });
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

app.post('/api/notes/:parcelId', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const content = req.body.content;
    const type = req.body.type || 'private';
    db.run(
        `INSERT INTO notes (parcel_id, content, type, user_id) VALUES (?, ?, ?, ?)`,
        [req.params.parcelId, content, type, req.user.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, success: true, user_id: req.user.id });
        }
    );
});

app.delete('/api/notes/:id', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    db.run(`DELETE FROM notes WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: this.changes > 0 });
    });
});

// Lines routes
app.get('/api/lines', (req, res) => {
    db.all(`SELECT lines.*, users.username FROM lines LEFT JOIN users ON lines.user_id = users.id`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/lines', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { color, type, coordinates, distance } = req.body;
    const coordsStr = JSON.stringify(coordinates);
    db.run(`INSERT INTO lines (color, type, coordinates, distance, user_id) VALUES (?, ?, ?, ?, ?)`,
        [color, type, coordsStr, distance, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        console.log(`${new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' })} - POST /api/lines: ID ${this.lastID} | ${type} | ${distance}m | par ${req.user.username}`);
        res.json({ id: this.lastID });
    });
});

app.delete('/api/lines/:id', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.username === 'admin') {
        db.run(`DELETE FROM lines WHERE id = ?`, [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: this.changes > 0 });
        });
    } else {
        db.run(`DELETE FROM lines WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: this.changes > 0 });
        });
    }
});

app.delete('/api/lines/category/:type', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    db.run(`DELETE FROM lines WHERE type = ? AND user_id = ?`, [req.params.type, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, deleted: this.changes });
    });
});

// Lieux-dits routes
app.get('/api/lieux', (req, res) => {
    db.all(`SELECT lieux_dits.*, users.username FROM lieux_dits LEFT JOIN users ON lieux_dits.user_id = users.id`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/lieux', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { title, description, icon, lat, lng } = req.body;
    db.run(`INSERT INTO lieux_dits (title, description, icon, lat, lng, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [title, description, icon || '📌', lat, lng, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.put('/api/lieux/:id', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { title, description, icon } = req.body;
    db.run(`UPDATE lieux_dits SET title = ?, description = ?, icon = ? WHERE id = ? AND user_id = ?`,
        [title, description, icon || '📌', req.params.id, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: this.changes > 0 });
    });
});

app.delete('/api/lieux/:id', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.username === 'admin') {
        db.run(`DELETE FROM lieux_dits WHERE id = ?`, [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: this.changes > 0 });
        });
    } else {
        db.run(`DELETE FROM lieux_dits WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: this.changes > 0 });
        });
    }
});

app.delete('/api/lieux/category/all', authenticateToken, (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    db.run(`DELETE FROM lieux_dits WHERE user_id = ?`, [req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, deleted: this.changes });
    });
});

app.listen(PORT, () => {
    console.log(`[SERVER] Server running on http://localhost:${PORT}`);
});

