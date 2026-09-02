import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { audit, AuditAction } from '../../lib/audit.js';
import { conflict, HttpError, notFound } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import {
  PACTO_CONFIG,
  PACTO_PROGRAM_CODE,
  PACTO_PROGRAM_YEAR,
  getAssessmentDefinition,
  listDefinitionsForGrade,
} from './config.js';
import {
  CollectionLinkState,
  assessmentCanBeReopened,
  classIdentificationLocked,
  collectionLinkState,
  draftAssessmentStatus,
  publicAssessmentLocked,
} from './lifecycle.js';

const classInclude = {
  assessments: {
    include: {
      components: {
        include: { results: { orderBy: [{ skill: 'asc' }, { level: 'asc' }] } },
        orderBy: { component: 'asc' },
      },
    },
    orderBy: { code: 'asc' },
  },
};

function hashCollectionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateCollectionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function publicCollectionUrl(token) {
  const origin = env.frontendUrl || env.corsOrigin || 'http://localhost:5173';
  return `${origin}/coleta/pacto/${encodeURIComponent(token)}`;
}

async function assertPactoProgram(programId) {
  const program = await prisma.program.findFirst({
    where: {
      id: programId,
      code: PACTO_PROGRAM_CODE,
      year: PACTO_PROGRAM_YEAR,
      deletedAt: null,
    },
    select: { id: true, code: true, name: true, year: true, status: true },
  });
  if (!program) {
    throw new HttpError(
      404,
      `Programa Pacto 2026 não encontrado com o código técnico ${PACTO_PROGRAM_CODE}`,
      'PACTO_PROGRAM_NOT_FOUND',
    );
  }
  return program;
}

async function assertActiveProgramSchool(programId, schoolId) {
  const link = await prisma.programSchool.findUnique({
    where: { programId_schoolId: { programId, schoolId } },
    include: {
      school: { select: { id: true, inep: true, name: true, deletedAt: true } },
    },
  });
  if (!link?.active || link.school.deletedAt) {
    throw new HttpError(422, 'A escola não está ativa neste programa', 'SCHOOL_NOT_IN_PROGRAM');
  }
  return link;
}

async function resolvePublicAccess(token, { touch = false } = {}) {
  const tokenHash = hashCollectionToken(token);
  const link = await prisma.programCollectionLink.findUnique({
    where: { tokenHash },
    include: {
      program: { select: { id: true, code: true, name: true, year: true, status: true, deletedAt: true } },
      school: { select: { id: true, inep: true, name: true, deletedAt: true } },
    },
  });
  if (!link || link.program.code !== PACTO_PROGRAM_CODE || link.program.year !== PACTO_PROGRAM_YEAR) {
    throw notFound('Link de coleta inválido');
  }
  const linkState = collectionLinkState(link);
  if (linkState === CollectionLinkState.REVOKED) {
    throw new HttpError(410, 'Este link de coleta foi revogado', 'COLLECTION_LINK_REVOKED');
  }
  if (linkState === CollectionLinkState.EXPIRED) {
    throw new HttpError(410, 'Este link de coleta expirou', 'COLLECTION_LINK_EXPIRED');
  }
  if (link.program.deletedAt || link.school.deletedAt) throw notFound('Programa ou escola indisponível');
  await assertActiveProgramSchool(link.programId, link.schoolId);
  if (touch) {
    await prisma.programCollectionLink.update({
      where: { id: link.id },
      data: { lastAccessedAt: new Date() },
    });
  }
  return link;
}

export function percentage(count, evaluated) {
  if (!Number.isInteger(evaluated) || evaluated <= 0) return null;
  return Math.round((Number(count) / evaluated) * 100);
}

function assessmentWarnings(assessment) {
  const warnings = [];
  for (const component of assessment.components || []) {
    if (component.evaluated > component.enrolled) {
      warnings.push({
        code: 'EVALUATED_ABOVE_ENROLLED',
        component: component.component,
        message: `Alunos avaliados (${component.evaluated}) acima dos matriculados (${component.enrolled}). Confira antes de prosseguir.`,
      });
    }
  }
  return warnings;
}

