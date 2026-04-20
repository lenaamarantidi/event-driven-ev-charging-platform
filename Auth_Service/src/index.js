/**
 * Auth Service
 * Handles user authentication, JWT token generation, and Google OAuth integration
 * Port: 3100
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3100;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

// In-memory user storage (replace with DB in production)
const users = new Map();
const refreshTokens = new Set();

// Initialize admin user for testing
const adminId = uuidv4();
const adminPasswordHash = bcrypt.hashSync('admin123', 10);
users.set('admin@saasplug.com', {
  id: adminId,
  email: 'admin@saasplug.com',
  password: adminPasswordHash,
  role: 'admin',
  provider: 'local',
  createdAt: new Date(),
  verified: true
});

/**
 * Token generation with claims
 */
function generateTokens(user) {
  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      provider: user.provider
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  const refreshToken = jwt.sign(
    { id: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  refreshTokens.add(refreshToken);
  return { accessToken, refreshToken };
}

/**
 * Verify JWT token middleware
 */
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', message: err.message });
  }
}

/**
 * POST /auth/register
 * Register new user with email and password
 */
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name, userType } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (users.has(email)) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const userId = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 10);

    const newUser = {
      id: userId,
      email,
      password: hashedPassword,
      name: name || '',
      role: userType || 'user',
      provider: 'local',
      createdAt: new Date(),
      verified: false
    };

    users.set(email, newUser);

    const tokens = generateTokens(newUser);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role
      },
      tokens
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed', message: err.message });
  }
});

/**
 * POST /auth/login
 * Local authentication with email/password
 */
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = users.get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = bcrypt.compareSync(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tokens = generateTokens(user);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      tokens
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed', message: err.message });
  }
});

/**
 * POST /auth/google
 * Google OAuth authentication
 */
app.post('/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'Google ID token required' });
    }

    // Verify Google token with Google API
    const googleApiUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`;
    
    try {
      const googleResponse = await axios.get(googleApiUrl, { timeout: 5000 });
      const { email, name, picture } = googleResponse.data;

      let user = users.get(email);

      if (!user) {
        // Create new user from Google OAuth
        const userId = uuidv4();
        user = {
          id: userId,
          email,
          name: name || '',
          picture: picture || '',
          role: 'user',
          provider: 'google',
          createdAt: new Date(),
          verified: true
        };
        users.set(email, user);
      }

      const tokens = generateTokens(user);

      res.json({
        message: 'Google authentication successful',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          picture: user.picture
        },
        tokens
      });
    } catch (googleError) {
      console.error('Google token verification failed:', googleError.message);
      return res.status(401).json({ error: 'Google token verification failed' });
    }
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Google authentication failed', message: err.message });
  }
});

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
app.post('/auth/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || !refreshTokens.has(refreshToken)) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const user = Array.from(users.values()).find(u => u.id === decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const tokens = generateTokens(user);
    refreshTokens.delete(refreshToken); // Invalidate old refresh token

    res.json({
      message: 'Token refreshed successfully',
      tokens
    });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(401).json({ error: 'Token refresh failed', message: err.message });
  }
});

/**
 * POST /auth/logout
 * Logout user (invalidate refresh token)
 */
app.post('/auth/logout', verifyToken, (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      refreshTokens.delete(refreshToken);
    }
    res.json({ message: 'Logout successful' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Logout failed', message: err.message });
  }
});

/**
 * GET /auth/profile
 * Get authenticated user profile
 */
app.get('/auth/profile', verifyToken, (req, res) => {
  try {
    const user = users.get(req.user.email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch profile', message: err.message });
  }
});

/**
 * PUT /auth/profile
 * Update user profile
 */
app.put('/auth/profile', verifyToken, (req, res) => {
  try {
    const { name, picture } = req.body;
    const user = users.get(req.user.email);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (name) user.name = name;
    if (picture) user.picture = picture;
    user.updatedAt = new Date();

    const { password, ...userWithoutPassword } = user;
    res.json({
      message: 'Profile updated successfully',
      user: userWithoutPassword
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile', message: err.message });
  }
});

/**
 * POST /auth/change-password
 * Change user password
 */
app.post('/auth/change-password', verifyToken, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = users.get(req.user.email);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    const passwordMatch = bcrypt.compareSync(currentPassword, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.password = bcrypt.hashSync(newPassword, 10);
    user.updatedAt = new Date();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password', message: err.message });
  }
});

/**
 * GET /auth/Health
 * Service health check
 */
app.get('/auth/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Auth Service',
    port: PORT,
    timestamp: new Date()
  });
});

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    status: err.status || 500
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Auth Service listening on port ${PORT}`);
  console.log(`📝 Test login: admin@saasplug.com / admin123`);
});

module.exports = app;
