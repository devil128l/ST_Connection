-- ====================================================================
-- ST CONNECTION – SQLite Database Schema
-- Compatible with SQLite3 / Node.js
-- ====================================================================

-- 1. SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  access_password TEXT NOT NULL DEFAULT '782223',
  registration_enabled INTEGER NOT NULL DEFAULT 1,
  maintenance_mode INTEGER NOT NULL DEFAULT 0,
  maintenance_message TEXT NOT NULL DEFAULT 'ST CONNECTION is currently performing scheduled system updates. Service will resume shortly.',
  features_calling INTEGER NOT NULL DEFAULT 1,
  features_gemini_ai INTEGER NOT NULL DEFAULT 1,
  features_stories INTEGER NOT NULL DEFAULT 1,
  features_channels INTEGER NOT NULL DEFAULT 1,
  features_media_uploads INTEGER NOT NULL DEFAULT 1,
  features_voice_notes INTEGER NOT NULL DEFAULT 1,
  site_name TEXT NOT NULL DEFAULT 'ST CONNECTION',
  logo_url TEXT NOT NULL DEFAULT '/icon.svg',
  announcement TEXT NOT NULL DEFAULT 'Welcome to ST CONNECTION! Real-time messaging, WebRTC calling & Gemini AI are now live.',
  ai_enabled INTEGER NOT NULL DEFAULT 1,
  ai_model TEXT NOT NULL DEFAULT 'gemini-3.8-flash',
  ai_daily_limit INTEGER NOT NULL DEFAULT 150,
  ai_system_prompt TEXT NOT NULL DEFAULT 'You are the ST CONNECTION AI Assistant. Provide concise, friendly, helpful answers with proper formatting.',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. USERS
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  cover_image TEXT,
  bio TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'moderator', 'admin', 'super_admin')),
  verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'banned')),
  is_online INTEGER NOT NULL DEFAULT 0,
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  two_factor_enabled INTEGER NOT NULL DEFAULT 0,
  two_factor_secret TEXT,
  email_verified INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 3. CHATS
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
  name TEXT,
  avatar TEXT,
  description TEXT,
  created_by TEXT,
  is_announcement_group INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. CHAT PARTICIPANTS
CREATE TABLE IF NOT EXISTS chat_participants (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'admin', 'owner')),
  unread_count INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, user_id),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id);

-- 5. MESSAGES
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('text', 'image', 'video', 'audio', 'document', 'system')),
  media_url TEXT,
  media_name TEXT,
  media_size INTEGER,
  media_mime TEXT,
  reply_to_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('sending', 'sent', 'delivered', 'read')),
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  is_edited INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  disappears_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- 6. MESSAGE REACTIONS
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (message_id, user_id, emoji),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 7. CHANNELS (Broadcast Channels)
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  description TEXT,
  avatar TEXT NOT NULL,
  cover_image TEXT,
  owner_id TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  subscribers_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_channels_handle ON channels(handle);

-- 8. CHANNEL SUBSCRIBERS
CREATE TABLE IF NOT EXISTS channel_subscribers (
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (channel_id, user_id),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 9. CHANNEL POSTS
CREATE TABLE IF NOT EXISTS channel_posts (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  text TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT CHECK(media_type IN ('image', 'video', 'document')),
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_channel_posts_channel ON channel_posts(channel_id, created_at);

-- 10. 24-HOUR STORIES
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('text', 'image', 'video')),
  content TEXT NOT NULL,
  media_url TEXT,
  background_gradient TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at);

