/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import { Story } from '../models';
import { userService } from '../services/userService';
import { flattenAuthor, toIdStringArray } from '../utils/serialize';

const AUTHOR_FIELDS = 'username profilePic verifyBadge';

export const getStories = async (req: Request, res: Response) => {
  const user = req.user!;

  // MongoDB's TTL index already removes stories older than 24h, so we only
  // need to exclude stories from blocked users here.
  const stories = await Story.find({}).populate('userId', AUTHOR_FIELDS).populate('seenBy.userId', AUTHOR_FIELDS).lean();

  const myBlocked = toIdStringArray(user.blockedUsers);
  const visible = stories.filter((s: any) => {
    const authorId = s.userId?._id?.toString() || s.userId?.toString();
    return !myBlocked.includes(authorId);
  });

  const sanitized = visible.map((s: any) => {
    const authorId = s.userId?._id?.toString() || s.userId?.toString();
    const flat = flattenAuthor({ ...s, id: s._id.toString() }, 'userId');
    const seenByIds = toIdStringArray((s.seenBy || []).map((d: any) => d.userId));
    const seenDetails = (s.seenBy || []).map((d: any) => {
      const su = d.userId;
      return {
        userId: su?._id?.toString() || su?.toString(),
        username: su?.username,
        userAvatar: su?.profilePic,
        seenAt: d.seenAt,
      };
    });

    const result: any = { ...flat, seenBy: seenByIds };
    if (authorId === user.id) result.seenDetails = seenDetails;
    return result;
  });

  return res.json({ stories: sanitized });
};

export const createStory = async (req: Request, res: Response) => {
  const user = req.user!;
  const { mediaUrl, type } = req.body;

  if (!mediaUrl) return res.status(400).json({ error: 'Media URL is required for stories' });

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const storyDoc = await Story.create({ userId: user.id, mediaUrl, type: type || 'image', seenBy: [], expiresAt });

  const flat = flattenAuthor(
    { ...storyDoc.toJSON(), userId: { id: user.id, username: user.username, profilePic: user.profilePic, verifyBadge: user.verifyBadge } },
    'userId'
  );

  return res.status(201).json({ success: true, story: { ...flat, seenBy: [] } });
};

export const viewStory = async (req: Request, res: Response) => {
  const user = req.user!;
  const story = await Story.findById(req.params.id).catch(() => null);
  if (!story) return res.status(404).json({ error: 'Story not found' });

  const authorId = story.get('userId').toString();
  if (await userService.checkBlocked(user.id, authorId)) {
    return res.status(403).json({ error: 'You cannot view stories of blocked users' });
  }

  const seenBy: any[] = story.get('seenBy') || [];
  const alreadySeen = seenBy.some((d: any) => d.userId.toString() === user.id);
  if (!alreadySeen) {
    seenBy.push({ userId: user.id, seenAt: new Date() });
    story.set('seenBy', seenBy);
    await story.save();
  }

  const populated = await Story.findById(story.id).populate('seenBy.userId', AUTHOR_FIELDS).lean();
  const seenByIds = toIdStringArray(((populated as any).seenBy || []).map((d: any) => d.userId));
  const seenDetails = ((populated as any).seenBy || []).map((d: any) => {
    const su = d.userId;
    return {
      userId: su?._id?.toString() || su?.toString(),
      username: su?.username,
      userAvatar: su?.profilePic,
      seenAt: d.seenAt,
    };
  });

  return res.json({
    success: true,
    seenBy: seenByIds,
    seenDetails: authorId === user.id ? seenDetails : undefined,
  });
};
