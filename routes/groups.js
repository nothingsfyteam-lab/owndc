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

// Get all group DMs for user
router.get('/', requireAuth, async (req, res) => {
  try {
    const groups = await dbAll(`
      SELECT g.*, u.username as owner_username,
        (SELECT COUNT(*) FROM group_dm_members WHERE group_id = g.id) as member_count
      FROM group_dms g
      JOIN group_dm_members gm ON g.id = gm.group_id
      JOIN users u ON g.owner_id = u.id
      WHERE gm.user_id = ?
      ORDER BY g.created_at DESC
    `, [req.session.userId]);

    // Get members for each group
    for (let group of groups) {
      const members = await dbAll(`
        SELECT u.id, u.username, u.avatar, u.status
        FROM group_dm_members gm
        JOIN users u ON gm.user_id = u.id
        WHERE gm.group_id = ?
      `, [group.id]);
      group.members = members;
    }

    res.json(groups);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create group DM
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const groupId = uuidv4();
    
    // Create group
    await dbRun(
      'INSERT INTO group_dms (id, name, owner_id) VALUES (?, ?, ?)',
      [groupId, name.trim(), req.session.userId]
    );

    // Add creator as member
    await dbRun(
      'INSERT INTO group_dm_members (id, group_id, user_id) VALUES (?, ?, ?)',
      [uuidv4(), groupId, req.session.userId]
    );

    // Add other members
    if (memberIds && Array.isArray(memberIds)) {
      for (const memberId of memberIds) {
        if (memberId !== req.session.userId) {
          await dbRun(
            'INSERT OR IGNORE INTO group_dm_members (id, group_id, user_id) VALUES (?, ?, ?)',
            [uuidv4(), groupId, memberId]
          );
        }
      }
    }

    const group = await dbGet(`
      SELECT g.*, u.username as owner_username
      FROM group_dms g
      JOIN users u ON g.owner_id = u.id
      WHERE g.id = ?
    `, [groupId]);

    const members = await dbAll(`
      SELECT u.id, u.username, u.avatar, u.status
      FROM group_dm_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `, [groupId]);
    
    group.members = members;

    res.status(201).json(group);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get group DM details
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if member
    const isMember = await dbGet('SELECT * FROM group_dm_members WHERE group_id = ? AND user_id = ?', 
      [id, req.session.userId]);
    
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const group = await dbGet(`
      SELECT g.*, u.username as owner_username
      FROM group_dms g
      JOIN users u ON g.owner_id = u.id
      WHERE g.id = ?
    `, [id]);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const members = await dbAll(`
      SELECT u.id, u.username, u.avatar, u.status
      FROM group_dm_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `, [id]);

    const messages = await dbAll(`
      SELECT dm.*, 
        sender.username as sender_username, 
        sender.avatar as sender_avatar
      FROM direct_messages dm
      JOIN users sender ON dm.sender_id = sender.id
      WHERE dm.group_id = ?
      ORDER BY dm.timestamp DESC
      LIMIT 50
    `, [id]);

    res.json({
      group,
      members,
      messages: messages.reverse()
    });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add member to group
router.post('/:id/members', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const group = await dbGet('SELECT * FROM group_dms WHERE id = ?', [id]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if requester is owner or member
    const isMember = await dbGet('SELECT * FROM group_dm_members WHERE group_id = ? AND user_id = ?', 
      [id, req.session.userId]);
    
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    // Check if user exists
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already member
    const existing = await dbGet('SELECT * FROM group_dm_members WHERE group_id = ? AND user_id = ?', 
      [id, userId]);
    
    if (existing) {
      return res.status(409).json({ error: 'User is already a member' });
    }

    await dbRun(
      'INSERT INTO group_dm_members (id, group_id, user_id) VALUES (?, ?, ?)',
      [uuidv4(), id, userId]
    );

    res.json({ 
      message: 'Member added successfully',
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Leave group
router.post('/:id/leave', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    await dbRun('DELETE FROM group_dm_members WHERE group_id = ? AND user_id = ?', 
      [id, req.session.userId]);

    // If owner leaves, transfer ownership or delete
    const group = await dbGet('SELECT * FROM group_dms WHERE id = ?', [id]);
    if (group && group.owner_id === req.session.userId) {
      const remainingMembers = await dbAll('SELECT * FROM group_dm_members WHERE group_id = ?', [id]);
      if (remainingMembers.length > 0) {
        // Transfer ownership to first remaining member
        await dbRun('UPDATE group_dms SET owner_id = ? WHERE id = ?', 
          [remainingMembers[0].user_id, id]);
      } else {
        // Delete empty group
        await dbRun('DELETE FROM group_dms WHERE id = ?', [id]);
      }
    }

    res.json({ message: 'Left group successfully' });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete group (owner only)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const group = await dbGet('SELECT * FROM group_dms WHERE id = ?', [id]);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group.owner_id !== req.session.userId) {
      return res.status(403).json({ error: 'Only owner can delete group' });
    }

    await dbRun('DELETE FROM group_dms WHERE id = ?', [id]);

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
