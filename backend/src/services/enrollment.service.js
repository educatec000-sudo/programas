import fs from 'node:fs';
import { prisma } from '../lib/prisma.js';
import { HttpError, notFound } from '../lib/errors.js';
import { audit, AuditAction } from '../lib/audit.js';
import { parseSpreadsheet } from '../modules/imports/parser.js';
import { IMPORT_ROW_STATUS } from '../lib/constants.js';
import { notify } from './notification.service.js';
import {
  DEFAULT_ENROLLMENT_STAGES,
  createDefaultRuleItems,
  getStageByCode,
} from '../modules/enrollment/catalog.js';
import {
  hydrateEnrollmentRows,
  buildEnrollmentRow,
  summarizeDatasetFingerprint,
} from '../modules/enrollment/parser.js';
import {
  buildOfferedSuccessorMap,
  buildProjectionForSchool,
  findSchoolEntryStageCode,
  getNetworkPredecessorStageCodes,
  getNetworkSuccessorCandidateStageCodes,
  isNetworkRootStage,
  rebalanceSiblingStageProjectedStudents,
  summarizeProjectionResults,
} from '../modules/enrollment/engine.js';

const MAX_ROWS = 20000;
const MAX_STORED_ERRORS = 1500;

function cleanup(filePath) {
  try {
    if (filePath) fs.unlinkSync(filePath);
  } catch {
    /* ignora */
  }
}

function summarizeRows(rows) {
  const summary = {
    totalRows: rows.length,
    validRows: 0,
    newRows: 0,
    updatedRows: 0,
    duplicateRows: 0,
    errorRows: 0,
  };
  for (const row of rows) {
    if (row.status === IMPORT_ROW_STATUS.NOVO) {
      summary.newRows++;
      summary.validRows++;
    } else if (row.status === IMPORT_ROW_STATUS.ATUALIZAR) {
      summary.updatedRows++;
      summary.validRows++;
    } else if (row.status === IMPORT_ROW_STATUS.DUPLICADO) {
      summary.duplicateRows++;
    } else {
      summary.errorRows++;
    }
  }
  return summary;
}

function defaultYears() {
  const baseYear = new Date().getFullYear();
  return { baseYear, projectedYear: baseYear + 1 };
}

async function ensureStages() {
  await prisma.$transaction(
    DEFAULT_ENROLLMENT_STAGES.map((stage) =>
      prisma.enrollmentStage.upsert({
        where: { code: stage.code },
        create: {
          code: stage.code,
          label: stage.label,
          segment: stage.segment,
          orderIndex: stage.orderIndex,
          nextStageCode: stage.nextStageCode,
          isEntryStage: stage.isEntryStage,
          defaultCapacity: stage.defaultCapacity,
          active: true,
        },
        update: {
          label: stage.label,
          segment: stage.segment,
          orderIndex: stage.orderIndex,
          nextStageCode: stage.nextStageCode,
          isEntryStage: stage.isEntryStage,
          defaultCapacity: stage.defaultCapacity,
        },
      }),
    ),
    { timeout: 60_000 },
  );
}

