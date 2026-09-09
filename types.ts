/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  profilePic?: string;
  coverPhoto?: string;
  bio?: string;
  work?: string;
  education?: string;
  city?: string;
  hometown?: string;
  relationship?: 'Single' | 'In a relationship' | 'Engaged' | 'Married' | 'It\'s complicated' | 'Separated' | 'Divorced' | 'Widowed';
  website?: string;
  phone?: string;
  birthday?: string;
  gender?: 'Male' | 'Female' | 'Custom' | 'Prefer not to say';
  socialLinks?: {
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    github?: string;
  };
  intro?: string;
  featuredPhotos?: string[];
  friendsCount: number;
  friends: string[]; // User IDs
  followers: string[]; // User IDs
  following: string[]; // User IDs
  postsCount: number;
  visibility: 'Public' | 'Friends' | 'Only Me';
  verifyBadge: boolean;
  loginHistory: {
    timestamp: string;
    device: string;
    ip: string;
    status: 'success' | 'failed';
  }[];
  failedLoginAttempts: number;
  isLocked: boolean;
  is2FAEnabled?: boolean;
  otpSecret?: string;
  createdAt: string;
  isDeactivated?: boolean;
  lastActiveAt?: string;
  blockedUsers?: string[]; // Array of blocked user IDs
}

export type ReactionType = 'like' | 'love' | 'care' | 'haha' | 'wow' | 'sad' | 'angry';

export interface CommentReaction {
  userId: string;
  type: ReactionType;
}

export interface Reply {
  id: string;
  userId: string;
  username: string;
  userAvatar?: string;
  text: string;
  createdAt: string;
  reactions?: Record<string, ReactionType>; // userId -> ReactionType
}

export interface Comment {
  id: string;
  userId: string;
  username: string;
  userAvatar?: string;
  text: string;
  createdAt: string;
  replies: Reply[];
  reactions?: Record<string, ReactionType>; // userId -> ReactionType
}

export interface Post {
  id: string;
  userId: string;
  username: string;
  userAvatar?: string;
  verifyBadge?: boolean;
  text: string;
  mediaUrls?: string[];
  mediaType?: 'image' | 'video';
  feeling?: string;
  location?: string;
  tags?: string[]; // userNames
  privacy: 'Public' | 'Friends' | 'Only Me';
  scheduledTime?: string; // ISO String
  isDraft?: boolean;
  isPinned?: boolean;
  commentsDisabled?: boolean;
  createdAt: string;
  reactions: Record<string, ReactionType>; // userId -> ReactionType
  comments: Comment[];
  pollOptions?: { text: string; votes: string[] }[]; // options and list of userIds who voted
  hashtags?: string[];
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'voice' | 'document';
  emoji?: string;
  gif?: string;
  isRead: boolean;
  isDelivered: boolean;
  createdAt: string;
  seenAt?: string;
}

export interface Notification {
  id: string;
  recipientId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  type: 'friend_request' | 'like' | 'comment' | 'reply' | 'follow' | 'tag' | 'message' | 'system' | 'invite';
  message: string;
  isRead: boolean;
  createdAt: string;
  relatedId?: string; // postId, pageId, groupId, etc.
}

export interface Page {
  id: string;
  name: string;
  category: string;
  coverPhoto?: string;
  profilePic?: string;
  bio?: string;
  creatorId: string;
  followersCount: number;
  followers: string[]; // User IDs
  posts: Post[];
  invitees: string[]; // User IDs
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  privacy: 'public' | 'private';
  coverPhoto?: string;
  description?: string;
  creatorId: string;
  members: string[]; // User IDs
  admins: string[]; // User IDs
  moderators: string[]; // User IDs
  posts: Post[];
  createdAt: string;
}

export interface Story {
  id: string;
  userId: string;
  username: string;
  userAvatar?: string;
  mediaUrl: string;
  type: 'image' | 'video';
  createdAt: string;
  seenBy: string[]; // User IDs
  seenDetails?: {
    userId: string;
    username: string;
    userAvatar?: string;
    seenAt: string;
  }[];
}

export interface MarketplaceItem {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  mediaUrls: string[];
  sellerId: string;
  sellerName: string;
  sellerAvatar?: string;
  location: string;
  createdAt: string;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  creatorId: string;
  creatorName: string;
  interested: string[]; // User IDs
  attending: string[]; // User IDs
  invitees: string[]; // User IDs
  calendarReminder?: boolean;
  mediaUrl?: string;
  isOfficial?: boolean;
  createdAt: string;
}

export interface Report {
  id: string;
  reporterId: string;
  reportedId: string; // post ID, comment ID, user ID, etc.
  type: 'post' | 'comment' | 'user' | 'group' | 'page';
  reason: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
}

export interface SystemSettings {
  siteName: string;
  maintenanceMode: boolean;
  allowSignups: boolean;
  defaultTheme: 'light' | 'dark';
}
