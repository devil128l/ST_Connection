import React, { useState, useRef } from 'react';
import {
  User,
  Shield,
  Palette,
  Download,
  Trash2,
  Check,
  AlertTriangle,
  Lock,
  Smartphone,
  Sparkles,
  Upload,
} from 'lucide-react';
import { SafeUser } from '../types.js';
import { api } from '../utils/api.js';

interface SettingsViewProps {
  currentUser: SafeUser;
  onUpdateUser: (user: SafeUser) => void;
  onLogout: () => void;
  selectedWallpaper: string;
  onSelectWallpaper: (wallpaper: string) => void;
}

const AVATAR_PRESETS = [
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%2310b981'/%3E%3Ccircle cx='50' cy='38' r='18' fill='white'/%3E%3Cpath d='M25 85 C25 65 35 58 50 58 C65 58 75 65 75 85 Z' fill='white'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%236366f1'/%3E%3Ccircle cx='50' cy='38' r='18' fill='white'/%3E%3Cpath d='M25 85 C25 65 35 58 50 58 C65 58 75 65 75 85 Z' fill='white'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%230284c7'/%3E%3Ccircle cx='50' cy='38' r='18' fill='white'/%3E%3Cpath d='M25 85 C25 65 35 58 50 58 C65 58 75 65 75 85 Z' fill='white'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%23f59e0b'/%3E%3Ccircle cx='50' cy='38' r='18' fill='white'/%3E%3Cpath d='M25 85 C25 65 35 58 50 58 C65 58 75 65 75 85 Z' fill='white'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%23ec4899'/%3E%3Ccircle cx='50' cy='38' r='18' fill='white'/%3E%3Cpath d='M25 85 C25 65 35 58 50 58 C65 58 75 65 75 85 Z' fill='white'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='50' fill='%238b5cf6'/%3E%3Ccircle cx='50' cy='38' r='18' fill='white'/%3E%3Cpath d='M25 85 C25 65 35 58 50 58 C65 58 75 65 75 85 Z' fill='white'/%3E%3C/svg%3E",
];

