import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mysql, { Pool } from 'mysql2/promise';

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatar: string;
  coverImage?: string;
  bio: string;
  role: 'super_admin' | 'admin' | 'moderator' | 'user';
  verified: boolean;
  developer?: boolean;
  status: 'active' | 'suspended' | 'banned';
  isOnline: boolean;
  lastSeen: string;
  passwordHash: string;
  passwordSalt: string;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  emailVerified: boolean;
  emailVerificationCode?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: number;
  customStatus?: string;
  chatWallpaper?: string;
  createdAt: string;
}

export interface MessageReaction {
  emoji: string;
  userId: string;
  username: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file';
  mediaUrl?: string;
  fileName?: string;
  fileSize?: string;
  audioDuration?: number; // seconds
  replyTo?: {
    id: string;
    senderName: string;
    content: string;
  };
  reactions: MessageReaction[];
  status: 'sent' | 'delivered' | 'read';
  isEdited?: boolean;
  isPinned?: boolean;
  isStarredBy?: string[]; // user IDs who starred this
  deletedFor?: string[]; // user IDs who deleted this for themselves
  isDeletedForEveryone?: boolean;
  disappearingExpiresAt?: number;
  createdAt: string;
}

export interface Chat {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  description?: string;
  avatar?: string;
  participantIds: string[];
  adminIds?: string[];
  moderatorIds?: string[];
  lastMessage?: {
    content: string;
    senderId: string;
    createdAt: string;
  };
  disappearingDuration?: number; // 0 for off, or seconds (e.g. 86400)
  wallpaper?: string;
  inviteCode?: string;
  inviteExpiresAt?: number;
  createdAt: string;
}

export interface Channel {
  id: string;
  name: string;
  handle: string;
  description: string;
  avatar: string;
  coverImage?: string;
  ownerId: string;
  verified: boolean;
  subscribersCount: number;
  subscriberIds: string[];
  createdAt: string;
}

export interface ChannelPost {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  content: string;
  mediaUrl?: string;
  likesCount: number;
  likedBy: string[];
  createdAt: string;
}

export interface StorySong {
  id: string;
  title: string;
  artist: string;
  audioUrl?: string;
  albumArt?: string;
  duration?: number;
}

export interface Story {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  type: 'text' | 'image';
  content: string;
  backgroundColor?: string;
  fontStyle?: string;
  mediaUrl?: string;
  song?: StorySong;
  viewers: { userId: string; username: string; viewedAt: string }[];
  expiresAt: number;
  createdAt: string;
}

export interface ContactRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface CallRecord {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  receiverId: string;
  receiverName: string;
  type: 'voice' | 'video';
  status: 'completed' | 'missed' | 'declined' | 'busy';
  durationSeconds: number;
  createdAt: string;
}

export interface Report {
  id: string;
  reporterId: string;
  reporterUsername: string;
  targetId: string;
  targetType: 'user' | 'message' | 'group' | 'channel';
  targetLabel: string;
  reason: string;
  details?: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
}

export interface AuditLog {
  id: string;
  adminId: string;
  adminUsername: string;
  action: string;
  target: string;
  ip: string;
  createdAt: string;
}

export interface LoginLog {
  id: string;
  emailOrUsername: string;
  status: 'success' | 'failed';
  ip: string;
  userAgent: string;
  role?: string;
  createdAt: string;
}

