// Shared types and tiny API helpers for the customers domain.

import { api, apiUpload } from '../api/client';

export interface Customer {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  address: string | null;
  gender: 'male' | 'female' | 'other' | null;
  notes: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Measurement {
  id: string;
  customerId: string;
  garmentType: string;
  label: string | null;
  data: Record<string, string | number>;
  takenAt: string;
  updatedAt: string;
}

export interface CustomerWithMeasurements extends Customer {
  measurements: Measurement[];
}

export interface CustomerListResult {
  items: Customer[];
  total: number;
  page: number;
  pageSize: number;
}

interface Ctx {
  token: string;
  tenantId: string;
}

export const customersApi = {
  list: (ctx: Ctx, query: { q?: string; page?: number; pageSize?: number }) =>
    api<CustomerListResult>('/customers', { ...ctx, query }),
  get: (ctx: Ctx, id: string) => api<CustomerWithMeasurements>(`/customers/${id}`, ctx),
  create: (ctx: Ctx, body: Partial<Customer>) =>
    api<Customer>('/customers', { ...ctx, method: 'POST', body }),
  update: (ctx: Ctx, id: string, body: Partial<Customer>) =>
    api<Customer>(`/customers/${id}`, { ...ctx, method: 'PATCH', body }),
  remove: (ctx: Ctx, id: string) =>
    api<void>(`/customers/${id}`, { ...ctx, method: 'DELETE' }),
  uploadImage: (ctx: Ctx, id: string, file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return apiUpload<Customer>(`/customers/${id}/image`, fd, ctx);
  },
  removeImage: (ctx: Ctx, id: string) =>
    api<Customer>(`/customers/${id}/image`, { ...ctx, method: 'DELETE' }),
};

export const measurementsApi = {
  list: (ctx: Ctx, customerId: string) =>
    api<Measurement[]>(`/customers/${customerId}/measurements`, ctx),
  create: (
    ctx: Ctx,
    customerId: string,
    body: { garmentType: string; label?: string | null; data: Record<string, string | number> },
  ) =>
    api<Measurement>(`/customers/${customerId}/measurements`, {
      ...ctx,
      method: 'POST',
      body,
    }),
  update: (
    ctx: Ctx,
    customerId: string,
    id: string,
    body: { garmentType?: string; label?: string | null; data?: Record<string, string | number> },
  ) =>
    api<Measurement>(`/customers/${customerId}/measurements/${id}`, {
      ...ctx,
      method: 'PATCH',
      body,
    }),
  remove: (ctx: Ctx, customerId: string, id: string) =>
    api<void>(`/customers/${customerId}/measurements/${id}`, {
      ...ctx,
      method: 'DELETE',
    }),
};

export interface DashboardSummary {
  customers: { total: number; today: number; last7days: number };
  orders: {
    total: number;
    pending: number;
    inProgress: number;
    ready: number;
    delivered: number;
    cancelled: number;
    overdue: number;
  };
  money: { revenueCents: number; outstandingCents: number; revenueTodayCents: number };
  charts: {
    revenueSeries: { date: string; cents: number }[];
    paymentMethods: { method: string; cents: number }[];
  };
  recentCustomers: Customer[];
  recentOrders: OrderListItem[];
}

export const dashboardApi = {
  summary: (ctx: Ctx) => api<DashboardSummary>('/dashboard/summary', ctx),
};

// ============================================================
// DESIGN CATALOG
// ============================================================
export interface DesignCategory {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count?: { designs: number };
}

export interface Design {
  id: string;
  categoryId: string;
  name: string;
  code: string | null;
  priceCents: number;
  notes: string | null;
  imageUrl: string | null;
  tags: string | null;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string };
}

export interface DesignListResult {
  items: Design[];
  total: number;
  page: number;
  pageSize: number;
}

export const designCategoriesApi = {
  list: (ctx: Ctx) => api<DesignCategory[]>('/design-categories', ctx),
  create: (ctx: Ctx, body: { name: string; sortOrder?: number }) =>
    api<DesignCategory>('/design-categories', { ...ctx, method: 'POST', body }),
  update: (ctx: Ctx, id: string, body: Partial<{ name: string; sortOrder: number }>) =>
    api<DesignCategory>(`/design-categories/${id}`, { ...ctx, method: 'PATCH', body }),
  remove: (ctx: Ctx, id: string) =>
    api<void>(`/design-categories/${id}`, { ...ctx, method: 'DELETE' }),
};

