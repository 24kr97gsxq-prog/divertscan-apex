/**
 * DivertScan™ Apex Enterprise - Facility Vault Module
 * Permit Management | Expiration Tracking | Document Storage
 * iPad Optimized
 */

import React, { useState, useEffect, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  contactName?: string;
  contactEmail?: string;
  acceptedMaterials: string[];
  notes?: string;
  permits: Permit[];
  createdAt: Date;
  updatedAt: Date;
}

interface Permit {
  id: string;
  facilityId: string;
  permitNumber: string;
  permitType: PermitType;
  issuingAuthority: string;
  issueDate: Date;
  expirationDate: Date;
  status: PermitStatus;
  documentUrl?: string;
  alertDays: number;
  notes?: string;
}

type FacilityType = 
  | 'recycling_center'
  | 'transfer_station'
  | 'landfill'
  | 'composting'
  | 'donation_center'
  | 'salvage_yard'
  | 'other';

type PermitType = 
  | 'solid_waste_license'
  | 'recycling_facility'
  | 'transfer_station'
  | 'composting'
  | 'hazardous_waste'
  | 'air_quality'
  | 'water_discharge'
  | 'other';

type PermitStatus = 'valid' | 'expiring_soon' | 'expired' | 'pending_renewal';

type ViewMode = 'list' | 'grid';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const FACILITY_TYPES: { value: FacilityType; label: string; icon: string }[] = [
  { value: 'recycling_center', label: 'Recycling Center', icon: '♻️' },
  { value: 'transfer_station', label: 'Transfer Station', icon: '🚛' },
  { value: 'landfill', label: 'Landfill', icon: '🗑️' },
  { value: 'composting', label: 'Composting', icon: '🌱' },
  { value: 'donation_center', label: 'Donation Center', icon: '🎁' },
  { value: 'salvage_yard', label: 'Salvage Yard', icon: '🔧' },
  { value: 'other', label: 'Other', icon: '🏢' }
];

const PERMIT_TYPES: { value: PermitType; label: string }[] = [
  { value: 'solid_waste_license', label: 'Solid Waste License' },
  { value: 'recycling_facility', label: 'Recycling Facility Permit' },
  { value: 'transfer_station', label: 'Transfer Station Permit' },
  { value: 'composting', label: 'Composting Permit' },
  { value: 'hazardous_waste', label: 'Hazardous Waste Permit' },
  { value: 'air_quality', label: 'Air Quality Permit' },
  { value: 'water_discharge', label: 'Water Discharge Permit' },
  { value: 'other', label: 'Other' }
];

