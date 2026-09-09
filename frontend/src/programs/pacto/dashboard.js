const DASHBOARD_ASSESSMENTS = ['A0', 'A1', 'A2', 'A3'];
const ASSESSMENT_ORDER = { A0: 0, A1: 1, A2: 2, A3: 3 };

export function formatGradeLabel(grade) {
  const g = Number(grade);
  if (g === 0) return 'PII';
  if (g === 1) return '1º ano';
  if (g === 2) return '2º ano';
  return `${grade}º ano`;
}

export function dashboardPercentage(value, total) {
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.round((Number(value) / total) * 100);
}

function matches(value, selected) {
  return !selected || String(value) === String(selected);
}

export function definitionForComponent(assessment, componentCode) {
  const def = assessment?.definition || assessment?.pactoClass?.school?.definition || assessment?.pactoClass?.definition;
  return def?.components?.find((item) => (item.code || item.id) === componentCode) || null;
}

export function getPerformanceClassification(score) {
  if (score == null || !Number.isFinite(score)) {
    return { label: 'Sem dados', cls: 'badge-gray', color: '#64748b', bg: '#f1f5f9', tone: 'gray' };
  }
  if (score >= 80) {
    return { label: 'Excelente', cls: 'badge-green', color: '#16a34a', bg: '#dcfce7', tone: 'green' };
  }
  if (score >= 60) {
    return { label: 'Bom desempenho', cls: 'badge-green', color: '#15803d', bg: '#ecfdf5', tone: 'green' };
  }
  if (score >= 40) {
    return { label: 'Atenção', cls: 'badge-yellow', color: '#b45309', bg: '#fef3c7', tone: 'yellow' };
  }
  return { label: 'Crítico', cls: 'badge-red', color: '#dc2626', bg: '#fee2e2', tone: 'red' };
}

export function getSkillStatus(levels = [], evaluated = 0) {
  if (!evaluated || evaluated <= 0 || !levels.length) {
    return { label: 'Sem dados', cls: 'badge-gray', tone: 'gray' };
  }
  const redLevel = levels.find((l) => l.color === 'red');
  const yellowLevel = levels.find((l) => l.color === 'yellow');
  const greenLevel = levels.find((l) => l.color === 'green');

  const redPct = redLevel?.percentage ?? 0;
  const yellowPct = yellowLevel?.percentage ?? 0;
  const greenPct = greenLevel?.percentage ?? 0;

  if (redPct > 50) {
    return { label: 'Necessita intervenção', cls: 'badge-red', tone: 'red' };
  }
  if (redPct >= 30) {
    return { label: 'Atenção', cls: 'badge-yellow', tone: 'yellow' };
  }
  if (greenPct >= 50 || (greenPct + yellowPct) >= 75) {
    return { label: 'Bom desempenho', cls: 'badge-green', tone: 'green' };
  }
  return { label: 'Regular', cls: 'badge-blue', tone: 'blue' };
}

export function getPositionBadge(position) {
  if (position === 1) return '🥇 1º';
  if (position === 2) return '🥈 2º';
  if (position === 3) return '🥉 3º';
  if (position > 3) return `${position}º`;
  return '—';
}

