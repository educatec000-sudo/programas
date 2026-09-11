import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';
import { prisma } from '../src/lib/prisma.js';
import {
  parseParcNumber,
  normalizeInep,
  normalizeSchoolName,
  findParcHeaderRowIndex,
  mapParcColumns,
  readSpreadsheetSheets,
  parseParcSpreadsheet,
  confirmParcImport,
} from '../src/programs/parc/import.js';
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
  saveParcManualResult,
} from '../src/programs/parc/service.js';

test('PARC Lançamento Manual: cadastra resultado para escola existente e para nova escola', async () => {
  const mockExistingSchool = { id: 'sch-manual-1', inep: '15065359', name: 'Escola Modelo Existente', zone: 'URBANA', district: 'SEDE' };
  const mockProgram = {
    id: 'parc-manual-prog',
    code: 'PARC-2026',
    name: PARC_PROGRAM_NAME,
    year: 2026,
    catalog: { id: 'cat-parc', code: 'PARC', name: PARC_PROGRAM_NAME },
  };

  const dbResults = new Map();
  const dbSchools = new Map([[mockExistingSchool.id, mockExistingSchool]]);

  const originalProgramFindFirst = prisma.program.findFirst;
  const originalSchoolFindFirst = prisma.school.findFirst;
  const originalSchoolCreate = prisma.school.create;
  const originalProgramSchoolUpsert = prisma.programSchool.upsert;
  const originalParcResultFindFirst = prisma.parcSchoolResult.findFirst;
  const originalParcResultCreate = prisma.parcSchoolResult.create;
  const originalParcResultUpdate = prisma.parcSchoolResult.update;
  const originalAudit = prisma.auditLog.create;

  try {
    prisma.program.findFirst = async () => mockProgram;
    prisma.school.findFirst = async ({ where }) => {
      if (where?.id) return dbSchools.get(where.id) || null;
      if (where?.OR) {
        for (const orCond of where.OR) {
          if (orCond?.inep) {
            const found = Array.from(dbSchools.values()).find((s) => s.inep === orCond.inep);
            if (found) return found;
          }
          if (orCond?.name?.equals) {
            const found = Array.from(dbSchools.values()).find((s) => s.name.toLowerCase() === orCond.name.equals.toLowerCase());
            if (found) return found;
          }
        }
      }
      return null;
    };
    prisma.school.create = async ({ data }) => {
      const created = { id: `sch-new-${dbSchools.size + 1}`, ...data };
      dbSchools.set(created.id, created);
      return created;
    };
    prisma.programSchool.upsert = async ({ create }) => ({ id: 'link-1', ...create });
    prisma.parcSchoolResult.findFirst = async ({ where }) => dbResults.get(`${where.schoolId}_${where.cycle}`) || null;
    prisma.parcSchoolResult.create = async ({ data }) => {
      const rec = { id: `res-${dbResults.size + 1}`, ...data, school: dbSchools.get(data.schoolId) };
      dbResults.set(`${data.schoolId}_${data.cycle}`, rec);
      return rec;
    };
    prisma.parcSchoolResult.update = async ({ where, data }) => {
      const existing = Array.from(dbResults.values()).find((r) => r.id === where.id);
      const updated = { ...existing, ...data };
      dbResults.set(`${updated.schoolId}_${updated.cycle}`, updated);
      return updated;
    };
    prisma.auditLog.create = async () => ({ id: 'audit-1' });

    // 1. Lançamento manual para escola existente
    const resExisting = await saveParcManualResult(mockProgram.id, {
      schoolId: mockExistingSchool.id,
      cycle: 'ENTRADA',
      year: 2026,
      enrolled: 40,
      evaluated: 38,
      preReaderLevel1: 10,
      preReaderLevel2: 10,
      preReaderLevel3: 10,
      preReaderLevel4: 10,
      beginnerReader: 40,
      fluentReader: 20,
    });

    assert.ok(resExisting.success);
    assert.equal(resExisting.action, 'CRIADO');
    assert.equal(resExisting.result.enrolled, 40);
    assert.equal(resExisting.result.evaluated, 38);
    assert.equal(resExisting.result.participationRate, 95.0);
    assert.equal(resExisting.result.preReaderTotal, 40);

    // 2. Lançamento manual cadastrando NOVA escola diretamente
    const resNew = await saveParcManualResult(mockProgram.id, {
      newSchool: {
        name: 'E M E F Escola Nova do Campo',
        inep: '15998877',
        zone: 'RURAL',
        district: 'Ramal Boa Esperança',
        schoolType: 'E.M.E.F.',
      },
      cycle: 'ENTRADA',
      year: 2026,
      enrolled: 25,
      evaluated: 25,
      participationRate: 100,
      preReaderTotal: 20,
      beginnerReader: 50,
      fluentReader: 30,
    });

    assert.ok(resNew.success);
    assert.equal(resNew.action, 'CRIADO');
    assert.equal(resNew.school.name, 'E M E F Escola Nova do Campo');
    assert.equal(resNew.result.fluentReader, 30);
  } finally {
    prisma.program.findFirst = originalProgramFindFirst;
    prisma.school.findFirst = originalSchoolFindFirst;
    prisma.school.create = originalSchoolCreate;
    prisma.programSchool.upsert = originalProgramSchoolUpsert;
    prisma.parcSchoolResult.findFirst = originalParcResultFindFirst;
    prisma.parcSchoolResult.create = originalParcResultCreate;
    prisma.parcSchoolResult.update = originalParcResultUpdate;
    prisma.auditLog.create = originalAudit;
  }
});
import {
  PARC_CATALOG_CODE,
  PARC_PROGRAM_NAME,
  PARC_CYCLES,
  PARC_FLUENCY_LEVELS,
  PARC_RANKING_INDICATORS,
  detectParcCycle,
} from '../src/programs/parc/config.js';

