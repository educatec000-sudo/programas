function clampRate(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, number);
}

export function roundByMode(value, mode = 'ARREDONDAR') {
  const safe = Number(value || 0);
  if (mode === 'BAIXO') return Math.floor(safe);
  if (mode === 'CIMA') return Math.ceil(safe);
  return Math.round(safe);
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function sumMapValues(map = new Map()) {
  return [...map.values()].reduce((sum, value) => sum + Number(value || 0), 0);
}

function stageTrackFamily(code = '') {
  return String(code || '').trim().toUpperCase().replace(/_INT$/, '');
}

export function getNetworkPredecessorStageCodes(stageCode) {
  const code = String(stageCode || '').trim().toUpperCase();
  const directMap = {
    BER2: [],
    MAT1: ['BER2'],
    MAT1_INT: ['BER2'],
    MAT2: ['MAT1', 'MAT1_INT'],
    MAT2_INT: ['MAT1', 'MAT1_INT'],
    PER1: ['MAT2', 'MAT2_INT'],
    PER2: ['PER1'],
    EF1: ['PER2'],
    EF1_INT: ['PER2'],
    EF2: ['EF1', 'EF1_INT'],
    EF2_INT: ['EF1', 'EF1_INT'],
    EF3: ['EF2', 'EF2_INT'],
    EF3_INT: ['EF2', 'EF2_INT'],
    EF4: ['EF3', 'EF3_INT'],
    EF4_INT: ['EF3', 'EF3_INT'],
    EF5: ['EF4', 'EF4_INT'],
    EF5_INT: ['EF4', 'EF4_INT'],
    EF6: ['EF5', 'EF5_INT'],
    EF7: ['EF6'],
    EF8: ['EF7'],
    EF9: ['EF8'],
  };
  return directMap[code] ? [...directMap[code]] : [];
}

export function getNetworkSuccessorCandidateStageCodes(stageCode) {
  const code = String(stageCode || '').trim().toUpperCase();
  if (code === 'BER2') return ['MAT1', 'MAT1_INT'];
  if (code === 'MAT1' || code === 'MAT1_INT') return ['MAT2', 'MAT2_INT'];
  if (code === 'MAT2' || code === 'MAT2_INT') return ['PER1'];
  if (code === 'PER1') return ['PER2'];
  if (code === 'PER2') return ['EF1', 'EF1_INT'];
  const family = stageTrackFamily(code);
  const match = family.match(/^EF(\d)$/);
  if (!match) return [];
  const year = Number(match[1]);
  if (year === 1) return ['EF2', 'EF2_INT'];
  if (year === 2) return ['EF3', 'EF3_INT'];
  if (year === 3) return ['EF4', 'EF4_INT'];
  if (year === 4) return ['EF5', 'EF5_INT'];
  if (year === 5) return ['EF6'];
  if (year === 6) return ['EF7'];
  if (year === 7) return ['EF8'];
  if (year === 8) return ['EF9'];
  return [];
}

export function isNetworkRootStage(stageCode) {
  return getNetworkPredecessorStageCodes(stageCode).length === 0;
}

export function findSchoolEntryStageCode(stages = [], countsByStage = new Map(), schoolSetting = null) {
  const explicit = String(schoolSetting?.entryStageCode || '').trim().toUpperCase();
  const availableStageCodes = new Set(stages.map((stage) => stage.code));
  if (explicit && availableStageCodes.has(explicit)) return explicit;

  const ordered = [...stages].sort((a, b) => a.orderIndex - b.orderIndex);
  const firstWithData = ordered.find((stage) => Number(countsByStage.get(stage.code) || 0) > 0 || Number(stage.currentClasses || 0) > 0);
  return firstWithData?.code || ordered[0]?.code || null;
}

function stageModeOf({ stageCode, entryStageCode, continuityDemand, nextOfferedStageCode }) {
  if (stageCode === entryStageCode) return 'ENTRADA';
  if (!nextOfferedStageCode) return continuityDemand > 0 ? 'TRANSICAO_FINAL' : 'TERMINAL';
  return continuityDemand > 0 ? 'CONTINUIDADE' : 'REORGANIZACAO';
}

function computeConfiguredFlow({ currentStudents, nextStageCode, promotionRate, repetitionRate, dropoutRate, roundingMode = 'ARREDONDAR' }) {
  const rawPromotionRate = clampRate(promotionRate, nextStageCode ? 90 : 0);
  const rawRepetitionRate = clampRate(repetitionRate, nextStageCode ? 10 : 0);
  const rawDropoutRate = clampRate(dropoutRate, 0);
  const accountedRate = rawPromotionRate + rawRepetitionRate + rawDropoutRate;

  let unresolvedRate = 0;
  let effectivePromotionRate = rawPromotionRate;
  let graduationRate = 0;

  if (nextStageCode && accountedRate < 100) {
    unresolvedRate = 100 - accountedRate;
    effectivePromotionRate += unresolvedRate;
  } else if (!nextStageCode && accountedRate < 100) {
    graduationRate = 100 - accountedRate;
  }

  const normalizedAccountedRate = effectivePromotionRate + rawRepetitionRate + rawDropoutRate + graduationRate;

  return {
    rawPromotionRate,
    repetitionRate: rawRepetitionRate,
    dropoutRate: rawDropoutRate,
    effectivePromotionRate,
    unresolvedRate,
    graduationRate,
    accountedRate,
    normalizedAccountedRate,
    promotedOut: roundByMode(currentStudents * (effectivePromotionRate / 100), roundingMode),
    repeaters: roundByMode(currentStudents * (rawRepetitionRate / 100), roundingMode),
    dropouts: roundByMode(currentStudents * (rawDropoutRate / 100), roundingMode),
    graduatesOrLeavers: roundByMode(currentStudents * (graduationRate / 100), roundingMode),
  };
}

function buildNextOfferedStageMap(stages = [], rulesByStage = new Map()) {
  const orderedStages = [...stages].sort((a, b) => a.orderIndex - b.orderIndex);
  const offeredCodes = new Set(orderedStages.map((stage) => stage.code));
  const nextMap = new Map();

  for (const stage of orderedStages) {
    const directNextCode = rulesByStage.get(stage.code)?.nextStageCode ?? stage.nextStageCode ?? null;
    const candidateCodes = [
      directNextCode,
      ...getNetworkSuccessorCandidateStageCodes(stage.code),
    ].filter(Boolean);
    const preferredCandidate = candidateCodes.find((candidate) => offeredCodes.has(candidate));
    if (preferredCandidate) {
      nextMap.set(stage.code, preferredCandidate);
      continue;
    }

    let nextCode = directNextCode;
    const visited = new Set();
    while (nextCode && !offeredCodes.has(nextCode) && !visited.has(nextCode)) {
      visited.add(nextCode);
      const nestedCandidates = getNetworkSuccessorCandidateStageCodes(nextCode);
      const nestedPreferred = nestedCandidates.find((candidate) => offeredCodes.has(candidate));
      if (nestedPreferred) {
        nextCode = nestedPreferred;
        break;
      }
      nextCode = rulesByStage.get(nextCode)?.nextStageCode ?? null;
    }
    nextMap.set(stage.code, offeredCodes.has(nextCode) ? nextCode : null);
  }

  return nextMap;
}


export function buildOfferedSuccessorMap(stages = [], rulesByStage = new Map()) {
  const orderedStages = [...stages].sort((a, b) => a.orderIndex - b.orderIndex);
  const offeredCodes = new Set(orderedStages.map((stage) => stage.code));
  const map = new Map();

  for (const stage of orderedStages) {
    const directNextCode = rulesByStage.get(stage.code)?.nextStageCode ?? stage.nextStageCode ?? null;
    const candidates = [...new Set([
      directNextCode,
      ...getNetworkSuccessorCandidateStageCodes(stage.code),
    ].filter((code) => code && offeredCodes.has(code)))];

    if (candidates.length) {
      map.set(stage.code, candidates);
      continue;
    }

    let fallback = directNextCode;
    const visited = new Set();
    while (fallback && !offeredCodes.has(fallback) && !visited.has(fallback)) {
      visited.add(fallback);
      const nestedCandidates = getNetworkSuccessorCandidateStageCodes(fallback);
      const nestedPreferred = nestedCandidates.find((candidate) => offeredCodes.has(candidate));
      if (nestedPreferred) {
        fallback = nestedPreferred;
        break;
      }
      fallback = rulesByStage.get(fallback)?.nextStageCode ?? null;
    }

    map.set(stage.code, fallback && offeredCodes.has(fallback) ? [fallback] : []);
  }

  return map;
}

function buildStageReferenceCapacityMap(stages = [], countsByStage = new Map(), classCountsByStage = new Map(), rulesByStage = new Map(), schoolSetting = null) {
  const map = new Map();
  for (const stage of stages) {
    const currentStudents = Number(countsByStage.get(stage.code) || 0);
    const currentClasses = Number(classCountsByStage.get(stage.code) || 0);
    const capacityBase = schoolSetting?.capacityOverrides?.[stage.code] ?? rulesByStage.get(stage.code)?.capacityLimit ?? stage.defaultCapacity ?? null;
    const nominalCapacity = capacityBase == null || capacityBase === '' || currentClasses <= 0
      ? 0
      : Number(capacityBase) * currentClasses;
    map.set(stage.code, Math.max(currentStudents, nominalCapacity, currentClasses > 0 ? currentClasses : 0));
  }
  return map;
}


function stageVariantInfo(stageCode = '') {
  const code = String(stageCode || '').trim().toUpperCase();
  return {
    code,
    family: stageTrackFamily(code),
    integral: code.endsWith('_INT'),
  };
}

export function rebalanceSiblingStageProjectedStudents(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const info = stageVariantInfo(row?.stageCode);
    if (!info.family) continue;
    if (!groups.has(info.family)) groups.set(info.family, []);
    groups.get(info.family).push({ row, info });
  }

  for (const entries of groups.values()) {
    if (entries.length < 2) continue;

    const totalProjectedStudents = entries.reduce((sum, entry) => sum + Number(entry.row?.projectedStudents || 0), 0);
    if (!totalProjectedStudents) continue;

    const weightTotal = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.row?.currentClasses || 0)), 0);
    const normalizedEntries = entries.map((entry) => ({
      ...entry,
      weight: weightTotal > 0
        ? Math.max(0, Number(entry.row?.currentClasses || 0))
        : Math.max(1, Number(entry.row?.currentStudents || 0), Number(entry.row?.projectedClasses || 0)),
    }));
    const effectiveWeightTotal = normalizedEntries.reduce((sum, entry) => sum + Number(entry.weight || 0), 0) || normalizedEntries.length;

    const provisional = normalizedEntries.map((entry) => {
      const exact = totalProjectedStudents * ((Number(entry.weight || 0) || 1) / effectiveWeightTotal);
      const whole = Math.floor(exact);
      return { ...entry, exact, whole, remainder: exact - whole, before: Number(entry.row?.projectedStudents || 0) };
    });

    let assigned = provisional.reduce((sum, entry) => sum + entry.whole, 0);
    provisional.sort((a, b) => b.remainder - a.remainder || Number(a.info.integral) - Number(b.info.integral) || String(a.row.stageCode).localeCompare(String(b.row.stageCode), 'pt-BR'));
    for (let index = 0; assigned < totalProjectedStudents && index < provisional.length; index += 1, assigned += 1) {
      provisional[index].whole += 1;
    }

    for (const entry of provisional) {
      const after = entry.whole;
      entry.row.projectedStudents = after;
      entry.row.reasonJson = {
        ...(entry.row.reasonJson || {}),
        siblingRedistributedIn: Math.max(0, after - entry.before),
        siblingRedistributedOut: Math.max(0, entry.before - after),
        siblingRedistributionBasis: weightTotal > 0 ? 'CURRENT_CLASSES' : 'CURRENT_STUDENTS',
      };
    }
  }

  return rows;
}

