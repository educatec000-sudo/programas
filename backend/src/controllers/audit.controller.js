import { prisma } from '../lib/prisma.js';
import { wrap } from '../lib/wrap.js';
import { parsePagination, buildPagination } from '../lib/pagination.js';

export const list = wrap(async (req, res) => {
  const { page, pageSize, skip, take } = parsePagination(req.query);
  const { action, entity, userId, search, dateFrom, dateTo } = req.query;

  const where = {
    ...(action && { action }),
    ...(entity && { entity }),
    ...(userId && { userId }),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(`${dateTo}T23:59:59`) }),
          },
        }
      : {}),
    ...(search && {
      OR: [
        { userName: { contains: search, mode: 'insensitive' } },
        { entity: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search } },
        { ip: { contains: search } },
      ],
    }),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);

  res.json({ data: logs, pagination: buildPagination(total, page, pageSize) });
});

export const stats = wrap(async (_req, res) => {
  const byAction = await prisma.auditLog.groupBy({
    by: ['action'],
    _count: { action: true },
    orderBy: { _count: { action: 'desc' } },
    take: 20,
  });
  const byEntity = await prisma.auditLog.groupBy({
    by: ['entity'],
    _count: { entity: true },
    orderBy: { _count: { entity: 'desc' } },
    take: 20,
  });
  res.json({
    byAction: byAction.map((a) => ({ action: a.action, count: a._count.action })),
    byEntity: byEntity.map((e) => ({ entity: e.entity, count: e._count.entity })),
  });
});