test('PARC: converte números em formatos pt-BR, porcentagem e inteiros com segurança', () => {
  assert.equal(parseParcNumber('76%'), 76);
  assert.equal(parseParcNumber('24%'), 24);
  assert.equal(parseParcNumber('0%'), 0);
  assert.equal(parseParcNumber('100'), 100);
  assert.equal(parseParcNumber('78,5%'), 78.5);
  assert.equal(parseParcNumber('1.234,56'), 1234.56);
  assert.equal(parseParcNumber('—'), null);
  assert.equal(parseParcNumber('-'), null);
  assert.equal(parseParcNumber(''), null);
  assert.equal(parseParcNumber(null), null);
});

test('PARC: normaliza códigos INEP removendo caracteres não numéricos', () => {
  assert.equal(normalizeInep('15.145.425'), '15145425');
  assert.equal(normalizeInep('15145425'), '15145425');
  assert.equal(normalizeInep('123'), null);
});

test('PARC: normaliza nomes de escolas removendo prefixos administrativos e acentos', () => {
  assert.equal(normalizeSchoolName('E M E F ACENDENDO AS LUZES'), 'acendendo as luzes');
  assert.equal(normalizeSchoolName('E.M.E.I.E.F. TOMAZ LOURENÇO NEGRÃO'), 'tomaz lourenco negrao');
  assert.equal(normalizeSchoolName('EMEIF VALDECIR SANTANA NASCIMENTO DOS SANTOS'), 'valdecir santana nascimento dos santos');
  assert.equal(normalizeSchoolName('E M E F DR FRANCISCO LEITE LOPES'), 'francisco leite lopes');
  assert.equal(normalizeSchoolName('E M E F PROF MARIA ZAIDE CARDOSO'), 'maria zaide cardoso');
});

test('PARC: detecta ciclos de Entrada e Saída automaticamente', () => {
  assert.equal(detectParcCycle('Avaliação de Fluência Leitora - Entrada 2026'), 'ENTRADA');
  assert.equal(detectParcCycle('Fluência 2º Ano - Ciclo de Entrada'), 'ENTRADA');
  assert.equal(detectParcCycle('Avaliação de Fluência Leitora - Saída 2026'), 'SAIDA');
  assert.equal(detectParcCycle('Relatório Final - Saida 2º Ciclo'), 'SAIDA');
});

test('PARC: mapeia colunas oficiais de Fluência da planilha do PARC', () => {
  const headers = [
    'AVALIAÇÃO',
    'REDE',
    'ANO ESCOLAR',
    'COMPONENTE CURRICULAR',
    'ESTADO',
    'REGIONAL',
    'MUNICÍPIO',
    'ESCOLA',
    'PREVISTOS',
    'AVALIADOS',
    'PARTICIPAÇÃO (%)',
    'PRÉ-LEITOR (TOTAL)',
    'PRÉ-LEITOR (NÍVEL 1)',
    'PRÉ-LEITOR (NÍVEL 2)',
    'PRÉ-LEITOR (NÍVEL 3)',
    'PRÉ-LEITOR (NÍVEL 4)',
    'LEITOR INICIANTE',
    'LEITOR FLUENTE',
  ];

  const colMap = mapParcColumns(headers);

  assert.equal(colMap.assessment, 0);
  assert.equal(colMap.grade, 2);
  assert.equal(colMap.component, 3);
  assert.equal(colMap.municipality, 6);
  assert.equal(colMap.schoolName, 7);
  assert.equal(colMap.enrolled, 8);
  assert.equal(colMap.evaluated, 9);
  assert.equal(colMap.participationRate, 10);
  assert.equal(colMap.preReaderTotal, 11);
  assert.equal(colMap.preReaderLevel1, 12);
  assert.equal(colMap.preReaderLevel2, 13);
  assert.equal(colMap.preReaderLevel3, 14);
  assert.equal(colMap.preReaderLevel4, 15);
  assert.equal(colMap.beginnerReader, 16);
  assert.equal(colMap.fluentReader, 17);
});

