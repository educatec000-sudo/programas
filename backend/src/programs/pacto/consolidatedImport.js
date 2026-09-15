import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import xlsx from 'xlsx';
import { prisma } from '../../lib/prisma.js';
import { audit, AuditAction } from '../../lib/audit.js';
import { HttpError } from '../../lib/errors.js';
import {
  PACTO_PROGRAM_CODE,
  PACTO_PROGRAM_YEAR,
} from './config.js';

/**
 * Normaliza strings para comparação insensível a acentos e maiúsculas/minúsculas.
 */
export function normalizePactoText(val) {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza o código INEP removendo caracteres não numéricos.
 */
export function normalizeInep(val) {
  if (val == null) return null;
  const clean = String(val).replace(/\D/g, '').trim();
  return clean.length >= 6 ? clean : null;
}

/**
 * Normaliza o nome da escola para casamento seguro.
 */
export function normalizeSchoolName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\uFFFD/g, ' ')
    .toLowerCase()
    .replace(
      /\b(e\s*\.?\s*m\s*\.?\s*e\s*\.?\s*i\s*\.?\s*e\s*\.?\s*f\s*\.?|e\s*\.?\s*m\s*\.?\s*e\s*\.?\s*i\s*\.?\s*f\s*\.?|e\s*\.?\s*m\s*\.?\s*e\s*\.?\s*f\s*\.?|e\s*\.?\s*e\s*\.?\s*e\s*\.?\s*f\s*\.?\s*m\s*\.?|emeief|emeif|emef|eeefm|escola|municipal|estadual|colegio|col|unidade\s*escolar|ue|creche)\b/gi,
      ' ',
    )
    .replace(/\b(prof\s*\.?|profa\s*\.?|profª\s*\.?|professor\s*|professora\s*)\b/gi, ' ')
    .replace(/\b(dr\s*\.?|dra\s*\.?|drª\s*\.?|doutor\s*|doutora\s*)\b/gi, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai o código INEP embutido no nome da escola (ex.: "E M E F ACENDENDO AS LUZES 15145425").
 */
export function extractInepFromSchoolText(text) {
  if (!text) return null;
  const match = String(text).match(/(\d{7,8})/);
  return match ? match[1] : null;
}

/**
 * Converte valores para número inteiro seguro.
 */
export function parsePactoInteger(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? Math.round(val) : null;
  const clean = String(val).replace(/%/g, '').replace(/\./g, '').trim();
  const num = parseInt(clean, 10);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parse manual de linhas de CSV com suporte a delimitadores (;, ,, \t).
 */
export function parseCsvToRows(text) {
  if (!text) return [];
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const sample = lines.slice(0, 10).join('\n');
  const countSemi = (sample.match(/;/g) || []).length;
  const countComma = (sample.match(/,/g) || []).length;
  const countTab = (sample.match(/\t/g) || []).length;

  let delimiter = ';';
  if (countComma > countSemi && countComma > countTab) delimiter = ',';
  else if (countTab > countSemi && countTab > countComma) delimiter = '\t';

  const rows = [];
  for (const line of lines) {
    const row = [];
    let curr = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          curr += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        row.push(curr.trim());
        curr = '';
      } else {
        curr += char;
      }
    }
    row.push(curr.trim());
    if (row.some((c) => c !== '')) {
      rows.push(row);
    }
  }
  return rows;
}

/**
 * Lê e decodifica arquivo CSV ou XLSX com suporte a múltiplos encodings.
 */
