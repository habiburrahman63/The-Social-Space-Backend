/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import { User, Post, Report, MarketplaceItem, Group, Page } from '../models';
import { authService } from '../services/authService';

export const getAdminMetrics = async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized to view administrator dashboard' });

  const [totalUsers, totalPosts, activeReports, totalMarketplace, totalGroups, totalPages, users, reports, settings] =
    await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      Report.countDocuments({ status: 'pending' }),
      MarketplaceItem.countDocuments(),
      Group.countDocuments(),
      Page.countDocuments(),
      User.find().select('-passwordHash').lean(),
      Report.find().lean(),
      authService.getSettings(),
    ]);

  return res.json({
    metrics: { totalUsers, totalPosts, activeReports, totalMarketplace, totalGroups, totalPages },
    users: users.map((u: any) => ({ ...u, id: u._id.toString(), _id: undefined })),
    reports: reports.map((r: any) => ({ ...r, id: r._id.toString(), _id: undefined })),
    settings,
  });
};

export const getAdminUsers = async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only action' });

  const users = await User.find().select('-passwordHash').lean();
  return res.json({ users: users.map((u: any) => ({ ...u, id: u._id.toString(), _id: undefined })) });
};

export const getAdminReports = async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only action' });

  const reports = await Report.find({ status: 'pending' }).lean();

  const groups: Record<string, any[]> = {};
  reports.forEach((r: any) => {
    const key = r.reportedId.toString();
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  const postIds = Object.keys(groups);

  // Batch-fetch every reported post, every post author, and every reporter
  // in two queries total - instead of the previous N+M individual findById
  // calls (one post + one author lookup per reported post, plus one more
  // lookup per individual report on it). A report queue with 50 pending
  // reports on 20 posts used to cost 90+ round trips; this costs 2.
  const posts = await Post.find({ _id: { $in: postIds } }).lean();

  const postsById = new Map<string, any>(posts.map((p: any) => [p._id.toString(), p]));
  const authorIds = posts.map((p: any) => p.userId?.toString()).filter(Boolean);
  const reporterIds = reports.map((r: any) => r.reporterId?.toString()).filter(Boolean);
  const userIds = Array.from(new Set([...authorIds, ...reporterIds]));

  const users = await User.find({ _id: { $in: userIds } }).select('username profilePic').lean();
  const usersById = new Map(users.map((u: any) => [u._id.toString(), u]));

  const reportedPostsList = postIds.map((postId) => {
    const postReports = groups[postId];
    const post = postsById.get(postId);
    const author = post ? usersById.get(post.userId?.toString()) : null;

    const reportedBy = postReports.map((r: any) => {
      const repUser = usersById.get(r.reporterId?.toString());
      return repUser ? repUser.username : 'Anonymous';
    });

    return {
      id: postId,
      authorName: author ? author.username : 'System Generated',
      authorPic: author ? author.profilePic : '',
      text: post ? post.text : `Reported item with reason: ${postReports[0].reason}`,
      reportsCount: postReports.length,
      reportedBy,
    };
  });

  return res.json({ reports: reportedPostsList });
};

export const toggleUserLock = async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only action' });

  const targetUser = await User.findById(req.params.id).catch(() => null);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  targetUser.set('isLocked', !targetUser.get('isLocked'));
  await targetUser.save();

  return res.json({ success: true, isLocked: targetUser.get('isLocked') });
};

export const toggleUserVerify = async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only action' });

  const targetUser = await User.findById(req.params.id).catch(() => null);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  targetUser.set('verifyBadge', !targetUser.get('verifyBadge'));
  await targetUser.save();

  return res.json({ success: true, verifyBadge: targetUser.get('verifyBadge') });
};

export const dismissReport = async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only action' });

  await Report.updateMany({ reportedId: req.params.postId, status: 'pending' }, { $set: { status: 'dismissed' } }).catch(() => null);
  return res.json({ success: true });
};

export const deleteReportedPost = async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only action' });

  const postId = req.params.postId;
  await Post.deleteOne({ _id: postId }).catch(() => null);
  await Report.updateMany({ reportedId: postId, status: 'pending' }, { $set: { status: 'resolved' } }).catch(() => null);

  return res.json({ success: true });
};

export const resolveReport = async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only action' });

  const { status } = req.body; // 'resolved' | 'dismissed'
  const report = await Report.findById(req.params.id).catch(() => null);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  report.set('status', status || 'resolved');
  await report.save();

  return res.json({ success: true, report: report.toJSON() });
};

export const updateAdminSettings = async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only action' });

  const { siteName, maintenanceMode, allowSignups, defaultTheme } = req.body;
  const patch: any = {};
  if (siteName !== undefined) patch.siteName = siteName;
  if (maintenanceMode !== undefined) patch.maintenanceMode = maintenanceMode;
  if (allowSignups !== undefined) patch.allowSignups = allowSignups;
  if (defaultTheme !== undefined) patch.defaultTheme = defaultTheme;

  const settings = await authService.saveSettings(patch);
  return res.json({ success: true, settings });
};