test('PARC: processa arquivo oficial real DADOS_ESCOLA (Entrada 2026) e identifica escolas cadastradas', async () => {
  const filePath = '/home/user/uploads/DADOS_ESCOLA 10-09-2026 2-13-40.csv';
  if (!fs.existsSync(filePath)) return;

  const buffer = fs.readFileSync(filePath);

  const mockSchools = [
    { id: 'sch-1', inep: '15145425', name: 'E M E F ACENDENDO AS LUZES', zone: 'RURAL', district: 'ZONA RURAL' },
    { id: 'sch-2', inep: '15065359', name: 'E M E I E F TOMAZ LOURENCO NEGRAO', zone: 'URBANA', district: 'SEDE' },
    { id: 'sch-3', inep: '15012345', name: 'E M E F DR FRANCISCO LEITE LOPES', zone: 'URBANA', district: 'SEDE' },
  ];

  const mockProgram = {
    id: 'parc-2026-prog',
    code: 'PARC-2026',
    name: PARC_PROGRAM_NAME,
    year: 2026,
    catalog: { id: 'cat-parc', code: 'PARC', name: PARC_PROGRAM_NAME },
  };

  const originalSchoolFindMany = prisma.school.findMany;
  const originalProgramFindFirst = prisma.program.findFirst;
  const originalProgramSchoolFindMany = prisma.programSchool.findMany;
  const originalParcResultFindMany = prisma.parcSchoolResult.findMany;

  try {
    prisma.school.findMany = async () => mockSchools;
    prisma.program.findFirst = async () => mockProgram;
    prisma.programSchool.findMany = async () => mockSchools.map((s) => ({ programId: mockProgram.id, schoolId: s.id, active: true }));
    prisma.parcSchoolResult.findMany = async () => [];

    const preview = await parseParcSpreadsheet(buffer, 'DADOS_ESCOLA 10-09-2026 2-13-40.csv', null, mockProgram.id);

    assert.equal(preview.summary.totalRows, 69);
    assert.equal(preview.summary.cycle, 'ENTRADA');
    assert.ok(preview.summary.validRows >= 3);
    assert.ok(preview.summary.unidentifiedCount > 0);

    const firstRow = preview.rows[0];
    assert.equal(firstRow.schoolName, 'E M E F ACENDENDO AS LUZES');
    assert.equal(firstRow.matchedSchool?.id, 'sch-1');
    assert.equal(firstRow.cycle, 'ENTRADA');
    assert.equal(firstRow.enrolled, 66);
    assert.equal(firstRow.evaluated, 66);
    assert.equal(firstRow.participationRate, 100);
    assert.equal(firstRow.preReaderTotal, 76);
    assert.equal(firstRow.preReaderLevel1, 24);
    assert.equal(firstRow.preReaderLevel2, 14);
    assert.equal(firstRow.preReaderLevel3, 9);
    assert.equal(firstRow.preReaderLevel4, 29);
    assert.equal(firstRow.beginnerReader, 23);
    assert.equal(firstRow.fluentReader, 2);
  } finally {
    prisma.school.findMany = originalSchoolFindMany;
    prisma.program.findFirst = originalProgramFindFirst;
    prisma.programSchool.findMany = originalProgramSchoolFindMany;
    prisma.parcSchoolResult.findMany = originalParcResultFindMany;
  }
});

