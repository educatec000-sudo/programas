import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import * as controller from '../controllers/notification.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', controller.list);
router.post('/read-all', controller.markAllRead);
router.post('/:id/read', controller.markRead);

export default router;
