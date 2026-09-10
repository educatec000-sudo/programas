import xlsx from 'xlsx';
import { prisma } from '../../lib/prisma.js';
import { audit, AuditAction } from '../../lib/audit.js';
import { CNCA_COMPONENTS, CNCA_CATALOG_CODE, detectComponent, normalizeCncaText } from './config.js';

/**
 * Colunas que DEVEM SER IGNORADAS pelo importador do CNCA, conforme regras de negócio:
 * - REDE
 * - ESTADO / UF
 * - REGIONAL / DRE
 * - MUNICÍPIO / CIDADE
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
  const norm = normalizeCncaText(headerName);
  if (IGNORED_COLUMN_NAMES.has(norm)) return true;
  if (norm === 'municipio' || norm === 'cidade' || norm === 'uf' || norm === 'estado' || norm === 'rede' || norm === 'regional') return true;
  return false;
}

/**
 * Utilitário robusto de conversão de números suportando padrões pt-BR e EN,
 * porcentagens com símbolo %, decimais implícitas e valores textuais.
 */
export function parseCncaNumber(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const str = String(val).trim().replace(/%/g, '').trim();
  if (!str || str === '-' || str === '—' || str === 'N/A' || str === 'NaN' || str === 'null' || str === 'undefined') {
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
 * Normaliza o nome da escola para correspondência secundária segura quando o INEP não estiver presente.
 * Remove prefixos comuns (E.M.E.F., EMEF, E.M.E.I.E.F., Creche, etc.), acentos, pontuações e espaços múltiplos.
 */
export function normalizeSchoolName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(e\.?m\.?e\.?i\.?e\.?f\.?|e\.?m\.?e\.?f\.?|e\.?e\.?e\.?f\.?m\.?|emeief|emef|eeefm|escola|municipal|estadual|colegio|col|unidade|escolar|ue|creche|dr|doutor|prof|professor|professora)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parser manual de linhas de CSV suportando múltiplos delimitadores (;, ,, \t, |) e aspas escapadas.
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
 * Lê e decodifica arquivos XLSX, XLS ou CSV suportando múltiplos encodings (UTF-8, Windows-1252, ISO-8859-1).
 */
export function readSpreadsheetSheets(fileBuffer, originalFilename = '') {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('O arquivo enviado está vazio.');
  }

  const isCsv = String(originalFilename).toLowerCase().endsWith('.csv') || String(originalFilename).toLowerCase().endsWith('.tsv');
  const isZip = fileBuffer.length >= 4 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b;
  const isOle = fileBuffer.length >= 8 && fileBuffer[0] === 0xd0 && fileBuffer[1] === 0xcf;

  const sheets = [];

  // 1. Se for CSV explícito ou texto puro (não ZIP/OLE), processa diretamente como CSV com detecção de encoding
  if (isCsv || (!isZip && !isOle)) {
    const encodings = ['utf-8', 'windows-1252', 'iso-8859-1'];
    for (const enc of encodings) {
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
        // Tenta próximo
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
      // Continua para fallback
    }
  }

  // 3. Fallback geral caso os anteriores não tenham retornado linhas
  if (!sheets.length) {
    const encodings = ['utf-8', 'windows-1252', 'iso-8859-1'];
    for (const enc of encodings) {
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
        // Tenta próximo
      }
    }
  }

  if (!sheets.length) {
    throw new Error('Nenhuma folha de dados legível encontrada no arquivo. Verifique se o arquivo está no formato .xlsx, .xls ou .csv e contém dados.');
  }

  return sheets;
}

/**
 * Localiza a linha do cabeçalho procurando por termos-chave estruturais do CNCA nas primeiras linhas.
 */
