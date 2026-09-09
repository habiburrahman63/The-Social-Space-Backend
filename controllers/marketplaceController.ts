/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import { MarketplaceItem } from '../models';
import { flattenAuthor } from '../utils/serialize';
import { escapeRegex } from '../utils/regex';

const SELLER_FIELDS = 'username profilePic verifyBadge';

function serializeItem(itemLean: any) {
  const flat = flattenAuthor({ ...itemLean, id: itemLean._id?.toString() || itemLean.id }, 'sellerId', { idOutField: 'sellerId' });
  return {
    ...flat,
    sellerName: flat.username,
    sellerAvatar: flat.userAvatar,
  };
}

export const getMarketplaceItems = async (req: Request, res: Response) => {
  const { category, q, location } = req.query;
  const query: any = {};

  if (category) query.category = new RegExp(`^${escapeRegex(String(category))}$`, 'i');
  if (location) query.location = new RegExp(escapeRegex(String(location)), 'i');
  if (q) {
    const regex = new RegExp(escapeRegex(String(q)), 'i');
    query.$or = [{ title: regex }, { description: regex }];
  }

  const items = await MarketplaceItem.find(query).sort({ createdAt: -1 }).populate('sellerId', SELLER_FIELDS).lean();
  return res.json({ items: items.map(serializeItem) });
};

export const createMarketplaceItem = async (req: Request, res: Response) => {
  const user = req.user!;
  const { title, description, price, category, mediaUrls, location } = req.body;

  if (!title || !price || !category || !mediaUrls || mediaUrls.length === 0) {
    return res.status(400).json({ error: 'Title, price, category, and at least one image are required' });
  }
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number' });
  }

  const itemDoc = await MarketplaceItem.create({
    title,
    description: description || '',
    price: numericPrice,
    category,
    mediaUrls,
    sellerId: user.id,
    location: location || 'Unknown Location',
  });

  const flat = serializeItem({
    ...itemDoc.toJSON(),
    sellerId: { id: user.id, username: user.username, profilePic: user.profilePic, verifyBadge: user.verifyBadge },
  });

  return res.status(201).json({ success: true, item: flat });
};

export const deleteMarketplaceItem = async (req: Request, res: Response) => {
  const user = req.user!;
  const item = await MarketplaceItem.findById(req.params.id).catch(() => null);

  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (item.get('sellerId').toString() !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized to delete this product listing' });
  }

  await MarketplaceItem.deleteOne({ _id: item.id });
  return res.json({ success: true, message: 'Item listing deleted' });
};

