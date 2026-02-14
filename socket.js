const { getDb } = require('./db');

const userSockets = new Map();
const userStatus = new Map();
const voiceChannels = new Map();
const activeCalls = new Map();

// Helper functions
function dbGet(query, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    if (!db) return resolve(null);
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(query, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    if (!db) return resolve([]);
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    if (!db) return resolve({ changes: 0 });
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    let currentUser = null;
    let currentServer = null;
    let currentChannel = null;
    let currentCall = null;
    let typingInterval = null;

    // ==================== AUTHENTICATION ====================

    socket.on('authenticate', async (userId) => {
      try {
        const user = await dbGet('SELECT id, username, avatar, status, custom_status, activity FROM users WHERE id = ?', [userId]);
        
        if (user) {
          currentUser = user;
          userSockets.set(userId, socket.id);
          userStatus.set(userId, user.status);
          
          await dbRun("UPDATE users SET status = 'online', last_seen = datetime('now') WHERE id = ?", [userId]);
          
          socket.emit('authenticated', { success: true, user });
          
          // Broadcast to friends
          const friends = await dbAll(`
            SELECT DISTINCT u.id FROM users u
            JOIN friends f ON (f.friend_id = u.id AND f.user_id = ?) OR (f.user_id = u.id AND f.friend_id = ?)
            WHERE f.status = 'accepted' AND u.id != ?
          `, [userId, userId, userId]);

          friends.forEach(friend => {
            const friendSocket = userSockets.get(friend.id);
            if (friendSocket) {
              io.to(friendSocket).emit('friend-online', {
                userId: user.id,
                username: user.username,
                avatar: user.avatar,
                status: 'online'
              });
            }
          });

          // Join user's servers
          const servers = await dbAll('SELECT server_id FROM server_members WHERE user_id = ?', [userId]);
          servers.forEach(s => socket.join(`server:${s.server_id}`));
        }
      } catch (error) {
        console.error('Authentication error:', error);
        socket.emit('authenticated', { success: false, error: 'Authentication failed' });
      }
    });

    // ==================== STATUS & PRESENCE ====================

    socket.on('update-status', async (data) => {
      if (!currentUser) return;
      
      const { status, customStatus, activity, activityType } = data;
      
      try {
        await dbRun(
          'UPDATE users SET status = ?, custom_status = ?, activity = ?, activity_type = ? WHERE id = ?',
          [status || currentUser.status, customStatus || null, activity || null, activityType || null, currentUser.id]
        );

        userStatus.set(currentUser.id, status);

        // Broadcast to friends
        const friends = await dbAll(`
          SELECT DISTINCT u.id FROM users u
          JOIN friends f ON (f.friend_id = u.id AND f.user_id = ?) OR (f.user_id = u.id AND f.friend_id = ?)
          WHERE f.status = 'accepted' AND u.id != ?
        `, [currentUser.id, currentUser.id, currentUser.id]);

        friends.forEach(friend => {
          const friendSocket = userSockets.get(friend.id);
          if (friendSocket) {
            io.to(friendSocket).emit('status-update', {
              userId: currentUser.id,
              status,
              customStatus,
              activity,
              activityType
            });
          }
        });
      } catch (error) {
        console.error('Update status error:', error);
      }
    });

    // ==================== SERVER JOIN/LEAVE ====================

    socket.on('join-server', (serverId) => {
      currentServer = serverId;
      socket.join(`server:${serverId}`);
      socket.to(`server:${serverId}`).emit('user-joined-server', {
        userId: currentUser?.id,
        username: currentUser?.username,
        serverId
      });
    });

    socket.on('leave-server', (serverId) => {
      socket.leave(`server:${serverId}`);
      socket.to(`server:${serverId}`).emit('user-left-server', {
        userId: currentUser?.id,
        username: currentUser?.username,
        serverId
      });
      if (currentServer === serverId) currentServer = null;
    });

    // ==================== CHANNEL MESSAGING ====================

    socket.on('join-channel', (channelId) => {
      if (currentChannel) {
        socket.leave(`channel:${currentChannel}`);
      }
      currentChannel = channelId;
      socket.join(`channel:${channelId}`);
      
      socket.to(`channel:${channelId}`).emit('user-joined-channel', {
        userId: currentUser?.id,
        username: currentUser?.username,
        channelId
      });
    });

    socket.on('leave-channel', (channelId) => {
      socket.leave(`channel:${channelId}`);
      socket.to(`channel:${channelId}`).emit('user-left-channel', {
        userId: currentUser?.id,
        username: currentUser?.username,
        channelId
      });
      if (currentChannel === channelId) currentChannel = null;
    });

    socket.on('send-message', async (data) => {
      const { channelId, content, messageId, timestamp, replyToId, mentions } = data;
      
      socket.to(`channel:${channelId}`).emit('new-message', {
        id: messageId,
        channel_id: channelId,
        content,
        timestamp,
        sender_id: currentUser?.id,
        sender_username: currentUser?.username,
        sender_avatar: currentUser?.avatar,
        reply_to_id: replyToId,
        mentions
      });

      // Handle mentions
      if (mentions && mentions.length > 0) {
        mentions.forEach(userId => {
          const userSocket = userSockets.get(userId);
          if (userSocket && userSocket !== socket.id) {
            io.to(userSocket).emit('mentioned', {
              messageId,
              channelId,
              mentionedBy: currentUser?.username
            });
          }
        });
      }
    });

    socket.on('typing', (data) => {
      const { channelId, isTyping } = data;
      socket.to(`channel:${channelId}`).emit('user-typing', {
        userId: currentUser?.id,
        username: currentUser?.username,
        channelId,
        isTyping
      });
    });

    socket.on('edit-message', (data) => {
      const { messageId, channelId, content, editedAt } = data;
      socket.to(`channel:${channelId}`).emit('message-edited', {
        messageId,
        content,
        editedAt
      });
    });

    socket.on('delete-message', (data) => {
      const { messageId, channelId } = data;
      socket.to(`channel:${channelId}`).emit('message-deleted', { messageId });
    });

    socket.on('pin-message', (data) => {
      const { messageId, channelId, isPinned } = data;
      socket.to(`channel:${channelId}`).emit('message-pinned', { messageId, isPinned });
    });

    // ==================== REACTIONS ====================

    socket.on('add-reaction', (data) => {
      const { messageId, channelId, emoji, emojiId } = data;
      socket.to(`channel:${channelId}`).emit('reaction-added', {
        messageId,
        userId: currentUser?.id,
        emoji,
        emojiId
      });
    });

    socket.on('remove-reaction', (data) => {
      const { messageId, channelId, emoji } = data;
      socket.to(`channel:${channelId}`).emit('reaction-removed', {
        messageId,
        userId: currentUser?.id,
        emoji
      });
    });

    // ==================== DIRECT MESSAGES ====================

    socket.on('send-dm', (data) => {
      const { receiverId, content, messageId, timestamp, groupId } = data;
      
      if (groupId) {
        // Group DM
        socket.to(`group:${groupId}`).emit('new-dm', {
          id: messageId,
          content,
          timestamp,
          sender_id: currentUser?.id,
          sender_username: currentUser?.username,
          sender_avatar: currentUser?.avatar,
          group_id: groupId
        });
      } else {
        // 1-on-1 DM
        const receiverSocketId = userSockets.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('new-dm', {
            id: messageId,
            content,
            timestamp,
            sender_id: currentUser?.id,
            sender_username: currentUser?.username,
            sender_avatar: currentUser?.avatar,
            receiver_id: receiverId
          });
        }
      }
    });

    socket.on('join-group-dm', (groupId) => {
      socket.join(`group:${groupId}`);
    });

    socket.on('leave-group-dm', (groupId) => {
      socket.leave(`group:${groupId}`);
    });

    // ==================== VOICE & VIDEO CALLS ====================

    socket.on('join-voice', async (data) => {
      const { channelId, isVideo, serverId } = data;
      
      if (!voiceChannels.has(channelId)) {
        voiceChannels.set(channelId, new Map());
      }
      
      const channelUsers = voiceChannels.get(channelId);
      
      // Check if there's an active call
      let call = activeCalls.get(channelId);
      if (!call) {
        const { v4: uuidv4 } = require('uuid');
        call = {
          id: uuidv4(),
          channelId,
          serverId,
          participants: new Map(),
          isVideo: isVideo || false,
          startedAt: Date.now()
        };
        activeCalls.set(channelId, call);
      }

      // Add participant
      channelUsers.set(currentUser?.id, {
        userId: currentUser?.id,
        username: currentUser?.username,
        avatar: currentUser?.avatar,
        isMuted: false,
        isDeafened: false,
        isVideoOn: isVideo || false,
        isScreenSharing: false
      });

      call.participants.set(currentUser?.id, {
        socketId: socket.id,
        joinedAt: Date.now()
      });

      currentCall = channelId;
      socket.join(`voice:${channelId}`);

      // Notify others
      socket.to(`voice:${channelId}`).emit('user-joined-voice', {
        userId: currentUser?.id,
        username: currentUser?.username,
        avatar: currentUser?.avatar,
        isVideoOn: isVideo || false,
        channelId
      });

      // Send existing participants
      const existingUsers = Array.from(channelUsers.values()).filter(u => u.userId !== currentUser?.id);
      socket.emit('voice-channel-users', {
        channelId,
        users: existingUsers,
        isVideo: call.isVideo
      });
    });

    socket.on('leave-voice', (channelId) => {
      if (voiceChannels.has(channelId)) {
        const channelUsers = voiceChannels.get(channelId);
        channelUsers.delete(currentUser?.id);
        
        const call = activeCalls.get(channelId);
        if (call) {
          call.participants.delete(currentUser?.id);
          if (call.participants.size === 0) {
            activeCalls.delete(channelId);
          }
        }

        socket.to(`voice:${channelId}`).emit('user-left-voice', {
          userId: currentUser?.id,
          username: currentUser?.username,
          channelId
        });
      }
      
      socket.leave(`voice:${channelId}`);
      currentCall = null;
    });

    socket.on('voice-state-update', (data) => {
      const { channelId, isMuted, isDeafened, isVideoOn, isScreenSharing } = data;
      
      if (voiceChannels.has(channelId)) {
        const channelUsers = voiceChannels.get(channelId);
        const user = channelUsers.get(currentUser?.id);
        if (user) {
          user.isMuted = isMuted;
          user.isDeafened = isDeafened;
          user.isVideoOn = isVideoOn;
          user.isScreenSharing = isScreenSharing;
        }

        socket.to(`voice:${channelId}`).emit('voice-state-changed', {
          userId: currentUser?.id,
          isMuted,
          isDeafened,
          isVideoOn,
          isScreenSharing
        });
      }
    });

    // ==================== WEBRTC SIGNALING ====================

    socket.on('offer', (data) => {
      const { targetUserId, offer, type } = data;
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('offer', {
          userId: currentUser?.id,
          username: currentUser?.username,
          offer,
          type // 'voice', 'video', or 'screen'
        });
      }
    });

    socket.on('answer', (data) => {
      const { targetUserId, answer } = data;
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('answer', {
          userId: currentUser?.id,
          answer
        });
      }
    });

    socket.on('ice-candidate', (data) => {
      const { targetUserId, candidate } = data;
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('ice-candidate', {
          userId: currentUser?.id,
          candidate
        });
      }
    });

    // ==================== FRIENDS ====================

    socket.on('friend-request', (data) => {
      const { targetUserId, friendshipId } = data;
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('friend-request-received', {
          friendshipId,
          from: {
            id: currentUser?.id,
            username: currentUser?.username,
            avatar: currentUser?.avatar
          }
        });
      }
    });

    socket.on('friend-request-accepted', (data) => {
      const { targetUserId } = data;
      const targetSocketId = userSockets.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('friend-request-accepted-by', {
          user: {
            id: currentUser?.id,
            username: currentUser?.username,
            avatar: currentUser?.avatar,
            status: userStatus.get(currentUser?.id) || 'online'
          }
        });
      }
    });

    // ==================== THREADS ====================

    socket.on('join-thread', (threadId) => {
      socket.join(`thread:${threadId}`);
    });

    socket.on('leave-thread', (threadId) => {
      socket.leave(`thread:${threadId}`);
    });

    socket.on('send-thread-message', (data) => {
      const { threadId, content, messageId, timestamp } = data;
      socket.to(`thread:${threadId}`).emit('new-thread-message', {
        id: messageId,
        threadId,
        content,
        timestamp,
        sender_id: currentUser?.id,
        sender_username: currentUser?.username,
        sender_avatar: currentUser?.avatar
      });
    });

    // ==================== SERVER UPDATES ====================

    socket.on('channel-created', (data) => {
      const { serverId, channel } = data;
      socket.to(`server:${serverId}`).emit('channel-created', channel);
    });

    socket.on('channel-deleted', (data) => {
      const { serverId, channelId } = data;
      socket.to(`server:${serverId}`).emit('channel-deleted', { channelId });
    });

    socket.on('server-updated', (data) => {
      const { serverId, updates } = data;
      socket.to(`server:${serverId}`).emit('server-updated', updates);
    });

    // ==================== DISCONNECT ====================

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.id}`);
      
      if (currentUser) {
        await dbRun("UPDATE users SET status = 'offline', last_seen = datetime('now') WHERE id = ?", [currentUser.id]);
        
        userSockets.delete(currentUser.id);
        userStatus.delete(currentUser.id);
        
        // Leave voice channel
        if (currentCall && voiceChannels.has(currentCall)) {
          const channelUsers = voiceChannels.get(currentCall);
          channelUsers.delete(currentUser.id);
          
          const call = activeCalls.get(currentCall);
          if (call) {
            call.participants.delete(currentUser.id);
            if (call.participants.size === 0) {
              activeCalls.delete(currentCall);
            }
          }
          
          socket.to(`voice:${currentCall}`).emit('user-left-voice', {
            userId: currentUser.id,
            username: currentUser.username,
            channelId: currentCall
          });
        }
        
        // Broadcast offline to friends
        const friends = await dbAll(`
          SELECT DISTINCT u.id FROM users u
          JOIN friends f ON (f.friend_id = u.id AND f.user_id = ?) OR (f.user_id = u.id AND f.friend_id = ?)
          WHERE f.status = 'accepted' AND u.id != ?
        `, [currentUser.id, currentUser.id, currentUser.id]);

        friends.forEach(friend => {
          const friendSocket = userSockets.get(friend.id);
          if (friendSocket) {
            io.to(friendSocket).emit('friend-offline', {
              userId: currentUser.id,
              username: currentUser.username
            });
          }
        });
      }
    });
  });
};
