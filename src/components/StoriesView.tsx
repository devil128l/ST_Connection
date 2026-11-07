import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Eye, Trash2, Send, ChevronRight, ChevronLeft, Upload } from 'lucide-react';
import { Story, SafeUser } from '../types.js';
import { api } from '../utils/api.js';

interface StoriesViewProps {
  currentUser: SafeUser;
  stories: Story[];
  onRefresh: () => void;
}

const GRADIENTS = [
  'from-teal-800 to-emerald-950',
  'from-indigo-900 to-purple-950',
  'from-rose-800 to-pink-950',
  'from-amber-700 to-orange-950',
  'from-blue-900 to-cyan-950',
];

export const StoriesView: React.FC<StoriesViewProps> = ({
  currentUser,
  stories,
  onRefresh,
}) => {
  const [selectedStoryIndex, setSelectedStoryIndex] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newType, setNewType] = useState<'text' | 'image'>('text');
  const [newContent, setNewContent] = useState('');
  const [newBg, setNewBg] = useState(GRADIENTS[0]);
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStoryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setNewMediaUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Group stories by user
  const myStories = stories.filter(s => s.userId === currentUser.id);
  const otherStories = stories.filter(s => s.userId !== currentUser.id);

  // Active viewing story
  const activeStory = selectedStoryIndex !== null ? stories[selectedStoryIndex] : null;

  // Progress timer for active story
  useEffect(() => {
    if (activeStory && !isPaused) {
      // Mark as viewed
      api.viewStory(activeStory.id).catch(() => {});

      const interval = setInterval(() => {
        setProgress(p => {
          if (p >= 100) {
            // Next story
            if (selectedStoryIndex !== null && selectedStoryIndex < stories.length - 1) {
              setSelectedStoryIndex(selectedStoryIndex + 1);
              return 0;
            } else {
              setSelectedStoryIndex(null);
              return 0;
            }
          }
          return p + 2;
        });
      }, 100);

      return () => clearInterval(interval);
    }
  }, [activeStory, selectedStoryIndex, isPaused, stories.length]);

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent && !newMediaUrl) return;

    try {
      await api.createStory({
        type: newType,
        content: newContent,
        backgroundColor: newBg,
        mediaUrl: newMediaUrl || undefined,
      });
      setIsCreating(false);
      setNewContent('');
      setNewMediaUrl('');
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    try {
      await api.deleteStory(storyId);
      setSelectedStoryIndex(null);
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#111b21] overflow-y-auto p-4 sm:p-6 text-white">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Status & Stories</h2>
          <p className="text-xs text-slate-400">Updates disappear after 24 hours</p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-950/40"
        >
          <Plus className="w-4 h-4" />
          <span>Add Status</span>
        </button>
      </div>

      {/* My Status Card */}
      <div className="mb-6 p-4 rounded-2xl bg-[#202c33] border border-[#2a3942]/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative cursor-pointer" onClick={() => myStories.length > 0 && setSelectedStoryIndex(stories.indexOf(myStories[0]))}>
            <img
              src={currentUser.avatar}
              alt={currentUser.displayName}
              className={`w-14 h-14 rounded-full object-cover p-0.5 ${
                myStories.length > 0 ? 'border-2 border-emerald-400' : 'border border-slate-600'
              }`}
            />
            {myStories.length === 0 && (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="absolute bottom-0 right-0 p-1 rounded-full bg-emerald-500 text-black shadow"
              >
                <Plus className="w-3 h-3 stroke-[3]" />
              </button>
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">My Status</h4>
            <p className="text-xs text-slate-400">
              {myStories.length > 0
                ? `${myStories.length} active status update${myStories.length > 1 ? 's' : ''}`
                : 'Tap to add status update'}
            </p>
          </div>
        </div>

        {myStories.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedStoryIndex(stories.indexOf(myStories[0]))}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition flex items-center gap-1 cursor-pointer"
          >
            <span>View</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Recent Updates from Contacts */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Recent Contact Updates ({otherStories.length})
        </h3>

        {otherStories.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            No recent updates from contacts right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {otherStories.map((story) => {
              const globalIdx = stories.indexOf(story);
              return (
                <div
                  key={story.id}
                  onClick={() => {
                    setSelectedStoryIndex(globalIdx);
                    setProgress(0);
                  }}
                  className="p-3.5 rounded-xl bg-[#202c33]/70 hover:bg-[#202c33] border border-[#2a3942]/40 hover:border-emerald-500/50 flex items-center gap-3 transition cursor-pointer"
                >
                  <div className="relative p-0.5 rounded-full border-2 border-emerald-400">
                    <img
                      src={story.userAvatar}
                      alt={story.username}
                      className="w-11 h-11 rounded-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="text-sm font-semibold text-white truncate">{story.username}</h5>
                    <p className="text-[11px] text-slate-400 truncate">
                      {story.type === 'text' ? story.content : '📷 Photo status'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full-Screen Story Viewer Modal */}
      {activeStory && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-2 sm:p-4 select-none"
          onMouseDown={() => setIsPaused(true)}
          onMouseUp={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
        >
          <div className="w-full max-w-sm h-full max-h-[85vh] rounded-3xl overflow-hidden relative flex flex-col justify-between shadow-2xl bg-gradient-to-b from-slate-900 to-black">
            {/* Progress Bars */}
            <div className="p-4 z-20 flex gap-1.5">
              <div className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-100 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Story Header */}
            <div className="px-4 py-2 z-20 flex items-center justify-between text-white bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center gap-2.5">
                <img
                  src={activeStory.userAvatar}
                  alt={activeStory.username}
                  className="w-9 h-9 rounded-full object-cover border border-white/40"
                />
                <div>
                  <h4 className="text-xs font-semibold">{activeStory.username}</h4>
                  <p className="text-[10px] text-slate-300">
                    {new Date(activeStory.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeStory.userId === currentUser.id && (
                  <button
                    type="button"
                    onClick={() => handleDeleteStory(activeStory.id)}
                    className="p-1.5 rounded-full hover:bg-white/20 text-rose-400 transition cursor-pointer"
                    title="Delete status"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedStoryIndex(null)}
                  className="p-1.5 rounded-full hover:bg-white/20 text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Story Content View */}
            <div
              className={`flex-1 flex items-center justify-center p-6 text-center bg-gradient-to-br ${
                activeStory.backgroundColor || 'from-teal-800 to-emerald-950'
              }`}
            >
              {activeStory.type === 'text' ? (
                <p className="text-xl sm:text-2xl font-bold leading-relaxed text-white drop-shadow-md">
                  {activeStory.content}
                </p>
              ) : (
                <img
                  src={activeStory.mediaUrl}
                  alt="Story content"
                  className="max-h-full max-w-full object-contain rounded-xl"
                />
              )}
            </div>

            {/* Story Navigation Tap Zones */}
            <div
              className="absolute inset-y-16 left-0 w-1/3 z-10 cursor-pointer"
              onClick={() => {
                if (selectedStoryIndex !== null && selectedStoryIndex > 0) {
                  setSelectedStoryIndex(selectedStoryIndex - 1);
                  setProgress(0);
                }
              }}
            />
            <div
              className="absolute inset-y-16 right-0 w-1/3 z-10 cursor-pointer"
              onClick={() => {
                if (selectedStoryIndex !== null && selectedStoryIndex < stories.length - 1) {
                  setSelectedStoryIndex(selectedStoryIndex + 1);
                  setProgress(0);
                } else {
                  setSelectedStoryIndex(null);
                }
              }}
            />

            {/* Bottom Controls / Viewers */}
            <div className="p-4 z-20 bg-gradient-to-t from-black/90 to-transparent">
              {activeStory.userId === currentUser.id ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowViewers(!showViewers)}
                    className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition cursor-pointer mx-auto"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{activeStory.viewers.length} views</span>
                  </button>
                  {showViewers && (
                    <div className="mt-2 p-2 bg-[#202c33] rounded-xl max-h-32 overflow-y-auto text-[11px] text-slate-300">
                      {activeStory.viewers.length === 0 ? (
                        <p className="text-center text-slate-500">No viewers yet</p>
                      ) : (
                        activeStory.viewers.map((v, i) => (
                          <div key={i} className="flex justify-between py-1 border-b border-[#2a3942]/40 last:border-0">
                            <span>{v.username}</span>
                            <span className="text-slate-500">{new Date(v.viewedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Reply to story..."
                    className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-2 text-xs text-white placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedStoryIndex(null)}
                    className="p-2 rounded-full bg-emerald-600 text-white cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Story Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111b21] border border-[#202c33] rounded-2xl p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">New Status Update</h3>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStory} className="space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewType('text')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    newType === 'text' ? 'bg-emerald-600 text-white' : 'bg-[#202c33] text-slate-400'
                  }`}
                >
                  Text Status
                </button>
                <button
                  type="button"
                  onClick={() => setNewType('image')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    newType === 'image' ? 'bg-emerald-600 text-white' : 'bg-[#202c33] text-slate-400'
                  }`}
                >
                  Photo Status
                </button>
              </div>

              {newType === 'text' ? (
                <>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Status Message</label>
                    <textarea
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      placeholder="What is on your mind?"
                      rows={3}
                      required
                      className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl p-3 text-sm text-white placeholder:text-slate-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-2">Background Gradient</label>
                    <div className="flex gap-2">
                      {GRADIENTS.map((grad, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setNewBg(grad)}
                          className={`w-8 h-8 rounded-full bg-gradient-to-br ${grad} border-2 ${
                            newBg === grad ? 'border-white scale-110' : 'border-transparent'
                          } transition cursor-pointer`}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-slate-400">Photo / Image</label>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload from device</span>
                      </button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleStoryFile}
                      className="hidden"
                    />
                    <input
                      type="text"
                      value={newMediaUrl.startsWith('data:') ? '(Image file uploaded)' : newMediaUrl}
                      onChange={(e) => setNewMediaUrl(e.target.value)}
                      placeholder="https://... or upload photo above"
                      required
                      className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl px-3 py-2 text-sm text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Caption (Optional)</label>
                    <input
                      type="text"
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      placeholder="Add a photo caption..."
                      className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl px-3 py-2 text-sm text-white outline-none"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 py-2.5 rounded-xl text-white font-medium text-sm transition cursor-pointer shadow-lg shadow-emerald-950/40"
              >
                Broadcast to Contacts (24 Hours)
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
