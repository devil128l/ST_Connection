import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  ShieldAlert,
  Settings,
  Bot,
  Lock,
  LogOut,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Search,
  Check,
  X,
  Trash2,
  KeyRound,
  Download,
  Upload,
  RefreshCw,
  Bell,
  Activity,
  Server,
  Database,
  ShieldCheck,
  UserX,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Code2,
  Terminal,
  AlertTriangle,
  Wrench,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api } from '../utils/api.js';
import { SafeUser, SystemSettings } from '../types.js';

interface AdminPortalProps {
  onSwitchToMainSite: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ onSwitchToMainSite }) => {
  const [adminUser, setAdminUser] = useState<SafeUser | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'maintenance' | 'users' | 'moderation' | 'website' | 'ai' | 'security'>('dashboard');
  const [loading, setLoading] = useState(true);

  // Admin login state (only single master password required)
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Data states
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [reports, setReports] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [logs, setLogs] = useState<{ auditLogs: any[]; loginLogs: any[] }>({ auditLogs: [], loginLogs: [] });
  const [sessions, setSessions] = useState<any[]>([]);
  const [dbInfo, setDbInfo] = useState<any>(null);

  // Username badge assignment tool state
  const [badgeUsername, setBadgeUsername] = useState('');
  const [giveBlueTick, setGiveBlueTick] = useState(false);
  const [giveDevTick, setGiveDevTick] = useState(false);
  const [badgeLoading, setBadgeLoading] = useState(false);

  // Maintenance mode custom message state
  const [maintMessage, setMaintMessage] = useState('');
  const [maintLoading, setMaintLoading] = useState(false);

  // Action status message
  const [actionAlert, setActionAlert] = useState<{ text: string; isError?: boolean } | null>(null);

  // Gemini AI Engine key and test states
  const [aiKeyStatus, setAiKeyStatus] = useState<{ configured: boolean; maskedKey?: string } | null>(null);
  const [newApiKey, setNewApiKey] = useState('');
  const [updatingAiKey, setUpdatingAiKey] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);

  useEffect(() => {
    // Check existing admin session (isolated from chat user session)
    const existingAdmin = api.getAdminUser();
    if (existingAdmin && (existingAdmin.role === 'super_admin' || existingAdmin.role === 'admin' || existingAdmin.role === 'moderator')) {
      setAdminUser(existingAdmin);
      loadAdminData();
      setLoading(false);
      return;
    }

    if (api.getAdminToken()) {
      api.getAdminUsers()
        .then(() => {
          const admin = api.getAdminUser();
          if (admin) {
            setAdminUser(admin);
            loadAdminData();
          }
        })
        .catch(() => {
          api.clearAdminSession();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const loadAdminData = async () => {
    try {
      const [statsRes, usersRes, reportsRes, settingsRes, logsRes, sessionsRes] = await Promise.all([
        api.getAdminStats(),
        api.getAdminUsers(),
        api.getAdminReports(),
        api.getAdminSettings(),
        api.getAdminLogs(),
        api.getAdminSessions(),
      ]);
      setStats(statsRes);
      setUsers(usersRes.users);
      setReports(reportsRes.reports);
      setSystemSettings(settingsRes.settings);
      setMaintMessage(settingsRes.settings.maintenanceMessage || 'ST CONNECTION is currently performing scheduled system updates. Service will resume shortly.');
      setLogs(logsRes);
      setSessions(sessionsRes.sessions);

      // Load AI key status & Database status
      api.getAdminAiStatus().then(st => setAiKeyStatus(st)).catch(() => {});
      api.getDatabaseStatus().then(info => setDbInfo(info)).catch(() => {});
    } catch (err: any) {
      console.warn('Failed to load admin data:', err);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await api.adminLogin(password);
      if (res.admin) {
        // Isolated admin session - does NOT overwrite chat user session
        api.setAdminSession(res.token, res.admin);
        setAdminUser(res.admin);
        loadAdminData();
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Invalid administrator password.');
    }
  };

  const handleAdminLogout = () => {
    api.clearAdminSession();
    setAdminUser(null);
  };

  const notify = (text: string, isError = false) => {
    setActionAlert({ text, isError });
    setTimeout(() => setActionAlert(null), 4000);
  };

  // Assign Badges by Username
  const handleAssignBadgesByUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!badgeUsername.trim()) {
      notify('Please enter a username to grant badges.', true);
      return;
    }
    setBadgeLoading(true);
    try {
      const res = await api.assignUserBadgesByUsername(badgeUsername.trim(), giveBlueTick, giveDevTick);
      notify(res.message);
      // Update local users list if this user is loaded
      setUsers(prev => prev.map(u => u.id === res.user.id ? res.user : u));
      setBadgeUsername('');
    } catch (err: any) {
      notify(err?.message || 'Failed to update user badges.', true);
    } finally {
      setBadgeLoading(false);
    }
  };

  // User Actions
  const handleToggleVerified = async (user: SafeUser) => {
    try {
      const updated = await api.updateAdminUser(user.id, { verified: !user.verified });
      setUsers(users.map(u => u.id === user.id ? updated.user : u));
      notify(`Blue Tick (verified) ${!user.verified ? 'granted to' : 'removed from'} @${user.username}`);
    } catch (e: any) {
      notify(e?.message, true);
    }
  };

  const handleToggleDeveloper = async (user: SafeUser) => {
    try {
      const updated = await api.updateAdminUser(user.id, { developer: !user.developer });
      setUsers(users.map(u => u.id === user.id ? updated.user : u));
      notify(`Developer Tick ${!user.developer ? 'granted to' : 'removed from'} @${user.username}`);
    } catch (e: any) {
      notify(e?.message, true);
    }
  };

  const handleToggleMaintenance = async (enable: boolean) => {
    setMaintLoading(true);
    try {
      const res = await api.setMaintenanceMode(enable, maintMessage);
      setSystemSettings(res.settings);
      notify(`System maintenance mode is now ${enable ? 'ENABLED (Platform Locked)' : 'DISABLED (Platform Live)'}`);
    } catch (err: any) {
      notify(err?.message || 'Failed to update maintenance mode', true);
    } finally {
      setMaintLoading(false);
    }
  };

  const handleUpdateStatus = async (user: SafeUser, status: 'active' | 'suspended' | 'banned') => {
    try {
      const updated = await api.updateAdminUser(user.id, { status });
      setUsers(users.map(u => u.id === user.id ? updated.user : u));
      notify(`User ${user.username} status set to ${status}`);
    } catch (e: any) {
      notify(e?.message, true);
    }
  };

  const handleUpdateRole = async (user: SafeUser, role: SafeUser['role']) => {
    try {
      const updated = await api.updateAdminUser(user.id, { role });
      setUsers(users.map(u => u.id === user.id ? updated.user : u));
      notify(`User ${user.username} role changed to ${role}`);
    } catch (e: any) {
      notify(e?.message, true);
    }
  };

  const handleDeleteUser = async (user: SafeUser) => {
    if (!confirm(`Are you sure you want to permanently delete user ${user.username}? This is irreversible!`)) return;
    try {
      await api.deleteAdminUser(user.id);
      setUsers(users.filter(u => u.id !== user.id));
      notify(`User ${user.username} deleted.`);
    } catch (e: any) {
      notify(e?.message, true);
    }
  };

  // Moderation action
  const handleReportAction = async (reportId: string, action: string) => {
    try {
      await api.handleAdminReport(reportId, action);
      loadAdminData();
      notify(`Report #${reportId} processed.`);
    } catch (e: any) {
      notify(e?.message, true);
    }
  };

  // Settings update
  const handleSaveSettings = async (updates: Partial<SystemSettings>) => {
    try {
      const res = await api.updateAdminSettings(updates);
      setSystemSettings(res.settings);
      notify('Platform settings updated successfully.');
    } catch (e: any) {
      notify(e?.message, true);
    }
  };

  // Database Backup & Restore
  const handleDownloadBackup = async () => {
    try {
      const blob = await api.backupDatabase();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stconnection_backup_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      notify('Database snapshot exported.');
    } catch (e: any) {
      notify(e?.message, true);
    }
  };

  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        await api.restoreDatabase(json);
        notify('Database restored successfully! Reloading...');
        loadAdminData();
      } catch (err: any) {
        notify('Invalid backup JSON file.', true);
      }
    };
    reader.readAsText(file);
  };

  const handleResetDatabase = async () => {
    if (!confirm('Warning: This will reset the entire platform database to factory defaults. Continue?')) return;
    try {
      await api.resetDatabase();
      loadAdminData();
      notify('Database reset to factory default seeding.');
    } catch (e: any) {
      notify(e?.message, true);
    }
  };

  const handleUpdateAiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newApiKey.trim()) {
      notify('Please enter an API key.', true);
      return;
    }
    setUpdatingAiKey(true);
    try {
      const res = await api.updateAdminAiKey(newApiKey.trim());
      setAiKeyStatus(res.status);
      setNewApiKey('');
      notify(res.message || 'API key updated successfully!');
    } catch (err: any) {
      notify(err?.message || 'Failed to update API key.', true);
    } finally {
      setUpdatingAiKey(false);
    }
  };

  const handleTestAi = async () => {
    setTestingAi(true);
    setAiTestResult(null);
    try {
      const res = await api.testAdminAi();
      setAiTestResult({
        success: true,
        message: res.reply || 'AI Engine responded successfully.',
        latency: res.latencyMs,
      });
      notify(`Gemini connection verified (${res.latencyMs}ms)!`);
    } catch (err: any) {
      setAiTestResult({
        success: false,
        message: err?.message || 'Connection failed. Please check key validity.',
      });
      notify('Gemini connection test failed.', true);
    } finally {
      setTestingAi(false);
    }
  };

  // 1. ADMIN LOGIN PORTAL
  if (!adminUser) {
    return (
      <div className="min-h-screen bg-[#070d12] text-slate-100 flex flex-col items-center justify-center p-4 select-none relative overflow-hidden">
        {/* Ambient admin glows */}
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md relative z-10">
          <div className="bg-[#0f171e] border border-[#1e293b] rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-red-600 to-amber-500 p-0.5 shadow-lg shadow-red-500/20 flex items-center justify-center mb-3">
                <ShieldCheck className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">ST CONNECTION Admin Portal</h2>
              <p className="text-xs text-slate-400 mt-1">
                Domain: <span className="text-emerald-400 font-mono">admin.stconnection.bond</span>
              </p>
              <div className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-[10px] text-red-400 font-semibold tracking-wide uppercase">
                Restricted System Access
              </div>
            </div>

            {loginError && (
              <div className="mb-4 flex items-start gap-2 bg-red-950/40 border border-red-800/50 text-red-300 text-xs p-3 rounded-xl animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <p>{loginError}</p>
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Administrator Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    autoFocus
                    className="w-full bg-[#18222d] border border-[#263442] focus:border-red-500 rounded-xl px-3.5 py-3 text-xs text-white outline-none transition pl-10 pr-10"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-slate-200 absolute right-3.5 top-1/2 -translate-y-1/2 cursor-pointer p-0.5"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Direct master password access. No username or email required.
                </p>
              </div>

              <button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-500 text-white font-medium py-3 px-4 rounded-xl shadow-lg shadow-red-950/50 transition flex items-center justify-center gap-2 text-xs cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Enter Admin Console</span>
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-[#1e293b] flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-500 font-mono">Secured by AES-256</span>

              <button
                type="button"
                onClick={onSwitchToMainSite}
                className="text-slate-400 hover:text-white transition flex items-center gap-1 text-[11px]"
              >
                <span>Back to Chat</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. AUTHENTICATED ADMIN DASHBOARD
  const filteredUsers = users.filter(u => {
    const matchesSearch = !userSearch || (
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.id.toLowerCase().includes(userSearch.toLowerCase())
    );
    const matchesRole = userRoleFilter === 'all' || u.role === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="min-h-screen bg-[#070d12] text-slate-100 flex flex-col antialiased">
      {/* Top Admin Header */}
      <header className="h-14 bg-[#0f171e] border-b border-[#1e293b] px-4 sm:px-6 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white font-bold text-sm shadow">
            ST
          </div>
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              <span>ST CONNECTION</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-mono border border-red-500/30">
                ADMIN CONSOLE
              </span>
            </h1>
            <p className="text-[10px] text-slate-400 font-mono hidden sm:block">
              admin.stconnection.bond • Super Admin Controlled
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Notification Alert Toast */}
          {actionAlert && (
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs ${
              actionAlert.isError ? 'bg-red-950 text-red-300 border border-red-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
            }`}>
              <Check className="w-3.5 h-3.5" />
              <span>{actionAlert.text}</span>
            </div>
          )}

          {/* Current Admin badge */}
          <div className="flex items-center gap-2 bg-[#18222d] border border-[#263442] px-3 py-1.5 rounded-xl text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-semibold text-white">{adminUser.displayName}</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-red-500/20 text-red-300 rounded font-mono uppercase">
              {adminUser.role}
            </span>
          </div>

          {/* Switch to Main Chat Portal */}
          <button
            type="button"
            onClick={onSwitchToMainSite}
            className="px-3 py-1.5 rounded-xl bg-[#18222d] hover:bg-[#202c38] text-emerald-400 hover:text-emerald-300 border border-[#263442] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            title="Open Main Chat Platform (stconnection.bond)"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Main Platform</span>
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={handleAdminLogout}
            className="p-2 rounded-xl hover:bg-red-950/50 text-slate-400 hover:text-rose-400 transition cursor-pointer"
            title="Admin Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Admin Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Admin Navigation Sidebar */}
        <aside className="w-56 bg-[#0c131a] border-r border-[#1e293b] p-3 flex flex-col justify-between shrink-0">
          <nav className="space-y-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'maintenance', label: 'Maintenance Mode', icon: AlertTriangle, badge: systemSettings?.maintenanceMode ? 'ACTIVE' : undefined },
              { id: 'users', label: 'User Directory & Badges', icon: Users, badge: users.length },
              { id: 'moderation', label: 'Moderation Queue', icon: ShieldAlert, badge: reports.filter(r => r.status === 'pending').length },
              { id: 'website', label: 'Site Management', icon: Settings },
              { id: 'ai', label: 'Gemini AI Engine', icon: Bot },
              { id: 'security', label: 'Security & Backup', icon: Database },
            ].map(item => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                    active
                      ? 'bg-red-600 text-white shadow-lg shadow-red-950/40'
                      : 'text-slate-400 hover:text-white hover:bg-[#151f28]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge !== 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                      active ? 'bg-black/30 text-white' : 'bg-[#1e293b] text-slate-300'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick System Info */}
          <div className="p-3 bg-[#131b24] rounded-xl border border-[#1e293b] text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center justify-between">
              <span>Platform:</span>
              <span className="text-emerald-400 font-mono">Live</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Gate Code:</span>
              <span className="text-white font-mono">{systemSettings?.accessPassword || '782223'}</span>
            </div>
          </div>
        </aside>

        {/* Tab Content Stage */}
        <main className="flex-1 bg-[#070d12] overflow-y-auto p-4 sm:p-6">
          {/* ==========================================
              1. DASHBOARD VIEW
              ========================================== */}
          {activeTab === 'dashboard' && stats && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div>
                <h2 className="text-xl font-bold text-white">Platform Health & Analytics</h2>
                <p className="text-xs text-slate-400">Real-time statistics across stconnection.bond infrastructure</p>
              </div>

              {/* Metric Cards Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-1">
                  <p className="text-xs text-slate-400">Total Registered Users</p>
                  <p className="text-2xl font-bold text-white font-mono">{stats.totalUsers}</p>
                  <p className="text-[11px] text-emerald-400">All registered accounts</p>
                </div>
                <div className="p-4 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-1">
                  <p className="text-xs text-slate-400">Online Users Now</p>
                  <p className="text-2xl font-bold text-emerald-400 font-mono">{stats.onlineUsers}</p>
                  <p className="text-[11px] text-slate-400">Active WebSocket peers</p>
                </div>
                <div className="p-4 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-1">
                  <p className="text-xs text-slate-400">Total Messages Dispatched</p>
                  <p className="text-2xl font-bold text-sky-400 font-mono">{stats.totalMessages}</p>
                  <p className="text-[11px] text-slate-400">Private & group chats</p>
                </div>
                <div className="p-4 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-1">
                  <p className="text-xs text-slate-400">Pending User Reports</p>
                  <p className="text-2xl font-bold text-amber-400 font-mono">{stats.pendingReports}</p>
                  <p className="text-[11px] text-slate-400">Requires moderation</p>
                </div>
              </div>

              {/* Server Stats & Feature State */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Server className="w-4 h-4 text-emerald-400" />
                    <span>Server Infrastructure</span>
                  </h3>
                  <div className="space-y-2 text-xs text-slate-300">
                    <div className="flex justify-between py-1 border-b border-[#1e293b]">
                      <span>Server Node Runtime:</span>
                      <span className="font-mono text-emerald-400">{stats.nodeVersion}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#1e293b]">
                      <span>Uptime:</span>
                      <span className="font-mono text-white">{Math.floor(stats.serverUptime / 60)} minutes</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#1e293b]">
                      <span>Memory Heap:</span>
                      <span className="font-mono text-white">{(stats.memoryUsage / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Gateway Access Code:</span>
                      <span className="font-mono text-amber-400 font-bold">{systemSettings?.accessPassword}</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-sky-400" />
                    <span>Real-Time Features Status</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {systemSettings && Object.entries(systemSettings.features).map(([key, val]) => (
                      <div key={key} className="p-2.5 rounded-xl bg-[#141d27] border border-[#1e293b] flex items-center justify-between">
                        <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          val ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {val ? 'ACTIVE' : 'DISABLED'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              MAINTENANCE MODE CONTROL
              ========================================== */}
          {activeTab === 'maintenance' && (
            <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                    <span>System Maintenance Mode</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Toggle platform-wide maintenance mode. When active, all main website visitors are presented with a maintenance screen.
                  </p>
                </div>
                <div className={`self-start sm:self-auto px-3 py-1.5 rounded-xl border text-xs font-bold uppercase tracking-wider ${
                  systemSettings?.maintenanceMode
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                }`}>
                  {systemSettings?.maintenanceMode ? 'Maintenance Mode Active' : 'System Live & Operational'}
                </div>
              </div>

              {/* Maintenance Card */}
              <div className="p-6 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-[#141d27] border border-[#1e293b] gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Maintenance Switch</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {systemSettings?.maintenanceMode
                        ? 'Visitors on stconnection.bond are currently blocked with maintenance screen.'
                        : 'Platform is operating normally. All users can log in and message.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={maintLoading}
                    onClick={() => handleToggleMaintenance(!systemSettings?.maintenanceMode)}
                    className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shrink-0 ${
                      systemSettings?.maintenanceMode
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                        : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/50'
                    }`}
                  >
                    <Wrench className="w-4 h-4" />
                    <span>{systemSettings?.maintenanceMode ? 'Disable Maintenance (Go Live)' : 'Enable Maintenance Mode'}</span>
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Custom Maintenance Message (Shown to Visitors)
                  </label>
                  <textarea
                    value={maintMessage}
                    onChange={(e) => setMaintMessage(e.target.value)}
                    rows={4}
                    placeholder="e.g. ST CONNECTION is undergoing scheduled updates..."
                    className="w-full bg-[#18222d] border border-[#263442] focus:border-amber-500 rounded-xl p-3 text-xs text-white outline-none"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={maintLoading}
                    onClick={() => handleToggleMaintenance(Boolean(systemSettings?.maintenanceMode))}
                    className="px-4 py-2 bg-[#202c38] hover:bg-[#2a3948] text-white text-xs font-semibold rounded-xl border border-[#263442] transition cursor-pointer"
                  >
                    Save Notice Message
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              2. USER DIRECTORY & MANAGEMENT
              ========================================== */}
          {activeTab === 'users' && (
            <div className="space-y-4 max-w-6xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-white">User Directory & Badges</h2>
                  <p className="text-xs text-slate-400">Manage user accounts, roles, Blue Tick (verified), Developer Tick, and suspensions</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Filter users..."
                      className="bg-[#0f171e] border border-[#1e293b] rounded-xl px-3 py-1.5 pl-8 text-xs text-white outline-none w-48"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="bg-[#0f171e] border border-[#1e293b] rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="all">All Roles</option>
                    <option value="super_admin">Super Admin</option>
                    <option value="admin">Admin</option>
                    <option value="moderator">Moderator</option>
                    <option value="user">User</option>
                  </select>
                </div>
              </div>

              {/* Badge Assignment by Username Card */}
              <div className="p-5 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-3 shadow">
                <div className="flex items-center gap-2 text-white font-semibold text-sm">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  <span>Assign Badges by Username</span>
                  <span className="text-[11px] text-slate-400 font-normal">(Give Blue Tick or Developer Tick)</span>
                </div>
                <form onSubmit={handleAssignBadgesByUsername} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-400 mb-1 font-medium">Username to grant tick</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={badgeUsername}
                        onChange={(e) => setBadgeUsername(e.target.value)}
                        placeholder="Enter username (e.g. superadmin or alex)"
                        required
                        className="w-full bg-[#18222d] border border-[#263442] focus:border-sky-500 rounded-xl px-3 py-2 text-xs text-white outline-none pl-7"
                      />
                      <span className="text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 text-xs">@</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 py-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={giveBlueTick}
                        onChange={(e) => setGiveBlueTick(e.target.checked)}
                        className="rounded accent-sky-500 w-4 h-4"
                      />
                      <span className="flex items-center gap-1 font-medium text-sky-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Blue Tick
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={giveDevTick}
                        onChange={(e) => setGiveDevTick(e.target.checked)}
                        className="rounded accent-purple-500 w-4 h-4"
                      />
                      <span className="flex items-center gap-1 font-medium text-purple-400">
                        <Code2 className="w-3.5 h-3.5" /> Dev Tick
                      </span>
                    </label>
                  </div>

                  <div>
                    <button
                      type="submit"
                      disabled={badgeLoading}
                      className="w-full bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2 px-3 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{badgeLoading ? 'Updating...' : 'Apply Badges'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Users Table */}
              <div className="bg-[#0f171e] border border-[#1e293b] rounded-2xl overflow-hidden shadow">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-[#141d27] text-slate-400 border-b border-[#1e293b] font-medium">
                      <tr>
                        <th className="p-3.5">User</th>
                        <th className="p-3.5">Email / Handle</th>
                        <th className="p-3.5">Role</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5">Blue Tick</th>
                        <th className="p-3.5">Developer Tick</th>
                        <th className="p-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e293b]">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-[#141d27]/40 transition">
                          <td className="p-3.5">
                            <div className="flex items-center gap-2.5">
                              <img src={u.avatar} alt={u.username} className="w-8 h-8 rounded-full object-cover border border-[#1e293b]" />
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="font-semibold text-white">{u.displayName}</p>
                                  {u.verified && (
                                    <span title="Verified Blue Tick">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                    </span>
                                  )}
                                  {u.developer && (
                                    <span className="px-1 py-0.2 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[9px] font-bold font-mono">
                                      DEV
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-500 font-mono">{u.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <p className="text-white">@{u.username}</p>
                            <p className="text-[11px] text-slate-400">{u.email}</p>
                          </td>
                          <td className="p-3.5">
                            {adminUser.role === 'super_admin' ? (
                              <select
                                value={u.role}
                                onChange={(e) => handleUpdateRole(u, e.target.value as any)}
                                disabled={u.role === 'super_admin' && u.id === adminUser.id}
                                className="bg-[#18222d] border border-[#263442] rounded-lg px-2 py-1 text-xs text-white outline-none cursor-pointer"
                              >
                                <option value="super_admin">Super Admin</option>
                                <option value="admin">Admin</option>
                                <option value="moderator">Moderator</option>
                                <option value="user">User</option>
                              </select>
                            ) : (
                              <span className="font-mono capitalize">{u.role}</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <select
                              value={u.status}
                              onChange={(e) => handleUpdateStatus(u, e.target.value as any)}
                              disabled={u.role === 'super_admin'}
                              className={`rounded-lg px-2 py-1 text-xs font-semibold outline-none border cursor-pointer ${
                                u.status === 'active'
                                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
                                  : u.status === 'suspended'
                                  ? 'bg-amber-950/40 text-amber-400 border-amber-800'
                                  : 'bg-red-950/40 text-red-400 border-red-800'
                              }`}
                            >
                              <option value="active">Active</option>
                              <option value="suspended">Suspended</option>
                              <option value="banned">Banned</option>
                            </select>
                          </td>
                          <td className="p-3.5">
                            <button
                              type="button"
                              onClick={() => handleToggleVerified(u)}
                              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                                u.verified ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'bg-slate-800 text-slate-400 hover:text-white'
                              }`}
                              title="Toggle Blue Tick (Verified)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{u.verified ? 'Blue Tick' : 'None'}</span>
                            </button>
                          </td>
                          <td className="p-3.5">
                            <button
                              type="button"
                              onClick={() => handleToggleDeveloper(u)}
                              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                                u.developer ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-slate-800 text-slate-400 hover:text-white'
                              }`}
                              title="Toggle Developer Tick"
                            >
                              <Code2 className="w-3.5 h-3.5" />
                              <span>{u.developer ? 'Dev Tick' : 'None'}</span>
                            </button>
                          </td>
                          <td className="p-3.5 text-right">
                            {adminUser.role === 'super_admin' && u.role !== 'super_admin' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-200 border border-red-800/40 transition cursor-pointer"
                                title="Permanently delete user"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              3. MODERATION CENTER
              ========================================== */}
          {activeTab === 'moderation' && (
            <div className="space-y-4 max-w-5xl mx-auto">
              <div>
                <h2 className="text-xl font-bold text-white">Moderation & User Reports Queue</h2>
                <p className="text-xs text-slate-400">Review reported infractions, spam, and safety complaints</p>
              </div>

              {reports.length === 0 ? (
                <div className="p-8 text-center bg-[#0f171e] rounded-2xl border border-[#1e293b] text-slate-500 text-xs">
                  All user reports resolved! No pending issues.
                </div>
              ) : (
                <div className="space-y-3">
                  {reports.map((rep) => (
                    <div
                      key={rep.id}
                      className="p-5 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            rep.status === 'pending' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {rep.status}
                          </span>
                          <span className="text-xs font-semibold text-white">Target: {rep.targetLabel}</span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {new Date(rep.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="bg-[#141d27] p-3 rounded-xl text-xs space-y-1">
                        <p><span className="text-slate-400">Reporter:</span> <span className="text-white">@{rep.reporterUsername}</span></p>
                        <p><span className="text-slate-400">Reason Category:</span> <span className="text-red-400 font-semibold">{rep.reason}</span></p>
                        {rep.details && <p><span className="text-slate-400">Details:</span> <span className="text-slate-200">{rep.details}</span></p>}
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleReportAction(rep.id, 'dismiss')}
                          className="px-3 py-1.5 rounded-lg bg-[#18222d] hover:bg-[#202c38] text-xs text-slate-300 transition cursor-pointer"
                        >
                          Dismiss Report
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReportAction(rep.id, 'resolve')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-xs transition cursor-pointer"
                        >
                          Mark Resolved
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReportAction(rep.id, 'suspend_target')}
                          className="px-3 py-1.5 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/40 text-xs transition cursor-pointer"
                        >
                          Suspend Target User
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReportAction(rep.id, 'ban_target')}
                          className="px-3 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-300 border border-red-500/40 text-xs transition cursor-pointer"
                        >
                          Permanently Ban
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==========================================
              4. WEBSITE MANAGEMENT
              ========================================== */}
          {activeTab === 'website' && systemSettings && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div>
                <h2 className="text-xl font-bold text-white">Platform Governance & Access Controls</h2>
                <p className="text-xs text-slate-400">Configure global website access password, registration, and maintenance mode</p>
              </div>

              {/* Access Password Change */}
              <div className="p-5 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Website Common Access Password</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Every visitor on <span className="text-emerald-400">stconnection.bond</span> must supply this code before the login screen appears.
                </p>

                <div className="flex items-center gap-3 max-w-sm">
                  <input
                    type="text"
                    defaultValue={systemSettings.accessPassword}
                    id="input-access-pass"
                    className="bg-[#18222d] border border-[#263442] focus:border-emerald-500 rounded-xl px-4 py-2 font-mono text-sm text-white outline-none flex-1 text-center"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = (document.getElementById('input-access-pass') as HTMLInputElement)?.value;
                      if (val) handleSaveSettings({ accessPassword: val });
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl transition cursor-pointer"
                  >
                    Update Password
                  </button>
                </div>
              </div>

              {/* Maintenance Mode & Registration Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white">Public User Registration</h4>
                      <p className="text-xs text-slate-400">Allow new visitors to register accounts</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={systemSettings.registrationEnabled}
                      onChange={(e) => handleSaveSettings({ registrationEnabled: e.target.checked })}
                      className="w-5 h-5 accent-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white">Maintenance Mode</h4>
                      <p className="text-xs text-slate-400">Block public access with message</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={systemSettings.maintenanceMode}
                      onChange={(e) => handleSaveSettings({ maintenanceMode: e.target.checked })}
                      className="w-5 h-5 accent-red-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Global Announcement Banner */}
              <div className="p-5 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-3">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-sky-400" />
                  <h3 className="text-sm font-bold text-white">Global Platform Announcement Banner</h3>
                </div>
                <input
                  type="text"
                  defaultValue={systemSettings.siteSettings.announcement}
                  id="input-announcement"
                  placeholder="Broadcast message to all connected clients..."
                  className="w-full bg-[#18222d] border border-[#263442] focus:border-sky-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const text = (document.getElementById('input-announcement') as HTMLInputElement)?.value;
                    handleSaveSettings({
                      siteSettings: { ...systemSettings.siteSettings, announcement: text || '' }
                    });
                  }}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs rounded-xl transition cursor-pointer"
                >
                  Broadcast Announcement
                </button>
              </div>
            </div>
          )}

          {/* ==========================================
              5. GEMINI AI ENGINE MANAGEMENT
              ========================================== */}
          {activeTab === 'ai' && systemSettings && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div>
                <h2 className="text-xl font-bold text-white">Google Gemini AI Engine Controls</h2>
                <p className="text-xs text-slate-400">Manage server-side Gemini intelligence models, system instructions, and API key authentication</p>
              </div>

              {/* 1. API KEY CONFIGURATION & STATUS */}
              <div className="p-5 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1e293b]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Google Gemini API Authentication</h3>
                      <p className="text-xs text-slate-400">Server-side proxy authentication (`GEMINI_API_KEY`)</p>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div className="flex items-center gap-2">
                    {aiKeyStatus?.configured ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Active ({aiKeyStatus.maskedKey})</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Not Configured</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* API Key Update Form (Super Admin only) */}
                {adminUser.role === 'super_admin' ? (
                  <form onSubmit={handleUpdateAiKey} className="space-y-3">
                    <label className="block text-xs font-medium text-slate-300">
                      Set / Update Server API Key
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="password"
                        value={newApiKey}
                        onChange={(e) => setNewApiKey(e.target.value)}
                        placeholder={aiKeyStatus?.configured ? "Enter new API key to replace current key..." : "Paste Gemini API key (e.g. AQ.Ab8...)"}
                        className="flex-1 bg-[#18222d] border border-[#263442] focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none font-mono"
                      />
                      <button
                        type="submit"
                        disabled={updatingAiKey || !newApiKey.trim()}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shrink-0 shadow-lg shadow-emerald-950/30"
                      >
                        {updatingAiKey && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <span>Save & Activate Key</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      This updates the active key in server memory and writes it to the server environment. The key is never exposed to browser clients or external scripts.
                    </p>
                  </form>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    Only Super Administrators have permission to modify the backend API key credentials.
                  </p>
                )}

                {/* Live Test Connection Button & Output */}
                <div className="pt-3 border-t border-[#1e293b] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-300">
                    Verify live communication with Google Gemini servers:
                  </div>
                  <button
                    type="button"
                    onClick={handleTestAi}
                    disabled={testingAi}
                    className="px-4 py-2 bg-[#1e293b] hover:bg-[#283548] text-slate-200 hover:text-white text-xs font-semibold rounded-xl border border-[#334155] transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                  >
                    {testingAi ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                        <span>Testing Connection...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Test Live Connection</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Test Result Banner */}
                {aiTestResult && (
                  <div
                    className={`p-3 rounded-xl text-xs border flex items-start gap-2.5 transition animate-in fade-in ${
                      aiTestResult.success
                        ? 'bg-emerald-950/40 text-emerald-200 border-emerald-500/30'
                        : 'bg-rose-950/40 text-rose-200 border-rose-500/30'
                    }`}
                  >
                    {aiTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 space-y-1">
                      <div className="font-semibold flex items-center justify-between">
                        <span>{aiTestResult.success ? 'Gemini AI Verified & Active' : 'Connection Failed'}</span>
                        {aiTestResult.latency && (
                          <span className="font-mono text-[10px] bg-emerald-900/60 px-2 py-0.5 rounded text-emerald-300">
                            {aiTestResult.latency}ms
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">{aiTestResult.message}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. PLATFORM AI FEATURE TOGGLES & PROMPTS */}
              <div className="p-5 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
                  <div>
                    <h3 className="text-sm font-bold text-white">Enable AI Features Platform-Wide</h3>
                    <p className="text-xs text-slate-400">Powers ST Assistant, smart replies, tone rewriting and translations</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={systemSettings.aiSettings.enabled}
                    onChange={(e) => handleSaveSettings({
                      aiSettings: { ...systemSettings.aiSettings, enabled: e.target.checked }
                    })}
                    className="w-5 h-5 accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Selected Gemini Model</label>
                  <select
                    value={systemSettings.aiSettings.model}
                    onChange={(e) => handleSaveSettings({
                      aiSettings: { ...systemSettings.aiSettings, model: e.target.value }
                    })}
                    className="bg-[#18222d] border border-[#263442] rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer w-full max-w-sm"
                  >
                    <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended Fast)</option>
                    <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Ultra Lightweight)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">ST Assistant System Prompt</label>
                  <textarea
                    rows={4}
                    defaultValue={systemSettings.aiSettings.systemPrompt}
                    id="ai-prompt-input"
                    className="w-full bg-[#18222d] border border-[#263442] rounded-xl p-3 text-xs text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = (document.getElementById('ai-prompt-input') as HTMLTextAreaElement)?.value;
                      handleSaveSettings({
                        aiSettings: { ...systemSettings.aiSettings, systemPrompt: val }
                      });
                    }}
                    className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-xl transition cursor-pointer"
                  >
                    Save AI System Prompt
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              6. SECURITY, AUDIT LOGS & BACKUP
              ========================================== */}
          {activeTab === 'security' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div>
                <h2 className="text-xl font-bold text-white">Security Governance, Audit Logs & Database Snapshots</h2>
                <p className="text-xs text-slate-400">Complete audit logs, backup export, and restoration</p>
              </div>

              {/* Pterodactyl Panel MySQL Database Status */}
              <div className="p-5 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Pterodactyl Panel Database Engine</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                          dbInfo?.connected
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                          {dbInfo?.connected ? 'MySQL Active' : 'Local Fallback'}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-400">
                        {dbInfo?.type || 'Loading database status...'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      api.getDatabaseStatus().then(info => {
                        setDbInfo(info);
                        notify('Database status refreshed.');
                      });
                    }}
                    className="px-3 py-1.5 bg-[#18222d] hover:bg-[#202c38] text-slate-300 border border-[#263442] text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Check Connection</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-[#080d12] border border-[#1e293b]">
                    <div className="text-[11px] text-slate-400 font-medium">Database Host</div>
                    <div className="text-xs font-semibold text-slate-200 mt-0.5 truncate font-mono">
                      {dbInfo?.host || 'localhost'}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#080d12] border border-[#1e293b]">
                    <div className="text-[11px] text-slate-400 font-medium">Database Name</div>
                    <div className="text-xs font-semibold text-slate-200 mt-0.5 truncate font-mono">
                      {dbInfo?.database || 'database.json'}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#080d12] border border-[#1e293b]">
                    <div className="text-[11px] text-slate-400 font-medium">Database User</div>
                    <div className="text-xs font-semibold text-slate-200 mt-0.5 truncate font-mono">
                      {dbInfo?.user || 'local'}
                    </div>
                  </div>
                </div>

                {!dbInfo?.connected && (
                  <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-slate-300 leading-relaxed">
                    <span className="font-semibold text-blue-400">Pterodactyl Configuration Guide: </span>
                    Pterodactyl panel ke <strong>Databases</strong> tab me jaakar database banayein aur server ke <strong>Startup / Environment Variables</strong> me yeh daalein:
                    <div className="mt-2 p-2 rounded bg-black/40 font-mono text-[11px] text-emerald-400 space-y-0.5 select-all">
                      <div>DB_HOST=&lt;your_pterodactyl_host&gt;</div>
                      <div>DB_PORT=3306</div>
                      <div>DB_NAME=&lt;database_name&gt;</div>
                      <div>DB_USER=&lt;database_username&gt;</div>
                      <div>DB_PASSWORD=&lt;database_password&gt;</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Database Snapshots */}
              <div className="p-5 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>Database Snapshots & Disaster Recovery</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Export complete JSON snapshot of all platform users, messages, channels, stories and settings.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDownloadBackup}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl flex items-center gap-2 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Complete DB Backup</span>
                  </button>

                  <label className="px-4 py-2.5 bg-[#18222d] hover:bg-[#202c38] text-slate-200 border border-[#263442] font-medium text-xs rounded-xl flex items-center gap-2 transition cursor-pointer">
                    <Upload className="w-4 h-4 text-emerald-400" />
                    <span>Restore From JSON Backup</span>
                    <input type="file" accept=".json" onChange={handleRestoreBackup} className="hidden" />
                  </label>

                  <button
                    type="button"
                    onClick={handleResetDatabase}
                    className="px-4 py-2.5 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 font-medium text-xs rounded-xl flex items-center gap-2 transition cursor-pointer ml-auto"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Reset to Factory Defaults</span>
                  </button>
                </div>
              </div>

              {/* Audit Logs Table */}
              <div className="p-5 rounded-2xl bg-[#0f171e] border border-[#1e293b] space-y-3">
                <h3 className="text-sm font-bold text-white">Administrator Audit Logs</h3>
                <div className="max-h-64 overflow-y-auto space-y-1.5 font-mono text-[11px]">
                  {logs.auditLogs.map((log) => (
                    <div key={log.id} className="p-2.5 rounded-lg bg-[#141d27] border border-[#1e293b] flex items-center justify-between gap-4">
                      <div className="truncate">
                        <span className="text-red-400 font-bold">{log.action}: </span>
                        <span className="text-slate-300">{log.target}</span>
                      </div>
                      <div className="text-slate-500 shrink-0 text-[10px]">
                        <span>by @{log.adminUsername}</span> • <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
