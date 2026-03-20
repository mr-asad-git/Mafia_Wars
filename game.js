// ═══════════════════════════════════════════════════
// MAFIA PROTOCOL — game.js  v2.1 (fixed)
// ═══════════════════════════════════════════════════
/* global BGScene */

// ── ROLES ────────────────────────────────────────────
const R = {
  Mafia: { letter: 'M', emoji: '🔴', css: 'tag-mafia', desc: 'Eliminate the town each night.' },
  Doctor: { letter: 'D', emoji: '💚', css: 'tag-doctor', desc: 'Save one player from Mafia each night.' },
  Detective: { letter: 'C', emoji: '🔵', css: 'tag-detective', desc: 'Secretly investigate one player per night.' },
  Civillian: { letter: 'V', emoji: '⚪', css: 'tag-civillian', desc: 'Find and vote out all Mafia members.' }
};

// ── PHASES ────────────────────────────────────────────
const PHASES = [
  { id: 'night_mafia', name: '🌑 Midnight', sub: 'Mafia chooses a target', role: 'Mafia', time: 60, act: true },
  { id: 'night_doc', name: '🌒 1:00 AM', sub: 'Doctor chooses who to protect', role: 'Doctor', time: 60, act: true },
  { id: 'night_cop', name: '🌓 2:00 AM', sub: 'Detective investigates a player', role: 'Detective', time: 60, act: true },
  { id: 'day_report', name: '🌅 Dawn', sub: 'Night results revealed to all', role: 'none', time: 10, act: false },
  { id: 'day_discuss', name: '☀️ Town Square', sub: 'Discuss & vote — 2 minutes', role: 'all', time: 120, act: true }
];

// Phase → BGScene theme + UI accent color
const PHASE_STYLE = {
  night_mafia: { scene: 'night_mafia', border: 'rgba(239,68,68,0.35)', bg: 'rgba(239,68,68,0.07)', timerColor: '#ef4444' },
  night_doc: { scene: 'night_doc', border: 'rgba(16,185,129,0.35)', bg: 'rgba(16,185,129,0.07)', timerColor: '#10b981' },
  night_cop: { scene: 'night_cop', border: 'rgba(59,130,246,0.35)', bg: 'rgba(59,130,246,0.07)', timerColor: '#3b82f6' },
  day_report: { scene: 'dawn', border: 'rgba(245,158,11,0.35)', bg: 'rgba(245,158,11,0.07)', timerColor: '#f59e0b' },
  day_discuss: { scene: 'discuss', border: 'rgba(255,255,255,0.1)', bg: 'rgba(255,255,255,0.04)', timerColor: '#ffffff' }
};

// ── STATE ─────────────────────────────────────────────
const G = {
  mode: 'multi', isHost: false, myName: '', myId: '', roomCode: '',
  settings: { mafia: 2, civillian: 4 },
  players: [], myRole: null, phaseIdx: -1,
  timer: null, timeLeft: 0,
  selectedTarget: null, actionSent: false,
  night: { mafiaVotes: {}, docSave: null, copTarget: null },
  dayVotes: {}, dayVoteCount: 0,
  acksNeeded: 0, acksGot: 0,
  timerColor: '#ffffff',
  chatOpen: false, chatUnread: 0,
  docSelfSavesLeft: 2,
  kicked: false
};

const BOT_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
const COLORS = ['#7f1d1d', '#14532d', '#1e3a5f', '#4a1d96', '#713f12', '#292524', '#154e4b', '#3b1f0a'];

// ── HELPERS ───────────────────────────────────────────
const $ = id => document.getElementById(id);
const alive = () => G.players.filter(p => p.alive);
const mafiaAlive = () => G.players.filter(p => p.alive && p.role === 'Mafia');
const townAlive = () => G.players.filter(p => p.alive && p.role !== 'Mafia');
const uid = () => Math.random().toString(36).slice(2, 9);
const genCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();
const getColor = i => COLORS[i % COLORS.length];
const roleObj = id => R[id] || R.Civillian;
const mkAv = (name, color) =>
  `<div class="avatar" style="background:${color}">${(name || '?')[0].toUpperCase()}</div>`;

// ── AUDIO ─────────────────────────────────────────────
const BGM_TRACKS = [
  'music/background/Mission-Impossible.mp3',
  'music/background/song1.mp3',
  'music/background/song2.mp3',
  'music/background/song3.mp3',
  'music/background/song4.mp3'
];
function playBgMusic(track) {
  const bgm = $('bgm');
  if (!bgm || !track) return;
  if (bgm.src && bgm.src.endsWith(track)) {
    if (bgm.paused) bgm.play().catch(() => { });
  } else {
    bgm.src = track;
    bgm.volume = 0.4;
    bgm.play().catch(() => { });
  }
}
function playKillSound() {
  const bgm = $('bgm');
  const sfx = $('killSfx');
  if (sfx) {
    if (bgm) bgm.volume = 0.1;
    sfx.currentTime = 0;
    sfx.volume = 1.0;
    sfx.play().catch(() => { });
    setTimeout(() => {
      if (bgm) bgm.volume = 0.4;
    }, 4000); // 4 seconds ducking
  }
}

// ── WEBSOCKET NETWORK ─────────────────────────────────
// FIX: toAll/toHost wrap the game message as `payload`
// to avoid overwriting the routing `type` field.
const NET = {
  ws: null, sid: null,

  connect(onReady) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = location.hostname || 'localhost';
    try { this.ws = new WebSocket(`${proto}//${host}:8080`); }
    catch (e) { showErr('Cannot open WebSocket connection.'); return; }

    this.ws.onerror = () => showErr('Cannot reach server — run START SERVER.bat first.');

    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);

      // ── Server-level messages ──────────────────────
      if (m.type === 'CREATED') {
        // FIX: set myId here (not in a fragile setTimeout)
        this.sid = m.payload.sid;
        G.myId = this.sid;
        G.players[0].id = G.myId;   // patch host player record
        onReady && onReady('created');
        return;
      }
      if (m.type === 'JOINED') {
        // FIX: set myId here before navigating to lobby
        this.sid = m.payload.sid;
        G.myId = this.sid;
        onReady && onReady('joined');
        return;
      }
      if (m.type === 'ERR') { showErr(m.payload.msg); return; }

      // JOIN relayed from server → host's onMsg handles it
      if (m.type === 'JOIN') { onMsg({ type: 'JOIN', from: m.from, payload: m.payload }); return; }

      if (m.type === 'PLAYER_DISCONNECTED') {
        // Optional: show toast
        appendChat('System', `A player disconnected.`, false, true);
        return;
      }

      // All other messages are game messages relayed from host
      onMsg(m);
    };

    this.ws.onopen = () => { /* waiting for CREATED/JOINED before acting */ };
  },

  raw(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); },

  // Host → all clients (server excludes sender)
  // FIX: wrap game message as `payload` so server `type` field isn't overwritten
  toAll(msg) { this.raw({ type: 'RELAY_ALL', roomCode: G.roomCode, payload: msg }); },

  // Client → host only
  // FIX: same wrapping fix
  toHost(msg) { this.raw({ type: 'RELAY_HOST', roomCode: G.roomCode, payload: msg }); },

  create(code) { this.raw({ type: 'CREATE', roomCode: code }); },
  join(code, payload) { this.raw({ type: 'JOIN', roomCode: code, payload }); }
};

