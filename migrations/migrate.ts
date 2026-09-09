/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One-time migration: reads the legacy `states` collection (a single
 * document holding the whole app as embedded arrays - see the old
 * models/store.ts) and populates the new normalized collections.
 *
 * Usage:
 *   npx tsx migrations/migrate.ts            # abort if target collections already have data
 *   npx tsx migrations/migrate.ts --force     # wipe & re-run anyway
 *
 * The legacy `states` collection is renamed to `states_pre_migration_backup`
 * afterwards (not deleted), so nothing is lost even if something goes wrong.
 */

import mongoose, { Schema } from 'mongoose';
import { MONGODB_URI } from '../config/env';
import {
  User, Session, Post, Comment, Conversation, Message, Notification,
  Page, Group, GroupMember, Story, MarketplaceItem, Event, Report,
  VerificationCode, Settings,
} from '../models';

const LegacyStateSchema = new Schema({ key: String, data: Schema.Types.Mixed }, { strict: false });
const LegacyState = (mongoose.models.LegacyState as any) || mongoose.model('LegacyState', LegacyStateSchema, 'states');

const FORCE = process.argv.includes('--force');

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  const existingUsers = await User.countDocuments();
  if (existingUsers > 0 && !FORCE) {
    console.log(`⚠️  The 'users' collection already has ${existingUsers} document(s).`);
    console.log('Migration already appears to have run. Re-run with --force to wipe and redo it.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (FORCE) {
    console.log('--force: clearing target collections...');
    await Promise.all([
      User.deleteMany({}), Session.deleteMany({}), Post.deleteMany({}), Comment.deleteMany({}),
      Conversation.deleteMany({}), Message.deleteMany({}), Notification.deleteMany({}),
      Page.deleteMany({}), Group.deleteMany({}), GroupMember.deleteMany({}), Story.deleteMany({}),
      MarketplaceItem.deleteMany({}), Event.deleteMany({}), Report.deleteMany({}),
      VerificationCode.deleteMany({}), Settings.deleteMany({}),
    ]);
  }

  const stateDoc: any = await LegacyState.findOne({ key: 'database_state' }).lean();
  if (!stateDoc) {
    console.log('No legacy `states` document found (key: "database_state"). Nothing to migrate.');
    await mongoose.disconnect();
    process.exit(0);
  }
  const data = stateDoc.data || {};

  const userIdMap: Record<string, string> = {};
  const postIdMap: Record<string, string> = {};
  const pageIdMap: Record<string, string> = {};
  const groupIdMap: Record<string, string> = {};

  const summary: Record<string, number> = {};

  // ---------------------------------------------------------------------
  // 1. Users (+ their login history -> Session)
  // ---------------------------------------------------------------------
  console.log('Migrating users...');
  for (const u of data.users || []) {
    const created = await User.create({
      username: u.username,
      email: u.email,
      passwordHash: u.passwordHash,
      profilePic: u.profilePic,
      coverPhoto: u.coverPhoto,
      bio: u.bio,
      work: u.work,
      education: u.education,
      city: u.city,
      hometown: u.hometown,
      relationship: u.relationship,
      website: u.website,
      phone: u.phone,
      birthday: u.birthday,
      gender: u.gender,
      socialLinks: u.socialLinks,
      intro: u.intro,
      featuredPhotos: u.featuredPhotos || [],
      visibility: u.visibility || 'Public',
      verifyBadge: !!u.verifyBadge,
      role: u.id === 'usr-admin' || u.email === 'admin@social.com' ? 'admin' : 'user',
      failedLoginAttempts: u.failedLoginAttempts || 0,
      isLocked: !!u.isLocked,
      isDeactivated: !!u.isDeactivated,
      lastActiveAt: u.lastActiveAt,
      createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
    });
    userIdMap[u.id] = created.id;
  }
  summary.users = Object.keys(userIdMap).length;

  // Second pass: friends / followers / following / blockedUsers (needs full id map)
  for (const u of data.users || []) {
    const newId = userIdMap[u.id];
    if (!newId) continue;
    await User.updateOne({ _id: newId }, {
      $set: {
        friends: (u.friends || []).map((id: string) => userIdMap[id]).filter(Boolean),
        followers: (u.followers || []).map((id: string) => userIdMap[id]).filter(Boolean),
        following: (u.following || []).map((id: string) => userIdMap[id]).filter(Boolean),
        blockedUsers: (u.blockedUsers || []).map((id: string) => userIdMap[id]).filter(Boolean),
      },
    });

    // Login history -> Session collection
    let sessionCount = 0;
    for (const entry of u.loginHistory || []) {
      await Session.create({
        userId: newId,
        device: entry.device,
        ip: entry.ip,
        status: entry.status,
        timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
      });
      sessionCount++;
    }
    summary.sessions = (summary.sessions || 0) + sessionCount;
  }
  console.log(`  -> ${summary.users} users, ${summary.sessions || 0} login-history sessions`);

  // ---------------------------------------------------------------------
  // 2. Posts + Comments/Replies
  // ---------------------------------------------------------------------
  console.log('Migrating posts, comments & replies...');
  let commentCount = 0;
  for (const p of data.posts || []) {
    const authorId = userIdMap[p.userId];
    if (!authorId) continue;

    const reactionsMap: Record<string, string> = {};
    for (const [uid, type] of Object.entries(p.reactions || {})) {
      const mapped = userIdMap[uid];
      if (mapped) reactionsMap[mapped] = type as string;
    }

    const created = await Post.create({
      userId: authorId,
      text: p.text,
      mediaUrls: p.mediaUrls || [],
      mediaType: p.mediaType,
      feeling: p.feeling,
      location: p.location,
      tags: p.tags || [],
      privacy: p.privacy || 'Public',
      scheduledTime: p.scheduledTime,
      isDraft: !!p.isDraft,
      isPinned: !!p.isPinned,
      commentsDisabled: !!p.commentsDisabled,
      reactions: reactionsMap,
      pollOptions: (p.pollOptions || []).map((opt: any) => ({
        text: opt.text,
        votes: (opt.votes || []).map((uid: string) => userIdMap[uid]).filter(Boolean),
      })),
      hashtags: p.hashtags || [],
      createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
    });
    postIdMap[p.id] = created.id;

    for (const c of p.comments || []) {
      const commentAuthor = userIdMap[c.userId];
      if (!commentAuthor) continue;
      const commentReactions: Record<string, string> = {};
      for (const [uid, type] of Object.entries(c.reactions || {})) {
        const mapped = userIdMap[uid];
        if (mapped) commentReactions[mapped] = type as string;
      }
      const createdComment = await Comment.create({
        postId: created.id,
        userId: commentAuthor,
        parentCommentId: null,
        text: c.text,
        reactions: commentReactions,
        createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
      });
      commentCount++;

      for (const r of c.replies || []) {
        const replyAuthor = userIdMap[r.userId];
        if (!replyAuthor) continue;
        const replyReactions: Record<string, string> = {};
        for (const [uid, type] of Object.entries(r.reactions || {})) {
          const mapped = userIdMap[uid];
          if (mapped) replyReactions[mapped] = type as string;
        }
        await Comment.create({
          postId: created.id,
          userId: replyAuthor,
          parentCommentId: createdComment.id,
          text: r.text,
          reactions: replyReactions,
          createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
        });
        commentCount++;
      }
    }
  }
  summary.posts = Object.keys(postIdMap).length;
  summary.comments = commentCount;
  console.log(`  -> ${summary.posts} posts, ${commentCount} comments/replies`);

  // ---------------------------------------------------------------------
  // 3. Stories
  // ---------------------------------------------------------------------
  console.log('Migrating stories...');
  let storyCount = 0;
  for (const s of data.stories || []) {
    const authorId = userIdMap[s.userId];
    if (!authorId) continue;
    const created = s.createdAt ? new Date(s.createdAt) : new Date();
    const seenDetails = s.seenDetails || [];
    const seenBy = (s.seenBy || []).map((uid: string) => {
      const mapped = userIdMap[uid];
      if (!mapped) return null;
      const detail = seenDetails.find((d: any) => d.userId === uid);
      return { userId: mapped, seenAt: detail?.seenAt ? new Date(detail.seenAt) : created };
    }).filter(Boolean);

    await Story.create({
      userId: authorId,
      mediaUrl: s.mediaUrl,
      type: s.type,
      seenBy,
      expiresAt: new Date(created.getTime() + 24 * 60 * 60 * 1000),
      createdAt: created,
    });
    storyCount++;
  }
  summary.stories = storyCount;
  console.log(`  -> ${storyCount} stories`);

  // ---------------------------------------------------------------------
  // 4. Marketplace
  // ---------------------------------------------------------------------
  console.log('Migrating marketplace items...');
  let mktCount = 0;
  for (const m of data.marketplace || []) {
    const sellerId = userIdMap[m.sellerId];
    if (!sellerId) continue;
    await MarketplaceItem.create({
      title: m.title,
      description: m.description || '',
      price: m.price,
      category: m.category,
      mediaUrls: m.mediaUrls || [],
      sellerId,
      location: m.location,
      createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
    });
    mktCount++;
  }
  summary.marketplace = mktCount;
  console.log(`  -> ${mktCount} marketplace items`);

  // ---------------------------------------------------------------------
  // 5. Events
  // ---------------------------------------------------------------------
  console.log('Migrating events...');
  let eventCount = 0;
  for (const e of data.events || []) {
    const creatorId = userIdMap[e.creatorId];
    if (!creatorId) continue;
    await Event.create({
      title: e.title,
      description: e.description || '',
      date: e.date,
      location: e.location,
      creatorId,
      interested: (e.interested || []).map((id: string) => userIdMap[id]).filter(Boolean),
      attending: (e.attending || []).map((id: string) => userIdMap[id]).filter(Boolean),
      invitees: (e.invitees || []).map((id: string) => userIdMap[id]).filter(Boolean),
      calendarReminder: !!e.calendarReminder,
      mediaUrl: e.mediaUrl,
      isOfficial: !!e.isOfficial,
      createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
    });
    eventCount++;
  }
  summary.events = eventCount;
  console.log(`  -> ${eventCount} events`);

  // ---------------------------------------------------------------------
  // 6. Pages
  // ---------------------------------------------------------------------
  console.log('Migrating pages...');
  let pageCount = 0;
  for (const p of data.pages || []) {
    const creatorId = userIdMap[p.creatorId];
    if (!creatorId) continue;
    const created = await Page.create({
      name: p.name,
      category: p.category,
      coverPhoto: p.coverPhoto,
      profilePic: p.profilePic,
      bio: p.bio,
      creatorId,
      followers: (p.followers || []).map((id: string) => userIdMap[id]).filter(Boolean),
      invitees: (p.invitees || []).map((id: string) => userIdMap[id]).filter(Boolean),
      createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
    });
    pageIdMap[p.id] = created.id;
    pageCount++;
  }
  summary.pages = pageCount;
  console.log(`  -> ${pageCount} pages`);

  // ---------------------------------------------------------------------
  // 7. Groups + GroupMembers (normalized from members/admins/moderators)
  // ---------------------------------------------------------------------
  console.log('Migrating groups & memberships...');
  let groupCount = 0, memberCount = 0;
  for (const g of data.groups || []) {
    const creatorId = userIdMap[g.creatorId];
    if (!creatorId) continue;
    const created = await Group.create({
      name: g.name,
      privacy: g.privacy || 'public',
      coverPhoto: g.coverPhoto,
      description: g.description,
      creatorId,
      createdAt: g.createdAt ? new Date(g.createdAt) : new Date(),
    });
    groupIdMap[g.id] = created.id;
    groupCount++;

    const admins = new Set(g.admins || []);
    const mods = new Set(g.moderators || []);
    for (const memberOldId of g.members || []) {
      const memberId = userIdMap[memberOldId];
      if (!memberId) continue;
      const role = admins.has(memberOldId) ? 'admin' : mods.has(memberOldId) ? 'moderator' : 'member';
      await GroupMember.create({ groupId: created.id, userId: memberId, role });
      memberCount++;
    }
  }
  summary.groups = groupCount;
  summary.groupMembers = memberCount;
  console.log(`  -> ${groupCount} groups, ${memberCount} memberships`);

  // ---------------------------------------------------------------------
  // 8. Notifications
  // ---------------------------------------------------------------------
  console.log('Migrating notifications...');
  let notifCount = 0;
  for (const n of data.notifications || []) {
    const recipientId = userIdMap[n.recipientId];
    if (!recipientId) continue;
    const senderId = n.senderId ? userIdMap[n.senderId] : undefined;
    await Notification.create({
      recipientId,
      senderId: senderId || null,
      senderName: senderId ? undefined : n.senderName,
      senderAvatar: senderId ? undefined : n.senderAvatar,
      type: n.type,
      message: n.message,
      isRead: !!n.isRead,
      relatedId: n.relatedId,
      createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
    });
    notifCount++;
  }
  summary.notifications = notifCount;
  console.log(`  -> ${notifCount} notifications`);

  // ---------------------------------------------------------------------
  // 9. Messages + Conversations
  // ---------------------------------------------------------------------
  console.log('Migrating messages & conversations...');
  const conversationCache: Record<string, string> = {};
  let msgCount = 0;
  for (const m of data.messages || []) {
    const senderId = userIdMap[m.senderId];
    const receiverId = userIdMap[m.receiverId];
    if (!senderId || !receiverId) continue;

    const pairKey = [senderId, receiverId].sort().join('|');
    let conversationId = conversationCache[pairKey];
    if (!conversationId) {
      const participants = [senderId, receiverId].sort();
      let convo = await Conversation.findOne({ participants: { $all: participants, $size: 2 } });
      if (!convo) convo = await Conversation.create({ participants, lastMessageAt: new Date() });
      conversationId = convo.id;
      conversationCache[pairKey] = conversationId;
    }

    const created = m.createdAt ? new Date(m.createdAt) : new Date();
    await Message.create({
      conversationId,
      senderId,
      receiverId,
      text: m.text || '',
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      emoji: m.emoji,
      gif: m.gif,
      isRead: !!m.isRead,
      isDelivered: m.isDelivered !== false,
      seenAt: m.seenAt,
      createdAt: created,
    });
    await Conversation.updateOne({ _id: conversationId }, { $max: { lastMessageAt: created } });
    msgCount++;
  }
  summary.messages = msgCount;
  summary.conversations = Object.keys(conversationCache).length;
  console.log(`  -> ${msgCount} messages across ${summary.conversations} conversations`);

  // ---------------------------------------------------------------------
  // 10. Reports
  // ---------------------------------------------------------------------
  console.log('Migrating reports...');
  let reportCount = 0;
  for (const r of data.reports || []) {
    const reporterId = userIdMap[r.reporterId];
    const reportedId = postIdMap[r.reportedId] || userIdMap[r.reportedId] || pageIdMap[r.reportedId] || groupIdMap[r.reportedId];
    if (!reporterId || !reportedId) continue;
    await Report.create({
      reporterId,
      reportedId,
      type: r.type || 'post',
      reason: r.reason,
      status: r.status || 'pending',
      createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
    });
    reportCount++;
  }
  summary.reports = reportCount;
  console.log(`  -> ${reportCount} reports`);

  // ---------------------------------------------------------------------
  // 11. Settings + Verification codes
  // ---------------------------------------------------------------------
  console.log('Migrating settings & verification codes...');
  if (data.settings) {
    await Settings.updateOne({ key: 'system_settings' }, { $set: data.settings }, { upsert: true });
  }

  let vcCount = 0;
  for (const [email, entry] of Object.entries<any>(data.verificationCodes || {})) {
    await VerificationCode.updateOne(
      { email: email.toLowerCase(), purpose: 'register' },
      { $set: { code: entry.code, expiresAt: new Date(entry.expires) } },
      { upsert: true }
    );
    vcCount++;
  }
  for (const [email, entry] of Object.entries<any>(data.resetOTPs || {})) {
    await VerificationCode.updateOne(
      { email: email.toLowerCase(), purpose: 'reset' },
      { $set: { code: entry.code, expiresAt: new Date(entry.expires) } },
      { upsert: true }
    );
    vcCount++;
  }
  summary.verificationCodes = vcCount;
  console.log(`  -> settings migrated, ${vcCount} verification codes`);

  // ---------------------------------------------------------------------
  // 12. Rename (not delete) the legacy collection for safety
  // ---------------------------------------------------------------------
  try {
    await mongoose.connection.db!.collection('states').rename('states_pre_migration_backup', { dropTarget: true });
    console.log("\nLegacy 'states' collection renamed to 'states_pre_migration_backup' (kept as a safety backup).");
  } catch (e: any) {
    console.log(`\nNote: could not rename legacy 'states' collection (${e.message}). It was left in place.`);
  }

  console.log('\n================= MIGRATION SUMMARY =================');
  for (const [k, v] of Object.entries(summary)) console.log(`${k.padEnd(18)}: ${v}`);
  console.log('=======================================================');

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
