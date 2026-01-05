/**
 * DivertScan™ Apex Enterprise - Settings Module
 * User Preferences | Tenant Configuration | Integrations
 * iPad Optimized
 */

import React, { useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface SettingsProps {
  tenant: Tenant | null;
  user: User | null;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: 'starter' | 'professional' | 'enterprise';
  billingEmail: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'field_operator' | 'viewer';
  phone?: string;
}

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
  status: 'active' | 'pending' | 'disabled';
  lastActive?: Date;
}

type SettingsTab = 'profile' | 'company' | 'team' | 'billing' | 'integrations';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function SettingsModule({ tenant, user }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  const tabs: { key: SettingsTab; label: string; icon: string }[] = [
    { key: 'profile', label: 'Profile', icon: '👤' },
    { key: 'company', label: 'Company', icon: '🏢' },
    { key: 'team', label: 'Team', icon: '👥' },
    { key: 'billing', label: 'Billing', icon: '💳' },
    { key: 'integrations', label: 'Integrations', icon: '🔗' }
  ];

  return (
    <div className="settings-module">
      <style>{settingsStyles}</style>

      <div className="settings-layout">
        {/* Sidebar */}
        <nav className="settings-nav">
          <h2>Settings</h2>
          <ul>
            {tabs.map(tab => (
              <li key={tab.key}>
                <button
                  className={activeTab === tab.key ? 'active' : ''}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <span className="tab-icon">{tab.icon}</span>
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <main className="settings-content">
          {activeTab === 'profile' && <ProfileSettings user={user} />}
          {activeTab === 'company' && <CompanySettings tenant={tenant} />}
          {activeTab === 'team' && <TeamSettings tenant={tenant} />}
          {activeTab === 'billing' && <BillingSettings tenant={tenant} />}
          {activeTab === 'integrations' && <IntegrationsSettings />}
        </main>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

function ProfileSettings({ user }: { user: User | null }) {
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || ''
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(form)
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Profile updated successfully' });
      } else {
        throw new Error('Failed to update');
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-panel">
      <h3>Profile Settings</h3>
      <p className="panel-subtitle">Manage your personal information</p>

      {message && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}

      <div className="form-section">
        <div className="form-group">
          <label>Full Name</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Your name"
          />
        </div>

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="you@company.com"
          />
        </div>

        <div className="form-group">
          <label>Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="(555) 123-4567"
          />
        </div>
      </div>

      <div className="form-section">
        <h4>Role & Permissions</h4>
        <div className="role-display">
          <span className="role-badge">{user?.role || 'User'}</span>
          <p className="role-desc">
            {getRoleDescription(user?.role || 'viewer')}
          </p>
        </div>
      </div>

      <div className="form-actions">
        <button 
          className="btn-primary" 
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="danger-zone">
        <h4>Danger Zone</h4>
        <div className="danger-item">
          <div>
            <strong>Change Password</strong>
            <p>Update your account password</p>
          </div>
          <button className="btn-outline">Change</button>
        </div>
        <div className="danger-item">
          <div>
            <strong>Sign Out Everywhere</strong>
            <p>Log out of all devices and sessions</p>
          </div>
          <button className="btn-outline">Sign Out All</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPANY SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

function CompanySettings({ tenant }: { tenant: Tenant | null }) {
  const [form, setForm] = useState({
    name: tenant?.name || '',
    billingEmail: tenant?.billingEmail || ''
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/tenant', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(form)
      });
    } catch {
      console.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-panel">
      <h3>Company Settings</h3>
      <p className="panel-subtitle">Manage your organization details</p>

      <div className="form-section">
        <div className="form-group">
          <label>Company Name</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Your company"
          />
        </div>

        <div className="form-group">
          <label>Account Slug</label>
          <div className="slug-display">
            <span className="slug-prefix">divertscan.com/</span>
            <span className="slug-value">{tenant?.slug || 'your-company'}</span>
          </div>
          <p className="form-hint">Contact support to change your account slug</p>
        </div>

        <div className="form-group">
          <label>Billing Email</label>
          <input
            type="email"
            value={form.billingEmail}
            onChange={e => setForm(f => ({ ...f, billingEmail: e.target.value }))}
            placeholder="billing@company.com"
          />
          <p className="form-hint">Invoices and receipts will be sent here</p>
        </div>
      </div>

      <div className="form-actions">
        <button 
          className="btn-primary" 
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEAM SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

function TeamSettings({ tenant }: { tenant: Tenant | null }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('field_operator');

  useEffect(() => {
    loadMembers();
  }, []);

  const loadMembers = async () => {
    try {
      const response = await fetch('/api/team', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        setMembers(await response.json());
      }
    } catch {
      console.error('Failed to load team');
    } finally {
      setLoading(false);
    }
  };

  const inviteMember = async () => {
    if (!inviteEmail) return;

    try {
      await fetch('/api/team/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });
      setShowInvite(false);
      setInviteEmail('');
      loadMembers();
    } catch {
      console.error('Failed to invite');
    }
  };

  const removeMember = async (memberId: string) => {
    if (!confirm('Remove this team member?')) return;

    try {
      await fetch(`/api/team/${memberId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      loadMembers();
    } catch {
      console.error('Failed to remove');
    }
  };

  return (
    <div className="settings-panel">
      <div className="panel-header">
        <div>
          <h3>Team Members</h3>
          <p className="panel-subtitle">Manage who has access to DivertScan</p>
        </div>
        <button className="btn-primary" onClick={() => setShowInvite(true)}>
          + Invite Member
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading team...</div>
      ) : (
        <div className="team-list">
          {members.map(member => (
            <div key={member.id} className="team-member">
              <div className="member-avatar">
                {member.name.charAt(0).toUpperCase()}
              </div>
              <div className="member-info">
                <span className="member-name">{member.name}</span>
                <span className="member-email">{member.email}</span>
              </div>
              <span className={`member-role ${member.role}`}>
                {formatRole(member.role)}
              </span>
              <span className={`member-status ${member.status}`}>
                {member.status}
              </span>
              <button 
                className="member-remove"
                onClick={() => removeMember(member.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="modal-overlay" onClick={() => setShowInvite(false)}>
          <div className="modal small" onClick={e => e.stopPropagation()}>
            <h4>Invite Team Member</h4>
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
              />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="field_operator">Field Operator</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowInvite(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={inviteMember}>
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="roles-info">
        <h4>Role Permissions</h4>
        <div className="role-list">
          <div className="role-item">
            <span className="role-name">Owner</span>
            <span className="role-desc">Full access including billing and danger zone actions</span>
          </div>
          <div className="role-item">
            <span className="role-name">Admin</span>
            <span className="role-desc">Manage team, projects, and all settings</span>
          </div>
          <div className="role-item">
            <span className="role-name">Manager</span>
            <span className="role-desc">Manage projects and verify tickets</span>
          </div>
          <div className="role-item">
            <span className="role-name">Field Operator</span>
            <span className="role-desc">Create tickets and capture weights</span>
          </div>
          <div className="role-item">
            <span className="role-name">Viewer</span>
            <span className="role-desc">View-only access to dashboards and reports</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BILLING SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

function BillingSettings({ tenant }: { tenant: Tenant | null }) {
  const plans = [
    { 
      key: 'starter', 
      name: 'Starter', 
      price: 99, 
      features: ['5 Projects', '100 Tickets/mo', 'Basic Analytics', 'Email Support'] 
    },
    { 
      key: 'professional', 
      name: 'Professional', 
      price: 299, 
      features: ['Unlimited Projects', 'Unlimited Tickets', 'Advanced Analytics', 'QuickBooks Integration', 'Priority Support'] 
    },
    { 
      key: 'enterprise', 
      name: 'Enterprise', 
      price: 799, 
      features: ['Everything in Pro', 'Custom Integrations', 'Dedicated Support', 'SLA Guarantee', 'White-label Options'] 
    }
  ];

  const currentPlan = plans.find(p => p.key === tenant?.plan) || plans[0];

  return (
    <div className="settings-panel">
      <h3>Billing & Subscription</h3>
      <p className="panel-subtitle">Manage your subscription and payment methods</p>

      {/* Current Plan */}
      <div className="current-plan">
        <div className="plan-info">
          <span className="plan-name">{currentPlan.name} Plan</span>
          <span className="plan-price">${currentPlan.price}/month</span>
        </div>
        <button className="btn-outline">Manage Subscription</button>
      </div>

      {/* Plans Grid */}
      <div className="plans-grid">
        {plans.map(plan => (
          <div 
            key={plan.key} 
            className={`plan-card ${plan.key === tenant?.plan ? 'current' : ''}`}
          >
            <h4>{plan.name}</h4>
            <div className="plan-pricing">
              <span className="price">${plan.price}</span>
              <span className="period">/month</span>
            </div>
            <ul className="plan-features">
              {plan.features.map((f, i) => (
                <li key={i}>✓ {f}</li>
              ))}
            </ul>
            {plan.key === tenant?.plan ? (
              <span className="current-badge">Current Plan</span>
            ) : (
              <button className="btn-outline">
                {plans.indexOf(plan) > plans.findIndex(p => p.key === tenant?.plan) ? 'Upgrade' : 'Downgrade'}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Payment Method */}
      <div className="payment-section">
        <h4>Payment Method</h4>
        <div className="payment-card">
          <div className="card-icon">💳</div>
          <div className="card-details">
            <span className="card-number">•••• •••• •••• 4242</span>
            <span className="card-expiry">Expires 12/26</span>
          </div>
          <button className="btn-outline">Update</button>
        </div>
      </div>

      {/* Billing History */}
      <div className="billing-history">
        <h4>Billing History</h4>
        <p className="empty-text">No invoices yet</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATIONS SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

function IntegrationsSettings() {
  const integrations = [
    {
      id: 'quickbooks',
      name: 'QuickBooks Online',
      description: 'Sync invoices and customers',
      icon: 'QB',
      connected: true,
      connectedAs: 'Dalmex Recycling LLC'
    },
    {
      id: 'twilio',
      name: 'Twilio SMS',
      description: 'Send SMS receipts to drivers',
      icon: '📱',
      connected: false
    },
    {
      id: 'polycam',
      name: 'Polycam LiDAR',
      description: 'Volumetric waste measurement',
      icon: '📐',
      connected: false
    },
    {
      id: 'zapier',
      name: 'Zapier',
      description: 'Connect with 5000+ apps',
      icon: '⚡',
      connected: false
    }
  ];

  return (
    <div className="settings-panel">
      <h3>Integrations</h3>
      <p className="panel-subtitle">Connect DivertScan with your other tools</p>

      <div className="integrations-list">
        {integrations.map(integration => (
          <div key={integration.id} className="integration-card">
            <div className="integration-icon">{integration.icon}</div>
            <div className="integration-info">
              <span className="integration-name">{integration.name}</span>
              <span className="integration-desc">{integration.description}</span>
              {integration.connected && integration.connectedAs && (
                <span className="integration-status">
                  ✓ Connected as {integration.connectedAs}
                </span>
              )}
            </div>
            <button className={integration.connected ? 'btn-outline' : 'btn-primary'}>
              {integration.connected ? 'Manage' : 'Connect'}
            </button>
          </div>
        ))}
      </div>

      <div className="api-section">
        <h4>API Access</h4>
        <p>Use the DivertScan API to build custom integrations</p>
        <div className="api-key">
          <span className="key-value">••••••••••••••••••••••••••••</span>
          <button className="btn-outline">Reveal Key</button>
          <button className="btn-outline">Regenerate</button>
        </div>
        <a href="/docs/api" className="api-docs-link">View API Documentation →</a>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function getRoleDescription(role: string): string {
  const descriptions: Record<string, string> = {
    owner: 'Full access to all features including billing and danger zone actions',
    admin: 'Can manage team members, projects, and most settings',
    manager: 'Can manage projects and verify weight tickets',
    field_operator: 'Can create tickets and capture weights in the field',
    viewer: 'View-only access to dashboards and reports'
  };
  return descriptions[role] || 'Standard user access';
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const settingsStyles = `
  .settings-module {
    max-width: 1100px;
    margin: 0 auto;
  }

  .settings-layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 32px;
  }

  /* Navigation */
  .settings-nav {
    background: white;
    border-radius: 16px;
    padding: 24px;
    height: fit-content;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
  }

  .settings-nav h2 {
    font-size: 20px;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 20px;
  }

  .settings-nav ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .settings-nav button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border: none;
    background: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 500;
    color: #64748b;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .settings-nav button:hover {
    background: #f1f5f9;
  }

  .settings-nav button.active {
    background: rgba(26, 95, 42, 0.1);
    color: #1a5f2a;
  }

  .tab-icon {
    font-size: 18px;
  }

  /* Content Panel */
  .settings-panel {
    background: white;
    border-radius: 16px;
    padding: 32px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
  }

  .settings-panel h3 {
    font-size: 20px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 8px;
  }

  .panel-subtitle {
    color: #64748b;
    margin-bottom: 24px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
  }

  .panel-header h3 {
    margin-bottom: 4px;
  }

  /* Form Styles */
  .form-section {
    margin-bottom: 32px;
    padding-bottom: 32px;
    border-bottom: 1px solid #e2e8f0;
  }

  .form-section:last-of-type {
    border-bottom: none;
  }

  .form-section h4 {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 16px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 8px;
  }

  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    font-size: 15px;
    transition: border-color 0.15s ease;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: #1a5f2a;
  }

  .form-hint {
    font-size: 13px;
    color: #94a3b8;
    margin-top: 6px;
  }

  .form-actions {
    margin-top: 24px;
  }

  /* Buttons */
  .btn-primary {
    padding: 12px 24px;
    background: #1a5f2a;
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:disabled {
    background: #94a3b8;
    cursor: not-allowed;
  }

  .btn-secondary {
    padding: 12px 24px;
    background: #f1f5f9;
    color: #374151;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-outline {
    padding: 10px 20px;
    background: white;
    color: #374151;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  /* Message */
  .message {
    padding: 12px 16px;
    border-radius: 10px;
    margin-bottom: 20px;
    font-size: 14px;
  }

  .message.success {
    background: #dcfce7;
    color: #16a34a;
  }

  .message.error {
    background: #fef2f2;
    color: #dc2626;
  }

  /* Role Display */
  .role-display {
    background: #f8fafc;
    border-radius: 10px;
    padding: 16px;
  }

  .role-badge {
    display: inline-block;
    padding: 6px 14px;
    background: #1a5f2a;
    color: white;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    text-transform: capitalize;
  }

  .role-desc {
    margin-top: 12px;
    font-size: 14px;
    color: #64748b;
  }

  /* Danger Zone */
  .danger-zone {
    margin-top: 40px;
    padding: 24px;
    background: #fef2f2;
    border-radius: 12px;
    border: 1px solid #fecaca;
  }

  .danger-zone h4 {
    font-size: 16px;
    font-weight: 600;
    color: #dc2626;
    margin-bottom: 16px;
  }

  .danger-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid #fecaca;
  }

  .danger-item:last-child {
    border-bottom: none;
  }

  .danger-item strong {
    display: block;
    color: #1e293b;
    margin-bottom: 4px;
  }

  .danger-item p {
    font-size: 13px;
    color: #64748b;
    margin: 0;
  }

  /* Slug Display */
  .slug-display {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
  }

  .slug-prefix {
    color: #94a3b8;
  }

  .slug-value {
    color: #1e293b;
    font-weight: 500;
  }

  /* Team */
  .team-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 32px;
  }

  .team-member {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: #f8fafc;
    border-radius: 12px;
  }

  .member-avatar {
    width: 44px;
    height: 44px;
    background: #1a5f2a;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 18px;
  }

  .member-info {
    flex: 1;
  }

  .member-name {
    display: block;
    font-weight: 600;
    color: #1e293b;
  }

  .member-email {
    font-size: 13px;
    color: #64748b;
  }

  .member-role {
    padding: 4px 12px;
    background: white;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    color: #64748b;
  }

  .member-status {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
  }

  .member-status.active {
    background: #dcfce7;
    color: #16a34a;
  }

  .member-status.pending {
    background: #fef3c7;
    color: #92400e;
  }

  .member-remove {
    width: 32px;
    height: 32px;
    border: none;
    background: white;
    border-radius: 50%;
    cursor: pointer;
    color: #64748b;
  }

  .roles-info {
    margin-top: 32px;
    padding-top: 32px;
    border-top: 1px solid #e2e8f0;
  }

  .roles-info h4 {
    font-size: 14px;
    font-weight: 600;
    color: #64748b;
    margin-bottom: 16px;
  }

  .role-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .role-item {
    display: flex;
    gap: 12px;
    align-items: baseline;
  }

  .role-name {
    font-weight: 600;
    color: #1e293b;
    min-width: 120px;
  }

  .role-list .role-desc {
    font-size: 14px;
    color: #64748b;
    margin: 0;
  }

  /* Billing */
  .current-plan {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    background: linear-gradient(135deg, #1a5f2a, #2d8b47);
    border-radius: 12px;
    color: white;
    margin-bottom: 32px;
  }

  .plan-name {
    font-size: 18px;
    font-weight: 600;
  }

  .plan-price {
    font-size: 14px;
    opacity: 0.9;
  }

  .plans-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-bottom: 32px;
  }

  .plan-card {
    padding: 24px;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    text-align: center;
  }

  .plan-card.current {
    border-color: #1a5f2a;
    background: rgba(26, 95, 42, 0.02);
  }

  .plan-card h4 {
    font-size: 18px;
    color: #1e293b;
    margin-bottom: 8px;
  }

  .plan-pricing {
    margin-bottom: 20px;
  }

  .plan-pricing .price {
    font-size: 36px;
    font-weight: 700;
    color: #1e293b;
  }

  .plan-pricing .period {
    color: #64748b;
  }

  .plan-features {
    list-style: none;
    padding: 0;
    margin: 0 0 20px;
    text-align: left;
  }

  .plan-features li {
    padding: 6px 0;
    font-size: 14px;
    color: #64748b;
  }

  .current-badge {
    display: inline-block;
    padding: 8px 16px;
    background: #1a5f2a;
    color: white;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
  }

  .payment-section {
    margin-bottom: 32px;
  }

  .payment-section h4 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 16px;
  }

  .payment-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: #f8fafc;
    border-radius: 12px;
  }

  .card-icon {
    font-size: 32px;
  }

  .card-details {
    flex: 1;
  }

  .card-number {
    display: block;
    font-weight: 600;
    color: #1e293b;
    letter-spacing: 1px;
  }

  .card-expiry {
    font-size: 13px;
    color: #64748b;
  }

  .billing-history h4 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  .empty-text {
    color: #94a3b8;
    font-style: italic;
  }

  /* Integrations */
  .integrations-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 32px;
  }

  .integration-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px;
    background: #f8fafc;
    border-radius: 12px;
  }

  .integration-icon {
    width: 48px;
    height: 48px;
    background: white;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 700;
    color: #2563eb;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .integration-info {
    flex: 1;
  }

  .integration-name {
    display: block;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 2px;
  }

  .integration-desc {
    display: block;
    font-size: 14px;
    color: #64748b;
  }

  .integration-status {
    display: block;
    font-size: 13px;
    color: #16a34a;
    margin-top: 4px;
  }

  .api-section {
    padding: 24px;
    background: #f8fafc;
    border-radius: 12px;
  }

  .api-section h4 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .api-section > p {
    color: #64748b;
    margin-bottom: 16px;
  }

  .api-key {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 16px;
  }

  .key-value {
    flex: 1;
    padding: 10px 14px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-family: monospace;
    color: #64748b;
  }

  .api-docs-link {
    color: #1a5f2a;
    font-weight: 500;
    text-decoration: none;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
    padding: 20px;
  }

  .modal {
    background: white;
    border-radius: 16px;
    padding: 24px;
    width: 100%;
    max-width: 400px;
  }

  .modal h4 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 20px;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
  }

  .modal-actions button {
    flex: 1;
  }

  .loading {
    padding: 40px;
    text-align: center;
    color: #64748b;
  }

  @media (max-width: 900px) {
    .settings-layout {
      grid-template-columns: 1fr;
    }

    .settings-nav {
      display: flex;
      flex-direction: row;
      overflow-x: auto;
      gap: 8px;
      padding: 12px;
    }

    .settings-nav h2 {
      display: none;
    }

    .settings-nav ul {
      display: flex;
      gap: 8px;
    }

    .settings-nav button {
      white-space: nowrap;
    }

    .plans-grid {
      grid-template-columns: 1fr;
    }
  }
`;
