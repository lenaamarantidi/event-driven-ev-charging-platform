/**
 * Auth Service
 * Simplified MariaDB-backed auth using User diagram schema
 * Port: 3100
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3100);
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'auth_user';
const DB_PASSWORD = process.env.DB_PASSWORD || 'auth_pass';
const DB_NAME = process.env.DB_NAME || 'auth_db';

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS User (
      user_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      google_id INT(10) UNSIGNED NULL,
      UNIQUE KEY uq_user_username (username),
      UNIQUE KEY uq_user_google_id (google_id),
      INDEX idx_user_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

function normalizeUser(row) {
  return {
    user_id: row.user_id,
    username: row.username,
    email: row.email,
    google_id: row.google_id
  };
}

function toGoogleIdInt(googleSub) {
  if (!googleSub) {
    return null;
  }

  const parsed = Number.parseInt(googleSub, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.user_id,
      username: user.username,
      email: user.email,
      google_id: user.google_id
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', message: err.message });
  }
}

async function getUserByEmail(email) {
  const [rows] = await pool.query(
    `SELECT user_id, username, email, google_id
     FROM User
     WHERE email = ?
     ORDER BY user_id ASC
     LIMIT 1`,
    [email]
  );

  return rows[0] || null;
}

async function getUserById(userId) {
  const [rows] = await pool.query(
    `SELECT user_id, username, email, google_id
     FROM User
     WHERE user_id = ?`,
    [userId]
  );

  return rows[0] || null;
}

app.post('/auth/register', async (req, res) => {
  try {
    const { username, email, google_id } = req.body;

    if (!username || !email) {
      return res.status(400).json({ error: 'username and email are required' });
    }

    const [insertResult] = await pool.query(
      `INSERT INTO User (username, email, google_id)
       VALUES (?, ?, ?)`,
      [username, email, google_id ?? null]
    );

    const user = await getUserById(insertResult.insertId);
    const token = generateAccessToken(user);

    return res.status(201).json({
      message: 'User registered successfully',
      user: normalizeUser(user),
      accessToken: token
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Registration failed',
      message: err.message
    });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const token = generateAccessToken(user);

    return res.json({
      message: 'Login successful',
      user: normalizeUser(user),
      accessToken: token
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Login failed',
      message: err.message
    });
  }
});

app.post('/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Google ID token required' });
    }

    let googleData;
    try {
      const googleResponse = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`, { timeout: 5000 });
      googleData = googleResponse.data;
    } catch (verifyErr) {
      return res.status(401).json({ error: 'Google token verification failed' });
    }

    const email = googleData.email;
    const username = googleData.name || `google-user-${Date.now()}`;
    const googleId = toGoogleIdInt(googleData.sub);

    let user = await getUserByEmail(email);

    if (!user) {
      const [insertResult] = await pool.query(
        `INSERT INTO User (username, email, google_id)
         VALUES (?, ?, ?)`,
        [username, email, googleId]
      );
      user = await getUserById(insertResult.insertId);
    } else {
      await pool.query(
        `UPDATE User
         SET username = ?, google_id = COALESCE(?, google_id)
         WHERE user_id = ?`,
        [username, googleId, user.user_id]
      );
      user = await getUserById(user.user_id);
    }

    const token = generateAccessToken(user);

    return res.json({
      message: 'Google authentication successful',
      user: normalizeUser(user),
      accessToken: token
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Google authentication failed',
      message: err.message
    });
  }
});

app.get('/auth/profile', verifyToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(normalizeUser(user));
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch profile',
      message: err.message
    });
  }
});

app.put('/auth/profile', verifyToken, async (req, res) => {
  try {
    const { username, email } = req.body;

    await pool.query(
      `UPDATE User
       SET username = COALESCE(?, username),
           email = COALESCE(?, email)
       WHERE user_id = ?`,
      [username ?? null, email ?? null, req.user.id]
    );

    const user = await getUserById(req.user.id);
    return res.json({
      message: 'Profile updated successfully',
      user: normalizeUser(user)
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to update profile',
      message: err.message
    });
  }
});

app.get('/auth/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS total_users FROM User');
    return res.json({
      status: 'healthy',
      service: 'Auth Service',
      port: PORT,
      totalUsers: Number(rows[0].total_users || 0),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      service: 'Auth Service',
      message: err.message
    });
  }
});

app.use((err, req, res, next) => {
  return res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    status: err.status || 500
  });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Auth Service listening on port ${PORT}`);
      console.log(`MariaDB connected: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
      console.log('Auth mode: simplified User diagram');
    });
  })
  .catch((err) => {
    console.error('Failed to start Auth Service:', err.message);
    process.exit(1);
  });

module.exports = app;
