/**
 * DivertScan™ Apex Enterprise - Invoicing Module
 * QuickBooks Integration | Invoice Generation | Batch Processing
 * iPad Optimized
 */

import React, { useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface InvoicingProps {
  projectId: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  projectId: string;
  projectName: string;
  customerId: string;
  customerName: string;
  status: InvoiceStatus;
  createdAt: Date;
  dueDate: Date;
  subtotal: number;
  tax: number;
  total: number;
  lineItems: InvoiceLineItem[];
  ticketCount: number;
  qboInvoiceId?: string;
  qboDocNumber?: string;
  sentAt?: Date;
  paidAt?: Date;
}

interface InvoiceLineItem {
  id: string;
  description: string;
  materialType: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  ticketIds: string[];
}

interface UnbilledSummary {
  projectId: string;
  projectName: string;
  ticketCount: number;
  totalWeight: number;
  estimatedAmount: number;
  oldestTicketDate: Date;
  byMaterial: MaterialSummary[];
}

interface MaterialSummary {
  materialType: string;
  displayName: string;
  ticketCount: number;
  totalWeight: number;
  rate: number;
  estimatedAmount: number;
}

interface QBOConnection {
  isConnected: boolean;
  companyName?: string;
  realmId?: string;
  lastSyncAt?: Date;
}

type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'voided';
type ViewTab = 'unbilled' | 'invoices' | 'settings';

const MATERIAL_RATES: Record<string, number> = {
  concrete: 35,
  asphalt: 38,
  metal_ferrous: 45,
  metal_nonferrous: 85,
  wood_clean: 32,
  wood_treated: 42,
  cardboard: 28,
  paper: 30,
  plastic: 48,
  glass: 35,
  drywall: 38,
  roofing: 40,
  mixed_c_and_d: 52,
  other: 45
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function InvoicingModule({ projectId }: InvoicingProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>('unbilled');
  const [unbilledSummary, setUnbilledSummary] = useState<UnbilledSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [qboConnection, setQboConnection] = useState<QBOConnection>({ isConnected: false });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [unbilledRes, invoicesRes, qboRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/unbilled`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch(`/api/projects/${projectId}/invoices`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch('/api/integrations/quickbooks/status', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
      ]);

      if (unbilledRes.ok) setUnbilledSummary(await unbilledRes.json());
      if (invoicesRes.ok) setInvoices(await invoicesRes.json());
      if (qboRes.ok) setQboConnection(await qboRes.json());
    } catch (err) {
      console.error('Failed to load invoicing data');
    } finally {
      setLoading(false);
    }
  };

  const generateInvoice = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/invoices/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          syncToQuickBooks: qboConnection.isConnected
        })
      });

      if (response.ok) {
        await loadData();
        setActiveTab('invoices');
      }
    } catch (err) {
      console.error('Failed to generate invoice');
    } finally {
      setGenerating(false);
    }
  };

  const connectQuickBooks = async () => {
    // Redirect to OAuth flow
    window.location.href = '/api/integrations/quickbooks/connect';
  };

  const disconnectQuickBooks = async () => {
    if (!confirm('Disconnect QuickBooks? Existing synced invoices will remain.')) return;

    try {
      await fetch('/api/integrations/quickbooks/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      setQboConnection({ isConnected: false });
    } catch (err) {
      console.error('Failed to disconnect');
    }
  };

  if (loading) {
    return <InvoicingSkeleton />;
  }

  return (
    <div className="invoicing-module">
      <style>{invoicingStyles}</style>

      {/* Header */}
      <div className="inv-header">
        <h1>Invoicing</h1>
        <QuickBooksStatus 
          connection={qboConnection}
          onConnect={connectQuickBooks}
          onDisconnect={disconnectQuickBooks}
        />
      </div>

      {/* Tabs */}
      <div className="inv-tabs">
        <button 
          className={activeTab === 'unbilled' ? 'active' : ''}
          onClick={() => setActiveTab('unbilled')}
        >
          Unbilled Tickets
          {unbilledSummary && unbilledSummary.ticketCount > 0 && (
            <span className="tab-badge">{unbilledSummary.ticketCount}</span>
          )}
        </button>
        <button 
          className={activeTab === 'invoices' ? 'active' : ''}
          onClick={() => setActiveTab('invoices')}
        >
          Invoices
        </button>
        <button 
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          Rates & Settings
        </button>
      </div>

      {/* Tab Content */}
      <div className="inv-content">
        {activeTab === 'unbilled' && (
          <UnbilledTab 
            summary={unbilledSummary}
            generating={generating}
            qboConnected={qboConnection.isConnected}
            onGenerate={generateInvoice}
          />
        )}

        {activeTab === 'invoices' && (
          <InvoicesTab 
            invoices={invoices}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function QuickBooksStatus({ connection, onConnect, onDisconnect }: {
  connection: QBOConnection;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (connection.isConnected) {
    return (
      <div className="qbo-status connected">
        <div className="qbo-info">
          <span className="qbo-icon">✓</span>
          <div className="qbo-text">
            <span className="qbo-label">QuickBooks Online</span>
            <span className="qbo-company">{connection.companyName}</span>
          </div>
        </div>
        <button className="qbo-disconnect" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button className="qbo-connect" onClick={onConnect}>
      <span className="qbo-logo">QB</span>
      Connect QuickBooks
    </button>
  );
}

function UnbilledTab({ summary, generating, qboConnected, onGenerate }: {
  summary: UnbilledSummary | null;
  generating: boolean;
  qboConnected: boolean;
  onGenerate: () => void;
}) {
  if (!summary || summary.ticketCount === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon">📋</span>
        <h3>No Unbilled Tickets</h3>
        <p>All verified tickets have been invoiced</p>
      </div>
    );
  }

  return (
    <div className="unbilled-tab">
      {/* Summary Card */}
      <div className="summary-card">
        <div className="summary-header">
          <h3>{summary.projectName}</h3>
          <span className="ticket-count">{summary.ticketCount} tickets</span>
        </div>

        <div className="summary-stats">
          <div className="stat">
            <span className="stat-value">{formatWeight(summary.totalWeight)}</span>
            <span className="stat-label">Total Weight (tons)</span>
          </div>
          <div className="stat primary">
            <span className="stat-value">${formatNumber(summary.estimatedAmount)}</span>
            <span className="stat-label">Estimated Total</span>
          </div>
        </div>

        <div className="summary-date">
          Oldest ticket: {new Date(summary.oldestTicketDate).toLocaleDateString()}
        </div>
      </div>

      {/* Material Breakdown */}
      <div className="breakdown-card">
        <h4>Breakdown by Material</h4>
        <table className="breakdown-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Tickets</th>
              <th>Weight</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {summary.byMaterial.map(m => (
              <tr key={m.materialType}>
                <td>{m.displayName}</td>
                <td>{m.ticketCount}</td>
                <td>{formatWeight(m.totalWeight)} tons</td>
                <td>${m.rate}/ton</td>
                <td className="amount">${formatNumber(m.estimatedAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Subtotal</td>
              <td className="amount">${formatNumber(summary.estimatedAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Generate Button */}
      <div className="generate-section">
        <button 
          className="btn-primary generate-btn"
          onClick={onGenerate}
          disabled={generating}
        >
          {generating ? 'Generating...' : 'Generate Invoice'}
          {qboConnected && <span className="sync-note">+ Sync to QuickBooks</span>}
        </button>
      </div>
    </div>
  );
}

function InvoicesTab({ invoices, onRefresh }: {
  invoices: Invoice[];
  onRefresh: () => void;
}) {
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [filter, setFilter] = useState<InvoiceStatus | ''>('');

  const filteredInvoices = filter 
    ? invoices.filter(i => i.status === filter)
    : invoices;

  const sendInvoice = async (invoice: Invoice) => {
    if (!confirm(`Send invoice ${invoice.invoiceNumber} to ${invoice.customerName}?`)) return;

    try {
      await fetch(`/api/invoices/${invoice.id}/send`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to send invoice');
    }
  };

  const markPaid = async (invoice: Invoice) => {
    try {
      await fetch(`/api/invoices/${invoice.id}/mark-paid`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to mark as paid');
    }
  };

  if (invoices.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon">📄</span>
        <h3>No Invoices Yet</h3>
        <p>Generate your first invoice from unbilled tickets</p>
      </div>
    );
  }

  return (
    <div className="invoices-tab">
      {/* Filter */}
      <div className="invoices-filter">
        <select value={filter} onChange={e => setFilter(e.target.value as InvoiceStatus | '')}>
          <option value="">All Invoices</option>
          <option value="draft">Drafts</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
        <span className="filter-count">{filteredInvoices.length} invoices</span>
      </div>

      {/* Invoice List */}
      <div className="invoices-list">
        {filteredInvoices.map(invoice => (
          <div 
            key={invoice.id} 
            className={`invoice-row ${invoice.status}`}
            onClick={() => setSelectedInvoice(invoice)}
          >
            <div className="invoice-main">
              <span className="invoice-number">{invoice.invoiceNumber}</span>
              <span className="invoice-customer">{invoice.customerName}</span>
            </div>
            <div className="invoice-meta">
              <span className="invoice-date">
                {new Date(invoice.createdAt).toLocaleDateString()}
              </span>
              <span className="invoice-tickets">{invoice.ticketCount} tickets</span>
            </div>
            <div className="invoice-amount">
              ${formatNumber(invoice.total)}
            </div>
            <div className={`invoice-status ${invoice.status}`}>
              {getStatusLabel(invoice.status)}
            </div>
            <div className="invoice-actions">
              {invoice.status === 'draft' && (
                <button 
                  className="action-btn"
                  onClick={e => { e.stopPropagation(); sendInvoice(invoice); }}
                >
                  Send
                </button>
              )}
              {invoice.status === 'sent' && (
                <button 
                  className="action-btn"
                  onClick={e => { e.stopPropagation(); markPaid(invoice); }}
                >
                  Mark Paid
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onSend={() => sendInvoice(selectedInvoice)}
          onMarkPaid={() => markPaid(selectedInvoice)}
        />
      )}
    </div>
  );
}

function InvoiceDetailModal({ invoice, onClose, onSend, onMarkPaid }: {
  invoice: Invoice;
  onClose: () => void;
  onSend: () => void;
  onMarkPaid: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal invoice-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <h2>{invoice.invoiceNumber}</h2>
            <span className={`status-badge ${invoice.status}`}>
              {getStatusLabel(invoice.status)}
            </span>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="invoice-detail">
          <div className="detail-section">
            <div className="detail-row">
              <span className="detail-label">Customer</span>
              <span className="detail-value">{invoice.customerName}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Project</span>
              <span className="detail-value">{invoice.projectName}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Created</span>
              <span className="detail-value">
                {new Date(invoice.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Due Date</span>
              <span className="detail-value">
                {new Date(invoice.dueDate).toLocaleDateString()}
              </span>
            </div>
            {invoice.qboDocNumber && (
              <div className="detail-row">
                <span className="detail-label">QuickBooks</span>
                <span className="detail-value">#{invoice.qboDocNumber}</span>
              </div>
            )}
          </div>

          <div className="line-items-section">
            <h4>Line Items</h4>
            <table className="line-items-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map(item => (
                  <tr key={item.id}>
                    <td>
                      {item.description}
                      <span className="item-tickets">{item.ticketIds.length} tickets</span>
                    </td>
                    <td>{item.quantity.toFixed(2)} {item.unit}</td>
                    <td>${item.rate.toFixed(2)}</td>
                    <td>${formatNumber(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="totals-section">
            <div className="total-row">
              <span>Subtotal</span>
              <span>${formatNumber(invoice.subtotal)}</span>
            </div>
            {invoice.tax > 0 && (
              <div className="total-row">
                <span>Tax</span>
                <span>${formatNumber(invoice.tax)}</span>
              </div>
            )}
            <div className="total-row grand">
              <span>Total</span>
              <span>${formatNumber(invoice.total)}</span>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          {invoice.status === 'draft' && (
            <button className="btn-primary" onClick={onSend}>
              Send Invoice
            </button>
          )}
          {invoice.status === 'sent' && (
            <button className="btn-primary" onClick={onMarkPaid}>
              Mark as Paid
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsTab() {
  const [rates, setRates] = useState(MATERIAL_RATES);
  const [taxRate, setTaxRate] = useState(0);
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [saving, setSaving] = useState(false);

  const updateRate = (material: string, rate: number) => {
    setRates(prev => ({ ...prev, [material]: rate }));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch('/api/settings/invoicing', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ rates, taxRate, paymentTerms })
      });
    } catch (err) {
      console.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-tab">
      <div className="settings-section">
        <h3>Material Rates (per ton)</h3>
        <div className="rates-grid">
          {Object.entries(rates).map(([material, rate]) => (
            <div key={material} className="rate-input">
              <label>{formatMaterialName(material)}</label>
              <div className="rate-field">
                <span className="rate-prefix">$</span>
                <input
                  type="number"
                  value={rate}
                  onChange={e => updateRate(material, parseFloat(e.target.value) || 0)}
                  min={0}
                  step={0.01}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h3>Invoice Settings</h3>
        <div className="setting-row">
          <label>Tax Rate (%)</label>
          <input
            type="number"
            value={taxRate}
            onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
            min={0}
            max={100}
            step={0.1}
          />
        </div>
        <div className="setting-row">
          <label>Payment Terms (days)</label>
          <select
            value={paymentTerms}
            onChange={e => setPaymentTerms(parseInt(e.target.value))}
          >
            <option value={15}>Net 15</option>
            <option value={30}>Net 30</option>
            <option value={45}>Net 45</option>
            <option value={60}>Net 60</option>
          </select>
        </div>
      </div>

      <button 
        className="btn-primary save-btn"
        onClick={saveSettings}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}

function InvoicingSkeleton() {
  return (
    <div className="invoicing-module">
      <style>{invoicingStyles}</style>
      <div className="skeleton-header" />
      <div className="skeleton-tabs" />
      <div className="skeleton-content" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function formatWeight(value: number): string {
  return value.toFixed(2);
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMaterialName(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace('C And D', 'C&D');
}

function getStatusLabel(status: InvoiceStatus): string {
  const labels: Record<InvoiceStatus, string> = {
    draft: 'Draft',
    sent: 'Sent',
    viewed: 'Viewed',
    paid: 'Paid',
    overdue: 'Overdue',
    voided: 'Voided'
  };
  return labels[status];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const invoicingStyles = `
  .invoicing-module {
    max-width: 1000px;
    margin: 0 auto;
  }

  .inv-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .inv-header h1 {
    font-size: 24px;
    font-weight: 700;
    color: #1e293b;
  }

  /* QuickBooks Status */
  .qbo-status {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    background: #f0fdf4;
    border: 1px solid #86efac;
    border-radius: 10px;
  }

  .qbo-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .qbo-icon {
    width: 24px;
    height: 24px;
    background: #22c55e;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
  }

  .qbo-text {
    display: flex;
    flex-direction: column;
  }

  .qbo-label {
    font-size: 12px;
    color: #64748b;
  }

  .qbo-company {
    font-size: 14px;
    font-weight: 600;
    color: #1e293b;
  }

  .qbo-disconnect {
    padding: 6px 12px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
  }

  .qbo-connect {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 20px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .qbo-logo {
    width: 24px;
    height: 24px;
    background: white;
    color: #2563eb;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 800;
  }

  /* Tabs */
  .inv-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 8px;
  }

  .inv-tabs button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: none;
    border: none;
    font-size: 15px;
    font-weight: 500;
    color: #64748b;
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.15s ease;
  }

  .inv-tabs button:hover {
    background: #f1f5f9;
  }

  .inv-tabs button.active {
    background: #1a5f2a;
    color: white;
  }

  .tab-badge {
    padding: 2px 8px;
    background: #f59e0b;
    color: white;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
  }

  .inv-tabs button.active .tab-badge {
    background: rgba(255,255,255,0.3);
  }

  /* Summary Card */
  .summary-card {
    background: white;
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
  }

  .summary-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .summary-header h3 {
    font-size: 18px;
    font-weight: 600;
    color: #1e293b;
  }

  .ticket-count {
    padding: 6px 12px;
    background: #f1f5f9;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    color: #64748b;
  }

  .summary-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 16px;
  }

  .stat {
    text-align: center;
    padding: 20px;
    background: #f8fafc;
    border-radius: 12px;
  }

  .stat.primary {
    background: linear-gradient(135deg, #1a5f2a, #2d8b47);
    color: white;
  }

  .stat-value {
    display: block;
    font-size: 32px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .stat-label {
    font-size: 13px;
    opacity: 0.7;
  }

  .summary-date {
    font-size: 13px;
    color: #94a3b8;
    text-align: center;
  }

  /* Breakdown Card */
  .breakdown-card {
    background: white;
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
  }

  .breakdown-card h4 {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 16px;
  }

  .breakdown-table {
    width: 100%;
    border-collapse: collapse;
  }

  .breakdown-table th,
  .breakdown-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }

  .breakdown-table th {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    color: #64748b;
    background: #f8fafc;
  }

  .breakdown-table td.amount {
    font-weight: 600;
    color: #1e293b;
  }

  .breakdown-table tfoot td {
    font-weight: 600;
    background: #f8fafc;
  }

  /* Generate Section */
  .generate-section {
    text-align: center;
  }

  .generate-btn {
    padding: 16px 32px;
    font-size: 16px;
    display: inline-flex;
    flex-direction: column;
    gap: 4px;
  }

  .sync-note {
    font-size: 12px;
    font-weight: 400;
    opacity: 0.8;
  }

  /* Invoices Tab */
  .invoices-filter {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .invoices-filter select {
    padding: 10px 16px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 14px;
  }

  .filter-count {
    font-size: 14px;
    color: #64748b;
  }

  .invoices-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .invoice-row {
    display: grid;
    grid-template-columns: 2fr 1fr 100px 80px 80px;
    align-items: center;
    gap: 16px;
    padding: 16px 20px;
    background: white;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .invoice-row:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  .invoice-number {
    font-weight: 600;
    color: #1e293b;
  }

  .invoice-customer {
    font-size: 14px;
    color: #64748b;
    margin-left: 8px;
  }

  .invoice-meta {
    display: flex;
    gap: 16px;
    font-size: 13px;
    color: #94a3b8;
  }

  .invoice-amount {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
  }

  .invoice-status {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
  }

  .invoice-status.draft { background: #f1f5f9; color: #64748b; }
  .invoice-status.sent { background: #dbeafe; color: #2563eb; }
  .invoice-status.paid { background: #dcfce7; color: #16a34a; }
  .invoice-status.overdue { background: #fef2f2; color: #dc2626; }

  .action-btn {
    padding: 6px 12px;
    background: #1a5f2a;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  /* Invoice Modal */
  .invoice-modal {
    max-width: 600px;
  }

  .modal-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .status-badge {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
  }

  .invoice-detail {
    padding: 24px;
  }

  .detail-section {
    margin-bottom: 24px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #f1f5f9;
  }

  .detail-label {
    color: #64748b;
    font-size: 14px;
  }

  .detail-value {
    font-weight: 500;
    color: #1e293b;
    font-size: 14px;
  }

  .line-items-section {
    margin-bottom: 24px;
  }

  .line-items-section h4 {
    font-size: 14px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 12px;
  }

  .line-items-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .line-items-table th,
  .line-items-table td {
    padding: 10px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }

  .line-items-table th {
    background: #f8fafc;
    font-weight: 600;
    color: #64748b;
  }

  .item-tickets {
    display: block;
    font-size: 11px;
    color: #94a3b8;
  }

  .totals-section {
    background: #f8fafc;
    border-radius: 8px;
    padding: 16px;
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    font-size: 14px;
  }

  .total-row.grand {
    font-size: 18px;
    font-weight: 700;
    border-top: 1px solid #e2e8f0;
    margin-top: 8px;
    padding-top: 12px;
  }

  /* Settings Tab */
  .settings-section {
    background: white;
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 24px;
  }

  .settings-section h3 {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 16px;
  }

  .rates-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
  }

  .rate-input label {
    display: block;
    font-size: 13px;
    color: #64748b;
    margin-bottom: 6px;
  }

  .rate-field {
    display: flex;
    align-items: center;
  }

  .rate-prefix {
    padding: 10px 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-right: none;
    border-radius: 8px 0 0 8px;
    color: #64748b;
  }

  .rate-field input {
    flex: 1;
    padding: 10px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 0 8px 8px 0;
    font-size: 14px;
    width: 80px;
  }

  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid #f1f5f9;
  }

  .setting-row label {
    font-size: 14px;
    color: #374151;
  }

  .setting-row input,
  .setting-row select {
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 14px;
    width: 120px;
  }

  .save-btn {
    width: 100%;
    padding: 14px;
  }

  /* Empty State */
  .empty-state {
    text-align: center;
    padding: 64px 32px;
    background: white;
    border-radius: 16px;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    display: block;
  }

  .empty-state h3 {
    font-size: 18px;
    color: #1e293b;
    margin-bottom: 8px;
  }

  .empty-state p {
    color: #64748b;
  }

  /* Common */
  .btn-primary {
    padding: 12px 20px;
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
    padding: 12px 20px;
    background: #f1f5f9;
    color: #374151;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

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
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    padding: 24px;
    border-bottom: 1px solid #e2e8f0;
    position: relative;
  }

  .modal-header h2 {
    font-size: 20px;
    font-weight: 600;
    color: #1e293b;
  }

  .close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 32px;
    height: 32px;
    border: none;
    background: #e2e8f0;
    border-radius: 50%;
    cursor: pointer;
    font-size: 14px;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    padding: 24px;
    border-top: 1px solid #e2e8f0;
  }

  .modal-actions button {
    flex: 1;
  }

  /* Skeleton */
  .skeleton-header {
    height: 48px;
    background: #e2e8f0;
    border-radius: 8px;
    margin-bottom: 24px;
  }

  .skeleton-tabs {
    height: 48px;
    background: #e2e8f0;
    border-radius: 8px;
    margin-bottom: 24px;
  }

  .skeleton-content {
    height: 400px;
    background: #e2e8f0;
    border-radius: 16px;
    animation: pulse 1.5s ease infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @media (max-width: 768px) {
    .invoice-row {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .summary-stats {
      grid-template-columns: 1fr;
    }

    .rates-grid {
      grid-template-columns: 1fr;
    }
  }
`;
