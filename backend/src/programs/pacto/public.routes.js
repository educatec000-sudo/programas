import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middlewares/validate.js';
import { uploadImportFile } from '../../middlewares/upload.js';
import * as controller from './controller.js';
import {
  assessmentPayloadSchema,
  publicAssessmentParamsSchema,
  publicClassParamsSchema,
  publicClassSchema,
  publicTokenParamsSchema,
  updateClassSchema,
} from './validation.js';

const collectionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMIT', message: 'Muitas solicitações. Aguarde um momento e tente novamente.' },
  },
});

const importLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMIT', message: 'Muitas importações. Aguarde um momento e tente novamente.' },
  },
});

const router = Router();
router.use(collectionLimiter);

router.post(
  '/:token/import/preview',
  importLimiter,
  validate({ params: publicTokenParamsSchema }),
  uploadImportFile,
  controller.previewImport,
);
router.post(
  '/:token/import/confirm',
  importLimiter,
  validate({ params: publicTokenParamsSchema }),
  uploadImportFile,
  controller.confirmImport,
);
router.get('/:token', validate({ params: publicTokenParamsSchema }), controller.publicBootstrap);
router.post(
  '/:token/classes',
  validate({ params: publicTokenParamsSchema, body: publicClassSchema }),
  controller.createPublicClass,
);
router.put(
  '/:token/classes/:classId',
  validate({ params: publicClassParamsSchema, body: updateClassSchema }),
  controller.updatePublicClass,
);
router.put(
  '/:token/assessments/draft',
  validate({ params: publicTokenParamsSchema, body: assessmentPayloadSchema }),
  controller.saveDraft,
);
router.post(
  '/:token/assessments/submit',
  validate({ params: publicTokenParamsSchema, body: assessmentPayloadSchema }),
  controller.submitAssessment,
);
router.post(
  '/:token/assessments/submit-all',
  validate({ params: publicTokenParamsSchema }),
  controller.submitAllAssessments,
);
router.delete(
  '/:token/assessments/:classId/:code',
  validate({ params: publicAssessmentParamsSchema }),
  controller.deletePublicDraft,
);

export default router;
