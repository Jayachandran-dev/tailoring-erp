// Aggregated KPIs for the dashboard. Tenant-scoped.

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { tenantContext } from '../../middleware/tenantContext';

const router = Router();
router.use(requireAuth, tenantContext);

const REVENUE_SERIES_DAYS = 14;

router.get('/summary', async (req, res, next) => {
  try {
    const db = req.tenantDb!;
    const schema = req.tenantSchema!;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const seriesStart = new Date(
      startOfDay.getTime() - (REVENUE_SERIES_DAYS - 1) * 24 * 60 * 60 * 1000,
    );
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalCustomers,
      customersToday,
      customersLast7d,
      totalOrders,
      pendingOrders,
      inProgressOrders,
      readyOrders,
      deliveredOrders,
      cancelledOrders,
      overdueOrders,
      revenueAgg,
      outstandingAgg,
      revenueTodayAgg,
      recentCustomers,
      recentOrders,
      revenueSeriesRows,
      paymentMethodRows,
    ] = await Promise.all([
      db.customer.count(),
      db.customer.count({ where: { createdAt: { gte: startOfDay } } }),
      db.customer.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      db.order.count(),
      db.order.count({ where: { status: 'PENDING' } }),
      db.order.count({ where: { status: 'IN_PROGRESS' } }),
      db.order.count({ where: { status: 'READY' } }),
      db.order.count({ where: { status: 'DELIVERED' } }),
      db.order.count({ where: { status: 'CANCELLED' } }),
      db.order.count({
        where: {
          status: { notIn: ['DELIVERED', 'CANCELLED'] },
          dueDate: { lt: startOfDay },
        },
      }),
      db.order.aggregate({
        _sum: { totalCents: true },
        where: { status: { not: 'CANCELLED' } },
      }),
      db.order.aggregate({
        _sum: { totalCents: true, paidCents: true },
        where: { status: { notIn: ['CANCELLED', 'DELIVERED'] } },
      }),
      db.orderPayment.aggregate({
        _sum: { amountCents: true },
        where: { paidAt: { gte: startOfDay } },
      }),
      db.customer.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
      db.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: {
          customer: { select: { id: true, name: true, mobile: true } },
        },
      }),
      // Daily net revenue (payments − refunds) for the last N days.
      db.$queryRawUnsafe<{ day: Date; cents: bigint }[]>(
        `SELECT date_trunc('day', "paid_at") AS day,
                COALESCE(SUM("amount_cents"), 0)::bigint AS cents
         FROM "${schema}"."order_payments"
         WHERE "paid_at" >= $1
         GROUP BY 1
         ORDER BY 1`,
        seriesStart,
      ),
      // Breakdown by method (last 30 days), positive amounts only (= money in).
      db.$queryRawUnsafe<{ method: string; cents: bigint }[]>(
        `SELECT "method",
                COALESCE(SUM("amount_cents"), 0)::bigint AS cents
         FROM "${schema}"."order_payments"
         WHERE "paid_at" >= $1 AND "amount_cents" > 0
         GROUP BY "method"
         ORDER BY cents DESC`,
        thirtyDaysAgo,
      ),
    ]);

    const revenueCents = revenueAgg._sum.totalCents ?? 0;
    const outstandingCents = Math.max(
      0,
      (outstandingAgg._sum.totalCents ?? 0) - (outstandingAgg._sum.paidCents ?? 0),
    );
    const revenueTodayCents = revenueTodayAgg._sum.amountCents ?? 0;

    // Densify the daily revenue series so every day in the window is present.
    const seriesMap = new Map<string, number>();
    for (const r of revenueSeriesRows) {
      const d = new Date(r.day);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
      seriesMap.set(key, Number(r.cents));
    }
    const revenueSeries: { date: string; cents: number }[] = [];
    for (let i = 0; i < REVENUE_SERIES_DAYS; i++) {
      const d = new Date(seriesStart.getTime() + i * 24 * 60 * 60 * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
      revenueSeries.push({ date: key, cents: seriesMap.get(key) ?? 0 });
    }

    const paymentMethods = paymentMethodRows.map((r) => ({
      method: r.method,
      cents: Number(r.cents),
    }));

    res.json({
      data: {
        customers: {
          total: totalCustomers,
          today: customersToday,
          last7days: customersLast7d,
        },
        orders: {
          total: totalOrders,
          pending: pendingOrders,
          inProgress: inProgressOrders,
          ready: readyOrders,
          delivered: deliveredOrders,
          cancelled: cancelledOrders,
          overdue: overdueOrders,
        },
        money: {
          revenueCents,
          outstandingCents,
          revenueTodayCents,
        },
        charts: {
          revenueSeries,    // [{date:'YYYY-MM-DD', cents}] – last 14 days
          paymentMethods,   // [{method, cents}] – last 30 days, positive flows only
        },
        recentCustomers,
        recentOrders,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
