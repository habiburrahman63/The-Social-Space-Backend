/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, Post, Message, Notification, Page, Group, Story, MarketplaceItem, Event, Report, SystemSettings } from '../types';
import { MONGODB_URI } from '../config/env';

const DB_FILE = path.join(process.cwd(), 'db.json');
const MONGO_URI = MONGODB_URI;

interface VerificationCodeEntry {
  code: string;
  expires: number;
}

interface DatabaseSchema {
  users: User[];
  posts: Post[];
  messages: Message[];
  notifications: Notification[];
  pages: Page[];
  groups: Group[];
  stories: Story[];
  marketplace: MarketplaceItem[];
  events: Event[];
  reports: Report[];
  settings: SystemSettings;
  verificationCodes?: Record<string, VerificationCodeEntry>;
  resetOTPs?: Record<string, VerificationCodeEntry>;
}

let dbCache: DatabaseSchema | null = null;

// MongoDB State Schema
const StateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

const StateModel = mongoose.models.State || mongoose.model('State', StateSchema);

export async function initMongoDB() {
  try {
    if (mongoose.connection.readyState === 1) {
      if (!dbCache) {
        const stateDoc: any = await (StateModel as any).findOne({ key: 'database_state' });
        if (stateDoc && stateDoc.data) {
          dbCache = stateDoc.data;
        } else {
          dbCache = generateSeeds();
          await (StateModel as any).updateOne({ key: 'database_state' }, { $set: { data: dbCache } }, { upsert: true });
        }
      }
      return;
    }

    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    console.log('MongoDB connected successfully!');

    const fetchStateWithTimeout = Promise.race([
      (StateModel as any).findOne({ key: 'database_state' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('MongoDB query timed out after 5s')), 5000))
    ]);

    const stateDoc: any = await fetchStateWithTimeout;
    if (stateDoc && stateDoc.data) {
      console.log('Successfully loaded state from MongoDB!');
      dbCache = stateDoc.data;
    } else {
      console.log('No existing state doc in MongoDB. Generating seeds...');
      dbCache = generateSeeds();
      const newState = new (StateModel as any)({
        key: 'database_state',
        data: dbCache
      });
      await newState.save();
      console.log('Initialized and saved seeded database state to MongoDB!');
    }
  } catch (err: any) {
    console.error('MongoDB initialization notice, falling back to local database:', err?.message || err);
    if (!dbCache) {
      dbCache = loadDatabase();
    }
  }

  // Ensure admin user profile picture, username, and event images are updated in the loaded DB state
  if (dbCache) {
    let changed = false;
    if (dbCache.users) {
      const admin = dbCache.users.find(u => u.id === 'usr-admin');
      if (admin) {
        const adminAvatar = 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=500';
        if (!admin.profilePic || admin.profilePic === '/admin_profile_pic.jpg') {
          admin.profilePic = adminAvatar;
          changed = true;
        }
        if (admin.username !== 'System Admin') {
          admin.username = 'System Admin';
          changed = true;
        }
      }
    }
    if (dbCache.events) {
      dbCache.events.forEach((evt, idx) => {
        if (!evt.mediaUrl) {
          evt.mediaUrl = idx % 2 === 0
            ? 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600'
            : 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600';
          changed = true;
        }
      });
    }
    if (changed) {
      console.log('Force updated dbCache details!');
      await saveDatabase();
    }
  }
}

function loadDatabase(): DatabaseSchema {
  if (dbCache) return dbCache;

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      dbCache = JSON.parse(raw);
      return dbCache!;
    } catch (e) {
      console.error('Error reading db.json, generating default database...', e);
    }
  }

  // Create default database with seeds
  dbCache = generateSeeds();
  saveDatabase();
  return dbCache;
}

export async function saveDatabase() {
  if (!dbCache) return;
  try {
    // 1. Write locally as fallback if filesystem allows
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf-8');
    } catch (_fsErr) {
      // Read-only filesystem in serverless environments (e.g., Vercel)
    }

    // 2. Write to MongoDB synchronously if connected
    if (mongoose.connection.readyState >= 1) {
      await (StateModel as any).updateOne(
        { key: 'database_state' },
        { $set: { data: dbCache } },
        { upsert: true }
      );
    }
  } catch (e) {
    console.error('Failed to write database:', e);
  }
}

