require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3100);
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '30d';
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

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function indexExists(tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS User (
      user_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(255) NULL,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NULL,
      google_id VARCHAR(255) NULL,
      first_name VARCHAR(100) NULL,
      last_name VARCHAR(100) NULL,
      phone VARCHAR(32) NULL,
      refresh_token_hash VARCHAR(255) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_email (email),
      UNIQUE KEY uq_user_username (username),
      UNIQUE KEY uq_user_google_id (google_id),
      INDEX idx_user_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  if (!(await indexExists('User', 'uq_user_email'))) {
    await pool.query('ALTER TABLE User ADD UNIQUE KEY uq_user_email (email)');
  }
  if (!(await indexExists('User', 'uq_user_username'))) {
    await pool.query('ALTER TABLE User ADD UNIQUE KEY uq_user_username (username)');
  }
  if (!(await indexExists('User', 'uq_user_google_id'))) {
    await pool.query('ALTER TABLE User ADD UNIQUE KEY uq_user_google_id (google_id)');
  }

  if (!(await columnExists('User', 'password_hash'))) {
    await pool.query('ALTER TABLE User ADD COLUMN password_hash VARCHAR(255) NULL');
  }
  if (!(await columnExists('User', 'first_name'))) {
    await pool.query('ALTER TABLE User ADD COLUMN first_name VARCHAR(100) NULL');
  }
  if (!(await columnExists('User', 'last_name'))) {
    await pool.query('ALTER TABLE User ADD COLUMN last_name VARCHAR(100) NULL');
  }
  if (!(await columnExists('User', 'phone'))) {
    await pool.query('ALTER TABLE User ADD COLUMN phone VARCHAR(32) NULL');
  }
  if (!(await columnExists('User', 'refresh_token_hash'))) {
    await pool.query('ALTER TABLE User ADD COLUMN refresh_token_hash VARCHAR(255) NULL');
  }
  await pool.query('ALTER TABLE User MODIFY COLUMN google_id VARCHAR(255) NULL');
}

function normalizeUser(row) {
  return {
    userId: row.user_id?.toString(),
    username: row.username || null,
    email: row.email,
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    phone: row.phone || null,
    googleId: row.google_id || null
  };
}

function validateEmail(email) {
  return typeof email === 'string' && /\S+@\S+\.\S+/.test(email);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

async function hashData(value) {
  return bcrypt.hash(value, 12);
}

async function compareHash(value, hash) {
  return bcrypt.compare(value, hash);
}

function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.user_id,
      email: user.email,
      username: user.username,
      googleId: user.google_id
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function generateRefreshToken() {
  return uuidv4();
}

async function getUserByEmail(email) {
  const [rows] = await pool.query(
    `SELECT * FROM User WHERE email = ? ORDER BY user_id ASC LIMIT 1`,
    [email.toLowerCase()]
  );
  return rows[0] || null;
}

async function getUserById(userId) {
  const [rows] = await pool.query(`SELECT * FROM User WHERE user_id = ?`, [userId]);
  return rows[0] || null;
}

async function getUserByRefreshToken(refreshToken) {
  const [rows] = await pool.query(`SELECT * FROM User WHERE refresh_token_hash IS NOT NULL`);
  for (const row of rows) {
    if (await compareHash(refreshToken, row.refresh_token_hash)) {
      return row;
    }
  }
  return null;
}

async function saveRefreshToken(userId, refreshToken) {
  const tokenHash = await hashData(refreshToken);
  await pool.query(`UPDATE User SET refresh_token_hash = ? WHERE user_id = ?`, [tokenHash, userId]);
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

app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, username, firstName, lastName, phone } = req.body;

    if (!validateEmail(email) || !validatePassword(password)) {
      return res.status(400).json({
        error: 'Email and password are required',
        details: 'password must be at least 8 characters and email must be valid'
      });
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const passwordHash = await hashData(password);
    const userNameValue = username || email.split('@')[0];

    const [insertResult] = await pool.query(
      `INSERT INTO User (username, email, password_hash, first_name, last_name, phone)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userNameValue, email.toLowerCase(), passwordHash, firstName || null, lastName || null, phone || null]
    );

    const user = await getUserById(insertResult.insertId);
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    await saveRefreshToken(user.user_id, refreshToken);

    return res.status(201).json({
      userId: user.user_id.toString(),
      email: user.email,
      accessToken,
      refreshToken
    });
  } catch (err) {
    return res.status(500).json({ error: 'Registration failed', message: err.message });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!validateEmail(email) || !validatePassword(password)) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await getUserByEmail(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatches = await compareHash(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    await saveRefreshToken(user.user_id, refreshToken);

    return res.json({
      userId: user.user_id.toString(),
      email: user.email,
      accessToken,
      refreshToken
    });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed', message: err.message });
  }
});

app.post('/auth/google', async (req, res) => {
  try {
    const googleToken = req.body.googleToken || req.body.idToken;
    if (!googleToken) {
      return res.status(400).json({ error: 'Google token is required' });
    }

    let googleData;
    try {
      const googleResponse = await axios.get(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${googleToken}`,
        { timeout: 5000 }
      );
      googleData = googleResponse.data;
    } catch (verifyErr) {
      return res.status(401).json({ error: 'Google token verification failed' });
    }

    const email = googleData.email;
    const name = googleData.name || `google-user-${Date.now()}`;
    const googleId = googleData.sub;

    if (!email) {
      return res.status(400).json({ error: 'Google account email is required' });
    }

    let user = await getUserByEmail(email);
    if (!user) {
      const [insertResult] = await pool.query(
        `INSERT INTO User (username, email, google_id, first_name, last_name)
         VALUES (?, ?, ?, ?, ?)`,
        [name, email.toLowerCase(), googleId, googleData.given_name || null, googleData.family_name || null]
      );
      user = await getUserById(insertResult.insertId);
    } else {
      await pool.query(
        `UPDATE User
         SET username = COALESCE(?, username),
             google_id = COALESCE(?, google_id),
             first_name = COALESCE(?, first_name),
             last_name = COALESCE(?, last_name)
         WHERE user_id = ?`,
        [name, googleId, googleData.given_name || null, googleData.family_name || null, user.user_id]
      );
      user = await getUserById(user.user_id);
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    await saveRefreshToken(user.user_id, refreshToken);

    return res.json({
      userId: user.user_id.toString(),
      email: user.email,
      accessToken,
      refreshToken
    });
  } catch (err) {
    return res.status(500).json({ error: 'Google authentication failed', message: err.message });
  }
});

