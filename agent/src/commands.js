const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('./logger');

const MAX_BUFFER = 1024 * 1024; // 1MB
const TIMEOUT_MS = 30_000;

// Each command normally runs in a brand-new subprocess, so a plain `cd`
// would have no effect on the next command. Track the working directory
// here and handle `cd` statefully instead, so navigation actually persists
// across commands like a real terminal session.
let currentDir = os.homedir();

function tryChangeDir(rawArg) {
  let arg = rawArg.trim();
  if (/^\/d\b/i.test(arg)) {
    arg = arg.replace(/^\/d\b/i, '').trim();
  }
  arg = arg.replace(/^"(.*)"$/, '$1');

  if (!arg) {
    return { stdout: currentDir + '\r\n', code: 0 };
  }

  const target = path.resolve(currentDir, arg);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    return { stderr: 'The system cannot find the path specified.\r\n', code: 1 };
  }
  currentDir = target;
  return { stdout: '', code: 0 };
}

function handleCommandMessage(msg, send) {
  const { requestId, cmd } = msg;
  if (typeof cmd !== 'string' || !cmd.trim()) {
    send({ type: 'command-result', requestId, error: 'empty command' });
    return;
  }

  const trimmed = cmd.trim();

  // Only intercept a standalone `cd`/`chdir` (no chaining like `cd x && y`) -
  // anything more complex just runs as a normal one-off command.
  const cdMatch = /^(cd|chdir)(\s+(.*))?$/i.exec(trimmed);
  if (cdMatch && !/[&|]/.test(trimmed)) {
    const result = tryChangeDir(cdMatch[3] || '');
    logger.info('cd', { cmd: trimmed, currentDir });
    send({
      type: 'command-result',
      requestId,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      code: result.code,
    });
    return;
  }

  logger.info('executing command', { cmd: trimmed, cwd: currentDir });

  exec(
    trimmed,
    { cwd: currentDir, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true },
    (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
      send({
        type: 'command-result',
        requestId,
        stdout,
        stderr,
        code,
        error: error && typeof error.code !== 'number' ? error.message : undefined,
      });
      logger.info('command finished', { cmd: trimmed, code });
    }
  );
}

module.exports = { handleCommandMessage };
