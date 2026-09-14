import fs from 'node:fs';
import * as service from './service.js';
import * as importModule from './import.js';
import { HttpError } from '../../lib/errors.js';

export async function dashboard(req, res, next) {
  try {
    const data = await service.getSispaeDashboard(req.params.id, req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function applications(req, res, next) {
  try {
    const data = await service.getSispaeApplications(req.params.id);
    res.json({ applications: data });
  } catch (err) {
    next(err);
  }
}

export async function createApplication(req, res, next) {
  try {
    const data = await service.createSispaeApplication(req.params.id, req.body, req.user, req.ip);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateApplication(req, res, next) {
  try {
    const data = await service.updateSispaeApplication(
      req.params.id,
      req.params.appId,
      req.body,
      req.user,
      req.ip,
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deleteApplication(req, res, next) {
  try {
    const data = await service.deleteSispaeApplication(
      req.params.id,
      req.params.appId,
      req.user,
      req.ip,
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function ranking(req, res, next) {
  try {
    const data = await service.getSispaeRanking(req.params.id, req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function analises(req, res, next) {
  try {
    const data = await service.getSispaeAnalises(req.params.id, req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function results(req, res, next) {
  try {
    const data = await service.getSispaeSchoolResults(req.params.id, req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function schools(req, res, next) {
  try {
    const data = await service.getSispaeSchools(req.params.id, req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function importPreview(req, res, next) {
  try {
    if (!req.file) {
      throw new HttpError(400, 'Nenhum arquivo enviado para importação.');
    }
    const buffer = req.file.buffer || (req.file.path ? fs.readFileSync(req.file.path) : null);
    if (!buffer || buffer.length === 0) {
      throw new HttpError(400, 'Não foi possível ler o arquivo enviado ou o arquivo está vazio.');
    }
    const data = await importModule.previewSispaeImport(
      req.params.id,
      buffer,
      req.file.originalname,
      req.body,
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function importConfirm(req, res, next) {
  try {
    const data = await importModule.confirmSispaeImport(
      req.params.id,
      req.body,
      req.user,
      req.ip,
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deleteResult(req, res, next) {
  try {
    const data = await service.deleteSispaeResult(
      req.params.id,
      req.params.resultId,
      req.user,
      req.ip,
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function batchDelete(req, res, next) {
  try {
    const data = await service.batchDeleteSispaeResults(
      req.params.id,
      req.body.ids || req.body.resultIds,
      req.user,
      req.ip,
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function manualEntry(req, res, next) {
  try {
    const data = await service.manualSispaeEntry(
      req.params.id,
      req.body,
      req.user,
      req.ip,
    );
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}
