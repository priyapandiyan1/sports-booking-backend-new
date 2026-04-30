require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const pool = require('./db/connection');
const { useMysql } = pool;

// Import Routes
const authRouter          = require('./routes/auth');
const usersRouter         = require('./routes/users');
const sportsRouter        = require('./routes/sports');
const bookingsRouter      = require('./routes/bookings');
const notificationsRouter = require('./routes/notifications');
const groupsRouter        = require('./routes/groups');
const adminRouter         = require('./routes/admin');

const app = express();
const port = process.env.PORT || 5000;

// Auto-migrate new tables
(async () => {
  try {
    const groupsSql = useMysql ? `
      CREATE TABLE IF NOT EXISTS groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sport_id INT NOT NULL,
        admin_id INT NOT NULL,
        place VARCHAR(255) NOT NULL,
        game_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        max_players INT NOT NULL DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE,
        FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
      )
    ` : `
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sport_id INT NOT NULL,
        admin_id INT NOT NULL,
        place VARCHAR(255) NOT NULL,
        game_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        max_players INT NOT NULL DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE,
        FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;

    const reqSql = useMysql ? `
      CREATE TABLE IF NOT EXISTS group_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_id INT NOT NULL,
        user_id INT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_request (group_id, user_id)
      )
    ` : `
      CREATE TABLE IF NOT EXISTS group_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INT NOT NULL,
        user_id INT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(group_id, user_id)
      )
    `;

    await pool.query(groupsSql);
    await pool.query(reqSql);
    console.log("Auto-migration: groups tables verified.");
  } catch (err) {
    console.error("Auto-migration failed:", err.message);
  }
})();

// Middleware
app.use(cors());
app.use(express.json());

// Test DB connection on startup
pool
  .getConnection()
  .then((connection) => {
    console.log(
      useMysql
        ? 'Successfully connected to the MySQL database!'
        : 'Successfully connected to SQLite (local file).'
    );
    connection.release();
  })
  .catch((err) => {
    console.error('Error connecting to the database:', err.message);
  });

// Mount Routes
app.use('/admin', adminRouter);
app.use('/api/auth',          authRouter);
app.use('/api/users',         usersRouter);
app.use('/api/sports',        sportsRouter);
app.use('/api/bookings',      bookingsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/groups',        groupsRouter);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running!' });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// SPA fallback for frontend React Router, but preserve 404s for API routes
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/admin/bookings')) {
    res.status(404).json({ success: false, error: 'Route not found' });
  } else {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
}
