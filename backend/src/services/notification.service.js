import { prisma } from '../lib/prisma.js';

export async function notify(userId, { type = 'INFO', title, message, link = null }) {
  try {
    await prisma.notification.create({ data: { userId, type, title, message, link } });
  } catch (err) {
    console.error('[CPE][NOTIFY_FAIL]', err?.message);
  }
}

export async function listNotifications(userId, { unreadOnly = false, take = 1000 } = {}) {
  const where = { userId, ...(unreadOnly && { readAt: null }) };
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { notifications, unread };
}

export async function markAsRead(userId, id) {
  await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllAsRead(userId) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
