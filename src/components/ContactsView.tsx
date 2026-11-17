import React, { useState } from 'react';
import { Search, UserCheck, MessageSquare, ShieldAlert, Code2, Phone, Video } from 'lucide-react';
import { SafeUser } from '../types.js';
import { api } from '../utils/api.js';
import { VerifiedBadge } from './VerifiedBadge.js';

interface ContactsViewProps {
  currentUser: SafeUser;
  onStartChat: (targetUserId: string) => void;
  onCallUser: (targetUserId: string, targetName: string, targetAvatar: string, type: 'voice' | 'video') => void;
  onReportUser: (targetId: string, targetName: string) => void;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  currentUser,
  onStartChat,
  onCallUser,
  onReportUser,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SafeUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const res = await api.searchUsers(searchQuery.trim());
      setSearchResults(res.users);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#111b21] p-4 sm:p-6 text-white overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full">
        {/* Title */}
        <div className="mb-6">
          <h2 className="text-xl font-bold">ST Global Directory & Contacts</h2>
          <p className="text-xs text-slate-400">
            Search for people by username, handle or display name to connect
          </p>
        </div>

        {/* Search input */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user by username or handle..."
              className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-4 py-3 pl-11 text-sm text-white placeholder:text-slate-500 outline-none transition"
            />
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold rounded-lg text-white transition cursor-pointer"
            >
              {isSearching ? 'Searching...' : 'Find Users'}
            </button>
          </div>
        </form>

        {/* Directory Results */}
        <div className="space-y-3">
          {searchResults.length > 0 ? (
            searchResults.map((user) => (
              <div
                key={user.id}
                className="p-4 rounded-2xl bg-[#202c33] border border-[#2a3942]/60 hover:border-emerald-500/40 flex items-center justify-between transition gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative shrink-0">
                    <img
                      src={user.avatar}
                      alt={user.displayName}
                      className="w-12 h-12 rounded-full object-cover border border-[#2a3942]"
                    />
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#111b21] ${
                        user.isOnline ? 'bg-emerald-500' : 'bg-slate-500'
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="text-sm font-semibold text-white truncate">{user.displayName}</h4>
                      {user.verified && (
                        <VerifiedBadge size="sm" title="Meta Verified Account" />
                      )}
                      {user.developer && (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0" title="Developer Badge">
                          <Code2 className="w-2.5 h-2.5" />
                          <span>DEV</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">@{user.username}</p>
                    <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-1">{user.bio}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onStartChat(user.id)}
                    className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                    title="Send message"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onCallUser(user.id, user.displayName, user.avatar, 'voice')}
                    className="p-2.5 rounded-xl bg-[#2a3942] hover:bg-[#32444f] text-slate-200 hover:text-white transition cursor-pointer"
                    title="Voice call"
                  >
                    <Phone className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onCallUser(user.id, user.displayName, user.avatar, 'video')}
                    className="p-2.5 rounded-xl bg-[#2a3942] hover:bg-[#32444f] text-slate-200 hover:text-white transition cursor-pointer"
                    title="Video call"
                  >
                    <Video className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onReportUser(user.id, user.displayName || user.username)}
                    className="p-2.5 rounded-xl hover:bg-red-950/40 text-slate-500 hover:text-red-400 transition cursor-pointer"
                    title="Report user"
                  >
                    <ShieldAlert className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16 bg-[#202c33]/30 rounded-2xl border border-dashed border-[#2a3942]/60">
              <UserCheck className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-400">Search ST CONNECTION Directory</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Enter any registered member's username or display name to connect and start a chat.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
