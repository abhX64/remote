# Remote PC Control

Remotely view and control your own PC from a browser (desktop or phone):
live screen view, mouse/keyboard/touch input, shell commands, and file
browsing/transfer, all over an encrypted, NAT-traversing WebRTC connection
gated by a shared pairing token.

## Components

- `server/` — signaling relay (Node.js). Relays WebRTC handshake messages
  between the agent and an authenticated client. Never sees your screen,
  input, command output, or files.
- `agent/` — runs on the PC you want to control. Registers with the
  signaling server; streams the screen, injects mouse/keyboard input,
  executes shell commands, and serves file listing/download/upload, all
  over WebRTC DataChannels.
- `client/` — a web page (works on desktop and mobile browsers) you open to
  connect and control the PC. Served by the signaling server, or open
  `client/index.html` directly for local testing.

## Setup

1. **Generate a pairing token** (do this once):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Server**: copy `server/.env.example` to `server/.env`, set `PAIRING_TOKEN`
   to the value you generated.
   ```bash
   cd server
   npm install
   npm start
   ```

3. **Agent**: copy `agent/.env.example` to `agent/.env`. Set `PAIRING_TOKEN`
   to the same value as the server, `DEVICE_ID` to any name you choose, and
   `SIGNALING_URL` to your server's WebSocket URL (`ws://localhost:8080` for
   local testing, `wss://your-deployed-host` once deployed).
   ```bash
   cd agent
   npm install
   npm start
   ```

4. **Client**: open `http://localhost:8080` (served by the signaling
   server) in a browser, enter the same Device ID and pairing token, click
   Connect. Once status shows "Connected." you can:
   - see the live screen and control the mouse/keyboard by interacting with
     the canvas (touch works too, for phones/tablets)
   - run shell commands (the working directory persists across commands,
     like a real terminal — `cd` actually sticks)
   - browse files: enter a path and click List, click a folder to navigate
     into it, click Download on a file, or pick a local file and click
     Upload to send it to the currently-listed folder

   To control from a different device on the same network, use the PC's
   LAN IP instead of `localhost` (find it with `ipconfig`), e.g.
   `http://192.168.1.10:8080`. Note: some browser APIs (like
   `crypto.randomUUID`) are restricted to "secure contexts" (HTTPS or
   `localhost`) — the client already falls back for this, but keep it in
   mind if you add features that touch other secure-context-only APIs.

## Security notes

- Keep `PAIRING_TOKEN` secret — anyone with it and network access to the
  signaling server can execute commands on your PC. Rotate it by changing
  both `.env` files and restarting the agent.
- Only the signaling handshake goes through the relay server; the actual
  command/screen/input/file traffic goes over an encrypted (DTLS) WebRTC
  DataChannel, direct between client and agent where possible.
- Before exposing the signaling server to the internet, deploy it behind
  TLS (`wss://`) — most hosts (Fly.io, Render, etc.) provide this
  automatically.

## Deploying the signaling server

Any small Node.js host works (Fly.io, Render free tier, a cheap VPS). Set
`PORT` and `PAIRING_TOKEN` as environment variables there; don't commit
`.env`.

## What's left

- **Auto-start**: scripts to launch the agent silently at Windows logon are
  ready in `agent/scripts/` (`install-autostart.ps1` /
  `uninstall-autostart.ps1`) but not yet installed — run the install script
  when you're ready to stop starting the agent manually.
- **TURN server**: STUN-only NAT traversal will fail on some networks
  (symmetric NAT is common on mobile/some routers). If the client can't
  connect from outside your home network, add a TURN server (self-hosted
  `coturn` or a hosted free tier) and include it in both
  `agent/src/webrtc.js`'s `ICE_SERVERS` and `client/src/app.js`'s
  `iceServers`.
- **Hardening**: token rotation flow, session/connection expiry, and a
  review of logging are not yet done — fine for personal LAN use, worth
  doing before relying on this over the open internet long-term.
- File download is buffered entirely in browser memory before saving (fine
  up to a couple hundred MB; very large files would need streaming to disk
  instead).
