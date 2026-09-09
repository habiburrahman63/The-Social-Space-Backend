/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Post, Comment, User } from '../models';
import { flattenAuthor, reactionsToObject, toIdStringArray } from '../utils/serialize';

const AUTHOR_FIELDS = 'username profilePic verifyBadge';

async function serializeComment(commentDoc: any) {
  const c = commentDoc.toJSON ? commentDoc.toJSON() : commentDoc;
  const replies = await Comment.find({ parentCommentId: c.id }).sort({ createdAt: 1 }).populate('userId', AUTHOR_FIELDS).lean();
  return {
    ...flattenAuthor(c, 'userId'),
    reactions: reactionsToObject(c.reactions),
    replies: replies.map((r: any) => ({
      ...flattenAuthor({ ...r, id: r._id?.toString() || r.id }, 'userId'),
      reactions: reactionsToObject(r.reactions),
    })),
  };
}

export const postService = {
  /**
   * Serializes a whole page of posts with exactly ONE database round-trip
   * for all their comments+replies combined, instead of a separate query
   * per post (and another per comment for its replies). For a feed of 20
   * posts with 5 comments each, that's 1 query here instead of ~120.
   */
  async serializePostsBatch(postsLean: any[]) {
    if (postsLean.length === 0) return [];

    const postIds = postsLean.map((p) => (p._id || p.id).toString());
    const allComments = await Comment.find({ postId: { $in: postIds } })
      .sort({ createdAt: 1 })
      .populate('userId', AUTHOR_FIELDS)
      .lean();

    const commentsByPost = new Map<string, any[]>();
    const repliesByParent = new Map<string, any[]>();
    for (const c of allComments as any[]) {
      if (c.parentCommentId) {
        const key = c.parentCommentId.toString();
        if (!repliesByParent.has(key)) repliesByParent.set(key, []);
        repliesByParent.get(key)!.push(c);
      } else {
        const key = c.postId.toString();
        if (!commentsByPost.has(key)) commentsByPost.set(key, []);
        commentsByPost.get(key)!.push(c);
      }
    }

    const serializeC = (c: any) => ({
      ...flattenAuthor({ ...c, id: c._id.toString() }, 'userId'),
      reactions: reactionsToObject(c.reactions),
      replies: (repliesByParent.get(c._id.toString()) || []).map((r: any) => ({
        ...flattenAuthor({ ...r, id: r._id.toString() }, 'userId'),
        reactions: reactionsToObject(r.reactions),
      })),
    });

    return postsLean.map((postLean) => {
      const pid = (postLean._id || postLean.id).toString();
      const comments = (commentsByPost.get(pid) || []).map(serializeC);
      const flat = flattenAuthor({ ...postLean, id: pid }, 'userId');
      const pollOptions = postLean.pollOptions && postLean.pollOptions.length > 0
        ? postLean.pollOptions.map((opt: any) => ({ text: opt.text, votes: toIdStringArray(opt.votes) }))
        : undefined;

      return { ...flat, reactions: reactionsToObject(postLean.reactions), comments, pollOptions };
    });
  },

  /** Returns posts (paginated) with author + comments populated, in the same shape the original API returned. */
  async listFeed({ page = 1, limit = 50 }: { page?: number; limit?: number } = {}) {
    const skip = (page - 1) * limit;
    const posts = await Post.find({ isDraft: { $ne: true } })
      .sort({ isPinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', AUTHOR_FIELDS)
      .populate('pollOptions.votes', 'id')
      .lean();

    return postService.serializePostsBatch(posts);
  },

  /** Serializes a single post - fine to use for create/update/single-post responses. */
  async serializePost(postLean: any) {
    const topLevelComments = await Comment.find({ postId: postLean._id || postLean.id, parentCommentId: null })
      .sort({ createdAt: 1 })
      .populate('userId', AUTHOR_FIELDS)
      .lean();

    const comments = await Promise.all(topLevelComments.map(serializeComment));

    const flat = flattenAuthor({ ...postLean, id: postLean._id?.toString() || postLean.id }, 'userId');
    const pollOptions = postLean.pollOptions && postLean.pollOptions.length > 0
      ? postLean.pollOptions.map((opt: any) => ({ text: opt.text, votes: toIdStringArray(opt.votes) }))
      : undefined;

    return {
      ...flat,
      reactions: reactionsToObject(postLean.reactions),
      comments,
      pollOptions,
    };
  },

  async findById(id: string) {
    try {
      return await Post.findById(id).populate('userId', AUTHOR_FIELDS);
    } catch {
      return null;
    }
  },
};