const MATERIAL_OPTIONS = [
  'Concrete', 'Asphalt', 'Metal (Ferrous)', 'Metal (Non-Ferrous)',
  'Wood (Clean)', 'Wood (Treated)', 'Cardboard/OCC', 'Paper',
  'Plastic', 'Glass', 'Drywall', 'Roofing', 'Mixed C&D'
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function FacilityVaultModule() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FacilityType | ''>('');
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPermitModal, setShowPermitModal] = useState(false);
  const [expiringPermits, setExpiringPermits] = useState<Permit[]>([]);

  useEffect(() => {
    loadFacilities();
  }, []);

  const loadFacilities = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/facilities', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setFacilities(data);
        
        // Extract expiring permits
        const expiring = data.flatMap((f: Facility) => 
          f.permits.filter(p => p.status === 'expiring_soon' || p.status === 'expired')
        );
        setExpiringPermits(expiring);
      }
    } catch (err) {
      console.error('Failed to load facilities');
    } finally {
      setLoading(false);
    }
  };

  const filteredFacilities = facilities.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         f.city.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = !filterType || f.type === filterType;
    return matchesSearch && matchesType;
  });

  const handleAddFacility = async (facility: Partial<Facility>) => {
    try {
      const response = await fetch('/api/facilities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(facility)
      });

      if (response.ok) {
        const newFacility = await response.json();
        setFacilities(prev => [...prev, newFacility]);
        setShowAddModal(false);
      }
    } catch (err) {
      console.error('Failed to add facility');
    }
  };

  const handleAddPermit = async (permit: Partial<Permit>) => {
    if (!selectedFacility) return;

    try {
      const response = await fetch(`/api/facilities/${selectedFacility.id}/permits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(permit)
      });

      if (response.ok) {
        await loadFacilities();
        setShowPermitModal(false);
      }
    } catch (err) {
      console.error('Failed to add permit');
    }
  };

  if (loading) {
    return <FacilityVaultSkeleton />;
  }

  return (
    <div className="facility-vault">
      <style>{vaultStyles}</style>

      {/* Header */}
      <div className="vault-header">
        <div className="header-left">
          <h1>Facility Vault</h1>
          <p>{facilities.length} facilities registered</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>
          + Add Facility
        </button>
      </div>

      {/* Alerts */}
      {expiringPermits.length > 0 && (
        <PermitAlertBanner permits={expiringPermits} />
      )}

      {/* Controls */}
      <div className="vault-controls">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search facilities..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <select 
          value={filterType}
          onChange={e => setFilterType(e.target.value as FacilityType | '')}
          className="filter-select"
        >
          <option value="">All Types</option>
          {FACILITY_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <div className="view-toggle">
          <button 
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
          >
            ☰
          </button>
          <button 
            className={viewMode === 'grid' ? 'active' : ''}
            onClick={() => setViewMode('grid')}
          >
            ⊞
          </button>
        </div>
      </div>

      {/* Facility List */}
      <div className={`facility-${viewMode}`}>
        {filteredFacilities.map(facility => (
          <FacilityCard
            key={facility.id}
            facility={facility}
            viewMode={viewMode}
            onSelect={() => setSelectedFacility(facility)}
            onAddPermit={() => {
              setSelectedFacility(facility);
              setShowPermitModal(true);
            }}
          />
        ))}

        {filteredFacilities.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon">🏢</span>
            <h3>No facilities found</h3>
            <p>Try adjusting your search or add a new facility</p>
          </div>
        )}
      </div>

      {/* Facility Detail Drawer */}
      {selectedFacility && !showPermitModal && (
        <FacilityDrawer
          facility={selectedFacility}
          onClose={() => setSelectedFacility(null)}
          onAddPermit={() => setShowPermitModal(true)}
          onRefresh={loadFacilities}
        />
      )}

      {/* Add Facility Modal */}
      {showAddModal && (
        <AddFacilityModal
          onSave={handleAddFacility}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Add Permit Modal */}
      {showPermitModal && selectedFacility && (
        <AddPermitModal
          facilityName={selectedFacility.name}
          onSave={handleAddPermit}
          onClose={() => setShowPermitModal(false)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function PermitAlertBanner({ permits }: { permits: Permit[] }) {
  const expired = permits.filter(p => p.status === 'expired');
  const expiring = permits.filter(p => p.status === 'expiring_soon');

  return (
    <div className="permit-alert-banner">
      {expired.length > 0 && (
        <div className="alert-item expired">
          <span className="alert-icon">⚠️</span>
          <span>{expired.length} permit{expired.length > 1 ? 's' : ''} expired</span>
        </div>
      )}
      {expiring.length > 0 && (
        <div className="alert-item expiring">
          <span className="alert-icon">⏰</span>
          <span>{expiring.length} permit{expiring.length > 1 ? 's' : ''} expiring soon</span>
        </div>
      )}
    </div>
  );
}

function FacilityCard({ facility, viewMode, onSelect, onAddPermit }: {
  facility: Facility;
  viewMode: ViewMode;
  onSelect: () => void;
  onAddPermit: () => void;
}) {
  const typeInfo = FACILITY_TYPES.find(t => t.value === facility.type);
  const permitStatus = getWorstPermitStatus(facility.permits);

  return (
    <div className={`facility-card ${viewMode}`} onClick={onSelect}>
      <div className="card-header">
        <span className="type-icon">{typeInfo?.icon || '🏢'}</span>
        <div className="card-title">
          <h3>{facility.name}</h3>
          <span className="type-label">{typeInfo?.label}</span>
        </div>
        {permitStatus !== 'valid' && (
          <span className={`permit-badge ${permitStatus}`}>
            {permitStatus === 'expired' ? '⚠️' : '⏰'}
          </span>
        )}
      </div>

      <div className="card-address">
        📍 {facility.city}, {facility.state}
      </div>

      <div className="card-materials">
        {facility.acceptedMaterials.slice(0, 3).map(m => (
          <span key={m} className="material-tag">{m}</span>
        ))}
        {facility.acceptedMaterials.length > 3 && (
          <span className="material-more">+{facility.acceptedMaterials.length - 3}</span>
        )}
      </div>

      <div className="card-footer">
        <span className="permit-count">
          📋 {facility.permits.length} permit{facility.permits.length !== 1 ? 's' : ''}
        </span>
        <button 
          className="add-permit-btn"
          onClick={e => { e.stopPropagation(); onAddPermit(); }}
        >
          + Permit
        </button>
      </div>
    </div>
  );
}

function FacilityDrawer({ facility, onClose, onAddPermit, onRefresh }: {
  facility: Facility;
  onClose: () => void;
  onAddPermit: () => void;
  onRefresh: () => void;
}) {
  const typeInfo = FACILITY_TYPES.find(t => t.value === facility.type);

  const handleDeletePermit = async (permitId: string) => {
    if (!confirm('Delete this permit?')) return;

    try {
      await fetch(`/api/facilities/${facility.id}/permits/${permitId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to delete permit');
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <button className="close-btn" onClick={onClose}>✕</button>
          <span className="drawer-icon">{typeInfo?.icon}</span>
          <h2>{facility.name}</h2>
          <span className="drawer-type">{typeInfo?.label}</span>
        </div>

        <div className="drawer-content">
          {/* Contact Info */}
          <section className="drawer-section">
            <h4>Contact Information</h4>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Address</span>
                <span className="info-value">
                  {facility.address}<br />
                  {facility.city}, {facility.state} {facility.zip}
                </span>
              </div>
              {facility.phone && (
                <div className="info-item">
                  <span className="info-label">Phone</span>
                  <span className="info-value">{facility.phone}</span>
                </div>
              )}
              {facility.contactName && (
                <div className="info-item">
                  <span className="info-label">Contact</span>
                  <span className="info-value">
                    {facility.contactName}
                    {facility.contactEmail && <><br />{facility.contactEmail}</>}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Accepted Materials */}
          <section className="drawer-section">
            <h4>Accepted Materials</h4>
            <div className="materials-list">
              {facility.acceptedMaterials.map(m => (
                <span key={m} className="material-chip">{m}</span>
              ))}
            </div>
          </section>

          {/* Permits */}
          <section className="drawer-section">
            <div className="section-header">
              <h4>Permits ({facility.permits.length})</h4>
              <button className="btn-sm" onClick={onAddPermit}>+ Add</button>
            </div>

            {facility.permits.length === 0 ? (
              <p className="no-permits">No permits on file</p>
            ) : (
              <div className="permits-list">
                {facility.permits.map(permit => (
                  <PermitCard 
                    key={permit.id} 
                    permit={permit}
                    onDelete={() => handleDeletePermit(permit.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Notes */}
          {facility.notes && (
            <section className="drawer-section">
              <h4>Notes</h4>
              <p className="notes-text">{facility.notes}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function PermitCard({ permit, onDelete }: { permit: Permit; onDelete: () => void }) {
  const permitType = PERMIT_TYPES.find(t => t.value === permit.permitType);
  const daysUntilExpiry = Math.floor(
    (new Date(permit.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className={`permit-card ${permit.status}`}>
      <div className="permit-header">
        <span className="permit-type">{permitType?.label || permit.permitType}</span>
        <span className={`permit-status ${permit.status}`}>
          {permit.status === 'valid' && '✓ Valid'}
          {permit.status === 'expiring_soon' && '⏰ Expiring'}
          {permit.status === 'expired' && '⚠️ Expired'}
        </span>
      </div>
      
      <div className="permit-number">#{permit.permitNumber}</div>
      <div className="permit-authority">{permit.issuingAuthority}</div>
      
      <div className="permit-dates">
        <span>Expires: {new Date(permit.expirationDate).toLocaleDateString()}</span>
        {permit.status !== 'expired' && daysUntilExpiry <= 30 && (
          <span className="days-warning">({daysUntilExpiry} days)</span>
        )}
      </div>

      <div className="permit-actions">
        {permit.documentUrl && (
          <a href={permit.documentUrl} target="_blank" rel="noopener" className="permit-doc">
            📄 View
          </a>
        )}
        <button className="permit-delete" onClick={onDelete}>🗑️</button>
      </div>
    </div>
  );
}

function AddFacilityModal({ onSave, onClose }: {
  onSave: (facility: Partial<Facility>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    type: '' as FacilityType | '',
    address: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    contactName: '',
    contactEmail: '',
    acceptedMaterials: [] as string[],
    notes: ''
  });

  const updateForm = (updates: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...updates }));
  };

  const toggleMaterial = (material: string) => {
    setForm(prev => ({
      ...prev,
      acceptedMaterials: prev.acceptedMaterials.includes(material)
        ? prev.acceptedMaterials.filter(m => m !== material)
        : [...prev.acceptedMaterials, material]
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.type || !form.city || !form.state) return;
    onSave(form as Partial<Facility>);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Facility</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Facility Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => updateForm({ name: e.target.value })}
              placeholder="Enter facility name"
              required
            />
          </div>

          <div className="form-group">
            <label>Facility Type *</label>
            <select
              value={form.type}
              onChange={e => updateForm({ type: e.target.value as FacilityType })}
              required
            >
              <option value="">Select type...</option>
              {FACILITY_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Address</label>
            <input
              type="text"
              value={form.address}
              onChange={e => updateForm({ address: e.target.value })}
              placeholder="Street address"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>City *</label>
              <input
                type="text"
                value={form.city}
                onChange={e => updateForm({ city: e.target.value })}
                required
              />
            </div>
            <div className="form-group small">
              <label>State *</label>
              <input
                type="text"
                value={form.state}
                onChange={e => updateForm({ state: e.target.value.toUpperCase() })}
                maxLength={2}
                required
              />
            </div>
            <div className="form-group">
              <label>ZIP</label>
              <input
                type="text"
                value={form.zip}
                onChange={e => updateForm({ zip: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Accepted Materials</label>
            <div className="material-checkboxes">
              {MATERIAL_OPTIONS.map(m => (
                <label key={m} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.acceptedMaterials.includes(m)}
                    onChange={() => toggleMaterial(m)}
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => updateForm({ notes: e.target.value })}
              rows={3}
              placeholder="Optional notes..."
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Add Facility
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddPermitModal({ facilityName, onSave, onClose }: {
  facilityName: string;
  onSave: (permit: Partial<Permit>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    permitNumber: '',
    permitType: '' as PermitType | '',
    issuingAuthority: '',
    issueDate: '',
    expirationDate: '',
    alertDays: 30,
    notes: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const updateForm = (updates: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...updates }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.permitNumber || !form.permitType || !form.expirationDate) return;
    
    // In real implementation, would upload file first
    onSave({
      ...form,
      permitType: form.permitType as PermitType,
      issueDate: form.issueDate ? new Date(form.issueDate) : undefined,
      expirationDate: new Date(form.expirationDate)
    } as Partial<Permit>);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Permit</h2>
          <p className="modal-subtitle">for {facilityName}</p>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-row">
            <div className="form-group">
              <label>Permit Number *</label>
              <input
                type="text"
                value={form.permitNumber}
                onChange={e => updateForm({ permitNumber: e.target.value })}
                placeholder="e.g., SWL-2024-001"
                required
              />
            </div>
            <div className="form-group">
              <label>Permit Type *</label>
              <select
                value={form.permitType}
                onChange={e => updateForm({ permitType: e.target.value as PermitType })}
                required
              >
                <option value="">Select type...</option>
                {PERMIT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Issuing Authority *</label>
            <input
              type="text"
              value={form.issuingAuthority}
              onChange={e => updateForm({ issuingAuthority: e.target.value })}
              placeholder="e.g., TCEQ, EPA, State DEQ"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Issue Date</label>
              <input
                type="date"
                value={form.issueDate}
                onChange={e => updateForm({ issueDate: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Expiration Date *</label>
              <input
                type="date"
                value={form.expirationDate}
                onChange={e => updateForm({ expirationDate: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Alert Days Before Expiry</label>
            <select
              value={form.alertDays}
              onChange={e => updateForm({ alertDays: parseInt(e.target.value) })}
            >
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>

          <div className="form-group">
            <label>Upload Permit Document</label>
            <div className="file-upload" onClick={() => fileInputRef.current?.click()}>
              {file ? (
                <span className="file-name">📄 {file.name}</span>
              ) : (
                <span className="file-placeholder">Click to upload PDF</span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.png"
              onChange={e => setFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Add Permit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FacilityVaultSkeleton() {
  return (
    <div className="facility-vault">
      <style>{vaultStyles}</style>
      <div className="skeleton-header" />
      <div className="skeleton-controls" />
      <div className="skeleton-grid">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton-card" />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function getWorstPermitStatus(permits: Permit[]): PermitStatus {
  if (permits.some(p => p.status === 'expired')) return 'expired';
  if (permits.some(p => p.status === 'expiring_soon')) return 'expiring_soon';
  return 'valid';
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const vaultStyles = `
  .facility-vault {
    max-width: 1200px;
    margin: 0 auto;
  }

  .vault-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
  }

  .header-left h1 {
    font-size: 24px;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 4px;
  }

  .header-left p {
    color: #64748b;
    font-size: 14px;
  }

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

  /* Permit Alert Banner */
  .permit-alert-banner {
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
  }

  .alert-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
  }

  .alert-item.expired {
    background: #fef2f2;
    color: #dc2626;
  }

  .alert-item.expiring {
    background: #fef3c7;
    color: #92400e;
  }

  /* Controls */
  .vault-controls {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
  }

  .search-box {
    flex: 1;
    position: relative;
  }

  .search-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 16px;
  }

  .search-box input {
    width: 100%;
    padding: 12px 16px 12px 44px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    font-size: 15px;
  }

  .filter-select {
    padding: 12px 16px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    font-size: 15px;
    min-width: 160px;
  }

  .view-toggle {
    display: flex;
    background: #f1f5f9;
    border-radius: 10px;
    padding: 4px;
  }

  .view-toggle button {
    padding: 8px 12px;
    border: none;
    background: transparent;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
  }

  .view-toggle button.active {
    background: white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  /* Facility Cards */
  .facility-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .facility-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
  }

  .facility-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    cursor: pointer;
    transition: all 0.15s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }

  .facility-card:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  .facility-card.list {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
  }

  .type-icon {
    font-size: 28px;
  }

  .card-title {
    flex: 1;
  }

  .card-title h3 {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 2px;
  }

  .type-label {
    font-size: 12px;
    color: #64748b;
  }

  .permit-badge {
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 12px;
  }

  .permit-badge.expired {
    background: #fef2f2;
  }

  .permit-badge.expiring_soon {
    background: #fef3c7;
  }

  .card-address {
    font-size: 13px;
    color: #64748b;
    margin-bottom: 12px;
  }

  .card-materials {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }

  .material-tag {
    font-size: 11px;
    padding: 3px 8px;
    background: #f1f5f9;
    border-radius: 4px;
    color: #64748b;
  }

  .material-more {
    font-size: 11px;
    color: #94a3b8;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 12px;
    border-top: 1px solid #f1f5f9;
  }

  .permit-count {
    font-size: 13px;
    color: #64748b;
  }

  .add-permit-btn {
    padding: 6px 12px;
    background: #f1f5f9;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  /* Drawer */
  .drawer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.3);
    z-index: 200;
  }

  .drawer {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    width: 480px;
    max-width: 100%;
    background: white;
    overflow-y: auto;
    box-shadow: -4px 0 20px rgba(0,0,0,0.1);
  }

  .drawer-header {
    padding: 24px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
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

  .drawer-icon {
    font-size: 32px;
    margin-bottom: 12px;
    display: block;
  }

  .drawer h2 {
    font-size: 20px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 4px;
  }

  .drawer-type {
    font-size: 14px;
    color: #64748b;
  }

  .drawer-content {
    padding: 24px;
  }

  .drawer-section {
    margin-bottom: 24px;
  }

  .drawer-section h4 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    margin-bottom: 12px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .section-header h4 {
    margin-bottom: 0;
  }

  .btn-sm {
    padding: 6px 12px;
    background: #1a5f2a;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
  }

  .info-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .info-label {
    font-size: 12px;
    color: #94a3b8;
  }

  .info-value {
    font-size: 14px;
    color: #1e293b;
  }

  .materials-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .material-chip {
    padding: 6px 12px;
    background: #f1f5f9;
    border-radius: 6px;
    font-size: 13px;
    color: #374151;
  }

  .permits-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .no-permits {
    color: #94a3b8;
    font-size: 14px;
    font-style: italic;
  }

  /* Permit Card */
  .permit-card {
    background: #f8fafc;
    border-radius: 10px;
    padding: 16px;
    border-left: 4px solid #10b981;
  }

  .permit-card.expiring_soon {
    border-left-color: #f59e0b;
  }

  .permit-card.expired {
    border-left-color: #ef4444;
  }

  .permit-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .permit-type {
    font-size: 14px;
    font-weight: 600;
    color: #1e293b;
  }

  .permit-status {
    font-size: 12px;
    font-weight: 500;
  }

  .permit-status.valid { color: #10b981; }
  .permit-status.expiring_soon { color: #f59e0b; }
  .permit-status.expired { color: #ef4444; }

  .permit-number {
    font-size: 13px;
    color: #64748b;
    font-family: monospace;
  }

  .permit-authority {
    font-size: 13px;
    color: #64748b;
    margin-bottom: 8px;
  }

  .permit-dates {
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 8px;
  }

  .days-warning {
    color: #f59e0b;
    font-weight: 500;
  }

  .permit-actions {
    display: flex;
    gap: 8px;
  }

  .permit-doc,
  .permit-delete {
    padding: 4px 8px;
    border: none;
    background: white;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    text-decoration: none;
  }

  /* Modals */
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
    max-width: 500px;
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

  .modal-subtitle {
    font-size: 14px;
    color: #64748b;
    margin-top: 4px;
  }

  .modal-form {
    padding: 24px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 6px;
  }

  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 15px;
  }

  .form-row {
    display: flex;
    gap: 12px;
  }

  .form-row .form-group {
    flex: 1;
  }

  .form-row .form-group.small {
    flex: 0 0 80px;
  }

  .material-checkboxes {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #374151;
  }

  .file-upload {
    padding: 20px;
    border: 2px dashed #e2e8f0;
    border-radius: 8px;
    text-align: center;
    cursor: pointer;
  }

  .file-placeholder {
    color: #94a3b8;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
  }

  .modal-actions button {
    flex: 1;
    padding: 14px;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-secondary {
    background: #f1f5f9;
    color: #374151;
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

  /* Skeleton */
  .skeleton-header {
    height: 60px;
    background: #e2e8f0;
    border-radius: 8px;
    margin-bottom: 24px;
  }

  .skeleton-controls {
    height: 48px;
    background: #e2e8f0;
    border-radius: 8px;
    margin-bottom: 24px;
  }

  .skeleton-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
  }

  .skeleton-card {
    height: 200px;
    background: #e2e8f0;
    border-radius: 12px;
    animation: pulse 1.5s ease infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @media (max-width: 768px) {
    .vault-controls {
      flex-wrap: wrap;
    }

    .drawer {
      width: 100%;
    }

    .material-checkboxes {
      grid-template-columns: 1fr;
    }
  }
`;
