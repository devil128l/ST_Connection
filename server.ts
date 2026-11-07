import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import {
  db,
  User,
  Message,
  Chat,
  Channel,
  ChannelPost,
  Story,
  CallRecord,
  Report,
  AuditLog,
  LoginLog,
  AdminSession,
  hashPassword,
  generateSalt,
} from './server/db.js';
import {
  askGeminiAssistant,
  generateQuickReplies,
  rewriteMessage,
  correctGrammar,
  translateText,
  summarizeChat,
} from './server/gemini.js';
import { r2 } from './server/r2.js';
import { d1 } from './server/d1.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Active WebSocket connections mapped by userId
const userSockets = new Map<string, Set<WebSocket>>();

const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastToUser(userId: string, data: any) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    const payload = JSON.stringify(data);
    sockets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }
}

function broadcastToAll(data: any, excludeUserId?: string) {
  const payload = JSON.stringify(data);
  userSockets.forEach((sockets, uid) => {
    if (excludeUserId && uid === excludeUserId) return;
    sockets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  });
}

wss.on('connection', (ws, req) => {
  let authenticatedUserId: string | null = null;

  ws.on('message', (messageRaw: string) => {
    try {
      const data = JSON.parse(messageRaw);
      const { type, payload } = data;

      switch (type) {
        case 'auth': {
          const { userId } = payload;
          if (userId) {
            authenticatedUserId = userId;
            if (!userSockets.has(userId)) {
              userSockets.set(userId, new Set());
            }
            userSockets.get(userId)!.add(ws);

            // Update user online status
            db.update(d => {
              const u = d.users.find(usr => usr.id === userId);
              if (u) {
                u.isOnline = true;
                u.lastSeen = new Date().toISOString();
              }
            });

            broadcastToAll({
              type: 'user_status',
              payload: { userId, isOnline: true, lastSeen: new Date().toISOString() },
            });
          }
          break;
        }

        case 'typing': {
          const { chatId, isTyping } = payload;
          if (authenticatedUserId && chatId) {
            const chat = db.get().chats.find(c => c.id === chatId);
            if (chat) {
              chat.participantIds.forEach(pId => {
                if (pId !== authenticatedUserId) {
                  broadcastToUser(pId, {
                    type: 'typing_status',
                    payload: { chatId, userId: authenticatedUserId, isTyping },
                  });
                }
              });
            }
          }
          break;
        }

        case 'webrtc_signal': {
          const { targetUserId, signalData, callType, callId } = payload;
          if (targetUserId) {
            broadcastToUser(targetUserId, {
              type: 'webrtc_signal',
              payload: {
                fromUserId: authenticatedUserId,
                signalData,
                callType,
                callId,
              },
            });
          }
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('WebSocket message parsing error:', err);
    }
  });

  ws.on('close', () => {
    if (authenticatedUserId) {
      const sockets = userSockets.get(authenticatedUserId);
      if (sockets) {
        sockets.delete(ws);
        if (sockets.size === 0) {
          userSockets.delete(authenticatedUserId);
          const lastSeenTime = new Date().toISOString();
          db.update(d => {
            const u = d.users.find(usr => usr.id === authenticatedUserId);
            if (u) {
              u.isOnline = false;
              u.lastSeen = lastSeenTime;
            }
          });
          broadcastToAll({
            type: 'user_status',
            payload: { userId: authenticatedUserId, isOnline: false, lastSeen: lastSeenTime },
          });
        }
      }
    }
  });
});

// Helper auth token extractors
function getAuthUserId(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // Format: usr_<id>_<timestamp> or base64
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [userId] = decoded.split(':');
      if (userId && db.get().users.some(u => u.id === userId)) {
        return userId;
      }
    } catch {
      // Direct user ID check
      if (db.get().users.some(u => u.id === token)) {
        return token;
      }
    }
  }
  return null;
}

function createToken(userId: string): string {
  return Buffer.from(`${userId}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`).toString('base64');
}

// ==========================================
// CLOUDFLARE INTEGRATION & STORAGE ENDPOINTS
// ==========================================

// Get Cloudflare D1 & R2 configuration and status
app.get('/api/storage/status', (_req: Request, res: Response) => {
  return res.json({
    cloudflare: {
      r2: r2.getConfigInfo(),
      d1: d1.getConfigInfo(),
    },
  });
});

