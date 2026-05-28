import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  title: string;
  subtitle?: string;
  back?: string; // route to navigate back to
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, back, actions }: Props) {
  const nav = useNavigate();
  return (
    <div className="page-header">
      <div>
        {back && (
          <button type="button" className="link-btn" onClick={() => nav(back)}>
            ← Back
          </button>
        )}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
