// Team Settings — list members & pending invites, invite new staff/managers,
// revoke pending invites, remove members.
//
// All write actions are server-side gated to OWNER/MANAGER. The UI hides them
// for STAFF to avoid showing buttons that would 403.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { api, ApiError } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Icon } from '../../components/Icon';

type Role = 'OWNER' | 'MANAGER' | 'STAFF';
type InviteRole = Exclude<Role, 'OWNER'>;

interface Member {
  userId: string;
  mobile: string;
  displayName: string | null;
  role: Role;
  joinedAt: string;
}

interface PendingInvite {
  id: string;
  mobile: string;
  role: InviteRole;
  displayName: string | null;
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; mobile: string; displayName: string | null } | null;
}

interface TeamResponse {
  members: Member[];
  invites: PendingInvite[];
}

interface CreatedInvite {
  id: string;
  mobile: string;
  role: InviteRole;
  displayName: string | null;
  token: string;
  expiresAt: string;
}

export function TeamSettingsPage() {
  const { session } = useAuth();
  const role = session?.role ?? 'STAFF';
  const canManage = role === 'OWNER' || role === 'MANAGER';
  const tenantId = session?.tenant.id;

  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Invite form state
  const [mobile, setMobile] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('STAFF');
  const [displayName, setDisplayName] = useState('');
  const [lastCreated, setLastCreated] = useState<CreatedInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api<TeamResponse>('/tenant/staff', { tenantId });
      setTeam(data);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createInvite(e: FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    setBusyKey('create');
    setActionError(null);
    setLastCreated(null);
    setCopied(false);
    try {
      const created = await api<CreatedInvite>('/tenant/staff/invites', {
        method: 'POST',
        tenantId,
        body: {
          mobile: mobile.trim(),
          role: inviteRole,
          displayName: displayName.trim() || undefined,
        },
      });
      setLastCreated(created);
      setMobile('');
      setDisplayName('');
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to create invite');
    } finally {
      setBusyKey(null);
    }
  }

  async function revoke(invite: PendingInvite) {
    if (!tenantId) return;
    if (!confirm(`Revoke the invite for ${invite.mobile}?`)) return;
    setBusyKey(`revoke:${invite.id}`);
    setActionError(null);
    try {
      await api(`/tenant/staff/invites/${invite.id}`, { method: 'DELETE', tenantId });
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to revoke invite');
    } finally {
      setBusyKey(null);
    }
  }

  async function remove(member: Member) {
    if (!tenantId) return;
    if (!confirm(`Remove ${member.displayName ?? member.mobile} from the shop?`)) return;
    setBusyKey(`remove:${member.userId}`);
    setActionError(null);
    try {
      await api(`/tenant/staff/members/${member.userId}`, { method: 'DELETE', tenantId });
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to remove member');
    } finally {
      setBusyKey(null);
    }
  }

  function inviteUrl(token: string): string {
    return `${window.location.origin}/invite/${encodeURIComponent(token)}`;
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — user can copy manually
    }
  }

  return (
    <div>
      <PageHeader title="Team" subtitle="Manage shop members and pending invitations." />

      {!canManage && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="muted">
            You're signed in as {role}. Only an owner or manager can invite or remove team members.
          </p>
        </div>
      )}

      {canManage && (
        <form className="card" onSubmit={createInvite} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Invite a teammate</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            They'll receive a one-time link. They confirm with an OTP sent to their mobile.
          </p>
          <div className="form-grid">
            <label>
              Mobile
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="9876543210"
                inputMode="tel"
                required
              />
            </label>
            <label>
              Role
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as InviteRole)}
              >
                <option value="STAFF">Staff</option>
                <option value="MANAGER">Manager</option>
              </select>
            </label>
            <label>
              Display name (optional)
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Priya"
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button disabled={busyKey === 'create'}>
              {busyKey === 'create' ? 'Creating…' : 'Create invite'}
            </button>
            {actionError && <span className="error">{actionError}</span>}
          </div>

          {lastCreated && (
            <div className="card" style={{ marginTop: 12, background: 'var(--surface-2, #f7f7f7)' }}>
              <p style={{ marginTop: 0 }}>
                <strong>Invite created.</strong> Share this link with{' '}
                <strong>{lastCreated.mobile}</strong>. It expires{' '}
                {new Date(lastCreated.expiresAt).toLocaleString()}.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  readOnly
                  value={inviteUrl(lastCreated.token)}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                />
                <button type="button" onClick={() => copyLink(lastCreated.token)}>
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
              </div>
              <p className="muted" style={{ marginBottom: 0, marginTop: 8 }}>
                For security, this link is shown only once. If lost, revoke the invite and create a new one.
              </p>
            </div>
          )}
        </form>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Members</h3>
        {loading && <p className="muted">Loading…</p>}
        {loadError && <p className="error">{loadError}</p>}
        {team && team.members.length === 0 && <p className="muted">No members yet.</p>}
        {team && team.members.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile</th>
                <th>Role</th>
                <th>Joined</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {team.members.map((m) => {
                const isSelf = m.userId === session?.user.id;
                const removable =
                  canManage &&
                  !isSelf &&
                  m.role !== 'OWNER' &&
                  !(m.role === 'MANAGER' && role !== 'OWNER');
                return (
                  <tr key={m.userId}>
                    <td>{m.displayName ?? '—'}{isSelf && <span className="muted"> (you)</span>}</td>
                    <td>{m.mobile}</td>
                    <td><RoleBadge role={m.role} /></td>
                    <td>{new Date(m.joinedAt).toLocaleDateString()}</td>
                    {canManage && (
                      <td style={{ textAlign: 'right' }}>
                        {removable && (
                          <button
                            type="button"
                            className="ghost"
                            disabled={busyKey === `remove:${m.userId}`}
                            onClick={() => remove(m)}
                            title="Remove from shop"
                          >
                            <Icon name="trash" size={14} /> Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Pending invites</h3>
        {team && team.invites.length === 0 && <p className="muted">No pending invites.</p>}
        {team && team.invites.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Mobile</th>
                <th>Role</th>
                <th>Expires</th>
                <th>Invited by</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {team.invites.map((i) => (
                <tr key={i.id}>
                  <td>{i.mobile}</td>
                  <td><RoleBadge role={i.role} /></td>
                  <td>{new Date(i.expiresAt).toLocaleString()}</td>
                  <td>{i.invitedBy?.displayName ?? i.invitedBy?.mobile ?? '—'}</td>
                  {canManage && (
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busyKey === `revoke:${i.id}`}
                        onClick={() => revoke(i)}
                      >
                        Revoke
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return <span className={`badge badge-${role.toLowerCase()}`}>{role}</span>;
}
