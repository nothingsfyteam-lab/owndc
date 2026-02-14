const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
let db = null;

function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');
      
      db.serialize(() => {
        db.run('PRAGMA foreign_keys = ON');
        
        // Users table with enhanced profile features
        db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            avatar TEXT DEFAULT 'default-avatar.png',
            banner TEXT DEFAULT NULL,
            bio TEXT DEFAULT '',
            status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'idle', 'dnd', 'offline')),
            custom_status TEXT DEFAULT NULL,
            activity TEXT DEFAULT NULL,
            activity_type TEXT DEFAULT NULL,
            two_factor_enabled INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Servers (Communities)
        db.run(`
          CREATE TABLE IF NOT EXISTS servers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT DEFAULT 'default-server.png',
            banner TEXT DEFAULT NULL,
            description TEXT DEFAULT '',
            owner_id TEXT NOT NULL,
            vanity_url TEXT UNIQUE,
            verification_level INTEGER DEFAULT 0,
            boost_count INTEGER DEFAULT 0,
            boost_level INTEGER DEFAULT 0,
            is_community INTEGER DEFAULT 0,
            onboarding_enabled INTEGER DEFAULT 0,
            rules_channel_id TEXT,
            welcome_channel_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Server members
        db.run(`
          CREATE TABLE IF NOT EXISTS server_members (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            nickname TEXT DEFAULT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            boost_since DATETIME DEFAULT NULL,
            mute_until DATETIME DEFAULT NULL,
            deafen_until DATETIME DEFAULT NULL,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(server_id, user_id)
          )
        `);

        // Server bans
        db.run(`
          CREATE TABLE IF NOT EXISTS server_bans (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            reason TEXT DEFAULT '',
            banned_by TEXT NOT NULL,
            banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME DEFAULT NULL,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (banned_by) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(server_id, user_id)
          )
        `);

        // Server invites
        db.run(`
          CREATE TABLE IF NOT EXISTS server_invites (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            server_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            created_by TEXT NOT NULL,
            max_uses INTEGER DEFAULT 0,
            uses INTEGER DEFAULT 0,
            expires_at DATETIME DEFAULT NULL,
            temporary INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Categories for channels
        db.run(`
          CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            name TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
          )
        `);

        // Enhanced channels table
        db.run(`
          CREATE TABLE IF NOT EXISTS channels (
            id TEXT PRIMARY KEY,
            server_id TEXT,
            category_id TEXT,
            name TEXT NOT NULL,
            type TEXT DEFAULT 'text' CHECK (type IN ('text', 'voice', 'announcement', 'stage', 'rules', 'welcome')),
            topic TEXT DEFAULT '',
            position INTEGER DEFAULT 0,
            slow_mode INTEGER DEFAULT 0,
            nsfw INTEGER DEFAULT 0,
            user_limit INTEGER DEFAULT 0,
            bitrate INTEGER DEFAULT 64000,
            video_quality INTEGER DEFAULT 1,
            owner_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Channel permissions
        db.run(`
          CREATE TABLE IF NOT EXISTS channel_permissions (
            id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            role_id TEXT,
            user_id TEXT,
            allow_permissions INTEGER DEFAULT 0,
            deny_permissions INTEGER DEFAULT 0,
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Server roles
        db.run(`
          CREATE TABLE IF NOT EXISTS roles (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            name TEXT NOT NULL,
            color TEXT DEFAULT '#99AAB5',
            hoist INTEGER DEFAULT 0,
            position INTEGER DEFAULT 0,
            permissions INTEGER DEFAULT 0,
            mentionable INTEGER DEFAULT 1,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
          )
        `);

        // User roles
        db.run(`
          CREATE TABLE IF NOT EXISTS user_roles (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            server_id TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            UNIQUE(user_id, role_id)
          )
        `);

        // Friends table
        db.run(`
          CREATE TABLE IF NOT EXISTS friends (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            friend_id TEXT NOT NULL,
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, friend_id)
          )
        `);

        // Group DMs
        db.run(`
          CREATE TABLE IF NOT EXISTS group_dms (
            id TEXT PRIMARY KEY,
            name TEXT,
            icon TEXT DEFAULT NULL,
            owner_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Group DM members
        db.run(`
          CREATE TABLE IF NOT EXISTS group_dm_members (
            id TEXT PRIMARY KEY,
            group_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES group_dms(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(group_id, user_id)
          )
        `);

        // Messages with enhanced features
        db.run(`
          CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            server_id TEXT,
            sender_id TEXT NOT NULL,
            content TEXT NOT NULL,
            type TEXT DEFAULT 'default' CHECK (type IN ('default', 'reply', 'system')),
            reply_to_id TEXT,
            is_pinned INTEGER DEFAULT 0,
            is_edited INTEGER DEFAULT 0,
            edited_at DATETIME,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
          )
        `);

        // Message attachments
        db.run(`
          CREATE TABLE IF NOT EXISTS attachments (
            id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            file_size INTEGER,
            file_type TEXT,
            url TEXT NOT NULL,
            width INTEGER,
            height INTEGER,
            is_spoiler INTEGER DEFAULT 0,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
          )
        `);

        // Message reactions
        db.run(`
          CREATE TABLE IF NOT EXISTS reactions (
            id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            emoji TEXT NOT NULL,
            emoji_id TEXT,
            is_custom INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(message_id, user_id, emoji)
          )
        `);

        // Custom emojis
        db.run(`
          CREATE TABLE IF NOT EXISTS custom_emojis (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            animated INTEGER DEFAULT 0,
            created_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Threads
        db.run(`
          CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY,
            parent_channel_id TEXT NOT NULL,
            server_id TEXT NOT NULL,
            name TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            message_id TEXT,
            is_archived INTEGER DEFAULT 0,
            archived_at DATETIME,
            auto_archive_duration INTEGER DEFAULT 1440,
            member_count INTEGER DEFAULT 0,
            message_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
          )
        `);

        // Thread members
        db.run(`
          CREATE TABLE IF NOT EXISTS thread_members (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_read_message_id TEXT,
            FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(thread_id, user_id)
          )
        `);

        // Mentions
        db.run(`
          CREATE TABLE IF NOT EXISTS mentions (
            id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL,
            user_id TEXT,
            role_id TEXT,
            channel_id TEXT,
            is_everyone INTEGER DEFAULT 0,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
          )
        `);

        // Direct messages
        db.run(`
          CREATE TABLE IF NOT EXISTS direct_messages (
            id TEXT PRIMARY KEY,
            sender_id TEXT NOT NULL,
            receiver_id TEXT,
            group_id TEXT,
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            read_at DATETIME,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (group_id) REFERENCES group_dms(id) ON DELETE CASCADE
          )
        `);

        // Voice/video calls
        db.run(`
          CREATE TABLE IF NOT EXISTS calls (
            id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            server_id TEXT,
            started_by TEXT NOT NULL,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME,
            call_type TEXT DEFAULT 'voice' CHECK (call_type IN ('voice', 'video')),
            region TEXT DEFAULT 'us-west',
            max_participants INTEGER DEFAULT 25,
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Call participants
        db.run(`
          CREATE TABLE IF NOT EXISTS call_participants (
            id TEXT PRIMARY KEY,
            call_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            left_at DATETIME,
            is_muted INTEGER DEFAULT 0,
            is_deafened INTEGER DEFAULT 0,
            is_video_on INTEGER DEFAULT 0,
            is_screen_sharing INTEGER DEFAULT 0,
            FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(call_id, user_id)
          )
        `);

        // Audit logs
        db.run(`
          CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            action_type TEXT NOT NULL,
            target_id TEXT,
            target_type TEXT,
            changes TEXT,
            reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Events
        db.run(`
          CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            channel_id TEXT,
            name TEXT NOT NULL,
            description TEXT,
            location TEXT,
            scheduled_start DATETIME NOT NULL,
            scheduled_end DATETIME,
            creator_id TEXT NOT NULL,
            status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
            entity_type TEXT DEFAULT 'stage' CHECK (entity_type IN ('stage', 'voice', 'external')),
            subscriber_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Event subscribers
        db.run(`
          CREATE TABLE IF NOT EXISTS event_subscribers (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(event_id, user_id)
          )
        `);

        // Polls
        db.run(`
          CREATE TABLE IF NOT EXISTS polls (
            id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            question TEXT NOT NULL,
            is_multiple_choice INTEGER DEFAULT 0,
            ends_at DATETIME,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
          )
        `);

        // Poll options
        db.run(`
          CREATE TABLE IF NOT EXISTS poll_options (
            id TEXT PRIMARY KEY,
            poll_id TEXT NOT NULL,
            text TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            vote_count INTEGER DEFAULT 0,
            FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
          )
        `);

        // Poll votes
        db.run(`
          CREATE TABLE IF NOT EXISTS poll_votes (
            id TEXT PRIMARY KEY,
            poll_id TEXT NOT NULL,
            option_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
            FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(poll_id, user_id, option_id)
          )
        `);

        // Webhooks
        db.run(`
          CREATE TABLE IF NOT EXISTS webhooks (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            name TEXT NOT NULL,
            avatar TEXT,
            token TEXT UNIQUE NOT NULL,
            created_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Create indexes
        db.run('CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)');
        db.run('CREATE INDEX IF NOT EXISTS idx_dm_sender ON direct_messages(sender_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_dm_receiver ON direct_messages(receiver_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_server_members_server ON server_members(server_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_mentions_message ON mentions(message_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_audit_logs_server ON audit_logs(server_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_call_participants_call ON call_participants(call_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_threads_parent ON threads(parent_channel_id)');

        console.log('Database initialized successfully');
        resolve();
      });
    });
  });
}

function getDb() {
  return db;
}

module.exports = { initDatabase, getDb };
