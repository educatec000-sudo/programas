import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authLimiter } from '../middlewares/rateLimit.js';
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../validations/auth.validation.js';
import * as controller from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
router.post('/refresh', authLimiter, controller.refresh);
router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), controller.forgotPassword);
router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), controller.resetPassword);

router.use(authenticate);
router.get('/me', controller.me);
router.post('/logout', controller.logout);
router.post('/change-password', validate({ body: changePasswordSchema }), controller.changePassword);
router.get('/sessions', controller.listSessions);
router.delete('/sessions/:id', controller.revokeSession);

export default router;
