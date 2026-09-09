/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema, Types } from 'mongoose';
import { idPlugin } from './plugins';

const PollOptionSchema = new Schema({
  text: { type: String, required: true },
  votes: [{ type: Types.ObjectId, ref: 'User' }],
}, { _id: false });

const PostSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, default: '' },
  mediaUrls: [String],
  mediaType: { type: String, enum: ['image', 'video'] },
  feeling: String,
  location: String,
  tags: [String],
  privacy: { type: String, enum: ['Public', 'Friends', 'Only Me'], default: 'Public', index: true },
  scheduledTime: String,
  isDraft: { type: Boolean, default: false },
  isPinned: { type: Boolean, default: false },
  commentsDisabled: { type: Boolean, default: false },

  // Reactions stay embedded as a userId -> type map: bounded by the number
  // of people who react to a single post, cheap to read/write alongside the
  // post, and this is exactly the access pattern (show my reaction + total
  // counts on the feed) that benefits from co-location rather than a join.
  reactions: { type: Map, of: String, default: () => ({}) },

  pollOptions: [PollOptionSchema],
  hashtags: [{ type: String, index: true }],
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

PostSchema.index({ userId: 1, createdAt: -1 });
PostSchema.index({ privacy: 1, createdAt: -1 });
PostSchema.index({ text: 'text' });
// The main feed query (getPosts) always sorts by { isPinned: -1, createdAt:
// -1 } - without this compound index Mongo has to pull matching documents
// then sort them in memory on every single feed page load instead of
// reading them back pre-sorted off an index.
PostSchema.index({ isPinned: 1, createdAt: -1 });

PostSchema.plugin(idPlugin);

export default (mongoose.models.Post as any) || mongoose.model('Post', PostSchema);
