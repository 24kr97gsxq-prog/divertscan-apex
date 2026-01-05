/**
 * DivertScan™ Apex Enterprise - Digital Receipt Page
 * Public receipt view for SMS links
 * /receipt/{ticketId}
 */

import React, { useState, useEffect } from 'react';

interface ReceiptData {
  ticketNumber: string;
  date: string;
  projectName: string;
  grossWeight: number;
  tareWeight: number;
  netWeight: number;
  weightUnit: string;
  materialType: string;
  destination: string;
  facilityName: string;
  truckPlate: string;
  driverName: string;
  driverSignature?: string;
  photos?: { url: string; type: string }[];
  companyName: string;
  companyLogo?: string;
}

const MATERIAL_LABELS: Record<string, string> = {
  concrete: 'Concrete',
  asphalt: 'Asphalt',
  metal_ferrous: 'Metal (Ferrous)',
  metal_nonferrous: 'Metal (Non-Ferrous)',
  wood_clean: 'Clean Wood',
  cardboard: 'Cardboard/OCC',
  drywall: 'Drywall',
  mixed_c_and_d: 'Mixed C&D',
  other: 'Other'
};

const DESTINATION_LABELS: Record<string, { label: string; color: string }> = {
  recycling: { label: 'Recycled ♻️', color: '#10b981' },
  donation: { label: 'Donated 🎁', color: '#8b5cf6' },
  salvage: { label: 'Salvaged 🔧', color: '#f59e0b' },
  landfill: { label: 'Landfill', color: '#64748b' }
};