export const WALLPAPER_PRESETS = [
  { id: 'default', name: 'Dark Slate (Default)', class: 'bg-[#0b141a]' },
  { id: 'whatsapp_teal', name: 'WhatsApp Emerald', class: 'bg-[#08201a]' },
  { id: 'midnight', name: 'Midnight Navy', class: 'bg-[#0a0f1d]' },
  { id: 'doodle', name: 'WhatsApp Doodle Pattern', class: 'bg-[#0d1418] bg-[radial-gradient(#1f2c34_1px,transparent_1px)] [background-size:16px_16px]' },
  { id: 'amethyst', name: 'Deep Amethyst', class: 'bg-[#150d1e]' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentUser,
  onUpdateUser,
  onLogout,
  selectedWallpaper,
  onSelectWallpaper,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'appearance' | 'data'>('profile');
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [bio, setBio] = useState(currentUser.bio);
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [coverImage, setCoverImage] = useState(currentUser.coverImage || '');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(currentUser.twoFactorEnabled);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const updated = await api.updateProfile({
        displayName,
        bio,
        avatar,
        coverImage,
        twoFactorEnabled,
      });
      onUpdateUser(updated);
      setStatusMsg({ text: 'Profile changes saved successfully!' });
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Failed to save profile', isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    setIsSaving(true);
    setStatusMsg(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setStatusMsg({ text: 'Password updated successfully!' });
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'Password update failed', isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportData = async () => {
    try {
      const blob = await api.exportData();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stconnection_${currentUser.username}_export.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert('Failed to export data.');
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      alert('Please enter your password to confirm account deletion.');
      return;
    }
    if (!confirm('Are you absolutely certain? This will permanently delete your account, messages, and profile!')) {
      return;
    }
    try {
      await api.deleteAccount(deletePassword);
      onLogout();
    } catch (err: any) {
      alert(err?.message || 'Could not delete account.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#111b21] text-white overflow-y-auto p-4 sm:p-6">
      <div className="max-w-2xl mx-auto w-full">
        <h2 className="text-xl font-bold mb-1">Account & Preferences</h2>
        <p className="text-xs text-slate-400 mb-6">Manage profile identity, security credentials and chat customizations</p>

        {/* Tab Pills */}
        <div className="flex bg-[#202c33] p-1 rounded-xl mb-6 border border-[#2a3942]/60 gap-1 overflow-x-auto">
          {[
            { id: 'profile', label: 'Profile', icon: User },
            { id: 'security', label: 'Security & 2FA', icon: Shield },
            { id: 'appearance', label: 'Chat Wallpaper', icon: Palette },
            { id: 'data', label: 'Privacy & Data', icon: Download },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTab(tab.id as any); setStatusMsg(null); }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  active ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {statusMsg && (
          <div className={`p-3 rounded-xl mb-4 text-xs flex items-center gap-2 ${
            statusMsg.isError ? 'bg-red-950/40 border border-red-800 text-red-300' : 'bg-emerald-950/40 border border-emerald-800 text-emerald-300'
          }`}>
            <Check className="w-4 h-4 shrink-0" />
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* 1. PROFILE TAB */}
        {activeTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-5 bg-[#202c33] p-5 sm:p-6 rounded-2xl border border-[#2a3942]/60">
            <div className="flex flex-col sm:flex-row items-center gap-4 pb-4 border-b border-[#2a3942]">
              <img
                src={avatar}
                alt={displayName}
                className="w-20 h-20 rounded-full object-cover border-2 border-emerald-500 shadow-lg"
              />
              <div className="text-center sm:text-left flex-1">
                <h4 className="text-sm font-bold text-white">{currentUser.displayName}</h4>
                <p className="text-xs text-slate-400">@{currentUser.username}</p>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">User ID: {currentUser.id}</p>
              </div>
            </div>

            {/* Avatar preset selection */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">Choose Avatar Preset</label>
              <div className="flex gap-2.5 flex-wrap">
                {AVATAR_PRESETS.map((p, i) => (
                  <img
                    key={i}
                    src={p}
                    alt="preset"
                    onClick={() => setAvatar(p)}
                    className={`w-10 h-10 rounded-full object-cover cursor-pointer border-2 transition ${
                      avatar === p ? 'border-emerald-400 scale-105' : 'border-transparent hover:opacity-80'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-300">Profile Picture</label>
                <button
                  type="button"
                  onClick={() => avatarFileRef.current?.click()}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Image File</span>
                </button>
              </div>
              <input
                ref={avatarFileRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarFileUpload}
                className="hidden"
              />
              <input
                type="text"
                value={avatar.startsWith('data:') ? '(Uploaded photo file)' : avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="https://... or upload photo above"
                className="w-full bg-[#111b21] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-[#111b21] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Bio / About</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full bg-[#111b21] border border-[#2a3942] focus:border-emerald-500 rounded-xl p-3 text-xs text-white outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-semibold text-white shadow-lg transition cursor-pointer"
            >
              {isSaving ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </form>
        )}

        {/* 2. SECURITY & 2FA */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* 2FA Toggle */}
            <div className="bg-[#202c33] p-5 sm:p-6 rounded-2xl border border-[#2a3942]/60 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                  <h4 className="text-sm font-bold text-white">Two-Factor Authentication (2FA)</h4>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Require a 6-digit confirmation code on every sign-in to protect your communications.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={twoFactorEnabled}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    setTwoFactorEnabled(checked);
                    try {
                      const updated = await api.updateProfile({ twoFactorEnabled: checked });
                      onUpdateUser(updated);
                      setStatusMsg({ text: `2FA ${checked ? 'enabled' : 'disabled'} successfully.` });
                    } catch {}
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Change Password */}
            <form onSubmit={handleChangePassword} className="bg-[#202c33] p-5 sm:p-6 rounded-2xl border border-[#2a3942]/60 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-5 h-5 text-emerald-400" />
                <h4 className="text-sm font-bold text-white">Change Account Password</h4>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new strong password"
                  className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-semibold text-white shadow-lg transition cursor-pointer"
              >
                Update Password
              </button>
            </form>
          </div>
        )}

        {/* 3. APPEARANCE & WALLPAPERS */}
        {activeTab === 'appearance' && (
          <div className="bg-[#202c33] p-5 sm:p-6 rounded-2xl border border-[#2a3942]/60 space-y-4">
            <h4 className="text-sm font-bold text-white">Chat Wallpaper Customization</h4>
            <p className="text-xs text-slate-400">Choose your preferred backdrop for message threads</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {WALLPAPER_PRESETS.map((wall) => {
                const isSelected = selectedWallpaper === wall.id;
                return (
                  <div
                    key={wall.id}
                    onClick={() => {
                      onSelectWallpaper(wall.id);
                      localStorage.setItem('st_chat_wallpaper', wall.id);
                    }}
                    className={`h-28 rounded-xl p-3 border-2 flex flex-col justify-between cursor-pointer transition relative overflow-hidden ${
                      isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-[#2a3942] hover:border-slate-500'
                    } ${wall.class}`}
                  >
                    <span className="text-xs font-medium text-white shadow-sm">{wall.name}</span>
                    {isSelected && (
                      <div className="self-end p-1 rounded-full bg-emerald-500 text-black">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. PRIVACY & DATA */}
        {activeTab === 'data' && (
          <div className="space-y-6">
            {/* Export data */}
            <div className="bg-[#202c33] p-5 sm:p-6 rounded-2xl border border-[#2a3942]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-white">Download My Data Archive</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Export an official GDPR-compliant JSON archive of your profile, messages, and social updates.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportData}
                className="px-4 py-2.5 bg-[#2a3942] hover:bg-[#32444f] rounded-xl text-xs font-semibold text-white flex items-center gap-2 transition cursor-pointer self-start sm:self-auto shrink-0"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Export JSON Data</span>
              </button>
            </div>

            {/* Delete Account */}
            <div className="bg-red-950/20 p-5 sm:p-6 rounded-2xl border border-red-900/40 space-y-3">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
                <h4 className="text-sm font-bold">Delete Account & Communications</h4>
              </div>
              <p className="text-xs text-slate-400">
                Permanently purge your account, profile photos, direct messages and stories from ST CONNECTION servers. This action is irreversible.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Enter password to confirm"
                  className="w-full bg-[#111b21] border border-red-900/50 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleDeleteAccount}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs font-semibold text-white flex items-center gap-2 transition cursor-pointer shadow-lg shadow-rose-950/50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Permanently Delete My Account</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
