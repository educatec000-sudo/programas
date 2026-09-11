import xlsx from 'xlsx';
import { prisma } from '../../lib/prisma.js';
import { audit, AuditAction } from '../../lib/audit.js';
import {
  PARC_CATALOG_CODE,
  PARC_PROGRAM_NAME,
  PARC_DEFAULT_YEAR,
  PARC_DEFAULT_GRADE,
  PARC_ASSESSMENT_NAME,
  detectParcCycle,
  normalizeParcText,
} from './config.js';

/**
 * Converte strings numéricas em pt-BR / EN, porcentagens (%) e inteiros com tolerância a vazios e hífens.
 */
export function parseParcNumber(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const str = String(val).trim().replace(/%/g, '').trim();
  if (!str || str === '-' || str === '—' || str === 'N/A' || str === 'NaN' || str === 'null' || str === 'undefined') {
    return null;
  }

  // Se contiver vírgula e ponto (ex: 1.234,56 ou 1,234.56)
  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf(',') > str.indexOf('.')) {
      const clean = str.replace(/\./g, '').replace(',', '.');
      const num = parseFloat(clean);
      return Number.isFinite(num) ? num : null;
    } else {
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
 * Normaliza o código INEP removendo pontuações e caracteres não numéricos.
 */
export function normalizeInep(val) {
  if (val == null) return null;
  const clean = String(val).replace(/\D/g, '').trim();
  return clean.length >= 6 ? clean : null;
}

/**
 * Normaliza o nome da escola para correspondência segura quando o INEP não estiver presente.
 * Remove prefixos administrativos comuns (E.M.E.F., E M E F, EMEF, E.M.E.I.E.F., E M E I E F, EMEIF, Creche, etc.),
 * acentos, pontuações, variações fonéticas e espaços múltiplos.
 */
export function normalizeSchoolName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\uFFFD/g, ' ')
    .toLowerCase()
    .replace(/\b(e\s*\.?\s*m\s*\.?\s*e\s*\.?\s*i\s*\.?\s*e\s*\.?\s*f\s*\.?|e\s*\.?\s*m\s*\.?\s*e\s*\.?\s*i\s*\.?\s*f\s*\.?|e\s*\.?\s*m\s*\.?\s*e\s*\.?\s*f\s*\.?|e\s*\.?\s*e\s*\.?\s*e\s*\.?\s*f\s*\.?\s*m\s*\.?|emeief|emeif|emef|eeefm|escola|municipal|estadual|colegio|col|unidade\s*escolar|ue|creche)\b/gi, ' ')
    .replace(/\b(prof\s*\.?\s*m\s*a\s*\.?|prof\s*\.?\s*mª\s*\.?|professora\s*maria|prof\s*maria)\b/gi, ' maria ')
    .replace(/\b(prof\s*\.?|profa\s*\.?|profª\s*\.?|professor\s*|professora\s*)\b/gi, ' ')
    .replace(/\b(dr\s*\.?|dra\s*\.?|drª\s*\.?|doutor\s*|doutora\s*)\b/gi, ' ')
    .replace(/\b(n\s*\.?\s*sra\s*\.?|n\s*\.?\s*s\s*\.?|nossa\s*sra\s*\.?|nossa\s*senhora)\b/gi, ' nossa senhora ')
    .replace(/\b(sta\s*\.?|santa)\b/gi, ' santa ')
    .replace(/\b(sto\s*\.?|sao|santo)\b/gi, ' santo ')
    .replace(/\b(pe\s*\.?|padre)\b/gi, ' padre ')
    .replace(/\b(tome|tom)\b/gi, ' tome ')
    .replace(/\b(corao|coracao)\b/gi, ' coracao ')
    .replace(/\b(conceio|conceicao)\b/gi, ' conceicao ')
    .replace(/\b(esperana|esperanca)\b/gi, ' esperanca ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai o tipo administrativo de escola (EMEF, EMEIF, EMEIEF, CRECHE) para desempate seguro.
 */
export function extractSchoolType(name) {
  const n = String(name || '').toLowerCase();
  if (/\b(e\s*m\s*e\s*i\s*e\s*f|emeief)\b/.test(n)) return 'EMEIEF';
  if (/\b(e\s*m\s*e\s*i\s*f|emeif)\b/.test(n)) return 'EMEIF';
  if (/\b(e\s*m\s*e\s*f|emef)\b/.test(n)) return 'EMEF';
  if (/\b(creche)\b/.test(n)) return 'CRECHE';
  return 'OUTRO';
}

/**
 * Parser de texto CSV suportando delimitadores comuns (;, ,, \t) e aspas escapadas.
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
  if (countComma > countSemi && countComma >= countTab) delimiter = ',';
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
 * Lê arquivos XLSX, XLS ou CSV suportando UTF-8, Windows-1252 e ISO-8859-1.
 */
export function readSpreadsheetSheets(fileBuffer, originalFilename = '') {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('O arquivo enviado está vazio.');
  }

  const isCsv = String(originalFilename).toLowerCase().endsWith('.csv') || String(originalFilename).toLowerCase().endsWith('.tsv');
  const isZip = fileBuffer.length >= 4 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b;
  const isOle = fileBuffer.length >= 8 && fileBuffer[0] === 0xd0 && fileBuffer[1] === 0xcf;

  const sheets = [];

  // 1. Tenta decodificar texto se for CSV explícito ou texto puro
  if (isCsv || (!isZip && !isOle)) {
    const encodings = ['utf-8', 'windows-1252', 'iso-8859-1'];
    for (const enc of encodings) {
      try {
        const decoder = new TextDecoder(enc, { fatal: true });
        const text = decoder.decode(fileBuffer);
        const rows = parseCsvToRows(text);
        if (rows.length >= 1) {
          sheets.push({
            sheetName: originalFilename.replace(/\.[^/.]+$/, '') || 'Planilha',
            rows,
          });
          break;
        }
      } catch {
        // Tenta próximo encoding
      }
    }

    // Se fatal: true falhou em todos, tenta non-fatal como fallback
    if (!sheets.length) {
      for (const enc of ['windows-1252', 'utf-8', 'iso-8859-1']) {
        try {
          const decoder = new TextDecoder(enc);
          const text = decoder.decode(fileBuffer);
          const rows = parseCsvToRows(text);
          if (rows.length >= 1) {
            sheets.push({
              sheetName: originalFilename.replace(/\.[^/.]+$/, '') || 'Planilha',
              rows,
            });
            break;
          }
        } catch {
          // Continua
        }
      }
    }
  }

  // 2. Se for Excel (ZIP/OLE) ou se ainda não foi processado
  if (!sheets.length && (isZip || isOle || !isCsv)) {
    try {
      const workbook = xlsx.read(fileBuffer, { type: 'buffer', cellDates: false, raw: true });
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false, raw: true });
        if (rows && rows.length > 0) {
          const isSingleColumnWithDelimiters = rows.length > 1 && rows.every((r) => r.length <= 1) && rows.some((r) => String(r[0] || '').includes(';'));
          if (!isSingleColumnWithDelimiters) {
            sheets.push({ sheetName, rows });
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  if (!sheets.length) {
    throw new Error('Nenhuma folha de dados legível encontrada no arquivo. Verifique se o formato é .xlsx, .xls ou .csv.');
  }

  return sheets;
}

/**
 * Localiza a linha do cabeçalho da planilha de Fluência do PARC.
 */
export function findParcHeaderRowIndex(rows) {
  const keywords = [
    'escola', 'previstos', 'avaliados', 'participacao', 'participação',
    'pre-leitor', 'pré-leitor', 'pre leitor', 'iniciante', 'fluente',
    'nivel 1', 'nível 1', 'nivel 2', 'nível 2', 'nivel 3', 'nível 3', 'nivel 4', 'nível 4',
    'inep', 'avaliacao', 'avaliação', 'ano escolar',
  ];

  let bestIdx = 0;
  let maxScore = -1;

  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const rowText = row.map((c) => normalizeParcText(c)).join(' ');
    let score = 0;
    for (const kw of keywords) {
      if (rowText.includes(kw)) score += 2;
    }
    if (rowText.includes('escola') && (rowText.includes('previstos') || rowText.includes('avaliados') || rowText.includes('pre-leitor') || rowText.includes('fluente'))) {
      score += 6;
    }
    if (score > maxScore) {
      maxScore = score;
      bestIdx = i;
    }
  }

  return maxScore >= 2 ? bestIdx : 0;
}

/**
 * Mapeia as colunas oficiais da planilha do PARC.
 */
export function mapParcColumns(headers) {
  const mapping = {
    assessment: -1,
    grade: -1,
    component: -1,
    municipality: -1,
    inep: -1,
    schoolName: -1,
    enrolled: -1,
    evaluated: -1,
    participationRate: -1,
    preReaderTotal: -1,
    preReaderLevel1: -1,
    preReaderLevel2: -1,
    preReaderLevel3: -1,
    preReaderLevel4: -1,
    beginnerReader: -1,
    fluentReader: -1,
    otherCols: [],
  };

  headers.forEach((header, idx) => {
    const norm = normalizeParcText(header);
    if (!norm) return;

    // 1. Avaliação / Edição / Ciclo
    if (mapping.assessment === -1 && (norm.includes('avaliacao') || norm.includes('avaliação') || norm.includes('edicao') || norm.includes('edição') || norm.includes('ciclo'))) {
      mapping.assessment = idx;
      return;
    }

    // 2. Ano Escolar / Etapa
    if (mapping.grade === -1 && (norm === 'ano escolar' || norm === 'etapa' || norm === 'serie' || norm === 'série' || norm.includes('ano_escolar'))) {
      mapping.grade = idx;
      return;
    }

    // 3. Componente Curricular
    if (mapping.component === -1 && (norm === 'componente' || norm === 'componente curricular' || norm.includes('nm_disciplina'))) {
      mapping.component = idx;
      return;
    }

    // 4. Município
    if (mapping.municipality === -1 && (norm.includes('municipio') || norm.includes('município') || norm.includes('cidade'))) {
      mapping.municipality = idx;
      return;
    }

    // 5. INEP / Código da Escola
    if (mapping.inep === -1 && (norm === 'inep' || norm === 'cod inep' || norm === 'codigo inep' || norm.includes('cod_inep') || norm.includes('nu_inep') || norm.includes('cd_escola'))) {
      mapping.inep = idx;
      return;
    }

    // 6. Nome da Escola
    if (mapping.schoolName === -1 && (norm === 'escola' || norm === 'nome da escola' || norm === 'nome escola' || norm === 'unidade escolar' || norm.includes('nm_escola') || norm.includes('ds_escola'))) {
      mapping.schoolName = idx;
      return;
    }

    // 7. Previstos / Matriculados
    if (mapping.enrolled === -1 && (norm.includes('previsto') || norm.includes('matriculad') || norm === 'total de alunos' || norm === 'qtd_matriculad')) {
      mapping.enrolled = idx;
      return;
    }

    // 8. Avaliados / Presentes
    if (mapping.evaluated === -1 && !norm.includes('%') && (norm.includes('avaliad') || norm.includes('presente') || norm === 'participantes' || norm.includes('qtd_avaliad'))) {
      mapping.evaluated = idx;
      return;
    }

    // 9. Participação (%)
    if (mapping.participationRate === -1 && (norm.includes('participa') || norm === 'avaliados (%)' || norm === '% avaliados' || norm.includes('% part'))) {
      mapping.participationRate = idx;
      return;
    }

    // 10. Pré-leitor (Níveis 1 a 4)
    if (norm.includes('nivel 1') || norm.includes('nível 1') || norm.includes('nivel1') || norm.includes('n1') || norm.includes('nv 1')) {
      mapping.preReaderLevel1 = idx;
      return;
    }
    if (norm.includes('nivel 2') || norm.includes('nível 2') || norm.includes('nivel2') || norm.includes('n2') || norm.includes('nv 2')) {
      mapping.preReaderLevel2 = idx;
      return;
    }
    if (norm.includes('nivel 3') || norm.includes('nível 3') || norm.includes('nivel3') || norm.includes('n3') || norm.includes('nv 3')) {
      mapping.preReaderLevel3 = idx;
      return;
    }
    if (norm.includes('nivel 4') || norm.includes('nível 4') || norm.includes('nivel4') || norm.includes('n4') || norm.includes('nv 4')) {
      mapping.preReaderLevel4 = idx;
      return;
    }

    // 11. Pré-leitor (Total)
    if (mapping.preReaderTotal === -1 && (norm.includes('pre-leitor') || norm.includes('pré-leitor') || norm.includes('pre leitor') || norm.includes('nao leitor') || norm.includes('não leitor'))) {
      mapping.preReaderTotal = idx;
      return;
    }

    // 12. Leitor Iniciante
    if (mapping.beginnerReader === -1 && (norm.includes('iniciante') || norm.includes('leitor iniciante') || norm.includes('leitor de palavras'))) {
      mapping.beginnerReader = idx;
      return;
    }

    // 13. Leitor Fluente
    if (mapping.fluentReader === -1 && (norm.includes('fluente') || norm.includes('leitor fluente')) && !norm.includes('iniciante') && !norm.includes('pre-leitor')) {
      mapping.fluentReader = idx;
      return;
    }

    mapping.otherCols.push({ name: String(header).trim(), colIdx: idx });
  });

  return mapping;
}

/**
 * Localiza ou inicializa o programa PARC 2026 de forma segura e consistente.
 */
export async function resolveParcProgram(programId = null, year = null) {
  if (programId) {
    const p = await prisma.program.findFirst({
      where: { id: programId, deletedAt: null },
      include: { catalog: true },
    });
    if (p) return p;
  }

  const targetYear = Number(year) || PARC_DEFAULT_YEAR;

  let catalog = await prisma.programCatalog.findFirst({
    where: { code: PARC_CATALOG_CODE, deletedAt: null },
  });

  if (!catalog) {
    catalog = await prisma.programCatalog.create({
      data: {
        code: PARC_CATALOG_CODE,
        name: PARC_PROGRAM_NAME,
        objective: 'Acompanhamento do desenvolvimento da Fluência Leitora em Regime de Colaboração (2º Ano)',
        organ: 'SEDUC / SEMED',
        description: 'Parceria pela Alfabetização em Regime de Colaboração (PARC) — Avaliação de Fluência Leitora do 2º Ano do Ensino Fundamental (Ciclos de Entrada e Saída).',
      },
    });
  }

  let program = await prisma.program.findFirst({
    where: { catalogId: catalog.id, year: targetYear, deletedAt: null },
    include: { catalog: true },
  });

  if (!program) {
    const code = `PARC-${targetYear}`;
    program = await prisma.program.create({
      data: {
        catalogId: catalog.id,
        code,
        name: PARC_PROGRAM_NAME,
        year: targetYear,
        periodLabel: `Ciclo ${targetYear}`,
        status: 'EM_EXECUCAO',
        globalGoal: 80,
        organ: 'SEDUC / SEMED',
        objective: 'Acompanhamento da Fluência Leitora do 2º Ano (Entrada e Saída)',
        description: `PARC ${targetYear} — Fluência Leitora 2º Ano (Entrada e Saída).`,
      },
      include: { catalog: true },
    });
  }

  return program;
}

/**
 * Processa a planilha oficial do PARC, identificando automaticamente as escolas
 * já existentes no CPE e preparando a prévia detalhada com detecção de ciclo (Entrada/Saída).
 *
 * REGRA CRÍTICA:
 * - NUNCA cria automaticamente uma nova escola caso não seja encontrada.
 * - Registros não identificados são listados na seção "Escolas não identificadas"
 *   com sugestões de correspondência do banco para resolução manual antes da gravação.
 */
export async function parseParcSpreadsheet(
  fileBuffer,
  originalFilename = '',
  explicitCycle = null,
  programId = null,
  year = null,
) {
  const sheets = readSpreadsheetSheets(fileBuffer, originalFilename);
  if (!sheets.length) {
    throw new Error('Nenhuma folha de dados legível encontrada no arquivo.');
  }

  const importYear = Number(year) || PARC_DEFAULT_YEAR;
  const resolvedProgram = await resolveParcProgram(programId, importYear);
  const targetProgramId = resolvedProgram.id;

  // Carrega cadastro de todas as escolas do CPE e as que já participam do PARC
  const [allSchools, participatingLinks, existingResults] = await Promise.all([
    prisma.school.findMany({
      where: { deletedAt: null },
      select: { id: true, inep: true, name: true, zone: true, district: true, schoolType: true },
    }),
    prisma.programSchool.findMany({
      where: { programId: targetProgramId, active: true },
      select: { schoolId: true },
    }),
    prisma.parcSchoolResult.findMany({
      where: { programId: targetProgramId, year: importYear },
      select: { schoolId: true, cycle: true },
    }),
  ]);

  const participatingSet = new Set(participatingLinks.map((l) => l.schoolId));
  const existingKeySet = new Set(existingResults.map((r) => `${r.schoolId}_${r.cycle}`));

  // Indexação de escolas
  const schoolByInep = new Map();
  const schoolByName = new Map();

  for (const s of allSchools) {
    s.extractedType = extractSchoolType(s.name);
    s.coreNorm = normalizeSchoolName(s.name);
    s.isParticipating = participatingSet.has(s.id);

    if (s.inep) {
      const clean = normalizeInep(s.inep);
      if (clean) schoolByInep.set(clean, s);
    }

    if (s.coreNorm) {
      const existing = schoolByName.get(s.coreNorm) || [];
      existing.push(s);
      schoolByName.set(s.coreNorm, existing);
    }
  }

  const parsedRecords = [];
  const unmatchedSchoolsList = [];
  const unmatchedSchoolKeys = new Set();
  const matchedSchoolIdsInBatch = new Set();

  let detectedCycle = explicitCycle || null;
  let totalRawRows = 0;
  let ignoredBlankRows = 0;

  for (const sheet of sheets) {
    const { sheetName, rows } = sheet;
    if (rows.length < 2) continue;

    const headerIdx = findParcHeaderRowIndex(rows);
    const rawHeaders = rows[headerIdx].map((c) => String(c || '').trim());
    const colMap = mapParcColumns(rawHeaders);

    // Se ciclo não foi definido explicitamente, tenta detectar pela planilha/arquivo
    if (!detectedCycle) {
      const hint = `${sheetName} ${originalFilename} ${rawHeaders.join(' ')}`;
      detectedCycle = detectParcCycle(hint);
    }

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row.length) continue;
      totalRawRows++;

      let rawAssessment = colMap.assessment !== -1 ? String(row[colMap.assessment] || '').trim() : '';
      let rawGrade = colMap.grade !== -1 ? String(row[colMap.grade] || '').trim() : '2º Ano';
      let rawInep = colMap.inep !== -1 ? row[colMap.inep] : null;
      let rawSchoolCell = colMap.schoolName !== -1 ? String(row[colMap.schoolName] || '').trim() : '';

      // Se a célula da escola contiver o INEP embutido (ex: "E M E F ACENDENDO AS LUZES - 15145425")
      if (!rawInep && rawSchoolCell) {
        const inepMatch = rawSchoolCell.match(/\b(\d{7,8})\b/);
        if (inepMatch) {
          rawInep = inepMatch[1];
        }
      }

      // Se ainda não achou INEP, busca em qualquer célula numérica de 7 ou 8 dígitos
      if (!rawInep) {
        for (const cell of row) {
          const possible = normalizeInep(cell);
          if (possible && (possible.length === 8 || possible.length === 7)) {
            rawInep = possible;
            break;
          }
        }
      }

      const cleanInep = normalizeInep(rawInep);
      let schoolName = rawSchoolCell ? rawSchoolCell.replace(/[-–—]?\s*\b\d{7,8}\b.*$/, '').trim() : '';

      // Ignora linhas totalmente em branco
      if (!cleanInep && !schoolName) {
        ignoredBlankRows++;
        continue;
      }

      // Detecção de ciclo na linha
      let rowCycle = explicitCycle || (rawAssessment ? detectParcCycle(rawAssessment) : detectedCycle) || 'ENTRADA';

      // Métricas da linha
      const enrolled = colMap.enrolled !== -1 ? parseParcNumber(row[colMap.enrolled]) : null;
      const evaluated = colMap.evaluated !== -1 ? parseParcNumber(row[colMap.evaluated]) : null;
      let participationRate = colMap.participationRate !== -1 ? parseParcNumber(row[colMap.participationRate]) : null;

      if (participationRate == null && enrolled != null && evaluated != null && enrolled > 0) {
        participationRate = Math.round((evaluated / enrolled) * 1000) / 10;
      }

      const preReaderTotal = colMap.preReaderTotal !== -1 ? parseParcNumber(row[colMap.preReaderTotal]) : null;
      const preReaderLevel1 = colMap.preReaderLevel1 !== -1 ? parseParcNumber(row[colMap.preReaderLevel1]) : null;
      const preReaderLevel2 = colMap.preReaderLevel2 !== -1 ? parseParcNumber(row[colMap.preReaderLevel2]) : null;
      const preReaderLevel3 = colMap.preReaderLevel3 !== -1 ? parseParcNumber(row[colMap.preReaderLevel3]) : null;
      const preReaderLevel4 = colMap.preReaderLevel4 !== -1 ? parseParcNumber(row[colMap.preReaderLevel4]) : null;
      const beginnerReader = colMap.beginnerReader !== -1 ? parseParcNumber(row[colMap.beginnerReader]) : null;
      const fluentReader = colMap.fluentReader !== -1 ? parseParcNumber(row[colMap.fluentReader]) : null;

      // Monta displayValues preservando todas as colunas
      const displayValues = {};
      rawHeaders.forEach((h, idx) => {
        if (h) displayValues[h] = row[idx] != null ? String(row[idx]).trim() : '';
      });

      // ==========================================
      // CORRESPONDÊNCIA MULTI-ESTÁGIO INTELIGENTE
      // ==========================================
      let matchedSchool = null;
      let status = 'VALIDO';
      let error = null;
      let candidateSchools = [];

      const rowType = extractSchoolType(schoolName);
      const rowCoreNorm = normalizeSchoolName(schoolName);

      // 1. Casamento por INEP direto
      if (cleanInep) {
        matchedSchool = schoolByInep.get(cleanInep) || null;
      }

      // 2. Casamento por Nome da Escola
      if (!matchedSchool && rowCoreNorm) {
        // Busca escolas candidatas pelo core normalizado
        let candidates = schoolByName.get(rowCoreNorm) || [];

        // Se houver mais de uma, filtra priorizando:
        // A) Escolas que já participam do PARC
        // B) Mesmo tipo administrativo (EMEF vs EMEIF)
        // C) Ainda não vinculadas a outra linha desta mesma planilha
        if (candidates.length > 1) {
          // Filtra pelo tipo administrativo (EMEF vs EMEIF)
          const sameType = candidates.filter((c) => c.extractedType === rowType);
          if (sameType.length > 0) {
            candidates = sameType;
          }

          // Filtra por escolas ainda não usadas nesta planilha
          const unusedInBatch = candidates.filter((c) => !matchedSchoolIdsInBatch.has(c.id));
          if (unusedInBatch.length > 0) {
            candidates = unusedInBatch;
          }

          // Prioriza participantes já no programa
          const partList = candidates.filter((c) => c.isParticipating);
          if (partList.length === 1) {
            candidates = partList;
          }
        }

        // Se ainda não encontrou candidatos diretos, busca por correspondência de tokens
        if (!candidates.length) {
          const words = rowCoreNorm.split(' ').filter((w) => w.length > 2);
          candidates = allSchools.filter((s) => {
            if (s.coreNorm.includes(rowCoreNorm) || rowCoreNorm.includes(s.coreNorm)) return true;
            const sWords = s.coreNorm.split(' ');
            const common = words.filter((w) => sWords.includes(w));
            return common.length >= Math.min(words.length, sWords.length) - 1 && common.length >= 2;
          });

          if (candidates.length > 1 && rowType !== 'OUTRO') {
            const sameType = candidates.filter((c) => c.extractedType === rowType);
            if (sameType.length > 0) candidates = sameType;
          }
        }

        if (candidates.length === 1) {
          matchedSchool = candidates[0];
        } else if (candidates.length > 1) {
          // Desempate por participação no PARC ou primeira não utilizada
          const unused = candidates.find((c) => !matchedSchoolIdsInBatch.has(c.id)) || candidates[0];
          matchedSchool = unused;
        }
      }

      if (matchedSchool) {
        matchedSchoolIdsInBatch.add(matchedSchool.id);
      } else {
        status = 'INVALIDO';
        error = `Escola "${schoolName}" não localizada no cadastro de escolas do CPE.`;

        // Gera sugestões aproximadas para resolução manual
        const words = rowCoreNorm.split(' ').filter((w) => w.length > 2);
        const scored = allSchools
          .map((s) => {
            let score = 0;
            for (const w of words) {
              if (s.coreNorm.includes(w)) score += w.length * 2;
            }
            if (s.coreNorm.includes(rowCoreNorm) || rowCoreNorm.includes(s.coreNorm)) score += 30;
            if (s.extractedType === rowType) score += 10;
            if (s.isParticipating) score += 5;
            return { s, score };
          })
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6);

        candidateSchools = scored.map((item) => ({
          id: item.s.id,
          name: item.s.name,
          inep: item.s.inep,
          score: item.score,
        }));

        const key = `${cleanInep || schoolName}`;
        if (!unmatchedSchoolKeys.has(key)) {
          unmatchedSchoolKeys.add(key);
          unmatchedSchoolsList.push({
            rowNumber: r + 1,
            schoolNameRaw: schoolName || '—',
            inepRaw: cleanInep || null,
            error,
            candidateSchools,
          });
        }
      }

      const isExistingInDb = matchedSchool
        ? existingKeySet.has(`${matchedSchool.id}_${rowCycle}`)
        : false;

      parsedRecords.push({
        rowNumber: r + 1,
        sheetName,
        inep: cleanInep || rawInep || matchedSchool?.inep || null,
        schoolName: schoolName || matchedSchool?.name || '—',
        matchedSchool: matchedSchool ? { id: matchedSchool.id, name: matchedSchool.name, inep: matchedSchool.inep, zone: matchedSchool.zone } : null,
        grade: rawGrade || PARC_DEFAULT_GRADE,
        assessment: rawAssessment || PARC_ASSESSMENT_NAME,
        cycle: rowCycle,
        enrolled: enrolled != null ? Math.round(enrolled) : null,
        evaluated: evaluated != null ? Math.round(evaluated) : null,
        participationRate,
        preReaderTotal,
        preReaderLevel1,
        preReaderLevel2,
        preReaderLevel3,
        preReaderLevel4,
        beginnerReader,
        fluentReader,
        displayValues,
        rawDetails: displayValues,
        status,
        error,
        action: isExistingInDb ? 'ATUALIZAR' : 'NOVO',
      });
    }
  }

  // Identificação de duplicidades no próprio arquivo
  const seenKeys = new Map();
  for (const rec of parsedRecords) {
    if (rec.status !== 'VALIDO' || !rec.matchedSchool?.id) continue;
    const key = `${rec.matchedSchool.id}_${rec.cycle}`;
    if (seenKeys.has(key)) {
      rec.isDuplicate = true;
      rec.isExcludedFromPublish = true;
      rec.warning = 'Registro duplicado no arquivo para a mesma escola e ciclo (duplicata desconsiderada da importação).';
    } else {
      rec.isDuplicate = false;
      rec.isExcludedFromPublish = false;
      seenKeys.set(key, rec);
    }
  }

  const uniqueValidRows = parsedRecords.filter((r) => r.status === 'VALIDO' && !r.isDuplicate);
  const duplicateRows = parsedRecords.filter((r) => r.isDuplicate);
  const invalidRows = parsedRecords.filter((r) => r.status === 'INVALIDO');
  const newRows = uniqueValidRows.filter((r) => r.action === 'NOVO');
  const updatedRows = uniqueValidRows.filter((r) => r.action === 'ATUALIZAR');
  const distinctMatchedSchools = new Set(uniqueValidRows.map((r) => r.matchedSchool?.id).filter(Boolean));

  return {
    summary: {
      programId: targetProgramId,
      programName: resolvedProgram.name,
      year: importYear,
      cycle: detectedCycle || 'ENTRADA',
      totalRows: totalRawRows,
      validRows: uniqueValidRows.length,
      invalidRows: invalidRows.length,
      ignoredRows: ignoredBlankRows,
      duplicateCount: duplicateRows.length,
      newRows: newRows.length,
      updatedRows: updatedRows.length,
      matchedSchoolsCount: distinctMatchedSchools.size,
      unidentifiedCount: unmatchedSchoolsList.length,
      unidentifiedSchools: unmatchedSchoolsList,
      availableSchoolsForMapping: allSchools.map((s) => ({ id: s.id, inep: s.inep, name: s.name })),
    },
    rows: parsedRecords,
  };
}

