import XLSX from 'xlsx';
import fs from 'node:fs';

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
  try {
    book = XLSX.read(buffer, { type: 'buffer', codepage: 65001, raw: false });
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
