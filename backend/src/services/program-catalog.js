const STATUS_PRIORITY = {
  EM_EXECUCAO: 0,
  PLANEJAMENTO: 1,
  SUSPENSO: 2,
  CONCLUIDO: 3,
  CANCELADO: 4,
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Identidade permanente derivada de um código antigo de execução. */
export function permanentProgramCode(code, year) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized || !Number.isInteger(Number(year))) return normalized;
  const parts = normalized.split(/[-_]/).filter((part) => part && part !== String(Number(year)));
  return parts.join('-') || normalized;
}

/** Remove apenas o ano final, sem alterar números que façam parte do nome. */
export function permanentProgramName(name, year) {
  const normalized = String(name || '').trim();
  if (!normalized || !Number.isInteger(Number(year))) return normalized;
  return normalized.replace(new RegExp(`\\s+${escapeRegex(year)}$`), '').trim() || normalized;
}

export function programCycleCode(catalogCode, year) {
  const base = permanentProgramCode(catalogCode, year);
  return `${base}-${Number(year)}`;
}

/**
 * Ciclo que representa o card do catálogo: em execução primeiro, depois
 * planejamento e demais estados; dentro do mesmo estado, o ano mais recente.
 */
export function selectCurrentProgramCycle(cycles = [], status) {
  const candidates = cycles.filter((cycle) => !cycle.deletedAt && (!status || cycle.status === status));
  return [...candidates].sort((a, b) => (
    (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99)
    || Number(b.year) - Number(a.year)
    || String(a.id).localeCompare(String(b.id))
  ))[0] || null;
}

export function summarizeProgramDeletionCounts(counts = {}) {
  const normalized = Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [key, Math.max(0, Number(value) || 0)]),
  );
  const relatedRecords = Object.values(normalized).reduce((sum, value) => sum + value, 0);
  return { counts: normalized, relatedRecords, canDelete: relatedRecords === 0 };
}