// ── NAVIGATION ────────────────────────────────────────
function nav(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.add('hidden'); s.classList.remove('active');
  });
  const t = $('s-' + id);
  if (t) { t.classList.remove('hidden'); t.classList.add('active'); }
}

// ── MODE TOGGLE ───────────────────────────────────────
function setMode(m) {
  G.mode = m;
  $('btn-multi').classList.toggle('active', m === 'multi');
  $('btn-bot').classList.toggle('active', m === 'bot');
  $('modePill').style.transform = m === 'multi' ? 'translateX(0)' : 'translateX(calc(100% + 4px))';
  $('modeHint').textContent = m === 'multi'
    ? 'All devices on same Wi-Fi can join via the server IP'
    : 'Single device — AI bots fill all other roles';
}

// ── SLIDER UI ─────────────────────────────────────────
function updateSliders() {
  const m = +$('mafiaSlider').value, v = +$('civillianSlider').value;
  G.settings.mafia = m; G.settings.civillian = v;
  $('mafiaVal').textContent = m;
  $('civillianVal').textContent = v;
  $('roleBreakdown').innerHTML =
    `<span class="tag tag-mafia">${m} Mafia</span>` +
    `<span class="tag tag-doctor">1 Doctor</span>` +
    `<span class="tag tag-detective">1 Detective</span>` +
    `<span class="tag tag-civillian">${v} Civillian${v > 1 ? 's' : ''}</span>` +
    `<span class="tag tag-neutral">= ${m + v + 2} players</span>`;
}

// ── OTP INPUT ─────────────────────────────────────────
function otpIn(inp) {
  inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  inp.classList.toggle('filled', !!inp.value);
  const i = +inp.dataset.idx;
  if (inp.value && i < 3) document.querySelectorAll('.otp-box')[i + 1].focus();
}
function otpKey(e, inp) {
  if (e.key === 'Backspace' && !inp.value && +inp.dataset.idx > 0) {
    const prev = document.querySelectorAll('.otp-box')[+inp.dataset.idx - 1];
    prev.value = ''; prev.classList.remove('filled'); prev.focus();
  }
}
function getOtp() { return [...document.querySelectorAll('.otp-box')].map(b => b.value).join('').toUpperCase(); }

function copyCode() {
  navigator.clipboard?.writeText(G.roomCode).catch(() => { });
  $('copyBtn').textContent = '✓ Copied'; setTimeout(() => { $('copyBtn').textContent = '📋 Copy'; }, 2000);
}
function showErr(msg) { $('joinErr').textContent = msg; $('joinErr').classList.remove('hidden'); }

// ── CREATE ROOM ───────────────────────────────────────
function createRoom() {
  const name = $('hostName').value.trim() || 'Host';
  G.myName = name; G.isHost = true;
  G.settings.mafia = +$('mafiaSlider').value;
  G.settings.civillian = +$('civillianSlider').value;
  G.roomCode = genCode();
  G.players = [{ id: '__pending__', name, role: null, alive: true, color: getColor(0), bot: false }];

  if (G.mode === 'bot') {
    // Bot mode: no server needed
    G.myId = uid();
    G.players[0].id = G.myId;
    const total = G.settings.mafia + G.settings.civillian + 2;
    for (let i = 0; i < total - 1; i++)
      G.players.push({ id: uid(), name: BOT_NAMES[i % BOT_NAMES.length], role: null, alive: true, color: getColor(i + 1), bot: true });
    openLobby();
  } else {
    // Multi mode: connect then create room
    NET.connect(result => {
      if (result === 'created') openLobby();
    });
    // Send CREATE after WebSocket opens
    NET.ws.addEventListener('open', () => NET.create(G.roomCode), { once: true });
  }
}

function openLobby() {
  nav('lobby');
  $('lobbyCode').textContent = G.roomCode;
  if (G.mode === 'multi') {
    $('multiHint').classList.remove('hidden');
    $('hintCode').textContent = G.roomCode;
  }
  updateLobbyUI();
}

// ── JOIN ROOM ─────────────────────────────────────────
function joinRoom() {
  const name = $('joinName').value.trim() || 'Agent';
  const code = getOtp();
  if (code.length !== 4) { showErr('Enter all 4 letters.'); return; }
  G.myName = name; G.isHost = false; G.roomCode = code;

  NET.connect(result => {
    if (result === 'joined') {
      // G.myId is already set by JOINED handler
      nav('lobby');
      $('lobbyCode').textContent = code;
      $('startBtn').disabled = true;
      $('startBtn').textContent = 'Waiting for host to start…';
    }
  });
  NET.ws.addEventListener('open', () => {
    NET.join(code, { name, color: getColor(Math.floor(Math.random() * 8)) });
  }, { once: true });
}

// ── MESSAGE HANDLER ───────────────────────────────────
function onMsg(msg) {
  if (G.kicked) return;
  const { type, from, payload } = msg;

  // ─ HOST-only handlers ─────────────────────────────
  if (G.isHost) {
    if (type === 'JOIN') {
      if (G.phaseIdx === -1 && G.players.length < totalP()) {
        G.players.push({ id: from, name: payload.name, role: null, alive: true, color: payload.color, bot: false });
        broadcastState();
        updateLobbyUI();
      }
      return;
    }
    if (type === 'ACTION') { hostAction(from, payload.target); return; }
    if (type === 'ACK_CARD') {
      G.acksGot++;
      if (G.acksGot >= G.acksNeeded) setTimeout(hostAdvance, 700);
      return;
    }
    if (type === 'CHAT') {
      NET.toAll({ type: 'CHAT', payload });
      appendChat(payload.name, payload.msg, payload.mafiaOnly, false);
      return;
    }
    if (type === 'MAFIA_SELECT') {
      const sender = G.players.find(p => p.id === from);
      if (sender?.role === 'Mafia') {
        const relayed = { fromId: from, fromName: sender.name, targetId: payload.targetId };
        NET.toAll({ type: 'MAFIA_SELECT', payload: relayed });
        showMafiaTarget(from, sender.name, payload.targetId); // apply on host locally
      }
      return;
    }
  }

  // ─ All clients handlers ────────────────────────────
  if (type === 'STATE') syncState(payload);
  else if (type === 'START') onStart(payload);
  else if (type === 'PHASE') onPhase(payload);
  else if (type === 'CHAT') appendChat(payload.name, payload.msg, payload.mafiaOnly, false);
  else if (type === 'REPORT') showReport(payload);
  else if (type === 'SYS') { appendChat('System', payload.msg, false, true); if (payload.isKill) playKillSound(); }
  else if (type === 'END') showEnd(payload.winner, payload.reason, payload.players, payload.mafiaWinners);
  else if (type === 'COP_RESULT' && payload.to === G.myId)
    appendChat('🔍 Intel', payload.msg, false, true);
  else if (type === 'KICKED') onKicked(payload);
  else if (type === 'VOTE_TALLY') showVoteTally(payload.votes);
  else if (type === 'RESTART') onRestart(payload);
  else if (type === 'MAFIA_SELECT') showMafiaTarget(payload.fromId, payload.fromName, payload.targetId);
}

