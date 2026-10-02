/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createRouter } from '../utils/createRouter';
import { authenticateToken } from '../middleware/auth';
import { getPosts, getPostComments, createPost, updatePost, deletePost, reactToPost, commentOnPost, voteOnPoll } from '../controllers/postController';
import { getFriendSuggestions, getFriendsList, getFriendRequests, getUserById, sendFriendRequest, cancelFriendRequest, acceptFriendRequest, rejectFriendRequest, unfriendUser, followUser, unfollowUser, blockUser, unblockUser, getBlockedUsers } from '../controllers/friendController';
import { getMessageContacts, getUnreadMessageCount, getConversation, setTypingStatus, getTypingStatus, sendMessage, deleteMessage } from '../controllers/messageController';
import { getStories, createStory, viewStory } from '../controllers/storyController';
import { getMarketplaceItems, createMarketplaceItem, deleteMarketplaceItem } from '../controllers/marketplaceController';
import { getPages, createPage, followPage } from '../controllers/pageController';
import { getGroups, createGroup, joinGroup } from '../controllers/groupController';
import { getEvents, createEvent, respondToEvent } from '../controllers/eventController';
import { getNotifications, markNotificationsRead, clearNotifications } from '../controllers/notificationController';
import { createReport } from '../controllers/reportController';
import { getAdminMetrics, getAdminUsers, getAdminReports, toggleUserLock, toggleUserVerify, dismissReport, deleteReportedPost, resolveReport, updateAdminSettings } from '../controllers/adminController';

const apiRouter = createRouter();

apiRouter.get('/posts', authenticateToken, getPosts);
apiRouter.get('/posts/:id/comments', authenticateToken, getPostComments);
apiRouter.post('/posts', authenticateToken, createPost);
apiRouter.put('/posts/:id', authenticateToken, updatePost);
apiRouter.delete('/posts/:id', authenticateToken, deletePost);
apiRouter.post('/posts/:id/react', authenticateToken, reactToPost);
apiRouter.post('/posts/:id/comment', authenticateToken, commentOnPost);
apiRouter.post('/posts/:id/poll/vote', authenticateToken, voteOnPoll);
apiRouter.get('/friends/suggestions', authenticateToken, getFriendSuggestions);
apiRouter.get('/friends/list', authenticateToken, getFriendsList);
apiRouter.get('/friends/requests', authenticateToken, getFriendRequests);
apiRouter.get('/users/:id', authenticateToken, getUserById);
apiRouter.post('/friends/request/:id', authenticateToken, sendFriendRequest);
apiRouter.post('/friends/cancel/:id', authenticateToken, cancelFriendRequest);
apiRouter.post('/friends/accept/:id', authenticateToken, acceptFriendRequest);
apiRouter.post('/friends/reject/:id', authenticateToken, rejectFriendRequest);
apiRouter.post('/friends/unfriend/:id', authenticateToken, unfriendUser);
apiRouter.post('/follow/:id', authenticateToken, followUser);
apiRouter.post('/unfollow/:id', authenticateToken, unfollowUser);
apiRouter.post('/users/:id/block', authenticateToken, blockUser);
apiRouter.post('/users/:id/unblock', authenticateToken, unblockUser);
apiRouter.get('/users/blocked/list', authenticateToken, getBlockedUsers);
apiRouter.get('/messages/contacts', authenticateToken, getMessageContacts);
apiRouter.get('/messages/unread/count', authenticateToken, getUnreadMessageCount);
apiRouter.get('/messages/:id', authenticateToken, getConversation);
apiRouter.post('/messages/typing', authenticateToken, setTypingStatus);
apiRouter.get('/messages/typing/:targetUserId', authenticateToken, getTypingStatus);
apiRouter.post('/messages', authenticateToken, sendMessage);
apiRouter.delete('/messages/:id', authenticateToken, deleteMessage);
apiRouter.get('/stories', authenticateToken, getStories);
apiRouter.post('/stories', authenticateToken, createStory);
apiRouter.post('/stories/:id/view', authenticateToken, viewStory);
apiRouter.get('/marketplace', authenticateToken, getMarketplaceItems);
apiRouter.post('/marketplace', authenticateToken, createMarketplaceItem);
apiRouter.delete('/marketplace/:id', authenticateToken, deleteMarketplaceItem);
apiRouter.get('/pages', authenticateToken, getPages);
apiRouter.post('/pages', authenticateToken, createPage);
apiRouter.post('/pages/:id/follow', authenticateToken, followPage);
apiRouter.get('/groups', authenticateToken, getGroups);
apiRouter.post('/groups', authenticateToken, createGroup);
apiRouter.post('/groups/:id/join', authenticateToken, joinGroup);
apiRouter.get('/events', authenticateToken, getEvents);
apiRouter.post('/events', authenticateToken, createEvent);
apiRouter.post('/events/:id/respond', authenticateToken, respondToEvent);
apiRouter.get('/notifications', authenticateToken, getNotifications);
apiRouter.post('/notifications/read', authenticateToken, markNotificationsRead);
apiRouter.post('/notifications/clear', authenticateToken, clearNotifications);
apiRouter.post('/reports', authenticateToken, createReport);
apiRouter.get('/admin/metrics', authenticateToken, getAdminMetrics);
apiRouter.get('/admin/users', authenticateToken, getAdminUsers);
apiRouter.get('/admin/reports', authenticateToken, getAdminReports);
apiRouter.post('/admin/users/:id/toggle-lock', authenticateToken, toggleUserLock);
apiRouter.post('/admin/users/:id/toggle-verify', authenticateToken, toggleUserVerify);
apiRouter.delete('/admin/reports/:postId/dismiss', authenticateToken, dismissReport);
apiRouter.delete('/admin/reports/:postId/delete', authenticateToken, deleteReportedPost);
apiRouter.post('/admin/reports/:id/resolve', authenticateToken, resolveReport);
apiRouter.put('/admin/settings', authenticateToken, updateAdminSettings);
export default apiRouter;
