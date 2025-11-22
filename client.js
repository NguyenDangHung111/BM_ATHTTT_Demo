// client.js
// const fetch = require('node-fetch'); // if node >=18 use global fetch
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const HMAC_SECRET ='supersecretkey123';
const payload = {
  action: 'transfer',
  amount: 1000,
  timestamp: Math.floor(Date.now()/1000),
  nonce: uuidv4()
};
const body = Buffer.from(JSON.stringify(payload), 'utf8');
const h = crypto.createHmac('sha256', HMAC_SECRET).update(body).digest('hex');

(async () => {
  const res = await fetch('http://127.0.0.1:5000/api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-HMAC': h
    },
    body
  });
  const j = await res.text();
  console.log(res.status, j);
})();