export interface AdminSession {
  sessionId: string;
  adminId: string;
  adminUsername: string;
  role: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface SystemSettings {
  accessPassword: string;
  registrationEnabled: boolean;
  features: {
    calling: boolean;
    geminiAi: boolean;
    stories: boolean;
    channels: boolean;
    mediaUploads: boolean;
    voiceNotes: boolean;
  };
  maintenanceMode: boolean;
  maintenanceMessage: string;
  siteSettings: {
    siteName: string;
    logoUrl: string;
    announcement: string;
  };
  aiSettings: {
    enabled: boolean;
    model: string;
    dailyLimit: number;
    systemPrompt: string;
  };
}

export interface DatabaseSchema {
  settings: SystemSettings;
  users: User[];
  chats: Chat[];
  messages: Message[];
  channels: Channel[];
  channelPosts: ChannelPost[];
  stories: Story[];
  contactRequests: ContactRequest[];
  callRecords: CallRecord[];
  reports: Report[];
  auditLogs: AuditLog[];
  loginLogs: LoginLog[];
  adminSessions: AdminSession[];
}

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data & uploads folders exist on VPS
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function getDefaultDatabase(): DatabaseSchema {
  const superAdminSalt = generateSalt();
  const superAdminHash = hashPassword('AdminPass782!', superAdminSalt);

  const users: User[] = [
    {
      id: 'usr_superadmin',
      username: 'superadmin',
      email: 'admin@stconnection.bond',
      displayName: 'ST Super Admin',
      avatar: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%230f172a'/%3E%3Cpath d='M50 22 L72 32 V52 C72 66 62 76 50 82 C38 76 28 66 28 52 V32 Z' fill='%2310b981'/%3E%3Cpath d='M44 50 L48 54 L58 44' stroke='white' stroke-width='4' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E",
      coverImage: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%230f172a'/%3E%3Cstop offset='50%25' stop-color='%23134e4a'/%3E%3Cstop offset='100%25' stop-color='%23064e3b'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23g)'/%3E%3C/svg%3E",
      bio: 'Platform founder and system administrator for ST CONNECTION.',
      role: 'super_admin',
      verified: false,
      developer: false,
      status: 'active',
      isOnline: true,
      lastSeen: new Date().toISOString(),
      passwordHash: superAdminHash,
      passwordSalt: superAdminSalt,
      twoFactorEnabled: false,
      emailVerified: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'usr_st_ai',
      username: 'st_ai',
      email: 'ai@stconnection.bond',
      displayName: 'ST AI Assistant',
      avatar: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%234338ca'/%3E%3Cpath d='M50 25 L53 43 L71 46 L53 49 L50 67 L47 49 L29 46 L47 43 Z' fill='white'/%3E%3Ccircle cx='68' cy='28' r='5' fill='%23a5b4fc'/%3E%3Ccircle cx='32' cy='68' r='4' fill='%23a5b4fc'/%3E%3C/svg%3E",
      bio: 'Official intelligent AI assistant powered by Google Gemini. Ask me anything, summarize chats, or draft messages!',
      role: 'admin',
      verified: false,
      developer: false,
      status: 'active',
      isOnline: true,
      lastSeen: new Date().toISOString(),
      passwordHash: 'bot_no_login',
      passwordSalt: 'bot_salt',
      twoFactorEnabled: false,
      emailVerified: true,
      createdAt: new Date().toISOString(),
    },
  ];

  const chats: Chat[] = [];
  const messages: Message[] = [];

  const channels: Channel[] = [
    {
      id: 'chn_official',
      name: 'ST Official Announcements',
      handle: 'st_official',
      description: 'Official announcements, feature updates, and platform notifications from the ST CONNECTION team.',
      avatar: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%23059669'/%3E%3Cpath d='M35 42 H45 L62 28 V72 L45 58 H35 Z' fill='white'/%3E%3Cpath d='M68 40 C73 45 73 55 68 60' stroke='white' stroke-width='4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E",
      coverImage: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='200'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%230f172a'/%3E%3Cstop offset='50%25' stop-color='%23047857'/%3E%3Cstop offset='100%25' stop-color='%23064e3b'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23g)'/%3E%3C/svg%3E",
      ownerId: 'usr_superadmin',
      verified: true,
      subscribersCount: 1,
      subscriberIds: ['usr_superadmin'],
      createdAt: new Date().toISOString(),
    },
  ];

  const channelPosts: ChannelPost[] = [];
  const stories: Story[] = [];
  const callRecords: CallRecord[] = [];
  const reports: Report[] = [];

  const auditLogs: AuditLog[] = [
    {
      id: `log_${Date.now()}`,
      adminId: 'usr_superadmin',
      adminUsername: 'superadmin',
      action: 'SYSTEM_BOOTSTRAP',
      target: 'ST CONNECTION Platform Initialized',
      ip: '127.0.0.1',
      createdAt: new Date().toISOString(),
    },
  ];

  const loginLogs: LoginLog[] = [];
  const adminSessions: AdminSession[] = [];

  return {
    settings: {
      accessPassword: '782223',
      registrationEnabled: true,
      features: {
        calling: true,
        geminiAi: true,
        stories: true,
        channels: true,
        mediaUploads: true,
        voiceNotes: true,
      },
      maintenanceMode: false,
      maintenanceMessage: 'ST CONNECTION is currently performing scheduled system updates. Service will resume shortly.',
      siteSettings: {
        siteName: 'ST CONNECTION',
        logoUrl: '/icon.svg',
        announcement: '🌟 Welcome to ST CONNECTION! Real-time messaging, WebRTC calling & Gemini AI are now live.',
      },
      aiSettings: {
        enabled: true,
        model: 'gemini-3.8-flash',
        dailyLimit: 150,
        systemPrompt: 'You are the ST CONNECTION AI Assistant. Provide concise, friendly, helpful answers with proper formatting. You can assist with conversation replies, technical questions, translations, summaries, and productivity.',
      },
    },
    users,
    chats,
    messages,
    channels,
    channelPosts,
    stories,
    contactRequests: [],
    callRecords,
    reports,
    auditLogs,
    loginLogs,
    adminSessions,
  };
}

class DatabaseManager {
  private data: DatabaseSchema;
  private mysqlPool: Pool | null = null;
  private isMysqlConnected: boolean = false;
  private mysqlConfig: { host: string; port: number; user: string; database: string } | null = null;
  private mysqlError: string | null = null;