export function findHeaderRowIndex(rows) {
  const keywords = [
    'inep', 'escola', 'matriculados', 'avaliados', 'participacao', 'participação',
    'proficiencia', 'proficiência', 'pcpm', 'precisao', 'precisão', 'fluente',
    'adequado', 'basico', 'básico', 'alfabetico', 'alfabético', 'h01', 'h 01', 'h1', 'd01', 'ano',
    'desempenho', 'habilidade', 'aspecto', 'nota media', 'nota média',
  ];

  let bestIdx = 0;
  let maxScore = -1;

  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const rowText = row.map((c) => normalizeCncaText(c)).join(' ');
    let score = 0;
    for (const kw of keywords) {
      if (rowText.includes(kw)) score += 2;
    }
    // Bonificação para linha que contém identificação de escola
    if ((rowText.includes('inep') || rowText.includes('codigo') || rowText.includes('cd_') || rowText.includes('cod_') || rowText.includes('rede')) && (rowText.includes('escola') || rowText.includes('unidade'))) {
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
 * Mapeia colunas da planilha oficial para a estrutura de dados do CNCA com alta tolerância a variações.
 */
export function mapRowColumns(headers) {
  const mapping = {
    inep: -1,
    schoolName: -1,
    grade: -1,
    assessment: -1,
    component: -1,
    enrolled: -1,
    evaluated: -1,
    participationRate: -1,
    averageScore: -1,
    pcpm: -1,
    ppcpm: -1,
    accuracyRate: -1,
    fluentRate: -1,
    levels: [], // { name, colIdx, isPercent }
    skills: [], // { code, label, colIdx }
    otherCols: [],
  };

  headers.forEach((header, idx) => {
    const norm = normalizeCncaText(header);
    if (!norm) return;

    // 1. INEP / Código da Escola
    if (
      mapping.inep === -1 &&
      (
        norm === 'inep' ||
        norm === 'cod inep' ||
        norm === 'codigo inep' ||
        norm.includes('cod_inep') ||
        norm.includes('codigo_inep') ||
        norm.includes('cd_inep') ||
        norm.includes('nu_inep') ||
        norm === 'cod escola' ||
        norm === 'codigo escola' ||
        norm === 'codigo da escola' ||
        norm.includes('cod_escola') ||
        norm.includes('cd_escola') ||
        norm === 'id escola' ||
        norm.includes('id_escola') ||
        (norm.includes('inep') && !norm.includes('nome') && !norm.includes('ds_'))
      )
    ) {
      mapping.inep = idx;
      return;
    }

    // 2. Ano Escolar / Etapa (checar antes de Escola para evitar falso positivo em "ano escolar")
    if (
      mapping.grade === -1 &&
      (
        norm === 'ano escolar' ||
        norm === 'ano' ||
        norm === 'etapa' ||
        norm === 'serie' ||
        norm === 'série' ||
        norm.includes('ano_escolar') ||
        norm.includes('nu_ano') ||
        norm === 'ano/serie' ||
        norm === 'ano / serie'
      )
    ) {
      mapping.grade = idx;
      return;
    }

    // 3. Nome da Escola
    if (
      mapping.schoolName === -1 &&
      (
        norm === 'escola' ||
        norm === 'nome da escola' ||
        norm === 'nome escola' ||
        norm === 'unidade escolar' ||
        norm.includes('nome_escola') ||
        norm.includes('nm_escola') ||
        norm.includes('ds_escola') ||
        (norm.includes('escola') && !norm.includes('ano') && !norm.includes('cod') && !norm.includes('cd_') && !norm.includes('inep') && !norm.includes('id_'))
      )
    ) {
      mapping.schoolName = idx;
      return;
    }

    // 4. Avaliação / Edição / Ciclo
    if (
      mapping.assessment === -1 &&
      (
        norm === 'avaliacao' ||
        norm === 'avaliação' ||
        norm === 'edicao' ||
        norm === 'edição' ||
        norm === 'ciclo' ||
        norm === 'periodo' ||
        norm === 'período' ||
        norm.includes('etapa_avaliacao') ||
        norm.includes('nm_edicao')
      )
    ) {
      mapping.assessment = idx;
      return;
    }

    // 5. Componente Curricular / Disciplina
    if (
      mapping.component === -1 &&
      (
        norm === 'componente' ||
        norm === 'disciplina' ||
        norm === 'area' ||
        norm === 'área' ||
        norm.includes('componente_curricular') ||
        norm.includes('componente curricular') ||
        norm.includes('nm_disciplina') ||
        norm.includes('nm_componente')
      )
    ) {
      mapping.component = idx;
      return;
    }

    // 6. Taxa de Participação (%) / Avaliados (%)
    if (
      mapping.participationRate === -1 &&
      (
        norm.includes('participa') ||
        norm.includes('% part') ||
        norm.includes('taxa de part') ||
        norm.includes('tx_participa') ||
        norm.includes('perc_participa') ||
        norm === 'avaliados (%)' ||
        norm === '% avaliados' ||
        norm === 'avaliados %' ||
        norm === 'participacao (%)' ||
        norm === '% participacao'
      )
    ) {
      mapping.participationRate = idx;
      return;
    }

    // 7. Matriculados / Previstos
    if (
      mapping.enrolled === -1 &&
      (
        norm.includes('matriculad') ||
        norm.includes('previsto') ||
        norm === 'matricula' ||
        norm === 'matrícula' ||
        norm === 'total de alunos' ||
        norm === 'nº de alunos matriculados' ||
        norm.includes('qtd_matriculad') ||
        norm.includes('nu_matriculad')
      )
    ) {
      mapping.enrolled = idx;
      return;
    }

    // 8. Avaliados / Presentes (número absoluto)
    if (
      mapping.evaluated === -1 &&
      !norm.includes('%') &&
      !norm.includes('taxa') &&
      (
        norm.includes('avaliad') ||
        norm.includes('presente') ||
        norm === 'total avaliados' ||
        norm === 'nº de alunos avaliados' ||
        norm === 'participantes' ||
        norm.includes('qtd_avaliad') ||
        norm.includes('nu_avaliad')
      )
    ) {
      mapping.evaluated = idx;
      return;
    }

    // 9. PCPM (Fluência)
    if (
      mapping.pcpm === -1 &&
      (
        norm.includes('pcpm') ||
        norm.includes('palavras corretas por minuto') ||
        norm === 'ppm' ||
        norm.includes('palavras por minuto')
      )
    ) {
      mapping.pcpm = idx;
      return;
    }

    // 10. PPCPM (Fluência)
    if (
      mapping.ppcpm === -1 &&
      (
        norm.includes('ppcpm') ||
        norm.includes('pseudopalavras por minuto') ||
        norm.includes('pseudopalavras corretas por minuto')
      )
    ) {
      mapping.ppcpm = idx;
      return;
    }

    // 11. Precisão Leitora (Fluência)
    if (
      mapping.accuracyRate === -1 &&
      (
        norm.includes('precisao') ||
        norm.includes('precisão') ||
        norm.includes('taxa de precisao') ||
        norm.includes('tx_precisao')
      )
    ) {
      mapping.accuracyRate = idx;
      return;
    }

    // 12. Proficiência Média / Nota Média / Média de Acertos
    if (
      mapping.averageScore === -1 &&
      (
        norm.includes('profici') ||
        norm.includes('media de acerto') ||
        norm.includes('média de acertos') ||
        norm === 'media' ||
        norm === 'média' ||
        norm === 'nota media' ||
        norm === 'nota média' ||
        norm.includes('nota_media') ||
        norm.includes('pontuacao media') ||
        norm.includes('pontuação média') ||
        norm.includes('media_proficiencia') ||
        norm.includes('vl_proficiencia')
      )
    ) {
      mapping.averageScore = idx;
      return;
    }

    // 13. % Alunos Fluentes (Fluência) ou % Alfabético (Escrita)
    if (
      mapping.fluentRate === -1 &&
      (
        (norm.includes('fluente') && (norm.includes('%') || norm.includes('taxa') || norm.includes('alunos') || norm.includes('leitores') || norm.includes('total') || norm.includes('perc'))) ||
        norm === 'fluentes (%)' || norm === '% fluentes' || norm === 'fluentes' ||
        norm === 'leitor fluente' || norm === 'leitor fluente (%)' ||
        (norm.includes('alfabetico') && (norm.includes('%') || norm.includes('taxa') || norm.includes('alunos') || norm.includes('total') || norm.includes('perc'))) ||
        norm === 'alfabetizados (%)' || norm === '% alfabetizados'
      ) &&
      !norm.includes('pre-leitor') &&
      !norm.includes('iniciante')
    ) {
      mapping.fluentRate = idx;
      if (norm.includes('alunos') || norm.includes('taxa') || norm === '% fluentes' || norm === 'fluentes (%)') {
        return;
      }
    }

    // 14. Habilidades / Descritores Oficiais / Aspectos de Questões (ex: H 01 (%), H01, D01, Questão 1 - Aspecto 1)
    const skillMatch =
      norm.match(/^(?:%?\s*)?([hd])\s*(\d{1,2})\b/i) ||
      norm.match(/^(?:hab|habilidade|habil|descritor|desc|descr)[_\s-]*(\d{1,2})/i) ||
      norm.match(/^([hd]\s*\d{1,2})[_\s-]+/i) ||
      norm.match(/^questao\s*(\d+)\s*-\s*aspecto\s*(\d+)/i);

    if (skillMatch) {
      let code;
      if (skillMatch[0].toLowerCase().startsWith('questao')) {
        code = `Q${String(skillMatch[1]).padStart(2, '0')}A${String(skillMatch[2]).padStart(2, '0')}`;
      } else {
        const num = (skillMatch[2] || skillMatch[1] || '').replace(/\D/g, '');
        const prefix = skillMatch[0].toUpperCase().startsWith('D') ? 'D' : 'H';
        code = `${prefix}${num.padStart(2, '0')}`;
      }
      mapping.skills.push({ code, label: String(header).trim(), colIdx: idx });
      return;
    }

    // 15. Níveis oficiais de desempenho
    const isPercent = norm.includes('%') || norm.includes('percent') || norm.includes('perc_');
    if (
      norm.includes('abaixo do basico') || norm.includes('abaixo do básico') || norm.includes('abaixo_basico') ||
      norm.includes('basico') || norm.includes('básico') ||
      norm.includes('adequado') ||
      norm.includes('avancado') || norm.includes('avançado') ||
      norm.includes('defasagem') ||
      norm.includes('intermediario') || norm.includes('intermediário') ||
      norm.includes('inadequado') ||
      norm.includes('muito baixo') ||
      norm.includes('baixo') ||
      norm.includes('medio') || norm.includes('médio') ||
      norm.includes('alto') ||
      norm.includes('pre-leitor') || norm.includes('pre leitor') || norm.includes('pré-leitor') || norm.includes('pre_leitor') ||
      norm.includes('leitor iniciante') || norm.includes('iniciante') ||
      norm.includes('leitor fluente') || norm.includes('fluente') ||
      norm.includes('pre-silabico') || norm.includes('pre silabico') || norm.includes('pré-silábico') || norm.includes('pre_silabico') ||
      norm.includes('silabico') || norm.includes('silábico') ||
      norm.includes('silabico-alfabetico') || norm.includes('silábico-alfabético') || norm.includes('silabico_alfabetico') ||
      norm.includes('alfabetico') || norm.includes('alfabético')
    ) {
      mapping.levels.push({ name: String(header).trim(), colIdx: idx, isPercent });
      return;
    }

    mapping.otherCols.push({ name: String(header).trim(), colIdx: idx });
  });

  return mapping;
}

/**
 * Localiza ou reutiliza o programa CNCA correspondente ao ciclo de forma consistente.
 */
export async function resolveCncaProgram(programId = null, year = null) {
  if (programId) {
    const p = await prisma.program.findFirst({
      where: { id: programId, deletedAt: null },
      include: { catalog: true },
    });
    if (p) return p;
  }

  const targetYear = Number(year) || new Date().getFullYear();

  // Busca catálogo CNCA
  let catalog = await prisma.programCatalog.findFirst({
    where: { code: CNCA_CATALOG_CODE, deletedAt: null },
  });

  if (!catalog) {
    catalog = await prisma.programCatalog.create({
      data: {
        code: CNCA_CATALOG_CODE,
        name: 'Compromisso Nacional Criança Alfabetizada',
        objective: 'Garantir a alfabetização de todas as crianças na idade certa com análise por escola',
        organ: 'MEC / SEMED',
      },
    });
  }

  // Busca programa do ano
  let program = await prisma.program.findFirst({
    where: { catalogId: catalog.id, year: targetYear, deletedAt: null },
    include: { catalog: true },
  });

  if (!program) {
    const code = `CNCA-${targetYear}`;
    program = await prisma.program.create({
      data: {
        catalogId: catalog.id,
        code,
        name: 'Compromisso Nacional Criança Alfabetizada',
        year: targetYear,
        periodLabel: `Ciclo ${targetYear}`,
        status: 'EM_EXECUCAO',
        globalGoal: 85,
      },
      include: { catalog: true },
    });
  }

  return program;
}

/**
 * Processa uma planilha oficial e extrai os registros do CNCA, validando vínculos
 * por INEP e correspondência secundária por nome com o cadastro existente do CPE.
 *
 * REGRA DINÂMICA DE COLUNAS:
 * - Ignora exclusivamente: REDE, ESTADO, REGIONAL.
 * - Importa todas as outras colunas da planilha preservando exatamente os nomes e ordem originais.
 * - Constrói a prévia com cada coluna individualmente e seus dados 100% reais.
 */
export async function parseCncaSpreadsheet(
  fileBuffer,
  originalFilename = '',
  explicitComponent = null,
  programId = null,
  explicitGrade = null,
  explicitAssessment = null,
) {
  const sheets = readSpreadsheetSheets(fileBuffer, originalFilename);
  if (!sheets.length) {
    throw new Error('Nenhuma folha de dados legível encontrada no arquivo.');
  }

  // Carrega cadastro de escolas ativas no CPE
  const allSchools = await prisma.school.findMany({
    where: { deletedAt: null },
    select: { id: true, inep: true, name: true, zone: true, district: true },
  });

  const schoolByInep = new Map();
  const schoolByName = new Map();

  for (const s of allSchools) {
    if (s.inep) {
      const clean = normalizeInep(s.inep);
      if (clean) schoolByInep.set(clean, s);
    }
    const norm = normalizeSchoolName(s.name);
    if (norm) {
      const existing = schoolByName.get(norm) || [];
      existing.push(s);
      schoolByName.set(norm, existing);
    }
  }

  const parsedRecords = [];
  const unmatchedIneps = new Set();
  const unmatchedSchools = new Set();
  const fileComponentHint = detectComponent(originalFilename);

  // Busca registros existentes no banco para diferenciar novos de atualizações
  const existingResults = programId
    ? await prisma.cncaSchoolResult.findMany({
        where: { programId },
        select: { schoolId: true, year: true, assessment: true, grade: true, component: true },
      })
    : [];

  const existingKeySet = new Set(
    existingResults.map((r) => `${r.schoolId}_${r.grade}_${r.component}_${r.assessment}`),
  );

  let totalRawRows = 0;
  let ignoredBlankRows = 0;
  let allFoundHeaders = [];
  let allIgnoredColumns = [];
  let allImportedColumns = [];

  for (const sheet of sheets) {
    const { sheetName, rows } = sheet;
    if (rows.length < 2) continue;

    const headerIdx = findHeaderRowIndex(rows);
    const rawHeaders = rows[headerIdx].map((c) => String(c || '').trim());
    allFoundHeaders = rawHeaders;

    // Regra de colunas: Ignora REDE, ESTADO, REGIONAL e importa todas as demais
    const ignoredCols = [];
    const importedCols = [];
    const importedColIndices = [];

    rawHeaders.forEach((header, idx) => {
      if (!header) return;
      if (isIgnoredColumn(header)) {
        ignoredCols.push(header);
      } else {
        importedCols.push(header);
        importedColIndices.push(idx);
      }
    });

    allIgnoredColumns = ignoredCols;
    allImportedColumns = importedCols;

    const colMap = mapRowColumns(rawHeaders);

    // Identificação do componente (explícito > aba > arquivo > cabeçalho > padrão MATEMATICA)
    const sheetComponentHint = detectComponent(sheetName);
    const resolvedComponent =
      explicitComponent ||
      sheetComponentHint ||
      fileComponentHint ||
      detectComponent(rawHeaders.join(' ')) ||
      'MATEMATICA';

    // Etapa / Ano Escolar padrão
    let defaultGrade = explicitGrade || '2º Ano';
    if (!explicitGrade) {
      const gradeSearch = normalizeCncaText(`${sheetName} ${originalFilename} ${rawHeaders.join(' ')}`);
      if (gradeSearch.includes('3º ano') || gradeSearch.includes('3 ano') || gradeSearch.includes('3ºano') || gradeSearch.includes('3ano') || gradeSearch.includes('3° ano') || gradeSearch.includes('3°ano') || gradeSearch.includes('3o ano')) {
        defaultGrade = '3º Ano';
      } else if (gradeSearch.includes('1º ano') || gradeSearch.includes('1 ano') || gradeSearch.includes('1ºano') || gradeSearch.includes('1ano') || gradeSearch.includes('1° ano') || gradeSearch.includes('1°ano') || gradeSearch.includes('1o ano')) {
        defaultGrade = '1º Ano';
      } else if (gradeSearch.includes('4º ano') || gradeSearch.includes('4 ano') || gradeSearch.includes('4ºano') || gradeSearch.includes('4ano') || gradeSearch.includes('4° ano') || gradeSearch.includes('4°ano') || gradeSearch.includes('4o ano')) {
        defaultGrade = '4º Ano';
      } else if (gradeSearch.includes('5º ano') || gradeSearch.includes('5 ano') || gradeSearch.includes('5ºano') || gradeSearch.includes('5ano') || gradeSearch.includes('5° ano') || gradeSearch.includes('5°ano') || gradeSearch.includes('5o ano')) {
        defaultGrade = '5º Ano';
      } else if (gradeSearch.includes('2º ano') || gradeSearch.includes('2 ano') || gradeSearch.includes('2ºano') || gradeSearch.includes('2ano') || gradeSearch.includes('2° ano') || gradeSearch.includes('2°ano') || gradeSearch.includes('2o ano')) {
        defaultGrade = '2º Ano';
      }
    }

    // Avaliação padrão
    let defaultAssessment = explicitAssessment || 'Diagnóstica';
    if (!explicitAssessment) {
      const assessSearch = normalizeCncaText(`${sheetName} ${originalFilename} ${rawHeaders.join(' ')}`);
      if (assessSearch.includes('formativa 1') || assessSearch.includes('formativa 01') || assessSearch.includes('a1')) {
        defaultAssessment = 'Formativa 1';
      } else if (assessSearch.includes('formativa 2') || assessSearch.includes('formativa 02') || assessSearch.includes('a2')) {
        defaultAssessment = 'Formativa 2';
      } else if (assessSearch.includes('somativa') || assessSearch.includes('a3') || assessSearch.includes('saida')) {
        defaultAssessment = 'Somativa';
      } else if (assessSearch.includes('diagnostica') || assessSearch.includes('a0') || assessSearch.includes('entrada')) {
        defaultAssessment = 'Diagnóstica';
      }
    }

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row.length) continue;
      totalRawRows++;

      // Extrai INEP da linha ou da célula de Escola (ex: "E M E F ACENDENDO AS LUZES - 15145425")
      let rawInep = colMap.inep !== -1 ? row[colMap.inep] : null;
      let rawSchoolCell = colMap.schoolName !== -1 ? String(row[colMap.schoolName] || '').trim() : '';

      if (!rawInep && rawSchoolCell) {
        const inepMatch = rawSchoolCell.match(/\b(\d{7,8})\b/);
        if (inepMatch) {
          rawInep = inepMatch[1];
        }
      }

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

      // Ignora linhas totalmente vazias ou sumários de rodapé
      if (!cleanInep && !schoolName) {
        ignoredBlankRows++;
        continue;
      }

      // Constrói displayValues fielmente com cada coluna importável e seu valor bruto real
      const displayValues = {};
      importedColIndices.forEach((colIdx) => {
        const colHeader = rawHeaders[colIdx];
        const val = row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]).trim() : '';
        displayValues[colHeader] = val;
      });

      const enrolled = colMap.enrolled !== -1 ? parseCncaNumber(row[colMap.enrolled]) : null;
      const evaluated = colMap.evaluated !== -1 ? parseCncaNumber(row[colMap.evaluated]) : null;
      let participationRate = colMap.participationRate !== -1 ? parseCncaNumber(row[colMap.participationRate]) : null;

      if (participationRate == null && enrolled != null && evaluated != null && enrolled > 0) {
        participationRate = Math.round((evaluated / enrolled) * 1000) / 10;
      }

      const averageScore = colMap.averageScore !== -1 ? parseCncaNumber(row[colMap.averageScore]) : null;
      const pcpm = colMap.pcpm !== -1 ? parseCncaNumber(row[colMap.pcpm]) : null;
      const ppcpm = colMap.ppcpm !== -1 ? parseCncaNumber(row[colMap.ppcpm]) : null;
      const accuracyRate = colMap.accuracyRate !== -1 ? parseCncaNumber(row[colMap.accuracyRate]) : null;
      let fluentRate = colMap.fluentRate !== -1 ? parseCncaNumber(row[colMap.fluentRate]) : null;
      const rawFluentCell = colMap.fluentRate !== -1 ? String(row[colMap.fluentRate] || '') : '';
      if (fluentRate != null && evaluated && evaluated > 0 && !rawFluentCell.includes('%') && fluentRate <= evaluated) {
        fluentRate = Math.round((fluentRate / evaluated) * 1000) / 10;
      }

      let rowGrade = explicitGrade || (colMap.grade !== -1 && row[colMap.grade] ? String(row[colMap.grade]).trim() : defaultGrade);
      if (!explicitGrade) {
        const normGrade = normalizeCncaText(rowGrade);
        if (normGrade.includes('3 ano') || normGrade.includes('3º ano') || normGrade.includes('3° ano') || normGrade.includes('3o ano')) rowGrade = '3º Ano';
        else if (normGrade.includes('1 ano') || normGrade.includes('1º ano') || normGrade.includes('1° ano') || normGrade.includes('1o ano')) rowGrade = '1º Ano';
        else if (normGrade.includes('4 ano') || normGrade.includes('4º ano') || normGrade.includes('4° ano') || normGrade.includes('4o ano')) rowGrade = '4º Ano';
        else if (normGrade.includes('5 ano') || normGrade.includes('5º ano') || normGrade.includes('5° ano') || normGrade.includes('5o ano')) rowGrade = '5º Ano';
        else if (normGrade.includes('2 ano') || normGrade.includes('2º ano') || normGrade.includes('2° ano') || normGrade.includes('2o ano')) rowGrade = '2º Ano';
      }

      let rowAssessment = explicitAssessment || (colMap.assessment !== -1 && row[colMap.assessment] ? String(row[colMap.assessment]).trim() : defaultAssessment);
      if (!explicitAssessment) {
        const normAssess = normalizeCncaText(rowAssessment);
        if (normAssess.includes('formativa 1') || normAssess.includes('formativa 01') || normAssess.includes('a1')) rowAssessment = 'Formativa 1';
        else if (normAssess.includes('formativa 2') || normAssess.includes('formativa 02') || normAssess.includes('a2')) rowAssessment = 'Formativa 2';
        else if (normAssess.includes('somativa') || normAssess.includes('a3') || normAssess.includes('saida')) rowAssessment = 'Somativa';
        else if (normAssess.includes('diagnostica') || normAssess.includes('a0') || normAssess.includes('entrada')) rowAssessment = 'Diagnóstica';
      }

      const rowComponent = explicitComponent || (colMap.component !== -1 && row[colMap.component] ? (detectComponent(row[colMap.component]) || resolvedComponent) : resolvedComponent);

      // Níveis de desempenho da linha
      const performanceLevels = [];
      for (const lvl of colMap.levels) {
        const rawCell = row[lvl.colIdx];
        const hasPercentSign = String(rawCell || '').includes('%');
        const isLevelPercent = lvl.isPercent || hasPercentSign;
        const val = parseCncaNumber(rawCell);
        if (val != null) {
          performanceLevels.push({
            level: lvl.name,
            percentage: isLevelPercent ? val : (evaluated && evaluated > 0 ? Math.round((val / evaluated) * 1000) / 10 : null),
            count: !isLevelPercent ? Math.round(val) : (evaluated && evaluated > 0 ? Math.round((val * evaluated) / 100) : null),
          });
        }
      }

      // Se fluentRate não veio explícito, obtém do nível correspondente
      if (fluentRate == null) {
        const fluentLevel = performanceLevels.find((l) => {
          const n = normalizeCncaText(l.level);
          return (n.includes('fluente') || n.includes('alfabetico') || n.includes('alfabético') || n === 'alto') && !n.includes('pre-leitor') && !n.includes('iniciante');
        });
        if (fluentLevel) {
          if (fluentLevel.percentage != null) {
            fluentRate = fluentLevel.percentage;
          } else if (fluentLevel.count != null && evaluated && evaluated > 0) {
            fluentRate = Math.round((fluentLevel.count / evaluated) * 1000) / 10;
          }
        }
      }

      // Habilidades e descritores (H01, H02, H03... até H20, D01, D02..., Q01A01...)
      const skills = [];
      for (const sk of colMap.skills) {
        const val = parseCncaNumber(row[sk.colIdx]);
        if (val != null) {
          skills.push({
            code: sk.code,
            name: sk.label,
            percentage: val,
          });
        }
      }

      // Detalhes brutos originais da linha preservando todas as colunas importadas
      const rawDetails = { ...displayValues };

      // Estratégia de correspondência com cadastro existente:
      // 1º: Código INEP (chave principal)
      // 2º: Nome normalizado (se INEP ausente e houver correspondência única segura)
      let matchedSchool = null;
      let status = 'VALIDO';
      let error = null;

      if (cleanInep) {
        matchedSchool = schoolByInep.get(cleanInep) || null;
        if (!matchedSchool) {
          status = 'INVALIDO';
          error = `Escola com INEP ${cleanInep} não está cadastrada no CPE.`;
          unmatchedIneps.add(cleanInep);
        }
      } else if (schoolName) {
        const normName = normalizeSchoolName(schoolName);
        const candidates = schoolByName.get(normName) || [];
        if (candidates.length === 1) {
          matchedSchool = candidates[0];
        } else if (candidates.length > 1) {
          status = 'INVALIDO';
          error = `Nome ambíguo "${schoolName}": múltiplas escolas encontradas sem INEP para desempate.`;
          unmatchedSchools.add(schoolName);
        } else {
          status = 'INVALIDO';
          error = `Escola "${schoolName}" não localizada no cadastro de escolas do CPE.`;
          unmatchedSchools.add(schoolName);
        }
      } else {
        status = 'INVALIDO';
        error = 'Identificação da escola (INEP ou Nome) ausente na linha.';
      }

      const isExistingInDb = matchedSchool
        ? existingKeySet.has(`${matchedSchool.id}_${rowGrade}_${rowComponent}_${rowAssessment}`)
        : false;

      parsedRecords.push({
        rowNumber: r + 1,
        sheetName,
        inep: cleanInep || rawInep || matchedSchool?.inep || null,
        schoolName: schoolName || matchedSchool?.name || '—',
        matchedSchool: matchedSchool ? { id: matchedSchool.id, name: matchedSchool.name, inep: matchedSchool.inep } : null,
        grade: rowGrade,
        assessment: rowAssessment,
        component: rowComponent,
        enrolled: enrolled != null ? Math.round(enrolled) : null,
        evaluated: evaluated != null ? Math.round(evaluated) : null,
        participationRate,
        averageScore,
        pcpm,
        ppcpm,
        accuracyRate,
        fluentRate,
        performanceLevels,
        skills,
        rawDetails,
        displayValues,
        status,
        error,
        action: isExistingInDb ? 'ATUALIZAR' : 'NOVO',
      });
    }
  }

  // Identificação de duplicidades no próprio arquivo (ex: linhas PÚBLICA vs MUNICIPAL de exportações oficiais)
  const seenKeys = new Map();
  for (const rec of parsedRecords) {
    if (rec.status !== 'VALIDO' || !rec.matchedSchool?.id) continue;
    const key = `${rec.matchedSchool.id}_${rec.grade}_${rec.component}_${rec.assessment}`;
    if (seenKeys.has(key)) {
      rec.isDuplicate = true;
      rec.isExcludedFromPublish = true;
      rec.warning = 'Registro repetido na planilha para a mesma escola e etapa (duplicata desconsiderada da publicação).';
    } else {
      rec.isDuplicate = false;
      rec.isExcludedFromPublish = false;
      seenKeys.set(key, rec);
    }
  }

  // Registros válidos únicos que realmente serão importados/publicados
  const uniqueValidRows = parsedRecords.filter((r) => r.status === 'VALIDO' && !r.isDuplicate);
  const duplicateRows = parsedRecords.filter((r) => r.isDuplicate);
  const invalidRows = parsedRecords.filter((r) => r.status === 'INVALIDO');
  const newRows = uniqueValidRows.filter((r) => r.action === 'NOVO');
  const updatedRows = uniqueValidRows.filter((r) => r.action === 'ATUALIZAR');
  const distinctMatchedSchools = new Set(uniqueValidRows.map((r) => r.matchedSchool?.id).filter(Boolean));

  const errorsSummary = invalidRows.map((r) => ({
    rowNumber: r.rowNumber,
    schoolName: r.schoolName,
    inep: r.inep,
    message: r.error,
  }));

  return {
    summary: {
      totalRows: totalRawRows,
      totalColumns: allFoundHeaders.length,
      importedColumnsCount: allImportedColumns.length,
      ignoredColumnsCount: allIgnoredColumns.length,
      ignoredColumns: allIgnoredColumns,
      importedColumns: allImportedColumns,
      validRows: uniqueValidRows.length,
      totalValidRowsRaw: parsedRecords.filter((r) => r.status === 'VALIDO').length,
      newRows: newRows.length,
      updatedRows: updatedRows.length,
      invalidRows: invalidRows.length,
      ignoredRows: ignoredBlankRows,
      duplicateCount: duplicateRows.length,
      matchedSchoolsCount: distinctMatchedSchools.size,
      unmatchedCount: unmatchedIneps.size + unmatchedSchools.size,
      unmatchedIneps: Array.from(unmatchedIneps),
      unmatchedSchools: Array.from(unmatchedSchools),
      detectedComponent: parsedRecords[0]?.component || 'MATEMATICA',
      detectedGrade: parsedRecords[0]?.grade || '2º Ano',
      detectedAssessment: parsedRecords[0]?.assessment || 'Diagnóstica',
      errorsSummary,
    },
    rows: parsedRecords,
  };
}