export default function ReceiptPage() {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get ticket ID from URL
  const ticketId = window.location.pathname.split('/').pop();

  useEffect(() => {
    loadReceipt();
  }, [ticketId]);

  const loadReceipt = async () => {
    try {
      const response = await fetch(`/api/receipts/${ticketId}`);
      if (!response.ok) {
        throw new Error('Receipt not found');
      }
      const data = await response.json();
      setReceipt(data);
    } catch (err) {
      setError('Unable to load receipt. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="receipt-page loading">
        <style>{receiptStyles}</style>
        <div className="loading-spinner" />
        <p>Loading receipt...</p>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="receipt-page error">
        <style>{receiptStyles}</style>
        <div className="error-icon">⚠️</div>
        <h1>Receipt Not Found</h1>
        <p>{error || 'This receipt is no longer available.'}</p>
      </div>
    );
  }

  const destInfo = DESTINATION_LABELS[receipt.destination] || DESTINATION_LABELS.landfill;
  const isDiverted = receipt.destination !== 'landfill';

  return (
    <div className="receipt-page">
      <style>{receiptStyles}</style>

      {/* Header */}
      <header className="receipt-header">
        {receipt.companyLogo ? (
          <img src={receipt.companyLogo} alt={receipt.companyName} className="company-logo" />
        ) : (
          <div className="company-name">{receipt.companyName}</div>
        )}
        <div className="receipt-badge">Digital Receipt</div>
      </header>

      {/* Ticket Info */}
      <section className="ticket-info">
        <div className="ticket-number">#{receipt.ticketNumber}</div>
        <div className="ticket-date">
          {new Date(receipt.date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </div>
        <div className="project-name">{receipt.projectName}</div>
      </section>

      {/* Diversion Status */}
      <section className={`diversion-status ${isDiverted ? 'diverted' : 'landfill'}`}>
        <div className="status-icon">{isDiverted ? '✓' : '•'}</div>
        <div className="status-text">
          <span className="destination" style={{ color: destInfo.color }}>
            {destInfo.label}
          </span>
          <span className="facility">at {receipt.facilityName}</span>
        </div>
      </section>

      {/* Weight Card */}
      <section className="weight-card">
        <h3>Weight Summary</h3>
        <div className="weight-grid">
          <div className="weight-item">
            <span className="label">Gross</span>
            <span className="value">{formatWeight(receipt.grossWeight)} {receipt.weightUnit}</span>
          </div>
          <div className="weight-item">
            <span className="label">Tare</span>
            <span className="value">{formatWeight(receipt.tareWeight)} {receipt.weightUnit}</span>
          </div>
          <div className="weight-item net">
            <span className="label">Net</span>
            <span className="value">{formatWeight(receipt.netWeight)} {receipt.weightUnit}</span>
          </div>
        </div>
        <div className="material-badge">
          {MATERIAL_LABELS[receipt.materialType] || receipt.materialType}
        </div>
      </section>

      {/* Vehicle Info */}
      <section className="info-section">
        <h3>Vehicle Information</h3>
        <div className="info-row">
          <span className="label">Truck/Plate</span>
          <span className="value">{receipt.truckPlate}</span>
        </div>
        <div className="info-row">
          <span className="label">Driver</span>
          <span className="value">{receipt.driverName}</span>
        </div>
      </section>

      {/* Signature */}
      {receipt.driverSignature && (
        <section className="signature-section">
          <h3>Driver Signature</h3>
          <img 
            src={receipt.driverSignature} 
            alt="Driver Signature" 
            className="signature-image"
          />
        </section>
      )}

      {/* Photos */}
      {receipt.photos && receipt.photos.length > 0 && (
        <section className="photos-section">
          <h3>Load Photos</h3>
          <div className="photos-grid">
            {receipt.photos.map((photo, idx) => (
              <div key={idx} className="photo-item">
                <img src={photo.url} alt={`Load photo ${idx + 1}`} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="receipt-footer">
        <div className="powered-by">
          Powered by <strong>DivertScan™</strong>
        </div>
        <p className="legal">
          This digital receipt is an official record of the weight transaction.
          Keep for your records.
        </p>
        <button className="print-btn" onClick={() => window.print()}>
          🖨️ Print Receipt
        </button>
      </footer>
    </div>
  );
}

function formatWeight(weight: number): string {
  return weight.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

const receiptStyles = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    background: #f1f5f9;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .receipt-page {
    max-width: 500px;
    margin: 0 auto;
    padding: 16px;
    min-height: 100vh;
  }

  .receipt-page.loading,
  .receipt-page.error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .loading-spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e2e8f0;
    border-top-color: #1a5f2a;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }

  .receipt-page.error h1 {
    font-size: 24px;
    color: #1e293b;
    margin-bottom: 8px;
  }

  .receipt-page.error p {
    color: #64748b;
  }

  /* Header */
  .receipt-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: white;
    border-radius: 16px 16px 0 0;
    border-bottom: 1px solid #e2e8f0;
  }

  .company-logo {
    height: 40px;
    max-width: 150px;
    object-fit: contain;
  }

  .company-name {
    font-size: 18px;
    font-weight: 700;
    color: #1e293b;
  }

  .receipt-badge {
    font-size: 12px;
    font-weight: 600;
    color: #1a5f2a;
    background: #dcfce7;
    padding: 6px 12px;
    border-radius: 20px;
  }

  /* Ticket Info */
  .ticket-info {
    background: white;
    padding: 24px 16px;
    text-align: center;
    border-bottom: 1px solid #e2e8f0;
  }

  .ticket-number {
    font-size: 32px;
    font-weight: 700;
    color: #1a5f2a;
    font-family: 'SF Mono', Menlo, monospace;
  }

  .ticket-date {
    font-size: 14px;
    color: #64748b;
    margin-top: 4px;
  }

  .project-name {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px dashed #e2e8f0;
  }

  /* Diversion Status */
  .diversion-status {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px 16px;
    background: white;
    border-bottom: 1px solid #e2e8f0;
  }

  .diversion-status.diverted {
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  }

  .status-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 700;
    background: white;
    color: #1a5f2a;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }

  .diversion-status.landfill .status-icon {
    color: #64748b;
  }

  .status-text {
    display: flex;
    flex-direction: column;
  }

  .destination {
    font-size: 20px;
    font-weight: 700;
  }

  .facility {
    font-size: 14px;
    color: #64748b;
    margin-top: 2px;
  }

  /* Weight Card */
  .weight-card {
    background: white;
    padding: 20px 16px;
    border-bottom: 1px solid #e2e8f0;
  }

  .weight-card h3,
  .info-section h3,
  .signature-section h3,
  .photos-section h3 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    margin-bottom: 12px;
  }

  .weight-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }

  .weight-item {
    background: #f8fafc;
    padding: 12px;
    border-radius: 12px;
    text-align: center;
  }

  .weight-item.net {
    grid-column: span 2;
    background: #1a5f2a;
    color: white;
  }

  .weight-item .label {
    display: block;
    font-size: 12px;
    color: #64748b;
    margin-bottom: 4px;
  }

  .weight-item.net .label {
    color: rgba(255,255,255,0.8);
  }

  .weight-item .value {
    display: block;
    font-size: 24px;
    font-weight: 700;
    color: #1e293b;
  }

  .weight-item.net .value {
    color: white;
    font-size: 28px;
  }

  .material-badge {
    display: inline-block;
    background: #e2e8f0;
    color: #475569;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
  }

  /* Info Section */
  .info-section {
    background: white;
    padding: 20px 16px;
    border-bottom: 1px solid #e2e8f0;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
  }

  .info-row:not(:last-child) {
    border-bottom: 1px solid #f1f5f9;
  }

  .info-row .label {
    color: #64748b;
    font-size: 14px;
  }

  .info-row .value {
    font-weight: 600;
    color: #1e293b;
    font-size: 14px;
  }

  /* Signature */
  .signature-section {
    background: white;
    padding: 20px 16px;
    border-bottom: 1px solid #e2e8f0;
  }

  .signature-image {
    width: 100%;
    max-height: 120px;
    object-fit: contain;
    background: #f8fafc;
    border-radius: 8px;
    padding: 8px;
  }

  /* Photos */
  .photos-section {
    background: white;
    padding: 20px 16px;
    border-bottom: 1px solid #e2e8f0;
  }

  .photos-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .photo-item {
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    background: #f1f5f9;
  }

  .photo-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* Footer */
  .receipt-footer {
    background: white;
    padding: 24px 16px;
    border-radius: 0 0 16px 16px;
    text-align: center;
  }

  .powered-by {
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 8px;
  }

  .powered-by strong {
    color: #1a5f2a;
  }

  .legal {
    font-size: 11px;
    color: #94a3b8;
    line-height: 1.5;
    margin-bottom: 16px;
  }

  .print-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
  }

  /* Print Styles */
  @media print {
    .receipt-page {
      max-width: 100%;
      padding: 0;
    }

    .print-btn {
      display: none;
    }

    .receipt-header,
    .ticket-info,
    .diversion-status,
    .weight-card,
    .info-section,
    .signature-section,
    .photos-section,
    .receipt-footer {
      break-inside: avoid;
    }
  }
`;
