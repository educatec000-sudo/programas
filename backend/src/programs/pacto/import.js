import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import XLSX from 'xlsx';
import * as cptable from 'xlsx/dist/cpexcel.full.mjs';
import { normalizeKey, toNumber } from '../../modules/imports/parser.js';
import { getAssessmentDefinition } from './config.js';

XLSX.set_cptable(cptable);

const MAX_IMPORT_ROWS = 10000;
const MAX_IMPORT_GROUPS = 500;
const IMPORT_ASSESSMENTS = new Set(['A0', 'A1', 'A2', 'A3']);
const FORWARD_FILL_FIELDS = new Set(['grade', 'className', 'assessment', 'shift', 'component', 'skill']);

export const PACTO_IMPORT_FIELDS = [
  { key: 'grade', label: 'Ano escolar', required: true, aliases: ['ano', 'ano escolar', 'serie', 'série', 'ano turma'] },
  { key: 'className', label: 'Turma', required: true, aliases: ['turma', 'nome turma', 'classe', 'nome da turma'] },
  { key: 'assessment', label: 'Avaliação', required: true, aliases: ['avaliacao', 'avaliação', 'etapa avaliacao', 'etapa da avaliação', 'aplicacao', 'teste'] },
  { key: 'shift', label: 'Turno', aliases: ['turno', 'horario', 'horário'] },
  { key: 'enrolled', label: 'Alunos matriculados', aliases: ['alunos matriculados', 'matriculados', 'matricula', 'matrícula', 'total matriculados'] },
  { key: 'evaluated', label: 'Alunos avaliados', aliases: ['alunos avaliados', 'avaliados', 'total avaliados', 'presentes'] },
  { key: 'component', label: 'Componente curricular', aliases: ['componente', 'componente curricular', 'disciplina', 'area', 'área'] },
  { key: 'skill', label: 'Indicador/Habilidade', aliases: ['indicador', 'habilidade', 'eixo', 'descritor'] },
  { key: 'level', label: 'Nível de proficiência', aliases: ['nivel', 'nível', 'nivel proficiencia', 'nível de proficiência', 'perfil', 'classificacao', 'classificação'] },
  { key: 'count', label: 'Quantidade', aliases: ['quantidade', 'qtd', 'qtde', 'contagem', 'numero de alunos', 'número de alunos'] },
  { key: 'percentage', label: 'Percentual (somente conferência)', aliases: ['percentual', 'porcentagem', 'percentagem', '%'] },
];

function words(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !['de', 'da', 'do', 'dos', 'das', 'em', 'por'].includes(word));
}