// ── STATE BROADCAST FROM HOST ─────────────────────────
function broadcastState() {
  NET.toAll({ type: 'STATE', payload: { players: G.players, settings: G.settings } });
}
function syncState(p) {
  G.settings = p.settings;
  G.players = p.players.map(pl => ({ ...pl, isMe: pl.id === G.myId }));
  updateLobbyUI();
}

// ── LOBBY UI ─────────────────────────────────────────
function totalP() { return G.settings.mafia + G.settings.civillian + 2; }

function updateLobbyUI() {
  const list = $('lobbyList');
  list.innerHTML = '';
  G.players.forEach(p => {
    const li = document.createElement('li');
    li.className = `player-row${p.id === G.myId ? ' is-me' : ''}`;
    li.innerHTML =
      mkAv(p.name, p.color) +
      `<span style="flex:1;font-size:14px;font-weight:500;color:${p.id === G.myId ? '#fff' : '#d4d4d8'}">${p.name}</span>` +
      (p.bot ? `<span class="tag tag-neutral">BOT</span>` : '') +
      (p.id === G.myId ? `<span class="tag tag-neutral">YOU</span>` : '');
    if (G.isHost && G.phaseIdx === -1 && p.id !== G.myId) {
      const rb = document.createElement('button');
      rb.className = 'remove-btn'; rb.title = 'Remove player'; rb.textContent = '✕';
      rb.onclick = () => removePlayer(p.id);
      li.appendChild(rb);
    }
    list.appendChild(li);
  });

  const total = totalP();
  $('playerCountLabel').textContent = `${G.players.length} / ${total}`;

  if (G.isHost) {
    const btn = $('startBtn');
    if (G.players.length >= total) {
      btn.disabled = false;
      btn.textContent = '⚡ Commence Protocol';
    } else {
      btn.disabled = true;
      btn.textContent = `Awaiting players (${G.players.length}/${total})…`;
    }
  }
}

// ── KICK PLAYER ───────────────────────────────────────
function removePlayer(playerId) {
  if (!G.isHost || G.phaseIdx !== -1) return;
  NET.toAll({ type: 'KICKED', payload: { id: playerId } });
  G.players = G.players.filter(p => p.id !== playerId);
  broadcastState();
  updateLobbyUI();
}

function onKicked(payload) {
  if (payload.id !== G.myId) {
    // Another player was kicked — remove from local list and refresh lobby
    G.players = G.players.filter(p => p.id !== payload.id);
    updateLobbyUI();
    return;
  }
  // We were kicked
  G.kicked = true;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:999;background:rgba(6,2,14,0.97);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;font-family:Cinzel,serif';
  overlay.innerHTML = `
    <div style="font-size:48px">🚫</div>
    <div style="font-size:22px;color:#c9932a;letter-spacing:2px">REMOVED FROM ROOM</div>
    <div style="font-size:14px;color:#71717a">The host has removed you from this game.</div>
    <button onclick="location.reload()" style="margin-top:12px;padding:12px 32px;background:rgba(201,147,42,0.12);border:1px solid rgba(201,147,42,0.4);border-radius:12px;color:#c9932a;font-family:Cinzel,serif;font-size:14px;cursor:pointer;letter-spacing:1px">Return to Menu</button>
  `;
  document.body.appendChild(overlay);
}

// ── CHAT OVERLAY TOGGLE ───────────────────────────────
function toggleChat() {
  G.chatOpen = !G.chatOpen;
  const overlay = $('chatOverlay');
  const btn = $('chatToggleBtn');
  if (G.chatOpen) {
    overlay.classList.add('chat-open');
    btn.classList.add('chat-active');
    G.chatUnread = 0;
    const badge = $('chatBadge');
    if (badge) { badge.textContent = '0'; badge.classList.remove('visible'); }
    // Scroll to bottom
    const log = $('chatLog');
    if (log) log.scrollTop = log.scrollHeight;
  } else {
    overlay.classList.remove('chat-open');
    btn.classList.remove('chat-active');
  }
}

// ── START GAME ────────────────────────────────────────
function hostStartGame() {
  if (!G.isHost || G.players.length < totalP()) return;

  // Shuffle roles
  const pool = [];
  for (let i = 0; i < G.settings.mafia; i++) pool.push('Mafia');
  pool.push('Doctor', 'Detective');
  for (let i = 0; i < G.settings.civillian; i++) pool.push('Civillian');
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]];
  }
  G.players.forEach((p, i) => { p.role = pool[i]; });

  G.acksNeeded = G.players.length;
  G.acksGot = 0;
  G.phaseIdx = -1;
  G.currentBgm = BGM_TRACKS[Math.floor(Math.random() * BGM_TRACKS.length)];

  // Broadcast START to all clients with full player+role list
  if (G.mode !== 'bot') NET.toAll({ type: 'START', payload: { players: G.players, bgm: G.currentBgm } });
  setupReveal(G.currentBgm); // host reveals own card (bots skip reveal)
}

function onStart(payload) {
  // FIX: use G.myId (now correctly set) to find ourselves
  G.players = payload.players.map(pl => ({ ...pl, isMe: pl.id === G.myId }));
  const me = G.players.find(pl => pl.isMe);
  if (!me) { console.error('onStart: could not find self in player list', G.myId, payload.players); return; }
  G.myRole = me.role;
  G.currentBgm = payload.bgm;
  setupReveal(G.currentBgm);
}