test('PARC: escola não identificada NÃO gera nova escola no banco e permite mapeamento manual', async () => {
  const csvContent = [
    'AVALIAÇÃO;REDE;ANO ESCOLAR;COMPONENTE CURRICULAR;ESTADO;REGIONAL;MUNICÍPIO;ESCOLA;PREVISTOS;AVALIADOS;PARTICIPAÇÃO (%);PRÉ-LEITOR (TOTAL);PRÉ-LEITOR (NÍVEL 1);PRÉ-LEITOR (NÍVEL 2);PRÉ-LEITOR (NÍVEL 3);PRÉ-LEITOR (NÍVEL 4);LEITOR INICIANTE;LEITOR FLUENTE',
    'Avaliação de Fluência Leitora - Entrada 2026;MUNICIPAL;ENSINO FUNDAMENTAL DE 9 ANOS - 2º ANO;FLUÊNCIA;PARÁ;DRE ABAETETUBA;ABAETETUBA;Escola Inexistente no Banco;30;30;100;50%;10%;10%;10%;20%;30%;20%',
  ].join('\n');

  const buffer = Buffer.from(csvContent, 'utf-8');

  const mockSchools = [
    { id: 'sch-100', inep: '15999999', name: 'E.M.E.F. Centro Educacional Modelo', zone: 'URBANA', district: 'SEDE' },
  ];

  const mockProgram = {
    id: 'parc-prog-id',
    code: 'PARC-2026',
    name: PARC_PROGRAM_NAME,
    year: 2026,
    catalog: { id: 'cat-parc', code: 'PARC', name: PARC_PROGRAM_NAME },
  };

  const originalSchoolFindMany = prisma.school.findMany;
  const originalSchoolCreate = prisma.school.create;
  const originalProgramFindFirst = prisma.program.findFirst;
  const originalProgramSchoolFindMany = prisma.programSchool.findMany;
  const originalParcResultFindMany = prisma.parcSchoolResult.findMany;
  const originalProgramSchoolCreateMany = prisma.programSchool.createMany;
  const originalProgramSchoolUpdateMany = prisma.programSchool.updateMany;
  const originalProgramSchoolUpsert = prisma.programSchool.upsert;
  const originalTransaction = prisma.$transaction;
  const originalAudit = prisma.auditLog.create;

  let schoolCreateCalled = false;

  try {
    prisma.school.findMany = async () => mockSchools;
    prisma.school.create = async () => {
      schoolCreateCalled = true;
      throw new Error('School.create NUNCA deve ser chamado na importação do PARC!');
    };
    prisma.program.findFirst = async () => mockProgram;
    prisma.programSchool.findMany = async () => [];
    prisma.programSchool.createMany = async () => ({ count: 1 });
    prisma.programSchool.updateMany = async () => ({ count: 0 });
    prisma.programSchool.upsert = async () => ({ id: 'ps-1' });
    prisma.parcSchoolResult.findMany = async () => [];
    prisma.auditLog.create = async () => ({ id: 'audit-1' });

    // 1. Prévia sem mapeamento manual -> status INVALIDO
    const preview = await parseParcSpreadsheet(buffer, 'teste.csv', 'ENTRADA', mockProgram.id);
    assert.equal(preview.summary.invalidRows, 1);
    assert.equal(preview.summary.validRows, 0);
    assert.equal(preview.summary.unidentifiedCount, 1);
    assert.equal(preview.rows[0].status, 'INVALIDO');

    // 2. Confirmação com mapeamento manual -> associa à escola existente sch-100 sem criar nova escola
    const manualMappings = {
      [preview.rows[0].rowNumber]: 'sch-100',
    };

    const createdResults = [];
    prisma.$transaction = async (callback) => {
      const tx = {
        parcSchoolResult: {
          create: async ({ data }) => {
            createdResults.push(data);
            return { id: 'res-1', ...data };
          },
          upsert: async ({ create }) => {
            createdResults.push(create);
            return { id: 'res-1', ...create };
          },
        },
      };
      return callback(tx);
    };

    const confirmRes = await confirmParcImport(mockProgram.id, preview.rows, 2026, null, null, false, manualMappings);
    assert.equal(confirmRes.total, 1);
    assert.equal(confirmRes.createdCount, 1);
    assert.equal(schoolCreateCalled, false, 'Nenhuma escola nova foi criada');
    assert.equal(createdResults[0].schoolId, 'sch-100');
  } finally {
    prisma.school.findMany = originalSchoolFindMany;
    prisma.school.create = originalSchoolCreate;
    prisma.program.findFirst = originalProgramFindFirst;
    prisma.programSchool.findMany = originalProgramSchoolFindMany;
    prisma.parcSchoolResult.findMany = originalParcResultFindMany;
    prisma.programSchool.createMany = originalProgramSchoolCreateMany;
    prisma.programSchool.updateMany = originalProgramSchoolUpdateMany;
    prisma.programSchool.upsert = originalProgramSchoolUpsert;
    prisma.$transaction = originalTransaction;
    prisma.auditLog.create = originalAudit;
  }
});

