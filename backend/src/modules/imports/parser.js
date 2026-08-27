import XLSX from 'xlsx';
import * as cptable from 'xlsx/dist/cpexcel.full.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';

// Necessário no build ESM do SheetJS para CSV/XLS legados com acentos.
XLSX.set_cptable(cptable);

function csvCodepage(buffer, filePath) {
  if (path.extname(filePath).toLowerCase() !== '.csv') return undefined;
  try {
    // Arquivos UTF-8 continuam em 65001. O CSV oficial anexado foi exportado
    // pelo Excel em Windows-1252, portanto uma decodificação UTF-8 estrita falha.
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return 65001;
  } catch {
    return 1252;
  }
}

/** Normaliza chave de coluna: minúscula, sem acentos, só letras e números. */
export function normalizeKey(key) {
  return String(key || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Converte valor bruto (número, string com vírgula, etc.) em float ou null. */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value)
    .replace(/\s/g, '')
    .replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m))
    .replace(',', '.');
  const stripped = cleaned.replace(/[^0-9.-]/g, '');
  // texto sem dígitos ("não informada") não pode virar 0
  if (stripped === '' || stripped === '-' || stripped === '.') return null;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lê CSV ou XLSX e devolve linhas com chaves normalizadas + rowNumber.
 * raw: false — as células chegam como TEXTO formatado, preservando a forma
 * original ("−1,6215" com vírgula decimal, INEP com zeros à esquerda etc.).
 * A conversão numérica é feita depois pelo toNumber(), que entende os dois
 * formatos (pt-BR e en-US) — evita o SheetJS interpretar vírgula como milhar.
 */
export function parseSpreadsheet(filePath) {
  const buffer = fs.readFileSync(filePath);
  let book;
  const codepage = csvCodepage(buffer, filePath);
  try {
    book = XLSX.read(buffer, {
      type: 'buffer',
      ...(codepage && { codepage }),
      raw: false,
    });
  } catch (err) {
    throw new Error(`Não foi possível ler o arquivo: ${err.message}`);
  }
  const sheetName = book.SheetNames[0];
  if (!sheetName) throw new Error('A planilha não possui abas com dados');
  const sheet = book.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  return raw.map((row, index) => {
    const normalized = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[normalizeKey(k)] = typeof v === 'string' ? v.trim() : v;
    }
    return { rowNumber: index + 2, raw: normalized }; // linha 1 = cabeçalho
  });
}

/** Busca o primeiro campo existente dentre os aliases possíveis. */
export function pickField(rowRaw, aliases) {
  for (const alias of aliases) {
    const key = normalizeKey(alias);
    if (rowRaw[key] !== undefined && rowRaw[key] !== '') return rowRaw[key];
  }
  return undefined;
}
