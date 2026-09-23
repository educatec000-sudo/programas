import crypto from 'node:crypto';
import { pickField, toNumber } from '../imports/parser.js';
import { resolveStageFromRaw, normalizeStageLabel } from './catalog.js';

const ALIASES = {
  inep: ['INEP ESCOLA', 'INEP', 'CODIGO INEP', 'CODIGO ESCOLA'],
  schoolName: ['ESCOLA', 'NOME ESCOLA'],
  classStage: ['ETAPA TURMA', 'ETAPA DA TURMA'],
  classLabel: ['TURMA', 'NOME TURMA', 'CLASSE'],
  shift: ['TURNO', 'HORARIO', 'HORÁRIO', 'PERIODO', 'PERÍODO'],
  enrollmentStage: ['ETAPA MATRICULA', 'ETAPA MATRÍCULA', 'ETAPA'],
  studentsCount: ['Contagem total de ALUNOS', 'TOTAL ALUNOS', 'ALUNOS', 'TOTAL'],
};

function str(value) {
  return String(value || '').trim();
}

function normalizeSchoolKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeShift(value) {
  const normalized = normalizeSchoolKey(value);
  if (!normalized) return '';
  if (normalized.startsWith('M')) return 'MANHÃ';
  if (normalized.startsWith('T')) return 'TARDE';
  if (normalized.startsWith('I')) return 'INTEGRAL';
  return normalized;
}

export function normalizeInep(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits || '';
}

function isCompletelyBlank(raw = {}) {
  return Object.values(raw).every((value) => str(value) === '');
}

export function hydrateEnrollmentRows(rows = []) {
  const hydrated = [];
  const context = {
    inep: '',
    schoolName: '',
    classStageRaw: '',
    classLabel: '',
    shift: '',
  };

  for (const row of rows) {
    if (isCompletelyBlank(row.raw)) continue;

    const inepRaw = str(pickField(row.raw, ALIASES.inep));
    const schoolNameRaw = str(pickField(row.raw, ALIASES.schoolName));
    const classStageRaw = str(pickField(row.raw, ALIASES.classStage));
    const classLabelRaw = str(pickField(row.raw, ALIASES.classLabel));
    const shiftRaw = str(pickField(row.raw, ALIASES.shift));
    const enrollmentStageRaw = str(pickField(row.raw, ALIASES.enrollmentStage));
    const studentsCountRaw = pickField(row.raw, ALIASES.studentsCount);

    if (inepRaw) context.inep = normalizeInep(inepRaw);
    if (schoolNameRaw) context.schoolName = schoolNameRaw;
    if (classStageRaw) context.classStageRaw = classStageRaw;
    if (classLabelRaw) context.classLabel = classLabelRaw;
    if (shiftRaw) context.shift = normalizeShift(shiftRaw);

    hydrated.push({
      rowNumber: row.rowNumber,
      raw: row.raw,
      original: {
        inepRaw,
        schoolNameRaw,
        classStageRaw,
        classLabelRaw,
        shiftRaw,
        enrollmentStageRaw,
        studentsCountRaw,
      },
      hydrated: {
        inep: normalizeInep(inepRaw || context.inep),
        schoolName: schoolNameRaw || context.schoolName,
        classStageRaw: classStageRaw || context.classStageRaw,
        classLabel: classLabelRaw || context.classLabel,
        shift: normalizeShift(shiftRaw || context.shift),
        enrollmentStageRaw,
        studentsCountRaw,
      },
    });
  }

  return hydrated;
}

export function buildEnrollmentRow(row, ctx, options = {}) {
  const errors = [];
  const referenceYear = Number(options.referenceYear);

  const inep = row.hydrated.inep;
  const schoolName = str(row.hydrated.schoolName);
  const classStageRaw = str(row.hydrated.classStageRaw);
  const classLabel = str(row.hydrated.classLabel);
  const shift = normalizeShift(row.hydrated.shift);
  const enrollmentStageRaw = str(row.hydrated.enrollmentStageRaw);
  const studentsCount = toNumber(row.hydrated.studentsCountRaw);

  if (!referenceYear || referenceYear < 2000 || referenceYear > 2100) {
    errors.push({ field: 'referenceYear', message: 'Ano-base inválido' });
  }
  if (!inep && !schoolName) {
    errors.push({ field: 'escola', message: 'Linha sem identificação da escola (INEP/nome)' });
  }

  const school = inep
    ? ctx.schoolByInep.get(inep)
    : ctx.schoolByName.get(normalizeSchoolKey(schoolName));

  if (!school) {
    errors.push({
      field: 'inep',
      message: inep
        ? `Escola com INEP ${inep} não encontrada no cadastro`
        : `Escola não encontrada pelo nome: ${schoolName || 'não informado'}`,
    });
  }

  if (!classStageRaw) errors.push({ field: 'classStage', message: 'Etapa da turma não informada' });
  if (!classLabel) errors.push({ field: 'classLabel', message: 'Turma não informada' });
  if (!shift) errors.push({ field: 'shift', message: 'Turno não informado' });
  if (!enrollmentStageRaw) errors.push({ field: 'enrollmentStage', message: 'Etapa da matrícula não informada' });
  if (studentsCount === null || studentsCount < 0) {
    errors.push({ field: 'studentsCount', message: 'Total de alunos inválido' });
  }

  const stage = resolveStageFromRaw(enrollmentStageRaw);
  if (!stage) {
    errors.push({ field: 'enrollmentStage', message: `Etapa de matrícula não reconhecida: "${enrollmentStageRaw}"` });
  }

  const classStage = resolveStageFromRaw(classStageRaw);
  const classStageNorm = normalizeStageLabel(classStageRaw);
  const isMultiStage =
    classStageNorm.includes('MULTI') ||
    classStageNorm.includes('UNIFICADA') ||
    (classStage && stage && classStage.code !== stage.code);

  const contextKey = [classStageRaw || enrollmentStageRaw, classLabel, shift]
    .map((item) => normalizeStageLabel(item))
    .join('|');

  const baseIdentity = school?.id || inep || normalizeSchoolKey(schoolName) || `ROW-${row.rowNumber}`;
  const key = [baseIdentity, classStageRaw, classLabel, shift, stage?.code || normalizeStageLabel(enrollmentStageRaw)]
    .map((item) => String(item || '').trim())
    .join('|');

  const data = errors.length === 0
    ? {
        referenceYear,
        schoolId: school.id,
        schoolName: school.name,
        inep: school.inep,
        contextKey,
        classStageRaw,
        classLabel,
        shift,
        enrollmentStageRaw,
        stageCode: stage.code,
        stageLabel: stage.label,
        segment: stage.segment,
        studentsCount: Math.round(studentsCount),
        isMultiStage,
        rawLine: {
          original: row.original,
          hydrated: row.hydrated,
        },
      }
    : null;

  return { data, errors, key };
}

export function summarizeDatasetFingerprint(rows = []) {
  const hash = crypto.createHash('sha1');
  for (const row of rows) {
    hash.update(JSON.stringify({
      schoolId: row.data?.schoolId,
      stageCode: row.data?.stageCode,
      classStageRaw: row.data?.classStageRaw,
      classLabel: row.data?.classLabel,
      shift: row.data?.shift,
      studentsCount: row.data?.studentsCount,
    }));
  }
  return hash.digest('hex');
}
