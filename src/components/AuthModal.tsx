import React, { useState } from 'react';
import { User, Mail, Lock, Shield, CheckCircle2, AlertCircle, ArrowRight, UserPlus, KeyRound, Sparkles } from 'lucide-react';
import { api } from '../utils/api.js';
import { SafeUser } from '../types.js';

interface AuthModalProps {
  onSuccess: (user: SafeUser) => void;
  siteName?: string;
  logoUrl?: string;
}

type AuthMode = 'login' | 'register' | 'forgot' | 'verify_email' | 'verify_2fa';

export const AuthModal: React.FC<AuthModalProps> = ({
  onSuccess,
  siteName = 'ST CONNECTION',
  logoUrl = '/icon.svg',
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 2FA / Verification states
  const [verificationCode, setVerificationCode] = useState('');
  const [temp2faToken, setTemp2faToken] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const clearMessages = () => {
    setError(null);
    setInfoMessage(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) {
      setError('Please fill in both email/username and password.');
      return;
    }
    setLoading(true);
    clearMessages();

    try {
      const res = await api.login(identifier, password);
      if (res.requires2fa && res.tempToken) {
        setTemp2faToken(res.tempToken);
        setMode('verify_2fa');
        setInfoMessage('Please enter your 6-digit two-factor authentication code.');
      } else if (res.user) {
        onSuccess(res.user);
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !email || !password) {
      setError('Please complete all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const res = await api.register({
        username,
        email,
        displayName: displayName || username,
        password,
      });

      if (res.user) {
        if (!res.user.emailVerified && res.verificationCode) {
          setVerificationCode(res.verificationCode);
          setMode('verify_email');
          setInfoMessage(`Verification code sent! (Code: ${res.verificationCode})`);
        } else {
          onSuccess(res.user);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode) {
      setError('Please enter the 6-digit 2FA code.');
      return;
    }
    setLoading(true);
    clearMessages();

    try {
      const res = await api.verify2FA(temp2faToken, verificationCode);
      if (res.user) {
        onSuccess(res.user);
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid 2FA code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode) {
      setError('Please enter the verification code.');
      return;
    }
    setLoading(true);
    clearMessages();

    try {
      await api.verifyEmail(verificationCode);
      const user = await api.getMe();
      onSuccess(user);
    } catch (err: any) {
      setError(err?.message || 'Email verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your account email address.');
      return;
    }
    setLoading(true);
    clearMessages();

    try {
      const res = await api.forgotPassword(email);
      setInfoMessage(res.message);
      if (res.resetToken) {
        setResetToken(res.resetToken);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not send reset link.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken || !newPassword) {
      setError('Reset token and new password are required.');
      return;
    }
    setLoading(true);
    clearMessages();

    try {
      const res = await api.resetPassword(resetToken, newPassword);
      setInfoMessage(res.message);
      setTimeout(() => {
        setMode('login');
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#0b141a] text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-[#111b21] border border-[#202c33] rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center mb-3">
              <img src={logoUrl} alt="Logo" className="w-10 h-10 object-contain" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white mb-1">
              {siteName}
            </h2>
            <p className="text-xs text-slate-400">
              Modern Real-Time Messaging & Calling Platform
            </p>
          </div>

          {/* Mode Tabs (Login / Register) */}
          {(mode === 'login' || mode === 'register') && (
            <div className="flex bg-[#202c33] p-1 rounded-xl mb-6 border border-[#2a3942]/60">
              <button
                type="button"
                onClick={() => { setMode('login'); clearMessages(); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  mode === 'login' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); clearMessages(); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  mode === 'register' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {/* Notifications */}
          {error && (
            <div className="mb-4 flex items-start gap-2 bg-red-950/40 border border-red-800/50 text-red-300 text-xs p-3 rounded-xl animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <p>{error}</p>
            </div>
          )}
          {infoMessage && (
            <div className="mb-4 flex items-start gap-2 bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs p-3 rounded-xl animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <p>{infoMessage}</p>
            </div>
          )}

          {/* 1. LOGIN MODE */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email or Username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter your username or email"
                    required
                    className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-4 py-2.5 pl-10 text-sm text-white placeholder:text-slate-500 outline-none transition"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); clearMessages(); }}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 transition"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-4 py-2.5 pl-10 text-sm text-white placeholder:text-slate-500 outline-none transition"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-900/30 transition flex items-center justify-center gap-2 text-sm cursor-pointer mt-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Sign In to Chat</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* 2. REGISTER MODE */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Full Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Username (Unique Handle)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="choose_username"
                    required
                    className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-4 py-2 pl-9 text-sm text-white placeholder:text-slate-500 outline-none transition"
                  />
                  <span className="text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 text-xs">@</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    required
                    className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-4 py-2 pl-9 text-sm text-white placeholder:text-slate-500 outline-none transition"
                  />
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-900/30 transition flex items-center justify-center gap-2 text-sm cursor-pointer mt-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Register Account</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* 3. EMAIL VERIFICATION MODE */}
          {mode === 'verify_email' && (
            <form onSubmit={handleVerifyEmail} className="space-y-4">
              <div className="text-center">
                <Shield className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <h3 className="text-base font-semibold text-white">Verify Your Email</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Enter the 6-digit verification code sent to your email.
                </p>
              </div>

              <div>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  required
                  className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-4 py-3 text-center tracking-[0.3em] font-mono text-lg text-white outline-none transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-xl transition"
              >
                {loading ? 'Verifying...' : 'Complete Email Verification'}
              </button>

              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-xs text-slate-400 hover:text-white transition text-center"
              >
                Back to Sign In
              </button>
            </form>
          )}

          {/* 4. 2FA VERIFICATION MODE */}
          {mode === 'verify_2fa' && (
            <form onSubmit={handleVerify2FA} className="space-y-4">
              <div className="text-center">
                <Shield className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <h3 className="text-base font-semibold text-white">Two-Factor Authentication</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Enter the 6-digit security code generated by your authenticator app.
                </p>
              </div>

              <div>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  required
                  className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-4 py-3 text-center tracking-[0.3em] font-mono text-lg text-white outline-none transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-xl transition"
              >
                {loading ? 'Verifying...' : 'Authorize Login'}
              </button>

              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-xs text-slate-400 hover:text-white transition text-center"
              >
                Cancel and Return to Sign In
              </button>
            </form>
          )}

          {/* 5. FORGOT PASSWORD MODE */}
          {mode === 'forgot' && (
            <div className="space-y-4">
              {!resetToken ? (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="text-center">
                    <KeyRound className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                    <h3 className="text-base font-semibold text-white">Reset Account Password</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Enter your account email to receive a password reset authorization code.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@domain.com"
                      required
                      className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-xl transition"
                  >
                    {loading ? 'Sending...' : 'Generate Reset Token'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter strong new password"
                      required
                      className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-xl transition"
                  >
                    {loading ? 'Updating...' : 'Set New Password'}
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => { setMode('login'); clearMessages(); setResetToken(''); }}
                className="w-full text-xs text-slate-400 hover:text-white transition text-center"
              >
                Back to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