test('PARC: suporta Ciclos de Entrada e Saída na mesma escola sem substituição mútua', async () => {
  const mockSchool = { id: 'sch-1', inep: '15145425', name: 'E M E F ACENDENDO AS LUZES' };
  const mockProgram = {
    id: 'parc-2026',
    code: 'PARC-2026',
    name: PARC_PROGRAM_NAME,
    year: 2026,
    catalog: { id: 'cat-parc', code: 'PARC', name: PARC_PROGRAM_NAME },
  };

  const dbResults = new Map();

  const originalProgramFindFirst = prisma.program.findFirst;
  const originalSchoolFindMany = prisma.school.findMany;
  const originalSchoolFindFirst = prisma.school.findFirst;
  const originalProgramSchoolCreateMany = prisma.programSchool.createMany;
  const originalProgramSchoolUpdateMany = prisma.programSchool.updateMany;
  const originalProgramSchoolUpsert = prisma.programSchool.upsert;
  const originalParcResultFindMany = prisma.parcSchoolResult.findMany;
  const originalTransaction = prisma.$transaction;
  const originalAudit = prisma.auditLog.create;

  try {
    prisma.program.findFirst = async () => mockProgram;
    prisma.school.findMany = async () => [mockSchool];
    prisma.school.findFirst = async () => mockSchool;
    prisma.programSchool.createMany = async () => ({ count: 1 });
    prisma.programSchool.updateMany = async () => ({ count: 0 });
    prisma.programSchool.upsert = async () => ({ id: 'ps-1' });
    prisma.auditLog.create = async () => ({ id: 'audit-1' });

    prisma.parcSchoolResult.findMany = async ({ where }) => {
      const list = Array.from(dbResults.values());
      if (where?.schoolId) return list.filter((r) => r.schoolId === where.schoolId);
      return list;
    };

    prisma.$transaction = async (callback) => {
      const tx = {
        parcSchoolResult: {
          create: async ({ data }) => {
            const id = `res-${dbResults.size + 1}`;
            const rec = { id, ...data };
            dbResults.set(`${data.schoolId}_${data.cycle}`, rec);
            return rec;
          },
          update: async ({ where, data }) => {
            const existing = dbResults.get(`${data.schoolId}_${data.cycle}`);
            const updated = { ...existing, ...data };
            dbResults.set(`${data.schoolId}_${data.cycle}`, updated);
            return updated;
          },
          upsert: async ({ create, update }) => {
            const key = `${create.schoolId}_${create.cycle}`;
            if (dbResults.has(key)) {
              const updated = { ...dbResults.get(key), ...update };
              dbResults.set(key, updated);
              return updated;
            }
            const id = `res-${dbResults.size + 1}`;
            const rec = { id, ...create };
            dbResults.set(key, rec);
            return rec;
          },
        },
      };
      return callback(tx);
    };

    // 1. Importa Ciclo de Entrada
    const entradaRecords = [
      {
        status: 'VALIDO',
        matchedSchool: mockSchool,
        grade: '2º Ano',
        assessment: 'Fluência Leitora',
        cycle: 'ENTRADA',
        enrolled: 50,
        evaluated: 50,
        participationRate: 100,
        preReaderTotal: 60,
        beginnerReader: 30,
        fluentReader: 10,
      },
    ];

    const resEntrada = await confirmParcImport(mockProgram.id, entradaRecords, 2026);
    assert.equal(resEntrada.total, 1);
    assert.equal(resEntrada.createdCount, 1);
    assert.equal(dbResults.size, 1);

    // 2. Importa Ciclo de Saída para a MESMA escola (sem sobrescrever a Entrada)
    const saidaRecords = [
      {
        status: 'VALIDO',
        matchedSchool: mockSchool,
        grade: '2º Ano',
        assessment: 'Fluência Leitora',
        cycle: 'SAIDA',
        enrolled: 50,
        evaluated: 48,
        participationRate: 96,
        preReaderTotal: 15,
        beginnerReader: 25,
        fluentReader: 60,
      },
    ];

    const resSaida = await confirmParcImport(mockProgram.id, saidaRecords, 2026);
    assert.equal(resSaida.total, 1);
    assert.equal(resSaida.createdCount, 1);
    assert.equal(dbResults.size, 2, 'A escola agora possui ambos os registros Entrada e Saída');

    // 3. Consulta detalhe da escola e calcula a evolução
    const detail = await getParcSingleSchoolDetail(mockProgram.id, mockSchool.id);
    assert.ok(detail.entrada);
    assert.ok(detail.saida);
    assert.equal(detail.entrada.fluentReader, 10);
    assert.equal(detail.saida.fluentReader, 60);
    assert.equal(detail.evolution.deltaFluent, 50); // Ganho de 50 pontos percentuais de leitores fluentes
    assert.equal(detail.evolution.deltaPreReaderReduction, 45); // Redução de 45 pontos percentuais de pré-leitores

    // 4. Ranking de Evolução
    const rankingEvolution = await getParcRanking(mockProgram.id, { cycle: 'EVOLUCAO', indicator: 'DELTA_FLUENTE' });
    assert.equal(rankingEvolution.ranking.length, 1);
    assert.equal(rankingEvolution.ranking[0].deltaFluent, 50);
    assert.equal(rankingEvolution.ranking[0].badge, '🥇 1º');
  } finally {
    prisma.program.findFirst = originalProgramFindFirst;
    prisma.school.findMany = originalSchoolFindMany;
    prisma.school.findFirst = originalSchoolFindFirst;
    prisma.programSchool.createMany = originalProgramSchoolCreateMany;
    prisma.programSchool.updateMany = originalProgramSchoolUpdateMany;
    prisma.programSchool.upsert = originalProgramSchoolUpsert;
    prisma.parcSchoolResult.findMany = originalParcResultFindMany;
    prisma.$transaction = originalTransaction;
    prisma.auditLog.create = originalAudit;
  }
});

