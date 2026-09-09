/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import { Group, GroupMember } from '../models';

async function serializeGroup(groupLean: any, membersByGroup?: Map<string, any[]>) {
  const groupId = (groupLean._id || groupLean.id).toString();
  const members = membersByGroup
    ? membersByGroup.get(groupId) || []
    : await GroupMember.find({ groupId }).lean();
  return {
    id: groupId,
    name: groupLean.name,
    privacy: groupLean.privacy,
    coverPhoto: groupLean.coverPhoto,
    description: groupLean.description,
    creatorId: groupLean.creatorId?.toString ? groupLean.creatorId.toString() : groupLean.creatorId,
    members: members.map((m: any) => m.userId.toString()),
    admins: members.filter((m: any) => m.role === 'admin').map((m: any) => m.userId.toString()),
    moderators: members.filter((m: any) => m.role === 'moderator').map((m: any) => m.userId.toString()),
    posts: [],
    createdAt: groupLean.createdAt,
  };
}

export const getGroups = async (req: Request, res: Response) => {
  const groups = await Group.find({}).sort({ createdAt: -1 }).lean();

  // Fetch every group's members in a single query instead of one query per
  // group (previously N+1: 1 query for the group list + 1 per group here).
  const groupIds = groups.map((g: any) => g._id);
  const allMembers = await GroupMember.find({ groupId: { $in: groupIds } }).lean();
  const membersByGroup = new Map<string, any[]>();
  for (const m of allMembers as any[]) {
    const key = m.groupId.toString();
    if (!membersByGroup.has(key)) membersByGroup.set(key, []);
    membersByGroup.get(key)!.push(m);
  }

  return res.json({ groups: groups.map((g) => serializeGroup(g, membersByGroup)) });
};

export const createGroup = async (req: Request, res: Response) => {
  const user = req.user!;
  const { name, description, privacy, coverPhoto } = req.body;

  if (!name) return res.status(400).json({ error: 'Group name is required' });

  const groupDoc = await Group.create({
    name,
    description: description || '',
    privacy: privacy || 'public',
    coverPhoto: coverPhoto || 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800',
    creatorId: user.id,
  });

  await GroupMember.create({ groupId: groupDoc.id, userId: user.id, role: 'admin' });

  return res.status(201).json({ success: true, group: await serializeGroup(groupDoc.toJSON()) });
};

export const joinGroup = async (req: Request, res: Response) => {
  const user = req.user!;
  const group = await Group.findById(req.params.id).catch(() => null);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const existing = await GroupMember.findOne({ groupId: group.id, userId: user.id });
  if (existing) {
    await GroupMember.deleteOne({ _id: existing.id });
  } else {
    await GroupMember.create({ groupId: group.id, userId: user.id, role: 'member' });
  }

  const members = await GroupMember.find({ groupId: group.id }).lean();
  return res.json({ success: true, members: members.map((m: any) => m.userId.toString()) });
};