function addResults(groupMap, assessment, component) {
  const definition = definitionForComponent(assessment, component.component);
  if (!definition) return;
  const values = new Map();
  if (Array.isArray(component.results)) {
    component.results.forEach((item) => {
      values.set(`${item.skill}:${item.level}`, item.count);
    });
  } else if (component.results && typeof component.results === 'object') {
    Object.entries(component.results).forEach(([skillKey, lvlObj]) => {
      if (lvlObj && typeof lvlObj === 'object') {
        Object.entries(lvlObj).forEach(([lvlKey, countVal]) => {
          values.set(`${skillKey}:${lvlKey}`, Number(countVal) || 0);
        });
      }
    });
  }

  for (const skill of definition.skills || []) {
    const skillCode = skill.code || skill.id;
    const skillValues = (skill.levels || []).map((level) => {
      const lvlCode = level.code || level.id;
      return values.get(`${skillCode}:${lvlCode}`);
    });
    if (skillValues.every((value) => value === undefined)) continue;

    const key = `${component.component}:${skillCode}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        component: component.component,
        componentLabel: definition.label || definition.name || component.component,
        skill: skillCode,
        skillLabel: skill.label || skill.name || skillCode,
        evaluated: 0,
        levels: (skill.levels || []).map((level) => ({
          code: level.code || level.id,
          label: level.label || level.name || level.code,
          color: level.color,
          count: 0,
          hasData: false,
          percentage: null,
        })),
      });
    }
    const group = groupMap.get(key);
    group.evaluated += (component.evaluated || 0);
    group.levels.forEach((level, index) => {
      if (skillValues[index] !== undefined) {
        level.count += skillValues[index];
        level.hasData = true;
      }
    });
  }
}

function finalizeResults(groupMap) {
  return [...groupMap.values()]
    .map((group) => {
      const finalizedLevels = group.levels.map(({ hasData, ...level }) => ({
        ...level,
        count: hasData ? level.count : null,
        percentage: hasData ? dashboardPercentage(level.count, group.evaluated) : null,
      }));

      // Calculate weighted score for the skill
      let greenCount = 0;
      let yellowCount = 0;
      let redCount = 0;
      finalizedLevels.forEach((l) => {
        if (l.count != null) {
          if (l.color === 'green') greenCount += l.count;
          else if (l.color === 'yellow') yellowCount += l.count;
          else if (l.color === 'red') redCount += l.count;
        }
      });
      const totalResponses = greenCount + yellowCount + redCount;
      const score = totalResponses > 0
        ? Math.round(((greenCount * 1.0 + yellowCount * 0.5) / totalResponses) * 100)
        : null;

      const status = getSkillStatus(finalizedLevels, group.evaluated);

      return {
        ...group,
        levels: finalizedLevels,
        score,
        status,
      };
    })
    .sort((a, b) => (a.componentLabel || '').localeCompare(b.componentLabel || '') || (a.skillLabel || '').localeCompare(b.skillLabel || ''));
}

function resultsSummary(groups) {
  if (!groups.length) return '—';
  return groups.map((group) => (
    `${group.skillLabel}: ${group.levels.map((level) => (
      level.count == null
        ? `${level.label} sem dado`
        : `${level.label} ${level.count}${level.percentage == null ? '' : ` (${level.percentage}%)`}`
    )).join(' · ')}`
  )).join(' | ');
}

export function buildPactoDashboard(overview, filters = {}) {
  const schools = overview?.schools || [];
  const schoolById = new Map(schools.map((school) => [school.id, school]));
  const classRows = schools.flatMap((school) => (
    (school.classes || []).map((pactoClass) => ({
      ...pactoClass,
      schoolId: pactoClass.schoolId || school.id,
      school,
    }))
  ));

  // Filter classes structurally (school, grade, shift, class)
  const structurallyFilteredClasses = classRows.filter((item) => (
    matches(item.schoolId, filters.schoolId)
    && matches(item.grade, filters.grade)
    && matches(item.shift, filters.shift)
    && matches(item.id, filters.classId)
  ));

  // Determine expected assessment codes per class based on grade stage (PII vs 1º/2º ano)
  const expectedCodesByClass = new Map();
  for (const item of structurallyFilteredClasses) {
    const isPii = Number(item.grade) === 0;
    const defaultAssessments = isPii ? ['A1', 'A2'] : DASHBOARD_ASSESSMENTS;
    const availableCodes = item.enabledAssessments && item.enabledAssessments.length > 0
      ? item.enabledAssessments
      : defaultAssessments;
    const codes = availableCodes
      .filter((code) => (isPii ? ['A1', 'A2'].includes(code) : DASHBOARD_ASSESSMENTS.includes(code)))
      .filter((code) => matches(code, filters.assessment));
    expectedCodesByClass.set(item.id, new Set(codes));
  }

  // Filter classes that have expected assessments in this scope
  const filteredClasses = structurallyFilteredClasses.filter((item) => {
    const expected = expectedCodesByClass.get(item.id);
    return expected && expected.size > 0;
  });

  // Normalize all assessment rows
  const allAssessmentRows = filteredClasses.flatMap((item) => (
    (item.assessments || [])
      .map((assessment) => ({
        ...assessment,
        code: assessment.code || assessment.assessment,
      }))
      .filter((assessment) => DASHBOARD_ASSESSMENTS.includes(assessment.code))
      .filter((assessment) => expectedCodesByClass.get(item.id)?.has(assessment.code))
      .map((assessment) => ({
        ...assessment,
        pactoClass: item,
        school: item.school,
        definition: assessment.definition || item.definition || item.school?.definition || overview?.program?.definition || null,
        components: (assessment.components || assessment.results || []).map((comp) => ({
          ...comp,
          component: comp.component || comp.code || comp.id,
          enrolled: comp.enrolled ?? comp.studentsEnrolled ?? 0,
          evaluated: comp.evaluated ?? comp.studentsEvaluated ?? 0,
          results: comp.results ?? comp.resultGroups ?? [],
        })),
      }))
  ));

  // Filter assessment rows with component if component filter is active
  const assessmentRowsWithComponent = filters.component
    ? allAssessmentRows.filter((assessment) => (assessment.components || []).some((item) => item.component === filters.component))
    : allAssessmentRows;

  // Global progress counts
  const expectedAssessments = [...expectedCodesByClass.values()].reduce((sum, codes) => sum + codes.size, 0);
  const classesWithData = new Set(assessmentRowsWithComponent.map((item) => item.pactoClass.id));
  const completedAssessments = assessmentRowsWithComponent.filter((item) => item.status === 'ENVIADO').length;
  const draftAssessments = assessmentRowsWithComponent.filter((item) => item.status === 'RASCUNHO' || item.status === 'REABERTO').length;
  const pendingAssessments = Math.max(0, expectedAssessments - completedAssessments);

  // Group assessments by class to determine the latest available assessment per class
  const assessmentsByClass = new Map();
  for (const a of allAssessmentRows) {
    const classId = a.pactoClass.id;
    if (!assessmentsByClass.has(classId)) assessmentsByClass.set(classId, []);
    assessmentsByClass.get(classId).push(a);
  }

  // Calculate latest assessment per class (or filtered assessment)
  // RULE: For student counting and current performance, use the latest available assessment per class!
  const classLatestAssessmentMap = new Map();
  for (const c of filteredClasses) {
    const classAssessments = assessmentsByClass.get(c.id) || [];
    // An assessment has data if it has status ENVIADO, or components with enrolled/evaluated/results > 0
    const availableWithData = classAssessments.filter((a) => (
      a.status === 'ENVIADO'
      || a.status === 'RASCUNHO'
      || a.status === 'REABERTO'
      || (a.components && a.components.some((comp) => (comp.evaluated || 0) > 0 || (comp.results && comp.results.length > 0)))
    ));

    if (filters.assessment) {
      const match = availableWithData.find((a) => a.code === filters.assessment)
        || classAssessments.find((a) => a.code === filters.assessment);
      classLatestAssessmentMap.set(c.id, match || null);
    } else {
      // Sort by chronological order descending (A3 > A2 > A1 > A0)
      const sorted = [...availableWithData].sort((a, b) => (
        (ASSESSMENT_ORDER[b.code] ?? 0) - (ASSESSMENT_ORDER[a.code] ?? 0)
      ));
      classLatestAssessmentMap.set(c.id, sorted[0] || null);
    }
  }

  // Calculate class-level metrics (deduplicating subject components in the same assessment)
  const classMetricsMap = new Map();
  for (const c of filteredClasses) {
    const latestA = classLatestAssessmentMap.get(c.id);
    if (!latestA) {
      classMetricsMap.set(c.id, { enrolled: 0, evaluated: 0, latestCode: null, assessment: null, components: [] });
      continue;
    }

    const comps = (latestA.components || []).filter((comp) => matches(comp.component, filters.component));
    if (comps.length === 0) {
      classMetricsMap.set(c.id, { enrolled: 0, evaluated: 0, latestCode: latestA.code, assessment: latestA, components: [] });
      continue;
    }

    // If specific component filter is selected, take that component
    // If all components are selected, students in Português and Matemática are the same students -> take max enrolled & max evaluated
    let classEnrolled = 0;
    let classEvaluated = 0;
    if (filters.component) {
      classEnrolled = comps[0].enrolled || 0;
      classEvaluated = comps[0].evaluated || 0;
    } else {
      classEnrolled = Math.max(...comps.map((comp) => comp.enrolled || 0), 0);
      classEvaluated = Math.max(...comps.map((comp) => comp.evaluated || 0), 0);
    }

    classMetricsMap.set(c.id, {
      enrolled: classEnrolled,
      evaluated: classEvaluated,
      latestCode: latestA.code,
      assessment: latestA,
      components: comps,
    });
  }

  const hasClassFilter = Boolean(filters.grade || filters.shift || filters.classId || filters.assessment);
  const participatingSchoolIds = hasClassFilter
    ? new Set(filteredClasses.map((item) => item.schoolId))
    : new Set(schools.filter((school) => matches(school.id, filters.schoolId)).map((school) => school.id));

  // Build aggregate per participating school
  const schoolAggregates = new Map();
  for (const schoolId of participatingSchoolIds) {
    const school = schoolById.get(schoolId);
    if (!school) continue;
    const schoolClasses = filteredClasses.filter((c) => c.schoolId === school.id);

    // Calculate expected assessment codes across this school's classes in scope
    const schoolExpectedSet = new Set();
    let schoolExpectedUnits = 0;
    for (const c of schoolClasses) {
      const isPii = Number(c.grade) === 0;
      const defaultAssessments = isPii ? ['A1', 'A2'] : DASHBOARD_ASSESSMENTS;
      const classCodes = (c.enabledAssessments && c.enabledAssessments.length > 0 ? c.enabledAssessments : defaultAssessments)
        .filter((code) => (isPii ? ['A1', 'A2'].includes(code) : DASHBOARD_ASSESSMENTS.includes(code)))
        .filter((code) => matches(code, filters.assessment));
      classCodes.forEach((code) => schoolExpectedSet.add(code));
      schoolExpectedUnits += classCodes.length;
    }

    schoolAggregates.set(school.id, {
      schoolId: school.id,
      school: school.name,
      inep: school.inep,
      enrolled: 0,
      evaluated: 0,
      classesCount: schoolClasses.length,
      expectedAssessmentsCount: schoolExpectedUnits,
      expectedAssessmentCodes: Array.from(schoolExpectedSet).sort(),
      completedAssessmentCodes: new Set(),
      completedAssessments: 0,
      draftAssessments: 0,
      resultGroups: new Map(),
      componentMap: new Map(),
      classes: schoolClasses,
    });
  }

  // Mark completed and draft assessments for each school
  for (const assessment of assessmentRowsWithComponent) {
    const { school } = assessment;
    const aggregate = schoolAggregates.get(school.id);
    if (!aggregate) continue;
    if (assessment.status === 'ENVIADO' || (assessment.components && assessment.components.length > 0 && assessment.components.some((c) => (c.evaluated || 0) > 0))) {
      aggregate.completedAssessmentCodes.add(assessment.code);
    }
    if (assessment.status === 'ENVIADO') aggregate.completedAssessments += 1;
    else aggregate.draftAssessments += 1;
  }

  // Calculate enrolled, evaluated and skill results for each school based on the latest assessment per class
  for (const c of filteredClasses) {
    const aggregate = schoolAggregates.get(c.schoolId);
    if (!aggregate) continue;
    const cMetrics = classMetricsMap.get(c.id);
    if (!cMetrics) continue;

    aggregate.enrolled += cMetrics.enrolled;
    aggregate.evaluated += cMetrics.evaluated;

    if (cMetrics.assessment && cMetrics.components) {
      for (const comp of cMetrics.components) {
        addResults(aggregate.resultGroups, cMetrics.assessment, comp);

        if (!aggregate.componentMap.has(comp.component)) {
          aggregate.componentMap.set(comp.component, {
            code: comp.component,
            label: definitionForComponent(cMetrics.assessment, comp.component)?.label || comp.component,
            enrolled: 0,
            evaluated: 0,
            resultGroups: new Map(),
          });
        }
        const compGroup = aggregate.componentMap.get(comp.component);
        compGroup.enrolled += (comp.enrolled || 0);
        compGroup.evaluated += (comp.evaluated || 0);
        addResults(compGroup.resultGroups, cMetrics.assessment, comp);
      }
    }
  }

  // Municipality-wide charts from classes' latest assessments
  const chartGroups = new Map();
  for (const c of filteredClasses) {
    const cMetrics = classMetricsMap.get(c.id);
    if (cMetrics && cMetrics.assessment && cMetrics.components) {
      for (const comp of cMetrics.components) {
        addResults(chartGroups, cMetrics.assessment, comp);
      }
    }
  }
  const charts = finalizeResults(chartGroups);

  // Process and finalize school statistics and rankings
  const processedSchools = [...schoolAggregates.values()].map((item) => {
    const finalizedGroups = finalizeResults(item.resultGroups);
    let greenCount = 0;
    let yellowCount = 0;
    let redCount = 0;

    finalizedGroups.forEach((group) => {
      group.levels.forEach((lvl) => {
        if (lvl.count != null) {
          if (lvl.color === 'green') greenCount += lvl.count;
          else if (lvl.color === 'yellow') yellowCount += lvl.count;
          else if (lvl.color === 'red') redCount += lvl.count;
        }
      });
    });

    const totalResponses = greenCount + yellowCount + redCount;
    const score = totalResponses > 0
      ? Math.round(((greenCount * 1.0 + yellowCount * 0.5) / totalResponses) * 100)
      : null;

    const proficientRate = totalResponses > 0
      ? Math.round((greenCount / totalResponses) * 100)
      : null;

    const interventionRate = totalResponses > 0
      ? Math.round((redCount / totalResponses) * 100)
      : null;

    const participationPercentage = dashboardPercentage(item.evaluated, item.enrolled);

    // Assessment completeness calculations
    const expectedCodes = item.expectedAssessmentCodes;
    const completedCodes = Array.from(item.completedAssessmentCodes).sort();
    const missingAssessments = expectedCodes.filter((code) => !completedCodes.includes(code));
    const expectedCount = expectedCodes.length;
    const completedCount = completedCodes.length;
    const isComplete = missingAssessments.length === 0 && (expectedCount === 0 || completedCount >= expectedCount);
    const completenessPercentage = expectedCount > 0
      ? Math.min(100, Math.round((completedCount / expectedCount) * 100))
      : 100;

    // Composite Ranking Score (weighted: 50% proficiency, 20% participation, 30% completeness)
    const rankingScore = score !== null
      ? Math.round(((score * 0.50) + ((participationPercentage ?? 0) * 0.20) + (completenessPercentage * 0.30)) * 10) / 10
      : null;

    const situation = getPerformanceClassification(score);

    const components = [...item.componentMap.values()].map((comp) => ({
      code: comp.code,
      label: comp.label,
      enrolled: comp.enrolled,
      evaluated: comp.evaluated,
      participationPercentage: dashboardPercentage(comp.evaluated, comp.enrolled),
      skills: finalizeResults(comp.resultGroups),
    }));

    return {
      schoolId: item.schoolId,
      school: item.school,
      inep: item.inep,
      enrolled: item.enrolled,
      evaluated: item.evaluated,
      participationPercentage,
      totalResponses,
      greenCount,
      yellowCount,
      redCount,
      score,
      rankingScore,
      proficientRate,
      interventionRate,
      situation,
      classesCount: item.classesCount,
      completedAssessments: item.completedAssessments,
      draftAssessments: item.draftAssessments,
      expectedAssessmentCodes: expectedCodes,
      completedAssessmentCodes: completedCodes,
      missingAssessments,
      expectedCount,
      completedCount,
      isComplete,
      completenessPercentage,
      completenessLabel: `${completedCount}/${expectedCount}`,
      results: resultsSummary(finalizedGroups),
      skills: finalizedGroups,
      components,
      classes: item.classes,
    };
  });

  // Ranking calculation (considering rankingScore, completeness, score, participation)
  const rankedWithData = processedSchools
    .filter((s) => s.score !== null && s.evaluated > 0)
    .sort((a, b) => (
      (b.rankingScore ?? 0) - (a.rankingScore ?? 0)
      || (b.completenessPercentage ?? 0) - (a.completenessPercentage ?? 0)
      || (b.score ?? 0) - (a.score ?? 0)
      || (b.proficientRate ?? 0) - (a.proficientRate ?? 0)
      || (b.participationPercentage ?? 0) - (a.participationPercentage ?? 0)
      || b.evaluated - a.evaluated
      || (a.school || '').localeCompare(b.school || '')
    ));

  let currentRank = 1;
  rankedWithData.forEach((school, index) => {
    if (index > 0) {
      const prev = rankedWithData[index - 1];
      if (
        school.rankingScore === prev.rankingScore
        && school.completenessPercentage === prev.completenessPercentage
        && school.score === prev.score
        && school.participationPercentage === prev.participationPercentage
      ) {
        school.position = prev.position;
      } else {
        school.position = currentRank;
      }
    } else {
      school.position = 1;
    }
    school.positionBadge = getPositionBadge(school.position);
    currentRank += 1;
  });

  const rankedWithoutData = processedSchools
    .filter((s) => s.score === null || s.evaluated === 0)
    .sort((a, b) => (a.school || '').localeCompare(b.school || ''))
    .map((school) => ({
      ...school,
      position: null,
      positionBadge: '—',
    }));

  const schoolRanking = [...rankedWithData, ...rankedWithoutData];
  const top5 = rankedWithData.slice(0, 5);

  const schoolComparison = schoolRanking;

  // Component rows for detailed class-by-class comparison table
  const componentRows = allAssessmentRows.flatMap((assessment) => (
    (assessment.components || [])
      .filter((component) => matches(component.component, filters.component))
      .map((component) => ({ ...component, assessment }))
  ));

  const classComparison = componentRows
    .map((component) => {
      const groups = new Map();
      addResults(groups, component.assessment, component);
      const finalized = finalizeResults(groups);
      const pactoClass = component.assessment.pactoClass;
      return {
        id: `${component.assessment.id}:${component.id}`,
        school: pactoClass.school.name,
        schoolInep: pactoClass.school.inep,
        grade: pactoClass.grade,
        shift: pactoClass.shift,
        className: pactoClass.name,
        assessment: component.assessment.code,
        status: component.assessment.status,
        component: component.component,
        componentLabel: definitionForComponent(component.assessment, component.component)?.label || component.component,
        enrolled: component.enrolled,
        evaluated: component.evaluated,
        participationPercentage: dashboardPercentage(component.evaluated, component.enrolled),
        results: resultsSummary(finalized),
        skills: finalized,
      };
    })
    .sort((a, b) => (
      (a.school || '').localeCompare(b.school || '')
      || (Number(a.grade) || 0) - (Number(b.grade) || 0)
      || (a.shift || '').localeCompare(b.shift || '')
      || (a.className || '').localeCompare(b.className || '')
      || (a.assessment || '').localeCompare(b.assessment || '')
      || (a.component || '').localeCompare(b.component || '')
    ));

  // Generate Attention Points
  const attentionPoints = [];

  // 1. Critical/Lagging skills
  charts.forEach((chart) => {
    const redLevel = chart.levels.find((l) => l.color === 'red');
    const redPct = redLevel?.percentage ?? 0;
    if (redPct >= 35 && chart.evaluated > 0) {
      attentionPoints.push({
        id: `skill-${chart.component}-${chart.skill}`,
        type: 'skill',
        severity: redPct >= 50 ? 'critical' : 'warning',
        badgeLabel: redPct >= 50 ? 'Intervenção urgente' : 'Atenção pedagógica',
        title: `${chart.skillLabel} (${chart.componentLabel})`,
        message: `${redPct}% dos alunos avaliados (${redLevel.count || 0} de ${chart.evaluated}) estão no nível inicial “${redLevel.label}”.`,
        recommendation: 'Recomenda-se reforço pedagógico focado e atividades direcionadas nesta competência.',
      });
    }
  });

  // 2. Schools with low participation
  schoolRanking.forEach((school) => {
    if (school.evaluated > 0 && school.participationPercentage != null && school.participationPercentage < 70) {
      attentionPoints.push({
        id: `part-${school.schoolId}`,
        type: 'participation',
        severity: 'warning',
        badgeLabel: 'Baixa participação',
        title: school.school,
        message: `Apenas ${school.participationPercentage}% dos alunos matriculados foram avaliados (${school.evaluated} de ${school.enrolled}).`,
        recommendation: 'Acompanhe com a coordenação escolar os motivos da ausência de registros.',
      });
    }
  });

  // 3. Schools with critical performance
  schoolRanking.forEach((school) => {
    if (school.score !== null && school.score < 40 && school.evaluated > 0) {
      attentionPoints.push({
        id: `perf-${school.schoolId}`,
        type: 'performance',
        severity: 'critical',
        badgeLabel: 'Desempenho crítico',
        title: school.school,
        message: `Índice de proficiência geral em ${school.score}%, com alta concentração nos níveis iniciais.`,
        recommendation: 'Priorize plano de intervenção e acompanhamento contínuo da equipe técnica.',
      });
    }
  });

  // 4. Pending / Draft submissions
  if (draftAssessments > 0) {
    attentionPoints.push({
      id: 'drafts-pending',
      type: 'drafts',
      severity: 'info',
      badgeLabel: 'Rascunhos pendentes',
      title: `${draftAssessments} avaliação(ões) em rascunho`,
      message: 'Existem turmas com preenchimento iniciado mas ainda não enviadas definitivamente.',
      recommendation: 'Oriente os responsáveis a revisar e clicar em “Enviar avaliação definitivamente”.',
    });
  }

  // 5. Incomplete assessment cycles
  const incompleteSchools = schoolRanking.filter((s) => !s.isComplete && s.missingAssessments?.length > 0 && s.evaluated > 0);
  if (incompleteSchools.length > 0) {
    attentionPoints.push({
      id: 'incomplete-cycles',
      type: 'incomplete',
      severity: 'warning',
      badgeLabel: 'Ciclo avaliativo incompleto',
      title: `${incompleteSchools.length} escola(s) com avaliações pendentes`,
      message: `${incompleteSchools.map((s) => `${s.school} (Pendente: ${s.missingAssessments.join(', ')})`).slice(0, 3).join('; ')}${incompleteSchools.length > 3 ? ` e mais ${incompleteSchools.length - 3}...` : ''}.`,
      recommendation: 'Aguarde ou solicite o lançamento das etapas avaliativas pendentes para consolidação integral do ciclo.',
    });
  }

  // If no critical/warning points found
  if (attentionPoints.length === 0) {
    attentionPoints.push({
      id: 'all-healthy',
      type: 'success',
      severity: 'success',
      badgeLabel: 'Situação regular',
      title: 'Nenhum ponto crítico identificado',
      message: 'Os indicadores de participação e proficiência estão em conformidade no recorte selecionado.',
      recommendation: 'Continue acompanhando as próximas avaliações programadas.',
    });
  }

  // Municipality-wide enrolled and evaluated (sum of participating schools based on latest assessment)
  const totalMunicipalityEnrolled = [...schoolAggregates.values()].reduce((sum, s) => sum + s.enrolled, 0);
  const totalMunicipalityEvaluated = [...schoolAggregates.values()].reduce((sum, s) => sum + s.evaluated, 0);

  const completionPct = dashboardPercentage(completedAssessments, expectedAssessments) ?? 0;
  const draftPct = dashboardPercentage(draftAssessments, expectedAssessments) ?? 0;
  const pendingPct = Math.max(0, 100 - completionPct - draftPct);

  return {
    metrics: {
      participatingSchools: participatingSchoolIds.size,
      registeredClasses: filteredClasses.length,
      classesWithData: classesWithData.size,
      enrolled: totalMunicipalityEnrolled,
      evaluated: totalMunicipalityEvaluated,
      completionPercentage: completionPct,
      participationPercentage: dashboardPercentage(totalMunicipalityEvaluated, totalMunicipalityEnrolled) ?? 0,
      completedAssessments,
      expectedAssessments,
      startedAssessments: assessmentRowsWithComponent.length,
    },
    progress: {
      completed: completedAssessments,
      completedPct: completionPct,
      draft: draftAssessments,
      draftPct,
      pending: pendingAssessments,
      pendingPct,
    },
    charts,
    schoolRanking,
    top5,
    schoolComparison,
    classComparison,
    attentionPoints,
    filteredClasses,
    selectedSchools: [...participatingSchoolIds].map((id) => schoolById.get(id)).filter(Boolean),
  };
}

export function dashboardAssessmentCodes() {
  return [...DASHBOARD_ASSESSMENTS];
}