test('PARC Dashboard: calcula corretamente indicadores agregados, médias e distribuições', async () => {
  const mockSchools = [
    { id: 'sch-1', inep: '15000001', name: 'Escola 1', zone: 'URBANA', district: 'SEDE' },
    { id: 'sch-2', inep: '15000002', name: 'Escola 2', zone: 'RURAL', district: 'ZONA RURAL' },
  ];

  const mockProgram = {
    id: 'parc-prog',
    code: 'PARC-2026',
    name: PARC_PROGRAM_NAME,
    year: 2026,
    catalog: { id: 'cat-parc', code: 'PARC', name: PARC_PROGRAM_NAME },
  };

  const originalSchoolCount = prisma.school.count;
  const originalProgramFindFirst = prisma.program.findFirst;
  const originalProgramSchoolFindMany = prisma.programSchool.findMany;
  const originalParcResultFindMany = prisma.parcSchoolResult.findMany;

  try {
    prisma.school.count = async () => 170;
    prisma.program.findFirst = async () => mockProgram;
    prisma.programSchool.findMany = async () => [
      { id: 'ps-1', programId: 'parc-prog', schoolId: 'sch-1', active: true, school: mockSchools[0] },
      { id: 'ps-2', programId: 'parc-prog', schoolId: 'sch-2', active: true, school: mockSchools[1] },
    ];

    prisma.parcSchoolResult.findMany = async () => [
      {
        id: 'r1',
        programId: 'parc-prog',
        schoolId: 'sch-1',
        school: mockSchools[0],
        year: 2026,
        grade: '2º Ano',
        assessment: 'Fluência Leitora',
        cycle: 'ENTRADA',
        enrolled: 60,
        evaluated: 60,
        participationRate: 100,
        preReaderTotal: 40,
        preReaderLevel1: 10,
        preReaderLevel2: 10,
        preReaderLevel3: 10,
        preReaderLevel4: 10,
        beginnerReader: 40,
        fluentReader: 20,
        source: 'IMPORTACAO',
      },
      {
        id: 'r2',
        programId: 'parc-prog',
        schoolId: 'sch-2',
        school: mockSchools[1],
        year: 2026,
        grade: '2º Ano',
        assessment: 'Fluência Leitora',
        cycle: 'ENTRADA',
        enrolled: 40,
        evaluated: 38,
        participationRate: 95,
        preReaderTotal: 60,
        preReaderLevel1: 20,
        preReaderLevel2: 20,
        preReaderLevel3: 10,
        preReaderLevel4: 10,
        beginnerReader: 30,
        fluentReader: 10,
        source: 'IMPORTACAO',
      },
    ];

    const dashboard = await getParcDashboard('parc-prog', { cycle: 'ENTRADA' });

    assert.equal(dashboard.kpis.totalNetworkSchools, 170);
    assert.equal(dashboard.kpis.totalParticipatingSchools, 2);
    assert.equal(dashboard.kpis.totalEvaluatedSchools, 2);
    assert.equal(dashboard.kpis.totalEnrolled, 100);
    assert.equal(dashboard.kpis.totalEvaluated, 98);
    assert.equal(dashboard.kpis.participationRate, 98.0);
    assert.ok(dashboard.kpis.fluentReader > 0);
    assert.ok(dashboard.kpis.preReaderTotal > 0);
    assert.equal(dashboard.zoneBreakdown.length, 2);
  } finally {
    prisma.school.count = originalSchoolCount;
    prisma.program.findFirst = originalProgramFindFirst;
    prisma.programSchool.findMany = originalProgramSchoolFindMany;
    prisma.parcSchoolResult.findMany = originalParcResultFindMany;
  }
});

test('PARC: faz casamento e sincronização com escolas previamente importadas/cadastradas (esc.CSV)', async () => {
  const escPath = '/home/user/uploads/esc.CSV';
  const dadosPath = '/home/user/uploads/DADOS_ESCOLA 10-09-2026 2-13-40.csv';
  if (!fs.existsSync(escPath) || !fs.existsSync(dadosPath)) return;

  const escText = fs.readFileSync(escPath, 'latin1');
  const dadosBuffer = fs.readFileSync(dadosPath);

  // Simula as escolas do esc.CSV já cadastradas no CPE e participantes do PARC
  const mockSchools = [];
  const lines = escText.split(/\r?\n/);
  let idx = 1;
  for (const line of lines) {
    const parts = line.split(';');
    if (parts.length >= 2 && parts[0].trim() && parts[0].trim() !== 'INEP') {
      mockSchools.push({
        id: `sch-${idx++}`,
        inep: parts[0].trim(),
        name: parts[1].trim(),
        zone: 'URBANA',
        district: 'SEDE',
      });
    }
  }

  const mockProgram = {
    id: 'parc-2026-sync-test',
    code: 'PARC-2026',
    name: PARC_PROGRAM_NAME,
    year: 2026,
    catalog: { id: 'cat-parc', code: 'PARC', name: PARC_PROGRAM_NAME },
  };

  const originalSchoolFindMany = prisma.school.findMany;
  const originalProgramFindFirst = prisma.program.findFirst;
  const originalProgramSchoolFindMany = prisma.programSchool.findMany;
  const originalParcResultFindMany = prisma.parcSchoolResult.findMany;

  try {
    prisma.school.findMany = async () => mockSchools;
    prisma.program.findFirst = async () => mockProgram;
    prisma.programSchool.findMany = async () => mockSchools.map((s) => ({ programId: mockProgram.id, schoolId: s.id, active: true }));
    prisma.parcSchoolResult.findMany = async () => [];

    const preview = await parseParcSpreadsheet(dadosBuffer, 'DADOS_ESCOLA 10-09-2026 2-13-40.csv', 'ENTRADA', mockProgram.id);

    // Todas as 69 escolas devem ser identificadas e casadas perfeitamente com o cadastro pré-existente
    assert.equal(preview.summary.totalRows, 69);
    assert.equal(preview.summary.validRows, 69);
    assert.equal(preview.summary.invalidRows, 0);
    assert.equal(preview.summary.unidentifiedCount, 0);

    // Verifica que cada linha foi associada a um ID e INEP do esc.CSV
    for (const row of preview.rows) {
      assert.equal(row.status, 'VALIDO');
      assert.ok(row.matchedSchool?.id);
      assert.ok(row.matchedSchool?.inep);
    }
  } finally {
    prisma.school.findMany = originalSchoolFindMany;
    prisma.program.findFirst = originalProgramFindFirst;
    prisma.programSchool.findMany = originalProgramSchoolFindMany;
    prisma.parcSchoolResult.findMany = originalParcResultFindMany;
  }
});

