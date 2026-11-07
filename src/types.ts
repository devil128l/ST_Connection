export interface SafeUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatar: string;
  coverImage?: string;
  bio: string;
  role: 'super_admin' | 'admin' | 'moderator' | 'user';
  verified: boolean;
  developer?: boolean;
  status: 'active' | 'suspended' | 'banned';
  isOnline: boolean;
  lastSeen: string;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  customStatus?: string;
  createdAt: string;
}

export interface MessageReaction {
  emoji: string;
  userId: string;
  username: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file';
  mediaUrl?: string;
  fileName?: string;
  fileSize?: string;
  audioDuration?: number;
  replyTo?: {
    id: string;
    senderName: string;
    content: string;
  };
  reactions: MessageReaction[];
  status: 'sent' | 'delivered' | 'read';
  isEdited?: boolean;
  isPinned?: boolean;
  isStarredBy?: string[];
  deletedFor?: string[];
  isDeletedForEveryone?: boolean;
  createdAt: string;
}

export interface ChatParticipant {
  id: string;
  displayName: string;
  username: string;
  avatar: string;
  isOnline: boolean;
  lastSeen?: string;
  verified?: boolean;
  developer?: boolean;
}

export interface Chat {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  description?: string;
  avatar?: string;
  participantIds: string[];
  adminIds?: string[];
  moderatorIds?: string[];
  lastMessage?: {
    content: string;
    senderId: string;
    createdAt: string;
  };
  disappearingDuration?: number;
  wallpaper?: string;
  inviteCode?: string;
  otherParticipant?: ChatParticipant;
  participants?: ChatParticipant[];
  createdAt: string;
}

export interface Story {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  type: 'text' | 'image';
  content: string;
  backgroundColor?: string;
  fontStyle?: string;
  mediaUrl?: string;
  viewers: { userId: string; username: string; viewedAt: string }[];
  expiresAt: number;
  createdAt: string;
}

export interface Channel {
  id: string;
  name: string;
  handle: string;
  description: string;
  avatar: string;
  coverImage?: string;
  ownerId: string;
  verified: boolean;
  subscribersCount: number;
  subscriberIds: string[];
  createdAt: string;
}

export interface ChannelPost {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  content: string;
  mediaUrl?: string;
  likesCount: number;
  likedBy: string[];
  createdAt: string;
}

export interface CallRecord {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  receiverId: string;
  receiverName: string;
  type: 'voice' | 'video';
  status: 'completed' | 'missed' | 'declined' | 'busy';
  durationSeconds: number;
  createdAt: string;
}

export interface Report {
  id: string;
  reporterId: string;
  reporterUsername: string;
  targetId: string;
  targetType: 'user' | 'message' | 'group' | 'channel';
  targetLabel: string;
  reason: string;
  details?: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
}

export interface SystemSettings {
  accessPassword: string;
  registrationEnabled: boolean;
  features: {
    calling: boolean;
    geminiAi: boolean;
    stories: boolean;
    channels: boolean;
    mediaUploads: boolean;
    voiceNotes: boolean;
  };
  maintenanceMode: boolean;
  maintenanceMessage: string;
  siteSettings: {
    siteName: string;
    logoUrl: string;
    announcement: string;
  };
  aiSettings: {
    enabled: boolean;
    model: string;
    dailyLimit: number;
    systemPrompt: string;
  };
}
