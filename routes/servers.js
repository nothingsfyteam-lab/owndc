const express = require('express');
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

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Get all servers for user
router.get('/', requireAuth, async (req, res) => {
  try {
    const servers = await dbAll(`
      SELECT s.*, sm.joined_at, sm.nickname,
        CASE WHEN s.owner_id = ? THEN 1 ELSE 0 END as is_owner
      FROM servers s
      JOIN server_members sm ON s.id = sm.server_id
      WHERE sm.user_id = ?
      ORDER BY s.created_at DESC
    `, [req.session.userId, req.session.userId]);

    res.json(servers);
  } catch (error) {
    console.error('Get servers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new server
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, icon, description } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Server name is required' });
    }

    const serverId = uuidv4();
    
    await dbRun(
      'INSERT INTO servers (id, name, icon, description, owner_id) VALUES (?, ?, ?, ?, ?)',
      [serverId, name.trim(), icon || null, description || '', req.session.userId]
    );

    // Add creator as owner with admin role
    await dbRun(
      'INSERT INTO server_members (id, server_id, user_id) VALUES (?, ?, ?)',
      [uuidv4(), serverId, req.session.userId]
    );

    // Create admin role for owner
    const adminRoleId = uuidv4();
    await dbRun(
      'INSERT INTO roles (id, server_id, name, color, position, permissions, hoist) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [adminRoleId, serverId, 'Admin', '#E74C3C', 1, 2147483647, 1]
    );

    // Assign admin role to owner
    await dbRun(
      'INSERT INTO user_roles (id, user_id, role_id, server_id) VALUES (?, ?, ?, ?)',
      [uuidv4(), req.session.userId, adminRoleId, serverId]
    );

    // Create default @everyone role
    const everyoneRoleId = uuidv4();
    await dbRun(
      'INSERT INTO roles (id, server_id, name, color, position, permissions) VALUES (?, ?, ?, ?, ?, ?)',
      [everyoneRoleId, serverId, '@everyone', '#99AAB5', 0, 104324161]
    );

    // Create default text channel
    const generalChannelId = uuidv4();
    await dbRun(
      'INSERT INTO channels (id, server_id, name, type, position) VALUES (?, ?, ?, ?, ?)',
      [generalChannelId, serverId, 'general', 'text', 0]
    );

    // Create default voice channel
    const voiceChannelId = uuidv4();
    await dbRun(
      'INSERT INTO channels (id, server_id, name, type, position) VALUES (?, ?, ?, ?, ?)',
      [voiceChannelId, serverId, 'General', 'voice', 1]
    );

    const server = await dbGet('SELECT *, 1 as is_owner FROM servers WHERE id = ?', [serverId]);
    res.status(201).json(server);
  } catch (error) {
    console.error('Create server error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get server by ID with full details
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const isMember = await dbGet('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', 
      [id, req.session.userId]);

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this server' });
    }

    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Check if user is owner
    server.is_owner = server.owner_id === req.session.userId;

    // Get channels
    const channels = await dbAll(`
      SELECT c.*, cat.name as category_name
      FROM channels c
      LEFT JOIN categories cat ON c.category_id = cat.id
      WHERE c.server_id = ?
      ORDER BY cat.position, c.position
    `, [id]);

    // Get categories
    const categories = await dbAll('SELECT * FROM categories WHERE server_id = ? ORDER BY position', [id]);

    // Get members with their roles
    const members = await dbAll(`
      SELECT u.id, u.username, u.avatar, u.status, u.custom_status, sm.nickname, sm.joined_at
      FROM server_members sm
      JOIN users u ON sm.user_id = u.id
      WHERE sm.server_id = ?
    `, [id]);

    // Get user roles for each member
    for (let member of members) {
      const roles = await dbAll(`
        SELECT r.*
        FROM roles r
        JOIN user_roles ur ON r.id = ur.role_id
        WHERE ur.user_id = ? AND ur.server_id = ?
        ORDER BY r.position DESC
      `, [member.id, id]);
      member.roles = roles;
    }

    // Get all roles
    const roles = await dbAll('SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC', [id]);

    res.json({
      server,
      channels,
      categories,
      members,
      roles
    });
  } catch (error) {
    console.error('Get server error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update server (owner only)
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, description } = req.body;

    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Only owner can update server' });
    }

    await dbRun(
      'UPDATE servers SET name = ?, icon = ?, description = ? WHERE id = ?',
      [name || server.name, icon || server.icon, description || server.description, id]
    );

    const updated = await dbGet('SELECT * FROM servers WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    console.error('Update server error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create invite
router.post('/:id/invites', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const isMember = await dbGet('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', 
      [id, req.session.userId]);

    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this server' });
    }

    const inviteId = uuidv4();
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    await dbRun(
      'INSERT INTO server_invites (id, code, server_id, created_by) VALUES (?, ?, ?, ?)',
      [inviteId, code, id, req.session.userId]
    );

    res.status(201).json({ code, serverId: id });
  } catch (error) {
    console.error('Create invite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Join server by invite
router.post('/join/:code', requireAuth, async (req, res) => {
  try {
    const { code } = req.params;

    const invite = await dbGet('SELECT * FROM server_invites WHERE code = ?', [code]);
    if (!invite) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    const existing = await dbGet('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [invite.server_id, req.session.userId]);

    if (existing) {
      return res.status(409).json({ error: 'Already a member of this server' });
    }

    await dbRun(
      'INSERT INTO server_members (id, server_id, user_id) VALUES (?, ?, ?)',
      [uuidv4(), invite.server_id, req.session.userId]
    );

    const server = await dbGet('SELECT *, 0 as is_owner FROM servers WHERE id = ?', [invite.server_id]);
    res.json({ message: 'Joined server successfully', server });
  } catch (error) {
    console.error('Join server error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Leave server
router.post('/:id/leave', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [id]);
    if (server && server.owner_id === req.session.userId) {
      return res.status(400).json({ error: 'Owner cannot leave server. Transfer ownership or delete server.' });
    }

    await dbRun('DELETE FROM server_members WHERE server_id = ? AND user_id = ?', [id, req.session.userId]);
    res.json({ message: 'Left server successfully' });
  } catch (error) {
    console.error('Leave server error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete server (owner only)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Only owner can delete server' });
    }

    await dbRun('DELETE FROM servers WHERE id = ?', [id]);
    res.json({ message: 'Server deleted successfully' });
  } catch (error) {
    console.error('Delete server error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Kick user (owner only)
router.post('/:id/kick/:userId', requireAuth, async (req, res) => {
  try {
    const { id, userId } = req.params;

    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Only owner can kick users' });
    }

    if (userId === server.owner_id) {
      return res.status(400).json({ error: 'Cannot kick owner' });
    }

    await dbRun('DELETE FROM server_members WHERE server_id = ? AND user_id = ?', [id, userId]);
    res.json({ message: 'User kicked successfully' });
  } catch (error) {
    console.error('Kick user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create role (owner only)
router.post('/:id/roles', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, permissions } = req.body;

    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Only owner can create roles' });
    }

    const roleId = uuidv4();
    await dbRun(
      'INSERT INTO roles (id, server_id, name, color, permissions) VALUES (?, ?, ?, ?, ?)',
      [roleId, id, name, color || '#99AAB5', permissions || 0]
    );

    const role = await dbGet('SELECT * FROM roles WHERE id = ?', [roleId]);
    res.status(201).json(role);
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Assign role to user
router.post('/:id/members/:userId/roles/:roleId', requireAuth, async (req, res) => {
  try {
    const { id, userId, roleId } = req.params;

    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Check if requester is owner
    if (server.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Only owner can assign roles' });
    }

    await dbRun(
      'INSERT OR REPLACE INTO user_roles (id, user_id, role_id, server_id) VALUES (?, ?, ?, ?)',
      [uuidv4(), userId, roleId, id]
    );

    res.json({ message: 'Role assigned successfully' });
  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
