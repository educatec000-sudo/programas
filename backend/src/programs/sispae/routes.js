import { Router } from 'express';
import { authenticate, requirePermission } from '../../middlewares/auth.js';
import { uploadImportFile } from '../../middlewares/upload.js';
import * as controller from './controller.js';

const router = Router({ mergeParams: true });
router.use(authenticate);

// Dashboard & Visão Geral
router.get('/dashboard', requirePermission('programs:read'), controller.dashboard);

// Gestão de Aplicações (Simulados e Avaliações Oficiais)
router.get('/applications', requirePermission('programs:read'), controller.applications);
router.post('/applications', requirePermission('programs:write'), controller.createApplication);
router.put('/applications/:appId', requirePermission('programs:write'), controller.updateApplication);
router.delete('/applications/:appId', requirePermission('programs:write'), controller.deleteApplication);

// Ranking
router.get('/ranking', requirePermission('programs:read'), controller.ranking);

// Análises e Matriz de Habilidades
router.get('/analises', requirePermission('programs:read'), controller.analises);

// Resultados por Escola
router.get('/results', requirePermission('programs:read'), controller.results);
router.get('/school-results', requirePermission('programs:read'), controller.results);

// Escolas Participantes
router.get('/schools', requirePermission('programs:read'), controller.schools);

// Importação de Planilha (.csv / .xlsx)
router.post(
  '/import/preview',
  requirePermission('programs:write'),
  uploadImportFile,
  controller.importPreview,
);
router.post(
  '/import/confirm',
  requirePermission('programs:write'),
  controller.importConfirm,
);

// Lançamento Manual e Exclusões
router.post('/manual', requirePermission('programs:write'), controller.manualEntry);
router.delete('/results/:resultId', requirePermission('programs:write'), controller.deleteResult);
router.post('/results/batch-delete', requirePermission('programs:write'), controller.batchDelete);

export default router;