test('PARC Persistência: executa importação em lotes/chunks controlados com pre-fetch e sem timeouts', async () => {
  const mockProgram = {
    id: 'parc-2026-chunk-prog',
    code: 'PARC-2026',
    name: PARC_PROGRAM_NAME,
    year: 2026,
    catalog: { id: 'cat-parc', code: 'PARC', name: PARC_PROGRAM_NAME },
  };

  const totalSchools = 110;
  const records = [];
  for (let i = 1; i <= totalSchools; i++) {
    records.push({
      status: 'VALIDO',
      matchedSchool: { id: `school-${i}`, inep: `150000${String(i).padStart(3, '0')}`, name: `Escola ${i}` },
      grade: '2º Ano',
      assessment: 'Fluência Leitora',
      cycle: 'ENTRADA',
      enrolled: 50,
      evaluated: 48,
      participationRate: 96.0,
      preReaderTotal: 40.0,
      beginnerReader: 40.0,
      fluentReader: 20.0,
    });
  }

  const originalProgramFindFirst = prisma.program.findFirst;
  const originalSchoolFindMany = prisma.school.findMany;
  const originalProgramSchoolCreateMany = prisma.programSchool.createMany;
  const originalProgramSchoolUpdateMany = prisma.programSchool.updateMany;
  const originalParcResultFindMany = prisma.parcSchoolResult.findMany;
  const originalTransaction = prisma.$transaction;
  const originalAudit = prisma.auditLog.create;

  let findManyCount = 0;
  let txCount = 0;
  let totalProcessed = 0;

  try {
    prisma.program.findFirst = async () => mockProgram;
    prisma.school.findMany = async () => [];
    prisma.programSchool.createMany = async ({ data }) => {
      assert.equal(data.length, totalSchools);
      return { count: totalSchools };
    };
    prisma.programSchool.updateMany = async () => ({ count: 0 });
    prisma.auditLog.create = async () => ({ id: 'audit-1' });

    prisma.parcSchoolResult.findMany = async () => {
      findManyCount++;
      return [
        { id: 'res-school-1', schoolId: 'school-1', cycle: 'ENTRADA' },
        { id: 'res-school-2', schoolId: 'school-2', cycle: 'ENTRADA' },
      ];
    };

    prisma.$transaction = async (callback, options) => {
      txCount++;
      assert.ok(options.timeout >= 20000);
      const tx = {
        parcSchoolResult: {
          findUnique: async () => {
            throw new Error('findUnique NÃO deve ser chamado na transação com pre-fetch ativo!');
          },
          update: async ({ where, data }) => {
            totalProcessed++;
            return { id: where.id, ...data };
          },
          upsert: async ({ create }) => {
            totalProcessed++;
            return { id: `new-res-${totalProcessed}`, ...create };
          },
        },
      };
      return callback(tx);
    };

    const result = await confirmParcImport(mockProgram.id, records, 2026);
    assert.equal(result.total, 110);
    assert.equal(result.createdCount, 108);
    assert.equal(result.updatedCount, 2);
    assert.equal(findManyCount, 1, 'Pre-fetch executado 1 vez');
    assert.equal(txCount, 3, '110 registros com CHUNK_SIZE=50 resultam em 3 transações');
    assert.equal(totalProcessed, 110);
  } finally {
    prisma.program.findFirst = originalProgramFindFirst;
    prisma.school.findMany = originalSchoolFindMany;
    prisma.programSchool.createMany = originalProgramSchoolCreateMany;
    prisma.programSchool.updateMany = originalProgramSchoolUpdateMany;
    prisma.parcSchoolResult.findMany = originalParcResultFindMany;
    prisma.$transaction = originalTransaction;
    prisma.auditLog.create = originalAudit;
  }
});

