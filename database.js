const path = require('path');
const Database = require('better-sqlite3');

// Init DB (file: demo.db)
const db = new Database(path.join(__dirname, 'demo.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT NOT NULL,
  client_hmac TEXT,
  ok INTEGER NOT NULL,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// Prepared statements
const insertMessage = db.prepare(`INSERT INTO messages (payload, client_hmac, ok, reason) VALUES (?, ?, ?, ?)`);
const insertNonce = db.prepare(`INSERT INTO nonces (nonce) VALUES (?)`);
const existsNonce = db.prepare(`SELECT 1 FROM nonces WHERE nonce = ? LIMIT 1`);
const selectMessages = db.prepare(`SELECT id, payload, client_hmac, ok, reason, created_at FROM messages ORDER BY created_at DESC LIMIT 200`);

module.exports = {
  db,
  addMessage: (payload, clientHmac, ok, reason) => insertMessage.run(payload, clientHmac, ok, reason),
  addNonce: (nonce) => insertNonce.run(nonce),
  nonceExists: (nonce) => !!existsNonce.get(nonce),
  getMessages: () => selectMessages.all()
};