function generateSeeds(): DatabaseSchema {
  const salt = bcrypt.genSaltSync(10);
  const hashedDefaultPassword = bcrypt.hashSync('password123', salt);

  const users: User[] = [
    {
      id: 'usr-admin',
      username: 'System Admin',
      email: 'admin@social.com',
      passwordHash: hashedDefaultPassword,
      profilePic: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=500',
      coverPhoto: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
      bio: 'Platform System Administrator & Lead Architect',
      work: 'Staff Engineer at SocialCorp',
      education: 'Stanford University',
      city: 'Palo Alto, CA',
      hometown: 'San Francisco, CA',
      relationship: 'Married',
      website: 'https://social.com',
      phone: '+1 (555) 123-4567',
      birthday: '1990-05-15',
      gender: 'Male',
      socialLinks: {
        twitter: 'https://twitter.com/admin',
        github: 'https://github.com/admin'
      },
      intro: 'Building the future of decentralized social networks.',
      featuredPhotos: [
        'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=300',
        'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=300'
      ],
      friendsCount: 4,
      friends: ['usr-jane', 'usr-john', 'usr-alex', 'usr-sarah'],
      followers: ['usr-jane', 'usr-john', 'usr-alex', 'usr-sarah', 'usr-bruce'],
      following: ['usr-jane', 'usr-john', 'usr-alex', 'usr-sarah'],
      postsCount: 2,
      visibility: 'Public',
      verifyBadge: true,
      loginHistory: [
        { timestamp: new Date().toISOString(), device: 'Chrome / Windows', ip: '127.0.0.1', status: 'success' }
      ],
      failedLoginAttempts: 0,
      isLocked: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr-jane',
      username: 'Jane Smith',
      email: 'jane@social.com',
      passwordHash: hashedDefaultPassword,
      profilePic: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      coverPhoto: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=800',
      bio: 'Creative Director and nature photographer',
      work: 'Director at PixelVibe Studio',
      education: 'Rhode Island School of Design',
      city: 'Portland, OR',
      hometown: 'Seattle, WA',
      relationship: 'In a relationship',
      website: 'https://pixelvibe.com',
      birthday: '1993-11-22',
      gender: 'Female',
      socialLinks: {
        instagram: 'https://instagram.com/janesmith'
      },
      intro: 'Chasing golden hours & scenic layouts.',
      featuredPhotos: [
        'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=300',
        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=300'
      ],
      friendsCount: 3,
      friends: ['usr-admin', 'usr-john', 'usr-alex'],
      followers: ['usr-admin', 'usr-john', 'usr-alex'],
      following: ['usr-admin', 'usr-john', 'usr-alex'],
      postsCount: 1,
      visibility: 'Public',
      verifyBadge: true,
      loginHistory: [],
      failedLoginAttempts: 0,
      isLocked: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr-john',
      username: 'John Doe',
      email: 'john@social.com',
      passwordHash: hashedDefaultPassword,
      profilePic: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      coverPhoto: 'https://images.unsplash.com/photo-1472214222541-d510753a4907?w=800',
      bio: 'Avid traveler, coffee enthusiast, and tech blogger',
      work: 'Tech Writer at TechRadar',
      education: 'NYU',
      city: 'Brooklyn, NY',
      hometown: 'Boston, MA',
      relationship: 'Single',
      birthday: '1991-02-10',
      gender: 'Male',
      friendsCount: 3,
      friends: ['usr-admin', 'usr-jane', 'usr-alex'],
      followers: ['usr-admin', 'usr-jane', 'usr-alex'],
      following: ['usr-admin', 'usr-jane', 'usr-alex'],
      postsCount: 1,
      visibility: 'Public',
      verifyBadge: false,
      loginHistory: [],
      failedLoginAttempts: 0,
      isLocked: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr-alex',
      username: 'Alex Johnson',
      email: 'alex@social.com',
      passwordHash: hashedDefaultPassword,
      profilePic: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      coverPhoto: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800',
      bio: 'Mountain climber, adventurer and UI wizard',
      work: 'Senior UI/UX at Figma',
      education: 'UC Berkeley',
      city: 'San Francisco, CA',
      hometown: 'Denver, CO',
      relationship: 'Single',
      birthday: '1992-08-04',
      gender: 'Male',
      friendsCount: 3,
      friends: ['usr-admin', 'usr-jane', 'usr-john'],
      followers: ['usr-admin', 'usr-jane', 'usr-john'],
      following: ['usr-admin', 'usr-jane', 'usr-john'],
      postsCount: 1,
      visibility: 'Public',
      verifyBadge: false,
      loginHistory: [],
      failedLoginAttempts: 0,
      isLocked: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr-sarah',
      username: 'Sarah Connor',
      email: 'sarah@social.com',
      passwordHash: hashedDefaultPassword,
      profilePic: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
      coverPhoto: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800',
      bio: 'Preparing for the future. Fitness enthusiast.',
      work: 'Security Specialist',
      education: 'None of your business',
      city: 'Los Angeles, CA',
      hometown: 'Los Angeles, CA',
      relationship: 'Single',
      birthday: '1984-11-10',
      gender: 'Female',
      friendsCount: 1,
      friends: ['usr-admin'],
      followers: ['usr-admin'],
      following: ['usr-admin'],
      postsCount: 0,
      visibility: 'Friends',
      verifyBadge: false,
      loginHistory: [],
      failedLoginAttempts: 0,
      isLocked: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr-bruce',
      username: 'Bruce Wayne',
      email: 'bruce@social.com',
      passwordHash: hashedDefaultPassword,
      profilePic: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150',
      coverPhoto: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',
      bio: 'Philanthropist, Tech Investor, Night Owl.',
      work: 'CEO at Wayne Enterprises',
      education: 'Princeton University',
      city: 'Gotham City',
      hometown: 'Gotham City',
      relationship: 'It\'s complicated',
      website: 'https://waynecorp.com',
      birthday: '1980-04-17',
      gender: 'Male',
      friendsCount: 0,
      friends: [],
      followers: [],
      following: ['usr-admin'],
      postsCount: 0,
      visibility: 'Public',
      verifyBadge: true,
      loginHistory: [],
      failedLoginAttempts: 0,
      isLocked: false,
      createdAt: new Date().toISOString()
    }
  ];

  const posts: Post[] = [
    {
      id: 'pst-1',
      userId: 'usr-admin',
      username: 'admin',
      userAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      verifyBadge: true,
      text: 'Welcome to our brand new social network built on a highly optimized, full-stack architecture! 💻🚀 Check out the responsive UI, native dark mode, high-fidelity widgets, stories, real-time messenger and admin panel!',
      mediaUrls: ['https://images.unsplash.com/photo-1551434678-e076c223a692?w=800'],
      mediaType: 'image',
      feeling: 'excited',
      location: 'Silicon Valley',
      privacy: 'Public',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hours ago
      reactions: {
        'usr-jane': 'love',
        'usr-john': 'like',
        'usr-alex': 'like'
      },
      comments: [
        {
          id: 'cmt-1',
          userId: 'usr-jane',
          username: 'Jane Smith',
          userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
          text: 'This UI is super clean! Stunned by the soft shadows and transitions.',
          createdAt: new Date(Date.now() - 3600000 * 1.8).toISOString(),
          replies: [
            {
              id: 'rpl-1',
              userId: 'usr-admin',
              username: 'admin',
              userAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
              text: 'Thanks Jane! Put a lot of effort into CSS layout and micro-animations.',
              createdAt: new Date(Date.now() - 3600000 * 1.5).toISOString(),
              reactions: { 'usr-jane': 'like' }
            }
          ],
          reactions: {
            'usr-admin': 'like',
            'usr-alex': 'love'
          }
        },
        {
          id: 'cmt-2',
          userId: 'usr-john',
          username: 'John Doe',
          userAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
          text: 'Does this support real-time chat yet? 👀',
          createdAt: new Date(Date.now() - 3600000 * 1.2).toISOString(),
          replies: [
            {
              id: 'rpl-2',
              userId: 'usr-admin',
              username: 'admin',
              userAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
              text: 'Yes! Real-time message exchange, typing indicators and online statuses are fully connected!',
              createdAt: new Date(Date.now() - 3600000 * 1.1).toISOString(),
              reactions: { 'usr-john': 'wow' }
            }
          ],
          reactions: { 'usr-admin': 'like' }
        }
      ],
      hashtags: ['social', 'launch', 'tech']
    },
    {
      id: 'pst-2',
      userId: 'usr-jane',
      username: 'Jane Smith',
      userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      verifyBadge: true,
      text: 'Had an amazing photo session early this morning in the Columbia River Gorge. The fog was rolling perfectly over the peaks. Nature never fails to inspire!',
      mediaUrls: ['https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=800'],
      mediaType: 'image',
      feeling: 'peaceful',
      location: 'Columbia River Gorge',
      privacy: 'Public',
      createdAt: new Date(Date.now() - 3600000 * 5).toISOString(), // 5 hours ago
      reactions: {
        'usr-admin': 'love',
        'usr-john': 'like'
      },
      comments: [
        {
          id: 'cmt-3',
          userId: 'usr-admin',
          username: 'admin',
          userAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
          text: 'Absolutely breathtaking, Jane! Post this to the Photography Group!',
          createdAt: new Date(Date.now() - 3600000 * 4.5).toISOString(),
          replies: []
        }
      ]
    },
    {
      id: 'pst-3',
      userId: 'usr-john',
      username: 'John Doe',
      userAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      text: 'Just finished brewing a fresh batch of Ethiopian Yirgacheffe beans using the V60 method. The floral and jasmine notes are absolutely on point today. ☕️',
      mediaUrls: ['https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800'],
      mediaType: 'image',
      feeling: 'blessed',
      location: 'Brooklyn, NY',
      privacy: 'Public',
      createdAt: new Date(Date.now() - 3600000 * 8).toISOString(), // 8 hours ago
      reactions: {
        'usr-jane': 'like',
        'usr-admin': 'haha'
      },
      comments: []
    }
  ];

  const messages: Message[] = [
    {
      id: 'msg-1',
      senderId: 'usr-jane',
      receiverId: 'usr-admin',
      text: 'Hey admin, are you there? Wanted to ask about the theme customizer.',
      isRead: true,
      isDelivered: true,
      createdAt: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: 'msg-2',
      senderId: 'usr-admin',
      receiverId: 'usr-jane',
      text: 'Hey Jane! Yes, the customizer supports instant toggle for Dark Mode and theme settings instantly.',
      isRead: true,
      isDelivered: true,
      createdAt: new Date(Date.now() - 3600000 + 120000).toISOString()
    },
    {
      id: 'msg-3',
      senderId: 'usr-jane',
      receiverId: 'usr-admin',
      text: 'Awesome, looks super smooth!',
      isRead: false,
      isDelivered: true,
      createdAt: new Date(Date.now() - 3600000 + 300000).toISOString()
    }
  ];

  const notifications: Notification[] = [
    {
      id: 'ntf-1',
      recipientId: 'usr-admin',
      senderId: 'usr-jane',
      senderName: 'Jane Smith',
      senderAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      type: 'like',
      message: 'liked your post about the new network launch',
      isRead: false,
      createdAt: new Date(Date.now() - 600000).toISOString(), // 10m ago
      relatedId: 'pst-1'
    },
    {
      id: 'ntf-2',
      recipientId: 'usr-admin',
      senderId: 'usr-john',
      senderName: 'John Doe',
      senderAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      type: 'comment',
      message: 'commented on your post: "Does this support real-time chat yet?..."',
      isRead: false,
      createdAt: new Date(Date.now() - 1200000).toISOString(), // 20m ago
      relatedId: 'pst-1'
    }
  ];

  const pages: Page[] = [
    {
      id: 'pg-1',
      name: 'PixelVibe Studio',
      category: 'Design & Tech',
      coverPhoto: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
      profilePic: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=150',
      bio: 'Crafting stunning graphics, modern typography, and pixel-perfect interactions for brands worldwide.',
      creatorId: 'usr-jane',
      followersCount: 1540,
      followers: ['usr-admin', 'usr-john', 'usr-alex'],
      posts: [],
      invitees: [],
      createdAt: new Date().toISOString()
    },
    {
      id: 'pg-2',
      name: 'Gourmet Bytes',
      category: 'Food & Cooking',
      coverPhoto: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800',
      profilePic: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=150',
      bio: 'Weekly recipes, technical cooking guidelines, and culinary design.',
      creatorId: 'usr-john',
      followersCount: 820,
      followers: ['usr-admin', 'usr-jane'],
      posts: [],
      invitees: [],
      createdAt: new Date().toISOString()
    }
  ];

  const groups: Group[] = [
    {
      id: 'grp-1',
      name: 'Tech Innovators',
      privacy: 'public',
      coverPhoto: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800',
      description: 'A global collective of software engineers, AI developers, product owners and tech bloggers sharing the latest advancements.',
      creatorId: 'usr-admin',
      members: ['usr-admin', 'usr-jane', 'usr-john', 'usr-alex'],
      admins: ['usr-admin'],
      moderators: ['usr-jane'],
      posts: [],
      createdAt: new Date().toISOString()
    },
    {
      id: 'grp-2',
      name: 'Outdoor Explorers & Hikers',
      privacy: 'public',
      coverPhoto: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800',
      description: 'Find your trail! Sharing hiking itineraries, safety equipment lists, and breathtaking scenic captures.',
      creatorId: 'usr-alex',
      members: ['usr-alex', 'usr-jane', 'usr-john', 'usr-admin'],
      admins: ['usr-alex'],
      moderators: [],
      posts: [],
      createdAt: new Date().toISOString()
    }
  ];

  const stories: Story[] = [
    {
      id: 'str-1',
      userId: 'usr-jane',
      username: 'Jane Smith',
      userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      mediaUrl: 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=400',
      type: 'image',
      createdAt: new Date().toISOString(),
      seenBy: ['usr-admin']
    },
    {
      id: 'str-2',
      userId: 'usr-alex',
      username: 'Alex Johnson',
      userAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      mediaUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=400',
      type: 'image',
      createdAt: new Date().toISOString(),
      seenBy: []
    }
  ];

  const marketplace: MarketplaceItem[] = [
    {
      id: 'mkt-1',
      title: 'Ergonomic Standing Desk (MINT)',
      description: 'Sturdy standing desk, programmable electric adjustment, dual-motor. Moving and can\'t take it with me. Retails for $450.',
      price: 180,
      category: 'Electronics & Office',
      mediaUrls: ['https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?w=600'],
      sellerId: 'usr-alex',
      sellerName: 'Alex Johnson',
      sellerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      location: 'San Francisco, CA',
      createdAt: new Date().toISOString()
    },
    {
      id: 'mkt-2',
      title: 'Fujifilm X-T30 Mirrorless Camera Body',
      description: 'Fuji color science! Body is in excellent condition, includes two batteries, strap, and original box. 26.1MP APS-C sensor.',
      price: 650,
      category: 'Hobbies & Cameras',
      mediaUrls: ['https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600'],
      sellerId: 'usr-jane',
      sellerName: 'Jane Smith',
      sellerAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      location: 'Portland, OR',
      createdAt: new Date().toISOString()
    }
  ];

  const events: Event[] = [
    {
      id: 'evt-1',
      title: 'Annual Silicon Valley DevSummit',
      description: 'Connect with 500+ builders, founders, and engineers. Covers React 19, serverless edge networks, vector embedding models, and custom agents.',
      date: '2026-08-25T09:00:00.000Z',
      location: 'San Jose Convention Center, CA',
      creatorId: 'usr-admin',
      creatorName: 'admin',
      interested: ['usr-jane', 'usr-john'],
      attending: ['usr-admin', 'usr-alex'],
      invitees: ['usr-sarah'],
      calendarReminder: true,
      mediaUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600',
      createdAt: new Date().toISOString()
    },
    {
      id: 'evt-2',
      title: 'Columbia Gorge Sunset Hike',
      description: 'Moderate 4-mile loop hike followed by standard camp networking at the overlook point. Meet at Trailhead B.',
      date: '2026-07-20T17:30:00.000Z',
      location: 'Columbia Gorge Trailhead B',
      creatorId: 'usr-jane',
      creatorName: 'Jane Smith',
      interested: ['usr-admin', 'usr-john'],
      attending: ['usr-jane', 'usr-alex'],
      invitees: [],
      calendarReminder: false,
      mediaUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600',
      createdAt: new Date().toISOString()
    }
  ];

  const reports: Report[] = [];

  const settings: SystemSettings = {
    siteName: 'SocialSpace',
    maintenanceMode: false,
    allowSignups: true,
    defaultTheme: 'light'
  };

  return {
    users,
    posts,
    messages,
    notifications,
    pages,
    groups,
    stories,
    marketplace,
    events,
    reports,
    settings
  };
}

