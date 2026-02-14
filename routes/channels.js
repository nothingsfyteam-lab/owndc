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

// Get all channels (for testing)
router.get('/', requireAuth, async (req, res) => {
  try {
    const channels = await dbAll(`
      SELECT c.*, s.name as server_name, u.username as owner_username
      FROM channels c
      LEFT JOIN servers s ON c.server_id = s.id
      LEFT JOIN users u ON c.owner_id = u.id
      ORDER BY c.created_at DESC
    `);

    res.json({
      all: channels,
      mine: channels.filter(c => c.owner_id === req.session.userId)
    });
  } catch (error) {
    console.error('Get channels error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create channel
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, type = 'text', serverId } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Channel name is required' });
    }

    if (!serverId) {
      return res.status(400).json({ error: 'Server ID is required' });
    }

    // Check if user is member of server
    const isMember = await dbGet('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.session.userId]);

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this server' });
    }

    const channelId = uuidv4();

    await dbRun(
      'INSERT INTO channels (id, server_id, name, type, owner_id) VALUES (?, ?, ?, ?, ?)',
      [channelId, serverId, name.trim(), type, req.session.userId]
    );

    const channel = await dbGet(`
      SELECT c.*, u.username as owner_username
      FROM channels c
      JOIN users u ON c.owner_id = u.id
      WHERE c.id = ?
    `, [channelId]);

    res.status(201).json(channel);
  } catch (error) {
    console.error('Create channel error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get channel messages
router.get('/:id/messages', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const channel = await dbGet('SELECT * FROM channels WHERE id = ?', [id]);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check server membership for server channels
    if (channel.server_id) {
      const isMember = await dbGet('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
        [channel.server_id, req.session.userId]);

      if (!isMember) {
        return res.status(403).json({ error: 'Not a member of this server' });
      }
    }

    const messages = await dbAll(`
      SELECT 
        m.id,
        m.content,
        m.timestamp,
        u.id as sender_id,
        u.username as sender_username,
        u.avatar as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.channel_id = ?
      ORDER BY m.timestamp DESC
      LIMIT ? OFFSET ?
    `, [id, parseInt(limit), parseInt(offset)]);

    res.json(messages.reverse());
  } catch (error) {
    console.error('Get channel messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Join channel
router.post('/:id/join', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const channel = await dbGet('SELECT * FROM channels WHERE id = ?', [id]);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    if (channel.server_id) {
      const isMember = await dbGet('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
        [channel.server_id, req.session.userId]);

      if (!isMember) {
        return res.status(403).json({ error: 'Not a member of this server' });
      }
    }

    res.json({ message: 'Joined channel successfully' });
  } catch (error) {
    console.error('Join channel error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Leave channel
router.post('/:id/leave', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await dbRun('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?',
      [id, req.session.userId]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Not a member of this channel' });
    }

    res.json({ message: 'Left channel successfully' });
  } catch (error) {
    console.error('Leave channel error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete channel (owner only)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const channel = await dbGet('SELECT * FROM channels WHERE id = ?', [id]);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Check if user is server owner or channel creator
    if (channel.server_id) {
      const server = await dbGet('SELECT * FROM servers WHERE id = ?', [channel.server_id]);
      if (server.owner_id !== req.session.userId && channel.owner_id !== req.session.userId) {
        return res.status(403).json({ error: 'Only server owner or channel creator can delete' });
      }
    } else if (channel.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Only channel creator can delete' });
    }

    await dbRun('DELETE FROM channels WHERE id = ?', [id]);

    res.json({ message: 'Channel deleted successfully' });
  } catch (error) {
    console.error('Delete channel error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
