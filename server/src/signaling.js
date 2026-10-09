const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const FAILED_ATTEMPT_LIMIT = 10;
const FAILED_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

function createSignalingServer(server, { pairingToken }) {
  const wss = new WebSocketServer({ server });

  const agentsByDeviceId = new Map(); // deviceId -> connId
  const connections = new Map(); // connId -> { ws, role, deviceId, pairedWith }
  const failedAttempts = new Map(); // ip -> { count, windowStart }

  function isRateLimited(ip) {
    const entry = failedAttempts.get(ip);
    if (!entry || Date.now() - entry.windowStart > FAILED_ATTEMPT_WINDOW_MS) return false;
    return entry.count >= FAILED_ATTEMPT_LIMIT;
  }

  function recordFailedAttempt(ip) {
    const now = Date.now();
    const entry = failedAttempts.get(ip);
    if (!entry || now - entry.windowStart > FAILED_ATTEMPT_WINDOW_MS) {
      failedAttempts.set(ip, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
    }
  }

  function safeSend(ws, payload) {
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
  }

  function tokenValid(token) {
    if (typeof token !== 'string' || typeof pairingToken !== 'string' || token.length === 0) return false;
    const a = Buffer.from(token);
    const b = Buffer.from(pairingToken);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  wss.on('connection', (ws, req) => {
    const connId = crypto.randomUUID();
    const ip = req.socket.remoteAddress;
    connections.set(connId, { ws, role: null, deviceId: null, pairedWith: null });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const conn = connections.get(connId);
      if (!conn) return;

      switch (msg.type) {
        case 'register': {
          if (isRateLimited(ip)) {
            safeSend(ws, { type: 'error', message: 'rate limited' });
            ws.close();
            return;
          }
          if (!tokenValid(msg.token) || typeof msg.deviceId !== 'string' || !msg.deviceId) {
            recordFailedAttempt(ip);
            safeSend(ws, { type: 'error', message: 'invalid token or deviceId' });
            ws.close();
            return;
          }
          conn.role = 'agent';
          conn.deviceId = msg.deviceId;
          agentsByDeviceId.set(msg.deviceId, connId);
          safeSend(ws, { type: 'registered', deviceId: msg.deviceId });
          break;
        }

        case 'offer': {
          if (isRateLimited(ip)) {
            safeSend(ws, { type: 'error', message: 'rate limited' });
            ws.close();
            return;
          }
          if (!tokenValid(msg.token)) {
            recordFailedAttempt(ip);
            safeSend(ws, { type: 'error', message: 'invalid token' });
            ws.close();
            return;
          }
          const agentConnId = agentsByDeviceId.get(msg.deviceId);
          const agentConn = agentConnId && connections.get(agentConnId);
          if (!agentConn) {
            safeSend(ws, { type: 'error', message: 'device offline' });
            return;
          }
          conn.role = 'client';
          conn.pairedWith = agentConnId;
          agentConn.pairedWith = connId;
          safeSend(agentConn.ws, { type: 'offer', sdp: msg.sdp, from: connId });
          break;
        }

        case 'answer':
        case 'ice': {
          if (!conn.pairedWith) return;
          const peer = connections.get(conn.pairedWith);
          if (!peer) return;
          const forwarded = { ...msg, from: connId };
          delete forwarded.token;
          safeSend(peer.ws, forwarded);
          break;
        }

        default:
          break;
      }
    });

    ws.on('close', () => {
      const conn = connections.get(connId);
      if (conn) {
        if (conn.role === 'agent' && conn.deviceId) {
          agentsByDeviceId.delete(conn.deviceId);
        }
        if (conn.pairedWith) {
          const peer = connections.get(conn.pairedWith);
          if (peer) {
            peer.pairedWith = null;
            safeSend(peer.ws, { type: 'peer-disconnected' });
          }
        }
      }
      connections.delete(connId);
    });
  });

  return wss;
}

module.exports = { createSignalingServer };