  constructor() {
    this.data = this.load();
    this.initMysql().catch(err => {
      console.warn('[Pterodactyl Database] MySQL startup check:', err?.message || err);
    });
  }

  public async initMysql() {
    const host = process.env.DB_HOST || process.env.MYSQL_HOST || process.env.DATABASE_HOST;
    const port = Number(process.env.DB_PORT || process.env.MYSQL_PORT || process.env.DATABASE_PORT || 3306);
    const user = process.env.DB_USER || process.env.DB_USERNAME || process.env.MYSQL_USER;
    const password = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '';
    const database = process.env.DB_NAME || process.env.DB_DATABASE || process.env.MYSQL_DATABASE;
    const connectionUri = process.env.DATABASE_URL;

    if (!host && !connectionUri) {
      console.log('[Pterodactyl Database] No MySQL environment variables (DB_HOST/DATABASE_URL) detected. Running on local database (data/database.json).');
      return;
    }

    try {
      if (connectionUri) {
        this.mysqlPool = mysql.createPool({
          uri: connectionUri,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
        });
      } else if (host && user && database) {
        this.mysqlConfig = { host, port, user, database };
        this.mysqlPool = mysql.createPool({
          host,
          port,
          user,
          password,
          database,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
        });
      } else {
        return;
      }

      // Test connection
      const connection = await this.mysqlPool.getConnection();
      connection.release();

      // Ensure storage table exists in Pterodactyl MySQL
      await this.mysqlPool.execute(`
        CREATE TABLE IF NOT EXISTS st_storage (
          storage_key VARCHAR(64) PRIMARY KEY,
          storage_data LONGTEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      this.isMysqlConnected = true;
      this.mysqlError = null;
      console.log(`[Pterodactyl Database] ✅ Successfully connected to Pterodactyl MySQL database '${database || 'custom'}' at ${host}:${port}!`);

      // Hydrate state from MySQL if data already exists
      const [rows] = await this.mysqlPool.execute<any[]>(
        `SELECT storage_data FROM st_storage WHERE storage_key = 'main_database' LIMIT 1;`
      );

      if (rows && rows.length > 0 && rows[0].storage_data) {
        try {
          const parsed = JSON.parse(rows[0].storage_data);
          if (parsed && parsed.settings && parsed.users) {
            this.data = parsed;
            try {
              fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
            } catch {}
            console.log(`[Pterodactyl Database] Synced ${this.data.users.length} users and ${this.data.messages.length} messages from Pterodactyl MySQL.`);
          }
        } catch (e) {
          console.error('[Pterodactyl Database] Error parsing MySQL data:', e);
        }
      } else {
        // Initial seed into MySQL
        await this.syncToMysql();
      }
    } catch (err: any) {
      this.mysqlError = err?.message || 'Connection failed';
      this.isMysqlConnected = false;
      console.warn(`[Pterodactyl Database] Could not connect to MySQL at ${host || 'endpoint'}: ${err?.message}. Active fallback: local persistent database.`);
    }
  }

  private saveTimer: NodeJS.Timeout | null = null;
  private mysqlSyncTimer: NodeJS.Timeout | null = null;
  private isSavingFile: boolean = false;
  private pendingFileWrite: boolean = false;

  public async syncToMysql() {
    if (!this.mysqlPool || !this.isMysqlConnected) return;
    try {
      const json = JSON.stringify(this.data);
      await this.mysqlPool.execute(
        `REPLACE INTO st_storage (storage_key, storage_data) VALUES ('main_database', ?)`,
        [json]
      );
    } catch (err) {
      console.error('[Pterodactyl Database] Error syncing state to MySQL:', err);
    }
  }

  private triggerDebouncedMysqlSync() {
    if (!this.mysqlPool || !this.isMysqlConnected) return;
    if (this.mysqlSyncTimer) return; // already scheduled
    this.mysqlSyncTimer = setTimeout(() => {
      this.mysqlSyncTimer = null;
      this.syncToMysql().catch(() => {});
    }, 400);
  }

  private triggerDebouncedFileWrite() {
    if (this.saveTimer) return; // write already scheduled
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      if (this.isSavingFile) {
        this.pendingFileWrite = true;
        return;
      }
      this.isSavingFile = true;
      try {
        const json = JSON.stringify(this.data);
        await fs.promises.writeFile(DB_FILE, json, 'utf-8');
      } catch (err) {
        console.error('Failed to write database file asynchronously:', err);
      } finally {
        this.isSavingFile = false;
        if (this.pendingFileWrite) {
          this.pendingFileWrite = false;
          this.triggerDebouncedFileWrite();
        }
      }
    }, 50);
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.settings && parsed.users) {
          const fakeUserIds = ['usr_alex', 'usr_sarah', 'usr_david'];
          const hadFakeUsers = parsed.users.some((u: any) => fakeUserIds.includes(u.id));
          if (hadFakeUsers) {
            parsed.users = parsed.users.filter((u: any) => !fakeUserIds.includes(u.id));
            parsed.chats = (parsed.chats || []).filter((c: any) => !['chat_group_devs'].includes(c.id) && !c.participantIds?.some((p: string) => fakeUserIds.includes(p)));
            parsed.messages = (parsed.messages || []).filter((m: any) => !fakeUserIds.includes(m.senderId) && !['msg_1', 'msg_2', 'msg_3', 'msg_grp_1'].includes(m.id));
            parsed.channels = (parsed.channels || []).filter((ch: any) => !['chn_tech'].includes(ch.id));
            parsed.channelPosts = (parsed.channelPosts || []).filter((cp: any) => !['chn_tech'].includes(cp.channelId));
            parsed.stories = (parsed.stories || []).filter((s: any) => !fakeUserIds.includes(s.userId));
            parsed.callRecords = (parsed.callRecords || []).filter((cr: any) => !fakeUserIds.includes(cr.callerId) && !fakeUserIds.includes(cr.receiverId));
            parsed.reports = (parsed.reports || []).filter((r: any) => !fakeUserIds.includes(r.reporterId) && !fakeUserIds.includes(r.targetId));
            this.data = parsed;
            this.save();
          }
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Failed to load database.json, re-initializing defaults:', err);
    }
    const def = getDefaultDatabase();
    this.save(def);
    return def;
  }

  public save(dataToSave?: DatabaseSchema) {
    if (dataToSave) {
      this.data = dataToSave;
    }
    // High-performance asynchronous non-blocking write
    this.triggerDebouncedFileWrite();
    this.triggerDebouncedMysqlSync();
  }

  public flushSync() {
    try {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data), 'utf-8');
    } catch (e) {
      console.error('Error during flushSync:', e);
    }
  }

  public get(): DatabaseSchema {
    return this.data;
  }

  public update(updater: (data: DatabaseSchema) => void) {
    updater(this.data);
    this.save();
  }

  public resetToDefault() {
    const fresh = getDefaultDatabase();
    this.data = fresh;
    this.save();
    return this.data;
  }

  public getVpsStorageStats() {
    let databaseSizeBytes = 0;
    let uploadsCount = 0;
    let uploadsSizeBytes = 0;

    try {
      if (fs.existsSync(DB_FILE)) {
        databaseSizeBytes = fs.statSync(DB_FILE).size;
      }
    } catch {}

    try {
      if (fs.existsSync(UPLOADS_DIR)) {
        const files = fs.readdirSync(UPLOADS_DIR);
        for (const f of files) {
          try {
            const st = fs.statSync(path.join(UPLOADS_DIR, f));
            if (st.isFile()) {
              uploadsCount++;
              uploadsSizeBytes += st.size;
            }
          } catch {}
        }
      }
    } catch {}

    return {
      dataDir: DATA_DIR,
      uploadsDir: UPLOADS_DIR,
      databaseSizeBytes,
      uploadsCount,
      uploadsSizeBytes,
      totalVpsBytes: databaseSizeBytes + uploadsSizeBytes,
    };
  }

  public getDatabaseInfo() {
    const vpsStats = this.getVpsStorageStats();
    return {
      type: this.isMysqlConnected ? 'Pterodactyl MySQL + VPS Disk Media' : 'VPS Persistent Storage (JSON + Disk Media)',
      connected: this.isMysqlConnected,
      host: this.mysqlConfig?.host || (process.env.DB_HOST ? `${process.env.DB_HOST}:${process.env.DB_PORT || 3306}` : 'localhost (VPS disk)'),
      database: this.mysqlConfig?.database || process.env.DB_NAME || DB_FILE,
      user: this.mysqlConfig?.user || process.env.DB_USER || 'vps-local',
      error: this.mysqlError,
      vpsStorage: vpsStats,
    };
  }
}

export const db = new DatabaseManager();

// Ensure pending writes are flushed on server shutdown
process.on('SIGINT', () => {
  db.flushSync();
});
process.on('SIGTERM', () => {
  db.flushSync();
});
process.on('beforeExit', () => {
  db.flushSync();
});
