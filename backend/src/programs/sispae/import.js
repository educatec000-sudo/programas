import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';
import { prisma } from '../../lib/prisma.js';
import { audit, AuditAction } from '../../lib/audit.js';
import {
  SISPAE_COMPONENTS,
  SISPAE_CATALOG_CODE,
  SISPAE_DEFAULT_YEAR,
  detectSispaeComponent,
  detectSispaeApplicationType,
  normalizeSispaeText,
} from './config.js';

/**
 * Dimensões que DEVEM SER COMPLETAMENTE IGNORADAS no SisPAE:
 * - REDE
 * - ESTADO / UF
 * - REGIONAL / DRE
 * - MUNICÍPIO / CIDADE / IBGE
 */
const IGNORED_COLUMN_NAMES = new Set([
  'rede',
  'tipo_rede',
  'rede_ensino',
  'tipo de rede',
  'rede de ensino',
  'estado',
  'uf',
  'cd_uf',
  'nm_uf',
  'sg_uf',
  'sigla_uf',
  'regional',
  'nm_regional',
  'cd_regional',
  'dre',
  'polo',
  'municipio',
  'município',
  'nm_municipio',
  'cd_municipio',
  'ds_municipio',
  'nome_municipio',
  'nome do municipio',
  'nome municipio',
  'cidade',
  'nm_cidade',
  'ds_cidade',
  'nome_cidade',
  'nome da cidade',
  'cod_municipio',
  'codigo_municipio',
  'cod_ibge',
  'ibge',
  'codigo_ibge',
  'cd_ibge',
]);

export function isIgnoredColumn(headerName) {
  const norm = normalizeSispaeText(headerName);
  if (IGNORED_COLUMN_NAMES.has(norm)) return true;
  if (
    norm === 'municipio' ||
    norm === 'cidade' ||
    norm === 'uf' ||
    norm === 'estado' ||
    norm === 'rede' ||
    norm === 'regional' ||
    norm === 'dre'
  ) {
    return true;
  }
  return false;
}

/**
 * Utilitário de conversão de números suportando padrões pt-BR e EN,
 * porcentagens com símbolo %, decimais implícitas e valores textuais.
 */
export function parseSispaeNumber(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const str = String(val).trim().replace(/%/g, '').trim();
  if (
    !str ||
    str === '-' ||
    str === '—' ||
    str === 'N/A' ||
    str === 'NaN' ||
    str === 'null' ||
    str === 'undefined'
  ) {
    return null;
  }

  // Se contiver vírgula e ponto (ex: 1.234,56 ou 1,234.56)
  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf(',') > str.indexOf('.')) {
      // Formato brasileiro: 1.234,56
      const clean = str.replace(/\./g, '').replace(',', '.');
      const num = parseFloat(clean);
      return Number.isFinite(num) ? num : null;
    } else {
      // Formato americano: 1,234.56
      const clean = str.replace(/,/g, '');
      const num = parseFloat(clean);
      return Number.isFinite(num) ? num : null;
    }
  }

  // Se contiver apenas vírgula (ex: 78,5)
  if (str.includes(',')) {
    const num = parseFloat(str.replace(',', '.'));
    return Number.isFinite(num) ? num : null;
  }

  const num = parseFloat(str);
  return Number.isFinite(num) ? num : null;
}

/**
 * Normaliza o código INEP removendo pontuações, espaços e caracteres não numéricos.
 */
export function normalizeInep(val) {
  if (val == null) return null;
  const clean = String(val).replace(/\D/g, '').trim();
  return clean.length >= 6 ? clean : null;
}

/**
 * Extrai código INEP embutido no nome da escola (ex: "E M E F ACENDENDO AS LUZES - 15145425", "ESCOLA SANTA MARIA (15064255)").
 */