-- 11. STORY VIEWERS
CREATE TABLE IF NOT EXISTS story_viewers (
  story_id TEXT NOT NULL,
  viewer_id TEXT NOT NULL,
  viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (story_id, viewer_id),
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 12. CONTACT REQUESTS
CREATE TABLE IF NOT EXISTS contact_requests (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'blocked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_requests_pair ON contact_requests(sender_id, receiver_id);

-- 13. CALL RECORDS
CREATE TABLE IF NOT EXISTS call_records (
  id TEXT PRIMARY KEY,
  caller_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  chat_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('audio', 'video')),
  status TEXT NOT NULL CHECK(status IN ('completed', 'missed', 'rejected', 'busy', 'failed')),
  duration INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_call_records_users ON call_records(caller_id, receiver_id);

-- 14. USER REPORTS
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('user', 'message', 'channel', 'group')),
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  action_taken TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- 15. AUDIT & SECURITY LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  admin_username TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  ip TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ====================================================================
-- INITIAL SEED DATA (Only Real Admin, AI Assistant & Official Channel)
-- ====================================================================

-- Default Settings
INSERT OR IGNORE INTO system_settings (id, access_password) VALUES (1, '782223');

-- Real Super Admin (password: AdminPass782!)
INSERT OR IGNORE INTO users (
  id, username, email, display_name, avatar, cover_image, bio, role, verified, status, is_online,
  password_hash, password_salt, two_factor_enabled, email_verified, created_at
) VALUES (
  'usr_superadmin',
  'superadmin',
  'admin@stconnection.bond',
  'ST Super Admin',
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%230f172a'/%3E%3Cpath d='M50 22 L72 32 V52 C72 66 62 76 50 82 C38 76 28 66 28 52 V32 Z' fill='%2310b981'/%3E%3Cpath d='M44 50 L48 54 L58 44' stroke='white' stroke-width='4' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%230f172a'/%3E%3Cstop offset='50%25' stop-color='%23134e4a'/%3E%3Cstop offset='100%25' stop-color='%23064e3b'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23g)'/%3E%3C/svg%3E",
  'Platform founder and system administrator for ST CONNECTION.',
  'super_admin',
  1,
  'active',
  1,
  '51fd9cb2707e17323c109455bbc9921b15f0dba7e7ce6a2e5fc4fe81cb52bebacfa430948dd4a9e457d28bfb057dfee3af30dc029cd757b4669e33082fcf56ca',
  '6d58c7d6413857dec287d533a51b550a',
  0,
  1,
  datetime('now')
);

-- Real ST AI Assistant Bot
INSERT OR IGNORE INTO users (
  id, username, email, display_name, avatar, bio, role, verified, status, is_online,
  password_hash, password_salt, two_factor_enabled, email_verified, created_at
) VALUES (
  'usr_st_ai',
  'st_ai',
  'ai@stconnection.bond',
  'ST AI Assistant',
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%234338ca'/%3E%3Cpath d='M50 25 L53 43 L71 46 L53 49 L50 67 L47 49 L29 46 L47 43 Z' fill='white'/%3E%3Ccircle cx='68' cy='28' r='5' fill='%23a5b4fc'/%3E%3Ccircle cx='32' cy='68' r='4' fill='%23a5b4fc'/%3E%3C/svg%3E",
  'Official intelligent AI assistant powered by Google Gemini. Ask me anything, summarize chats, or draft messages!',
  'admin',
  1,
  'active',
  1,
  'bot_no_login',
  'bot_salt',
  0,
  1,
  datetime('now')
);

-- Official Announcement Channel
INSERT OR IGNORE INTO channels (
  id, name, handle, description, avatar, cover_image, owner_id, verified, subscribers_count, created_at
) VALUES (
  'chn_official',
  'ST Official Announcements',
  'st_official',
  'Official announcements, feature updates, and platform notifications from the ST CONNECTION team.',
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%23059669'/%3E%3Cpath d='M35 42 H45 L62 28 V72 L45 58 H35 Z' fill='white'/%3E%3Cpath d='M68 40 C73 45 73 55 68 60' stroke='white' stroke-width='4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%230f172a'/%3E%3Cstop offset='50%25' stop-color='%23047857'/%3E%3Cstop offset='100%25' stop-color='%23064e3b'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23g)'/%3E%3C/svg%3E",
  'usr_superadmin',
  1,
  1,
  datetime('now')
);

INSERT OR IGNORE INTO channel_subscribers (channel_id, user_id, joined_at)
VALUES ('chn_official', 'usr_superadmin', datetime('now'));