// ── CARD REVEAL ───────────────────────────────────────
function setupReveal(track) {
  if (track) playBgMusic(track);
  const me = G.players.find(p => p.id === G.myId);
  if (!me) { console.error('setupReveal: no me'); return; }
  G.myRole = me.role;
  const ro = roleObj(G.myRole);
  cardFlipped = false;
  $('cardBody').classList.remove('flipped');

  nav('reveal');
  BGScene.setTheme(G.myRole); // role-specific environment on reveal

  // Accent color derived from role
  const accentMap = { Mafia: 'rgba(239,68,68,0.2)', Doctor: 'rgba(16,185,129,0.2)', Detective: 'rgba(59,130,246,0.2)', Civillian: 'rgba(161,161,170,0.15)' };
  const acc = accentMap[G.myRole] || 'rgba(255,255,255,0.08)';

  $('cardFront').style.background = `linear-gradient(145deg, ${acc}, #060608 70%)`;
  $('cardGlow').style.background = `radial-gradient(ellipse at 50% 20%, ${acc.replace('0.2', '0.6')}, transparent 65%)`;
  ['cLetter', 'cLetterBot'].forEach(id => $(id).textContent = ro.letter);
  ['cTopIcon', 'cBottomIcon'].forEach(id => $(id).textContent = ro.emoji);
  $('cRoleIcon').textContent = ro.emoji;
  $('cRoleName').textContent = G.myRole;
  $('cRoleDesc').textContent = ro.desc;
  const cExtra = $('cRoleExtra');
  if (cExtra) {
    if (G.myRole === 'Doctor') {
      G.docSelfSavesLeft = 2;
      cExtra.innerHTML = `<span style="font-size:11px;color:#71717a;letter-spacing:1px;font-family:Cinzel,serif">SELF-SAVES</span><br><span style="font-size:20px;letter-spacing:4px">❤️❤️</span>`;
    } else {
      cExtra.innerHTML = '';
    }
  }
  $('revealHdr').style.opacity = '0';
  $('ackBtn').style.opacity = '0';
  $('ackBtn').style.transform = 'translateY(16px)';
  $('ackBtn').disabled = false;
  $('ackBtn').textContent = 'Acknowledge ✓';

  setTimeout(() => { $('revealHdr').style.opacity = '1'; }, 500);

  // Bots auto-ack after 2s
  if (G.mode === 'bot') {
    const bots = G.players.filter(p => p.bot);
    G.acksGot = bots.length; // Pre-count bots
  }
}

let cardFlipped = false;
function flipCard() {
  if (cardFlipped) return;
  cardFlipped = true;
  $('cardBody').classList.add('flipped');
  setTimeout(() => { $('ackBtn').style.opacity = '1'; $('ackBtn').style.transform = 'translateY(0)'; }, 900);
}

function ackReveal() {
  $('ackBtn').textContent = 'Syncing…'; $('ackBtn').disabled = true;
  if (G.isHost) { G.acksGot++; if (G.acksGot >= G.acksNeeded) setTimeout(hostAdvance, 700); }
  else NET.toHost({ type: 'ACK_CARD' });
}

// ── HOST: PHASE ENGINE ────────────────────────────────
function hostAdvance() {
  if (!G.isHost) return;

  // Resolve day votes before looping back to night
  const prev = PHASES[G.phaseIdx];
  if (prev?.id === 'day_discuss') hostResolveDayVote();

  G.phaseIdx++;
  if (G.phaseIdx >= PHASES.length) G.phaseIdx = 0;
  const phase = PHASES[G.phaseIdx];

  // Win check
  const ma = mafiaAlive().length, to = townAlive().length;
  if (ma === 0) { hostEnd('Town', 'All Mafia eliminated! 🎉'); return; }
  if (ma >= to) {
    const mafiaPlayers = mafiaAlive();
    if (mafiaPlayers.length === 1) {
      hostEnd('Mafia', `${mafiaPlayers[0].name} wins for the Mafia! 💀`);
    } else {
      hostEnd('Mafia Gang', `Mafia gang wins! (${mafiaPlayers.map(p => p.name).join(', ')}) 💀`);
    }
    return;
  }

  // Resets for new phases
  if (phase.id === 'night_mafia') G.night = { mafiaVotes: {}, docSave: null, copTarget: null, docGhost: false, copGhost: false };
  if (phase.id === 'day_discuss') { G.dayVotes = {}; G.dayVoteCount = 0; }

  // Night resolution before day_report
  if (phase.id === 'day_report') hostResolveNight();

  // Build safe player snapshot (role visibility rules)
  const snap = G.players.map(p => ({
    id: p.id, name: p.name, alive: p.alive, color: p.color,
    roleMafia: (p.role === 'Mafia')
  }));

  const phasePayload = { phaseIdx: G.phaseIdx, phase, players: snap };
  if (G.mode !== 'bot') NET.toAll({ type: 'PHASE', payload: phasePayload });
  onPhase(phasePayload); // host applies locally

  if (G.mode === 'bot') botsAct(phase);
  if (phase.id === 'day_report')
    setTimeout(() => { if (G.isHost) hostAdvance(); }, phase.time * 1000);
}

// ── NIGHT RESOLUTION ─────────────────────────────────
function hostResolveNight() {
  let killed = null, maxV = 0;
  for (const [id, cnt] of Object.entries(G.night.mafiaVotes))
    if (cnt > maxV) { maxV = cnt; killed = id; }

  const saved = !!(killed && killed === G.night.docSave);
  let killedP = null;
  if (killed && !saved) {
    killedP = G.players.find(p => p.id === killed);
    if (killedP) killedP.alive = false;
  }
  const savedP = saved ? G.players.find(p => p.id === killed) : null;

  // Detective result — private message + dawn report flag
  let detectiveFoundMafia = false;
  if (G.night.copTarget) {
    const { copId, target } = G.night.copTarget;
    const t = G.players.find(p => p.id === target);
    const cop = G.players.find(p => p.id === copId);
    if (t) detectiveFoundMafia = t.role === 'Mafia';
    if (t && cop && !cop.bot) {
      const r = t.role === 'Mafia' ? `⚠️ ${t.name} is MAFIA!` : `✅ ${t.name} is clean (${t.role})`;
      if (cop.id === G.myId) appendChat('🔍 Intel', r, false, true);
      else NET.toAll({ type: 'COP_RESULT', payload: { to: copId, msg: r } });
    }
  }

  const rpt = {
    killedName: killedP?.name || null,
    // Role is intentionally hidden — no one should know which role was eliminated
    saved, doctorSavedName: savedP?.name || null,
    detectiveFoundMafia,
    aliveMafia: mafiaAlive().length, aliveTotal: alive().length,
    aliveList: alive().map(p => ({ name: p.name, color: p.color })),
    killedId: killedP?.id || null
  };
  if (G.mode !== 'bot') NET.toAll({ type: 'REPORT', payload: rpt });
  showReport(rpt);
}

// ── DAY VOTE RESOLUTION ───────────────────────────────
function hostResolveDayVote() {
  let maxV = 0, target = null, tie = false;
  for (const [id, cnt] of Object.entries(G.dayVotes)) {
    if (cnt > maxV) { maxV = cnt; target = id; tie = false; }
    else if (cnt === maxV) { tie = true; }
  }
  if (target && !tie) {
    const p = G.players.find(x => x.id === target);
    // Role is intentionally NOT revealed in the message for secrecy
    if (p) { p.alive = false; sysMsg(`🗳️ Town voted to eliminate ${p.name}.`, true); }
  } else {
    sysMsg('🗳️ Vote tied — no elimination today.');
  }
}

function sysMsg(msg, isKill = false) {
  if (G.mode !== 'bot') NET.toAll({ type: 'SYS', payload: { msg, isKill } });
  appendChat('System', msg, false, true);
  if (isKill) playKillSound();
}

