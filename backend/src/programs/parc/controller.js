import fs from 'node:fs';
import { parseParcSpreadsheet, confirmParcImport } from './import.js';
import {
  getParcDashboard,
  getParcSchoolResults,
  getParcSingleSchoolDetail,
  getParcRanking,
  getParcFilters,
  getParcParticipatingSchools,
  getAvailableSchoolsToAdd,
  addParcParticipatingSchool,
  removeParcParticipatingSchool,
  bulkRemoveParcParticipatingSchools,
  deleteParcSchoolResult,
  bulkDeleteParcSchoolResults,
  publishParcSchoolResults,
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

    const explicitCycle = req.body?.cycle || null;
    const year = req.body?.year || null;

    const preview = await parseParcSpreadsheet(
      buffer,
      req.file.originalname,
      explicitCycle,
      req.params.id,
      year,
    );
    return res.json(preview);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message || 'Erro ao processar planilha de Fluência do PARC.',
      },
    });
  }
}

export async function confirmImport(req, res, next) {
  try {
    const { records, year, asDraft, manualMappings } = req.body;
    if (!Array.isArray(records) || !records.length) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Nenhum registro para confirmação.' },
      });
    }
    const isDraft = Boolean(asDraft);
    const result = await confirmParcImport(
      req.params.id,
      records,
      year,
      req.user,
      req.ip,
      isDraft,
      manualMappings,
    );
    const label = isDraft ? 'salvos como rascunho' : 'consolidados com sucesso';
    return res.json({
      message: `${result.total} registros do PARC ${label}! (${result.createdCount} novos, ${result.updatedCount} atualizados).`,
      result,
    });
  } catch (err) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message || 'Erro ao confirmar importação do PARC.',
      },
    });
  }
}

export async function getDashboard(req, res, next) {
  try {
    const data = await getParcDashboard(req.params.id, req.query);
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getSchoolResults(req, res, next) {
  try {
    const data = await getParcSchoolResults(req.params.id, req.query);
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getSingleSchoolDetail(req, res, next) {
  try {
    const data = await getParcSingleSchoolDetail(req.params.id, req.params.schoolId);
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deleteSchoolResult(req, res, next) {
  try {
    const result = await deleteParcSchoolResult(req.params.id, req.params.resultId, req.user, req.ip);
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
    const result = await bulkDeleteParcSchoolResults(req.params.id, req.body, req.user, req.ip);
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

export async function saveManualSchoolResult(req, res, next) {
  try {
    const result = await saveParcManualResult(req.params.id, req.body, req.user, req.ip);
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message || 'Erro ao cadastrar resultado manual de Fluência.',
      },
    });
  }
}

export async function publishSchoolResults(req, res, next) {
  try {
    const result = await publishParcSchoolResults(req.params.id, req.body, req.user, req.ip);
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
    const data = await getParcRanking(req.params.id, req.query);
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getFilters(req, res, next) {
  try {
    const data = await getParcFilters(req.params.id);
    return res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getParticipatingSchools(req, res, next) {
  try {
    const data = await getParcParticipatingSchools(req.params.id);
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
    const { schoolId, name } = req.body || {};
    if (!schoolId && !name) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Identificador da escola (schoolId) ou dados da nova escola são obrigatórios.' },
      });
    }
    const result = await addParcParticipatingSchool(req.params.id, req.body, req.user, req.ip);
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message || 'Erro ao vincular escola participante.',
      },
    });
  }
}

export async function removeParticipatingSchool(req, res, next) {
  try {
    const result = await removeParcParticipatingSchool(req.params.id, req.params.schoolId, req.user, req.ip);
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
    const result = await bulkRemoveParcParticipatingSchools(req.params.id, req.body, req.user, req.ip);
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
