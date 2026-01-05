/**
 * DivertScan™ Apex Enterprise - Live Load Module (Raul's Mode)
 * Two-Stage Weighing | Signature Capture | SMS Receipts
 * iPad Field Optimized
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface LiveLoadProps {
  projectId: string;
  onComplete: () => void;
}

type Stage = 'setup' | 'gross' | 'tare' | 'photos' | 'signature' | 'review' | 'complete';

interface SessionData {
  // Setup
  truckPlate: string;
  fleetNumber: string;
  driverName: string;
  driverPhone: string;
  haulerCompany: string;
  materialType: string;
  destination: string;
  facilityId: string;
  facilityName: string;
  
  // Weights
  grossWeight: number | null;
  grossTimestamp: Date | null;
  tareWeight: number | null;
  tareTimestamp: Date | null;
  netWeight: number | null;
  weightUnit: string;
  
  // GPS
  gpsCoords: { lat: number; lng: number } | null;
  
  // Photos
  debrisPhotos: CapturedPhoto[];
  
  // Signature
  signature: string | null;
}

interface CapturedPhoto {
  id: string;
  dataUrl: string;
  timestamp: Date;
}

interface Facility {
  id: string;
  name: string;
  type: string;
}

const MATERIAL_TYPES = [
  { value: 'concrete', label: 'Concrete' },
  { value: 'asphalt', label: 'Asphalt' },
  { value: 'metal_ferrous', label: 'Metal (Ferrous)' },
  { value: 'metal_nonferrous', label: 'Metal (Non-Ferrous)' },
  { value: 'wood_clean', label: 'Wood (Clean)' },
  { value: 'wood_treated', label: 'Wood (Treated)' },
  { value: 'cardboard', label: 'Cardboard/OCC' },
  { value: 'drywall', label: 'Drywall' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'mixed_c_and_d', label: 'Mixed C&D' },
  { value: 'other', label: 'Other' }
];

const DESTINATIONS = [
  { value: 'recycling', label: 'Recycling', icon: '♻️' },
  { value: 'landfill', label: 'Landfill', icon: '🗑️' },
  { value: 'donation', label: 'Donation', icon: '🎁' },
  { value: 'salvage', label: 'Salvage', icon: '🔧' }
];

const INITIAL_SESSION: SessionData = {
  truckPlate: '',
  fleetNumber: '',
  driverName: '',
  driverPhone: '',
  haulerCompany: '',
  materialType: '',
  destination: '',
  facilityId: '',
  facilityName: '',
  grossWeight: null,
  grossTimestamp: null,
  tareWeight: null,
  tareTimestamp: null,
  netWeight: null,
  weightUnit: 'lbs',
  gpsCoords: null,
  debrisPhotos: [],
  signature: null
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function LiveLoadModule({ projectId, onComplete }: LiveLoadProps) {
  const [stage, setStage] = useState<Stage>('setup');
  const [session, setSession] = useState<SessionData>(INITIAL_SESSION);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load facilities on mount
  useEffect(() => {
    loadFacilities();
    captureGPS();
  }, []);

  const loadFacilities = async () => {
    try {
      const response = await fetch('/api/facilities', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        setFacilities(await response.json());
      }
    } catch (err) {
      console.error('Failed to load facilities');
    }
  };

  const captureGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setSession(s => ({
            ...s,
            gpsCoords: { lat: pos.coords.latitude, lng: pos.coords.longitude }
          }));
        },
        () => console.warn('GPS unavailable')
      );
    }
  };

  const updateSession = (updates: Partial<SessionData>) => {
    setSession(s => ({ ...s, ...updates }));
  };

  const handleGrossCapture = (weight: number) => {
    updateSession({
      grossWeight: weight,
      grossTimestamp: new Date()
    });
    setStage('tare');
  };

  const handleTareCapture = (weight: number) => {
    const net = (session.grossWeight || 0) - weight;
    updateSession({
      tareWeight: weight,
      tareTimestamp: new Date(),
      netWeight: net
    });
    setStage('photos');
  };

  const handlePhotoCapture = (photo: CapturedPhoto) => {
    updateSession({
      debrisPhotos: [...session.debrisPhotos, photo]
    });
  };

  const handlePhotoRemove = (photoId: string) => {
    updateSession({
      debrisPhotos: session.debrisPhotos.filter(p => p.id !== photoId)
    });
  };

  const handleSignatureCapture = (signatureData: string) => {
    updateSession({ signature: signatureData });
    setStage('review');
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const ticket = {
        projectId,
        ticketNumber: generateTicketNumber(),
        grossWeight: session.grossWeight,
        tareWeight: session.tareWeight,
        netWeight: session.netWeight,
        weightUnit: session.weightUnit,
        materialType: session.materialType,
        destination: session.destination,
        facilityId: session.facilityId,
        facilityName: session.facilityName,
        truckPlate: session.truckPlate,
        fleetNumber: session.fleetNumber,
        driverName: session.driverName,
        driverSignature: session.signature,
        gpsCoordinates: session.gpsCoords,
        timestamps: {
          grossCaptured: session.grossTimestamp,
          tareCaptured: session.tareTimestamp,
          signed: new Date()
        },
        photos: session.debrisPhotos.map(p => ({
          type: 'debris_pile',
          url: p.dataUrl,
          capturedAt: p.timestamp
        })),
        ocrSource: 'manual',
        status: 'pending'
      };

      const response = await fetch(`/api/projects/${projectId}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(ticket)
      });

      if (!response.ok) throw new Error('Failed to create ticket');

      const result = await response.json();

      // Send SMS if phone provided
      if (session.driverPhone) {
        await sendSMSReceipt(result.id, session.driverPhone);
      }

      setStage('complete');
      setTimeout(() => {
        onComplete();
        resetSession();
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  const sendSMSReceipt = async (ticketId: string, phone: string) => {
    try {
      await fetch('/api/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          to: formatPhone(phone),
          ticketId,
          receiptUrl: `${window.location.origin}/receipt/${ticketId}`
        })
      });
    } catch {
      console.warn('SMS failed to send');
    }
  };

  const resetSession = () => {
    setSession(INITIAL_SESSION);
    setStage('setup');
  };

  const canProceedFromSetup = 
    session.truckPlate &&
    session.driverName &&
    session.materialType &&
    session.destination &&
    session.facilityId;

  return (
    <div className="live-load">
      <style>{liveLoadStyles}</style>

      {/* Progress Bar */}
      <ProgressBar stage={stage} />

      {/* Stage Content */}
      <div className="ll-content">
        {stage === 'setup' && (
          <SetupStage
            session={session}
            facilities={facilities}
            onChange={updateSession}
            onNext={() => setStage('gross')}
            canProceed={!!canProceedFromSetup}
          />
        )}

        {stage === 'gross' && (
          <WeightStage
            type="gross"
            title="Stage 1: Gross Weight (Incoming)"
            subtitle="Weigh the loaded truck"
            onCapture={handleGrossCapture}
            onBack={() => setStage('setup')}
          />
        )}

        {stage === 'tare' && (
          <WeightStage
            type="tare"
            title="Stage 2: Tare Weight (Outgoing)"
            subtitle="Weigh the empty truck"
            grossWeight={session.grossWeight}
            onCapture={handleTareCapture}
            onBack={() => setStage('gross')}
          />
        )}

        {stage === 'photos' && (
          <PhotoStage
            photos={session.debrisPhotos}
            onCapture={handlePhotoCapture}
            onRemove={handlePhotoRemove}
            onNext={() => setStage('signature')}
            onBack={() => setStage('tare')}
          />
        )}

        {stage === 'signature' && (
          <SignatureStage
            driverName={session.driverName}
            onCapture={handleSignatureCapture}
            onBack={() => setStage('photos')}
          />
        )}

        {stage === 'review' && (
          <ReviewStage
            session={session}
            loading={loading}
            error={error}
            onSubmit={handleSubmit}
            onBack={() => setStage('signature')}
          />
        )}

        {stage === 'complete' && (
          <CompleteStage ticketNumber={generateTicketNumber()} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function ProgressBar({ stage }: { stage: Stage }) {
  const stages: { key: Stage; label: string }[] = [
    { key: 'setup', label: 'Setup' },
    { key: 'gross', label: 'Gross' },
    { key: 'tare', label: 'Tare' },
    { key: 'photos', label: 'Photos' },
    { key: 'signature', label: 'Sign' },
    { key: 'review', label: 'Review' }
  ];

  const currentIndex = stages.findIndex(s => s.key === stage);

  return (
    <div className="ll-progress">
      {stages.map((s, i) => (
        <div 
          key={s.key}
          className={`progress-step ${i <= currentIndex ? 'active' : ''} ${i < currentIndex ? 'complete' : ''}`}
        >
          <div className="step-dot">
            {i < currentIndex ? '✓' : i + 1}
          </div>
          <span className="step-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function SetupStage({ session, facilities, onChange, onNext, canProceed }: {
  session: SessionData;
  facilities: Facility[];
  onChange: (updates: Partial<SessionData>) => void;
  onNext: () => void;
  canProceed: boolean;
}) {
  return (
    <div className="ll-stage">
      <h2>Load Information</h2>
      <p className="stage-subtitle">Enter vehicle and material details</p>

      <div className="form-grid">
        <div className="form-group">
          <label>Truck/License Plate *</label>
          <input
            type="text"
            value={session.truckPlate}
            onChange={e => onChange({ truckPlate: e.target.value.toUpperCase() })}
            placeholder="ABC-1234"
            autoCapitalize="characters"
          />
        </div>

        <div className="form-group">
          <label>Fleet Number</label>
          <input
            type="text"
            value={session.fleetNumber}
            onChange={e => onChange({ fleetNumber: e.target.value })}
            placeholder="Optional"
          />
        </div>

        <div className="form-group full">
          <label>Driver Name *</label>
          <input
            type="text"
            value={session.driverName}
            onChange={e => onChange({ driverName: e.target.value })}
            placeholder="John Smith"
          />
        </div>

        <div className="form-group full">
          <label>Driver Phone (for SMS receipt)</label>
          <input
            type="tel"
            value={session.driverPhone}
            onChange={e => onChange({ driverPhone: e.target.value })}
            placeholder="(555) 123-4567"
          />
        </div>

        <div className="form-group full">
          <label>Hauler Company</label>
          <input
            type="text"
            value={session.haulerCompany}
            onChange={e => onChange({ haulerCompany: e.target.value })}
            placeholder="Company name"
          />
        </div>

        <div className="form-group full">
          <label>Material Type *</label>
          <select
            value={session.materialType}
            onChange={e => onChange({ materialType: e.target.value })}
          >
            <option value="">Select material...</option>
            {MATERIAL_TYPES.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group full">
          <label>Destination *</label>
          <div className="destination-grid">
            {DESTINATIONS.map(d => (
              <button
                key={d.value}
                type="button"
                className={`dest-btn ${session.destination === d.value ? 'active' : ''}`}
                onClick={() => onChange({ destination: d.value })}
              >
                <span className="dest-icon">{d.icon}</span>
                <span className="dest-label">{d.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="form-group full">
          <label>Facility *</label>
          <select
            value={session.facilityId}
            onChange={e => {
              const facility = facilities.find(f => f.id === e.target.value);
              onChange({ 
                facilityId: e.target.value,
                facilityName: facility?.name || ''
              });
            }}
          >
            <option value="">Select facility...</option>
            {facilities.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="stage-actions">
        <button 
          className="btn-primary"
          onClick={onNext}
          disabled={!canProceed}
        >
          Continue to Weighing →
        </button>
      </div>
    </div>
  );
}

function WeightStage({ type, title, subtitle, grossWeight, onCapture, onBack }: {
  type: 'gross' | 'tare';
  title: string;
  subtitle: string;
  grossWeight?: number | null;
  onCapture: (weight: number) => void;
  onBack: () => void;
}) {
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState('lbs');

  const handleSubmit = () => {
    const numWeight = parseFloat(weight);
    if (!isNaN(numWeight) && numWeight > 0) {
      onCapture(numWeight);
    }
  };

  return (
    <div className="ll-stage weight-stage">
      <h2>{title}</h2>
      <p className="stage-subtitle">{subtitle}</p>

      {type === 'tare' && grossWeight && (
        <div className="weight-reference">
          <span>Gross Weight:</span>
          <strong>{grossWeight.toLocaleString()} lbs</strong>
        </div>
      )}

      <div className="weight-input-wrapper">
        <input
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={e => setWeight(e.target.value)}
          placeholder="0"
          className="weight-input"
          autoFocus
        />
        <select 
          value={unit} 
          onChange={e => setUnit(e.target.value)}
          className="unit-select"
        >
          <option value="lbs">lbs</option>
          <option value="tons">tons</option>
        </select>
      </div>

      {type === 'tare' && weight && grossWeight && (
        <div className="net-preview">
          <span>Net Weight:</span>
          <strong className="net-value">
            {(grossWeight - parseFloat(weight || '0')).toLocaleString()} lbs
          </strong>
        </div>
      )}

      <div className="weight-keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(key => (
          <button
            key={key}
            type="button"
            className="keypad-btn"
            onClick={() => {
              if (key === '⌫') {
                setWeight(w => w.slice(0, -1));
              } else {
                setWeight(w => w + key);
              }
            }}
          >
            {key}
          </button>
        ))}
      </div>

      <div className="stage-actions">
        <button className="btn-secondary" onClick={onBack}>← Back</button>
        <button 
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!weight || parseFloat(weight) <= 0}
        >
          Capture {type === 'gross' ? 'Gross' : 'Tare'} →
        </button>
      </div>
    </div>
  );
}

function PhotoStage({ photos, onCapture, onRemove, onNext, onBack }: {
  photos: CapturedPhoto[];
  onCapture: (photo: CapturedPhoto) => void;
  onRemove: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = async () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      onCapture({
        id: crypto.randomUUID(),
        dataUrl: reader.result as string,
        timestamp: new Date()
      });
    };
    reader.readAsDataURL(file);
    
    // Reset input
    e.target.value = '';
  };

  const remaining = 3 - photos.length;

  return (
    <div className="ll-stage">
      <h2>Debris Pile Photos</h2>
      <p className="stage-subtitle">
        Capture {remaining > 0 ? `${remaining} more ` : ''}photo{remaining !== 1 ? 's' : ''} of the debris
      </p>

      <div className="photo-grid">
        {photos.map((photo, i) => (
          <div key={photo.id} className="photo-thumb">
            <img src={photo.dataUrl} alt={`Debris ${i + 1}`} />
            <button 
              className="photo-remove"
              onClick={() => onRemove(photo.id)}
            >
              ✕
            </button>
          </div>
        ))}
        
        {photos.length < 3 && (
          <button className="photo-add" onClick={handleCapture}>
            <span className="add-icon">📷</span>
            <span>Add Photo</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div className="photo-requirements">
        <span className={photos.length >= 3 ? 'met' : ''}>
          ✓ Minimum 3 photos required
        </span>
      </div>

      <div className="stage-actions">
        <button className="btn-secondary" onClick={onBack}>← Back</button>
        <button 
          className="btn-primary"
          onClick={onNext}
          disabled={photos.length < 3}
        >
          Continue to Signature →
        </button>
      </div>
    </div>
  );
}

function SignatureStage({ driverName, onCapture, onBack }: {
  driverName: string;
  onCapture: (signature: string) => void;
  onBack: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Draw signature line
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, rect.height - 30);
    ctx.lineTo(rect.width - 20, rect.height - 30);
    ctx.stroke();

    // Reset for drawing
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  const getPoint = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    setHasSignature(true);
    
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    const point = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    const point = getPoint(e);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const rect = canvas.getBoundingClientRect();
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Redraw signature line
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, rect.height - 30);
    ctx.lineTo(rect.width - 20, rect.height - 30);
    ctx.stroke();
    
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    
    setHasSignature(false);
  };

  const handleSubmit = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;
    
    const dataUrl = canvas.toDataURL('image/png');
    onCapture(dataUrl);
  };

  return (
    <div className="ll-stage">
      <h2>Driver Signature</h2>
      <p className="stage-subtitle">
        {driverName}, please sign below to confirm this transaction
      </p>

      <div className="signature-wrapper">
        <canvas
          ref={canvasRef}
          className="signature-canvas"
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
        />
        
        {hasSignature && (
          <button className="sig-clear" onClick={clearSignature}>
            Clear
          </button>
        )}
      </div>

      <div className="stage-actions">
        <button className="btn-secondary" onClick={onBack}>← Back</button>
        <button 
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!hasSignature}
        >
          Review Transaction →
        </button>
      </div>
    </div>
  );
}

function ReviewStage({ session, loading, error, onSubmit, onBack }: {
  session: SessionData;
  loading: boolean;
  error: string | null;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <div className="ll-stage">
      <h2>Review & Submit</h2>
      <p className="stage-subtitle">Verify all information before submitting</p>

      {error && (
        <div className="error-banner">{error}</div>
      )}

      <div className="review-card">
        <div className="review-section">
          <h4>Vehicle Information</h4>
          <div className="review-grid">
            <div className="review-item">
              <span className="review-label">Truck</span>
              <span className="review-value">{session.truckPlate}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Driver</span>
              <span className="review-value">{session.driverName}</span>
            </div>
          </div>
        </div>

        <div className="review-section">
          <h4>Weight Data</h4>
          <div className="review-weights">
            <div className="weight-item">
              <span className="weight-label">Gross</span>
              <span className="weight-value">{session.grossWeight?.toLocaleString()} lbs</span>
            </div>
            <div className="weight-item">
              <span className="weight-label">Tare</span>
              <span className="weight-value">{session.tareWeight?.toLocaleString()} lbs</span>
            </div>
            <div className="weight-item net">
              <span className="weight-label">Net</span>
              <span className="weight-value">{session.netWeight?.toLocaleString()} lbs</span>
            </div>
          </div>
        </div>

        <div className="review-section">
          <h4>Material & Destination</h4>
          <div className="review-grid">
            <div className="review-item">
              <span className="review-label">Material</span>
              <span className="review-value">
                {MATERIAL_TYPES.find(m => m.value === session.materialType)?.label}
              </span>
            </div>
            <div className="review-item">
              <span className="review-label">Destination</span>
              <span className="review-value">
                {DESTINATIONS.find(d => d.value === session.destination)?.label}
              </span>
            </div>
            <div className="review-item full">
              <span className="review-label">Facility</span>
              <span className="review-value">{session.facilityName}</span>
            </div>
          </div>
        </div>

        <div className="review-section">
          <h4>Photos ({session.debrisPhotos.length})</h4>
          <div className="review-photos">
            {session.debrisPhotos.map((p, i) => (
              <img key={p.id} src={p.dataUrl} alt={`Debris ${i + 1}`} />
            ))}
          </div>
        </div>

        {session.signature && (
          <div className="review-section">
            <h4>Signature</h4>
            <img src={session.signature} alt="Signature" className="review-signature" />
          </div>
        )}
      </div>

      <div className="stage-actions">
        <button className="btn-secondary" onClick={onBack} disabled={loading}>
          ← Back
        </button>
        <button 
          className="btn-primary"
          onClick={onSubmit}
          disabled={loading}
        >
          {loading ? 'Submitting...' : 'Submit Ticket ✓'}
        </button>
      </div>
    </div>
  );
}

function CompleteStage({ ticketNumber }: { ticketNumber: string }) {
  return (
    <div className="ll-stage complete-stage">
      <div className="complete-icon">✓</div>
      <h2>Ticket Created!</h2>
      <p className="ticket-number">{ticketNumber}</p>
      <p className="stage-subtitle">
        SMS receipt has been sent to the driver
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function generateTicketNumber(): string {
  const date = new Date();
  const datePart = date.toISOString().slice(2, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `DS-${datePart}-${randomPart}`;
}

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`;
  return `+${cleaned}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const liveLoadStyles = `
  .live-load {
    max-width: 600px;
    margin: 0 auto;
  }

  /* Progress Bar */
  .ll-progress {
    display: flex;
    justify-content: space-between;
    margin-bottom: 32px;
    padding: 0 16px;
  }

  .progress-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    flex: 1;
    position: relative;
  }

  .progress-step::after {
    content: '';
    position: absolute;
    top: 14px;
    left: 50%;
    width: 100%;
    height: 2px;
    background: #e2e8f0;
  }

  .progress-step:last-child::after {
    display: none;
  }

  .progress-step.complete::after {
    background: #1a5f2a;
  }

  .step-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #e2e8f0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    position: relative;
    z-index: 1;
  }

  .progress-step.active .step-dot {
    background: #1a5f2a;
    color: white;
  }

  .progress-step.complete .step-dot {
    background: #1a5f2a;
    color: white;
  }

  .step-label {
    font-size: 11px;
    color: #94a3b8;
    font-weight: 500;
  }

  .progress-step.active .step-label {
    color: #1a5f2a;
    font-weight: 600;
  }

  /* Stage Container */
  .ll-stage {
    background: white;
    border-radius: 16px;
    padding: 32px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
  }

  .ll-stage h2 {
    font-size: 24px;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 8px;
  }

  .stage-subtitle {
    color: #64748b;
    margin-bottom: 24px;
  }

  /* Form Styles */
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group.full {
    grid-column: span 2;
  }

  .form-group label {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .form-group input,
  .form-group select {
    padding: 14px 16px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    font-size: 16px;
    min-height: 50px;
    transition: border-color 0.15s ease;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: #1a5f2a;
  }

  /* Destination Buttons */
  .destination-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .dest-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px 12px;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    background: white;
    cursor: pointer;
    transition: all 0.15s ease;
    min-height: 80px;
  }

  .dest-btn.active {
    border-color: #1a5f2a;
    background: rgba(26, 95, 42, 0.05);
  }

  .dest-icon {
    font-size: 24px;
  }

  .dest-label {
    font-size: 12px;
    font-weight: 500;
    color: #374151;
  }

  /* Weight Input */
  .weight-stage {
    text-align: center;
  }

  .weight-reference {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 24px;
    font-size: 16px;
    color: #64748b;
  }

  .weight-input-wrapper {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-bottom: 16px;
  }

  .weight-input {
    width: 200px;
    font-size: 48px;
    font-weight: 700;
    text-align: center;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px;
  }

  .weight-input:focus {
    outline: none;
    border-color: #1a5f2a;
  }

  .unit-select {
    font-size: 18px;
    padding: 16px;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    background: white;
  }

  .net-preview {
    display: flex;
    justify-content: center;
    gap: 12px;
    font-size: 18px;
    color: #64748b;
    margin-bottom: 24px;
  }

  .net-value {
    color: #1a5f2a;
    font-weight: 700;
  }

  .weight-keypad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    max-width: 300px;
    margin: 24px auto;
  }

  .keypad-btn {
    padding: 20px;
    font-size: 24px;
    font-weight: 600;
    border: none;
    background: #f1f5f9;
    border-radius: 12px;
    cursor: pointer;
    min-height: 60px;
  }

  .keypad-btn:active {
    background: #e2e8f0;
  }

  /* Photo Stage */
  .photo-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }

  .photo-thumb {
    position: relative;
    aspect-ratio: 1;
    border-radius: 12px;
    overflow: hidden;
  }

  .photo-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .photo-remove {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: rgba(0,0,0,0.6);
    color: white;
    font-size: 14px;
    cursor: pointer;
  }

  .photo-add {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 2px dashed #e2e8f0;
    border-radius: 12px;
    background: #f8fafc;
    cursor: pointer;
  }

  .add-icon {
    font-size: 32px;
  }

  .photo-add span:last-child {
    font-size: 14px;
    color: #64748b;
  }

  .photo-requirements {
    text-align: center;
    font-size: 14px;
    color: #94a3b8;
    margin-bottom: 24px;
  }

  .photo-requirements .met {
    color: #10b981;
  }

  /* Signature */
  .signature-wrapper {
    position: relative;
    margin-bottom: 24px;
  }

  .signature-canvas {
    width: 100%;
    height: 200px;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    background: white;
    touch-action: none;
  }

  .sig-clear {
    position: absolute;
    top: 12px;
    right: 12px;
    padding: 8px 16px;
    border: none;
    background: #f1f5f9;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
  }

  /* Review */
  .review-card {
    background: #f8fafc;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 24px;
  }

  .review-section {
    padding: 20px;
    border-bottom: 1px solid #e2e8f0;
  }

  .review-section:last-child {
    border-bottom: none;
  }

  .review-section h4 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    margin-bottom: 12px;
  }

  .review-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .review-item.full {
    grid-column: span 2;
  }

  .review-label {
    font-size: 12px;
    color: #64748b;
    display: block;
  }

  .review-value {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
  }

  .review-weights {
    display: flex;
    gap: 24px;
  }

  .weight-item {
    flex: 1;
    text-align: center;
    padding: 16px;
    background: white;
    border-radius: 8px;
  }

  .weight-item.net {
    background: #1a5f2a;
    color: white;
  }

  .weight-item .weight-label {
    font-size: 12px;
    opacity: 0.7;
  }

  .weight-item .weight-value {
    font-size: 20px;
    font-weight: 700;
    margin-top: 4px;
  }

  .weight-item.net .weight-value {
    color: white;
  }

  .review-photos {
    display: flex;
    gap: 12px;
  }

  .review-photos img {
    width: 80px;
    height: 80px;
    object-fit: cover;
    border-radius: 8px;
  }

  .review-signature {
    height: 60px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: white;
  }

  /* Actions */
  .stage-actions {
    display: flex;
    gap: 16px;
    margin-top: 24px;
  }

  .btn-primary,
  .btn-secondary {
    flex: 1;
    padding: 16px 24px;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    min-height: 56px;
    transition: all 0.15s ease;
  }

  .btn-primary {
    background: #1a5f2a;
    color: white;
  }

  .btn-primary:disabled {
    background: #94a3b8;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: #f1f5f9;
    color: #374151;
  }

  /* Error */
  .error-banner {
    background: #fef2f2;
    color: #dc2626;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 14px;
  }

  /* Complete */
  .complete-stage {
    text-align: center;
    padding: 48px 32px;
  }

  .complete-icon {
    width: 80px;
    height: 80px;
    background: #10b981;
    color: white;
    font-size: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 24px;
  }

  .ticket-number {
    font-size: 24px;
    font-weight: 700;
    color: #1a5f2a;
    margin: 16px 0;
  }

  @media (max-width: 600px) {
    .form-grid {
      grid-template-columns: 1fr;
    }

    .form-group.full {
      grid-column: span 1;
    }

    .destination-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .photo-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .review-weights {
      flex-direction: column;
    }
  }
`;
