require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { createSignalingServer } = require('./signaling');

const PORT = process.env.PORT || 8080;
const PAIRING_TOKEN = process.env.PAIRING_TOKEN;

if (!PAIRING_TOKEN || PAIRING_TOKEN === 'changeme') {
  console.warn(
    '[WARN] PAIRING_TOKEN is not set (or is the default placeholder). ' +
      'Set a strong random token in server/.env before exposing this server.'
  );
}

const app = express();
app.use(express.static(path.join(__dirname, '..', '..', 'client')));
app.get('/healthz', (req, res) => res.send('ok'));

const server = http.createServer(app);
createSignalingServer(server, { pairingToken: PAIRING_TOKEN });

server.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