function levenshtein(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

export function pactoImportSimilarity(left, right) {
  const a = normalizeKey(left);
  const b = normalizeKey(right);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if ((a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) >= 4) {
    return 86 - Math.min(15, Math.abs(a.length - b.length));
  }
  const aWords = new Set(words(left));
  const bWords = new Set(words(right));
  if (
    (a.length <= 3 && bWords.has(a))
    || (b.length <= 3 && aWords.has(b))
  ) return 72;

  const intersection = [...aWords].filter((word) => bWords.has(word)).length;
  const union = new Set([...aWords, ...bWords]).size;
  const tokenScore = union ? (intersection / union) * 82 : 0;
  const editScore = (1 - (levenshtein(a, b) / Math.max(a.length, b.length))) * 78;
  return Math.max(tokenScore, editScore, 0);
}

function resultFields() {
  const definitions = [
    getAssessmentDefinition(1, 'A0'),
    getAssessmentDefinition(2, 'A0'),
    getAssessmentDefinition(1, 'A1'),
  ];
  const fields = new Map();
  for (const definition of definitions) {
    for (const component of definition.components) {
      for (const skill of component.skills) {
        for (const level of skill.levels) {
          const key = `${component.code}:${skill.code}:${level.code}`;
          const shortLevel = level.label.split('—')[0].trim();
          const aliases = [
            ...(component.code === 'INICIAL' ? [] : [level.label, shortLevel]),
            ...(level.code === 'LEITOR_INICIAL' ? ['Leitores inicial'] : []),
            `${skill.label} ${level.label}`,
            `${skill.label} ${shortLevel}`,
            `${component.label} ${skill.label} ${level.label}`,
            `${skill.code} ${level.code}`,
          ];
          if (fields.has(key)) {
            fields.get(key).aliases = [...new Set([...fields.get(key).aliases, ...aliases])];
          } else {
            fields.set(key, {
              key,
              component: component.code,
              componentLabel: component.label,
              skill: skill.code,
              skillLabel: skill.label,
              level: level.code,
              levelLabel: level.label,
              aliases: [...new Set(aliases)],
            });
          }
        }
      }
    }
  }
  return [...fields.values()];
}

export const PACTO_IMPORT_RESULT_FIELDS = resultFields();

function bestColumn(columns, aliases, used = new Set()) {
  let best = null;
  for (const column of columns) {
    if (used.has(column.key)) continue;
    for (const alias of aliases) {
      const score = pactoImportSimilarity(column.label, alias);
      if (!best || score > best.score) best = { key: column.key, score };
    }
  }
  return best && best.score >= 62 ? best : null;
}

function containedPhraseScore(label, phrase) {
  const labelWords = new Set(words(label));
  const phraseWords = words(phrase);
  return phraseWords.length && phraseWords.every((word) => labelWords.has(word)) ? 80 : 0;
}

function resultColumnScore(column, field) {
  const label = String(column.label);
  const semanticAdjustment = /(percent|porcent|%)/i.test(label)
    ? -35
    : /(quant|qtd|qtde|numero|número|nº)/i.test(label) ? 6 : 0;
  if (field.component === 'INICIAL') {
    const skillScore = Math.max(
      pactoImportSimilarity(label, field.skillLabel),
      containedPhraseScore(label, field.skillLabel),
    );
    const levelScore = Math.max(
      pactoImportSimilarity(label, field.levelLabel),
      containedPhraseScore(label, field.levelLabel),
    );
    if (skillScore < 58 || levelScore < 58) return 0;
    return Math.min(skillScore, levelScore) + semanticAdjustment;
  }
  return Math.max(...field.aliases.map((alias) => pactoImportSimilarity(label, alias)))
    + semanticAdjustment;
}

function autoMapResultColumns(columns, initiallyUsed = new Set()) {
  const results = {};
  const resultUsed = new Set(initiallyUsed);
  for (const field of PACTO_IMPORT_RESULT_FIELDS) {
    let best = null;
    for (const column of columns) {
      if (resultUsed.has(column.key)) continue;
      const score = resultColumnScore(column, field);
      if (!best || score > best.score) best = { key: column.key, score };
    }
    if (best && best.score >= 68) {
      results[field.key] = best.key;
      resultUsed.add(best.key);
    }
  }
  return results;
}

function autoMapResultPercentageColumns(columns, results) {
  const quantityColumns = Object.entries(results)
    .map(([resultKey, source]) => ({ resultKey, index: columns.findIndex((column) => column.key === source) }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index);
  const percentageColumns = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => /(percent|porcent|%)/i.test(String(column.label)))
    .sort((left, right) => left.index - right.index);
  if (!quantityColumns.length || percentageColumns.length !== quantityColumns.length) return {};
  return Object.fromEntries(quantityColumns.map((quantity, index) => (
    [quantity.resultKey, percentageColumns[index].column.key]
  )));
}

export function autoMapPactoColumns(columns) {
  // Reserve primeiro as colunas de um provável formato largo; assim “Quantidade
  // de pré-leitores” não é confundida com a coluna genérica Quantidade do formato longo.
  const potentialResults = autoMapResultColumns(columns);
  const isWide = Object.keys(potentialResults).length >= 2;
  const reserved = new Set(isWide ? Object.values(potentialResults) : []);
  const mapped = {};
  const used = new Set(reserved);
  // Primeiro fixe correspondências exatas de todos os campos. Isso impede, por
  // exemplo, que o alias composto “Ano/Turma” consuma a coluna exata “Turma”.
  for (const field of PACTO_IMPORT_FIELDS) {
    const exact = columns.find((column) => (
      !used.has(column.key)
      && field.aliases.some((alias) => normalizeKey(column.label) === normalizeKey(alias))
    ));
    if (exact) {
      mapped[field.key] = exact.key;
      used.add(exact.key);
    }
  }
  for (const field of PACTO_IMPORT_FIELDS) {
    if (mapped[field.key]) continue;
    const best = bestColumn(columns, field.aliases, used);
    if (best) {
      mapped[field.key] = best.key;
      used.add(best.key);
    }
  }
  if (isWide) {
    delete mapped.level;
    delete mapped.count;
    delete mapped.percentage;
  }
  const scalarUsed = new Set(Object.values(mapped));
  const results = isWide ? potentialResults : autoMapResultColumns(columns, scalarUsed);
  const resultPercentages = isWide ? autoMapResultPercentageColumns(columns, results) : {};
  return { columns: mapped, results, resultPercentages };
}

function csvEncodingScore(text) {
  const normalized = String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const markers = [
    'avaliac', 'lingua', 'nivel', 'numero', 'aluno', 'turma', 'ano',
    'leitura', 'compreens', 'proficien', 'matriculad',
  ];
  const recognized = markers.reduce((score, marker) => (
    score + ((normalized.split(marker).length - 1) * 3)
  ), 0);
  const controlCharacters = (String(text).match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufffd]/g) || []).length;
  return recognized - (controlCharacters * 4);
}

function csvCodepage(buffer, filename) {
  if (path.extname(filename).toLowerCase() !== '.csv') return undefined;
  try {
    // SheetJS detecta UTF-8 (inclusive BOM) corretamente sem codepage forçada.
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return undefined;
  } catch {
    // Alguns relatórios oficiais são exportados em Mac Roman ou DOS CP850.
    // A codificação alternativa só é usada quando o texto português fica
    // inequivocamente mais reconhecível que em Windows-1252.
    const candidates = [
      { codepage: 1252, text: new TextDecoder('windows-1252').decode(buffer) },
      { codepage: 10000, text: new TextDecoder('macintosh').decode(buffer) },
      { codepage: 850, text: cptable.utils.decode(850, buffer) },
    ].map((candidate) => ({ ...candidate, score: csvEncodingScore(candidate.text) }));
    candidates.sort((left, right) => right.score - left.score);
    const windows = candidates.find((candidate) => candidate.codepage === 1252);
    return candidates[0].score > windows.score + 10 ? candidates[0].codepage : 1252;
  }
}

