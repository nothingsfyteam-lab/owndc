const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function dbGet(query, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(query, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
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

// Add reaction
router.post('/:messageId', requireAuth, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji, emojiId } = req.body;

    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }

    const reactionId = uuidv4();
    await dbRun(
      'INSERT OR REPLACE INTO reactions (id, message_id, user_id, emoji, emoji_id, is_custom) VALUES (?, ?, ?, ?, ?, ?)',
      [reactionId, messageId, req.session.userId, emoji, emojiId || null, emojiId ? 1 : 0]
    );

    const reaction = await dbGet(`
      SELECT r.*, u.username, u.avatar
      FROM reactions r
      JOIN users u ON r.user_id = u.id
      WHERE r.id = ?
    `, [reactionId]);

    res.status(201).json(reaction);
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove reaction
router.delete('/:messageId', requireAuth, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.query;

    await dbRun(
      'DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      [messageId, req.session.userId, emoji]
    );

    res.json({ message: 'Reaction removed' });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get reactions for message
router.get('/:messageId', requireAuth, async (req, res) => {
  try {
    const { messageId } = req.params;

    const reactions = await dbAll(`
      SELECT r.*, u.username, u.avatar
      FROM reactions r
      JOIN users u ON r.user_id = u.id
      WHERE r.message_id = ?
      ORDER BY r.created_at
    `, [messageId]);

    // Group by emoji
    const grouped = reactions.reduce((acc, reaction) => {
      if (!acc[reaction.emoji]) {
        acc[reaction.emoji] = {
          emoji: reaction.emoji,
          emojiId: reaction.emoji_id,
          isCustom: reaction.is_custom,
          count: 0,
          users: []
        };
      }
      acc[reaction.emoji].count++;
      acc[reaction.emoji].users.push({
        id: reaction.user_id,
        username: reaction.username,
        avatar: reaction.avatar
      });
      return acc;
    }, {});

    res.json(Object.values(grouped));
  } catch (error) {
    console.error('Get reactions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