export interface DesignInput {
  categoryId: string;
  name: string;
  code?: string | null;
  priceCents?: number;
  notes?: string | null;
  tags?: string | null;
}

export const designsApi = {
  list: (
    ctx: Ctx,
    query: { q?: string; categoryId?: string; page?: number; pageSize?: number },
  ) => api<DesignListResult>('/designs', { ...ctx, query }),
  get: (ctx: Ctx, id: string) => api<Design>(`/designs/${id}`, ctx),
  create: (ctx: Ctx, body: DesignInput) =>
    api<Design>('/designs', { ...ctx, method: 'POST', body }),
  update: (ctx: Ctx, id: string, body: Partial<DesignInput>) =>
    api<Design>(`/designs/${id}`, { ...ctx, method: 'PATCH', body }),
  remove: (ctx: Ctx, id: string) =>
    api<void>(`/designs/${id}`, { ...ctx, method: 'DELETE' }),
  uploadImage: (ctx: Ctx, id: string, file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return apiUpload<Design>(`/designs/${id}/image`, fd, ctx);
  },
  removeImage: (ctx: Ctx, id: string) =>
    api<Design>(`/designs/${id}/image`, { ...ctx, method: 'DELETE' }),
};

// ============================================================
// ORDERS
// ============================================================
export type OrderStatus = 'PENDING' | 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'CANCELLED';
export type OrderPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'BANK' | 'OTHER';

export interface OrderItem {
  id: string;
  orderId: string;
  designId: string | null;
  measurementId: string | null;
  garmentType: string;
  name: string;
  imageUrl: string | null;
  qty: number;
  unitPriceCents: number;
  measurementSnapshot: Record<string, string | number> | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface OrderPayment {
  id: string;
  orderId: string;
  amountCents: number;
  method: PaymentMethod | string;
  reference: string | null;
  notes: string | null;
  paidAt: string;
  createdAt: string;
  upiAccountId?: string | null;
  upiAccount?: { id: string; label: string; upiId: string } | null;
}

export interface OrderStatusEvent {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  changedAt: string;
}

export interface OrderListItem {
  id: string;
  orderNumber: string | null;
  customerId: string;
  status: OrderStatus;
  priority: OrderPriority | string;
  totalCents: number;
  paidCents: number;
  discountCents: number;
  notes: string | null;
  dueDate: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; name: string; mobile: string | null };
  _count?: { items: number; payments: number };
}

export interface Order extends OrderListItem {
  customer?: { id: string; name: string; mobile: string | null; imageUrl?: string | null };
  items: OrderItem[];
  payments: OrderPayment[];
  history: OrderStatusEvent[];
}

