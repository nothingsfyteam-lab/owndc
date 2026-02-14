const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const router = express.Router();

function dbGet(query, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

// Get current user profile
router.get('/me', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await dbGet(
      'SELECT id, username, email, avatar, banner, bio, status, custom_status, activity, created_at FROM users WHERE id = ?',
      [req.session.userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
router.patch('/me', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { username, email, bio, avatar, banner, custom_status } = req.body;

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if username is taken (if changing)
    if (username && username !== user.username) {
      const existing = await dbGet('SELECT * FROM users WHERE username = ? AND id != ?', [username, req.session.userId]);
      if (existing) {
        return res.status(409).json({ error: 'Username already taken' });
      }
    }

    // Check if email is taken (if changing)
    if (email && email !== user.email) {
      const existing = await dbGet('SELECT * FROM users WHERE email = ? AND id != ?', [email, req.session.userId]);
      if (existing) {
        return res.status(409).json({ error: 'Email already taken' });
      }
    }

    await dbRun(
      'UPDATE users SET username = ?, email = ?, bio = ?, avatar = ?, banner = ?, custom_status = ? WHERE id = ?',
      [
        username || user.username,
        email || user.email,
        bio !== undefined ? bio : user.bio,
        avatar !== undefined ? avatar : user.avatar,
        banner !== undefined ? banner : user.banner,
        custom_status !== undefined ? custom_status : user.custom_status,
        req.session.userId
      ]
    );

    const updated = await dbGet(
      'SELECT id, username, email, avatar, banner, bio, status, custom_status, activity, created_at FROM users WHERE id = ?',
      [req.session.userId]
    );

    res.json(updated);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password
router.post('/me/password', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, req.session.userId]);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user profile by ID (public)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await dbGet(
      'SELECT id, username, avatar, banner, bio, status, custom_status, activity, created_at FROM users WHERE id = ?',
      [id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
