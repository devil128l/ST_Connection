import { SafeUser, Chat, Message, Story, StorySong, Channel, ChannelPost, CallRecord, SystemSettings } from '../types.js';

class ApiService {
  private gateToken: string | null = null;
  private authToken: string | null = null;
  private currentUser: SafeUser | null = null;
  private ws: WebSocket | null = null;
  private wsListeners: Set<(event: { type: string; payload: any }) => void> = new Set();
  private reconnectTimer: any = null;

  private adminToken: string | null = null;
  private adminUser: SafeUser | null = null;

  constructor() {
    this.gateToken = localStorage.getItem('st_gate_token');
    this.authToken = localStorage.getItem('st_auth_token');
    const storedUser = localStorage.getItem('st_user');
    if (storedUser) {
      try {
        this.currentUser = JSON.parse(storedUser);
      } catch {}
    }

    this.adminToken = sessionStorage.getItem('st_admin_token') || localStorage.getItem('st_admin_token');
    const storedAdmin = sessionStorage.getItem('st_admin_user') || localStorage.getItem('st_admin_user');
    if (storedAdmin) {
      try {
        this.adminUser = JSON.parse(storedAdmin);
      } catch {}
    }
  }

  getGateToken(): string | null {
    return this.gateToken || localStorage.getItem('st_gate_token');
  }

  setGateToken(token: string) {
    this.gateToken = token;
    localStorage.setItem('st_gate_token', token);
  }

  clearGateToken() {
    this.gateToken = null;
    localStorage.removeItem('st_gate_token');
  }

  getAuthToken(): string | null {
    return this.authToken || localStorage.getItem('st_auth_token');
  }

  setAuthSession(token: string, user: SafeUser) {
    this.authToken = token;
    this.currentUser = user;
    localStorage.setItem('st_auth_token', token);
    localStorage.setItem('st_user', JSON.stringify(user));
    this.connectWebSocket(user.id);
  }

