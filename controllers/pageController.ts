/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import { Page } from '../models';
import { toIdStringArray } from '../utils/serialize';

function serializePage(pageLean: any) {
  return {
    id: pageLean._id?.toString() || pageLean.id,
    name: pageLean.name,
    category: pageLean.category,
    coverPhoto: pageLean.coverPhoto,
    profilePic: pageLean.profilePic,
    bio: pageLean.bio,
    creatorId: pageLean.creatorId?.toString ? pageLean.creatorId.toString() : pageLean.creatorId,
    followers: toIdStringArray(pageLean.followers),
    followersCount: (pageLean.followers || []).length,
    invitees: toIdStringArray(pageLean.invitees),
    posts: [],
    createdAt: pageLean.createdAt,
  };
}

export const getPages = async (req: Request, res: Response) => {
  const pages = await Page.find({}).sort({ createdAt: -1 }).lean();
  return res.json({ pages: pages.map(serializePage) });
};

export const createPage = async (req: Request, res: Response) => {
  const user = req.user!;
  const { name, category, bio, coverPhoto, profilePic } = req.body;

  if (!name || !category) return res.status(400).json({ error: 'Page name and category are required' });

  const pageDoc = await Page.create({
    name,
    category,
    bio: bio || '',
    coverPhoto: coverPhoto || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
    profilePic: profilePic || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`,
    creatorId: user.id,
    followers: [user.id],
    invitees: [],
  });

  return res.status(201).json({ success: true, page: serializePage(pageDoc.toJSON()) });
};

export const followPage = async (req: Request, res: Response) => {
  const user = req.user!;
  const page = await Page.findById(req.params.id).catch(() => null);
  if (!page) return res.status(404).json({ error: 'Page not found' });

  const followers = toIdStringArray(page.get('followers'));
  if (followers.includes(user.id)) {
    page.set('followers', followers.filter(id => id !== user.id) as any);
  } else {
    page.set('followers', [...followers, user.id] as any);
  }
  await page.save();

  return res.json({ success: true, followers: toIdStringArray(page.get('followers')) });
};
