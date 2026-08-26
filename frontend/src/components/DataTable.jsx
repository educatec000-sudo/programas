import React from 'react';
import { LoadingBlock, EmptyState, Button } from './ui.jsx';

/**
 * Tabela de dados com ordenação e paginação controladas pela página.
 * columns: [{ key, label, render(row), align, sortable, width }]
 */
export default function DataTable({
  columns,
  rows,
  loading,
  error,
  rowKey = (r) => r.id,
  onRowClick,
  pagination,
  onPageChange,
  sort,
  dir,
  onSort,
  emptyTitle = 'Nenhum registro encontrado',
  emptyHint,
  emptyIcon,
  footer,
}) {
  const handleSort = (col) => {
    if (!col.sortable || !onSort) return;
    if (sort === col.key) onSort(col.key, dir === 'asc' ? 'desc' : 'asc');
    else onSort(col.key, 'asc');
  };

  return (
    <div className="table-wrap">
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <EmptyState icon="⚠️" title="Erro ao carregar dados" hint={error.message} />
      ) : !rows?.length ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} hint={emptyHint} />
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`${col.sortable ? 'sortable' : ''} ${col.align === 'right' ? 'num' : col.align === 'center' ? 'center' : ''}`}
                    style={col.width ? { width: col.width } : undefined}
                    onClick={() => handleSort(col)}
                  >
                    {col.label}
                    {sort === col.key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={onRowClick ? 'clickable' : ''}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={col.align === 'right' ? 'num' : col.align === 'center' ? 'center' : ''}
                    >
                      {col.render ? col.render(row) : row[col.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {(pagination || footer) && (
            <div className="table-footer">
              {pagination ? (
                <>
                  <span>
                    {pagination.total} registro(s) · página {pagination.page} de {pagination.totalPages}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button size="sm" variant="secondary" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>
                      ← Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => onPageChange(pagination.page + 1)}
                    >
                      Próxima →
                    </Button>
                  </div>
                </>
              ) : (
                footer
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
