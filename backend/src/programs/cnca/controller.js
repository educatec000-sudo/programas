import fs from 'node:fs';
import { parseCncaSpreadsheet, confirmCncaImport } from './import.js';
import {
  getCncaDashboard,
  getCncaSchoolResults,
  getCncaSingleSchoolDetail,
  getCncaRanking,
  getCncaFilters,
  getCncaParticipatingSchools,
  getAvailableSchoolsToAdd,
  addCncaParticipatingSchool,
  removeCncaParticipatingSchool,
  bulkRemoveCncaParticipatingSchools,
  deleteCncaSchoolResult,
  bulkDeleteCncaSchoolResults,
  publishCncaSchoolResults,
} from './service.js';

export async function previewImport(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Nenhum arquivo enviado para importação.' },
      });
    }
    const buffer = req.file.buffer || (req.file.path ? fs.readFileSync(req.file.path) : null);
    if (!buffer) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Não foi possível ler o arquivo enviado.' },
      });
    }
    const explicitComponent = req.body?.component || null;
    const explicitGrade = req.body?.grade || null;
    const explicitAssessment = req.body?.assessment || null;

    const preview = await parseCncaSpreadsheet(
      buffer,
      req.file.originalname,
      explicitComponent,
      req.params.id,
      explicitGrade,
      explicitAssessment,
    );
    return res.json(preview);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message || 'Erro ao processar planilha oficial do CNCA.',
      },
    });
  }
}

export async function confirmImport(req, res, next) {
  try {
    const { records, year, asDraft } = req.body;
    if (!Array.isArray(records) || !records.length) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Nenhum registro para confirmação.' },
      });
    }
    const isDraft = Boolean(asDraft);
    const result = await confirmCncaImport(req.params.id, records, year, req.user, req.ip, isDraft);
    const label = isDraft ? 'salvos como rascunho' : 'consolidados com sucesso';
    return res.json({
      message: `${result.total} registros do CNCA ${label}! (${result.createdCount} novos, ${result.updatedCount} atualizados).`,
      result,
    });
  } catch (err) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message || 'Erro ao confirmar importação do CNCA.',
      },
    });
  }
}

export async function getDashboard(req, res, next) {
  try {
    const data = await getCncaDashboard(req.params.id, req.query);
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getSchoolResults(req, res, next) {
  try {
    const data = await getCncaSchoolResults(req.params.id, req.query);
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getSingleSchoolDetail(req, res, next) {
  try {
    const data = await getCncaSingleSchoolDetail(req.params.id, req.params.schoolId, req.query);
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deleteSchoolResult(req, res, next) {
  try {
    const result = await deleteCncaSchoolResult(req.params.id, req.params.resultId, req.user, req.ip);
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message || 'Erro ao excluir resultado.',
      },
    });
  }
}

export async function bulkDeleteSchoolResults(req, res, next) {
  try {
    const result = await bulkDeleteCncaSchoolResults(req.params.id, req.body, req.user, req.ip);
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message || 'Erro ao excluir resultados em lote.',
      },
    });
  }
}

export async function publishSchoolResults(req, res, next) {
  try {
    const result = await publishCncaSchoolResults(req.params.id, req.body, req.user, req.ip);
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message || 'Erro ao publicar rascunhos.',
      },
    });
  }
}

export async function getRanking(req, res, next) {
  try {
    const data = await getCncaRanking(req.params.id, req.query);
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getFilters(req, res, next) {
  try {
    const data = await getCncaFilters(req.params.id);
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getParticipatingSchools(req, res, next) {
  try {
    const data = await getCncaParticipatingSchools(req.params.id);
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getAvailableSchools(req, res, next) {
  try {
    const data = await getAvailableSchoolsToAdd(req.params.id);
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function addParticipatingSchool(req, res, next) {
  try {
    const { schoolId } = req.body;
    if (!schoolId) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Identificador da escola (schoolId) é obrigatório.' },
      });
    }
    const result = await addCncaParticipatingSchool(req.params.id, schoolId, req.user, req.ip);
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message || 'Erro ao adicionar escola participante.',
      },
    });
  }
}

export async function removeParticipatingSchool(req, res, next) {
  try {
    const result = await removeCncaParticipatingSchool(req.params.id, req.params.schoolId, req.user, req.ip);
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message || 'Erro ao desvincular escola participante.',
      },
    });
  }
}

export async function bulkRemoveParticipatingSchools(req, res, next) {
  try {
    const result = await bulkRemoveCncaParticipatingSchools(req.params.id, req.body, req.user, req.ip);
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message || 'Erro ao desvincular escolas participantes em lote.',
      },
    });
  }
}