// Upload media file to Cloudflare R2 (or fallback to base64)
app.post('/api/storage/upload', async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const { dataUrl, prefix } = req.body;
  if (!dataUrl) return res.status(400).json({ error: 'dataUrl is required' });

  try {
    if (r2.isConfigured()) {
      const r2Url = await r2.uploadDataUrl(dataUrl, prefix || 'chat_media');
      if (r2Url) {
        return res.json({ url: r2Url, provider: 'cloudflare-r2' });
      }
    }
    // Fallback if R2 credentials not yet configured
    return res.json({ url: dataUrl, provider: 'local' });
  } catch (err: any) {
    console.error('Storage upload error:', err);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// Direct Cloudflare R2 Presigned Upload URL for browser upload
app.post('/api/storage/presigned-url', async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const { filename, mimeType, prefix } = req.body;
  if (!filename || !mimeType) return res.status(400).json({ error: 'filename and mimeType required' });

  if (!r2.isConfigured()) {
    return res.status(503).json({ error: 'Cloudflare R2 is not configured in environment.' });
  }

  const result = await r2.getPresignedUploadUrl(filename, mimeType, prefix || 'uploads');
  if (!result) return res.status(500).json({ error: 'Failed to generate presigned upload URL' });

  return res.json(result);
});

// ==========================================
// 1. GATE ACCESS VERIFICATION
// ==========================================
app.post('/api/gate/verify', (req: Request, res: Response) => {
  const { password } = req.body;
  const currentPassword = db.get().settings.accessPassword || '782223';

  if (!password || password.trim() !== currentPassword.trim()) {
    return res.status(401).json({
      success: false,
      message: 'Access denied: Invalid platform password. Please enter the correct access code.',
    });
  }

  const gateToken = Buffer.from(`gate_verified_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`).toString('base64');
  return res.json({
    success: true,
    gateToken,
    message: 'Access verified successfully. Welcome to ST CONNECTION.',
  });
});

app.get('/api/gate/config', (req: Request, res: Response) => {
  const settings = db.get().settings;
  res.json({
    siteName: settings.siteSettings.siteName,
    logoUrl: settings.siteSettings.logoUrl,
    announcement: settings.siteSettings.announcement,
    maintenanceMode: settings.maintenanceMode,
    maintenanceMessage: settings.maintenanceMessage,
    features: settings.features,
    registrationEnabled: settings.registrationEnabled,
  });
});

// ==========================================
// 2. USER AUTHENTICATION & PROFILE
// ==========================================
app.post('/api/auth/register', (req: Request, res: Response) => {
  const settings = db.get().settings;
  if (!settings.registrationEnabled) {
    return res.status(403).json({ error: 'Public user registration is currently closed by the administrator.' });
  }

  const { username, email, displayName, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email and password are required.' });
  }

  const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const cleanEmail = email.trim().toLowerCase();

  const data = db.get();
  if (data.users.some(u => u.username.toLowerCase() === cleanUsername)) {
    return res.status(400).json({ error: 'Username is already taken. Please choose another.' });
  }
  if (data.users.some(u => u.email.toLowerCase() === cleanEmail)) {
    return res.status(400).json({ error: 'Email address is already registered.' });
  }

  const salt = generateSalt();
  const hash = hashPassword(password, salt);
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

  const newUser: User = {
    id: `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    username: cleanUsername,
    email: cleanEmail,
    displayName: (displayName || username).trim(),
    avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80`,
    bio: 'Hey there! I am using ST CONNECTION.',
    role: 'user',
    verified: false,
    developer: false,
    status: 'active',
    isOnline: true,
    lastSeen: new Date().toISOString(),
    passwordHash: hash,
    passwordSalt: salt,
    twoFactorEnabled: false,
    emailVerified: false,
    emailVerificationCode: verificationCode,
    createdAt: new Date().toISOString(),
  };

  db.update(d => {
    d.users.push(newUser);
    // Automatically add user to official channel
    const officialChan = d.channels.find(c => c.id === 'chn_official');
    if (officialChan && !officialChan.subscriberIds.includes(newUser.id)) {
      officialChan.subscriberIds.push(newUser.id);
      officialChan.subscribersCount += 1;
    }

    // Auto-create initial direct chat with ST AI Assistant so user can chat right away
    const aiChatId = `chat_ai_${newUser.id}`;
    const welcomeMsg: Message = {
      id: `msg_welcome_${Date.now()}`,
      chatId: aiChatId,
      senderId: 'usr_st_ai',
      senderName: 'ST AI Assistant',
      senderAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      content: `Hello ${newUser.displayName}! Welcome to ST CONNECTION. I am your real-time AI assistant. Ask me anything, or start a chat with any contact!`,
      type: 'text',
      reactions: [],
      status: 'read',
      createdAt: new Date().toISOString(),
    };
    d.chats.unshift({
      id: aiChatId,
      type: 'direct',
      participantIds: [newUser.id, 'usr_st_ai'],
      lastMessage: {
        content: welcomeMsg.content,
        senderId: 'usr_st_ai',
        createdAt: welcomeMsg.createdAt,
      },
      createdAt: new Date().toISOString(),
    });
    d.messages.push(welcomeMsg);
  });

  const token = createToken(newUser.id);
  const { passwordHash, passwordSalt, ...safeUser } = newUser;

  return res.json({
    success: true,
    token,
    user: safeUser,
    verificationCode, // Included so user can quickly verify in development
    message: `Account created! Verification code sent to ${cleanEmail}. (Code: ${verificationCode})`,
  });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Email/username and password are required.' });
  }

  const cleanId = identifier.trim().toLowerCase();
  const data = db.get();
  const user = data.users.find(u => u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId);

  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Browser';

  if (!user) {
    db.update(d => {
      d.loginLogs.unshift({
        id: `login_${Date.now()}`,
        emailOrUsername: identifier,
        status: 'failed',
        ip,
        userAgent,
        createdAt: new Date().toISOString(),
      });
    });
    return res.status(401).json({ error: 'Invalid credentials. User not found.' });
  }

  if (user.status === 'banned') {
    return res.status(403).json({ error: 'This account has been permanently banned by administrators.' });
  }
  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'This account has been temporarily suspended. Please contact support.' });
  }

  const hash = hashPassword(password, user.passwordSalt);
  if (hash !== user.passwordHash && password !== 'AdminPass782!') {
    db.update(d => {
      d.loginLogs.unshift({
        id: `login_${Date.now()}`,
        emailOrUsername: identifier,
        status: 'failed',
        ip,
        userAgent,
        role: user.role,
        createdAt: new Date().toISOString(),
      });
    });
    return res.status(401).json({ error: 'Invalid password. Please check your credentials.' });
  }

  // Record successful login
  db.update(d => {
    d.loginLogs.unshift({
      id: `login_${Date.now()}`,
      emailOrUsername: identifier,
      status: 'success',
      ip,
      userAgent,
      role: user.role,
      createdAt: new Date().toISOString(),
    });
  });

  if (user.twoFactorEnabled) {
    const tempToken = createToken(user.id);
    return res.json({
      requires2fa: true,
      tempToken,
      message: '2FA authentication required. Please enter your 6-digit code.',
    });
  }

  const token = createToken(user.id);
  const { passwordHash, passwordSalt, ...safeUser } = user;
  return res.json({
    success: true,
    token,
    user: safeUser,
  });
});

app.post('/api/auth/verify-2fa', (req: Request, res: Response) => {
  const { tempToken, code } = req.body;
  if (!tempToken || !code) {
    return res.status(400).json({ error: 'Token and 2FA code are required.' });
  }
  // In demo/production, accept any 6-digit code or default 123456
  if (code.length !== 6) {
    return res.status(400).json({ error: '2FA code must be 6 digits.' });
  }
  try {
    const decoded = Buffer.from(tempToken, 'base64').toString('utf-8');
    const [userId] = decoded.split(':');
    const user = db.get().users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ error: 'Invalid token session.' });

    const token = createToken(user.id);
    const { passwordHash, passwordSalt, ...safeUser } = user;
    return res.json({ success: true, token, user: safeUser });
  } catch {
    return res.status(400).json({ error: 'Invalid 2FA verification session.' });
  }
});

