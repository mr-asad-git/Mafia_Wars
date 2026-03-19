// ═══════════════════════════════════════════════════
// MAFIA PROTOCOL — server.js  (production-ready)
// ═══════════════════════════════════════════════════
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer, OPEN } = require('ws');

const PORT         = parseInt(process.env.PORT, 10) || 8080;
const MAX_ROOM     = parseInt(process.env.MAX_ROOM_SIZE, 10) || 12;
const RATE_LIMIT   = parseInt(process.env.RATE_LIMIT_MSG_PER_SEC, 10) || 30;
const DIR          = __dirname;

// ── MIME types (including audio for music assets) ──
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
};

// ── Sanitisation helpers ───────────────────────────
const sanitiseCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
const sanitiseName = s => String(s || 'Agent').replace(/[<>"']/g, '').trim().slice(0, 20) || 'Agent';

// ── HTTP — static file server ──────────────────────
const httpServer = http.createServer((req, res) => {
  // ── Health check ──────────────────────────────
  if (req.url === '/health') {
    let conns = 0;
    rooms.forEach(r => { conns += r.size; });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, connections: conns }));
    return;
  }

  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';

  // Path traversal guard
  const file = path.resolve(DIR, '.' + url);
  if (!file.startsWith(DIR + path.sep) && file !== DIR) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(file).toLowerCase();
    const ct  = MIME[ext] || 'application/octet-stream';
    // Cache static assets; no-cache for HTML
    const cc  = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': cc });
    res.end(data);
  });
});

// ── Room state ─────────────────────────────────────
// rooms: Map<code, Map<sid, ws>>
const rooms = new Map();
let nextId  = 1;

// ── Stale room cleanup (every 10 min) ─────────────
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    // Remove sockets that have closed without cleanup
    for (const [sid, sock] of room) {
      if (sock.readyState !== OPEN) room.delete(sid);
    }
    // Remove rooms with no host or idle > 2 hr
    const hasHost = [...room.values()].some(s => s.isHost);
    const idle    = now - (room._created || now);
    if (room.size === 0 || !hasHost || idle > 7200000) {
      rooms.delete(code);
      console.log(`[SWEEP] Removed stale room: ${code}`);
    }
  }
}, 600_000);

// ── WebSocket server ───────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  ws.sid  = (nextId++).toString(36);
  ws.room = null;
  ws.isHost = false;
  ws._msgCount = 0;
  ws._rateTimer = setInterval(() => { ws._msgCount = 0; }, 1000);

  ws.on('message', raw => {
    // ── Rate limiting ──────────────────────────
    ws._msgCount++;
    if (ws._msgCount > RATE_LIMIT) {
      ws.terminate();
      return;
    }
    // ── Parse & handle ─────────────────────────
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
    if (typeof msg !== 'object' || !msg.type) return;
    handle(ws, msg);
  });

  ws.on('close', () => {
    clearInterval(ws._rateTimer);
    if (!ws.room) return;
    const room = rooms.get(ws.room);
    if (!room) return;
    room.delete(ws.sid);
    relay(ws.room, { type: 'PLAYER_DISCONNECTED', payload: { sid: ws.sid } }, ws.sid);
    if (room.size === 0) rooms.delete(ws.room);
  });

  ws.on('error', err => {
    console.error(`[WS] Socket error (${ws.sid}):`, err.message);
  });
});

// ── Message handler ────────────────────────────────
function handle(ws, msg) {
  const { type, roomCode, payload } = msg;

  // ── CREATE ──────────────────────────────────────
  if (type === 'CREATE') {
    const code = sanitiseCode(roomCode);
    if (code.length !== 4) { reply(ws, 'ERR', { msg: 'Invalid room code.' }); return; }
    if (rooms.has(code))   { reply(ws, 'ERR', { msg: 'Room already exists. Try again.' }); return; }
    const room = new Map([[ws.sid, ws]]);
    room._created = Date.now();
    rooms.set(code, room);
    ws.room   = code;
    ws.isHost = true;
    reply(ws, 'CREATED', { sid: ws.sid });
    console.log(`[ROOM] Created: ${code} by ${ws.sid}`);
    return;
  }

  // ── JOIN ────────────────────────────────────────
  if (type === 'JOIN') {
    const code = sanitiseCode(roomCode);
    const room = rooms.get(code);
    if (!room)               { reply(ws, 'ERR', { msg: 'Room not found. Check the code.' }); return; }
    if (room.has(ws.sid))    { reply(ws, 'ERR', { msg: 'Already in this room.' }); return; }
    if (room.size >= MAX_ROOM) { reply(ws, 'ERR', { msg: 'Room is full.' }); return; }

    // Sanitise join payload
    const safeName  = sanitiseName(payload?.name);
    const safeColor = String(payload?.color || '#1e3a5f').replace(/[^#a-fA-F0-9]/g, '').slice(0, 7);

    room.set(ws.sid, ws);
    ws.room = code;
    relay(code, { type: 'JOIN', from: ws.sid, payload: { name: safeName, color: safeColor } }, ws.sid);
    reply(ws, 'JOINED', { sid: ws.sid });
    console.log(`[ROOM] ${ws.sid} joined ${code}`);
    return;
  }

  // ── RELAY_ALL — host → all clients ─────────────
  if (type === 'RELAY_ALL') {
    if (!ws.room) return;
    relay(ws.room, payload, ws.sid);
    return;
  }

  // ── RELAY_HOST — client → host only ────────────
  if (type === 'RELAY_HOST') {
    const room = rooms.get(ws.room);
    if (!room) return;
    for (const [, sock] of room) {
      if (sock.isHost && sock.readyState === OPEN) {
        sock.send(JSON.stringify({ ...payload, from: ws.sid }));
        break;
      }
    }
    return;
  }
}

// ── Relay helpers ──────────────────────────────────
function relay(roomCode, msg, excludeSid) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const raw = JSON.stringify(msg);
  for (const [sid, sock] of room) {
    if (sid !== excludeSid && sock.readyState === OPEN) sock.send(raw);
  }
}

function reply(ws, type, payload) {
  if (ws.readyState === OPEN) ws.send(JSON.stringify({ type, payload }));
}

// ── Global error guards (prevent crashes) ─────────
process.on('uncaughtException', err => {
  console.error('[FATAL] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});

// ── Start ──────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  const isLocal = !process.env.RENDER && !process.env.RAILWAY_ENVIRONMENT;
  console.log(`\n🎭 MAFIA PROTOCOL — Server Running`);
  console.log(`   Port     : ${PORT}`);
  if (isLocal) {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let lan = 'your-ip';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) { lan = net.address; break; }
      }
      if (lan !== 'your-ip') break;
    }
    console.log(`   Local    : http://localhost:${PORT}`);
    console.log(`   Network  : http://${lan}:${PORT}`);
  } else {
    console.log(`   Environment: ${process.env.RENDER ? 'Render' : 'Railway'}`);
  }
  console.log(`   Health   : /health\n`);
});
