/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import { Report } from '../models';
import mongoose from 'mongoose';

export const createReport = async (req: Request, res: Response) => {
  const user = req.user!;
  const { reportedId, type, reason } = req.body;

  if (!reportedId || !type || !reason) {
    return res.status(400).json({ error: 'Reported element ID, type, and reason are required' });
  }
  if (!mongoose.Types.ObjectId.isValid(reportedId)) {
    return res.status(400).json({ error: 'Invalid reported element ID' });
  }

  const reportDoc = await Report.create({ reporterId: user.id, reportedId, type, reason, status: 'pending' });
  return res.status(201).json({ success: true, report: reportDoc.toJSON() });
};
