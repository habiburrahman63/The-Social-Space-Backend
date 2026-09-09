/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import { Post, Comment, User } from '../models';
import { userService } from '../services/userService';
import { notificationService } from '../services/notificationService';
import { postService } from '../services/postService';
import { reactionsToObject, toIdStringArray } from '../utils/serialize';
import { escapeRegex } from '../utils/regex';

export const getPosts = async (req: Request, res: Response) => {
  const user = req.user!;
  const { filter, userId, pageId, groupId, q, page, limit } = req.query;

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

  if (q) {
    const regex = new RegExp(escapeRegex(String(q)), 'i');
    query.$and = [{ $or: [{ text: regex }, { hashtags: regex }] }];
  }

  // Exclude posts from users who are blocked by, or have blocked, the current user.
  const me = await User.findById(user.id).select('blockedUsers').lean();
  const myBlocked = toIdStringArray((me as any)?.blockedUsers);
  const blockedByOthers = await User.find({ blockedUsers: user.id }).select('_id').lean();
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
    .populate('pollOptions.votes', 'id')
    .lean();

  const enrichedPosts = await postService.serializePostsBatch(posts);

  return res.json({ posts: enrichedPosts, page: pageNum, limit: limitNum, hasMore: posts.length === limitNum });
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

  // Notify tagged friends
  if (tags && tags.length > 0) {
    const taggedUsers = await User.find({ username: { $in: tags } }).select('_id username').lean();
    for (const taggedUser of taggedUsers as any[]) {
      const taggedId = taggedUser._id.toString();
      if (taggedId !== user.id) {
        await notificationService.notifyUser({
          recipientId: taggedId,
          senderId: user.id,
          type: 'tag',
          message: 'tagged you in a post',
          relatedId: newPostDoc.id,
        });
      }
    }
  }

  // Notify friends about the new post (only for posts that are immediately
  // visible - not drafts or posts scheduled for later). This is a distinct
  // 'post' notification type shown only in the Home section on the Frontend.
  if (!isDraft && !scheduledTime && (privacy || 'Public') !== 'Only Me') {
    const friendIds = toIdStringArray(user.friends);
    for (const friendId of friendIds) {
      await notificationService.notifyUser({
        recipientId: friendId,
        senderId: user.id,
        type: 'post',
        message: 'shared a new post',
        relatedId: newPostDoc.id,
      });
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