export const db = {
  getUsers: () => loadDatabase().users,
  getUserById: (id: string) => loadDatabase().users.find(u => u.id === id),
  getUserByEmail: (email: string) => loadDatabase().users.find(u => u.email.toLowerCase() === email.toLowerCase()),
  saveUser: (user: User) => {
    const data = loadDatabase();
    const idx = data.users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      data.users[idx] = user;
    } else {
      data.users.push(user);
    }
    saveDatabase();
  },

  getPosts: () => loadDatabase().posts,
  getPostById: (id: string) => loadDatabase().posts.find(p => p.id === id),
  savePost: (post: Post) => {
    const data = loadDatabase();
    const idx = data.posts.findIndex(p => p.id === post.id);
    if (idx !== -1) {
      data.posts[idx] = post;
    } else {
      data.posts.unshift(post);
    }
    saveDatabase();
  },
  deletePost: (id: string) => {
    const data = loadDatabase();
    data.posts = data.posts.filter(p => p.id !== id);
    saveDatabase();
  },

  getMessages: () => loadDatabase().messages,
  saveMessage: (msg: Message) => {
    const data = loadDatabase();
    data.messages.push(msg);
    saveDatabase();
  },
  updateMessage: (msg: Message) => {
    const data = loadDatabase();
    const idx = data.messages.findIndex(m => m.id === msg.id);
    if (idx !== -1) {
      data.messages[idx] = msg;
      saveDatabase();
    }
  },

  getNotifications: () => loadDatabase().notifications,
  saveNotification: (notif: Notification) => {
    const data = loadDatabase();
    // Prevent notifications if either is blocked
    const senderId = notif.senderId;
    const recipientId = notif.recipientId;
    if (senderId && recipientId) {
      const sender = data.users.find(u => u.id === senderId);
      const recipient = data.users.find(u => u.id === recipientId);
      if (sender && recipient) {
        const senderBlocked = sender.blockedUsers || [];
        const recipientBlocked = recipient.blockedUsers || [];
        if (senderBlocked.includes(recipientId) || recipientBlocked.includes(senderId)) {
          // Blocked! Do not save this notification
          return;
        }
      }
    }
    data.notifications.unshift(notif);
    saveDatabase();
  },
  updateNotification: (notif: Notification) => {
    const data = loadDatabase();
    const idx = data.notifications.findIndex(n => n.id === notif.id);
    if (idx !== -1) {
      data.notifications[idx] = notif;
      saveDatabase();
    }
  },
  deleteNotification: (id: string) => {
    const data = loadDatabase();
    data.notifications = data.notifications.filter(n => n.id !== id);
    saveDatabase();
  },
  clearAllNotifications: (recipientId: string) => {
    const data = loadDatabase();
    data.notifications = data.notifications.filter(n => n.recipientId !== recipientId);
    saveDatabase();
  },

  getPages: () => loadDatabase().pages,
  savePage: (page: Page) => {
    const data = loadDatabase();
    const idx = data.pages.findIndex(p => p.id === page.id);
    if (idx !== -1) {
      data.pages[idx] = page;
    } else {
      data.pages.push(page);
    }
    saveDatabase();
  },

  getGroups: () => loadDatabase().groups,
  saveGroup: (group: Group) => {
    const data = loadDatabase();
    const idx = data.groups.findIndex(g => g.id === group.id);
    if (idx !== -1) {
      data.groups[idx] = group;
    } else {
      data.groups.push(group);
    }
    saveDatabase();
  },

  getStories: () => loadDatabase().stories,
  saveStory: (story: Story) => {
    const data = loadDatabase();
    data.stories.unshift(story);
    saveDatabase();
  },
  updateStory: (story: Story) => {
    const data = loadDatabase();
    const idx = data.stories.findIndex(s => s.id === story.id);
    if (idx !== -1) {
      data.stories[idx] = story;
      saveDatabase();
    }
  },

  getMarketplace: () => loadDatabase().marketplace,
  saveMarketplace: (item: MarketplaceItem) => {
    const data = loadDatabase();
    const idx = data.marketplace.findIndex(m => m.id === item.id);
    if (idx !== -1) {
      data.marketplace[idx] = item;
    } else {
      data.marketplace.unshift(item);
    }
    saveDatabase();
  },
  deleteMarketplace: (id: string) => {
    const data = loadDatabase();
    data.marketplace = data.marketplace.filter(m => m.id !== id);
    saveDatabase();
  },

  getEvents: () => loadDatabase().events,
  saveEvent: (event: Event) => {
    const data = loadDatabase();
    const idx = data.events.findIndex(e => e.id === event.id);
    if (idx !== -1) {
      data.events[idx] = event;
    } else {
      data.events.push(event);
    }
    saveDatabase();
  },

  getReports: () => loadDatabase().reports,
  saveReport: (report: Report) => {
    const data = loadDatabase();
    data.reports.unshift(report);
    saveDatabase();
  },
  updateReport: (report: Report) => {
    const data = loadDatabase();
    const idx = data.reports.findIndex(r => r.id === report.id);
    if (idx !== -1) {
      data.reports[idx] = report;
      saveDatabase();
    }
  },

  getSettings: () => loadDatabase().settings,
  saveSettings: (settings: SystemSettings) => {
    const data = loadDatabase();
    data.settings = settings;
    saveDatabase();
  },

  getVerificationCode: (email: string) => {
    const data = loadDatabase();
    return data.verificationCodes ? data.verificationCodes[email.toLowerCase().trim()] : undefined;
  },
  setVerificationCode: async (email: string, code: string, expires: number) => {
    const data = loadDatabase();
    if (!data.verificationCodes) data.verificationCodes = {};
    data.verificationCodes[email.toLowerCase().trim()] = { code, expires };
    await saveDatabase();
  },
  deleteVerificationCode: async (email: string) => {
    const data = loadDatabase();
    if (data.verificationCodes) {
      delete data.verificationCodes[email.toLowerCase().trim()];
      await saveDatabase();
    }
  },

  getResetOTP: (email: string) => {
    const data = loadDatabase();
    return data.resetOTPs ? data.resetOTPs[email.toLowerCase().trim()] : undefined;
  },
  setResetOTP: async (email: string, code: string, expires: number) => {
    const data = loadDatabase();
    if (!data.resetOTPs) data.resetOTPs = {};
    data.resetOTPs[email.toLowerCase().trim()] = { code, expires };
    await saveDatabase();
  },
  deleteResetOTP: async (email: string) => {
    const data = loadDatabase();
    if (data.resetOTPs) {
      delete data.resetOTPs[email.toLowerCase().trim()];
      await saveDatabase();
    }
  },

  resetDatabase: () => {
    dbCache = generateSeeds();
    saveDatabase();
  }
};
