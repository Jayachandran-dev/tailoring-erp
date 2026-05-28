// App shell — sidebar drawer + topbar + main content.
//
// Designed to scale to many modules:
//   • NAV is a flat list of items or groups of items
//   • Groups collapse/expand independently and persist their state
//   • Desktop sidebar can collapse to an icon rail (persisted)
//   • On narrow screens the sidebar slides in as an off-canvas drawer
//     opened from a topbar hamburger button

import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { businessSettingsApi, type BusinessSettings } from '../api/domain';
import { assetUrl } from '../api/client';
import { Icon, type IconName } from './Icon';

type NavLeaf = {
  kind: 'link';
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
};
type NavGroup = {
  kind: 'group';
  id: string;
  label: string;
  icon: IconName;
  children: NavLeaf[];
};
type NavEntry = NavLeaf | NavGroup;

const NAV: NavEntry[] = [
  { kind: 'link', to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  {
    kind: 'group',
    id: 'sales',
    label: 'Sales',
    icon: 'package',
    children: [
      { kind: 'link', to: '/orders', label: 'Orders', icon: 'package' },
    ],
  },
  {
    kind: 'group',
    id: 'catalog',
    label: 'Catalog',
    icon: 'palette',
    children: [
      { kind: 'link', to: '/designs', label: 'Designs', icon: 'palette' },
    ],
  },
  {
    kind: 'group',
    id: 'contacts',
    label: 'Contacts',
    icon: 'users',
    children: [
      { kind: 'link', to: '/customers', label: 'Customers', icon: 'users' },
    ],
  },
  {
    kind: 'group',
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    children: [
      { kind: 'link', to: '/settings/business', label: 'Business', icon: 'building' },
      { kind: 'link', to: '/settings/payments', label: 'Payments', icon: 'credit-card' },
    ],
  },
];

const LS_COLLAPSED = 'nav.collapsed';
const LS_OPEN      = 'nav.openGroups';

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function groupContainsPath(g: NavGroup, pathname: string): boolean {
  return g.children.some((c) => pathname === c.to || pathname.startsWith(c.to + '/'));
}

export function AppLayout() {
  const { session, signOut } = useAuth();
  const location = useLocation();

  const [biz, setBiz] = useState<BusinessSettings | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => readJSON(LS_COLLAPSED, false));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => readJSON(LS_OPEN, {}),
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const ctx = useMemo(
    () => (session ? { token: session.token, tenantId: session.tenant.id } : null),
    [session],
  );

  // Load business settings for sidebar branding; allow live updates.
  useEffect(() => {
    if (!ctx) { setBiz(null); return; }
    let cancelled = false;
    businessSettingsApi
      .get(ctx)
      .then((b) => { if (!cancelled) setBiz(b); })
      .catch(() => { /* sidebar gracefully falls back to tenant name */ });

    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<BusinessSettings>).detail;
      if (detail) setBiz(detail);
    };
    window.addEventListener('business-settings-updated', onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('business-settings-updated', onUpdate);
    };
  }, [ctx?.tenantId]);

  // Auto-expand the group containing the active route once per navigation.
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of NAV) {
        if (item.kind === 'group' && groupContainsPath(item, location.pathname) && !prev[item.id]) {
          next[item.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [location.pathname]);

  // Persist collapse + open-group state.
  useEffect(() => { localStorage.setItem(LS_COLLAPSED, JSON.stringify(collapsed)); }, [collapsed]);
  useEffect(() => { localStorage.setItem(LS_OPEN, JSON.stringify(openGroups)); }, [openGroups]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  if (!session) return null;

  const shopName = biz?.businessName?.trim() || session.tenant.name;
  const subtitle = biz?.tagline?.trim() || session.tenant.slug;

  function toggleGroup(id: string) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function renderEntry(entry: NavEntry) {
    if (entry.kind === 'link') {
      return (
        <NavLink
          key={entry.to}
          to={entry.to}
          end={entry.end}
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          title={collapsed ? entry.label : undefined}
        >
          <span className="nav-icon"><Icon name={entry.icon} size={18} /></span>
          <span className="nav-label">{entry.label}</span>
        </NavLink>
      );
    }

    const active   = groupContainsPath(entry, location.pathname);
    const expanded = collapsed ? false : (openGroups[entry.id] ?? false);

    return (
      <div key={entry.id} className={`nav-group ${active ? 'has-active' : ''}`}>
        <button
          type="button"
          className={`nav-link nav-group-head ${expanded ? 'is-open' : ''}`}
          onClick={() => toggleGroup(entry.id)}
          aria-expanded={expanded}
          title={collapsed ? entry.label : undefined}
        >
          <span className="nav-icon"><Icon name={entry.icon} size={18} /></span>
          <span className="nav-label">{entry.label}</span>
          <span className="nav-caret">
            <Icon name="chevron-down" size={14} />
          </span>
        </button>
        {expanded && (
          <div className="nav-group-body">
            {entry.children.map((c) => (
              <NavLink
                key={c.to}
                to={c.to}
                end={c.end}
                className={({ isActive }) => `nav-link nav-sublink ${isActive ? 'active' : ''}`}
              >
                <span className="nav-dot" />
                <span className="nav-label">{c.label}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`layout ${collapsed ? 'is-collapsed' : ''} ${drawerOpen ? 'drawer-open' : ''}`}>
      <header className="topbar">
        <button
          type="button"
          className="icon-btn topbar-menu"
          onClick={() => setDrawerOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          <Icon name="menu" size={20} />
        </button>
        <div className="topbar-title">{shopName}</div>
      </header>

      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      )}

      <aside className="sidebar" aria-label="Primary navigation">
        <div className="sidebar-brand">
          {biz?.logoUrl ? (
            <img className="sidebar-logo" src={assetUrl(biz.logoUrl)} alt="" />
          ) : (
            <span className="sidebar-logo placeholder">
              {shopName.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="sidebar-brand-text">
            <div className="sidebar-shop" title={shopName}>{shopName}</div>
            <div className="muted small" title={subtitle}>{subtitle}</div>
          </div>
          <button
            type="button"
            className="icon-btn sidebar-collapse"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={14} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(renderEntry)}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {(session.user.displayName ?? session.user.mobile ?? '?').charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-text">
              <div className="sidebar-user-name">
                {session.user.displayName ?? session.user.mobile}
              </div>
              <div className="muted small">{session.tenant.slug}</div>
            </div>
          </div>
          <button type="button" className="ghost sidebar-signout" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
