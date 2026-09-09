/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import { Event } from '../models';
import { flattenAuthor, toIdStringArray } from '../utils/serialize';

const CREATOR_FIELDS = 'username profilePic verifyBadge';

function serializeEvent(eventLean: any) {
  const flat = flattenAuthor({ ...eventLean, id: eventLean._id?.toString() || eventLean.id }, 'creatorId', { idOutField: 'creatorId' });
  return {
    ...flat,
    creatorName: flat.username,
    interested: toIdStringArray(eventLean.interested),
    attending: toIdStringArray(eventLean.attending),
    invitees: toIdStringArray(eventLean.invitees),
  };
}

export const getEvents = async (req: Request, res: Response) => {
  const events = await Event.find({}).sort({ createdAt: -1 }).populate('creatorId', CREATOR_FIELDS).lean();
  return res.json({ events: events.map(serializeEvent) });
};

export const createEvent = async (req: Request, res: Response) => {
  const user = req.user!;
  const { title, description, date, location } = req.body;

  if (!title || !date || !location) return res.status(400).json({ error: 'Title, date, and location are required' });

  const eventDoc = await Event.create({
    title,
    description: description || '',
    date,
    location,
    creatorId: user.id,
    interested: [],
    attending: [user.id],
    invitees: [],
    calendarReminder: true,
  });

  const flat = serializeEvent({
    ...eventDoc.toJSON(),
    creatorId: { id: user.id, username: user.username, profilePic: user.profilePic, verifyBadge: user.verifyBadge },
  });

  return res.status(201).json({ success: true, event: flat });
};

export const respondToEvent = async (req: Request, res: Response) => {
  const user = req.user!;
  const event = await Event.findById(req.params.id).catch(() => null);
  const { status } = req.body; // 'attending' | 'interested' | 'none'

  if (!event) return res.status(404).json({ error: 'Event not found' });

  let attending = toIdStringArray(event.get('attending')).filter(id => id !== user.id);
  let interested = toIdStringArray(event.get('interested')).filter(id => id !== user.id);

  if (status === 'attending') attending.push(user.id);
  else if (status === 'interested') interested.push(user.id);

  event.set('attending', attending as any);
  event.set('interested', interested as any);
  await event.save();

  return res.json({ success: true, attending, interested });
};