test('PARC Gerenciamento: participantes, exclusão individual, exclusão em lote e publicação de rascunhos', async () => {
  const mockSchool = { id: 'sch-1', inep: '15065359', name: 'Escola Modelo', zone: 'URBANA', district: 'SEDE' };
  const mockProgram = {
    id: 'parc-mgmt-prog',
    code: 'PARC-2026',
    name: PARC_PROGRAM_NAME,
    year: 2026,
    catalog: { id: 'cat-parc', code: 'PARC', name: PARC_PROGRAM_NAME },
  };

  const originalProgramFindFirst = prisma.program.findFirst;
  const originalSchoolFindMany = prisma.school.findMany;
  const originalSchoolFindFirst = prisma.school.findFirst;
  const originalSchoolCount = prisma.school.count;
  const originalProgramSchoolFindMany = prisma.programSchool.findMany;
  const originalProgramSchoolFindUnique = prisma.programSchool.findUnique;
  const originalProgramSchoolUpsert = prisma.programSchool.upsert;
  const originalProgramSchoolDelete = prisma.programSchool.delete;
  const originalProgramSchoolDeleteMany = prisma.programSchool.deleteMany;
  const originalParcResultFindMany = prisma.parcSchoolResult.findMany;
  const originalParcResultFindFirst = prisma.parcSchoolResult.findFirst;
  const originalParcResultCount = prisma.parcSchoolResult.count;
  const originalParcResultDelete = prisma.parcSchoolResult.delete;
  const originalParcResultDeleteMany = prisma.parcSchoolResult.deleteMany;
  const originalParcResultUpdateMany = prisma.parcSchoolResult.updateMany;
  const originalAudit = prisma.auditLog.create;

  try {
    prisma.program.findFirst = async () => mockProgram;
    prisma.school.findMany = async () => [mockSchool];
    prisma.school.findFirst = async () => mockSchool;
    prisma.school.count = async () => 170;
    prisma.programSchool.findMany = async () => [{ programId: mockProgram.id, schoolId: mockSchool.id, active: true, school: mockSchool }];
    prisma.parcSchoolResult.findMany = async () => [];
    prisma.auditLog.create = async () => ({ id: 'audit-1' });

    // 1. Participantes
    const participants = await getParcParticipatingSchools(mockProgram.id);
    assert.equal(participants.totalNetworkSchools, 170);
    assert.equal(participants.totalParticipatingSchools, 1);

    // 2. Adição de participante
    prisma.programSchool.upsert = async ({ create }) => ({ id: 'link-1', ...create });
    const addRes = await addParcParticipatingSchool(mockProgram.id, mockSchool.id);
    assert.ok(addRes.success);

    // 3. Remoção de participante
    prisma.programSchool.findUnique = async () => ({ programId: mockProgram.id, schoolId: mockSchool.id });
    prisma.programSchool.delete = async () => ({ programId: mockProgram.id, schoolId: mockSchool.id });
    const removeRes = await removeParcParticipatingSchool(mockProgram.id, mockSchool.id);
    assert.ok(removeRes.success);

    // 4. Remoção em lote
    prisma.programSchool.deleteMany = async () => ({ count: 1 });
    const bulkRemoveRes = await bulkRemoveParcParticipatingSchools(mockProgram.id, { schoolIds: [mockSchool.id] });
    assert.equal(bulkRemoveRes.removedCount, 1);

    // 5. Publicação de rascunhos
    prisma.parcSchoolResult.updateMany = async () => ({ count: 5 });
    const pubRes = await publishParcSchoolResults(mockProgram.id, { cycle: 'ENTRADA' });
    assert.equal(pubRes.updatedCount, 5);

    // 6. Exclusão individual
    prisma.parcSchoolResult.findFirst = async () => ({ id: 'res-1', programId: mockProgram.id, school: mockSchool, cycle: 'ENTRADA' });
    prisma.parcSchoolResult.delete = async () => ({ id: 'res-1' });
    const delRes = await deleteParcSchoolResult(mockProgram.id, 'res-1');
    assert.ok(delRes.success);

    // 7. Exclusão em lote por IDs específicos e por ciclo
    prisma.parcSchoolResult.count = async () => 10;
    prisma.parcSchoolResult.deleteMany = async ({ where }) => {
      if (where.id?.in) {
        return { count: where.id.in.length };
      }
      return { count: 10 };
    };
    const bulkDelResIds = await bulkDeleteParcSchoolResults(mockProgram.id, { resultIds: ['r1', 'r2', 'r3'] });
    assert.equal(bulkDelResIds.deletedCount, 3);

    const bulkDelResCycle = await bulkDeleteParcSchoolResults(mockProgram.id, { cycle: 'ENTRADA' });
    assert.equal(bulkDelResCycle.deletedCount, 10);
  } finally {
    prisma.program.findFirst = originalProgramFindFirst;
    prisma.school.findMany = originalSchoolFindMany;
    prisma.school.findFirst = originalSchoolFindFirst;
    prisma.school.count = originalSchoolCount;
    prisma.programSchool.findMany = originalProgramSchoolFindMany;
    prisma.programSchool.findUnique = originalProgramSchoolFindUnique;
    prisma.programSchool.upsert = originalProgramSchoolUpsert;
    prisma.programSchool.delete = originalProgramSchoolDelete;
    prisma.programSchool.deleteMany = originalProgramSchoolDeleteMany;
    prisma.parcSchoolResult.findMany = originalParcResultFindMany;
    prisma.parcSchoolResult.findFirst = originalParcResultFindFirst;
    prisma.parcSchoolResult.count = originalParcResultCount;
    prisma.parcSchoolResult.delete = originalParcResultDelete;
    prisma.parcSchoolResult.deleteMany = originalParcResultDeleteMany;
    prisma.parcSchoolResult.updateMany = originalParcResultUpdateMany;
    prisma.auditLog.create = originalAudit;
  }
});