// ── HOST ACTION RECORDING ─────────────────────────────
function hostAction(fromId, target) {
  const phase = PHASES[G.phaseIdx];
  if (!phase) return;
  const sender = G.players.find(p => p.id === fromId);
  const isGhostAction = !sender?.alive && (
    (phase.id === 'night_doc' && sender?.role === 'Doctor') ||
    (phase.id === 'night_cop' && sender?.role === 'Detective')
  );
  if (!sender?.alive && !isGhostAction) return;

  if (phase.id === 'night_mafia' && sender.role === 'Mafia')
    G.night.mafiaVotes[target] = (G.night.mafiaVotes[target] || 0) + 1;
  else if (phase.id === 'night_doc' && sender.role === 'Doctor') {
    if (isGhostAction) G.night.docGhost = true;
    else G.night.docSave = target;
  }
  else if (phase.id === 'night_cop' && sender.role === 'Detective') {
    if (isGhostAction) G.night.copGhost = true;
    else G.night.copTarget = { copId: fromId, target };
  }
  else if (phase.id === 'day_discuss') { if (target !== 'skip') G.dayVotes[target] = (G.dayVotes[target] || 0) + 1; G.dayVoteCount++; }
  else return;

  checkComplete(phase);
}

function checkComplete(phase) {
  let exp = 0, got = 0;
  // For doctor/detective night phases, we check against ALL players (alive or dead)
  // because eliminated ones auto-act via ghost turns
  if (phase.id === 'night_mafia') { exp = mafiaAlive().length; got = Object.values(G.night.mafiaVotes).reduce((a, b) => a + b, 0); }
  else if (phase.id === 'night_doc') { exp = G.players.filter(p => p.role === 'Doctor').length; got = (G.night.docSave || G.night.docGhost) ? 1 : 0; }
  else if (phase.id === 'night_cop') { exp = G.players.filter(p => p.role === 'Detective').length; got = (G.night.copTarget || G.night.copGhost) ? 1 : 0; }
  else if (phase.id === 'day_discuss') { exp = alive().length; got = G.dayVoteCount; }
  if (exp > 0 && got >= exp) {
    clearInterval(G.timer);
    if (phase.id === 'day_discuss') hostShowVotesAndAdvance();
    else setTimeout(hostAdvance, 800);
  }
}

function hostEnd(winner, reason) {
  clearInterval(G.timer);
  const mafiaWinners = winner === 'Town' ? [] : G.players.filter(p => p.role === 'Mafia');
  const payload = { winner, reason, players: G.players, mafiaWinners };
  if (G.mode !== 'bot') NET.toAll({ type: 'END', payload });
  showEnd(winner, reason, G.players, mafiaWinners);
}

// ── CLIENT: APPLY PHASE ───────────────────────────────
function onPhase(payload) {
  G.phaseIdx = payload.phaseIdx;
  const phase = payload.phase;
  G.actionSent = false; G.selectedTarget = null;

  // Sync player alive status + Mafia visibility
  payload.players.forEach(up => {
    const p = G.players.find(x => x.id === up.id);
    if (p) {
      p.alive = up.alive;
      if (up.color) p.color = up.color; // keep color synced
      // Mafia can see fellow Mafia members
      if (G.myRole === 'Mafia' && up.roleMafia && p.id !== G.myId) p.role = 'Mafia';
    }
  });

  // ── Phase theming ─ KEY UX CHANGE ──────────────────
  const ps = PHASE_STYLE[phase.id] || PHASE_STYLE.day_discuss;
  G.timerColor = ps.timerColor;
  BGScene.setTheme(ps.scene); // 🎨 shift the 3D environment

  // ── Phase body class for CSS ambient lighting ────
  document.body.classList.remove('phase-night_mafia', 'phase-night_doc', 'phase-night_cop', 'phase-day_report', 'phase-day_discuss');
  document.body.classList.add('phase-' + phase.id);

  const band = $('phaseBand');
  band.style.borderColor = ps.border;
  band.style.background = ps.bg;
  band.style.transition = 'border-color 0.8s ease, background 0.8s ease';

  // Update phase emoji (new element in HTML)
  const phaseEmojis = { night_mafia: '🌑', night_doc: '🌒', night_cop: '🌓', day_report: '🌅', day_discuss: '☀️' };
  const emojiEl = $('phaseEmoji');
  if (emojiEl) emojiEl.textContent = phaseEmojis[phase.id] || '🎭';

  // Navigate to the right screen
  if (phase.id === 'day_report') {
    // showReport() handles nav — don't override here
  } else {
    if (!$('s-game').classList.contains('active')) nav('game');
  }

  // Show/hide eliminated overlay for this player
  const me2 = G.players.find(p => p.id === G.myId);
  const elimOverlay = $('eliminatedOverlay');
  if (elimOverlay) {
    if (me2 && !me2.alive) {
      elimOverlay.classList.remove('hidden');
      document.body.classList.add('is-spectating');
    } else {
      elimOverlay.classList.add('hidden');
      document.body.classList.remove('is-spectating');
    }
  }

  // Ghost turn for eliminated human Doctor/Detective in multiplayer
  // This makes the phase seem active for them without revealing their elimination
  if (me2 && !me2.alive && !G.isHost) {
    const isDocPhase = phase.id === 'night_doc' && G.myRole === 'Doctor';
    const isCopPhase = phase.id === 'night_cop' && G.myRole === 'Detective';
    if (isDocPhase || isCopPhase) {
      const ghostDelay = (10 + Math.random() * 5) * 1000;
      setTimeout(() => {
        if (!G.actionSent) {
          G.actionSent = true;
          const aliveOthers = G.players.filter(p => p.alive && p.id !== G.myId);
          const ghostTarget = aliveOthers[Math.floor(Math.random() * aliveOthers.length)]?.id;
          if (ghostTarget) NET.toHost({ type: 'ACTION', payload: { target: ghostTarget } });
        }
      }, ghostDelay);
    }
  }

  // Host ghost turns for eliminated human Doctor/Detective
  if (G.isHost) {
    const isDocPhase = phase.id === 'night_doc';
    const isCopPhase = phase.id === 'night_cop';
    if (isDocPhase || isCopPhase) {
      G.players.filter(p => !p.alive && !p.bot).forEach(deadHuman => {
        const isDoc = isDocPhase && deadHuman.role === 'Doctor';
        const isCop = isCopPhase && deadHuman.role === 'Detective';
        if (isDoc || isCop) {
          const ghostDelay = (10 + Math.random() * 5) * 1000;
          setTimeout(() => {
            const aliveOthers = alive().filter(p => p.id !== deadHuman.id);
            const ghostTarget = aliveOthers[Math.floor(Math.random() * aliveOthers.length)]?.id;
            if (ghostTarget) hostAction(deadHuman.id, ghostTarget);
          }, ghostDelay);
        }
      });
    }
  }

  // Close chat overlay when phase changes
  const chatOverlay = $('chatOverlay');
  if (chatOverlay && G.chatOpen) {
    G.chatOpen = false;
    chatOverlay.classList.remove('chat-open');
    const btn = $('chatToggleBtn');
    if (btn) btn.classList.remove('chat-active');
  }

  $('phaseName').textContent = phase.name;
  $('phaseSub').textContent = phase.sub;
  $('timer-bar-wrap').classList.remove('hidden');

  // Doctor hearts indicator
  const heartsEl = $('doctorHearts');
  if (heartsEl) {
    if (G.myRole === 'Doctor') {
      const filled = G.docSelfSavesLeft;
      heartsEl.textContent = '❤️'.repeat(filled) + '🤍'.repeat(2 - filled);
      heartsEl.style.display = 'inline';
    } else {
      heartsEl.style.display = 'none';
    }
  }

  // Role badge
  const ro = roleObj(G.myRole);
  $('myRoleBadge').innerHTML = `<span class="tag ${ro.css}">${ro.emoji} ${G.myRole}</span>`;

  // Mafia ally strip
  const allies = G.players.filter(p => p.role === 'Mafia' && p.id !== G.myId);
  if (G.myRole === 'Mafia' && allies.length) {
    $('alliesTxt').textContent = '🔴 Allies: ' + allies.map(a => a.name).join(', ');
    $('alliesTxt').classList.remove('hidden');
  } else { $('alliesTxt').classList.add('hidden'); }

  buildGrid(phase);
  updateChatUI(phase);
  if (phase.id !== 'day_report') {
    startTimer(phase.time, phase.id);
    showPhasePopup(phase);
  }
}

