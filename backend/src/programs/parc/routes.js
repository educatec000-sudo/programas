import { Router } from 'express';
import { authenticate, requirePermission } from '../../middlewares/auth.js';
import { uploadImportFile } from '../../middlewares/upload.js';
import * as controller from './controller.js';

const router = Router({ mergeParams: true });
router.use(authenticate);

// Importação da Planilha Oficial PARC (Fluência Leitora - Entrada / Saída)
router.post(
  '/import/preview',
  requirePermission('programs:write'),
  uploadImportFile,
  controller.previewImport,
);

router.post(
  '/import/confirm',
  requirePermission('programs:write'),
  controller.confirmImport,
);

// Escolas Participantes do PARC
router.get(
  '/schools',
  requirePermission('programs:read'),
  controller.getParticipatingSchools,
);

router.get(
  '/schools/available',
  requirePermission('programs:read'),
  controller.getAvailableSchools,
);

router.post(
  '/schools',
  requirePermission('programs:write'),
  controller.addParticipatingSchool,
);

router.delete(
  '/schools/:schoolId',
  requirePermission('programs:write'),
  controller.removeParticipatingSchool,
);

router.post(
  '/schools/bulk-remove',
  requirePermission('programs:write'),
  controller.bulkRemoveParticipatingSchools,
);

// Dashboard / Visão Geral do PARC
router.get(
  '/dashboard',
  requirePermission('programs:read'),
  controller.getDashboard,
);

// Resultados por Escola e Gerenciamento
router.get(
  '/school-results',
  requirePermission('programs:read'),
  controller.getSchoolResults,
);

router.get(
  '/school-results/:schoolId',
  requirePermission('programs:read'),
  controller.getSingleSchoolDetail,
);

router.post(
  '/results/manual',
  requirePermission('programs:write'),
  controller.saveManualSchoolResult,
);

router.delete(
  '/results/:resultId',
  requirePermission('programs:write'),
  controller.deleteSchoolResult,
);

router.post(
  '/results/bulk-delete',
  requirePermission('programs:write'),
  controller.bulkDeleteSchoolResults,
);

router.post(
  '/results/publish',
  requirePermission('programs:write'),
  controller.publishSchoolResults,
);

// Ranking Oficial do PARC (Entrada, Saída e Evolução)
router.get(
  '/ranking',
  requirePermission('programs:read'),
  controller.getRanking,
);

// Filtros Disponíveis
router.get(
  '/filters',
  requirePermission('programs:read'),
  controller.getFilters,
);

export default router;
