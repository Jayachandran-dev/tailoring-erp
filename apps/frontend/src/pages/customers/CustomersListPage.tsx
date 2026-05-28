import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { customersApi, type Customer, type CustomerListResult } from '../../api/domain';
import { ApiError, assetUrl } from '../../api/client';
import { DataTable, type Column, type RowAction } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export function CustomersListPage() {
  const { session } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [data, setData] = useState<CustomerListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Customer | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const res = await customersApi.list(
        { token: session.token, tenantId: session.tenant.id },
        { q: debounced || undefined, page, pageSize },
      );
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [session, debounced, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmDelete() {
    if (!session || !toDelete) return;
    try {
      await customersApi.remove({ token: session.token, tenantId: session.tenant.id }, toDelete.id);
      setToDelete(null);
      void load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete');
    }
  }

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      render: (c) => (
        <div className="cell-customer">
          <div className="avatar sm">
            {c.imageUrl ? (
              <img src={assetUrl(c.imageUrl)} alt={c.name} />
            ) : (
              <span>{c.name.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div>
            <strong>{c.name}</strong>
            <div className="muted small">{c.gender ?? '—'}</div>
          </div>
        </div>
      ),
    },
    { key: 'mobile', header: 'Mobile', render: (c) => c.mobile ?? '—' },
    {
      key: 'email',
      header: 'Email',
      hideOnMobile: true,
      render: (c) => c.email ?? '—',
    },
    {
      key: 'createdAt',
      header: 'Added',
      hideOnMobile: true,
      render: (c) => new Date(c.createdAt).toLocaleDateString(),
    },
  ];

  const actions: RowAction<Customer>[] = [
    { label: 'View', onClick: (c) => nav(`/customers/${c.id}`), variant: 'default' },
    { label: 'Edit', onClick: (c) => nav(`/customers/${c.id}/edit`), variant: 'primary' },
    { label: 'Delete', onClick: (c) => setToDelete(c), variant: 'danger' },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={data ? `${data.total} total` : undefined}
        actions={
          <Link to="/customers/new" className="btn-link primary">
            + New customer
          </Link>
        }
      />

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(c) => c.id}
        loading={loading}
        error={error}
        emptyText={debounced ? 'No matches.' : 'No customers yet.'}
        actions={actions}
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder="Search by name, mobile, email…"
        page={page}
        pageSize={pageSize}
        total={data?.total}
        onPageChange={setPage}
        onRowClick={(c) => nav(`/customers/${c.id}`)}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Delete customer?"
        message={
          toDelete && (
            <>
              <strong>{toDelete.name}</strong> and all their measurements will be removed. This
              cannot be undone.
            </>
          )
        }
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