function serializeAssessment(assessment, grade) {
  const definition = getAssessmentDefinition(grade, assessment.code);
  const components = assessment.components.map((component) => ({
    id: component.id,
    component: component.component,
    enrolled: component.enrolled,
    evaluated: component.evaluated,
    results: component.results.map((result) => ({
      id: result.id,
      skill: result.skill,
      level: result.level,
      count: result.count,
      percentage: percentage(result.count, component.evaluated),
    })),
  }));
  const data = {
    id: assessment.id,
    code: assessment.code,
    status: assessment.status,
    submittedAt: assessment.submittedAt,
    reopenedAt: assessment.reopenedAt,
    updatedAt: assessment.updatedAt,
    definition,
    components,
  };
  return { ...data, warnings: assessmentWarnings(data) };
}

function serializeClass(item) {
  return {
    id: item.id,
    programId: item.programId,
    schoolId: item.schoolId,
    grade: item.grade,
    shift: item.shift,
    name: item.name,
    source: item.source,
    active: item.active,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    assessments: (item.assessments || []).map((assessment) => serializeAssessment(assessment, item.grade)),
  };
}

export function buildPactoAnalytics(classes) {
  const groups = new Map();
  for (const pactoClass of classes) {
    for (const assessment of pactoClass.assessments || []) {
      if (assessment.status !== 'ENVIADO') continue;
      for (const component of assessment.components || []) {
        const definition = assessment.definition?.components.find((item) => item.code === component.component);
        if (!definition) continue;
        for (const skill of definition.skills) {
          const key = `${pactoClass.grade}:${assessment.code}:${component.component}:${skill.code}`;
          if (!groups.has(key)) {
            groups.set(key, {
              grade: pactoClass.grade,
              assessment: assessment.code,
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
                percentage: null,
              })),
            });
          }
          const group = groups.get(key);
          group.evaluated += component.evaluated;
          const resultMap = new Map(component.results.map((item) => [`${item.skill}:${item.level}`, item.count]));
          for (const level of group.levels) level.count += resultMap.get(`${skill.code}:${level.code}`) || 0;
        }
      }
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      levels: group.levels.map((level) => ({
        ...level,
        percentage: percentage(level.count, group.evaluated),
      })),
    }))
    .sort((a, b) => a.grade - b.grade || a.assessment.localeCompare(b.assessment) || a.skillLabel.localeCompare(b.skillLabel));
}