/**
 * Persiste os registros validados no banco de dados de forma transacional, em lotes e idempotente.
 * Suporta gravação como Rascunho (asDraft = true) ou Consolidado/Oficial (asDraft = false).
 *
 * ARQUITETURA DE PERSISTÊNCIA:
 * 1. Pré-processamento e deduplicação em memória.
 * 2. Vinculação de escolas participantes em lote (createMany/skipDuplicates ou upsert).
 * 3. Pré-carregamento em lote (findMany) dos registros existentes para evitar centenas de roundtrips
 *    sequenciais de findUnique dentro de uma transação interativa longa.
 * 4. Gravação transacional em lotes controlados (chunks de 50 registros), garantindo que cada
 *    transação no PostgreSQL/Supabase dure poucos milissegundos e nunca expire no pooler remoto.
 */
export async function confirmCncaImport(programId, records, year = null, actor = null, ip = null, asDraft = false) {
  const program = await resolveCncaProgram(programId, year);
  const targetProgramId = program.id;

  // Filtra registros válidos e remove duplicidades mantendo 1 registro único por escola/etapa/componente/avaliação
  const validMap = new Map();
  for (const r of records) {
    if ((r.status === 'VALIDO' || r.matchedSchool?.id) && r.matchedSchool?.id && !r.isDuplicate && !r.isExcludedFromPublish) {
      const key = `${r.matchedSchool.id}_${r.grade || '2º Ano'}_${r.component}_${r.assessment || 'Diagnóstica'}`;
      if (!validMap.has(key)) {
        validMap.set(key, r);
      }
    }
  }

  // Fallback caso todos tenham vindo sem o flag isDuplicate
  if (validMap.size === 0 && records.length > 0) {
    for (const r of records) {
      if ((r.status === 'VALIDO' || r.matchedSchool?.id) && r.matchedSchool?.id) {
        const key = `${r.matchedSchool.id}_${r.grade || '2º Ano'}_${r.component}_${r.assessment || 'Diagnóstica'}`;
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

  const importYear = Number(year) || program.year || new Date().getFullYear();
  const schoolIds = Array.from(new Set(validRecords.map((r) => r.matchedSchool.id)));
  const sourceValue = asDraft ? 'RASCUNHO' : 'IMPORTACAO';

  // 1. Vinculação em lote de escolas participantes
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
      // Fallback se createMany falhar
      if (typeof prisma.programSchool?.upsert === 'function') {
        for (const schoolId of schoolIds) {
          try {
            await prisma.programSchool.upsert({
              where: { programId_schoolId: { programId: targetProgramId, schoolId } },
              create: { programId: targetProgramId, schoolId, active: true },
              update: { active: true },
            });
          } catch {
            // Ignora erro de corrida
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

  // 2. Pré-carregamento em lote dos resultados existentes (1 único roundtrip rápido)
  const existingMap = new Map();
  if (typeof prisma.cncaSchoolResult?.findMany === 'function') {
    try {
      const existingResults = await prisma.cncaSchoolResult.findMany({
        where: {
          programId: targetProgramId,
          schoolId: { in: schoolIds },
          year: importYear,
        },
        select: {
          id: true,
          schoolId: true,
          grade: true,
          component: true,
          assessment: true,
        },
      });
      for (const res of existingResults) {
        const key = `${res.schoolId}_${res.grade}_${res.component}_${res.assessment}`;
        existingMap.set(key, res.id);
      }
    } catch {
      // Se findMany falhar, o Map permanece vazio e usará fallback
    }
  }

  // 3. Monta operações estruturadas
  const preparedOperations = validRecords.map((rec) => {
    const grade = rec.grade || '2º Ano';
    const assessment = rec.assessment || 'Diagnóstica';
    const component = rec.component;
    const data = {
      programId: targetProgramId,
      schoolId: rec.matchedSchool.id,
      year: importYear,
      assessment,
      grade,
      component,
      enrolled: rec.enrolled,
      evaluated: rec.evaluated,
      participationRate: rec.participationRate,
      averageScore: rec.averageScore,
      pcpm: rec.pcpm,
      ppcpm: rec.ppcpm,
      accuracyRate: rec.accuracyRate,
      fluentRate: rec.fluentRate,
      performanceLevels: rec.performanceLevels || [],
      skills: rec.skills || [],
      rawDetails: rec.rawDetails || rec.displayValues || {},
      source: sourceValue,
    };
    const key = `${rec.matchedSchool.id}_${grade}_${component}_${assessment}`;
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
      // Garante vinculação no contexto da transação caso o driver/mock assim exija
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
            // Ignora se já vinculado
          }
        }
      }

      for (const op of chunk) {
        let existingId = op.existingId;

        // Se não soubermos pelo pre-fetch (ex: em mocks de teste sem findMany compartilhado), consulta tx
        if (!existingId && typeof tx.cncaSchoolResult?.findUnique === 'function' && existingMap.size === 0) {
          const found = await tx.cncaSchoolResult.findUnique({
            where: {
              programId_schoolId_year_assessment_grade_component: {
                programId: targetProgramId,
                schoolId: op.data.schoolId,
                year: importYear,
                assessment: op.data.assessment,
                grade: op.data.grade,
                component: op.data.component,
              },
            },
            select: { id: true },
          });
          if (found) existingId = found.id || true;
        }

        if (existingId) {
          if (typeof tx.cncaSchoolResult?.update === 'function') {
            await tx.cncaSchoolResult.update({
              where: {
                ...(typeof existingId === 'string'
                  ? { id: existingId }
                  : {
                      programId_schoolId_year_assessment_grade_component: {
                        programId: targetProgramId,
                        schoolId: op.data.schoolId,
                        year: importYear,
                        assessment: op.data.assessment,
                        grade: op.data.grade,
                        component: op.data.component,
                      },
                    }),
              },
              data: op.data,
            });
          } else if (typeof tx.cncaSchoolResult?.upsert === 'function') {
            await tx.cncaSchoolResult.upsert({
              where: {
                programId_schoolId_year_assessment_grade_component: {
                  programId: targetProgramId,
                  schoolId: op.data.schoolId,
                  year: importYear,
                  assessment: op.data.assessment,
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
          if (typeof tx.cncaSchoolResult?.create === 'function') {
            await tx.cncaSchoolResult.create({
              data: op.data,
            });
          } else if (typeof tx.cncaSchoolResult?.upsert === 'function') {
            await tx.cncaSchoolResult.upsert({
              where: {
                programId_schoolId_year_assessment_grade_component: {
                  programId: targetProgramId,
                  schoolId: op.data.schoolId,
                  year: importYear,
                  assessment: op.data.assessment,
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
    }, { maxWait: 15_000, timeout: 30_000 });
  }

  // 5. Auditoria da importação
  if (actor) {
    await audit({
      userId: actor?.id,
      userName: actor?.name || 'técnico',
      action: asDraft ? AuditAction.IMPORT_PREVIEW : AuditAction.IMPORT_CONFIRM,
      entity: 'CncaSchoolResult',
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
