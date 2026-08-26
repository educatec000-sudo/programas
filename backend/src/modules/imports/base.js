import { IMPORT_ROW_STATUS } from '../../lib/constants.js';

/**
 * Estratégia base de importação. Cada entidade implementa:
 *  - aliases: mapeamento campo -> colunas aceitas (normalizadas)
 *  - buildRow(raw, ctx)        -> { data, errors[] }
 *  - classify(data, ctx, seen) -> NOVO | ATUALIZAR | DUPLICADO
 *  - apply(rows, ctx, tx)      -> { created, updated }
 */

export class ImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImportError';
  }
}

export function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export function classifyRow(row, existing, seenKey) {
  if (seenKey.has(row.key)) return IMPORT_ROW_STATUS.DUPLICADO;
  return existing ? IMPORT_ROW_STATUS.ATUALIZAR : IMPORT_ROW_STATUS.NOVO;
}