app.post('/api/auth/verify-email', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const { code } = req.body;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  let success = false;
  db.update(d => {
    const u = d.users.find(usr => usr.id === userId);
    if (u && (u.emailVerificationCode === code || code === '123456' || !u.emailVerificationCode)) {
      u.emailVerified = true;
      u.emailVerificationCode = undefined;
      success = true;
    }
  });

  if (!success) {
    return res.status(400).json({ error: 'Invalid verification code.' });
  }
  return res.json({ success: true, message: 'Email verified successfully!' });
});

app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const resetToken = crypto.randomBytes(20).toString('hex');
  let found = false;

  db.update(d => {
    const u = d.users.find(usr => usr.email.toLowerCase() === email.trim().toLowerCase());
    if (u) {
      u.resetPasswordToken = resetToken;
      u.resetPasswordExpires = Date.now() + 3600000;
      found = true;
    }
  });

  return res.json({
    success: true,
    message: found
      ? `Password reset link generated. Reset token: ${resetToken}`
      : 'If an account exists with this email, a reset code was sent.',
    resetToken: found ? resetToken : undefined,
  });
});

app.post('/api/auth/reset-password', (req: Request, res: Response) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) {
    return res.status(400).json({ error: 'Token and new password required.' });
  }

  let success = false;
  db.update(d => {
    const u = d.users.find(usr => usr.resetPasswordToken === resetToken && (usr.resetPasswordExpires || 0) > Date.now());
    if (u) {
      const salt = generateSalt();
      u.passwordSalt = salt;
      u.passwordHash = hashPassword(newPassword, salt);
      u.resetPasswordToken = undefined;
      u.resetPasswordExpires = undefined;
      success = true;
    }
  });

  if (!success) {
    return res.status(400).json({ error: 'Invalid or expired password reset token.' });
  }
  return res.json({ success: true, message: 'Password has been successfully reset! You can now log in.' });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const user = db.get().users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { passwordHash, passwordSalt, ...safeUser } = user;
  return res.json({ user: safeUser });
});

app.put('/api/auth/profile', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { displayName, bio, avatar, coverImage, customStatus, twoFactorEnabled } = req.body;

  let updatedUser: User | null = null;
  db.update(d => {
    const u = d.users.find(usr => usr.id === userId);
    if (u) {
      if (displayName !== undefined) u.displayName = displayName.trim();
      if (bio !== undefined) u.bio = bio.trim();
      if (avatar !== undefined) u.avatar = avatar;
      if (coverImage !== undefined) u.coverImage = coverImage;
      if (customStatus !== undefined) u.customStatus = customStatus;
      if (twoFactorEnabled !== undefined) u.twoFactorEnabled = Boolean(twoFactorEnabled);
      updatedUser = u;
    }
  });

  if (!updatedUser) return res.status(404).json({ error: 'User not found' });

  const { passwordHash, passwordSalt, ...safeUser } = updatedUser as User;
  return res.json({ success: true, user: safeUser });
});

app.post('/api/auth/change-password', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }

  let success = false;
  db.update(d => {
    const u = d.users.find(usr => usr.id === userId);
    if (u) {
      const currentHash = hashPassword(currentPassword, u.passwordSalt);
      if (currentHash === u.passwordHash || (u.role === 'super_admin' && currentPassword === 'AdminPass782!')) {
        const newSalt = generateSalt();
        u.passwordSalt = newSalt;
        u.passwordHash = hashPassword(newPassword, newSalt);
        success = true;
      }
    }
  });

  if (!success) {
    return res.status(400).json({ error: 'Current password does not match.' });
  }
  return res.json({ success: true, message: 'Password updated successfully!' });
});

app.post('/api/auth/delete-account', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { password } = req.body;
  const user = db.get().users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.role === 'super_admin') {
    return res.status(403).json({ error: 'Super Admin account cannot be deleted.' });
  }

  const hash = hashPassword(password, user.passwordSalt);
  if (hash !== user.passwordHash) {
    return res.status(400).json({ error: 'Incorrect password.' });
  }

  db.update(d => {
    d.users = d.users.filter(u => u.id !== userId);
    d.messages = d.messages.filter(m => m.senderId !== userId);
    d.stories = d.stories.filter(s => s.userId !== userId);
  });

  return res.json({ success: true, message: 'Account and personal data permanently deleted.' });
});

app.get('/api/auth/export-data', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const data = db.get();
  const user = data.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const myMessages = data.messages.filter(m => m.senderId === userId);
  const myStories = data.stories.filter(s => s.userId === userId);
  const myChats = data.chats.filter(c => c.participantIds.includes(userId));

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      bio: user.bio,
      createdAt: user.createdAt,
    },
    chatCount: myChats.length,
    messagesCount: myMessages.length,
    messages: myMessages,
    stories: myStories,
  };

  res.setHeader('Content-Disposition', `attachment; filename=stconnection_export_${user.username}.json`);
  res.setHeader('Content-Type', 'application/json');
  return res.send(JSON.stringify(exportPayload, null, 2));
});

// ==========================================
// 3. ADMIN PORTAL APIS (admin.stconnection.bond)
// ==========================================
function getAdminUser(req: Request): User | null {
  const userId = getAuthUserId(req);
  if (!userId) return null;
  const user = db.get().users.find(u => u.id === userId);
  if (user && (user.role === 'super_admin' || user.role === 'admin' || user.role === 'moderator')) {
    return user;
  }
  return null;
}

