import { getDashboard } from '../services/dashboard.service.js';
import { wrap } from '../lib/wrap.js';

export const dashboard = wrap(async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  res.json(await getDashboard({ year }));
});
