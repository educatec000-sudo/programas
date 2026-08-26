import * as notificationService from '../services/notification.service.js';
import { wrap } from '../lib/wrap.js';

export const list = wrap(async (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  const result = await notificationService.listNotifications(req.user.id, { unreadOnly });
  res.json(result);
});

export const markRead = wrap(async (req, res) => {
  await notificationService.markAsRead(req.user.id, req.params.id);
  res.json({ message: 'Notificação lida' });
});

export const markAllRead = wrap(async (req, res) => {
  await notificationService.markAllAsRead(req.user.id);
  res.json({ message: 'Todas as notificações foram marcadas como lidas' });
});
