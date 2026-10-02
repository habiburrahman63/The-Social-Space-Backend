/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Post, Comment, User } from '../models';
import { flattenAuthor, reactionsToObject, toIdStringArray } from '../utils/serialize';

const AUTHOR_FIELDS = 'username profilePic verifyBadge';

export const postService = {
  /**
   * All comments + replies for a single post, in the exact shape the batch
   * serializer produces. Kept as its own method so the Feed can lazily load
   * one post's comments without duplicating the nesting logic.
   */
  async getCommentsForPost(postId: string | any) {
    const allComments = await Comment.find({ postId })
      .sort({ createdAt: 1 })
      .populate('userId', AUTHOR_FIELDS)
      .lean();

    const repliesByParent = new Map<string, any[]>();
    const topLevel: any[] = [];
    for (const c of allComments as any[]) {
      if (c.parentCommentId) {
        const key = c.parentCommentId.toString();
        if (!repliesByParent.has(key)) repliesByParent.set(key, []);
        repliesByParent.get(key)!.push(c);
      } else {
        topLevel.push(c);
      }
    }

    return topLevel.map((c: any) => ({
      ...flattenAuthor({ ...c, id: c._id.toString() }, 'userId'),
      reactions: reactionsToObject(c.reactions),
      replies: (repliesByParent.get(c._id.toString()) || []).map((r: any) => ({
        ...flattenAuthor({ ...r, id: r._id.toString() }, 'userId'),
        reactions: reactionsToObject(r.reactions),
      })),
    }));
  },

  /**
   * Serializes a whole page of posts with exactly ONE database round-trip
   * for all their comments+replies combined, instead of a separate query
   * per post (and another per comment for its replies). For a feed of 20
   * posts with 5 comments each, that's 1 query here instead of ~120.
   *
   * `withComments: false` skips loading comment bodies (and the author
   * populate) and only returns a per-post `commentsCount`. The Feed uses this
   * so it doesn't download every comment on the page when the user opens a
   * single post's comment tray.
   */
  async serializePostsBatch(postsLean: any[], opts: { withComments?: boolean } = {}) {
    if (postsLean.length === 0) return [];
    const withComments = opts.withComments !== false;

    const postIds = postsLean.map((p) => (p._id || p.id).toString());
    // Still a single query either way - just a much lighter projection when
    // the bodies aren't needed.
    const allComments = withComments
      ? await Comment.find({ postId: { $in: postIds } })
          .sort({ createdAt: 1 })
          .populate('userId', AUTHOR_FIELDS)
          .lean()
      : await Comment.find({ postId: { $in: postIds } }).select('postId').lean();

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
      const postComments = commentsByPost.get(pid) || [];
      const comments = withComments ? postComments.map(serializeC) : [];
      const flat = flattenAuthor({ ...postLean, id: pid }, 'userId');
      const pollOptions = postLean.pollOptions && postLean.pollOptions.length > 0
        ? postLean.pollOptions.map((opt: any) => ({ text: opt.text, votes: toIdStringArray(opt.votes) }))
        : undefined;

      return {
        ...flat,
        reactions: reactionsToObject(postLean.reactions),
        comments,
        commentsCount: postComments.length,
        pollOptions,
      };
    });
  },

  /**
   * Serializes a single post - used by create/update/comment responses.
   * Loads every comment (top-level + replies) for the post in ONE query and
   * nests them in memory, instead of re-querying replies once per top-level
   * comment (the previous N+1 - a post with 40 comments cost 41 queries).
   */
  async serializePost(postLean: any) {
    const pid = (postLean._id || postLean.id).toString();
    const comments = await postService.getCommentsForPost(pid);

    const flat = flattenAuthor({ ...postLean, id: pid }, 'userId');
    const pollOptions = postLean.pollOptions && postLean.pollOptions.length > 0
      ? postLean.pollOptions.map((opt: any) => ({ text: opt.text, votes: toIdStringArray(opt.votes) }))
      : undefined;

    return {
      ...flat,
      reactions: reactionsToObject(postLean.reactions),
      comments,
      commentsCount: comments.length,
      pollOptions,
    };
  },
};