export function buildSchoolStatus(classes) {
  const assessments = classes.flatMap((item) => item.assessments || []);
  const expected = classes.length * PACTO_CONFIG.assessments.length;
  const sent = assessments.filter((item) => item.status === 'ENVIADO').length;
  const inProgress = assessments.filter((item) => item.status === 'RASCUNHO' || item.status === 'REABERTO').length;
  const pending = Math.max(0, expected - assessments.length);
  return {
    classesCount: classes.length,
    assessmentsCount: assessments.length,
    expectedAssessmentsCount: expected,
    sentAssessmentsCount: sent,
    inProgressAssessmentsCount: inProgress,
    pendingAssessmentsCount: pending,
    completionPercentage: expected ? Math.round((sent / expected) * 100) : 0,
    status: expected > 0 && sent === expected
      ? 'CONCLUIDA'
      : sent > 0
        ? 'PARCIAL'
        : inProgress > 0
          ? 'EM_PREENCHIMENTO'
          : 'NAO_INICIADA',
    lastSubmittedAt: assessments
      .map((item) => item.submittedAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null,
  };
}

export async function getAdminOverview(programId) {
  const program = await assertPactoProgram(programId);
  const links = await prisma.programSchool.findMany({
    where: { programId, active: true, school: { deletedAt: null } },
    include: {
      school: { select: { id: true, inep: true, name: true } },
    },
    orderBy: { school: { name: 'asc' } },
  });
  const [classes, collectionLinks] = await Promise.all([
    prisma.pactoClass.findMany({
      where: { programId, active: true },
      include: classInclude,
      orderBy: [{ grade: 'asc' }, { shift: 'asc' }, { name: 'asc' }],
    }),
    prisma.programCollectionLink.findMany({
      where: { programId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        schoolId: true,
        expiresAt: true,
        revokedAt: true,
        lastAccessedAt: true,
        createdAt: true,
      },
    }),
  ]);

  const serializedClasses = classes.map(serializeClass);
  const classesBySchool = new Map();
  for (const item of serializedClasses) {
    if (!classesBySchool.has(item.schoolId)) classesBySchool.set(item.schoolId, []);
    classesBySchool.get(item.schoolId).push(item);
  }
  const currentLinkBySchool = new Map();
  for (const item of collectionLinks) {
    if (!currentLinkBySchool.has(item.schoolId) && !item.revokedAt && item.expiresAt > new Date()) {
      currentLinkBySchool.set(item.schoolId, item);
    }
  }

  const schools = links.map((link) => {
    const schoolClasses = classesBySchool.get(link.schoolId) || [];
    return {
      ...link.school,
      collectionLink: currentLinkBySchool.get(link.schoolId) || null,
      classes: schoolClasses,
      ...buildSchoolStatus(schoolClasses),
    };
  });

  return {
    program,
    config: PACTO_CONFIG,
    schools,
    analytics: buildPactoAnalytics(serializedClasses),
    totals: {
      schools: schools.length,
      notStarted: schools.filter((item) => item.status === 'NAO_INICIADA').length,
      inProgress: schools.filter((item) => item.status === 'EM_PREENCHIMENTO' || item.status === 'PARCIAL').length,
      completed: schools.filter((item) => item.status === 'CONCLUIDA').length,
      withSubmissions: schools.filter((item) => item.sentAssessmentsCount > 0).length,
      assessmentsSent: schools.reduce((sum, item) => sum + item.sentAssessmentsCount, 0),
      assessmentsExpected: schools.reduce((sum, item) => sum + item.expectedAssessmentsCount, 0),
      assessmentsPending: schools.reduce((sum, item) => sum + item.pendingAssessmentsCount, 0),
      completionPercentage: (() => {
        const expected = schools.reduce((sum, item) => sum + item.expectedAssessmentsCount, 0);
        const sent = schools.reduce((sum, item) => sum + item.sentAssessmentsCount, 0);
        return expected ? Math.round((sent / expected) * 100) : 0;
      })(),
    },
  };
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  const spreadsheetSafe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
}

export async function exportPactoReport(programId, actor, ip) {
  const program = await assertPactoProgram(programId);
  const classes = await prisma.pactoClass.findMany({
    where: { programId, active: true },
    include: {
      school: { select: { inep: true, name: true } },
      assessments: {
        ...classInclude.assessments,
        where: { status: 'ENVIADO' },
      },
    },
    orderBy: [{ school: { name: 'asc' } }, { grade: 'asc' }, { shift: 'asc' }, { name: 'asc' }],
  });
  const header = [
    'Escola', 'INEP', 'Ano', 'Turno', 'Turma', 'Avaliação', 'Status', 'Data de envio',
    'Componente', 'Matriculados', 'Avaliados', 'Habilidade', 'Nível', 'Quantidade', 'Percentual',
  ];
  const rows = [header];
  for (const item of classes) {
    for (const assessment of item.assessments) {
      for (const component of assessment.components) {
        for (const result of component.results) {
          rows.push([
            item.school.name,
            item.school.inep,
            `${item.grade}º ano`,
            item.shift,
            item.name,
            assessment.code,
            assessment.status,
            assessment.submittedAt?.toISOString() || '',
            component.component,
            component.enrolled,
            component.evaluated,
            result.skill,
            result.level,
            result.count,
            percentage(result.count, component.evaluated) ?? '',
          ]);
        }
      }
    }
  }
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.EXPORT,
    entity: 'PactoAssessment',
    entityId: programId,
    metadata: { format: 'CSV', rows: Math.max(0, rows.length - 1) },
    ip,
  });
  return {
    filename: `pacto-alfabetizacao-${program.year}.csv`,
    content: `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`,
  };
}