async function ensureRuleSet(baseYear, projectedYear, actor = null) {
  await ensureStages();
  let ruleSet = await prisma.projectionRuleSet.findFirst({
    where: { baseYear, projectedYear, status: 'ATIVO' },
    include: { items: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (ruleSet) return ruleSet;

  ruleSet = await prisma.projectionRuleSet.create({
    data: {
      name: `Regras padrão ${baseYear} → ${projectedYear}`,
      baseYear,
      projectedYear,
      status: 'ATIVO',
      notes: 'Conjunto inicial criado automaticamente pelo módulo de Prospecção de Matrículas.',
      createdById: actor?.id || null,
      items: {
        create: createDefaultRuleItems(),
      },
    },
    include: { items: true },
  });
  return ruleSet;
}

async function getStages() {
  await ensureStages();
  return prisma.enrollmentStage.findMany({
    where: { active: true },
    orderBy: { orderIndex: 'asc' },
  });
}

async function loadImportContext(referenceYear) {
  const [schools, officialDataset] = await Promise.all([
    prisma.school.findMany({
      where: { deletedAt: null },
      select: { id: true, inep: true, name: true, zone: true },
    }),
    prisma.enrollmentDataset.findFirst({
      where: { referenceYear, status: 'OFICIAL' },
      include: { records: true },
      orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  const schoolByInep = new Map(schools.filter((school) => school.inep).map((school) => [school.inep, school]));
  const schoolByName = new Map(
    schools.map((school) => [
      String(school.name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' '),
      school,
    ]),
  );

  const existingKeys = new Set(
    (officialDataset?.records || []).map((record) => (
      [record.schoolId, record.classStageRaw, record.classLabel, record.shift, record.stageCode]
        .map((item) => String(item || '').trim())
        .join('|')
    )),
  );

  return { schoolByInep, schoolByName, existingKeys, officialDataset };
}

function serializeImportJob(job, { includeRows = true } = {}) {
  return {
    id: job.id,
    type: job.type,
    filename: job.filename,
    status: job.status,
    totalRows: job.totalRows,
    validRows: job.validRows,
    newRows: job.newRows,
    updatedRows: job.updatedRows,
    duplicateRows: job.duplicateRows,
    errorRows: job.errorRows,
    error: job.error,
    summary: job.summary,
    createdAt: job.createdAt,
    confirmedAt: job.confirmedAt,
    finishedAt: job.finishedAt,
    ...(includeRows ? { rows: job.data || [] } : {}),
  };
}

function chooseRun({ runId, officialRuns = [], latestSimulation = null, allRuns = [] }) {
  if (runId) {
    return allRuns.find((run) => run.id === runId)
      || officialRuns.find((run) => run.id === runId)
      || (latestSimulation?.id === runId ? latestSimulation : null);
  }
  return officialRuns[0] || latestSimulation || allRuns[0] || null;
}

async function getDatasetBySelector({ datasetId, baseYear }) {
  if (datasetId) {
    const dataset = await prisma.enrollmentDataset.findUnique({
      where: { id: datasetId },
      include: { records: true },
    });
    if (!dataset) throw notFound('Base histórica não encontrada');
    return dataset;
  }
  const where = {
    status: 'OFICIAL',
    ...(baseYear ? { referenceYear: Number(baseYear) } : {}),
  };
  return prisma.enrollmentDataset.findFirst({
    where,
    include: { records: true },
    orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

async function getRuleSetBySelector({ ruleSetId, baseYear, projectedYear }, actor = null) {
  if (ruleSetId) {
    const set = await prisma.projectionRuleSet.findUnique({
      where: { id: ruleSetId },
      include: { items: true },
    });
    if (!set) throw notFound('Conjunto de regras não encontrado');
    return set;
  }
  return ensureRuleSet(Number(baseYear), Number(projectedYear), actor);
}

function aggregateDataset(datasetRecords = []) {
  const schoolStageCounts = new Map();
  const schoolStageClasses = new Map();
  const classContextSet = new Set();
  const schoolUniqueClasses = new Map();

  for (const record of datasetRecords) {
    const schoolKey = `${record.schoolId}|${record.stageCode}`;
    schoolStageCounts.set(schoolKey, Number(schoolStageCounts.get(schoolKey) || 0) + Number(record.studentsCount || 0));

    if (!schoolStageClasses.has(schoolKey)) schoolStageClasses.set(schoolKey, new Set());
    schoolStageClasses.get(schoolKey).add(record.contextKey);

    classContextSet.add(`${record.schoolId}|${record.contextKey}`);
    if (!schoolUniqueClasses.has(record.schoolId)) schoolUniqueClasses.set(record.schoolId, new Set());
    schoolUniqueClasses.get(record.schoolId).add(record.contextKey);
  }

  return {
    schoolStageCounts,
    schoolStageClasses,
    schoolUniqueClasses,
    totalUniqueClasses: classContextSet.size,
  };
}

function getSchoolPlanningSummaryFromResult(result) {
  return result?.reasonJson?.schoolPlanning || null;
}

function normalizeShift(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || 'SEM_TURNO';
}

function buildSchoolOperationalProfile(records = []) {
  const stageCodes = new Set();
  const shiftKeys = new Set();
  const countsByStage = new Map();
  const classSetsByStage = new Map();
  const classCountsByStage = new Map();
  const recordsByShift = new Map();

  for (const record of records) {
    if (record.stageCode) stageCodes.add(record.stageCode);
    const shiftKey = normalizeShift(record.shift);
    shiftKeys.add(shiftKey);
    countsByStage.set(record.stageCode, Number(countsByStage.get(record.stageCode) || 0) + Number(record.studentsCount || 0));
    if (!classSetsByStage.has(record.stageCode)) classSetsByStage.set(record.stageCode, new Set());
    classSetsByStage.get(record.stageCode).add(record.contextKey);
    if (!recordsByShift.has(shiftKey)) recordsByShift.set(shiftKey, []);
    recordsByShift.get(shiftKey).push(record);
  }

  for (const [stageCode, classSet] of classSetsByStage.entries()) {
    classCountsByStage.set(stageCode, Number(classSet?.size || 0));
  }

  return {
    stageCodes,
    shiftKeys,
    countsByStage,
    classCountsByStage,
    recordsByShift,
  };
}

function buildShiftMaps(shiftRecords = [], stageCodes = []) {
  const countsByStage = new Map(stageCodes.map((stageCode) => [stageCode, 0]));
  const classCountsByStage = new Map(stageCodes.map((stageCode) => [stageCode, 0]));
  const classSetsByStage = new Map(stageCodes.map((stageCode) => [stageCode, new Set()]));
  const classContextSet = new Set();

  for (const record of shiftRecords) {
    countsByStage.set(record.stageCode, Number(countsByStage.get(record.stageCode) || 0) + Number(record.studentsCount || 0));
    if (!classSetsByStage.has(record.stageCode)) classSetsByStage.set(record.stageCode, new Set());
    classSetsByStage.get(record.stageCode).add(record.contextKey);
    classContextSet.add(record.contextKey);
  }

  for (const stageCode of stageCodes) {
    classCountsByStage.set(stageCode, Number(classSetsByStage.get(stageCode)?.size || 0));
  }

  return {
    countsByStage,
    classCountsByStage,
    totalClassesAvailable: classContextSet.size,
  };
}


function sumStageCounts(countsByStage = new Map(), stageCodes = []) {
  return stageCodes.reduce((sum, stageCode) => sum + Number(countsByStage.get(stageCode) || 0), 0);
}

function normalizeTargetStageKey(stageCodes = []) {
  return [...new Set(stageCodes.map((stageCode) => String(stageCode || '').trim().toUpperCase()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .join('|');
}

function distributeIntegerTotal(total = 0, items = [], getWeight = () => 1, getKey = (item) => item?.id) {
  const safeTotal = Math.max(0, Number(total || 0));
  if (!safeTotal || !items.length) return new Map();

  const prepared = items.map((item) => ({
    item,
    key: getKey(item),
    weight: Math.max(0, Number(getWeight(item) || 0)),
  })).filter((entry) => entry.key);

  if (!prepared.length) return new Map();

  const weightTotal = prepared.reduce((sum, entry) => sum + entry.weight, 0);
  const normalized = prepared.map((entry) => ({
    ...entry,
    effectiveWeight: weightTotal > 0 ? entry.weight : 1,
  }));
  const effectiveTotal = normalized.reduce((sum, entry) => sum + entry.effectiveWeight, 0);

  const allocations = normalized.map((entry) => {
    const exact = safeTotal * (entry.effectiveWeight / effectiveTotal);
    const whole = Math.floor(exact);
    return { ...entry, exact, whole, remainder: exact - whole };
  });

  let assigned = allocations.reduce((sum, entry) => sum + entry.whole, 0);
  allocations.sort((a, b) => b.remainder - a.remainder || String(a.key).localeCompare(String(b.key), 'pt-BR'));
  for (let index = 0; assigned < safeTotal && index < allocations.length; index += 1, assigned += 1) {
    allocations[index].whole += 1;
  }

  return new Map(allocations.map((entry) => [entry.key, entry.whole]));
}

function buildSchoolExternalTransitionPlan({ schoolInputs = [], rulesByStage = new Map() }) {
  const externalDemandBySchoolStage = new Map();
  const useHistoricalEntryBySchool = new Map();
  const unresolvedBySchool = new Map();
  const unresolvedStagesBySchool = new Map();

  for (const input of schoolInputs) {
    useHistoricalEntryBySchool.set(input.schoolId, isNetworkRootStage(input.entryStageCode));
  }

  const pools = new Map();
  for (const input of schoolInputs) {
    const offeredSuccessorMap = buildOfferedSuccessorMap(input.offeredStages, rulesByStage);

    for (const stage of input.offeredStages) {
      const currentStudents = Number(input.profile.countsByStage.get(stage.code) || 0);
      if (currentStudents <= 0) continue;
      if ((offeredSuccessorMap.get(stage.code) || []).length) continue;

      const targetCandidates = getNetworkSuccessorCandidateStageCodes(stage.code);
      if (!targetCandidates.length) continue;
      const poolKey = normalizeTargetStageKey([stage.code, ...targetCandidates]);
      if (!pools.has(poolKey)) {
        pools.set(poolKey, {
          sourceStageCode: stage.code,
          targetCandidates,
          totalStudents: 0,
          sources: [],
        });
      }
      const pool = pools.get(poolKey);
      pool.totalStudents += currentStudents;
      pool.sources.push({ schoolId: input.schoolId, stageCode: stage.code, students: currentStudents });
    }
  }

  for (const pool of pools.values()) {
    const options = [];
    for (const input of schoolInputs) {
      for (const targetStageCode of pool.targetCandidates) {
        if (!input.offeredStages.some((stage) => stage.code === targetStageCode)) continue;
        const currentStudents = Number(input.profile.countsByStage.get(targetStageCode) || 0);
        const currentClasses = Number(input.profile.classCountsByStage.get(targetStageCode) || 0);
        options.push({
          schoolId: input.schoolId,
          stageCode: targetStageCode,
          weight: currentClasses > 0 ? currentClasses : Math.max(currentStudents, 1),
        });
      }
    }

    if (!options.length) {
      for (const source of pool.sources) {
        unresolvedBySchool.set(source.schoolId, Number(unresolvedBySchool.get(source.schoolId) || 0) + Number(source.students || 0));
        if (!unresolvedStagesBySchool.has(source.schoolId)) unresolvedStagesBySchool.set(source.schoolId, []);
        unresolvedStagesBySchool.get(source.schoolId).push({ stageCode: source.stageCode, students: source.students });
      }
      continue;
    }

    const distributed = distributeIntegerTotal(
      pool.totalStudents,
      options,
      (item) => item.weight,
      (item) => `${item.schoolId}|${item.stageCode}`,
    );

    for (const [compositeKey, allocated] of distributed.entries()) {
      const [schoolId, stageCode] = compositeKey.split('|');
      if (!externalDemandBySchoolStage.has(schoolId)) externalDemandBySchoolStage.set(schoolId, new Map());
      const stageMap = externalDemandBySchoolStage.get(schoolId);
      stageMap.set(stageCode, Number(stageMap.get(stageCode) || 0) + Number(allocated || 0));
    }
  }

  return {
    externalDemandBySchoolStage,
    useHistoricalEntryBySchool,
    unresolvedBySchool,
    unresolvedStagesBySchool,
  };
}

function buildShiftStageDemandAllocations({ profile, stageCode, totalDemand = 0 }) {
  const safeTotal = Math.max(0, Number(totalDemand || 0));
  const shiftKeys = [...profile.shiftKeys];
  if (!safeTotal || !shiftKeys.length) return new Map();

  const shiftWeights = shiftKeys
    .map((shift) => {
      const records = profile.recordsByShift.get(shift) || [];
      const stageRecords = records.filter((record) => record.stageCode === stageCode);
      if (!stageRecords.length) return null;
      const students = stageRecords.reduce((sum, record) => sum + Number(record.studentsCount || 0), 0);
      const classes = new Set(stageRecords.map((record) => record.contextKey).filter(Boolean)).size;
      return { shift, weight: classes > 0 ? classes : Math.max(students, 1) };
    })
    .filter(Boolean);

  if (!shiftWeights.length) return new Map();
  return distributeIntegerTotal(
    safeTotal,
    shiftWeights,
    (item) => item.weight,
    (item) => item.shift,
  );
}

function applyNetworkDemandAlertsToProjection(schoolProjection, unresolvedStudents = 0, unresolvedStages = []) {
  const pending = Math.max(0, Number(unresolvedStudents || 0));
  if (!pending) return schoolProjection;

  schoolProjection.summary.continuityStudentsUnserved = Number(schoolProjection.summary.continuityStudentsUnserved || 0) + pending;
  schoolProjection.summary.continuitySatisfied = false;
  schoolProjection.summary.incompatibilityAlert = true;
  schoolProjection.summary.networkTransitionPending = pending;
  schoolProjection.totals.continuityStudentsUnserved = Number(schoolProjection.totals.continuityStudentsUnserved || 0) + pending;

  const stagePendingMap = new Map();
  for (const item of unresolvedStages || []) {
    stagePendingMap.set(item.stageCode, Number(stagePendingMap.get(item.stageCode) || 0) + Number(item.students || 0));
  }

  for (const row of schoolProjection.results) {
    const stagePending = Number(stagePendingMap.get(row.stageCode) || 0);
    if (!stagePending) continue;
    row.studentsOverflow = Number(row.studentsOverflow || 0) + stagePending;
    row.reasonJson.studentsOverflow = Number(row.reasonJson?.studentsOverflow || 0) + stagePending;
    row.reasonJson.networkTransitionPending = stagePending;
    row.reasonJson.schoolPlanning = schoolProjection.summary;
  }

  return schoolProjection;
}

function aggregateShiftProjectionRows({ offeredStages = [], shiftProjections = [], entryStageCode = null, adjustmentsByStage = new Map() }) {
  const rowsByStage = new Map();

  for (const stage of offeredStages) {
    rowsByStage.set(stage.code, {
      stageCode: stage.code,
      stageLabel: stage.label,
      segment: stage.segment,
      entryStageCode,
      currentStudents: 0,
      projectedStudents: 0,
      currentClasses: 0,
      projectedClasses: 0,
      minRequiredClasses: 0,
      plannedCapacity: 0,
      availableVacancies: 0,
      studentsOverflow: 0,
      capacityLimit: null,
      occupancyRate: null,
      adjustmentApplied: Number(adjustmentsByStage.get(stage.code) || 0),
      stageMode: stage.code === entryStageCode ? 'ENTRADA' : 'INATIVA',
      isRelevant: false,
      reasonJson: {
        planningPolicy: 'TURMAS_FIXAS_POR_ESCOLA',
        continuityApprovalPolicy: '100_PERCENT',
        continuityDemand: 0,
        entryDemand: 0,
        externalEntryDemand: 0,
        historicalEntryDemand: 0,
        entryReferenceStudents: 0,
        baseAverageStudentsPerClass: null,
        minRequiredClasses: 0,
        plannedClasses: 0,
        plannedCapacity: 0,
        availableVacancies: 0,
        studentsOverflow: 0,
        roundingMode: 'ARREDONDAR',
        nextStageCode: stage.nextStageCode,
        turnBreakdown: [],
        stageMode: stage.code === entryStageCode ? 'ENTRADA' : 'INATIVA',
      },
    });
  }

  for (const shiftProjection of shiftProjections) {
    for (const row of shiftProjection.results) {
      if (!rowsByStage.has(row.stageCode)) continue;
      const target = rowsByStage.get(row.stageCode);
      target.currentStudents += Number(row.currentStudents || 0);
      target.projectedStudents += Number(row.projectedStudents || 0);
      target.currentClasses += Number(row.currentClasses || 0);
      target.projectedClasses += Number(row.projectedClasses || 0);
      target.minRequiredClasses += Number(row.minRequiredClasses || row.reasonJson?.minRequiredClasses || 0);
      target.plannedCapacity += Number(row.plannedCapacity || row.reasonJson?.plannedCapacity || 0);
      target.availableVacancies += Number(row.availableVacancies || row.reasonJson?.availableVacancies || 0);
      target.studentsOverflow += Number(row.studentsOverflow || row.reasonJson?.studentsOverflow || 0);
      target.capacityLimit = row.capacityLimit ?? target.capacityLimit;
      if ((row.projectedStudents || 0) > 0 || (row.currentStudents || 0) > 0 || (row.projectedClasses || 0) > 0 || (row.currentClasses || 0) > 0) {
        target.isRelevant = true;
      }
      if (target.stageMode !== 'ENTRADA' && row.stageMode && row.stageMode !== 'INATIVA') target.stageMode = row.stageMode;
      target.reasonJson.continuityDemand += Number(row.reasonJson?.continuityDemand || 0);
      target.reasonJson.entryDemand += Number(row.reasonJson?.entryDemand || 0);
      target.reasonJson.externalEntryDemand = Number(target.reasonJson.externalEntryDemand || 0) + Number(row.reasonJson?.externalEntryDemand || 0);
      target.reasonJson.historicalEntryDemand = Number(target.reasonJson.historicalEntryDemand || 0) + Number(row.reasonJson?.historicalEntryDemand || 0);
      target.reasonJson.entryReferenceStudents += Number(row.reasonJson?.entryReferenceStudents || 0);
      target.reasonJson.minRequiredClasses += Number(row.reasonJson?.minRequiredClasses || 0);
      target.reasonJson.plannedClasses += Number(row.reasonJson?.plannedClasses || row.projectedClasses || 0);
      target.reasonJson.plannedCapacity += Number(row.reasonJson?.plannedCapacity || row.plannedCapacity || 0);
      target.reasonJson.availableVacancies += Number(row.reasonJson?.availableVacancies || row.availableVacancies || 0);
      target.reasonJson.studentsOverflow += Number(row.reasonJson?.studentsOverflow || row.studentsOverflow || 0);
      if (row.reasonJson?.baseAverageStudentsPerClass != null) {
        target.reasonJson.baseAverageStudentsPerClass = target.currentClasses > 0
          ? Math.round((target.currentStudents / target.currentClasses) * 10) / 10
          : row.reasonJson.baseAverageStudentsPerClass;
      }
      target.reasonJson.rawPromotionRate = row.reasonJson?.rawPromotionRate;
      target.reasonJson.effectivePromotionRate = row.reasonJson?.effectivePromotionRate;
      target.reasonJson.repetitionRate = row.reasonJson?.repetitionRate;
      target.reasonJson.dropoutRate = row.reasonJson?.dropoutRate;
      target.reasonJson.unresolvedRate = row.reasonJson?.unresolvedRate;
      target.reasonJson.graduationRate = row.reasonJson?.graduationRate;
      target.reasonJson.accountedRate = row.reasonJson?.accountedRate;
      target.reasonJson.normalizedAccountedRate = row.reasonJson?.normalizedAccountedRate;
      target.reasonJson.configuredPromotedOut = Number(target.reasonJson.configuredPromotedOut || 0) + Number(row.reasonJson?.configuredPromotedOut || 0);
      target.reasonJson.configuredRepeaters = Number(target.reasonJson.configuredRepeaters || 0) + Number(row.reasonJson?.configuredRepeaters || 0);
      target.reasonJson.configuredDropouts = Number(target.reasonJson.configuredDropouts || 0) + Number(row.reasonJson?.configuredDropouts || 0);
      target.reasonJson.configuredGraduatesOrLeavers = Number(target.reasonJson.configuredGraduatesOrLeavers || 0) + Number(row.reasonJson?.configuredGraduatesOrLeavers || 0);
      target.reasonJson.stageMode = target.stageMode;
      target.reasonJson.turnBreakdown.push({
        shift: shiftProjection.shift,
        currentStudents: row.currentStudents,
        projectedStudents: row.projectedStudents,
        currentClasses: row.currentClasses,
        projectedClasses: row.projectedClasses,
        continuityDemand: row.reasonJson?.continuityDemand || 0,
        entryDemand: row.reasonJson?.entryDemand || 0,
        externalEntryDemand: row.reasonJson?.externalEntryDemand || 0,
        historicalEntryDemand: row.reasonJson?.historicalEntryDemand || 0,
        plannedCapacity: row.reasonJson?.plannedCapacity || row.plannedCapacity || 0,
        availableVacancies: row.reasonJson?.availableVacancies || row.availableVacancies || 0,
        studentsOverflow: row.reasonJson?.studentsOverflow || row.studentsOverflow || 0,
      });
    }
  }

  for (const row of rowsByStage.values()) {
    const adjustmentApplied = Number(adjustmentsByStage.get(row.stageCode) || 0);
    row.adjustmentApplied = adjustmentApplied;
    row.projectedStudents = Math.max(0, row.projectedStudents + adjustmentApplied);
    row.studentsOverflow = Math.max(0, row.projectedStudents - row.plannedCapacity);
    row.availableVacancies = Math.max(0, row.plannedCapacity - row.projectedStudents);
    row.occupancyRate = row.plannedCapacity > 0
      ? Math.round(((row.projectedStudents / row.plannedCapacity) * 100) * 10) / 10
      : null;
    row.reasonJson.availableVacancies = row.availableVacancies;
    row.reasonJson.studentsOverflow = row.studentsOverflow;
    row.reasonJson.plannedCapacity = row.plannedCapacity;
    row.reasonJson.plannedClasses = row.projectedClasses;
    if (row.stageCode === entryStageCode) row.reasonJson.entryDemand = row.projectedStudents;
    row.reasonJson.baseAverageStudentsPerClass = row.currentClasses > 0
      ? Math.round((row.currentStudents / row.currentClasses) * 10) / 10
      : row.reasonJson.baseAverageStudentsPerClass;
    row.reasonJson.adjustmentApplied = adjustmentApplied;
    row.reasonJson.stageMode = row.stageMode;
    row.isRelevant = row.isRelevant || row.stageCode === entryStageCode;
  }

  return [...rowsByStage.values()].filter((row) => row.isRelevant);
}

function buildAggregatedSchoolProjection({ schoolId, offeredStages = [], shiftProjections = [], entryStageCode = null, adjustmentsByStage = new Map() }) {
  const results = rebalanceSiblingStageProjectedStudents(aggregateShiftProjectionRows({ offeredStages, shiftProjections, entryStageCode, adjustmentsByStage }));
  const totalAvailableClasses = shiftProjections.reduce((sum, projection) => sum + Number(projection.summary?.totalAvailableClasses || projection.totals?.currentClasses || 0), 0);
  const totalPlannedClasses = results.reduce((sum, row) => sum + Number(row.projectedClasses || 0), 0);
  const continuityMinimumClasses = shiftProjections.reduce((sum, projection) => sum + Number(projection.summary?.continuityMinimumClasses || 0), 0);
  const continuityStudentsUnserved = results
    .filter((row) => row.stageCode !== entryStageCode)
    .reduce((sum, row) => sum + Number(row.studentsOverflow || 0), 0);
  const entryRow = results.find((row) => row.stageCode === entryStageCode) || null;
  const entryReferenceDeficit = Number(entryRow?.studentsOverflow || 0);
  const additionalClassesNeeded = Math.max(0, continuityMinimumClasses - totalAvailableClasses);
  const entryCapacityLimitMissing = Boolean(entryRow?.reasonJson?.capacityConfigMissing);
  const entryNewVacancies = entryCapacityLimitMissing ? null : Number(entryRow?.availableVacancies ?? 0);
  const continuitySatisfied = continuityStudentsUnserved === 0;
  const offeredShifts = [...new Set(shiftProjections.map((item) => item.shift))].sort();
  const summary = {
    planningPolicy: 'TURMAS_FIXAS_POR_ESCOLA',
    continuityApprovalPolicy: '100_PERCENT',
    fixedTotalClassesRule: true,
    entryStageCode,
    offeredStageCodes: offeredStages.map((stage) => stage.code),
    offeredShifts,
    totalAvailableClasses,
    totalPlannedClasses,
    classesDistributed: totalPlannedClasses,
    undistributedClasses: Math.max(0, totalAvailableClasses - totalPlannedClasses),
    additionalClassesNeeded,
    continuityStudentsUnserved,
    continuitySatisfied,
    continuityMinimumClasses,
    entryPlannedClasses: Number(entryRow?.projectedClasses || 0),
    entryPlannedCapacity: Number(entryRow?.plannedCapacity || 0),
    entryReferenceStudents: Number(entryRow?.reasonJson?.entryReferenceStudents || entryRow?.currentStudents || 0),
    entryProjectedStudents: Number(entryRow?.projectedStudents || entryRow?.reasonJson?.entryDemand || 0),
    entryHistoricalDemand: Number(entryRow?.reasonJson?.historicalEntryDemand || 0),
    entryExternalDemand: Number(entryRow?.reasonJson?.externalEntryDemand || 0),
    entryReferenceDeficit,
    entryNewVacancies,
    entryCapacityLimitMissing,
    incompatibilityAlert: entryCapacityLimitMissing || additionalClassesNeeded > 0 || continuityStudentsUnserved > 0,
    respectsOfferedStages: true,
    respectsShiftConstraint: true,
    shiftBreakdown: shiftProjections.map((projection) => ({
      shift: projection.shift,
      totalAvailableClasses: projection.summary?.totalAvailableClasses || projection.totals?.currentClasses || 0,
      totalPlannedClasses: projection.summary?.totalPlannedClasses || projection.totals?.projectedClasses || 0,
      entryProjectedStudents: projection.summary?.entryProjectedStudents || 0,
      entryHistoricalDemand: projection.summary?.entryHistoricalDemand || 0,
      entryExternalDemand: projection.summary?.entryExternalDemand || 0,
      entryNewVacancies: projection.summary?.entryCapacityLimitMissing ? null : (projection.summary?.entryNewVacancies ?? 0),
      continuityStudentsUnserved: projection.summary?.continuityStudentsUnserved || 0,
    })),
  };

  for (const row of results) {
    row.reasonJson.schoolPlanning = summary;
  }

  return {
    schoolId,
    entryStageCode,
    summary,
    results,
    totals: {
      currentStudents: results.reduce((sum, row) => sum + Number(row.currentStudents || 0), 0),
      projectedStudents: results.reduce((sum, row) => sum + Number(row.projectedStudents || 0), 0),
      currentClasses: totalAvailableClasses,
      projectedClasses: totalPlannedClasses,
      undistributedClasses: Math.max(0, totalAvailableClasses - totalPlannedClasses),
      additionalClassesNeeded,
      entryProjectedStudents: Number(entryRow?.projectedStudents || entryRow?.reasonJson?.entryDemand || 0),
      entryNewVacancies,
      continuityStudentsUnserved,
      entryReferenceDeficit,
    },
  };
}

function looksLikeEntryStageResult(result) {
  return result?.reasonJson?.stageMode === 'ENTRADA'
    || Number(result?.reasonJson?.entryDemand || 0) > 0
    || Number(result?.reasonJson?.entryIntake || 0) > 0;
}

function extractEntryMetricsFromResult(result, planning = null) {
  const capacityLimit = Number(result?.capacityLimit || 0);
  const projectedClasses = Number(result?.projectedClasses || 0);
  const projectedStudents = Number(result?.projectedStudents || 0);
  const derivedPlannedCapacity = Number(result?.reasonJson?.plannedCapacity || (capacityLimit > 0 ? projectedClasses * capacityLimit : 0));
  const derivedEntryVacancies = Math.max(0, Number(
    planning?.entryNewVacancies
    ?? result?.reasonJson?.availableVacancies
    ?? (derivedPlannedCapacity - projectedStudents)
    ?? 0,
  ));

  return {
    entryStageCode: planning?.entryStageCode || result?.stageCode || null,
    entryReferenceStudents: Number(result?.reasonJson?.entryReferenceStudents || result?.currentStudents || 0),
    entryCurrentStudents: Number(result?.currentStudents || 0),
    entryProjectedStudents: Number(result?.projectedStudents || result?.reasonJson?.entryDemand || 0),
    entryPlannedCapacity: derivedPlannedCapacity,
    entryNewVacancies: derivedEntryVacancies,
  };
}

function buildFallbackPlanningSummaryFromStageRows(stageRows = []) {
  const entryRow = stageRows.find((row) => looksLikeEntryStageResult(row)) || stageRows[0] || null;
  if (!entryRow) return null;

  const entryMetrics = extractEntryMetricsFromResult(entryRow);
  const continuityStudentsUnserved = stageRows.reduce((sum, row) => sum + Number(row?.reasonJson?.studentsOverflow || 0), 0);

  return {
    planningPolicy: 'LEGACY_FALLBACK',
    entryStageCode: entryMetrics.entryStageCode,
    entryNewVacancies: entryMetrics.entryNewVacancies,
    continuityStudentsUnserved,
    continuitySatisfied: continuityStudentsUnserved === 0,
    ...entryMetrics,
  };
}

function buildStageSummaryFromRecords(records = [], stages = []) {
  const stageMap = new Map();
  const stageClassMaps = new Map();

  for (const stage of stages) {
    stageMap.set(stage.code, {
      stageCode: stage.code,
      stageLabel: stage.label,
      segment: stage.segment,
      currentStudents: 0,
      currentClasses: 0,
      projectedStudents: null,
      projectedClasses: null,
    });
    stageClassMaps.set(stage.code, new Set());
  }

  for (const record of records) {
    if (!stageMap.has(record.stageCode)) continue;
    const item = stageMap.get(record.stageCode);
    item.currentStudents += Number(record.studentsCount || 0);
    stageClassMaps.get(record.stageCode).add(`${record.schoolId}|${record.contextKey}`);
  }

  for (const [stageCode, set] of stageClassMaps.entries()) {
    stageMap.get(stageCode).currentClasses = set.size;
  }

  return [...stageMap.values()].filter((item) => item.currentStudents > 0 || item.currentClasses > 0);
}

function mergeProjectionIntoStageSummary(summaryRows = [], runResults = []) {
  const map = new Map(summaryRows.map((row) => [row.stageCode, { ...row }]));
  for (const result of runResults) {
    if (!map.has(result.stageCode)) {
      const meta = getStageByCode(result.stageCode);
      map.set(result.stageCode, {
        stageCode: result.stageCode,
        stageLabel: meta?.label || result.stageCode,
        segment: meta?.segment || 'OUTROS',
        currentStudents: 0,
        currentClasses: 0,
        projectedStudents: 0,
        projectedClasses: 0,
      });
    }
    const item = map.get(result.stageCode);
    item.projectedStudents = Number(item.projectedStudents || 0) + Number(result.projectedStudents || 0);
    item.projectedClasses = Number(item.projectedClasses || 0) + Number(result.projectedClasses || 0);
  }
  return [...map.values()].sort((a, b) => (getStageByCode(a.stageCode)?.orderIndex || 999) - (getStageByCode(b.stageCode)?.orderIndex || 999));
}

export async function previewEnrollmentImport({ file, referenceYear, targetYear = null, notes = '' }, actor, ip) {
  if (!file) throw new HttpError(400, 'Envie o arquivo no campo "file"', 'BAD_REQUEST');

  let parsedRows;
  try {
    parsedRows = parseSpreadsheet(file.path);
  } catch (err) {
    const failed = await prisma.importJob.create({
      data: {
        type: 'MATRICULAS',
        filename: file.originalname,
        status: 'FALHOU',
        error: err.message,
        userId: actor.id,
        summary: { referenceYear: Number(referenceYear), targetYear: targetYear ? Number(targetYear) : null },
      },
    });
    cleanup(file.path);
    return serializeImportJob(failed);
  } finally {
    cleanup(file.path);
  }

  const hydratedRows = hydrateEnrollmentRows(parsedRows);
  if (!hydratedRows.length) {
    throw new HttpError(422, 'O arquivo não possui linhas válidas para leitura', 'PARSE_ERROR');
  }
  if (hydratedRows.length > MAX_ROWS) {
    throw new HttpError(422, `Arquivo com ${hydratedRows.length} linhas — limite de ${MAX_ROWS}.`, 'PARSE_ERROR');
  }

  const ctx = await loadImportContext(Number(referenceYear));
  const staged = [];
  const seen = new Set();

  for (const row of hydratedRows) {
    const built = buildEnrollmentRow(row, ctx, { referenceYear: Number(referenceYear) });
    let status = IMPORT_ROW_STATUS.ERRO;
    if (!built.errors.length) {
      if (seen.has(built.key)) status = IMPORT_ROW_STATUS.DUPLICADO;
      else if (ctx.existingKeys.has(built.key)) status = IMPORT_ROW_STATUS.ATUALIZAR;
      else status = IMPORT_ROW_STATUS.NOVO;
      seen.add(built.key);
    }
    staged.push({
      rowNumber: row.rowNumber,
      status,
      data: built.data,
      errors: built.errors,
      ...(built.key ? { key: built.key } : {}),
    });
  }

  const summary = summarizeRows(staged);
  const job = await prisma.importJob.create({
    data: {
      type: 'MATRICULAS',
      filename: file.originalname,
      status: 'PENDENTE',
      userId: actor.id,
      ...summary,
      data: staged,
      summary: {
        module: 'PROSPECCAO_MATRICULAS',
        referenceYear: Number(referenceYear),
        targetYear: targetYear ? Number(targetYear) : null,
        notes,
        comparedWithDatasetId: ctx.officialDataset?.id || null,
        parsedAt: new Date().toISOString(),
      },
    },
  });

  const errorRows = staged.filter((row) => row.status === IMPORT_ROW_STATUS.ERRO).slice(0, MAX_STORED_ERRORS);
  if (errorRows.length) {
    await prisma.importError.createMany({
      data: errorRows.flatMap((row) =>
        (row.errors || []).map((error) => ({
          jobId: job.id,
          rowNumber: row.rowNumber,
          field: error.field || null,
          message: error.message,
          value: '',
        })),
      ),
    });
  }

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.IMPORT_PREVIEW,
    entity: 'EnrollmentDataset',
    entityId: job.id,
    metadata: { filename: file.originalname, referenceYear: Number(referenceYear), targetYear: targetYear ? Number(targetYear) : null, ...summary },
    ip,
  });

  return serializeImportJob(job);
}

export async function confirmEnrollmentImport({ jobId, notes = '', publishAsOfficial = true }, actor, ip) {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job || job.type !== 'MATRICULAS') throw notFound('Prévia de matrículas não encontrada');
  if (job.status !== 'PENDENTE') {
    throw new HttpError(409, `Esta prévia está com status ${job.status} e não pode ser confirmada`, 'CONFLICT');
  }

  const staged = Array.isArray(job.data) ? job.data : [];
  const validRows = staged.filter((row) => row.status === IMPORT_ROW_STATUS.NOVO || row.status === IMPORT_ROW_STATUS.ATUALIZAR);
  const referenceYear = Number(job.summary?.referenceYear || 0);
  const targetYear = Number(job.summary?.targetYear || referenceYear + 1);
  if (!referenceYear) throw new HttpError(422, 'Ano-base não encontrado na prévia', 'VALIDATION_ERROR');
  if (!validRows.length) throw new HttpError(422, 'Não há linhas válidas para importar', 'VALIDATION_ERROR');

  const fingerprint = summarizeDatasetFingerprint(validRows);
  const now = new Date();

  const dataset = await prisma.$transaction(async (tx) => {
    if (publishAsOfficial) {
      await tx.enrollmentDataset.updateMany({
        where: { referenceYear, status: 'OFICIAL' },
        data: { status: 'ARQUIVADO' },
      });
    }

    const createdDataset = await tx.enrollmentDataset.create({
      data: {
        referenceYear,
        targetYear,
        status: publishAsOfficial ? 'OFICIAL' : 'RASCUNHO',
        sourceFileName: job.filename,
        sourceHash: fingerprint,
        notes: notes || job.summary?.notes || null,
        importedById: actor.id,
        approvedById: publishAsOfficial ? actor.id : null,
        importJobId: job.id,
        approvedAt: publishAsOfficial ? now : null,
      },
    });

    await tx.enrollmentRecord.createMany({
      data: validRows.map((row) => ({
        datasetId: createdDataset.id,
        schoolId: row.data.schoolId,
        referenceYear: row.data.referenceYear,
        contextKey: row.data.contextKey,
        classStageRaw: row.data.classStageRaw,
        classLabel: row.data.classLabel,
        shift: row.data.shift,
        enrollmentStageRaw: row.data.enrollmentStageRaw,
        stageCode: row.data.stageCode,
        studentsCount: row.data.studentsCount,
        isMultiStage: Boolean(row.data.isMultiStage),
        rawLine: row.data.rawLine,
      })),
    });

    await tx.importJob.update({
      where: { id: job.id },
      data: {
        status: 'IMPORTADO',
        confirmedAt: now,
        finishedAt: now,
        summary: {
          ...(job.summary || {}),
          confirmedBy: actor.name,
          datasetId: createdDataset.id,
          publishedAsOfficial: Boolean(publishAsOfficial),
        },
      },
    });

    return createdDataset;
  }, { timeout: 60_000 });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.IMPORT_CONFIRM,
    entity: 'EnrollmentDataset',
    entityId: dataset.id,
    metadata: {
      referenceYear,
      targetYear,
      publishedAsOfficial: Boolean(publishAsOfficial),
      importedRows: validRows.length,
      filename: job.filename,
    },
    ip,
  });

  await notify(actor.id, {
    type: 'SUCESSO',
    title: `Matrículas ${referenceYear} importadas com sucesso`,
    message: `${validRows.length} linha(s) válidas foram registradas para a prospecção ${referenceYear} → ${targetYear}.`,
    link: '/prospeccao-matriculas',
  });

  return {
    dataset,
    created: validRows.length,
    updated: 0,
    duplicates: job.duplicateRows,
    errors: job.errorRows,
    status: 'IMPORTADO',
  };
}

export async function listDatasets(query = {}) {
  const selectedYear = query.referenceYear || query.baseYear;
  const where = {
    ...(selectedYear ? { referenceYear: Number(selectedYear) } : {}),
  };
  const datasets = await prisma.enrollmentDataset.findMany({
    where,
    include: {
      _count: { select: { records: true, runs: true } },
    },
    orderBy: [{ referenceYear: 'desc' }, { createdAt: 'desc' }],
  });

  return datasets.map((dataset) => ({
    id: dataset.id,
    referenceYear: dataset.referenceYear,
    targetYear: dataset.targetYear,
    status: dataset.status,
    sourceFileName: dataset.sourceFileName,
    notes: dataset.notes,
    importedById: dataset.importedById,
    approvedById: dataset.approvedById,
    approvedAt: dataset.approvedAt,
    createdAt: dataset.createdAt,
    recordsCount: dataset._count.records,
    runsCount: dataset._count.runs,
  }));
}

async function listProjectionRuns({ baseYear, projectedYear }) {
  return prisma.projectionRun.findMany({
    where: {
      ...(baseYear ? { baseYear: Number(baseYear) } : {}),
      ...(projectedYear ? { projectedYear: Number(projectedYear) } : {}),
    },
    include: {
      _count: { select: { results: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

export async function getOverview(query = {}) {
  const years = defaultYears();
  const baseYear = Number(query.baseYear || years.baseYear);
  const projectedYear = Number(query.projectedYear || baseYear + 1);

  await ensureRuleSet(baseYear, projectedYear);

  const [dataset, stages, runs] = await Promise.all([
    getDatasetBySelector({ baseYear }),
    getStages(),
    listProjectionRuns({ baseYear, projectedYear }),
  ]);

  const latestOfficialRun = runs.find((run) => run.mode === 'OFICIAL') || null;
  const latestSimulationRun = runs.find((run) => run.mode === 'SIMULACAO') || null;
  const activeRun = chooseRun({ officialRuns: latestOfficialRun ? [latestOfficialRun] : [], latestSimulation: latestSimulationRun, allRuns: runs });

  if (!dataset) {
    return {
      baseYear,
      projectedYear,
      metrics: null,
      stageSummary: [],
      latestOfficialRun: latestOfficialRun ? { ...latestOfficialRun, resultsCount: latestOfficialRun._count.results } : null,
      latestSimulationRun: latestSimulationRun ? { ...latestSimulationRun, resultsCount: latestSimulationRun._count.results } : null,
      datasets: await listDatasets({ referenceYear: baseYear }),
      runs: runs.map((run) => ({ ...run, resultsCount: run._count.results })),
      topGrowthSchools: [],
      alert: `Nenhuma base oficial de matrículas foi confirmada para ${baseYear}.`,
    };
  }

  const baseAggregates = aggregateDataset(dataset.records);
  const stageSummaryBase = buildStageSummaryFromRecords(dataset.records, stages);

  let runResults = [];
  if (activeRun) {
    runResults = await prisma.projectionResult.findMany({
      where: { runId: activeRun.id },
      include: { school: { select: { id: true, name: true, inep: true } } },
      orderBy: [{ school: { name: 'asc' } }, { stageCode: 'asc' }],
    });
  }

  const stageSummary = mergeProjectionIntoStageSummary(stageSummaryBase, runResults);
  const bySchool = new Map();
  for (const result of runResults) {
    const planning = getSchoolPlanningSummaryFromResult(result);
    if (!bySchool.has(result.schoolId)) {
      bySchool.set(result.schoolId, {
        schoolId: result.schoolId,
        name: result.school?.name || 'Escola',
        inep: result.school?.inep || null,
        currentStudents: 0,
        projectedStudents: 0,
        entryStageCode: planning?.entryStageCode || null,
        entryProjectedStudents: Number(planning?.entryProjectedStudents || 0),
        entryNewVacancies: Number(planning?.entryNewVacancies || 0),
      });
    }
    const item = bySchool.get(result.schoolId);
    item.currentStudents += Number(result.currentStudents || 0);
    item.projectedStudents += Number(result.projectedStudents || 0);
    if ((!item.entryStageCode || item.entryProjectedStudents === 0) && looksLikeEntryStageResult(result)) {
      const entryMetrics = extractEntryMetricsFromResult(result, planning);
      item.entryStageCode = entryMetrics.entryStageCode;
      item.entryProjectedStudents = entryMetrics.entryProjectedStudents;
      item.entryNewVacancies = entryMetrics.entryNewVacancies;
    }
  }

  const topGrowthSchools = [...bySchool.values()]
    .map((item) => ({ ...item, deltaStudents: item.projectedStudents - item.currentStudents }))
    .sort((a, b) => b.entryProjectedStudents - a.entryProjectedStudents || b.entryNewVacancies - a.entryNewVacancies || a.name.localeCompare(b.name))
    .slice(0, 10);

  const metrics = {
    totalSchools: new Set(dataset.records.map((record) => record.schoolId)).size,
    totalClassesBase: baseAggregates.totalUniqueClasses,
    totalStudentsBase: dataset.records.reduce((sum, record) => sum + Number(record.studentsCount || 0), 0),
    totalStudentsProjected: activeRun?.summary?.totals?.projectedStudents ?? null,
    totalClassesProjected: activeRun?.summary?.totals?.projectedClasses ?? null,
    deltaStudents: activeRun?.summary?.totals?.deltaStudents ?? null,
    deltaClasses: activeRun?.summary?.totals?.deltaClasses ?? null,
    entryProjectedStudents: activeRun?.summary?.totals?.entryProjectedStudents ?? null,
    entryNewVacancies: activeRun?.summary?.totals?.entryNewVacancies ?? null,
    continuityStudentsUnserved: activeRun?.summary?.totals?.continuityStudentsUnserved ?? null,
    datasetStatus: dataset.status,
  };

  return {
    baseYear,
    projectedYear,
    metrics,
    dataset: {
      id: dataset.id,
      referenceYear: dataset.referenceYear,
      targetYear: dataset.targetYear,
      sourceFileName: dataset.sourceFileName,
      approvedAt: dataset.approvedAt,
      createdAt: dataset.createdAt,
      status: dataset.status,
      notes: dataset.notes,
      recordsCount: dataset.records.length,
    },
    stageSummary,
    records: dataset.records.map((record) => ({
      id: record.id,
      schoolId: record.schoolId,
      classStageRaw: record.classStageRaw,
      classLabel: record.classLabel,
      shift: record.shift,
      enrollmentStageRaw: record.enrollmentStageRaw,
      stageCode: record.stageCode,
      studentsCount: record.studentsCount,
    })),
    latestOfficialRun: latestOfficialRun ? { ...latestOfficialRun, resultsCount: latestOfficialRun._count.results } : null,
    latestSimulationRun: latestSimulationRun ? { ...latestSimulationRun, resultsCount: latestSimulationRun._count.results } : null,
    runs: runs.map((run) => ({ ...run, resultsCount: run._count.results })),
    datasets: await listDatasets({ referenceYear: baseYear }),
    topGrowthSchools,
    alert: activeRun ? null : 'A base histórica foi importada, mas ainda não existe projeção executada para esse ciclo.',
  };
}

export async function getSettings(query = {}) {
  const years = defaultYears();
  const baseYear = Number(query.baseYear || years.baseYear);
  const projectedYear = Number(query.projectedYear || baseYear + 1);
  const ruleSet = await ensureRuleSet(baseYear, projectedYear);

  const [stages, schoolSettings] = await Promise.all([
    getStages(),
    prisma.schoolProjectionSetting.findMany({
      where: { projectedYear },
      include: {
        school: { select: { id: true, name: true, inep: true } },
      },
      orderBy: { school: { name: 'asc' } },
      take: 500,
    }),
  ]);

  return {
    baseYear,
    projectedYear,
    ruleSet: {
      id: ruleSet.id,
      name: ruleSet.name,
      status: ruleSet.status,
      notes: ruleSet.notes,
      items: [...ruleSet.items].sort((a, b) => (getStageByCode(a.stageCode)?.orderIndex || 999) - (getStageByCode(b.stageCode)?.orderIndex || 999)),
    },
    stages,
    schoolSettings: schoolSettings.map((setting) => ({
      id: setting.id,
      schoolId: setting.schoolId,
      projectedYear: setting.projectedYear,
      entryStageCode: setting.entryStageCode,
      capacityOverrides: setting.capacityOverrides || {},
      notes: setting.notes,
      school: setting.school,
    })),
  };
}

export async function updateRuleSet(payload, actor, ip) {
  const baseYear = Number(payload.baseYear);
  const projectedYear = Number(payload.projectedYear);
  const existing = payload.ruleSetId
    ? await prisma.projectionRuleSet.findUnique({ where: { id: payload.ruleSetId } })
    : await prisma.projectionRuleSet.findFirst({ where: { baseYear, projectedYear, status: 'ATIVO' } });

  const stages = await getStages();
  const stageCodes = new Set(stages.map((stage) => stage.code));
  const items = (payload.items || []).map((item) => ({
    ...item,
    stageCode: String(item.stageCode || '').trim().toUpperCase(),
    nextStageCode: item.nextStageCode ? String(item.nextStageCode).trim().toUpperCase() : null,
  }));

  for (const item of items) {
    if (!stageCodes.has(item.stageCode)) {
      throw new HttpError(422, `Etapa inválida nas regras: ${item.stageCode}`, 'VALIDATION_ERROR');
    }
    if ((Number(item.promotionRate) || 0) + (Number(item.repetitionRate) || 0) + (Number(item.dropoutRate) || 0) > 100.0001) {
      throw new HttpError(422, `A soma das taxas da etapa ${item.stageCode} não pode exceder 100%.`, 'VALIDATION_ERROR');
    }
  }

  const ruleSet = await prisma.$transaction(async (tx) => {
    const upserted = existing
      ? await tx.projectionRuleSet.update({
          where: { id: existing.id },
          data: {
            name: payload.name,
            notes: payload.notes || null,
            baseYear,
            projectedYear,
            status: 'ATIVO',
          },
        })
      : await tx.projectionRuleSet.create({
          data: {
            name: payload.name,
            notes: payload.notes || null,
            baseYear,
            projectedYear,
            status: 'ATIVO',
            createdById: actor.id,
          },
        });

    for (const item of items) {
      await tx.projectionRuleItem.upsert({
        where: {
          ruleSetId_stageCode: {
            ruleSetId: upserted.id,
            stageCode: item.stageCode,
          },
        },
        create: {
          ruleSetId: upserted.id,
          stageCode: item.stageCode,
          nextStageCode: item.nextStageCode,
          promotionRate: Number(item.promotionRate || 0),
          repetitionRate: Number(item.repetitionRate || 0),
          dropoutRate: Number(item.dropoutRate || 0),
          entryRate: Number(item.entryRate || 0),
          capacityLimit: item.capacityLimit == null ? null : Number(item.capacityLimit),
          roundingMode: item.roundingMode || 'ARREDONDAR',
          active: item.active !== false,
        },
        update: {
          nextStageCode: item.nextStageCode,
          promotionRate: Number(item.promotionRate || 0),
          repetitionRate: Number(item.repetitionRate || 0),
          dropoutRate: Number(item.dropoutRate || 0),
          entryRate: Number(item.entryRate || 0),
          capacityLimit: item.capacityLimit == null ? null : Number(item.capacityLimit),
          roundingMode: item.roundingMode || 'ARREDONDAR',
          active: item.active !== false,
        },
      });
    }

    return tx.projectionRuleSet.findUnique({
      where: { id: upserted.id },
      include: { items: true },
    });
  }, { timeout: 60_000 });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'ProjectionRuleSet',
    entityId: ruleSet.id,
    metadata: { baseYear, projectedYear, items: items.length },
    ip,
  });

  return ruleSet;
}

export async function upsertSchoolSetting(schoolId, payload, actor, ip) {
  const school = await prisma.school.findFirst({ where: { id: schoolId, deletedAt: null }, select: { id: true, name: true, inep: true } });
  if (!school) throw notFound('Escola não encontrada');

  const setting = await prisma.schoolProjectionSetting.upsert({
    where: {
      schoolId_projectedYear: {
        schoolId,
        projectedYear: Number(payload.projectedYear),
      },
    },
    create: {
      schoolId,
      projectedYear: Number(payload.projectedYear),
      entryStageCode: payload.entryStageCode || null,
      capacityOverrides: payload.capacityOverrides || {},
      notes: payload.notes || null,
      updatedById: actor.id,
    },
    update: {
      entryStageCode: payload.entryStageCode || null,
      capacityOverrides: payload.capacityOverrides || {},
      notes: payload.notes || null,
      updatedById: actor.id,
    },
    include: {
      school: { select: { id: true, name: true, inep: true } },
    },
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'SchoolProjectionSetting',
    entityId: setting.id,
    metadata: { schoolId, schoolName: school.name, projectedYear: setting.projectedYear },
    ip,
  });

  return setting;
}

export async function runProjection(payload, actor, ip) {
  const years = defaultYears();
  const baseYear = Number(payload.baseYear || years.baseYear);
  const projectedYear = Number(payload.projectedYear || baseYear + 1);
  const dataset = await getDatasetBySelector({ datasetId: payload.datasetId, baseYear });
  if (!dataset) {
    throw new HttpError(422, `Nenhuma base oficial encontrada para ${baseYear}.`, 'DATASET_REQUIRED');
  }

  const [stages, ruleSet, schoolSettings] = await Promise.all([
    getStages(),
    getRuleSetBySelector({ ruleSetId: payload.ruleSetId, baseYear, projectedYear }, actor),
    prisma.schoolProjectionSetting.findMany({ where: { projectedYear } }),
  ]);

  const rulesByStage = new Map(ruleSet.items.map((item) => [item.stageCode, item]));
  const settingsBySchool = new Map(schoolSettings.map((item) => [item.schoolId, item]));
  const schoolIds = [...new Set(dataset.records.map((record) => record.schoolId))];
  const adjustments = Array.isArray(payload.adjustments) ? payload.adjustments : [];
  const adjustmentsBySchool = new Map();
  const plannedClassesBySchool = new Map();
  for (const adjustment of adjustments) {
    if (!adjustmentsBySchool.has(adjustment.schoolId)) adjustmentsBySchool.set(adjustment.schoolId, new Map());
    if (!plannedClassesBySchool.has(adjustment.schoolId)) plannedClassesBySchool.set(adjustment.schoolId, new Map());
    adjustmentsBySchool.get(adjustment.schoolId).set(adjustment.stageCode, Number(adjustment.delta || 0));
    if (adjustment.plannedClasses != null) {
      plannedClassesBySchool.get(adjustment.schoolId).set(adjustment.stageCode, Number(adjustment.plannedClasses || 0));
    }
  }

  const recordsBySchool = new Map();
  for (const record of dataset.records) {
    if (!recordsBySchool.has(record.schoolId)) recordsBySchool.set(record.schoolId, []);
    recordsBySchool.get(record.schoolId).push(record);
  }

  const schoolProjectionInputs = [];
  for (const schoolId of schoolIds) {
    const schoolRecords = recordsBySchool.get(schoolId) || [];
    const profile = buildSchoolOperationalProfile(schoolRecords);
    const offeredStages = stages.filter((stage) => profile.stageCodes.has(stage.code));
    if (!offeredStages.length) continue;

    const schoolSetting = settingsBySchool.get(schoolId) || null;
    const explicitEntryStageCode = findSchoolEntryStageCode(offeredStages, profile.countsByStage, schoolSetting);
    schoolProjectionInputs.push({
      schoolId,
      profile,
      offeredStages,
      entryStageCode: explicitEntryStageCode,
      effectiveSchoolSetting: { ...(schoolSetting || {}), entryStageCode: explicitEntryStageCode },
    });
  }

  const networkTransitionPlan = buildSchoolExternalTransitionPlan({ schoolInputs: schoolProjectionInputs, rulesByStage });
  const projectionBySchool = [];
  for (const input of schoolProjectionInputs) {
    const schoolStageDemand = networkTransitionPlan.externalDemandBySchoolStage.get(input.schoolId) || new Map();
    const shiftDemandByStage = new Map();

    for (const [stageCode, totalDemand] of schoolStageDemand.entries()) {
      shiftDemandByStage.set(stageCode, buildShiftStageDemandAllocations({
        profile: input.profile,
        stageCode,
        totalDemand,
      }));
    }

    const useHistoricalEntryDemand = Boolean(networkTransitionPlan.useHistoricalEntryBySchool.get(input.schoolId));
    const shiftProjections = [];

    for (const shift of input.profile.shiftKeys) {
      const shiftRecords = input.profile.recordsByShift.get(shift) || [];
      const { countsByStage, classCountsByStage, totalClassesAvailable } = buildShiftMaps(
        shiftRecords,
        input.offeredStages.map((stage) => stage.code),
      );
      const externalContinuityByStage = new Map();
      let externalEntryDemand = 0;
      for (const [stageCode, byShift] of shiftDemandByStage.entries()) {
        const value = Number(byShift.get(shift) || 0);
        if (!value) continue;
        if (stageCode === input.entryStageCode) externalEntryDemand += value;
        else externalContinuityByStage.set(stageCode, value);
      }

      shiftProjections.push({
        shift,
        ...buildProjectionForSchool({
          stages: input.offeredStages,
          countsByStage,
          classCountsByStage,
          totalClassesAvailable,
          rulesByStage,
          schoolSetting: input.effectiveSchoolSetting,
          adjustmentsByStage: new Map(),
          plannedClassesByStage: plannedClassesBySchool.get(input.schoolId) || new Map(),
          externalEntryDemand,
          externalContinuityByStage,
          useHistoricalEntryDemand,
        }),
      });
    }

    const schoolProjection = buildAggregatedSchoolProjection({
      schoolId: input.schoolId,
      offeredStages: input.offeredStages,
      shiftProjections,
      entryStageCode: input.entryStageCode,
      adjustmentsByStage: adjustmentsBySchool.get(input.schoolId) || new Map(),
    });

    schoolProjection.summary.entryExternalDemand = Number(schoolStageDemand.get(input.entryStageCode) || 0);
    schoolProjection.summary.entryHistoricalDemand = Number(schoolProjection.summary.entryHistoricalDemand || 0);
    schoolProjection.summary.usesHistoricalEntryDemand = useHistoricalEntryDemand;
    applyNetworkDemandAlertsToProjection(
      schoolProjection,
      Number(networkTransitionPlan.unresolvedBySchool.get(input.schoolId) || 0),
      networkTransitionPlan.unresolvedStagesBySchool.get(input.schoolId) || [],
    );
    projectionBySchool.push(schoolProjection);
  }

  const totals = summarizeProjectionResults(projectionBySchool);
  const run = await prisma.$transaction(async (tx) => {
    const createdRun = await tx.projectionRun.create({
      data: {
        datasetId: dataset.id,
        ruleSetId: ruleSet.id,
        baseYear,
        projectedYear,
        mode: payload.mode || 'OFICIAL',
        status: 'PROCESSANDO',
        notes: payload.notes || null,
        createdById: actor.id,
        summary: {
          totals,
          schoolsCount: projectionBySchool.length,
          adjustmentsCount: adjustments.length,
        },
      },
    });

    const rows = projectionBySchool.flatMap((schoolProjection) =>
      schoolProjection.results.map((result) => ({
        runId: createdRun.id,
        schoolId: schoolProjection.schoolId,
        stageCode: result.stageCode,
        currentStudents: result.currentStudents,
        projectedStudents: result.projectedStudents,
        currentClasses: result.currentClasses,
        projectedClasses: result.projectedClasses,
        capacityLimit: result.capacityLimit,
        occupancyRate: result.occupancyRate,
        adjustmentApplied: result.adjustmentApplied,
        reasonJson: result.reasonJson,
      })),
    );

    if (rows.length) {
      await tx.projectionResult.createMany({ data: rows });
    }

    return tx.projectionRun.update({
      where: { id: createdRun.id },
      data: {
        status: 'CONCLUIDO',
        approvedAt: payload.mode === 'OFICIAL' ? new Date() : null,
        approvedById: payload.mode === 'OFICIAL' ? actor.id : null,
      },
      include: { _count: { select: { results: true } } },
    });
  }, { timeout: 60_000 });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'ProjectionRun',
    entityId: run.id,
    metadata: { baseYear, projectedYear, mode: payload.mode || 'OFICIAL', schoolsCount: projectionBySchool.length, totals },
    ip,
  });

  return {
    id: run.id,
    baseYear: run.baseYear,
    projectedYear: run.projectedYear,
    mode: run.mode,
    status: run.status,
    notes: run.notes,
    createdAt: run.createdAt,
    resultsCount: run._count.results,
    totals,
  };
}

export async function listProjectedSchools(query = {}) {
  const years = defaultYears();
  const baseYear = Number(query.baseYear || years.baseYear);
  const projectedYear = Number(query.projectedYear || baseYear + 1);
  const runs = await listProjectionRuns({ baseYear, projectedYear });
  const selectedRunMeta = chooseRun({
    runId: query.runId,
    officialRuns: runs.filter((run) => run.mode === 'OFICIAL'),
    latestSimulation: runs.find((run) => run.mode === 'SIMULACAO') || null,
    allRuns: runs,
  });

  if (!selectedRunMeta) {
    return { run: null, data: [] };
  }

  const results = await prisma.projectionResult.findMany({
    where: { runId: selectedRunMeta.id },
    include: { school: { select: { id: true, name: true, inep: true, zone: true } } },
    orderBy: [{ school: { name: 'asc' } }, { stageCode: 'asc' }],
  });

  const search = String(query.search || '').trim().toLowerCase();
  const zone = String(query.zone || '').trim().toUpperCase();
  const stageCodeFilter = String(query.stageCode || '').trim().toUpperCase();

  const grouped = new Map();
  for (const result of results) {
    if (stageCodeFilter && result.stageCode !== stageCodeFilter) continue;
    const planning = getSchoolPlanningSummaryFromResult(result);
    if (!grouped.has(result.schoolId)) {
      grouped.set(result.schoolId, {
        schoolId: result.schoolId,
        inep: result.school?.inep || null,
        name: result.school?.name || 'Escola',
        zone: result.school?.zone || null,
        currentStudents: 0,
        projectedStudents: 0,
        currentClasses: Number(planning?.totalAvailableClasses || 0),
        projectedClasses: Number(planning?.totalPlannedClasses || 0),
        undistributedClasses: Number(planning?.undistributedClasses || 0),
        additionalClassesNeeded: Number(planning?.additionalClassesNeeded || 0),
        entryStageCode: planning?.entryStageCode || null,
        entryProjectedStudents: Number(planning?.entryProjectedStudents || 0),
        entryNewVacancies: Number(planning?.entryNewVacancies || 0),
        entryReferenceStudents: 0,
        entryCurrentStudents: 0,
        entryPlannedCapacity: 0,
        continuityStudentsUnserved: Number(planning?.continuityStudentsUnserved || 0),
        continuitySatisfied: planning?.continuitySatisfied ?? true,
        shiftBreakdown: planning?.shiftBreakdown || [],
        fallbackCurrentClasses: 0,
        fallbackProjectedClasses: 0,
        stagesCount: 0,
      });
    }
    const item = grouped.get(result.schoolId);
    item.currentStudents += Number(result.currentStudents || 0);
    item.projectedStudents += Number(result.projectedStudents || 0);
    item.fallbackCurrentClasses += Number(result.currentClasses || 0);
    item.fallbackProjectedClasses += Number(result.projectedClasses || 0);

    if ((!item.entryStageCode || item.entryReferenceStudents === 0) && looksLikeEntryStageResult(result)) {
      const entryMetrics = extractEntryMetricsFromResult(result, planning);
      item.entryStageCode = entryMetrics.entryStageCode;
      item.entryReferenceStudents = entryMetrics.entryReferenceStudents;
      item.entryCurrentStudents = entryMetrics.entryCurrentStudents;
      item.entryProjectedStudents = entryMetrics.entryProjectedStudents;
      item.entryPlannedCapacity = entryMetrics.entryPlannedCapacity;
      if (!item.entryNewVacancies) item.entryNewVacancies = entryMetrics.entryNewVacancies;
    }

    if (item.entryStageCode && result.stageCode === item.entryStageCode) {
      const entryMetrics = extractEntryMetricsFromResult(result, planning);
      item.entryReferenceStudents = entryMetrics.entryReferenceStudents;
      item.entryCurrentStudents = entryMetrics.entryCurrentStudents;
      item.entryProjectedStudents = entryMetrics.entryProjectedStudents;
      item.entryPlannedCapacity = entryMetrics.entryPlannedCapacity;
      item.entryNewVacancies = entryMetrics.entryNewVacancies;
    }

    item.stagesCount++;
  }

  let data = [...grouped.values()].map((item) => {
    const currentClasses = item.currentClasses || item.fallbackCurrentClasses;
    const projectedClasses = item.projectedClasses || item.fallbackProjectedClasses;
    const { fallbackCurrentClasses, fallbackProjectedClasses, ...rest } = item;
    return {
      ...rest,
      currentClasses,
      projectedClasses,
      deltaStudents: item.projectedStudents - item.currentStudents,
      deltaClasses: projectedClasses - currentClasses,
    };
  });

  if (search) {
    data = data.filter((item) => item.name.toLowerCase().includes(search) || String(item.inep || '').includes(search));
  }
  if (zone) data = data.filter((item) => item.zone === zone);

  data.sort((a, b) => b.entryProjectedStudents - a.entryProjectedStudents || b.entryNewVacancies - a.entryNewVacancies || b.projectedStudents - a.projectedStudents || a.name.localeCompare(b.name));

  return {
    run: {
      id: selectedRunMeta.id,
      mode: selectedRunMeta.mode,
      baseYear: selectedRunMeta.baseYear,
      projectedYear: selectedRunMeta.projectedYear,
      createdAt: selectedRunMeta.createdAt,
      notes: selectedRunMeta.notes,
      resultsCount: selectedRunMeta._count.results,
    },
    data,
  };
}

export async function getSchoolProjectionDetail(schoolId, query = {}) {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: { id: true, inep: true, name: true, zone: true, district: true, schoolType: true, responsible: true },
  });
  if (!school) throw notFound('Escola não encontrada');

  const years = defaultYears();
  const baseYear = Number(query.baseYear || years.baseYear);
  const projectedYear = Number(query.projectedYear || baseYear + 1);
  const runs = await listProjectionRuns({ baseYear, projectedYear });
  const selectedRunMeta = chooseRun({
    runId: query.runId,
    officialRuns: runs.filter((run) => run.mode === 'OFICIAL'),
    latestSimulation: runs.find((run) => run.mode === 'SIMULACAO') || null,
    allRuns: runs,
  });
  if (!selectedRunMeta) throw new HttpError(404, 'Nenhuma projeção executada para esta consulta', 'NOT_FOUND');

  const [runResults, run, setting] = await Promise.all([
    prisma.projectionResult.findMany({
      where: { runId: selectedRunMeta.id, schoolId },
      orderBy: { stageCode: 'asc' },
    }),
    prisma.projectionRun.findUnique({ where: { id: selectedRunMeta.id }, include: { dataset: { include: { records: { where: { schoolId } } } } } }),
    prisma.schoolProjectionSetting.findUnique({ where: { schoolId_projectedYear: { schoolId, projectedYear } } }),
  ]);
  if (!run) throw notFound('Execução da projeção não encontrada');

  const stageOrder = new Map((await getStages()).map((stage) => [stage.code, stage.orderIndex]));
  const stageRows = runResults
    .map((row) => ({
      ...row,
      stageLabel: getStageByCode(row.stageCode)?.label || row.stageCode,
      segment: getStageByCode(row.stageCode)?.segment || 'OUTROS',
      reasonJson: row.reasonJson || {},
    }))
    .sort((a, b) => (stageOrder.get(a.stageCode) || 999) - (stageOrder.get(b.stageCode) || 999));

  const planningSummary = stageRows.find((row) => row.reasonJson?.schoolPlanning)?.reasonJson?.schoolPlanning
    || buildFallbackPlanningSummaryFromStageRows(stageRows);
  const operationalProfile = buildSchoolOperationalProfile(run.dataset.records);
  const classMap = new Map();
  for (const record of run.dataset.records) {
    const key = `${record.classStageRaw}|${record.classLabel}|${record.shift}`;
    if (!classMap.has(key)) {
      classMap.set(key, {
        classStageRaw: record.classStageRaw,
        classLabel: record.classLabel,
        shift: record.shift,
        stages: [],
        totalStudents: 0,
      });
    }
    const item = classMap.get(key);
    item.stages.push({
      stageCode: record.stageCode,
      stageLabel: getStageByCode(record.stageCode)?.label || record.stageCode,
      studentsCount: record.studentsCount,
      isMultiStage: record.isMultiStage,
    });
    item.totalStudents += Number(record.studentsCount || 0);
  }

  return {
    school,
    run: {
      id: run.id,
      baseYear: run.baseYear,
      projectedYear: run.projectedYear,
      mode: run.mode,
      status: run.status,
      createdAt: run.createdAt,
      notes: run.notes,
    },
    dataset: {
      id: run.dataset.id,
      referenceYear: run.dataset.referenceYear,
      sourceFileName: run.dataset.sourceFileName,
      approvedAt: run.dataset.approvedAt,
    },
    setting: setting ? {
      entryStageCode: setting.entryStageCode,
      capacityOverrides: setting.capacityOverrides || {},
      notes: setting.notes,
    } : null,
    planningSummary,
    operationalProfile: {
      offeredStageCodes: [...operationalProfile.stageCodes].sort((a, b) => (stageOrder.get(a) || 999) - (stageOrder.get(b) || 999)),
      offeredShifts: [...operationalProfile.shiftKeys].sort(),
    },
    stageRows,
    sourceClasses: [...classMap.values()].sort((a, b) => a.classStageRaw.localeCompare(b.classStageRaw) || a.classLabel.localeCompare(b.classLabel)),
  };
}

export async function buildSchoolsReport(query = {}) {
  const listing = await listProjectedSchools(query);
  if (!listing.run) {
    throw new HttpError(404, 'Nenhuma projeção disponível para exportação', 'NOT_FOUND');
  }
  return {
    title: 'Prospecção de Matrículas — Escolas',
    subtitle: `Base ${listing.run.baseYear} → Projeção ${listing.run.projectedYear} · ${listing.run.mode}`,
    columns: [
      { key: 'inep', label: 'INEP' },
      { key: 'name', label: 'Escola' },
      { key: 'zone', label: 'Zona' },
      { key: 'entryStageCode', label: 'Primeira etapa' },
      { key: 'entryReferenceStudents', label: 'Referência atual', format: 'int' },
      { key: 'entryProjectedStudents', label: 'Demanda prevista 2027', format: 'int' },
      { key: 'entryPlannedCapacity', label: 'Capacidade planejada da entrada', format: 'int' },
      { key: 'entryNewVacancies', label: 'Saldo de vagas 2027', format: 'int' },
      { key: 'continuityStudentsUnserved', label: 'Déficit de continuidade', format: 'int' },
    ],
    rows: listing.data,
  };
}

export async function buildStagesReport(query = {}) {
  const overview = await getOverview(query);
  if (!overview.dataset) {
    throw new HttpError(404, 'Nenhuma base oficial disponível para exportação', 'NOT_FOUND');
  }
  return {
    title: 'Prospecção de Matrículas — Etapas',
    subtitle: `Base ${overview.baseYear} → Projeção ${overview.projectedYear}`,
    columns: [
      { key: 'stageLabel', label: 'Etapa' },
      { key: 'segment', label: 'Segmento' },
      { key: 'currentStudents', label: 'Alunos base', format: 'int' },
      { key: 'projectedStudents', label: 'Alunos projetados', format: 'int' },
      { key: 'currentClasses', label: 'Turmas base', format: 'int' },
      { key: 'projectedClasses', label: 'Turmas projetadas', format: 'int' },
    ],
    rows: overview.stageSummary,
  };
}
