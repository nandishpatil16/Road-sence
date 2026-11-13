require('dotenv').config();
const dns = require('dns');
try {
  dns.setDefaultResultOrder('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const incidentRoutes = require('./routes/incidents');
const alertRoutes = require('./routes/alerts');
const complaintRoutes = require('./routes/complaints');
const dashboardRoutes = require('./routes/dashboard');
const userRoutes = require('./routes/users');
const locationRoutes = require('./routes/locations');

const app = express();
const server = http.createServer(app);

// ─── Socket.IO ───────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Make io available to routes
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('join-role', (role) => {
    socket.join(role);
    console.log(`[Socket] ${socket.id} joined room: ${role}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/locations', locationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CivicConnect Backend Running', timestamp: new Date() });
});

// ─── Static Frontend Serving (Production / Unified Hosting) ──────────────────
const candidateDistPaths = [
  path.join(__dirname, '../../civicconnectdashboard-main/dist'),
  path.join(__dirname, '../public'),
  path.join(__dirname, '../../dist'),
  path.join(__dirname, '../dist'),
];
const distPath = candidateDistPaths.find(p => fs.existsSync(p));
if (distPath) {
  console.log(`[Static] Serving web build from: ${distPath}`);
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── MongoDB Connection & Auto-Seed ──────────────────────────────────────────
const User = require('./models/User');
const Incident = require('./models/Incident');
const Alert = require('./models/Alert');

async function seedInitialUsers() {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      console.log('[Seed] Seeding initial authority demo accounts...');
      const demoUsers = [
        { name: 'City Admin',         email: 'admin@civic.com',        password: 'password123', role: 'admin',        badge: 'ADM-001', department: 'City Authority' },
        { name: 'Officer Ramesh',     email: 'police@civic.com',       password: 'password123', role: 'police',       badge: 'POL-042', department: 'Traffic Police' },
        { name: 'Dr. Priya Sharma',   email: 'ambulance@civic.com',    password: 'password123', role: 'ambulance',    badge: 'AMB-007', department: 'Emergency Services' },
        { name: 'Suresh Kumar (PWD)', email: 'construction@civic.com', password: 'password123', role: 'construction', badge: 'CON-015', department: 'PWD Belagavi' },
      ];
      for (const u of demoUsers) {
        await User.create(u);
      }
      console.log('[Seed] ✅ Demo authority accounts ready (police, ambulance, construction, admin)');
    }
  } catch (e) {
    console.warn('[Seed] Warning during initial seed:', e.message);
  }
}

async function startDatabase() {
  let MONGODB_URI = process.env.MONGODB_URI;
  if (MONGODB_URI) {
    MONGODB_URI = MONGODB_URI.trim();
    if (MONGODB_URI.endsWith('?')) {
      MONGODB_URI += 'retryWrites=true&w=majority';
    } else if (!MONGODB_URI.includes('retryWrites=')) {
      MONGODB_URI += (MONGODB_URI.includes('?') ? '&' : '?') + 'retryWrites=true&w=majority';
    }

    try {
      console.log(`[MongoDB] Connecting to primary Atlas database...`);
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 12000 });
      console.log(`[MongoDB] ✅ Connected successfully to primary database! Cloud memory is optimal.`);
      await seedInitialUsers();
      return;
    } catch (err) {
      console.warn(`[MongoDB] Primary database connection failed: ${err.message}`);
      console.warn(`[MongoDB] ⚠️ Note: If you see 'IP that isn't whitelisted', go to MongoDB Atlas -> Network Access -> Add IP Address -> 'Allow Access From Anywhere' (0.0.0.0/0).`);
    }
  }

  // Fallback to local in-memory MongoDB
  try {
    console.log(`[MongoDB] Starting local fallback database (warning: high memory usage in 512MB environments)...`);
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    console.log(`[MongoDB] ✅ Local fallback database active at: ${uri}`);
    await seedInitialUsers();
  } catch (err) {
    console.error('[MongoDB] Fatal error starting local database:', err.message);
    process.exit(1);
  }
}

startDatabase().then(() => {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] CivicConnect Backend running at http://localhost:${PORT}`);
    console.log(`[Server] API: http://localhost:${PORT}/api`);
  });
});

module.exports = { io };