export function buildProjectionForSchool({
  stages = [],
  countsByStage = new Map(),
  classCountsByStage = new Map(),
  totalClassesAvailable = null,
  rulesByStage = new Map(),
  schoolSetting = null,
  adjustmentsByStage = new Map(),
  externalEntryDemand = 0,
  externalContinuityByStage = new Map(),
  useHistoricalEntryDemand = false,
}) {
  const orderedStages = [...stages].sort((a, b) => a.orderIndex - b.orderIndex);
  const entryStageCode = findSchoolEntryStageCode(orderedStages, countsByStage, schoolSetting);
  const nextOfferedStageMap = buildNextOfferedStageMap(orderedStages, rulesByStage);
  const offeredSuccessorMap = buildOfferedSuccessorMap(orderedStages, rulesByStage);
  const continuityStudentsByStage = new Map();
  const referenceCapacityByStage = buildStageReferenceCapacityMap(orderedStages, countsByStage, classCountsByStage, rulesByStage, schoolSetting);
  const remainingReferenceByStage = new Map(referenceCapacityByStage);

  for (const stage of orderedStages) {
    continuityStudentsByStage.set(stage.code, Number(externalContinuityByStage.get(stage.code) || 0));
  }

  for (const stage of orderedStages) {
    const currentStudents = Number(countsByStage.get(stage.code) || 0);
    const nextOfferedStageCode = nextOfferedStageMap.get(stage.code) || null;
    const offeredSuccessors = offeredSuccessorMap.get(stage.code) || [];

    if (offeredSuccessors.length) {
      let remainingStudents = currentStudents;
      const preferredTargetCode = offeredSuccessors.includes(nextOfferedStageCode) ? nextOfferedStageCode : offeredSuccessors[0];
      const candidateOrder = [
        preferredTargetCode,
        ...offeredSuccessors.filter((code) => code !== preferredTargetCode)
          .sort((a, b) => ((orderedStages.find((stageRow) => stageRow.code === a)?.orderIndex || 999) - (orderedStages.find((stageRow) => stageRow.code === b)?.orderIndex || 999))),
      ].filter(Boolean);

      for (const targetCode of candidateOrder) {
        if (!remainingStudents) break;
        const remainingReference = Math.max(0, Number(remainingReferenceByStage.get(targetCode) || 0));
        if (!remainingReference) continue;
        const allocated = Math.min(remainingStudents, remainingReference);
        continuityStudentsByStage.set(
          targetCode,
          Number(continuityStudentsByStage.get(targetCode) || 0) + allocated,
        );
        remainingReferenceByStage.set(targetCode, remainingReference - allocated);
        remainingStudents -= allocated;
      }

      if (remainingStudents > 0 && preferredTargetCode) {
        continuityStudentsByStage.set(
          preferredTargetCode,
          Number(continuityStudentsByStage.get(preferredTargetCode) || 0) + remainingStudents,
        );
      }
    }
  }

  const results = orderedStages.map((stage) => {
    const rule = rulesByStage.get(stage.code) || {};
    const currentStudents = Number(countsByStage.get(stage.code) || 0);
    const currentClasses = Number(classCountsByStage.get(stage.code) || 0);
    const roundingMode = rule.roundingMode || 'ARREDONDAR';
    const adjustmentApplied = Number(adjustmentsByStage.get(stage.code) || 0);
    const nextOfferedStageCode = nextOfferedStageMap.get(stage.code) || null;
    const configuredFlow = computeConfiguredFlow({
      currentStudents,
      nextStageCode: nextOfferedStageCode,
      promotionRate: rule.promotionRate,
      repetitionRate: rule.repetitionRate,
      dropoutRate: rule.dropoutRate,
      roundingMode,
    });

    const continuityDemand = Number(continuityStudentsByStage.get(stage.code) || 0);
    const projectedClasses = currentClasses;
    const capacityBase = schoolSetting?.capacityOverrides?.[stage.code] ?? rule.capacityLimit ?? stage.defaultCapacity ?? null;
    const capacityLimit = capacityBase == null || capacityBase === '' ? null : Number(capacityBase);
    const entryReferenceStudents = stage.code === entryStageCode ? currentStudents : 0;
    const historicalEntryDemand = stage.code === entryStageCode && useHistoricalEntryDemand ? currentStudents : 0;
    const baselineEntryDemand = stage.code === entryStageCode
      ? (Number(externalEntryDemand || 0) + Number(historicalEntryDemand || 0))
      : 0;
    const entryProjectedStudents = stage.code === entryStageCode
      ? Math.max(0, baselineEntryDemand + adjustmentApplied)
      : 0;
    const projectedStudents = stage.code === entryStageCode
      ? entryProjectedStudents
      : Math.max(0, continuityDemand + adjustmentApplied);
    const plannedCapacity = stage.code === entryStageCode && capacityLimit && projectedClasses > 0
      ? projectedClasses * capacityLimit
      : null;
    const availableVacancies = stage.code === entryStageCode && plannedCapacity != null
      ? Math.max(0, plannedCapacity - projectedStudents)
      : null;
    const capacityConfigMissing = stage.code === entryStageCode && projectedClasses > 0 && !capacityLimit;
    const occupancyRate = stage.code === entryStageCode && plannedCapacity && plannedCapacity > 0
      ? round1((projectedStudents / plannedCapacity) * 100)
      : null;
    const baseAverageStudentsPerClass = currentClasses > 0 ? round1(currentStudents / currentClasses) : null;
    const stageMode = stageModeOf({
      stageCode: stage.code,
      entryStageCode,
      continuityDemand,
      nextOfferedStageCode,
    });
    const isRelevant = (
      currentStudents > 0 ||
      currentClasses > 0 ||
      continuityDemand > 0 ||
      projectedClasses > 0 ||
      stage.code === entryStageCode ||
      adjustmentApplied !== 0
    );

    return {
      stageCode: stage.code,
      stageLabel: stage.label,
      segment: stage.segment,
      entryStageCode,
      currentStudents,
      projectedStudents,
      currentClasses,
      projectedClasses,
      minRequiredClasses: null,
      plannedCapacity,
      availableVacancies,
      studentsOverflow: null,
      capacityLimit,
      occupancyRate,
      adjustmentApplied,
      stageMode,
      isRelevant,
      reasonJson: {
        planningPolicy: 'TURMAS_FIXAS_POR_ESCOLA',
        continuityApprovalPolicy: '100_PERCENT_PERCURSO_REAL',
        capacityPolicy: stage.code === entryStageCode ? 'LIMITE_MAXIMO_APENAS_NA_ENTRADA' : 'PERCURSO_REAL_SEM_TETO',
        continuityDemand,
        entryDemand: stage.code === entryStageCode ? projectedStudents : 0,
        externalEntryDemand: stage.code === entryStageCode ? Number(externalEntryDemand || 0) : 0,
        historicalEntryDemand: stage.code === entryStageCode ? Number(historicalEntryDemand || 0) : 0,
        entryReferenceStudents,
        baseAverageStudentsPerClass,
        minRequiredClasses: null,
        plannedClasses: projectedClasses,
        plannedCapacity,
        availableVacancies,
        studentsOverflow: null,
        capacityConfigMissing,
        roundingMode,
        nextStageCode: nextOfferedStageCode,
        rawPromotionRate: configuredFlow.rawPromotionRate,
        effectivePromotionRate: configuredFlow.effectivePromotionRate,
        repetitionRate: configuredFlow.repetitionRate,
        dropoutRate: configuredFlow.dropoutRate,
        unresolvedRate: configuredFlow.unresolvedRate,
        graduationRate: configuredFlow.graduationRate,
        accountedRate: configuredFlow.accountedRate,
        normalizedAccountedRate: configuredFlow.normalizedAccountedRate,
        configuredPromotedOut: configuredFlow.promotedOut,
        configuredRepeaters: configuredFlow.repeaters,
        configuredDropouts: configuredFlow.dropouts,
        configuredGraduatesOrLeavers: configuredFlow.graduatesOrLeavers,
        stageMode,
      },
    };
  });

  const relevantResults = results.filter((row) => row.isRelevant);
  const computedTotalAvailableClasses = totalClassesAvailable == null
    ? sumMapValues(classCountsByStage)
    : Number(totalClassesAvailable || 0);
  const totalPlannedClasses = relevantResults.reduce((sum, row) => sum + Number(row.projectedClasses || 0), 0);
  const entryRow = relevantResults.find((row) => row.stageCode === entryStageCode) || null;
  const entryCapacityLimitMissing = Boolean(entryRow?.reasonJson?.capacityConfigMissing);
  const entryNewVacancies = entryCapacityLimitMissing ? null : Number(entryRow?.availableVacancies ?? 0);
  const summary = {
    planningPolicy: 'TURMAS_FIXAS_POR_ESCOLA',
    continuityApprovalPolicy: '100_PERCENT_PERCURSO_REAL',
    fixedTotalClassesRule: true,
    entryStageCode,
    totalAvailableClasses: computedTotalAvailableClasses,
    totalPlannedClasses,
    classesDistributed: totalPlannedClasses,
    undistributedClasses: Math.max(0, computedTotalAvailableClasses - totalPlannedClasses),
    additionalClassesNeeded: 0,
    continuityStudentsUnserved: 0,
    continuitySatisfied: true,
    continuityMinimumClasses: null,
    entryPlannedClasses: Number(entryRow?.projectedClasses || 0),
    entryPlannedCapacity: entryRow?.plannedCapacity ?? null,
    entryReferenceStudents: Number(entryRow?.reasonJson?.entryReferenceStudents || 0),
    entryHistoricalDemand: Number(entryRow?.reasonJson?.historicalEntryDemand || 0),
    entryExternalDemand: Number(entryRow?.reasonJson?.externalEntryDemand || 0),
    entryReferenceDeficit: 0,
    entryNewVacancies,
    entryCapacityLimitMissing,
    incompatibilityAlert: entryCapacityLimitMissing,
    respectsOfferedStages: true,
    respectsShiftConstraint: true,
    limitAppliedOnlyToEntryStage: true,
    offeredStageCodes: orderedStages.map((stage) => stage.code),
    alternatives: [],
  };

  for (const row of relevantResults) {
    row.reasonJson.schoolPlanning = summary;
  }

  return {
    entryStageCode,
    summary,
    results: relevantResults,
    totals: {
      currentStudents: relevantResults.reduce((sum, row) => sum + Number(row.currentStudents || 0), 0),
      projectedStudents: relevantResults.reduce((sum, row) => sum + Number(row.projectedStudents || 0), 0),
      currentClasses: computedTotalAvailableClasses,
      projectedClasses: totalPlannedClasses,
      undistributedClasses: Math.max(0, computedTotalAvailableClasses - totalPlannedClasses),
      additionalClassesNeeded: 0,
      entryNewVacancies,
      continuityStudentsUnserved: 0,
      entryReferenceDeficit: 0,
    },
  };
}

