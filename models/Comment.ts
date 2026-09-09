/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema, Types } from 'mongoose';
import { idPlugin } from './plugins';

const CommentSchema = new Schema({
  postId: { type: Types.ObjectId, ref: 'Post', required: true, index: true },
  userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  // null for a top-level comment; set to the parent comment's _id for a reply.
  parentCommentId: { type: Types.ObjectId, ref: 'Comment', default: null, index: true },
  text: { type: String, required: true },
  reactions: { type: Map, of: String, default: () => ({}) },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

CommentSchema.index({ postId: 1, parentCommentId: 1, createdAt: 1 });

CommentSchema.plugin(idPlugin);

export default (mongoose.models.Comment as any) || mongoose.model('Comment', CommentSchema);