export interface OrderListResult {
  items: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrderItemInput {
  designId?: string | null;
  measurementId?: string | null;
  garmentType?: string;
  name: string;
  imageUrl?: string | null;
  qty?: number;
  unitPriceCents?: number;
  measurementSnapshot?: Record<string, string | number> | null;
  notes?: string | null;
}

export interface OrderCreateInput {
  customerId: string;
  items: OrderItemInput[];
  discountCents?: number;
  priority?: OrderPriority;
  notes?: string | null;
  dueDate?: string | null;
  advance?: {
    amountCents: number;
    method?: PaymentMethod | string;
    reference?: string | null;
    notes?: string | null;
  };
}

export interface OrderUpdateInput {
  discountCents?: number;
  priority?: OrderPriority;
  notes?: string | null;
  dueDate?: string | null;
  items?: OrderItemInput[];
}

export interface PaymentInput {
  amountCents: number;
  method?: PaymentMethod | string;
  reference?: string | null;
  notes?: string | null;
  paidAt?: string;
  upiAccountId?: string | null;
}

export const ordersApi = {
  list: (
    ctx: Ctx,
    query: {
      q?: string;
      status?: OrderStatus;
      customerId?: string;
      due?: 'overdue' | 'today' | 'week';
      page?: number;
      pageSize?: number;
    },
  ) => api<OrderListResult>('/orders', { ...ctx, query }),
  get: (ctx: Ctx, id: string) => api<Order>(`/orders/${id}`, ctx),
  create: (ctx: Ctx, body: OrderCreateInput) =>
    api<Order>('/orders', { ...ctx, method: 'POST', body }),
  update: (ctx: Ctx, id: string, body: OrderUpdateInput) =>
    api<Order>(`/orders/${id}`, { ...ctx, method: 'PATCH', body }),
  remove: (ctx: Ctx, id: string) => api<void>(`/orders/${id}`, { ...ctx, method: 'DELETE' }),
  setStatus: (ctx: Ctx, id: string, status: OrderStatus, note?: string) =>
    api<Order>(`/orders/${id}/status`, {
      ...ctx,
      method: 'POST',
      body: { status, note },
    }),
  addPayment: (ctx: Ctx, id: string, body: PaymentInput) =>
    api<Order>(`/orders/${id}/payments`, { ...ctx, method: 'POST', body }),
  removePayment: (ctx: Ctx, id: string, paymentId: string) =>
    api<Order>(`/orders/${id}/payments/${paymentId}`, { ...ctx, method: 'DELETE' }),
};

// ============================================================
// PAYMENT SETTINGS · UPI
// ============================================================
export interface UpiAccount {
  id: string;
  label: string;
  upiId: string;
  payeeName: string | null;
  isDefault: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpiAccountInput {
  label: string;
  upiId: string;
  payeeName?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  notes?: string | null;
}

export interface UpiAccountSummary {
  account: UpiAccount;
  lifetime: { cents: number; count: number };
  last30d:  { cents: number; count: number };
}

export const upiAccountsApi = {
  list:    (ctx: Ctx) => api<UpiAccount[]>('/settings/upi-accounts', ctx),
  summary: (ctx: Ctx) => api<UpiAccountSummary[]>('/settings/upi-accounts/summary', ctx),
  create:  (ctx: Ctx, body: UpiAccountInput) =>
    api<UpiAccount>('/settings/upi-accounts', { ...ctx, method: 'POST', body }),
  update:  (ctx: Ctx, id: string, body: Partial<UpiAccountInput>) =>
    api<UpiAccount>(`/settings/upi-accounts/${id}`, { ...ctx, method: 'PATCH', body }),
  setDefault: (ctx: Ctx, id: string) =>
    api<UpiAccount>(`/settings/upi-accounts/${id}/default`, { ...ctx, method: 'POST' }),
  remove:  (ctx: Ctx, id: string) =>
    api<void>(`/settings/upi-accounts/${id}`, { ...ctx, method: 'DELETE' }),
};

// ============================================================
// BUSINESS SETTINGS  (singleton per tenant)
// ============================================================
export interface BusinessSettings {
  id: string;
  businessName: string;
  legalName: string | null;
  tagline: string | null;
  ownerName: string | null;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  gstin: string | null;
  pan: string | null;
  currency: string;
  timezone: string;
  logoUrl: string | null;
  visitingCardUrl: string | null;
  invoicePrefix: string;
  invoiceFooter: string | null;
  terms: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BusinessSettingsInput = Partial<Omit<BusinessSettings, 'id' | 'createdAt' | 'updatedAt'>>;

export const businessSettingsApi = {
  get:    (ctx: Ctx) => api<BusinessSettings>('/settings/business', ctx),
  update: (ctx: Ctx, body: BusinessSettingsInput) =>
    api<BusinessSettings>('/settings/business', { ...ctx, method: 'PUT', body }),
  uploadLogo: (ctx: Ctx, file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return apiUpload<BusinessSettings>('/settings/business/logo', fd, ctx);
  },
  removeLogo: (ctx: Ctx) =>
    api<BusinessSettings>('/settings/business/logo', { ...ctx, method: 'DELETE' }),
  uploadVisitingCard: (ctx: Ctx, file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return apiUpload<BusinessSettings>('/settings/business/visiting-card', fd, ctx);
  },
  removeVisitingCard: (ctx: Ctx) =>
    api<BusinessSettings>('/settings/business/visiting-card', { ...ctx, method: 'DELETE' }),
};
