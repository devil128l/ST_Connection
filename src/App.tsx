import React, { useState, useEffect } from 'react';
import { api } from './utils/api.js';
import { SafeUser } from './types.js';
import { AuthModal } from './components/AuthModal.js';
import { MainChatApp } from './components/MainChatApp.js';
import { AdminPortal } from './admin/AdminPortal.js';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

export default function App() {
  // Current active portal: 'main' (stconnection.bond) or 'admin' (admin.stconnection.bond)
  const [currentPortal, setCurrentPortal] = useState<'main' | 'admin'>(() => {
    const host = window.location.hostname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname.toLowerCase();
    if (host.startsWith('admin.') || params.get('portal') === 'admin' || path.startsWith('/admin')) {
      return 'admin';
    }
    return 'main';
  });

  // Current authenticated chat user (isolated from admin session)
  const [currentUser, setCurrentUser] = useState<SafeUser | null>(() => {
    const user = api.getCurrentUser();
    // Prevent accidental superadmin contamination from old sessions
    if (user && user.role === 'super_admin' && !api.getAuthToken()) {
      api.clearAuthSession();
      return null;
    }
    return user;
  });

  // Platform public configuration
  const [gateConfig, setGateConfig] = useState<{
    siteName: string;
    logoUrl: string;
    announcement: string;
    maintenanceMode: boolean;
    maintenanceMessage: string;
  } | null>(null);

  const [loadingConfig, setLoadingConfig] = useState(true);

  useEffect(() => {
    api.getGateConfig()
      .then(cfg => setGateConfig(cfg))
      .catch(() => {})
      .finally(() => setLoadingConfig(false));

    // If user is stored, refresh their session
    if (currentUser) {
      api.getMe()
        .then(u => setCurrentUser(u))
        .catch(() => {
          // Token expired
          api.clearAuthSession();
          setCurrentUser(null);
        });
    }
  }, []);

  // Sync portal changes to URL parameter for convenience in dev preview
  const handleSwitchToAdmin = () => {
    setCurrentPortal('admin');
    window.history.replaceState({}, '', '?portal=admin');
  };

  const handleSwitchToMain = () => {
    setCurrentPortal('main');
    window.history.replaceState({}, '', '/');
    const chatUser = api.getCurrentUser();
    setCurrentUser(chatUser);
  };

  // Maintenance mode screen if active and not in admin portal
  if (gateConfig?.maintenanceMode && currentPortal === 'main') {
    return (
      <div className="min-h-screen bg-[#0b141a] text-slate-100 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">System Under Maintenance</h1>
        <p className="text-xs text-slate-400 max-w-md leading-relaxed mb-6">
          {gateConfig.maintenanceMessage || 'ST CONNECTION is currently performing scheduled system updates. Service will resume shortly.'}
        </p>
        <button
          type="button"
          onClick={handleSwitchToAdmin}
          className="px-4 py-2 bg-[#202c33] hover:bg-[#2a3942] text-xs font-semibold text-slate-300 rounded-xl transition cursor-pointer border border-[#2a3942]"
        >
          Administrator Login Portal
        </button>
      </div>
    );
  }

  // PORTAL 1: SEPARATE ADMIN WEBSITE
  if (currentPortal === 'admin') {
    return (
      <AdminPortal onSwitchToMainSite={handleSwitchToMain} />
    );
  }

  // Step 2B: Visitor enters login / register account screen
  if (!currentUser) {
    return (
      <AuthModal
        onSuccess={(user) => setCurrentUser(user)}
        siteName={gateConfig?.siteName || 'ST CONNECTION'}
        logoUrl={gateConfig?.logoUrl || '/icon.svg'}
      />
    );
  }

  // Step 2C: Full Real-Time Messaging Application
  return (
    <MainChatApp
      currentUser={currentUser}
      onLogout={() => {
        api.clearAuthSession();
        setCurrentUser(null);
      }}
      onSwitchToAdmin={handleSwitchToAdmin}
      siteName={gateConfig?.siteName || 'ST CONNECTION'}
      announcement={gateConfig?.announcement}
    />
  );
}
