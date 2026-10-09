require('dotenv').config();
const WebSocket = require('ws');
const { createPeerConnectionForOffer } = require('./webrtc');
const { handleCommandMessage } = require('./commands');
const { handleInputMessage } = require('./input');
const { startScreenStream } = require('./screen');
const { createFilesHandler } = require('./files');
const logger = require('./logger');

const SIGNALING_URL = process.env.SIGNALING_URL;
const DEVICE_ID = process.env.DEVICE_ID;
const PAIRING_TOKEN = process.env.PAIRING_TOKEN;

if (!SIGNALING_URL || !DEVICE_ID || !PAIRING_TOKEN) {
  console.error('Missing SIGNALING_URL, DEVICE_ID, or PAIRING_TOKEN in agent/.env');
  process.exit(1);
}

let ws;
let pc;
let reconnectDelay = 2000;

function connectSignaling() {
  ws = new WebSocket(SIGNALING_URL);

  ws.on('open', () => {
    reconnectDelay = 2000;
    logger.info('connected to signaling server, registering', { deviceId: DEVICE_ID });
    ws.send(JSON.stringify({ type: 'register', deviceId: DEVICE_ID, token: PAIRING_TOKEN }));
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    handleSignalingMessage(msg);
  });

  ws.on('close', () => {
    logger.info('signaling connection closed, reconnecting', { delayMs: reconnectDelay });
    setTimeout(connectSignaling, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
  });

  ws.on('error', (err) => {
    logger.error('signaling connection error', { message: err.message });
  });
}

function sendSignal(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function handleSignalingMessage(msg) {
  switch (msg.type) {
    case 'registered':
      logger.info('registered with signaling server', { deviceId: msg.deviceId });
      break;

    case 'error':
      logger.error('signaling error', { message: msg.message });
      break;

    case 'offer': {
      logger.info('received offer, creating peer connection');
      if (pc) {
        try {
          pc.close();
        } catch {
          // ignore
        }
      }
      let controlChannel = null;
      let filesChannel = null;
      let filesHandler = null;

      function ensureFilesHandler() {
        if (!filesHandler && controlChannel && filesChannel) {
          filesHandler = createFilesHandler(
            (payload) => controlChannel.sendMessage(JSON.stringify(payload)),
            filesChannel
          );
        }
        return filesHandler;
      }

      pc = createPeerConnectionForOffer({
        onLocalDescription: (sdp, type) => {
          if (type === 'answer') sendSignal({ type: 'answer', sdp });
        },
        onLocalCandidate: (candidate, mid) => {
          sendSignal({ type: 'ice', candidate, sdpMid: mid });
        },
        onDataChannel: (dc) => {
          const label = dc.getLabel();
          logger.info('data channel received', { label });

          if (label === 'control') {
            controlChannel = dc;
            dc.onOpen(() => logger.info('control channel open'));
            dc.onClosed(() => logger.info('control channel closed'));
            dc.onMessage((rawMsg) => {
              let parsed;
              try {
                parsed = JSON.parse(rawMsg.toString());
              } catch {
                return;
              }
              if (parsed.type === 'command') {
                handleCommandMessage(parsed, (result) => dc.sendMessage(JSON.stringify(result)));
              } else if (parsed.type === 'input') {
                handleInputMessage(parsed);
              } else {
                const handler = ensureFilesHandler();
                if (handler) handler.handleControlMessage(parsed);
              }
            });
            ensureFilesHandler();
            return;
          }

          if (label === 'screen') {
            let stopStream = null;
            dc.onOpen(() => {
              logger.info('screen channel open, starting capture');
              stopStream = startScreenStream(dc, { fps: 5 });
            });
            dc.onClosed(() => {
              logger.info('screen channel closed');
              if (stopStream) stopStream();
            });
            return;
          }

          if (label === 'files') {
            filesChannel = dc;
            dc.onOpen(() => logger.info('files channel open'));
            dc.onClosed(() => logger.info('files channel closed'));
            dc.onMessage((rawMsg) => {
              const handler = ensureFilesHandler();
              if (handler && Buffer.isBuffer(rawMsg)) handler.handleFileChunk(rawMsg);
            });
            ensureFilesHandler();
          }
        },
      });
      pc.setRemoteDescription(msg.sdp, 'offer');
      break;
    }

    case 'ice':
      if (pc && msg.candidate) {
        try {
          pc.addRemoteCandidate(msg.candidate, msg.sdpMid);
        } catch (err) {
          logger.error('failed to add remote candidate', { message: err.message });
        }
      }
      break;

    case 'peer-disconnected':
      logger.info('peer disconnected');
      if (pc) {
        try {
          pc.close();
        } catch {
          // ignore
        }
        pc = null;
      }
      break;

    default:
      break;
  }
}

connectSignaling();