export function summarizeProjectionResults(schoolResults = []) {
  const totals = schoolResults.reduce((acc, school) => {
    acc.currentStudents += Number(school.totals.currentStudents || 0);
    acc.projectedStudents += Number(school.totals.projectedStudents || 0);
    acc.currentClasses += Number(school.totals.currentClasses || 0);
    acc.projectedClasses += Number(school.totals.projectedClasses || 0);
    acc.undistributedClasses += Number(school.totals.undistributedClasses || 0);
    acc.additionalClassesNeeded += Number(school.totals.additionalClassesNeeded || 0);
    acc.entryProjectedStudents += Number(school.totals.entryProjectedStudents || 0);
    acc.entryNewVacancies += Number(school.totals.entryNewVacancies || 0);
    acc.continuityStudentsUnserved += Number(school.totals.continuityStudentsUnserved || 0);
    acc.entryReferenceDeficit += Number(school.totals.entryReferenceDeficit || 0);
    return acc;
  }, {
    currentStudents: 0,
    projectedStudents: 0,
    currentClasses: 0,
    projectedClasses: 0,
    undistributedClasses: 0,
    additionalClassesNeeded: 0,
    entryProjectedStudents: 0,
    entryNewVacancies: 0,
    continuityStudentsUnserved: 0,
    entryReferenceDeficit: 0,
  });

  return {
    ...totals,
    deltaStudents: totals.projectedStudents - totals.currentStudents,
    deltaClasses: totals.projectedClasses - totals.currentClasses,
  };
}