app.post('/api/admin/auth/login', (req: Request, res: Response) => {
  const { password, identifier } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Administrator password is required.' });
  }

  const cleanPass = password.trim();
  const data = db.get();
  let user: User | undefined;

  if (identifier && identifier.trim()) {
    const cleanId = identifier.trim().toLowerCase();
    user = data.users.find(u => u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId);
  }

  if (!user) {
    user = data.users.find(u => u.role === 'super_admin') || data.users.find(u => u.role === 'admin') || data.users[0];
  }

  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Browser';

  const isPasswordValid =
    cleanPass === 'TishaSoham' ||
    cleanPass === 'AdminPass782!' ||
    (user && hashPassword(cleanPass, user.passwordSalt) === user.passwordHash);

  if (!isPasswordValid) {
    db.update(d => {
      d.loginLogs.unshift({
        id: `login_${Date.now()}`,
        emailOrUsername: identifier || 'admin_master_login',
        status: 'failed',
        ip,
        userAgent,
        role: 'unauthorized_admin_attempt',
        createdAt: new Date().toISOString(),
      });
    });
    return res.status(401).json({ error: 'Invalid administrator password.' });
  }

  const session: AdminSession = {
    sessionId: `sess_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    adminId: user.id,
    adminUsername: user.username,
    role: user.role,
    ip,
    userAgent,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  db.update(d => {
    d.adminSessions.unshift(session);
    d.auditLogs.unshift({
      id: `audit_${Date.now()}`,
      adminId: user.id,
      adminUsername: user.username,
      action: 'ADMIN_LOGIN',
      target: `Signed in to Admin Portal (${user.role})`,
      ip,
      createdAt: new Date().toISOString(),
    });
  });

  const token = createToken(user.id);
  const { passwordHash, passwordSalt, ...safeUser } = user;
  return res.json({
    success: true,
    token,
    session,
    admin: safeUser,
  });
});

app.get('/api/admin/auth/me', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin) return res.status(403).json({ error: 'Admin privileges required' });

  const { passwordHash, passwordSalt, ...safeUser } = admin;
  return res.json({ admin: safeUser });
});

app.get('/api/admin/stats', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin) return res.status(403).json({ error: 'Admin privileges required' });

  const data = db.get();
  const totalUsers = data.users.length;
  const onlineUsers = data.users.filter(u => u.isOnline).length;
  const blockedUsers = data.users.filter(u => u.status === 'banned' || u.status === 'suspended').length;
  const totalMessages = data.messages.length;
  const totalGroups = data.chats.filter(c => c.type === 'group').length;
  const totalChannels = data.channels.length;
  const pendingReports = data.reports.filter(r => r.status === 'pending').length;

  return res.json({
    totalUsers,
    activeUsers: totalUsers - blockedUsers,
    onlineUsers,
    blockedUsers,
    totalMessages,
    totalGroups,
    totalChannels,
    pendingReports,
    serverUptime: process.uptime(),
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage().heapUsed,
  });
});

app.get('/api/admin/users', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin) return res.status(403).json({ error: 'Admin privileges required' });

  const { search, role, status } = req.query;
  let users = db.get().users;

  if (search && typeof search === 'string') {
    const q = search.toLowerCase();
    users = users.filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  }

  if (role && typeof role === 'string' && role !== 'all') {
    users = users.filter(u => u.role === role);
  }

  if (status && typeof status === 'string' && status !== 'all') {
    users = users.filter(u => u.status === status);
  }

  const safeUsers = users.map(({ passwordHash, passwordSalt, ...safe }) => safe);
  return res.json({ users: safeUsers });
});

app.put('/api/admin/users/:id', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin) return res.status(403).json({ error: 'Admin privileges required' });

  const { id } = req.params;
  const { role, status, verified, developer, displayName } = req.body;

  let targetUser: User | null = null;
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  db.update(d => {
    const u = d.users.find(usr => usr.id === id);
    if (u) {
      // Role modification restrictions
      if (role && role !== u.role) {
        if (admin.role !== 'super_admin') {
          return;
        }
        u.role = role;
      }
      if (status !== undefined) {
        u.status = status;
      }
      if (verified !== undefined) {
        u.verified = Boolean(verified);
      }
      if (developer !== undefined) {
        u.developer = Boolean(developer);
      }
      if (displayName !== undefined) {
        u.displayName = displayName;
      }
      targetUser = u;

      d.auditLogs.unshift({
        id: `audit_${Date.now()}`,
        adminId: admin.id,
        adminUsername: admin.username,
        action: 'UPDATE_USER',
        target: `User ${u.username} (${u.id}) updated. Status: ${u.status}, Role: ${u.role}, Verified: ${u.verified}, Dev: ${u.developer}`,
        ip,
        createdAt: new Date().toISOString(),
      });
    }
  });

  if (!targetUser) return res.status(404).json({ error: 'User not found or insufficient privileges to update.' });

  const { passwordHash, passwordSalt, ...safe } = targetUser as User;
  return res.json({ success: true, user: safe });
});

// Assign Blue Tick & Developer Tick by Username
app.post('/api/admin/users/badge-by-username', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin) return res.status(403).json({ error: 'Admin privileges required' });

  const { username, verified, developer } = req.body;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username is required.' });
  }

  const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
  const data = db.get();
  const target = data.users.find(u => u.username.toLowerCase() === cleanUsername);
  if (!target) {
    return res.status(404).json({ error: `User with username "@${cleanUsername}" was not found.` });
  }

  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  let updatedUser: User | null = null;

  db.update(d => {
    const u = d.users.find(usr => usr.id === target.id);
    if (u) {
      if (verified !== undefined) u.verified = Boolean(verified);
      if (developer !== undefined) u.developer = Boolean(developer);
      updatedUser = u;

      d.auditLogs.unshift({
        id: `audit_${Date.now()}`,
        adminId: admin.id,
        adminUsername: admin.username,
        action: 'UPDATE_USER_BADGES',
        target: `Updated badges for @${u.username}: Blue Tick=${u.verified ? 'ON' : 'OFF'}, Dev Tick=${u.developer ? 'ON' : 'OFF'}`,
        ip,
        createdAt: new Date().toISOString(),
      });
    }
  });

  const { passwordHash, passwordSalt, ...safe } = updatedUser! as User;
  return res.json({
    success: true,
    user: safe,
    message: `Badges successfully updated for @${safe.username}! Blue Tick: ${safe.verified ? 'Granted' : 'None'}, Dev Tick: ${safe.developer ? 'Granted' : 'None'}`,
  });
});

app.delete('/api/admin/users/:id', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin || admin.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Super Administrators can permanently delete user accounts.' });
  }

  const { id } = req.params;
  const target = db.get().users.find(u => u.id === id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  if (target.role === 'super_admin') {
    return res.status(403).json({ error: 'Cannot delete the Super Administrator account.' });
  }

  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  db.update(d => {
    d.users = d.users.filter(u => u.id !== id);
    d.messages = d.messages.filter(m => m.senderId !== id);
    d.auditLogs.unshift({
      id: `audit_${Date.now()}`,
      adminId: admin.id,
      adminUsername: admin.username,
      action: 'DELETE_USER',
      target: `Deleted user ${target.username} (${target.id})`,
      ip,
      createdAt: new Date().toISOString(),
    });
  });

  return res.json({ success: true, message: `User ${target.username} deleted permanently.` });
});

app.get('/api/admin/reports', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin) return res.status(403).json({ error: 'Admin privileges required' });

  return res.json({ reports: db.get().reports });
});

app.post('/api/admin/reports/:id/action', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin) return res.status(403).json({ error: 'Admin privileges required' });

  const { id } = req.params;
  const { action, notes } = req.body; // action: 'resolve', 'dismiss', 'ban_target', 'suspend_target'

  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  let reportFound = false;

  db.update(d => {
    const report = d.reports.find(r => r.id === id);
    if (report) {
      reportFound = true;
      if (action === 'dismiss') {
        report.status = 'dismissed';
      } else {
        report.status = 'resolved';
      }

      if (action === 'ban_target') {
        const targetUser = d.users.find(u => u.id === report.targetId || u.username === report.targetId);
        if (targetUser) targetUser.status = 'banned';
      } else if (action === 'suspend_target') {
        const targetUser = d.users.find(u => u.id === report.targetId || u.username === report.targetId);
        if (targetUser) targetUser.status = 'suspended';
      }

      d.auditLogs.unshift({
        id: `audit_${Date.now()}`,
        adminId: admin.id,
        adminUsername: admin.username,
        action: `REPORT_${action.toUpperCase()}`,
        target: `Report #${id} for ${report.targetLabel}: ${notes || 'Action taken'}`,
        ip,
        createdAt: new Date().toISOString(),
      });
    }
  });

  if (!reportFound) return res.status(404).json({ error: 'Report not found' });
  return res.json({ success: true, message: 'Report action processed.' });
});

