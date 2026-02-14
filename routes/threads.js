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

// Create thread
router.post('/', requireAuth, async (req, res) => {
  try {
    const { channelId, name, messageId, autoArchiveDuration } = req.body;

    const message = await dbGet('SELECT server_id FROM messages WHERE id = ?', [messageId]);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const threadId = uuidv4();
    await dbRun(
      'INSERT INTO threads (id, parent_channel_id, server_id, name, owner_id, message_id, auto_archive_duration) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [threadId, channelId, message.server_id, name, req.session.userId, messageId, autoArchiveDuration || 1440]
    );

    await dbRun(
      'INSERT INTO thread_members (id, thread_id, user_id) VALUES (?, ?, ?)',
      [uuidv4(), threadId, req.session.userId]
    );

    const thread = await dbGet('SELECT * FROM threads WHERE id = ?', [threadId]);
    res.status(201).json(thread);
  } catch (error) {
    console.error('Create thread error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get threads for channel
router.get('/channel/:channelId', requireAuth, async (req, res) => {
  try {
    const { channelId } = req.params;

    const threads = await dbAll(`
      SELECT t.*, u.username as owner_username,
        (SELECT COUNT(*) FROM thread_members WHERE thread_id = t.id) as member_count,
        (SELECT COUNT(*) FROM messages WHERE channel_id = t.id) as message_count
      FROM threads t
      JOIN users u ON t.owner_id = u.id
      WHERE t.parent_channel_id = ? AND t.is_archived = 0
      ORDER BY t.created_at DESC
    `, [channelId]);

    res.json(threads);
  } catch (error) {
    console.error('Get threads error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get thread messages
router.get('/:threadId/messages', requireAuth, async (req, res) => {
  try {
    const { threadId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const isMember = await dbGet('SELECT * FROM thread_members WHERE thread_id = ? AND user_id = ?', 
      [threadId, req.session.userId]);

    if (!isMember) {
      // Auto-join if not member
      await dbRun(
        'INSERT OR IGNORE INTO thread_members (id, thread_id, user_id) VALUES (?, ?, ?)',
        [uuidv4(), threadId, req.session.userId]
      );
    }

    const messages = await dbAll(`
      SELECT m.*, u.username as sender_username, u.avatar as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.channel_id = ?
      ORDER BY m.timestamp DESC
      LIMIT ? OFFSET ?
    `, [threadId, parseInt(limit), parseInt(offset)]);

    res.json(messages.reverse());
  } catch (error) {
    console.error('Get thread messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send message to thread
router.post('/:threadId/messages', requireAuth, async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content } = req.body;

    const isMember = await dbGet('SELECT * FROM thread_members WHERE thread_id = ? AND user_id = ?', 
      [threadId, req.session.userId]);

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this thread' });
    }

    const messageId = uuidv4();
    await dbRun(
      'INSERT INTO messages (id, channel_id, sender_id, content) VALUES (?, ?, ?, ?)',
      [messageId, threadId, req.session.userId, content]
    );

    await dbRun('UPDATE threads SET message_count = message_count + 1 WHERE id = ?', [threadId]);

    const message = await dbGet(`
      SELECT m.*, u.username as sender_username, u.avatar as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `, [messageId]);

    res.status(201).json(message);
  } catch (error) {
    console.error('Send thread message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Join thread
router.post('/:threadId/join', requireAuth, async (req, res) => {
  try {
    const { threadId } = req.params;

    await dbRun(
      'INSERT OR IGNORE INTO thread_members (id, thread_id, user_id) VALUES (?, ?, ?)',
      [uuidv4(), threadId, req.session.userId]
    );

    await dbRun('UPDATE threads SET member_count = member_count + 1 WHERE id = ?', [threadId]);

    res.json({ message: 'Joined thread' });
  } catch (error) {
    console.error('Join thread error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Leave thread
router.post('/:threadId/leave', requireAuth, async (req, res) => {
  try {
    const { threadId } = req.params;

    await dbRun('DELETE FROM thread_members WHERE thread_id = ? AND user_id = ?', [threadId, req.session.userId]);
    await dbRun('UPDATE threads SET member_count = member_count - 1 WHERE id = ?', [threadId]);

    res.json({ message: 'Left thread' });
  } catch (error) {
    console.error('Leave thread error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