export async function generateSchoolLink(programId, schoolId, data, actor, ip) {
  const program = await assertPactoProgram(programId);
  const schoolLink = await assertActiveProgramSchool(programId, schoolId);
  const token = generateCollectionToken();
  const tokenHash = hashCollectionToken(token);
  const now = new Date();

  const link = await prisma.$transaction(async (tx) => {
    await tx.programCollectionLink.updateMany({
      where: { programId, schoolId, revokedAt: null },
      data: { revokedAt: now },
    });
    return tx.programCollectionLink.create({
      data: {
        programId,
        schoolId,
        tokenHash,
        expiresAt: data.expiresAt,
        createdById: actor.id,
      },
      select: { id: true, expiresAt: true, createdAt: true },
    });
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'ProgramCollectionLink',
    entityId: link.id,
    metadata: { programId, schoolId, expiresAt: data.expiresAt },
    ip,
  });

  return {
    ...link,
    program: { id: program.id, name: program.name },
    school: schoolLink.school,
    url: publicCollectionUrl(token),
  };
}

export async function revokeSchoolLink(programId, schoolId, actor, ip) {
  await assertPactoProgram(programId);
  await assertActiveProgramSchool(programId, schoolId);
  const result = await prisma.programCollectionLink.updateMany({
    where: { programId, schoolId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'ProgramCollectionLink',
    entityId: `${programId}:${schoolId}`,
    metadata: { operation: 'REVOKE', count: result.count },
    ip,
  });
  return { revoked: result.count };
}

async function createClass({ programId, schoolId, data, source }) {
  await assertActiveProgramSchool(programId, schoolId);
  try {
    const item = await prisma.pactoClass.create({
      data: { programId, schoolId, ...data, source },
      include: classInclude,
    });
    return serializeClass(item);
  } catch (error) {
    if (error.code === 'P2002') throw conflict('Esta turma já está cadastrada para a escola');
    throw error;
  }
}

export async function createAdminClass(programId, data, actor, ip) {
  await assertPactoProgram(programId);
  const item = await createClass({
    programId,
    schoolId: data.schoolId,
    data: { grade: data.grade, shift: data.shift, name: data.name },
    source: 'ADMINISTRADOR',
  });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'PactoClass',
    entityId: item.id,
    metadata: { programId, schoolId: data.schoolId, grade: data.grade, shift: data.shift, name: data.name },
    ip,
  });
  return item;
}

async function updateClass(classId, programId, schoolId, data) {
  const item = await prisma.pactoClass.findFirst({
    where: { id: classId, programId, schoolId, active: true },
    include: { assessments: { select: { status: true } } },
  });
  if (!item) throw notFound('Turma não encontrada');
  if (classIdentificationLocked(item.assessments)) {
    throw conflict('A turma possui avaliação enviada. Reabra a avaliação antes de alterar a identificação da turma.');
  }
  if (data.grade !== undefined && Number(data.grade) !== item.grade && item.assessments.length) {
    throw conflict('O ano da turma não pode ser alterado depois que uma avaliação foi iniciada.');
  }
  try {
    const updated = await prisma.pactoClass.update({
      where: { id: classId },
      data,
      include: classInclude,
    });
    return serializeClass(updated);
  } catch (error) {
    if (error.code === 'P2002') throw conflict('Já existe uma turma com esta identificação');
    throw error;
  }
}

export async function updateAdminClass(programId, classId, data, actor, ip) {
  await assertPactoProgram(programId);
  const existing = await prisma.pactoClass.findFirst({ where: { id: classId, programId }, select: { schoolId: true } });
  if (!existing) throw notFound('Turma não encontrada');
  const item = await updateClass(classId, programId, existing.schoolId, data);
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'PactoClass',
    entityId: classId,
    metadata: data,
    ip,
  });
  return item;
}

export async function reopenAssessment(programId, assessmentId, actor, ip) {
  await assertPactoProgram(programId);
  const assessment = await prisma.pactoAssessment.findFirst({
    where: { id: assessmentId, class: { programId } },
    include: { class: { select: { grade: true } }, ...classInclude.assessments.include },
  });
  if (!assessment) throw notFound('Avaliação não encontrada');
  if (!assessmentCanBeReopened(assessment.status)) {
    throw conflict('Somente uma avaliação enviada pode ser reaberta');
  }
  const updated = await prisma.pactoAssessment.update({
    where: { id: assessmentId },
    data: { status: 'REABERTO', reopenedAt: new Date(), reopenedById: actor.id },
    include: classInclude.assessments.include,
  });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'PactoAssessment',
    entityId: assessmentId,
    metadata: { operation: 'REOPEN', programId },
    ip,
  });
  return serializeAssessment(updated, assessment.class.grade);
}

