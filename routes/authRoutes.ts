/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createRouter } from '../utils/createRouter';
import { authenticateToken } from '../middleware/auth';
import {
  sendVerificationCode,
  register,
  login,
  logout,
  getCurrentUser,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  updateProfile,
} from '../controllers/authController';

const authRouter = createRouter();

authRouter.post('/send-code', sendVerificationCode);
authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/logout', logout);
authRouter.get('/me', authenticateToken, getCurrentUser);
authRouter.post('/forgot-password', forgotPassword);
authRouter.post('/verify-reset-code', verifyResetCode);
authRouter.post('/reset-password', resetPassword);
authRouter.put('/profile', authenticateToken, updateProfile);

export default authRouter;
