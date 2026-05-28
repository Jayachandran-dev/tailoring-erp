import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { dashboardApi, type DashboardSummary } from '../api/domain';
import { ApiError, assetUrl } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { BarChart, ChartLegend, DonutChart, type DonutSlice } from '../components/charts/Charts';
import { compactRupees, rupees, shortDate } from '../utils/format';

const PIPELINE_COLORS: Record<string, string> = {
  Pending: '#f59e0b',
  'In progress': '#3b82f6',
  Ready: '#10b981',
  Delivered: '#64748b',
  Cancelled: '#ef4444',
};

const METHOD_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7'];
const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  BANK: 'Bank',
  OTHER: 'Other',
};

export function DashboardPage() {
  const { session } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    dashboardApi
      .summary({ token: session.token, tenantId: session.tenant.id })
      .then(setSummary)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load dashboard'),
      )
      .finally(() => setLoading(false));
  }, [session]);

  if (!session) return null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome, ${session.user.displayName ?? session.user.mobile}`}
        actions={
          <>
            <Link to="/orders/new" className="btn-link primary">
              + New order
            </Link>
            <Link to="/customers/new" className="btn-link ghost">
              + Customer
            </Link>
          </>
        }
      />

      {error && <div className="error">{error}</div>}

      {/* Money KPIs */}
      <div className="kpi-grid">
        <KpiCard
          title="Revenue today"
          value={rupees(summary?.money.revenueTodayCents)}
          loading={loading}
          accent="green"
        />
        <KpiCard
          title="Total revenue"
          value={rupees(summary?.money.revenueCents)}
          loading={loading}
        />
        <KpiCard
          title="Outstanding"
          value={rupees(summary?.money.outstandingCents)}
          loading={loading}
          accent="amber"
        />
        <KpiCard
          title="Overdue orders"
          value={summary?.orders.overdue}
          loading={loading}
          accent={summary && summary.orders.overdue > 0 ? 'red' : 'slate'}
        />
      </div>

      <h2>Order pipeline</h2>
      <div className="kpi-grid">
        <KpiCard title="Pending" value={summary?.orders.pending} accent="amber" />
        <KpiCard title="In progress" value={summary?.orders.inProgress} accent="blue" />
        <KpiCard title="Ready" value={summary?.orders.ready} accent="green" />
        <KpiCard title="Delivered" value={summary?.orders.delivered} accent="slate" />
      </div>

      <div className="charts-row">
        <section className="card chart-card">
          <h3>Order pipeline mix</h3>
          {(() => {
            const o = summary?.orders;
            const slices: DonutSlice[] = o
              ? [
                  { label: 'Pending',     value: o.pending,    color: PIPELINE_COLORS.Pending },
                  { label: 'In progress', value: o.inProgress, color: PIPELINE_COLORS['In progress'] },
                  { label: 'Ready',       value: o.ready,      color: PIPELINE_COLORS.Ready },
                  { label: 'Delivered',   value: o.delivered,  color: PIPELINE_COLORS.Delivered },
                  { label: 'Cancelled',   value: o.cancelled,  color: PIPELINE_COLORS.Cancelled },
                ]
              : [];
            const active = slices.reduce((s, x) => s + x.value, 0);
            return (
              <div className="chart-with-legend">
                <DonutChart
                  data={slices}
                  centerLabel={String(active)}
                  centerSub="orders"
                />
                <ChartLegend items={slices} />
              </div>
            );
          })()}
        </section>

        <section className="card chart-card">
          <h3>Payment methods (30d)</h3>
          {(() => {
            const rows = summary?.charts.paymentMethods ?? [];
            const slices: DonutSlice[] = rows.map((r, i) => ({
              label: METHOD_LABELS[r.method] ?? r.method,
              value: r.cents,
              color: METHOD_COLORS[i % METHOD_COLORS.length],
            }));
            const total = slices.reduce((s, x) => s + x.value, 0);
            return (
              <div className="chart-with-legend">
                <DonutChart
                  data={slices}
                  centerLabel={compactRupees(total)}
                  centerSub="collected"
                />
                <ChartLegend items={slices} format={compactRupees} />
              </div>
            );
          })()}
        </section>
      </div>

      <section className="card chart-card">
        <h3>Revenue · last 14 days</h3>
        {(() => {
          const series = summary?.charts.revenueSeries ?? [];
          const data = series.map((r, i) => {
            const d = new Date(r.date);
            const dayLabel = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            return {
              label: d.getDate().toString().padStart(2, '0'),
              value: r.cents,
              tooltip: `${dayLabel}: ${rupees(r.cents)}`,
              color: i === series.length - 1 ? '#6366f1' : '#a5b4fc',
            };
          });
          return (
            <BarChart
              data={data}
              height={200}
              format={compactRupees}
              highlightIndex={data.length - 1}
            />
          );
        })()}
      </section>

      <h2>Customers</h2>
      <div className="kpi-grid">
        <KpiCard title="Total customers" value={summary?.customers.total} loading={loading} />
        <KpiCard title="Today" value={summary?.customers.today} loading={loading} />
        <KpiCard title="This week" value={summary?.customers.last7days} loading={loading} />
      </div>

      <h2>Recent orders</h2>
      {!loading && summary && summary.recentOrders.length === 0 && (
        <p className="muted">
          No orders yet — <Link to="/orders/new">create your first one</Link>.
        </p>
      )}
      <div className="recent-orders-grid">
        {summary?.recentOrders.map((o) => (
          <Link key={o.id} to={`/orders/${o.id}`} className="recent-order-card">
            <div className="ro-head">
              <strong>{o.orderNumber ?? o.id.slice(0, 8)}</strong>
              <StatusBadge status={o.status} />
            </div>
            <div className="muted small">{o.customer?.name ?? '—'}</div>
            <div className="ro-foot">
              <span className="ro-amount">{rupees(o.totalCents)}</span>
              <span className="muted small">{shortDate(o.dueDate ?? o.createdAt)}</span>
            </div>
          </Link>
        ))}
      </div>

      <h2>Recent customers</h2>
      {!loading && summary && summary.recentCustomers.length === 0 && (
        <p className="muted">
          No customers yet — <Link to="/customers/new">add your first one</Link>.
        </p>
      )}
      <div className="recent-grid">
        {summary?.recentCustomers.map((c) => (
          <Link key={c.id} to={`/customers/${c.id}`} className="recent-card">
            <div className="avatar">
              {c.imageUrl ? (
                <img src={assetUrl(c.imageUrl)} alt={c.name} />
              ) : (
                <span>{c.name.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div>
              <strong>{c.name}</strong>
              <div className="muted small">{c.mobile ?? '—'}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function KpiCard({
  title,
  value,
  loading,
  accent,
}: {
  title: string;
  value?: number | string;
  loading?: boolean;
  accent?: 'amber' | 'blue' | 'green' | 'slate' | 'red';
}) {
  return (
    <div className={`kpi-card ${accent ? `accent-${accent}` : ''}`}>
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{loading ? '…' : value ?? 0}</div>
    </div>
  );
}
