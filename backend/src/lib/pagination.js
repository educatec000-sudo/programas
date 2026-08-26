export function parsePagination(query = {}, { maxPageSize = 100, defaultPageSize = 20 } = {}) {
  let page = parseInt(query.page, 10);
  let pageSize = parseInt(query.pageSize, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = defaultPageSize;
  if (pageSize > maxPageSize) pageSize = maxPageSize;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function buildPagination(total, page, pageSize) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Normaliza string de busca (remove acentos, minúsculas) p/ filtros insensitive. */
export function normalizeSearch(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}