export function readConsolidatedSpreadsheet(fileBuffer, originalFilename = '') {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('O arquivo enviado está vazio.');
  }

  const isCsv = String(originalFilename).toLowerCase().endsWith('.csv') || String(originalFilename).toLowerCase().endsWith('.tsv');
  const isZip = fileBuffer.length >= 4 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b;
  const isOle = fileBuffer.length >= 8 && fileBuffer[0] === 0xd0 && fileBuffer[1] === 0xcf;

  if (isCsv || (!isZip && !isOle)) {
    const encodings = ['utf-8', 'windows-1252', 'iso-8859-1'];
    for (const enc of encodings) {
      try {
        const decoder = new TextDecoder(enc);
        const text = decoder.decode(fileBuffer);
        const rows = parseCsvToRows(text);
        if (rows.length >= 1) {
          return rows;
        }
      } catch {
        // Tenta próximo encoding
      }
    }
  }

  try {
    const workbook = xlsx.read(fileBuffer, { type: 'buffer', cellDates: false, raw: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(firstSheet, { header: 1, defval: '', blankrows: false, raw: true });
    if (rows && rows.length > 0) return rows;
  } catch {
    // Continua para fallback
  }

  const decoder = new TextDecoder('latin1');
  const text = decoder.decode(fileBuffer);
  return parseCsvToRows(text);
}

/**
 * Detecta o componente curricular do arquivo a partir dos cabeçalhos das colunas.
 */
export function detectConsolidatedComponent(headers) {
  const normHeaders = headers.map((h) => normalizePactoText(h));
  const fullText = normHeaders.join(' ');

  const hasLpCols = normHeaders.some((h) => (
    h.includes('pl') || h.includes('li') || h.includes('lf')
    || h.includes('nc') || h.includes('co') || h.includes('ca')
    || h.includes('pa') || h.includes('ai') || h.includes('ac')
    || h.includes('leitura') || h.includes('escrita') || h.includes('oralidade')
  ));

  const hasMatCols = normHeaders.some((h) => (
    h.includes('np') || h.includes('pi') || h.includes('alunos p')
    || h.includes('avmat') || h.includes('matematica') || h.includes('proficiencia')
  ));

  if (hasLpCols && !hasMatCols) return 'PORTUGUES';
  if (hasMatCols && !hasLpCols) return 'MATEMATICA';

  if (hasLpCols && hasMatCols) {
    if (fullText.includes('avmat') || fullText.includes('alunos np')) return 'MATEMATICA';
    return 'PORTUGUES';
  }

  return 'PORTUGUES';
}

/**
 * Parse do código de avaliação (A0, A1, A2, A3).
 */
export function parseAssessmentCode(val) {
  const raw = String(val || '').trim().toUpperCase();
  if (['A0', 'A1', 'A2', 'A3'].includes(raw)) return raw;
  if (raw === '0') return 'A0';
  if (['1', '2', '3'].includes(raw)) return `A${raw}`;
  if (raw.includes('A1') || raw.includes('1')) return 'A1';
  if (raw.includes('A2') || raw.includes('2')) return 'A2';
  if (raw.includes('A3') || raw.includes('3')) return 'A3';
  if (raw.includes('A0') || raw.includes('0') || raw.includes('DIAGNOSTICA')) return 'A0';
  return 'A1';
}

/**
 * Parse do ano escolar (PII = 0, 1º ano = 1, 2º ano = 2).
 */
export function parseGradeValue(val) {
  const norm = normalizePactoText(val);
  if (norm.includes('pii') || norm.includes('pre') || norm.includes('infantil')) return 0;
  if (norm.includes('2') || norm.includes('segundo')) return 2;
  return 1; // Default 1º Ano
}

/**
 * Processa a planilha consolidada municipal do Pacto pela Alfabetização e gera a prévia completa.
 */
export async function previewConsolidatedPactoImport(programId, file, options = {}) {
  const fileBuffer = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
  if (!fileBuffer) {
    throw new HttpError(400, 'Arquivo não fornecido ou ilegível.', 'PACTO_IMPORT_FILE_REQUIRED');
  }

  const originalFilename = file.originalname || file.name || 'planilha-pacto-2026.csv';
  const rows = readConsolidatedSpreadsheet(fileBuffer, originalFilename);

  if (!rows || rows.length < 2) {
    throw new HttpError(400, 'A planilha não contém linhas de dados suficientes.', 'PACTO_IMPORT_EMPTY');
  }

  // Cabeçalho
  const headers = rows[0].map((c) => String(c || '').trim());
  const colIdx = {};
  headers.forEach((h, idx) => {
    colIdx[normalizePactoText(h)] = idx;
  });

  const getCol = (cols, ...names) => {
    for (const n of names) {
      const idx = colIdx[normalizePactoText(n)];
      if (idx !== undefined && cols[idx] !== undefined) return String(cols[idx]).trim();
    }
    return '';
  };

  const detectedComponent = detectConsolidatedComponent(headers);

  // Busca escolas cadastradas no CPE para conciliação
  const dbSchools = await prisma.school.findMany({
    where: { deletedAt: null },
    select: { id: true, inep: true, name: true },
  });

  const inepMap = new Map();
  const nameMap = new Map();
  for (const s of dbSchools) {
    if (s.inep) inepMap.set(normalizeInep(s.inep), s);
    nameMap.set(normalizeSchoolName(s.name), s);
  }

  const validRecords = [];
  const skippedRecords = [];
  const matchedSchoolsSet = new Map();
  const unmatchedSchoolsSet = new Map();
  const detectedAssessments = new Set();
  const detectedClasses = new Set();

  let totalEnrolled = 0;
  let totalEvaluated = 0;

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || cols.length < 3) continue;

    const rawSchool = getCol(cols, 'Escolas', 'Escola', 'Nome Escola', 'Nome da Escola', 'Unidade');
    if (!rawSchool) continue;

    const inepInText = extractInepFromSchoolText(rawSchool);
    let cleanSchoolName = rawSchool;
    if (inepInText) {
      cleanSchoolName = cleanSchoolName.replace(new RegExp(`\\s*${inepInText}\\s*$`), '').trim();
    }

    let matchedSchool = null;
    if (inepInText && inepMap.has(normalizeInep(inepInText))) {
      matchedSchool = inepMap.get(normalizeInep(inepInText));
    } else if (nameMap.has(normalizeSchoolName(cleanSchoolName))) {
      matchedSchool = nameMap.get(normalizeSchoolName(cleanSchoolName));
    }

    if (matchedSchool) {
      matchedSchoolsSet.set(matchedSchool.id, matchedSchool);
    } else {
      unmatchedSchoolsSet.set(rawSchool, {
        rawSchool,
        cleanName: cleanSchoolName,
        inep: inepInText,
      });
    }

    const codA = getCol(cols, 'CodA', 'Cod A', 'Avaliacao', 'Avaliação', 'Cod_A', 'Etapa');
    const anoRaw = getCol(cols, 'Ano', 'Ano escolar', 'Serie', 'Série', 'Etapa');
    const turnoRaw = getCol(cols, 'Turno', 'Horario', 'Horário', 'Periodo') || 'M';
    const turmaRaw = getCol(cols, 'Turma', 'Classe', 'Nome Turma') || 'A';
    const matStr = getCol(cols, 'Nº mat', 'No mat', 'Matriculados', 'Mat');
    const avalStr = getCol(cols, 'Nº aval', 'No aval', 'Avaliados', 'Aval');

    const enrolled = parsePactoInteger(matStr);
    const evaluated = parsePactoInteger(avalStr);

    // Linhas vazias ou sem dados de avaliação (ex.: A3 sem preenchimento) são ignoradas com segurança
    if (!codA || (enrolled == null && evaluated == null) || (enrolled === 0 && evaluated === 0)) {
      skippedRecords.push({
        row: i + 1,
        school: cleanSchoolName,
        assessment: codA || 'N/A',
        reason: 'Sem dados de alunos matriculados/avaliados (linha de planejamento futuro)',
      });
      continue;
    }

    const assessmentCode = parseAssessmentCode(codA);
    const grade = parseGradeValue(anoRaw);
    const shift = (turnoRaw.toUpperCase().charAt(0) === 'T' ? 'T' : 'M');
    const className = turmaRaw.toUpperCase().trim() || 'A';

    detectedAssessments.add(assessmentCode);
    const classKey = `${matchedSchool?.id || cleanSchoolName}_${grade}_${shift}_${className}`;
    detectedClasses.add(classKey);

    const safeEnrolled = enrolled || 0;
    const safeEvaluated = evaluated || 0;
    totalEnrolled += safeEnrolled;
    totalEvaluated += safeEvaluated;

    const record = {
      rowNumber: i + 1,
      schoolName: matchedSchool?.name || cleanSchoolName,
      schoolInep: matchedSchool?.inep || inepInText || '',
      schoolId: matchedSchool?.id || null,
      matchedSchool: matchedSchool ? { id: matchedSchool.id, inep: matchedSchool.inep, name: matchedSchool.name } : null,
      grade,
      shift,
      className,
      assessment: assessmentCode,
      component: detectedComponent,
      enrolled: safeEnrolled,
      evaluated: safeEvaluated,
      status: matchedSchool ? 'IDENTIFICADA' : 'CRIAR_VINCULAR',
      results: [],
      displaySkills: {},
    };

    if (detectedComponent === 'PORTUGUES') {
      const pl = parsePactoInteger(getCol(cols, 'Nº PL', 'No PL', 'PL')) || 0;
      const li = parsePactoInteger(getCol(cols, 'Nº LI', 'No LI', 'LI')) || 0;
      const lf = parsePactoInteger(getCol(cols, 'Nº LF', 'No LF', 'LF')) || 0;

      const nc = parsePactoInteger(getCol(cols, 'Nº NC', 'No NC', 'NC')) || 0;
      const co = parsePactoInteger(getCol(cols, 'Nº CO', 'No CO', 'CO')) || 0;
      const ca = parsePactoInteger(getCol(cols, 'Nº CA', 'No CA', 'CA')) || 0;

      const pa = parsePactoInteger(getCol(cols, 'Nº PA', 'No PA', 'PA')) || 0;
      const ai = parsePactoInteger(getCol(cols, 'Nº AI', 'No AI', 'AI')) || 0;
      const ac = parsePactoInteger(getCol(cols, 'Nº AC', 'No AC', 'AC')) || 0;

      record.results = [
        { skill: 'LEITURA', level: 'PRE_LEITOR', count: pl },
        { skill: 'LEITURA', level: 'LEITOR_INICIAL', count: li },
        { skill: 'LEITURA', level: 'LEITOR_FLUENTE', count: lf },
        { skill: 'COMPREENSAO_TEXTO', level: 'NAO_COMPREENDE', count: nc },
        { skill: 'COMPREENSAO_TEXTO', level: 'COMPREENDE_ORALIDADE', count: co },
        { skill: 'COMPREENSAO_TEXTO', level: 'COMPREENDE_AUTONOMAMENTE', count: ca },
        { skill: 'ESCRITA', level: 'PRE_ALFABETICO', count: pa },
        { skill: 'ESCRITA', level: 'ALFABETICO_INICIAL', count: ai },
        { skill: 'ESCRITA', level: 'ALFABETICO_COMPLETO', count: ac },
      ];

      record.displaySkills = {
        leitura: `PL: ${pl} · LI: ${li} · LF: ${lf}`,
        compreensao: `NC: ${nc} · CO: ${co} · CA: ${ca}`,
        escrita: `PA: ${pa} · AI: ${ai} · AC: ${ac}`,
      };
    } else if (detectedComponent === 'MATEMATICA') {
      const np = parsePactoInteger(getCol(cols, 'Nº alunos NP', 'No alunos NP', 'NP', 'Nº NP')) || 0;
      const pi = parsePactoInteger(getCol(cols, 'Nº alunos PI', 'No alunos PI', 'PI', 'Nº PI')) || 0;
      const p = parsePactoInteger(getCol(cols, 'Nº alunos P', 'No alunos P', 'P', 'Nº P')) || 0;

      record.results = [
        { skill: 'PROFICIENCIA_MATEMATICA', level: 'NAO_PROFICIENTE', count: np },
        { skill: 'PROFICIENCIA_MATEMATICA', level: 'PROFICIENTE_INICIAL', count: pi },
        { skill: 'PROFICIENCIA_MATEMATICA', level: 'PROFICIENTE', count: p },
      ];

      record.displaySkills = {
        proficiencia: `NP: ${np} · PI: ${pi} · P: ${p}`,
      };
    }

    validRecords.push(record);
  }

  const participationRate = totalEnrolled > 0
    ? Math.round((totalEvaluated / totalEnrolled) * 1000) / 10
    : 100;

  return {
    file: {
      name: originalFilename,
      size: `${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB`,
      totalRows: rows.length - 1,
    },
    component: detectedComponent,
    componentLabel: detectedComponent === 'PORTUGUES' ? 'Língua Portuguesa' : 'Matemática',
    assessments: Array.from(detectedAssessments).sort(),
    summary: {
      totalRows: rows.length - 1,
      validRows: validRecords.length,
      skippedRows: skippedRecords.length,
      schoolsCount: matchedSchoolsSet.size + unmatchedSchoolsSet.size,
      identifiedSchoolsCount: matchedSchoolsSet.size,
      unidentifiedSchoolsCount: unmatchedSchoolsSet.size,
      classesCount: detectedClasses.size,
      totalEnrolled,
      totalEvaluated,
      participationRate,
    },
    previewRows: validRecords.slice(0, 100),
    records: validRecords,
  };
}

