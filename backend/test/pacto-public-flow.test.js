import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateSchoolLink } from '../src/programs/pacto/service.js';
import { resolvePactoPublicLink } from '../../frontend/src/programs/pacto/link.js';
import { getAssessmentDefinition } from '../src/programs/pacto/config.js';

const ids = {
  program: '10000000-0000-4000-8000-000000000001',
  school: '10000000-0000-4000-8000-000000000002',
  user: '10000000-0000-4000-8000-000000000003',
  pactoClass: '10000000-0000-4000-8000-000000000004',
  link: '10000000-0000-4000-8000-000000000005',
  assessment: '10000000-0000-4000-8000-000000000006',
};

function completeA1Payload() {
  const definition = getAssessmentDefinition(2, 'A1');
  return {
    classId: ids.pactoClass,
    code: 'A1',
    components: definition.components.map((component) => ({
      component: component.code,
      enrolled: 2,
      evaluated: 2,
      results: component.skills.flatMap((skill) => skill.levels.map((level, index) => ({
        skill: skill.code,
        level: level.code,
        count: [1, 1, 0][index],
      }))),
    })),
  };
}

function installInMemoryPactoDatabase(t) {
  const program = {
    id: ids.program,
    code: 'PACTO-ALFABETIZACAO-2026',
    name: 'Pacto pela Alfabetização 2026',
    year: 2026,
    status: 'EM_EXECUCAO',
    deletedAt: null,
  };
  const school = {
    id: ids.school,
    inep: '15066665',
    name: 'E.M.E.I.F. Santa Anastácia',
    deletedAt: null,
  };
  const pactoClass = {
    id: ids.pactoClass,
    programId: ids.program,
    schoolId: ids.school,
    grade: 2,
    shift: 'M',
    name: 'A',
    source: 'ADMINISTRADOR',
    enabledAssessments: ['A1'],
    active: true,
    createdAt: new Date('2026-09-02T10:00:00.000Z'),
    updatedAt: new Date('2026-09-02T10:00:00.000Z'),
  };

  let collectionLink = null;
  let assessment = null;
  const components = new Map();
  const results = new Map();
  const restorers = [];
  const replace = (object, key, value) => {
    const original = object[key];
    object[key] = value;
    restorers.push(() => { object[key] = original; });
  };

  const hydratedAssessment = () => assessment && ({
    ...assessment,
    components: [...components.values()].map((component) => ({
      ...component,
      results: results.get(component.id) || [],
    })),
  });
  const hydratedClass = () => ({
    ...pactoClass,
    assessments: assessment ? [hydratedAssessment()] : [],
  });
  const publicLink = () => collectionLink && ({
    ...collectionLink,
    programId: ids.program,
    schoolId: ids.school,
    program,
    school,
  });

  const tx = {
    programCollectionLink: {
      updateMany: async () => ({ count: collectionLink ? 1 : 0 }),
      create: async ({ data }) => {
        collectionLink = {
          id: ids.link,
          ...data,
          revokedAt: null,
          lastAccessedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return { id: collectionLink.id, expiresAt: collectionLink.expiresAt, createdAt: collectionLink.createdAt };
      },
    },
    pactoAssessment: {
      create: async ({ data }) => {
        assessment = {
          id: ids.assessment,
          ...data,
          reopenedAt: null,
          reopenedById: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return assessment;
      },
      update: async ({ data }) => {
        assessment = { ...assessment, ...data, updatedAt: new Date() };
        return assessment;
      },
      findUnique: async () => hydratedAssessment(),
    },
    pactoAssessmentComponent: {
      upsert: async ({ create, update }) => {
        const existing = [...components.values()].find((item) => item.component === create.component);
        const row = existing
          ? { ...existing, ...update, updatedAt: new Date() }
          : {
              id: `20000000-0000-4000-8000-00000000000${components.size + 1}`,
              ...create,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
        components.set(row.id, row);
        return row;
      },
    },
    pactoSkillResult: {
      deleteMany: async ({ where }) => {
        results.set(where.componentId, []);
        return { count: 0 };
      },
      createMany: async ({ data }) => {
        const rows = data.map((item, index) => ({
          id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          ...item,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
        results.set(data[0].componentId, rows);
        return { count: rows.length };
      },
    },
  };

  replace(prisma.program, 'findFirst', async () => program);
  replace(prisma.programSchool, 'findUnique', async () => ({ active: true, school }));
  replace(prisma.programCollectionLink, 'findUnique', async ({ where }) => (
    where.tokenHash === collectionLink?.tokenHash ? publicLink() : null
  ));
  replace(prisma.programCollectionLink, 'update', async ({ data }) => {
    collectionLink = { ...collectionLink, ...data };
    return collectionLink;
  });
  replace(prisma.pactoClass, 'findMany', async () => [hydratedClass()]);
  replace(prisma.pactoClass, 'findFirst', async () => pactoClass);
  replace(prisma.pactoAssessment, 'findUnique', async () => (
    assessment ? { id: assessment.id, status: assessment.status } : null
  ));
  replace(prisma.auditLog, 'create', async () => ({}));
  replace(prisma, '$transaction', async (operation) => (
    typeof operation === 'function' ? operation(tx) : Promise.all(operation)
  ));

  t.after(() => {
    while (restorers.length) restorers.pop()();
  });

  return { program, school };
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json();
  return { response, payload };
}

test('fluxo público real: link exclusivo, escola, rascunho, envio e recarga', async (t) => {
  const { program, school } = installInMemoryPactoDatabase(t);
  const generated = await generateSchoolLink(
    program.id,
    school.id,
    { expiresAt: new Date('2099-12-31T23:59:59.000Z') },
    { id: ids.user, name: 'Administrador' },
    '127.0.0.1',
    'http://localhost:5173',
  );
  const publicLink = resolvePactoPublicLink(generated.path, 'http://localhost:5173');
  assert.equal(generated.school.inep, '15066665');
  assert.equal(publicLink.url, `http://localhost:5173${generated.path}`);

  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const apiRoot = `http://127.0.0.1:${address.port}/api/public/pacto`;
  const api = `${apiRoot}/${publicLink.token}`;

  let result = await jsonRequest(`${apiRoot}/${'B'.repeat(43)}`);
  assert.equal(result.response.status, 404);

  // Sem cookie ou sessão administrativa: equivale ao acesso em janela anônima.
  result = await jsonRequest(api);
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.school.id, school.id);
  assert.equal(result.payload.school.inep, '15066665');
  assert.equal(result.payload.program.id, program.id);
  assert.deepEqual(result.payload.classes[0].enabledAssessments, ['A1']);
  assert.equal(result.payload.classes[0].assessments.length, 0);

  const payload = completeA1Payload();
  result = await jsonRequest(`${api}/assessments/draft`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.assessment.status, 'RASCUNHO');

  result = await jsonRequest(api);
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.classes[0].assessments[0].code, 'A1');
  assert.equal(result.payload.classes[0].assessments[0].components.length, 2);

  result = await jsonRequest(`${api}/assessments/submit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.assessment.status, 'ENVIADO');

  result = await jsonRequest(api);
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.classes[0].assessments[0].status, 'ENVIADO');
  assert.equal(result.payload.classes[0].assessments[0].components[0].results[0].percentage, 50);

  result = await jsonRequest(`${api}/assessments/draft`, {
    method: 'PUT',
    body: JSON.stringify({ ...payload, code: 'A0' }),
  });
  assert.equal(result.response.status, 422);
  assert.equal(result.payload.error.code, 'ASSESSMENT_NOT_ENABLED');
});