export function extractInepFromSchoolText(text) {
  if (!text) return null;
  const match = String(text).match(/(?:[-–—/:\s(]|^)(\d{7,8})(?:[-–—/:\s)]|$)/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

/**
 * Normaliza o nome da escola para correspondência segura quando o INEP não estiver presente.
 * Remove prefixos comuns (E.M.E.F., E M E F, EMEF, E.M.E.I.E.F., E M E I E F, Creche, etc.), acentos, pontuações e espaços múltiplos.
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
 * Parser de linhas de CSV com suporte a delimitadores comuns (;, ,, \t, |) e aspas duplas escapadas.
 */
export function parseCsvToRows(text) {
  if (!text) return [];
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const sample = lines.slice(0, 10).join('\n');
  const countSemi = (sample.match(/;/g) || []).length;
  const countComma = (sample.match(/,/g) || []).length;
  const countTab = (sample.match(/\t/g) || []).length;

  let delimiter = ',';
  if (countSemi >= countComma && countSemi >= countTab) delimiter = ';';
  else if (countTab > countComma && countTab > countSemi) delimiter = '\t';

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
 * Lê e decodifica planilhas nos formatos XLSX, XLS ou CSV com suporte a múltiplos encodings (UTF-8, Windows-1252, ISO-8859-1).
 * Aceita Buffer, caminho de arquivo em disco ou objeto de arquivo Multer.
 */
export function readSpreadsheetSheets(fileInput, originalFilename = '') {
  let fileBuffer = fileInput;
  let filename = originalFilename;

  if (fileInput && typeof fileInput === 'object' && !Buffer.isBuffer(fileInput)) {
    if (fileInput.originalname && !filename) filename = fileInput.originalname;
    if (fileInput.buffer) fileBuffer = fileInput.buffer;
    else if (fileInput.path && fs.existsSync(fileInput.path)) fileBuffer = fs.readFileSync(fileInput.path);
  } else if (typeof fileInput === 'string' && fs.existsSync(fileInput)) {
    if (!filename) filename = path.basename(fileInput);
    fileBuffer = fs.readFileSync(fileInput);
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('O arquivo enviado está vazio.');
  }

  const isCsv =
    String(filename).toLowerCase().endsWith('.csv') ||
    String(filename).toLowerCase().endsWith('.tsv');
  const isZip =
    fileBuffer.length >= 4 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b;
  const isOle =
    fileBuffer.length >= 8 && fileBuffer[0] === 0xd0 && fileBuffer[1] === 0xcf;

  const sheets = [];

  // 1. CSV ou texto simples
  if (isCsv || (!isZip && !isOle)) {
    const encodings = ['utf-8', 'windows-1252', 'iso-8859-1'];
    for (const enc of encodings) {
      try {
        const decoder = new TextDecoder(enc);
        const text = decoder.decode(fileBuffer);
        const rows = parseCsvToRows(text);
        if (rows.length >= 1) {
          sheets.push({
            sheetName: filename.replace(/\.[^/.]+$/, '') || 'Planilha',
            rows,
          });
          break;
        }
      } catch {
        // Tenta próximo
      }
    }
  }

  // 2. Excel (XLSX / XLS)
  if (!sheets.length && (isZip || isOle || !isCsv)) {
    try {
      const workbook = xlsx.read(fileBuffer, { type: 'buffer', cellDates: false, raw: true });
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
          blankrows: false,
          raw: true,
        });
        if (rows && rows.length > 0) {
          const isSingleColWithDelimiters =
            rows.length > 1 &&
            rows.every((r) => r.length <= 1) &&
            rows.some((r) => String(r[0] || '').includes(';'));
          if (!isSingleColWithDelimiters) {
            sheets.push({ sheetName, rows });
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  // 3. Fallback CSV geral
  if (!sheets.length) {
    const encodings = ['utf-8', 'windows-1252', 'iso-8859-1'];
    for (const enc of encodings) {
      try {
        const decoder = new TextDecoder(enc);
        const text = decoder.decode(fileBuffer);
        const rows = parseCsvToRows(text);
        if (rows.length >= 1) {
          sheets.push({
            sheetName: filename.replace(/\.[^/.]+$/, '') || 'Planilha',
            rows,
          });
          break;
        }
      } catch {
        // Ignora
      }
    }
  }

  if (!sheets.length) {
    throw new Error(
      'Nenhuma folha de dados legível encontrada no arquivo. Verifique o formato (.csv ou .xlsx).',
    );
  }

  return sheets;
}

/**
 * Localiza a linha do cabeçalho procurando por termos-chave estruturais do SisPAE / Simulado.
 */
export function findHeaderRowIndex(rows) {
  const keywords = [
    'inep',
    'escola',
    'matriculados',
    'avaliados',
    'participacao',
    'participação',
    'defasagem',
    'intermediario',
    'intermediário',
    'adequado',
    'proficiencia',
    'proficiência',
    'h01',
    'h 01',
    'h1',
    'd01',
    'ano',
    'componente',
  ];

  let bestIdx = 0;
  let maxScore = -1;

  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const rowText = row.map((c) => normalizeSispaeText(c)).join(' ');
    let score = 0;
    for (const kw of keywords) {
      if (rowText.includes(kw)) score += 2;
    }
    if (
      (rowText.includes('inep') ||
        rowText.includes('codigo') ||
        rowText.includes('escola') ||
        rowText.includes('rede')) &&
      (rowText.includes('avaliados') ||
        rowText.includes('defasagem') ||
        rowText.includes('h 01') ||
        rowText.includes('participacao'))
    ) {
      score += 5;
    }
    if (score > maxScore) {
      maxScore = score;
      bestIdx = i;
    }
  }

  return maxScore >= 2 ? bestIdx : 0;
}

/**
 * Mapeia colunas da planilha oficial para a estrutura do SisPAE.
 */
export function mapRowColumns(headers) {
  const mapping = {
    inep: -1,
    schoolName: -1,
    grade: -1,
    component: -1,
    enrolled: -1,
    evaluated: -1,
    participationRate: -1,
    averageScore: -1,
    levels: [], // { name, colIdx }
    skills: [], // { code, label, colIdx }
    otherCols: [],
  };

  headers.forEach((header, idx) => {
    const norm = normalizeSispaeText(header);
    if (!norm) return;

    // Colunas ignoradas
    if (isIgnoredColumn(header)) return;

    // 1. INEP / Código da Escola
    if (
      mapping.inep === -1 &&
      (norm === 'inep' ||
        norm === 'cod inep' ||
        norm === 'codigo inep' ||
        norm.includes('cod_inep') ||
        norm.includes('codigo_inep') ||
        norm.includes('cd_inep') ||
        norm.includes('nu_inep') ||
        norm === 'cod escola' ||
        norm === 'codigo escola')
    ) {
      mapping.inep = idx;
      return;
    }

    // 2. Nome da Escola
    if (
      mapping.schoolName === -1 &&
      (norm === 'escola' ||
        norm === 'nome da escola' ||
        norm === 'nome escola' ||
        norm === 'nm_escola' ||
        norm === 'ds_escola' ||
        norm === 'unidade escolar' ||
        norm.includes('nome_escola') ||
        norm.includes('unidade_escolar'))
    ) {
      mapping.schoolName = idx;
      return;
    }

    // 3. Ano Escolar / Etapa
    if (
      mapping.grade === -1 &&
      (norm === 'ano escolar' ||
        norm === 'ano_escolar' ||
        norm === 'ano' ||
        norm === 'etapa' ||
        norm === 'serie' ||
        norm === 'série' ||
        norm.includes('ano_escolar') ||
        norm.includes('etapa_ensino'))
    ) {
      mapping.grade = idx;
      return;
    }

    // 4. Componente Curricular
    if (
      mapping.component === -1 &&
      (norm === 'componente curricular' ||
        norm === 'componente' ||
        norm === 'disciplina' ||
        norm.includes('componente_curricular'))
    ) {
      mapping.component = idx;
      return;
    }

    // 5. Matriculados / Previstos
    if (
      mapping.enrolled === -1 &&
      (norm === 'previstos' ||
        norm === 'matriculados' ||
        norm === 'total alunos' ||
        norm === 'alunos previstos' ||
        norm === 'alunos matriculados' ||
        norm.includes('previstos') ||
        norm.includes('matriculados'))
    ) {
      mapping.enrolled = idx;
      return;
    }

    // 6. Alunos Avaliados / Presentes
    if (
      mapping.evaluated === -1 &&
      (norm === 'avaliados' ||
        norm === 'presentes' ||
        norm === 'alunos avaliados' ||
        norm === 'total avaliados' ||
        norm === 'qtd avaliados')
    ) {
      mapping.evaluated = idx;
      return;
    }

    // 7. Taxa de Participação (%)
    if (
      mapping.participationRate === -1 &&
      (norm === 'avaliados (%)' ||
        norm === 'avaliados %' ||
        norm === 'participacao (%)' ||
        norm === 'participacao %' ||
        norm === 'participacao' ||
        norm === 'participação (%)' ||
        norm === 'participação %' ||
        norm === 'participação' ||
        norm === '% participacao' ||
        norm === '% participação' ||
        norm === 'taxa de participacao' ||
        norm === 'taxa de participação')
    ) {
      mapping.participationRate = idx;
      return;
    }

    // 8. Nota Média / Proficiência Média
    if (
      mapping.averageScore === -1 &&
      (norm === 'nota media' ||
        norm === 'nota média' ||
        norm === 'proficiencia' ||
        norm === 'proficiência' ||
        norm === 'proficiencia media' ||
        norm === 'proficiência média' ||
        norm === 'media' ||
        norm === 'média' ||
        norm === 'desempenho global' ||
        norm === 'desempenho medio' ||
        norm === 'desempenho médio')
    ) {
      mapping.averageScore = idx;
      return;
    }

    // 9. Níveis de Desempenho Oficiais do SisPAE (Defasagem, Intermediário, Adequado, etc.)
    if (
      norm === 'defasagem' ||
      norm.includes('defasagem') ||
      norm === 'aprendizado intermediario' ||
      norm === 'aprendizado intermediário' ||
      norm === 'intermediario' ||
      norm === 'intermediário' ||
      norm === 'aprendizado adequado' ||
      norm === 'aprendizado adequado' ||
      norm === 'adequado' ||
      norm === 'inadequado' ||
      norm === 'insuficiente' ||
      norm === 'insatisfatorio' ||
      norm === 'insatisfatório' ||
      norm === 'satisfatorio' ||
      norm === 'satisfatório' ||
      norm === 'avancado' ||
      norm === 'avançado' ||
      norm === 'basico' ||
      norm === 'básico' ||
      norm === 'proficiente' ||
      norm === 'muito baixo' ||
      norm === 'baixo' ||
      norm === 'medio' ||
      norm === 'médio' ||
      norm === 'alto'
    ) {
      mapping.levels.push({
        name: String(header).trim(),
        colIdx: idx,
      });
      return;
    }

    // 10. Habilidades e Descritores (H 01 (%), H01, D01, Aspecto...)
    const isHabilidade =
      /^h\s*0?\d+/i.test(norm) ||
      /^d\s*0?\d+/i.test(norm) ||
      /^questao\s*\d+/i.test(norm) ||
      /^item\s*\d+/i.test(norm) ||
      /^habilidade/i.test(norm) ||
      /^descritor/i.test(norm) ||
      norm.includes('aspecto');

    if (isHabilidade) {
      // Extrai código conciso (ex: "H 01 (%)" -> "H01")
      let code = String(header).trim().replace(/\s*\(.*?\)/g, '').trim();
      const codeMatch = code.match(/([A-Za-z]+)\s*(\d+)/);
      if (codeMatch) {
        const prefix = codeMatch[1].toUpperCase();
        const num = parseInt(codeMatch[2], 10);
        code = `${prefix}${num < 10 ? '0' + num : num}`;
      }
      mapping.skills.push({
        code,
        label: String(header).trim(),
        colIdx: idx,
      });
      return;
    }

    // Outras colunas
    mapping.otherCols.push({ header: String(header).trim(), colIdx: idx });
  });

  return mapping;
}

/**
 * Resolve e garante a existência do programa SisPAE para o ano solicitado.
 */
export async function resolveSispaeProgram(programId, year = null) {
  let program = null;
  if (programId) {
    program = await prisma.program.findFirst({
      where: { id: programId, deletedAt: null },
      include: { catalog: true },
    });
  }

  const targetYear = Number(year) || program?.year || SISPAE_DEFAULT_YEAR;

  if (!program) {
    let catalog = await prisma.programCatalog.findFirst({
      where: { code: SISPAE_CATALOG_CODE, deletedAt: null },
    });
    if (!catalog) {
      catalog = await prisma.programCatalog.create({
        data: {
          code: SISPAE_CATALOG_CODE,
          name: 'SisPAE — Sistema Paraense de Avaliação Educacional',
          objective:
            'Acompanhamento do desempenho educacional em Língua Portuguesa e Matemática por meio de Simulados e Avaliação Oficial',
          organ: 'SEDUC / SEMED',
          description:
            'Sistema Paraense de Avaliação Educacional (SisPAE) — Avaliações oficiais e simulados preparatórios.',
        },
      });
    }

    program = await prisma.program.findFirst({
      where: { catalogId: catalog.id, year: targetYear, deletedAt: null },
      include: { catalog: true },
    });

    if (!program) {
      program = await prisma.program.create({
        data: {
          catalogId: catalog.id,
          code: `SISPAE-${targetYear}`,
          name: 'SisPAE — Sistema Paraense de Avaliação Educacional',
          year: targetYear,
          status: 'EM_EXECUCAO',
          organ: 'SEDUC / SEMED',
          objective:
            'Acompanhamento do desempenho educacional em Língua Portuguesa e Matemática por meio de Simulados e Avaliação Oficial',
          globalGoal: 80,
          periodLabel: `Ciclo ${targetYear}`,
          description: `SisPAE ${targetYear} — Sistema Paraense de Avaliação Educacional.`,
        },
        include: { catalog: true },
      });
    }
  }

  return program;
}

/**
 * Garante ou busca a aplicação SisPAE alvo (ex: "Simulado Pará 2026 – Alfabetização").
 */
export async function resolveSispaeApplication(programId, applicationData = {}) {
  const { applicationId, name, type, year, stage, description } = applicationData;

  if (applicationId) {
    const existing = await prisma.sispaeApplication.findUnique({
      where: { id: applicationId },
    });
    if (existing) return existing;
  }

  const appName =
    name?.trim() || 'Simulado Pará 2026 – Alfabetização';
  const appType =
    type ||
    (appName.toLowerCase().includes('simulado') ? 'SIMULADO' : 'AVALIACAO_OFICIAL');
  const appYear = Number(year) || SISPAE_DEFAULT_YEAR;

  let application = await prisma.sispaeApplication.findFirst({
    where: {
      programId,
      name: appName,
      year: appYear,
    },
  });

  if (!application) {
    application = await prisma.sispaeApplication.create({
      data: {
        programId,
        name: appName,
        type: appType,
        year: appYear,
        stage: stage || 'Alfabetização',
        description:
          description ||
          (appType === 'SIMULADO'
            ? 'Simulado preparatório para a rede municipal no âmbito do SisPAE.'
            : 'Avaliação oficial do Sistema Paraense de Avaliação Educacional.'),
        status: 'PUBLICADA',
      },
    });
  }

  return application;
}

/**
 * Gera prévia de importação para arquivos do SisPAE com conciliação automática com escolas do CPE.
 */
export async function previewSispaeImport(
  programId,
  fileInput,
  originalFilename = '',
  options = {},
) {
  let fileBuffer = fileInput;
  let filename = originalFilename;

  if (fileInput && typeof fileInput === 'object' && !Buffer.isBuffer(fileInput)) {
    if (fileInput.originalname && !filename) filename = fileInput.originalname;
    if (fileInput.buffer) fileBuffer = fileInput.buffer;
    else if (fileInput.path && fs.existsSync(fileInput.path)) fileBuffer = fs.readFileSync(fileInput.path);
  } else if (typeof fileInput === 'string' && fs.existsSync(fileInput)) {
    if (!filename) filename = path.basename(fileInput);
    fileBuffer = fs.readFileSync(fileInput);
  }

  const program = await resolveSispaeProgram(programId, options.year);
  const targetProgramId = program.id;
  const targetYear = Number(options.year) || program.year || SISPAE_DEFAULT_YEAR;

  // Busca escolas cadastradas no CPE para conciliação inteligente
  const dbSchools = await prisma.school.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      inep: true,
      name: true,
      schoolType: true,
      zone: true,
    },
  });

  const inepMap = new Map();
  const nameMap = new Map();
  const normSchools = [];

  for (const sc of dbSchools) {
    if (sc.inep) {
      inepMap.set(normalizeInep(sc.inep), sc);
    }
    const nName = normalizeSchoolName(sc.name);
    if (nName) {
      if (!nameMap.has(nName)) nameMap.set(nName, sc);
      normSchools.push({ school: sc, normName: nName });
    }
  }

  // Busca aplicações existentes no SisPAE
  const existingApplications = await prisma.sispaeApplication.findMany({
    where: { programId: targetProgramId },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    include: {
      _count: { select: { results: true } },
    },
  });

  const sheets = readSpreadsheetSheets(fileBuffer, originalFilename);
  const allRecords = [];
  const detectedComponents = new Set();
  const rawHeadersList = [];

  for (const sheet of sheets) {
    const { sheetName, rows } = sheet;
    if (!rows || rows.length < 2) continue;

    const headerIdx = findHeaderRowIndex(rows);
    const headers = rows[headerIdx].map((h) => String(h || '').trim());
    rawHeadersList.push(...headers);
    const colMap = mapRowColumns(headers);

    // Identifica componente da aba ou do arquivo se não houver coluna de componente
    const sheetComponentHint = `${originalFilename} ${sheetName}`;
    const detectedSheetComponent = detectSispaeComponent(sheetComponentHint);

    for (let rIdx = headerIdx + 1; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      if (!row || !row.length) continue;

      // Extrai texto bruto da escola e do INEP
      const rawSchoolCell = colMap.schoolName >= 0 ? String(row[colMap.schoolName] || '').trim() : '';
      const rawInepCell = colMap.inep >= 0 ? String(row[colMap.inep] || '').trim() : '';

      // Se ambas as células estiverem vazias, pula linha vazia
      if (!rawSchoolCell && !rawInepCell) continue;

      // Extrai INEP prioritariamente da coluna ou do final do nome da escola
      let inep = normalizeInep(rawInepCell);
      if (!inep && rawSchoolCell) {
        inep = normalizeInep(extractInepFromSchoolText(rawSchoolCell));
      }

      // Limpa nome da escola removendo o INEP caso estivesse embutido (ex: "EMEF X - 15145425" -> "EMEF X")
      let cleanSchoolName = rawSchoolCell;
      if (cleanSchoolName && inep) {
        cleanSchoolName = cleanSchoolName.replace(new RegExp(`\\s*[-–—/]?\\s*${inep}\\s*$`), '').trim();
      }

      // Componente da linha ou da aba
      let rowComponent = detectedSheetComponent;
      if (colMap.component >= 0 && row[colMap.component]) {
        rowComponent = detectSispaeComponent(String(row[colMap.component]));
      }
      if (options.component && options.component !== 'AUTO') {
        rowComponent = options.component;
      }
      detectedComponents.add(rowComponent);

      // Ano Escolar / Etapa (Padronizado como 2º Ano do Ensino Fundamental)
      let grade = '2º Ano';
      if (colMap.grade >= 0 && row[colMap.grade]) {
        const rawGrade = String(row[colMap.grade]).trim();
        if (rawGrade.includes('2º') || rawGrade.includes('2o') || rawGrade.includes('2°') || rawGrade.includes('2')) {
          grade = '2º Ano';
        } else {
          grade = rawGrade;
        }
      } else if (options.grade) {
        grade = options.grade;
      }

      // Métricas
      const enrolled = colMap.enrolled >= 0 ? Math.round(parseSispaeNumber(row[colMap.enrolled]) || 0) : null;
      const evaluated = colMap.evaluated >= 0 ? Math.round(parseSispaeNumber(row[colMap.evaluated]) || 0) : null;
      let participationRate = colMap.participationRate >= 0 ? parseSispaeNumber(row[colMap.participationRate]) : null;

      // Se a taxa de participação não estiver explícita mas tivermos enrolled e evaluated
      if (participationRate == null && enrolled && evaluated && enrolled > 0) {
        participationRate = Math.round((evaluated / enrolled) * 1000) / 10;
      }

      const averageScore = colMap.averageScore >= 0 ? parseSispaeNumber(row[colMap.averageScore]) : null;

      // Níveis de desempenho
      const performanceLevels = [];
      for (const lvl of colMap.levels) {
        const val = parseSispaeNumber(row[lvl.colIdx]);
        if (val !== null) {
          performanceLevels.push({
            level: lvl.name,
            percentage: val,
          });
        }
      }

      // Habilidades / Descritores
      const skills = [];
      for (const sk of colMap.skills) {
        const val = parseSispaeNumber(row[sk.colIdx]);
        if (val !== null) {
          skills.push({
            code: sk.code,
            label: sk.label,
            percentage: val,
          });
        }
      }

      // Reconciliação com escolas cadastradas no CPE
      let matchedSchool = null;
      let matchMethod = 'NONE';
      let candidateSchools = [];

      if (inep && inepMap.has(inep)) {
        matchedSchool = inepMap.get(inep);
        matchMethod = 'INEP_EXACT';
      }

      if (!matchedSchool && cleanSchoolName) {
        const normName = normalizeSchoolName(cleanSchoolName);
        if (normName && nameMap.has(normName)) {
          matchedSchool = nameMap.get(normName);
          matchMethod = 'NAME_EXACT';
        } else if (normName && normName.length >= 4) {
          // Busca candidatos similares
          const candidates = normSchools.filter(
            (item) => item.normName.includes(normName) || normName.includes(item.normName),
          );
          if (candidates.length === 1) {
            matchedSchool = candidates[0].school;
            matchMethod = 'NAME_FUZZY';
          } else if (candidates.length > 1) {
            candidateSchools = candidates.slice(0, 5).map((c) => c.school);
          }
        }
      }

      // Status do registro
      let status = 'VALIDO';
      let statusMessage = 'Pronto para importação';

      if (!matchedSchool) {
        status = 'NAO_IDENTIFICADA';
        statusMessage = 'Escola não identificada na base do CPE. Selecione manualmente.';
      }

      // Colunas brutas preservadas
      const displayValues = {};
      headers.forEach((h, i) => {
        if (row[i] !== undefined && !isIgnoredColumn(h)) {
          displayValues[h] = row[i];
        }
      });

      allRecords.push({
        rowNumber: rIdx + 1,
        sheetName,
        rawSchoolName: rawSchoolCell || cleanSchoolName,
        rawInep: rawInepCell || inep,
        cleanSchoolName,
        inep,
        grade,
        component: rowComponent,
        enrolled,
        evaluated,
        participationRate,
        averageScore,
        performanceLevels,
        skills,
        matchedSchool: matchedSchool
          ? {
              id: matchedSchool.id,
              name: matchedSchool.name,
              inep: matchedSchool.inep,
              zone: matchedSchool.zone,
            }
          : null,
        matchMethod,
        candidateSchools,
        status,
        statusMessage,
        displayValues,
      });
    }
  }

  // Deduplicação inteligente de linhas no mesmo arquivo (ex: linhas duplicadas com Rede = PÚBLICA e Rede = MUNICIPAL)
  const uniqueKeyMap = new Map();
  const records = [];

  for (const rec of allRecords) {
    const schoolKey = rec.matchedSchool?.id || `${rec.inep || ''}_${rec.cleanSchoolName}`;
    const key = `${schoolKey}_${rec.grade}_${rec.component}`;

    if (uniqueKeyMap.has(key)) {
      // Linha duplicada detectada no arquivo: marca como duplicada
      records.push({
        ...rec,
        status: 'DUPLICADO',
        isDuplicate: true,
        statusMessage: 'Linha duplicada para a mesma escola/componente nesta planilha.',
      });
    } else {
      uniqueKeyMap.set(key, true);
      records.push(rec);
    }
  }

  // Identifica tipo de aplicação sugerida pelo nome do arquivo ou parâmetros
  const defaultAppName =
    options.applicationName ||
    (originalFilename.toLowerCase().includes('oficial')
      ? 'Avaliação SisPAE 2026'
      : 'Simulado Pará 2026 – Alfabetização');

  const defaultAppType =
    options.applicationType ||
    detectSispaeApplicationType(`${originalFilename} ${defaultAppName}`);

  // Sumário
  const validCount = records.filter((r) => r.status === 'VALIDO').length;
  const duplicateCount = records.filter((r) => r.status === 'DUPLICADO').length;
  const unidentifiedCount = records.filter((r) => r.status === 'NAO_IDENTIFICADA').length;
  const identifiedSchoolsCount = new Set(
    records.filter((r) => r.matchedSchool?.id).map((r) => r.matchedSchool.id),
  ).size;

  return {
    programId: targetProgramId,
    year: targetYear,
    filename: originalFilename,
    summary: {
      totalRows: records.length,
      validRows: validCount,
      duplicateRows: duplicateCount,
      unidentifiedRows: unidentifiedCount,
      identifiedSchools: identifiedSchoolsCount,
      totalSheets: sheets.length,
      detectedComponents: Array.from(detectedComponents),
    },
    suggestedApplication: {
      name: defaultAppName,
      type: defaultAppType,
      year: targetYear,
      stage: 'Alfabetização',
    },
    applications: existingApplications.map((app) => ({
      id: app.id,
      name: app.name,
      type: app.type,
      year: app.year,
      stage: app.stage,
      status: app.status,
      resultsCount: app._count.results,
    })),
    records,
    headers: Array.from(new Set(rawHeadersList)).filter((h) => !isIgnoredColumn(h)),
  };
}

/**
 * Confirma a importação dos resultados no banco de dados vinculados à aplicação selecionada.
 *
 * Princípios de Resiliência:
 * 1. O resultado é ESTRITAMENTE vinculado ao `applicationId`.
 * 2. As escolas existentes no CPE são reutilizadas (vinculadas ao `programSchool`).
 * 3. Persistência em lote / chunks controlados (`CHUNK_SIZE = 50`) com pre-fetch eficiente.
 */
export async function confirmSispaeImport(
  programId,
  payload = {},
  actor = null,
  ip = null,
) {
  const { records = [], application = {}, year = null, asDraft = false } = payload;

  const program = await resolveSispaeProgram(programId, year || application.year);
  const targetProgramId = program.id;
  const importYear = Number(year || application.year) || program.year || SISPAE_DEFAULT_YEAR;

  // Resolve a aplicação alvo
  const targetApplication = await resolveSispaeApplication(targetProgramId, {
    applicationId: application.id || application.applicationId,
    name: application.name,
    type: application.type,
    year: importYear,
    stage: application.stage,
    description: application.description,
  });

  const applicationId = targetApplication.id;

  // Filtra registros válidos (rejeitando duplicatas ou registros sem escola vinculada)
  const validMap = new Map();
  for (const r of records) {
    const schoolId = r.matchedSchool?.id || r.schoolId;
    if (schoolId && !r.isDuplicate && (r.status === 'VALIDO' || r.status === 'OK' || !r.status)) {
      const component = r.component || 'LINGUA_PORTUGUESA';
      const grade = r.grade || '2º Ano';
      const key = `${schoolId}_${grade}_${component}`;
      if (!validMap.has(key)) {
        validMap.set(key, { ...r, schoolId, component, grade });
      }
    }
  }

  // Fallback caso todos venham sem flag
  if (validMap.size === 0 && records.length > 0) {
    for (const r of records) {
      const schoolId = r.matchedSchool?.id || r.schoolId;
      if (schoolId) {
        const component = r.component || 'LINGUA_PORTUGUESA';
        const grade = r.grade || '2º Ano';
        const key = `${schoolId}_${grade}_${component}`;
        if (!validMap.has(key)) {
          validMap.set(key, { ...r, schoolId, component, grade });
        }
      }
    }
  }

  const validRecords = Array.from(validMap.values());
  if (!validRecords.length) {
    throw new Error('Nenhum registro válido com escola identificada para importar.');
  }

  const schoolIds = Array.from(new Set(validRecords.map((r) => r.schoolId)));
  const sourceValue = asDraft ? 'RASCUNHO' : 'IMPORTACAO';

  // 1. Vinculação em lote de escolas participantes no ProgramSchool
  if (typeof prisma.programSchool?.createMany === 'function') {
    try {
      await prisma.programSchool.createMany({
        data: schoolIds.map((schoolId) => ({
          programId: targetProgramId,
          schoolId,
          active: true,
        })),
        skipDuplicates: true,
      });
      if (typeof prisma.programSchool?.updateMany === 'function') {
        await prisma.programSchool.updateMany({
          where: { programId: targetProgramId, schoolId: { in: schoolIds }, active: false },
          data: { active: true },
        });
      }
    } catch {
      // Fallback
      if (typeof prisma.programSchool?.upsert === 'function') {
        for (const schoolId of schoolIds) {
          try {
            await prisma.programSchool.upsert({
              where: { programId_schoolId: { programId: targetProgramId, schoolId } },
              create: { programId: targetProgramId, schoolId, active: true },
              update: { active: true },
            });
          } catch {
            // Ignora
          }
        }
      }
    }
  } else if (typeof prisma.programSchool?.upsert === 'function') {
    for (const schoolId of schoolIds) {
      try {
        await prisma.programSchool.upsert({
          where: { programId_schoolId: { programId: targetProgramId, schoolId } },
          create: { programId: targetProgramId, schoolId, active: true },
          update: { active: true },
        });
      } catch {
        // Ignora
      }
    }
  }

  // 2. Pré-carregamento em lote dos resultados existentes da aplicação
  const existingMap = new Map();
  if (typeof prisma.sispaeSchoolResult?.findMany === 'function') {
    try {
      const existingResults = await prisma.sispaeSchoolResult.findMany({
        where: {
          programId: targetProgramId,
          applicationId,
          schoolId: { in: schoolIds },
        },
        select: {
          id: true,
          schoolId: true,
          grade: true,
          component: true,
        },
      });
      for (const res of existingResults) {
        const key = `${res.schoolId}_${res.grade}_${res.component}`;
        existingMap.set(key, res.id);
      }
    } catch {
      // Map permanece vazio
    }
  }

  // 3. Monta operações estruturadas
  const preparedOperations = validRecords.map((rec) => {
    const grade = rec.grade || '2º Ano';
    const component = rec.component || 'LINGUA_PORTUGUESA';
    const data = {
      programId: targetProgramId,
      applicationId,
      schoolId: rec.schoolId,
      year: importYear,
      grade,
      component,
      enrolled: rec.enrolled != null ? Math.round(rec.enrolled) : null,
      evaluated: rec.evaluated != null ? Math.round(rec.evaluated) : null,
      participationRate: rec.participationRate != null ? Number(rec.participationRate) : null,
      averageScore: rec.averageScore != null ? Number(rec.averageScore) : null,
      performanceLevels: rec.performanceLevels || [],
      skills: rec.skills || [],
      rawDetails: rec.rawDetails || rec.displayValues || {},
      source: sourceValue,
    };
    const key = `${rec.schoolId}_${grade}_${component}`;
    const existingId = existingMap.get(key) || null;
    return {
      key,
      existingId,
      data,
    };
  });

  // 4. Executa persistência em lotes / chunks controlados (CHUNK_SIZE = 50)
  let createdCount = 0;
  let updatedCount = 0;
  const CHUNK_SIZE = 50;

  for (let i = 0; i < preparedOperations.length; i += CHUNK_SIZE) {
    const chunk = preparedOperations.slice(i, i + CHUNK_SIZE);

    await prisma.$transaction(
      async (tx) => {
        for (const op of chunk) {
          let existingId = op.existingId;

          if (
            !existingId &&
            typeof tx.sispaeSchoolResult?.findUnique === 'function' &&
            existingMap.size === 0
          ) {
            const found = await tx.sispaeSchoolResult.findUnique({
              where: {
                programId_applicationId_schoolId_grade_component: {
                  programId: targetProgramId,
                  applicationId,
                  schoolId: op.data.schoolId,
                  grade: op.data.grade,
                  component: op.data.component,
                },
              },
              select: { id: true },
            });
            if (found) existingId = found.id || true;
          }

          if (existingId) {
            if (typeof tx.sispaeSchoolResult?.update === 'function') {
              await tx.sispaeSchoolResult.update({
                where: {
                  ...(typeof existingId === 'string'
                    ? { id: existingId }
                    : {
                        programId_applicationId_schoolId_grade_component: {
                          programId: targetProgramId,
                          applicationId,
                          schoolId: op.data.schoolId,
                          grade: op.data.grade,
                          component: op.data.component,
                        },
                      }),
                },
                data: op.data,
              });
            } else if (typeof tx.sispaeSchoolResult?.upsert === 'function') {
              await tx.sispaeSchoolResult.upsert({
                where: {
                  programId_applicationId_schoolId_grade_component: {
                    programId: targetProgramId,
                    applicationId,
                    schoolId: op.data.schoolId,
                    grade: op.data.grade,
                    component: op.data.component,
                  },
                },
                create: op.data,
                update: op.data,
              });
            }
            updatedCount++;
          } else {
            if (typeof tx.sispaeSchoolResult?.create === 'function') {
              await tx.sispaeSchoolResult.create({
                data: op.data,
              });
            } else if (typeof tx.sispaeSchoolResult?.upsert === 'function') {
              await tx.sispaeSchoolResult.upsert({
                where: {
                  programId_applicationId_schoolId_grade_component: {
                    programId: targetProgramId,
                    applicationId,
                    schoolId: op.data.schoolId,
                    grade: op.data.grade,
                    component: op.data.component,
                  },
                },
                create: op.data,
                update: op.data,
              });
            }
            createdCount++;
          }
        }
      },
      { maxWait: 15_000, timeout: 30_000 },
    );
  }

  // 5. Auditoria
  if (actor) {
    await audit({
      userId: actor?.id,
      userName: actor?.name || 'técnico',
      action: asDraft ? AuditAction.IMPORT_PREVIEW : AuditAction.IMPORT_CONFIRM,
      entity: 'SispaeSchoolResult',
      entityId: applicationId,
      metadata: {
        programId: targetProgramId,
        applicationId,
        applicationName: targetApplication.name,
        applicationType: targetApplication.type,
        year: importYear,
        total: validRecords.length,
        createdCount,
        updatedCount,
        isDraft: asDraft,
      },
      ip,
    });
  }

  return {
    createdCount,
    updatedCount,
    total: validRecords.length,
    programId: targetProgramId,
    applicationId,
    applicationName: targetApplication.name,
    applicationType: targetApplication.type,
    isDraft: asDraft,
  };
}
