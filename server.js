// server.js
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const helmet = require('helmet');
const path = require('path');
const { addMessage, addNonce, nonceExists, getMessages } = require('./database');

// CONFIG
const PORT = 5000;
const HMAC_SECRET = 'supersecretkey123'; // demo only; in prod: process.env.HMAC_SECRET
const TIMESTAMP_WINDOW_SEC = 60; // ±60s allowed

// Helpers
function computeHmac(secret, msgBuffer) {
  return crypto.createHmac('sha256', secret).update(msgBuffer).digest('hex');
}

function timingSafeCompare(a, b) {
  // a and b are hex strings
  try {
    const A = Buffer.from(a, 'hex');
    const B = Buffer.from(b, 'hex');
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
  } catch (err) {
    return false;
  }
}

// Express app
const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
      workerSrc: ["'self'", "blob:"],
    },
  },
}));
app.use(bodyParser.raw({ type: '*/*' })); // get raw bytes so HMAC exact
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint
app.post('/api', (req, res) => {
  const bodyBuffer = req.body || Buffer.from('');
  const clientHmac = req.headers['x-hmac'];
  if (!clientHmac) {
    addMessage(bodyBuffer.toString('utf8'), null, 0, 'no hmac');
    return res.status(400).json({ ok: false, reason: 'no hmac' });
  }

  // attempt to parse JSON to extract timestamp+nonce (best-effort)
  let parsed = null;
  try {
    parsed = JSON.parse(bodyBuffer.toString('utf8'));
  } catch (e) {
    // not JSON — still compute HMAC but cannot do replay protection
  }

  // Anti-replay checks
  if (parsed && parsed.timestamp && parsed.nonce) {
    const ts = Number(parsed.timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (Number.isNaN(ts)) {
      addMessage(bodyBuffer.toString('utf8'), clientHmac, 0, 'bad timestamp');
      return res.status(400).json({ ok: false, reason: 'bad timestamp' });
    }

    if (Math.abs(now - ts) > TIMESTAMP_WINDOW_SEC) {
      addMessage(bodyBuffer.toString('utf8'), clientHmac, 0, 'timestamp out of window');
      return res.status(400).json({ ok: false, reason: 'timestamp out of window' });
    }

    // nonce uniqueness
    const isNonceUsed = nonceExists(parsed.nonce);
    if (isNonceUsed) {
      addMessage(bodyBuffer.toString('utf8'), clientHmac, 0, 'replay nonce used');
      return res.status(409).json({ ok: false, reason: 'replay nonce used' });
    }
    // record nonce (if HMAC later fails we still recorded; optional: record after successful verify)
    try {
      addNonce(parsed.nonce);
    } catch (err) {
      // race condition or duplicate — treat as replay
      addMessage(bodyBuffer.toString('utf8'), clientHmac, 0, 'replay nonce used (db)');
      return res.status(409).json({ ok: false, reason: 'replay nonce used (db)' });
    }
  } else {
    // If no timestamp/nonce present, we log and continue — but it's less secure
  }

  const expected = computeHmac(HMAC_SECRET, bodyBuffer);

  if (timingSafeCompare(expected, clientHmac)) {
    addMessage(bodyBuffer.toString('utf8'), clientHmac, 1, 'verified');
    return res.status(200).json({ ok: true, msg: 'verified' });
  } else {
    addMessage(bodyBuffer.toString('utf8'), clientHmac, 0, 'bad hmac');
    return res.status(401).json({ ok: false, reason: 'bad hmac' });
  }
});

// Simple endpoint to get logs (for UI)
app.get('/logs', (req, res) => {
  const rows = getMessages();
  res.json(rows);
});

app.listen(PORT, () => {
  console.log(`HMAC demo server running on http://localhost:${PORT}`);
});
