import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { AppLayout } from './components/AppLayout';
import { CustomersListPage } from './pages/customers/CustomersListPage';
import { CustomerFormPage } from './pages/customers/CustomerFormPage';
import { CustomerViewPage } from './pages/customers/CustomerViewPage';
import { DesignsPage } from './pages/designs/DesignsPage';
import { OrdersListPage } from './pages/orders/OrdersListPage';
import { OrderCreatePage } from './pages/orders/OrderCreatePage';
import { OrderDetailPage } from './pages/orders/OrderDetailPage';
import { PaymentSettingsPage } from './pages/settings/PaymentSettingsPage';
import { BusinessSettingsPage } from './pages/settings/BusinessSettingsPage';
import { TeamSettingsPage } from './pages/settings/TeamSettingsPage';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { InvitePage } from './pages/InvitePage';

export default function App() {
  const { session, ready } = useAuth();

  // Avoid a flash of the /auth page while the cookie-based session is being
  // restored from GET /auth/me on first load.
  if (!ready) {
    return (
      <div className="app-shell app-shell--booting">
        <p className="muted" style={{ padding: 24 }}>Loading…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app-shell">
        <Routes>
          {/* Invite acceptance must be reachable while signed-out. */}
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/customers" element={<CustomersListPage />} />
        <Route path="/customers/new" element={<CustomerFormPage mode="new" />} />
        <Route path="/customers/:id" element={<CustomerViewPage />} />
        <Route path="/customers/:id/edit" element={<CustomerFormPage mode="edit" />} />
        <Route path="/designs" element={<DesignsPage />} />
        <Route path="/orders" element={<OrdersListPage />} />
        <Route path="/orders/new" element={<OrderCreatePage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="business" replace />} />
          <Route path="business" element={<BusinessSettingsPage />} />
          <Route path="payments" element={<PaymentSettingsPage />} />
          <Route path="team" element={<TeamSettingsPage />} />
        </Route>
        <Route path="/auth" element={<Navigate to="/" replace />} />
        {/* If a signed-in user clicks an invite link, send them back to the dashboard. */}
        <Route path="/invite/:token" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