export async function getPublicBootstrap(token) {
  const link = await resolvePublicAccess(token, { touch: true });
  const classes = await prisma.pactoClass.findMany({
    where: { programId: link.programId, schoolId: link.schoolId, active: true },
    include: classInclude,
    orderBy: [{ grade: 'asc' }, { shift: 'asc' }, { name: 'asc' }],
  });
  return {
    program: link.program,
    school: link.school,
    link: { expiresAt: link.expiresAt },
    config: PACTO_CONFIG,
    definitions: {
      1: listDefinitionsForGrade(1),
      2: listDefinitionsForGrade(2),
    },
    classes: classes.map(serializeClass),
  };
}

export async function createPublicClass(token, data, ip) {
  const link = await resolvePublicAccess(token);
  const item = await createClass({
    programId: link.programId,
    schoolId: link.schoolId,
    data,
    source: 'ESCOLA',
  });
  await audit({
    action: AuditAction.CREATE,
    entity: 'PactoClass',
    entityId: item.id,
    userName: 'Coleta externa',
    metadata: { programId: link.programId, schoolId: link.schoolId, source: 'ESCOLA' },
    ip,
  });
  return item;
}

export async function updatePublicClass(token, classId, data, ip) {
  const link = await resolvePublicAccess(token);
  const item = await updateClass(classId, link.programId, link.schoolId, data);
  await audit({
    action: AuditAction.UPDATE,
    entity: 'PactoClass',
    entityId: classId,
    userName: 'Coleta externa',
    metadata: { programId: link.programId, schoolId: link.schoolId, fields: Object.keys(data) },
    ip,
  });
  return item;
}

export function validateAssessmentPayload(pactoClass, payload, { submit }) {
  const definition = getAssessmentDefinition(pactoClass.grade, payload.code);
  if (!definition) throw new HttpError(422, 'Avaliação inválida para esta turma', 'INVALID_ASSESSMENT');

  const expectedComponents = new Map(definition.components.map((component) => [component.code, component]));
  const receivedComponentCodes = new Set();
  const normalized = [];
  const errors = [];
  const warnings = [];

  for (const component of payload.components) {
    if (receivedComponentCodes.has(component.component)) {
      errors.push({ field: component.component, message: 'Componente repetido' });
      continue;
    }
    receivedComponentCodes.add(component.component);
    const componentDefinition = expectedComponents.get(component.component);
    if (!componentDefinition) {
      errors.push({ field: component.component, message: 'Componente não pertence a esta avaliação' });
      continue;
    }

    const expectedPairs = new Map();
    for (const skill of componentDefinition.skills) {
      for (const level of skill.levels) expectedPairs.set(`${skill.code}:${level.code}`, { skill, level });
    }
    const receivedPairs = new Set();
    const results = [];
    for (const result of component.results) {
      const pair = `${result.skill}:${result.level}`;
      if (!expectedPairs.has(pair)) {
        errors.push({ field: pair, message: 'Habilidade ou nível não pertence ao instrumento oficial' });
        continue;
      }
      if (receivedPairs.has(pair)) {
        errors.push({ field: pair, message: 'Resultado repetido' });
        continue;
      }
      receivedPairs.add(pair);
      results.push(result);
    }

    if (submit) {
      for (const pair of expectedPairs.keys()) {
        if (!receivedPairs.has(pair)) errors.push({ field: pair, message: 'Quantidade obrigatória não informada' });
      }
    }

    for (const skill of componentDefinition.skills) {
      const values = results.filter((result) => result.skill === skill.code);
      const sum = values.reduce((total, result) => total + result.count, 0);
      if (submit && sum !== component.evaluated) {
        errors.push({
          field: `${component.component}.${skill.code}`,
          message: `A soma dos níveis (${sum}) deve ser igual ao total de alunos avaliados (${component.evaluated})`,
        });
      } else if (!submit && values.length === skill.levels.length && sum !== component.evaluated) {
        warnings.push({
          code: 'LEVEL_SUM_MISMATCH',
          component: component.component,
          skill: skill.code,
          message: `A soma dos níveis (${sum}) ainda difere do total avaliado (${component.evaluated}).`,
        });
      }
    }

    if (component.evaluated > component.enrolled) {
      warnings.push({
        code: 'EVALUATED_ABOVE_ENROLLED',
        component: component.component,
        message: `Alunos avaliados (${component.evaluated}) acima dos matriculados (${component.enrolled}).`,
      });
    }
    normalized.push({ ...component, results });
  }

  if (submit) {
    for (const code of expectedComponents.keys()) {
      if (!receivedComponentCodes.has(code)) errors.push({ field: code, message: 'Componente obrigatório não informado' });
    }
  }

  if (errors.length) {
    throw new HttpError(422, 'Revise os dados da avaliação antes de enviar', 'PACTO_VALIDATION_ERROR', errors);
  }
  return { definition, components: normalized, warnings };
}

