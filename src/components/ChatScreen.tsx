import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  Video,
  Search,
  MoreVertical,
  Paperclip,
  Smile,
  Mic,
  Send,
  Check,
  CheckCheck,
  Reply,
  Edit2,
  Trash2,
  Pin,
  Star,
  Sparkles,
  Languages,
  Wand2,
  FileText,
  Play,
  Pause,
  X,
  ShieldCheck,
  CornerDownRight,
  ChevronDown,
  Volume2,
  AlertCircle,
  Clock,
  Square,
  ArrowLeft,
  CheckCircle2,
  Code2,
} from 'lucide-react';
import { Chat, Message, SafeUser } from '../types.js';
import { api } from '../utils/api.js';
import { sounds } from '../utils/audio.js';
import { WALLPAPER_PRESETS } from './SettingsView.js';

interface ChatScreenProps {
  chat: Chat;
  currentUser: SafeUser;
  messages: Message[];
  onSendMessage: (content: string, type?: 'text' | 'image' | 'file' | 'audio', mediaUrl?: string, replyToId?: string, audioDuration?: number) => void;
  onStartCall: (type: 'voice' | 'video') => void;
  onRefreshMessages: () => void;
  wallpaperId?: string;
  isTyping?: boolean;
  onTypingChange?: (isTyping: boolean) => void;
  onBack?: () => void;
}

const COMMON_EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '👏', '🙏', '✨'];