// ── PLAYER GRID ───────────────────────────────────────
function buildGrid(phase) {
  const grid = $('playerGrid'), aa = $('actionArea');
  grid.innerHTML = '';
  if (!phase.act) { aa.classList.add('hidden'); return; }
  aa.classList.remove('hidden');
  $('actionStatus').classList.add('hidden');

  const me = G.players.find(p => p.id === G.myId);
  // Eliminated players: can't act in day_discuss or mafia phase, but doctor/detective ghost turns handled by host
  const canAct = me?.alive && (phase.role === 'all' || phase.role === G.myRole);

  G.players.forEach(p => {
    const isMe = p.id === G.myId;
    const isAlly = G.myRole === 'Mafia' && p.role === 'Mafia' && !isMe;

    const btn = document.createElement('button');
    btn.dataset.pid = p.id;
    btn.style.position = 'relative';
    btn.className = 'pcard w-full' +
      (!p.alive ? ' pcard-dead' : '') +
      (isMe ? ' pcard-me' : '') +
      (isAlly ? ' pcard-ally' : '');

    const subLabel = !p.alive ? '💀 Out'
      : isAlly ? '🔴 Mafia'
        : isMe ? '👤 You'
          : '· Agent ·';

    const subColor = !p.alive ? '#3f3f46' : isAlly ? '#f87171' : isMe ? '#71717a' : '#52525b';

    btn.innerHTML =
      `<div class="pcard-av-wrap">${mkAv(p.name, p.alive ? p.color : '#1c1c1e')}</div>` +
      `<span class="pcard-name">${p.name}</span>` +
      `<span class="pcard-sub" style="color:${subColor}">${subLabel}</span>`;

    // Doctor can target themselves (self-save) only if self-saves remain.
    // Others cannot target themselves.
    const isSelfTargetable = phase.id === 'night_doc' && isMe && G.docSelfSavesLeft > 0;
    if (canAct && !G.actionSent && p.alive && (!isMe || isSelfTargetable))
      btn.onclick = () => selectP(p.id, btn);

    grid.appendChild(btn);
  });

  const ab = $('actionBtn');
  ab.className = 'btn btn-primary';
  $('actionPrompt').textContent = phase.id === 'day_discuss' ? 'Cast Your Vote' : 'Select Target';

  if (!canAct) {
    ab.textContent = 'Standby…'; ab.disabled = true;
  } else if (phase.id === 'day_discuss') {
    ab.textContent = 'Abstain (Skip Vote)'; ab.disabled = false;
  } else {
    ab.textContent = 'Select a target…'; ab.disabled = true;
  }
}

function selectP(id, btn) {
  G.selectedTarget = id;
  document.querySelectorAll('.pcard').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const ab = $('actionBtn');
  ab.textContent = PHASES[G.phaseIdx]?.id === 'day_discuss' ? 'Cast Vote ✓' : 'Confirm Target ✓';
  ab.disabled = false;

  // Feature 9: broadcast mafia selection to syndicate partners (multi mode only)
  const phase = PHASES[G.phaseIdx];
  if (phase?.id === 'night_mafia' && G.myRole === 'Mafia' && G.mode !== 'bot') {
    if (G.isHost) {
      NET.toAll({ type: 'MAFIA_SELECT', payload: { fromId: G.myId, fromName: G.myName, targetId: id } });
      // host applies locally via showMafiaTarget — but own selection is skipped there, which is correct
    } else {
      NET.toHost({ type: 'MAFIA_SELECT', payload: { targetId: id } });
    }
  }
}

function showMafiaTarget(fromId, fromName, targetId) {
  if (G.myRole !== 'Mafia') return;        // only visible to syndicate
  if (fromId === G.myId) return;           // own selection shown via .selected class
  document.querySelectorAll(`.msel-${fromId}`).forEach(el => el.remove());
  const card = document.querySelector(`[data-pid="${targetId}"]`);
  if (!card) return;
  const ind = document.createElement('div');
  ind.className = `mafia-sel-indicator msel-${fromId}`;
  ind.textContent = `🔴 ${fromName}`;
  card.appendChild(ind);
}

function submitAction() {
  if (G.actionSent) return;
  const phase = PHASES[G.phaseIdx];
  const target = G.selectedTarget || (phase?.id === 'day_discuss' ? 'skip' : null);
  if (!target) return;
  G.actionSent = true;

  // Decrement doctor self-save counter when targeting self
  if (phase?.id === 'night_doc' && G.myRole === 'Doctor' && target === G.myId) {
    G.docSelfSavesLeft = Math.max(0, G.docSelfSavesLeft - 1);
    const heartsEl = $('doctorHearts');
    if (heartsEl) {
      const filled = G.docSelfSavesLeft;
      heartsEl.textContent = '❤️'.repeat(filled) + '🤍'.repeat(2 - filled);
    }
    const cExtra = $('cRoleExtra');
    if (cExtra && cExtra.innerHTML) {
      // update card extra if still visible
      const span = cExtra.querySelector('span:last-child');
      if (span) span.textContent = '❤️'.repeat(G.docSelfSavesLeft) + '🤍'.repeat(2 - G.docSelfSavesLeft);
    }
  }

  const ab = $('actionBtn');
  ab.textContent = '✓ Confirmed'; ab.disabled = true;
  $('actionStatus').classList.remove('hidden');

  if (G.isHost) hostAction(G.myId, target);
  else NET.toHost({ type: 'ACTION', payload: { target } });
}

// ── CHAT ─────────────────────────────────────────────
function updateChatUI(phase) {
  const me = G.players.find(p => p.id === G.myId);
  const wrap = $('chatWrap');
  wrap.classList.add('hidden');
  $('mafiaLabel').classList.add('hidden');
  if (!me?.alive) return;
  if (phase.id === 'day_discuss') {
    wrap.classList.remove('hidden');
  } else if (phase.id === 'night_mafia' && G.myRole === 'Mafia') {
    wrap.classList.remove('hidden');
    $('mafiaLabel').classList.remove('hidden');
  }
}

