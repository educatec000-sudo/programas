const DASHBOARD_ASSESSMENTS = ['A1', 'A2', 'A3'];

export function dashboardPercentage(value, total) {
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.round((Number(value) / total) * 100);
}

function matches(value, selected) {
  return !selected || String(value) === String(selected);
}

function definitionForComponent(assessment, componentCode) {
  return assessment.definition?.components?.find((item) => item.code === componentCode) || null;
}

function addResults(groupMap, assessment, component) {
  const definition = definitionForComponent(assessment, component.component);
  if (!definition) return;
  const values = new Map((component.results || []).map((item) => [`${item.skill}:${item.level}`, item.count]));

  for (const skill of definition.skills) {
    const skillValues = skill.levels.map((level) => values.get(`${skill.code}:${level.code}`));
    if (skillValues.every((value) => value === undefined)) continue;

    const key = `${component.component}:${skill.code}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        component: component.component,
        componentLabel: definition.label,
        skill: skill.code,
        skillLabel: skill.label,
        evaluated: 0,
        levels: skill.levels.map((level) => ({
          code: level.code,
          label: level.label,
          color: level.color,
          count: 0,
          hasData: false,
          percentage: null,
        })),
      });
    }
    const group = groupMap.get(key);
    group.evaluated += component.evaluated;
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
    .map((group) => ({
      ...group,
      levels: group.levels.map(({ hasData, ...level }) => ({
        ...level,
        count: hasData ? level.count : null,
        percentage: hasData ? dashboardPercentage(level.count, group.evaluated) : null,
      })),
    }))
    .sort((a, b) => a.componentLabel.localeCompare(b.componentLabel) || a.skillLabel.localeCompare(b.skillLabel));
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
    (school.classes || []).map((pactoClass) => ({ ...pactoClass, school }))
  ));

  const structurallyFilteredClasses = classRows.filter((item) => (
    matches(item.schoolId, filters.schoolId)
    && matches(item.grade, filters.grade)
    && matches(item.shift, filters.shift)
    && matches(item.id, filters.classId)
  ));

  const filteredClasses = structurallyFilteredClasses.filter((item) => {
    if (!filters.assessment) return true;
    return (item.enabledAssessments || DASHBOARD_ASSESSMENTS).includes(filters.assessment);
  });

  const expectedCodesByClass = new Map();
  for (const item of filteredClasses) {
    const codes = (item.enabledAssessments || DASHBOARD_ASSESSMENTS)
      .filter((code) => DASHBOARD_ASSESSMENTS.includes(code))
      .filter((code) => matches(code, filters.assessment));
    expectedCodesByClass.set(item.id, new Set(codes));
  }

  const assessmentRows = filteredClasses.flatMap((item) => (
    (item.assessments || [])
      .filter((assessment) => DASHBOARD_ASSESSMENTS.includes(assessment.code))
      .filter((assessment) => expectedCodesByClass.get(item.id)?.has(assessment.code))
      .map((assessment) => ({ ...assessment, pactoClass: item, school: item.school }))
  ));

  const componentRows = assessmentRows.flatMap((assessment) => (
    (assessment.components || [])
      .filter((component) => matches(component.component, filters.component))
      .map((component) => ({ ...component, assessment }))
  ));

  const assessmentRowsWithComponent = filters.component
    ? assessmentRows.filter((assessment) => (assessment.components || []).some((item) => item.component === filters.component))
    : assessmentRows;
  const expectedAssessments = [...expectedCodesByClass.values()].reduce((sum, codes) => sum + codes.size, 0);
  const classesWithData = new Set(assessmentRowsWithComponent.map((item) => item.pactoClass.id));
  const completedAssessments = assessmentRowsWithComponent.filter((item) => item.status === 'ENVIADO').length;
  const enrolled = componentRows.reduce((sum, item) => sum + item.enrolled, 0);
  const evaluated = componentRows.reduce((sum, item) => sum + item.evaluated, 0);

  const hasClassFilter = Boolean(filters.grade || filters.shift || filters.classId || filters.assessment);
  const participatingSchoolIds = hasClassFilter
    ? new Set(filteredClasses.map((item) => item.schoolId))
    : new Set(schools.filter((school) => matches(school.id, filters.schoolId)).map((school) => school.id));

  const chartGroups = new Map();
  for (const component of componentRows) addResults(chartGroups, component.assessment, component);
  const charts = finalizeResults(chartGroups);

  const schoolAggregates = new Map();
  for (const schoolId of participatingSchoolIds) {
    const school = schoolById.get(schoolId);
    if (!school) continue;
    schoolAggregates.set(school.id, {
      schoolId: school.id,
      school: school.name,
      inep: school.inep,
      enrolled: 0,
      evaluated: 0,
      resultGroups: new Map(),
    });
  }
  for (const component of componentRows) {
    const { school } = component.assessment;
    const aggregate = schoolAggregates.get(school.id);
    if (!aggregate) continue;
    aggregate.enrolled += component.enrolled;
    aggregate.evaluated += component.evaluated;
    addResults(aggregate.resultGroups, component.assessment, component);
  }

  const schoolComparison = [...schoolAggregates.values()]
    .map((item) => {
      const groups = finalizeResults(item.resultGroups);
      return {
        schoolId: item.schoolId,
        school: item.school,
        inep: item.inep,
        enrolled: item.enrolled,
        evaluated: item.evaluated,
        participationPercentage: dashboardPercentage(item.evaluated, item.enrolled),
        results: resultsSummary(groups),
      };
    })
    .sort((a, b) => a.school.localeCompare(b.school));

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
      };
    })
    .sort((a, b) => (
      a.school.localeCompare(b.school)
      || a.grade - b.grade
      || a.shift.localeCompare(b.shift)
      || a.className.localeCompare(b.className)
      || a.assessment.localeCompare(b.assessment)
      || a.component.localeCompare(b.component)
    ));

  return {
    metrics: {
      participatingSchools: participatingSchoolIds.size,
      registeredClasses: filteredClasses.length,
      classesWithData: classesWithData.size,
      enrolled,
      evaluated,
      completionPercentage: dashboardPercentage(assessmentRowsWithComponent.length, expectedAssessments) ?? 0,
      participationPercentage: dashboardPercentage(evaluated, enrolled) ?? 0,
      completedAssessments,
      expectedAssessments,
      startedAssessments: assessmentRowsWithComponent.length,
    },
    charts,
    schoolComparison,
    classComparison,
    filteredClasses,
    selectedSchools: [...participatingSchoolIds].map((id) => schoolById.get(id)).filter(Boolean),
  };
}

export function dashboardAssessmentCodes() {
  return [...DASHBOARD_ASSESSMENTS];
}