function cellText(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function fillMergedCells(rows, merges = []) {
  for (const merge of merges) {
    const value = rows[merge.s.r]?.[merge.s.c];
    if (value === undefined || value === '') continue;
    for (let row = merge.s.r; row <= merge.e.r; row++) {
      if (!rows[row]) rows[row] = [];
      for (let column = merge.s.c; column <= merge.e.c; column++) {
        if (rows[row][column] === undefined || rows[row][column] === '') rows[row][column] = value;
      }
    }
  }
}

function expandHeaderParentRow(row, childRow, width) {
  const expanded = Array.from({ length: width }, (_, index) => cellText(row?.[index]));
  const populated = expanded
    .map((value, index) => (!isBlank(value) ? index : -1))
    .filter((index) => index >= 0);
  if (populated.length < 2) return expanded;
  const startsAt = populated[1] - populated[0] > 3 ? 1 : 0;
  for (let position = startsAt; position < populated.length; position++) {
    const index = populated[position];
    const hasNextParent = position + 1 < populated.length;
    const next = populated[position + 1] ?? width;
    for (let target = index + 1; target < Math.min(next, index + 3); target++) {
      if (!hasNextParent && isBlank(childRow?.[target])) continue;
      if (isBlank(expanded[target])) expanded[target] = expanded[index];
    }
  }
  return expanded;
}

function headerAt(rows, rowIndex, depth) {
  const sourceRows = rows.slice(rowIndex, rowIndex + depth);
  const width = Math.max(...sourceRows.map((row) => row?.length || 0), 0);
  const headerRows = sourceRows.map((row, index) => (
    index < sourceRows.length - 1
      ? expandHeaderParentRow(row, sourceRows[index + 1], width)
      : row
  ));
  const keys = new Map();
  const columns = [];
  for (let column = 0; column < width; column++) {
    const parts = headerRows
      .map((row) => cellText(row?.[column]))
      .filter((value, index, values) => value !== '' && value != null && values.indexOf(value) === index)
      .map(String);
    if (!parts.length) continue;
    const label = parts.join(' · ');
    const base = normalizeKey(label) || `coluna${column + 1}`;
    const occurrence = (keys.get(base) || 0) + 1;
    keys.set(base, occurrence);
    columns.push({ key: occurrence === 1 ? base : `${base}__${occurrence}`, label, index: column });
  }
  return columns;
}

function headerScore(columns) {
  const auto = autoMapPactoColumns(columns);
  const core = ['grade', 'className', 'assessment'].filter((key) => auto.columns[key]).length;
  const longEvidence = ['level', 'count'].filter((key) => auto.columns[key]).length;
  const context = ['enrolled', 'evaluated', 'skill', 'component'].filter((key) => auto.columns[key]).length;
  const wideEvidence = Object.keys(auto.results).length;
  const valid = core >= 2 && (longEvidence >= 1 || wideEvidence >= 2) && (context >= 1 || longEvidence === 2);
  return { score: (core * 20) + (longEvidence * 10) + (context * 3) + Math.min(20, wideEvidence * 3), valid };
}

function extractTablesFromSheet(sheetName, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: true });
  fillMergedCells(rows, sheet['!merges'] || []);
  const candidates = [];
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, MAX_IMPORT_ROWS + 100); rowIndex++) {
    let best = null;
    for (let depth = 1; depth <= 3 && rowIndex + depth <= rows.length; depth++) {
      const columns = headerAt(rows, rowIndex, depth);
      const scored = headerScore(columns);
      if (scored.valid && (!best || scored.score > best.score)) best = { rowIndex, depth, columns, score: scored.score };
    }
    if (best) {
      candidates.push(best);
      rowIndex += best.depth - 1;
    }
  }
  // Mesmo sem reconhecimento automático, exponha a primeira linha tabular para
  // permitir o mapeamento manual de cabeçalhos não padronizados.
  if (!candidates.length) {
    const fallbackIndex = rows.findIndex((row, index) => (
      row.filter((cell) => !isBlank(cell)).length >= 3
      && rows.slice(index + 1, index + 4).some((next) => (
        next.filter((cell) => !isBlank(cell)).length >= 2
      ))
    ));
    if (fallbackIndex >= 0) {
      const columns = headerAt(rows, fallbackIndex, 1);
      if (columns.length) candidates.push({ rowIndex: fallbackIndex, depth: 1, columns, score: 0 });
    }
  }
  if (!candidates.length) return [];

  return candidates.map((candidate, index) => {
    const nextHeader = candidates[index + 1]?.rowIndex ?? rows.length;
    const records = [];
    for (let rowIndex = candidate.rowIndex + candidate.depth; rowIndex < nextHeader; rowIndex++) {
      const row = rows[rowIndex] || [];
      const raw = {};
      for (const column of candidate.columns) raw[column.key] = cellText(row[column.index]);
      if (!Object.values(raw).some((value) => value !== '' && value != null)) continue;
      records.push({ raw, rowNumber: rowIndex + 1 });
    }
    return {
      id: `${sheetName}:${candidate.rowIndex + 1}`,
      sheet: sheetName,
      headerRow: candidate.rowIndex + 1,
      columns: candidate.columns.map(({ index: _index, ...column }) => column),
      records,
      autoMapping: autoMapPactoColumns(candidate.columns),
    };
  }).filter((table) => table.records.length);
}

export function readPactoImportFile(filePath, originalName = filePath) {
  const extension = path.extname(originalName).toLowerCase();
  if (!['.csv', '.xlsx'].includes(extension)) {
    throw new Error('Formato não suportado. Use um arquivo CSV ou XLSX.');
  }
  const buffer = fs.readFileSync(filePath);
  let workbook;
  try {
    const codepage = csvCodepage(buffer, originalName);
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      raw: false,
      ...(codepage && { codepage }),
    });
  } catch (error) {
    throw new Error(`Não foi possível ler o arquivo: ${error.message}`);
  }
  const tables = workbook.SheetNames.flatMap((sheetName) => (
    extractTablesFromSheet(sheetName, workbook.Sheets[sheetName])
  ));
  if (!tables.length) throw new Error('Nenhuma tabela com cabeçalhos reconhecíveis foi encontrada no arquivo.');
  const totalRows = tables.reduce((sum, table) => sum + table.records.length, 0);
  if (totalRows > MAX_IMPORT_ROWS) throw new Error(`O arquivo possui ${totalRows} linhas; o limite é ${MAX_IMPORT_ROWS}.`);
  return { tables, totalRows, sheetNames: workbook.SheetNames };
}

