import React, { useState, useEffect } from 'react';
import { Radio, Users, Plus, Heart, Share2, Send, X } from 'lucide-react';
import { Channel, ChannelPost, SafeUser } from '../types.js';
import { api } from '../utils/api.js';
import { VerifiedBadge } from './VerifiedBadge.js';

interface ChannelsViewProps {
  currentUser: SafeUser;
  channels: Channel[];
  onRefresh: () => void;
}

export const ChannelsView: React.FC<ChannelsViewProps> = ({
  currentUser,
  channels,
  onRefresh,
}) => {
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(channels[0] || null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostMedia, setNewPostMedia] = useState('');
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelHandle, setChannelHandle] = useState('');
  const [channelDesc, setChannelDesc] = useState('');

  useEffect(() => {
    if (selectedChannel) {
      loadPosts(selectedChannel.id);
    }
  }, [selectedChannel]);

  const loadPosts = async (channelId: string) => {
    setLoadingPosts(true);
    try {
      const res = await api.getChannelPosts(channelId);
      setPosts(res.posts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPosts(false);
    }
  };

  const handleFollow = async (channelId: string) => {
    try {
      await api.followChannel(channelId);
      onRefresh();
      if (selectedChannel && selectedChannel.id === channelId) {
        const isSubscribed = selectedChannel.subscriberIds.includes(currentUser.id);
        setSelectedChannel({
          ...selectedChannel,
          subscribersCount: isSubscribed
            ? selectedChannel.subscribersCount - 1
            : selectedChannel.subscribersCount + 1,
          subscriberIds: isSubscribed
            ? selectedChannel.subscriberIds.filter(id => id !== currentUser.id)
            : [...selectedChannel.subscriberIds, currentUser.id],
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLikePost = async (postId: string) => {
    if (!selectedChannel) return;
    try {
      await api.likeChannelPost(selectedChannel.id, postId);
      loadPosts(selectedChannel.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChannel || !newPostContent.trim()) return;
    try {
      await api.postToChannel(selectedChannel.id, newPostContent, newPostMedia || undefined);
      setNewPostContent('');
      setNewPostMedia('');
      loadPosts(selectedChannel.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName || !channelHandle) return;
    try {
      const res = await api.request<{ channel: Channel }>('/api/channels', {
        method: 'POST',
        body: JSON.stringify({
          name: channelName,
          handle: channelHandle,
          description: channelDesc,
        }),
      });
      setIsCreatingChannel(false);
      setChannelName('');
      setChannelHandle('');
      setChannelDesc('');
      onRefresh();
      setSelectedChannel(res.channel);
    } catch (e) {
      console.error(e);
    }
  };

  const isOwner = selectedChannel && (selectedChannel.ownerId === currentUser.id || currentUser.role === 'super_admin');
  const isSubscribed = selectedChannel && selectedChannel.subscriberIds.includes(currentUser.id);

  return (
    <div className="h-full flex flex-col md:flex-row bg-[#111b21] text-white overflow-hidden">
      {/* Channels List Sidebar */}
      <div className="w-full md:w-80 border-r border-[#202c33] flex flex-col h-full bg-[#111b21] shrink-0">
        <div className="p-4 border-b border-[#202c33] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm sm:text-base">Broadcast Channels</h3>
          </div>
          <button
            type="button"
            onClick={() => setIsCreatingChannel(true)}
            className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
            title="Create new channel"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {channels.map((chan) => {
            const isSelected = selectedChannel?.id === chan.id;
            return (
              <div
                key={chan.id}
                onClick={() => setSelectedChannel(chan)}
                className={`p-3 rounded-xl flex items-center gap-3 transition cursor-pointer ${
                  isSelected ? 'bg-[#202c33] border border-emerald-500/40' : 'hover:bg-[#202c33]/50'
                }`}
              >
                <img
                  src={chan.avatar}
                  alt={chan.name}
                  className="w-11 h-11 rounded-full object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <h4 className="text-xs sm:text-sm font-semibold truncate text-white">{chan.name}</h4>
                    {chan.verified && <VerifiedBadge size="sm" />}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">@{chan.handle}</p>
                </div>
                <div className="text-[10px] text-slate-400 shrink-0 flex items-center gap-1">
                  <Users className="w-3 h-3 text-slate-500" />
                  <span>{chan.subscribersCount}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Channel Content Stage */}
      {selectedChannel ? (
        <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-hidden">
          {/* Channel Header Banner */}
          <div className="p-4 sm:p-5 border-b border-[#202c33] bg-[#111b21] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={selectedChannel.avatar}
                alt={selectedChannel.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500/30"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-base font-bold text-white">{selectedChannel.name}</h3>
                  {selectedChannel.verified && <VerifiedBadge size="md" />}
                </div>
                <p className="text-xs text-slate-400">
                  @{selectedChannel.handle} • {selectedChannel.subscribersCount} subscribers
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleFollow(selectedChannel.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                isSubscribed
                  ? 'bg-[#202c33] text-slate-300 hover:text-white border border-[#2a3942]'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40'
              }`}
            >
              {isSubscribed ? 'Following' : 'Follow Channel'}
            </button>
          </div>

          {/* Posts Feed */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* Description Banner */}
            <div className="p-4 rounded-xl bg-[#111b21] border border-[#202c33] text-xs text-slate-300">
              <span className="font-semibold text-white">About this channel: </span>
              {selectedChannel.description || 'Welcome to this broadcast channel! Stay tuned for announcements.'}
            </div>

            {loadingPosts ? (
              <div className="text-center py-8 text-slate-500 text-xs">Loading channel updates...</div>
            ) : posts.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No announcements posted in this channel yet.
              </div>
            ) : (
              posts.map((post) => {
                const isLiked = post.likedBy?.includes(currentUser.id);
                return (
                  <div
                    key={post.id}
                    className="p-4 sm:p-5 rounded-2xl bg-[#111b21] border border-[#202c33] space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-emerald-400">{post.senderName}</span>
                        <span className="text-slate-500">•</span>
                        <span className="text-slate-500">
                          {new Date(post.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {post.content}
                    </p>

                    {post.mediaUrl && (
                      <div className="rounded-xl overflow-hidden max-h-80 bg-black">
                        <img src={post.mediaUrl} alt="Broadcast media" className="w-full h-full object-cover" />
                      </div>
                    )}

                    <div className="pt-2 border-t border-[#202c33] flex items-center gap-4 text-xs text-slate-400">
                      <button
                        type="button"
                        onClick={() => handleLikePost(post.id)}
                        className={`flex items-center gap-1.5 transition cursor-pointer ${
                          isLiked ? 'text-rose-400 font-semibold' : 'hover:text-white'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-400 text-rose-400' : ''}`} />
                        <span>{post.likesCount || 0}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(window.location.href);
                          alert('Channel link copied to clipboard!');
                        }}
                        className="flex items-center gap-1.5 hover:text-white transition cursor-pointer ml-auto"
                      >
                        <Share2 className="w-4 h-4" />
                        <span>Share</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Broadcast composer (for channel owner or admin) */}
          {isOwner && (
            <form onSubmit={handleCreatePost} className="p-3 bg-[#111b21] border-t border-[#202c33] flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder="Broadcast an announcement to all subscribers..."
                  className="flex-1 bg-[#202c33] border border-[#2a3942] rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none"
                />
                <button
                  type="submit"
                  disabled={!newPostContent.trim()}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Broadcast</span>
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8 text-slate-500 text-xs">
          Select a channel to view updates.
        </div>
      )}

      {/* Create Channel Modal */}
      {isCreatingChannel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111b21] border border-[#202c33] rounded-2xl p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">Create Broadcast Channel</h3>
              <button
                type="button"
                onClick={() => setIsCreatingChannel(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateChannel} className="space-y-3.5">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Channel Name</label>
                <input
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="e.g. ST Product Updates"
                  required
                  className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl px-3 py-2 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Channel Handle</label>
                <div className="relative">
                  <input
                    type="text"
                    value={channelHandle}
                    onChange={(e) => setChannelHandle(e.target.value)}
                    placeholder="st_updates"
                    required
                    className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl px-3 py-2 pl-8 text-sm text-white outline-none"
                  />
                  <span className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 text-xs">@</span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Description</label>
                <textarea
                  value={channelDesc}
                  onChange={(e) => setChannelDesc(e.target.value)}
                  placeholder="Describe what your subscribers will receive..."
                  rows={3}
                  className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl p-3 text-sm text-white outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 py-2.5 rounded-xl text-white font-medium text-sm transition cursor-pointer shadow-lg shadow-emerald-950/40"
              >
                Launch Channel
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
