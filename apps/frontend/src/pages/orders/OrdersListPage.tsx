// Orders list page. Status chip filter + due-date filter + free-text search.

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ordersApi, type OrderListItem, type OrderListResult, type OrderStatus } from '../../api/domain';
import { ApiError } from '../../api/client';
import { DataTable, type Column } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { rupees, shortDate, daysUntil } from '../../utils/format';

type DueFilter = 'overdue' | 'today' | 'week' | null;

const STATUS_CHIPS: { value: OrderStatus | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'READY', label: 'Ready' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const DUE_CHIPS: { value: DueFilter; label: string }[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'Due this week' },
];

export function OrdersListPage() {
  const { session } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [due, setDue] = useState<DueFilter>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [data, setData] = useState<OrderListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => setPage(1), [debounced, status, due]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ordersApi.list(
        { token: session.token, tenantId: session.tenant.id },
        {
          q: debounced || undefined,
          status: status ?? undefined,
          due: due ?? undefined,
          page,
          pageSize,
        },
      );
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [session, debounced, status, due, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<OrderListItem>[] = [
    {
      key: 'orderNumber',
      header: 'Order',
      render: (o) => (
        <div>
          <strong>{o.orderNumber ?? o.id.slice(0, 8)}</strong>
          <div className="muted small">{shortDate(o.createdAt)}</div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (o) => (
        <div>
          <strong>{o.customer?.name ?? '—'}</strong>
          {o.customer?.mobile && <div className="muted small">{o.customer.mobile}</div>}
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      hideOnMobile: true,
      render: (o) => `${o._count?.items ?? 0}`,
    },
    {
      key: 'total',
      header: 'Total',
      render: (o) => (
        <div>
          <strong>{rupees(o.totalCents)}</strong>
          {o.paidCents < o.totalCents && (
            <div className="muted small">Bal {rupees(o.totalCents - o.paidCents)}</div>
          )}
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      hideOnMobile: true,
      render: (o) => {
        if (!o.dueDate) return <span className="muted">—</span>;
        const d = daysUntil(o.dueDate);
        const cls =
          o.status === 'DELIVERED' || o.status === 'CANCELLED'
            ? ''
            : d !== null && d < 0
            ? 'due-overdue'
            : d !== null && d <= 1
            ? 'due-soon'
            : '';
        return (
          <div className={cls}>
            {shortDate(o.dueDate)}
            {d !== null && o.status !== 'DELIVERED' && o.status !== 'CANCELLED' && (
              <div className="small">
                {d < 0 ? `${-d}d late` : d === 0 ? 'Today' : `in ${d}d`}
              </div>
            )}
          </div>
        );
      },
    },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={data ? `${data.total} total` : undefined}
        actions={
          <Link to="/orders/new" className="btn-link primary">
            + New order
          </Link>
        }
      />

      <div className="chips-row">
        {STATUS_CHIPS.map((c) => (
          <button
            key={String(c.value)}
            type="button"
            className={`chip ${status === c.value ? 'active' : ''}`}
            onClick={() => setStatus(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="chips-row">
        {DUE_CHIPS.map((c) => (
          <button
            key={c.value!}
            type="button"
            className={`chip chip-warn ${due === c.value ? 'active' : ''}`}
            onClick={() => setDue(due === c.value ? null : c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(o) => o.id}
        loading={loading}
        error={error}
        emptyText={debounced || status || due ? 'No orders match these filters.' : 'No orders yet.'}
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder="Search order #, customer, item…"
        page={page}
        pageSize={pageSize}
        total={data?.total}
        onPageChange={setPage}
        onRowClick={(o) => nav(`/orders/${o.id}`)}
      />
    </>
  );
}
