// Reusable status badge for orders + line items.

import type { OrderStatus } from '../api/domain';

const LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  READY: 'Ready',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{LABEL[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const cls = priority.toLowerCase();
  return <span className={`priority-badge priority-${cls}`}>{priority}</span>;
}