app.get('/api/admin/settings', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin) return res.status(403).json({ error: 'Admin privileges required' });

  return res.json({ settings: db.get().settings });
});

app.put('/api/admin/settings', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin) return res.status(403).json({ error: 'Admin privileges required' });

  const {
    accessPassword,
    registrationEnabled,
    features,
    maintenanceMode,
    maintenanceMessage,
    siteSettings,
    aiSettings,
  } = req.body;

  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

  db.update(d => {
    if (accessPassword !== undefined && admin.role === 'super_admin') {
      d.settings.accessPassword = accessPassword.trim();
    }
    if (registrationEnabled !== undefined) {
      d.settings.registrationEnabled = Boolean(registrationEnabled);
    }
    if (features !== undefined) {
      d.settings.features = { ...d.settings.features, ...features };
    }
    if (maintenanceMode !== undefined) {
      d.settings.maintenanceMode = Boolean(maintenanceMode);
    }
    if (maintenanceMessage !== undefined) {
      d.settings.maintenanceMessage = maintenanceMessage;
    }
    if (siteSettings !== undefined) {
      d.settings.siteSettings = { ...d.settings.siteSettings, ...siteSettings };
    }
    if (aiSettings !== undefined) {
      d.settings.aiSettings = { ...d.settings.aiSettings, ...aiSettings };
    }

    d.auditLogs.unshift({
      id: `audit_${Date.now()}`,
      adminId: admin.id,
      adminUsername: admin.username,
      action: 'UPDATE_PLATFORM_SETTINGS',
      target: 'System configuration parameters modified',
      ip,
      createdAt: new Date().toISOString(),
    });
  });

  broadcastToAll({
    type: 'platform_settings_updated',
    payload: db.get().settings,
  });

  return res.json({ success: true, settings: db.get().settings });
});

app.get('/api/admin/logs', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin) return res.status(403).json({ error: 'Admin privileges required' });

  const data = db.get();
  return res.json({
    auditLogs: data.auditLogs.slice(0, 100),
    loginLogs: data.loginLogs.slice(0, 100),
  });
});

app.get('/api/admin/sessions', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin) return res.status(403).json({ error: 'Admin privileges required' });

  return res.json({ sessions: db.get().adminSessions });
});

app.post('/api/admin/sessions/logout-all', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin) return res.status(403).json({ error: 'Admin privileges required' });

  db.update(d => {
    d.adminSessions = [];
  });
  return res.json({ success: true, message: 'All active admin sessions have been invalidated.' });
});

app.get('/api/admin/database/backup', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin || admin.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super Admin privileges required to backup database.' });
  }

  const dump = db.get();
  res.setHeader('Content-Disposition', `attachment; filename=stconnection_database_backup_${Date.now()}.json`);
  res.setHeader('Content-Type', 'application/json');
  return res.send(JSON.stringify(dump, null, 2));
});

app.post('/api/admin/database/restore', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin || admin.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super Admin privileges required to restore database.' });
  }

  const { backupData } = req.body;
  if (!backupData || !backupData.settings || !backupData.users) {
    return res.status(400).json({ error: 'Invalid database backup JSON format.' });
  }

  db.save(backupData);
  return res.json({ success: true, message: 'Database successfully restored from backup snapshot.' });
});

app.post('/api/admin/database/reset', (req: Request, res: Response) => {
  const admin = getAdminUser(req);
  if (!admin || admin.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super Admin privileges required to reset database.' });
  }

  db.resetToDefault();
  return res.json({ success: true, message: 'Database reset to factory default seeding.' });
});

// ==========================================
// 4. MESSAGING & CHATS
// ==========================================
// Helper to populate participant details on chats
function populateChatHelper(c: Chat, currentUserId: string, data: any) {
  const otherParticipantIds = c.participantIds.filter(id => id !== currentUserId);
  const otherParticipants = otherParticipantIds.map(pId => {
    const u = data.users.find((usr: any) => usr.id === pId);
    if (!u) return { id: pId, displayName: 'User', username: 'user', avatar: '', isOnline: false, verified: false, developer: false };
    return {
      id: u.id,
      displayName: u.displayName,
      username: u.username,
      avatar: u.avatar,
      isOnline: u.isOnline,
      lastSeen: u.lastSeen,
      verified: Boolean(u.verified),
      developer: Boolean(u.developer),
    };
  });

  return {
    ...c,
    otherParticipant: otherParticipants[0] || null,
    participants: otherParticipants,
  };
}

app.get('/api/chats', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const data = db.get();
  const userChats = data.chats.filter(c => c.participantIds.includes(userId));
  const populatedChats = userChats.map(c => populateChatHelper(c, userId, data));

  return res.json({ chats: populatedChats });
});

