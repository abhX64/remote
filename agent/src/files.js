const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const CHUNK_SIZE = 200 * 1024; // keep well under the ~256KB DataChannel message cap
const MAX_DOWNLOAD_SIZE = 200 * 1024 * 1024; // 200MB safety cap

function listDirectory(targetPath) {
  const resolved = path.resolve(targetPath && targetPath.trim() ? targetPath : '.');
  const entries = fs.readdirSync(resolved, { withFileTypes: true }).map((entry) => {
    let size = 0;
    if (entry.isFile()) {
      try {
        size = fs.statSync(path.join(resolved, entry.name)).size;
      } catch {
        size = 0;
      }
    }
    return { name: entry.name, isDir: entry.isDirectory(), size };
  });
  return { path: resolved, entries };
}

// Only one transfer (of either direction) is assumed in flight at a time,
// which keeps the "files" DataChannel's raw binary chunks unambiguous
// without needing a per-chunk id prefix.
function createFilesHandler(controlSend, filesDc) {
  let upload = null; // { requestId, fd, received }

  function handleControlMessage(msg) {
    switch (msg.type) {
      case 'list': {
        try {
          const result = listDirectory(msg.path);
          controlSend({ type: 'list-result', requestId: msg.requestId, path: result.path, entries: result.entries });
        } catch (err) {
          controlSend({ type: 'list-result', requestId: msg.requestId, error: err.message });
        }
        break;
      }

      case 'download': {
        let resolved;
        try {
          resolved = path.resolve(msg.path);
          const stat = fs.statSync(resolved);
          if (!stat.isFile()) throw new Error('Not a file');
          if (stat.size > MAX_DOWNLOAD_SIZE) throw new Error('File too large (limit 200MB)');
          controlSend({
            type: 'download-start',
            requestId: msg.requestId,
            name: path.basename(resolved),
            size: stat.size,
          });
        } catch (err) {
          controlSend({ type: 'download-error', requestId: msg.requestId, error: err.message });
          break;
        }

        const stream = fs.createReadStream(resolved, { highWaterMark: CHUNK_SIZE });
        stream.on('data', (chunk) => filesDc.sendMessageBinary(chunk));
        stream.on('end', () => controlSend({ type: 'download-end', requestId: msg.requestId }));
        stream.on('error', (err) =>
          controlSend({ type: 'download-error', requestId: msg.requestId, error: err.message })
        );
        break;
      }

      case 'upload-start': {
        try {
          const resolved = path.resolve(msg.path);
          const fd = fs.openSync(resolved, 'w');
          upload = { requestId: msg.requestId, fd, received: 0 };
          controlSend({ type: 'upload-ready', requestId: msg.requestId });
        } catch (err) {
          upload = null;
          controlSend({ type: 'upload-error', requestId: msg.requestId, error: err.message });
        }
        break;
      }

      case 'upload-end': {
        if (upload && upload.requestId === msg.requestId) {
          fs.closeSync(upload.fd);
          controlSend({ type: 'upload-complete', requestId: msg.requestId, received: upload.received });
          upload = null;
        }
        break;
      }

      default:
        break;
    }
  }

  function handleFileChunk(buffer) {
    if (!upload) return;
    try {
      fs.writeSync(upload.fd, buffer);
      upload.received += buffer.length;
    } catch (err) {
      logger.error('upload write failed', { message: err.message });
    }
  }

  return { handleControlMessage, handleFileChunk };
}

module.exports = { createFilesHandler };
