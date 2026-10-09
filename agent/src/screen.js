const { Monitor } = require('node-screenshots');
const sharp = require('sharp');
const logger = require('./logger');

// Keep frames comfortably under the ~256KB WebRTC DataChannel message limit
// that most browsers negotiate by default.
const MAX_WIDTH = 1280;
const JPEG_QUALITY = 55;

function getPrimaryMonitor() {
  const monitors = Monitor.all();
  return monitors.find((m) => m.isPrimary()) || monitors[0];
}

// Captures the primary monitor on an interval and pushes JPEG frames over
// the given DataChannel.
function startScreenStream(dc, { fps = 8 } = {}) {
  const intervalMs = Math.round(1000 / fps);
  const monitor = getPrimaryMonitor();
  let stopped = false;
  let capturing = false;

  const timer = setInterval(async () => {
    if (stopped || capturing || !dc.isOpen() || !monitor) return;
    capturing = true;
    try {
      const image = await monitor.captureImage();
      const fullJpeg = await image.toJpeg();
      const buffer = await sharp(fullJpeg)
        .resize({ width: Math.min(MAX_WIDTH, image.width), withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();
      if (!stopped && dc.isOpen()) {
        dc.sendMessageBinary(buffer);
      }
    } catch (err) {
      logger.error('screen capture failed', { message: err.message });
    } finally {
      capturing = false;
    }
  }, intervalMs);

  return function stopScreenStream() {
    stopped = true;
    clearInterval(timer);
  };
}

module.exports = { startScreenStream };