app.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const user = await getUserByRefreshToken(refreshToken);
    if (!user) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const accessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken();
    await saveRefreshToken(user.user_id, newRefreshToken);

    return res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    return res.status(500).json({ error: 'Refresh failed', message: err.message });
  }
});

app.post('/auth/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!validatePassword(newPassword) || typeof currentPassword !== 'string') {
      return res.status(400).json({
        error: 'currentPassword and newPassword are required',
        details: 'newPassword must be at least 8 characters'
      });
    }

    const user = await getUserById(req.user.sub);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.password_hash) {
      return res.status(400).json({ error: 'Password not set for this account' });
    }

    const currentMatches = await compareHash(currentPassword, user.password_hash);
    if (!currentMatches) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newPasswordHash = await hashData(newPassword);
    await pool.query(`UPDATE User SET password_hash = ? WHERE user_id = ?`, [newPasswordHash, user.user_id]);

    return res.json({ message: 'Password changed successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Password change failed', message: err.message });
  }
});

app.get('/auth/profile', verifyToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.sub);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(normalizeUser(user));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch profile', message: err.message });
  }
});

app.put('/auth/profile', verifyToken, async (req, res) => {
  try {
    const { username, email, firstName, lastName, phone } = req.body;
    const updates = {
      username: username ?? null,
      email: email ? email.toLowerCase() : null,
      first_name: firstName ?? null,
      last_name: lastName ?? null,
      phone: phone ?? null
    };

    const updateKeys = Object.entries(updates).filter(([, value]) => value !== null);
    if (updateKeys.length === 0) {
      return res.status(400).json({ error: 'At least one profile field must be provided' });
    }

    const setClauses = updateKeys.map(([key]) => `${key} = ?`).join(', ');
    const values = updateKeys.map(([, value]) => value);
    values.push(req.user.sub);

    await pool.query(`UPDATE User SET ${setClauses} WHERE user_id = ?`, values);
    const user = await getUserById(req.user.sub);
    return res.json({ message: 'Profile updated successfully', user: normalizeUser(user) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update profile', message: err.message });
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
    return res.status(503).json({ status: 'error', service: 'Auth Service', message: err.message });
  }
});

app.use((err, req, res, next) => {
  return res.status(err.status || 500).json({ error: err.message || 'Internal server error', status: err.status || 500 });
});

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Auth Service listening on port ${PORT}`);
        console.log(`MariaDB connected: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
        console.log('Auth Service ready');
      });
    })
    .catch((err) => {
      console.error('Failed to start Auth Service:', err.message);
      process.exit(1);
    });
}

module.exports = app;
