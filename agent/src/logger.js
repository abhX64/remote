const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'agent.log');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function log(level, message, meta) {
  ensureLogDir();
  const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta });
  fs.appendFileSync(LOG_FILE, line + '\n');
  const consoleFn = level === 'error' ? console.error : console.log;
  consoleFn(`[${level}] ${message}`, meta || '');
}

module.exports = {
  info: (message, meta) => log('info', message, meta),
  error: (message, meta) => log('error', message, meta),
};
