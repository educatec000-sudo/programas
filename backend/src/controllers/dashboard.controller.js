import { getDashboard } from '../services/dashboard.service.js';
import { wrap } from '../lib/wrap.js';
import { z } from 'zod';

const dashboardQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  programId: z.string().uuid().optional(),
});

export const dashboard = wrap(async (req, res) => {
  const params = dashboardQuery.parse(req.query);
  res.json(await getDashboard(params));
});
