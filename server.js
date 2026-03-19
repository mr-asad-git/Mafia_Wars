// ═══════════════════════════════════════════════════
// MAFIA PROTOCOL — server.js
// HTTP static server + WebSocket relay for LAN play
// ═══════════════════════════════════════════════════
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { WebSocketServer, OPEN } = require('ws');
const { networkInterfaces } = require('os');

const PORT = 8080;
const DIR  = __dirname;
const MIME = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.json':'application/json' };

// ── HTTP — serve static files ─────────────────────
const httpServer = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if(url === '/') url = '/index.html';
  const file = path.join(DIR, url);
  if(!file.startsWith(DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if(err) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain', 'Cache-Control':'no-cache' });
    res.end(data);
  });
});

// ── WebSocket relay ───────────────────────────────
const wss  = new WebSocketServer({ server: httpServer });
const rooms = new Map(); // code → Map<socketId, ws>
let nextId  = 1;

wss.on('connection', ws => {
  ws.sid  = (nextId++).toString(36);
  ws.room = null;

  ws.on('message', raw => {
    try { handle(ws, JSON.parse(raw)); } catch(_) {}
  });

  ws.on('close', () => {
    if(!ws.room) return;
    const room = rooms.get(ws.room);
    if(!room) return;
    room.delete(ws.sid);
    relay(ws.room, { type:'PLAYER_DISCONNECTED', payload:{ sid:ws.sid } }, ws.sid);
    if(room.size === 0) rooms.delete(ws.room);
  });
});

function handle(ws, msg) {
  const { type, roomCode, payload } = msg;

  if(type === 'CREATE') {
    const code = roomCode.toUpperCase();
    if(rooms.has(code)) { reply(ws, 'ERR', { msg:'Room already exists.' }); return; }
    const room = new Map([[ws.sid, ws]]);
    rooms.set(code, room);
    ws.room    = code;
    ws.isHost  = true;
    reply(ws, 'CREATED', { sid:ws.sid });
    return;
  }

  if(type === 'JOIN') {
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);
    if(!room) { reply(ws, 'ERR', { msg:'Room not found. Check the code.' }); return; }
    room.set(ws.sid, ws);
    ws.room = code;
    // Notify all others (especially host) about join
    relay(code, { type:'JOIN', from:ws.sid, payload }, ws.sid);
    reply(ws, 'JOINED', { sid:ws.sid });
    return;
  }

  // RELAY_ALL — host broadcasts to all except itself
  if(type === 'RELAY_ALL') {
    relay(ws.room, payload, ws.sid);
    return;
  }

  // RELAY_HOST — client sends to host only
  if(type === 'RELAY_HOST') {
    const room = rooms.get(ws.room);
    if(!room) return;
    for(const [, sock] of room){
      if(sock.isHost && sock.readyState === OPEN){
        sock.send(JSON.stringify({ ...payload, from:ws.sid }));
        break;
      }
    }
    return;
  }
}

function relay(roomCode, msg, excludeSid) {
  const room = rooms.get(roomCode);
  if(!room) return;
  const raw = JSON.stringify(msg);
  room.forEach((sock, sid) => {
    if(sid !== excludeSid && sock.readyState === OPEN) sock.send(raw);
  });
}

function reply(ws, type, payload) {
  if(ws.readyState === OPEN) ws.send(JSON.stringify({ type, payload }));
}

// ── Start ─────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  const nets = networkInterfaces();
  let lanIP  = 'your-ip';
  for(const name of Object.keys(nets)){
    for(const net of nets[name]){
      if(net.family === 'IPv4' && !net.internal){ lanIP = net.address; break; }
    }
    if(lanIP !== 'your-ip') break;
  }

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║       MAFIA PROTOCOL  v2.0           ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Local  : http://localhost:${PORT}     ║`);
  console.log(`║  Network: http://${lanIP}:${PORT}  ║`);
  console.log('╠══════════════════════════════════════╣');
  console.log('║  Share the Network URL with players  ║');
  console.log('║  on the same WiFi to play together!  ║');
  console.log('╚══════════════════════════════════════╝\n');
});