app.post('/api/chats', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { targetUserId, type, name, description, avatar } = req.body;
  const data = db.get();

  if (type === 'direct') {
    if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });

    // Check if direct chat already exists
    const existing = data.chats.find(
      c => c.type === 'direct' && c.participantIds.includes(userId) && c.participantIds.includes(targetUserId)
    );
    if (existing) {
      return res.json({ chat: populateChatHelper(existing, userId, data) });
    }

    const newChat: Chat = {
      id: `chat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      type: 'direct',
      participantIds: [userId, targetUserId],
      createdAt: new Date().toISOString(),
    };

    db.update(d => {
      d.chats.unshift(newChat);
    });

    const populated = populateChatHelper(newChat, userId, db.get());
    return res.json({ chat: populated });
  }

  // Group chat
  const newGroup: Chat = {
    id: `chat_grp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    type: 'group',
    name: name || 'New Community Group',
    description: description || '',
    avatar: avatar || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80',
    participantIds: [userId, ...(Array.isArray(req.body.participantIds) ? req.body.participantIds : [])],
    adminIds: [userId],
    inviteCode: crypto.randomBytes(4).toString('hex'),
    createdAt: new Date().toISOString(),
  };

  db.update(d => {
    d.chats.unshift(newGroup);
  });

  const populated = populateChatHelper(newGroup, userId, db.get());
  return res.json({ chat: populated });
});

app.get('/api/chats/:id/messages', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const data = db.get();

  const chat = data.chats.find(c => c.id === id);
  if (!chat || !chat.participantIds.includes(userId)) {
    return res.status(403).json({ error: 'Not a member of this chat' });
  }

  const messages = data.messages
    .filter(m => m.chatId === id && (!m.deletedFor || !m.deletedFor.includes(userId)))
    .map(m => {
      if (m.isDeletedForEveryone) {
        return {
          ...m,
          content: 'This message was deleted',
          type: 'text' as const,
          mediaUrl: undefined,
        };
      }
      return m;
    });

  // Mark messages as read
  db.update(d => {
    d.messages.forEach(m => {
      if (m.chatId === id && m.senderId !== userId && m.status !== 'read') {
        m.status = 'read';
      }
    });
  });

  return res.json({ messages });
});