function isBlank(value) {
  return value === '' || value === null || value === undefined;
}

function sourceValue(record, table, field, mapping) {
  const explicitlyMapped = Object.hasOwn(mapping.columns || {}, field);
  const explicit = mapping.columns?.[field];
  if (explicit === null) return undefined;
  if (explicit && Object.hasOwn(record.raw, explicit)) return record.raw[explicit];
  const global = mapping.autoColumns?.[field];
  if (!explicitlyMapped && global && Object.hasOwn(record.raw, global)) return record.raw[global];
  const local = table.autoMapping.columns[field];
  return local ? record.raw[local] : undefined;
}

function mappedResultValue(record, table, resultKey, mapping, section, autoSection) {
  const explicitlyMapped = Object.hasOwn(mapping[section] || {}, resultKey);
  const explicit = mapping[section]?.[resultKey];
  if (explicit === null) return undefined;
  if (explicit && Object.hasOwn(record.raw, explicit)) return record.raw[explicit];
  const global = mapping[autoSection]?.[resultKey];
  if (!explicitlyMapped && global && Object.hasOwn(record.raw, global)) return record.raw[global];
  const local = table.autoMapping[section]?.[resultKey];
  return local ? record.raw[local] : undefined;
}

function resultSourceValue(record, table, resultKey, mapping) {
  return mappedResultValue(record, table, resultKey, mapping, 'results', 'autoResults');
}

function resultPercentageSourceValue(record, table, resultKey, mapping) {
  return mappedResultValue(
    record,
    table,
    resultKey,
    mapping,
    'resultPercentages',
    'autoResultPercentages',
  );
}

function parseInteger(value) {
  const parsed = toNumber(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10000 ? parsed : null;
}

function parseGrade(value) {
  const text = String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const isolated = text.match(/^0*([12])(?:[.,]0+)?$/);
  if (isolated) return Number(isolated[1]);
  const labeled = text.match(/\b([12])\s*[ºª°o]?\s*(?:ano|serie)\b/)
    || text.match(/\b(?:ano|serie)\s*([12])\b/);
  return labeled ? Number(labeled[1]) : null;
}

function parseAssessment(value) {
  const text = String(value || '').toUpperCase();
  const match = text.match(/\bA\s*0?([0-3])\b/)
    || text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/\bAVALIACAO\s*0?([0-3])\b/);
  return match ? `A${match[1]}` : null;
}

function parseShift(value) {
  const normalized = normalizeKey(value);
  if (!normalized) return '';
  if (normalized === 'm' || normalized.includes('matutin') || normalized.includes('manha')) return 'M';
  if (normalized === 't' || normalized.includes('vespertin') || normalized.includes('tarde')) return 'T';
  return String(value).trim().toUpperCase();
}

function normalizeClassName(value, grade) {
  let normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\b(TURMA|CLASSE)\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
  if (grade) normalized = normalized.replace(new RegExp(`^${grade}(ANO)?`), '');
  return normalized;
}

function componentCode(value) {
  const normalized = normalizeKey(value);
  if (!normalized) return null;
  if (['lp', 'portugues', 'linguaportuguesa'].includes(normalized) || normalized.includes('portugues')) return 'PORTUGUES';
  if (['mat', 'matematica'].includes(normalized) || normalized.includes('matemat')) return 'MATEMATICA';
  if (['inicial', 'habilidadesiniciais'].includes(normalized) || normalized.includes('habilidadesiniciais')) return 'INICIAL';
  return null;
}

function bestOfficial(value, options, labels) {
  if (isBlank(value)) return null;
  const ranked = options.map((option) => ({
    option,
    score: Math.max(...labels(option).map((label) => pactoImportSimilarity(value, label))),
  })).sort((a, b) => b.score - a.score);
  if (!ranked[0] || ranked[0].score < 58) return null;
  if (ranked[1] && ranked[0].score === ranked[1].score) return null;
  return ranked[0].option;
}

function officialPairForField(definition, field) {
  const component = definition?.components.find((item) => item.code === field.component);
  const skill = component?.skills.find((item) => item.code === field.skill);
  const level = skill?.levels.find((item) => item.code === field.level);
  return component && skill && level ? { component, skill, level } : null;
}

function resolveOfficialPair(definition, values) {
  const componentFilter = componentCode(values.component);
  if (!isBlank(values.component) && !componentFilter) return null;
  let components = definition.components;
  if (componentFilter) components = components.filter((component) => component.code === componentFilter);
  const skills = components.flatMap((component) => component.skills.map((skill) => ({ component, skill })));
  const selectedSkill = isBlank(values.skill)
    ? null
    : bestOfficial(values.skill, skills, ({ skill }) => [skill.code, skill.label]);
  if (!isBlank(values.skill) && !selectedSkill && !isBlank(values.level)) return null;
  const skillOptions = selectedSkill ? [selectedSkill] : skills;
  const levels = skillOptions.flatMap(({ component, skill }) => (
    skill.levels.map((level) => ({ component, skill, level }))
  ));
  const levelValue = !isBlank(values.level) ? values.level : values.skill;
  return bestOfficial(levelValue, levels, ({ skill, level }) => [
    level.code,
    level.label,
    `${skill.label} ${level.label}`,
  ]);
}