function sendChat() {
  const inp = $('chatInp'); const msg = inp.value.trim();
  if (!msg) return; inp.value = '';
  const phase = PHASES[G.phaseIdx] || {};
  const me = G.players.find(p => p.id === G.myId);
  if (!me) return;
  const mafiaOnly = phase.id === 'night_mafia';
  const payload = { name: me.name, msg, mafiaOnly };
  if (G.isHost) {
    appendChat(me.name, msg, mafiaOnly, false);
    if (G.mode !== 'bot') NET.toAll({ type: 'CHAT', payload });
  } else {
    NET.toHost({ type: 'CHAT', payload });
  }
}

$('chatInp').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

function appendChat(name, msg, mafiaOnly, sys) {
  const me = G.players.find(p => p.id === G.myId);
  const isSpectating = me && !me.alive;
  // Spectators (ghosts) can see mafia chat — ghost privilege
  if (mafiaOnly && G.myRole !== 'Mafia' && !isSpectating) return;
  const log = $('chatLog'), div = document.createElement('div');
  if (sys) {
    div.className = 'bubble bubble-sys'; div.textContent = msg;
  } else {
    const isMe = name === G.myName;
    div.className = `flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`;
    const ghostMafia = mafiaOnly && isSpectating && G.myRole !== 'Mafia';
    const cls = mafiaOnly ? 'bubble-mafia' : isMe ? 'bubble-me' : 'bubble-other';
    const ghostTag = ghostMafia ? '<span class="ghost-label"> 👻 ghost intel</span>' : '';
    div.innerHTML = `<span class="chat-name">${name}${ghostTag}</span><div class="bubble ${cls}${ghostMafia ? ' bubble-ghost' : ''}">${msg}</div>`;
  }
  log.appendChild(div);
  if (G.chatOpen) {
    log.scrollTop = log.scrollHeight;
  } else {
    // Increment unread badge
    G.chatUnread++;
    const badge = $('chatBadge');
    if (badge) {
      badge.textContent = G.chatUnread > 9 ? '9+' : G.chatUnread;
      badge.classList.add('visible');
    }
  }
}

// ── TIMER ─────────────────────────────────────────────
function startTimer(secs, phaseId) {
  clearInterval(G.timer);
  G.timeLeft = secs;
  const bar = $('timer-bar'), txt = $('timerTxt');
  bar.style.width = '100%'; bar.style.background = G.timerColor;

  G.timer = setInterval(() => {
    G.timeLeft--;
    const pct = Math.max(0, (G.timeLeft / secs) * 100);
    txt.textContent = `${Math.floor(G.timeLeft / 60)}:${(G.timeLeft % 60).toString().padStart(2, '0')}`;
    bar.style.width = pct + '%';
    // Low-time flash overrides phase color
    bar.style.background = pct < 20 ? '#ef4444' : pct < 40 ? '#f59e0b' : G.timerColor;
    if (G.timeLeft <= 0) {
      clearInterval(G.timer);
      if (G.isHost && phaseId !== 'day_report') {
        if (phaseId === 'day_discuss') hostShowVotesAndAdvance();
        else hostAdvance();
      }
    }
  }, 1000);
}

// ── NIGHT REPORT ─────────────────────────────────────
function showReport(data) {
  nav('report');
  $('rptItems').innerHTML = '';
  $('survivorList').innerHTML = '';

  const add = (icon, text, sub, color) => {
    const d = document.createElement('div'); d.className = 'rpt-item fade-up';
    d.innerHTML = `<div class="rpt-icon">${icon}</div><div style="display:flex;flex-direction:column;gap:3px"><span style="font-size:14px;font-weight:600;color:${color}">${text}</span>${sub ? `<span style="font-size:12px;color:#52525b">${sub}</span>` : ''}</div>`;
    $('rptItems').appendChild(d);
  };

  if (data.killedName && !data.saved) {
    playKillSound();
    add('💀', `${data.killedName} was eliminated`, `Their identity remains classified.`, '#f87171');
  } else if (data.saved) {
    add('💊', `Doctor Rescued ${data.doctorSavedName || 'an Agent'}`, `The Medic shielded them from elimination`, '#34d399');
  } else {
    add('🌙', 'No casualties tonight', 'Mafia failed to agree on a target', '#a1a1aa');
  }

  if (data.detectiveFoundMafia)
    add('🔍', 'Detective Identified Mafia', 'A suspect has been confirmed as a Syndicate member', '#60a5fa');

  add('🔴', `${data.aliveMafia} Mafia still active`, `${data.aliveTotal} players remaining`, '#d4d4d8');

  (data.aliveList || []).forEach(p => {
    const s = document.createElement('span');
    s.style.cssText = 'font-size:12px;padding:4px 12px;border-radius:999px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:#d4d4d8';
    s.textContent = p.name; $('survivorList').appendChild(s);
  });

  // Host: button hidden (auto-advances after timer)
  // Clients: show Continue button so they can go back to game view
  if (G.isHost) $('rptBtn').classList.add('hidden');
  else $('rptBtn').classList.remove('hidden');
}

// ── END SCREEN ────────────────────────────────────────
function showEnd(winner, reason, players, mafiaWinners) {
  clearInterval(G.timer);
  $('timer-bar-wrap').classList.add('hidden');
  document.body.classList.remove('is-spectating', 'phase-night_mafia', 'phase-night_doc', 'phase-night_cop', 'phase-day_report', 'phase-day_discuss');
  nav('end');
  BGScene.setTheme('menu');

  const isMafiaWin = winner === 'Mafia' || winner === 'Mafia Gang';
  $('endTitle').textContent = isMafiaWin ? (winner === 'Mafia Gang' ? 'MAFIA GANG WINS' : 'MAFIA WINS') : 'CIVILIANS WINS';
  $('endReason').textContent = reason;
  $('endIcon').textContent = isMafiaWin ? '💀' : '🏆';
  $('endBg').style.background = isMafiaWin
    ? 'radial-gradient(ellipse at top,rgba(239,68,68,0.4),transparent 65%)'
    : 'radial-gradient(ellipse at top,rgba(16,185,129,0.4),transparent 65%)';

  // Show mafia winner names prominently if mafia wins
  const mw = mafiaWinners || [];
  const mafiaNameEl = $('endMafiaNames');
  if (mafiaNameEl) {
    if (isMafiaWin && mw.length > 0) {
      mafiaNameEl.textContent = mw.map(p => p.name).join(' · ');
      mafiaNameEl.classList.remove('hidden');
    } else {
      mafiaNameEl.classList.add('hidden');
    }
  }

  const er = $('endRoles'); er.innerHTML = '';
  (players || G.players).forEach(p => {
    const ro = roleObj(p.role); const d = document.createElement('div');
    d.style.cssText = `display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:4px 12px;border-radius:8px;border:1px solid rgba(255,255,255,${p.alive ? '0.12' : '0.04'});color:${p.alive ? '#d4d4d8' : '#3f3f46'};${p.alive ? '' : 'text-decoration:line-through'}`;
    d.innerHTML = `${ro.emoji} ${p.name} <span style="color:#52525b">${p.role}</span>`;
    er.appendChild(d);
  });
}