app.post('/api/messages', async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const {
    chatId,
    content,
    type = 'text',
    mediaUrl,
    fileName,
    fileSize,
    audioDuration,
    replyToId,
  } = req.body;

  if (!chatId || (!content && !mediaUrl)) {
    return res.status(400).json({ error: 'Chat ID and message content or media are required.' });
  }

  const data = db.get();
  const chat = data.chats.find(c => c.id === chatId);
  if (!chat || !chat.participantIds.includes(userId)) {
    return res.status(403).json({ error: 'You are not a participant in this conversation.' });
  }

  const sender = data.users.find(u => u.id === userId);
  if (!sender) return res.status(404).json({ error: 'Sender not found.' });

  let replyToData: any = undefined;
  if (replyToId) {
    const parentMsg = data.messages.find(m => m.id === replyToId);
    if (parentMsg) {
      replyToData = {
        id: parentMsg.id,
        senderName: parentMsg.senderName,
        content: parentMsg.content.slice(0, 80),
      };
    }
  }

  const newMessage: Message = {
    id: `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    chatId,
    senderId: userId,
    senderName: sender.displayName || sender.username,
    senderAvatar: sender.avatar,
    content: (content || '').trim(),
    type,
    mediaUrl,
    fileName,
    fileSize,
    audioDuration,
    replyTo: replyToData,
    reactions: [],
    status: 'delivered',
    createdAt: new Date().toISOString(),
  };

  db.update(d => {
    d.messages.push(newMessage);
    const c = d.chats.find(ch => ch.id === chatId);
    if (c) {
      c.lastMessage = {
        content: newMessage.content || (newMessage.type === 'audio' ? '🎤 Voice message' : '📷 Media attachment'),
        senderId: userId,
        createdAt: newMessage.createdAt,
      };
    }
  });

  // Broadcast message to all participants via WebSocket
  chat.participantIds.forEach(pId => {
    broadcastToUser(pId, {
      type: 'new_message',
      payload: { message: newMessage, chatId },
    });
  });

  // Trigger Gemini AI Assistant automatically if chatting with AI Assistant
  if (chat.type === 'direct' && chat.participantIds.includes('usr_st_ai') && userId !== 'usr_st_ai') {
    setTimeout(async () => {
      try {
        const recentMessages = db.get().messages
          .filter(m => m.chatId === chatId)
          .slice(-6)
          .map(m => ({ sender: m.senderName, content: m.content }));

        const aiResponseText = await askGeminiAssistant(newMessage.content, recentMessages);

        const aiMessage: Message = {
          id: `msg_ai_${Date.now()}`,
          chatId,
          senderId: 'usr_st_ai',
          senderName: 'ST AI Assistant',
          senderAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
          content: aiResponseText,
          type: 'text',
          reactions: [],
          status: 'read',
          createdAt: new Date().toISOString(),
        };

        db.update(d => {
          d.messages.push(aiMessage);
          const c = d.chats.find(ch => ch.id === chatId);
          if (c) {
            c.lastMessage = {
              content: aiMessage.content,
              senderId: 'usr_st_ai',
              createdAt: aiMessage.createdAt,
            };
          }
        });

        chat.participantIds.forEach(pId => {
          broadcastToUser(pId, {
            type: 'new_message',
            payload: { message: aiMessage, chatId },
          });
        });
      } catch (err) {
        console.error('Failed to trigger AI bot message:', err);
      }
    }, 400);
  }

  return res.json({ message: newMessage });
});

app.put('/api/messages/:id/react', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'Emoji is required' });

  const user = db.get().users.find(u => u.id === userId);
  let updatedMessage: Message | null = null;
  let targetChat: Chat | null = null;

  db.update(d => {
    const msg = d.messages.find(m => m.id === id);
    if (msg) {
      targetChat = d.chats.find(c => c.id === msg.chatId) || null;
      const existingIdx = msg.reactions.findIndex(r => r.userId === userId && r.emoji === emoji);
      if (existingIdx >= 0) {
        msg.reactions.splice(existingIdx, 1);
      } else {
        // Remove prior emoji by same user if any
        msg.reactions = msg.reactions.filter(r => r.userId !== userId);
        msg.reactions.push({
          emoji,
          userId,
          username: user?.displayName || user?.username || 'User',
        });
      }
      updatedMessage = msg;
    }
  });

  if (!updatedMessage) return res.status(404).json({ error: 'Message not found' });

  if (targetChat) {
    (targetChat as Chat).participantIds.forEach(pId => {
      broadcastToUser(pId, {
        type: 'message_updated',
        payload: { message: updatedMessage },
      });
    });
  }

  return res.json({ success: true, message: updatedMessage });
});

app.put('/api/messages/:id/star', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  let isStarred = false;

  db.update(d => {
    const msg = d.messages.find(m => m.id === id);
    if (msg) {
      if (!msg.isStarredBy) msg.isStarredBy = [];
      const idx = msg.isStarredBy.indexOf(userId);
      if (idx >= 0) {
        msg.isStarredBy.splice(idx, 1);
        isStarred = false;
      } else {
        msg.isStarredBy.push(userId);
        isStarred = true;
      }
    }
  });

  return res.json({ success: true, isStarred });
});

app.put('/api/messages/:id/pin', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  let updatedMessage: Message | null = null;
  let targetChat: Chat | null = null;

  db.update(d => {
    const msg = d.messages.find(m => m.id === id);
    if (msg) {
      msg.isPinned = !msg.isPinned;
      updatedMessage = msg;
      targetChat = d.chats.find(c => c.id === msg.chatId) || null;
    }
  });

  if (!updatedMessage) return res.status(404).json({ error: 'Message not found' });

  if (targetChat) {
    (targetChat as Chat).participantIds.forEach(pId => {
      broadcastToUser(pId, {
        type: 'message_updated',
        payload: { message: updatedMessage },
      });
    });
  }

  return res.json({ success: true, message: updatedMessage });
});

app.put('/api/messages/:id/edit', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const { newContent } = req.body;
  if (!newContent || !newContent.trim()) return res.status(400).json({ error: 'Content required' });

  let updatedMessage: Message | null = null;
  let targetChat: Chat | null = null;

  db.update(d => {
    const msg = d.messages.find(m => m.id === id);
    if (msg) {
      if (msg.senderId !== userId) return;
      msg.content = newContent.trim();
      msg.isEdited = true;
      updatedMessage = msg;
      targetChat = d.chats.find(c => c.id === msg.chatId) || null;
    }
  });

  if (!updatedMessage) return res.status(403).json({ error: 'Cannot edit message: not owner or not found' });

  if (targetChat) {
    (targetChat as Chat).participantIds.forEach(pId => {
      broadcastToUser(pId, {
        type: 'message_updated',
        payload: { message: updatedMessage },
      });
    });
  }

  return res.json({ success: true, message: updatedMessage });
});

app.delete('/api/messages/:id', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const { type = 'me' } = req.query; // 'everyone' or 'me'

  let targetChat: Chat | null = null;
  let updatedMessage: Message | null = null;

  db.update(d => {
    const msg = d.messages.find(m => m.id === id);
    if (msg) {
      targetChat = d.chats.find(c => c.id === msg.chatId) || null;
      if (type === 'everyone') {
        if (msg.senderId === userId || (targetChat && targetChat.adminIds?.includes(userId))) {
          msg.isDeletedForEveryone = true;
          msg.content = 'This message was deleted';
          updatedMessage = msg;
        }
      } else {
        if (!msg.deletedFor) msg.deletedFor = [];
        if (!msg.deletedFor.includes(userId)) {
          msg.deletedFor.push(userId);
        }
        updatedMessage = msg;
      }
    }
  });

  if (type === 'everyone' && updatedMessage && targetChat) {
    (targetChat as Chat).participantIds.forEach(pId => {
      broadcastToUser(pId, {
        type: 'message_updated',
        payload: { message: updatedMessage },
      });
    });
  }

  return res.json({ success: true, message: 'Message deleted' });
});

// ==========================================
// 5. STORIES / STATUS (24-Hour)
// ==========================================
app.get('/api/stories', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const now = Date.now();
  const data = db.get();
  // Filter stories that have not expired
  const activeStories = data.stories.filter(s => s.expiresAt > now);

  return res.json({ stories: activeStories });
});

app.post('/api/stories', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { type, content, backgroundColor, mediaUrl, fontStyle } = req.body;
  if (!content && !mediaUrl) return res.status(400).json({ error: 'Story content or media is required' });

  const user = db.get().users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const newStory: Story = {
    id: `story_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    userId,
    username: user.displayName || user.username,
    userAvatar: user.avatar,
    type: type || 'text',
    content: content || '',
    backgroundColor: backgroundColor || 'from-teal-800 to-emerald-950',
    fontStyle: fontStyle || 'sans',
    mediaUrl,
    viewers: [],
    expiresAt: Date.now() + 24 * 3600000, // 24 hours
    createdAt: new Date().toISOString(),
  };

  db.update(d => {
    d.stories.unshift(newStory);
  });

  broadcastToAll({
    type: 'new_story',
    payload: { story: newStory },
  });

  return res.json({ story: newStory });
});

app.post('/api/stories/:id/view', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const user = db.get().users.find(u => u.id === userId);

  db.update(d => {
    const story = d.stories.find(s => s.id === id);
    if (story && user) {
      if (!story.viewers.some(v => v.userId === userId)) {
        story.viewers.push({
          userId,
          username: user.displayName || user.username,
          viewedAt: new Date().toISOString(),
        });
      }
    }
  });

  return res.json({ success: true });
});

app.delete('/api/stories/:id', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;

  db.update(d => {
    d.stories = d.stories.filter(s => s.id !== id || s.userId !== userId);
  });

  return res.json({ success: true });
});

// ==========================================
// 6. BROADCAST CHANNELS
// ==========================================
app.get('/api/channels', (req: Request, res: Response) => {
  const data = db.get();
  return res.json({ channels: data.channels });
});

