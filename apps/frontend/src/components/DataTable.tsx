// Generic, reusable data-table for list pages.
// - column-driven rendering with custom cell renderers
// - search box (optional, controlled)
// - row actions (view / edit / delete or any custom)
// - loading and empty states
// - pagination (controlled)
//
// Designed for mobile-first: collapses to a card list under a CSS breakpoint.

import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  width?: string;
  hideOnMobile?: boolean;
}

export interface RowAction<T> {
  label: string;
  onClick: (row: T) => void;
  variant?: 'default' | 'danger' | 'primary';
  show?: (row: T) => boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
  actions?: RowAction<T>[];
  // Search
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  // Pagination
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (p: number) => void;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>(props: DataTableProps<T>) {
  const {
    columns,
    rows,
    rowKey,
    loading,
    error,
    emptyText = 'No records found.',
    actions = [],
    searchValue,
    onSearchChange,
    searchPlaceholder = 'Search…',
    page = 1,
    pageSize = 20,
    total,
    onPageChange,
    onRowClick,
  } = props;

  const totalPages = total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : undefined;

  return (
    <div className="datatable">
      {onSearchChange && (
        <div className="datatable-toolbar">
          <input
            className="search-input"
            type="search"
            placeholder={searchPlaceholder}
            value={searchValue ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="datatable-scroll">
        <table className="datatable-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  className={c.hideOnMobile ? 'hide-mobile' : undefined}
                >
                  {c.header}
                </th>
              ))}
              {actions.length > 0 && <th style={{ width: '1%' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={columns.length + (actions.length ? 1 : 0)} className="muted center">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (actions.length ? 1 : 0)} className="muted center">
                  {emptyText}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={onRowClick ? 'clickable' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={c.hideOnMobile ? 'hide-mobile' : undefined}>
                      {c.render ? c.render(row) : (row as Record<string, unknown>)[c.key] as ReactNode}
                    </td>
                  ))}
                  {actions.length > 0 && (
                    <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                      {actions
                        .filter((a) => (a.show ? a.show(row) : true))
                        .map((a) => (
                          <button
                            key={a.label}
                            type="button"
                            className={`btn-sm ${a.variant ?? 'default'}`}
                            onClick={() => a.onClick(row)}
                          >
                            {a.label}
                          </button>
                        ))}
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {totalPages !== undefined && totalPages > 1 && onPageChange && (
        <div className="datatable-pager">
          <button
            type="button"
            className="btn-sm default"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Prev
          </button>
          <span className="muted">
            Page {page} of {totalPages} · {total} total
          </span>
          <button
            type="button"
            className="btn-sm default"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