function issue(code, message, context = {}) {
  return { code, message, ...context };
}

function classKey(grade, className, shift) {
  return `${grade || '?'}|${normalizeClassName(className, grade) || '?'}|${shift || ''}`;
}

function findClass(classes, imported, selectedId) {
  if (selectedId) return classes.find((item) => item.id === selectedId) || null;
  const normalizedName = normalizeClassName(imported.className, imported.grade);
  const matches = classes.filter((item) => (
    Number(item.grade) === imported.grade
    && normalizeClassName(item.name, item.grade) === normalizedName
    && (!imported.shift || item.shift === imported.shift)
  ));
  return matches.length === 1 ? matches[0] : null;
}

function setConsistent(target, key, value, issues, context) {
  if (value == null) return;
  if (target[key] == null) target[key] = value;
  else if (target[key] !== value) {
    issues.push(issue('CONFLICTING_VALUE', `Valores diferentes para ${key}: ${target[key]} e ${value}.`, context));
  }
}

function setResult(component, pair, count, sourcePercentage, issues, context) {
  const key = `${pair.skill.code}:${pair.level.code}`;
  const existing = component.results.get(key);
  if (existing) {
    if (existing.count !== count) {
      issues.push(issue('DUPLICATE_CONFLICT', `Resultado duplicado com valores diferentes para ${pair.skill.label} — ${pair.level.label}.`, context));
    } else {
      issues.push(issue('DUPLICATE_ROW', `Resultado duplicado para ${pair.skill.label} — ${pair.level.label}. Remova a duplicidade antes de importar.`, context));
    }
    return;
  }
  component.results.set(key, {
    skill: pair.skill.code,
    level: pair.level.code,
    count,
    sourcePercentage,
  });
}

