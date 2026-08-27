import test from 'node:test';
import assert from 'node:assert/strict';
import { attainment } from '../src/services/scoring.service.js';
import { resolveGoalFromList } from '../src/services/goal.service.js';
import { durationToMs } from '../src/lib/auth.js';
import { normalizeCoordinate } from '../src/modules/imports/coordinates.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseSpreadsheet, toNumber } from '../src/modules/imports/parser.js';
import { autoMapColumns } from '../src/modules/imports/schoolFields.js';
import { schoolsStrategy } from '../src/modules/imports/schools.strategy.js';
import { createGoalSchema } from '../src/validations/result.validation.js';

test('calcula atingimento respeitando a polaridade e o teto', () => {
  assert.equal(attainment(50, 100, 'MAIOR_MELHOR'), 50);
  assert.equal(attainment(150, 100, 'MAIOR_MELHOR'), 150);
  assert.equal(attainment(5, 10, 'MENOR_MELHOR'), 200);
  assert.equal(attainment(20, 10, 'MENOR_MELHOR'), 50);
  assert.equal(attainment(0, 10, 'MENOR_MELHOR'), 200);
  assert.equal(attainment(-1, 10, 'MENOR_MELHOR'), null);
  assert.equal(attainment(1, 0, 'MAIOR_MELHOR'), null);
});

test('resolve a meta mais específica', () => {
  const goals = [
    { id: 'global', programId: null, schoolId: null, indicatorId: null, period: null },
    { id: 'program', programId: 'p1', schoolId: null, indicatorId: null, period: null },
    { id: 'specific', programId: 'p1', schoolId: 's1', indicatorId: 'i1', period: 'Anual' },
  ];
  const resolved = resolveGoalFromList(goals, {
    programId: 'p1',
    schoolId: 's1',
    indicatorId: 'i1',
    period: 'Anual',
  });
  assert.equal(resolved.id, 'specific');
});

test('valida coerência entre escopo e dimensões da meta', () => {
  const base = { year: 2026, value: 90, period: null };
  assert.equal(createGoalSchema.safeParse({ ...base, scope: 'GERAL' }).success, true);
  assert.equal(
    createGoalSchema.safeParse({ ...base, scope: 'GERAL', programId: crypto.randomUUID() }).success,
    false,
  );
  assert.equal(createGoalSchema.safeParse({ ...base, scope: 'PROGRAMA' }).success, false);
});

test('normaliza durações usadas pelo cookie de acesso', () => {
  assert.equal(durationToMs('30s'), 30_000);
  assert.equal(durationToMs('15m'), 900_000);
  assert.equal(durationToMs('2h'), 7_200_000);
  assert.equal(durationToMs('1d'), 86_400_000);
});

test('interpreta números pt-BR e coordenadas com decimal implícita', () => {
  assert.equal(toNumber('1.234,56'), 1234.56);
  assert.equal(toNumber('-48,832820'), -48.83282);
  assert.equal(toNumber('não informado'), null);
  assert.equal(normalizeCoordinate(-165917, 'latitude'), -1.65917);
  assert.equal(normalizeCoordinate(-48832820, 'longitude'), -48.83282);
});

test('mapeia automaticamente colunas conhecidas de escolas', () => {
  const { mapping, unmapped } = autoMapColumns([
    'INEP',
    'ESCOLAS',
    'ENDEREÇO',
    'LONGTUDE',
    'COLUNA EXTRA',
  ]);
  assert.equal(mapping.inep, 'INEP');
  assert.equal(mapping.name, 'ESCOLAS');
  assert.equal(mapping.address, 'ENDEREÇO');
  assert.equal(mapping.longitude, 'LONGTUDE');
  assert.deepEqual(unmapped, ['COLUNA EXTRA']);
});

test('lê o CSV oficial Windows-1252 e normaliza zona e coordenadas', () => {
  const fixture = path.join(os.tmpdir(), `cpe-schools-${process.pid}-${Date.now()}.csv`);
  const csv = [
    'INEP;ESCOLAS;ENDEREÇO;GESTOR(A);ZONA;LATITUDE;LONGTUDE',
    '15181278;EMEF GUAJARÁ DE BEJA;RAMAL BAIA;; ESTRADAS;-165.917;-48.832.820',
    '',
  ].join('\r\n');
  // Os caracteres usados nesta amostra pertencem ao mesmo intervalo de bytes
  // em Latin-1 e Windows-1252. O teste não depende de um arquivo externo.
  fs.writeFileSync(fixture, Buffer.from(csv, 'latin1'));

  try {
    const [row] = parseSpreadsheet(fixture);
    const { mapping } = autoMapColumns(Object.keys(row.raw));
    const built = schoolsStrategy.buildRow(
      row,
      { byInep: new Map(), byNameKey: new Map() },
      mapping,
    );

    assert.deepEqual(built.errors, []);
    assert.equal(built.data.name, 'EMEF GUAJARÁ DE BEJA');
    assert.equal(built.data.address, 'RAMAL BAIA');
    assert.equal(built.data.zone, 'ESTRADAS');
    assert.equal(built.data.latitude, -1.65917);
    assert.equal(built.data.longitude, -48.83282);
  } finally {
    fs.rmSync(fixture, { force: true });
  }
});