async function saveAssessment(token, payload, { submit, ip }) {
  const link = await resolvePublicAccess(token);
  const pactoClass = await prisma.pactoClass.findFirst({
    where: { id: payload.classId, programId: link.programId, schoolId: link.schoolId, active: true },
  });
  if (!pactoClass) throw notFound('Turma não encontrada para esta escola');

  const existing = await prisma.pactoAssessment.findUnique({
    where: { classId_code: { classId: pactoClass.id, code: payload.code } },
    select: { id: true, status: true },
  });
  if (publicAssessmentLocked(existing?.status)) {
    throw conflict('Esta avaliação já foi enviada. Solicite a reabertura ao administrador para corrigir.');
  }

  const checked = validateAssessmentPayload(pactoClass, payload, { submit });
  const assessment = await prisma.$transaction(async (tx) => {
    const row = existing
      ? await tx.pactoAssessment.update({
          where: { id: existing.id },
          data: {
            status: submit ? 'ENVIADO' : draftAssessmentStatus(existing.status),
            submittedAt: submit ? new Date() : undefined,
          },
        })
      : await tx.pactoAssessment.create({
          data: {
            classId: pactoClass.id,
            code: payload.code,
            status: submit ? 'ENVIADO' : 'RASCUNHO',
            submittedAt: submit ? new Date() : null,
          },
        });

    for (const component of checked.components) {
      const componentRow = await tx.pactoAssessmentComponent.upsert({
        where: {
          assessmentId_component: { assessmentId: row.id, component: component.component },
        },
        create: {
          assessmentId: row.id,
          component: component.component,
          enrolled: component.enrolled,
          evaluated: component.evaluated,
        },
        update: { enrolled: component.enrolled, evaluated: component.evaluated },
      });
      await tx.pactoSkillResult.deleteMany({ where: { componentId: componentRow.id } });
      if (component.results.length) {
        await tx.pactoSkillResult.createMany({
          data: component.results.map((result) => ({
            componentId: componentRow.id,
            skill: result.skill,
            level: result.level,
            count: result.count,
          })),
        });
      }
    }

    return tx.pactoAssessment.findUnique({
      where: { id: row.id },
      include: classInclude.assessments.include,
    });
  });

  await audit({
    action: submit ? AuditAction.CREATE : AuditAction.UPDATE,
    entity: 'PactoAssessment',
    entityId: assessment.id,
    userName: 'Coleta externa',
    metadata: {
      operation: submit ? 'SUBMIT' : 'SAVE_DRAFT',
      programId: link.programId,
      schoolId: link.schoolId,
      classId: pactoClass.id,
      code: payload.code,
      warnings: checked.warnings.map((warning) => warning.code),
    },
    ip,
  });

  return {
    assessment: serializeAssessment(assessment, pactoClass.grade),
    warnings: checked.warnings,
  };
}

export function savePublicAssessment(token, payload, ip) {
  return saveAssessment(token, payload, { submit: false, ip });
}

export function submitPublicAssessment(token, payload, ip) {
  return saveAssessment(token, payload, { submit: true, ip });
}