function parseSourcePercentage(value) {
  const parsed = toNumber(value);
  if (parsed == null) return null;
  return parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function tableMappings(tables, supplied = {}) {
  const union = new Map();
  for (const table of tables) {
    for (const column of table.columns) {
      if (!union.has(column.key)) union.set(column.key, { ...column, samples: [] });
      const output = union.get(column.key);
      for (const record of table.records.slice(0, 8)) {
        const value = record.raw[column.key];
        if (!isBlank(value) && !output.samples.includes(String(value))) output.samples.push(String(value));
      }
    }
  }
  const columns = [...union.values()];
  const auto = autoMapPactoColumns(columns);
  const automaticMode = (auto.columns.level && auto.columns.count)
    ? 'long'
    : Object.keys(auto.results).length ? 'wide' : 'long';
  const mode = ['long', 'wide'].includes(supplied.mode) ? supplied.mode : automaticMode;
  return {
    availableColumns: columns,
    mode,
    columns: { ...auto.columns, ...(supplied.columns || {}) },
    results: { ...auto.results, ...(supplied.results || {}) },
    resultPercentages: {
      ...auto.resultPercentages,
      ...(supplied.resultPercentages || {}),
    },
    classes: { ...(supplied.classes || {}) },
    autoColumns: auto.columns,
    autoResults: auto.results,
    autoResultPercentages: auto.resultPercentages,
  };
}

function createGroup(imported, pactoClass) {
  return {
    id: `${classKey(imported.grade, imported.className, imported.shift)}|${imported.assessment}`,
    classSourceKey: classKey(imported.grade, imported.className, imported.shift),
    grade: imported.grade,
    className: String(imported.className || '').trim(),
    shift: imported.shift,
    assessment: imported.assessment,
    pactoClass,
    sourceRows: [],
    components: new Map(),
    globalParticipation: { enrolled: null, evaluated: null },
    errors: [],
    warnings: [],
  };
}

function ensureComponent(group, code) {
  if (!group.components.has(code)) {
    group.components.set(code, { component: code, enrolled: null, evaluated: null, results: new Map() });
  }
  return group.components.get(code);
}

function serializeGroup(group) {
  const definition = getAssessmentDefinition(group.grade, group.assessment);
  const existing = (group.pactoClass?.assessments || []).find((item) => item.code === group.assessment);
  const components = (definition?.components || [])
    .filter((componentDefinition) => group.components.has(componentDefinition.code))
    .map((componentDefinition) => {
    const imported = group.components.get(componentDefinition.code);
    return {
      component: componentDefinition.code,
      label: componentDefinition.label,
      enrolled: imported?.enrolled ?? null,
      evaluated: imported?.evaluated ?? null,
      skills: componentDefinition.skills.map((skill) => ({
        skill: skill.code,
        label: skill.label,
        levels: skill.levels.map((level) => {
          const value = imported?.results.get(`${skill.code}:${level.code}`);
          const percentage = value && imported?.evaluated > 0
            ? Math.round((value.count / imported.evaluated) * 100)
            : null;
          return {
            level: level.code,
            label: level.label,
            count: value?.count ?? null,
            percentage,
            sourcePercentage: value?.sourcePercentage ?? null,
          };
        }),
      })),
    };
  });
  return {
    id: group.id,
    classSourceKey: group.classSourceKey,
    grade: group.grade,
    className: group.className,
    shift: group.shift,
    assessment: group.assessment,
    classId: group.pactoClass?.id || null,
    classLabel: group.pactoClass
      ? `${group.pactoClass.grade}º ano · ${group.pactoClass.shift} · Turma ${group.pactoClass.name}`
      : null,
    existingId: existing?.id || null,
    existingStatus: existing?.status || null,
    existingUpdatedAt: existing?.updatedAt || null,
    replacesDraft: Boolean(existing && existing.status !== 'ENVIADO'),
    sourceRows: group.sourceRows.slice(0, 100),
    sourceRowCount: group.sourceRows.length,
    components,
    errors: group.errors,
    warnings: group.warnings,
    valid: group.errors.length === 0,
  };
}

function validateGroup(group, classes) {
  const context = { groupId: group.id };
  const definition = getAssessmentDefinition(group.grade, group.assessment);
  if (!definition) {
    group.errors.push(issue('INVALID_DEFINITION', 'Ano ou avaliação não pertence ao instrumento oficial.', context));
    return;
  }
  if (!group.pactoClass) {
    group.errors.push(issue('CLASS_NOT_MAPPED', 'Turma não localizada. Selecione manualmente uma turma desta escola.', context));
    return;
  }
  if (Number(group.pactoClass.grade) !== group.grade) {
    group.errors.push(issue('CLASS_GRADE_MISMATCH', `A turma selecionada é do ${group.pactoClass.grade}º ano, mas o arquivo indica ${group.grade}º ano.`, context));
  }
  if (group.shift && group.pactoClass.shift !== group.shift) {
    group.errors.push(issue('CLASS_SHIFT_MISMATCH', `A turma selecionada é do turno ${group.pactoClass.shift}, mas o arquivo indica ${group.shift}.`, context));
  }
  if (!(group.pactoClass.enabledAssessments || []).includes(group.assessment)) {
    group.errors.push(issue('ASSESSMENT_NOT_ENABLED', `${group.assessment} não está habilitada para a turma selecionada.`, context));
  }
  const existing = (group.pactoClass.assessments || []).find((item) => item.code === group.assessment);
  if (existing?.status === 'ENVIADO') {
    group.errors.push(issue('ASSESSMENT_LOCKED', `${group.assessment} já foi enviada e precisa ser reaberta pelo administrador.`, context));
  } else if (existing) {
    group.warnings.push(issue(
      'DRAFT_WILL_BE_UPDATED',
      `Os componentes importados atualizarão o rascunho existente de ${group.assessment}; componentes ausentes serão preservados.`,
      context,
    ));
  }

  if (!group.components.size) {
    group.errors.push(issue('MISSING_RESULTS', 'Nenhum resultado oficial foi encontrado para este grupo.', context));
    return;
  }

  for (const componentDefinition of definition.components) {
    const component = group.components.get(componentDefinition.code);
    if (!component) {
      group.warnings.push(issue(
        'COMPONENT_NOT_IN_FILE',
        `${componentDefinition.label} não está neste arquivo e permanecerá pendente no rascunho.`,
        context,
      ));
      continue;
    }
    if (component.enrolled == null) group.errors.push(issue('MISSING_ENROLLED', `Matriculados não informado em ${componentDefinition.label}.`, context));
    if (component.evaluated == null) group.errors.push(issue('MISSING_EVALUATED', `Avaliados não informado em ${componentDefinition.label}.`, context));
    if (component.enrolled != null && component.evaluated > component.enrolled) {
      group.warnings.push(issue('EVALUATED_ABOVE_ENROLLED', `Avaliados acima dos matriculados em ${componentDefinition.label}.`, context));
    }
    for (const skill of componentDefinition.skills) {
      const values = skill.levels.map((level) => component.results.get(`${skill.code}:${level.code}`));
      if (values.some((value) => !value)) {
        const missing = skill.levels.filter((level, index) => !values[index]).map((level) => level.label).join(', ');
        group.errors.push(issue('MISSING_LEVELS', `${skill.label}: faltam ${missing}.`, context));
        continue;
      }
      const sum = values.reduce((total, value) => total + value.count, 0);
      if (component.evaluated != null && sum !== component.evaluated) {
        group.errors.push(issue('LEVEL_SUM_MISMATCH', `${skill.label}: a soma ${sum} difere de ${component.evaluated} avaliados.`, context));
      }
      for (const value of values) {
        if (value.sourcePercentage != null && component.evaluated > 0) {
          const computed = Math.round((value.count / component.evaluated) * 100);
          if (Math.round(value.sourcePercentage) !== computed) {
            group.warnings.push(issue(
              'SOURCE_PERCENTAGE_IGNORED',
              `Percentual do arquivo (${value.sourcePercentage}%) difere do cálculo (${computed}%); a quantidade será usada.`,
              context,
            ));
          }
        }
      }
    }
  }

  if (!classes.some((item) => item.id === group.pactoClass.id)) {
    group.errors.push(issue('INVALID_CLASS', 'A turma mapeada não pertence à escola deste link.', context));
  }
}

export function analyzePactoImport(parsed, classes, suppliedMapping = {}) {
  const mapping = tableMappings(parsed.tables, suppliedMapping);
  const groups = new Map();
  const globalErrors = [];
  const classSources = new Map();
  let missingIdentityRows = 0;
  const availableKeys = new Set(mapping.availableColumns.map((column) => column.key));
  for (const [field, source] of Object.entries(mapping.columns)) {
    if (source && !availableKeys.has(source)) {
      globalErrors.push(issue('INVALID_COLUMN_MAPPING', `A coluna selecionada para ${field} não existe no arquivo.`));
    }
  }
  for (const section of ['results', 'resultPercentages']) {
    for (const [field, source] of Object.entries(mapping[section])) {
      if (source && !availableKeys.has(source)) {
        globalErrors.push(issue(
          section === 'results' ? 'INVALID_RESULT_MAPPING' : 'INVALID_PERCENTAGE_MAPPING',
          `A coluna selecionada para ${field} não existe no arquivo.`,
        ));
      }
    }
  }
  for (const field of ['grade', 'className', 'assessment', 'enrolled', 'evaluated']) {
    if (!mapping.columns[field]) {
      const label = PACTO_IMPORT_FIELDS.find((item) => item.key === field)?.label || field;
      globalErrors.push(issue('MISSING_COLUMN_MAPPING', `Mapeie a coluna “${label}”.`));
    }
  }
  if (mapping.mode === 'long') {
    if (!mapping.columns.count) globalErrors.push(issue('MISSING_COLUMN_MAPPING', 'Mapeie a coluna “Quantidade”.'));
    if (!mapping.columns.level && !mapping.columns.skill) {
      globalErrors.push(issue('MISSING_COLUMN_MAPPING', 'Mapeie “Nível de proficiência” e/ou “Indicador/Habilidade”.'));
    }
  } else if (!Object.keys(mapping.results).length) {
    globalErrors.push(issue('MISSING_RESULT_MAPPING', 'Mapeie pelo menos uma coluna de quantidade por nível.'));
  }

  for (const table of parsed.tables) {
    const carry = {};
    for (const record of table.records) {
      const context = { sheet: table.sheet, row: record.rowNumber };
      const rawValues = {};
      for (const field of PACTO_IMPORT_FIELDS) {
        const value = sourceValue(record, table, field.key, mapping);
        if (!isBlank(value) && FORWARD_FILL_FIELDS.has(field.key)) carry[field.key] = value;
        rawValues[field.key] = isBlank(value) && FORWARD_FILL_FIELDS.has(field.key) ? carry[field.key] : value;
      }
      const grade = parseGrade(rawValues.grade);
      const assessment = parseAssessment(rawValues.assessment);
      const shift = parseShift(rawValues.shift);
      const imported = { grade, className: rawValues.className, assessment, shift };
      const rowDefinition = getAssessmentDefinition(grade, assessment);
      const applicableResultFields = PACTO_IMPORT_RESULT_FIELDS.filter((field) => (
        officialPairForField(rowDefinition, field)
      ));
      const hasResultData = mapping.mode === 'long'
        ? !isBlank(rawValues.count) || !isBlank(rawValues.level) || !isBlank(rawValues.skill)
        : applicableResultFields.some((field) => !isBlank(resultSourceValue(record, table, field.key, mapping)));
      const hasParticipation = !isBlank(rawValues.enrolled) || !isBlank(rawValues.evaluated);
      if (!hasResultData && !hasParticipation) continue;
      if (!grade || isBlank(imported.className) || !assessment) {
        missingIdentityRows += 1;
        if (missingIdentityRows <= 100) {
          globalErrors.push(issue(
            'MISSING_IDENTITY',
            'Não foi possível identificar Ano + Turma + Avaliação nesta linha. Revise o mapeamento.',
            context,
          ));
        }
        continue;
      }
      if (!IMPORT_ASSESSMENTS.has(assessment)) {
        globalErrors.push(issue('UNSUPPORTED_ASSESSMENT', `${assessment} não é aceita nesta importação; use A0, A1, A2 ou A3.`, context));
        continue;
      }

      const sourceKey = classKey(grade, imported.className, shift);
      const mappedClass = findClass(classes, imported, mapping.classes[sourceKey]);
      const groupId = `${sourceKey}|${assessment}`;
      if (!groups.has(groupId)) {
        if (groups.size >= MAX_IMPORT_GROUPS) {
          if (!globalErrors.some((item) => item.code === 'TOO_MANY_GROUPS')) {
            globalErrors.push(issue('TOO_MANY_GROUPS', `O arquivo excede o limite de ${MAX_IMPORT_GROUPS} grupos de Ano + Turma + Avaliação.`));
          }
          continue;
        }
        groups.set(groupId, createGroup(imported, mappedClass));
      }
      if (!classSources.has(sourceKey)) {
        classSources.set(sourceKey, {
          key: sourceKey,
          grade,
          className: String(imported.className).trim(),
          shift,
          classId: mappedClass?.id || null,
        });
        if (mappedClass && !mapping.classes[sourceKey]) mapping.classes[sourceKey] = mappedClass.id;
      }
      const group = groups.get(groupId);
      group.sourceRows.push(`${table.sheet}:${record.rowNumber}`);
      if (!group.pactoClass && mappedClass) group.pactoClass = mappedClass;

      const enrolled = isBlank(rawValues.enrolled) ? null : parseInteger(rawValues.enrolled);
      const evaluated = isBlank(rawValues.evaluated) ? null : parseInteger(rawValues.evaluated);
      if (!isBlank(rawValues.enrolled) && enrolled == null) group.errors.push(issue('INVALID_ENROLLED', 'Número de matriculados inválido.', { ...context, groupId }));
      if (!isBlank(rawValues.evaluated) && evaluated == null) group.errors.push(issue('INVALID_EVALUATED', 'Número de avaliados inválido.', { ...context, groupId }));

      if (mapping.mode === 'long') {
        const definition = getAssessmentDefinition(grade, assessment);
        const pair = resolveOfficialPair(definition, rawValues);
        const hasCount = !isBlank(rawValues.count);
        const count = hasCount ? parseInteger(rawValues.count) : null;
        if (hasCount && count == null) group.errors.push(issue('INVALID_COUNT', 'Quantidade de nível inválida.', { ...context, groupId }));
        if (hasResultData && !pair) {
          group.errors.push(issue('UNMAPPED_RESULT', 'Indicador ou nível não corresponde ao instrumento oficial.', { ...context, groupId }));
          continue;
        }
        const inferredComponent = pair?.component.code || componentCode(rawValues.component);
        if (inferredComponent) {
          const component = ensureComponent(group, inferredComponent);
          setConsistent(component, 'enrolled', enrolled, group.errors, { ...context, groupId });
          setConsistent(component, 'evaluated', evaluated, group.errors, { ...context, groupId });
          if (pair && count != null) {
            const importedPercentage = parseSourcePercentage(rawValues.percentage);
            const validPercentage = importedPercentage != null
              && importedPercentage >= 0
              && importedPercentage <= 100;
            if (!isBlank(rawValues.percentage) && !validPercentage) {
              group.warnings.push(issue(
                'INVALID_PERCENTAGE_IGNORED',
                `Percentual inválido (${rawValues.percentage}) ignorado; a quantidade será usada.`,
                { ...context, groupId },
              ));
            }
            setResult(
              component,
              pair,
              count,
              validPercentage ? importedPercentage : null,
              group.errors,
              { ...context, groupId },
            );
          }
        } else {
          setConsistent(group.globalParticipation, 'enrolled', enrolled, group.errors, { ...context, groupId });
          setConsistent(group.globalParticipation, 'evaluated', evaluated, group.errors, { ...context, groupId });
        }
      } else {
        const touched = new Set();
        for (const field of applicableResultFields) {
          const source = resultSourceValue(record, table, field.key, mapping);
          if (isBlank(source)) continue;
          const count = parseInteger(source);
          if (count == null) {
            group.errors.push(issue('INVALID_COUNT', `Quantidade inválida em ${field.skillLabel} — ${field.levelLabel}.`, { ...context, groupId }));
            continue;
          }
          const pair = officialPairForField(rowDefinition, field);
          const component = ensureComponent(group, field.component);
          const rawPercentage = resultPercentageSourceValue(record, table, field.key, mapping);
          const importedPercentage = parseSourcePercentage(rawPercentage);
          const validPercentage = importedPercentage != null
            && importedPercentage >= 0
            && importedPercentage <= 100;
          if (!isBlank(rawPercentage) && !validPercentage) {
            group.warnings.push(issue(
              'INVALID_PERCENTAGE_IGNORED',
              `Percentual inválido (${rawPercentage}) ignorado; a quantidade será usada.`,
              { ...context, groupId },
            ));
          }
          setResult(
            component,
            pair,
            count,
            validPercentage ? importedPercentage : null,
            group.errors,
            { ...context, groupId },
          );
          touched.add(field.component);
        }
        const componentHint = componentCode(rawValues.component);
        const targets = componentHint ? [componentHint] : [...touched];
        if (!targets.length) {
          setConsistent(group.globalParticipation, 'enrolled', enrolled, group.errors, { ...context, groupId });
          setConsistent(group.globalParticipation, 'evaluated', evaluated, group.errors, { ...context, groupId });
        } else {
          for (const code of targets) {
            const component = ensureComponent(group, code);
            setConsistent(component, 'enrolled', enrolled, group.errors, { ...context, groupId });
            setConsistent(component, 'evaluated', evaluated, group.errors, { ...context, groupId });
          }
        }
      }
    }
  }

  if (missingIdentityRows > 100) {
    globalErrors.push(issue(
      'MISSING_IDENTITY_SUMMARY',
      `Outras ${missingIdentityRows - 100} linhas também não tiveram Ano + Turma + Avaliação identificados.`,
    ));
  }

  for (const group of groups.values()) {
    for (const component of group.components.values()) {
      if (component.enrolled == null) component.enrolled = group.globalParticipation.enrolled;
      if (component.evaluated == null) component.evaluated = group.globalParticipation.evaluated;
    }
    validateGroup(group, classes);
  }

  const serializedGroups = [...groups.values()].map(serializeGroup).sort((a, b) => (
    a.grade - b.grade
    || a.className.localeCompare(b.className, 'pt-BR')
    || a.assessment.localeCompare(b.assessment)
  ));
  const groupErrors = serializedGroups.flatMap((group) => group.errors);
  const warnings = serializedGroups.flatMap((group) => group.warnings);
  const errors = [...globalErrors, ...groupErrors];
  const classMatches = [...classSources.values()].map((source) => ({
    ...source,
    options: classes
      .filter((item) => Number(item.grade) === source.grade)
      .map((item) => ({
        id: item.id,
        label: `${item.grade}º ano · ${item.shift} · Turma ${item.name}`,
      })),
  }));

  return {
    file: {
      sheets: parsed.sheetNames,
      tables: parsed.tables.length,
      rows: parsed.totalRows,
    },
    availableColumns: mapping.availableColumns,
    mapping: {
      mode: mapping.mode,
      columns: mapping.columns,
      results: mapping.results,
      resultPercentages: mapping.resultPercentages,
      classes: mapping.classes,
    },
    mappingFields: PACTO_IMPORT_FIELDS,
    resultFields: PACTO_IMPORT_RESULT_FIELDS,
    classMatches,
    groups: serializedGroups,
    errors,
    warnings,
    summary: {
      groups: serializedGroups.length,
      validGroups: serializedGroups.filter((group) => group.valid).length,
      errors: errors.length,
      warnings: warnings.length,
    },
    canConfirm: serializedGroups.length > 0 && errors.length === 0,
  };
}

export function previewGroupToPayload(group) {
  return {
    classId: group.classId,
    code: group.assessment,
    components: group.components.map((component) => ({
      component: component.component,
      enrolled: component.enrolled,
      evaluated: component.evaluated,
      results: component.skills.flatMap((skill) => skill.levels.map((level) => ({
        skill: skill.skill,
        level: level.level,
        count: level.count,
      }))),
    })),
  };
}
