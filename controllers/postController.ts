/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import { Post, Comment, User, Notification } from '../models';
import { userService } from '../services/userService';
import { notificationService } from '../services/notificationService';
import { postService } from '../services/postService';
import { reactionsToObject, toIdStringArray } from '../utils/serialize';
import { escapeRegex } from '../utils/regex';

export const getPosts = async (req: Request, res: Response) => {
  const user = req.user!;
  const { filter, userId, pageId, groupId, q, page, limit, includeComments, scope } = req.query;

  const query: any = {
    // Exclude scheduled/draft posts unless they belong to the current user.
    $or: [
      { isDraft: { $ne: true }, scheduledTime: { $in: [null, undefined, ''] } },
      { userId: user.id },
    ],
  };

  if (userId) query.userId = userId;
  else if (pageId) query.location = `Page:${pageId}`;
  else if (groupId) query.location = `Group:${groupId}`;

  // Conditions that must hold in addition to the top-level $or above.
  const andClauses: any[] = [];
  if (q) {
    const regex = new RegExp(escapeRegex(String(q)), 'i');
    andClauses.push({ $or: [{ text: regex }, { hashtags: regex }] });
  }

  // `scope=own` returns only the current user's own draft/scheduled posts.
  // Drafts and scheduled posts only ever belong to their author, so the Feed
  // uses this to keep its Drafts/Scheduled tabs accurate independently of how
  // many feed pages it has loaded.
  if (scope === 'own') {
    query.userId = user.id;
    andClauses.push({ $or: [{ isDraft: true }, { scheduledTime: { $nin: [null, ''] } }] });
  }
  if (andClauses.length) query.$and = andClauses;

  // Exclude posts from users who are blocked by, or have blocked, the current
  // user. Both lookups are independent, so run them in parallel instead of as
  // two sequential round-trips on every feed load.
  const [me, blockedByOthers] = await Promise.all([
    User.findById(user.id).select('blockedUsers').lean(),
    User.find({ blockedUsers: user.id }).select('_id').lean(),
  ]);
  const myBlocked = toIdStringArray((me as any)?.blockedUsers);
  const excludeIds = [...myBlocked, ...blockedByOthers.map((u: any) => u._id.toString())];
  if (excludeIds.length) query.userId = { ...(query.userId ? { $eq: query.userId } : {}), $nin: excludeIds };

  const pageNum = Math.max(1, parseInt(String(page || '1'), 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit || '50'), 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const posts = await Post.find(query)
    .sort({ isPinned: -1, createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .populate('userId', 'username profilePic verifyBadge')
    // NOTE: pollOptions.votes is deliberately NOT populated - serializePostsBatch
    // only needs the voter ids, and toIdStringArray already handles raw
    // ObjectIds, so populating them was an extra query per feed load for data
    // that gets flattened away anyway.
    .lean();

  // `includeComments=0` lets a list view fetch just the posts (plus a comment
  // count) and load one post's comments only when its comment tray is opened.
  // It defaults to true, so existing consumers (e.g. the Profile page) are
  // completely unaffected.
  const withComments = includeComments !== '0' && includeComments !== 'false';
  const enrichedPosts = await postService.serializePostsBatch(posts, { withComments });

  return res.json({ posts: enrichedPosts, page: pageNum, limit: limitNum, hasMore: posts.length === limitNum });
};

/**
 * Comments for a single post, fetched on demand by the Feed when a post's
 * comment tray is opened. The shape is identical to the `comments` field the
 * posts list already returns, so merging it is a straight assignment.
 */
export const getPostComments = async (req: Request, res: Response) => {
  const exists = await Post.findById(req.params.id).select('_id').lean().catch(() => null);
  if (!exists) return res.status(404).json({ error: 'Post not found' });

  const comments = await postService.getCommentsForPost(req.params.id);
  return res.json({ comments, commentsCount: comments.length });
};

export const createPost = async (req: Request, res: Response) => {
  const user = req.user!;
  const { text, mediaUrls, mediaType, feeling, location, tags, privacy, scheduledTime, isDraft, pollOptions } = req.body;

  if (!text && (!mediaUrls || mediaUrls.length === 0)) {
    return res.status(400).json({ error: 'Post must contain either text or media' });
  }

  const hashtags = text ? (text.match(/#\w+/g) || []).map((t: string) => t.slice(1)) : [];

  const newPostDoc = await Post.create({
    userId: user.id,
    text,
    mediaUrls,
    mediaType,
    feeling,
    location,
    tags,
    privacy: privacy || 'Public',
    scheduledTime,
    isDraft,
    hashtags,
    pollOptions: pollOptions ? pollOptions.map((opt: string) => ({ text: opt, votes: [] })) : undefined,
  });

  // Who is allowed to receive a notification from this user? Fetching every
  // recipient's block list in one query and inserting all notifications in a
  // single batch replaces the previous per-recipient loop, which cost 3
  // sequential database round-trips per friend (notifyUser -> checkBlocked ->
  // 2 reads). For anyone with a real friend list that made posting slow.
  const eligibleRecipientIds = (docs: any[]): any[] => {
    const myBlocked = new Set(toIdStringArray(user.blockedUsers));
    return docs
      .filter((d) => {
        const id = d._id.toString();
        if (id === user.id) return false;
        if (myBlocked.has(id)) return false;
        if (toIdStringArray(d.blockedUsers).includes(user.id)) return false;
        return true;
      })
      .map((d) => d._id);
  };

  // Notify tagged friends
  if (tags && tags.length > 0) {
    const taggedUsers = await User.find({ username: { $in: tags } })
      .select('blockedUsers')
      .lean();
    const tagRecipients = eligibleRecipientIds(taggedUsers as any[]);
    if (tagRecipients.length > 0) {
      await Notification.insertMany(
        tagRecipients.map((recipientId) => ({
          recipientId,
          senderId: user.id,
          type: 'tag',
          message: 'tagged you in a post',
          relatedId: newPostDoc.id,
        }))
      );
    }
  }

  // Notify friends about the new post (only for posts that are immediately
  // visible - not drafts or posts scheduled for later). This is a distinct
  // 'post' notification type shown only in the Home section on the Frontend.
  if (!isDraft && !scheduledTime && (privacy || 'Public') !== 'Only Me') {
    const friendIds = toIdStringArray(user.friends);
    if (friendIds.length > 0) {
      const friends = await User.find({ _id: { $in: friendIds } })
        .select('blockedUsers')
        .lean();
      const postRecipients = eligibleRecipientIds(friends as any[]);
      if (postRecipients.length > 0) {
        await Notification.insertMany(
          postRecipients.map((recipientId) => ({
            recipientId,
            senderId: user.id,
            type: 'post',
            message: 'shared a new post',
            relatedId: newPostDoc.id,
          }))
        );
      }
    }
  }

  const serialized = await postService.serializePost({ ...newPostDoc.toJSON(), userId: { id: user.id, username: user.username, profilePic: user.profilePic, verifyBadge: user.verifyBadge } });
  return res.status(201).json({ success: true, post: serialized });
};

export const updatePost = async (req: Request, res: Response) => {
  const user = req.user!;
  const post = await Post.findById(req.params.id).catch(() => null);

  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.get('userId').toString() !== user.id) return res.status(403).json({ error: 'Unauthorized to edit this post' });

  const { text, mediaUrls, privacy, isPinned, commentsDisabled } = req.body;
  if (text !== undefined) post.set('text', text);
  if (mediaUrls !== undefined) post.set('mediaUrls', mediaUrls);
  if (privacy !== undefined) post.set('privacy', privacy);
  if (isPinned !== undefined) post.set('isPinned', isPinned);
  if (commentsDisabled !== undefined) post.set('commentsDisabled', commentsDisabled);
  await post.save();

  const populated = await Post.findById(post.id).populate('userId', 'username profilePic verifyBadge').lean();
  const serialized = await postService.serializePost(populated);
  return res.json({ success: true, post: serialized });
};

export const deletePost = async (req: Request, res: Response) => {
  const user = req.user!;
  const post = await Post.findById(req.params.id).catch(() => null);

  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.get('userId').toString() !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized to delete this post' });
  }

  await Post.deleteOne({ _id: post.id });
  await Comment.deleteMany({ postId: post.id });

  return res.json({ success: true, message: 'Post deleted successfully' });
};

export const reactToPost = async (req: Request, res: Response) => {
  const user = req.user!;
  const post = await Post.findById(req.params.id).catch(() => null);
  const { type } = req.body;

  if (!post) return res.status(404).json({ error: 'Post not found' });

  const reactions: Map<string, string> = post.get('reactions') || new Map();
  const postOwnerId = post.get('userId').toString();

  if (reactions.get(user.id) === type) {
    reactions.delete(user.id);
  } else {
    reactions.set(user.id, type);
    if (postOwnerId !== user.id) {
      await notificationService.notifyUser({
        recipientId: postOwnerId,
        senderId: user.id,
        type: 'like',
        message: `reacted ${type} to your post`,
        relatedId: post.id,
      });
    }
  }

  post.set('reactions', reactions);
  await post.save();
  return res.json({ success: true, reactions: reactionsToObject(reactions) });
};

export const commentOnPost = async (req: Request, res: Response) => {
  const user = req.user!;
  const post = await Post.findById(req.params.id).catch(() => null);
  const { text, parentCommentId } = req.body;

  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.get('commentsDisabled')) return res.status(400).json({ error: 'Comments are disabled on this post' });
  if (!text) return res.status(400).json({ error: 'Comment text cannot be empty' });

  if (parentCommentId) {
    const parentComment = await Comment.findById(parentCommentId).catch(() => null);
    if (!parentComment) return res.status(404).json({ error: 'Parent comment not found' });

    await Comment.create({ postId: post.id, userId: user.id, parentCommentId, text });

    const parentOwnerId = parentComment.get('userId').toString();
    if (parentOwnerId !== user.id) {
      await notificationService.notifyUser({
        recipientId: parentOwnerId,
        senderId: user.id,
        type: 'reply',
        message: 'replied to your comment',
        relatedId: post.id,
      });
    }
  } else {
    await Comment.create({ postId: post.id, userId: user.id, parentCommentId: null, text });

    const postOwnerId = post.get('userId').toString();
    if (postOwnerId !== user.id) {
      await notificationService.notifyUser({
        recipientId: postOwnerId,
        senderId: user.id,
        type: 'comment',
        message: 'commented on your post',
        relatedId: post.id,
      });
    }
  }

  const populated = await Post.findById(post.id).populate('userId', 'username profilePic verifyBadge').lean();
  const serialized = await postService.serializePost(populated);
  // Original API returned status 210 here (kept as-is for behavioral parity).
  return res.status(210).json({ success: true, comments: serialized.comments });
};

export const voteOnPoll = async (req: Request, res: Response) => {
  const user = req.user!;
  const post = await Post.findById(req.params.id).catch(() => null);
  const { optionIdx } = req.body;

  if (!post) return res.status(404).json({ error: 'Post not found' });
  const pollOptions = post.get('pollOptions');
  if (!pollOptions || pollOptions.length === 0) return res.status(400).json({ error: 'This post is not a poll' });

  pollOptions.forEach((opt: any) => {
    opt.votes = opt.votes.filter((id: any) => id.toString() !== user.id);
  });

  if (optionIdx >= 0 && optionIdx < pollOptions.length) {
    pollOptions[optionIdx].votes.push(user.id);
  }

  post.set('pollOptions', pollOptions);
  await post.save();

  return res.json({
    success: true,
    pollOptions: pollOptions.map((opt: any) => ({ text: opt.text, votes: toIdStringArray(opt.votes) })),
  });
};
