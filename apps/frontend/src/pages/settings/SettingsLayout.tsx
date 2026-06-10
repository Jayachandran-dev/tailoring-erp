// Wrapper layout for /settings/* pages — provides a sub-navigation strip.

import { NavLink, Outlet } from 'react-router-dom';
import { Icon, type IconName } from '../../components/Icon';

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/settings/business', label: 'Business', icon: 'building' },
  { to: '/settings/payments', label: 'Payments', icon: 'credit-card' },
  { to: '/settings/team', label: 'Team', icon: 'users' },
];

export function SettingsLayout() {
  return (
    <>
      <nav className="settings-tabs" data-print-hide>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => `settings-tab ${isActive ? 'active' : ''}`}
          >
            <span className="settings-tab-icon"><Icon name={t.icon} size={16} /></span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
