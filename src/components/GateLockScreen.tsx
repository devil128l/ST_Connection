import React, { useState } from 'react';
import { Lock, ShieldCheck, KeyRound, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';
import { api } from '../utils/api.js';

interface GateLockScreenProps {
  onVerified: () => void;
  siteName?: string;
  logoUrl?: string;
}

export const GateLockScreen: React.FC<GateLockScreenProps> = ({
  onVerified,
  siteName = 'ST CONNECTION',
  logoUrl = '/icon.svg',
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter the platform access password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.verifyGate(password.trim());
      if (res.success) {
        if (!rememberDevice) {
          sessionStorage.setItem('st_gate_token', res.gateToken);
        }
        onVerified();
      } else {
        setError(res.message || 'Access code rejected.');
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid access code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fillDefaultCode = () => {
    setPassword('782223');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#0b141a] text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Card */}
        <div className="bg-[#111b21] border border-[#202c33] rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="relative mb-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
                <img src={logoUrl} alt="Logo" className="w-12 h-12 object-contain" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-black p-1 rounded-full shadow">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
              {siteName}
            </h1>
            <p className="text-xs text-slate-400 max-w-xs">
              Protected Gateway • Common website access authentication required to enter
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Access Security Password</span>
                <span className="text-[11px] text-slate-400">Visitor Verification</span>
              </label>

              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Enter 6-digit access code"
                  maxLength={20}
                  autoFocus
                  className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-4 py-3 pl-11 text-center tracking-[0.25em] text-lg font-mono text-white placeholder:tracking-normal placeholder:text-xs placeholder:font-sans placeholder:text-slate-500 outline-none transition"
                />
                <KeyRound className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-950/40 border border-red-800/50 text-red-300 text-xs p-3 rounded-xl animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <p>{error}</p>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-400">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="rounded border-[#2a3942] bg-[#202c33] text-emerald-500 focus:ring-emerald-500/30"
                />
                <span>Remember verified access</span>
              </label>
              <span className="text-[11px] text-slate-500">AES-256 Secured</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-medium py-3 px-4 rounded-xl shadow-lg shadow-emerald-900/30 transition flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Unlock ST CONNECTION</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Visitor Security Notice */}
          <div className="mt-6 pt-5 border-t border-[#202c33]">
            <p className="text-[11px] text-center text-slate-400">
              ST CONNECTION Gateway Protection &bull; Authorized members and visitors only
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center mt-4 text-[11px] text-slate-500 flex items-center justify-center gap-2">
          <Lock className="w-3 h-3 text-emerald-500/80" />
          <span>ST CONNECTION Security Gateway • stconnection.bond</span>
        </div>
      </div>
    </div>
  );
};
