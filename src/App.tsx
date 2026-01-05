/**
 * DivertScan™ Apex Enterprise - Main Application v3.0
 * iPad-Optimized Dashboard | Production Build
 */

import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// LAZY LOADED COMPONENTS (iPad Memory Optimization)
// ═══════════════════════════════════════════════════════════════════════════════

const LiveLoadModule = lazy(() => import('./modules/LiveLoadModule'));
const AnalyticsDashboard = lazy(() => import('./modules/AnalyticsDashboard'));
const CSVImportModule = lazy(() => import('./modules/CSVImportModule'));
const FacilityVaultModule = lazy(() => import('./modules/FacilityVaultModule'));
const InvoicingModule = lazy(() => import('./modules/InvoicingModule'));
const SettingsModule = lazy(() => import('./modules/SettingsModule'));

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type View = 'dashboard' | 'live_load' | 'tickets' | 'import' | 'facilities' | 'invoicing' | 'settings';

interface AppState {
  isAuthenticated: boolean;
  currentView: View;
  selectedProjectId: string | null;
  syncStatus: SyncStatus;
  notifications: Notification[];
}

interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  syncInProgress: boolean;
}

interface Notification {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APPLICATION
// ═══════════════════════════════════════════════════════════════════════════════

export default function DivertScanApp() {
  const [state, setState] = useState<AppState>({
    isAuthenticated: false,
    currentView: 'dashboard',
    selectedProjectId: null,
    syncStatus: {
      isOnline: navigator.onLine,
      pendingCount: 0,
      lastSyncAt: null,
      syncInProgress: false
    },
    notifications: []
  });

  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    initializeApp();
    
    const handleOnline = () => updateSyncStatus({ isOnline: true });
    const handleOffline = () => updateSyncStatus({ isOnline: false });
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const initializeApp = async () => {
    // Check for existing auth session
    const storedAuth = localStorage.getItem('divertscan_auth');
    if (storedAuth) {
      try {
        const { user, tenant } = JSON.parse(storedAuth);
        setUser(user);
        setTenant(tenant);
        setState(s => ({ ...s, isAuthenticated: true }));
        await loadProjects();
      } catch {
        localStorage.removeItem('divertscan_auth');
      }
    }
  };

  const loadProjects = async () => {
    try {
      const response = await fetch('/api/projects', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
        if (data.length > 0 && !state.selectedProjectId) {
          setCurrentProject(data[0]);
          setState(s => ({ ...s, selectedProjectId: data[0].id }));
        }
      }
    } catch (error) {
      addNotification('error', 'Failed to load projects');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────

  const updateSyncStatus = (updates: Partial<SyncStatus>) => {
    setState(s => ({
      ...s,
      syncStatus: { ...s.syncStatus, ...updates }
    }));
  };

  const addNotification = (type: Notification['type'], message: string) => {
    const notification: Notification = {
      id: crypto.randomUUID(),
      type,
      message,
      timestamp: new Date()
    };
    setState(s => ({
      ...s,
      notifications: [notification, ...s.notifications].slice(0, 10)
    }));

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setState(s => ({
        ...s,
        notifications: s.notifications.filter(n => n.id !== notification.id)
      }));
    }, 5000);
  };

  const setView = (view: View) => {
    setState(s => ({ ...s, currentView: view }));
  };

  const selectProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setCurrentProject(project);
      setState(s => ({ ...s, selectedProjectId: projectId }));
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  if (!state.isAuthenticated) {
    return <LoginScreen onSuccess={(u, t) => {
      setUser(u);
      setTenant(t);
      setState(s => ({ ...s, isAuthenticated: true }));
      loadProjects();
    }} />;
  }

  return (
    <div className="ds-app">
      <style>{globalStyles}</style>
      
      {/* Header */}
      <Header 
        user={user}
        tenant={tenant}
        syncStatus={state.syncStatus}
        onMenuToggle={() => {}}
      />

      {/* Main Layout */}
      <div className="ds-layout">
        {/* Sidebar Navigation */}
        <Sidebar 
          currentView={state.currentView}
          onNavigate={setView}
          projects={projects}
          selectedProjectId={state.selectedProjectId}
          onSelectProject={selectProject}
        />

        {/* Main Content */}
        <main className="ds-main">
          {/* Project Selector Bar */}
          <ProjectBar 
            project={currentProject}
            projects={projects}
            onSelect={selectProject}
          />

          {/* Content Area */}
          <div className="ds-content">
            <Suspense fallback={<LoadingSpinner />}>
              {state.currentView === 'dashboard' && currentProject && (
                <AnalyticsDashboard projectId={currentProject.id} />
              )}
              {state.currentView === 'live_load' && currentProject && (
                <LiveLoadModule 
                  projectId={currentProject.id}
                  onComplete={() => addNotification('success', 'Ticket created successfully')}
                />
              )}
              {state.currentView === 'import' && currentProject && (
                <CSVImportModule 
                  projectId={currentProject.id}
                  onComplete={(count) => addNotification('success', `Imported ${count} tickets`)}
                />
              )}
              {state.currentView === 'facilities' && (
                <FacilityVaultModule />
              )}
              {state.currentView === 'invoicing' && currentProject && (
                <InvoicingModule projectId={currentProject.id} />
              )}
              {state.currentView === 'settings' && (
                <SettingsModule tenant={tenant} user={user} />
              )}
            </Suspense>
          </div>
        </main>
      </div>

      {/* Notifications */}
      <NotificationStack notifications={state.notifications} />

      {/* Offline Indicator */}
      {!state.syncStatus.isOnline && <OfflineBanner />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function LoginScreen({ onSuccess }: { onSuccess: (user: User, tenant: Tenant) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        throw new Error('Invalid credentials');
      }

      const { user, tenant, token } = await response.json();
      localStorage.setItem('token', token);
      localStorage.setItem('divertscan_auth', JSON.stringify({ user, tenant }));
      onSuccess(user, tenant);
    } catch (err) {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ds-login">
      <div className="ds-login-card">
        <div className="ds-login-logo">
          <svg viewBox="0 0 48 48" className="ds-logo-icon">
            <circle cx="24" cy="24" r="22" fill="#1a5f2a"/>
            <path d="M16 24l6 6 12-12" stroke="white" strokeWidth="3" fill="none"/>
          </svg>
          <h1>DivertScan™</h1>
          <p>Apex Enterprise SaaS</p>
        </div>

        <form onSubmit={handleSubmit} className="ds-login-form">
          {error && <div className="ds-error">{error}</div>}
          
          <div className="ds-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="ds-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="ds-btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="ds-login-footer">
          <a href="/signup">Create Account</a>
          <span>•</span>
          <a href="/forgot-password">Forgot Password?</a>
        </div>
      </div>
    </div>
  );
}

function Header({ user, tenant, syncStatus, onMenuToggle }: {
  user: User | null;
  tenant: Tenant | null;
  syncStatus: SyncStatus;
  onMenuToggle: () => void;
}) {
  return (
    <header className="ds-header">
      <div className="ds-header-left">
        <button className="ds-menu-btn" onClick={onMenuToggle}>
          <MenuIcon />
        </button>
        <div className="ds-brand">
          <span className="ds-brand-mark">DS</span>
          <span className="ds-brand-text">DivertScan™</span>
        </div>
      </div>

      <div className="ds-header-center">
        {tenant && <span className="ds-tenant-name">{tenant.name}</span>}
      </div>

      <div className="ds-header-right">
        <SyncIndicator status={syncStatus} />
        <div className="ds-user-menu">
          <div className="ds-avatar">{user?.name?.[0] || 'U'}</div>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ currentView, onNavigate, projects, selectedProjectId, onSelectProject }: {
  currentView: View;
  onNavigate: (view: View) => void;
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
}) {
  const navItems: { view: View; label: string; icon: React.ReactNode }[] = [
    { view: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
    { view: 'live_load', label: 'Live Load', icon: <TruckIcon /> },
    { view: 'import', label: 'Import CSV', icon: <UploadIcon /> },
    { view: 'facilities', label: 'Facilities', icon: <BuildingIcon /> },
    { view: 'invoicing', label: 'Invoicing', icon: <InvoiceIcon /> },
    { view: 'settings', label: 'Settings', icon: <SettingsIcon /> }
  ];

  return (
    <aside className="ds-sidebar">
      <nav className="ds-nav">
        {navItems.map(item => (
          <button
            key={item.view}
            className={`ds-nav-item ${currentView === item.view ? 'active' : ''}`}
            onClick={() => onNavigate(item.view)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="ds-sidebar-projects">
        <h3>Projects</h3>
        <div className="ds-project-list">
          {projects.map(project => (
            <button
              key={project.id}
              className={`ds-project-item ${selectedProjectId === project.id ? 'active' : ''}`}
              onClick={() => onSelectProject(project.id)}
            >
              <span className="ds-project-name">{project.name}</span>
              <span className={`ds-project-status ${project.status}`}>
                {project.status}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function ProjectBar({ project, projects, onSelect }: {
  project: Project | null;
  projects: Project[];
  onSelect: (id: string) => void;
}) {
  if (!project) return null;

  return (
    <div className="ds-project-bar">
      <select 
        value={project.id} 
        onChange={e => onSelect(e.target.value)}
        className="ds-project-select"
      >
        {projects.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      
      <div className="ds-project-meta">
        <span className="ds-leed-badge">LEED {project.leedCertification}</span>
        <span className="ds-target">Target: {project.targetDiversion}%</span>
      </div>
    </div>
  );
}

function SyncIndicator({ status }: { status: SyncStatus }) {
  return (
    <div className={`ds-sync ${status.isOnline ? 'online' : 'offline'}`}>
      {status.syncInProgress ? (
        <span className="ds-sync-spinner" />
      ) : (
        <span className={`ds-sync-dot ${status.isOnline ? 'green' : 'red'}`} />
      )}
      {status.pendingCount > 0 && (
        <span className="ds-sync-count">{status.pendingCount}</span>
      )}
    </div>
  );
}

function NotificationStack({ notifications }: { notifications: Notification[] }) {
  return (
    <div className="ds-notifications">
      {notifications.map(n => (
        <div key={n.id} className={`ds-notification ${n.type}`}>
          {n.message}
        </div>
      ))}
    </div>
  );
}

function OfflineBanner() {
  return (
    <div className="ds-offline-banner">
      <span>📴 You're offline. Changes will sync when connected.</span>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="ds-loading">
      <div className="ds-spinner" />
      <span>Loading...</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════════

function MenuIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>;
}

function DashboardIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>;
}

function TruckIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>;
}

function UploadIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>;
}

function BuildingIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/></svg>;
}

function InvoiceIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES (SIMPLIFIED)
// ═══════════════════════════════════════════════════════════════════════════════

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface Project {
  id: string;
  name: string;
  status: 'active' | 'closed' | 'pending';
  leedCertification: 'v4' | 'v4.1' | 'v5';
  targetDiversion: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL STYLES (iPad Optimized)
// ═══════════════════════════════════════════════════════════════════════════════

const globalStyles = `
  :root {
    --ds-primary: #1a5f2a;
    --ds-primary-dark: #134420;
    --ds-primary-light: #2d8b47;
    --ds-accent: #f59e0b;
    --ds-bg: #f8fafc;
    --ds-surface: #ffffff;
    --ds-text: #1e293b;
    --ds-text-muted: #64748b;
    --ds-border: #e2e8f0;
    --ds-success: #10b981;
    --ds-warning: #f59e0b;
    --ds-error: #ef4444;
    --ds-info: #3b82f6;
    --ds-radius: 12px;
    --ds-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    --ds-shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1);
    --ds-header-height: 64px;
    --ds-sidebar-width: 260px;
    
    /* iPad Touch Targets */
    --ds-touch-min: 44px;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;
  }

  html, body, #root {
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
    background: var(--ds-bg);
    color: var(--ds-text);
    font-size: 16px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  /* App Container */
  .ds-app {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .ds-header {
    height: var(--ds-header-height);
    background: var(--ds-surface);
    border-bottom: 1px solid var(--ds-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    flex-shrink: 0;
    z-index: 100;
  }

  .ds-header-left,
  .ds-header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .ds-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .ds-brand-mark {
    width: 36px;
    height: 36px;
    background: var(--ds-primary);
    color: white;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
  }

  .ds-brand-text {
    font-weight: 600;
    font-size: 18px;
    color: var(--ds-primary);
  }

  .ds-tenant-name {
    font-weight: 500;
    color: var(--ds-text-muted);
  }

  .ds-menu-btn {
    width: var(--ds-touch-min);
    height: var(--ds-touch-min);
    border: none;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--ds-text);
  }

  .ds-menu-btn:hover {
    background: var(--ds-bg);
  }

  .ds-menu-btn svg {
    width: 24px;
    height: 24px;
  }

  /* Layout */
  .ds-layout {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* Sidebar */
  .ds-sidebar {
    width: var(--ds-sidebar-width);
    background: var(--ds-surface);
    border-right: 1px solid var(--ds-border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow-y: auto;
  }

  .ds-nav {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ds-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: var(--ds-radius);
    color: var(--ds-text-muted);
    font-size: 15px;
    font-weight: 500;
    min-height: var(--ds-touch-min);
    text-align: left;
    transition: all 0.15s ease;
  }

  .ds-nav-item svg {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }

  .ds-nav-item:hover {
    background: var(--ds-bg);
    color: var(--ds-text);
  }

  .ds-nav-item.active {
    background: rgba(26, 95, 42, 0.1);
    color: var(--ds-primary);
  }

  .ds-sidebar-projects {
    flex: 1;
    padding: 16px;
    border-top: 1px solid var(--ds-border);
    overflow-y: auto;
  }

  .ds-sidebar-projects h3 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ds-text-muted);
    margin-bottom: 12px;
  }

  .ds-project-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ds-project-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 8px;
    text-align: left;
    min-height: var(--ds-touch-min);
  }

  .ds-project-item:hover {
    background: var(--ds-bg);
  }

  .ds-project-item.active {
    background: rgba(26, 95, 42, 0.1);
  }

  .ds-project-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--ds-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ds-project-status {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--ds-bg);
    color: var(--ds-text-muted);
  }

  .ds-project-status.active {
    background: rgba(16, 185, 129, 0.1);
    color: var(--ds-success);
  }

  /* Main Content */
  .ds-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .ds-project-bar {
    height: 56px;
    background: var(--ds-surface);
    border-bottom: 1px solid var(--ds-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    flex-shrink: 0;
  }

  .ds-project-select {
    font-size: 16px;
    font-weight: 600;
    border: none;
    background: none;
    color: var(--ds-text);
    cursor: pointer;
    padding: 8px 0;
  }

  .ds-project-meta {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .ds-leed-badge {
    background: var(--ds-primary);
    color: white;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 6px;
  }

  .ds-target {
    font-size: 14px;
    color: var(--ds-text-muted);
  }

  .ds-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    -webkit-overflow-scrolling: touch;
  }

  /* Sync Indicator */
  .ds-sync {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ds-sync-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .ds-sync-dot.green {
    background: var(--ds-success);
  }

  .ds-sync-dot.red {
    background: var(--ds-error);
  }

  .ds-sync-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--ds-border);
    border-top-color: var(--ds-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .ds-sync-count {
    background: var(--ds-warning);
    color: white;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 10px;
  }

  /* Avatar */
  .ds-avatar {
    width: 36px;
    height: 36px;
    background: var(--ds-primary);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
  }

  /* Notifications */
  .ds-notifications {
    position: fixed;
    top: calc(var(--ds-header-height) + 16px);
    right: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 1000;
    pointer-events: none;
  }

  .ds-notification {
    padding: 14px 20px;
    border-radius: var(--ds-radius);
    background: var(--ds-surface);
    box-shadow: var(--ds-shadow-lg);
    font-size: 14px;
    font-weight: 500;
    animation: slideIn 0.3s ease;
    pointer-events: auto;
  }

  .ds-notification.success {
    border-left: 4px solid var(--ds-success);
  }

  .ds-notification.error {
    border-left: 4px solid var(--ds-error);
  }

  .ds-notification.warning {
    border-left: 4px solid var(--ds-warning);
  }

  .ds-notification.info {
    border-left: 4px solid var(--ds-info);
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* Offline Banner */
  .ds-offline-banner {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--ds-warning);
    color: white;
    padding: 12px 20px;
    text-align: center;
    font-weight: 500;
    z-index: 1000;
  }

  /* Loading Spinner */
  .ds-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    gap: 16px;
  }

  .ds-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--ds-border);
    border-top-color: var(--ds-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  /* Login Screen */
  .ds-login {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--ds-primary) 0%, var(--ds-primary-dark) 100%);
    padding: 20px;
  }

  .ds-login-card {
    width: 100%;
    max-width: 400px;
    background: var(--ds-surface);
    border-radius: 16px;
    padding: 40px;
    box-shadow: var(--ds-shadow-lg);
  }

  .ds-login-logo {
    text-align: center;
    margin-bottom: 32px;
  }

  .ds-logo-icon {
    width: 64px;
    height: 64px;
    margin-bottom: 16px;
  }

  .ds-login-logo h1 {
    font-size: 24px;
    color: var(--ds-primary);
    margin-bottom: 4px;
  }

  .ds-login-logo p {
    color: var(--ds-text-muted);
    font-size: 14px;
  }

  .ds-login-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .ds-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ds-field label {
    font-size: 14px;
    font-weight: 500;
    color: var(--ds-text);
  }

  .ds-field input {
    padding: 14px 16px;
    border: 1px solid var(--ds-border);
    border-radius: var(--ds-radius);
    font-size: 16px;
    transition: border-color 0.15s ease;
  }

  .ds-field input:focus {
    outline: none;
    border-color: var(--ds-primary);
  }

  .ds-btn-primary {
    padding: 16px 24px;
    background: var(--ds-primary);
    color: white;
    border: none;
    border-radius: var(--ds-radius);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
    min-height: var(--ds-touch-min);
  }

  .ds-btn-primary:hover {
    background: var(--ds-primary-dark);
  }

  .ds-btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .ds-error {
    background: rgba(239, 68, 68, 0.1);
    color: var(--ds-error);
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
  }

  .ds-login-footer {
    margin-top: 24px;
    text-align: center;
    font-size: 14px;
    color: var(--ds-text-muted);
  }

  .ds-login-footer a {
    color: var(--ds-primary);
    text-decoration: none;
  }

  .ds-login-footer span {
    margin: 0 8px;
  }

  /* iPad Responsive */
  @media (max-width: 1024px) {
    .ds-sidebar {
      position: fixed;
      left: -100%;
      top: var(--ds-header-height);
      bottom: 0;
      z-index: 90;
      transition: left 0.3s ease;
    }

    .ds-sidebar.open {
      left: 0;
    }
  }

  @media (max-width: 768px) {
    :root {
      --ds-sidebar-width: 100%;
    }

    .ds-header {
      padding: 0 16px;
    }

    .ds-content {
      padding: 16px;
    }

    .ds-project-bar {
      padding: 0 16px;
      flex-direction: column;
      height: auto;
      padding: 12px 16px;
      gap: 8px;
      align-items: flex-start;
    }
  }
`;
