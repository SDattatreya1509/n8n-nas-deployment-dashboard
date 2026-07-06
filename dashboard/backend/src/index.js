require('dotenv').config();

// ── Storage init — must run before any route is registered ───────────────────
require('./config/storage').initStorage();

// ── Startup safety checks ─────────────────────────────────────────────────────
const INSECURE_DEFAULTS = new Set([
  'change-this-secret-in-production',
  'change_this_to_a_long_random_secret_123',
  'CHANGE_THIS_BEFORE_DEPLOYING',
]);
if (process.env.NODE_ENV === 'production' && INSECURE_DEFAULTS.has(process.env.JWT_SECRET)) {
  console.error('[FATAL] JWT_SECRET is set to a known insecure default. Set a real secret before deploying.');
  process.exit(1);
}

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const jwt = require('jsonwebtoken');

const webhookRoutes    = require('./routes/webhook');
const githubRoutes     = require('./routes/github');
const wordpressRoutes  = require('./routes/wordpress');
const deployRoutes     = require('./routes/deploy');
const n8nRoutes        = require('./routes/n8n');
const downloadRoutes   = require('./routes/download');
const projectsRoutes   = require('./routes/projects');
const authRoutes        = require('./routes/auth');
const githubOauthRoutes = require('./routes/github-oauth');
const adminRoutes       = require('./routes/admin');
const db               = require('./db');
const { findById }     = require('./utils/users');
const { JWT_SECRET, requireAuth } = require('./middleware/auth');

const app = express();
const httpServer = http.createServer(app);

const corsOrigin = process.env.FRONTEND_URL === '*'
  ? true
  : (process.env.FRONTEND_URL || 'http://localhost:5173');

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
});

// ── Socket.IO auth middleware ─────────────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user    = findById(payload.sub);
    if (!user) return next(new Error('User not found'));
    socket.userId   = user.id;
    socket.userName = user.name;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

// Make io available to routes
app.set('io', io);

// sessionId → userId map (populated by POST /api/n8n/chat)
const sessionUserMap = new Map();
app.set('sessionUserMap', sessionUserMap);

// sessionId → projectType map (populated by POST /api/n8n/chat)
const sessionProjectTypeMap = new Map();
app.set('sessionProjectTypeMap', sessionProjectTypeMap);

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));

// Routes
app.use('/api/auth',          authRoutes);
app.use('/api/auth/github',   githubOauthRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/webhook',       webhookRoutes);
app.use('/api/github',        githubRoutes);
app.use('/api/wordpress',     wordpressRoutes);
app.use('/api/deploy',        deployRoutes);
app.use('/api/n8n',           n8nRoutes);
app.use('/api/download',      downloadRoutes);
app.use('/api/projects',      projectsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Per-user /api/state ───────────────────────────────────────────────────────
const sharedPipeline = {
  n8n: 'idle', webhook: 'idle', github: 'idle',
  vscode: 'idle', wordpress: 'idle', deploy: 'idle',
};

app.get('/api/state', requireAuth, (req, res) => {
  const { builds, wpBuilds } = db.getBuildsForUser(req.user.id);
  res.json({
    pipeline:      sharedPipeline,
    builds,
    wpBuilds,
    latestBuild:   builds[0]   ?? null,
    latestWpBuild: wpBuilds[0] ?? null,
  });
});

app.post('/api/state/reset', requireAuth, (req, res) => {
  Object.assign(sharedPipeline, {
    n8n: 'idle', webhook: 'idle', github: 'idle',
    vscode: 'idle', wordpress: 'idle', deploy: 'idle',
  });
  io.emit('pipeline:step', { step: 'reset', status: 'idle' });
  res.json({ success: true });
});

app.get('/api/state/wp', requireAuth, (req, res) => {
  const { wpBuilds } = db.getBuildsForUser(req.user.id);
  res.json({ latestWpBuild: wpBuilds[0] ?? null, wpBuilds });
});

// Expose state mutator to routes (pipeline status only — builds go to user rooms)
app.set('updateState', (patch, targetUserId = null) => {
  if (patch.pipeline) {
    Object.assign(sharedPipeline, patch.pipeline);
  }
  // Broadcast pipeline status to all connected clients
  io.emit('state:update', { pipeline: sharedPipeline });
});

// ── Socket.IO connection ──────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.join('user:' + socket.userId);
  console.log(`[WS] Connected: ${socket.id} (user: ${socket.userId})`);

  // Send this user's builds + shared pipeline status on connect
  const { builds, wpBuilds } = db.getBuildsForUser(socket.userId);
  socket.emit('state:update', {
    pipeline:      sharedPipeline,
    builds,
    wpBuilds,
    latestBuild:   builds[0]   ?? null,
    latestWpBuild: wpBuilds[0] ?? null,
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Disconnected: ${socket.id} (user: ${socket.userId})`);
  });
});

// Serve React dashboard build — must be after all API routes
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Return JSON 404 for unknown API routes instead of sending index.html
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Dashboard server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket ready (JWT auth enabled)`);
  console.log(`🔗 n8n webhook endpoint: http://localhost:${PORT}/api/webhook/n8n\n`);
});