export const ChatScreen: React.FC<ChatScreenProps> = ({
  chat,
  currentUser,
  messages,
  onSendMessage,
  onStartCall,
  onRefreshMessages,
  wallpaperId = 'default',
  isTyping = false,
  onTypingChange,
  onBack,
}) => {
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [searchInChat, setSearchInChat] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiModalResult, setAiModalResult] = useState<{ title: string; content: string } | null>(null);

  // Audio voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<any>(null);

  // Playing audio voice note state
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<{ [id: string]: number }>({});
  const audioIntervalRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Fetch AI smart reply suggestions when incoming message arrives
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.senderId !== currentUser.id && lastMsg.type === 'text') {
      api.getAiSuggestions(lastMsg.content)
        .then(res => setAiSuggestions(res.suggestions || []))
        .catch(() => setAiSuggestions(['Got it!', 'Sounds good!', 'Thanks!']));
    } else {
      setAiSuggestions([]);
    }
  }, [messages.length, currentUser.id]);

  // Handle typing debounce
  const handleInputChange = (val: string) => {
    setInputText(val);
    if (onTypingChange) {
      onTypingChange(val.length > 0);
    }
  };

  const handleSend = () => {
    if (!inputText.trim()) return;

    if (editingMessage) {
      api.editMessage(editingMessage.id, inputText.trim()).then(() => {
        setEditingMessage(null);
        setInputText('');
        onRefreshMessages();
      });
      return;
    }

    onSendMessage(inputText.trim(), 'text', undefined, replyingTo?.id);
    setInputText('');
    setReplyingTo(null);
    setShowEmojiPicker(false);
    setShowAiMenu(false);
    if (onTypingChange) onTypingChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Voice note recording simulation / recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioElemRef = useRef<HTMLAudioElement | null>(null);

  // Voice note recording with real audio
  const startRecording = async () => {
    sounds.playRecordStart();
    setIsRecording(true);
    setRecordingSeconds(0);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start();
    } catch (e) {
      console.warn('Microphone permission not granted or device unavailable:', e);
    }

    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds(prev => prev + 1);
    }, 1000);
  };

  const stopRecordingAndSend = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    const duration = recordingSeconds || 1;
    setIsRecording(false);
    sounds.playMessageSent();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          onSendMessage(
            `Voice message (${duration}s)`,
            'audio',
            base64Audio,
            replyingTo?.id,
            duration
          );
        };
        reader.readAsDataURL(audioBlob);
        mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current.stop();
    } else {
      onSendMessage(
        `Voice message (${duration}s)`,
        'audio',
        undefined,
        replyingTo?.id,
        duration
      );
    }
    setReplyingTo(null);
  };

  const cancelRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  // Play audio voice note
  const togglePlayAudio = (id: string, durationSec = 10) => {
    if (playingAudioId === id) {
      // Pause
      setPlayingAudioId(null);
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    } else {
      setPlayingAudioId(id);
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);

      audioIntervalRef.current = setInterval(() => {
        setAudioProgress(prev => {
          const current = prev[id] || 0;
          if (current >= 100) {
            setPlayingAudioId(null);
            clearInterval(audioIntervalRef.current);
            return { ...prev, [id]: 0 };
          }
          return { ...prev, [id]: current + (100 / (durationSec * 10)) };
        });
      }, 100);
    }
  };

  // AI Actions
  const handleAiRewrite = async (tone: 'professional' | 'concise' | 'friendly' | 'enthusiastic' | 'humorous') => {
    if (!inputText.trim()) return;
    setLoadingAi(true);
    try {
      const res = await api.rewriteWithAi(inputText, tone);
      setInputText(res.rewritten);
      setShowAiMenu(false);
    } catch {
      alert('AI service temporarily unavailable.');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleAiGrammar = async () => {
    if (!inputText.trim()) return;
    setLoadingAi(true);
    try {
      const res = await api.correctGrammarWithAi(inputText);
      setInputText(res.corrected);
      setShowAiMenu(false);
    } catch {
      alert('AI service temporarily unavailable.');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleAiTranslate = async (lang: string) => {
    if (!inputText.trim()) return;
    setLoadingAi(true);
    try {
      const res = await api.translateWithAi(inputText, lang);
      setInputText(res.translated);
      setShowAiMenu(false);
    } catch {
      alert('AI service temporarily unavailable.');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleAiSummarize = async () => {
    const textMsgs = messages
      .filter(m => m.type === 'text')
      .slice(-10)
      .map(m => ({ sender: m.senderName, content: m.content }));

    if (textMsgs.length === 0) {
      alert('No messages to summarize yet.');
      return;
    }

    setLoadingAi(true);
    try {
      const res = await api.summarizeWithAi(textMsgs);
      setAiModalResult({ title: 'AI Conversation Summary', content: res.summary });
      setShowAiMenu(false);
    } catch {
      alert('Could not summarize conversation.');
    } finally {
      setLoadingAi(false);
    }
  };

  // Emoji reaction
  const handleReact = async (messageId: string, emoji: string) => {
    try {
      await api.reactMessage(messageId, emoji);
      onRefreshMessages();
    } catch (e) {
      console.error(e);
    }
  };

  const handleStar = async (messageId: string) => {
    try {
      await api.starMessage(messageId);
      onRefreshMessages();
    } catch (e) {
      console.error(e);
    }
  };

  const handlePin = async (messageId: string) => {
    try {
      await api.pinMessage(messageId);
      onRefreshMessages();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (messageId: string, type: 'everyone' | 'me') => {
    try {
      await api.deleteMessage(messageId, type);
      onRefreshMessages();
    } catch (e) {
      console.error(e);
    }
  };

  // Target chat participant info
  const isDirect = chat.type === 'direct';
  const target = chat.otherParticipant || {
    id: 'unknown',
    displayName: chat.name || 'Chat',
    username: 'user',
    avatar: chat.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    isOnline: false,
    lastSeen: new Date().toISOString(),
    verified: false,
    developer: false,
  };

  const pinnedMsg = messages.find(m => m.isPinned);

  // Deduplicate messages by ID before rendering to prevent duplicate keys
  const uniqueMessages = React.useMemo(() => {
    const seen = new Set<string>();
    const list: Message[] = [];
    for (const m of messages) {
      if (m && m.id && !seen.has(m.id)) {
        seen.add(m.id);
        list.push(m);
      }
    }
    return list;
  }, [messages]);

  const filteredMessages = searchInChat.trim()
    ? uniqueMessages.filter(m => m.content.toLowerCase().includes(searchInChat.toLowerCase()))
    : uniqueMessages;

  const wallpaperClass = WALLPAPER_PRESETS.find(w => w.id === wallpaperId)?.class || 'bg-[#0b141a]';

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] relative overflow-hidden select-text">
      {/* 1. CHAT HEADER */}
      <div className="px-3 sm:px-4 py-3 bg-[#111b21] border-b border-[#202c33] flex items-center justify-between z-20">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 -ml-1 text-slate-400 hover:text-white rounded-lg hover:bg-[#202c33] transition cursor-pointer"
              title="Back to chats list"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          <div className="relative shrink-0">
            <img
              src={isDirect ? target.avatar : (chat.avatar || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80')}
              alt={isDirect ? target.displayName : chat.name}
              className="w-10 h-10 rounded-full object-cover border border-[#2a3942]"
            />
            {isDirect && (
              <span
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#111b21] ${
                  target.isOnline ? 'bg-emerald-500' : 'bg-slate-500'
                }`}
              />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-semibold text-white truncate">
                {isDirect ? target.displayName : chat.name}
              </h3>
              {target.verified && (
                <span title="Verified Blue Tick">
                  <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
                </span>
              )}
              {target.developer && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-bold font-mono">
                  <Code2 className="w-3 h-3" /> DEV
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {isTyping ? (
                <span className="text-emerald-400 font-medium animate-pulse">typing...</span>
              ) : isDirect ? (
                target.isOnline ? 'online' : `last seen ${new Date(target.lastSeen || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              ) : (
                `${chat.participantIds.length} members`
              )}
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-1 text-slate-300">
          <button
            type="button"
            onClick={() => setShowSearch(!showSearch)}
            className="p-2 rounded-lg hover:bg-[#202c33] transition cursor-pointer"
            title="Search in conversation"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onStartCall('voice')}
            className="p-2 rounded-lg hover:bg-[#202c33] transition cursor-pointer"
            title="WebRTC Voice Call"
          >
            <Phone className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onStartCall('video')}
            className="p-2 rounded-lg hover:bg-[#202c33] transition cursor-pointer"
            title="WebRTC Video Call"
          >
            <Video className="w-4 h-4" />
          </button>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-rose-950/30 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              title="Close and cancel chat"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search in Chat Bar */}
      {showSearch && (
        <div className="p-2.5 bg-[#111b21] border-b border-[#202c33] flex items-center gap-2 z-10 animate-in slide-in-from-top-2">
          <Search className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
          <input
            type="text"
            value={searchInChat}
            onChange={(e) => setSearchInChat(e.target.value)}
            placeholder="Search messages in this chat..."
            className="flex-1 bg-[#202c33] border border-[#2a3942] rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none"
            autoFocus
          />
          <button
            type="button"
            onClick={() => { setSearchInChat(''); setShowSearch(false); }}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pinned Message Banner */}
      {pinnedMsg && (
        <div
          onClick={() => {
            const el = document.getElementById(`msg-${pinnedMsg.id}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          className="px-4 py-2 bg-[#202c33]/90 backdrop-blur border-b border-[#2a3942] flex items-center justify-between text-xs text-slate-200 z-10 cursor-pointer hover:bg-[#202c33]"
        >
          <div className="flex items-center gap-2 truncate">
            <Pin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-semibold text-emerald-400 shrink-0">Pinned Message:</span>
            <span className="truncate text-slate-300">{pinnedMsg.content}</span>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handlePin(pinnedMsg.id); }}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. MESSAGES FEED STAGE */}
      <div className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 ${wallpaperClass}`}>
        {/* Encryption Safety Notice */}
        <div className="text-center my-3">
          <div className="inline-flex items-center gap-1.5 bg-[#182229]/80 border border-[#2a3942]/60 px-3 py-1 rounded-lg text-[10px] text-amber-200/80 shadow-sm max-w-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Messages and WebRTC calls are secured and stored with ST CONNECTION infrastructure.</span>
          </div>
        </div>

        {filteredMessages.map((msg, index) => {
          const effectiveUser = currentUser || api.getCurrentUser();
          const myId = String(effectiveUser?.id || '').trim().toLowerCase();
          const myUsername = String(effectiveUser?.username || '').trim().toLowerCase();
          const myEmail = String(effectiveUser?.email || '').trim().toLowerCase();
          const myDisplayName = String(effectiveUser?.displayName || '').trim().toLowerCase();

          const senderId = String(msg.senderId || '').trim().toLowerCase();
          const senderName = String(msg.senderName || '').trim().toLowerCase();

          let isMe = false;

          if (senderId && myId && senderId === myId) {
            isMe = true;
          } else if (senderId && myUsername && senderId === myUsername) {
            isMe = true;
          } else if (senderId && myEmail && senderId === myEmail) {
            isMe = true;
          } else if (senderId === 'me' || senderId === 'self') {
            isMe = true;
          } else if (senderName && myDisplayName && senderName === myDisplayName) {
            isMe = true;
          } else if (senderName && myUsername && senderName === myUsername) {
            isMe = true;
          } else if (chat && (chat.type === 'direct' || !chat.type)) {
            // In a 1-to-1 conversation, if sender is NOT the other contact, it is ME!
            const otherId = String(chat.otherParticipant?.id || '').trim().toLowerCase();
            const otherUsername = String(chat.otherParticipant?.username || '').trim().toLowerCase();
            const otherDisplayName = String(chat.otherParticipant?.displayName || '').trim().toLowerCase();

            if (otherId && senderId === otherId) {
              isMe = false;
            } else if (otherUsername && senderId === otherUsername) {
              isMe = false;
            } else if (otherDisplayName && senderName === otherDisplayName) {
              isMe = false;
            } else if (otherId && senderId && senderId !== otherId) {
              isMe = true;
            } else if (chat.participantIds && chat.participantIds.length === 2) {
              const otherInChat = chat.participantIds.find(p => String(p).trim().toLowerCase() !== myId);
              if (otherInChat && senderId === String(otherInChat).trim().toLowerCase()) {
                isMe = false;
              } else if (otherInChat) {
                isMe = true;
              }
            }
          }

          const isStarred = msg.isStarredBy?.includes(currentUser.id);
          const hasReactions = msg.reactions && msg.reactions.length > 0;

          return (
            <div
              key={`${msg.id || 'msg'}-${index}`}
              id={`msg-${msg.id}`}
              className={`w-full flex flex-col ${isMe ? 'items-end justify-end' : 'items-start justify-start'} group relative`}
            >
              {/* Context Action Toolbar on Hover */}
              <div
                className={`opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute -top-8 ${
                  isMe ? 'right-2' : 'left-2'
                } z-10 flex items-center gap-1 bg-[#182229] border border-[#2a3942] rounded-lg p-1 shadow-lg`}
              >
                {/* Quick Emoji Reaction buttons */}
                {['👍', '❤️', '🔥'].map(em => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => handleReact(msg.id, em)}
                    className="p-1 hover:bg-[#202c33] rounded text-xs transition"
                  >
                    {em}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setReplyingTo(msg)}
                  className="p-1 hover:bg-[#202c33] rounded text-slate-400 hover:text-white transition"
                  title="Reply"
                >
                  <Reply className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleStar(msg.id)}
                  className="p-1 hover:bg-[#202c33] rounded text-slate-400 hover:text-amber-400 transition"
                  title="Star message"
                >
                  <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={() => handlePin(msg.id)}
                  className="p-1 hover:bg-[#202c33] rounded text-slate-400 hover:text-emerald-400 transition"
                  title="Pin message"
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>

                {isMe && msg.type === 'text' && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMessage(msg);
                      setInputText(msg.content);
                    }}
                    className="p-1 hover:bg-[#202c33] rounded text-slate-400 hover:text-white transition"
                    title="Edit message"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDelete(msg.id, isMe ? 'everyone' : 'me')}
                  className="p-1 hover:bg-rose-950/60 rounded text-slate-400 hover:text-rose-400 transition"
                  title={isMe ? 'Delete for everyone' : 'Delete for me'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Message Bubble Container */}
              <div
                className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 relative shadow-md transition-all ${
                  isMe
                    ? 'self-end ml-auto bg-[#005c4b] text-white rounded-tr-none border border-emerald-600/30'
                    : 'self-start mr-auto bg-[#202c33] text-slate-100 rounded-tl-none border border-[#2a3942]'
                }`}
              >
                {/* Sender name for group chats */}
                {!isMe && chat.type === 'group' && (
                  <p className="text-[11px] font-semibold text-emerald-400 mb-0.5">
                    {msg.senderName}
                  </p>
                )}

                {/* Quoted Reply Preview */}
                {msg.replyTo && (
                  <div className="mb-2 p-2 rounded-lg bg-black/20 border-l-2 border-emerald-400 text-xs text-slate-300">
                    <p className="font-semibold text-[10px] text-emerald-300">{msg.replyTo.senderName}</p>
                    <p className="truncate text-[11px]">{msg.replyTo.content}</p>
                  </div>
                )}

                {/* 1. Text Message */}
                {msg.type === 'text' && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {msg.content}
                  </p>
                )}

                {/* 2. Image Attachment */}
                {msg.type === 'image' && msg.mediaUrl && (
                  <div className="rounded-xl overflow-hidden mb-1 max-h-72 bg-black">
                    <img
                      src={msg.mediaUrl}
                      alt="attachment"
                      className="w-full h-full object-cover cursor-pointer hover:opacity-95"
                      onClick={() => window.open(msg.mediaUrl, '_blank')}
                    />
                  </div>
                )}

                {/* 3. Audio Voice Note with Interactive Waveform */}
                {msg.type === 'audio' && (
                  <div className="flex items-center gap-3 py-1 min-w-[220px]">
                    <button
                      type="button"
                      onClick={() => togglePlayAudio(msg.id, msg.audioDuration || 6)}
                      className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center shrink-0 transition cursor-pointer shadow"
                    >
                      {playingAudioId === msg.id ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black ml-0.5" />}
                    </button>

                    {/* Waveform bars */}
                    <div className="flex-1 flex items-center gap-0.5 h-6">
                      {[40, 70, 30, 90, 60, 45, 85, 30, 60, 95, 40, 75, 50, 80, 35].map((height, idx) => {
                        const activePct = audioProgress[msg.id] || 0;
                        const isBarActive = (idx / 15) * 100 <= activePct;
                        return (
                          <div
                            key={idx}
                            className={`w-1 rounded-full transition-all duration-100 ${
                              isBarActive ? 'bg-emerald-400' : 'bg-slate-400/50'
                            }`}
                            style={{ height: `${height}%` }}
                          />
                        );
                      })}
                    </div>

                    <span className="text-[10px] text-slate-300 font-mono shrink-0">
                      0:0{msg.audioDuration || 4}
                    </span>
                  </div>
                )}

                {/* Metadata row: time, edited tag, star, status */}
                <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-300/80">
                  {isStarred && <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />}
                  {msg.isPinned && <Pin className="w-2.5 h-2.5 text-emerald-300" />}
                  {msg.isEdited && <span className="italic text-[9px]">(edited)</span>}
                  <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>

                  {isMe && (
                    <span>
                      {msg.status === 'read' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
                      ) : msg.status === 'delivered' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-slate-300" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-slate-300" />
                      )}
                    </span>
                  )}
                </div>

                {/* Reactions badge */}
                {hasReactions && (
                  <div className="absolute -bottom-2.5 right-2 flex items-center gap-0.5 bg-[#182229] border border-[#2a3942] rounded-full px-1.5 py-0.5 shadow-sm text-[11px]">
                    {msg.reactions.map((r, i) => (
                      <span key={i} title={r.username}>{r.emoji}</span>
                    ))}
                    {msg.reactions.length > 1 && (
                      <span className="text-[9px] text-slate-400 ml-0.5">{msg.reactions.length}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. AI SMART SUGGESTIONS BAR (if incoming message) */}
      {aiSuggestions.length > 0 && (
        <div className="px-4 py-2 bg-[#111b21]/95 border-t border-[#202c33] flex items-center gap-2 overflow-x-auto z-10 animate-in fade-in">
          <div className="flex items-center gap-1 text-[11px] text-emerald-400 shrink-0 font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Replies:</span>
          </div>
          {aiSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                onSendMessage(suggestion, 'text');
                setAiSuggestions([]);
              }}
              className="px-3 py-1 rounded-full bg-[#202c33] hover:bg-[#2a3942] border border-[#2a3942] text-xs text-slate-200 transition shrink-0 cursor-pointer"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Quoted Reply Banner */}
      {replyingTo && (
        <div className="p-2.5 bg-[#202c33] border-t border-[#2a3942] flex items-center justify-between z-10">
          <div className="flex items-center gap-2 text-xs truncate">
            <CornerDownRight className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="truncate">
              <span className="font-semibold text-emerald-400">Replying to {replyingTo.senderName}: </span>
              <span className="text-slate-300 truncate">{replyingTo.content}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Editing Message Banner */}
      {editingMessage && (
        <div className="p-2.5 bg-[#202c33] border-t border-[#2a3942] flex items-center justify-between z-10">
          <div className="flex items-center gap-2 text-xs text-amber-300">
            <Edit2 className="w-4 h-4 shrink-0" />
            <span>Editing message: press Enter to update</span>
          </div>
          <button
            type="button"
            onClick={() => { setEditingMessage(null); setInputText(''); }}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4. CHAT INPUT TOOLBAR */}
      <div className="p-3 bg-[#111b21] border-t border-[#202c33] flex items-center gap-2 z-20 relative">
        {/* Emoji & Sticker Toggle */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="p-2 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
          title="Emojis & reactions"
        >
          <Smile className="w-5 h-5" />
        </button>

        {/* AI Assistant Popover Toggle */}
        <button
          type="button"
          onClick={() => setShowAiMenu(!showAiMenu)}
          className={`p-2 rounded-lg transition cursor-pointer ${
            showAiMenu ? 'bg-emerald-600/30 text-emerald-400' : 'text-emerald-400 hover:bg-[#202c33]'
          }`}
          title="Google Gemini AI Writing Assistant"
        >
          <Sparkles className="w-5 h-5" />
        </button>

        {/* Attachment Upload */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
          title="Attach photo or media"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                const isImg = file.type.startsWith('image/');
                const isVid = file.type.startsWith('video/');
                const fileType = isImg ? 'image' : isVid ? 'video' : 'file';
                onSendMessage(file.name, fileType as any, dataUrl, replyingTo?.id);
              };
              reader.readAsDataURL(file);
              e.target.value = '';
            }
          }}
        />

        {/* Text Input vs Voice Recording Mode */}
        {isRecording ? (
          <div className="flex-1 flex items-center justify-between bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-2 text-rose-300">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              <span className="text-xs font-mono font-bold">
                Recording: 00:{recordingSeconds < 10 ? `0${recordingSeconds}` : recordingSeconds}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={cancelRecording}
                className="text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={stopRecordingAndSend}
                className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message or click mic to record..."
              className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition"
            />
          </div>
        )}

        {/* Send Button or Voice Note Mic */}
        {inputText.trim() ? (
          <button
            type="button"
            onClick={handleSend}
            className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition active:scale-95 cursor-pointer"
            title="Send Message"
          >
            <Send className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={isRecording ? stopRecordingAndSend : startRecording}
            className={`p-2.5 rounded-xl transition cursor-pointer ${
              isRecording
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-[#202c33] hover:bg-[#2a3942] text-slate-300 hover:text-white'
            }`}
            title="Record Voice Note"
          >
            <Mic className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-16 left-4 z-30 bg-[#202c33] border border-[#2a3942] rounded-2xl p-3 shadow-2xl animate-in zoom-in-95">
          <div className="grid grid-cols-4 gap-2">
            {COMMON_EMOJIS.map(em => (
              <button
                key={em}
                type="button"
                onClick={() => {
                  setInputText(prev => prev + em);
                }}
                className="w-10 h-10 rounded-xl hover:bg-[#2a3942] text-xl flex items-center justify-center transition cursor-pointer"
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Google Gemini AI Writing Assistant Popover */}
      {showAiMenu && (
        <div className="absolute bottom-16 left-12 z-30 w-72 bg-[#182229] border border-[#2a3942] rounded-2xl p-4 shadow-2xl text-xs space-y-3 animate-in zoom-in-95">
          <div className="flex items-center justify-between pb-2 border-b border-[#2a3942]">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <Sparkles className="w-4 h-4" />
              <span>Gemini AI Writing Engine</span>
            </div>
            <button
              type="button"
              onClick={() => setShowAiMenu(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {loadingAi ? (
            <div className="text-center py-4 text-emerald-400 animate-pulse font-mono">
              Processing with Gemini...
            </div>
          ) : (
            <>
              {/* Tone rewrite */}
              <div>
                <p className="text-[11px] text-slate-400 font-medium mb-1.5">Rewrite Draft Tone:</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleAiRewrite('professional')}
                    className="p-1.5 rounded-lg bg-[#202c33] hover:bg-emerald-600/30 text-slate-200 hover:text-emerald-300 transition text-left cursor-pointer"
                  >
                    💼 Professional
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAiRewrite('friendly')}
                    className="p-1.5 rounded-lg bg-[#202c33] hover:bg-emerald-600/30 text-slate-200 hover:text-emerald-300 transition text-left cursor-pointer"
                  >
                    😊 Friendly
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAiRewrite('concise')}
                    className="p-1.5 rounded-lg bg-[#202c33] hover:bg-emerald-600/30 text-slate-200 hover:text-emerald-300 transition text-left cursor-pointer"
                  >
                    ✂️ Concise
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAiRewrite('enthusiastic')}
                    className="p-1.5 rounded-lg bg-[#202c33] hover:bg-emerald-600/30 text-slate-200 hover:text-emerald-300 transition text-left cursor-pointer"
                  >
                    ⚡ Enthusiastic
                  </button>
                </div>
              </div>

              {/* Grammar fix */}
              <button
                type="button"
                onClick={handleAiGrammar}
                className="w-full p-2 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-slate-200 flex items-center gap-2 transition cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Fix Grammar & Punctuation</span>
              </button>

              {/* Translation */}
              <div>
                <p className="text-[11px] text-slate-400 font-medium mb-1.5">Translate Draft To:</p>
                <div className="grid grid-cols-3 gap-1">
                  {['Spanish', 'French', 'German', 'Arabic', 'Hindi', 'Japanese'].map(lang => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => handleAiTranslate(lang)}
                      className="p-1 rounded bg-[#202c33] hover:bg-[#2a3942] text-[10px] text-slate-300 text-center transition cursor-pointer"
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat summary */}
              <button
                type="button"
                onClick={handleAiSummarize}
                className="w-full p-2 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-slate-200 flex items-center gap-2 transition cursor-pointer border-t border-[#2a3942]"
              >
                <FileText className="w-3.5 h-3.5 text-sky-400" />
                <span>Summarize Recent Conversation</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* AI Summary Modal Result */}
      {aiModalResult && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111b21] border border-[#202c33] rounded-2xl p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <Sparkles className="w-4 h-4" />
                <span>{aiModalResult.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setAiModalResult(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 rounded-xl bg-[#202c33] text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
              {aiModalResult.content}
            </div>
            <button
              type="button"
              onClick={() => setAiModalResult(null)}
              className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 py-2 rounded-xl text-xs font-semibold text-white transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
