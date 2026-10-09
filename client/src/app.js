const els = {
  deviceId: document.getElementById('deviceId'),
  token: document.getElementById('token'),
  connectBtn: document.getElementById('connectBtn'),
  status: document.getElementById('status'),
  cmdForm: document.getElementById('cmdForm'),
  cmdInput: document.getElementById('cmdInput'),
  output: document.getElementById('output'),
  screenCanvas: document.getElementById('screenCanvas'),
};

let ws = null;
let pc = null;
let controlDc = null;
let screenDc = null;
let filesDc = null;
let inputAttached = false;
let filesPanel = null;
const pending = new Map();

// crypto.randomUUID() only exists in secure contexts (https, or localhost).
// Plain http://<lan-ip> (e.g. testing from a phone) doesn't qualify, so fall
// back to a non-cryptographic id generator for request correlation only.
function generateId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const screenView = createScreenView(els.screenCanvas);

function setStatus(text) {
  els.status.textContent = text;
}

function appendOutput(text) {
  els.output.textContent += text + '\n';
  els.output.scrollTop = els.output.scrollHeight;
}

function sendControl(payload) {
  if (controlDc && controlDc.readyState === 'open') {
    controlDc.send(JSON.stringify(payload));
  }
}

function connect() {
  const deviceId = els.deviceId.value.trim();
  const token = els.token.value;
  if (!deviceId || !token) {
    setStatus('Enter device ID and token first.');
    return;
  }

  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  ws = new WebSocket(wsUrl);

  pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  controlDc = pc.createDataChannel('control');
  screenDc = pc.createDataChannel('screen');
  screenDc.binaryType = 'blob';
  filesDc = pc.createDataChannel('files');
  filesDc.binaryType = 'arraybuffer';

  controlDc.onopen = () => {
    setStatus('Connected.');
    els.cmdInput.disabled = false;
    if (!inputAttached) {
      attachInputHandlers(els.screenCanvas, sendControl);
      inputAttached = true;
    }
    if (!filesPanel) {
      filesPanel = createFilesPanel({ sendControl, getFilesDc: () => filesDc });
    }
  };
  controlDc.onclose = () => {
    setStatus('Control channel closed.');
    els.cmdInput.disabled = true;
  };
  controlDc.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === 'command-result') {
      const resolve = pending.get(msg.requestId);
      if (resolve) {
        resolve(msg);
        pending.delete(msg.requestId);
      }
    } else if (filesPanel) {
      filesPanel.handleControlMessage(msg);
    }
  };

  screenDc.onmessage = (event) => {
    screenView.renderFrame(event.data);
  };

  filesDc.onmessage = (event) => {
    if (filesPanel) filesPanel.handleFileChunk(event.data);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'ice',
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
      }));
    }
  };

  ws.onopen = async () => {
    setStatus('Signaling connected, creating offer...');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'offer', deviceId, token, sdp: pc.localDescription.sdp }));
  };

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'error') {
      setStatus(`Error: ${msg.message}`);
      return;
    }

    if (msg.type === 'answer') {
      await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
      setStatus('Answer received, establishing connection...');
      return;
    }

    if (msg.type === 'ice') {
      try {
        await pc.addIceCandidate({ candidate: msg.candidate, sdpMid: msg.sdpMid });
      } catch (err) {
        console.warn('Failed to add ICE candidate', err);
      }
      return;
    }

    if (msg.type === 'peer-disconnected') {
      setStatus('Agent disconnected.');
      els.cmdInput.disabled = true;
    }
  };

  ws.onclose = () => setStatus('Signaling connection closed.');
  ws.onerror = () => setStatus('Signaling connection error.');
}

function sendCommand(cmd) {
  return new Promise((resolve, reject) => {
    if (!controlDc || controlDc.readyState !== 'open') {
      reject(new Error('Control channel not open'));
      return;
    }
    const requestId = generateId();
    pending.set(requestId, resolve);
    controlDc.send(JSON.stringify({ type: 'command', requestId, cmd }));
    setTimeout(() => {
      if (pending.has(requestId)) {
        pending.delete(requestId);
        reject(new Error('Command timed out'));
      }
    }, 35000);
  });
}

els.connectBtn.addEventListener('click', connect);

els.cmdForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const cmd = els.cmdInput.value;
  if (!cmd.trim()) return;
  appendOutput(`> ${cmd}`);
  els.cmdInput.value = '';
  try {
    const result = await sendCommand(cmd);
    if (result.stdout) appendOutput(result.stdout.replace(/\s+$/, ''));
    if (result.stderr) appendOutput(`[stderr] ${result.stderr.replace(/\s+$/, '')}`);
    if (result.error) appendOutput(`[error] ${result.error}`);
    appendOutput(`(exit code ${result.code})`);
  } catch (err) {
    appendOutput(`[client error] ${err.message}`);
  }
});
