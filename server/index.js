'use strict';

const express = require('express');
const path    = require('path');
const cookieParser = require('cookie-parser');
const cors    = require('cors');

const { initDb } = require('./db');

const authRouter      = require('./routes/auth');
const menuRouter      = require('./routes/menu');
const ordersRouter    = require('./routes/orders');
const counterRouter   = require('./routes/counter');
const stockRouter     = require('./routes/stock');
const analyticsRouter = require('./routes/analytics');

const app  = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth',      authRouter);
app.use('/api/menu',      menuRouter);
app.use('/api/orders',    ordersRouter);
app.use('/api/counter',   counterRouter);
app.use('/api/stock',     stockRouter);
app.use('/api/analytics', analyticsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// SPA fallback — serve admin.html for /admin routes
app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// Default → customer app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Start server after DB is initialized (sql.js is async)
async function start() {
  console.log('⏳ Initializing database...');
  await initDb();
  console.log('✅ Database ready');

  app.listen(PORT, () => {
    console.log(`\n🍽️  Smart Canteen Server running at http://localhost:${PORT}`);
    console.log(`   Admin Panel: http://localhost:${PORT}/admin.html`);
    console.log(`   Customer App: http://localhost:${PORT}/\n`);
    console.log(`   Admin login: admin@canteen.com / admin123`);
    console.log(`   Staff login: ravi@canteen.com / staff123\n`);
  });
}

start().catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