// ── PHASE POPUP (feature 4 & 5) ──────────────────────
const PHASE_POPUP = {
  night_mafia: { icon: '🔴', title: "Mafia's Turn",    sub: "Mafia chooses tonight's target",    bg: 'rgba(239,68,68,0.14)',   border: 'rgba(239,68,68,0.38)',   color: '#f87171' },
  night_doc:   { icon: '💚', title: "Doctor's Turn",   sub: 'Doctor selects a player to protect',     bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.38)',  color: '#34d399' },
  night_cop:   { icon: '🔵', title: "Detective's Turn", sub: 'Investigate a suspect tonight',         bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.38)',  color: '#60a5fa' },
  day_discuss: { icon: '🗳️', title: 'Voting Begins!',  sub: 'Town Square — speak your truth & vote', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.38)',  color: '#fbbf24' },
};
function showPhasePopup(phase) {
  const existing = $('phasePopup');
  if (existing) existing.remove();
  const info = PHASE_POPUP[phase.id];
  if (!info) return;
  const popup = document.createElement('div');
  popup.id = 'phasePopup';
  popup.style.setProperty('--popup-bg',     info.bg);
  popup.style.setProperty('--popup-border', info.border);
  popup.style.setProperty('--popup-color',  info.color);
  popup.innerHTML =
    `<div class="phase-popup-icon">${info.icon}</div>` +
    `<div><div class="phase-popup-title">${info.title}</div><div class="phase-popup-sub">${info.sub}</div></div>`;
  $('s-game').appendChild(popup);
  setTimeout(() => {
    popup.classList.add('pop-out');
    setTimeout(() => popup.remove(), 420);
  }, 3200);
}

// ── VOTE TALLY DISPLAY (feature 6) ───────────────────
function hostShowVotesAndAdvance() {
  const tally = { ...G.dayVotes };
  if (G.mode !== 'bot') NET.toAll({ type: 'VOTE_TALLY', payload: { votes: tally } });
  showVoteTally(tally);
  setTimeout(hostAdvance, 2800);
}
function showVoteTally(votes) {
  G.players.forEach(p => {
    const card = document.querySelector(`[data-pid="${p.id}"]`);
    if (!card) return;
    let badge = card.querySelector('.vote-badge');
    if (!badge) { badge = document.createElement('div'); badge.className = 'vote-badge'; card.appendChild(badge); }
    const count = votes[p.id] || 0;
    badge.textContent = count > 0 ? `🗳️ ${count}` : 'Safe';
    badge.classList.toggle('vote-badge-hot',  count > 0);
    badge.classList.toggle('vote-badge-safe', count === 0);
  });
}

// ── PLAY AGAIN / RESTART (feature 7) ─────────────────
function playAgain() {
  clearInterval(G.timer);
  if (G.isHost && G.mode !== 'bot') {
    G.players.forEach(p => { p.alive = true; p.role = null; });
    NET.toAll({ type: 'RESTART', payload: { players: G.players } });
  }
  onRestart({ players: G.players });
}
function onRestart(payload) {
  clearInterval(G.timer);
  G.phaseIdx = -1;
  if (payload?.players) G.players = payload.players.map(pl => ({ ...pl, isMe: pl.id === G.myId }));
  G.players.forEach(p => { p.alive = true; p.role = null; });
  G.night = { mafiaVotes: {}, docSave: null, copTarget: null };
  G.dayVotes = {}; G.dayVoteCount = 0;
  G.chatOpen = false; G.chatUnread = 0;
  G.docSelfSavesLeft = 2; G.kicked = false;
  cardFlipped = false;
  $('cardBody')?.classList.remove('flipped');
  document.body.classList.remove('is-spectating', 'phase-night_mafia', 'phase-night_doc', 'phase-night_cop', 'phase-day_report', 'phase-day_discuss');
  const chatLog = $('chatLog');
  if (chatLog) chatLog.innerHTML = '<div class="bubble bubble-sys">The parlor opens — awaiting phase</div>';
  const badge = $('chatBadge');
  if (badge) { badge.textContent = '0'; badge.classList.remove('visible'); }
  const existing = $('phasePopup');
  if (existing) existing.remove();
  openLobby();
}

// ── BOT AI ───────────────────────────────────────────
function botsAct(phase) {
  G.players.filter(p => p.bot).forEach(bot => {
    // Ghost turn: eliminated doctor/detective still need to auto-act to avoid revealing their status
    const isEliminated = !bot.alive;
    const isSpecialNightRole = (phase.id === 'night_doc' && bot.role === 'Doctor') ||
      (phase.id === 'night_cop' && bot.role === 'Detective');

    if (isEliminated) {
      // Ghost turns for eliminated doctor/detective — random 10-15s delay
      if (!isSpecialNightRole) return;
      const ghostDelay = (10 + Math.random() * 5) * 1000;
      setTimeout(() => {
        // Ghost doctor: save a random alive player (so it doesn't accidentally save eliminated target)
        // Ghost detective: investigate a random alive player
        const aliveOthers = alive().filter(p => p.id !== bot.id);
        const ghostTarget = aliveOthers[Math.floor(Math.random() * aliveOthers.length)]?.id;
        if (ghostTarget) hostAction(bot.id, ghostTarget);
      }, ghostDelay);
      return;
    }

    // Normal alive bot logic
    if (phase.role !== 'all' && phase.role !== bot.role) return;
    setTimeout(() => {
      let target = null;
      if (phase.id === 'night_mafia') {
        const t = alive().filter(p => p.role !== 'Mafia'); target = t[Math.floor(Math.random() * t.length)]?.id;
      } else if (phase.id === 'night_doc') {
        // Doctor bots can also save themselves
        const t = alive(); target = t[Math.floor(Math.random() * t.length)]?.id;
      } else if (phase.id === 'night_cop') {
        const t = alive().filter(p => p.id !== bot.id); target = t[Math.floor(Math.random() * t.length)]?.id;
      } else if (phase.id === 'day_discuss') {
        const t = alive().filter(p => p.id !== bot.id);
        target = Math.random() < 0.1 ? 'skip' : t[Math.floor(Math.random() * t.length)]?.id || 'skip';
      }
      if (target) hostAction(bot.id, target);
    }, 1200 + Math.random() * 4800);

    if (phase.id === 'day_discuss') {
      const m = ['I\'m innocent!', 'Who do you trust?', 'Think carefully.', 'Something feels off.', 'I know who it is.'];
      setTimeout(() => appendChat(bot.name, m[Math.floor(Math.random() * m.length)], false, false), 2000 + Math.random() * 6000);
    }
  });
}

// ── INIT ─────────────────────────────────────────────
(function init() {
  updateSliders();
  nav('menu');
  BGScene.init();
}());
