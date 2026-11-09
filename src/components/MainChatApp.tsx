import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  CircleDashed,
  Radio,
  Phone,
  Video,
  Users,
  Bot,
  Settings,
  LogOut,
  Plus,
  Search,
  CheckCheck,
  Check,
  ShieldCheck,
  ExternalLink,
  Bell,
  Sparkles,
  X,
  Volume2,
  AlertTriangle,
  MoreVertical,
  CheckCircle2,
  Code2,
  ShieldAlert,
  Shield,
  Lock,
} from 'lucide-react';
import { SafeUser, Chat, Message, Story, Channel, CallRecord } from '../types.js';
import { api } from '../utils/api.js';
import { webrtc, CallSession } from '../utils/webrtc.js';
import { sounds } from '../utils/audio.js';
import { ChatScreen } from './ChatScreen.js';
import { StoriesView } from './StoriesView.js';
import { ChannelsView } from './ChannelsView.js';
import { ContactsView } from './ContactsView.js';
import { SettingsView } from './SettingsView.js';
import { CallModal } from './CallModal.js';

interface MainChatAppProps {
  currentUser: SafeUser;
  onLogout: () => void;
  onSwitchToAdmin: () => void;
  siteName?: string;
  announcement?: string;
}

export const MainChatApp: React.FC<MainChatAppProps> = ({
  currentUser,
  onLogout,
  onSwitchToAdmin,
  siteName = 'ST CONNECTION',
  announcement,
}) => {
  const [activeTab, setActiveTab] = useState<'chats' | 'stories' | 'channels' | 'calls' | 'contacts' | 'settings'>('chats');
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const selectedChatRef = useRef<Chat | null>(null);
  selectedChatRef.current = selectedChat;
  const [messages, setMessages] = useState<Message[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [chatSearch, setChatSearch] = useState('');
  const [wallpaper, setWallpaper] = useState(localStorage.getItem('st_chat_wallpaper') || 'default');

  // New Group / Chat Modal
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<SafeUser[]>([]);

  // In-memory messages cache per chatId for instant (0ms) chat switches
  const chatMessagesCacheRef = useRef<Record<string, Message[]>>({});

  // WebRTC Call session
  const [activeCallSession, setActiveCallSession] = useState<CallSession | null>(null);

  // Typing status indicator in chat
  const [partnerTyping, setPartnerTyping] = useState(false);

  // Report modal
  const [reportingTarget, setReportingTarget] = useState<{ id: string; name: string } | null>(null);
  const [reportReason, setReportReason] = useState('Spam or unsolicited messages');
  const [reportDetails, setReportDetails] = useState('');
  const [showTopMenu, setShowTopMenu] = useState(false);

  // Initial data loading
  useEffect(() => {
    loadAllData();

    // Subscribe to real-time WebSocket events
    const unsubscribe = api.subscribeWs((event) => {
      const { type, payload } = event;

      switch (type) {
        case 'new_message': {
          const { message, chatId } = payload;
          if (message.senderId !== currentUser.id) {
            sounds.playMessageReceived();
          }

          // Update cache immediately
          if (!chatMessagesCacheRef.current[chatId]) {
            chatMessagesCacheRef.current[chatId] = [];
          }
          const existingInCache = chatMessagesCacheRef.current[chatId];
          // Check if replacing an optimistic message or already exists
          const isTempDuplicate = existingInCache.some(m => 
            m.id === message.id || 
            (m.id.startsWith('temp_') && m.senderId === message.senderId && m.content === message.content)
          );

          if (!isTempDuplicate) {
            chatMessagesCacheRef.current[chatId] = [...existingInCache, message];
          } else {
            chatMessagesCacheRef.current[chatId] = existingInCache.map(m => 
              (m.id === message.id || (m.id.startsWith('temp_') && m.senderId === message.senderId && m.content === message.content))
                ? message
                : m
            );
          }

          if (selectedChatRef.current && selectedChatRef.current.id === chatId) {
            setMessages(prev => {
              const hasMatchingTemp = prev.some(m => 
                m.id.startsWith('temp_') && m.senderId === message.senderId && m.content === message.content
              );
              if (hasMatchingTemp) {
                return prev.map(m => 
                  (m.id.startsWith('temp_') && m.senderId === message.senderId && m.content === message.content)
                    ? message
                    : m
                );
              }
              if (prev.some(m => m.id === message.id)) return prev;
              return [...prev, message];
            });
          }
          // Update chat list last message
          setChats(prev => prev.map(c => {
            if (c.id === chatId) {
              return {
                ...c,
                lastMessage: {
                  content: message.content || (message.type === 'audio' ? '🎤 Voice note' : '📷 Attachment'),
                  senderId: message.senderId,
                  createdAt: message.createdAt,
                },
              };
            }
            return c;
          }));
          break;
        }

        case 'message_updated': {
          const { message } = payload;
          setMessages(prev => prev.map(m => m.id === message.id ? message : m));
          if (selectedChatRef.current && chatMessagesCacheRef.current[selectedChatRef.current.id]) {
            chatMessagesCacheRef.current[selectedChatRef.current.id] = 
              chatMessagesCacheRef.current[selectedChatRef.current.id].map(m => m.id === message.id ? message : m);
          }
          break;
        }

        case 'message_deleted_me': {
          const { messageId, chatId } = payload;
          if (selectedChatRef.current && (!chatId || selectedChatRef.current.id === chatId)) {
            setMessages(prev => prev.filter(m => m.id !== messageId));
          }
          if (chatId && chatMessagesCacheRef.current[chatId]) {
            chatMessagesCacheRef.current[chatId] = chatMessagesCacheRef.current[chatId].filter(m => m.id !== messageId);
          }
          break;
        }

        case 'typing_status': {
          const { chatId, isTyping } = payload;
          if (selectedChatRef.current && selectedChatRef.current.id === chatId) {
            setPartnerTyping(isTyping);
          }
          break;
        }

        case 'new_story': {
          setStories(prev => [payload.story, ...prev]);
          break;
        }

        case 'webrtc_signal': {
          const { fromUserId, signalData, callType, callId } = payload;
          if (signalData?.type === 'incoming_call') {
            // Callee receives call
            const callerUser = directoryUsers.find(u => u.id === fromUserId) || {
              displayName: 'Contact',
              avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
            };

            setActiveCallSession({
              callId: callId || `call_${Date.now()}`,
              targetUserId: fromUserId,
              targetUserName: callerUser.displayName,
              targetUserAvatar: callerUser.avatar,
              type: callType || 'voice',
              isIncoming: true,
              status: 'ringing',
              isMuted: false,
              isVideoOff: false,
              facingMode: 'user',
              durationSeconds: 0,
            });
          } else if (signalData?.type === 'call_accepted') {
            setActiveCallSession(prev => prev ? { ...prev, status: 'connected' } : null);
          } else if (signalData?.type === 'call_ended' || signalData?.type === 'call_rejected') {
            sounds.playHangup();
            webrtc.stopLocalMedia();
            setActiveCallSession(null);
          }
          break;
        }

        case 'user_status': {
          const { userId, isOnline, lastSeen } = payload;
          setChats(prev => prev.map(c => {
            if (c.otherParticipant && c.otherParticipant.id === userId) {
              return {
                ...c,
                otherParticipant: { ...c.otherParticipant, isOnline, lastSeen },
              };
            }
            return c;
          }));
          break;
        }

        default:
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [selectedChat?.id, currentUser.id, directoryUsers]);

  const loadAllData = async () => {
    try {
      const [chatsRes, storiesRes, channelsRes, callsRes, usersRes] = await Promise.all([
        api.getChats(),
        api.getStories(),
        api.getChannels(),
        api.getCallHistory(),
        api.searchUsers(''),
      ]);
      setChats(chatsRes.chats);
      setStories(storiesRes.stories);
      setChannels(channelsRes.channels);
      setCalls(callsRes.calls);
      setDirectoryUsers(usersRes.users);

      // Keep selectedChat updated with latest chat metadata if one is open, never auto-force open a chat
      setSelectedChat(prev => {
        if (!prev) return null;
        const matching = chatsRes.chats.find(c => c.id === prev.id);
        return matching || prev;
      });
    } catch (e) {
      console.warn('Failed to load chats data:', e);
    }
  };

  const loadMessages = async (chatId: string) => {
    try {
      const res = await api.getMessages(chatId);
      const seen = new Set<string>();
      const deduped: Message[] = [];
      for (const m of res.messages) {
        if (m && m.id && !seen.has(m.id)) {
          seen.add(m.id);
          deduped.push(m);
        }
      }
      chatMessagesCacheRef.current[chatId] = deduped;
      if (selectedChatRef.current && selectedChatRef.current.id === chatId) {
        setMessages(deduped);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectChat = (chat: Chat) => {
    setSelectedChat(chat);
    // Instant switch (0ms) using in-memory cache if available
    if (chatMessagesCacheRef.current[chat.id]) {
      setMessages(chatMessagesCacheRef.current[chat.id]);
    } else {
      setMessages([]);
    }
    // Fetch latest in background to sync any missed messages
    loadMessages(chat.id);
  };

  const handleSendMessage = async (
    content: string,
    type: 'text' | 'image' | 'file' | 'audio' = 'text',
    mediaUrl?: string,
    replyToId?: string,
    audioDuration?: number
  ) => {
    if (!selectedChat) return;

    // 1. Instant optimistic update (0ms perceived latency!)
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let replyToData: any = undefined;
    if (replyToId) {
      const parent = messages.find(m => m.id === replyToId);
      if (parent) {
        replyToData = {
          id: parent.id,
          senderName: parent.senderName,
          content: parent.content.slice(0, 80),
        };
      }
    }

    const optimisticMsg: Message = {
      id: tempId,
      chatId: selectedChat.id,
      senderId: currentUser.id,
      senderName: currentUser.displayName || currentUser.username,
      senderAvatar: currentUser.avatar,
      content: (content || '').trim(),
      type,
      mediaUrl,
      replyTo: replyToData,
      reactions: [],
      status: 'sent',
      audioDuration,
      createdAt: new Date().toISOString(),
    };

    // Play sent sound immediately
    sounds.playMessageSent();

    // Render message immediately
    setMessages(prev => [...prev, optimisticMsg]);

    // Update in-memory cache immediately
    if (!chatMessagesCacheRef.current[selectedChat.id]) {
      chatMessagesCacheRef.current[selectedChat.id] = [];
    }
    chatMessagesCacheRef.current[selectedChat.id] = [
      ...chatMessagesCacheRef.current[selectedChat.id],
      optimisticMsg,
    ];

    // Update sidebar chat lastMessage preview immediately
    setChats(prev => prev.map(c => {
      if (c.id === selectedChat.id) {
        return {
          ...c,
          lastMessage: {
            content: optimisticMsg.content || (optimisticMsg.type === 'audio' ? '🎤 Voice message' : '📷 Attachment'),
            senderId: currentUser.id,
            createdAt: optimisticMsg.createdAt,
          },
        };
      }
      return c;
    }));

    // 2. Perform network request in background
    api.sendMessage({
      chatId: selectedChat.id,
      content,
      type,
      mediaUrl,
      replyToId,
      audioDuration,
    }).then(res => {
      const realMessage = {
        ...res.message,
        senderId: res.message.senderId || currentUser.id,
        senderName: res.message.senderName || currentUser.displayName || currentUser.username,
        senderAvatar: res.message.senderAvatar || currentUser.avatar,
      };

      // Seamlessly replace optimistic temporary ID with real database ID
      setMessages(prev => prev.map(m => m.id === tempId ? realMessage : m));

      if (chatMessagesCacheRef.current[selectedChat.id]) {
        chatMessagesCacheRef.current[selectedChat.id] = chatMessagesCacheRef.current[selectedChat.id].map(
          m => m.id === tempId ? realMessage : m
        );
      }
    }).catch(e => {
      console.error('Failed to send message to server:', e);
    });
  };

  const handleDeleteMessage = (messageId: string, type: 'everyone' | 'me') => {
    if (!selectedChat) return;
    const chatId = selectedChat.id;

    // Instant optimistic update (0ms delay)
    if (type === 'me') {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      if (chatMessagesCacheRef.current[chatId]) {
        chatMessagesCacheRef.current[chatId] = chatMessagesCacheRef.current[chatId].filter(m => m.id !== messageId);
      }
    } else {
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          return {
            ...m,
            isDeletedForEveryone: true,
            content: 'This message was deleted',
            mediaUrl: undefined,
            reactions: [],
            type: 'text',
          };
        }
        return m;
      }));
      if (chatMessagesCacheRef.current[chatId]) {
        chatMessagesCacheRef.current[chatId] = chatMessagesCacheRef.current[chatId].map(m => {
          if (m.id === messageId) {
            return {
              ...m,
              isDeletedForEveryone: true,
              content: 'This message was deleted',
              mediaUrl: undefined,
              reactions: [],
              type: 'text',
            };
          }
          return m;
        });
      }
    }

    // Call API asynchronously in background
    api.deleteMessage(messageId, type).catch(err => {
      console.error('Failed to delete message:', err);
    });
  };

  const handleClearChat = async (chatId: string) => {
    // 0ms instant local clear
    setMessages([]);
    if (chatMessagesCacheRef.current[chatId]) {
      chatMessagesCacheRef.current[chatId] = [];
    }
    setChats(prev => prev.map(c => {
      if (c.id === chatId) {
        return {
          ...c,
          lastMessage: undefined,
        };
      }
      return c;
    }));

    api.clearChat(chatId).catch(err => {
      console.error('Failed to clear chat:', err);
    });
  };

  const handleStartCall = async (type: 'voice' | 'video') => {
    if (!selectedChat) return;
    const target = selectedChat.otherParticipant || {
      id: selectedChat.id,
      displayName: selectedChat.name || 'Group Member',
      avatar: selectedChat.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    };

    const callId = `call_${Date.now()}`;
    await webrtc.startLocalMedia(type);

    setActiveCallSession({
      callId,
      targetUserId: target.id,
      targetUserName: target.displayName,
      targetUserAvatar: target.avatar,
      type,
      isIncoming: false,
      status: 'ringing',
      isMuted: false,
      isVideoOff: false,
      facingMode: 'user',
      durationSeconds: 0,
    });

    // Notify recipient over WebSocket
    api.sendWs('webrtc_signal', {
      targetUserId: target.id,
      callType: type,
      callId,
      signalData: { type: 'incoming_call' },
    });
  };

  const handleAcceptCall = async () => {
    if (!activeCallSession) return;
    await webrtc.startLocalMedia(activeCallSession.type);
    setActiveCallSession(prev => prev ? { ...prev, status: 'connected' } : null);

    api.sendWs('webrtc_signal', {
      targetUserId: activeCallSession.targetUserId,
      callType: activeCallSession.type,
      callId: activeCallSession.callId,
      signalData: { type: 'call_accepted' },
    });
  };

  const handleRejectCall = () => {
    if (!activeCallSession) return;
    api.sendWs('webrtc_signal', {
      targetUserId: activeCallSession.targetUserId,
      callId: activeCallSession.callId,
      signalData: { type: 'call_rejected' },
    });
    webrtc.stopLocalMedia();
    setActiveCallSession(null);
  };

  const handleEndCall = () => {
    if (!activeCallSession) return;
    api.sendWs('webrtc_signal', {
      targetUserId: activeCallSession.targetUserId,
      callId: activeCallSession.callId,
      signalData: { type: 'call_ended' },
    });

    // Log call record
    api.logCall({
      receiverId: activeCallSession.targetUserId,
      type: activeCallSession.type,
      status: activeCallSession.status === 'connected' ? 'completed' : 'missed',
      durationSeconds: activeCallSession.durationSeconds,
    }).catch(() => {});

    webrtc.stopLocalMedia();
    setActiveCallSession(null);
    loadAllData();
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedParticipants.length === 0) return;
    try {
      const res = await api.createGroupChat(groupName.trim(), 'ST Community Group', selectedParticipants);
      setShowNewChatModal(false);
      setGroupName('');
      setSelectedParticipants([]);
      loadAllData();
      setSelectedChat(res.chat);
      loadMessages(res.chat.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartDirectChat = async (targetUserId: string) => {
    try {
      const res = await api.createDirectChat(targetUserId);
      loadAllData();
      setSelectedChat(res.chat);
      loadMessages(res.chat.id);
      setActiveTab('chats');
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingTarget) return;
    try {
      await api.submitReport({
        targetId: reportingTarget.id,
        targetType: 'user',
        targetLabel: reportingTarget.name,
        reason: reportReason,
        details: reportDetails,
      });
      alert('Report submitted successfully to administrators.');
      setReportingTarget(null);
      setReportDetails('');
    } catch (e) {
      console.error(e);
    }
  };

  // Filtered chats list
  const filteredChats = chats.filter(c => {
    const name = c.type === 'direct' ? c.otherParticipant?.displayName : c.name;
    return !chatSearch || (name || '').toLowerCase().includes(chatSearch.toLowerCase());
  });

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0b141a] text-slate-100 overflow-hidden select-none">
      {/* 1. TOP BRAND & ACTION HEADER BAR */}
      <div className="h-12 bg-[#111b21] border-b border-[#202c33] px-3 sm:px-5 flex items-center justify-between text-xs shrink-0 z-30 relative">
        {/* Left: Brand Identity & Live Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 flex items-center justify-center shadow-md shadow-emerald-950/40">
              <img src="/icon.svg" alt="ST" className="w-5 h-5 object-contain" />
            </div>
            <span className="font-bold text-white text-sm tracking-tight">{siteName}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>End-to-End Encrypted</span>
          </div>
        </div>

        {/* Center: System Announcement */}
        {announcement && (
          <div className="hidden lg:flex items-center gap-1.5 text-amber-300 text-[11px] bg-amber-950/40 px-3 py-1 rounded-full border border-amber-800/40 truncate max-w-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{announcement}</span>
          </div>
        )}

        {/* Right: User Status Pill & Three-Dot Settings Menu */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* User Profile Pill */}
          <div
            onClick={() => setActiveTab('settings')}
            className="flex items-center gap-2 bg-[#182229] border border-[#263442] px-2.5 py-1 rounded-xl cursor-pointer hover:border-emerald-500/40 transition"
          >
            <div className="relative">
              <img
                src={currentUser.avatar}
                alt={currentUser.displayName}
                className="w-6 h-6 rounded-full object-cover"
              />
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border border-[#111b21]" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-white max-w-[100px] truncate">{currentUser.displayName}</span>
              {currentUser.verified && (
                <span title="Verified Blue Tick">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                </span>
              )}
              {currentUser.developer && (
                <span className="px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-bold font-mono">
                  DEV
                </span>
              )}
            </div>
          </div>

          {/* Three-Dot Menu Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTopMenu(!showTopMenu)}
              className="p-2 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-slate-300 hover:text-white transition cursor-pointer"
              title="Settings & Options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {/* Three-Dot Popover Menu */}
            {showTopMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-[#182229] border border-[#2a3942] rounded-2xl p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('settings');
                    setShowTopMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-200 hover:bg-[#202c33] hover:text-white transition cursor-pointer text-left"
                >
                  <Settings className="w-4 h-4 text-emerald-400" />
                  <span>Settings & Profile</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowNewChatModal(true);
                    setShowTopMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-200 hover:bg-[#202c33] hover:text-white transition cursor-pointer text-left"
                >
                  <Plus className="w-4 h-4 text-sky-400" />
                  <span>Start New Chat / Group</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('contacts');
                    setShowTopMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-200 hover:bg-[#202c33] hover:text-white transition cursor-pointer text-left"
                >
                  <Users className="w-4 h-4 text-purple-400" />
                  <span>Find Contacts & Directory</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleStartDirectChat('usr_st_ai');
                    setShowTopMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-200 hover:bg-[#202c33] hover:text-white transition cursor-pointer text-left"
                >
                  <Bot className="w-4 h-4 text-amber-400" />
                  <span>Talk with ST AI Assistant</span>
                </button>

                <div className="my-1 border-t border-[#2a3942]" />

                <button
                  type="button"
                  onClick={() => {
                    setShowTopMenu(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition cursor-pointer text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. MAIN APPLICATION WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">
        {/* Leftmost Icon Navigation Bar (hidden on very small screens, desktop/tablet rail) */}
        <aside className="hidden sm:flex w-16 bg-[#111b21] border-r border-[#202c33] flex-col items-center justify-between py-4 shrink-0 z-20">
          <div className="flex flex-col items-center gap-4 w-full">
            {/* App Icon */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
              <img src="/icon.svg" alt="ST" className="w-7 h-7 object-contain" />
            </div>

            {/* Navigation Tabs */}
            <nav className="flex flex-col items-center gap-2 w-full pt-2">
              {[
                { id: 'chats', label: 'Chats', icon: MessageSquare },
                { id: 'stories', label: 'Status', icon: CircleDashed },
                { id: 'channels', label: 'Channels', icon: Radio },
                { id: 'calls', label: 'Calls', icon: Phone },
                { id: 'contacts', label: 'Directory', icon: Users },
              ].map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer relative ${
                      active
                        ? 'bg-[#202c33] text-emerald-400 shadow'
                        : 'text-slate-400 hover:text-white hover:bg-[#202c33]/50'
                    }`}
                    title={tab.label}
                  >
                    <Icon className="w-5 h-5" />
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Bottom user settings, Admin Panel button & profile avatar */}
          <div className="flex flex-col items-center gap-3 w-full px-1.5">
            {/* Admin Panel Option at Bottom */}
            <button
              type="button"
              onClick={onSwitchToAdmin}
              className="w-full py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-500/30 transition cursor-pointer text-center"
              title="Admin Panel"
            >
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span className="text-[9px] font-bold tracking-tight">Admin Panel</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition cursor-pointer ${
                activeTab === 'settings' ? 'bg-[#202c33] text-emerald-400' : 'text-slate-400 hover:text-white'
              }`}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>

            <img
              src={currentUser.avatar}
              alt={currentUser.displayName}
              onClick={() => setActiveTab('settings')}
              className="w-9 h-9 rounded-full object-cover border-2 border-emerald-500 cursor-pointer shadow"
              title={`${currentUser.displayName} (@${currentUser.username})`}
            />

            <button
              type="button"
              onClick={onLogout}
              className="p-2 text-slate-500 hover:text-rose-400 transition cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </aside>

        {/* Dynamic Center/Left View: Chats Drawer or Social Module */}
        {activeTab === 'chats' ? (
          <>
            {/* Chats List Column */}
            <div className={`${selectedChat ? 'hidden sm:flex' : 'flex'} w-full sm:w-80 md:w-96 bg-[#111b21] border-r border-[#202c33] flex-col h-full shrink-0`}>
              {/* Header */}
              <div className="p-4 border-b border-[#202c33] flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Chats</h2>
                <button
                  type="button"
                  onClick={() => setShowNewChatModal(true)}
                  className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer shadow-lg shadow-emerald-950/40"
                  title="New Group or Chat"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Chat Search Box */}
              <div className="p-3 border-b border-[#202c33]">
                <div className="relative">
                  <input
                    type="text"
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    placeholder="Search or start new chat..."
                    className="w-full bg-[#202c33] border border-[#2a3942] focus:border-emerald-500 rounded-xl px-3 py-2 pl-9 text-xs text-white placeholder:text-slate-500 outline-none transition"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Chats List */}
              <div className="flex-1 overflow-y-auto divide-y divide-[#202c33]/40">
                {filteredChats.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-semibold text-white mb-1">No conversations yet</h4>
                    <p className="text-xs text-slate-400 mb-5 max-w-xs leading-relaxed">
                      Start your first real-time encrypted conversation now or connect with ST AI Assistant.
                    </p>
                    <div className="flex flex-col gap-2.5 w-full max-w-xs">
                      <button
                        type="button"
                        onClick={() => handleStartDirectChat('usr_st_ai')}
                        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 text-emerald-200" />
                        <span>Chat with ST AI Assistant</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('contacts')}
                        className="w-full py-2 px-4 bg-[#202c33] hover:bg-[#2a3942] text-slate-300 rounded-xl text-xs font-medium transition flex items-center justify-center gap-2 border border-[#2a3942] cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>Browse Member Directory</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  filteredChats.map((chat) => {
                    const isSelected = selectedChat?.id === chat.id;
                    const isDirect = chat.type === 'direct';
                    const target = chat.otherParticipant || {
                      displayName: chat.name || 'Chat',
                      avatar: chat.avatar || (isDirect ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2364748b'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E" : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2310b981'%3E%3Cpath d='M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z'/%3E%3C/svg%3E"),
                      isOnline: false,
                      verified: false,
                      developer: false,
                    };

                    return (
                      <div
                        key={chat.id}
                        onClick={() => handleSelectChat(chat)}
                        className={`p-3.5 flex items-center gap-3 transition cursor-pointer ${
                          isSelected ? 'bg-[#202c33]' : 'hover:bg-[#202c33]/50'
                        }`}
                      >
                        <div className="relative shrink-0">
                          <img
                            src={isDirect ? target.avatar : (chat.avatar || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2310b981'%3E%3Cpath d='M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z'/%3E%3C/svg%3E")}
                            alt={isDirect ? target.displayName : chat.name}
                            className="w-12 h-12 rounded-full object-cover border border-[#2a3942]"
                          />
                          {isDirect && (
                            <span
                              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#111b21] ${
                                target.isOnline ? 'bg-emerald-500' : 'bg-slate-500'
                              }`}
                            />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                              <h4 className="text-xs sm:text-sm font-semibold text-white truncate">
                                {isDirect ? target.displayName : chat.name}
                              </h4>
                              {target.verified && (
                                <span title="Verified Account">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 fill-sky-400/20" />
                                </span>
                              )}
                              {target.developer && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0"
                                  title="Developer Badge"
                                >
                                  <Code2 className="w-2.5 h-2.5" />
                                  <span>DEV</span>
                                </span>
                              )}
                            </div>
                            {chat.lastMessage && (
                              <span className="text-[10px] text-slate-500 shrink-0">
                                {new Date(chat.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <p className="truncate text-[11px]">
                              {chat.lastMessage ? chat.lastMessage.content : 'No messages yet'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Pane: Active Chat Screen */}
            {selectedChat ? (
              <div className={`${selectedChat ? 'flex' : 'hidden sm:flex'} flex-1 h-full w-full min-w-0`}>
                <ChatScreen
                  chat={selectedChat}
                  currentUser={currentUser}
                  messages={messages}
                  onBack={() => setSelectedChat(null)}
                  onSendMessage={handleSendMessage}
                  onStartCall={handleStartCall}
                  onRefreshMessages={() => loadMessages(selectedChat.id)}
                  onDeleteMessage={handleDeleteMessage}
                  onClearChat={() => handleClearChat(selectedChat.id)}
                  wallpaperId={wallpaper}
                  isTyping={partnerTyping}
                  onTypingChange={(typing) => {
                    api.sendWs('typing', { chatId: selectedChat.id, isTyping: typing });
                  }}
                />
              </div>
            ) : (
              <div className="flex-1 hidden sm:flex flex-col items-center justify-center p-8 text-center text-slate-500 bg-[#0b141a]">
                <MessageSquare className="w-16 h-16 stroke-[1.2] text-slate-600 mb-3" />
                <h3 className="text-lg font-bold text-white mb-1">ST CONNECTION Real-Time Messaging</h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  Select a contact or community group to begin encrypted conversations and WebRTC calling.
                </p>
              </div>
            )}
          </>
        ) : activeTab === 'stories' ? (
          <div className="flex-1 h-full">
            <StoriesView
              currentUser={currentUser}
              stories={stories}
              onRefresh={loadAllData}
            />
          </div>
        ) : activeTab === 'channels' ? (
          <div className="flex-1 h-full">
            <ChannelsView
              currentUser={currentUser}
              channels={channels}
              onRefresh={loadAllData}
            />
          </div>
        ) : activeTab === 'calls' ? (
          <div className="flex-1 h-full p-4 sm:p-6 bg-[#111b21] overflow-y-auto">
            <div className="max-w-xl mx-auto w-full">
              <h2 className="text-xl font-bold text-white mb-1">Calls & History</h2>
              <p className="text-xs text-slate-400 mb-6">Recent WebRTC audio and video calling records</p>

              <div className="space-y-3">
                {calls.map((c) => {
                  const isCaller = c.callerId === currentUser.id;
                  const otherName = isCaller ? c.receiverName : c.callerName;
                  const otherAvatar = isCaller ? '' : c.callerAvatar;
                  return (
                    <div
                      key={c.id}
                      className="p-4 rounded-2xl bg-[#202c33] border border-[#2a3942]/60 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-full ${
                          c.status === 'missed' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {c.type === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-white">{otherName}</h4>
                          <p className="text-xs text-slate-400 flex items-center gap-1">
                            <span>{c.status === 'missed' ? 'Missed call' : `${c.durationSeconds}s duration`}</span>
                            <span>•</span>
                            <span>{new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleStartCall(c.type)}
                        className="p-2.5 rounded-xl bg-[#2a3942] hover:bg-[#32444f] text-emerald-400 transition cursor-pointer"
                        title="Redial call"
                      >
                        {c.type === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : activeTab === 'contacts' ? (
          <div className="flex-1 h-full">
            <ContactsView
              currentUser={currentUser}
              onStartChat={handleStartDirectChat}
              onCallUser={(uid, name, avatar, type) => {
                handleStartDirectChat(uid).then(() => {
                  handleStartCall(type);
                });
              }}
              onReportUser={(uid, name) => {
                setReportingTarget({ id: uid, name });
              }}
            />
          </div>
        ) : (
          <div className="flex-1 h-full">
            <SettingsView
              currentUser={currentUser}
              onUpdateUser={(updated) => {}}
              onLogout={onLogout}
              selectedWallpaper={wallpaper}
              onSelectWallpaper={setWallpaper}
            />
          </div>
        )}
      </div>

      {/* 2.5 MOBILE BOTTOM NAVIGATION BAR */}
      {!selectedChat && (
        <nav className="sm:hidden bg-[#111b21] border-t border-[#202c33] px-2 py-1.5 flex items-center justify-around z-20 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('chats')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg cursor-pointer transition ${
              activeTab === 'chats' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="text-[10px]">Chats</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stories')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg cursor-pointer transition ${
              activeTab === 'stories' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <CircleDashed className="w-4 h-4" />
            <span className="text-[10px]">Status</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('channels')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg cursor-pointer transition ${
              activeTab === 'channels' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span className="text-[10px]">Channels</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('calls')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg cursor-pointer transition ${
              activeTab === 'calls' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Phone className="w-4 h-4" />
            <span className="text-[10px]">Calls</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('contacts')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg cursor-pointer transition ${
              activeTab === 'contacts' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="text-[10px]">Directory</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg cursor-pointer transition ${
              activeTab === 'settings' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="text-[10px]">Settings</span>
          </button>
          <button
            type="button"
            onClick={onSwitchToAdmin}
            className="flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg cursor-pointer transition text-rose-400 hover:text-rose-300"
            title="Open Admin Portal"
          >
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span className="text-[10px] font-bold">Admin Panel</span>
          </button>
        </nav>
      )}
      {activeCallSession && (
        <CallModal
          session={activeCallSession}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
          onEnd={handleEndCall}
        />
      )}

      {/* 4. NEW CHAT & GROUP MODAL */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111b21] border border-[#202c33] rounded-2xl p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">New Conversation / Group</h3>
              <button
                type="button"
                onClick={() => setShowNewChatModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Group Title (Optional for 1:1 chat)</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Design Syndicate 🎨"
                  className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl px-3 py-2 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-2">Select Members to Include</label>
                <div className="max-h-48 overflow-y-auto space-y-1.5 p-1">
                  {directoryUsers.filter(u => u.id !== currentUser.id).map(user => {
                    const isSelected = selectedParticipants.includes(user.id);
                    return (
                      <div
                        key={user.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedParticipants(selectedParticipants.filter(id => id !== user.id));
                          } else {
                            setSelectedParticipants([...selectedParticipants, user.id]);
                          }
                        }}
                        className={`p-2 rounded-xl flex items-center justify-between cursor-pointer transition ${
                          isSelected ? 'bg-emerald-600/30 border border-emerald-500/50' : 'bg-[#202c33] hover:bg-[#2a3942]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <img src={user.avatar} alt={user.username} className="w-8 h-8 rounded-full object-cover" />
                          <div>
                            <p className="text-xs font-semibold text-white">{user.displayName}</p>
                            <p className="text-[10px] text-slate-400">@{user.username}</p>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                {selectedParticipants.length === 1 && !groupName ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleStartDirectChat(selectedParticipants[0]);
                      setShowNewChatModal(false);
                    }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Start 1:1 Chat
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!groupName.trim() || selectedParticipants.length === 0}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Create Community Group
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. USER REPORT MODAL */}
      {reportingTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111b21] border border-[#202c33] rounded-2xl p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-rose-400 font-bold">
                <AlertTriangle className="w-5 h-5" />
                <span>Report User: {reportingTarget.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setReportingTarget(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitReport} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Violation Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl px-3 py-2 text-white outline-none cursor-pointer"
                >
                  <option value="Spam or unsolicited messages">Spam or unsolicited messages</option>
                  <option value="Harassment or hateful conduct">Harassment or hateful conduct</option>
                  <option value="Impersonation of another person">Impersonation of another person</option>
                  <option value="Inappropriate media content">Inappropriate media content</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Additional details (optional)</label>
                <textarea
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  rows={3}
                  placeholder="Describe what occurred..."
                  className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl p-2.5 text-white outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-rose-600 hover:bg-rose-500 py-2.5 rounded-xl font-bold text-white transition cursor-pointer"
              >
                Submit Report to Moderation
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
