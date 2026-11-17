import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  X,
  Eye,
  Trash2,
  Send,
  ChevronRight,
  ChevronLeft,
  Upload,
  Music,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Search,
  Sparkles,
  Disc,
} from 'lucide-react';
import { Story, StorySong, SafeUser } from '../types.js';
import { api } from '../utils/api.js';
import { VerifiedBadge } from './VerifiedBadge.js';
import { storyMusic, CATALOG_SONGS, CatalogSong } from '../utils/storyMusic.js';

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
  'from-fuchsia-900 to-rose-950',
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
  const [selectedSong, setSelectedSong] = useState<StorySong | null>(null);

  // Music picker modal states
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [musicSearch, setMusicSearch] = useState('');
  const [previewingSongId, setPreviewingSongId] = useState<string | null>(null);
  const [customSongTitle, setCustomSongTitle] = useState('');
  const [customSongArtist, setCustomSongArtist] = useState('');
  const customAudioInputRef = useRef<HTMLInputElement>(null);

  // Story Viewer controls
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [isMuted, setIsMuted] = useState(storyMusic.getIsMuted());
  const [autoplayBlocked, setAutoplayBlocked] = useState(storyMusic.getAutoplayBlocked());

  // Subscribe to audio engine status (mute, autoplay, playing)
  useEffect(() => {
    const unsub = storyMusic.subscribe((status) => {
      setIsMuted(status.isMuted);
      setAutoplayBlocked(status.autoplayBlocked);
    });
    return unsub;
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStoryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        const uploadedUrl = await api.uploadMedia(reader.result, 'story');
        setNewMediaUrl(uploadedUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCustomAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        const uploadedAudioUrl = await api.uploadMedia(reader.result, 'story_song');
        const customSong: StorySong = {
          id: `custom_song_${Date.now()}`,
          title: customSongTitle.trim() || file.name.replace(/\.[^/.]+$/, ''),
          artist: customSongArtist.trim() || currentUser.displayName || 'Custom Audio',
          audioUrl: uploadedAudioUrl,
          albumArt: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&auto=format&fit=crop&q=80',
          duration: 30,
        };
        setSelectedSong(customSong);
        setShowMusicPicker(false);
        setCustomSongTitle('');
        setCustomSongArtist('');
      }
    };
    reader.readAsDataURL(file);
  };

  // Group stories by user
  const myStories = stories.filter(s => s.userId === currentUser.id);
  const otherStories = stories.filter(s => s.userId !== currentUser.id);

  // Active viewing story
  const activeStory = selectedStoryIndex !== null ? stories[selectedStoryIndex] : null;

  // Music playback sync with story viewer
  useEffect(() => {
    if (activeStory) {
      if (activeStory.song) {
        storyMusic.playSong(activeStory.song);
      } else {
        storyMusic.stop();
      }
    } else {
      storyMusic.stop();
    }

    return () => {
      storyMusic.stop();
    };
  }, [activeStory?.id]);

  // Handle Pause / Resume when pressing and holding story
  useEffect(() => {
    if (activeStory?.song) {
      if (isPaused) {
        storyMusic.pause();
      } else {
        storyMusic.resume(activeStory.song);
      }
    }
  }, [isPaused, activeStory?.id]);

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

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMuted = storyMusic.toggleMute();
    setIsMuted(newMuted);
  };

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent && !newMediaUrl) return;

    try {
      await api.createStory({
        type: newType,
        content: newContent,
        backgroundColor: newBg,
        mediaUrl: newMediaUrl || undefined,
        song: selectedSong || undefined,
      });
      setIsCreating(false);
      setNewContent('');
      setNewMediaUrl('');
      setSelectedSong(null);
      storyMusic.stop();
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    try {
      await api.deleteStory(storyId);
      setSelectedStoryIndex(null);
      storyMusic.stop();
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const filteredCatalog = CATALOG_SONGS.filter(s =>
    s.title.toLowerCase().includes(musicSearch.toLowerCase()) ||
    s.artist.toLowerCase().includes(musicSearch.toLowerCase()) ||
    s.genre.toLowerCase().includes(musicSearch.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-[#111b21] overflow-y-auto p-4 sm:p-6 text-white">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>Status & Stories</span>
            <span className="text-xs font-normal text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              🎵 Music Enabled
            </span>
          </h2>
          <p className="text-xs text-slate-400">Updates with photos, text & background music disappear after 24h</p>
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
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-semibold text-white">My Status</h4>
              {currentUser.verified && <VerifiedBadge size="sm" title="Meta Verified Blue Tick" />}
            </div>
            <p className="text-xs text-slate-400">
              {myStories.length > 0
                ? `${myStories.length} active status update${myStories.length > 1 ? 's' : ''}`
                : 'Tap to add status with music'}
            </p>
          </div>
        </div>

        {myStories.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const target = myStories[0];
              if (target.song) {
                storyMusic.playSong(target.song);
              }
              setSelectedStoryIndex(stories.indexOf(target));
              setProgress(0);
            }}
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
                    if (story.song) {
                      storyMusic.playSong(story.song);
                    }
                    setSelectedStoryIndex(globalIdx);
                    setProgress(0);
                  }}
                  className="p-3.5 rounded-xl bg-[#202c33]/70 hover:bg-[#202c33] border border-[#2a3942]/40 hover:border-emerald-500/50 flex items-center gap-3 transition cursor-pointer"
                >
                  <div className="relative p-0.5 rounded-full border-2 border-emerald-400 shrink-0">
                    <img
                      src={story.userAvatar}
                      alt={story.username}
                      className="w-11 h-11 rounded-full object-cover"
                    />
                    {story.song && (
                      <span className="absolute -bottom-1 -right-1 p-1 bg-pink-600 text-white rounded-full shadow-sm text-[9px]">
                        <Music className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <h5 className="text-sm font-semibold text-white truncate">{story.username}</h5>
                    </div>
                    {story.song ? (
                      <div className="flex items-center gap-1 text-[11px] text-pink-400 truncate">
                        <Music className="w-3 h-3 shrink-0 animate-pulse" />
                        <span className="truncate">{story.song.title} • {story.song.artist}</span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 truncate">
                        {story.type === 'text' ? story.content : '📷 Photo status'}
                      </p>
                    )}
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
          <div className="w-full max-w-sm h-full max-h-[85vh] rounded-3xl overflow-hidden relative flex flex-col justify-between shadow-2xl bg-gradient-to-b from-slate-900 to-black border border-white/10">
            {/* Progress Bars */}
            <div className="p-4 z-30 flex gap-1.5">
              <div className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-100 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Story Header */}
            <div className="px-4 py-2 z-30 flex items-center justify-between text-white bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center gap-2.5">
                <img
                  src={activeStory.userAvatar}
                  alt={activeStory.username}
                  className="w-9 h-9 rounded-full object-cover border border-white/40"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-semibold">{activeStory.username}</h4>
                    {activeStory.userId === currentUser.id && currentUser.verified && (
                      <VerifiedBadge size="xs" title="Meta Verified" />
                    )}
                  </div>
                  <p className="text-[10px] text-slate-300">
                    {new Date(activeStory.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Audio Speaker Mute Toggle */}
                {activeStory.song && (
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition cursor-pointer"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4 text-slate-300" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                  </button>
                )}

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
                  onClick={() => {
                    setSelectedStoryIndex(null);
                    storyMusic.stop();
                  }}
                  className="p-1.5 rounded-full hover:bg-white/20 text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Instagram Style Floating Music Sticker */}
            {activeStory.song && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (autoplayBlocked) {
                    storyMusic.unlockAndPlay();
                  } else {
                    handleToggleMute(e);
                  }
                }}
                className="absolute top-16 left-3 right-3 z-30 flex justify-center cursor-pointer animate-in fade-in slide-in-from-top-2 duration-300"
                title="Click to toggle sound"
              >
                <div className="bg-black/75 hover:bg-black/90 backdrop-blur-md border border-white/25 rounded-full px-3.5 py-1.5 flex items-center gap-2.5 shadow-2xl text-white max-w-[95%] transition">
                  <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-white/40 animate-spin" style={{ animationDuration: '6s' }}>
                    <img
                      src={activeStory.song.albumArt || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80'}
                      alt="album"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Music className="w-3 h-3 text-pink-400 shrink-0" />
                      <p className="text-[11px] font-bold truncate leading-tight">
                        {activeStory.song.title}
                      </p>
                      <span className="text-[10px] text-slate-300 shrink-0 truncate">• {activeStory.song.artist}</span>
                    </div>
                  </div>
                  {/* Equalizer animation or Mute icon */}
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <div className="flex items-end gap-0.5 h-3 shrink-0">
                      <span className="w-0.5 bg-pink-400 rounded-full animate-bounce h-2" style={{ animationDelay: '0ms' }} />
                      <span className="w-0.5 bg-pink-400 rounded-full animate-bounce h-3" style={{ animationDelay: '150ms' }} />
                      <span className="w-0.5 bg-pink-400 rounded-full animate-bounce h-1.5" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tap to Play Sound Banner when browser blocks autoplay */}
            {activeStory.song && autoplayBlocked && (
              <div className="absolute top-28 left-0 right-0 z-40 flex justify-center px-4">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    storyMusic.unlockAndPlay();
                  }}
                  className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow-2xl flex items-center gap-2 cursor-pointer transition animate-bounce border border-white/30"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>🔊 Tap to Play Song ({activeStory.song.title})</span>
                </button>
              </div>
            )}

            {/* Story Content View */}
            <div
              className={`flex-1 flex items-center justify-center p-6 text-center bg-gradient-to-br ${
                activeStory.backgroundColor || 'from-teal-800 to-emerald-950'
              } relative`}
            >
              {activeStory.type === 'text' ? (
                <p className="text-xl sm:text-2xl font-bold leading-relaxed text-white drop-shadow-md z-10 px-4">
                  {activeStory.content}
                </p>
              ) : (
                <img
                  src={activeStory.mediaUrl}
                  alt="Story content"
                  className="max-h-full max-w-full object-contain rounded-xl z-10"
                />
              )}
            </div>

            {/* Story Navigation Tap Zones */}
            <div
              className="absolute inset-y-16 left-0 w-1/3 z-20 cursor-pointer"
              onClick={() => {
                if (selectedStoryIndex !== null && selectedStoryIndex > 0) {
                  setSelectedStoryIndex(selectedStoryIndex - 1);
                  setProgress(0);
                }
              }}
            />
            <div
              className="absolute inset-y-16 right-0 w-1/3 z-20 cursor-pointer"
              onClick={() => {
                if (selectedStoryIndex !== null && selectedStoryIndex < stories.length - 1) {
                  setSelectedStoryIndex(selectedStoryIndex + 1);
                  setProgress(0);
                } else {
                  setSelectedStoryIndex(null);
                  storyMusic.stop();
                }
              }}
            />

            {/* Bottom Controls / Viewers */}
            <div className="p-4 z-30 bg-gradient-to-t from-black/90 to-transparent">
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
                    onClick={() => {
                      setSelectedStoryIndex(null);
                      storyMusic.stop();
                    }}
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
          <div className="w-full max-w-md bg-[#111b21] border border-[#202c33] rounded-2xl p-6 shadow-2xl text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold flex items-center gap-2">
                <span>New Status Update</span>
                <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  24h
                </span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  storyMusic.stop();
                }}
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
                    <div className="flex gap-2 flex-wrap">
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

              {/* Instagram Style Song / Music Selection */}
              <div className="pt-2 border-t border-[#202c33]">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-pink-400" />
                    <span>Story Music & Song</span>
                  </label>
                  {selectedSong && (
                    <span className="text-[10px] text-pink-400 font-medium">Selected</span>
                  )}
                </div>

                {selectedSong ? (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-r from-purple-950/40 via-pink-950/30 to-[#202c33] border border-pink-500/40 shadow-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-white/20">
                        <img
                          src={selectedSong.albumArt || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=80'}
                          alt={selectedSong.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate flex items-center gap-1">
                          <Music className="w-3 h-3 text-pink-400 shrink-0" />
                          <span>{selectedSong.title}</span>
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">{selectedSong.artist}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowMusicPicker(true)}
                        className="text-[11px] text-pink-400 hover:text-pink-300 px-2 py-1 rounded cursor-pointer font-medium"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSong(null);
                          storyMusic.stop();
                        }}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 transition cursor-pointer"
                        title="Remove song"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowMusicPicker(true)}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-900/30 via-pink-900/30 to-amber-900/30 hover:from-purple-900/50 hover:to-pink-900/50 border border-pink-500/30 hover:border-pink-400 text-xs text-slate-200 font-medium flex items-center justify-center gap-2 transition cursor-pointer shadow-sm group"
                  >
                    <Music className="w-4 h-4 text-pink-400 group-hover:scale-110 transition-transform" />
                    <span>🎵 Add Song / Music (Bollywood, Punjabi, Pop)</span>
                  </button>
                )}
              </div>

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

      {/* Music Selector Modal */}
      {showMusicPicker && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#162026] border border-[#2a3942] rounded-2xl p-5 shadow-2xl text-white flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-[#2a3942]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center">
                  <Music className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Select Story Song</h3>
                  <p className="text-[10px] text-slate-400">Trending tracks or upload custom audio</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowMusicPicker(false);
                  storyMusic.stop();
                  setPreviewingSongId(null);
                }}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Box */}
            <div className="my-3 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={musicSearch}
                onChange={(e) => setMusicSearch(e.target.value)}
                placeholder="Search songs, artists (Kesariya, Brown Munde...)"
                className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-pink-500/50"
              />
            </div>

            {/* Custom Audio Upload Row */}
            <div className="mb-3 p-2.5 rounded-xl bg-purple-950/30 border border-purple-500/30 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <p className="text-xs font-semibold text-purple-300">Upload Your Own Song / MP3</p>
                <p className="text-[10px] text-slate-400 truncate">Choose any audio file from device</p>
              </div>
              <button
                type="button"
                onClick={() => customAudioInputRef.current?.click()}
                className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-[11px] flex items-center gap-1.5 transition shrink-0 cursor-pointer shadow"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload MP3</span>
              </button>
              <input
                ref={customAudioInputRef}
                type="file"
                accept="audio/*"
                onChange={handleCustomAudioUpload}
                className="hidden"
              />
            </div>

            {/* Songs List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-[#2a3942]/40">
              {filteredCatalog.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No matching songs found. You can upload any song using the button above.
                </div>
              ) : (
                filteredCatalog.map((song) => {
                  const isPreviewing = previewingSongId === song.id;
                  const isCurrentSelected = selectedSong?.id === song.id;

                  return (
                    <div
                      key={song.id}
                      className={`pt-2 flex items-center justify-between p-2 rounded-xl transition ${
                        isCurrentSelected ? 'bg-pink-950/30 border border-pink-500/40' : 'hover:bg-[#202c33]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Album Art with Play overlay */}
                        <div
                          className="w-10 h-10 rounded-xl overflow-hidden relative shrink-0 cursor-pointer group"
                          onClick={() => {
                            if (isPreviewing) {
                              storyMusic.stop();
                              setPreviewingSongId(null);
                            } else {
                              storyMusic.playSong(song);
                              setPreviewingSongId(song.id);
                            }
                          }}
                        >
                          <img
                            src={song.albumArt}
                            alt={song.title}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-80 group-hover:opacity-100 transition">
                            {isPreviewing ? (
                              <Pause className="w-4 h-4 fill-white text-white" />
                            ) : (
                              <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                            )}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate flex items-center gap-1">
                            <span>{song.title}</span>
                            {isPreviewing && (
                              <span className="text-[10px] text-pink-400 animate-pulse font-normal">playing...</span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">{song.artist}</p>
                          <span className="text-[9px] text-slate-500 font-medium uppercase tracking-wider">{song.genre}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {/* Direct Preview Button */}
                        <button
                          type="button"
                          onClick={() => {
                            if (isPreviewing) {
                              storyMusic.stop();
                              setPreviewingSongId(null);
                            } else {
                              storyMusic.playSong(song);
                              setPreviewingSongId(song.id);
                            }
                          }}
                          className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition cursor-pointer border ${
                            isPreviewing
                              ? 'bg-pink-600/30 border-pink-500 text-pink-300'
                              : 'bg-[#202c33] border-[#2a3942] text-slate-300 hover:text-white'
                          }`}
                          title={isPreviewing ? 'Stop audio' : 'Play audio preview'}
                        >
                          {isPreviewing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const newStorySong: StorySong = {
                              id: song.id,
                              title: song.title,
                              artist: song.artist,
                              albumArt: song.albumArt,
                              duration: song.duration,
                              audioUrl: song.audioUrl,
                            };
                            setSelectedSong(newStorySong);
                            setShowMusicPicker(false);
                            storyMusic.stop();
                            setPreviewingSongId(null);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                            isCurrentSelected
                              ? 'bg-emerald-600 text-white'
                              : 'bg-[#2a3942] hover:bg-pink-600 text-white'
                          }`}
                        >
                          {isCurrentSelected ? 'Selected' : 'Add to Status'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
