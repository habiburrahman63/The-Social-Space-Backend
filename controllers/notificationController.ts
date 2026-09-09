/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import { Notification } from '../models';
import { notificationService } from '../services/notificationService';

export const getNotifications = async (req: Request, res: Response) => {
  const user = req.user!;
  const { page, limit } = req.query;
  const pageNum = Math.max(1, parseInt(String(page || '1'), 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit || '50'), 10) || 50));

  const notifications = await notificationService.listForUser(user.id, { page: pageNum, limit: limitNum });
  return res.json({ notifications });
};

export const markNotificationsRead = async (req: Request, res: Response) => {
  const user = req.user!;
  const { types } = req.body || {};

  const filter: any = { recipientId: user.id };
  if (Array.isArray(types) && types.length > 0) {
    filter.type = { $in: types };
  }

  await Notification.updateMany(filter, { $set: { isRead: true } });
  return res.json({ success: true });
};

export const clearNotifications = async (req: Request, res: Response) => {
  const user = req.user!;
  await Notification.deleteMany({ recipientId: user.id });
  return res.json({ success: true });
};