/**
 * Persiste os registros validados de Fluência do PARC no banco de dados.
 *
 * ARQUITETURA SEGURA:
 * 1. Processamento e deduplicação em memória.
 * 2. Suporte a mapeamentos manuais para resolver escolas não identificadas.
 * 3. Vinculação em lote das escolas participantes ao PARC 2026 (`ProgramSchool`).
 * 4. Pre-fetch em lote (`findMany`) dos registros existentes para evitar timeouts do pooler remoto.
 * 5. Gravação em lotes curtos (`CHUNK_SIZE = 50`) de transações curtas.
 */
export async function confirmParcImport(
  programId,
  records,
  year = null,
  actor = null,
  ip = null,
  asDraft = false,
  manualMappings = {},
) {
  const importYear = Number(year) || PARC_DEFAULT_YEAR;
  const program = await resolveParcProgram(programId, importYear);
  const targetProgramId = program.id;

  // Carrega cadastro de escolas para validar eventuais mapeamentos manuais
  const allSchools = await prisma.school.findMany({
    where: { deletedAt: null },
    select: { id: true, inep: true, name: true },
  });
  const schoolMapById = new Map(allSchools.map((s) => [s.id, s]));

  // Aplica mapeamentos manuais caso fornecidos
  for (const r of records) {
    if (manualMappings && (manualMappings[r.rowNumber] || manualMappings[r.inep] || manualMappings[r.schoolName])) {
      const mappedId = manualMappings[r.rowNumber] || manualMappings[r.inep] || manualMappings[r.schoolName];
      const targetSchool = schoolMapById.get(mappedId);
      if (targetSchool) {
        r.matchedSchool = { id: targetSchool.id, name: targetSchool.name, inep: targetSchool.inep };
        r.status = 'VALIDO';
        r.error = null;
        r.isDuplicate = false;
        r.isExcludedFromPublish = false;
      }
    }
  }

  // Filtra registros válidos e deduplica
  const validMap = new Map();
  for (const r of records) {
    if ((r.status === 'VALIDO' || r.matchedSchool?.id) && r.matchedSchool?.id && !r.isDuplicate && !r.isExcludedFromPublish) {
      const cycle = r.cycle || 'ENTRADA';
      const key = `${r.matchedSchool.id}_${cycle}`;
      if (!validMap.has(key)) {
        validMap.set(key, r);
      }
    }
  }

  // Fallback caso todos tenham vindo sem o flag isDuplicate
  if (validMap.size === 0 && records.length > 0) {
    for (const r of records) {
      if ((r.status === 'VALIDO' || r.matchedSchool?.id) && r.matchedSchool?.id) {
        const cycle = r.cycle || 'ENTRADA';
        const key = `${r.matchedSchool.id}_${cycle}`;
        if (!validMap.has(key)) {
          validMap.set(key, r);
        }
      }
    }
  }

  const validRecords = Array.from(validMap.values());
  if (!validRecords.length) {
    throw new Error('Nenhum registro válido para importar.');
  }

  const schoolIds = Array.from(new Set(validRecords.map((r) => r.matchedSchool.id)));
  const sourceValue = asDraft ? 'RASCUNHO' : 'IMPORTACAO';

  // 1. Vinculação em lote de escolas participantes ao ciclo PARC 2026
  if (typeof prisma.programSchool?.createMany === 'function') {
    try {
      await prisma.programSchool.createMany({
        data: schoolIds.map((schoolId) => ({ programId: targetProgramId, schoolId, active: true })),
        skipDuplicates: true,
      });
      if (typeof prisma.programSchool?.updateMany === 'function') {
        await prisma.programSchool.updateMany({
          where: { programId: targetProgramId, schoolId: { in: schoolIds }, active: false },
          data: { active: true },
        });
      }
    } catch {
      // Fallback para upsert
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

  // 2. Pre-fetch em lote dos resultados de Fluência do PARC existentes
  const existingMap = new Map();
  if (typeof prisma.parcSchoolResult?.findMany === 'function') {
    try {
      const existingResults = await prisma.parcSchoolResult.findMany({
        where: {
          programId: targetProgramId,
          schoolId: { in: schoolIds },
          year: importYear,
        },
        select: {
          id: true,
          schoolId: true,
          cycle: true,
        },
      });
      for (const res of existingResults) {
        const key = `${res.schoolId}_${res.cycle}`;
        existingMap.set(key, res.id);
      }
    } catch {
      // Map vazio
    }
  }

  // 3. Monta payloads
  const preparedOperations = validRecords.map((rec) => {
    const cycle = rec.cycle || 'ENTRADA';
    const grade = rec.grade || PARC_DEFAULT_GRADE;
    const assessment = rec.assessment || PARC_ASSESSMENT_NAME;
    const data = {
      programId: targetProgramId,
      schoolId: rec.matchedSchool.id,
      year: importYear,
      grade,
      assessment,
      cycle,
      enrolled: rec.enrolled,
      evaluated: rec.evaluated,
      participationRate: rec.participationRate,
      preReaderTotal: rec.preReaderTotal,
      preReaderLevel1: rec.preReaderLevel1,
      preReaderLevel2: rec.preReaderLevel2,
      preReaderLevel3: rec.preReaderLevel3,
      preReaderLevel4: rec.preReaderLevel4,
      beginnerReader: rec.beginnerReader,
      fluentReader: rec.fluentReader,
      rawCounts: rec.rawCounts || null,
      rawDetails: rec.rawDetails || rec.displayValues || {},
      source: sourceValue,
    };
    const key = `${rec.matchedSchool.id}_${cycle}`;
    const existingId = existingMap.get(key) || null;
    return {
      key,
      existingId,
      data,
    };
  });

  // 4. Executa persistência em lotes/chunks controlados (CHUNK_SIZE = 50)
  let createdCount = 0;
  let updatedCount = 0;
  const CHUNK_SIZE = 50;

  for (let i = 0; i < preparedOperations.length; i += CHUNK_SIZE) {
    const chunk = preparedOperations.slice(i, i + CHUNK_SIZE);

    await prisma.$transaction(async (tx) => {
      // Se necessário no contexto do mock/driver
      if (tx.programSchool?.upsert) {
        const chunkSchoolIds = Array.from(new Set(chunk.map((c) => c.data.schoolId)));
        for (const schoolId of chunkSchoolIds) {
          try {
            await tx.programSchool.upsert({
              where: { programId_schoolId: { programId: targetProgramId, schoolId } },
              create: { programId: targetProgramId, schoolId, active: true },
              update: { active: true },
            });
          } catch {
            // Ignora
          }
        }
      }

      for (const op of chunk) {
        let existingId = op.existingId;

        if (!existingId && typeof tx.parcSchoolResult?.findUnique === 'function' && existingMap.size === 0) {
          const found = await tx.parcSchoolResult.findUnique({
            where: {
              programId_schoolId_year_grade_assessment_cycle: {
                programId: targetProgramId,
                schoolId: op.data.schoolId,
                year: importYear,
                grade: op.data.grade,
                assessment: op.data.assessment,
                cycle: op.data.cycle,
              },
            },
            select: { id: true },
          });
          if (found) existingId = found.id || true;
        }

        if (existingId) {
          if (typeof tx.parcSchoolResult?.update === 'function') {
            await tx.parcSchoolResult.update({
              where: {
                ...(typeof existingId === 'string'
                  ? { id: existingId }
                  : {
                      programId_schoolId_year_grade_assessment_cycle: {
                        programId: targetProgramId,
                        schoolId: op.data.schoolId,
                        year: importYear,
                        grade: op.data.grade,
                        assessment: op.data.assessment,
                        cycle: op.data.cycle,
                      },
                    }),
              },
              data: op.data,
            });
          } else if (typeof tx.parcSchoolResult?.upsert === 'function') {
            await tx.parcSchoolResult.upsert({
              where: {
                programId_schoolId_year_grade_assessment_cycle: {
                  programId: targetProgramId,
                  schoolId: op.data.schoolId,
                  year: importYear,
                  grade: op.data.grade,
                  assessment: op.data.assessment,
                  cycle: op.data.cycle,
                },
              },
              create: op.data,
              update: op.data,
            });
          }
          updatedCount++;
        } else {
          if (typeof tx.parcSchoolResult?.create === 'function') {
            await tx.parcSchoolResult.create({
              data: op.data,
            });
          } else if (typeof tx.parcSchoolResult?.upsert === 'function') {
            await tx.parcSchoolResult.upsert({
              where: {
                programId_schoolId_year_grade_assessment_cycle: {
                  programId: targetProgramId,
                  schoolId: op.data.schoolId,
                  year: importYear,
                  grade: op.data.grade,
                  assessment: op.data.assessment,
                  cycle: op.data.cycle,
                },
              },
              create: op.data,
              update: op.data,
            });
          }
          createdCount++;
        }
      }
    }, { maxWait: 15_000, timeout: 30_000 });
  }

  // 5. Auditoria da importação
  if (actor) {
    await audit({
      userId: actor?.id,
      userName: actor?.name || 'técnico',
      action: asDraft ? AuditAction.IMPORT_PREVIEW : AuditAction.IMPORT_CONFIRM,
      entity: 'ParcSchoolResult',
      entityId: targetProgramId,
      metadata: {
        programId: targetProgramId,
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
    isDraft: asDraft,
  };
}