  clearAuthSession() {
    this.authToken = null;
    this.currentUser = null;
    localStorage.removeItem('st_auth_token');
    localStorage.removeItem('st_user');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getCurrentUser(): SafeUser | null {
    return this.currentUser;
  }

  updateCurrentUser(user: SafeUser) {
    this.currentUser = user;
    localStorage.setItem('st_user', JSON.stringify(user));
  }

  // --- Admin Session (Strictly isolated from Chat User Session) ---
  getAdminToken(): string | null {
    return this.adminToken || sessionStorage.getItem('st_admin_token') || localStorage.getItem('st_admin_token');
  }

  getAdminUser(): SafeUser | null {
    if (this.adminUser) return this.adminUser;
    const storedAdmin = sessionStorage.getItem('st_admin_user') || localStorage.getItem('st_admin_user');
    if (storedAdmin) {
      try {
        this.adminUser = JSON.parse(storedAdmin);
        return this.adminUser;
      } catch {}
    }
    return null;
  }

  setAdminSession(token: string, admin: SafeUser) {
    this.adminToken = token;
    this.adminUser = admin;
    sessionStorage.setItem('st_admin_token', token);
    sessionStorage.setItem('st_admin_user', JSON.stringify(admin));
  }

  clearAdminSession() {
    this.adminToken = null;
    this.adminUser = null;
    sessionStorage.removeItem('st_admin_token');
    sessionStorage.removeItem('st_admin_user');
    localStorage.removeItem('st_admin_token');
    localStorage.removeItem('st_admin_user');
  }

  // --- WebSocket Setup ---
  connectWebSocket(userId: string) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const envWs = import.meta.env.VITE_WS_URL;
    let wsUrl = '';
    if (envWs) {
      wsUrl = envWs;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws`;
    }

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'auth',
            payload: { userId },
          }));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.wsListeners.forEach(listener => listener(data));
        } catch (e) {
          console.error('WS message parse error', e);
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        if (this.currentUser) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            if (this.currentUser) {
              this.connectWebSocket(this.currentUser.id);
            }
          }, 3000);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WS error', err);
      };
    } catch (err) {
      console.warn('Could not establish WS connection:', err);
    }
  }

  sendWs(type: string, payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  subscribeWs(listener: (event: { type: string; payload: any }) => void) {
    this.wsListeners.add(listener);
    return () => {
      this.wsListeners.delete(listener);
    };
  }

  // --- HTTP Helpers ---
  public async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const isAdminEndpoint = endpoint.startsWith('/api/admin');
    const token = isAdminEndpoint ? (this.getAdminToken() || this.getAuthToken()) : this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    const url = endpoint.startsWith('http') ? endpoint : `${apiBase}${endpoint}`;

    try {
      const res = await fetch(url, {
        ...options,
        headers,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || `Request failed with status ${res.status}`);
      }
      return data;
    } catch (err: any) {
      // Graceful fallback for static previews if API is offline
      if (endpoint === '/api/gate/config' && (!err.status || err.message?.includes('fetch'))) {
        return {
          siteName: 'ST CONNECTION',
          logoUrl: '/icon.svg',
          announcement: '🌟 Welcome to ST CONNECTION! Real-time messaging, WebRTC calling & Gemini AI are live.',
          maintenanceMode: false,
          maintenanceMessage: '',
          features: { calling: true, geminiAi: true, stories: true, channels: true, mediaUploads: true, voiceNotes: true },
          registrationEnabled: true,
        } as unknown as T;
      }
      throw err;
    }
  }

  // VPS Native Media Upload
  async uploadMedia(dataUrl: string, prefix = 'media'): Promise<string> {
    if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
    try {
      const res = await this.request<{ url: string; provider: string }>('/api/storage/upload', {
        method: 'POST',
        body: JSON.stringify({ dataUrl, prefix }),
      });
      return res.url || dataUrl;
    } catch {
      return dataUrl;
    }
  }

  // Gate APIs
  async verifyGate(password: string) {
    const res = await this.request<{ success: boolean; gateToken: string; message: string }>('/api/gate/verify', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    this.setGateToken(res.gateToken);
    return res;
  }

  async getGateConfig() {
    return this.request<{
      siteName: string;
      logoUrl: string;
      announcement: string;
      maintenanceMode: boolean;
      maintenanceMessage: string;
      features: SystemSettings['features'];
      registrationEnabled: boolean;
    }>('/api/gate/config');
  }

  // Auth APIs
  async register(data: { username: string; email: string; displayName?: string; password: string }) {
    const res = await this.request<{ success: boolean; token: string; user: SafeUser; verificationCode: string; message: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setAuthSession(res.token, res.user);
    return res;
  }

  async login(identifier: string, password: string) {
    const res = await this.request<{ success: boolean; token?: string; user?: SafeUser; requires2fa?: boolean; tempToken?: string; message?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    if (res.token && res.user) {
      this.setAuthSession(res.token, res.user);
    }
    return res;
  }

  async verify2FA(tempToken: string, code: string) {
    const res = await this.request<{ success: boolean; token: string; user: SafeUser }>('/api/auth/verify-2fa', {
      method: 'POST',
      body: JSON.stringify({ tempToken, code }),
    });
    this.setAuthSession(res.token, res.user);
    return res;
  }

  async verifyEmail(code: string) {
    return this.request<{ success: boolean; message: string }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async forgotPassword(email: string) {
    return this.request<{ success: boolean; message: string; resetToken?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(resetToken: string, newPassword: string) {
    return this.request<{ success: boolean; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ resetToken, newPassword }),
    });
  }

  async getMe() {
    const res = await this.request<{ user: SafeUser }>('/api/auth/me');
    this.updateCurrentUser(res.user);
    return res.user;
  }

  async updateProfile(updates: Partial<SafeUser>) {
    const res = await this.request<{ success: boolean; user: SafeUser }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    this.updateCurrentUser(res.user);
    return res.user;
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ success: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  async deleteAccount(password: string) {
    const res = await this.request<{ success: boolean; message: string }>('/api/auth/delete-account', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    this.clearAuthSession();
    return res;
  }

  async exportData(): Promise<Blob> {
    const token = this.getAuthToken();
    const res = await fetch('/api/auth/export-data', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.blob();
  }

  // Chats & Messaging
  async getChats() {
    return this.request<{ chats: Chat[] }>('/api/chats');
  }

  async createDirectChat(targetUserId: string) {
    return this.request<{ chat: Chat }>('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ type: 'direct', targetUserId }),
    });
  }

  async createGroupChat(name: string, description: string, participantIds: string[], avatar?: string) {
    return this.request<{ chat: Chat }>('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ type: 'group', name, description, participantIds, avatar }),
    });
  }

  async getMessages(chatId: string) {
    return this.request<{ messages: Message[] }>(`/api/chats/${chatId}/messages`);
  }

  async sendMessage(data: {
    chatId: string;
    content?: string;
    type?: 'text' | 'image' | 'video' | 'audio' | 'file';
    mediaUrl?: string;
    fileName?: string;
    fileSize?: string;
    audioDuration?: number;
    replyToId?: string;
  }) {
    return this.request<{ message: Message }>('/api/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async reactMessage(messageId: string, emoji: string) {
    return this.request<{ success: boolean; message: Message }>(`/api/messages/${messageId}/react`, {
      method: 'PUT',
      body: JSON.stringify({ emoji }),
    });
  }

  async pinMessage(messageId: string) {
    return this.request<{ success: boolean; message: Message }>(`/api/messages/${messageId}/pin`, {
      method: 'PUT',
    });
  }

  async starMessage(messageId: string) {
    return this.request<{ success: boolean; isStarred: boolean }>(`/api/messages/${messageId}/star`, {
      method: 'PUT',
    });
  }

  async editMessage(messageId: string, newContent: string) {
    return this.request<{ success: boolean; message: Message }>(`/api/messages/${messageId}/edit`, {
      method: 'PUT',
      body: JSON.stringify({ newContent }),
    });
  }

  async deleteMessage(messageId: string, type: 'everyone' | 'me' = 'me') {
    return this.request<{ success: boolean; message: string }>(`/api/messages/${messageId}?type=${type}`, {
      method: 'DELETE',
    });
  }

  async clearChat(chatId: string) {
    return this.request<{ success: boolean; message: string }>(`/api/chats/${chatId}/clear`, {
      method: 'POST',
    });
  }

  async deleteChat(chatId: string) {
    return this.request<{ success: boolean; message: string }>(`/api/chats/${chatId}`, {
      method: 'DELETE',
    });
  }

  // Stories
  async getStories() {
    return this.request<{ stories: Story[] }>('/api/stories');
  }

  async createStory(data: {
    type: 'text' | 'image';
    content?: string;
    backgroundColor?: string;
    mediaUrl?: string;
    fontStyle?: string;
    song?: StorySong;
  }) {
    return this.request<{ story: Story }>('/api/stories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async viewStory(storyId: string) {
    return this.request<{ success: boolean }>(`/api/stories/${storyId}/view`, {
      method: 'POST',
    });
  }

  async deleteStory(storyId: string) {
    return this.request<{ success: boolean }>(`/api/stories/${storyId}`, {
      method: 'DELETE',
    });
  }

  // Channels
  async getChannels() {
    return this.request<{ channels: Channel[] }>('/api/channels');
  }

  async followChannel(channelId: string) {
    return this.request<{ success: boolean; isFollowing: boolean }>(`/api/channels/${channelId}/follow`, {
      method: 'POST',
    });
  }

  async getChannelPosts(channelId: string) {
    return this.request<{ posts: ChannelPost[] }>(`/api/channels/${channelId}/posts`);
  }

  async postToChannel(channelId: string, content: string, mediaUrl?: string) {
    return this.request<{ post: ChannelPost }>(`/api/channels/${channelId}/posts`, {
      method: 'POST',
      body: JSON.stringify({ content, mediaUrl }),
    });
  }

  async likeChannelPost(channelId: string, postId: string) {
    return this.request<{ success: boolean; isLiked: boolean }>(`/api/channels/${channelId}/posts/${postId}/like`, {
      method: 'POST',
    });
  }

  // Calls
  async getCallHistory() {
    return this.request<{ calls: CallRecord[] }>('/api/calls/history');
  }

  async logCall(data: { receiverId: string; type: 'voice' | 'video'; status: 'completed' | 'missed' | 'declined'; durationSeconds: number }) {
    return this.request<{ call: CallRecord }>('/api/calls/log', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Contacts
  async searchUsers(query: string) {
    return this.request<{ users: SafeUser[] }>(`/api/contacts/search?query=${encodeURIComponent(query)}`);
  }

  // Reports
  async submitReport(data: { targetId: string; targetType: 'user' | 'message' | 'group' | 'channel'; targetLabel: string; reason: string; details?: string }) {
    return this.request<{ success: boolean; message: string }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Gemini AI features
  async askGemini(prompt: string, contextMessages: { sender: string; content: string }[] = []) {
    return this.request<{ reply: string }>('/api/gemini/assistant', {
      method: 'POST',
      body: JSON.stringify({ prompt, contextMessages }),
    });
  }

  async getAiSuggestions(lastMessage: string) {
    return this.request<{ suggestions: string[] }>('/api/gemini/suggest-replies', {
      method: 'POST',
      body: JSON.stringify({ lastMessage }),
    });
  }

  async rewriteWithAi(text: string, tone: 'professional' | 'concise' | 'friendly' | 'enthusiastic' | 'humorous') {
    return this.request<{ rewritten: string }>('/api/gemini/rewrite', {
      method: 'POST',
      body: JSON.stringify({ text, tone }),
    });
  }

  async correctGrammarWithAi(text: string) {
    return this.request<{ corrected: string }>('/api/gemini/grammar', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  async translateWithAi(text: string, language: string) {
    return this.request<{ translated: string }>('/api/gemini/translate', {
      method: 'POST',
      body: JSON.stringify({ text, language }),
    });
  }

  async summarizeWithAi(messages: { sender: string; content: string }[]) {
    return this.request<{ summary: string }>('/api/gemini/summarize', {
      method: 'POST',
      body: JSON.stringify({ messages }),
    });
  }

  // Admin APIs
  async adminLogin(password: string, identifier?: string) {
    return this.request<{ success: boolean; token: string; admin: SafeUser }>('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password, identifier }),
    });
  }

  async assignUserBadgesByUsername(username: string, verified: boolean, developer: boolean) {
    return this.request<{ success: boolean; user: SafeUser; message: string }>('/api/admin/users/badge-by-username', {
      method: 'POST',
      body: JSON.stringify({ username, verified, developer }),
    });
  }

  async setMaintenanceMode(enabled: boolean, message?: string) {
    return this.updateAdminSettings({
      maintenanceMode: enabled,
      ...(message !== undefined ? { maintenanceMessage: message } : {}),
    });
  }

  async getAdminStats() {
    return this.request<{
      totalUsers: number;
      activeUsers: number;
      onlineUsers: number;
      blockedUsers: number;
      totalMessages: number;
      totalGroups: number;
      totalChannels: number;
      pendingReports: number;
      serverUptime: number;
      nodeVersion: string;
      memoryUsage: number;
    }>('/api/admin/stats');
  }

  async getAdminUsers(search?: string, role?: string, status?: string) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (role) params.set('role', role);
    if (status) params.set('status', status);
    return this.request<{ users: SafeUser[] }>(`/api/admin/users?${params.toString()}`);
  }

  async updateAdminUser(id: string, updates: Partial<SafeUser>) {
    return this.request<{ success: boolean; user: SafeUser }>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteAdminUser(id: string) {
    return this.request<{ success: boolean; message: string }>(`/api/admin/users/${id}`, {
      method: 'DELETE',
    });
  }

  async getAdminReports() {
    return this.request<{ reports: any[] }>('/api/admin/reports');
  }

  async handleAdminReport(id: string, action: string, notes?: string) {
    return this.request<{ success: boolean; message: string }>(`/api/admin/reports/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, notes }),
    });
  }

  async getAdminSettings() {
    return this.request<{ settings: SystemSettings }>('/api/admin/settings');
  }

  async updateAdminSettings(settings: Partial<SystemSettings>) {
    return this.request<{ success: boolean; settings: SystemSettings }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async getAdminLogs() {
    return this.request<{ auditLogs: any[]; loginLogs: any[] }>('/api/admin/logs');
  }

  async getAdminSessions() {
    return this.request<{ sessions: any[] }>('/api/admin/sessions');
  }

  async logoutAllAdminSessions() {
    return this.request<{ success: boolean; message: string }>('/api/admin/sessions/logout-all', {
      method: 'POST',
    });
  }

  async backupDatabase(): Promise<Blob> {
    const token = this.getAdminToken() || this.getAuthToken();
    const res = await fetch('/api/admin/database/backup', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.blob();
  }

  async restoreDatabase(backupData: any) {
    return this.request<{ success: boolean; message: string }>('/api/admin/database/restore', {
      method: 'POST',
      body: JSON.stringify({ backupData }),
    });
  }

  async resetDatabase() {
    return this.request<{ success: boolean; message: string }>('/api/admin/database/reset', {
      method: 'POST',
    });
  }

  async getDatabaseStatus() {
    return this.request<{
      type: string;
      connected: boolean;
      host: string;
      database: string;
      user: string;
      error?: string | null;
      userCount?: number;
      messageCount?: number;
      vpsStorage?: {
        dataDir: string;
        uploadsDir: string;
        databaseSizeBytes: number;
        uploadsCount: number;
        uploadsSizeBytes: number;
        totalVpsBytes: number;
      };
    }>('/api/admin/database/status');
  }

  async getAdminAiStatus() {
    return this.request<{ configured: boolean; maskedKey?: string; model: string; enabled: boolean }>('/api/admin/ai/status');
  }

  async updateAdminAiKey(apiKey: string) {
    return this.request<{ success: boolean; message: string; status: { configured: boolean; maskedKey?: string } }>('/api/admin/ai/update-key', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    });
  }

  async testAdminAi() {
    return this.request<{ success: boolean; reply: string; latencyMs: number; status: { configured: boolean; maskedKey?: string } }>('/api/admin/ai/test', {
      method: 'POST',
    });
  }
}

export const api = new ApiService();