/**
 * Persiste todos os registros da importação consolidada municipal do Pacto em chunks seguros.
 */
export async function confirmConsolidatedPactoImport(programId, payload, actor, ip) {
  const records = Array.isArray(payload) ? payload : payload.records || [];
  if (!records.length) {
    throw new HttpError(400, 'Nenhum registro válido para importar.', 'PACTO_IMPORT_EMPTY');
  }

  // Busca programa Pacto
  const program = await prisma.program.findFirst({
    where: {
      id: programId,
      code: PACTO_PROGRAM_CODE,
      deletedAt: null,
    },
  });

  const targetProgramId = program?.id || programId;

  // 1. Reconciliação / Criação de Escolas
  const allSchools = await prisma.school.findMany({
    where: { deletedAt: null },
    select: { id: true, inep: true, name: true },
  });

  const schoolByInep = new Map();
  const schoolByName = new Map();
  for (const s of allSchools) {
    if (s.inep) schoolByInep.set(normalizeInep(s.inep), s);
    schoolByName.set(normalizeSchoolName(s.name), s);
  }

  const schoolMap = new Map(); // key -> schoolId
  const uniqueSchoolsToLink = new Set();

  for (const r of records) {
    let resolvedSchool = null;
    const inepClean = normalizeInep(r.schoolInep);

    if (inepClean && schoolByInep.has(inepClean)) {
      resolvedSchool = schoolByInep.get(inepClean);
    } else if (schoolByName.has(normalizeSchoolName(r.schoolName))) {
      resolvedSchool = schoolByName.get(normalizeSchoolName(r.schoolName));
    } else {
      // Cria escola se não existir para preservar dados municipais
      try {
        const createdSchool = await prisma.school.create({
          data: {
            name: r.schoolName,
            inep: inepClean || `TEMP_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            active: true,
          },
        });
        resolvedSchool = createdSchool;
        if (createdSchool.inep) schoolByInep.set(normalizeInep(createdSchool.inep), createdSchool);
        schoolByName.set(normalizeSchoolName(createdSchool.name), createdSchool);
      } catch {
        // Fallback para encontrar escola recém criada em concorrência
        resolvedSchool = await prisma.school.findFirst({
          where: { name: r.schoolName },
        });
      }
    }

    if (resolvedSchool) {
      r.schoolId = resolvedSchool.id;
      schoolMap.set(`${r.schoolName}_${r.schoolInep}`, resolvedSchool.id);
      uniqueSchoolsToLink.add(resolvedSchool.id);
    }
  }

  // 2. Vincula escolas participantes ao programa Pacto em ProgramSchool
  const schoolIdsArray = Array.from(uniqueSchoolsToLink);
  for (const schoolId of schoolIdsArray) {
    try {
      await prisma.programSchool.upsert({
        where: {
          programId_schoolId: {
            programId: targetProgramId,
            schoolId,
          },
        },
        create: {
          programId: targetProgramId,
          schoolId,
          active: true,
        },
        update: { active: true },
      });
    } catch {
      // Ignora erro de corrida
    }
  }

  // 3. Processamento em Lotes (Chunks) de Turmas, Avaliações e Resultados
  let createdClassesCount = 0;
  let updatedClassesCount = 0;
  let importedAssessmentsCount = 0;
  const CHUNK_SIZE = 50;

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);

    await prisma.$transaction(async (tx) => {
      for (const rec of chunk) {
        if (!rec.schoolId) continue;

        // Upsert PactoClass
        const pactoClass = await tx.pactoClass.upsert({
          where: {
            programId_schoolId_grade_shift_name: {
              programId: targetProgramId,
              schoolId: rec.schoolId,
              grade: rec.grade,
              shift: rec.shift,
              name: rec.className,
            },
          },
          create: {
            programId: targetProgramId,
            schoolId: rec.schoolId,
            grade: rec.grade,
            shift: rec.shift,
            name: rec.className,
            source: 'ADMINISTRADOR',
            enabledAssessments: ['A0', 'A1', 'A2', 'A3'],
            active: true,
          },
          update: { active: true },
        });

        if (pactoClass.createdAt.getTime() === pactoClass.updatedAt.getTime()) {
          createdClassesCount++;
        } else {
          updatedClassesCount++;
        }

        // Upsert PactoAssessment
        const assessment = await tx.pactoAssessment.upsert({
          where: {
            classId_code: {
              classId: pactoClass.id,
              code: rec.assessment,
            },
          },
          create: {
            classId: pactoClass.id,
            code: rec.assessment,
            status: 'ENVIADO',
            submittedAt: new Date(),
          },
          update: {
            status: 'ENVIADO',
            submittedAt: new Date(),
          },
        });

        importedAssessmentsCount++;

        // Upsert PactoAssessmentComponent (PORTUGUES ou MATEMATICA)
        const componentRow = await tx.pactoAssessmentComponent.upsert({
          where: {
            assessmentId_component: {
              assessmentId: assessment.id,
              component: rec.component,
            },
          },
          create: {
            assessmentId: assessment.id,
            component: rec.component,
            enrolled: rec.enrolled,
            evaluated: rec.evaluated,
          },
          update: {
            enrolled: rec.enrolled,
            evaluated: rec.evaluated,
          },
        });

        // Limpa e grava os resultados de habilidades detalhados
        if (rec.results && rec.results.length > 0) {
          await tx.pactoSkillResult.deleteMany({
            where: { componentId: componentRow.id },
          });

          await tx.pactoSkillResult.createMany({
            data: rec.results.map((res) => ({
              componentId: componentRow.id,
              skill: res.skill,
              level: res.level,
              count: res.count,
            })),
          });
        }
      }
    }, { maxWait: 15_000, timeout: 60_000 });
  }

  // 4. Auditoria
  await audit({
    userId: actor?.id,
    userName: actor?.name || 'Administrador',
    action: AuditAction.IMPORT_CONFIRM,
    entity: 'PactoAssessment',
    entityId: targetProgramId,
    metadata: {
      operation: 'IMPORT_CONSOLIDATED_PACTO_MUNICIPAL',
      programId: targetProgramId,
      totalRecords: records.length,
      importedSchoolsCount: uniqueSchoolsToLink.size,
      importedAssessmentsCount,
    },
    ip,
  });

  return {
    success: true,
    programId: targetProgramId,
    totalRecords: records.length,
    importedSchoolsCount: uniqueSchoolsToLink.size,
    createdClassesCount,
    updatedClassesCount,
    importedAssessmentsCount,
  };
}