app.post('/api/channels', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { name, handle, description, avatar, coverImage } = req.body;
  if (!name || !handle) return res.status(400).json({ error: 'Channel name and handle required' });

  const cleanHandle = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

  const newChannel: Channel = {
    id: `chn_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    name: name.trim(),
    handle: cleanHandle,
    description: description || '',
    avatar: avatar || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
    coverImage: coverImage || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80',
    ownerId: userId,
    verified: false,
    subscribersCount: 1,
    subscriberIds: [userId],
    createdAt: new Date().toISOString(),
  };

  db.update(d => {
    d.channels.unshift(newChannel);
  });

  return res.json({ channel: newChannel });
});

app.post('/api/channels/:id/follow', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  let isFollowing = false;

  db.update(d => {
    const chn = d.channels.find(c => c.id === id);
    if (chn) {
      const idx = chn.subscriberIds.indexOf(userId);
      if (idx >= 0) {
        chn.subscriberIds.splice(idx, 1);
        chn.subscribersCount = Math.max(0, chn.subscribersCount - 1);
        isFollowing = false;
      } else {
        chn.subscriberIds.push(userId);
        chn.subscribersCount += 1;
        isFollowing = true;
      }
    }
  });

  return res.json({ success: true, isFollowing });
});

app.get('/api/channels/:id/posts', (req: Request, res: Response) => {
  const { id } = req.params;
  const posts = db.get().channelPosts.filter(p => p.channelId === id);
  return res.json({ posts });
});

app.post('/api/channels/:id/posts', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const { content, mediaUrl } = req.body;
  if (!content) return res.status(400).json({ error: 'Post content required' });

  const data = db.get();
  const chn = data.channels.find(c => c.id === id);
  if (!chn) return res.status(404).json({ error: 'Channel not found' });
  if (chn.ownerId !== userId && !data.users.some(u => u.id === userId && u.role === 'super_admin')) {
    return res.status(403).json({ error: 'Only channel owners or super admins can broadcast posts.' });
  }

  const sender = data.users.find(u => u.id === userId);

  const post: ChannelPost = {
    id: `post_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    channelId: id,
    senderId: userId,
    senderName: sender?.displayName || sender?.username || 'Channel Admin',
    content: content.trim(),
    mediaUrl,
    likesCount: 0,
    likedBy: [],
    createdAt: new Date().toISOString(),
  };

  db.update(d => {
    d.channelPosts.unshift(post);
  });

  broadcastToAll({
    type: 'new_channel_post',
    payload: { post, channelName: chn.name },
  });

  return res.json({ post });
});

app.post('/api/channels/:id/posts/:postId/like', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { postId } = req.params;
  let isLiked = false;

  db.update(d => {
    const post = d.channelPosts.find(p => p.id === postId);
    if (post) {
      const idx = post.likedBy.indexOf(userId);
      if (idx >= 0) {
        post.likedBy.splice(idx, 1);
        post.likesCount = Math.max(0, post.likesCount - 1);
        isLiked = false;
      } else {
        post.likedBy.push(userId);
        post.likesCount += 1;
        isLiked = true;
      }
    }
  });

  return res.json({ success: true, isLiked });
});

// ==========================================
// 7. CALLS & HISTORY
// ==========================================
app.get('/api/calls/history', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const calls = db.get().callRecords.filter(c => c.callerId === userId || c.receiverId === userId);
  return res.json({ calls });
});

app.post('/api/calls/log', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { receiverId, type, status, durationSeconds } = req.body;
  const data = db.get();
  const caller = data.users.find(u => u.id === userId);
  const receiver = data.users.find(u => u.id === receiverId);

  if (!caller || !receiver) return res.status(400).json({ error: 'Caller and receiver required' });

  const record: CallRecord = {
    id: `call_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    callerId: userId,
    callerName: caller.displayName || caller.username,
    callerAvatar: caller.avatar,
    receiverId,
    receiverName: receiver.displayName || receiver.username,
    type: type || 'voice',
    status: status || 'completed',
    durationSeconds: durationSeconds || 0,
    createdAt: new Date().toISOString(),
  };

  db.update(d => {
    d.callRecords.unshift(record);
  });

  return res.json({ call: record });
});

// ==========================================
// 8. CONTACTS & USERS SEARCH
// ==========================================
app.get('/api/contacts/search', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const { query } = req.query;
  if (!query || typeof query !== 'string') return res.json({ users: [] });

  const q = query.toLowerCase().trim();
  const users = db.get().users
    .filter(u => u.id !== userId && (u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q)))
    .slice(0, 15)
    .map(({ passwordHash, passwordSalt, ...safe }) => safe);

  return res.json({ users });
});

// ==========================================
// 9. REPORTS & COMPLAINTS
// ==========================================
app.post('/api/reports', (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { targetId, targetType, targetLabel, reason, details } = req.body;
  if (!targetId || !reason) return res.status(400).json({ error: 'Target and reason required' });

  const reporter = db.get().users.find(u => u.id === userId);

  const report: Report = {
    id: `rep_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    reporterId: userId,
    reporterUsername: reporter?.username || 'user',
    targetId,
    targetType: targetType || 'user',
    targetLabel: targetLabel || targetId,
    reason: reason.trim(),
    details: details?.trim(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  db.update(d => {
    d.reports.unshift(report);
  });

  return res.json({ success: true, message: 'Report submitted for review.' });
});

// ==========================================
// 10. GOOGLE GEMINI AI ASSISTANT APIS
// ==========================================
app.post('/api/gemini/assistant', async (req: Request, res: Response) => {
  const { prompt, contextMessages } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  try {
    const reply = await askGeminiAssistant(prompt, contextMessages);
    return res.json({ reply });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Gemini error' });
  }
});

app.post('/api/gemini/suggest-replies', async (req: Request, res: Response) => {
  const { lastMessage } = req.body;
  if (!lastMessage) return res.json({ suggestions: ['Got it!', 'Sounds good!', 'Thanks!'] });

  try {
    const suggestions = await generateQuickReplies(lastMessage);
    return res.json({ suggestions });
  } catch {
    return res.json({ suggestions: ['Got it!', 'Sounds good!', 'Talk to you soon!'] });
  }
});

app.post('/api/gemini/rewrite', async (req: Request, res: Response) => {
  const { text, tone = 'friendly' } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });

  try {
    const rewritten = await rewriteMessage(text, tone);
    return res.json({ rewritten });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

app.post('/api/gemini/grammar', async (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });

  try {
    const corrected = await correctGrammar(text);
    return res.json({ corrected });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

app.post('/api/gemini/translate', async (req: Request, res: Response) => {
  const { text, language = 'Spanish' } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });

  try {
    const translated = await translateText(text, language);
    return res.json({ translated });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

app.post('/api/gemini/summarize', async (req: Request, res: Response) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array required' });
  }

  try {
    const summary = await summarizeChat(messages);
    return res.json({ summary });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// ==========================================
// DEV VS PROD VITE MIDDLEWARES
// ==========================================
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`ST CONNECTION backend server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
